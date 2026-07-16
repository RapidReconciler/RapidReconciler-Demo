# RapidReconciler-Demo architecture

## Goal

A sales demo that is totally separate from dev / qa / prod at runtime, stays
current with the product without duplicating it, and never breaks live because it
has no live parts.

## Runtime separate, build-time coupled

Two things get split that people usually conflate.

**Runtime: totally separate.** Once published, the demo is self-contained static
assets on its own private host. Zero dependency on the dev box, VALC, Services,
SQL, or any RapidReconciler server. Prod cannot break it; it cannot touch prod.

**Build: one controlled, one-directional publish.** The demo is produced from the
product source plus a data capture. The product code stays single-source in the
UI repo. This repo holds the tour shell plus a generated product snapshot and its
fixtures, never hand-edited. The one thing we deliberately do not duplicate is the
product source, because a hand-maintained copy drifts and becomes a second product
to maintain.

## Record / replay, not per-page demo branches

The product fetches data through several paths (`rrFetch`, `agentFetch`, raw
`fetch`, and the AI calls to VALC). Retrofitting a demo fallback into every page is
fragile and taxes every future feature.

Instead the bundle uses a record/replay network layer:

- **Capture:** a shim wraps every network call while the publish harness walks the
  tour. Each request-and-response pair is recorded, keyed by request signature.
- **Replay:** the bundle ships the shim plus the recording and serves every call
  from it. No network. It does not matter which helper made the call, because the
  shim catches everything at the network boundary.
- **Writes** (clear a variance, adjust balances, post a JE) replay as a canned
  success plus a recorded after-state. Simulation, not persistence.

New features work in the demo with no per-page demo code, as long as the capture
walk visits them.

## The AI goes canned

The product's assistants call the model live today. Air-gapped means pre-captured
answers for the scripted prompts, which is better for a demo anyway: deterministic,
instant, no hallucination, no key to manage. A prospect asking an off-script
question gets a live answer only if the demo is allowed a network call to the model.

## Reset is a reload

A static bundle has no mutable server state, so resetting the demo between runs is
just reloading the page (or clearing sessionStorage for the tour position). This is
the point: the instability that motivated a standalone demo disappears when there is
nothing live to drift or hang.

## The publish pipeline

Run on your own cadence, not prod's:

1. A feature ships normally through dev to qa to prod.
2. When the demo should show it, run `build-demo`: check out the product at a
   chosen version, set config to demo mode, capture fresh fixtures from the demo
   DBs, can any new AI answers, assemble the bundle.
3. Deploy the bundle to the demo host. The demo is now current and still fully
   independent at runtime.

The capture step runs on the self-hosted dev-box runner and reads the demo DBs
once. Output ships out; the running demo never phones home.

### What will make or break it

- Automate the capture walk, or the demo rots. Refreshing has to be close to one
  command.
- New screens need the walk to visit them. Keep the tour definition and the
  capture list as one thing.
- Re-can AI answers when the model's grounding changes, or the canned answers go
  stale-wrong.

## Data and hosting

The demo DBs are already sanitized (fictional companies). Static fixtures are
readable wherever they are hosted, so host the bundle privately unless a fresh
hygiene pass clears it for a public host. Company archetypes are in
`tour/company-archetypes.md`.

## Relationship to the other repos

- `RapidReconciler-UI` (public) — the product source. This repo reads a built
  snapshot of it; it never edits it.
- `RapidReconciler-Valc` / `RapidReconciler-Agent` — not involved at demo runtime.
  Involved only at capture time, when the harness reads their responses against the
  demo DBs.
- The demo DBs (`RapidReconciler_Demo1/2/3`) — the capture source, read-only.
