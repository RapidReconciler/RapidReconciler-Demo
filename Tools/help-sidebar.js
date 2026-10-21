/* ============================================================
   help-sidebar.js — builds the shared, right-docked help panel and
   wires the standardized Administrator help triggers to it.

   Two triggers, same panel:
     1. Standard: a dark "?" circle injected into the page header next
        to .topbar-home, from <body data-help-src> / <body data-help-title>.
     2. Legacy: any .help-pill[data-help-src] in the page (being
        migrated to the circle page-by-page).

   - data-help-src   : doc URL, may include a #topic hash.
   - data-help-title : panel title bar text.

   The iframe src gets ?embed=1 inserted before any #hash so the
   embedded doc renders content-only (doc-chrome.js honors embed).

   COMPANION model: opening the panel adds .help-open to <html>, which
   reflows the work page to make room beside the panel (help-sidebar.css)
   rather than covering it. There is no scrim and focus is NOT moved — the
   page stays fully interactive so the user reads help while working. Close
   with the × button, Escape, or by clicking the "?" trigger again.
   No dependencies.
============================================================ */
(function () {
  'use strict';

  // The standardized header "?" glyph (matches the doc-help icon used elsewhere).
  var HELP_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>' +
    '</svg>';

  // RRV8.GLOSSARY -> panel HTML. ONE string feeds the model and the reader, so the
  // definitions cannot drift apart; this only changes the presentation.
  //
  // Two things are stripped because they are written FOR THE MODEL: the leading
  // preamble (it tells the model which reference this list overrules) and any
  // [GUIDANCE, not for quoting: ...] segment. Showing either to an analyst would be
  // showing them the wiring.
  // The panel is titled "Terms on this page", and until 2026-08-19 it rendered the
  // WHOLE glossary on every page that opted in — so Cardex Variance showed nine
  // Transaction-Variance / Model-DMAAI terms and one that applied. Each entry now
  // carries [ON=surface,...] and the page names its surface in data-help-glossary.
  // ONE catalog, one page-scoped projection — never a second copy of the vocabulary.
  //
  // The tag is stripped before display. It is deliberately NOT stripped from the
  // string handed to the AI (owner call 2026-08-19): a model reading "[ON=cardex]"
  // is told which surface a term belongs to instead of having to infer it.
  function glossaryHtml(surface) {
    var src = (window.RRV8 && window.RRV8.GLOSSARY) || '';
    var esc = function (t) {
      return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
    var items = [], untagged = [];
    src.split('\n').forEach(function (line) {
      if (line.indexOf('- ') !== 0) return;              // drops the preamble
      var on = line.match(/\[ON=([^\]]*)\]/);
      var body = line.slice(2)
        .replace(/\s*\[GUIDANCE[^\]]*\]\s*/g, '')
        .replace(/\s*\[ON=[^\]]*\]\s*/g, '')
        .trim();
      var cut = body.indexOf(': ');
      if (cut < 0) return;
      if (surface) {
        if (!on) {
          // Fail OPEN, but not silently. Hiding an authored term because someone
          // forgot a tag is worse than showing one extra; showing every term on
          // every page WITHOUT saying so is how this bug lived this long.
          untagged.push(body.slice(0, cut));
        } else if (on[1].split(',').map(function (s) { return s.trim().toLowerCase(); })
                        .indexOf(surface) < 0) {
          return;                                        // not a term on THIS page
        }
      }
      items.push('<dt>' + esc(body.slice(0, cut)) + '</dt><dd>' + esc(body.slice(cut + 2)) + '</dd>');
    });
    if (untagged.length) {
      try { console.warn('[help-sidebar] glossary entries with no [ON=] tag, so shown on every page: ' + untagged.join(' | ')); } catch (_) {}
    }
    if (!items.length) return '<div class="help-gloss-empty">No terms defined for this page.</div>';
    return '<div class="help-gloss">'
      + '<p class="help-gloss-lede">What the words on this screen mean. These are RapidReconciler\u2019s'
      + ' definitions \u2014 where a term is also used elsewhere in accounting, the meaning here is the one'
      + ' the screen is using.</p>'
      + '<dl>' + items.join('') + '</dl></div>';
  }

  function init() {
    var pills = document.querySelectorAll('.help-pill[data-help-src]');
    var bodySrc = document.body.getAttribute('data-help-src');
    // A page may declare the GLOSSARY alone, with no doc. The analyst work pages
    // (Home, Transaction Variance, Cardex Variance) have no help doc of their own
    // and are exactly where the vocabulary questions get asked.
    var wantsGloss = document.body.hasAttribute('data-help-glossary')
                  && !!(window.RRV8 && window.RRV8.GLOSSARY);
    if (!pills.length && !bodySrc && !wantsGloss) return;

    var helpBtn = null;  // the header "?" trigger, if this page has one

    var drawer = document.createElement('aside');
    drawer.className = 'help-drawer';
    drawer.setAttribute('role', 'complementary');  // companion, not a modal dialog
    drawer.setAttribute('aria-label', 'Help');
    drawer.innerHTML =
      '<div class="help-drawer-head">' +
        '<span class="help-drawer-title"></span>' +
        '<button type="button" class="help-drawer-close" aria-label="Close help">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<iframe class="help-drawer-frame" title="Help content" loading="lazy"></iframe>' +
      '<div class="help-drawer-gloss" hidden></div>';

    document.body.appendChild(drawer);

    var titleEl  = drawer.querySelector('.help-drawer-title');
    var frame    = drawer.querySelector('.help-drawer-frame');
    var closeBtn = drawer.querySelector('.help-drawer-close');
    var glossEl = drawer.querySelector('.help-drawer-gloss');

    // Insert embed=1 as a query param BEFORE any #hash, preserving the hash so
    // the SPA doc still deep-links to its topic.
    function embedSrc(src) {
      var hashIdx = src.indexOf('#');
      var hash = hashIdx >= 0 ? src.slice(hashIdx) : '';
      var base = hashIdx >= 0 ? src.slice(0, hashIdx) : src;
      var sep  = base.indexOf('?') >= 0 ? '&' : '?';
      return base + sep + 'embed=1' + hash;
    }

    function isOpen() { return drawer.classList.contains('is-open'); }

    function show(el, on) { if (el) el.hidden = !on; }
    function openGlossary() {
      titleEl.textContent = 'Terms on this page';
      // '1' (or an empty value) keeps the old show-everything behaviour for any page
      // that has not declared a surface yet.
      var gs = String(document.body.getAttribute('data-help-glossary') || '').trim().toLowerCase();
      glossEl.innerHTML = glossaryHtml((gs && gs !== '1') ? gs : '');
      show(glossEl, true); show(frame, false);
      document.documentElement.classList.add('help-open');
      drawer.classList.add('is-open');
      if (helpBtn) helpBtn.setAttribute('aria-expanded', 'true');
    }

    function openSrc(src, title) {
      titleEl.textContent = title || 'How this works';
      var want = embedSrc(src);
      // Reload only when the target changes — keeps the panel snappy on reopen.
      if (frame.getAttribute('src') !== want) frame.setAttribute('src', want);
      show(glossEl, false); show(frame, true);
      document.documentElement.classList.add('help-open');  // reflow the page beside the panel
      drawer.classList.add('is-open');
      if (helpBtn) helpBtn.setAttribute('aria-expanded', 'true');
      // Companion panel: do NOT move focus — the page keeps the user's focus.
    }

    function close() {
      document.documentElement.classList.remove('help-open');
      drawer.classList.remove('is-open');
      if (helpBtn) helpBtn.setAttribute('aria-expanded', 'false');
    }

    // Standard trigger: inject the "?" circle into the header next to Home.
    if (bodySrc || wantsGloss) {
      var btnTitle = document.body.getAttribute('data-help-title')
                  || (bodySrc ? 'How this works' : 'Terms on this page');
      helpBtn = document.createElement('button');
      helpBtn.type = 'button';
      helpBtn.className = 'topbar-help';
      helpBtn.setAttribute('aria-label', btnTitle);
      helpBtn.setAttribute('title', btnTitle);
      helpBtn.setAttribute('aria-expanded', 'false');
      helpBtn.innerHTML = HELP_ICON;
      // The circle toggles the companion panel open/closed.
      helpBtn.addEventListener('click', function () {
        if (isOpen()) { close(); return; }
        // No doc on this page -> the panel IS the glossary.
        if (!bodySrc && wantsGloss) openGlossary(); else openSrc(bodySrc, btnTitle);
      });

      // Anchor order: the header Home link, then the page's own header bar. The
      // floating fallback below is a LAST resort and is refused on glossary-only
      // pages -- home.html carries a fixed bottom action bar (.home-actions) that a
      // fixed bottom-right circle would sit on top of, and a work page is not the
      // place to discover that. Better no trigger than a trigger over the controls.
      // Anchor candidates in order of preference. The scope band is the top chrome on
      // the analyst work pages, which have neither a header Home link nor .app-header.
      var home = document.querySelector('.topbar-home')
             || document.querySelector('.app-header')
             || document.querySelector('.tx-scope-band, .cxv-scope-band');
      var isBar = home && (home.classList.contains('app-header')
               || home.classList.contains('tx-scope-band')
               || home.classList.contains('cxv-scope-band'));
      if (home && home.parentNode && isBar) {
        // Page header bar: the circle rides inside it, at the end.
        home.appendChild(helpBtn);
        helpBtn.style.marginLeft = 'auto';
      } else if (home && home.parentNode) {
        home.parentNode.insertBefore(helpBtn, home);
        // When Home is the auto-pushed right-edge item (no .topbar-extras
        // wrapper), carry the auto margin on the circle so [?][Home] cluster
        // together at the right rather than the circle drifting left.
        if (!(home.closest && home.closest('.topbar-extras'))) {
          helpBtn.style.marginLeft = 'auto';
          home.style.marginLeft = '10px';
        }
      } else if (bodySrc) {
        // No header at all. A page with a real help DOC still gets the floating
        // circle (the old behaviour); a glossary-only page does not -- see above.
        helpBtn.style.position = 'fixed';
        helpBtn.style.right = '22px';
        helpBtn.style.bottom = '22px';
        helpBtn.style.width = '46px';
        helpBtn.style.height = '46px';
        helpBtn.style.zIndex = '90';
        document.body.appendChild(helpBtn);
      }
    }

    // Legacy trigger: wire any in-page .help-pill elements.
    for (var i = 0; i < pills.length; i++) {
      (function (p) {
        p.addEventListener('click', function () {
          openSrc(p.getAttribute('data-help-src'), p.getAttribute('data-help-title'));
        });
      })(pills[i]);
    }
    // Both a doc AND a glossary: one head toggle rather than a second trigger in
    // the page chrome. The panel is already the place the reader is looking.
    if (bodySrc && wantsGloss) {
      var tBtn = document.createElement('button');
      tBtn.type = 'button';
      tBtn.className = 'help-drawer-terms';
      tBtn.textContent = 'Terms';
      tBtn.addEventListener('click', function () {
        if (glossEl.hidden) { openGlossary(); tBtn.textContent = 'Help'; }
        else { openSrc(bodySrc, document.body.getAttribute('data-help-title') || 'How this works'); tBtn.textContent = 'Terms'; }
      });
      closeBtn.parentNode.insertBefore(tBtn, closeBtn);
    }
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) close();
    });

    // Contextual scroll: while the panel is OPEN, clicking any control that
    // carries data-help-topic="anchor-id" scrolls the embedded doc to that
    // section's heading. The control's own action (open a modal, etc.) still
    // runs — we never preventDefault; we just nudge the help alongside it.
    // No-op when the panel is closed, so a plain Edit click stays a plain edit.
    function scrollHelpTo(anchorId) {
      if (!anchorId) return;
      try {
        var doc = frame.contentDocument;
        if (!doc) return;
        var el = doc.getElementById(anchorId);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (_) { /* iframe not ready / cross-origin — ignore */ }
    }
    document.addEventListener('click', function (e) {
      if (!isOpen()) return;
      var t = e.target.closest ? e.target.closest('[data-help-topic]') : null;
      if (t) scrollHelpTo(t.getAttribute('data-help-topic'));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
