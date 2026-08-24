/*
 * tour-seed.js -- the ONE session seed shared by the front door and all nine
 * role x archetype tour pages.
 *
 * The nine pages stay nine separate pages (owner ruling 2026-08-24): each carries
 * its own beats, because the three demo databases tell different stories. What
 * they must NOT each carry is their own copy of the session seed. Every page used
 * to hardcode its database, its Services port, its company list and its spine
 * company inline, and the moment two pages disagreed the product rendered one
 * database's numbers under another's label -- correct data under a wrong name,
 * which reads on camera as the product scoped to the wrong company's books.
 * One table, one seeder, nine callers.
 *
 * ---------------------------------------------------------------------------
 * WHY THE TOKEN CARRIES ALL THREE DATABASES
 * ---------------------------------------------------------------------------
 * The archetype picker chooses which dataset the tour OPENS on. It is not a
 * lock: docs/architecture.md wants the presenter able to switch databases inside
 * the product ("the dev token already carries all three demo DBs, so the DB
 * switcher offers them offline"), and the owner confirmed that 2026-08-24. The
 * product's switcher renders one entry per token `dbs[]` element, so a one-DB
 * token leaves it with nothing to switch to.
 *
 * That works offline because replay-shim.js indexes the recording matching
 * localStorage['rrv8.activeDb'] and re-indexes on the next request after a
 * switch -- see bundle-runtime/replay-shim.js. A database whose recording is not
 * in this bundle still appears in the switcher and replays as misses; the shim's
 * overlay names the dataset, so that reads as "not captured yet" rather than as
 * a broken page.
 *
 * No signature is verified anywhere -- the shim intercepts the network -- so an
 * unsigned token is the honest, dependency-free way to establish the session.
 *
 * Vanilla ES5. Attaches window.RRTour.
 */
(function (root) {
  'use strict';

  var VALC = 'http://localhost:8080';

  // THE ARCHETYPE IS THE DATASET.
  //   cos   the reconciliation-bearing working set per DB, from
  //         RapidReconciler-AI/docs/plans/demo-capture-manifest.md. Not the full
  //         F0006 roster (Demo1 alone has 828); the pickers only surface these.
  //   port  last-known Services port, used ONLY when VALC is unreachable. Offline
  //         replay never contacts it -- the shim matches by request path, not host.
  //   spine the company the tour opens on for this dataset.
  var ARCHETYPES = {
    summit: { name: 'Summit Industrial',      db: 'RapidReconciler_Demo1', port: 34537,
              cos: ['80002', '80008'], spine: '80002' },
    harbor: { name: 'Harbor Wholesale Group', db: 'RapidReconciler_Demo2', port: 45585,
              cos: ['80003', '80004', '80010', '80013', '80023', '80041'], spine: '80003' },
    golden: { name: 'Golden Harvest Foods',   db: 'RapidReconciler_Demo3', port: 37384,
              cos: ['30001', '30002'], spine: '30001' }
  };

  var PERSONAS = {
    administrator: { fn: 'Arthur Admin',     first: 'Arthur', u: 'arthur@rrdemo.com', viewRole: 'admin',      adm: true  },
    analyst:       { fn: 'Andy Analyst',     first: 'Andy',   u: 'andy@rrdemo.com',   viewRole: 'analyst',    adm: false },
    accountant:    { fn: 'Angie Accountant', first: 'Angie',  u: 'angie@rrdemo.com',  viewRole: 'accountant', adm: false }
  };

  function b64url(o) {
    return btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  // The Services port comes from VALC's Deployment Center -- the same source
  // AuthController stamps into a real login token's ip -- so a stale hardcoded
  // port can never strand the demo when an agent is relaunched on another port.
  // Bounded, so an unreachable or slow VALC cannot stall the hand-off.
  function resolvePort(db, fallback) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, 1500) : null;
    return fetch(VALC + '/api/services/agent-port?db=' + encodeURIComponent(db),
                 { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.port) ? j.port : fallback; })
      .catch(function () { return fallback; })
      .then(function (port) { if (timer) clearTimeout(timer); return port; });
  }

  // Rewind everything a previous run of any archetype could have left behind.
  function clearRunState() {
    try {
      // Replay sequence pointers, every dataset. They are namespaced per DB, so a
      // single key no longer names them. A pointer left parked on its after-states
      // makes that dataset's save-and-reflect beat change nothing on the click --
      // the "appears to work" the recording ordering exists to prevent.
      var ss = root.sessionStorage, kill = [];
      for (var i = 0; i < ss.length; i++) {
        var k = ss.key(i);
        if (k && k.indexOf('rrv8.demoReplay.ptr') === 0) kill.push(k);
      }
      for (var j = 0; j < kill.length; j++) ss.removeItem(kill[j]);
    } catch (e) {}
    try {
      // The client-side variance-card store. The drill page's Save writes the
      // finding to rrv8.txvCards.<db>.<co> in localStorage as well as to the agent,
      // and localStorage is NOT rewound by the pointer reset. Measured 2026-08-22:
      // after one presenter run the card opened already reading "Your recorded
      // finding", so the Save beat changed nothing -- same failure, different route.
      var ls = root.localStorage, drop = [];
      for (var a = 0; a < ls.length; a++) {
        var key = ls.key(a);
        if (key && key.indexOf('rrv8.txvCards.') === 0) drop.push(key);
      }
      for (var b = 0; b < drop.length; b++) ls.removeItem(drop[b]);
    } catch (e) {}
  }

  /**
   * Seed the offline session. Returns a promise that resolves once the token is
   * written -- callers must await it before loading a product frame, or the page
   * boots unauthenticated.
   *
   * @param {string} archetypeKey  summit | harbor | golden
   * @param {string} roleKey       administrator | analyst | accountant
   */
  function seed(archetypeKey, roleKey) {
    var A = ARCHETYPES[archetypeKey];
    var P = PERSONAS[roleKey];
    if (!A || !P) return Promise.resolve(null);

    var keys = Object.keys(ARCHETYPES);
    return Promise.all(keys.map(function (k) {
      return resolvePort(ARCHETYPES[k].db, ARCHETYPES[k].port);
    })).then(function (ports) {
      var dbs = keys.map(function (k, i) {
        var X = ARCHETYPES[k];
        return { n: X.db, ip: 'localhost:' + ports[i], t: { adm: P.adm },
                 perms: { dm: true }, i: X.cos.slice() };
      });
      var payload = { user: { fn: P.fn, u: P.u }, dbs: dbs, exp: 2082758400 };
      try {
        root.localStorage.setItem('rrv8.token', 'eyJhbGciOiJub25lIn0.' + b64url(payload) + '.demo');
        root.localStorage.setItem('rrv8.activeDb', A.db);      // the archetype picks the OPENING dataset
        root.localStorage.setItem('rrv8.viewRole', P.viewRole);
        root.localStorage.setItem('rrv8.aiTier', 'grounded');  // Basic -- the safe, always-answering tier
        root.localStorage.setItem('rrv8.analystCompany.' + A.db, A.spine);
      } catch (e) {}
      clearRunState();
      return A;
    });
  }

  root.RRTour = {
    ARCHETYPES: ARCHETYPES,
    PERSONAS: PERSONAS,
    seed: seed,
    clearRunState: clearRunState,
    // <role>-<archetype>.html -- nine pages, one per combination.
    pageFor: function (roleKey, archetypeKey) {
      return (roleKey && archetypeKey) ? (roleKey + '-' + archetypeKey + '.html') : null;
    }
  };
})(typeof window !== 'undefined' ? window : this);
