# RRV8 &mdash; API surface (client-side)

The V8-client perspective on the RR data-services agent: what V8
sends on the wire, what it expects back, the response adapters that
bridge V8's data model to the agent's response shape, and the design
pitch for a cleaner V8-era API.

For the **agent perspective** &mdash; the full controller catalog,
request DTO field names, repository / sproc backing each endpoint,
and gotchas around Jackson and the diagnostic Excel pipeline &mdash;
see the [`RapidReconciler-Agent`](https://github.com/RapidReconciler/RapidReconciler-Agent)
repo:

- **[docs/API.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/docs/API.md)**
  &mdash; controller catalog + auth / JWT shape + reconciliation
  filter shape variants.
- **[docs/gotchas.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/docs/gotchas.md)**
  &mdash; Jackson field-name binding, two `ValidationLight` sources,
  `ValidationLight.Color` enum, diagnostic Excel pipeline.
- **[docs/jar-mining.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/docs/jar-mining.md)**
  &mdash; `javap` recipe for verifying endpoint shapes against the
  production jar.
- **[specs/](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/)**
  &mdash; planned endpoints V8 needs but the agent doesn't yet
  expose (each with paste-ready Java).

---

## Auth: where V8 sends credentials

V8's login modal POSTs to the VALC endpoint:

- Staging: `https://staging-valcspa.cloudapp.net/resource/client/login`
- Production: `https://rr-valc-spa.cloudapp.net/resource/client/login`

(Configurable via `RR_CONFIG.authBase` in [config.js](config.js) or
`?mode=staging` URL override.)

Success response carries a single field:

```json
{ "token": "<RS256 JWT>" }
```

V8 stores it under `localStorage.rrv8.token`, decodes the payload
client-side, and populates `RR_SESSION.user` + `RR_SESSION.dbs[]`.
Every subsequent agent call carries
`Authorization: Bearer <jwt>`. Sign-out drops the token and
reloads.

**Failure handling**: VALC returns HTTP 500 with
`{"message": "User invalid."}` on bad credentials &mdash; not a 401.
V8's login modal parses the `message` field to distinguish bad-creds
from real outages. See
[gotchas.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/docs/gotchas.md)
for the agent-side reason this is the way it is.

**JWT payload fields V8 uses**:

- `dbs[i].ip` &mdash; per-DB agent URL + port. V8's user-menu DB
  switcher picks among these; the active one becomes the API base
  for the session.
- `dbs[i].n` &mdash; DB name (label on the user chip).
- `dbs[i].i` &mdash; allowed companies (Inventory). Drives the
  Company filter universe on every page.
- `dbs[i].a` / `as` / `aite` / `aprs` / `rs` / `su` &mdash; permission
  flags. Currently V8 reads them but doesn't gate the user menu on
  them (handoff concern; see HANDOFF.md).

Full JWT payload shape:
[agent docs &sect; JWT payload](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/docs/API.md#jwt-payload-shape).

---

## Endpoints V8 calls today

| Endpoint | Body shape | V8 page | Notes |
|---|---|---|---|
| `GET /poll` | (none) | all pages | 60s long-poll for "is a job running?" Drives the System Status amber transient. |
| `GET /inventory/status` | (none) | Reconciliation, As Of | Returns `reconciliationFilter` + `validation`. Validation block is the **Inventory Validation light** (NOT System Status &mdash; same shape, different semantics; agent gotchas doc). |
| `POST /inventory/reconciliation-filtered` | Item-wrapped filter arrays | Reconciliation | Summary only today; row-level rows endpoint pending. |
| `POST /inventory/reconciliation/rows` | Item-wrapped filter arrays | Reconciliation, Transactions (cross-period bar chart) | **Live on test agent** (port 34537). V8 calls it for the contributors card + cross-period transactions bars. Spec: [reconciliation-rows.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/reconciliation-rows.md). |
| `POST /inventory/reconciliation/history` | Item-wrapped filter arrays | Reconciliation header bar chart | **Live on test agent.** Spec: [reconciliation-history.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/reconciliation-history.md). |
| `POST /inventory/audit-detail` | Item-wrapped filter arrays | Audit Report Excel + PDF | **Live on test agent.** Spec: [audit-detail.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/audit-detail.md). |
| `POST /inventory/variance-component` | `{component, ...recon-filter}` | Preview modals for GL Batches / End of Day / Manual JEs / Cardex | **Live on test agent.** Spec: [variance-component-drilldown.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/variance-component-drilldown.md). |
| `POST /inventory/transactions` | bare-string filter arrays + paging | Transactions | Single bulk fetch (`pageSize: 10000`), client-side filter/recompute on chip clicks. Each row carries **`GLClass`** (doc-level, distinct `F4111.ilglpt` via `v8ui_reconcilingitems` OUTER APPLY &mdash; no fan-out, ~97% filled) as of **Services v8.0.2** &mdash; the analyzer resolves the DMAAI model per (Co&middot;OT&middot;DT&middot;GLClass). Rows also carry **`NonStockGLClass`** and **`NonStockLineTypes`** (dev jar rebuilt 2026-08-20; **not yet in a tagged Services release** &mdash; the running agent still reports `8.0.13`, which is the version that shipped *before* this change) &mdash; the same two attributes read off the ORDER LINE (`F4211` &cup; `F42119`) and narrowed to lines whose `F40205` inventory interface is `N`. A non-stock line writes no `F4111` row, so `GLClass` is blank on exactly those documents and the analyzer's DMAAI resolution collapses to a table of dashes; the order line is the fallback. The two are kept apart on purpose &mdash; a class that came off the order line AND resolves in the 4152 model table is a stock class shipped on a non-stock line, which the analyzer states in its verdict. |
| `POST /inventory/transactions/details` | `{company, doc, type}` | Transactions per-row Export | **`type`, not `docType`** (Jackson gotcha). |
| `POST /inventory/transactions/save-notes` | `{period, notes: [...]}` | Transactions batch-edit modal | Field names camelCase first-letter-lowercase. |
| `POST /inventory/integrity` | `{report, take/skip/page/pageSize, reconciliationFilter}` | DMAAIs (preload), planned for Cardex Variance | Integrity report `0` is `v_integrity_jde_aais`. Whitelisted views only (`ALLOWED_VIEWS`, Services). **`report: 'v6ui_raccountsummary'`** serves the account roll-forward (GL+variance roll by account/period, all periods, JWT-scoped) for the Account Roll Forward page + Home inventory validation light. **`report: 'v8ui_dmaai_routes'`** (whitelisted in **Services v8.0.3**) serves the analyst DMAAI analyzer's model-vs-inventory **routing table** &mdash; wraps `v6_003_expanded_aais` with the F0901 account description (`GMDL01`), the flex-BU flag (blank AAI BU = branch-plant-derived), and the `base aai` 4152 model flag; one distinct per-company routing per row (single GL-class code, cost type broken out). Backed by DB `v8ui_dmaai_routes` (beta.60+). **Two consumers**: the Transaction Variance DMAAI analyzer (full routing set), and Home's analyst Data Health tab, which narrows the same payload to `tablenumber = 4152` for the always-visible model-table band &mdash; do not add a 4152-only endpoint, the filter is client-side. |
| `GET /inventory/reload-gl/preview` | (none) | Reload GL (Data card) | **Admin-gated.** Derives the earliest `GLOK='no'` period's begin date + counts F0911 rows at/after it. Read-only. Returns `{cutoffDate, affected}`. |
| `POST /inventory/reload-gl` | `{cutoffDate}` | Reload GL (Data card) | **Admin-gated.** Batch-deletes the RR copy of F0911 from the (confirmed, derived) GL date forward, then starts the refresh — SSIS re-pulls from JDE. **JDE untouched.** `cutoffDate` is the derived value from preview (never user-entered). |
| `GET /inventory/reload-cardex/eod-check` | (none) | Reload Cardex (Utilities) — Home row dot | **Admin-gated.** Read-only. Checks for **end-of-day** activity (un-posted cardex — `rtransactions` where `batchnumber = 0`, the `v6_006_unposted_cardex` binding) in the **prior two periods** relative to the open period. When any exists, derives `suggestedDate` = the first day (`RFiscalCalendar.PeriodBegins`) of the **oldest** of those two periods. Returns `{suggestedDate, eodCount, periods}` — `suggestedDate` null + `eodCount` 0 when clean. Home greens the row when clean, ambers it with the suggestion when not. **Not the same as the per-date preview below** (this derives the suggestion; the preview counts rows for a chosen date). Mirrors `reload-gl/preview`. |
| `GET /inventory/reload-cardex/preview` | `?fromDate=yyyy-MM-dd` | Reload Cardex page (`admin-reload-cardex.html`) | **Admin-gated.** Read-only. Counts the cardex rows (F4111 + `rtransactions`) at/after the **user-chosen** `fromDate`. Returns the affected count. The date is the admin's call (the Home eod-check suggestion pre-seeds it via `?from=`, still editable). |
| `POST /inventory/reload-cardex` | `{fromDate}` | Reload Cardex page (`admin-reload-cardex.html`) | **Admin-gated.** Batch-deletes the RR copy of the cardex (F4111 + `rtransactions`, keyed by `ilukid`) from `fromDate` forward, then it rebuilds on the next scheduled refresh — SSIS re-pulls from JDE. **JDE untouched.** Gated behind the page's attestation checkbox. Once executed, the next `eod-check` reads clean → Home greens. |
| `GET /inventory/fiscal-period-end-detect` | (none) | Administrator &rarr; Fiscal Period (Step 1) | **Admin-gated.** Read-only mismatch probe. The latest stored period-end (`MAX(RTransactions.PeriodEnds)`) that no longer exists in `RFiscalCalendar` is the stale value; the calendar's latest period end is the corrected value. Returns `{mismatchFound, incorrectDate, correctedDate, transactionsMax, calendarMax}` (dates yyyy-MM-dd; `incorrectDate` non-null only when `mismatchFound`). Prefills the page's two date fields; the correction step stays locked until a mismatch is found. |
| `POST /inventory/fiscal-period-end-preview` | `{fromDate, toDate}` | Administrator &rarr; Fiscal Period | **Admin-gated.** Read-only. Per-table row count a period-end correction would move (`usp8_maint_update_periodends @preview=1`). Returns `{preview, fromDate, toDate, totalRows, tables:[{TableName, RowsAffected, Action}]}`. Validates from-date has left the calendar + to-date is a current period end (400 with message otherwise). |
| `POST /inventory/fiscal-period-end-apply` | `{fromDate, toDate}` | Administrator &rarr; Fiscal Period | **Admin-gated.** Transactional (all-or-nothing) swap of the stored period-ending date `fromDate` &rarr; `toDate` across the 13 persistent R-tables, **all companies**. Same response shape (`Action='updated'`). Safe because clients never rewrite history, so the stale date only lives in the current open period. **JDE untouched.** |
| `POST /inventory/as-of` | `{daily, summarizeByItem, commonUom, reconciliationFilter, filters, ...}` | As Of | **The period field is `daily`, not `period`.** `reconciliationFilter` is bare strings here. |
| `POST /inventory/as-of/details` | `{branchPlant, lot, company, itemNumber, location, glClass, uom, companyNumber}` | As Of Details popover | Returns the item ledger via `usp6ItemRollForward`. |
| `POST /inventory/as-of/item-position` | `{itemNumber, companyNumber (or company), branchPlant?}` (reuses the `AsOfDetailsRequest` bean) | Full Perpetual Details &rarr; "Adjust balances" &rarr; Cardex Variance | The cardex-variance worklist row(s) for ONE item via `usp8_item_position`, **regardless of whether it currently carries a variance** (the worklist view filters `WHERE reason <> ''`, so a tied-out item is absent). Lets the Cardex Variance page focus an item the analyst opened from the perpetual grid to align against a JDE finding. Same `{total, data, aggregates}` envelope + column shape as the `v6ui_itemrollintegritydialog` worklist fetch, so the client reads `data` identically. JWT company-scoped (out-of-scope company &rarr; empty). |
| `POST /inventory/rollIItem` | (same as as-of body) | (legacy) Cardex Variance Re-roll | Note **double-I** in the path. **Superseded by `/inventory/recalc`** &mdash; synchronous, inventory-only, no summary rebuild. Left for back-compat; the Companies-page button that called it was retired. |
| `POST /inventory/recalc` | `{reconciliationFilter:{companies:[...]}}` (empty = all in JWT scope) | Account Roll Forward card &mdash; VarOK corrective | **Async.** Runs `usp8_recalc_inventory_rollforward`: re-roll the scoped companies **then** `usp6_009` so the report refreshes immediately. Holds the DB activity lock for the whole run (mutually exclusive with B-to-C, a deploy, a GL rebuild, another recalc). Returns `{started, message, busyWith?}`; poll `/inventory/recalc-status`. |
| `POST /inventory/rebuild-gl` | (none) | Account Roll Forward card &mdash; GLOK path | **Async.** Runs `usp8_rebuild_gl_rollforward`: re-merge the GL ledger (`usp6_007`) + rebuild the summary (`usp6_009`). Run **after** the source ledger is corrected &mdash; on an uncorrected source it reproduces the same GLOK. Same lock + `{started,...}` shape; poll `/inventory/recalc-status`. |
| `GET /inventory/recalc-status` | (none) | Account Roll Forward card progress | DB-authoritative: reads `usp8_activity_status` + the latest `RServer_Log` step. Returns `{running, activity, currentStep, since, done, ok, lastStep, lastError, blockedBy?}`. |
| `POST /system-status` | (empty) | Topbar status, Reconciliation drawer | Returns `{fileName}`. Pair with `GET /download-excel/{fileName}` to get the diagnostic Excel; hand to the analyzer for parsing. |
| `GET /download-excel/{id}` | (none) | follow-up to `/system-status` | The diagnostic Excel binary. |

Full agent-side controller catalog (including endpoints V8 doesn't
exercise yet):
[agent docs &sect; Controller catalog](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/docs/API.md#controller-catalog).

---

## Implications for V8

1. **Two API bases, not one.** `RR_CONFIG.authBase` for login; the
   active DB's `dbs[i].ip` becomes the per-session data base. The DB
   switcher in V8's user menu IS the production behavior &mdash;
   it's selecting a different `dbs[i]` from the same JWT.
2. **Auth is dirt simple.** JWT in localStorage, Bearer header, no
   cookies, no SSO.
3. **The production `reconciliation-filtered` endpoint returns SUMMARY
   ONLY** &mdash; no `accountRows[]`. V8's row-level filtering (the
   page's value-add over the live SPA) requires the agent to expose
   row-level data. Spec is queued at
   [agent specs &sect; reconciliation-rows.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/reconciliation-rows.md);
   V8 already wires the call. Day the controller method ships, V8
   picks up real BU / Account / Subsidiary bars with no client
   change.
4. **No JSON endpoint exposes `v_diagnostic5_job_status` directly.**
   The view's data is reachable only through `POST /system-status`,
   which generates the diagnostic Excel server-side. V8 fetches the
   Excel and runs it through `Tools/analysis-workbook.html`'s
   `SystemStatusTemplate` via the headless `rrv8-analyze`
   postMessage bridge &mdash; never re-implement that parsing
   inline. Background:
   [agent gotchas &sect; Diagnostic Excel pipeline](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/docs/gotchas.md#diagnostic-excel-pipeline-the-only-path-to-v_diagnostic5_job_status).
5. **The other variance-component drilldowns** (audit detail,
   row-level breakdowns, etc.) need new server-side endpoints; none
   of the existing `/inventory/*` endpoints return row-level data
   today. Specs go into the agent repo as they ripen.

### Order line type (SDLNTY) &mdash; planned row enrichment

The Transactions fact block (`inventory-transactions.html` &rarr;
`_txvFingerprint` / `_txvFingerprintText`) has a **non-stock line
check** &mdash; a sibling to the duplicate-sales check. It flags a
GL-only reconciling-items row (cardex 0, ledger &ne; 0) whose order
line type is **N** (non-stock / surcharge). Because every
reconciling-items row is on an inventory account, a type-N GL-only
hit there is a routing variance to correct at the source, not an
expected off-inventory posting. The check drives a grounding fact
for the analyst AI note.

**Status: LIVE on the dev jar (rebuilt 2026-08-20; not yet tagged into a Services release).** `SDLNTY` is the distinct SET of
order line types (F4211 &cup; F42119, collapsed by `OUTER APPLY` +
`STRING_AGG` in `v8ui_reconcilingitems`) and now rides on every
Transactions row. **The paragraphs below describe a blocker that was
solved by exposing a SET rather than a single value; they are kept
as the reasoning for that shape.**

**The set is at ORDER grain, and most N-bearing orders are mixed.**
Measured on Demo1 2026-08-20: 9 documents carry a pure `N`, 8 carry
`N` alongside `S` or `W`, and all three rows of the co 80002
"Non-Stock Sales Lines" card read `N, S` or `N, S, W`. So the
client's non-stock fact fires its strong claim only on a pure `N`
&mdash; a mixed order cannot support "GL-only is expected off
inventory", because one of those lines did move inventory. Mixed
orders get their own **inconclusive** fact naming the line types,
and the "no type-N line in this slice" sentence is emitted only when
no order in the slice carries one at all. Asserted by
`Tools/test-nonstock-glclass.js`.

The non-stock GL class problem was solved separately and IS live:
see `NonStockGLClass` / `NonStockLineTypes` on the Transactions row
above. That path narrows to interface `N` inside the view, so it
does not depend on the client resolving a mixed set.

**Why it isn't a live join yet.** `SDLNTY` lives in
`F4211` / `F42119` at the **line** grain (PK includes `sdlnid`).
The Transactions payload comes from `dbo.v6ui_reconcilingitems`,
which rolls to the **document** grain (company / order type / doc
type / doc number / batch &mdash; no line number). Joining SDLNTY on
doc/order alone is ambiguous: one document can carry several lines
with mixed line types (e.g. a stock line **S** plus a freight line
**N**), and an open order's line sits in `F4211` while a
shipped/closed one has moved to `F42119`. Threading it cleanly
requires the reconciling-items view (or an agent-side join) to
expose the line number first, so the source stays authoritative
rather than synthesized.

**Agent contract when it ripens:** add `SDLNTY` (JDE `sdlnty`,
2-char) to each `/inventory/transactions` row, resolved per
document line via `F4211` &rarr; `F42119` fallback keyed on
`sdkcoo`/`sddoco`/`sddcto`/`sdlnid`. Spec:
`RapidReconciler-Agent/specs/txv-sdlnty-line-type.md`.

---

## Home page (`RRV8/home.html`) &mdash; pending data needs

The post-login Home command center (access-flow Phase 1) ships
reading only data the agent/JWT already provide, and degrades
gracefully where they don't. Two enrichments are deferred to a
backend contract rather than synthesized client-side (per the
"always spec new endpoints" rule):

1. **Out-of-balance account count.** The Home insight strip ("do I
   even need to go further?") currently runs off
   `GET /inventory/status` &rarr; `validation.color`
   (green/amber/red) only &mdash; a system-health signal, not a
   work-to-do count. There is **no endpoint today** that returns
   "N accounts out of balance for the open period." When one lands
   (candidate: a lightweight `GET /inventory/home-summary` or a
   `count` field added to `reconciliation-filtered`), Home upgrades
   the message from "validation is green" to "N accounts need
   attention" with **no client rewrite** &mdash; the render already
   branches on the richer field if present and falls back to
   validation otherwise. Until then, no count is shown (not faked).

2. **Role claim + role-lane gating** *(updated 2026-06-09 &mdash;
   supersedes the earlier "role label not in the JWT" note, which is
   now stale).* The token **already carries the role**, per-db:
   - `dbs[i].rn` &mdash; role display-name (`Administrator`,
     `Reconciliation Analyst`, `Read-Only`, `Cost Accounting`,
     `A/P Clerk`). Minted by `AuthController` (`entry.put("rn", ...)`)
     from `RoleEntity.getName()`; documented in `JwtService` token
     shape. Home labels the role badge off `rn` directly &mdash; no
     longer "admin-only badge."
   - `dbs[i].t` &mdash; per-user authorized tabs `{inv,it,adm,por}`
     (the role's tab grants, AND-gated at mint against the client
     license `m`).
   - `dbs[i].perms` &mdash; function grants `{ij,rs,dm,ite,prs}` where
     `dm` = `dmaais` (the role's grant to the **analyst surfaces**:
     Cardex Variance, Account Roll Forward, Model DMAAI Review, DMAAI
     Analysis).

   **Home role-lane gating contract** (the role-based home layout):

   | Lane | Cards | Gate |
   |---|---|---|
   | **Administration** | People & Licensing, Data Mgmt, Service Health, Utilities | `t.adm === true` |
   | **Analyst** (daily) | Cardex Variance, Account Roll Forward, Model DMAAI Review, DMAAI Analysis | `perms.dm === true` |
   | **Finance** (period-end) | Reconciliation, In Transit, PO Receipts | per-module caps `m`/`t` (`inv`/`it`/`por`) |

   Fail-open per the existing `caps()` convention (a missing layer
   doesn't lock a user out). **Gate the Analyst lane on `perms.dm`
   directly, NOT on the existing `caps().dm`** &mdash; `caps().dm`
   AND-gates against `m.adm` (the *admin-module* client license),
   which was right for the admin-coupled DMAAI page guard but wrong
   for an analyst lane: the analyst surfaces are inventory-recon
   features, not admin-module features. The Analyst lane should show
   for any role granted `dmaais`, regardless of the admin license.

   **The one gap is policy, not plumbing.** Per V32/V35 seed, only
   **Administrator** has `dmaais = TRUE`; `Reconciliation Analyst`
   (and the rest) are `FALSE`. So today `perms.dm` lights up for
   admins only &mdash; which is why the analyst surfaces still sit
   inside the admin-only view. For the Analyst lane to reach its
   intended audience, VALC must **grant `dmaais` to the analyst
   role(s)** &mdash; at minimum `Reconciliation Analyst` &mdash; via a
   new migration (V36). Which roles get it (just Reconciliation
   Analyst? also Cost Accounting?) is a role-policy decision, not a
   code one. Once granted, V8 gates the Analyst lane on `perms.dm`
   with **no further token change**.

Both are additive: the Home page is fully functional without them.

3. **Account Roll Forward Analysis lives on Reconciliation, not Home.**
   The Account Roll Forward Analysis (Export Analyzer roll-forward
   template, sheet `Roll Forward`, keyed on `GLOK`/`VarOK`/`OOB`/
   `CardexVar`) is the report the customer expects from the Inventory
   Validation light. Producing it faithfully &mdash; results that match
   **what the database looks like today** &mdash; is a **full analysis
   run** (heavy lifting), so it belongs on the **Reconciliation page**
   (the validation light → `generateValidationReport()`), NOT on the
   lightweight Home command center.

   **Home stays light:** its red-state insight just flags "needs
   attention" and routes the user to Reconciliation (`reconUrl()`,
   navigate only) &mdash; no auto-download, no heavy run on Home. (The
   `?report=validation` auto-download hook in `inventory-reconciliation.html`
   still exists but is no longer triggered from Home.)

   **To make the analysis match the live data**, it needs the agent's
   **native Roll Forward export**. Today `generateValidationReport()`
   materializes the `Roll Forward` sheet from the loaded `reconciliation`
   snapshot: `OOB`/`CardexVar`/`Variance`/balances are real/current, but
   `GLOK`/`VarOK` *break* flags are not in the snapshot &mdash; they're
   emitted as `baseline`/`end`/`yes`, so a client-built sheet can't
   surface a true roll-forward break (it'll read "no errors" when the
   break IS the issue). When the agent exposes the real export (the
   legacy/v359 report, with true flags), `rrFetch` it and hand the bytes
   to the analyzer (candidate `GET /inventory/roll-forward`, or the
   `download-excel/{id}` pattern the System Status pipeline uses) so the
   findings reflect today's actual data. Do NOT hardcode findings to
   match a sample workbook &mdash; the analysis must be data-driven.

---

## Home awareness status (cross-role section pills)

**Status: V8 UI shipped (neutral fallback when absent); agent endpoint
implemented in RapidReconciler-Agent and running on the dev agents — ships to
customers with the next Services jar release.** Home now shows **every**
section to **every** role — Administration, Analyst, Finance, Support — and
separates *visibility* from *authorization*: a user always sees a section's
status pill, but the action cards inside render only if their role grants
them (`t.adm` for Administration, `perms.dm` for Analyst, module caps for
Finance). A lane the user can't act on collapses to its pill plus an
**expandable, read-only summary** of what's open — so e.g. a Cost Accounting
user closing the period can see at a glance that Administration or the
Analyst lane has open items before they start, without being able to touch
the controls.

The pill + read-only summary need a status signal the viewer can read
**regardless of role**. Rather than relax each per-section read
(`/admin/service-health`, `/inventory/integrity/model-approval`,
`/inventory/status`) to all roles, V8 reads **one role-agnostic roll-up**.
The mutating actions behind each lane stay gated server-side exactly as
today — this read only *reports*.

- **Endpoint:** `GET /home/status-summary` on the per-DB Services jar
  (agent-direct, like `inventory/status` / `admin/service-health`; route via
  `RR_TEST_AGENT_AREAS` &rarr; `home/` in `config.js`). **Authenticated**,
  but readable by **any** authenticated role on the DB — it carries no
  actionable detail, only the rolled-up level + a few human-readable lines.
  JWT-scoped by company for the analyst/finance counts.
- **Response (`HomeStatusSummary`):**

  ```json
  {
    "admin":   { "level": "ok | watch | attention", "headline": "Service healthy",
                 "items": ["Data current as of 06/08", "All companies licensed"] },
    "analyst": { "level": "ok | watch | attention", "headline": "2 items need review",
                 "items": ["Model DMAAI review pending (1 company)",
                           "Cardex drift on 3 items"] },
    "finance": { "level": "ok | watch | attention", "headline": "1 account out of balance",
                 "items": ["MFG01 4220 out of balance for the open period"] },
    "db":      { "refreshedAt": "2026-06-08", "dataFrom": "2014-05-01",
                 "sizePretty": "4.2 GB", "engine": "SQL Server 2019",
                 "edition": "Standard Edition (64-bit)",
                 "productVersion": "15.0.4385.2", "compatLevel": 140,
                 "environment": "Dev" }
  }
  ```

  - `level` drives the pill tint (`ok`&rarr;green, `watch`&rarr;amber,
    `attention`&rarr;red). The three keys mirror the three gated lanes; a
    key may be omitted if the server has nothing to report (V8 leaves that
    pill neutral).
  - `headline` is the one-line collapsed-state summary; `items` is the
    expandable read-only list shown when the viewer lacks the lane's
    actions. Both are **finance-safe prose** (no SQL/sproc/endpoint names),
    server-owned so the wording stays one source of truth.
  - **Roll-up definitions** (agent-side, one source of truth):
    - **admin** &mdash; worst of service health (`service-health` verdict),
      data freshness (last refresh), licensing (seats vs. companies).
    - **analyst** &mdash; unreviewed model DMAAIs + cardex-drift count +
      roll-forward break for the scoped companies/open period. *(This is the
      per-company "needs attention" signal the Analyst lane has been waiting
      on — defining it here settles it.)*
    - **finance** &mdash; count of accounts out of balance for the open
      period (the same count item (1) above anticipates).
  - `db` &mdash; install facts for the **Database card's meta strip** in the
    Scope hub (data currency, history-from, size, SQL engine/edition/build +
    compat level, environment). `engine`/`edition`/`productVersion` come from
    `SERVERPROPERTY('ProductLevel'|'Edition'|'ProductVersion')`; `compatLevel`
    from `sys.databases.compatibility_level`; `sizePretty` from `sp_spaceused`;
    `dataFrom` from the earliest period in the data; `refreshedAt` from the
    last completed refresh. The exact **`productVersion`** is the build a
    support ticket asks for ("what SQL version is the customer on?") &mdash;
    surface it verbatim so it's copyable. All fields optional; V8 hides a fact
    it doesn't get and falls back to `/poll` for `refreshedAt`. `environment`
    is also derivable client-side from the DB name suffix, so it shows even
    with no endpoint. These are non-sensitive install facts shown to **every**
    role &mdash; no gating; a finance user simply skims past the SQL line.
    Verify `rruser` can read the `SERVERPROPERTY`/`sp_spaceused` calls
    agent-side before relying on them.
- **Graceful fallback:** `loadHomeStatusSummary()` calls this once on load
  (and on DB switch). If the endpoint is absent/unreachable (older jar), the
  pills stay at their neutral identity color and each unauthorized lane shows
  a plain "You don't have access to this section" note — no placeholder
  counts, nothing faked. The page is fully functional without it.

---

## Cardex materiality tolerance (per-company status threshold)

**Status: agent built (RapidReconciler-Agent) + table applied to the local
DBs; V8 UI wiring in progress.** Cardex drift (per-item perpetual vs. F4111)
is never truly zero in steady state, so a binary "any `CardexVar` &ne; 0 &rarr;
red" makes the Cardex Variance status permanently red (and contradicts the
"All clear" Analyst pill). Instead, each company carries an analyst-set
**materiality tolerance**: the status reads **green while that company's total
`|CardexVar|` is at/under its tolerance, red when over**. Per-company (chosen
over a single total so it's robust to company-scope changes).

- **Storage:** `dbo.RCardexTolerance`, one row per **(company, item)** since
  UI-161. `ItemNumber = ''` is the **company-level default**; anything else is an
  override for that one item. `Tolerance` `decimal(18,2)`, default/absent =
  **0 = strict**, so no false greens until a threshold is deliberately set. DDL
  ships in `RapidReconciler-Agent/setup/sql/create-cardex-tolerance-table.sql`
  (which also migrates an existing company-only table in place) **and in the
  SSDT project** — it was missing from the latter until UI-161, so a customer
  installed from the dacpac had no table and both routes failed against them.
- **Precedence, decided once:** **an item-level tolerance BEATS the
  company-level one for that item.** No row at either grain = 0 = strict. That
  sentence is repeated verbatim in the table DDL,
  `CardexToleranceRepository#resolve`, `CardexToleranceController` and the V8
  resolver `cxTolOf`, and each side has exactly one implementation of it. A
  silent disagreement between two tolerances is worse than either being wrong:
  the company reads green while the item reads red, both on screen, and nobody
  can tell which is the product's actual opinion.
- **Endpoints** (agent-direct; in `RR_TEST_AGENT_AREAS` &rarr;
  `inventory/cardex-tolerance`):
    - `GET /inventory/cardex-tolerance` &rarr; `{ "data": [ { "company", "item",
      "tolerance", "updatedBy", "updatedDate" } ] }`. **Any authenticated
      role**; JWT-scoped to the caller's allowed companies. Only *set* rows are
      returned — the UI defaults an unset company or item to 0. **Both grains
      arrive in this one array**, so a consumer that judges at company grain must
      filter to `item === ''`; Home does, and without it one item's override
      would silently become the company's threshold.
    - `PUT /inventory/cardex-tolerance` body `{ "company", "tolerance"[, "item"]
      }` &rarr; the upserted row. `item` absent or blank = the company default.
      **Analyst-gated** (`perms.dm`, or admin/superuser); can only set a company
      in the caller's own scope. Materiality is the analyst's call at *both*
      grains — a per-item threshold is not a smaller decision than a per-company
      one, it is a narrower one.
    - `DELETE /inventory/cardex-tolerance?company=NNNNN[&item=ABC]` &rarr;
      `{ "deleted": 0|1 }`. Removing an item override returns that item to the
      company default; removing the company row returns every unoverridden item
      to strict. Analyst-gated. An override that cannot be removed in the product
      is one that gets removed in SQL, or never.
- **The per-item override must never act invisibly.** A customer with thousands
  of items will not tune them individually, and a stale override suppresses a
  real variance forever. So `inventory-cardex-variance.html` prints the effective
  tolerance **in the scope band, beside the Amt var it judges**, names the grain
  it came from, carries the audit stamp (`updatedBy` / `updatedDate`), says
  plainly when the focused item is being suppressed, and lists every item-level
  override for the company. A suppression nobody can see is the same defect class
  as a status nobody can reach.
- **Status rule** (UI): the Cardex Variance card/lane is green only when
  **every** in-scope company's total `|CardexVar|` is within its own
  **company-level** tolerance. Home judges at company+account grain
  (`CardexVar` from the roll-forward rows), which carries no item, so the item
  grain deliberately does **not** reach the Home dot — it is applied where items
  are, on `inventory-cardex-variance.html`. Two conclusions about one company on
  one screen is the defect this split avoids, not one it creates: the dot's
  number and the item's number are different numbers, and each is judged against
  the threshold that has the same grain.
- **Where the editor lives:** `inventory-cardex-variance.html`, in the scope
  band. Until UI-161 this doc claimed the page hosted an editable per-company
  threshold and **it did not** — the page carried CSS for a `.cx-tol-*` editor
  and a `_cxTol` variable that nothing ever read or wrote, and no surface in the
  product called `PUT`. The tolerance could only be set in SQL.
- **Graceful fallback:** if the endpoint is absent, the UI treats every
  tolerance as 0 (today's strict behavior) — nothing breaks.

---

## Standing per-line offset accounts (balancing entry)

Home's balancing entry debits each out-of-balance inventory account and credits
an **offset account** the accountant names, and `Journal Entry Complete` stays
disabled until **every** row carries a real one. Those values used to live in a
page-local object keyed `db|company|account`, wiped on every database switch and
lost on every reload — so the same mapping was retyped every period, and a second
accountant on another machine saw none of it. UI-162 makes them a stored,
shared mapping.

- **Storage:** `dbo.RGlOffsetAccount`, one row per **(company, GL account)**.
  DDL ships in
  `RapidReconciler-Agent/setup/sql/create-gl-offset-account-table.sql` and in the
  SSDT project (`RapidReconciler-DB/RapidReconciler/dbo/Tables/`), so a fresh
  install gets it from the dacpac. **No row = no mapping**; there is no default
  offset account and there must never be one, because a guessed offset that
  balances is worse than an empty field that blocks.
- **Endpoints** (agent-direct; in `RR_TEST_AGENT_AREAS` &rarr;
  `inventory/gl-offset-account`):
    - `GET /inventory/gl-offset-account[?company=NNNNN]` &rarr; `{ "data": [ {
      "company", "account", "offsetAccount", "offsetName", "exists",
      "updatedBy", "updatedDate" } ] }`, JWT-scoped to the caller's allowed
      companies.
    - `PUT /inventory/gl-offset-account` body `{ "company", "account",
      "offsetAccount" }` &rarr; the upserted row. **400** when the offset
      account does not resolve in that company's chart of accounts, naming the
      account. An empty `offsetAccount` is a 400, not an upsert of blank — use
      `DELETE`.
    - `DELETE /inventory/gl-offset-account?company=NNNNN&account=BU.OBJ[.SUB]`
      &rarr; `{ "deleted": 0|1 }`.
- **Who can write, and why it is not "the accountant grant".** There **is no
  accountant grant**. Read out of the source rather than assumed: `JwtAuthFilter`
  parses exactly one key from the per-DB `perms` block, `perms.dm`, and
  `UserRequest` exposes only `admin` / `adminSettings` / `adminImport` /
  `adminPoReceipts` / `restartService` / `superUser` / `dmaais`. On the V8 side
  `_entitledRole()` makes **accountant the FLOOR** — admin if the token says so,
  else analyst if `perms.dm`, else accountant — so every authenticated user is
  already at least an accountant. Gating this on `dmaais` the way the cardex
  tolerance does would lock out the one role that owns the mapping. The gate is
  therefore **authentication + company scope**, which is the strongest the token
  actually supports. A narrower grant needs VALC to mint a claim first;
  inventing `perms.ac` in the agent would fail open on every existing token.
- **`exists` is computed on READ, every time.** A stored offset that has since
  been retired still produces a **balanced** entry — it just posts to the wrong
  account, and nothing downstream can tell. So the agent re-resolves each stored
  `offsetAccount` against `dbo.F0901` for that company (composed
  `BusinessUnit.Object[.Subsidiary]`, whitespace stripped from both sides
  because F0901 stores fixed-width right-aligned `NCHAR`) and returns
  `exists:false` for the ones that no longer land. **The UI does not pre-fill
  those** — it flags them by name in the grid and in the Saved-offsets manager.
  The write-side check catches a typo while the accountant is still looking at
  the field; the read-side check catches a chart-of-accounts change months
  later. Neither substitutes for the other.
- **Client:** `RRV8.offsetStore` in `config.js`. **Server-only — no
  localStorage mirror, deliberately.** Every other store in that file falls back
  to localStorage in silence; here that would make a browser-local value
  indistinguishable on screen from the shared mapping, and a pre-filled value
  the browser cannot attribute is exactly the one that reads as "one I just
  chose". When the agent is unreachable the store stays empty and reports why,
  and the grid pre-fills nothing.
- **Saving is explicit.** Typing sets the working value for this period only; a
  `Remember this offset` action writes the standing mapping. A one-off override
  must never silently become configuration.

---

## Restart Services instance (self-serve, VALC-orchestrated)

**Status: SHIPPED (B1a, local path) — VALC endpoint live.** The VALC
`AdminServicesController` (`POST /api/v1/admin/services/restart {database}`)
resolves the DB to its `client_databases` row and does a local
`AgentLifecycleService` stop &rarr; start (sticky `service_port` reused, so
JWT/bookmarks don't churn) for the dev / same-box topology where VALC owns
the Services process. Returns `200 {status:"RESTARTING", database, port}`.
The **remote-customer JMS `RestartInstance`** path (when the customer's Agent
owns the process) is **B1b — pending** (see
`docs/plans/services-restart-endpoint.md`). V8 ships a
self-serve restart for the recurring production symptom where the
Services jar hangs building an Excel export under memory pressure /
heavy concurrency (restarting the Services jar clears it):

- An **export hang advisory** (`inventory-reconciliation.html`,
  `withExportWatchdog` around the audit-report export) surfaces a
  finance-friendly banner if an export hasn't returned within ~40s, with
  a **Restart the data service** button gated on the `rs` (Restart
  Service) JWT permission &mdash; the same perm the admin user-menu uses.
- The button + the user-menu **Restart Service** action both call
  `restartService()` &rarr; `POST api/v1/admin/services/restart`
  (routes to VALC via the `api/v1/admin/` prefix) with body
  `{ "database": "<active db name>" }`.

**Why VALC and not the Services jar directly:** restart is the Agent's
job. Per `RapidReconciler-Agent/docs/deploy-architecture.md`, the
Services jar exposes only Actuator `/health`, `/info`, `/shutdown`;
`POST /shutdown` *stops* an instance, and **only the Agent re-spawns it**
(`ServicesInstanceManagerService`, over JMS). V8 must therefore never
`POST /shutdown` to a Services jar directly &mdash; it would stop the
instance with nothing to bring it back. VALC's job for this endpoint:
resolve the client/DB &rarr; tell the Agent (JMS) to **stop + re-spawn**
that DB's Services instance (mirrors the deploy flow's stop-old/start-new
step) &rarr; return 200 when the restart is dispatched.

B1a ships the local path; against a customer's remote Agent the endpoint
returns 503 ("remote-agent restart not wired yet") until B1b, and
`restartService()` surfaces that honestly rather than faking success. No
client change was needed — V8 already calls the endpoint.

---

## Service memory health (proactive restart hint)

**Status: V8 wired; agent endpoint written, ships with the next Services
jar release.** Complements the reactive Restart button above: the recurring
production failure is heap exhaustion under concurrency (several users run
several reports in a short window; the heap ramps and exports start failing
before GC catches up). This read lets Home's **Service health** card hint a
restart *before* reports fail, instead of only flagging an outage after.

- **Endpoint:** `GET /admin/service-health` on the per-DB Services jar
  (agent-direct, like `inventory/status` / `poll`; routes via
  `RR_TEST_AGENT_AREAS` in `config.js`). **Authenticated** — not in the
  agent's permitAll list; the card is admin-only and carries the JWT.
- **Why agent-direct, not VALC:** this only *reports*. Lifecycle stays
  VALC's job — the card's Restart button still routes to
  `POST /api/v1/admin/services/restart`. V8 never acts on this read by
  hitting the Services jar's own `/shutdown`.
- **Response (`ServiceHealthSnapshot`):**

  ```json
  {
    "state": "healthy | watch | restart",
    "trend": "stable | climbing",
    "uptimeMs": 264600000,
    "heapUsedMb": 900, "heapMaxMb": 1024,
    "liveSetMb": 540, "liveSetMaxMb": 700,
    "gcOverheadPct": 6.4,
    "freeRamMb": 1200, "totalRamMb": 8192,
    "sampledOverSec": 240
  }
  ```

- **The verdict is agent-side (one source of truth); V8 owns the
  finance-facing copy per state.** The signals deliberately avoid the
  instantaneous-heap-% trap (a healthy JVM sawtooths near max):
    - **post-GC old-gen floor** (`liveSetMb` / `liveSetMaxMb`) — the live
      set GC can't reclaim; a climbing floor toward max is the real signal;
    - **GC overhead** (`gcOverheadPct`) — % of recent wall-clock in
      stop-the-world GC; back-to-back collections reclaiming little is the
      in-the-moment freeze;
    - **free physical RAM** on the host;
    - **trend** — floor climbing vs stable across a ~5-min ring buffer.
  Thresholds: `restart` when live-set ≥90% **and** GC ≥10%, or live-set
  ≥97%, or free RAM ≤5%; `watch` at the softer bands or a climbing trend;
  else `healthy`. Agent spec:
  `RapidReconciler-Agent/specs/service-memory-health.md`.
- **Graceful fallback:** `loadServiceMemory()` polls every 60s and on a
  restart; if the endpoint is absent/unreachable (older jar, or the card
  hits a Services instance that predates this release), it silently keeps
  the connectivity-only signal — no placeholder, no error surfaced.

---

## Activity Log + reminder acknowledgements

**Status: agent shipped (Phase 1, 2026-06-28); UI wiring is Phases 2–4 of
`docs/plans/reminders-as-activity-events.md`.** The Activity Log card reads a
server event stream; reminder acknowledgements are recorded into that same
stream **and** persisted per-database so the Home review/snooze dots derive
green/amber from one source of truth instead of per-browser localStorage (which
scattered across DBs — see `project_home_db_isolation`).

All three are **agent-direct on the per-DB Services jar**, authenticated (admin
card, carries the JWT; not in permitAll). Acks persist in `dbo.RAdminReminderAck`
(one row per `kind`); because the agent's connection *is* the database, acks are
DB-scoped automatically.

- **`GET /admin/activity?limit=N`** — recent events, newest first.
  Row: `{ at, event, detail, by }` (ISO instant / short label / one-line / who).
  **Optional (UI-27):** a row MAY also carry `type: "accountant"` to mark it as
  an accountant reconciliation completion for the Audit Support Center tab (see
  below). Purely additive; the field is absent on the current agent, and the UI
  falls back to an event-text keyword read when it's missing, so tagging is a
  refinement, never a contract the UI depends on.
- **`GET /admin/acks`** — current acks (one per kind), for the Home dots:

  ```json
  [ { "kind": "ai-review", "ackedDate": "2026-06-28T15:00:00Z",
      "cadenceDays": 30, "never": false, "ackedBy": "ed@…", "detail": "" } ]
  ```

- **`POST /admin/activity/ack`** — record/refresh one ack; also appends a
  matching Activity Log entry ("AI settings reviewed", "Cardex reload reminder
  set", …). Admin-flag required server-side. Body:

  ```json
  { "kind": "schedule-review", "cadenceDays": 60, "never": false, "detail": "" }
  ```

  `kind` ∈ `ai-review | activity-review | schedule-review | password-review |
  cardex-snooze | purge-snooze | license-snooze`. `cadenceDays` is cleared when
  `never` is true.
- **Requires** `dbo.RAdminReminderAck` in each RR database (in the SSDT project;
  the install/upgrade creates it). If the table is absent the ack calls error —
  the Home dots fall back to their existing client-side reminder read until
  Phases 2–4 switch them to `/admin/acks`.
- **`POST /admin/activity`** — append a free-form event to the Activity Log
  (audit trail), stamped with the caller from the JWT. Authenticated but **not**
  admin-only (an analyst attesting a corrective records here). One-way append, no
  ack/cadence semantics. Used by the Account Roll Forward R099102 lever to record
  *"R099102 repost confirmed"* on attestation. Body:

  ```json
  { "event": "R099102 repost confirmed", "detail": "Repost report received with no errors…" }
  ```

  Returns `{ "ok": true }`. The UI call degrades gracefully (no-op) if the agent
  predates this endpoint. **Optional (UI-27):** an accountant reconciliation
  completion MAY include `type: "accountant"` so the Audit tab classifies it
  without relying on event-text keywords. An agent that doesn't persist `type`
  simply drops it (Jackson ignores unknown fields) with no error.

### Audit Support Center (UI-27)

The accountant **Audit** tab renders a convenience VIEW of the analyst /
accountant **transactions** behind the numbers — **not** an audit-of-record (RR
is a tool; JDE is the SoR, so no immutability / versioning / legal-hold).
**Inputs are analyst or accountant transactions ONLY** — system events (loads /
B→C / deploys / review acks) are **not** inputs and are dropped. Each entry is
one **actor** + a **trigger** + the **finding text** recorded at the time, so the
framework extends simply by adding triggers. Two are wired today, both from feeds
that already exist:

- **Analyst** — resolved transaction-variance reviews from
  `GET /inventory/txv/resolutions` per company (one per
  `(company, cardCode, periodEnd)`; only `status: complete` appears).
  *(Cardex variance will add a second analyst trigger once designed.)*
- **Accountant** — reconciliation completions (attest / sign-off / journal
  entry / balancing / adjusting) written to `GET /admin/activity` via
  `RRV8.logActivity`. Everything else on that feed is system and is filtered
  out.

Filter chips are **All / Analyst / Accountant**. The trail renders as summary
cards (title · trigger · company · period · message · amount · by/when) plus an
Excel "Audit report" snapshot. **No drill-through link on a card** (owner
2026-08-13): an entry is a historical record and every page it could target
renders live rows, so the link resolved to a slice that no longer matched the
finding printed beside it. **No new endpoint is required** —
both feeds already ship and degrade to a per-browser/localStorage fallback with
zero console errors when the agent is absent. The optional `type` tag on
`/admin/activity` (documented above) still helps: an entry tagged
`type: accountant` is classified without relying on the event-text keywords.

---

## Transaction-variance card resolutions (UI-26)

**Status: UI wired against `RRV8.cardStore` with a per-browser localStorage
fallback; agent endpoints + table are the owner's backend build (spec
`RapidReconciler-Agent/specs/txv-card-resolution.md`, DDL
`RapidReconciler-Agent/setup/sql/create-txv-card-resolution-table.sql`).** The
analyst Transaction-Variance view keeps ONE resolution record per
`(database, company, card_code, period_end)` — the closed-card resolution record
and the convergence auto-reopen spine — replacing the legacy per-row
`RCardexLedgerCompare2WorkNote` left-join *for tx-variance*. A card carries ~10
rows per company per period, not thousands of row-notes, and survives B→C row
churn (a card-keyed note doesn't orphan when the residual set changes).

Both endpoints are **agent-direct on the per-DB Services jar**, authenticated
with the JWT (not `permitAll`), and **DB-scoped automatically** because the
agent's connection *is* the database. `by` is always taken from the JWT, never
the request body. The store keys on the **stable classifier code**
(`_txvClassifyCode` → `ACCT | PER | MTO | ICO | TRF | DS | T-SALES | T-PURCH |
T-MFG | T-INV`), NOT the 1–10 display order, so a taxonomy reorder never
corrupts history.

- **`GET /inventory/txv/resolutions?company=NN[&period=YYYY-MM-DD]`** — the
  resolution records for one company in the current DB, **all periods** (so the
  client derives recurrence / auto-reopen across periods). `&period=` optionally
  narrows to one period-end; omit it for the full history the recurrence check
  needs. Returns an array:

  ```json
  [ { "cardCode": "ACCT", "company": "00900", "periodEnd": "2026-06-30",
      "status": "complete", "note": "AAI 3120 remapped to 140050; re-rolled + reloaded cardex.",
      "sourceFix": "AAI remap", "varAmount": 1284.55,
      "by": "name@customer.com", "at": "2026-07-08T15:30:00Z" } ]
  ```

- **`POST /inventory/txv/resolution`** — upsert ONE record keyed on
  `(company, cardCode, periodEnd)` (one current row per key). Body:

  ```json
  { "company": "00900", "cardCode": "ACCT", "periodEnd": "2026-06-30",
    "status": "complete", "note": "…", "sourceFix": "…", "varAmount": 1284.55 }
  ```

  `status` ∈ `open | worked | complete | reopened`. The actor (`by`) is taken
  from the JWT, never the body; `at` is stamped server-side. A reopen+edit
  overwrites the SAME period's record (no note-versioning — RR is a tool, not a
  system of record; JDE is the SoR). Returns `{ "ok": true }`.

- **`DELETE /inventory/txv/resolution?company=NN&cardCode=X&periodEnd=YYYY-MM-DD`**
  — discard ONE recorded finding (UI-122). Same grant as the upsert (`perms.dm`,
  admin or superuser): removing a finding is at least as consequential as writing
  one. Returns the record it removed, which **is the undo** — the client re-POSTs
  it through the upsert above, so restore and create share one write path:

  ```json
  { "ok": true,
    "removed": { "cardCode": "ACCT", "company": "00900", "periodEnd": "2026-06-30",
                 "status": "complete", "note": "…", "sourceFix": "…",
                 "varAmount": 1284.55, "by": "name@customer.com",
                 "at": "2026-07-08T15:30:00Z" } }
  ```

  **`404` when no record existed for that key**, deliberately. A discard that
  reported success on a card holding nothing is indistinguishable, from the
  analyst's side, from one that worked — so a mis-keyed request would read as
  done while the real row sat on someone else's screen. Hard delete, not a
  tombstone status: all four `status` values mean the finding exists and is in
  some state of being worked, and a fifth meaning "this should never have
  existed" would have to be excluded from every query that reads the scoreboard.

  `RRV8.cardStore.discard(company, cardCode, periodEnd)` is the client half. It
  removes locally first and then calls the server, like `save()` — but unlike
  `save()` it does **not** swallow a refusal: it restores the local record and
  re-throws, because a swallowed failure would leave the card gone here and
  present for everyone else.

- **Backing table `dbo.RTxvCardResolution`** — one current row per
  `(CompanyNumber, CardCode, PeriodEnd)`, unique-indexed on that key (the upsert
  target). DDL ships with the SSDT project **and** the agent setup
  (`create-txv-card-resolution-table.sql`). **The standalone `.sql` must still be
  added to the `RapidReconciler-DB` `.sqlproj` (explicit Build Include) to enter
  the dacpac** — a sqlcmd-applied file alone isn't in the dacpac (see memory
  `reference_db_objects_must_be_in_sqlproj`). If the table or the endpoints are
  absent, the UI falls back to a per-browser localStorage map
  (`rrv8.txvCards.<dbName>.<company>`) with zero console errors — the card
  lifecycle works locally, it just doesn't persist server-side or share across
  browsers until the backend lands.

### Balancing-entry export + verification (UI-27, accountant side)

When the accountant exports a period-end balancing entry, RR mints a short
**verification token** (`RR-XXXXXX`, Crockford base32) and records the export as
`unverified`. The token is handed to them as a ready-to-paste JDE P0911
**Explanation** (`F0911.GLEXA`, confirmed **30 chars**, propagates to every line
of a document). When they post the JE with that Explanation, a later read matches
the token against `dbo.F0911` and flips the record to `verified` with the matched
batch — turning a self-reported "I posted it" into evidence reconciled against the
system of record (JDE).

- **`GET /inventory/balancing-entry/exports?company=NN[&period=YYYY-MM-DD]`** —
  the export records for one company, newest first. **The GET runs a match pass
  first**: it pulls the RR-tagged posted lines from `dbo.F0911`
  (`GLEXA LIKE 'RR-%'` — a highly selective subset of the ~3M-row table) and
  verifies any pending token found in a posted Explanation. So the list is
  self-updating; there is no separate verify call. Returns an array:

  ```json
  [ { "company": "00900", "periodEnd": "2026-06-30", "token": "RR-7K2P9Q",
      "amount": -9377.00, "clearingAccount": "1.4900", "entryType": "adjusting",
      "status": "verified", "matchedBatch": "11616", "by": "name@customer.com",
      "at": "2026-07-12T15:30:00Z" } ]
  ```

  `status` ∈ `unverified | verified`. `entryType` ∈ `balancing | adjusting` — which
  entry path minted the export (Overview clearing-account entry vs. Accounts
  deep-dive per-account offset entry); it titles the Audit card. `matchedBatch`
  (F0911 `GLICU`) is present once verified. `matchedAmount` is reserved for a future
  posted-amount cross-check (v1 verifies token presence + reports the batch).

- **`POST /inventory/balancing-entry/export`** — record ONE export, keyed on the
  unique `token`. Body:

  ```json
  { "company": "00900", "periodEnd": "2026-06-30", "token": "RR-7K2P9Q",
    "amount": -9377.00, "clearingAccount": "1.4900", "entryType": "adjusting" }
  ```

  The actor (`by`) is taken from the JWT, never the body; `at` is stamped
  server-side; `status` is always created as `unverified`. `entryType` normalizes to
  `balancing` unless the body sends `adjusting` (so an older client that omits it
  reads as `balancing`). Insert is idempotent on the token (a retried POST is a
  no-op). Returns `{ "ok": true }`.

- **Backing table `dbo.RBalancingEntryExport`** — one row per `Token`,
  unique-indexed on it. DDL: `create-balancing-entry-export-table.sql` (agent
  setup; **also add to the `RapidReconciler-DB` `.sqlproj`** to enter the dacpac).
  If the table or endpoints are absent, the UI falls back to a per-browser
  localStorage map (`rrv8.beExports.<dbName>.<company>`) with zero console errors —
  the token flow works locally and records stay `unverified` (no server match)
  until the backend lands.

### Accountant per-company disposition (UI-27 / UI-34)

When the accountant marks a company complete for the period, the chosen
**disposition reason** (`immaterial | corrected | analyst | timing`) is recorded
server-side — the "record the decision" half of the Audit spine, and the shared
signal the analyst view reads (a company handed to the analyst should elevate the
analyst's source-fix card, not suppress it). One current row per
`(company, periodEnd)`.

- **`GET /inventory/disposition/list?company=NN[&period=YYYY-MM-DD]`** — the
  disposition records for one company, all periods (omit `&period=` for the full
  set). Returns an array:

  ```json
  [ { "company": "00900", "periodEnd": "2026-06-30", "reason": "immaterial",
      "by": "name@customer.com", "at": "2026-07-12T15:30:00Z" } ]
  ```

- **`POST /inventory/disposition`** — mark complete: upsert ONE record keyed on
  `(company, periodEnd)`. Body `{ "company": "00900", "periodEnd": "2026-06-30",
  "reason": "corrected" }`. `reason` ∈ `immaterial | corrected | analyst | timing`.
  The actor (`by`) is from the JWT; `at` is server-stamped. Returns `{ "ok": true }`.

- **`POST /inventory/disposition/reopen`** — reopen: delete the record. Body
  `{ "company": "00900", "periodEnd": "2026-06-30" }`. Returns `{ "ok": true }`.
  (POST, not DELETE, so the dev CORS path needs no proxy.)

- **Backing table `dbo.RAcctCompanyDisposition`** — one current row per
  `(CompanyNumber, PeriodEnd)`, unique-indexed on that key. DDL:
  `create-acct-disposition-table.sql` (agent setup; **also add to the
  `RapidReconciler-DB` `.sqlproj`** to enter the dacpac). If the table or endpoints
  are absent, the UI falls back to a per-browser localStorage map
  (`rrv8.dispos.<dbName>.<company>`) with zero console errors — a mark persists
  locally (survives reload) but isn't shared across sessions until the backend lands.

### Analyst per-company period review (txv Pass 1)

**Status: server-pending — UI wired, localStorage fallback in place.** The
analyst counterpart to the accountant disposition. When the analyst finishes the
Transaction-Variance plan for a company+period — fixing some sources at the root
and letting the immaterial remainder ride — they mark the period reviewed. RR
records the tally (how many card slices were source-fixed vs. let ride) so Pass 2
can surface the analyst's review alongside the card outcomes in the Audit Center.
One current row per `(company, periodEnd)`.

- **`GET /inventory/txv/period-review?company=NN[&period=YYYY-MM-DD]`** — the
  review records for one company, all periods (omit `&period=` for the full set).
  Returns an array:

  ```json
  [ { "company": "00900", "periodEnd": "2025-07-31", "sourcesFixed": 3,
      "letRide": 2, "note": "", "by": "name@customer.com",
      "at": "2026-07-13T15:30:00Z" } ]
  ```

- **`POST /inventory/txv/period-review`** — mark reviewed: upsert ONE record keyed
  on `(company, periodEnd)`. Body `{ "company": "00900", "periodEnd": "2025-07-31",
  "sourcesFixed": 3, "letRide": 2, "note": "" }`. `sourcesFixed` / `letRide` are
  integer card counts. The actor (`by`) is from the JWT; `at` is server-stamped.
  Returns `{ "ok": true }`.

- **Backing table `dbo.RTxvPeriodReview`** — one current row per
  `(CompanyNumber, PeriodEnd)`, unique-indexed on that key. DDL:
  `create-txv-period-review-table.sql` (agent setup; **also add to the
  `RapidReconciler-DB` `.sqlproj`** to enter the dacpac). If the table or endpoints
  are absent, the UI falls back to a per-browser localStorage map
  (`rrv8.analystReview.<dbName>.<company>`) with zero console errors — a mark
  persists locally (survives reload) but isn't shared across sessions until the
  backend lands.

---

## Model DMAAI Review (validate + approve the model)

**Status: V8 wired (Home card + `accounting-model-review.html`); agent
endpoint + table written, ship with the next Services jar release + a SQL
apply.** The model DMAAI table (4152 PI) is what RR reads on every import to
decide which GL account each inventory transaction posts to. The goal is to
confirm every GL class used in inventory maps to the correct account, then
record a **single model-level sign-off** — GSI surfaces the diagnostic but
cannot approve the setup (only the customer's accounting team can).

- **Endpoints** (agent-direct, authenticated; in `RR_TEST_AGENT_AREAS`):
    - `GET /inventory/integrity/model-approval[?company=NN]` — the verdict +
      counts. `?company=NN` narrows the materiality **counts**
      (`report3Count` / `report3GlClassCount`) to one company for the analyst
      Briefing (which scopes to a single company); the **verdict**
      (`state` / drift) stays client-wide (the model DMAAI table is
      client-wide, not per-company).
    - `POST /inventory/integrity/model-approval` — record the attestation
      (body `{ "note": "<optional>" }`; the approver is taken from the JWT,
      never the body).
    - `GET /inventory/integrity/model-baseline` — Report 1, lean projection
      for the baseline grid (`{ total, data }`; Company / GL class / Account
      (`LongAccount`) / Account name (`F0901.gmdl01`), plus `TableNumber` +
      `DocType` the page folds into a caption). JWT-scoped by company.
    - `GET /inventory/integrity/model-row-reviews` — the per-row review
      worksheet (`{ total, data:[RowReview] }`), JWT-scoped.
    - `POST /inventory/integrity/model-row-review` — upsert one mapping's
      verdict (body `{ company, glClass, status: "ok"|"change",
      requestedChange }`; reviewer from JWT, account snapshot taken
      server-side from the live baseline).
    - `GET /inventory/integrity/model-change-report` — the flagged rows as a
      change-request `.xlsx` (POI, `Content-Disposition: attachment`).
    - `GET /inventory/integrity/excluded-class-reviews` — analyst verdicts on
      excluded GL classes (`{ total, data:[ExcludedClassReview] }`), JWT-scoped.
    - `POST /inventory/integrity/excluded-class-review` — upsert one slice's
      verdict (body `{ company, glClass, stockingType, status, note }`;
      `status` is `Intended` | `Needs review` | `Fixed`).

      Keyed on `(company, glClass, stockingType)` — one level finer than the
      row-review above — because a single excluded GL class routinely spans
      several stocking types that do not deserve the same verdict. `""` is a
      legitimate `stockingType`: the item has no `F4102` record for its branch.

      The reviewer comes from the JWT and the item/amount snapshots are taken
      server-side from the live `v_integrity3_exc_glc` rows in the caller's
      scope, so a client cannot assert what it approved. A slice that is no
      longer excluded returns `404` rather than being stored.

      The snapshots are the point: marking a slice intended while it holds
      nothing is a safe call, the same slice holding $50,000 later is not, and
      the page compares the two and shows an outgrown approval as stale.

      Persisted in `dbo.RExcludedGlClassReview`. Distinct from the JDE-side
      path — a DMAAI 4152 entry with document type `98` already suppresses an
      excluded class at source (the anti-join in `v_integrity3_exc_glc`) but
      keys on `(company, glClass)` and cannot express a per-stocking-type call.
- **`GET` response (`ModelApprovalStatus`):**

  ```json
  {
    "state": "approved | needs-review | unapproved",
    "approved": true,
    "approvedBy": "name@customer.com",
    "approvedDate": "2026-06-06T15:30:00Z",
    "note": "IN90/EXP1 exclusions are intended",
    "report1Count": 50,              // model GL-class -> account mappings (Report 1)
    "report3Count": 3,               // GL classes currently excluded (Report 3)
    "report3CountAtApproval": 3,
    "changedSinceApproval": false,
    "companiesInScope": ["00900","00050"]
  }
  ```

- **Verdict is agent-side (one source of truth); V8 owns the copy.**
  `state`: `unapproved` (never signed off) · `needs-review` (approved, but
  the excluded-GL-class set has drifted since sign-off — a SHA-256
  fingerprint of the excluded (Company, GL class) set, stored at approval,
  no longer matches) · `approved` (signed off, unchanged). Report 3 having
  exclusions isn't itself an error — some GL classes are legitimately
  excluded (non-stock / expense); the human sign-off is the gate.
- **Single model-level attestation**, not per-GL-class: backed by
  `dbo.RDmaaiModelApproval` (latest row = current sign-off; older rows are
  an audit trail). Counts come from Integrity Report 1
  (`v_integrity1_aai_base`) + Report 3 (`v_integrity3_exc_glc`), JWT-scoped.
  Agent spec: `RapidReconciler-Agent/specs/model-dmaai-review.md`;
  table DDL: `RapidReconciler-Agent/setup/sql/create-dmaai-model-approval-table.sql`.
- **Per-row review + change request** (layers UNDER the model-level sign-off;
  the single attestation stays the gate). Each baseline-grid row carries an
  **OK / Change** verdict, persisted one-current-row-per-`(Company, GLClass)`
  in `dbo.RDmaaiRowReview` (table DDL:
  `RapidReconciler-Agent/setup/sql/create-dmaai-row-review-table.sql`). A
  `change` row captures a free-text requested correction and an
  account snapshot (`LongAccount` + description at review time → drift cue +
  plain-English report). Flagged rows export via `model-change-report` as a
  punch list the customer hands to whoever administers their JDE DMAAIs
  (GSI can't edit it; email is stubbed, so it's download-then-send).
  **Sign-off is gated** in V8 while any row is flagged `change` — you can't
  attest a model you've flagged wrong; the flag clears when JDE is corrected
  and the next refresh moves the account (snapshot mismatch → re-review).
- **Surfaces:** Home's **Model DMAAI Review** card (`home.html`
  `loadModelApproval`) reads the verdict; the leaner
  **`accounting-model-review.html`** shows Report 3 (excluded GL classes,
  the materiality) + Report 1 (the model baseline, with the per-row review
  controls + company filter) and ends in the single Approve action.
  **Graceful fallback:** both degrade to a neutral "review the model" state
  when the endpoint isn't live.

---

## Data purge (period cutoff)

**Status: SHIPPED (agent + V8).** Purging old data = moving the period
cutoff (`rcompanies.PeriodCutoff`) forward to a new period beginning date;
the **next refresh purges everything before it, server-side**. This replaces
the old manual, per-company date edits with one action that sets every
company's cutoff at once.

- **Endpoints** (agent-direct, authenticated; in `RR_TEST_AGENT_AREAS`):
    - `GET /inventory/integrity/purge-info` — current cutoff, DB file size,
      and the valid new start dates.
    - `POST /inventory/integrity/purge-cutoff` `{ "date": "yyyy-MM-dd" }` —
      set the cutoff on every company the caller can see; returns the updated
      info.
- **`GET` response (`PurgeInfo`):**

  ```json
  {
    "currentCutoff": "2015-08-30",
    "cutoffsDiverge": false,
    "dbSizeMb": 49500, "dbSizePretty": "48.3 GB",
    "calendarDiverges": false,
    "candidates": ["2015-10-04","2015-11-01", "..."]
  }
  ```

  `candidates` are the shared `Rfiscalcalendar.PeriodBegins` later than the
  current cutoff (exact dates — fiscal periods aren't month-aligned).
  `calendarDiverges` flags companies that don't share the same period
  beginning dates (the card warns, doesn't block). `dbSizeMb` is the data
  file (`sys.database_files` ROWS).
- **Reversible until the refresh runs.** Setting a *later* cutoff stages the
  purge and the card's button becomes **Restore**, which POSTs the prior
  cutoff back. A *forward* move must land on a real period beginning date
  (else 400); a *backward* (restore) move is unrestricted — it only re-widens
  and never purges. The actual purge is the refresh job's, not this
  endpoint's. Note: forward-to-invalid currently surfaces as 403 (the agent's
  `/error` dispatch isn't in its permit list) — the client catches it and the
  dropdown only offers valid dates, so it's an unreached safety net.
- **Surface:** Home's **Data** card → "Purge old data" row → a modal
  (`home.html` `loadPurgeInfo` / `togglePurge`) showing the current cutoff +
  DB size, the exact-date picker, the irreversibility + backup warning, and
  the large-DB insight (performance / disk / tempdb / autogrowth). Agent spec:
  `RapidReconciler-Agent/specs/data-purge.md`.

---

## Variance-component &rarr; source-view bindings

These bindings let V8's Preview pane / Excel export call the right
SQL when wiring moves from static snapshot to a live backend.

| Component | Source view | Notes |
|---|---|---|
| `glBatches` | `v6_007_unpostedbatches` | Un-posted F0911 batches joined to `rinvaccountlist` and `rfiscalcalendar`. Per-batch grouping with approval + post status. Excel export matches the production *Unposted GL Batches* report shape verbatim (10 cols: CompanyNumber / BatchDate / PeriodEnds / Username / LongAccount / BatchNumber / Type / Amount / Approval_Status / Posting_Status; merged title row; light-gray header row; no metadata block). Currency + Rate columns from the production report are intentionally skipped &mdash; we don't yet capture an FX source. |
| `endOfDay` | `v6_006_unposted_cardex` | Un-posted cardex transactions (`rtransactions` where `batchnumber = 0`) joined to `rinvaccountlist`. Per-doc grouping with order type, doc type/number, branch plant, and next-status. |
| `manualJournalEntries` | `v6ui_manual_entries` | Per-doc manual JEs (`vcr_f0911` where `batchtype = 'g'` and `ordertype = ''`) joined to `rinvaccountlist`. 10 cols: CompanyNumber / PeriodEnds / DocType / DocNumber / LongAccount / Amount / UserName / Originator / Explanation / Remark. Currency + Rate from the view are dropped in V8 until an FX source is captured. |
| `carryForward` | (rollover &mdash; no drilldown) | Prior-period unreconciled variance; not drillable. |
| `transactions` | (dedicated page) | Has its own Transactions page; no inline drilldown. |
| `cardex` | `v6ui_itemrollintegritydialog` | Per-item integrity issues where perpetual valuation doesn&rsquo;t roll cleanly (`rperpetualinv` where `reason != ''`) joined to `rinvaccountlist`. 15 cols: Reason / CompanyNumber / LongAccount / Branch / ShortItem / ItemNumber / ThirdItem / Location / Lot / Method / AdjAmount / AdjQty / UOM / GLClass / Comment. **No PeriodEnds column** &mdash; current-state report, not period-historical. The shared filter chain skips the period predicate for this binding via `requirePeriod: false`. |

The snapshot declares these bindings in `_meta.drilldownSources`.
Front-end filter chain (`filterViewBackedRows`) is shared across all
view-backed components &mdash; takes (array key, amount field name),
filters by current period + selected companies + the set of long
accounts that pass `rowMatchesFilters`, and sorts by `|amount|` desc.

---

## V8 sign conventions applied on top of agent responses

The agent returns variance components with the magnitude of each
F0911-to-F4111 effect. V8 applies a sign multiplier at aggregation
to make the components sum cleanly to the unreconciled total:

```js
const VARIANCE_SIGN = { transactions: -1 };  // others default to +1
```

This is declared in [inventory-reconciliation.html](inventory-reconciliation.html)
inside `computeFilteredView`. The per-row data in `accountRows[]` is
unchanged; the convention is declared in one place so downstream
consumers (variance table, Carry Forward preview, audit report, JE
export) all get properly-signed values.

When the row-level reconciliation endpoint ships
([spec](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/reconciliation-rows.md)),
the agent should pass through the sign as the view already emits it
&mdash; V8's `VARIANCE_SIGN.transactions = -1` flip handles the rest.

---

## Current network surface (legacy SPA, for reference)

Pre-V8, the live AngularJS SPA's Reconciliation page made these XHR
calls on load:

| Endpoint | Purpose | Size | Notes |
|---|---|---|---|
| `available-periods` | List of close dates for the period dropdown | 899 B | Fires **4&ndash;5&times;** per load. Wasteful. |
| `status` | System Status indicator (color, popover, lag) | 1.1 kB | Fine. |
| `poll` | Heartbeat for the status indicator | 548 B | XHR long-poll, 60s. |
| `reconciliation-filtered` | The actual reconciliation data | 4.1 kB | The page's payload. |

Plus `collect?v=2&tid=G-LDXX33M9BZ` (Google Analytics 4) on every
route change.

---

## Current `reconciliation-filtered` response shape (legacy)

The page's primary payload. Real response from the Acme staging
instance (sanitized labels; same values as the rendered page).

```json
{
  "validation": {
    "color": "success",
    "tooltip": "This indicator is red if the roll forward from the prior period fails...",
    "label": null,
    "minutes": 0,
    "average": 0,
    "count": 0
  },
  "filter": {
    "currencies":   [{ "id": "GBP", "checked": true, "show": true, "label": "&pound; - GBP" }, ...],
    "companies":    [{ "id": "00900", "parentId": "USD", ... }, ...],
    "businessUnits":[{ "id": "8800100", "parentId": "00900", ... }, ...],
    "objects":      [{ "id": "141000", "label": "141000 - Raw Material" }, ...],
    "subsidiaries": [{ "id": "", "label": "None" }, { "id": "CC" }, ...],
    "selectedsObjects": [...]
  },
  "summary": {
    "valuation": {
      "glBalance":        18724064.22,
      "perpetualBalance": 18710860.69,
      "outOfBalance":        13203.53
    },
    "variance": {
      "carryForward":        -18674.7,
      "glBatches":           { "value": -0.0,     "alert": false },
      "endOfDay":            { "value": -0.0,     "alert": false },
      "transactions":          -280.51,
      "cardex":              { "value": 35606.77, "alert": false },
      "manualJournalEntries":{ "value": -3448.03, "alert": false },
      "exclusions":          { "value": null,     "alert": false },
      "unreconciledVariance":13203.53
    },
    "calculation": {
      "glBalance": null, "openReceipts": null, "outOfBalance": 13203.53,
      "unreconciled": null, "batches": null, "totalVariance": null,
      "suggestedEntry": null, "manualEntries": null
    }
  },
  "pieChart": {
    "data": [
      { "label": "GBP", "data": 25203.70, "tooltipData": -25203.70, "color": "#f1a443" },
      { "label": "USD", "data": 38407.23, "tooltipData":  38407.23, "color": "#0c609b" }
    ],
    "level": 1,
    "label": "Base Currency"
  },
  "barChart": [
    {
      "label": "Out of Balance",
      "color": "#f3a536",
      "data": [
        ["2015-08-29",      0.04],
        ["2015-10-31",    -47.64],
        ["2015-11-28", -29245.59],
        ...
        ["2016-08-27",  13203.53]
      ]
    }
  ],
  "agingChart": null,
  "alertDuplicateCosts": false
}
```

### Issues with the legacy shape (motivation for the V8 design pitch below)

1. **Inconsistent variance components.** Some are scalars (`carryForward: -18674.7`,
   `transactions: -280.51`), some are `{ value, alert }` objects. Forces the
   client to type-check each field.
2. **Multipurpose payload.** `calculation.*` carries PO Receipts fields
   (`openReceipts`, `suggestedEntry`, `batches`) that are all `null` on this
   page. Same endpoint is reused across modules.
3. **Filter state echoed back.** The response repeats the entire filter state
   the client just sent. Client could keep filter state in the URL or local
   memory instead.
4. **Typos / inconsistent naming.** `selectedsObjects` (extra `s`),
   `tooltipData` vs `data`, color hex strings hard-coded server-side.
5. **Drill-down requires a round-trip per level.** `pieChart.level: 1`. Clicking
   into a segment fetches the next level. Could be inlined for 1-2 levels.
6. **Color hex codes baked in server-side.** Theme changes require a backend
   deploy.

---

## Proposed V8 shape (design pitch)

Single endpoint per page, normalized variance components, theme-agnostic
colors, filter state stays in the URL. Pitch only &mdash; engineering owns
implementation.

### Endpoint

```
GET /api/v2/inventory/reconciliation
    ?period=2016-08-27
    &currencies=GBP,USD
    &companies=00900,00050
    &businessUnits=8800100,5000000
    &accounts=141000,142000,143000,143100,145000
    &subsidiaries=,CC,FM,MLD,MM,PM,PRS,RW,S/A,S/C,SEC,SM
```

### Response

```json
{
  "asOfPeriod": "2016-08-27",
  "instance": "RapidReconciler_Dev",
  "currency": "USD",
  "status": {
    "validation": "green",
    "validationDetail": "Roll-forward clean.",
    "lastRefresh": "2026-04-17T09:48:00Z",
    "lagMinutes": 0
  },
  "filters": {
    "currencies":    [{ "id": "GBP", "label": "&pound; - GBP" }, { "id": "USD", "label": "$ - USD" }],
    "companies":     [{ "id": "00900", "currency": "USD", "label": "Acme Inc" }, ...],
    "businessUnits": [{ "id": "8800100", "company": "00900", "label": "Balance Sheet" }, ...],
    "accounts":      [{ "id": "141000", "label": "Raw Material" }, ...],
    "subsidiaries":  [{ "id": "",  "label": "None" }, { "id": "CC", "label": "CC" }, ...]
  },
  "valuation": {
    "glBalance":        { "value": 18724064.22, "currency": "USD" },
    "perpetualBalance": { "value": 18710860.69, "currency": "USD" },
    "outOfBalance":     { "value":    13203.53, "currency": "USD" }
  },
  "variance": {
    "components": [
      { "key": "carryForward",        "label": "Carry forward",         "value": -18674.70, "alert": false },
      { "key": "glBatches",           "label": "GL batches",            "value":      0.00, "alert": false },
      { "key": "endOfDay",            "label": "End of day",            "value":      0.00, "alert": false },
      { "key": "transactions",        "label": "Transactions",          "value":   -280.51, "alert": false },
      { "key": "cardex",              "label": "Cardex",                "value":  35606.77, "alert": false },
      { "key": "manualJournalEntries","label": "Manual journal entries","value":  -3448.03, "alert": false }
    ],
    "total": { "value": 13203.53, "currency": "USD" }
  },
  "drillDown": {
    "levels": [
      {
        "level": 1,
        "label": "Base currency",
        "segments": [
          { "key": "GBP", "label": "GBP", "value": 25203.70 },
          { "key": "USD", "label": "USD", "value": 38407.23 }
        ]
      }
    ]
  },
  "history": {
    "label": "Out of balance",
    "points": [
      { "period": "2015-08-29", "value":      0.04 },
      ...
      { "period": "2016-08-27", "value":  13203.53 }
    ],
    "summary": {
      "twelveMonthHigh": -29245.59,
      "twelveMonthLow":      0.00,
      "avg":            -4205.91
    }
  },
  "flags": {
    "duplicateCosts": false,
    "staleData":      false
  }
}
```

### Key differences from current shape

| Concern | Current | V8 proposal |
|---|---|---|
| Variance components | Mixed scalars + `{value, alert}` objects | Uniform `[{ key, label, value, alert }]` array |
| Currency on values | Implied | Explicit `{ value, currency }` for top-level numbers |
| Account terminology | `objects` | `accounts` (less generic) |
| Filter echo | Full filter state in response | Filters in URL; response returns only their *available options* |
| Drill-down | One round-trip per level | First two levels inlined; deeper levels fetched on demand |
| Colors | Hex codes in payload | Client decides from `key` + theme |
| PO Receipts fields | Embedded in `calculation` block | Separate endpoint per module |
| `validation.color: "success"` | Bootstrap class names | Semantic: `"green" \| "yellow" \| "red"` |
| Empty-string IDs | `"id": ""` for "None" subsidiary | `"id": "_none"` or `null` |
| Typos | `selectedsObjects` | Fixed |

### Other V8 endpoint ideas

- `GET /api/v2/inventory/reconciliation/drill-down?level=2&from=GBP` &mdash; on-demand deeper drill levels.
- `GET /api/v2/inventory/reconciliation/audit-report?format=xlsx|pdf` &mdash; the Audit Report download.
- `POST /api/v2/inventory/reconciliation/journal-entry` &mdash; the Journal Entry export.
- `GET /api/v2/inventory/reconciliation/variance-drilldown?component=glBatches&period=2016-08-27` &mdash; per-component drilldown. Replaces the static-snapshot fetch the page does today.
- `GET /api/v2/system/status` &mdash; status indicator data, cached client-side.
- **SSE** on `/api/v2/system/status/stream` &mdash; replaces the 60s `poll` XHR long-poll.
- `GET /api/v2/periods?instance=RapidReconciler_Dev` &mdash; the period list, cached client-side via ETag.

### Open handoff items

- **Cross-period history bar chart &mdash; WIRED (2026-05-24).**
  Was an open item; now resolved. `POST
  /inventory/reconciliation/history` (specced in
  [`RapidReconciler-Agent/specs/reconciliation-history.md`](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/reconciliation-history.md))
  ships in the green-field test agent on port 34537. V8&rsquo;s
  Reconciliation page calls it via `loadPeriodBarsSnapshot` (now
  history-aware); the Transactions page uses
  `loadCrossPeriodReconRows` against
  `/inventory/reconciliation/rows` so it can aggregate the
  transactions-component sum per period (the history endpoint only
  exposes the GL/Perpetual/OOB sums). `data/reconciliation.json` is
  no longer the cross-period source in staging/prod mode.

---

## What hits the wire today vs. V8

For Inventory > Reconciliation page load:

| Stage | Today | V8 |
|---|---|---|
| Initial paint | 3 XHR (`available-periods`, `status`, `reconciliation-filtered`) | 1 XHR (consolidated reconciliation endpoint) |
| Period switch | 1 XHR | 1 XHR |
| Filter change | 1 XHR | 1 XHR (URL also updates) |
| Status refresh | 60s long-poll on `poll` | SSE stream |
| Drill-down click | 1 XHR per level | 0 XHR for first level, 1 XHR for deeper levels |
| Audit Report click | 1 XHR (Excel) or 1 XHR (PDF) | Same, dedicated endpoint |
