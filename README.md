# RapidReconciler-Demo

The self-contained sales demo for RapidReconciler V8. A prospect (guided by a
presenter) picks the company closest to their operation, then walks a short tour
of each role against realistic data. It runs with no live backend.

**Private. Never make this repo or its hosting public** without a deliberate
data-hygiene sign-off. It carries sales scripts, prospect archetypes, and
captured demo data.

## What this is, and is not

- It **is** a separate track from dev / qa / prod. Once published, the demo is
  static assets on its own host with zero runtime dependency on any RapidReconciler
  server. It runs on a laptop, offline.
- It is **not** a second copy of the product. The product source stays in the UI
  repo (`RapidReconciler-UI`). This repo consumes a *generated* snapshot of it.
  Nothing in `bundle/` is hand-edited.

## The three parts

- `tour/` — the presenter layer: the intro page, the archetype picker, and the
  per-role tour scripts. This is the demo-specific content we author.
- `publish/` — the pipeline that builds a demo: grab the product at a chosen
  version, capture fixtures from the demo DBs, can the AI answers, assemble the
  self-contained bundle. Runs on the self-hosted dev-box runner. This is the only
  step that touches a server, and only to read.
- `bundle/` — the generated, self-contained demo artifact (product snapshot +
  fixtures + record/replay recording). Build output, not source. Gitignored.

## Status

Scaffold. See `docs/architecture.md` for the full design and the build order.
