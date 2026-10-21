# RRV8 &mdash; automated test plan

Specification for the V8 test suite. Everything here is automation-only
&mdash; no &ldquo;open the page and look&rdquo; steps. Designed to run
on every push (local pre-push hook + GitHub Actions on PRs) so V8
stays healthy as the surface grows.

This document defines **what** to check and **why**. The companion
scripts that implement each category live under
`RRV8/scripts/tests/` (TBD when the suite is built; this doc is the
contract).

---

## Goals

1. **Catch regressions before they ship.** A bad selector, a stale
   demo file path, a forbidden SQL token &mdash; all fail the suite
   instead of failing in front of the analyst.
2. **Zero manual interaction.** Suite is runnable by a script and a
   CI runner. No tester clicks anything.
3. **Stay current.** Hooked into the commit flow so the same gate
   runs locally before push and again in CI before merge.
4. **Fast.** Every check should finish in seconds. Slow checks get
   skipped by default and run on a nightly schedule.

---

## Scope

- **`RRV8/`** is the target. Customer-facing pages outside `RRV8/`
  (RR University, Help Desk, etc.) are out of scope; they have their
  own conventions and aren&rsquo;t agent-wired.
- **Static surface**: HTML, CSS, JS, JSON snapshots, SQL DDL captures.
- **No browser**: every check parses or greps source files. The
  broken MCP-preview situation from earlier sessions is a hint that
  browser-driven tests are too fragile to gate commits.

---

## Categories

The checks below are grouped by what they protect. Each category lists
the rule, the failure signal, and the source of truth.

### 1. Syntactic

Cheap, deterministic checks. These catch &ldquo;the page won&rsquo;t
load&rdquo; bugs before anyone hits F5.

| Check | What it verifies | Failure example |
|---|---|---|
| **HTML parse** | Every `RRV8/*.html` parses as well-formed HTML5 (no unclosed tags, balanced quoting). | `inventory-asof.html: unclosed <div> at line 1240` |
| **Inline JS parse** | Every `<script>` block inside an `RRV8/*.html` file parses as valid ES2017 (acorn or equivalent). | `inventory-asof.html: SyntaxError: Unexpected token ')' at line 2873` |
| **External JS parse** | `RRV8/sidebar.js`, `RRV8/period-bars.js`, `RRV8/config.js` parse as ES2017. | `sidebar.js: Unexpected token` |
| **CSS parse** | `RRV8/sidebar.css`, `RRV8/period-bars.css`, etc. parse without errors (postcss or csstree). | `sidebar.css: Unexpected '}' at line 232` |
| **JSON parse** | Every file under `RRV8/data/*.json` is valid JSON. | `reconciliation.json: invalid JSON near offset 12420` |

**Source of truth**: parsers themselves &mdash; if they choke, the
browser will too.

### 2. Reference integrity

Catches dangling links, stale demo file paths, broken vendor refs.

| Check | What it verifies |
|---|---|
| **`<link href>` and `<script src>`** | Every same-repo asset referenced from an `RRV8/*.html` file actually exists on disk. CDN / `http(s)://` URLs are skipped. |
| **`<img src>` and SVG `xlink:href`** | Same as above for images and icon sprites. |
| **`href="../RRUniversity/…"` reference-guide links** | The customer-facing doc the V8 page-title links to exists. (Catches stale references when a customer doc gets renamed.) |
| **`rrFetch(area, opts)` demo file mapping** | When `opts.demoFile` is supplied, the file `RRV8/data/<demoFile>.json` exists. When omitted, `RRV8/data/<area>.json` is checked. |
| **Home / workbar nav links** | Every internal nav target (Home&rsquo;s role-lane rows, the workbar links) either points at a real V8 page (`*.html`) OR is `href="#"` (intentional placeholder). No dangling internal hrefs. Catches a card repointed at a renamed/never-built page. |

**Source of truth**: the filesystem.

### 3. V8 convention enforcement

Catches drift from the standards documented in
[`RRV8/WORKFLOW.md`](WORKFLOW.md), [`RRV8/GRID-STANDARDS.md`](GRID-STANDARDS.md),
and the V8 tenets section of WORKFLOW.md.

