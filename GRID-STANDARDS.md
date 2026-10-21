# RRV8 &mdash; Grid standards

Living spec for the conventions every V8 grid follows. The first
implementation reference is the Transactions Details grid in
[`inventory-transactions.html`](inventory-transactions.html); other
pages should mirror these conventions verbatim until we have a
shared lib.

This doc is intentionally short. Each convention has a behavioral
rule + the CSS / state hook a future page can copy. When a new
convention earns its place, add it here and apply it to existing
grids in the next commit so the codebase stays consistent.

---

## 1. Header layout

```
+------------------------------------------------------------------+
| Title    [left-cluster controls]            [grid-state cluster] |
+------------------------------------------------------------------+
```

- **Title** sits on the left.
- **Left-cluster controls** (page-specific filters, action buttons,
  state pills like the DMAAI preload indicator) flow naturally after
  the title.
- **Grid-state cluster** is pinned to the far right and contains
  four elements, in this order:
  1. **Search input** &mdash; case-insensitive substring search
     across visible columns. See section 8.
  2. **Excel pill** &mdash; one-click export of the analyst&rsquo;s
     current view (filters + visible columns + drag order).
  3. **Columns pill** &mdash; opens the column chooser popover.
  4. **Row count pill** &mdash; the rightmost element on the page;
     shows `N rows` / `N rows of M` / `Loading…`.

CSS hook: wrap the pills in `<div class="grid-state-cluster">`.
That class applies `margin-left:auto` so the cluster floats to the
right edge regardless of how many controls are to its left.

**Don&rsquo;t** put an Excel button anywhere else on the page (the
page-level `.page-actions` slot is reserved for things that act on
the whole module, not on a single grid). Co-locating export with
the grid header keeps the affordance discoverable and unambiguous
about what data the export covers.

## 2. Pill style

Both grid-state pills share the `.grid-pill` base class so they read
as a matched pair.

- `.grid-pill` &mdash; canonical look: 100px radius, 1px border,
  Source Sans 3 700/12.5px, 5px/10px padding.
- `.grid-pill-export` &mdash; modifier on the Excel export button.
  Standard hover affordance (no special state).
- `.grid-pill-cols` &mdash; modifier on the column chooser button.
  Add `.is-narrowed` when not all columns are visible (amber tint).
- `.grid-pill-count` &mdash; modifier on the row-count span.
  Add `.is-loading` while data is loading (muted italic).

Other pills in the header (filter pills, action buttons) intentionally
use their own classes so the grid-state cluster reads as a distinct
trio. Don&rsquo;t spread `.grid-pill` to unrelated controls.

## 3. Row count text

- Default state: `<N> rows` (formatted with `toLocaleString`).
- Filtered subset of a larger set: `<N> rows of <M>` (`M` is the
  agent&rsquo;s `total`).
- During async load: `Loading…` with `.is-loading` class.
- Pluralization: always plural (`rows`) for now; revisit if a grid
  legitimately bottoms out at 1.

## 4. Excel export

The Excel pill (leftmost in the grid-state cluster) is a one-click
**direct download** of the analyst&rsquo;s current view. Not routed
through the analyzer &mdash; this is a "give me what I see" dump,
not a diagnostic.

The exported workbook respects:
- **Filters** &mdash; only rows currently visible (worked filter,
  active type, chip exclusions) make it into the file.
- **Column visibility** &mdash; only columns the analyst has on.
- **Column order** &mdash; the analyst&rsquo;s drag-to-reorder
  layout is preserved in the .xlsx.

Layout convention:
- Row 1: `<Grid Title> Generated <weekday, full date, time>` &mdash;
  banner merged across all visible columns.
- Row 2: header row (column labels in display order).
- Row 3: **Grand Summaries** &mdash; label in the leftmost
  non-money column, totals in the money columns (Cardex / Ledger /
  Variance). Skip the row entirely if no money columns are visible.
- Row 4+: data rows.

Cell formats:
- Money columns: `$#,##0.00;[Red]($#,##0.00);-` (negatives in red
  parens, zero collapses to `-`).
