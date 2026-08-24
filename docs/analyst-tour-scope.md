# Analyst tour — scope + build status

**Status (2026-07-22, session #24):** BUILT for the captured surfaces, wired into the
front door, static-verified. Offline miss-verify PENDING a bundle rebuild (blocked this
session by a locked `bundle/` — see below).

**Status (2026-08-20, session #50):** the owner set the recording rules, and his demo
defect list is cleared. **The first take is DEMO1 ONLY** — beats get tweaked on one
database before the other two are recorded, which drops two of the six blockers outright
(see "DEMO1 FIRST" below). Recording still has not started: three blockers remain, and
every existing capture is stale as of today. The recording itself runs in its OWN session.

**Status (2026-08-20, session #51): THE DEMO1 RECORDING EXISTS AND REPLAYS CLEAN. All
three blockers are cleared.** `publish/capture/recording-demo1.json`, 59 signatures /
90 entries / 52 MB, built into `bundle/` and served on :8770. Every beat on the owner's
list was walked offline against that bundle and `__demoReplay.misses()` came back `{}`
on every one, for both companies.

**Status (2026-08-20, session #51, later): THE BEATS ARE BUILT AND WALK CLEAN.**
`tour/analyst.html` carries 14 beats under a 4-entry rail (see below). Walked forward
from a fresh load, every beat: **zero replay misses, and every spotlight lands on a
visible element** — the one beat without a glow is the closing hand-off, which has no
`spot` by design. The save-and-reflect beat was exercised for real: the card read
"Likely cause" before the Save click and "Your recorded finding" after it.

Re-verified after a reboot on the owner's actual demo port: `bundle/` rebuilt from
`recording-demo1.json`, served on **:8770**, all 14 beats walked forward — zero misses,
every spotlight visible, the analyzer reading "8 of 8 DMAAIs off the cardex model", and
the card flipping to "Your recorded finding" on the Save click.

Owner's three beat decisions (2026-08-20): Account Roll Forward stays as a **passing
check** on Demo1 (the corrective version waits for Demo3); 80008 gets **one**
cross-company beat, not a second full walk; **no AI-tier beat** in this take (the
capture supports adding one later with no re-record).

| # | Beat | Page | Spotlight |
|---|---|---|---|
| 1 | Where you stand today | home | `#analystDayBriefTop` |
| 2 | What the model does not cover | accounting-model-review | `#excludedCard` |
| 3 | What good looks like | inventory-account-rollforward | `#rfBrief` |
| 4 | GL class disagrees with itself | home | `#intgModal` |
| 5 | 301 items with no frozen standard | home | `#intgModal` |
| 6 | Two conversions that will not resolve | home | `#intgModal` |
| 7 | The routing is wrong | inventory-transactions | `#tx-analyzer` |
| 8 | Record it once | inventory-transactions | `#tx-findings-draft` |
| 9 | On the record | home | the card link |
| 10 | On-hand against the cardex | home | the item row link |
| 11 | One item, both sides | inventory-cardex-variance | `#cxvScope` |
| 12 | Two reports, no assembly | home | `.aud-hdr-actions` |
| 13 | Same checks, next company | home (co 80008) | `#analystDayBriefTop` |
| 14 | Where the analyst stops | home | — |

### The beat copy was reviewed against the recording (2026-08-23, UI-120)

Every figure in the 14 beats was re-derived from `recording-demo1.json` rather than
trusted. **All of them tie**: excluded classes SUPP $111,904.04 + NS40 $28,442.12 =
**$140,346.16** to the cent (and the other three excluded classes are $0, so "two GL
classes carry value" is exact); frozen cost **301** on 80002; GL class **5**; UOM **2**;
cardex **3** items on 80002; SI-146048 at **500 EA / $550**, QOH **75,457**, on-hand
value **$83,002.70**.

**One beat was wrong, and it was the strongest one.** Beat 7 read *"All eight route to
4240, Cost of Goods Sold, where the model expects 4152 &mdash; Finished Goods and
Purchased Parts Inventory."* **4240 and 4152 are DMAAI TABLE numbers, not GL accounts.**
`aai-analysis-latest` rows carry `aaiNumber` (the table) separately from `objAccount`
(the account), and `model-baseline` rows carry `TableNumber: 4152` next to an
`AccountDescription` &mdash; the two account descriptions had been lifted off those rows
and glued to the table number. Worse, **company 80002 has no 4240 rows in the Inventory
module at all**: 4240 appears only under Sales (578 rows on 80002, 30 on 80008), and the
analyzer compares Inventory DMAAIs against the 4152 PI model.

The real shape, measured: the model points at 14-series inventory accounts (147272,
140909, 141818, 144545, 145454); the mismatching DMAAIs point at 5-series accounts
(524996 &times;370, 510415 &times;123, 520830 &times;44, ...). Which specific eight rows
this card resolves could not be determined from the recording, so the replacement copy
points at the on-screen routing table instead of naming accounts. **Do not put account
numbers back into that beat without deriving them from the card.**

Twelve other lines were changed: a roll-forward break was described as "F0911 and F0902
disagree at the source" (it is the RR-side incremental-load gap &mdash; repost, then
Reload GL, per `reference_f0911_incremental_load_reload_gl`); "never adjust away a real
break" was the law-enforcement framing the owner cut from the cardex Adjust flow and the
roll-forward band; the save beat said the finding was in Andy's words one line after
saying it was auto-drafted; and the two lines the owner had already flagged &mdash; the
spreadsheet swipe and the invented "a morning's work in JDE" &mdash; are gone.

Verified: esprima-clean, 14 beats intact, and both `:8770` and `:8772` serve the new
strings with none of the old ones. **Not yet walked in a browser** &mdash; the change is
text-only inside `points:[]` literals and no spotlight or action was touched.

### Four defects found while building the beats, all fixed

1. **`savePtrs()` in `replay-shim.js` replaced the pointer map instead of merging it.**
   Each page load indexes only the signatures its own page exercises, so visiting the
   model-review page (which never reads `txv/resolutions`) wrote a map without it and
   erased the progress Home had made. Home then re-served position 0 and the
   save-and-reflect beat showed the before-state again — the exact bug the persistence
   exists to prevent. Now merges, with `max()` so a hydrated-but-unadvanced pointer
   cannot walk backwards.
2. **`spotlight()` gave up before slow surfaces existed.** It gated on `whenReady`,
   which polls for an ADMIN chrome selector absent from every analyst page, so it fell
   through on a ~1.8s timer; the transaction drill page needs roughly 8s of replayed
   fetches before `.tx-analyzer` exists. That beat rendered its copy with no glow while
   the panel underneath was correct and expanded. Now polls for the actual element.
3. **A beat's own action cleared its own spotlight.** `_applySpot` attaches a one-shot
   click listener so that the presenter clicking the spotlit element clears the glow —
   and `expandAnalyzer()` clicks `#tx-analyzer-toggle`, which sits inside
   `.tx-analyzer`, so the click bubbled straight into it. `clickIn` now re-asserts the
   step's spot after acting, and the cross-company beat spotlights the day-brief rather
   than the company chip it clicks.
4. **The cardex beat pointed at a selector from a different page.** `#rfCoContext` is a
   roll-forward id; the cardex page's scope strip is `#cxvScope`. Caught by the walk,
   not by reading.

### The read-count constraint, restated because it is easy to break

Beats 8 and 9 are one story and must stay adjacent and in order. The recording holds
three before-state reads of `txv/resolutions?company=80002` and one after, sized to the
two reads Home's boot spends plus the tab click. Insert a Home visit between beats 7 and
9, or reorder them, and a before-state read is spent early — the card then flips before
the presenter touches Save, which is the "appears to work" the owner ruled out.

## DEMO2 RE-RECORDED (2026-08-24) — this is the live capture

`publish/capture/recording-demo2.json` — **48,933,404 bytes, 78 entries / 56 signatures**,
built into `bundle-demo2/` and served on **:8772**. Companies **80003 Harbor Wholesale
Supply**, **80010 Nationwide Trading**, **80041**, periods **2026-03-31** and
**2026-02-28**. **All 8 beats walked offline with `misses()` empty at every stage.**

### The Period Activity defect was misdiagnosed, and the real cause is one line

It was recorded as "the Audit Center had no completed reviews." The actual gate is in
`_auditFromCard` (`RRV8/home.html`): `if (st !== 'complete') return null;`. Demo2's only
resolution was status `open`, so it produced no audit entry at all. Demo1's PDF worked
because that database carried **two `complete` resolutions plus an approved DMAAI model**,
and the model approval enters through `_auditFromModelApproval` with `standing: true`,
which exempts it from the company/period filter. Seeding the activity log alone would
have fixed nothing.

Database prep applied to `RapidReconciler_Demo2` before the walk: the `80003 / PER /
2026-02-28` resolution deleted (there is **no delete endpoint** — see UI-122); `VCHR`
($42,258.57) and `IAC` ($413.97) seeded `complete` on `80003 / 2026-02-28` using card
codes and amounts read out of `RCardexLedgerCompare2`; three dated `RAdminActivity` rows;
and the DMAAI model approved through `POST /inventory/integrity/model-approval`, which is
honest for Demo2 since it excludes zero GL classes. Result: **"Downloaded Period Activity
(PDF) — 3 entries"**, live and offline.

### The 8 beats, every figure measured

| # | Beat | Surface | What it shows |
|---|---|---|---|
| 1 | Where you stand today | Home, 80003 | Day brief leads |
| 2 | Every account rolls forward | `inventory-account-rollforward.html?company=80003` | Clean, AI says nothing to correct |
| 3 | GL class disagrees with itself | Home → `[data-intg-view="glclass"]` | **4 items, `Branch ≠ Location`** |
| 4 | The two-month variance | `?company=80003&card=PER&period=2026-02-28&expect=4` | Analyzer: 4 DMAAIs, none off the model |
| 5 | Record it once | drill page | Save the 1,970-char auto-draft |
| 6 | On the record | Home | Card flips to YOUR RECORDED FINDING |
| 7 | Two reports, no assembly | Audit Center | 3 entries, two actor groups |
| 8 | Nothing needs your attention | Home, **80041** | "No variance in scope" |

**Beat 3 is NOT Demo1's story.** Demo1's GL-class beat was item-level vs branch-level.
Demo2's four rows are **branch class vs location class** (three of them 6101 vs 6102, one
7358 vs 6101), all in branch B002465. Do not reuse Demo1's wording.

**Beat 4 inverts Demo1 deliberately.** The analyzer clears the configuration —
*"4 inventory DMAAIs checked — no account mismatch. This rules out mapping only; it does
not explain the variance."* That is what leaves timing as the cause and lands on INV-5.
The routing table labels its own columns MODEL TABLE `4152 PI` and MODEL ACCT `1228`,
which is exactly the distinction Demo1's beat 7 got wrong.

**Beat 8 is company 80041, not 80010.** 80010 is not clean: it carries $21K of recurring
purchasing residual across both periods and its brief ranks the two. 80041 has zero
variance rows and zero on every integrity check, and its brief reads *"Feb 28, 2026 is
clean … mark the period reviewed and move on."*

### The rail is built (2026-08-24) — two files, not one

Owner ruled the three demo databases get **three separate tour pages**, not one
parameterised template. That is **two files per demo**, because `tour/index.html`
also hardcodes its database and signs you in before routing by role.

| File | What it is |
|---|---|
| `tour/analyst-demo2.html` | The 8-beat rail. Seeded `RapidReconciler_Demo2`, fallback port **45585**, company **80003**, all six licensed companies in the token (the footer chip renders the full roster, and the walk that produced the recording ran with the same six). |
| `tour/index-demo2.html` | The Demo2 front door. Offers the **analyst only** — the administrator walk was recorded against Demo1, and pointing at it from a Demo2 session would replay Demo1 chrome over a Demo2 token. |

`build-demo.ps1` gained **`RR_TOUR_VARIANT`**. Set it alongside `RR_BUNDLE_DIR` and
the matching `index-<variant>.html` is copied over `index.html`, so each bundle's
front door signs you into its own database:

```
$env:RR_BUNDLE_DIR='bundle-demo2'; $env:RR_TOUR_VARIANT='demo2'
.\publish\build-demo.ps1 -Recording .\publish\capture\recording-demo2.json
```

It **throws** rather than shipping a bundle whose front door points at the wrong
database. Demo1 is unaffected: the variable is only read when set.

**Verified 2026-08-24** by walking the tour's own Next button on :8772 — all 8 beats,
`misses()` empty at every one, every spotlight on a visible element, the analyzer
re-spotlit after its own click clears it, the Save click flipping the card to YOUR
RECORDED FINDING, and the front door handing off to `analyst-demo2.html` on
`RapidReconciler_Demo2` / co 80003.

**Residual footgun:** every bundle still stages every tour page, so
`:8772/analyst.html` is Demo1's rail on Demo2's recording — a wall of misses if
anyone types it. Nothing links to it. Tracked as UI-126; the better fix is for each
rail to assert its expected database on entry, which also protects Demo3 and Angie.

---

### Two tooling defects found during the re-record

1. **`merge-recording.ps1` corrupts a large base.** Merging a one-entry delta spliced the
   new entry **inside another entry's escaped body string**, at char 41,666,807 — it
   matched a `},{"` sequence occurring in the payload data and treated it as an entry
   boundary. The output parsed in neither Python nor the browser, and the browser symptom
   was `fetch('/recording.json')` returning **4 bytes of `null`** while `curl` returned
   the full 48.9 MB. Repaired by excising the spliced text (the base then parsed at
   exactly the pre-merge byte count, which proved the excision) and appending the entry
   as a real object. **Do not use this script on a base whose bodies contain `},{"`
   until it is fixed.**
2. **The 5b dedupe snippet eats the save-and-reflect sequence.** Consecutive-identical
   dedupe collapsed `[before ×3, after ×4]` to `[before, after]`, which would flip the
   card on Home's own boot. The signature has to be exempted. Written up in the walk
   below; 5c warns about the count but not that 5b destroys it.

### Also corrected here

`capture-walk.md` §0.2 points the AI health check at the agent (`localhost:34537`). **AI
lives on VALC**: `GET http://localhost:8080/api/v1/ai/health?db=<db>`. Without the `db`
parameter it answers `maxLevel: "off"` from the unauthenticated caller path, which reads
as a blocker and is not one — all three demo databases are `full`.

---

## DEMO2 RECORDED (2026-08-22) — superseded, kept as the record of the defect


`publish/capture/recording-demo2.json` — 88 entries / 62 signatures / 54 MB, built into
`bundle-demo2/` and served on **:8772**. Companies **80003 Harbor Wholesale Supply**,
**80004 Crossroads Distribution**, **80010 Nationwide Trading**, both current periods
(**2026-03-31** and **2026-02-28** — real month-ends, unlike Demo1). Walked offline
across all three companies and every surface: **zero misses**, and the save-and-reflect
flips on the Save click (positions `[0,1,2]` before, `[3,3,3]` after).

Packaging is **one bundle per database**, on the owner's call. Merging is not safe:
`request-signature.js` deliberately drops scheme, host and port, so `GET /available-periods`
against Demo1's agent and against Demo2's produce the SAME signature with different
responses. Same for `/poll`, `/inventory/status`, `/inventory/cardex-tolerance`,
`/admin/companies`. Follow-up 4 below assumes merging is clean "because companies do not
overlap" — that holds for POSTs, which carry companies in the body, and fails for every
body-less DB-global GET.

### Demo2's beat list is much shorter, and not only because of cardex

Measured against the Demo2 agent across all six licensed companies:

| Check | Demo2 |
|---|---|
| Frozen cost | **zero rows, all six companies** |
| Model DMAAI excluded classes | **zero rows** — "All GL classes accounted for" |
| Cardex variance items | 1 row, on company `00000`, which is not licensed so it is filtered out |
| Account roll forward | clean on every company walked |
| UOM conversion | 2 rows, **80004 only** |
| GL class integrity | 80003: 4 · 80004: 1 · 80013: 2 · 80023: 7 |

So three Demo1 beats have nothing behind them here: frozen cost, the model-DMAAI
exclusion story, and cardex. The owner's "shorter rail on Demo2" call was right, and it
is shorter than just dropping cardex.

**There is no routing-mismatch story on Demo2.** Every card's analyzer reads "N DMAAIs
checked, none off the model" — 2 on Net Zero, 4 on Period Mismatch, 8 on 80004's voucher
card, 20 on 80003's. That is consistent with the model table being complete. Demo1's
"8 of 8 DMAAIs off the cardex model" has no equivalent, so the analyzer beat needs
different copy or a different purpose here.

**What Demo2 carries instead** is a distribution story: **Period Mismatch**, **A/P
Voucher on Inventory**, **Inventory DMAAI Net Zero**, **Unclassified — Inventory**. The
Period Mismatch card is the strongest beat on this database and it lands directly on
INV-5: its auto-drafted finding reads "the variance nets to within tolerance once the two
months are added together, on one account and one batch."

### Two things Demo2 cannot do, and one is a decision

1. **The Period Activity PDF does not replay yet — and the DB is now ready for it to.**
   Measured toast on the bundle: **"No activity to export."** That PDF renders the
   findings trail and Demo2 had no completed reviews.

   **Resolved in the database, NOT in the recording (2026-08-22).** A review was
   completed on co 80003's Period Mismatch card (owner's call, delegated), so the card
   reads "In audit findings · Aug 22" and both PDFs generate against the LIVE stack:
   "Downloaded Period Activity (PDF) — 1 entry".

   Patching it into the existing recording FAILED, and the reason is worth keeping:
   `merge-recording.ps1 -Refresh` appends the fresh response, and `pick()` serves a
   signature's entries in order — so a fresh walk still gets the stale empty trail at
   position 0 and only reaches the populated one on a second visit. **Append cannot
   express "this is the new baseline"; that needs a replace.** Rather than perform
   surgery on a 54 MB single-line JSON, the fix is a clean re-record of Demo2 now that
   the database state is right. One walk, no merging.

   Two real bugs were caught on the way and both are fixed in `merge-recording.ps1`:
   the `-Refresh` parameter was `[string[]]`, which `powershell -File` flattens into one
   useless token so every prefix test silently failed and the merge reported
   "refreshed: 0" with no error; and refreshing `/inventory/audit-detail` duplicated a
   27 MB response, taking the recording from 54 MB to 81 MB for a PDF that already
   worked. Refresh the surface whose data changed, nothing more.
2. **80010 Nationwide Trading is entirely clean** — "Nothing needs your attention right
   now", all three integrity checks cleared, one variance card. It works as a deliberate
   contrast beat; it does not work as a findings beat.

### Two defects found while verifying Demo2

1. **The parameterised status poll was missing from the capture.** `GET /poll?recalculating=false&updating=false`
   is a long-poll that never terminated during the walk, so it was never recorded, and it
   MISSED on replay. That matters more than a status call sounds: the shim renders a
   visible "Demo replay: missing recordings" overlay, on camera. Demo1's recording has
   both poll variants; Demo2's had only the bare one. Fixed by sitting on the drill page
   until the poll cycled, then merging the delta.
2. **The client-side variance-card store survives a sequence rewind.** The drill page's
   Save writes the finding to `rrv8.txvCards.<db>.<co>` in localStorage as well as to the
   agent, and `resetSequence()` does not touch localStorage. After one presenter run the
   card opened already reading "Your recorded finding" and the Save beat changed nothing
   — the same "appears to work" the recording ordering exists to prevent, arriving by a
   different route. The tour seed now clears that store on entry. **This affected Demo1
   equally**; its bundle was rebuilt with the fix.

### What is NOT built for Demo2

The tour. `tour/analyst.html` is seeded to Demo1 and carries Demo1's 14 beats. A Demo2
tour needs its own seed and a rail of roughly 8 beats given the table above.

---

### What was measured, beat by beat (Demo1, offline, zero misses)

| Beat | Company | Offline result |
|---|---|---|
| Data Health — model DMAAI detail | 80002 | `accounting-model-review.html`, $140,346.16 to review across 2 GL classes, AI text lands |
| Data Health — account roll forward | 80002 | page renders; **the AI says "nothing to correct, rolled forward clean"** |
| Frozen cost modal | 80002 | 301 rows |
| GL integrity modal | 80002 | 5 rows |
| UOM conversions modal | 80002 | 2 rows |
| Transaction Variance + analyzer | 80002 | **"8 of 8 DMAAIs off the cardex model"** with the full routing table |
| Transaction Variance save + reflect | 80002 | card flips LIKELY CAUSE → YOUR RECORDED FINDING on the Save click |
| Cardex Variance | 80002 | item SI-146048 selected on Home lands on the page fully populated |
| Audit — both PDFs | 80002 + 80008 | "Downloaded the audit report (PDF) — 1 company" / "Downloaded Period Activity (PDF) — 3 entries" |
| All four tabs + drill + analyzer | 80008 | zero misses; its one card is `DUP`, analyzer reads "1 DMAAI checked, none off the model" |

### Blocker 2 did not reproduce, and the beat is stronger than the reverted one

The 2026-07-23 failure was "Routings match" offline where the story was three routing
mismatches, plus three intermittent `/inventory/integrity` misses. On Demo1 the analyzer
replays the live verdict **exactly**: `8 of 8 DMAAIs off the cardex model`, every row
present, no misses. The reason is worth knowing: **expanding the analyzer fires no
network at all** — its data arrives with the drill page's own load (`aai-analysis-latest`
plus the integrity POSTs). So if the page load replays, the verdict replays. The July
failure was a body-determinism problem on a path that has since changed; it is not a
property of the analyzer.

### Two facts that shape the beat list — the owner's call

1. **Account Roll Forward on Demo1 is CLEAN.** Both 80002 and the DB-wide report roll
   forward without a break, so the AI on that page says there is nothing to correct.
   Demo3's co 30001 break (account B000022.1121) was what made the old corrective beat
   land. On Demo1 this beat is "here is the check, and it passes" — a health story, not
   a fix story. Keep it, or move the corrective beat to Demo3 when that gets recorded.
2. **Only company 80002 carries all three integrity modals.** Measured off the agent:
   UOM 2 rows / frozen 301 / GL class 5 on 80002; UOM **zero** on 80008 (frozen 134, GL
   class 1). On 80008 the UOM check reads as Cleared and there is no modal to open. And
   80008 is thin on Transaction Variance — 1 card on Aug 28, 2 on Jul 31, against 80002's
   8 and 7. 80002 is the spine; 80008 is the "and it works across companies" beat.

### The save-and-reflect rule needed a shim fix, not just capture ordering

The premise recorded below — that rule 3 is "a capture-walk ordering requirement, not a
UI change" — **was wrong, and cost three rebuilds to disprove.** Two things were measured:

- **The sequence pointer used to reset on every page load.** The shim re-inits from
  `recording.json` per document, so a finding saved on the drill page re-served position
  0 (the before-state) when Home reloaded. Any before/after story whose halves sit on
  different pages was impossible. Fixed: `replay-shim.js` now persists the per-signature
  pointers in `sessionStorage`, with `__demoReplay.resetSequence()` to rewind them. The
  tour front door should call `resetSequence()` on entry so a second run tells the same
  story.
- **The read COUNT matters, not just the order.** `GET /inventory/txv/resolutions?company=80002`
  is read **twice by Home's boot** and once more by the Transaction Variance tab click —
  three reads before the presenter can click anything. With the captured `[before, after]`
  the card was already showing the recorded finding before the Save. The recording now
  holds `[before, before, before, after]`, produced by
  `publish/capture/tune-save-sequence.ps1`, and the flip lands on the Save click.

Two diagnostics were added to the shim while doing this, and both should stay:
`__demoReplay.missBodies()` (the request body behind each miss — a signature hash alone
cannot tell you which report to re-walk) and `__demoReplay.served(filter)` (which
sequence position each signature has served, in order — this is what turned the
save-reflect problem from guesswork into one measurement).

### Three build defects found and fixed on the way

1. **`Tools/audit-workbook.js` and `Tools/howto.css` were never staged** — both 404'd in
   `capture-staging/` and in `bundle/`, because both build scripts carried a hardcoded
   `$HelpTools` whitelist. That killed the audit **Excel** export outright and left the
   cardex page's how-to panel unstyled. Both scripts now DERIVE the list from `src=`/
   `href=` references in the staged HTML, seeded with the few names that only exist in
   JS. First attempt matched bare `Tools/x.js` and dragged two test-harness scripts into
   the bundle off JS comments; the regex now requires an attribute.
2. **`build-demo.ps1` must not run while the bundle is being served.** The serve holds a
   lock, the build wipes `bundle/` first, and the copy then fails — leaving an EMPTY
   bundle and no `launch.ps1`. This is session #24's "locked bundle" blocker, and it bit
   twice more here. Stop the serve, build, restart the serve. Worth a fail-fast guard.
3. **The pdf.js CDN flag in `capture-walk.md` is stale** — `inventory-account-rollforward.html`
   has no external references at all. PDFs are jsPDF + autoTable, vendored under
   `RRV8/vendor/`, already copied into the bundle. Offline replay of the Audit beat was
   never at risk.

---

## Owner recording rules (2026-08-20)

The Administrator tour is the model. Analyst and accountant follow the same machine:
persistent numbered `WORKFLOW` rail, current beat lit, past beats done, each clickable;
`steps[]` driving the real bundled product in an iframe with injected spotlights.

**Delivery target:** the replay bundle, served on **:8770**. Not the live stack. Every rule
below therefore lands on the capture walk, not on the product.

### Decisions taken

| # | Question | Owner's answer |
|---|---|---|
| 1 | Live stack or replay bundle? | **Replay bundle**, `serve.ps1` on :8770 |
| 2 | Demo2 has six companies — one variance card each? | **Just a couple**, not all six |
| 3 | "Save button should appear to work" | **Actual save, and the screen reflects it** |
| 4 | Cardex is Demo1-only; the rail is numbered | **Shorter rail** on Demo2/Demo3 — the three recordings are NOT structurally identical |
| 5 | One recording or three? | **Three separate recordings**, DB chosen at the front door |
| a | Demo3's DAC-69 roll-forward break shows on Account Roll Forward | **Narrate it as a feature.** RR is right to raise it — a real F0911-to-F0902 integrity break in the JDE source |
| b | Demo3's `XX` / blank cost-method rows on Data Health | **Leave as is** |

Rule 3 is the one with teeth, and the bundle can honour it: `replay-shim.js` `pick()` is
**sequence-aware** — repeated captures of one signature replay in order (before-state, then
after-state) and the last one sticks. So a save that visibly reflects is a **capture-walk
ordering requirement**, not a UI change: capture the read, then the save POST, then the
re-read, in that order. Get the order wrong in the walk and the card replays unchanged
while the button reports success, which is exactly the "appears to work" the owner ruled out.

### Analyst beat list requested

| Beat | Surface | What must happen | Captured today? |
|---|---|---|---|
| Data Health — model DMAAI | Data Health → model DMAAI detail | navigate to the detail screen only. **No button clicks.** | partial |
| Data Health — account roll forward | Account Roll Forward detail | navigate to the detail screen only. No clicks. | **yes** |
| Data Health — frozen cost | uncleared items → modal | open the modal on the uncleared ones only | no |
| Data Health — GL integrity | uncleared items → modal | same | no |
| Data Health — UOM conversions | uncleared items → modal | same | no |
| Transaction Variance | `inventory-transactions.html` | one card per current period per company (**a couple** on Demo2), expand the variance analyzer, save and reflect | **NO — reverted, see follow-up 2** |
| Cardex Variance | `inventory-cardex-variance.html` | **Demo1 only.** Select an item, land on the page. Nothing needs to function. | no |
| Audit | audit page | both PDF reports generate | no |

Accountant tour comes **after the analyst is approved**. Do not start it early.

### DEMO1 FIRST (owner 2026-08-20) — and it drops two blockers outright

The first take is **Demo1 only**, so the beats can be tweaked before the other two
databases are recorded. That is not just sequencing; it removes work:

- **Follow-up 3 (archetype → DB binding) is not a blocker for this take.** `index.html`
  and both tours hardcode `RapidReconciler_Demo1`. For a Demo1-only recording the
  hardcode is already correct. It becomes a blocker the day Demo2 or Demo3 is recorded.
- **Follow-up 4 (one recording.json per bundle) is not a blocker either.** One database,
  one recording. The merge is a Demo2/Demo3 problem.
- **Demo1 is the one database whose token scope is PROVEN today.** Prerequisite 0.1 in
  `capture-walk.md` is the #1 capture gotcha — a token whose per-DB company list does not
  intersect the DB's real companies returns `total:0` with a 200 and you capture a walk
  full of empty grids. The owner worked Demo1 companies 80002 and 80008 in the browser on
  2026-08-20, so that intersection is known good. Nothing equivalent is known for Demo2.

So the Demo1 take has **three** blockers, not six: the uncaptured surfaces, the
Transaction Variance analyzer verdict, and the offline miss-verify that has never run.

### ⚠ EVERY EXISTING CAPTURE IS STALE AS OF 2026-08-20

Three shipped changes moved what the product returns and renders, and a recording made
before them replays the OLD behaviour into the demo:

1. `/inventory/transactions` rows gained `SDLNTY`, `NonStockGLClass` and
   `NonStockLineTypes`. Request bodies did not change, so the signatures still MATCH —
   which is the dangerous part. A stale recording replays cleanly and silently serves rows
   without the new fields, and the Transaction Details analyzer goes back to a table of
   dashes on screen. No miss, no warning.
2. The analyzer's verdict text changed (the stock-class-on-a-non-stock-line sentence), and
   the non-stock AI grounding fact now distinguishes mixed orders.
3. `home.html`'s analyst company resolution changed, so which company the walk lands on
   after a reload is not what it used to be.

Re-capture from scratch. Do not extend the existing recording.

### ⚠ THE WALK SHARES localStorage WITH THE OWNER'S :8765 SESSION

`capture-walk.md` §0.4 is right that a same-origin tab inherits the dev token with no
re-paste — that is the point. The cost is that the walk also WRITES to the same storage:
`rrv8.analystCompany.<db>`, the AI tier, the collapsible-lane state. Since 2026-08-20 the
analyst company pick actually persists (it used to be silently discarded), so after a
capture the owner's next load of Home lands on whichever company the walk selected. Say so
rather than letting it look like a regression.

### What blocks the first take

In dependency order. None of this is recording work; all of it is bundle work.

1. ~~**The owner's 2026-08-19 evening demo defect list.**~~ **CLEARED 2026-08-20.** The two
   items he raised were fixed, verified on screen by him, and merged: the Transaction
   Details analyzer on non-stock sales lines, and the analyst company switcher.
2. **Transaction Variance analyzer replays to the wrong verdict** (follow-up 2 below). It shows
   "Routings match" offline where the story is three routing mismatches. This is the single
   hardest item and it is the beat the owner called the meat of the analyst story. The
   diagnostic path is already written in follow-up 2 — miss-body logger, diff the three
   `/inventory/integrity` bodies, pin the varying field.
3. **Archetype → DB binding is cosmetic** (follow-up 3). Both `index.html` and the tours
   hardcode `RapidReconciler_Demo1`. **NOT a blocker for the Demo1 take** — the hardcode is
   already right. Blocks Demo2/Demo3 only.
4. **The bundle serves one `recording.json`** (follow-up 4). **NOT a blocker for the Demo1
   take** — one database, one recording. Blocks Demo2/Demo3, where companies do not overlap
   so a merged recording replays cleanly (the cheaper route).
5. **Frozen cost, GL integrity, UOM conversions, Cardex Variance and Audit are uncaptured.**
   A new capture chunk, and the Audit beat means capturing whatever the two PDF builds fetch.
6. **Offline miss-verify has never run** (follow-up 1). Nothing above is provable until it does.

The audit report's Account Summary links are NOT a blocker: `RapidReconciler-AI/Tools/
test-audit-pdf-links.js` proved the destinations against the file on 2026-08-19, 34/34, with
a control. Clicking them on camera is safe.

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

Runs against **Demo3 / Golden Harvest, co 30001** (seed hardcoded) — that company's
REAL roll-forward break (account B000022.1121) is what makes the corrective beat land.
The Home→corrective hop is **click-to-advance (flow B)**: Next still works, but the
intended path is Bud clicking the spotlit Data Health chip.

| # | Beat | Surface | Spotlight | Advance |
|---|---|---|---|---|
| 1 | Where you stand today | home day-brief (Basic tier) | `#analystDayBriefTop` (the whole brief band) | Next |
| 2 | How much the AI sees | home day-brief, cycles to Full | `[data-chip="work"]` (the Data Health chip — the AI's top call, a live link) | **click the chip** → Account Roll Forward (or Next) |
| 3 | Fix it at the source | Account Roll Forward (`?company=30001`) | `#rfBrief` | Next |
| 4 | Hand to accounting | home; Exit recommends Angie | — | Exit |

The day-brief was redesigned (2026-07-23, UI repo) to sit ABOVE the tab strip and
synthesize all three surfaces (Data Health + Transaction Variance + Cardex) as one AI
lead + a clickable chip per surface. The Data Health chip for a roll-forward break is
an `<a>` to the corrective page, which is why it doubles as the flow-B advance trigger.
Flow B is wired in `analyst.html` (`onIframeNav`: standing/tiers + RF page → corrective
beat) and depends on the redesigned Home being in the bundle — so it is **verifiable
only after the re-record**.

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
