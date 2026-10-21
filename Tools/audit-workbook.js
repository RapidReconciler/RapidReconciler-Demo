/* =============================================================================
   Shared audit-quality Excel template.
   =============================================================================
   Navy header band, #,##0.00;(#,##0.00) numbers, thin borders, merged title
   lines, optional bold total row. Every export a HUMAN downloads goes through
   this so the workbooks look like one product (UI-32).

   WHY THIS FILE EXISTS. The same function was copy-pasted into home.html,
   accounting-dmaais.html and inventory-variance-source.html. Three private
   copies of one template is three ways for the exports to drift apart, and the
   drift would show up in a customer's inbox rather than in a test. Extracted
   2026-08-07 when a fourth page needed it.

   Consolidated 2026-08-08 (UI-70): all three pages now load this file and their
   inline copies are gone. Two of the three were byte-equivalent to this one;
   home.html's had drifted, missing the per-column `fmt` override, so its exports
   silently forced every numeric column to 2dp. Any page needing an audit-quality
   workbook loads this file — do not paste a fourth copy.

   Requires: vendor/xlsx-js-style.min.js (the community SheetJS build ignores
   cell styling — the -js-style fork is the one that honours it) and, for the
   default filename, RRV8.exportName from config.js.

   Usage:
     buildAuditWorkbook({
       columns:    [{ label: 'Item', num: false }, { label: 'Amount', num: true }],
                   // optional per-column `fmt` overrides AUDIT_NUM_FMT — a unit
                   // cost needs 4dp, because rounding 0.0034 to 0.00 shows a
                   // costed item as costless.
       titleLines: ['Excluded GL classes — Co 80002', 'Generated ...'],
       rows:       [['ABC', 1234.5], ...],   // numbers stay numbers
       totalRow:   ['TOTAL — 2 rows', 1234.5],
       sheetName:  'Excluded',
       fileName:   RRV8.exportName({ surface: 'ExcludedGlClasses', company: '80002' })
     });
   ============================================================================= */
(function (global) {
  'use strict';

  // Shared audit-quality Excel template (navy header band, #,##0.00;(…) numbers,
  // thin borders, merged title lines, optional bold total). Ported from the rec
  // page so the preview drill-downs + audit reports export the same way.
  // columns: [{label, num}]; rows: arrays of raw cell values (numbers stay
  // numbers so the format applies); titleLines render above; totalRow is bolded.
  var AUDIT_NUM_FMT = '#,##0.00;(#,##0.00)';
  function _auditBorder(rgb) { var s = { style: 'thin', color: { rgb: rgb } }; return { top: s, bottom: s, left: s, right: s }; }
  // Build ONE audit-styled worksheet (title band, navy header, bordered body,
  // bold total row, money format on num cols). Returns the ws; caller appends +
  // writes — so multiple sheets can share one workbook.
  function _buildStyledSheet(opts) {
    var cols = opts.columns || [], ncol = cols.length || 1, titleLines = opts.titleLines || [];
    var aoa = [];
    titleLines.forEach(function (t) { var row = new Array(ncol).fill(''); row[0] = t; aoa.push(row); });
    if (titleLines.length) aoa.push(new Array(ncol).fill(''));
    var headRowIdx = aoa.length;
    aoa.push(cols.map(function (c) { return c.label; }));
    (opts.rows || []).forEach(function (r) { aoa.push(r.slice()); });
    var totalRowIdx = -1;
    if (opts.totalRow) { totalRowIdx = aoa.length; aoa.push(opts.totalRow.slice()); }
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var range = XLSX.utils.decode_range(ws['!ref']);
    for (var t = 0; t < titleLines.length; t++) {
      var tref = XLSX.utils.encode_cell({ r: t, c: 0 }); if (!ws[tref]) continue;
      ws[tref].s = { font: { bold: t === 0, sz: t === 0 ? 14 : 10, color: { rgb: t === 0 ? '1F2D4A' : '6B7280' } } };
    }
    for (var c = range.s.c; c <= range.e.c; c++) {
      var href = XLSX.utils.encode_cell({ r: headRowIdx, c: c }); if (!ws[href]) continue;
      ws[href].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '1F2D4A' } }, alignment: { horizontal: (cols[c] && cols[c].num) ? 'right' : 'left', vertical: 'center' }, border: _auditBorder('D0D0D0') };
    }
    for (var rr = headRowIdx + 1; rr <= range.e.r; rr++) {
      var isTotal = rr === totalRowIdx;
      for (var cc = range.s.c; cc <= range.e.c; cc++) {
        var cref = XLSX.utils.encode_cell({ r: rr, c: cc }); var cell = ws[cref]; if (!cell) continue;
        cell.s = cell.s || {}; cell.s.border = _auditBorder('ECECEC');
        if (cols[cc] && cols[cc].num) { cell.z = cols[cc].fmt || AUDIT_NUM_FMT; cell.s.alignment = { horizontal: 'right' }; }
        if (isTotal) { cell.s.font = { bold: true, color: { rgb: '1F2D4A' } }; cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'F1F4F9' } }; }
      }
    }
    ws['!cols'] = cols.map(function (c) { return { wch: c.num ? 16 : Math.max(16, (c.label || '').length + 4) }; });
    if (titleLines.length) { ws['!merges'] = ws['!merges'] || []; for (var m = 0; m < titleLines.length; m++) ws['!merges'].push({ s: { r: m, c: 0 }, e: { r: m, c: ncol - 1 } }); }
    return ws;
  }
  // The build allocates (styled sheet + serialise), and a build that ran out of
  // room used to throw straight out of the click handler: no file, no message,
  // the button just stopped working. Everything from the sheet build to the
  // write is inside the guard. RRV8.saveWorkbook is preferred when the page
  // loads export-guard.js; the local fallback keeps this usable on a page that
  // does not, so no caller can regress to a silent failure.
  function buildAuditWorkbook(opts) {
    if (!window.XLSX) { if (typeof toast === 'function') toast('Excel library still loading — try again in a moment'); return false; }
    var report = (typeof toast === 'function') ? toast : null;
    var label  = opts.sheetName || 'Report';
    try {
      var ws = _buildStyledSheet(opts); if (!ws) return false;
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31));
      var fname = opts.fileName || RRV8.exportName({ surface: 'Report' });
      if (window.RRV8 && RRV8.saveWorkbook) return RRV8.saveWorkbook(wb, fname, report, label);
      XLSX.writeFile(wb, fname);
      return true;
    } catch (err) {
      console.error('[export] ' + label + ' failed:', err);
      if (report) {
        report((window.RRV8 && RRV8.exportFailureMessage)
          ? RRV8.exportFailureMessage(err, label)
          : (label + ' export failed — ' + ((err && err.message) || err)));
      }
      return false;
    }
  }
  global.buildAuditWorkbook = buildAuditWorkbook;
  global.buildAuditSheet    = _buildStyledSheet;
  // Exported because home.html's per-company audit report builds its own sheet
  // with its own style map and needs the SAME money format. It was a second
  // private copy of the same string; one export removes it.
  global.AUDIT_NUM_FMT      = AUDIT_NUM_FMT;
}(window));
