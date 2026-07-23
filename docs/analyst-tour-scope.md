# Analyst tour — scope + build status

**Status (2026-07-22, session #24):** BUILT for the captured surfaces, wired into the
front door, static-verified. Offline miss-verify PENDING a bundle rebuild (blocked this
session by a locked `bundle/` — see below).

## What it is

The presenter-driven guided walkthrough for **Andy Analyst**, mirroring the admin tour
(`tour/administrator.html`). Same machine: a `WORKFLOW[]` responsibility map + a `steps[]`
array driving the real bundled product in an iframe, with spotlights injected into the
product (source untouched), the Andy persona seeded before boot, dev tier-dock masked.

## The governing constraint: the tour can only visit what's recorded

A beat that navigates to an uncaptured surface replays as a visible MISS in front of a
prospect. So the tour's reach == the recording's reach. As of session #24 the captured
analyst surfaces are **home Data Health + Account Roll Forward** (every company, all 3 AI
tiers, all 3 demo DBs, proven offline miss-free). Transaction Variance, Cardex, and As-Of
are NOT captured yet (a separate next chunk) — so they are NOT in this tour.

## Beats built (captured surfaces only)

Runs against Demo1 / Summit (seed hardcoded, matching the admin tour). Frames load
directly, Next-driven (no click-through/advance wiring — simpler + robust).

| # | Beat | Surface | Spotlight |
|---|---|---|---|
| 1 | Where you stand today | home Data Health (80002), Basic tier | `.alh-brief` |
| 2 | How much the AI sees | home Data Health, cycles to Full | `.alh-brief` |
| 3 | Fix it at the source | Account Roll Forward (`?company=80002`) | `#rfBrief` |
| 4 | Hand to accounting | home; Exit recommends Angie | — |

`WORKFLOW` (the map): 1 See where you stand · 2 Fix it at the source · 3 Hand to accounting.
Narrative arc = orient (Data Health) → the corrective (Roll Forward, repost-first, source
fix not JE) → hand to the accountant. The tier beat uses `setTierSafe()` (defensive
`RRAI.set`, no-op if not ready); grounded→full progression, both captured.

## Front-door wiring

`tour/index.html`: "Enter as Andy" now seeds the analyst persona and navigates to
`analyst.html` (was a placeholder note). The analyst tour's Exit returns to the role
cards with **Angie / accountant** recommended next. build-demo globs `tour/*.html`, so
`analyst.html` is staged automatically — no build-script change.

## Remaining / follow-ups

1. **Offline miss-verify** — rebuild the bundle with a Demo1 recording, serve, walk beats
   1-4, confirm `__demoReplay.misses()` == {} on each. Blocked this session: `bundle/` was
   locked by a pre-existing server (:8770 serve.ps1 / :8811, access-denied — owner frees it,
   then rebuild). The tour CODE is done; this is the last check.
2. **Variance beats (the analyst's signature)** — after the Transaction Variance + Cardex
   capture chunk lands, add beats between #3 and the handoff: find a variance → validate vs
   JDE → decide (source-fix vs disposition / record vs adjust). Slot into `steps[]`; the map
   gains a "Work the variances" responsibility. This is the meat of the analyst story.
   **ATTEMPTED 2026-07-23, REVERTED — blocker found.** Authored a Transaction Variance beat
   on `inventory-transactions.html?company=30001` spotlighting `.tx-analyzer` (the DMAAI
   Analyzer: "3 routing mismatches" — inventory relieved to 4240 not the model's 4152; source
   fix = align the Inv DMAAI). Captured `txv-co30001` full (a strong finding) + wired an
   `openAnalyzer()` onEnter. **But it does NOT replay clean:** on the offline bundle the DMAAI
   Analyzer shows **"Routings match"** (empty) instead of "3 routing mismatches", and the txv
   page throws **3 intermittent `/inventory/integrity` misses** (hashes `3c7f4a47`/`7f3dd8a0`/
   `f972d448`) whose bodies are NOT in the capture buffer (capture fires `5227a455`/`f5e44dd8`/
   `cf11097a` instead — a body-determinism mismatch, same class as the session-global gotcha).
   The DMAAI Analyzer appears to fire integrity POSTs whose body differs capture-vs-replay
   (and/or computes the mismatch set client-side from data that doesn't replay identically),
   so the analyzer lands on the WRONG verdict offline. **A beat that shows "all clear" when the
   story is a recurring problem is worse than no beat**, so it's reverted until the txv analyzer
   replays faithfully. **Next-session task:** re-add the miss-body logger to the replay shim,
   read the 3 replay bodies, diff them against the captured txv integrity bodies to pin the
   varying field, then either make the analyzer's integrity body deterministic or capture the
   exact bodies the analyzer requests on open. The beat copy + `openAnalyzer` helper are in git
   history at the reverted commit's parent (search `tour/analyst.html` for `key:'variance'`).
3. **Archetype → DB binding** — the front door's archetype picker (Summit/Harbor/Golden) is
   cosmetic today; both index.html and the tours hardcode Demo1. Bind the picked archetype
   to the seeded DB (Demo1/2/3) so the tour runs the chosen dataset.
4. **Multi-archetype bundle** — the replay bundle serves ONE recording.json. To let the
   demo run any archetype, merge `recording-demo{1,2,3}.json` into one bundle recording
   (companies don't overlap, so a merged recording replays all three cleanly).
5. **One knowledge source** — the beat talking points are the same knowledge as the UI-40
   analyst training spine; draw from the one catalog, don't author twice (README design note
   + `feedback_analytical_knowledge_one_source`).
6. **Accountant tour** — same pattern, Angie persona; the analyst Exit already hands to it.