| Check | Rule | Source of truth |
|---|---|---|
| **Workbar mount** | Every V8 page calls `window.RRV8.mountWorkbar({…})` exactly once (the left rail was retired in the Phase-3 access-flow work &mdash; `mountSidebar` is gone). A working/inventory page passes `activePage`, one of the known values (`reconciliation`, `transactions`, `asof`, `cardex-variance`, `dmaais`, `model-review`); standalone admin pages (`admin-*.html`) and `home`/`login` mount it without `activePage`, typically `{manageUser:true, nav:false}`. | sidebar.js `mountWorkbar` + each page&rsquo;s boot section. Memory `project_access_flow_home_workbar`. |
| **Inventory status seed** | Every inventory page calls `window.RRV8.ensureInventoryStatus(rrFetch)` at boot (fire-and-forget). | The shared helper in sidebar.js; documented in API.md. Pages without this call will leave the workbar filter rows showing `—`. |
| **`rrFetch` exists** | Every V8 page defines a top-level `function rrFetch(area, opts)`. | The agent-first tenet: all dynamic data flows through `rrFetch`. |
| **No raw `fetch('data/')`** | No V8 page issues `fetch('data/foo.json')` (or any path starting with `data/`) outside the `rrFetch` helper itself. **Whitelisted**: a small number of cases that are explicitly NOT agent-routed (period-bar chart history, demo-jwt-payload). Maintain the whitelist as comments. | Agent-first tenet. |
| **No raw `fetch('http')`** | No V8 page issues `fetch('http…')` directly. Auth POSTs to the VALC base go through `rrFetch` too (or a tightly-scoped sibling helper). | Agent-first tenet. |
| **localStorage key convention** | Every `localStorage.setItem(...)` call uses a key matching `rrv8-<page>-<feature>-v1` or `rrv8-<feature>-v1` (cross-page) or `rrv8.scope.v1.*` for sessionStorage scope. | GRID-STANDARDS.md &sect;10. |
| **Grid header layout** | Each `*Page.html` with a data grid has the standard `<div class="grid-state-cluster">` wrapping search + Excel pill + Columns pill + row-count pill. | GRID-STANDARDS.md &sect;1&ndash;3. |
| **Grid drag-to-reorder** | Each grid&rsquo;s thead row has `<th draggable="true" data-col-key="…">` and the `wireColumnDrag()` IIFE function. | GRID-STANDARDS.md &sect;6. |
| **Grid click-to-sort** | Same row carries the click handler from `wireColumnSort()`. | GRID-STANDARDS.md &sect;7. |
| **Grid search debounce** | `wireGridSearch()` defined; uses a `setTimeout` with ~150ms debounce. | GRID-STANDARDS.md &sect;8. |
| **Per-column funnel filter** | Grids that opt in carry `data-action="filter-col"` buttons in their thead. | GRID-STANDARDS.md &sect;9. |

**Source of truth**: the markdown specs themselves.

### 4. Finance-not-IT tenet

Catches plumbing language leaking into user-visible strings.

| Check | Rule | False-positive guard |
|---|---|---|
| **No SQL view names** | User-visible strings don&rsquo;t contain `v6ui_…`, `v6_006_…`, `v6_007_…`, `vcr_…`, `v_diagnostic5_…`. JDE-domain table refs (`F4111`, `F0911`, `F4101`, `F41021`) stay &mdash; those are finance language. | Code comments (`/* ... */`, `// ...`) and JS variable names are excluded. The check targets HTML text nodes, `title=`/`aria-label=` attributes, and JS string literals that aren&rsquo;t comments. |
| **No sproc names** | No `usp6…` in user-visible strings. | Same scope. |
| **No agent endpoint paths** | No `/inventory/…`, `/in-transit/…`, `/po-receipts/…`, `/roll-forward/…`, `/system-status` in user-visible strings. (These are fine in the code that calls them; not fine in text the analyst reads.) | Same scope. Also exclude the API.md doc itself, which legitimately documents these. |
| **No retired tier language** | No `Tier 1`, `Tier 2`, `Tier 3` in any V8 file (HTML, JS, CSS, MD). | CLAUDE.md root rule; applies to the whole repo, but this suite enforces it on `RRV8/` since the rest of the repo has its own checks. |