- Integer-identifier columns (Doc, OrderNumber, Batch, GLXref,
  etc.): plain integers, 0 collapses to blank so empty-looking
  cells stay empty in Excel.
- Worked column: `Yes` / `No` (string), not the checkmark icon.

Filename: `<GridName>_<period>_<YYYYMMDDTHH>.xlsx` &mdash; period
when the grid is period-scoped, dropped otherwise. The legacy SPA
used a similar pattern; staying close keeps muscle memory.

Implementation hook: `exportGridToExcel()` on the page&rsquo;s IIFE.
Wired to a `click` listener on `#grid-export-btn`. Uses SheetJS
(`XLSX.utils.aoa_to_sheet` + `XLSX.writeFile`).

Do NOT route grid exports through the headless analyzer pipeline.
The analyzer is for diagnostic templates (Transaction Detail,
System Status, etc.); a grid dump has no matching template and
opening one in the analyzer would just return the same workbook
with a 404 / detect-failed banner.

## 5. Column visibility

- Default: every column visible. Treat the chooser as
  &ldquo;hide what you don&rsquo;t need&rdquo;, not &ldquo;reveal
  hidden columns&rdquo;.
- Click the Columns pill &rarr; popover with one checkbox per column.
- Popover header has two actions:
  - **Show all** &mdash; turn every column on (visibility only;
    leaves order alone).
  - **Reset to defaults** &mdash; restore each column&rsquo;s
    `defaultOn` AND restore canonical column order. &ldquo;Reset&rdquo;
    means &ldquo;put the grid back the way it shipped.&rdquo;
- Toggle a checkbox &rarr; immediate re-render.
- The chooser lists columns in **current display order** so what the
  analyst sees in the popover matches what they see in the grid.

State + persistence:
- `_state.colVisibility` &mdash; `{colKey: bool}`.
- Saved to `localStorage` under `rrv8-<page>-columns-v1`.
- `loadColVisibility` is forward-compatible: unknown keys in saved
  state are dropped; new columns inherit `defaultOn`.

## 6. Column order (drag-to-reorder)

- Every column header is `draggable="true"` (except the col-export
  action column, which stays pinned at the leftmost position).
- Drag a header onto another &rarr; the dragged column is inserted
  AT the target&rsquo;s position; target + everything to its right
  slides one step right.
- Visual feedback:
  - `is-dragging` &mdash; the column being dragged (opacity 0.35).
  - `is-drag-over` &mdash; the drop target (3px blue insertion bar
    on the left edge).
- The change persists immediately to `localStorage` under
  `rrv8-<page>-col-order-v1`.

State + persistence:
- `_state.colOrder` &mdash; ordered array of column keys.
- `loadColOrder` is forward-compatible: unknown keys dropped, new
  columns appended at the end.
- `visibleColumns()` walks `_state.colOrder`, maps to column
  definitions via `COLUMNS_BY_KEY`, and filters by visibility.

Implementation hook: `wireColumnDrag()` attaches delegated
`dragstart` / `dragover` / `dragleave` / `drop` / `dragend`
listeners to the `<tr>` of the table header. Listeners stay
attached through every header re-render because they live on the
parent. Call it ONCE at page boot after the first
`renderTableHeader()`.

## 7. Column sort (click-to-toggle)

- Click a column header &rarr; sort by that column ascending.
- Click the **same** column again &rarr; toggle to descending.
- Click a **different** column &rarr; reset to ascending on the new
  column.
- Two-state, not three-state. There&rsquo;s no &ldquo;unsorted&rdquo;
  click; once an analyst commits to a column the sort persists until
  they pick a different one. Reset-to-default is the column
  chooser&rsquo;s **Reset to defaults** affordance (which can clear
  sort alongside visibility + order if needed).
- The active column shows a caret (`&#9650;` for asc, `&#9660;` for
  desc) and its label paints in the brand blue. Inactive columns
  stay neutral &mdash; no caret &mdash; so the header row reads
  uncluttered.
- Hover affordance: any sortable header label shifts to brand blue
  on hover so the click target is discoverable.

Drag-vs-sort coexistence: each `<th>` is both `draggable="true"`
(for column reorder) and click-to-sort. The HTML5 drag spec
suppresses the `click` event when a real drag occurs, so the two
interactions don&rsquo;t collide without a manual guard.

