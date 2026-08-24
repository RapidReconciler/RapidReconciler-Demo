# Chunked Capture + Recording Merge — Spec

Short design note. Companion to the coverage manifest at
`RapidReconciler-AI/docs/plans/demo-capture-manifest.md`. Not an
implementation; it fixes the contract so capture chunks accumulate
instead of overwriting each other.

## Problem

Today each capture Start builds fresh staging
(`build-capture-staging.ps1`) and the walk dumps a standalone
`recording.json` (`record-shim.js` → `window.__demoCapture.download()`).
Running a second walk produces a second standalone file; there is no way
to accumulate. The manifest calls for chunked capture (demo-critical
surface first, expand outward), so chunk recordings must merge into a
master.

## Recording shape (unchanged)

```
{ "version":1, "createdAt":"<ISO>", "entries":[ {sig, method, path,
  query, bodyKey, status, statusText, contentType, encoding, body,
  write, via}, ... ] }
```

Replay (`replay-shim.js`) groups entries by `sig` and serves them in
recorded order, sticking on the last (before/after write states). The
merge must preserve that ordering guarantee.

## Merge rules

`merge-recordings.ps1 -Inputs a.json,b.json,... -Out master.json`

Union entries by signature, with capture recency winning for reads and
write sequences preserved:

1. **Reads (`write:false`).** One entry per `sig`. A later input's entry
   **replaces** an earlier one with the same `sig` (later capture
   refreshes stale data). This is the "refresh a stale entry" rule.
2. **Writes (`write:true`).** Do NOT collapse. Keep the full ordered
   sequence of same-`sig` write entries from a single input (the
   before/after states replay depends on). When two inputs both contain a
   write sequence for the same `sig`, the **later input's whole sequence
   replaces** the earlier input's (a re-walk re-captures the sequence
   cleanly; interleaving two walks' write states would corrupt replay
   order).
3. **Ordering in the output.** Emit reads and write-sequences so that,
   per `sig`, order is stable and deterministic. Across signatures, order
   does not matter for replay (lookup is by `sig`), but keep a stable sort
   (e.g. first-seen order) so diffs between master versions are readable.
4. **Provenance (optional).** Stamp each entry with the source chunk name
   in a non-signature field (e.g. `srcChunk`) so a MISS hunt can tell
   which walk owns an entry. Ignored by replay.
5. `version` carried through; `createdAt` = merge time; add
   `mergedFrom:[...]` listing inputs.

Idempotent: merging a file into itself is a no-op. Order of `-Inputs`
matters only for the "later wins" tiebreak; pass chunks oldest-first.

## Cross-DB partition (from the manifest gotcha)

DB-global GET reads (`available-periods`, `inventory/status`,
`cardex-tolerance`, `poll`, `service-health`, ...) collide across DBs
because the signature drops origin and they carry no DB discriminator.
**Do not merge different DBs into one master.** Recommended:

- One master **per DB**: `recording-demo3.json`, `recording-demo1.json`,
  `recording-demo2.json`. `merge-recordings.ps1` only ever unions chunks
  that share a DB.
- `replay-shim.js` gains a small enhancement: pick the recording matching
  the active DB and re-index on DB switch.

**DONE 2026-08-24.** The shim reads a `recordings.json` manifest
(`{byDb:{<db>:<file>}, default:<file>}`) that `build-demo.ps1` writes, and
indexes the file matching `localStorage['rrv8.activeDb']`. Two corrections
to the sketch above, both measured:

- **Not `activeDb().n`.** That function lives inside `home.html` and is not
  reachable from the shim, which loads before any product code. The durable
  hook is `localStorage['rrv8.activeDb']`, written by
  `RRV8.setActiveDatabase()` in `sidebar.js`.
- **Not "on DB switch" as an event.** The product's switcher does NOT
  reload: `home.html`'s `dbSelect` handler writes the key, then immediately
  re-runs `loadActiveDbSurfaces()`. There is no load to hook. The swap is
  therefore lazy, at the top of `pick()`, so it happens on the first
  request after the switch and before that request's lookup.

Also: sequence pointers had to be namespaced per DB. They were one flat
`rrv8.demoReplay.ptr`, which is correct for one dataset and wrong the
instant two share a session -- Demo1's pointer for a colliding signature
would be applied to Demo2's entry list.

Verified on :8770 from one bundle: `GET /available-periods` returns
`2025-08-28...` under Demo1 and `2026-03-31...` under Demo2, swapping both
directions mid-session with no reload.

If instead the product is changed so those GETs carry the DB name (option
B in the manifest), a single merged master is safe and this partition is
unnecessary — but that is a wider product change.

## build-demo.ps1 wiring

`build-demo.ps1` already takes `-Recording <path>` and copies it to
`bundle/recording.json`. Keep it consuming a **pre-merged master**, not a
list — merge is a separate, testable step:

- New: `-Recording` may point at a per-DB master (or a directory of them
  for the partitioned bundle).
- Merge runs BEFORE build: `merge-recordings.ps1` produces the master(s),
  then `build-demo.ps1 -Recording <master>` assembles the bundle.
- Partitioned bundle: copy all `recording-*.json` into `bundle/` and let
  the shim select; single-DB bundle keeps the current `recording.json`.

## File locations

- `RapidReconciler-Demo/publish/merge-recordings.ps1` — the merge step
  (alongside `build-demo.ps1`, ASCII-only for PS 5.1).
- Chunk recordings staged in `RapidReconciler-Demo/publish/capture/`
  (gitignored, like `capture-staging/`), named per chunk
  (`chunk1-demo3-core.json`, ...).
- Per-DB masters: `RapidReconciler-Demo/publish/recording-<db>.json`.

## Capture loop per chunk

1. `build-capture-staging.ps1` (fresh staging, record-shim injected).
2. Serve, walk the chunk's screens (manifest tracker rows), Save → chunk
   recording.
3. `merge-recordings.ps1 -Inputs <existing master>,<new chunk> -Out
   <master>`.
4. Flip the chunk's tracker rows to `captured`; MISS overlay must be
   clean for that DB.
5. `build-demo.ps1 -Recording <master>` to reassemble the bundle.
