/* =============================================================================
   home-search.js — search engine for the Home page's inline support drawers.

   Two lazy, cached searches (nothing loads until the first keystroke):
     HomeSearch.university(query, { modules, limit })  -> Lunr over the RR
       University section index (~1 MB), optionally scoped to the modules the
       signed-in user can access. Mirrors the 3-tier matcher on
       rapidreconciler-university.html.
     HomeSearch.helpdesk(query, { limit })             -> the custom scenario
       matcher (no module scope). Mirrors HelpDesk/troubleshooting.html — keep
       the matcher (tokenize / STOPWORDS / editDistance / matchesQuery /
       scoreMatch) aligned with that page and install-troubleshooting.html.

   Paths are relative to RRV8/home.html (one level under the repo root, same as
   HelpDesk/ and RRUniversity/), so ../RRUniversity and ../Scenarios resolve.
   ============================================================================= */
(function (global) {
  'use strict';

  var LUNR_SRC   = 'https://unpkg.com/lunr@2.3.9/lunr.min.js';
  var UNI_INDEX  = '../RRUniversity/search-index.json';
  var SCEN_INDEX = '../Scenarios/scenarios-index.json';

  // ---- University: module -> filename-prefix gating (mirrors the full page) --
  var ROLE_TO_PREFIX = {
    inventory:      'inventory-',
    ap:             'po-receipts-',
    transfers:      'transfer-order-',
    administrators: 'administrator-'
  };
  var START_HERE_TO_ROLE = {
    'start-here-inventory.html':     'inventory',
    'start-here-ap.html':            'ap',
    'start-here-transfers.html':     'transfers',
    'start-here-administrator.html': 'administrators'
  };

  // ---- Scenario matcher (verbatim from troubleshooting.html) -----------------
  var STOPWORDS = new Set([
    'a','an','and','any','are','as','at','be','been','but','by','can','cant','could',
    'did','do','does','doesnt','doing','dont','for','from','had','has','have','he',
    'her','him','his','how','i','im','if','in','into','is','isnt','it','its','just',
    'me','my','no','not','of','on','or','our','out','over','she','should','so','some',
    'than','that','the','their','them','then','there','these','they','this','those',
    'to','too','up','us','was','wasnt','we','well','were','what','when','where',
    'which','who','why','will','with','would','you','your','yours'
  ]);
  function tokenize(term) {
    return String(term || '').toLowerCase().replace(/['‘’]/g, '').split(/[^a-z0-9]+/i).filter(function (t) { return t.length > 1; });
  }
  function editDistance(a, b, maxDist) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > maxDist) return maxDist + 1;
    var prev = new Array(lb + 1), curr = new Array(lb + 1);
    for (var j = 0; j <= lb; j++) prev[j] = j;
    for (var i = 1; i <= la; i++) {
      curr[0] = i; var rowMin = i;
      for (var k = 1; k <= lb; k++) {
        if (a.charCodeAt(i - 1) === b.charCodeAt(k - 1)) curr[k] = prev[k - 1];
        else curr[k] = 1 + Math.min(prev[k], curr[k - 1], prev[k - 1]);
        if (curr[k] < rowMin) rowMin = curr[k];
      }
      if (rowMin > maxDist) return maxDist + 1;
      for (var m = 0; m <= lb; m++) prev[m] = curr[m];
    }
    return prev[lb];
  }
  function tokenMatches(searchText, token) {
    if (searchText.indexOf(token) !== -1) return true;
    if (token.length < 4) return false;
    var maxDist = token.length >= 7 ? 2 : 1;
    var words = searchText.match(/[a-z0-9]+/g);
    if (!words) return false;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (Math.abs(w.length - token.length) > maxDist) continue;
      if (editDistance(token, w, maxDist) <= maxDist) return true;
    }
    return false;
  }
  function matchesQuery(searchText, term) {
    var tokens = tokenize(term);
    var meaningful = tokens.filter(function (t) { return !STOPWORDS.has(t); });
    if (meaningful.length === 0) return searchText.indexOf(term) !== -1;
    return meaningful.every(function (t) { return tokenMatches(searchText, t); });
  }
  function scoreMatch(scenario, meaningful) {
    if (!meaningful.length) return 0;
    var title = (scenario.title || '').toLowerCase();
    var body  = scenario.search || '';
    var score = 0;
    for (var i = 0; i < meaningful.length; i++) {
      var t = meaningful[i];
      if (title.indexOf(t) !== -1) score += 100;
      var occurrences = body.split(t).length - 1;
      score += Math.min(occurrences, 10);
    }
    return score;
  }

  // ---- lazy loaders ----------------------------------------------------------
  function loadLunr() {
    if (global.lunr) return Promise.resolve();
    if (loadLunr._p) return loadLunr._p;
    loadLunr._p = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = LUNR_SRC; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Could not load Lunr')); };
      document.head.appendChild(s);
    });
    return loadLunr._p;
  }

  var _uni = null; // { byId, index }
  function ensureUniversity() {
    if (ensureUniversity._p) return ensureUniversity._p;
    ensureUniversity._p = loadLunr()
      .then(function () { return fetch(UNI_INDEX, { cache: 'force-cache' }); })
      .then(function (r) { if (!r.ok) throw new Error('index HTTP ' + r.status); return r.json(); })
      .then(function (records) {
        var byId = {};
        records.forEach(function (rec) { byId[rec.id] = rec; });
        var index = global.lunr(function () {
          this.ref('id'); this.field('page_title'); this.field('section_title'); this.field('body');
          this.metadataWhitelist = ['position'];
          records.forEach(function (rec) { this.add(rec); }, this);
        });
        _uni = { byId: byId, index: index };
        return _uni;
      });
    return ensureUniversity._p;
  }

  var _scen = null;
  function ensureScenarios() {
    if (ensureScenarios._p) return ensureScenarios._p;
    ensureScenarios._p = fetch(SCEN_INDEX, { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.json() : { scenarios: [] }; })
      .then(function (data) {
        var list = (data && Array.isArray(data.scenarios)) ? data.scenarios : [];
        _scen = list.map(function (s) {
          return {
            title:    s.title || '',
            category: s.category || '',
            href:     '../Scenarios/' + s.slug + '.html',
            search:   (s.data_search || '').toLowerCase()
          };
        });
        return _scen;
      })
      .catch(function () { _scen = []; return _scen; });
    return ensureScenarios._p;
  }

  // ---- University 3-tier matcher (mirrors lunrSearchFlexible's core) ----------
  function uniRun(q) { try { return _uni.index.search(q); } catch (e) { return []; } }
  function uniFlexible(query) {
    var toks = tokenize(query).filter(function (t) { return !STOPWORDS.has(t); });
    if (!toks.length) toks = tokenize(query);
    if (!toks.length) return [];
    var t1 = uniRun(toks.map(function (t) { return '+' + t; }).join(' '));            // strict AND
    if (t1.length) return t1;
    var t2 = uniRun(toks.map(function (t) { return '+' + t + (t.length >= 4 ? '*' : ''); }).join(' ')); // AND + prefix wildcard
    if (t2.length) return t2;
    return uniRun(toks.map(function (t) { return t + '*'; }).join(' '));               // OR + wildcards
  }
  function recordInModules(rec, modSet) {
    var url = (rec.url || '').split('#')[0];
    if (START_HERE_TO_ROLE[url]) return modSet.has(START_HERE_TO_ROLE[url]);
    for (var role in ROLE_TO_PREFIX) {
      if (url.indexOf(ROLE_TO_PREFIX[role]) === 0) return modSet.has(role);
    }
    return true; // general doc (getting-started, ui-reference, etc.) — always shows
  }

  function university(query, opts) {
    opts = opts || {};
    var limit = opts.limit || 8;
    var modSet = Array.isArray(opts.modules) ? new Set(opts.modules) : null;
    if (!String(query || '').trim()) return Promise.resolve([]);
    return ensureUniversity().then(function () {
      var hits = uniFlexible(query);
      var out = [];
      for (var i = 0; i < hits.length && out.length < limit; i++) {
        var rec = _uni.byId[hits[i].ref];
        if (!rec) continue;
        if (modSet && !recordInModules(rec, modSet)) continue;
        out.push({
          href:         '../RRUniversity/' + rec.url,
          pageTitle:    rec.page_title || '',
          sectionTitle: rec.section_title || ''
        });
      }
      return out;
    });
  }

  function helpdesk(query, opts) {
    opts = opts || {};
    var limit = opts.limit || 8;
    var term = String(query || '').trim().toLowerCase();
    if (!term) return Promise.resolve([]);
    return ensureScenarios().then(function (list) {
      var meaningful = tokenize(term).filter(function (t) { return !STOPWORDS.has(t); });
      return list
        .filter(function (s) { return matchesQuery(s.search, term); })
        .map(function (s) { return { s: s, score: scoreMatch(s, meaningful) }; })
        .sort(function (a, b) { return b.score - a.score || a.s.title.localeCompare(b.s.title); })
        .slice(0, limit)
        .map(function (x) { return { href: x.s.href, title: x.s.title, category: x.s.category }; });
    });
  }

  global.HomeSearch = { university: university, helpdesk: helpdesk };
})(window);
