/* ============================================================================
   RRV8.saveWorkbook / RRV8.runExport — the one place an .xlsx export is
   allowed to fail.

   WHY THIS FILE EXISTS. Every Excel export in V8 is built in the browser by
   SheetJS: the caller assembles an array-of-arrays, hands it to
   `XLSX.utils.aoa_to_sheet`, then calls `XLSX.writeFile`. The export routines
   guard their INPUTS well (library loaded, data present, scope recognised,
   rows match the filter, at least one column visible) and every one of those
   guards reports a reason on screen.

   Nothing guarded the BUILD. `aoa_to_sheet`, the per-cell format pass, and the
   final serialise all allocate, and a large grid allocates a lot. When one of
   them threw, the exception escaped the click handler: no file, no message, no
   toast. The button simply stopped doing anything. An export that dies in
   silence is worse than one that fails loudly, because the analyst re-clicks,
   assumes the data is empty, or reports "exports are broken" with nothing to
   go on.

   So: one wrapper, one vocabulary of reasons, used by every surface that
   writes a workbook. The reason has to be actionable — "it broke" is the
   thing we are replacing.
   ============================================================================ */
(function (global) {
  'use strict';

  global.RRV8 = global.RRV8 || {};

  /* An allocation failure inside SheetJS surfaces under several different
     names depending on which step ran out of room and which engine is running.
     Chrome/Edge throw RangeError for both "Array buffer allocation failed" and
     "Invalid string length" (the latter when the serialised sheet exceeds the
     engine's max string); a genuine heap exhaustion arrives as a bare
     "out of memory". They are one condition to the person reading the message,
     so they get one message. */
  var TOO_BIG = /allocation failed|invalid string length|out of memory|maximum call stack/i;

  /**
   * Turn an exception into something the analyst can act on.
   * `label` names the export ("Transactions", "Cardex Variance") so a page
   * with several export buttons says which one failed.
   */
  function exportFailureMessage(err, label) {
    var what = label ? (label + ' export') : 'Export';
    if (typeof XLSX === 'undefined') {
      return what + ' unavailable &mdash; the Excel library did not load. Reload the page.';
    }
    var msg = String((err && (err.message || err)) || '');
    if (TOO_BIG.test(msg)) {
      return what + ' was too large for this browser session to build. Narrow the ' +
             'period, company or filter and export again, or close other tabs and retry.';
    }
    return what + ' failed &mdash; ' + (msg || 'unknown error') + '.';
  }

  /**
   * Write a built workbook. Returns true on success, false if it was reported.
   * `report` is the page's own status function (`toast` / `flashStatus`) — this
   * file does not own the presentation, only the reason.
   */
  function saveWorkbook(wb, fname, report, label) {
    try {
      XLSX.writeFile(wb, fname);
      return true;
    } catch (err) {
      console.error('[export] write failed:', fname, err);
      if (typeof report === 'function') report(exportFailureMessage(err, label));
      return false;
    }
  }

  /**
   * Run a whole export routine under the same guard, so a failure while the
   * workbook is being ASSEMBLED is reported the same way as one while it is
   * being written. Use this at the click handler; use `saveWorkbook` when the
   * build is already guarded by its caller.
   *
   * Returns whatever `fn` returned, or undefined if it threw.
   */
  function runExport(label, report, fn) {
    try {
      return fn();
    } catch (err) {
      console.error('[export] ' + label + ' failed:', err);
      if (typeof report === 'function') report(exportFailureMessage(err, label));
      return undefined;
    }
  }

  global.RRV8.exportFailureMessage = exportFailureMessage;
  global.RRV8.saveWorkbook         = saveWorkbook;
  global.RRV8.runExport            = runExport;

})(typeof window !== 'undefined' ? window : this);
