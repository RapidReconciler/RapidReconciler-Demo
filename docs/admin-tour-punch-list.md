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

## Cross-cutting / structural
- ☐ **BLOCKER — AI replay key is the whole prompt hash → brittle.** `request-signature.js`
  keys a POST on `FNV1a(entire body)`; for `ai/explain` that's a hash of the full prompt,
  which bakes in the GENERATED grounding + every live card value (renewal days, storage,
  uptime "23h 13m", activity "1d ago"). ANY drift → hash miss → "No answer came back"
  (seen live on the license pill; briefing also misses on load). Current miss = pre-#366
  grounding. **Freezing the date alone will NOT hold** — grounding/storage/uptime/relative-
  times all break it within a day. **Root fix (rec): re-key `ai/explain` replay on the
  SEMANTIC request (question + tier), not the prompt hash** — matches the original
  "pill text = capture key" intent; survives grounding regen + card drift + the clock.
  Harness change (request-signature.js + record/replay shims), not product. Wrinkle: the
  auto-briefing call has no "Question:" line → needs its own per-tier key. THEN re-walk
  once (6 pills × 3 tiers = 18) + freeze the clock for non-AI relative-time displays.
  **Owner deciding: semantic re-key (rec) vs freeze-entire-demo-clock+state.**
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
