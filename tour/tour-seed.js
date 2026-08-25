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
      // EVERY per-session key, not just the replay pointers.
      //
      // Replay sequence pointers were the original target: namespaced per DB, and a
      // pointer left parked on its after-states makes that dataset's
      // save-and-reflect beat change nothing on the click -- the "appears to work"
      // the recording ordering exists to prevent.
      //
      // But the pointers were never the only per-session state, and the rest of it
      // changes what the AI is ASKED. MEASURED 2026-08-24 on analyst-golden: the
      // product keeps the viewed period in sessionStorage, so a second run of the
      // tour opened with Apr 30 already viewed (the transaction beat had set it on
      // the first run). The day brief grounds on the viewed period, its prompt
      // signature is tier|db|company|facts, so a different viewed period is a
      // different prompt -- and a prompt the capture walk never asked is a MISS.
      // Beat 1's AI card came up neutral on the second run and clean on the first,
      // which is the worst possible failure shape: it works in rehearsal and not in
      // front of the prospect, or the reverse. Proved by control: clearing
      // sessionStorage restored the captured 2023-05-31 brief and emptied misses().
      //
      // So this clears the WHOLE store rather than a list of prefixes, because an
      // allowlist is a list somebody has to keep up to date and the failure mode is
      // silent. The one exception is the `rrdemo.` handoff pair (stage / recRole),
      // which a rail's Exit writes for index.html to read on the next page -- those
      // are cross-page, not per-run, and clearing them would lose the "Angie next"
      // recommendation.
      var ss = root.sessionStorage, kill = [];
      for (var i = 0; i < ss.length; i++) {
        var k = ss.key(i);
        if (k && k.indexOf('rrdemo.') !== 0) kill.push(k);
      }
      for (var j = 0; j < kill.length; j++) ss.removeItem(kill[j]);
    } catch (e) {}
    try {
      // The client-side variance-card store. The drill page's Save writes the
      // finding to rrv8.txvCards.<db>.<co> in localStorage as well as to the agent,
      // and localStorage is NOT rewound by the pointer reset. Measured 2026-08-22:
      // after one presenter run the card opened already reading "Your recorded
      // finding", so the Save beat changed nothing -- same failure, different route.
      // Plus the per-company run state that also feeds the brief's facts: the
      // period-review flag (the brief cites REVIEW STATE), the disposition store and
      // the balancing-entry export log. Same reasoning as the sessionStorage sweep
      // above -- these are things a previous run DID, and a tour should open on the
      // state the recording was captured in, not on the state of the last rehearsal.
      // Left alone deliberately: rrv8.token, rrv8.activeDb, rrv8.viewRole,
      // rrv8.aiTier and rrv8.analystCompany, because seed() sets all five itself a
      // few lines below and clearing them here would just race its own writes.
      var ls = root.localStorage, drop = [];
      for (var a = 0; a < ls.length; a++) {
        var key = ls.key(a);
        if (key && (key.indexOf('rrv8.txvCards.') === 0
                 || key.indexOf('rrv8.analystReview.') === 0
                 || key.indexOf('rrv8.dispos.') === 0
                 || key.indexOf('rrv8.beExports.') === 0
                 || key === 'rrv8.subview'
                 || key === 'rrv8.homeSections')) drop.push(key);
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
