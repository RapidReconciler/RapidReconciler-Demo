"""Capture driver: ONE database per run (the delta must not carry another
database's query strings -- capture-walk 3d).

  python capture-drive.py <archetype> <sink-port>

The sink is recording-sink.ps1 (capture-walk 5a) -- an MCP or CDP walk cannot
persist a Blob download, so the recording is POSTed to a loopback listener.

  A. the accountant rail, driven by its own Next button. capture-walk 3b:
     a surface a rail replays is captured by driving the rail, not by
     revisiting the screens.
  B. the analyst rail, same reason (it carries the model-review stop on
     summit -- the only archetype whose rail loads accounting-model-review).
  C. the audit Excel export, once per company in scope. UI-153's auditcover
     ctx is per company and the export is scoped to the FOCUS company, so the
     footer company chip has to move between exports.
  D. the seven UI-158 pages, seeded administrator. None is on any rail.

Gates on recorded-entry quiescence, never on a bare fixed sleep.
"""
import json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from cdp import Chrome

ARCH = sys.argv[1]
SINK = int(sys.argv[2])
BASE = 'http://localhost:8765'

RAIL_ACCT = 'accountant-%s.html' % ARCH
RAIL_ANLY = 'analyst-%s.html' % ARCH

UI158_PAGES = ['admin-activity-log.html', 'admin-job-schedule.html',
               'admin-purge-data.html', 'admin-reload-cardex.html',
               'admin-reload-gl.html', 'inventory-reroll.html',
               'accounting-dmaais.html']
AUDIT_JS = open(os.path.join(HERE, 'audit-cover.js'), encoding='utf-8').read()

FRAME_CAP = ("(function(){var f=document.getElementById('stageFrame');var w=f&&f.contentWindow;"
             "return (w&&w.__demoCapture)?w.__demoCapture.count():-1;})()")
PAGE_CAP = "(window.__demoCapture?__demoCapture.count():-1)"
ALG = ('(function(){try{return JSON.parse(atob(localStorage.getItem("rrv8.token").split(".")[0])).alg}'
       'catch(e){return String(e)}})()')


def settle(t, expr, quiet=3, step=1.6, cap=60):
    last, same, waited = -2, 0, 0.0
    while waited < cap:
        time.sleep(step); waited += step
        try:
            n = t.eval(expr, await_promise=False)
        except Exception:
            n = last
        if n == last:
            same += 1
            if same >= quiet:
                return n
        else:
            same = 0; last = n
    return last


def require_signed(t, where):
    alg = t.eval(ALG)
    if alg != 'RS256':
        raise SystemExit('ABORT at %s: token alg=%s. An unsigned token records 403s '
                         '(capture-walk 3e) -- is sign-service.py up on 8792?' % (where, alg))
    return alg


def walk_rail(t, rail):
    t.navigate(BASE + '/' + rail); t.wait_load()
    settle(t, FRAME_CAP)
    require_signed(t, rail)
    print('  %-26s db=%s signed=%s' % (rail, t.eval('localStorage.getItem("rrv8.activeDb")'),
                                       t.eval('window.__rrCaptureSigned')))
    for k in range(30):
        cap = t.eval("(function(){var c=document.getElementById('stageCaption');return c?c.textContent:''})()")
        print('    beat %-2d %-40s entries=%s' % (k, (cap or '')[:40], t.eval(FRAME_CAP)))
        if 'Restart' in (t.eval("document.getElementById('next').textContent") or ''):
            break
        t.eval("document.getElementById('next').click()", await_promise=False)
        time.sleep(1.5); settle(t, FRAME_CAP)


def seed_as(t, role):
    t.navigate(BASE + '/' + RAIL_ACCT); t.wait_load(); time.sleep(2)
    db = t.eval("RRTour.seed('%s','%s').then(function(a){return a && a.db;})" % (ARCH, role))
    require_signed(t, 'seed_as(%s)' % role)
    print('  seeded %-14s db=%s adm=%s' % (role, db,
          t.eval('JSON.parse(atob(localStorage.getItem("rrv8.token").split(".")[1])).dbs[0].a')))


with Chrome(port=9333) as c:
    t = c.new_tab('about:blank')

    print('== A. accountant rail ==')
    walk_rail(t, RAIL_ACCT)

    print('== B. analyst rail ==')
    walk_rail(t, RAIL_ANLY)

    print('== C. audit Excel cover, per company (UI-153 auditcover) ==')
    seed_as(t, 'accountant')
    db = t.eval('localStorage.getItem("rrv8.activeDb")')
    cos = t.eval('(function(){var p=JSON.parse(atob(localStorage.getItem("rrv8.token").split(".")[1]));'
                 'for(var k=0;k<p.dbs.length;k++){if(p.dbs[k].n===%s) return p.dbs[k].i;}return [];})()'
                 % json.dumps(db))
    print('  companies in scope: %s' % cos)
    for co in cos:
        t.navigate(BASE + '/home.html'); t.wait_load(); settle(t, PAGE_CAP)
        t.eval(AUDIT_JS, await_promise=False)
        print('   focus %s -> %s' % (co, json.dumps(t.eval('__rrFocusCompany(%s)' % json.dumps(str(co))))))
        time.sleep(4); t.wait_load(); settle(t, PAGE_CAP)
        t.eval(AUDIT_JS, await_promise=False)
        print('   export -> %s' % t.eval('__rrAuditExcel()'))
        time.sleep(5)
        print('   entries=%s' % settle(t, PAGE_CAP, cap=120))

    print('== D. UI-158 pages (administrator) ==')
    seed_as(t, 'administrator')
    for p in UI158_PAGES:
        t.navigate(BASE + '/' + p); t.wait_load()
        n = settle(t, PAGE_CAP)
        print('  %-30s entries=%s' % (p, n))

    print('== SAVE ==')
    print(' size:', json.dumps(t.eval("__demoCapture.size()")))
    print(' saveTo:', json.dumps(t.eval("__demoCapture.saveTo('http://localhost:%d/save')" % SINK)))
