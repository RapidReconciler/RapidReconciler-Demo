/* Focus one company the way the product does, then fire the audit Excel export.
 * Returns a report object; never throws.
 *
 * The focus company is _acctGlScopeCo, and the ONLY control that moves it is
 * input[data-cos-acctco] in the footer company menu -- which the menu renders
 * only on the accountant detail tabs (Accounts / On Hand), not on Overview.
 * It persists to rrv8.acctCompany.<db> and reloads the page (UI-31), so the
 * caller has to wait for that reload before exporting.
 */
window.__rrFocusCompany = function (co) {
  var out = { want: String(co), via: null, err: null };
  try {
    var tab = document.querySelector('.subnav-tab[data-sv="account"]');
    if (tab) tab.click();
    var btn = document.getElementById('haCosBtn');
    if (!btn) { out.err = 'no haCosBtn'; return out; }
    btn.click();
    var inp = document.querySelector('#haCosMenu input[data-cos-acctco="' + String(co) + '"]');
    if (inp) {
      out.via = 'control';
      inp.click();
      return out;
    }
    out.err = 'no data-cos-acctco input for ' + co;
    var opts = [].slice.call(document.querySelectorAll('#haCosMenu input[data-cos-acctco]'))
                 .map(function (i) { return i.getAttribute('data-cos-acctco'); });
    out.available = opts;
  } catch (e) { out.err = String(e); }
  return out;
};

window.__rrAuditExcel = function () {
  try {
    var tab = document.querySelector('.subnav-tab[data-sv="audit"]');
    if (tab) tab.click();
    var m = document.getElementById('auditReportMenu');
    if (!m) return 'no auditReportMenu';
    m.open = true;
    var b = m.querySelector('[data-audit-report="excel"]');
    if (!b) return 'no excel item';
    var hdr = (document.querySelector('.aud-hdr-co') || {}).textContent || '';
    var cn = (document.querySelector('.aud-hdr-cn') || {}).textContent || '';
    b.click();
    return 'clicked; audit header = ' + hdr + ' / ' + cn;
  } catch (e) { return 'ERR ' + String(e); }
};
'ready';