Comparator rules:
- **Numeric** for columns with `tdClass: 'is-money'` or
  `tdClass: 'is-num'` (money + integer-identifier columns).
  `Number(value)`; non-finite coerces to 0.
- **String** for everything else, using
  `String.localeCompare(other, undefined, { numeric: true, sensitivity: 'base' })`.
  The `numeric: true` flag handles natural-order sorting for
  mixed-content identifier columns (e.g. `A10` before `A2` would be
  wrong; `numeric: true` puts them in numeric order).
- Null-safe: `null` / `undefined` / `''` all compare as 0 (numeric)
  or empty string (string) without throwing.

State + persistence:
- `_state.sortKey` &mdash; active column key, or `null` for default
  agent order.
- `_state.sortDir` &mdash; `'asc'` | `'desc'`.
- Saved to `localStorage` under `rrv8-<page>-sort-v1`.
- `loadSort` is forward-compatible: unknown keys clear back to the
  default (`{ key: null, dir: 'asc' }`).

Implementation hook: `wireColumnSort()` attaches a delegated
`click` listener to the `<tr>` of the table header. Same pattern
as `wireColumnDrag()`; call it ONCE at page boot after the first
`renderTableHeader()`.

## 8. Search (case-insensitive substring, with `^` starts-with anchor)

- A compact text input sits leftmost in the grid-state cluster.
- Filters the visible rows by case-insensitive substring match
  against any **visible** column. Hidden columns are excluded so
  the search feels tied to what the analyst is actually looking at.
- **`^` prefix switches to starts-with**. `^468-` matches Item
  `468-12053` but NOT `X-468-12053`. The anchor is stripped before
  the comparison; rest of the query behaves the same. Use when an
  ID code prefix is shared by unrelated items and you don't want
  substring matches in the middle.
- 150ms debounce on input so a fast typist doesn&rsquo;t pay for a
  render per keystroke.
- ESC inside the input clears the search and re-renders.
- A small &times; button appears inside the input when there&rsquo;s
  a query; clicking it clears the field and re-focuses the input.
- Search is a per-grid &ldquo;find&rdquo; operation, NOT a scope narrow.
  It applies AFTER `filteredRows()` and the sort, inside
  `renderDetails`. The Start Here cards, KPI strip, and active-filter
  banner are unaffected &mdash; they reflect the un-searched scope.
- The row-count pill DOES reflect the search (so the analyst sees
  &ldquo;14 rows&rdquo; when the search narrows from 264).

Placeholder: `Search rows…`. State lives in `_state.gridSearch`;
ephemeral per session (not persisted).

Implementation hook: `wireGridSearch()` attaches input + keydown +
clear-button listeners. Call it ONCE at page boot. The filter
helper `searchFilter(rows, query)` walks `visibleColumns()` and
returns the matching subset.

## 9. Column value filter (per-column distinct-value picker)

Excel-style per-column filter. Each filterable column header carries a
small funnel glyph next to the label. Click the glyph to open a
popover with a checkbox for every distinct value currently present in
that column; uncheck any to narrow the grid.

- Default state: every value checked &rarr; no filter applied.
- Unchecking any value applies a filter live (no Apply button).
- A header with an active filter paints the funnel + label in
  brand-blue (`is-filter-active` class on the `<th>`).
- Header layout: `<label> <sort-caret?> <funnel-button>`. Click on
  the label sorts the column; click on the funnel opens the filter
  popover. The `data-action="filter-col"` attribute on the funnel
  + `e.stopPropagation()` keeps the two interactions separate.

Popover contents:
- Section label (the column name).
- Search input filters the value list in place &mdash; useful when a
  column has 50+ distinct values.
- Scrollable checkbox list.
- Quick actions: **Select all** / **Select none** / **Clear filter**.

State + persistence:
- `_gridState[module].columnFilters` &mdash; `{ colKey: Set<value> }`
  where presence + size of the Set marks an active filter; empty /
  missing = no filter.
- Saved as JSON `{ colKey: [value, ...] }` under
  `rrv8-<page>-<module>-colfilter-v1` (Sets serialize to arrays).