**Source of truth**: the finance-not-IT memory + CLAUDE.md.

### 5. SQL compat-140 floor

Catches modern T-SQL syntax that doesn&rsquo;t belong in the
`RRV8/sprocs/` and `RRV8/views/` captures. The **engine** floor is **SQL Server 2019** and the
**compatibility level** is pinned at **140** &mdash; two different
numbers, on purpose. The V8 install/upgrade runs
`ALTER DATABASE … SET COMPATIBILITY_LEVEL = 140`. Every token below is a
**SQL 2022** feature, forbidden because it sits above the pinned level,
not because of the engine floor.

| Forbidden token | Why |
|---|---|
| `\bGREATEST\s*\(`, `\bLEAST\s*\(` | SQL 2022. Msg 195 at the floor, **at CREATE time**. Use `CASE WHEN`. |
| `\bGENERATE_SERIES\s*\(` | SQL 2022, and the dangerous one: it is table-valued, so it CREATEs cleanly at the floor and fails only when executed (Msg 208). This grep is the only gate that catches it. Use a numbers table or recursive CTE. |
| `\bSTRING_SPLIT\s*\([^)]*,\s*[^)]*\)` with the 3rd `enable_ordinal` arg | SQL 2022 &mdash; the ordinal overload only. Msg 8144 at CREATE time. Plain 2-arg `STRING_SPLIT` is fine. |
| `\bDATE_BUCKET\s*\(` | SQL 2022. Msg 195 at CREATE time. Compute manually. |
| native `json` type (column/param `\bjson\b` type, not the functions) | SQL 2022. Use `nvarchar(max)` + the JSON functions. |

**Now allowed at the 140 floor** (do NOT flag these &mdash; they were
forbidden under the old compat-100 floor): `TRIM`, `STRING_AGG`,
`STRING_SPLIT` (2-arg), `CONCAT`/`CONCAT_WS`, `IIF`, `OFFSET/FETCH`,
`TRY_CAST`/`TRY_CONVERT`, `SUM() OVER (ORDER BY)` cumulative, JSON
functions (`ISJSON`/`JSON_VALUE`/`JSON_QUERY`/`OPENJSON`),
`CREATE OR ALTER`, `DROP … IF EXISTS`.

**Source of truth**: [`feedback_sql_compat_floor`](../../../.claude/projects/C--source-repos-RapidReconciler-AI/memory/feedback_sql_compat_floor.md)
+ the workspace `CLAUDE.md` SQL-floor section.

### 6. Data-hygiene tenets

Catches credentials, secrets, and explicit no-no patterns.

| Check | Rule |
|---|---|
| **No connection strings** | Source files contain no `Server=…;Database=…;User Id=…;Password=…;` patterns. |
| **No JWT secrets** | No `JWT_SECRET`, `signing_key`, `private_key` literal assignments. |
| **No bearer tokens** | No `Authorization: Bearer <hex>` literals (the legitimate ones are constructed at runtime from `RR_SESSION.token`). |
| **No real customer names** | The repo is public on GitHub. The customer-name detector grepss for a small list (maintained as a JSON file outside the repo; the suite reads it via env var pointing at a local-only path or skips this check when the list isn&rsquo;t present). |
| **No `.env` or `.rr-sql-pwd`** | Confirm `.gitignore` covers them; confirm no occurrences of them in tracked files. |

**Source of truth**: CLAUDE.md data-hygiene section.

### 7. Demo data shape

Catches drift between a demo snapshot and the page that consumes it.

