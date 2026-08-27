"""Inspect a recording / delta before it is merged.

Checks the four things a capture can silently get wrong:
  * foreign-database query strings (capture-walk 3d)
  * 401/403 entries, which replay clean while the panel stays degraded (3e)
  * whether the endpoints this walk existed to capture are actually present
  * decode holes
"""
import collections, json, sys

TARGETS = [
    ('UI-158 admin/activity?limit=50',      lambda e: e['path'].endswith('/admin/activity') and 'limit=50' in (e.get('query') or '')),
    ('UI-158 admin/refresh-schedule',       lambda e: e['path'].endswith('/admin/refresh-schedule')),
    ('UI-158 integrity/purge-log limit=100', lambda e: e['path'].endswith('/inventory/integrity/purge-log') and 'limit=100' in (e.get('query') or '')),
    ('UI-158 reload-cardex/eod-check',      lambda e: e['path'].endswith('/inventory/reload-cardex/eod-check')),
    ('UI-158 reload-gl/preview',            lambda e: e['path'].endswith('/inventory/reload-gl/preview')),
    ('UI-158 inventory/recalc-status',      lambda e: e['path'].endswith('/inventory/recalc-status')),
    ('UI-158 integrity/aai-responses?runId', lambda e: e['path'].endswith('/inventory/integrity/aai-responses') and 'runId=' in (e.get('query') or '')),
    ('UI-153 ctx=wlcause',                  lambda e: 'ctx=wlcause' in (e.get('query') or '')),
    ('UI-153 ctx=auditcover',               lambda e: 'ctx=auditcover' in (e.get('query') or '')),
    ('UI-153 ctx=modelexcl',                lambda e: 'ctx=modelexcl' in (e.get('query') or '')),
    ('ai/explain UNKEYED (no ctx)',         lambda e: e['path'].endswith('/ai/explain') and 'ctx=' not in (e.get('query') or '')),
]

for path in sys.argv[1:]:
    d = json.load(open(path, encoding='utf-8'))
    ents = d['entries']
    print('=== %s ===' % path)
    print('  version=%s entries=%d bodies=%d' % (d.get('version'), len(ents), len(d.get('bodies') or {})))
    # ANY 4xx/5xx, not just auth failures: capture-walk 3e is about a recorded
    # error replaying as an answer, and a 400 or a 404 does that just as well.
    bad = [e for e in ents if str(e.get('status'))[:1] in ('4', '5')]
    print('  4xx/5xx entries: %d  (recording-prune.py removes these)' % len(bad))
    for e in bad[:12]:
        print('     %s %s%s -> %s' % (e['method'], e['path'], ('?' + e['query']) if e.get('query') else '', e['status']))
    dbs = collections.Counter()
    for e in ents:
        q = e.get('query') or ''
        for name in ('RapidReconciler_Demo1', 'RapidReconciler_Demo2', 'RapidReconciler_Demo3'):
            if name in q:
                dbs[name] += 1
    print('  db names in query strings: %s' % (dict(dbs) or 'none'))
    df = [e for e in ents if e.get('decodeFailed')]
    print('  decodeFailed: %d' % len(df))
    for label, pred in TARGETS:
        hits = [e for e in ents if pred(e)]
        qs = sorted({(e.get('query') or '')[:70] for e in hits})
        print('  %-38s %2d  %s' % (label, len(hits), '; '.join(qs[:6])))
