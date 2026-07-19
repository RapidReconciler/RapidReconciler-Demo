# Administrator tour — walk-through punch list (Summit / Demo1)

Working doc for the live wart-finding pass on `:8765` before we record the full
admin tour. Owner clicks through the real product; Claude logs each wart here,
we fix it right (no band-aids), and only record once every step is clean.

**Company:** Summit Industrial (RapidReconciler_Demo1)
**Surface under test:** the live RRV8 admin product on `:8765` (NOT the stale bundle at :8770)
**Record only after:** every step below is clean AND the reference date is frozen.

Status per wart: ☐ open · ◐ fixing · ✅ fixed (owner-verified live)

---

## The 9 steps (tour order = record order)

| # | key | Live screen | Tour promise to check against |
|---|-----|-------------|-------------------------------|
| 1 | own | home.html | 4 cards + health strip; calm stays calm; Summit/Demo1 data; **licensing card words-only, no snooze** (#366) |
| 2 | ai | home.html | AI Ask pills 0/4/5 fire on the live screen; answers read live licensing/users/activity |
| 3 | tiers | home.html | Ask once, flip Basic→Enhanced→Full; same answer re-reasons; Off is default |
| 4 | cards | home.html | Licensing leads with days-to-renewal; Team&access rollup; Report Engine + Activity; quiet freshness/storage strip |
| 5 | team | admin-users.html | Real Users list scrolls; open a person; roles shown; **GSI-Internal filtered out** (#366 PII) |
| 6 | companies | admin-companies.html | Both Summit entities (USD 80002 + GBP 80008) under one licence; no seat maths |
| 7 | aiplan | admin-claude-assistant.html | Per-feature exposure dial; **? help panel reflows beside, does not cover** |
| 8 | activity | admin-activity-log.html | Dated trail newest-first; corrections marked reversible |
| 9 | handoff | home.html | Close: named owner before go-live; GSI keeps the software |

---

## Warts found (by step)

### Step 1 — Administrator home (own)
- ☐ **W1.1 (tour copy) — "SAY THIS" block is harsh.** Leads with the boundary ("run by
  your team — not by us. We support the software.") before the benefit; reads as GSI
  distancing/handing off work in a sales room. Ownership beat is right; reframe as
  empowerment: "This instance is yours to run — light enough that your team owns it from
  day one. We stay behind you on the software itself." Drop "not by us." (`administrator.html` step `own`, line ~217)
- ☐ **W1.2 (tour design — DECISION NEEDED) — notes visibility.** Are the SAY THIS / WHAT
  IT PROVES notes presenter-only (hidden on share) or ever on the prospect's screen? If
  ever prospect-visible, the label **"SAY THIS"** breaks the fourth wall and all note copy
  must be prospect-safe. Rec: presenter-only, hidden during the live share. Determines the
  copy approach for the whole tour.
- ☐ **W1.3 (product — verify at Step 8) — Activity-log card shows an amber dot** while
  Team & access and Report Engine are green. Licensing amber is justified (renewal due).
  Is the Activity-log amber earned, or does it violate "calm stays calm, colour only where
  something wants a look"? Check what's driving it when we hit Step 8.
- ✅ Licensing card is words-only ("Renewal due soon", no snooze chips, no Request-invoice) — #366 fix confirmed live on the reload.

### Step 2 — RapidReconciler AI (ai)

### Step 3 — Data-control tiers (tiers)

### Step 4 — Task cards (cards)

### Step 5 — Users (team)

### Step 6 — Companies / licensing (companies)

### Step 7 — AI Assistant data story (aiplan)

### Step 8 — Activity log (activity)

### Step 9 — Hand-off (handoff)

---

## Tour refinements (owner walk-through, 2026-07-18 — uncommitted, in working tree + rebuilt bundle)
- ◐ **8-step restructure** (was 9): merged step 1+2 into one ownership+AI opener; **cut the
  live tier-flip beat** (the Off/Basic/Enhanced/Full selector is DEV-ONLY, not in production —
  demoing it would show a control that won't ship); moved the "you control how much the AI
  sees" story to the AI-plan step (step 6, where exposure is actually set per feature).
- ◐ **Rail controls stripped** — the rail's pill/tier buttons duplicated the on-screen ones;
  rail is now pure "why we're here" guide. Bud clicks the REAL product pills. **Capture impact:
  the walk driver must fire the product's own `.admin-ask-pill` elements, not rail buttons.**
- ◐ **"Choose a question," never "ask"** — admin AI has NO free-text input; copy must not imply typing.
- ◐ **Step counter → quiet progress bar** — no "Step N of M" text/dots; a slim orange fill.
  Casual interactive walk, not a countdown; the prospect interrupts with questions.
- ☐ **MUST-RESOLVE before demo ships — the "Report Engine" card.** Owner + Bud can't say what
  it is; a visible card with a **Restart** button the presenter can't explain is a landmine if a
  prospect points at it. "Our secret for now" is a stopgap, NOT shippable. Fix = a one-line
  finance-friendly definition Bud can give (likely: the background Data Services process that
  runs reconciliations — CONFIRM), or take the card off the demo home. Tour does NOT spotlight
  it today (the glance step names no card).
- **Note:** dead control-rendering JS (firePill/setTier/openHelp/PILL_TEXT/TIER_*) is now inert
  (no step uses `controls`). Harmless; remove in a cleanup pass once the panel design settles.

## Product (home.html) — from the tour walk
- ☐ **Triage the admin home cards: amber left, green right.** Order the four cards by status so
  attention-needing (amber/red) sit left, clear (green) right — eye lands on work first. Makes the
  tour's "green is clear, amber needs work" glance literally true. Product change in
  `RapidReconciler-AI/RRV8/home.html` (flows into the bundle on rebuild).
  - **Not a static reorder:** card statuses are set ASYNC by the status-dot wiring (`arfDot` etc.,
    `lvl-amber`/`lvl-red`/green applied after data loads, ~line 4504/4517). The reorder must run
    AFTER statuses resolve. Cards keep their element IDs (the wiring depends on them), so moving
    the elements within their container is safe — sort by status class post-resolve. Real shared
    home used by every role — do it as a careful focused pass, verify live, not a rushed tail edit.
- ☐ **PROMOTED (owner 2026-07-19) — "show all cards" affordance.** Was tabled; now active. A hidden
  card must always be reachable (esp. once triage/filtering can hide cards). Build a show-all control.
- ☐ **PII — filter the GSI-Internal role out of the demo (owner 2026-07-19, PRIORITY).** The demo
  team list (`admin-users.html`) shows REAL GSI staff — Daren Belsterli, Ed Gutkowski, Mauro, all
  `@getgsi.com`, with FUNCTIONAL roles (not tagged GSI-Internal), so the #366 exclusion filter isn't
  dropping them. Real names/emails on a prospect-facing demo. Fix approach TBD: tag them GSI-Internal
  + apply the filter to the full team page, OR swap to fictional names in the demo data/recording.
  Highest-priority of the three — real-data hygiene beats cosmetics.

## Admin sub-page polish standard (owner 2026-07-19) — QUEUED, spike-first, AFTER the 3-update agent
- ☐ The `admin-*.html` sub-pages (AI Assistant, Companies, Users, Activity) look like an older, plainer
  layer vs the polished `home.html` — reads as "assembled from two products," worse now that the tour
  drives INTO them. Define ONE lightweight shared "admin page" standard (header/topbar, section-card
  styling, type scale, spacing, accent) lifted from `home.html`. **Product pass (demo = product), not
  demo-only.** **Spike on `admin-claude-assistant.html` FIRST** → owner eyeballs "same product?" → then
  roll to Companies / Users / Activity (the tour-visited pages). Remaining admin pages = later follow-up.
  Pairs with the already-queued "what's sent" de-jargon on that same page.

## Cross-cutting / structural
- ✅ **AI replay key re-keyed to (question + tier) — FIXED + VERIFIED (commit `857371d`).**
  Root cause: `request-signature.js` hashed the WHOLE `ai/explain` prompt, baking in the
  generated grounding + drifting live values (uptime "23h 13m" changes every minute,
  storage, renewal days, "1d ago") → the key rotted within a day → "No answer came back."
  Fix: path-scoped semantic key for `/api/v1/ai/explain` = `tier=<t>|q=<question>`;
  briefing (no Question line) keys per tier; every other call still whole-body hashed.
  `record-shim` now stamps a readable `aiKey` per AI entry for capture-completeness
  eyeballing. `_selftest.html` +6 checks → **30/30 PASS** incl. grounding/uptime/days
  drift → same key, and no regression. All 3 sig copies + both record-shim copies in sync
  (bundle/ + capture-staging/ are gitignored build artifacts; regen from bundle-runtime/).
  - ⚠ **The existing recording can't be re-keyed in place** (request prompts aren't stored,
    only their hash). So the CURRENT bundle AI still misses until a **re-walk** regenerates
    `recording-admin.json` with the new durable keys. That re-walk is the owner's hands
    (live product + fresh login + fire the 18 pill×tier combos), and is needed for PII +
    freeze-date anyway. After the re-walk the AI survives drift permanently.
  - ☐ **Future (when analyst/accountant tours are built):** confirm their `ai/explain`
    prompts carry an extractable "Question:" + "DATA ACCESS — <tier>" so the semantic key
    discriminates them too; otherwise their calls collide to `tier=na|q=(briefing)`.
- ◐ **AI answer "types" instead of pasting.** Product change in `RapidReconciler-AI/RRV8/home.html`:
  new `_aiTypeReveal()` helper + wired into `askAdmin()` — after the Thinking… beat the
  answer types in (gen-guarded, reduced-motion safe, ~1.8s cap). Render-time over the
  recorded text, so the offline bundle inherits it on rebuild, no re-capture needed. **Owner:
  eyeball on :8765 admin home → click a pill; tune speed if 1.8s feels off.**
  - ☐ **Fast-follow (avoid an internal seam):** wire the SAME helper into the other AI answer
    surfaces (analyst askAnalyst, accountant, renderAiBriefing) so admin doesn't type while
    analyst/accountant pop. Do when those tours get built, or sooner for product consistency.
- ◐ **Tour panel redesigned (DONE, pending owner eyeball).** New "why we're here" model:
    eyebrow + title + one audience-safe lead line per step; SAY THIS / bullets / DO hint
    removed. 9 steps confirmed (2+3 merged AI; action beats = add member / renew licence /
    manage AI plan; 5+6 split on admin-companies.html — renew then entities). Header kicker
    "Guided tour"; collapse button "Hide notes" → "Hide guide". Step-1 ownership line
    de-harshened. Rewrote steps array + render + CSS in `tour/administrator.html`.
  - W1.1 (harsh SAY THIS) — ✅ resolved by the redesign.
  - W1.2 (notes visibility) — ✅ resolved: panel is audience-safe by design, no hidden model.
- _(Front-door Recommended default currently `golden`; admin tour is Summit — front door must point Recommended at Summit for the admin path. Logged for the tour-script pass, not a product wart.)_
