# RRV8 &mdash; workflow

How to pick up the V8 project after a break, build out a new page, capture
fresh data, and ship changes. Written so someone (you, a future Claude
session, a new engineer) can open this cold and be productive within an
hour.

---

## Design scopes (where state lives)

Three zones, each with a clear scope. Decide where a new control
lives by asking which scope it belongs to:

| Zone | Scope | Examples |
|---|---|---|
| **Top bar** | Truly global app chrome (no module specifics). | Brand, refresh/notifications/help/user. |
| **Sidebar** | State that persists across every module that has it, with one canonical value app-wide. | Nav, filters, System Status pulse. |
| **Page header** | State that&rsquo;s module-scoped &mdash; relevant on some pages, absent on others. | Breadcrumb, title, period selector, module Validation health strip, action buttons. |

The partial-global cases (period selector, validation light) live
on the page header. If a future page (e.g. PO Receipts) doesn&rsquo;t
have a period concept, it simply doesn&rsquo;t render the pill &mdash;
no awkward grayed-out control in the sidebar.

The persistence of filters across module navigation is handled by
`localStorage` (key `rrv8-filter-selections-v1`); they appear in
every module&rsquo;s sidebar with the same selection.

---

## What V8 is

A working-but-static modern reimagining of the RapidReconciler SPA,
designed to:

- **Live in this repo** &mdash; one folder, no separate codebase or build
  step. HTML / CSS / vanilla JS. Static enough to ship from GitHub Pages.
- **Use the live DB as the seed** &mdash; we pull sproc / view DDL and
  per-period JSON snapshots straight from the dev-box SQL Server, save them
  alongside the pages, and the front-end fetches the JSON.
- **Iterate fast** &mdash; new page = new HTML file + a data-snapshot
  next to it. No frameworks, no transpile, no migrations.
- **Eventually replace the live SPA**. The current AngularJS-era app
  (`staging-rr-spa.azurewebsites.net` / `rapidreconciler.getgsi.com`) is
  the source we&rsquo;re modernizing away from.

When V8 is ready for internal review, it&rsquo;ll be linked from the hub
page&rsquo;s *Internal Workflows* section.

---

## Repo layout

```
RRV8/
├── README.md                              ground rules + data hygiene
├── WORKFLOW.md                            you are here
├── API.md                                 current vs. proposed API shape
│
├── inventory-reconciliation.html          page (page-per-page pattern)
├── data/
│   └── reconciliation.json                ONE file covers all 13 periods
│                                          (per-account rows; period switch
│                                           is in-memory, no re-fetch)
│
├── sprocs/                                14 .sql files (sp_helptext dumps)
│   ├── usp6getrinvaccountsummary.sql      master entry for the rec page
│   │                                      (wraps v6ui_raccountsummary)
│   ├── usp6getfilteredview.sql            38 KB workhorse
│   └── &hellip;
│
├── views/                                 17 .sql files (sp_helptext dumps)
│   ├── v6ui_raccountsummary.sql           the real master reconciliation view
│   ├── v6ui_reconfiledata.sql             DEAD &mdash; intended for a process
│   │                                      that never shipped
│   └── &hellip;
│
└── scripts/                               capture / regen tooling (TBD)
    └── capture-periods.ps1                planned: re-pull the snapshot
                                           via usp6getrinvaccountsummary
                                           + FOR JSON PATH + reshape
```

**Naming conventions**

| Thing | Convention | Example |
|---|---|---|
| Page file | `<area>-<page>.html` | `inventory-reconciliation.html` |
| Data snapshot | `<area>.json` (one file per page; every period inside) | `reconciliation.json` |
| Sproc DDL | `<sproc-name>.sql` (verbatim from DB) | `usp6getrinvaccountsummary.sql` |
| View DDL | `<view-name>.sql` | `v6ui_raccountsummary.sql` |
| Script | `<verb>-<noun>.ps1` | `capture-periods.ps1` |

---

## Current state checkpoint

As of the latest commit, V8 has:

- **Five pages**: `inventory-reconciliation.html`,
  `inventory-transactions.html`, `accounting-dmaais.html`,
  `inventory-asof.html`, and `inventory-cardex-variance.html`.
  The DMAAI page is the analyzer worklist surface (FIX FIRST +
  ASK CUSTOMER + module grids) wired to a Python pattern detector
  (`RRV8/scripts/derive-dmaai-analysis.py`) that reads integrity
  report 0 (`v_integrity_jde_aais`) and emits the worklist JSON.
  Agent endpoints for the worklist + responses are specced in
  `RRV8/API.md` (PROD-TODO). The As Of page pivots away from the
  legacy &ldquo;paginate millions of rows&rdquo; pattern: the main
  grid defaults to item-level rollup, each row expands to show its
  lot/location detail, and a page-level Company filter narrows the
  scope. Cardex Variance is the dedicated worklist for per-item
  perpetual-vs-cardex drift, sourced from `v6ui_itemrollintegritydialog`
  (783 rows, both companies). References: `HANDOFF.md` &sect; *As Of
  page &mdash; design notes* and *Cardex Variance page &mdash;
  design notes*.
