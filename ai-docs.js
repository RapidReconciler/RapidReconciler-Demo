/*
 * ai-docs.js — the ONE allowlist of RR University docs the AI is allowed to link,
 * and the four functions that turn a model's slug into an anchor (UI-8).
 *
 * WHY THIS IS A SHARED FILE AND NOT COPY-PASTE. The AI never emits a URL. It names
 * a slug; the client resolves it against this allowlist and drops anything unlisted,
 * so a hallucinated link cannot reach a customer. That guarantee is only worth
 * something while there is exactly ONE list. Three pages carrying three copies is
 * the same defect shape this codebase has already paid for twice — nine card maps
 * that drifted into three different names for one pattern (see the RRV8.txv header
 * in config.js), and the SourceFix widening that was done in one place of three.
 * A doc that gets renamed, or a slug that gets retired, has to change in one file.
 *
 * LOADED THE SAME WAY config.js IS: a plain <script src="ai-docs.js"></script> in
 * the page head, before the page's own inline script, attaching to window.RRV8.
 * No module system, no build step — that is the existing convention here and this
 * follows it rather than inventing a second one. The matching CSS is ai-docs.css,
 * paired the way period-bars.js / period-bars.css already are.
 *
 * HREFS ARE RELATIVE FROM RRV8/ (../RRUniversity/…) so they resolve identically on
 * the :8765 dev server and on GitHub Pages. Tools/test-ai-doc-coverage.js asserts
 * every one of them is a file that exists, because the only way this list rots is
 * a rename on the other side of the repo.
 */
(function () {
  'use strict';
  window.RRV8 = window.RRV8 || {};

  var DOCS = {
    // Recon-facing docs (accountant / analyst)
    'reconciliation':  { title: 'Inventory Reconciliation',     href: '../RRUniversity/inventory-reconciliation.html',     roles: ['accountant', 'analyst'] },
    'period-close':    { title: 'Period-Close Troubleshooting', href: '../RRUniversity/period-close-troubleshooting.html', roles: ['accountant', 'analyst'] },
    'cardex-variance': { title: 'Cardex Variance',              href: '../RRUniversity/inventory-cardex-variance.html',    roles: ['accountant', 'analyst'] },
    'zero-balance':    { title: 'Zero-Balance Rows',            href: '../RRUniversity/inventory-zero-balance.html',       roles: ['accountant', 'analyst'] },
    'reports-exports': { title: 'Reports & Exports',            href: '../RRUniversity/reports-and-exports.html',          roles: ['accountant', 'analyst'] },
    'compare-jde':     { title: 'Comparing RR to JDE Reports',  href: '../RRUniversity/comparing-rr-to-jde-reports.html',  roles: ['accountant', 'analyst'] },
    'add-account':     { title: 'Adding an Inventory Account',  href: '../RRUniversity/inventory-add-account-rr.html',     roles: ['accountant', 'analyst'] },
    'costing':         { title: 'Inventory Costing',            href: '../RRUniversity/inventory-costing.html',            roles: ['accountant', 'analyst'] },
    // Admin-facing docs
    'managing-users':     { title: 'Team Management',      href: '../RRUniversity/administrator-managing-users.html',     roles: ['admin'] },
    'managing-companies': { title: 'Managing Companies',   href: '../RRUniversity/administrator-managing-companies.html', roles: ['admin'] },
    'password-policy':    { title: 'Password Policy',      href: '../RRUniversity/administrator-complex-password.html',   roles: ['admin'] },
    'licensing':          { title: 'Licensing',           href: '../RRUniversity/rapidreconciler-licensing.html',        roles: ['admin'] },
    'login-access':       { title: 'Login & Access',       href: '../RRUniversity/login-and-access.html',                 roles: ['admin'] }
  };

  // Prompt fragment: lists the allowlist (scoped to `role`) + the emit contract.
  // mode 'token' (default, for free-text answers) asks for a trailing
  // "@@DOCS slug, slug@@" line; mode 'json' (for the JSON-returning briefings and
  // cards) asks for an optional "docs" array in the object. role scopes WHICH docs
  // are offered (accountant | analyst | admin); default 'accountant'.
  function catalogPrompt(mode, role) {
    role = role || 'accountant';
    var lines = Object.keys(DOCS).filter(function (k) {
      var r = DOCS[k].roles; return !r || r.indexOf(role) >= 0;
    }).map(function (k) { return '  ' + k + ' = ' + DOCS[k].title; });
    var emit = mode === 'json'
      ? 'If — and ONLY if — one or two of these docs directly match what the briefing is about, add an OPTIONAL "docs" array to the JSON object with those slugs (from the list above, max TWO, most relevant first). Omit "docs" entirely when nothing fits. Never invent a slug, and do NOT mention doc titles or links in the verdict or points text.\n'
      : 'If — and ONLY if — one or two of these docs directly match what the answer is about, END your reply with a single line exactly like "@@DOCS slug, slug@@" (slugs from the list above, max TWO, most relevant first). Omit the line entirely when nothing fits. Never invent a slug, and do NOT mention doc titles or links anywhere in the prose — the @@DOCS@@ line is the only place a doc reference may appear.\n';
    return 'RELATED HELP DOCS you may cite (slug = topic):\n' + lines.join('\n') + '\n' + emit;
  }

  // Filter a raw slug list to the allowlist: lowercased, deduped, capped at 2.
  // The single gate both the @@DOCS@@ token and the briefing JSON "docs" array
  // pass through, so an unknown/hallucinated slug can never become a link.
  function filterSlugs(arr) {
    var slugs = [], seen = {};
    (Array.isArray(arr) ? arr : []).forEach(function (s) {
      s = String(s || '').trim().toLowerCase();
      if (DOCS[s] && !seen[s] && slugs.length < 2) { seen[s] = 1; slugs.push(s); }
    });
    return slugs;
  }

  // Pull the @@DOCS …@@ token out of raw AI text. Returns { text, slugs[] } with
  // the token stripped and slugs filtered to the allowlist, deduped, capped at 2.
  function extractDocs(raw) {
    var txt = String(raw || ''), slugs = [], m = txt.match(/@@DOCS\s+([^@]+)@@/i);
    if (m) { txt = txt.replace(m[0], '').trim(); slugs = filterSlugs(m[1].split(',')); }
    return { text: txt, slugs: slugs };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // Build (or clear) a "Learn more" strip inside hostEl. Anchors come ONLY from
  // the allowlist — slugs are already validated. stripId keeps one strip per
  // surface so a re-render replaces rather than stacks.
  function renderStrip(hostEl, slugs, stripId) {
    var strip = document.getElementById(stripId);
    if (!slugs || !slugs.length) { if (strip) strip.parentNode.removeChild(strip); return; }   // clear works even without a host
    if (!hostEl) return;
    if (!strip) { strip = document.createElement('div'); strip.id = stripId; strip.className = 'ai-doc-strip'; hostEl.appendChild(strip); }
    strip.innerHTML = '<span class="ai-doc-strip-label">Learn more</span>'
      + slugs.map(function (s) {
          var d = DOCS[s];
          return '<a class="ai-doc-link" href="' + d.href + '" target="_blank" rel="noopener">' + esc(d.title) + '</a>';
        }).join('');
  }

  window.RRV8.aiDocs = {
    DOCS: DOCS,
    catalogPrompt: catalogPrompt,
    filterSlugs: filterSlugs,
    extractDocs: extractDocs,
    renderStrip: renderStrip
  };
})();
