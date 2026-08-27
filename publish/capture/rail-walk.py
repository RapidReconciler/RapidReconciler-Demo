"""Walk one tour rail on the offline bundle and report misses per beat.

  python rail-walk.py <rail.html> [port] [settle-seconds]
  python rail-walk.py analyst-golden.html 8771 9

This is the CONTROL, and it is not optional: a capture you did not replay is
not a capture. Run it against the rebuilt bundle on its OWN port before that
bundle is promoted over the live one.

Reads __demoReplay from the IFRAME's window -- the rail shell is one of the ten
pages build-demo deliberately does NOT shim, so `window.__demoReplay` at the top
level is always undefined and reading it there reports a clean run for a bundle
that never replayed anything.
"""
import json, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Chrome

PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8770
RAIL = sys.argv[1] if len(sys.argv) > 1 else 'analyst-golden.html'
SETTLE = float(sys.argv[3]) if len(sys.argv) > 3 else 9.0

PROBE = r"""
(function(){
  var f = document.getElementById('stageFrame');
  var w = f && f.contentWindow;
  var r = w && w.__demoReplay;
  return {
    beat: (document.getElementById('stageCaption')||{}).textContent || '',
    page: (function(){ try { return w.location.pathname; } catch(e){ return '?'; } })(),
    ready: (function(){ try { return w.document.readyState; } catch(e){ return '?'; } })(),
    hasReplay: !!r,
    stats: r ? r.stats() : null,
    misses: r ? r.misses() : null,
    missBodies: r ? r.missBodies() : null
  };
})()
"""

with Chrome(port=9333) as c:
    t = c.new_tab('http://localhost:%d/%s' % (PORT, RAIL))
    t.wait_load()
    time.sleep(SETTLE)
    n = t.eval("(function(){var b=document.getElementById('next');return b?b.textContent:'?'})()")
    beats = []
    for k in range(40):
        p = t.eval(PROBE)
        beats.append(p)
        print(json.dumps({'beat_index': k, 'caption': p['beat'], 'page': p['page'],
                          'hasReplay': p['hasReplay'],
                          'misses': p['misses'], 'missBodies': p['missBodies'],
                          'stats': p['stats']}, ensure_ascii=False))
        label = t.eval("document.getElementById('next').textContent")
        if 'Restart' in label:
            break
        t.eval("document.getElementById('next').click()", await_promise=False)
        time.sleep(SETTLE)
    allm = sorted({m for b in beats if b['misses'] for m in b['misses']})
    allb = sorted({m for b in beats if b['missBodies'] for m in b['missBodies']})
    print('\n=== UNION MISSES (%d) ===' % len(allm))
    for m in allm:
        print('  ', m)
    print('=== UNION MISSBODIES (%d) ===' % len(allb))
    for m in allb:
        print('  ', m)