- **Reconciliation page**: the modernized
  Inventory > Reconciliation. Fully styled. Loads
  `data/reconciliation.json` once on page load; every period
  / filter combination is computed in-memory from that.
- **Single all-periods snapshot**: `data/reconciliation.json` &mdash;
  195 row-level records covering 13 periods, 2 companies, 5 inventory
  accounts, 12 subsidiaries, 2 business units. Fetched once on page
  load; period switching is in-memory (no re-fetch). Captured via
  `usp6getrinvaccountsummary` reading the `v6ui_raccountsummary`
  view against `RapidReconciler_Dev`.
- **Period dropdown wired**: clicking shows all 13 known close dates,
  every one selectable (since the snapshot covers them all). The
  pill lives in the **page header** (next to the action buttons),
  not the top bar &mdash; period is module-scoped (Inventory and
  Transfers share it, PO Receipts has none) so the control belongs
  with page chrome that can disappear on modules that don&rsquo;t
  use it.
- **Filters live in the sidebar** (not in a page-level filter bar).
  Collapsed sidebar shows 5 filter icons; expanded sidebar shows full
  rows with `All` / `N / total` status pills and an orange dot on any
  row that's narrowed. Clicking a row opens a checkbox popover anchored
  to the right of the sidebar with a caret pointing back at the row.
  Selections persist across reloads via `localStorage`
  (`rrv8-filter-selections-v1`), mirroring the live SPA's
  cross-page-navigation persistence.
- **Filters are exact, row-level**. `data/reconciliation.json`
  contains an `accountRows` array &mdash; one row per (period,
  company, business unit, object, subsidiary, currency) tuple,
  captured from `usp6getrinvaccountsummary` against `RapidReconciler_Dev`.
  195 rows total (13 periods &times; 15 account combinations).
  - Each row carries its dimension tags plus the full variance
    breakdown (carryForward, glBatches, endOfDay, transactions,
    cardex, manualJournalEntries, unreconciledVariance).
  - `computeFilteredView()` is the single seam: filter rows by
    every active selection, then sum. Hero, GL/Perpetual side
    stats, variance steps, total, and page subtitle all read from
    its return value.
  - The bar-chart history is filtered TOO &mdash; `computeFilteredHistory()`
    groups the same row-set by period and emits OOB per period.
    Narrow to one company and the 13-period trend recomputes.
- **Active-filter banner**: an orange callout under the page header
  appears whenever any group is narrowed below "all", showing which
  groups are reduced (e.g. *"Filtered: 1 of 2 currencies"*) plus a
  Reset link.
- **Variance breakdown** renders dynamically from the filtered view,
  negatives in red parentheses, total in the navy bar.
- **Sidebar status panel** &mdash; Inventory Validation (module-scoped,
  this period&rsquo;s roll-forward state) above System Status (global
  heartbeat). 14px dots with halos. System Status pulses via
  transform + opacity (compositor thread, no main-thread repaint).
  Both lights are **clickable** &mdash; opens the runbook drawer
  (see *Runbook drawer* below). The diagnostic Excel is now a
  secondary action inside the drawer; clicking the light no
  longer immediately downloads.
- **Sidebar layout**: filters live ABOVE main navigation. The
  analyst sets context (company, currency, BU, account,
  subsidiary) before picking a module &mdash; matches the way
  reconciliation work actually starts.
- **Runbook drawer** (the in-page version of the public Help
  Desk runbook scenarios for each light):
  - *Inventory Validation* &mdash; auto-runs the prior-period
    unposted-batches check on `accountRows[]` across the
    current filter scope (Step 1 of the runbook), then walks
    the roll-forward chain looking for old un-posted batches
    or carry-forward breaks (Step 2). Recommended action is
    derived from the production runbook's decision table:
    post-batches-in-JDE / R099102-proof-mode / admin Reroll by
    Company / escalate-rrsupport. Action buttons compose mailtos
    matching the canonical Scenarios/ originals.
  - *System Status* &mdash; reads `data/system-status-log.json`
    (lazy-loaded; production SQL Agent step-log shape) and
    surfaces: Step 1 Recent cycles table, Step 2 Latest cycle
    breakdown (every step row that sums to the cycle's total
    runtime &mdash; "the entries that make up the lag"),
    Step 3 Pattern detection (step duration anomalies vs.
    median across complete cycles). Light is RED when the
    latest cycle errored / partial, OR any cycle in the window
    errored / partial, OR there are slow-step anomalies.
    Recommended action mirrors the analyzer's findings
    semantics (SQL error code, partial-cycle escalation, or
    performance review).