| Check | Rule |
|---|---|
| **`as-of.json`** | Has `_meta.period`, `rows[]`. Each row has at minimum `CompanyNumber`, `Branch`, `ItemNumber`, `UOM`, `GLClass`, `Quantity`, `Amount`. |
| **`reconciliation.json`** | Has `accountRows[]`, `accountSummary[]`, `filter`, `_meta`. Each `accountRow` has `period`, `companyId`, `longAccount`, `glBalance`, `perpetualBalance`, `outOfBalance`, `variance.{carryForward,glBatches,endOfDay,transactions,cardex,manualJournalEntries,unreconciledVariance}`. |
| **`transactions.json`** | Has `data[]` or `rows[]` envelope; each row has `CompanyNumber`, `InventoryAccount`, `OrderType`, `DocType`, `DocNumber`. |
| **`inventory-status.json`** | Has `reconciliationFilter.{currencies,companies,businessUnits,objects,subsidiaries}` and `validation`. |
| **`available-periods.json`** | Has `periods[]` (or top-level array) and `defaultPeriod`. |
| **`v-integrity-jde-aais.json`** | Has `data[]` envelope with DMAAI rows. |
| **`dmaai-analysis-latest.json`** | Has `_meta`, `fixFirst[]`, `askCustomer[]`, `modules[]`. |
| **`work-notes.json`** | Has `data[]` of `WorkNote` rows with the composite PK fields. |
| **`audit-report-detail.json`** | Has `reconcilingItems[]` and `perpetual[]`. |
| **`system-status-log.json`** | Has `_meta`, `banner`, `columns[]`, `rows[]`, `currentJob`. |

**Source of truth**: each page&rsquo;s consumer code.

### 8. Cross-file consistency

Catches drift between docs and code.

| Check | Rule |
|---|---|
| **API.md endpoint catalog** | Every endpoint mentioned in API.md&rsquo;s catalog table (`POST /inventory/...`) appears in at least one V8 page&rsquo;s `rrFetch` call OR is in a clearly-marked &ldquo;not yet wired&rdquo; / &ldquo;Planned&rdquo; section. Catches stale catalog rows after refactors. |
| **GRID-STANDARDS coverage matrix** | The &ldquo;Pages applying this standard&rdquo; table in `GRID-STANDARDS.md` lists every V8 page that renders a grid. Catches pages added without updating the doc. |
| **Memory references in V8 docs** | Every `[[memory-name]]` link in `RRV8/*.md` resolves to a file under `~/.claude/projects/.../memory/` (so the link works in tooling that follows them). Soft-fail: warn but don&rsquo;t block. |

**Source of truth**: the docs themselves.

---

## Integration with the commit flow

### Local pre-push hook

Runs Tier 1&ndash;6 only (the fast ones). Tier 7 (demo data shape) and
Tier 8 (cross-file consistency) get skipped locally unless `RUN_ALL=1`
is set. Wired via `.git/hooks/pre-push` (script invoked by a one-time
`scripts/install-hooks.ps1`).

```
pwsh ./RRV8/scripts/tests/run.ps1 -Tier 1-6
```

Failure aborts the push with the failing check + file/line. Owner can
override with `git push --no-verify` (already disabled by default per
CLAUDE.md hook policy &mdash; will need an explicit opt-in here).

### GitHub Actions

A new workflow `.github/workflows/v8-test-suite.yml` runs on:

- `push` to any branch matching `claude/**` or `main`
- `pull_request` against `main`, when `RRV8/**` files are touched

Runs **all** tiers including the slower data-shape checks. Required
status check on PRs that touch `RRV8/`. The existing
`refresh-indices.yml`, `update-release-notes.yml`, and
`update-doc-dates.yml` workflows stay independent.

### Reporting

The suite emits a single-page summary in GHA&rsquo;s job log:

```
RRV8 test suite — 87 checks across 8 tiers
  Tier 1 (syntactic)            42 passed
  Tier 2 (reference integrity)  18 passed
  Tier 3 (V8 conventions)       11 passed   1 FAILED
  Tier 4 (finance-not-IT)        4 passed
  Tier 5 (SQL compat-140)        3 passed
  Tier 6 (data hygiene)          5 passed
  Tier 7 (demo data shape)       3 passed
  Tier 8 (cross-file)            1 passed

FAILED:
  Tier 3: inventory-asof.html — missing window.RRV8.ensureInventoryStatus(rrFetch) at boot
    expected: a call to RRV8.ensureInventoryStatus inside the page IIFE
    pattern:  /RRV8\.ensureInventoryStatus\s*\(\s*rrFetch\s*\)/
    nearest match in file: <none>
```

Each failure carries the source rule (link to spec doc), the regex /
matcher used, and where the suite looked. Fixing a failure should never
require digging through suite code.

---

## When to update this plan

