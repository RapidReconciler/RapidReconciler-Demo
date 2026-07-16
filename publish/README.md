# publish/ — the build pipeline

Turns the live product plus a data capture into a self-contained demo bundle. Runs
on the self-hosted dev-box runner. This is the only part of the system that touches
a server, and only to read.

## build-demo (to be built)

1. Check out `RapidReconciler-UI` at a chosen version.
2. Set config to demo mode.
3. Run the capture harness: walk every screen and interaction the tour defines,
   recording each network request-and-response pair (the record half of
   record/replay). Reads the demo DBs through the running product.
4. Capture the AI answers for the scripted prompts (canned, deterministic).
5. Assemble `bundle/`: the product snapshot, the recording, the replay shim, and
   the vendored assets so it runs offline.
6. Deploy `bundle/` to the private demo host.

## Capture harness (the make-or-break piece)

A network shim wraps `fetch` / `XHR` during the walk so it catches every call
regardless of which product helper made it. This is why new product features work
in the demo with no per-page demo code, as long as the walk visits them.

Keep the walk driven by the tour definition in `tour/`, so the two never drift.

## What it must not do

- Never write to the demo DBs. Capture is read-only.
- Never deploy to a public host without a data-hygiene sign-off. The recording
  contains demo data.
