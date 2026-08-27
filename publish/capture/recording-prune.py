"""Remove entries from a recording. The counterpart merge-recording.ps1 has no
answer for, and the reason it is needed is not obvious.

WHY APPENDING IS NOT ENOUGH

`merge-recording.ps1 -Refresh` appends a fresh response for a signature the base
already holds, on the strength of "pick() sticks on the last". That is true only
once the sequence has been DRAINED. replay-shim serves a signature's entries in
capture order, so the FIRST call in a browser session gets entry #1 -- and a
page that fires a request once per load never reaches the appended one.

Measured 2026-08-27. `accounting-dmaais.html` reads a runId out of
`aai-analysis-latest` and then asks `aai-responses?runId=<that>`. After a
refresh, Demo1 held five `aai-analysis-latest` entries whose runIds ran
[08-20, 08-20, 08-27, 08-27, 08-27]. One page load took the first, asked for the
08-20 run, and missed -- with the 08-27 response sitting in the same file,
unreachable. Refreshing had made the file correct and the replay wrong.

So a stale head has to be REMOVED, not out-voted.

WHAT THIS DOES NOT DO: it does not splice text. It parses, filters and re-dumps.
The 50 MB text scan in merge-recording.ps1 exists for speed, not correctness;
Python parses these files in a couple of seconds. Response bodies are stored as
strings and are copied through untouched.

  python recording-prune.py <recording.json> --report
  python recording-prune.py <recording.json> --apply

The rules are declared below, each with the measurement that justifies it.
Every run writes <file>.preprune.json first, and re-reads the output.
"""
import json
import shutil
import sys


def body_of(rec, entry):
    b = rec.get('bodies') or {}
    if entry.get('bodyRef') is not None:
        v = b.get(str(entry['bodyRef']))
        if v is not None:
            return v
    return entry.get('body') or ''


def current_run_id(rec):
    """The runId the recording's aai-responses is keyed to -- the LAST one, which
    is the one a drained sequence ends on and the one a fresh capture added."""
    ids = [e['query'].split('runId=', 1)[1] for e in rec['entries']
           if e['path'].endswith('/aai-responses') and 'runId=' in (e.get('query') or '')]
    if not ids:
        return None
    from urllib.parse import unquote
    return unquote(ids[-1])


def rules(rec):
    """(name, predicate, why) -- predicate True means DROP the entry."""
    run = current_run_id(rec)

    def stale_analysis(e):
        if not e['path'].endswith('/inventory/integrity/aai-analysis-latest'):
            return False
        if run is None:
            return False
        try:
            got = json.loads(body_of(rec, e))['_meta'].get('runId')
        except Exception:
            return False
        return got != run

    def error_status(e):
        # capture-walk 3e: a replayed 4xx makes misses() read clean while the panel
        # behind it is degraded, so the gap stops reporting itself. Leaving the
        # signature MISSING is the honest state -- it lands in misses() and in the
        # bundle's own red toast, where somebody sees it.
        try:
            return int(e['status']) >= 400
        except Exception:
            return False

    return [
        ('stale aai-analysis-latest (runId != %s)' % run, stale_analysis,
         'the runId is a key into aai-responses; a stale head misses'),
        ('4xx/5xx response', error_status,
         'capture-walk 3e -- an error must not replay as a recorded answer'),
    ]


def main():
    path = sys.argv[1]
    apply = '--apply' in sys.argv
    rec = json.load(open(path, encoding='utf-8'))
    before = len(rec['entries'])
    drop_idx, why = set(), {}
    for name, pred, reason in rules(rec):
        for i, e in enumerate(rec['entries']):
            if i not in drop_idx and pred(e):
                drop_idx.add(i)
                why[i] = name
    for i in sorted(drop_idx):
        e = rec['entries'][i]
        print('  DROP %-52s %s %s%s  [%s]'
              % (why[i], e['status'], e['path'],
                 ('?' + e['query']) if e.get('query') else '', e['method']))
    print('%s: %d entries, dropping %d -> %d' % (path, before, len(drop_idx), before - len(drop_idx)))
    if not apply:
        print('(report only; pass --apply to write)')
        return
    if not drop_idx:
        print('nothing to do')
        return
    shutil.copyfile(path, path.replace('.json', '.preprune.json'))
    rec['entries'] = [e for i, e in enumerate(rec['entries']) if i not in drop_idx]
    json.dump(rec, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
    check = json.load(open(path, encoding='utf-8'))
    print('wrote %s -- re-read OK, %d entries' % (path, len(check['entries'])))


if __name__ == '__main__':
    main()