- **Excel exports** (SheetJS from CDN, deferred load):
  - *Audit Report* &rarr; multi-sheet workbook (Summary / By Company
    / By Account / History / Filters) &mdash; everything respects
    the current filter view.
  - *Journal Entry* &rarr; one-sheet JE batch with debit / credit
    rows per non-zero variance component.
  - *Inventory Validation light* &rarr; roll-forward-chain +
    variance-components diagnostic (download button inside the
    runbook drawer).
  - *System Status light* &rarr; production SQL Agent step-log
    shape (single sheet: banner row, then Capture / Step /
    Process / StartTime / EndTime / Seconds / UpdateCount /
    ErrorNum columns, then data rows verbatim from the loaded
    log). Filename `SystemStatus_<stamp>.xlsx`. Dropping the
    file into `Tools/analysis-workbook.html` triggers the
    analyzer's `SystemStatusTemplate` cleanly &mdash; the
    runbook hop is end-to-end.
  - *Pending Close Items rows* &rarr; per-bucket detail report.
- **Bottom row &mdash; three reconciliation widgets**:
  - *OOB History* (trend, filtered) &mdash; gradient area fill,
    dashed gridlines, vertical hover guide + floating navy
    tooltip showing period + OOB value on mouseover.
  - *By Business Unit* (clickable contributor bars; click a row to
    narrow the BusinessUnit filter to that BU; click again to
    restore All). **Replaced the prior Pending Close Items panel**
    because all four pending buckets lacked captured SQL sources.
  - *By Inventory Account* (same pattern but narrows the Object
    filter).
- **User menu** (click the user chip in the top bar) holds the
  identity block + database switcher + admin-gated actions (Import
  JDE data, Restart Service, Sign out). Mirrors the live SPA&rsquo;s
  sidebar-top panel but consolidated under the avatar so the
  sidebar stays nav + filters + status. Database switcher and admin
  actions are placeholders &mdash; real permission gating is the
  handoff team&rsquo;s concern.
- **Toast feedback** for every placeholder button: refresh, Journal
  Entry, Audit Report, Restart Service, Import JDE data, sidebar
  nav items that aren&rsquo;t built yet, variance step previews,
  fullscreen / notifications / help icons, context-help FAB. The
  page feels alive even when actions are stubs.
- **Hub link**: the V8 preview is linked from the hub&rsquo;s
  *Demos* section (`rapidreconciler-hub.html`), internal-only.
- **Out-of-balance history chart** redraws from JSON with min/max/zero
  axis labels and a current-period emphasis on the last point. Stats
  (Current / 12-mo high / 12-mo low / Avg) computed in JS.
- **SQL reference library**: 21 sproc DDL files in `sprocs/`, 23 view DDL
  files in `views/`. Captured via `sp_helptext` against `RapidReconciler_Dev`.
- **Variance breakdown is a vertical reconciliation statement**
  (not a horizontal row of cards). Each component (Carry Forward,
  GL Batches, End of Day, Transactions, Cardex, Manual JEs) is a
  table row showing label + subtitle (e.g. "F0911 to F4111
  discrepancies"), signed Amount column (parens + red for
  negatives), Running balance column (cumulative through the
  components), and a persistent actions column with Preview /
  Excel icons. Zero-value rows get muted styling so the analyst's
  eye drops straight to the components that moved. Total row at
  the bottom is a navy gradient bar with the orange "Unreconciled
  variance" label and the value in the Running-balance column.
  Built for the finance / cost-accounting audience.
- **Transactions sign convention**: Transactions is stored in
  `accountRows[].variance.transactions` with the magnitude of the
  F0911-to-F4111 effect, but in the variance math it SUBTRACTS
  from out-of-balance. `computeFilteredView` applies a sign
  multiplier via `VARIANCE_SIGN = { transactions: -1 }` at the
  aggregation step so every downstream consumer (variance table,
  Carry Forward preview, audit report, JE export) gets the
  properly-signed value and the sum of components equals the
  total. The per-row data is unchanged; the convention is declared
  in one place.
- **Carry Forward preview**: clicking the Preview icon on Carry
  Forward opens the modal in a special mode &mdash; instead of a
  table it shows a compact "VARIANCE CALCULATION" card
  (label-amount-per-row + orange-bar total) showing the **prior
  period's variance breakdown**, scoped through the current
  sidebar filters. No Excel export for this one (the prior-period
  breakdown is already a derived view, not transactional data).
  On the earliest period the modal shows an explicit empty state.
- **Sidebar pin**: a pin button in the brand bar (visible on
  hover) toggles `body.has-pinned-sidebar`. When pinned, the
  sidebar locks at 240px AND the `.app` grid column shifts to
  240px so the main content moves right (instead of the sidebar
  floating over it). State persists via `rrv8-sidebar-pinned-v1`
  in localStorage, hydrated at the top of the IIFE before paint
  to avoid a flash of unpinned state. Distinct from the existing
  transient `.is-pinned` class used by popovers.