- `loadColumnFilters` skips unknown column keys (forward-compatible
  if the column set changes between versions).

Apply order in `filteredRows()`: page-scope filters &rarr; finding
focus &rarr; **column filters** &rarr; row-state filter &rarr;
search &rarr; sort. Column filters narrow the universe; the row-state
filter and search narrow that result further. Sort runs last.

Distinct values come from `distinctValuesForColumn(module, colKey)`
which walks the module's row set (after the page Company filter,
so per-column choices reflect what's actually selectable). Derived
columns like `_findingStatus` are computed via `colValue(row, key)`
so the filter works on the displayed value, not a raw row property.

Implementation hook: `openColumnFilterPopover(module, colKey, anchor)`.
Wired from the thead delegated click handler:
```js
const filterBtn = e.target.closest('[data-action="filter-col"]');
if (filterBtn) { e.stopPropagation(); openColumnFilterPopover(...); return; }
```

Reference implementation: every column on the DMAAI module grids
(`RRV8/accounting-dmaais.html`).

## 10. State key naming

For per-page persistence, use the pattern `rrv8-<page>-<feature>-v1`:

- `rrv8-tx-columns-v1` &mdash; Transactions, visibility
- `rrv8-tx-col-order-v1` &mdash; Transactions, drag order
- `rrv8-tx-sort-v1` &mdash; Transactions, active sort column + dir
- `rrv8-dmaai-<module>-colfilter-v1` &mdash; DMAAI module grid, column value filters
- (future) `rrv8-recon-columns-v1` &mdash; Reconciliation, visibility

The `-v1` suffix lets us migrate the schema later by bumping to
`-v2` and translating in `loadX`.

Search state is intentionally NOT persisted &mdash; it&rsquo;s a
per-visit &ldquo;find,&rdquo; not a saved preference.

---

## Pages applying this standard

| Page | Header layout | `.grid-pill` cluster | Drag-to-reorder | Click-to-sort | Search | Column filter | Notes |
|---|---|---|---|---|---|---|---|
| `inventory-transactions.html` (Details grid) | ✓ | ✓ | ✓ | ✓ | ✓ | &mdash; | Original reference; column filter to be added |
| `accounting-dmaais.html` (module grids) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Reference implementation for column filter |
| `inventory-asof.html` (Details grid) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Adds row-expand for lot detail (item rollup is the default view) |
| `inventory-cardex-variance.html` (Details grid) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Default sort: adjAmount desc (biggest hits first). Reason chip on Amount/Quantity. Hero pairs Recon-authoritative cardex impact with the per-item grid sum. |
| `inventory-account-rollforward.html` (Roll forward grid) | ✓ | ✓ | &mdash; | ✓ | ✓ | &mdash; | Read-only analyst grid. Header cluster (search + Excel + count), click-to-sort, sticky header, search. Drag-reorder / column chooser / per-column filter intentionally omitted — every roll-forward column is signal, so hide/reorder add little here. |
| `inventory-reconciliation.html` (variance Preview tables) | &mdash; | &mdash; | &mdash; | &mdash; | &mdash; | &mdash; | Different surface (modal); revisit when modal grids get standardized |

## Conventions we&rsquo;ve NOT yet decided

Leaving as open questions; pick the answer when the first page
needs it:

- **Column resize**: drag the right edge of a column to widen /
  narrow. Persist per-column width.
- **Sticky header**: thead pins to the top of the scroll container
  on long lists. Transactions already does this.
- **Row hover/select**: hover highlights; click selects (with
  shift-click for range, ctrl/cmd-click for toggle). Transactions
  already does selection.
- **Empty / error states**: Transactions uses `.details-empty` for
  &ldquo;No transactions match&hellip;&rdquo;. Standardize the spinner
  and error-toast wording.
- **Export icons** on action columns: leftmost-col-export model
  (Transactions) vs. action-column-on-the-right.
- **Inline cell editing**: Transactions has the batch-edit modal
  for Worked + Note. We could allow inline edits on the Note column
  directly &mdash; not yet specced.

When you add one, document it here + apply it to existing grids in
the same commit so they stay consistent.