When the V8 surface changes in a way that introduces a new convention,
add a row to the relevant table here AND wire a check. Conventions
that aren&rsquo;t machine-checked tend to drift; ones that are
checked stay. Examples that should each become a Tier 3 row when they
land (some already shipped &mdash; convert them to checks rather than
leaving them as prose):

- **Standalone admin tool-page chrome** (shipped): `admin-*.html` pages
  carry the topbar + `.topbar-home` Home link + `<body data-help-src>`
  (the help &ldquo;?&rdquo; circle, injected by `Tools/help-sidebar.js`)
  + the `.app-footer` &ldquo;© 2026 RapidReconciler · GSI Inc. · &lt;ver&gt;&rdquo;
  line. A check would assert all four on every `admin-*.html`.
- **Admin gating** (shipped): admin-only tool pages gate client-side on
  `activeDb().t.adm` and add `body.is-gated` + show the gate notice when
  the signed-in user isn&rsquo;t an admin. The claim has **three** states,
  each with its own answer: `true` opens the page, `false` shows
  `#js-gate` (&ldquo;contact your administrator&rdquo;), and anything else
  &mdash; no session, no tab claims, an older token shape &mdash; shows
  `#js-halt-claim`, because &ldquo;we were never told&rdquo; is not the
  same answer as &ldquo;no&rdquo;. A page whose `sidebar.js` never loaded
  has no claim to read at all, so the boot `else` branch shows
  `#js-halt-asset` instead of booting; it must never call the page&rsquo;s
  start function. A check would assert (a) no `admin-*.html` contains
  `else { startBoot(); }` / `else { startWithSession(); }`, and (b) every
  one carries both halt notices.
- Per-row Export button on new grids
- Headless analyzer template handoff for new export types
- New V8 module page (Integrity, In Transit, PO Receipts)

When a tier-7 demo shape changes (e.g. the agent ships a new field on
`/inventory/status`), update the row here and the demo file in the
same commit.

When the agent surface changes (the new agent expected per the
[`new-agent-incoming`](../../../.claude/projects/C--source-repos-RapidReconciler-AI/memory/project_new_agent_incoming.md)
memory), Tier 2 (`rrFetch` endpoint references) and Tier 8 (API.md
catalog consistency) will likely flag the drift &mdash; that&rsquo;s
the signal to re-mine the jar and update API.md before fixing the
page code.

Note that some V8 admin pages also call **VALC** directly over
`RR_CONFIG.valcBase` (e.g. the Licensing license-usage read and the
`admin-complex-passwords.html` company-password-policy read/write). Those
`/api/v1/admin/**` paths are a separate surface from the agent endpoints
&mdash; a future Tier 2/8 check should resolve them against the VALC
controller catalog, not API.md.

---

## Open questions

| | What | When to decide |
|---|---|---|
| 1 | Pick a runtime: PowerShell, Node, or Python? Owner can&rsquo;t install Python locally per CLAUDE.md, but Python in GHA is fine. PowerShell runs locally on Windows; Node needs a `package.json`. Pragmatic mix: PowerShell for the local hook (Tiers 1&ndash;6), Python in CI (all tiers). | Before building the suite. |
| 2 | Single combined suite or per-tier scripts? Combined is easier to invoke; per-tier is easier to debug. | Build it combined; expose a `-Tier N` filter. |
| 3 | Real-customer-data check &mdash; how to ship the &ldquo;known names&rdquo; list without leaking it into the public repo? Likely: read from `$env:USERPROFILE/.rr-customer-names.txt`, skip the check when the file isn&rsquo;t present. | When implementing Tier 6. |
| 4 | Performance budget &mdash; should the suite track per-page bundle size (JS + inline) and fail if a page balloons past a threshold? Useful as V8 grows. | After the first round of perf complaints (the As Of page already has open perf concerns). |

---

## Out of scope (manual verification)

Listed here so it&rsquo;s explicit that the suite WON&rsquo;T catch
these &mdash; humans still own them:

- Visual layout (alignment, colors, hover states)
- Click-to-narrow filter UX flow
- Popover positioning at viewport edges
- Animation smoothness
- Excel export visual fidelity (number formats render correctly when opened in Excel)
- PDF export visual fidelity
- Real-data correctness against live agent
- Cross-browser compatibility (V8 targets modern Chromium only)