- **Audit report**: production-style "Perpetual Inventory
  Reconciliation" workbook. Built by a chain of sprocs in the
  legacy SPA (`usp6getrinvaccountsummaryreports`,
  `usp6getrunpostedbatches`, `usp6getrunpostedcardex`,
  `usp6getjournalentries`, `usp6getrcardexledgercompare`,
  `usp6getrperpetualinv`), each a thin wrapper around
  `usp6getfilteredview` with a `@viewname` parameter. V8 reads the
  same underlying views straight out of the snapshot.

  Data layout:
  - `reconciliation.json`: small audit-only arrays inline &mdash;
    `accountSummary` (247 rows, from `v6ui_accountsummaryreport`),
    `unpostedBatchesUi` (empty in dev, from `v6ui_unposted_batches`),
    `unpostedCardexUi` (16 rows, from `v6ui_unposted_cardex`),
    `accountDescriptions` (15 rows, from `v6ui_getaccounts` for
    the per-account headers like "Raw Material - Col Concentrate").
  - `data/audit-report-detail.json` (7.4 MB): heavy arrays loaded
    on first audit-report click &mdash; `reconcilingItems` (14,915
    rows across all periods, from `v6ui_reconcilingitems`, analyst
    notes preserved) and `perpetual` (19,235 rows filtered to QOH
    &ne; 0, joined from `v6_006_perpetual` + `ritems` + `F4101`
    for item descriptions). Cached in `_auditDetailCache` after
    the first fetch so subsequent runs are instant.

  Output: **one tab per company** (improvement over the legacy
  app's one-company-per-file pattern). Tab names like `00900 - USD`,
  `00050 - GBP`. Each tab follows the production layout verbatim:
  - 5-row cover (Title / Currency Code / Period Ends / Prepared /
    Prepared by &lt;email&gt; (&lt;db&gt;))
  - "Account Summary" header + table (Account / GL Balance /
    Perpetual Balance / Out of Balance) + bolded total row
  - Per-account sections in longAccount order:
    - Account header: `<longAccount> - <description>`
    - "Accounts Summary" sub-section: G/L Balance, Perpetual,
      Variance + the six variance components + Unreconciled
      Variance (bolded total)
    - "Unposted GL Batches" (or "All batches posted...")
    - "End Of Day" (or "All inventory transactions were...")
    - "Journal Entries" (Doc No / Doc Type / User / Amount + total)
    - "Variances" (8-column transactional table, 3-row-per-entry
      with `Note:` and analyst markup preserved)
    - "Perpetual Details" (Branch / Item Number / Description /
      UM / QOH / Amount on Hand + total)
    - `---------------------------------------------` separator
  - All amount columns use the `$#,##0.00;($#,##0.00);-` format;
    QOH uses `#,##0.00;(#,##0.00);-`. Section + sub-section
    headers are bolded; table-header rows have a light-gray
    (`#D4D0C8`) fill. Title row is bold Calibri 14.

  Filename pattern: `PerpetualInventoryReconciliation_<period>_<stamp>.xlsx`.
  Sidebar filters (Company, Object, BU, Subsidiary, Currency)
  flow through &mdash; deselected companies skip their tab; any
  long account that doesn't pass `rowMatchesFilters` is dropped
  from that company's tab.

- **Context help**: two affordances now point at reference material:
  - **Reference guide chip** next to the page title links straight to
    `../RRUniversity/inventory-reconciliation.html` (the customer-
    facing KB doc) in a new tab.
  - **Help FAB** (bottom-right floating button) opens a two-column
    glossary modal: variance-component definitions (with JDE
    table refs) on the left, common workflows on the right
    (Investigating an OOB period / Reading the Audit Report /
    Handling Cardex / Handling End of Day). Footer carries links
    to the same University doc and the Help Desk page. ESC,
    backdrop, or X dismisses. Static content &mdash; finance
    audience asked for *"what does this term mean again?"* not
    a contextual deep-dive.

- **Audit Report PDF**: companion to the Excel export, same data
  + same filter chain via `ensureAuditDetail()`. Built with
  **jsPDF + jspdf-autotable** loaded from CDN. The page header
  has two side-by-side buttons (*Audit Report &middot; Excel* and
  *Audit Report &middot; PDF*) so the analyst picks the format
  explicitly.

  Layout: Letter portrait. One company per page break (so each
  company's cover starts on a fresh page). Inside a company,
  `autoTable` handles intra-table pagination + repeating headers
  on every page automatically. Sections render in the same order
  as the Excel (cover &rarr; Account Summary table &rarr;
  per-account Accounts Summary / Unposted GL Batches / End Of Day
  / Journal Entries / Variances / Perpetual Details). For
  Variances, each row's analyst Note is rendered as an italic
  full-row `colSpan` line directly beneath its data row so the
  audit trail stays intact.

  Each page carries a small footer: `Generated <full timestamp>`
  on the left and `Page X of Y` on the right. Number formatting
  matches the Excel: `$#,##0.00` (parens for negatives) for
  amounts, `#,##0.00` for QOH. Filename pattern:
  `PerpetualInventoryReconciliation_<period>_<stamp>.pdf`.
- **Variance-step Preview pane + Excel exports**: each preview-bearing
  variance step (GL Batches, End of Day, Cardex, Manual JEs) has a
  Preview icon **and** a download icon under it. Both respect the
  current period + sidebar filters. **All four components are now
  backed by real SQL views:**
  - **GL Batches &rarr; `v6_007_unpostedbatches`** &mdash; per-batch
    rows with approval + post status. Snapshot carries an empty
    array today (no un-posted batches in dev DB).
  - **End of Day &rarr; `v6_006_unposted_cardex`** &mdash; un-posted
    cardex transactions. Snapshot carries 16 real rows spanning
    2015-07-04 through 2015-12-31 from the dev DB.
  - **Manual JEs &rarr; `v6ui_manual_entries`** &mdash; per-doc
    manual journal entries joined to inventory accounts. Snapshot
    carries 241 real rows spanning 2015-10-03 through 2016-08-27.
  - **Cardex &rarr; `v6ui_itemrollintegritydialog`** &mdash; per-item
    integrity issues where the perpetual valuation doesn&rsquo;t
    roll cleanly. **The view has no PeriodEnds column** &mdash; it&rsquo;s
    a current-state report, not period-historical, so the
    drilldown shows the same rows regardless of which period is
    selected. Only the sidebar Company / Object / BU / Subsidiary
    filters narrow it. Snapshot carries 783 real rows from the dev
    DB (2 reasons: Amount / Quantity; 2 companies; 15 long
    accounts). This is reflected in `filterViewBackedRows` via the
    `requirePeriod: false` option.

  The Excel exports for view-backed components match the production
  report layout: merged title row across all data columns
  ("Unposted GL Batches Generated &lt;timestamp&gt;", "Manual Journal
  Entries Generated &lt;timestamp&gt;", "Item Roll Integrity Generated
  &lt;timestamp&gt;"), light-gray header row, per-row PeriodEnds
  where applicable, no separate metadata block. Currency + Rate
  columns from the production exports are intentionally skipped
  until we capture an FX source. Filename pattern:
  `<ReportName>_<period?>_<stamp>.xlsx` (cardex omits period since
  the report is period-independent).

  **Preview pane** (V8's first modal): clicking the Preview icon
  opens a centered card with a sticky-header scrollable table that
  mirrors the Excel column shape for that component. Header shows
  component label + source view chip + scope summary; footer has
  "Close" and "Export to Excel" (calls `generateVarianceExcel`).
  ESC, backdrop click, or the X button dismisses. If the user
  switches the period or narrows filters while the modal is open,
  the table re-renders in place via `_renderAllInner`.

  Bindings declared in `_meta.drilldownSources`. The shared filter
  chain (`filterViewBackedRows(arrayKey, amountField, { requirePeriod })`)
  routes any view-backed array through the current period (when the
  source has one) + selected companies + the set of long accounts
  resolved from the sidebar filters &mdash; so Company / Object /
  Business Unit / Subsidiary / Currency narrowing flows through both
  Preview and Excel identically to the hero stats.
- **API.md**: documents the current `reconciliation-filtered` JSON shape
  and proposes a cleaner V8 shape.

**What&rsquo;s NOT wired yet**

- Admin actions in the user menu (Import JDE, Restart Service) flash
  a toast but don&rsquo;t do anything. Database switcher updates the
  user-chip label but doesn&rsquo;t actually re-fetch from a
  different DB &mdash; the snapshot path is hard-coded.
- All four variance-component view bindings are now wired
  (`glBatches`, `endOfDay`, `manualJournalEntries`, `cardex`).
  Carry Forward (rollover, no drilldown) and Transactions (its own
  dedicated page) are the only components without a Preview pane.
- Permission gating: the user menu shows all admin actions; in
  production the auth/role layer hides what the user can&rsquo;t do.
  Handoff concern.
- The capture-periods script (`scripts/capture-periods.ps1`) isn&rsquo;t
  built yet. Recapturing data today is the sqlcmd `FOR JSON PATH`
  one-liner + small Python reshape from *How to capture* below.
  The script becomes the right investment once we have a second
  page (Transactions, etc.) that needs the same flow.
- No other pages yet (Transactions, As Of, Roll Forward, Integrity, In
  Transit, PO Receipts).
- No optimization pass on the captured sprocs / views.
- `RRV8/views/v6ui_reconfiledata.sql` is captured but the view itself
  is dead in production (intended for a process that never shipped).
  Leave it in the library for archaeology; the actual data source
  is `v6ui_raccountsummary` (wrapped by `usp6getrinvaccountsummary`).

---

## How to preview locally

The repo&rsquo;s static server (`.claude/serve.ps1`) is the only
prerequisite. From a PowerShell window:

```powershell
cd C:\source\repos\RapidReconciler-UI
.\.claude\serve.ps1
```

Leave that window open (closing it stops the server; Ctrl-C stops
it cleanly). Then in a browser:

```
http://localhost:8765/RRV8/inventory-reconciliation.html
```

The page reads `data/reconciliation.json` via `fetch` on load and
keeps the whole dataset in memory. Hard-refresh after editing the
page or the JSON. Period switching is in-memory (no re-fetch);
the top-bar Refresh button re-fetches the snapshot.

---

## How to add a new page

The page-per-page pattern is &mdash; copy `inventory-reconciliation.html`
to a new filename, then:

0. **Page header — V8 standard (don't deviate).** The header layout
   is fixed across all main pages:
   ```html
   <div class="page-header">
     <div class="page-header-left">
       <div class="breadcrumb">...</div>
       <div class="title-row">
         <h1 class="page-title">
           <a class="page-title-link"
              href="../RRUniversity/<your-page>.html"
              target="_blank" rel="noopener">
             <Your Page Title>
             <svg class="page-title-ext-icon" ...>↗</svg>
           </a>
         </h1>
         <button class="period-pill" ...>...</button>  <!-- omit on pages without a period -->
       </div>
     </div>
     <div class="page-actions">
       <!-- audit-report or other module-level action buttons -->
     </div>
   </div>
   ```
   The title itself IS the reference-guide link; no separate
   "Reference guide" pill. Period pill goes to the right of the
   title (drop it entirely on PO Receipts and other non-period
   pages). Audit / action buttons hug the right edge of the page
   header. No subtitle &mdash; the period pill already says
   "which period," so a "Period ending..." subtitle is redundant.
1. **Hero stat**: change the headline metric and the two side-stat
   labels.
2. **Variance / breakdown panel**: change the `data-component`
   attributes on each `<div class="variance-step">` to match the JSON
   keys for the new page&rsquo;s breakdown.
3. **History chart**: structure is the same &mdash; only the data
   array changes.
4. **Sidebar filters**: update each `<button class="sidebar-filter">`&rsquo;s
   `data-filter` attribute + label to match what the new page filters
   on. The JS reads `data.filter[<group>]` for the popover contents
   and `data.accountRows[].<dimension>` for row-level matching.
5. **Capture a snapshot**: see the capture workflow below. Save as
   `data/<area>.json` (single file covers every period for that
   area).
6. **Update `DATA_FILE`** in the page script to point at the new
   snapshot filename.
7. **Update `WORKFLOW.md`**: add the new page to the *Current state
   checkpoint* list.

The script tag at the bottom of the file is self-contained &mdash; it
loads `data/<file>` once, then period switching, filter changes, and
all the recompute logic happens in-memory off the loaded
`accountRows`. Most of the JS is generic and works across pages
with no edits.

---

## How to capture period snapshots

All 13 periods for Inventory > Reconciliation are currently captured
in `data/reconciliation.json` (195 rows). To refresh that file:

### Path A &mdash; sqlcmd one-liner (current method)

```bash
SQLCMD='/c/Program Files/Microsoft SQL Server/Client SDK/ODBC/170/Tools/Binn/sqlcmd'
PW=$(cat "$USERPROFILE/.rr-sql-pwd")

"$SQLCMD" -S localhost -U rruser -P "$PW" -d RapidReconciler_Dev -y 0 \
  -Q "SET NOCOUNT ON; SELECT * FROM v6ui_raccountsummary ORDER BY PeriodEnds, CompanyNumber, ObjectAccount, SubAccount FOR JSON PATH" \
  > .tmp-raw.json
```

Then a small Python reshape script trims whitespace, converts the
scientific-notation numbers, and emits the V8 shape (`accountRows`
array + preserved `_meta` / `validation` / `filter` / `pending` blocks).
See git history of `RRV8/data/reconciliation.json` for the reshape
recipe; it&rsquo;s also the seed for the future
`scripts/capture-periods.ps1` (PowerShell port of the same flow).

### Path B &mdash; SQL/PowerShell script (planned)

**Not built yet.** Will live at `RRV8/scripts/capture-periods.ps1`.
Same `FOR JSON PATH` + reshape pattern, but wrapped so a future
session can run one command per page (`-Area reconciliation`,
`-Area transactions`, etc.) instead of remembering the SQL.

### Path C &mdash; Browser-side DevTools dump (legacy fallback)

If the dev-box DB is unavailable, the live staging SPA at
`staging-rr-spa.azurewebsites.net` can be dumped manually via
DevTools &rarr; Network &rarr; right-click the
`reconciliation-filtered` row &rarr; *Save as* &rarr; *response*.
That gives the old per-period response shape; you&rsquo;d still
need a reshape pass to merge multiple periods into the V8
`accountRows` shape. Not recommended &mdash; Path A is faster and
gives row-level data.

---

## How to refresh sproc / view DDL

When a sproc or view changes upstream, re-pull its DDL into the V8
library so optimization work has a current target.

```bash
SQLCMD='/c/Program Files/Microsoft SQL Server/Client SDK/ODBC/170/Tools/Binn/sqlcmd'
PW=$(cat "$USERPROFILE/.rr-sql-pwd")
NAME='usp6getrinvaccountsummary'   # or v6ui_raccountsummary, etc.
KIND='sprocs'                      # or 'views'

"$SQLCMD" -S localhost -U rruser -P "$PW" -d 'RapidReconciler_Dev' -h -1 -W -k 1 \
  -Q "SET NOCOUNT ON; EXEC sp_helptext 'dbo.$NAME'" \
  > "RRV8/$KIND/$NAME.sql"
```

To pull a batch, loop over a list (see prior commit history for the
candidates we&rsquo;ve pulled).

---

## How to commit

V8 work follows the same flow as the rest of the repo:

1. Work on a worktree branch (`claude/<adjective-name>-<sha>`).
2. Hold commits until a logical chunk is done. Avoid one-commit-per-edit
   churn.
3. When ready: `git commit` &rarr; `git push -u origin <branch>`
   &rarr; `gh pr create` &rarr; `gh pr merge --squash`.
4. After merge, wait for the bot commits (refresh-indices,
   update-doc-dates) to settle.
5. Fast-forward the main clone:
   `git -C "C:/source/repos/RapidReconciler-UI" pull --ff-only origin main`.

V8 commits typically have no `Release-Note:` trailer &mdash; it&rsquo;s
internal staff-facing design work, not customer-facing changes. Once V8
is linked from the hub and visible to internal folks, we&rsquo;ll start
adding release notes for V8 work.

---

## V8 tenets

These are non-negotiable principles that shape every V8 design and
implementation decision. When a tradeoff comes up, the tenet wins.

### Production-only until Inventory is complete

V8 development is **production-only**. Every dynamic value comes from
the live RR data-services agent through `rrFetch`. No new static JSON
snapshots get added under `RRV8/data/`, no `?mode=demo` branches get
extended, no demo-only code paths get written. Demo mode will be
rebuilt as a deliberate pass **after the Inventory module is
complete** &mdash; until then it&rsquo;s frozen, not the dev workflow.

- The committed default in [`RRV8/config.js`](config.js) is
  `mode: 'staging'`. Opening a V8 page in dev hits the local agent at
  `rrtest-rrsqltest.getgsi.com:34536` (hosts-file mapped to 127.0.0.1).
- Every dynamic value goes through `rrFetch(area, opts)`. **No page
  hard-codes `fetch('data/<file>.json')`** for runtime data, and no
  new `opts.demoFile` snapshot mappings get added.
- When V8 needs server data the agent doesn&rsquo;t have, spec it in
  the `RapidReconciler-Agent` repo&rsquo;s `specs/` folder, wire
  `rrFetch` to call the planned path, and let it 404 visibly until
  the controller ships. **Do not add a snapshot to make the page
  paint** &mdash; the visible 404 is the signal that an endpoint is
  missing. See [`feedback_always_spec_new_endpoints`](../../../.claude/projects/C--source-repos-RapidReconciler-UI/memory/feedback_always_spec_new_endpoints.md).
- Existing snapshot files in `RRV8/data/` and existing demo-mode
  fallbacks stay in place (they keep the deployed GitHub Pages
  preview rendering). Don&rsquo;t extend them; don&rsquo;t add new
  ones. Where a page falls back to a snapshot when the live response
  is incomplete (e.g. the cross-period bar-chart history fallback),
  treat it as a server-side gap to spec rather than something to
  paper over.
- TESTING.md tier 7 (demo data shape) is on ice until the demo
  rebuild. Don&rsquo;t prioritize implementing it.
- New endpoints get mined from the agent jar
  (`C:\Program Files\Rapid Reconciler\files\359`) via `javap`. Jackson
  silently drops unknown JSON fields, so field names must come from the
  bytecode, not guesswork. Recipe in
  [`RapidReconciler-Agent/docs/jar-mining.md`](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/docs/jar-mining.md). See also the
  [`reference_rr_agent_jar`](../../../.claude/projects/C--source-repos-RapidReconciler-UI/memory/reference_rr_agent_jar.md)
  memory.
- **Why this is a tenet:** snapshots hide bugs (stale data, Jackson
  field-name mismatches, permission gating, filter-scope errors).
  Maintaining two parallel shapes &mdash; live agent + snapshot
  files &mdash; doubles the surface that silently drifts. Cutting it
  down to one (the agent) makes every wiring bug surface immediately.
  The deferred demo rebuild gets a clean foundation instead of
  accreted dev-time hacks. Saved as
  [`feedback_v8_agent_first`](../../../.claude/projects/C--source-repos-RapidReconciler-UI/memory/feedback_v8_agent_first.md).

### Engine floor SQL 2019; compat level pinned at 140 for V8

Every `.sql` file under `RRV8/sprocs/`, `RRV8/views/`, and
`RRV8/scripts/` &mdash; plus inline SQL in capture scripts and any
sproc the agent calls &mdash; must run at **compat level 140**. Two different
numbers live here and conflating them is the mistake: the supported
**engine** floor is **SQL Server 2019** (owner ruling 2026-08-21), while
the **compatibility level** every database is pinned to is **140**, on
purpose, so the optimizer behaves identically whatever engine the
customer bought. The V8 install + every upgrade runs
`ALTER DATABASE ... SET COMPATIBILITY_LEVEL = 140`, so the
migrated-from-2008 case (which used to keep a stale low compat) no
longer applies. A 2022 engine pinned to 140 is the normal, tested
configuration. Bump the dev DB `RapidReconciler_Dev` to compat 140 so it
keeps catching violations against the new floor.

**Now allowed** (use freely; the old compat-100 workarounds are no
longer needed): `STRING_SPLIT`, `STRING_AGG`, `TRIM`,
`CONCAT`/`CONCAT_WS`, `IIF`, `OFFSET/FETCH NEXT`,
`TRY_CAST`/`TRY_CONVERT`/`TRY_PARSE`, `LAG`/`LEAD`/`FIRST_VALUE`,
`SUM(x) OVER (ORDER BY y)` cumulative, JSON (`OPENJSON`, `JSON_VALUE`,
`FOR JSON`), `CREATE OR ALTER`, `DROP ... IF EXISTS`,
`SESSION_CONTEXT()`.

**Still avoid** (all of these are **SQL 2022** features, above the
pinned level of 140 &mdash; not above the SQL 2019 engine floor):
`GREATEST`/`LEAST`, `GENERATE_SERIES`, `STRING_SPLIT(..., enable_ordinal)`,
`DATE_BUCKET`, native `json` data type, `APPROX_PERCENTILE_*`.

Measured 2026-08-22 on a real 2019 engine: `GREATEST`, `LEAST` and
`DATE_BUCKET` are rejected **at CREATE time** (Msg 195) and 3-argument
`STRING_SPLIT` with Msg 8144, so a dacpac publish at the floor catches
them on its own. **`GENERATE_SERIES` does not behave that way** &mdash;
it is table-valued, deferred name resolution lets it CREATE cleanly, and
it fails only when the procedure runs (Msg 208). The source grep in
`RapidReconciler-DB/Tools/check_compat_floor.py` is the only gate that
catches that class.

Full table + reasoning in
[`feedback_sql_compat_floor`](../../../.claude/projects/C--source-repos-RapidReconciler-UI/memory/feedback_sql_compat_floor.md).

### Finance, not IT

V8 pages serve **accountants and finance analysts**, not IT. No SQL
view names, sproc names, agent endpoint paths, or other RR plumbing in
user-facing strings (eyebrows, tooltips, hero labels, banner copy,
Excel export banners). JDE-domain references the analyst already
speaks (F4111, F0911, F4101, F41021, DMAAI, AAI, R31802A, GL,
perpetual, cardex, period close) stay &mdash; they&rsquo;re domain
language, not jargon. Code comments are exempt; the rule is about
user-visible text. Saved as
[`feedback_v8_audience_finance_not_it`](../../../.claude/projects/C--source-repos-RapidReconciler-UI/memory/feedback_v8_audience_finance_not_it.md).

---

## Data hygiene reminders

- **No real customer data.** The Acme test-instance numbers are
  fictional. Real customer account numbers, doc numbers, branch / company
  numbers, or customer names from production never go into committed
  files.
- **No credentials in committed files.** The dev-box SQL password lives
  in `$env:USERPROFILE\.rr-sql-pwd` &mdash; that file is outside the
  repo. Scripts in `RRV8/scripts/` read it at run time, never embed it.
- **Customer-named schema objects.** The live DB has a few `v6_008a_*`
  view names that bake in a real customer name (one known instance &mdash;
  a producing-plant customization). Don&rsquo;t pull their DDL into
  `RRV8/views/` without sanitizing the filename + contents.

---

## Open questions / next steps

| | What | Who decides |
|---|---|---|
| Soon | Build `scripts/capture-periods.ps1` (Path A → PowerShell port) so future pages don&rsquo;t need a re-derived sqlcmd one-liner | tooling task |
| Soon | Mockup of the second page (Transactions? As Of?) &mdash; pick which | design call |
| Medium | Variance step *Preview* modals (drill to underlying transactions per component) | design + tooling |
| Medium | Optimization pass on the captured sprocs/views | engineering |
| Medium | Real backend wiring (replace `accountRows` synthesis with API; admin actions; DB switcher; permission gating) | handoff team |
| Later | Promote V8 from the hub *Demos* section to *Internal Workflows* when there are 3+ pages | hub edit |
| Later | Decide V8&rsquo;s eventual hosting story (still GitHub Pages? Static Web App + Functions? Replace prod?) | strategic call |

---

## Useful references

- `RRV8/API.md` &mdash; current vs proposed JSON shape for the
  reconciliation endpoint
- `Tools/queries/transaction-detail-workflow.ps1` &mdash; reference
  pattern for the SQL-auth-via-password-file convention V8 scripts will
  use
- `CLAUDE.md` at repo root &mdash; project-wide conventions (link rules,
  data hygiene, commit workflow)
- The live SPA at `staging-rr-spa.azurewebsites.net` &mdash; source of
  truth for what we&rsquo;re modernizing away from
