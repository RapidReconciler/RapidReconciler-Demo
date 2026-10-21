/*
 * RRV8 — runtime configuration
 *
 * The COMMITTED version of this file is the DEV config: mode = 'staging'
 * so the dev workflow exercises the live RR data-services agent. This is
 * the V8 agent-first tenet (see feedback_v8_agent_first.md in memory):
 * snapshots exist as a deployment artifact, not as the dev mode. To
 * intentionally read from snapshots (e.g. when the agent is offline or
 * for an external reader on GitHub Pages), append `?mode=demo` to the
 * URL. Customer-facing prod deploys overwrite this file at publish time
 * with their own `window.RR_CONFIG` block — the HTML stays byte-identical
 * between environments.
 *
 * Precedence at boot:
 *   1. ?mode= URL parameter wins (engineer / QA override)
 *   2. window.RR_CONFIG.mode below
 *   3. 'demo' fallback
 *
 * Field reference:
 *   mode          — 'demo' | 'staging' | 'prod'. Drives every IS_DEMO
 *                   branch in the page.
 *   authBase      — VALC login endpoint root. Null = use the per-mode
 *                   default from RR_AUTH_BASES at boot:
 *                     staging → https://staging-valcspa.cloudapp.net
 *                     prod    → https://rr-valc-spa.cloudapp.net
 *                   Set explicitly here to override (e.g. a local
 *                   mock VALC for offline testing).
 *   dataPath      — only used in demo mode. Where to fetch the static
 *                   JSON snapshots from. Relative to the HTML.
 *   statusPollMs  — interval for re-checking the SQL Agent job status
 *                   (System Status light). null = don't poll. Prod
 *                   default: 60000 (1 minute).
 *   testAgentBase — base URL of the green-field per-DB data-services
 *                   test agent (RapidReconciler-Agent). The four
 *                   endpoints it owns (inventory/reconciliation/rows,
 *                   inventory/reconciliation/history,
 *                   inventory/audit-detail,
 *                   inventory/variance-component) are routed here in
 *                   staging/prod mode while v359 keeps the rest at
 *                   activeDb.ip. Set to null on a customer install
 *                   that doesn't run the test agent yet.
 *   release       — version label shown in the user menu.
 *   buildStamp    — date the deploy was cut; surfaces in diagnostics.
 *
 * See docs/plans/v8-demo-prod-mode.md for the full design rationale.
 */
window.RR_CONFIG = {
  mode:          'staging',
  // authBase: where V8's login modal POSTs credentials (rrLogin in
  // each page's IIFE → ${authBase}/resource/client/login). Point at
  // local VALC 2.0 so JWTs come from our Postgres, not the legacy
  // staging-valcspa.cloudapp.net (which mints tokens scoped to real
  // customer tenants with external host IPs in dbs[i].ip). When null,
  // RR_AUTH_BASES[mode] is the fallback -- that's how the page used
  // to behave on this dev box.
  authBase:      'http://localhost:8080',
  dataPath:      'data/',
  statusPollMs:  60000,
  testAgentBase: 'http://localhost:34537',
  valcBase:      'http://localhost:8080',
  release:       'V8',
  buildStamp:    '2026-05-30',
  // statusAnchor — GSI's always-up public edge, used by the
  // Connection Check fault-isolator (HelpDesk/connection-check.html)
  // as the "is the internet + GSI reachable" baseline probe. Per the
  // install-prep doc this is the documented host customer IT uses to
  // verify outbound 443. Override per deploy if the public landing
  // host changes.
  //
  // UI-160, 2026-08-27: was `rapidreconciler.getgsi.com`. Both hosts
  // still answer 200 with the same AngularJS app, from different edges
  // (measured: .getgsi.com -> 40.76.210.54, Last-Modified 2026-03-24;
  // -prod.getgsi.com -> 20.119.8.37, Last-Modified 2026-08-26). There
  // is NO redirect between them, so the old host is not dead -- it is a
  // five-month-stale mirror that a reachability probe cannot tell apart
  // from the live one. That is exactly why this anchor had to move: a
  // green Connection Check against a host nobody deploys to any more is
  // a false pass.
  statusAnchor:  'https://rapidreconciler-prod.getgsi.com'
};

// Endpoint prefixes that route to mini-VALC (the dev-side stand-in
// for production VALC's central Postgres + Admin surface). The
// per-DB data-services agent owns customer-specific data
// (rcompanies, rtransactions, ritems, ...); mini-VALC owns the
// cross-DB stuff (users, licensed-companies registry, deploys).
// Areas starting with any of these prefixes go to RR_CONFIG.valcBase
// instead of the test agent or the active DB IP.
window.RR_VALC_PREFIXES = [
  'api/v1/admin/',   // /api/v1/admin/users, /api/v1/admin/clients, ...
  'api/v1/ai/'       // AI Assistant gateway — key stays server-side in VALC
];

// Areas served by the green-field test agent instead of v359. The set
// is duplicated in each page's rrFetch (no shared script). Update both
// when adding an endpoint.
//
// The migration plan retires v359 endpoint-by-endpoint into the test
// agent. As each test-agent controller ships, its area moves here so
// V8 routes to it. See `RRV8/HANDOFF.md` § Test agent online for the
// current migration state; `feedback_v8_test_agent_default` in memory
// for the routing rule.
window.RR_TEST_AGENT_AREAS = [
  // Inventory module — net-new endpoints first wave
  'inventory/reconciliation/rows',
  'inventory/reconciliation/history',
  'inventory/reconciliation/by-company',
  // Period-end journal-entry source: account-level reconciling lines
  'inventory/suggested-je',
  'inventory/audit-detail',
  'inventory/variance-component',
  // DMAAI overlay (analyzer worklist persistence)
  'inventory/integrity/aai-analysis-latest',
  'inventory/integrity/aai-responses',
  'inventory/integrity/aai-save-responses',
  // DMAAI account resolver — per-account 4152-model vs 4240-GL pivot + mismatch
  // flags for the analyst Transaction-Variance analyzer + Home txv card diagnosis.
  // Read the same view at two depths (compact card line + full details analyzer).
  'inventory/integrity/dmaai-resolve',
  // v359 migration — endpoints absorbed by the test agent in order:
  //   inventory/status                          2026-05-24  (boot-time filter universe + validation light)
  //   inventory/reconciliation-filtered         2026-05-24  (Recon summary + barChart)
  //   inventory/transactions                    2026-05-24  (bulk Transactions grid fetch)
  //   inventory/transactions/details            2026-05-24  (per-doc usp6compare2 breakdown)
  //   inventory/transactions/save-notes         2026-05-24  (worknotes upsert)
  //   inventory/integrity                       2026-05-24  (DMAAIs preload + Cardex Variance grid)
  //   inventory/as-of                           2026-05-24  (As Of bulk grid)
  //   inventory/as-of/details                   2026-05-24  (As Of Details popover)
  //   inventory/rollIItem                       2026-05-24  (Cardex Variance Re-roll button)
  //   poll                                      2026-05-24  (System Status 60s poll)
  //   system-status                             2026-05-24  (diagnostic Excel generator)
  //   download-excel/*                          2026-05-24  (diagnostic Excel binary)
  //   available-periods                         2026-05-24  (closed-period list — FINAL v359 migration)
  'inventory/status',
  'inventory/reconciliation-filtered',
  'inventory/transactions',
  'inventory/transactions/details',
  'inventory/transactions/save-notes',
  'inventory/integrity',
  'inventory/as-of',
  'inventory/as-of/details',
  'inventory/rollIItem',
  // V8 cardex corrective action (CardexCorrectionController) — supersedes rollIItem
  'inventory/cardex-worklist',
  'inventory/adjustment-ledger',
  'inventory/set-beginning-balance',
  'inventory/undo-adjustment',
  'inventory/cardex-work-status',
  // Reload GL — self-service GL maintenance (ReloadGlController, admin-gated)
  'inventory/reload-gl',
  'inventory/reload-gl/preview',
  // Reload Cardex — self-service cardex maintenance (ReloadCardexController,
  // admin-gated): end-of-day check (suggested reload date), per-date preview,
  // and execute. These were MISSING from the route table, so the page fetched
  // them against the JWT's db.ip without :34537 and silently failed (blank
  // banner, no preview count).
  'inventory/reload-cardex',
  'inventory/reload-cardex/preview',
  'inventory/reload-cardex/eod-check',
  // Fiscal Period-End correction (FiscalPeriodEndController, admin-gated):
  // detect the stale date, preview the per-table row counts a date-swap
  // would move, then apply.
  'inventory/fiscal-period-end-detect',
  'inventory/fiscal-period-end-preview',
  'inventory/fiscal-period-end-apply',
  'poll',
  'system-status',
  'available-periods',
  // Admin actions
  'jobs/refresh/start',
  // Diagnostics endpoints that don't exist on the new agent yet but
  // are routed here anyway so V8 hits the local agent (404 cleanly)
  // instead of the JWT's activeDb.ip (an external GSI host the dev
  // box can't reach over HTTPS). V8's fall-through path at
  // rrFetch hardcodes https:// + db.ip, which dies against
  // localhost:34537 (HTTP-only). Until those endpoints land or V8's
  // fall-through gets scheme-aware, parking them in the test-agent
  // table is the cleanest way to keep diagnostic noise localised.
  'system-status-log',
  'system/agent-log',
  // Administrator
  'admin/companies',
  // Proactive memory-pressure read behind Home's Service-health card
  'admin/service-health',
  // Recent system events — the Activity Log page + Home's mini activity feed
  'admin/activity',
  // Data Refresh Schedule — read-only review card in Home's Administrator
  // area (initial load + nightly refresh times). GSI manages the schedule;
  // the customer admin reviews it only.
  'admin/refresh-schedule',
  // Model DMAAI Review — sign-off read + the enriched model baseline
  'inventory/integrity/model-approval',
  'inventory/integrity/model-baseline',
  // Data purge — current cutoff/size/dates + set-cutoff write + audit history
  'inventory/integrity/purge-info',
  'inventory/integrity/purge-cutoff',
  'inventory/integrity/purge-log',
  // Home awareness pills — role-agnostic cross-section status roll-up
  // (readable by any authenticated role; actions stay gated). See API.md.
  'home/status-summary',
  // Per-company cardex materiality tolerance (GET any role; PUT analyst-gated).
  'inventory/cardex-tolerance',
  // Standing per-line offset accounts for the balancing entry (UI-162). GET/PUT/
  // DELETE, all scoped to the caller's companies. RRV8.offsetStore reaches this
  // through RRDB.agentBase() rather than rrFetch, but the area is listed here so
  // anything that DOES route by area lands on the agent rather than v359, which
  // has no such endpoint.
  'inventory/gl-offset-account'
];

// Endpoints with a variable path segment that rrFetch needs to route
// to the test agent. Tested with `area.startsWith(prefix)`.
window.RR_TEST_AGENT_PREFIXES = [
  'download-excel/',
  'admin/companies/'    // per-company edit (PUT /admin/companies/{n})
];

// Per-mode VALC defaults. Used when RR_CONFIG.authBase is null and
// the resolved MODE is staging or prod. Engineering overrides
// authBase in their customer-specific config.js at deploy time.
window.RR_AUTH_BASES = {
  staging: 'https://staging-valcspa.cloudapp.net',
  prod:    'https://rr-valc-spa.cloudapp.net'
};

/*
 * RRDB — the ONE canonical active-database resolver. Every page MUST resolve
 * "which DB am I scoped to / which agent do I call" through here. Do NOT
 * hand-roll it per page — that drift is what caused the recurring cross-DB
 * scoping bugs (pages variously read a hardcoded 0, a `activeDbIndex` field
 * that the JWT does NOT carry, or preferred the single dev test agent).
 *
 * THE RULE: the active DB is the sticky `rrv8.activeDb` selection (set by
 * RRV8.setActiveDatabase / RRDB.setActive on a DB switch), resolved BY NAME
 * against the token's dbs[]. The JWT has no activeDbIndex — never read one.
 *
 * Self-sufficient: uses a hydrated window.RR_SESSION when present (sidebar.js /
 * page boot), else decodes localStorage.rrv8.token directly — so the
 * self-contained analyst pages (no sidebar.js) get the SAME answer.
 *
 * Usage in a page's fetch:
 *   const base = window.RRDB.agentBase();   // active DB's agent (per-DB ip → testAgentBase)
 *   const db   = window.RRDB.active();       // {n, ip, i, m, t, perms, rn, ...}
 */
window.RRDB = (function () {
  function _session() {
    try { var s = window.RR_SESSION; if (s && Array.isArray(s.dbs) && s.dbs.length) return s; } catch (_) {}
    return null;
  }
  function _decodeToken() {
    try {
      var t = localStorage.getItem('rrv8.token'); if (!t) return null;
      var b64 = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var pad = b64.length % 4; if (pad) b64 += '='.repeat(4 - pad);
      return JSON.parse(decodeURIComponent(atob(b64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join('')));
    } catch (_) { return null; }
  }
  function dbs() {
    var s = _session(); if (s) return s.dbs;
    var p = _decodeToken(); return (p && Array.isArray(p.dbs)) ? p.dbs : [];
  }
  function index() {
    var list = dbs(), saved = null;
    try { saved = localStorage.getItem('rrv8.activeDb'); } catch (_) {}
    if (saved) for (var i = 0; i < list.length; i++) if (list[i] && list[i].n === saved) return i;
    return 0;
  }
  function active() { var list = dbs(); return list[index()] || list[0] || {}; }
  function name() { return active().n || '_'; }
  function agentBase() {
    var d = active();
    if (d && d.ip) return (/^(?:localhost|127\.0\.0\.1)\b/i.test(d.ip) ? 'http://' : 'https://') + d.ip;
    return (window.RR_CONFIG && window.RR_CONFIG.testAgentBase) || 'http://localhost:34537';
  }
  function setActive(n) {
    if (!n) return;
    try { localStorage.setItem('rrv8.activeDb', n); } catch (_) {}
    var s = _session();
    if (s) for (var i = 0; i < s.dbs.length; i++) if (s.dbs[i] && s.dbs[i].n === n) { s.activeDbIndex = i; break; }
  }
  return { dbs: dbs, index: index, active: active, name: name, agentBase: agentBase, setActive: setActive };
})();

/*
 * RRAI — the ONE global AI-plan-tier setting, shared across every page that
 * loads config.js. This is the DEMO plan switcher: it lets a presenter flip the
 * level of AI integration live and re-run the SAME question to show how the
 * result changes per purchased tier. Four tiers, escalating by how much / how
 * identifiable the data sent to the model is:
 *
 *   off      — AI disabled. No data leaves the page; the surface shows only the
 *              deterministic figures (visible-but-disabled / upsell state).
 *   grounded — shown as "Basic". The model sees ONLY the on-screen deterministic
 *              figures already computed (no history/tracing, minimal data).
 *              ("Docs-grounded" in the server's ai/health vocabulary — normalized here.)
 *   scrubbed — shown as "Enhanced". Fuller underlying data, but customer-identifying
 *              fields are masked before the call (e.g. "Co 90001" → "Entity A").
 *   full     — full real data with identifiers + full generative latitude.
 *
 * Persisted to localStorage.rrv8.aiTier (one global key, not per-DB, so the
 * demo setting is consistent everywhere). setTier fires a 'rrv8:aitierchange'
 * window event so any open surface can re-run its AI read against the new tier.
 * Each AI-using page reads RRAI.get() when building its prompt and applies the
 * matching transform (see home.html _recsummaryLevel / renderAiBriefing).
 */
window.RRAI = (function () {
  var TIERS  = ['off', 'grounded', 'scrubbed', 'full'];
  // Display labels are plain-language tiers (Off / Basic / Enhanced / Full) — the
  // old "Grounded" / "Scrubbed" read as jargon and invited questions. Internal keys
  // ('grounded' / 'scrubbed') stay unchanged so logic + saved prefs keep working.
  var LABELS = { off: 'Off', grounded: 'Basic', scrubbed: 'Enhanced', full: 'Full' };
  var BLURB  = {
    off:      'AI turned off — deterministic figures only, no data leaves the page',
    grounded: 'AI sees only the on-screen figures',
    scrubbed: 'AI sees fuller data with identities masked',
    full:     'AI sees full data with identities'
  };
  // Normalize any input (incl. the server's ai/health 'docs' level) to a tier key.
  function norm(t) {
    t = String(t == null ? '' : t).toLowerCase();
    if (t === 'docs') t = 'grounded';   // ai/health maxLevel vocabulary → our key
    return TIERS.indexOf(t) >= 0 ? t : null;
  }
  function get() {
    try { return norm(localStorage.getItem('rrv8.aiTier')) || 'full'; } catch (_) { return 'full'; }
  }
  function setTier(t) {
    t = norm(t); if (!t) return;
    try { localStorage.setItem('rrv8.aiTier', t); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('rrv8:aitierchange', { detail: { tier: t } })); } catch (_) {}
    return t;
  }
  return {
    TIERS: TIERS, LABELS: LABELS, BLURB: BLURB,
    norm: norm, get: get, set: setTier, label: function (t) { return LABELS[norm(t) || 'full']; }
  };
})();

/*
 * RRV8 shared helpers (config-level, so every page that loads config.js gets them
 * regardless of sidebar.js load order — sidebar.js also does `RRV8 = RRV8 || {}`).
 *
 *  - exportName(): the ONE download-filename convention. Any .xlsx / .pdf export
 *    routes through this so a downloaded file is self-describing out of context:
 *      RR_<Surface>_<DB>_<Scope>_<Period>_<YYYYMMDD-HHmm>.<ext>
 *    (illegal filesystem chars stripped, spaces → hyphens). company:number → CoNN,
 *    company 'all'/null → AllCos; drill appended with '-'; period + tokens omitted
 *    when not supplied. DB is the active database name.
 *
 *  - logActivity(): one-way, best-effort append to the server Activity Log
 *    (POST /admin/activity on the active DB's Services jar — an audit trail read by
 *    the Activity Log page + the Home mini-feed). Self-contained (own fetch + JWT)
 *    so it doesn't depend on a page's local rrFetch. Never throws / never blocks the
 *    UI — a logging failure must not break the action it records. Call it AFTER the
 *    primary action succeeds.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  function clean(s) {
    return String(s == null ? '' : s).trim()
      .replace(/[\\/:*?"<>|]+/g, '')   // filesystem-illegal
      .replace(/\s+/g, '-');           // no spaces in filenames
  }
  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  window.RRV8.exportName = function (opts) {
    opts = opts || {};
    var parts = ['RR'];
    if (opts.surface) parts.push(clean(opts.surface));
    var db = '';
    try { db = (window.RRDB && RRDB.name && RRDB.name()) || ''; } catch (_) {}
    if (db && db !== '_') parts.push(clean(db));
    var scope = [];
    if (opts.company != null && String(opts.company).trim() !== '') {
      var c = String(opts.company).trim();
      scope.push(c.toLowerCase() === 'all' ? 'AllCos' : ('Co' + clean(c)));
    } else if (opts.scope) {
      scope.push(clean(opts.scope));
    }
    if (opts.drill) scope.push(clean(opts.drill));
    if (scope.length) parts.push(scope.join('-'));
    if (opts.period) parts.push(clean(opts.period));
    parts.push(stamp());
    var ext = (clean(opts.ext) || 'xlsx').replace(/^\.+/, '');
    return parts.join('_') + '.' + ext;
  };
  window.RRV8.logActivity = function (event, detail) {
    try {
      var base = (window.RRDB && RRDB.agentBase && RRDB.agentBase())
        || (window.RR_CONFIG && RR_CONFIG.testAgentBase);
      if (!base) return Promise.resolve();
      var h = { 'Content-Type': 'application/json;charset=UTF-8', 'Accept': 'application/json' };
      try { var t = localStorage.getItem('rrv8.token'); if (t) h['Authorization'] = 'Bearer ' + t; } catch (_) {}
      return fetch(base + '/admin/activity', {
        method: 'POST', headers: h,
        body: JSON.stringify({ event: String(event == null ? '' : event), detail: String(detail == null ? '' : detail) })
      }).then(function () {}).catch(function () {});   // one-way audit append; swallow all errors
    } catch (_) { return Promise.resolve(); }
  };
  /* logActivityStrict(event, detail) -> Promise, REJECTS on failure.
   *
   * logActivity above is deliberately silent, and its contract says to call it
   * AFTER the primary action succeeds. That is right when the log is a nicety: a
   * failed audit append must not break an export the analyst already completed.
   *
   * It is wrong when the audit entry IS the action's justification. Reversing a
   * period close that someone downstream already acted on is only defensible
   * because a record says who reversed it and why. Writing that record
   * best-effort would mean the reversal proceeds whether or not anybody can ever
   * see who did it — an unattributable trail, which is worse than refusing.
   *
   * So this variant reports. Callers write the record FIRST and abandon the
   * action if it fails. Same endpoint, same server-side JWT stamping; the only
   * difference is that failure reaches the caller.
   */
  window.RRV8.logActivityStrict = function (event, detail) {
    var base;
    try {
      base = (window.RRDB && RRDB.agentBase && RRDB.agentBase())
        || (window.RR_CONFIG && RR_CONFIG.testAgentBase);
    } catch (_) { base = null; }
    if (!base) {
      return Promise.reject(new Error('no Services connection, so nothing could record who did this'));
    }
    var h = { 'Content-Type': 'application/json;charset=UTF-8', 'Accept': 'application/json' };
    try { var t = localStorage.getItem('rrv8.token'); if (t) h['Authorization'] = 'Bearer ' + t; } catch (_) {}
    return fetch(base + '/admin/activity', {
      method: 'POST', headers: h,
      body: JSON.stringify({ event: String(event == null ? '' : event), detail: String(detail == null ? '' : detail) })
    }).then(function (r) {
      if (!r.ok) {
        throw new Error(r.status === 401 || r.status === 403
          ? 'your session is not authorized to write the audit record'
          : 'the audit record could not be saved (HTTP ' + r.status + ')');
      }
    });
  };
  // collapseActivity(): fold a run of CONSECUTIVE identical events (same label +
  // same actor) into one row carrying a _count (and _oldestAt) — so a burst of
  // "Report engine started" (a rebuild bounce logs one per boot) shows as a single
  // "×N" line and the meaningful events stay visible. Shared by the Home card
  // mini-feed and the full Activity Log so the two agree. Input expected newest-first.
  window.RRV8.collapseActivity = function (list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i], prev = out[out.length - 1];
      if (prev && String(prev.event == null ? '' : prev.event) === String(e.event == null ? '' : e.event)
               && String(prev.by == null ? '' : prev.by) === String(e.by == null ? '' : e.by)) {
        prev._count = (prev._count || 1) + 1;
        prev._oldestAt = e.at;   // newest-first → each subsequent row is older
        continue;
      }
      var copy = {}; for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k)) copy[k] = e[k];
      copy._count = 1; copy._oldestAt = e.at;
      out.push(copy);
    }
    return out;
  };
  // dataAccessLine(): the per-tier "DATA ACCESS — <Tier>" instruction line that
  // EVERY analyst-facing ai/explain prompt must carry. Two jobs in one line:
  //   (1) it instructs the model per the exposure ladder (Grounded = on-screen
  //       figures only; Scrubbed = generic labels / roles, no real names; Full =
  //       specifics + provenance), so Full genuinely differs from Grounded; and
  //   (2) it is the drift-stable REPLAY KEY discriminator — request-signature.js
  //       aiExplainKey() reads the tier out of this exact "DATA ACCESS … <Tier>"
  //       marker. WITHOUT it, all three tiers hash to ONE signature (tier=na) and
  //       a demo recording cannot replay per tier. Keep the words Grounded /
  //       Scrubbed / Full verbatim (the key regex matches them); the UI labels
  //       (Basic / Enhanced / Full) are cosmetic and live in RRAI.LABELS.
  window.RRV8.dataAccessLine = function (exposure) {
    var e = (window.RRAI && RRAI.norm(exposure)) || exposure;
    switch (e) {
      case 'grounded':
        return 'DATA ACCESS — Grounded: use ONLY the on-screen figures already shown; do not trace history, name source tables, or add provenance.';
      case 'scrubbed':
        return 'DATA ACCESS — Scrubbed: refer to every company, account, and person by a generic label or role only — never by a real name or number.';
      case 'full':
        return 'DATA ACCESS — Full: you may cite specifics — company and account numbers, item and document IDs, exact dates, and the source of each figure.';
      default:
        return '';   // 'off' never reaches the model; unknown → no line
    }
  };
  // aiCtx(): a stable, server-IGNORED disambiguator appended to an analyst
  // ai/explain URL as ?ctx=… . It exists ONLY to make the demo replay signature
  // unique per (surface, company, period): request-signature.js folds the sorted
  // query into the key, so two briefings that produce the SAME model prompt (e.g.
  // Scrubbed masks the company to "this company" for both Co A and Co B) still get
  // DISTINCT recordings. It travels in the URL, never the body, so it never
  // reaches the model — Scrubbed masking and Full latitude are untouched, and the
  // gateway ignores the unknown param (verified 200). Pair it with dataAccessLine
  // (which carries the tier in the body): together the key is (surface, co,
  // period, tier). Real company numbers are fine here — the demo companies are
  // fictional and the value never leaves the box.
  window.RRV8.aiCtx = function (surface, co, period) {
    var parts = [String(surface || 'ai')];
    if (co != null && String(co).trim() !== '') parts.push('co' + String(co).trim());
    if (period != null && String(period).trim() !== '') parts.push(String(period).trim());
    return encodeURIComponent(parts.join('-').replace(/\s+/g, ''));
  };
  // <<AI-GROUNDING GENERATED START -- do not edit by hand>>
  // ACCT_GROUNDING — the AI's compact copy of the accountant playbook. Prepended to
  // every accountant-facing AI prompt so the reads reason from firm policy, not
  // generic LLM accounting. SOURCE OF TRUTH = docs/plans/accounting-reference.md;
  // keep this in sync with it (same discipline as dmaai-reference.md ↔
  // AiService.DMAAI_GROUNDING). Owner (accounting SME) curates the policy values.
  window.RRV8.ACCT_GROUNDING = [
    'ACCOUNTING POLICY (reconciliation) — reason from these rules:',
    '- RR reconciles inventory to GL; JDE is the book of record. You surface the gap, explain it, and produce the correcting entry the accountant posts in JDE. RR does not post, hold the ledger, or run schedules.',
    '- Materiality: an out-of-balance under $100 is immaterial regardless of %; a GL balance under $1,000 is dormant/near-zero — frame by absolute amount and suppress the %. Otherwise judge by the gap as a share of the GL balance (well under ~1% is immaterial).',
    '- The out-of-balance decomposes into components. ACCOUNTANT-OWNED (journal these): carry forward, transactions, manual entries. NOT the accountant\'s: unposted GL batches + end-of-day (operations timing — self-clears when operations posts, never journal it) and cardex (self-heals on the analyst\'s roll-forward refresh, not a JE). The adjusting entry uses ONLY the accountant-owned amount; never journal the timing.',
    '- Reclass vs JE: a transaction in the wrong period/account is a reclass, not a new balancing JE. A roll-forward break (red dot) resolves on the analyst side at the next refresh, not the accountant\'s and not a JE.',
    '- Large carry-forward: when a company\'s carry-forward exceeds 25% of its GL balance OR $50,000 (whichever first), advise absorbing it over ~6 periods (per-period = carry-forward / 6) rather than booking it all at once, to avoid a lumpy P&L hit. Advise ONLY — do not build the fractional entry; the amortization schedule lives in JDE, not RR.',
    '- Adjusting entry: one real offset account per inventory account (no generic clearing account); excludes timing; two lines per gap (original account + its offset).',
    '- Closed/prior periods are already journaled — never prescribe an entry for them; a carry-forward\'s source is the prior period.',
    '- Audience is JDE-fluent finance, not IT: plain accountant English; JDE artifacts (F4111, F0911, AAI) are fine, no plumbing terms.'
  ].join('\n');
  // ANALYST_GROUNDING -- GENERATED from the knowledge-base docs by
  // Tools/build-ai-grounding.py. DO NOT edit by hand: edit the source
  // docs and re-run the generator (or let the GHA regenerate on push).
  // Sources: AnalysisGuides/_catalog/analyst/transaction.md, AnalysisGuides/_catalog/analyst/period-workflow.md
  window.RRV8.ANALYST_GROUNDING = [
    'ANALYST POLICY (transaction variance) — reason from these rules:',
    '- VARIANCE IS ALWAYS A DIFFERENCE: whenever two figures that should equal each other do not, that gap IS a variance — full stop. "Expected" / "explained" describes the CAUSE of a variance you can account for; it NEVER downgrades the gap to "not a variance" (two scales that disagree still disagree — knowing why does not make them equal). Disposition every variance as EXPLAINED / no-action or UNEXPLAINED / investigate; never as "not a variance," "not a real variance," or "not a variance to chase."',
    '- SIGN CONVENTION: reason in the NATURAL sign shown on screen — the stored and displayed figures already carry it, and the reconciliation ties to the on-screen KPI in that sign. Do not silently flip signs to "make it balance"; a sign flip belongs only in an Excel/PDF out-of-balance column, never in the reasoning.',
    '- DMAAI ROUTING is already grounded server-side on every AI call (the model-DMAAI 4152 rules). Reason from account derivation and routing as given; do not restate or re-derive the DMAAI model in this catalog — that copy lives once, on the server.',
    '- RR IS A UTILITY, NOT THE BOOK OF RECORD: JDE is the system of record. RR surfaces the gap, explains it, and drives the source fix or the correcting entry — it does not post to JDE, hold the ledger, gate a close, or enforce attestation. Fixes land at the source (JDE / the operation) or as a journal entry the accountant posts in JDE.',
    '- A transaction variance reconciles ONE document: F4111 (item ledger / cardex) extended value vs F0911 (GL / ledger) for the SAME document and account. Variance = ledger − cardex for that document. So a POSITIVE variance means the GL carries more value than the item ledger, and a NEGATIVE variance means the item ledger carries more. Never state a direction without applying that subtraction — getting it backwards turns overstated into understated. Explain each document on its own terms.',
    '- TIE OR NO TIE. The test is whether the F0911 amount matches the F4111 amount within tolerance. It is BINARY. NEVER express a transaction variance as a percentage or a ratio — it is not a share of anything, and a percentage actively misleads here. State dollars.',
    '- IF F0911 DOES NOT TIE TO F4111, A CORRECTION IS REQUIRED. Always. "Explained" tells the analyst WHY the two sides disagree; it NEVER means leave it alone. The cause decides WHAT the correction is. It does not remove the need for one.',
    '- TIE AT THE RIGHT GRAIN before calling anything unexplained. Two documents against one order, or two accounts on one document, can each fail a document-level tie and still sum exactly to the order total.',
    '- Check DUPLICATE SALES FIRST — rare, but cheap and definitive, so screen for it before any cost / mapping / timing reasoning. When a line is written to the cardex (F4111 / RTransactions) twice, the cardex is overstated by that line while the GL has it once, so the variance EQUALS the duplicated line. dbo.RDuplicateSales flags it. If the facts carry a duplicate-sales flag, LEAD with it — the fix is at the source: reverse the double relief, then close whichever door let it happen (a closed order line re-confirmed at ship-confirm, or an interrupted Sales Update re-run against a workfile that still held its records).',
    '- A transfer ships and receives as TWO INDEPENDENT transactions; each reconciles on its own document. Never explain one leg\'s variance by whether or when the other leg posted.',
    '- In-transit reconciliation (ST↔OT pairing, the 4220 / 4245 in-transit clearing account, the transfer-order Orders page) is a SEPARATE surface. Do NOT invoke a stranded-leg / in-transit / clearing model to explain a per-document cardex-vs-ledger variance — that conflation is wrong.',
    '- A GL-ONLY row (cardex 0, ledger ≠ 0) is most often a NON-STOCK line: the order line type (F4211 / F42119 SDLNTY) is "N", Non-Stock, whose F40205 Inventory Interface is "N". It posts to the G/L and moves no inventory, so no F4111 row exists. THAT IS THE CAUSE, NOT A CLEARANCE — the row still requires a correction.',
    '- NON-STOCK, WHAT TO CHECK AND WHAT TO SAY: read the order line type, then read WHICH ACCOUNT the G/L leg landed on. Verified case: the non-stock extended cost (F4211 / F42119 SDECST on the type-N lines) tied to the F0911 amount to the penny, and the G/L leg had posted to the INVENTORY account — the same account the cardex uses. A non-stock item holds no inventory, so that value does not belong in an inventory account. The tie-out PINPOINTS THE DEFECT; it does not exonerate the row. Never say a non-stock GL-only row is expected, needs no correction, or should not be chased. THE CAUSE IS THE G/L CLASS ON THE LINE, NOT THE DMAAI — verified: the non-stock AAI entry was CORRECT (it pointed away from inventory), while every type-N line carried a STOCK item\'s G/L class instead of the line type\'s own class, and that stock class is what resolves to the inventory account. So DO NOT tell the analyst to change the non-stock DMAAI; tell them to correct the G/L class on those items so a non-stock line stops resolving to inventory. The accountant reclassifies what is already posted.',
    '- NON-STOCK, THE TWO CORRECTIONS: at the SOURCE, the DMAAI directing that non-stock line type is sending non-stock cost to the inventory account — correct the DMAAI so non-stock cost lands on its own non-inventory account. For EXISTING BALANCES, the ACCOUNTANT reclassifies the already-posted non-stock value out of the inventory account (name the lane, never instruct or argue the entry). Until both are done, the G/L inventory balance is overstated against the item ledger by exactly the non-stock total, on every order carrying such a line.',
    '- An A/P VOUCHER (batch type V) posted to an inventory account is a variance that requires a correction, and its cause is a DMAAI error: DMAAI 4330 is sending voucher variances to the inventory account instead of the A/P variance account. Screen for batch type V on an inventory account; if present, the fix is at the SOURCE — correct DMAAI 4330 so voucher variances land on the variance account, and restrict posting-time GL-account overrides on the voucher-match version so the account cannot be keyed over again.',
    '- TRANSFER INTEGRITY (IT) is a PRICING fault on a transfer whose two item-ledger legs are BOTH present: the RECEIPT leg carried a unit cost it never extended, so the item-ledger amount never calculated and a value-neutral location move destroyed inventory value. LEDGERAMOUNT = 0 DOES NOT MEAN THE GL IS MISSING, and writing that is a factual error: F0911 holds BOTH legs of these documents on the SAME account, posted, and they net to zero, which is exactly what a value-neutral move should do. Never describe this population as relieving value with no GL entry. THE FAILING LEG IS THE RECEIPT LEG on every document that causes the card. An earlier note here said "the receiving leg is NOT the discriminator" on the strength of an even relief/receipt split; that measured every zero-extended leg in the company, which is a different and mostly harmless population, so the even split does not describe this card. THE SHAPE IS NARROW, NOT GENERAL: a zero extended cost on a transfer leg is COMMON and harmless, and only the small fraction that ALSO carries a unit cost produces this card. DOCUMENTS MISSING A LEG ARE A DIFFERENT CARD (Transfer Leg Missing) and are claimed before this one, so everything here has both legs. DO NOT call it a named JDE or vendor defect — no article has been cited for it. DO NOT state a cost level or costing method as a property of the pattern: cost level 3 throughout in one verified company and a MIX of levels 2 and 3 in the other. IT IS EPISODIC, NOT A STANDING SETUP FAULT: failures cluster into bursts with clean stretches between them and the most recent verified periods ran clean at normal transfer volume, so never say "it will not clear on its own" — count the failures per period first, and treat a burst that starts and stops as a cost change or a specific set of items rather than a permanent setup error. NEVER STATE A RATE, A DOLLAR TOTAL OR A DOCUMENT COUNT YOU HAVE NOT BEEN GIVEN FOR THIS INSTALL; the specimen figures are one dataset, they live in the analysis guide labelled by company, and repeating them here would assert a number that is false on any other customer. Confirm the signature per document (receipt leg, unit cost, zero extended cost), compare the cost setup of the failing items against items that transferred cleanly in the same period, and note that restoring the lost value is a dollars-only inventory adjustment the ACCOUNTANT books. R41543 / R41544 are NOT the remedy and must NEVER be prescribed for this pattern (owner 2026-08-03, the same ruling that pulled them off Completion Not Journaled). No report is needed to find the rest of the population either: the Transfer Integrity card already holds every priced-at-zero transfer receipt.',
    '- TRANSFER LEG MISSING (IT) is a SEPARATE card and a different fault from Transfer Integrity. JDE writes a transfer as a line-ID PAIR, .000 relief and .500 receipt. These documents hold exactly ONE F4111 row, so the counterpart never reached the item ledger and QUANTITY as well as value moved one way, leaving the receiving location short units, not just dollars. THE GL IS NOT THE PROBLEM: F0911 carries BOTH legs on the same account, posted, netting to zero, so the transfer completed and the item-ledger write is what went missing after it. THE CAUSE IS OPEN AND MUST STAY OPEN IN THE FINDING — say plainly that it is not determined. Two candidates and the RapidReconciler database cannot choose between them: JDE never wrote the row, or the load dropped it (F4111 is keyed on ILUKID alone, so a colliding key is lost on insert with no error raised). NEVER assert one of them. THE DECISIVE TEST is a query against SOURCE JDE F4111 for the document numbers on the card, looking for the missing line ID: both line IDs present in JDE and only one in RR means a load fault, hand over the document numbers; only one line ID in JDE as well means a one-sided item-ledger write, which goes to Oracle through the CUSTOMER\'S OWN IT DEPARTMENT with the F0911 legs attached as evidence that the transfer posted. Direction is not a screen — either leg can be the one missing. Have the analyst read item, location, lot and G/L date across the documents before escalating, because a cluster on one combination and one day frames the escalation differently from failures scattered across the file. Restoring the balance is a quantity-and-value inventory adjustment the ACCOUNTANT books. NEVER STATE A COUNT OR A DOLLAR TOTAL YOU HAVE NOT BEEN GIVEN FOR THIS INSTALL.',
    '- MAKE TO ORDER is a business grouping (a work order linked to its customer sales order), not a variance type. Its residual is ordinary manufacturing cardex-vs-GL and is NOT a DMAAI mapping issue (the routings match the 4152 model) and NOT a missing sales offset (the SOs shipped, status 999). Split it by shape: GL-only rows (cardex 0, ledger ≠ 0) are standard-cost variances — EXPECTED, no action; both-sides-differ rows have NO CONFIRMED CAUSE — the cost-basis explanation (completion valued at standard on the cardex vs actual in the GL) was TESTED on a verified population and does NOT fit: a standard-versus-actual gap should be a modest share of the transaction and fall either side of it, but most of the value sits on rows where the gap exceeds HALF the item-ledger amount, and the GL side is the larger one in about two thirds of the rows and the large majority of the value. Do NOT assert the cost-basis cause. The value also concentrates on very few accounts, so direct the analyst to work them by account, largest account first, with cost accounting (5.16). Where a standard cost genuinely did move after a completion posted, WIP revaluation is the mechanism that carries it to the GL, but NEVER state a report number for it — have the analyst confirm the program and version in their own JDE. Cardex-only rows (ledger 0, cardex ≠ 0) are the COMPLETION-GAP shape and belong to the Completion Not Journaled investigation, not to cost work — same physics as that card, grouped here only because usp6_008 stamped this subtype first (5.19). Never work all three shapes as one variance.',
    '- GL-CLASS SOURCE FOR JOURNAL ENTRY CREATION: the item LOCATION record (F41021), not the item BRANCH record (F4102), which is the assumption people usually arrive with. RR assigns accounts off F41021 as well, so the two agree by construction and an F4102 / F41021 divergence does NOT explain a manufacturing account mismatch. Never tell the analyst that R31802A reads the GL class from F4102. The divergence is still worth reporting for a different reason: JDE lets the two tables hold different values without a warning, RR Integrity Report 5 lists the mismatches, and an undetected difference produces unexpected results in a cost rollup. GL class also lives on the item master (F4101), and the LOCATION value is what governs when they disagree, which is why a location-level blank against a populated master reads as a whole-balance cardex variance rather than a delta. A blank F41021 GL class is not special — it resolves through the DMAAI like any class: a specific entry, or the `****` wildcard/default row that covers any class not explicitly set up (blank included). It posts normally when that coverage exists, and only fails to resolve when the DMAAI has neither a specific entry nor a `****` default — the same condition as any GL class.',
    '- MANUFACTURING ACCOUNTING SEQUENCE (authoritative): material issues (IM) and completions (IC) are written to F4111 with NO batch number and NO G/L date. R31802A stamps the batch and G/L date onto those existing F4111 rows and creates the F0911 journal entries in the same step. So a batch and G/L date ABSENT is the literal un-processed state. But a batch number PRESENT means only that R31802A processed the row — it is NOT a guarantee the journal entry was written: R31802A is OBSERVED stamping the cardex batch and writing NO completion entry for a subset of each run. Never infer "the entry therefore exists" from a batch number. R31804 (not R31802A) creates the IV variance entries, and R09801 only updates F0902 — unposted journal entries still exist in F0911.',
    '- COMPLETION NOT JOURNALED is a GENUINE POSTING GAP, not a matching artifact. A completion sits on the cardex with a batch stamped and the GL holds no completion entry for that work order, while the material issues for the SAME order did post. Confirmed by widening the search past the company and the document type and still finding no completion. The finished-goods cost never reached the general ledger: WIP overstated, finished goods understated.',
    '- A HEALTHY BATCH AND A HEALTHY ACCOUNT DO NOT CLEAR IT. The same run\'s other work orders journal their completions normally, on the same account, so "the batch posted fine" and "that account carries completions constantly" are not answers. Confirm PER WORK ORDER, never per batch. These must not LEAD the read either, though they stay the secondary list to rule out because each is real at other sites: summarization dropping the work-order reference, a different document company, an unposted batch, a document type outside completions and issues, and a missed GL data load. Never a work order awaiting the run, held in error, or a run that failed before stamping a batch — those carry no batch and cannot reach this card.',
    '- THE SHAPE: R31802A stamps the cardex batch and writes no completion entry for a slice of EVERY run, spread across order types and batches rather than concentrated in one failed run. Each affected run journals the large majority of its completions and drops a slice, and run conditions move the severity without ever eliminating the failures. That is what makes it a recurrence problem rather than a one-off. NEVER STATE A COUNT, A BATCH TOTAL OR A PERCENTAGE YOU HAVE NOT BEEN GIVEN FOR THIS INSTALL. The card computes recurrence from the rows actually loaded here (periods affected out of periods loaded, rows, distinct batches) and names the window it used; quote those figures and no others. The figures from the original investigation are specimen evidence for ONE dataset, they live in the analysis guide, and repeating them here would assert a number that is false on any other customer.',
    '- NO VENDOR ARTICLE MATCHES IT. Oracle Support KB 420628 is a near miss that was TESTED and RULED OUT: its symptom is the material issue\'s OWN entry missing from F0911, the inverse of this card, where IM is present in volume and only the completion is absent — that failure striking IM would SUPPRESS this card rather than create it. Never cite KB 420628 as a match, never state or invent a vendor remedy, and do NOT claim the article is login-gated (the body was retrieved). Its cause (an issue quantity under 0.0050 blanking the 2-decimal CTS1 on the F3111 part list) and its remedy (manual journal entries) belong to a different condition. UNTESTED and not to be dismissed: whether a blank CTS1 could block only PART of a run\'s output (the completion leg while the issue leg still writes) — RR does not load F3111, so settling it needs a query against the customer\'s own part list.',
    '- PREVENTING IT: have whoever runs R31802A read the error report that run produces. Then take it to Oracle through the CUSTOMER\'S OWN IT DEPARTMENT as an UNDOCUMENTED R31802A condition, explicitly NOT as KB 420628 — naming the wrong article invites a remedy built for a different cause. Do NOT delete unposted manufacturing batches — R31802A has already cleared the unaccounted units, so nothing in JDE regenerates the entry. R41543 has nothing to do with this card: never prescribe it here, and never tell the analyst to work the orders one at a time.',
    '- The BATCH NUMBER is a research handle: it is how you find the document in F0911, and it is NOT evidence the transaction reached the GL. Neither is the PC field, which is the F41112-update flag. Never present either as proof of GL posting.',
    '- WIP REVALUATION IS R30837, and it is driven by R30822 (Frozen Cost Update). When a frozen standard changes while work orders are still open, R30822 writes the new standard and R30837 revalues open WIP to it. Skip R30837 and the cardex revalues with no GL offset, which is the cost-basis gap behind Mfg Cost Mismatch. NAME THESE PROGRAMS when asked and state the number plainly. The VERSION in use is what varies per customer, so say "check which version is in use" -- never "confirm the program", which reads as though the number itself were in doubt when it is not. R30837 is optional under standard costing, needs the variance AAI configured for the routing, and skips work orders already closed.',
    '- TWO COST SOURCES PRICE ONE MANUFACTURING TRANSACTION, AND CHECKING THEM IS ROUTINE. The cardex leg of an IM or IC is priced from F4105. R31802A builds the GL leg from the F30026 cost components. So when the components do not sum to the F4105 cost, that difference times the transaction quantity IS the variance, in the direction the sign convention gives — components above the F4105 cost put the GL on the larger side. Screen for it on any manufacturing document BEFORE reasoning about cost basis, timing or account mapping. THE COMMONEST SHAPE is an item whose F4105 cost is ZERO while its cost components carry value: the cardex extends to nothing and the GL carries the full component total, which is how a manufacturing row reads cardex 0 / ledger not 0 with nothing having gone missing from the posting. TWO CAUTIONS, both of which turn a confident answer into a wrong one. F4105 and F30026 are CURRENT-STATE ONLY — the check confirms a STANDING gap and can never establish what either table held on the G/L date, so a clean result rules the cause out today, not then; where it does not land, read the unit-cost history in the item ledger before naming a different cause. And the cost components can be ABSENT from the RapidReconciler copy even where the item costs loaded, in which case the check is UNAVAILABLE rather than negative — never report a clean result without confirming the components are present. The setup correction is source-side: the frozen cost update (R30822) writes the component sum to F4105, and RR Integrity Report 6 (Frozen Cost Integrity) already lists the items where the two disagree, so the analyst does not have to hunt for them. NEVER STATE A COUNT, A DOLLAR TOTAL OR A TIE RATE YOU HAVE NOT BEEN GIVEN FOR THIS INSTALL.',
    '- Respect materiality: lead with the largest dollar driver; do not chase an immaterial noise row.',
    '- ROLE SPLIT, not a disagreement about the entry: the corrective accounting action for a transaction variance IS a journal entry, and the ACCOUNTANT books it. The ANALYST prevents recurrence. So never argue against the entry — no "not a journal entry", no "a JE only balances the GL this period" — and do not instruct one either. Stay in the analyst\'s lane: what was checked, what the cause is, and the change that stops it coming back.',
    '- THE FINDING IS THE ANALYST\'S INVESTIGATION REPORT to the customer, and it travels to the reconciliation audit findings where a third party reads it months later. Write it in three parts under these headings: "What happened" — the state of the world, one fact per bullet; "What I found" — the exact cause, or if it cannot be pinned down ONE or TWO likely causes said plainly to be unconfirmed; "What to do" — short bullets. Terse, one idea per bullet, no stacked clauses. Name a table only when the analyst has to go look in it.',
    '- Audience is a JDE-fluent analyst: F4111, F0911, DMAAI, AAI are fine; no plumbing / SQL terms.',
    'ANALYST POLICY (period workflow) — reason from these rules:',
    '- THE ANALYST\'S JOB IS TO PREVENT RECURRENCE, not to post journal entries. Every control below records what was found and what was changed at the source; none of them post to the GL. The accountant posts. If asked to make a variance "go away" with an entry, say that is the accountant\'s step and that the analyst\'s step is finding why it happened.',
    '- WORK THE CARDS FIRST, THEN THE PERIOD. Marking the period reviewed snapshots the card counts as they stand at that moment, so a card handed off after the period was marked is not counted in it. The order is not cosmetic.',
    '- STEP ONE IS A MATERIALITY DECISION, not a click. Read the card\'s variance, its row count and the LIKELY CAUSE, then decide whether this is worth investigating. If it is immaterial in the analyst\'s judgement they are done investigating and can mark the period reviewed — that is a recorded decision with zero source fixes, not a skipped step. If it is material, open the variance drill first and let the finding come from the rows.',
    '- A CARD IS ONE DOCUMENT, one root cause. The card header carries the company, the pattern name (for example "Sales DMAAI Net Zero"), the period, and a "Variance $X" link that drills to the transaction detail for that document. The LIKELY CAUSE block under it is the classifier\'s reading of the rows, not a confirmed diagnosis — it is where the analyst starts, not where they stop.',
    '- THE VARIANCE LINK IS THE FIRST STEP AND THE QUIETEST CONTROL ON THE CARD. It is a text link with an arrow; the only solid button is "Mark reviewed", which is the LAST step. If asked how to investigate, name the variance link explicitly — a reader who scans for the button-shaped thing finds the control that closes the card without opening anything.',
    '- ON THE TRANSACTION DETAIL PAGE, "SAVE" CAPTURES THE FINDING AND NOTHING ELSE. It is the ONLY button on the Findings panel. It stores the finding text against the company, card and period, and deliberately does not mark any row worked, does not send anything to the Audit Center, and does not advance the card\'s status. The finding then appears on the Home card labelled "Your recorded finding". This page had a second button also called "Mark reviewed" until 2026-08-15; it is gone. If asked where a finding is handed off, the answer is always the Home card and never this page.',
    '- THE CARD BUTTON HAS THREE STATES and each names the action available. Untouched card: "Mark reviewed". Card already carrying a saved finding: "Review & submit". Either one OPENS the Recommendations editor and the same button becomes the save. Completed card: "Reopen to edit". Reopened card: "Mark reviewed", with the editor already open. Nothing is saved by opening the editor.',
    '- REVIEWING THE CARD DISPOSITIONS THE WHOLE CARD, not the rows that happened to be on screen. The review action marks every row the card counted as worked, persists them, records the card complete, and writes the corrective to the activity log. It is all-or-nothing at card grain on purpose: a card is one document pattern with one root cause, so the card is the unit of judgement. An analyst who genuinely worked only part of it is still visible — the card\'s meta line reads "N worked" whenever the worked count is short of the row count. Never describe the review as marking a filtered subset.',
    '- A FAILED HAND-OFF LEAVES THE CARD OPEN AND SAYS SO ON THE CARD. If the rows cannot be saved, nothing is recorded: the card keeps its previous state, the rows stay unmarked, and the reason prints on the card itself. So a card that still reads as open after a review attempt has genuinely not been handed off — read the message on it rather than assuming the click was missed.',
    '- WHAT YOU TYPE IN "RECOMMENDATIONS" IS THE RECORD. It is stored as the card\'s source-fix text against the company, card and period. Its placeholder ("Waiting investigation — replaced with recommendations from the transaction details page.") is a PROMPT, not a value: an untouched card saves an empty resolution, which is correct. Never treat the placeholder text as analyst content.',
    '- WRITE THE RECOMMENDATION AS AN INVESTIGATION RESULT: what you checked, what you found, and what stops it recurring. "Immaterial" is a disposition, not a finding. A resolution that names no source change has not prevented anything.',
    '- HANDED OFF THIS CYCLE: N OF M is the count of cards saved complete against the total on the period. It is the figure that decides whether the period can later be reopened silently, so read it before marking the period reviewed.',
    '- "MARK PERIOD REVIEWED" records how many card slices were fixed at the source and how many were left to ride, stamped with your name and the time server-side. It does not require every card to be complete — leaving cards to ride is a legitimate outcome, and the count says so.',
    '- AFTER THE PERIOD IS REVIEWED the button becomes a "Reviewed <date>" chip. Whether it can be undone depends on whether work left the period. Nothing handed off, no source fixes recorded and no accountant adjustment means the review is inert and a plain "Reopen period" button undoes it outright. Any of those three means work left the period.',
    '- REOPENING A CONSEQUENTIAL PERIOD REQUIRES A REASON, and the reasons it is locked are printed beside the button — cards handed off, source fixes recorded at review, accountant adjustment recorded. The reason is recorded against your name BEFORE the review is removed, and surfaces on the Audit tab under Reconciliation Audit Findings; if that record cannot be written, the period is left exactly as it was. A reversal that nobody can attribute is refused rather than performed quietly.',
    '- REOPENING IS A CORRECTION, NOT A ROUTINE STEP. Someone downstream may have acted on the close. State in the reason what changed, not that you clicked the wrong thing.',
    '- A ZERO OR NEAR-ZERO VARIANCE IS STILL A DECISION. An immaterial period can be marked reviewed without research, and that is a recorded choice with a count of zero source fixes. Do not describe it as "nothing to do" — describe it as a disposition the analyst owns.',
    '- EVERY PERIOD-LEVEL ACT REACHES THE AUDIT SURFACE. Marking a period reviewed, reopening it inertly and reopening it with a reason all write an entry carrying the actor from the signed-in session. The Audit tab reads that stream, so the analyst\'s sign-off appears there under Analyst alongside their card findings and the DMAAI model approval.',
    '- THE AUDIT TAB IS PER-COMPANY AND PER-PERIOD. A review recorded against one company does not appear while another company is in focus. Before concluding an entry is missing, check the company in the header — that is the usual explanation.',
    '- THE PERIOD ENTRY IS A HEADER, NOT THE RECORD. It says who signed off, when, and with what counts. The substance an auditor needs months later is the card finding text. A period line reading "0 fixed at source · 1 let ride" reports a decision, not a reason.',
    '- APPROVING THE DMAAI ACCOUNT MODEL IS ANALYST WORK, not accountant work. A wrong AAI is what produces a variance, so signing off the routing model is prevent-recurrence work and is recorded under Analyst. The `accounting-` prefix on the model-review page filename is a misnomer, not a role assignment.',
    '- THE ROLL-FORWARD FIGURE AND THE RECONCILING ITEMS ARE NOT EXPECTED TO TIE. The chart sums every posted non-manual row at account grain; the card counts only documents over the materiality threshold at document grain. Two restrictions and a different grain, so they differ in either direction — the narrower population can be the LARGER number. Never explain the gap with filtering alone, which only fits one sign.'
  ].join('\n');
  // CARDEX_GROUNDING -- GENERATED from the knowledge-base docs by
  // Tools/build-ai-grounding.py. DO NOT edit by hand: edit the source
  // docs and re-run the generator (or let the GHA regenerate on push).
  // Sources: AnalysisGuides/_catalog/analyst/cardex.md
  window.RRV8.CARDEX_GROUNDING = [
    'ANALYST POLICY (cardex variance) — reason from these rules:',
    '- VARIANCE IS ALWAYS A DIFFERENCE: whenever two figures that should equal each other do not, that gap IS a variance — full stop. "Expected" / "explained" describes the CAUSE of a variance you can account for; it NEVER downgrades the gap to "not a variance" (two scales that disagree still disagree — knowing why does not make them equal). Disposition every variance as EXPLAINED / no-action or UNEXPLAINED / investigate; never as "not a variance," "not a real variance," or "not a variance to chase."',
    '- DEFINITION: cardex variance = the item ledger (F4111) does not sum to the on-hand balance (F41021) for one item. QUANTITY variance = the sum of F4111 primary-UoM quantity does NOT equal the F41021 Quantity On Hand. AMOUNT variance = the sum of F4111 extended cost does NOT equal the F41021 on-hand Value. Nothing else is cardex variance. It is inventory-internal, NOT the ledger-vs-GL gap (that is transaction variance).',
    '- STEP 1 IS ALWAYS THE JDE VALIDATION. The analyst opens Work With Item Ledger (P4111) in JDE, exports the grid, EXCLUDES memo rows (ILIPCD = "X" — work-order scrap, lot releases, certain warehouse moves; they do not affect on-hand), and checks that the remaining F4111 primary quantity sums to the header Quantity On Hand and the extended cost sums to the header Value. Anything wrong in JDE is corrected in JDE FIRST. RR cannot verify JDE — it TRUSTS the analyst did this. Never imply RR confirmed JDE.',
    '- USE THE RIGHT AGGREGATION SCOPE, and it is set by cost METHOD as well as cost level. An average-cost item (method 02) or actual-cost item (method 09) reconciles at ITEM when its cost level is 1 (branch not in the key), at BRANCH/ITEM when its cost level is 2, and per LOCATION AND LOT when its cost level is 3. A standard-cost item (method 07) reconciles per LOCATION AND LOT at every cost level, and so does any other cost method. Comparing at the wrong grain manufactures a false variance.',
    '- THE REMEDY FORK, decided by that validation, not by RR: (a) if JDE itself is out of balance (F4111 does not sum to F41021 in JDE), the variance is REAL — fix it at the source in JDE. The common real case is F41021 not updating for one or more cardex transactions (a system glitch that needs IT). An RR adjustment is at best a stopgap. (b) If JDE ties but RR still shows a variance, RR\'s load/roll is the artifact (e.g. F4111 and F41021 captured out of sync during a live load) — sync RR to the JDE figure with the in-place, reversible Adjust Beginning Balance.',
    '- ADJUST BEGINNING BALANCE has three presets: Clear to JDE (sets the opening so the variance nets to zero — use when JDE is confirmed correct and the variance is an RR-only artifact), Zero opening (opening qty and amount set to 0), and Manual (type the known-correct opening qty and amount — use after a JDE correction or a UOM change). Every adjustment is logged and reversible from the Adjustment ledger.',
    '- DO NOT auto-classify a real glitch vs load-timing noise from RR data. Both can persist (especially from the initial baseline perpetual build), and RR cannot see live JDE, so a heuristic would only guess. Surface the variance and the two sums (F4111 total vs F41021 on-hand); let the analyst\'s JDE validation determine the cause. Name a LIKELY cause tentatively if asked, never as a verdict.',
    '- Quantity first: when units are off, lead with the quantity — the dollars usually follow at cost. Amount-only (units tie, value off) points at cost/valuation, not counting.',
    '- Cardex variance CANNOT be journaled — people try. It is analyst / operations work: fix the data at the source in JDE, or apply the in-place reversible sync once JDE is validated. The accountant\'s journal entry never touches it.',
    '- Audience is a JDE-fluent analyst: F4111, F41021, P4111, ILIPCD, UOM, cost method / level are fine; no SQL or plumbing terms.'
  ].join('\n');
  // ROLLFORWARD_GROUNDING — the AI's compact copy of the Account Roll-Forward
  // corrective playbook. Prepended to the roll-forward assistant's system prompt
  // (inventory-account-rollforward.html triggerTodoAi) so its lever advice reasons
  // from RR's actual corrective order instead of a generic guess. Was inline-only
  // in that one page; lifted here so it lives with the other catalogs and a future
  // surface (e.g. the analyst-training spine) can read the same source. SOURCE OF
  // TRUTH = the roll-forward corrective workflow; keep in sync as the SME curates it.
  window.RRV8.ROLLFORWARD_GROUNDING = [
    'ROLL-FORWARD POLICY (account roll-forward) — reason from these rules:',
    '- The account roll-forward keeps the inventory source-of-truth accurate period over period. Two things can fail to roll forward: the GL balance (Account Balances (F0902) don\'t tie to the posted Account Ledger (F0911)), or the cardex-to-GL reconciliation variance (the variance doesn\'t tie).',
    '- When Account Balances (F0902) don\'t tie to the posted Account Ledger (F0911), clear the balance in order: FIRST run Repost Account Balances (R099102) in JD Edwards to rebuild the balances from the posted detail; once those tie, THEN reload the GL in RapidReconciler (the Reload GL action) so the corrected balances flow into RapidReconciler on the next refresh. State the order as the next step — the repost is a JD Edwards action the analyst posts, and Reload GL is the RapidReconciler action that follows it. RapidReconciler does NOT verify the repost and must NOT ask the analyst to prove or attest it ran clean; it is guidance, not a checkpoint (RapidReconciler is a utility, not an enforcement gate).',
    '- When the reconciliation variance is off, there is NO manual step. RapidReconciler recomputes the entire period timeline on every refresh, so the variance clears on the next run. A variance that survives a refresh is not something to clear here — escalate it to the customer\'s IT department to investigate. Never prescribe a re-roll (retired — the recompute made it obsolete) or Reload Cardex (a separate cardex data-integrity utility, not a roll-forward corrective) for a variance.',
    '- When both are off, clear the GL first — the GL balance feeds the variance, so posting the repost and reloading the GL usually squares the variance too.',
    '- This is analyst / operations maintenance, never a journal entry: the accountant does not journal a balance that doesn\'t roll forward.',
    '- Audience is a JDE-fluent finance analyst: answer in 2-4 sentences, plain accounting language; standard JD Edwards program and table references (Repost Account Balances (R099102), Account Balances (F0902), Account Ledger (F0911)) are fine; no SQL or endpoint terms.'
  ].join('\n');
  // ASOF_GROUNDING — the AI's compact copy of the perpetual / as-of definitions.
  // Prepended to the As-Of page's AI reads (inventory-asof.html asofAsk) so the
  // perpetual-inventory and residual-noise explanations stay consistent app-wide
  // instead of being re-described inline. SOURCE OF TRUTH = the perpetual-inventory
  // model + Residual Optimizer behavior; keep in sync.
  window.RRV8.ASOF_GROUNDING = [
    'ANALYST POLICY (perpetual / as-of inventory) — reason from these definitions:',
    '- PERPETUAL INVENTORY is established at go-live from an initial load of each item’s on-hand quantity and unit cost (the opening valuation baseline), then maintained as a running total transaction by transaction — every receipt, issue, adjustment, and transfer updates the on-hand quantity and its extended value immediately. Reconciliation compares that perpetual total to the GL inventory accounts.',
    '- RESIDUAL NOISE is zero-quantity rows that still carry a tiny valuation — rounding dust left in the perpetual, not real inventory. The Residual Optimizer finds the natural cutoff between that dust and balances worth reviewing and hides the dust from the grid (a display filter only — material balances are never touched and nothing is deleted). "Re-optimize" re-runs that cutoff.',
    '- Audience is a JDE-fluent analyst: plain analyst English; no SQL or table terms.'
  ].join('\n');
  // ADMIN_GROUNDING -- GENERATED from the knowledge-base docs by
  // Tools/build-ai-grounding.py. DO NOT edit by hand: edit the source
  // docs and re-run the generator (or let the GHA regenerate on push).
  // Sources: RRUniversity/administrator-managing-users.html, RRUniversity/administrator-managing-companies.html, RRUniversity/administrator-complex-password.html, RRUniversity/rapidreconciler-licensing.html
  window.RRV8.ADMIN_GROUNDING = [
    'ADMIN GROUNDING -- generated from the RapidReconciler University administrator docs. Reason from the documented process below; this is the authoritative text, not a paraphrase.',
    '',
    '=== Manage the Team — RR Administrators (administrator-managing-users.html) ===',
    'Manage the Team',
    'Add and remove RapidReconciler team members, assign each person a role , and choose which databases and companies they can work in. RapidReconciler emails every new team member a secure link to set their own password — you never type or hand out a password.',
    'What changed',
    'Earlier versions configured each team member with a per-person grid of functions, tabs, and companies. RapidReconciler now uses named roles instead: you pick one role, and it carries the right module access for that job. Assign databases and companies on top of the role.',
    'Where to find it',
    'Team member management lives on the RR Team page. From the RapidReconciler Home page, open the Administration area, expand People & Licensing , and click RR Team . (Administration only appears for team members whose role includes administrator access.)',
    'The RR Team page',
    'The RR Team page lists everyone who can sign in to RapidReconciler, with a row per person:',
    'Column | What it shows',
    'Active | A badge indicating whether the account can currently sign in.',
    'Full Name | The person\'s name.',
    'Username | Their email address — this is also how they sign in.',
    'Role | The single role assigned to the team member (for example Reconciliation Analyst ).',
    'Last Login | When the team member most recently signed in.',
    'Last Pass Change | When the team member last set or changed their password.',
    'Options | A lock icon (role & access), a pencil icon (edit name/email/active), and a trash icon (remove the team member).',
    'The New Team Member button sits in the top-right of the page. The RR Team page also carries two contact fields — Project Sponsor and RR Administrator — that record who owns the RapidReconciler relationship at your site.',
    'The RR Team page Each row shows a team member, their role, and per-row lock / edit / delete options. The green New Team Member button is in the top right.',
    'Adding a team member',
    'To add someone, click the New Team Member button in the top-right of the RR Team page. Fill in the fields and click Add . The person appears on the RR Team list right away, and RapidReconciler separately emails them a single-use link to set their own password:',
    'Field | Description',
    'Full Name | The person\'s first and last name.',
    'Email | Their company email address. This is their username, and it is where the set-password link is sent.',
    'Role | The single role that governs which modules this person can use. Selecting a role shows a short description of what it grants. See Roles below.',
    'Databases | Check each RapidReconciler database the team member may sign in to. For each one, choose All licensed companies or check individual companies. See Database & company access .',
    'No passwords to manage',
    'You don\'t create or hand out a password. When you add the person, they appear on the RR Team page right away, and RapidReconciler emails them a secure link to set their own. The link is single-use and time-limited; they can sign in once they\'ve set their password.',
    'New Team Member form Pick one role and the databases (and companies) the team member may work in, then Add . The person joins the list immediately and RapidReconciler emails them a set-password link — there is no password field.',
    'Roles',
    'A role is a reusable bundle of access that decides which RapidReconciler modules a person can use. Your site\'s roles are configured for you, so the exact list you see may differ — but they typically look like this:',
    'Role | Typical access',
    'RR Administrator | Everything, including the Administration area — RR Team, Licensing, Companies, Accounting set-up, and data utilities.',
    'Reconciliation Analyst | The Inventory module — perpetual vs. GL reconciliation, transactions, As-Of, and integrity reports.',
    'Cost Accounting | Inventory reconciliation plus the accounting review surfaces. No administration access.',
    'A/P Clerk | The PO Receipts module — Received-Not-Vouchered reconciliation.',
    'One role per team member',
    'Each person has a single role. To change what someone can do, change their role — you don\'t tick individual modules per team member any more.',
    'Database & company access',
    'Role decides what a team member can do; database and company access decides where . On both the New Team Member form and the lock (access) icon, you check the databases a team member may sign in to and, within each one, either All licensed companies or a specific set.',
    '- Only the companies a team member is granted appear in their company picker on the Home page and the work pages.',
    '- Reconciliation totals reflect only the companies the team member is allowed to see — if someone\'s figures look off, check their company access first.',
    '- When a new company is licensed, team members set to All licensed companies pick it up automatically. Team members limited to a specific list must be updated to include it.',
    'Editing, locking, and deactivating',
    'From the Options column on the RR Team page:',
    'Icon | Action',
    'Lock | Change the team member\'s role and their database & company access .',
    'Pencil | Edit the team member\'s name, email, and Active state. Turning Active off blocks sign-in without deleting the account — use this when someone is on leave or has changed jobs.',
    'Trash | Remove the team member entirely. Confirm the prompt to complete.',
    'Automatic inactivity management',
    'RapidReconciler watches sign-in activity and helps keep your team list current on its own:',
    '- On the RR Team page each active member\'s row is tinted by recent activity: green when the account has been used in the last 6 months, amber at 6+ months, red at 12+ months. "Used" counts a sign-in or a password change, so a member who just set their password reads green even before their first sign-in. A member who has never signed in or set a password shows amber, so an account that was never set up stands out for review. The People & Licensing card on Home reflects the same health at a glance.',
    '- At 12 months of inactivity, RapidReconciler emails the team member a warning: sign in within 14 days or the account will be deactivated.',
    '- If they sign in during those 14 days, nothing changes — the warning clears and the account stays active.',
    '- If they don\'t, the account is deactivated automatically . Their history and settings are untouched; an administrator can turn the account back on at any time with the pencil icon (set Active back on).',
    'Who is never deactivated automatically',
    'Administrators and built-in service accounts are exempt, and RapidReconciler never deactivates the last remaining administrator — so you can\'t be locked out of your own site.',
    'What a deactivated team member sees',
    'If someone whose account was deactivated for inactivity tries to sign in, RapidReconciler tells them the account is inactive and to contact their administrator. Re-enabling them ( pencil icon → Active on) lets them straight back in.',
    'Passwords',
    'Administrators never set, see, or distribute passwords. Each team member sets their own from the secure link RapidReconciler emails them. If a team member can\'t sign in or their link has expired, edit the team member and re-send the set-password link to issue a fresh one — there is no admin-assigned temporary password. Password length and complexity rules are covered in Complex Passwords .',
    'Common pitfalls',
    'A team member can\'t see a company they should have access to',
    'The role grants the module; company access controls the data. Open the lock icon and confirm the right database is checked and the company is included (or that All licensed companies is on).',
    'Someone has a module they shouldn\'t — or is missing one',
    'Module access follows the role , not per-team-member check-boxes. Change the role to fix it.',
    'A new hire never got their set-password email',
    'Check the email address on the team member record, then re-send the set-password link from the pencil icon. The link is time-limited, so a link left unopened for too long needs re-sending.',
    'Removing a team member',
    'Click the trash icon next to the person\'s name and confirm the prompt. If you only need to stop someone signing in temporarily, turn Active off (via the pencil icon) instead of deleting the account.',
    '',
    '=== Managing Companies — RR Administrators (administrator-managing-companies.html) ===',
    'Company Management',
    'Configure licensed companies, fiscal start dates, currency settings, AAI documents, and reconciliation thresholds for each company in the application.',
    'Navigation',
    'From the RapidReconciler Home page, open the Administration area, expand People & Licensing , and click Licensing . The Licensing page is visible only to users with the RR Administrator role.',
    'The Licensing page lists all of your licensed companies. To modify a company\'s settings, click the Options icon in the far-right column of the applicable row. The page also shows your seat usage (how many of your licensed company seats are in use) and a Check JDE for more companies scan that surfaces companies with activity that aren’t licensed yet — see Licensing .',
    'Licensed Companies',
    'The Companies page displays all companies currently licensed for use in RapidReconciler. The following fields are shown for each company:',
    'The Licensing page — Licensed Companies Each row is one licensed company; the icons on the right open the Options popup or trigger a Re-roll.',
    'Field | Description',
    'Number | The company number as defined in JD Edwards.',
    'Name | The company name.',
    'Start Date | The earliest fiscal period available for reconciliation.',
    'Base Currency | The base currency of the company, pulled from JD Edwards.',
    'AAI Doc | The AAI document type used for the model DMAAI table.',
    'Threshold | The reconciliation threshold value, expressed in the company\'s base currency. Variances at or below this absolute value are treated as within tolerance and flagged accordingly on the Reconciliation page.',
    'Options | Click to open the Company Options pop-up for editing.',
    'Reroll | Click to reroll the company, which recalculates the perpetual balance from the baseline date forward. Typically used if transactions have been backdated more than 1 period.',
    'Important',
    'Only GSI can add or remove companies, as they are managed per license agreement. If additional company licenses are required, please contact GSI at gsisales@getgsi.com .',
    'Reroll by Company',
    'The Reroll icon on each company row recalculates the perpetual inventory balance from the baseline forward. Run it when an end user reports an inventory carry-forward issue — for example, the Inventory Validation light is red and the report shows VarOK = No while GLOK = Yes .',
    'What happens when you click it:',
    '- A confirmation pop-up asks “Are you sure?”',
    '- Click OK and let the process run to completion.',
    '- For each inventory account on the company, RapidReconciler starts at the beginning perpetual balance and rolls forward by adding the cardex transaction amounts period by period.',
    'It is a clean recalculation, so it resolves carry-forward problems caused by backdated transactions or transient system glitches that left a stale value in place. See the Inventory validation light is red scenario for the end-user perspective on when to request a reroll.',
    'Company Options',
    'Clicking the Options icon opens the Edit company pop-up window:',
    'Edit company popup The Company Number and Base Currency fields appear with a grey background to indicate they are read-only; they are pulled directly from JD Edwards.',
    'The Company Number and Base Currency fields are read-only, as they are pulled directly from JD Edwards and cannot be changed within RapidReconciler. The following fields may be modified:',
    'Start Date',
    'The Start Date represents the earliest fiscal period that can be reconciled. It is always set to the first day of a fiscal period — typically the first day of the current fiscal year. Once the current fiscal year is closed, the administrator should update this date to reflect the new fiscal year.',
    'Irreversible action',
    'The Start Date cannot be moved backwards . Once advanced, RapidReconciler will initiate a purge procedure to permanently remove historical data prior to the new date. Verify your fiscal year is fully closed and reconciled before advancing this date.',
    'Key considerations',
    '- It is highly recommended that at least 2 months of history be retained in the RapidReconciler database at all times.',
    '- Advancing the Start Date is a method of recovering server resources and improving application performance. Reducing the volume of data in the database results in faster response times.',
    'AAI Doc',
    'The AAI document type used to identify the model DMAAI table for the company. The default value is PI . Change it only if your JD Edwards configuration uses a different document type for the model DMAAI — it drives account derivation, so confirm the correct value against JD Edwards before you change it.',
    'Threshold',
    'The reconciliation threshold amount, expressed in the company\'s base currency. Variances whose absolute value falls at or below this amount are treated as within tolerance.',
    'Example',
    'If the Threshold is set to 100.00 and a variance of $87.50 is calculated for a period, that variance is flagged as within tolerance on the Reconciliation page and does not require a journal entry. A variance of $250.00, by contrast, is flagged as exceeding tolerance and requires investigation.',
    'Click Save Changes when all modifications are complete.',
    'Adding a Company License',
    'Company numbers in RapidReconciler are license-controlled and can only be added by GSI staff. Each company in the application corresponds to a licensed JD Edwards company number as specified in your purchase agreement.',
    'Finding Companies You Haven’t Licensed Yet',
    'The Licensing page can show you which JD Edwards companies have activity in this database but aren’t licensed in RapidReconciler — useful when you’re deciding whether a company is worth adding. Below the licensed list, click Check JDE for more companies . Because it scans JD Edwards activity, it can take a moment; when it finishes, a Not Licensed list appears showing each company’s number, name, item count, and a small last-12-months activity bar, so you can gauge at a glance whether it’s active enough to be worth a seat.',
    'You can’t add a company from this page — licensing is a contract term — but it tells you exactly which company numbers and names to include when you request more below.',
    'Tip',
    'A Not Licensed company with steady activity across the last twelve months is usually a good candidate; one with little or no activity may not be worth a seat.',
    'Requesting Additional Companies',
    'If you have additional companies you would like to reconcile that are not currently available in the application, please contact GSI Sales to begin the licensing process.',
    'Email GSI Sales gsisales@getgsi.com Compose Pre-Filled Email',
    'Clicking the button above opens your default email client with a draft addressed to GSI Sales, including a subject line and a request template ready to fill in. The pre-filled email looks like this:',
    'Preview — opens in your default mail client To gsisales@getgsi.com Subject RapidReconciler — Additional Company License Request Hello GSI Sales Team, We would like to add one or more additional companies to our RapidReconciler license. Please find the details below. == Customer Information == Company Name: RapidReconciler Account / Customer ID: Primary Contact Name: Primary Contact Email: Phone: == Companies to Add == Please add the following JD Edwards companies to our license: 1. JDE Company Number: Company Name: 2. JDE Company Number: Company Name: (add additional rows as needed) == Additional Notes == Thank you,',
    'If you prefer to write the email manually, please include the following:',
    '- Your company name and RapidReconciler account details',
    '- The JD Edwards company numbers you would like to add',
    '- The corresponding company names',
    'A GSI representative will follow up to confirm licensing and coordinate the update.',
    'Managing Company Settings',
    'Company settings, including enabling or disabling companies for individual users, are managed by your RapidReconciler administrator. If you need changes to your company configuration, please contact your internal RapidReconciler administrator.',
    'Note',
    'Changes to company licensing may require a restart of the RapidReconciler Agent before they take effect in the application.',
    '',
    '=== Complex Password Option (administrator-complex-password.html) ===',
    'RapidReconciler supports an optional complex password policy designed to protect sensitive financial reconciliation data and align with common enterprise security standards. You choose which companies require it — turning it on for the companies that need it without forcing it on the rest. This guide covers what each setting requires, how to choose which companies use it, the reset process, and administrative controls.',
    'Overview',
    'Every RapidReconciler password meets a standard baseline. On top of that, your RapidReconciler administrator can require complex passwords for the companies that need stronger protection — set on the Complex Passwords page, one company at a time or all at once.',
    '§ Standard vs. complex',
    'Standard — always on | Complex — when a company requires it',
    'At least 8 characters . | Everything in Standard, plus the rules below.',
    'Can’t reuse your current password. | Characters from at least 3 of 4 groups — uppercase, lowercase, digit, special.',
    'No run of 3+ characters from your name or email.',
    'Can’t match any of your last 10 passwords.',
    'Why per company? A password belongs to a person, but a company is an access scope. Because one person can work in more than one company, the strongest rule wins: if someone can reach any company that requires a complex password, they’ll be asked for one. Turning it on for a single company effectively covers everyone who can reach that company.',
    'People who sign in with single sign-on (SSO) are never affected by these rules — their identity provider handles password strength.',
    'Password Requirements',
    'When the complex password policy is enabled, all user passwords must meet the following criteria:',
    'Requirement | Detail',
    'Minimum length | 8 characters',
    'Name restriction | Cannot contain the user’s account name or parts of their full name exceeding two consecutive characters',
    'Password history | Cannot match any of the last 10 passwords',
    'Expiry | Must be changed every 90 days',
    'Storage & transmission | Must not be displayed, stored, or transmitted in clear text',
    '§ Character Complexity',
    'Your password must include characters from any three of the four categories listed below — you do not need to use all four:',
    '- English uppercase characters (A through Z)',
    '- English lowercase characters (a through z)',
    '- Base 10 digits (0 through 9)',
    '- Non-alphabetic characters (e.g. ! , $ , # , % )',
    'Tip: A strong password example is Blue$ky92 — it draws from all four character categories. The diagram below shows which character belongs to which category:',
    'Logging In',
    'When a user attempts to log in, they will be directed to the Password Reset screen if either of the following conditions is met:',
    '- 90 days have elapsed since their last password change.',
    '- They click the "Forgot your password?" link and then follow the reset link sent to their email.',
    'RapidReconciler login screen The "Forgot your password?" link sits below the password field. Clicking it sends a password reset link to the email address on file for the user.',
    'Note: The password reset link sent by email is time-limited. If the link has expired, the user should repeat the "Forgot your password?" process to receive a new link. If the issue persists, contact your RapidReconciler administrator.',
    'Resetting a Password',
    'On the Password Reset screen, the new password must conform to the policy outlined above. The Confirm button remains disabled until the password meets the 8-character minimum length requirement.',
    'Password Reset screen Enter a new password in both fields. The Confirm button enables once the 8-character minimum is met.',
    'Common reasons a new password may be rejected:',
    '- The password is fewer than 8 characters',
    '- The password does not meet the three-category complexity requirement',
    '- The password contains the user’s name or account name',
    '- The password matches one of the last 10 previously used passwords',
    'When a complexity rule is violated, an error banner appears below the Confirm button explaining what is missing:',
    'Complexity error banner Fires when the password meets the 8-character minimum but uses fewer than three of the four character categories. To resolve, add a missing category — for example, a digit or symbol.',
    'If your password is being rejected and you are unsure why, review the requirements above and try a different combination of characters.',
    'Administration',
    '§ How New Users Get a Password',
    'Administrators never set, see, or hand out passwords. When you add a new user, RapidReconciler emails them a secure, single-use link to set their own. Whatever password they choose must meet the complex password policy if it is enabled for your site. There is no admin-assigned temporary password.',
    'For step-by-step instructions on adding users, see Manage the Team !',
    'Best Practice: The set-password link is time-limited. If a new hire doesn’t set their password before the link expires, re-send the link from the RR Team page to issue a fresh one rather than sharing credentials any other way.',
    '§ Turning Complex Passwords On or Off',
    'You manage this yourself on the Complex Passwords page. From your Home dashboard, open the Team & access card and click Complex passwords . It lists the companies licensed on your database with an on/off switch for each. Turn it on for a single company, or use Require for all to switch every company at once. Changes take effect the next time an affected user signs in or changes their password. See Choosing which companies require it below.',
    'Recommendation: Keep complex passwords required for any company that holds production financial data. A training or sandbox company can stay on the standard rules.',
    '§ Locked or Inaccessible Accounts',
    'If a user is unable to log in and cannot complete the password reset process — for example, they no longer have access to the email address on file — the administrator can re-send their set-password link from the RR Team page. If the email address itself is wrong, edit the user to correct it first, then re-send.',
    'See Manage the Team for instructions on editing a user and re-sending a set-password link',
    'Choosing Which Companies Require It',
    'Open Complex Passwords from your Home dashboard: the Team & access card lists it alongside users and access review. You’ll see the companies licensed on your database, each with an on/off switch:',
    '- One company — flip its switch to Complex . Anyone who can reach that company will be asked for a complex password the next time they sign in or change it.',
    '- All companies — use Require for all to turn it on everywhere, or Turn off for all to drop back to the standard rules.',
    'Existing users aren’t locked out when you turn it on — they keep their current password until it expires or they choose to change it, at which point the new rules apply.',
    'Note: It’s a good idea to let people know in advance. The next password they set for an affected company will need to meet the complex rules.',
    'Quick Reference',
    'Scenario | Action',
    'Password expired | A message box appears stating that the password has expired, with a button to reset the password',
    'Forgot password | Click "Forgot your password?" and follow the emailed reset link',
    'New user first login | Set your own password using the secure link emailed to you',
    'Password reset link expired | Repeat the "Forgot your password?" process',
    'Account inaccessible | Contact your RapidReconciler administrator to be sent a fresh set-password link',
    '← Back to Getting Started Need help? rrsupport@getgsi.com',
    '',
    '=== RapidReconciler Licensing — Request Additional Licenses (rapidreconciler-licensing.html) ===',
    'Licensing · how to request',
    'Request additional RapidReconciler licenses.',
    'RapidReconciler is licensed per JD Edwards company number . Adding a new company to your RapidReconciler instance goes through GSI Sales — not RR Support. This page walks through what to include in the email and what happens after Sales confirms.',
    'When to use this',
    'Use this page when you need to add a JD Edwards company to your RapidReconciler instance. Each JDE company number that RapidReconciler reconciles against is licensed; only Sales can add a new one to your entitlement.',
    'Sales owns the entitlement; RR Support owns the running application. License changes go to gsisales@getgsi.com , not rrsupport@getgsi.com .',
    'You don’t need this page to add users. RapidReconciler does not license per user seat — your administrator adds and removes users directly. See Manage the Team .',
    'Check your current usage first',
    'Before requesting more, see how many of your licensed company seats are already in use. On the RapidReconciler Home page, open Administration → People & Licensing → Licensing . The Licensing page shows a read-only banner such as “Using 2 of 3 company licenses” — it turns amber when you’re at your limit and red if you’re over it. If your license covers unlimited companies, it reads “Unlimited companies · N in use” instead, with no cap to reach.',
    'This banner is informational only. Your entitlement is set by GSI Sales; there are no controls on this page to change your seat count — that’s what the email below is for. The same page also offers a Check JDE for more companies scan that lists JDE companies with activity that aren’t licensed yet, which can help you decide which company numbers to request.',
    'See your renewal date',
    'The same Licensing page — and the Licensing card on your Administrator Home — shows your license renewal date alongside a live day count, for example “44 days left · Renewal due Aug 31, 2026.” The count turns amber as the date gets close (within 60 days) and red once it has passed, so you get a heads-up well before renewal.',
    'The date is read-only and informational — the same as the seat banner above. Renewing is still a Sales action: when the date is approaching, send the email below to gsisales@getgsi.com so your entitlement is extended before it lapses.',
    'What to include in your email',
    'A short email with the four items below lets Sales reply with a confirmation and any billing follow-up. The clearer the request, the faster the turnaround.',
    '- Customer / instance name — so Sales can match the request to your account.',
    '- JDE company number(s) to add — for example, “license for JDE company 00050 ” or “companies 00050 and 00060 .”',
    '- When you need it by — especially if there’s a go-live, audit, or period-close deadline.',
    '- Who to copy on the response — procurement, project lead, or IT.',
    'Quick start — email Sales',
    'Opens a draft addressed to GSI Sales with a starter subject. Fill in the four items above before sending.',
    'Email gsisales@getgsi.com',
    'After Sales confirms',
    'Once Sales replies that the new company license is in place, an administrator on your side configures it inside RapidReconciler:',
    '- Follow Adding a Company License to configure the new JDE company in RapidReconciler.',
    '- Once the company is configured, your administrator can grant users access to the new company through Manage the Team . Adding users does not require a license change.',
    'Questions about your entitlement?',
    'For billing, contract, or scope questions, contact gsisales@getgsi.com . For technical or operational questions about RapidReconciler itself, contact rrsupport@getgsi.com .',
    '← Back to RapidReconciler University+ RapidReconciler Assist home →'
  ].join('\n');
  // <<AI-GROUNDING GENERATED END>>
})();

/*
 * RRV8.AI_REGISTER — the ONE voice instruction every analyst-facing AI prompt
 * appends. Deliberately OUTSIDE the generated block above: the grounding
 * catalogs are generated content about WHAT is true, this is authored policy
 * about HOW to say it.
 *
 * WHY IT EXISTS. An audit of the analyst AI surfaces (2026-08-08) found 25
 * ai/explain call sites across six pages, and only FIVE of them declared who
 * was reading. The other twenty declared nothing, so the register was whatever
 * the model defaulted to on that particular prompt -- which is exactly why the
 * output read as inconsistently technical from one surface to the next. The
 * five that did declare a reader said only "JDE-fluent", which is a licence to
 * use jargon with nothing on the other side asking for the meaning or the
 * action.
 *
 * The fix is not twenty-five hand-written register lines. That is the same
 * shape as the nine card maps that drifted into three different names for one
 * pattern -- see the RRV8.txv header below. One constant, appended everywhere.
 *
 * WHAT IT IS NOT. This is not a reading-level drop. The reader is a JDE and
 * reconciliation veteran who is new to RapidReconciler, and explaining their
 * own domain back to them costs adoption ([[UI-40]] audience note; CLAUDE.md
 * "Assume JDE fluency"). Both rules stand. What changes is that naming a
 * mechanism now has to earn its place by changing what the reader DOES.
 *
 * PROSE OR BULLETS — settled here, once. The per-surface caps disagreed with each
 * other: one page banned lists outright while another allowed up to four bullets,
 * and the tightest cap (one sentence, 35 words) could not carry what happened AND
 * what to do, so the model dropped the action every time. The DEFAULT is BULLETS
 * for anything with more than one finding, because a paragraph holding two findings
 * makes the analyst re-read it to separate them. Plain "- " lines, not markdown:
 * every answer surface renders textContent, so a markdown bullet would show its
 * asterisk. Surfaces still set their own LENGTH, which is a materiality judgement.
 *
 * The default YIELDS to a surface that states its own layout, and five of them
 * legitimately do, because their reply is PARSED and not just printed: the Home
 * briefing returns JSON, the residual optimizer returns a "TARGET: <n>" first line,
 * the worklist cause splits on "Recommended:", and the two accountant assistants
 * carry an established "• " bullet plus @@DOCS@@ / @@ACTION@@ side-channels. A
 * register that overrode those would not restyle them, it would break them.
 *
 * WHERE IT DOES NOT GO. The Administrator assistant (home.html, ADMIN_GROUNDING)
 * reads to an IT administrator, not a reconciliation veteran — the first line of
 * this register is false for them. The AI smoke test on admin-claude-assistant
 * sends four words and reads the reply as a liveness probe. Neither takes it.
 */
window.RRV8 = window.RRV8 || {};
window.RRV8.AI_REGISTER = [
  'HOW TO WRITE THE ANSWER:',
  '- The reader knows JD Edwards and inventory reconciliation. They are new to RapidReconciler, not to the domain. Never explain what a work order, an AAI or the item ledger is.',
  '- Lead with what it MEANS and what to DO about it. The mechanism is support for the recommendation, never the headline.',
  '- Name a table, program, AAI number or document type only when it changes what the reader does next. If the action is the same without it, leave it out.',
  '- Prefer the plain word where it costs nothing: "the item ledger" over F4111 in a sentence that is not about the table itself.',
  '- Say the amount and the scope in figures the reader can act on. Never a percentage of a tie-out.',
  '- If the evidence does not support a cause, say what is known and what to check next. Never invent a mechanism to fill the sentence.',
  '- No preamble and no restating the question. Plain text only: no headings, no bold, no markdown.',
  '- Unless the task below specifies its own layout, put each finding on its own line beginning with "- ", with no blank line between them. One finding, one sentence. Never a paragraph that holds two findings.',
  '- Quote the figures given, exactly as given. Never add two of them together into a total the surface does not show.'
].join('\n');

/*
 * RRV8.GLOSSARY — what the words on the ANALYST surfaces mean. Authored policy,
 * deliberately beside AI_REGISTER and OUTSIDE the generated block above, on the
 * same line that constant sits on: the catalogs above are generated content about
 * what is TRUE, these two are authored content about what words MEAN and how to
 * say them.
 *
 * WHY IT EXISTS. Three failures in one day (2026-08-09), all one root cause —
 * on-screen vocabulary defined nowhere:
 *
 *   "what is a linked pair"        -> "the two offsetting AAI legs of one move"
 *   "what is a linked transaction" -> "an item-ledger row and its matching GL row"
 *   the owner, on the Details grid -> "why is there no related order data but I
 *                                      have a group code?"
 *
 * The first two are the AI reaching for the DMAAI reference the server prepends as
 * the system prompt, which is dense with pairing language. The third is a human
 * hitting the same gap from the other side. A term nobody defines gets defined by
 * whatever is nearest, and what is nearest here is the accounting layer.
 *
 * THE COLLISION IS THE POINT. Most of these entries exist because the same English
 * word means something else one layer down. So the block says out loud that it
 * overrules that reference — a definition that merely competes with the system
 * prompt loses, proven by shipping one mid-prompt and watching it lose.
 *
 * WHAT EARNS A PLACE. A term appears here only if it is ON an analyst screen AND
 * would otherwise be got wrong — because it collides with an accounting term, or
 * because the screen shows it blank/oddly in a way that reads as missing data.
 * This is not a dictionary of the domain; the reader knows the domain. Every entry
 * costs tokens on every analyst call.
 *
 * ONE SOURCE. Any analyst-facing prompt appends this rather than hand-rolling its
 * own list — a per-prompt copy is the drift shape the RRV8.txv header below was
 * written about (nine maps, three names for one pattern).
 */
window.RRV8.GLOSSARY = [
  'GLOSSARY — THIS PRODUCT’S OWN TERMS, as used on the screen in front of the reader. A background reference may use the same words for a DIFFERENT concept at the accounting layer; where they collide, THIS list wins and that reference does not apply.',
  '- LINKED TRANSACTIONS / A LINKED TRANSACTION / LINKED PAIR / LINKED (a lane on Transaction Variance): two or more JDE DOCUMENTS that belong to one business event, matched to each other and judged as a whole rather than one at a time — typically a sales-side order and its purchase-side counterpart, held together by a group code. Families: Transfers, Direct Ship, Intercompany, Make to Order. [GUIDANCE, not for quoting: this is about DOCUMENTS matched to each other. NOT a cardex row and its GL row, NOT a pair of AAI legs, nothing to do with debits and credits.] [ON=home]',
  '- SINGLE DOCUMENTS (a lane): one document each, claimed in the reconciliation’s precedence order. [ON=home]',
  '- NOTHING CLAIMED THESE (a lane): no pattern matched them; work them by amount, largest first. [ON=home]',
  '- GROUP / GROUP CODE (a Details column): the key holding one linked group together. It is built from the documents themselves, so the related order is inside the code even when it is not in its own column. [ON=txn]',
  '- REL TYPE / REL ORDER vs ORIG TYPE / ORIG ORDER (Details columns): two DIFFERENT linkage mechanisms, and which one carries the link depends on the family. Rel* are the F4211 related-order fields — a sales line pointing at its counterpart line — and they carry transfers and intercompany. Orig* are the ORIGINATING order, and that is where Make to Order links, because a work order is not an F4211 sales line. A blank Rel Order on a Make to Order row is by design, not missing data. [ON=txn]',
  '- CARDEX VARIANCE: on-hand (F41021) against the item ledger (F4111), for one item. It is ACCOUNT-BLIND — it is NOT the ledger-versus-GL gap, and no account or AAI is involved in it. [ON=cardex,home]',
  '- MODEL DMAAI TABLE: DMAAI 4152 for the company, the routing every inventory account assignment resolves through. Its document type comes from the company record, so only that one type is live. [ON=model,home]',
  '- EXCLUDED GL CLASS: a GL class an item uses that has NO 4152 entry, so there is no account to reconcile it against and its whole on-hand value sits outside reconciliation. Judge it on the amount it holds, never on what the class code is named. [ON=model,home]',
  '- CARRIES COST / UNCOSTED STOCK (markers on a 0.00 excluded row): two different reasons a row reads zero. CARRIES COST = the items have a unit cost and nothing is on hand, so it starts excluding value on the next receipt. UNCOSTED STOCK = there IS quantity on hand and no item carries a cost, so the zero is a costing gap. [ON=model,home]',
  '- INTEGRITY REVIEW (the Data Health list): the configuration and data-setup checks — GL Class Integrity, UOM Conversion, Frozen Cost. Findings about how the data is SET UP, not about a period’s variance. [ON=home]'
].join('\n');

/*
 * RRV8.CARDEX_COLUMNS — the COLUMN DICTIONARY for the Cardex Variance worklist:
 * every header exactly as the grid renders it, on the SAME LINE as the one sentence
 * that says what it holds.
 *
 * WHY IT EXISTS (UI-73). An analyst on the Cardex Variance tab asked "what does tx
 * column mean in the amount variance section" and was told the Tx column was "the
 * transaction-variance (ledger-vs-GL) view, not cardex". That is not a partly-right
 * answer, it is a different product surface. Re-fired at the shipped prompt, the
 * same question also produced "the transaction-type/document behind each cardex
 * row", and "what is method and level on the cardex grid" came back as "cost method
 * and level are item-cost setup, not columns on the cardex grid" — while both were
 * on the screen in front of the reader.
 *
 * THE GLOSSARY ABOVE COULD NOT HAVE PREVENTED ANY OF IT. It defines CONCEPTS —
 * lanes, group code, cardex variance, excluded GL class — and not one of the
 * fourteen headers the analyst is pointing at. So a header question had no source to
 * be answered from, and the model did what it does with two letters and no
 * definition: it matched "tx" to Transaction Variance, a real surface the grounding
 * discusses at length. Worse, it assembled the fabrication out of the anti-collision
 * sentence written to stop exactly this ("it is NOT the ledger-vs-GL gap"). A
 * disclaimer is not a definition, and a model holding only a disclaimer will recite
 * it as one.
 *
 * WHY THE DEFINITION SITS ON THE LABEL'S OWN LINE, and not in a second hand-authored
 * list beside the grid: the grid renders its headers FROM this array (RRV8.colLabels
 * below), so renaming a column means editing the line that defines it. There is no
 * state where a header exists and its definition does not, and none where a
 * definition describes a header the grid stopped showing. A second list has to be
 * kept in step by whoever remembers, and docs/plans/shared-figure-registry.md exists
 * because nobody does.
 *
 * ORDER IS THE RENDER ORDER. home.html's cardex drawer builds its cells positionally
 * against these labels; reorder a line and you must reorder that render with it.
 *
 * EVERY DEFINITION IS DERIVED FROM WHAT THE CODE PRODUCES, never from what the
 * header sounds like. Measured against v6ui_itemrollintegritydialog,
 * usp8_item_position, usp6_006b_cardex_variance and v6_006_perpetual on Demo1
 * company 80002: TxCount is COUNT(*) over rtransactions for the row's itemid where
 * creationdate is older than yesterday, and it hand-counted to the same 103 / 117 /
 * 33; MAX() over that identical set is what Last Activity shows; estunits and
 * baselinevar reproduce exactly as (cardex − baseline cardex) minus (on-hand −
 * baseline on-hand); AOH ÷ QOH reproduces the matched F4105 unit cost to six
 * places. Method is the header that reads most wrongly: it is
 * isnull(F4105.coledg,'XX'), WHICH cost row matched, never the cost method the item
 * is assigned to — F4102.IBCOST is in neither database.
 *
 * THE LEAD LINE OVERRULES THE SYSTEM PROMPT BY NAME, and this block comes FIRST in
 * the ask, ahead of the role line. Both were learned by the glossary above: a
 * definition placed mid-prompt lost to the server's prepended DMAAI reference twice.
 */
/* =====================================================================================
 * RRV8.TXN_COLUMNS — the COLUMN DICTIONARY for the Transaction Details grid and the
 * Variance Analyzer's routing table, keyed on the column key the grid already uses.
 *
 * WHY IT EXISTS (UI-91). The element-by-element walk counted 41 `<th>` on this page and
 * NOT ONE carried a definition: bare codes an analyst cannot resolve (`Co`, `OT`, `DT`,
 * `Cost`, `GL`, `Sub`), words that read as English but are product terms (`Offset`,
 * `Type`, `Worked`), and jargon with no gloss anywhere (`Model Table`, `Inv DMAAI`).
 * This is the third grid to have the problem after the cardex grid (UI-73) and the
 * As-Of grid (UI-79), and it is the one the drill-down actually lands on.
 *
 * Same contract as CARDEX_COLUMNS: the header renders FROM this dictionary, so a rename
 * cannot orphan its definition. Two rules the definitions follow, both earned:
 *   * A ZERO IS NOT AN ABSENCE. `Ledger` says so out loud, because "LedgerAmount = 0
 *     means the correlation found nothing" has now caused wrong findings twice.
 *   * NAME THE MATCH KEY. It differs per transaction type, so `Doc #` and `Order #` say
 *     which one the GL actually correlates on.
 * ===================================================================================== */
/* =====================================================================================
 * RRV8.kAmount — the ONE thousands abbreviation for money.
 *
 * WHY (found by the element walk, 2026-08-10). home.html carried FOUR shorteners with TWO
 * different rounding rules, and they disagreed on a figure that was on screen at the time:
 * the Cardex chip and totals panel read "$4.0K" while the framework below them read
 * "$4,050". Both were right about the data and wrong about each other.
 *
 * The cause is a JavaScript trap worth knowing: `(4050/1000).toFixed(1)` is "4.0", NOT
 * "4.1", because 4.05 has no exact binary representation and lands just below the halfway
 * point. `Math.round(4.05 * 10) / 10` gives 4.1. Three of the four shorteners used toFixed
 * and one used Math.round, so the same amount abbreviated two ways depending on which
 * function the surface happened to call.
 *
 * Money rounds HALF UP, so Math.round is the correct rule and toFixed is the bug. One
 * producer per figure applies to the FORMATTER as well as the number
 * ([[feedback_one_producer_per_figure]]) -- a shared rounding rule is a shared figure.
 *
 *   RRV8.kAmount(4050)   -> '4.1K'     one decimal under 10K
 *   RRV8.kAmount(45500)  -> '46K'      whole thousands at or above 10K
 *   RRV8.kAmount(1.2e6)  -> '1.2M'
 *   RRV8.kAmount(940)    -> '940'      below 1K, unabbreviated
 * Returns the MAGNITUDE only. The caller owns the sign and the currency symbol, because
 * sign convention differs per surface and money must not carry a symbol it did not earn.
 * ===================================================================================== */
window.RRV8.kAmount = function (v) {
  var a = Math.abs(Number(v) || 0);
  if (a >= 1e6) { var m = a / 1e6; return (m >= 10 ? Math.round(m) : Math.round(m * 10) / 10) + 'M'; }
  if (a >= 1e3) { var k = a / 1e3; return (k >= 10 ? Math.round(k) : Math.round(k * 10) / 10) + 'K'; }
  return String(Math.round(a));
};

window.RRV8.TXN_COLUMNS = {
  // ---- the analyst's own per-row review -----------------------------------
  Worked:        'Your review of this row: whether you agree it is explained. Stored per row, so it survives a re-run.',
  Note:          'Your note on this row. Row-level, separate from the finding filed for the whole card.',
  // ---- identity ----------------------------------------------------------
  CompanyNumber: 'The REPORTING company, which is not always the document company. An intercompany leg reports under one and carries another.',
  LongAccount:   'The full business unit, object and subsidiary the inventory side posted to.',
  OffsetAccount: 'The other account carrying value for the same document, when the variance offsets across two accounts rather than going missing.',
  Type:          'Transaction family, derived from BATCH TYPE first and document type only as a fallback: Sales, Purchasing, Mfg or Inventory.',
  SubType:       'The card claiming this row. Empty means no claim matched and it sits on an Unclassified card.',
  OT:            'Order type. SO/SA sales, OP/OT purchasing, WO/W1/WR work orders, ST/OT transfers, SI/SK/OK intercompany.',
  DT:            'Document type on the transaction: IC completion, IM material issue, IT transfer, II inventory issue, RM credit, JS sales.',
  DocNumber:     'The document number. Manufacturing accounting assigns the GL its OWN document number, so on Mfg rows this is the item-ledger one and the GL is matched by work order instead.',
  OrderNumber:   'The order this belongs to. On manufacturing it is the WORK ORDER, which is the GL subledger the two sides correlate on.',
  // ---- the two sides and their difference ---------------------------------
  CardexAmount:  'The item-ledger (F4111) amount, at the grain this row is aggregated to.',
  LedgerAmount:  'The GL (F0911) amount the correlation found. ZERO MEANS IT FOUND NOTHING under the key it used — it does NOT mean the GL is empty. Check the key before calling an entry absent.',
  Variance:      'Ledger minus cardex. That direction is deliberate and matches Home, so a positive figure means the GL carries more than the item ledger.',
  Currency:      'Transaction currency. Companies on different currencies never net against each other.',
  Comment:       'What the classifier stamped when it claimed this row, or the offsetting account/period it named.',
  // ---- the batch, and what a batch does NOT prove -------------------------
  BatchType:     'Stamped by the PROGRAM that wrote the batch, which is why it discriminates better than document type: 0 manufacturing accounting, N inventory, V A/P voucher, O purchasing, G general.',
  Batch:         'The JDE batch number, and a research handle for finding the document in F0911. A batch means the program processed the row; it is NOT proof the journal was written.',
  // ---- dates -------------------------------------------------------------
  PeriodEnds:    'The fiscal period this row is reported in. A document can post in one period and report in another, which is what the Period Mismatch card claims.',
  TransDate:     'The transaction date on the item-ledger row.',
  // ---- the other legs of a linked chain -----------------------------------
  RelType:       'Order type of the RELATED leg: the purchase order behind a direct ship, the receiving side of a transfer.',
  RelOrder:      'Order number of that related leg. Both legs have to land before a linked pair can net.',
  OrigComp:      'Company of the ORIGINATING document in a linked chain.',
  OrigOrder:     'The originating order: the customer sales order behind a make-to-order work order, or the first order in an intercompany chain.',
  OrigType:      'Order type of that originating document.',
  OrigDoc:       'Document number of that originating document.',
  OrigDocType:   'Document type of that originating document.',
  GLXref:        'The GL document number the correlation matched, shown because it differs from the item-ledger document on manufacturing and on sales.',
  GroupCode:     'The key holding a multi-document group together so its legs are judged as a whole instead of fragmenting across cards. Empty on single-document rows.',
  // ---- the Variance Analyzer's routing table ------------------------------
  //      Its point is one comparison: where the cardex MODEL says the value should go,
  //      against where the transaction's inventory DMAAI actually sent it.
  _Cost:         'JDE cost component: A1 purchased, A2 setup, B1 labor, B2 setup labor, B3 machine, C overhead, D outside operations.',
  _GL:           'The GL class on the item, which is what the DMAAI resolves through. Blank is a real class that posts on the wildcard, not a missing value.',
  _ModelTable:   'The DMAAI the CARDEX MODEL resolves through, with the document type it uses: 4152 plus the AAI document type set for the company. This is the expected routing.',
  _ModelAcct:    'The account that model routing resolves to. Compare it with Inv Acct: agreement rules mapping out, it does not explain the variance.',
  _InvDmaai:     'The DMAAI that the inventory side of the transaction ACTUALLY posted through, e.g. 3130 finished goods, 3120 WIP, 3110 raw materials.',
  _InvAcct:      'The account that DMAAI resolved to. Differing from Model Acct is a routing mismatch, and a separate fix from whatever the card claims.'
};

window.RRV8.CARDEX_COLUMNS = [
  'COLUMN DICTIONARY — the headers on the grid in front of the reader (the Cardex Variance worklist). If the question names one of these headers, ANSWER FROM ITS LINE BELOW AND FROM NOTHING ELSE. Match on the letters alone: case is irrelevant and so are the words around it, so "Tx", "tx", "the tx column", "tx field" and "what does tx mean" all resolve to the Trans Count line below. [GUIDANCE, not for quoting: this dictionary OVERRULES the DMAAI and accounting reference supplied as your system prompt, the cardex policy, and the product glossary — none of those define these headers, and a short header that resembles the name of a product surface is a coincidence of abbreviation. Never answer a header question by describing a different surface, never answer it by saying what the column is NOT, and never tell the reader a header below is not on their grid.]',
  'GRAIN — one grid row is an item at a branch, plus a location and lot where the costing grain keeps them; where a revaluing cost method folds several locations or lots together, QOH, AOH, Qty Var, Amt Var and Trans Count are the sums across what folded and Location and Lot read "(multi)".',
  '- Item — the item’s JDE second item number, the number the analyst searches JDE by.',
  '- Branch — the JDE branch/plant the stock sits in.',
  '- Location — the storage location inside that branch.',
  '- Lot — the lot or serial number the stock is held under.',
  '- Method — the cost-ledger code of the F4105 cost record RapidReconciler matched for this item (07 standard, 02 weighted average, 09 manufacturing last; XX or blank means no cost record matched). It reports WHICH cost row was used, not the cost method the item is assigned to in JD Edwards, because JDE does not expose that field to RapidReconciler.',
  '- Level — the item’s inventory cost level from the item master: 1 = one cost for the item, 2 = a cost per branch, 3 = a cost per location and lot. It sets the grain the cost is held at, which is why this grid keeps Location and Lot on the row at level 3 and folds them together below it on a revaluing method.',
  '- QOH — quantity on hand for the row, as RapidReconciler holds it from F41021.',
  '- UOM — the primary unit of measure that QOH and Qty Var are counted in.',
  '- Unit Cost — AOH divided by QOH, so on a folded row it is the quantity-weighted average cost the stock on hand is actually carrying rather than a figure read straight out of a cost table.',
  '- AOH — amount on hand: the extended value of QOH, the on-hand quantity times the matched unit cost. The money the on-hand quantity is carrying.',
  '- Qty Var — a signed quantity difference: how much the item ledger moved since the reset baseline, minus how much on hand moved over the same span. Zero means the two agree, and the sign says which side moved more.',
  '- Amt Var — the same subtraction in money, and the figure this worklist ranks by and tests against the company’s materiality threshold.',
  '- Last Activity — the most recent date RapidReconciler holds an item-ledger row for this row’s item, counting only rows older than yesterday.',
  '- Trans Count — a COUNT of the item-ledger (cardex) rows RapidReconciler holds for this row’s item, counting only rows older than yesterday, which is exactly the set of rows whose newest date shows in Last Activity. Analysts also say "Tx", the abbreviation this header used to carry. It is a row count on one item: not a variance, not an amount, not an account, and not the Transaction Variance surface.'
];

/*
 * Right-alignment, kept beside the dictionary rather than in the consuming page so a
 * header rename touches one file. This is the only thing here that can quietly fall
 * out of step with a label, and it falls out of step three lines from it.
 */
window.RRV8.CARDEX_COLUMNS_NUM = { 'QOH': 1, 'Unit Cost': 1, 'AOH': 1, 'Qty Var': 1, 'Amt Var': 1, 'Trans Count': 1 };

/*
 * The headers that exist on NO other analyst surface and mean nothing else in the
 * product, so a question naming one is a cardex question wherever it was typed.
 * Item / Branch / Location / Lot / Method / Level / UOM / Unit Cost are deliberately
 * absent: they are ordinary words an analyst uses about any surface, and routing on
 * them would send a transaction-variance question to the cardex playbook.
 */
window.RRV8.CARDEX_COLUMNS_SOLE = ['Trans Count', 'Tx', 'QOH', 'AOH', 'Qty Var', 'Amt Var', 'Last Activity'];

/*
 * The readers of a column dictionary. colLabels is what makes a grid unable to drift
 * from its definitions: the rendered headers ARE the dictionary's labels, parsed off
 * the front of each definition line. colBlock is the prompt form.
 */
window.RRV8.colLabels = function (dict) {
  return (dict || []).filter(function (l) { return String(l).slice(0, 2) === '- '; })
    .map(function (l) { return String(l).slice(2).split(' — ')[0].trim(); });
};
window.RRV8.colBlock = function (dict) { return (dict || []).join('\n'); };
window.RRV8.namesCardexColumn = function (q) {
  var s = ' ' + String(q || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  return (RRV8.CARDEX_COLUMNS_SOLE || []).some(function (lbl) {
    return s.indexOf(' ' + lbl.toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ') >= 0;
  });
};

/*
 * RRV8.ASOF_COLUMNS — the COLUMN DICTIONARY for the As-Of perpetual grid (UI-79).
 *
 * WHY IT EXISTS. UI-73 built the cardex dictionary on the conclusion that home.html
 * held the only free-text ask box. That was wrong: inventory-asof.html has one too,
 * and it shipped ASOF_GROUNDING with no dictionary at all — so every header question
 * on a 48-column grid was answered from the header's spelling.
 *
 * TWO OF THESE HEADERS ARE ACTIVELY MISLEADING, which is worse than undefined.
 * Sales01..Sales10 and Purch01..Purch10 are F4102 reporting CATEGORY CODES
 * (ibsrp1..ibsrp0, ibprp1..ibprp0). They sit in a grid that also has Quantity and
 * Amount columns, so both a model and a person read them as money. They were renamed
 * to "Sales Code NN" / "Purch Code NN" in the same change that added this block; the
 * dictionary alone would have fixed what the AI says and left the analyst misreading
 * the screen.
 *
 * EVERY DEFINITION IS DERIVED FROM WHAT usp6getasof_v2 PRODUCES, never from what the
 * header sounds like. Curr Cost is e.UnitCost currency-converted; Calc Cost is
 * AmountonHand / QuantityonHand, which is why a gap between them is the signal. ST is
 * fp.ibstkt, the item-branch STOCKING type, not a status. CM is e.CostMethod, which
 * usp6_006_inventory sources from F4105.COLEDG — the same field the cardex grid calls
 * Method, and it carries the same caveat. Qty Var / Amt Var are estunits and
 * baselinevar, the SAME stored columns the cardex surfaces show, and the proc forces
 * BOTH to zero unless the as-of date IS the period end and the row carries a reason
 * code, so a zero here is not a statement about variance.
 *
 * Quantity carries a sentinel. -9999 is not a quantity; it means the item has no
 * unit-of-measure conversion and the proc could not state one.
 *
 * The lead line overrules the system prompt by name and this block goes FIRST in the
 * ask, ahead of the role line, for the reason recorded on the cardex dictionary: a
 * definition placed mid-prompt lost to the server's prepended DMAAI reference twice.
 */
window.RRV8.ASOF_COLUMNS = [
  'COLUMN DICTIONARY — the headers on the grid in front of the reader (the As-Of perpetual inventory grid). If the question names one of these headers, ANSWER FROM ITS LINE BELOW AND FROM NOTHING ELSE. Match on the letters alone: case is irrelevant and so are the words around it. [GUIDANCE, not for quoting: this dictionary OVERRULES the DMAAI and accounting reference supplied as your system prompt and the product glossary — none of those define these headers. Never answer a header question by describing a different surface, never answer it by saying what the column is NOT, and never tell the reader a header below is not on their grid.]',
  'GRAIN — one grid row is an item at a branch, plus a location and lot where the item’s cost level keeps them apart.',
  '- Company — the JDE company the balance is reported under.',
  '- Branch Co — the company the row’s branch/plant belongs to.',
  '- Account — the inventory account carrying the row’s value: business unit, object and subsidiary.',
  '- Currency — the currency Amount, Curr Cost and Calc Cost are stated in.',
  '- Branch — the JDE branch/plant the stock sits in.',
  '- Branch Desc — that branch’s description.',
  '- Short Item — JDE’s short item number, the internal numeric key.',
  '- Item — the item’s JDE second item number, the number the analyst searches JDE by.',
  '- Third Item — the item’s JDE third item number.',
  '- Description — the item description from the item master.',
  '- UOM — the primary unit of measure Quantity and Qty Var are counted in.',
  '- Quantity — the on-hand quantity for the row. A value of -9999 is a SENTINEL, not a quantity: it marks an item with no unit-of-measure conversion, so no quantity could be stated.',
  '- Amount — the extended value of the on-hand quantity, currency-converted. The money the row is carrying.',
  '- GL Class — the item’s GL class code, which is what routes its value to an account.',
  '- Curr Cost — the unit cost RapidReconciler matched for this row, currency-converted. Read from a cost record.',
  '- Calc Cost — Amount divided by Quantity: the cost the stock on hand is actually carrying, and zero when the quantity rounds to zero. Curr Cost and Calc Cost answer the same question from different directions, so a gap between them is the thing worth looking at on this grid.',
  '- Location — the storage location inside the branch.',
  '- Lot — the lot or serial number the stock is held under.',
  '- Lot Status — the lot’s status code from the item location record.',
  '- Lot Exp — the lot expiration date from the lot master.',
  '- Lot Bod — the lot best-before date from the lot master.',
  '- ST — stocking type from the item branch record: S stock, M manufactured, P purchased. It says how the item is supplied, not whether anything is wrong with it.',
  '- CM — the cost-ledger code of the cost record RapidReconciler matched for this item. It reports WHICH cost row was used, not the cost method the item is assigned to in JD Edwards, because JDE does not expose that field to RapidReconciler.',
  '- Material — the material component of the row’s cost.',
  '- Labor — the labor component of the row’s cost.',
  '- Overhead — the overhead component of the row’s cost.',
  '- Qty Var — the stored cardex variance in quantity: how much the item ledger moved since the reset baseline, minus how much on hand moved over the same span. Same figure and same direction as the Cardex Variance grid. It is forced to zero unless the as-of date IS the period end and the row carries a reason code, so a zero here does not mean the item has no variance.',
  '- Amt Var — the same subtraction in money, under the same two conditions, and zero here carries the same caveat as Qty Var.',
  '- Sales Code 01 — a user-defined reporting CATEGORY CODE on the item branch record. It is a code, never an amount, and what it classifies is set up per install. The same applies to Sales Code 02 through Sales Code 10.',
  '- Purch Code 01 — a user-defined purchasing reporting CATEGORY CODE on the item branch record. It is a code, never an amount, and what it classifies is set up per install. The same applies to Purch Code 02 through Purch Code 10.'
];

/*
 * RRV8.txv — the ONE transaction-variance catalog. Taxonomy AND copy.
 *
 * WHY EVERYTHING LIVES HERE: the taxonomy was split across nine maps in three
 * files, and every one of them was a copy that MUST agree with the others —
 * which is a copy that WILL drift, silently:
 *
 *   config.js                     META, SUBTYPE
 *   home.html                     _TXV_PATTERN, KIND_EXPLAIN, CODE_EXPLAIN
 *   inventory-transactions.html   PATTERN_INFO, the classifyGridRow if-ladder,
 *                                 _TX_PATTERN_NAMES, _TX_CARD_FINDING
 *
 * Each drift shipped as working software. TXI and CNJ were added to Home and
 * never to Details, so the ?card= filter was skipped and the analyst saw every
 * card's rows. Five SubTypes shipped in the DB and were never added to the
 * Details if-ladder, so correctly-classified rows rendered under the wrong
 * card. One pattern carried three different names across three maps. Codes
 * outside CODE_EXPLAIN's six keys fell through to a per-kind sentence reading
 * "these transactions do not fit a known pattern yet" on a card that names a
 * confirmed mechanism (UI-62). None of it threw.
 *
 * So: ONE entry per code, carrying its identity AND every string any surface
 * shows for it. Three sections, one shape:
 *
 *   META     the Home cards. Insertion order IS the Home display order.
 *   GRID     Details-only shapes for rows the server left without a SubType.
 *            Never a Home card (those rows roll into the T-* terminals), so
 *            they carry no `cause`.
 *   SIGNAL   pseudo-codes the Details finding engine selects instead of the
 *            card when the ROWS are definitive (non-stock cost, a confirmed
 *            routing mismatch) or when no card is in scope.
 *
 * Per-entry fields:
 *   title        the ONE name. Every surface shows this string — card header,
 *                scope band, work panel, export filename.
 *   kind         Home chip (rebalance | self | mto | ico | linked | review).
 *   tier         Home lane (linked | single | terminal). The lanes are the
 *                classifier's own phases, and the order of entries WITHIN a lane
 *                is the order usp8_txv_classify claims them. So the Home page
 *                reads top to bottom as the pipeline actually runs: groups form
 *                first, then the single-document claims in precedence order,
 *                then whatever nothing claimed. Moving an entry changes what the
 *                analyst is told runs first -- only move one to match a change in
 *                the procs.
 *   disposition  Details chip (rebalance | expense | self | triage).
 *   cause        Home card body. Short: what happened plus the lever.
 *   desc         Details "What it is". Long form; feeds the card tooltip and
 *                the work panel.
 *   action       Details "Likely fix". Long form, same two consumers.
 *   finding      the structured investigation report the analyst files:
 *                { flag, mech, checked[], context[], found[], fix[],
 *                  recurrenceIdx?, dmaai?, triage? }. See _txFindingText in
 *                inventory-transactions.html for how it renders.
 *
 * THE checked / context SPLIT IS LOAD-BEARING. READ THIS BEFORE EDITING A CARD.
 *
 * Every defect the 2026-08-10 claim audit found was ONE thing: prose asserting
 * something no code tests, under a heading that reads as a test result. Five
 * examples, all shipped, all plausible: a transfer card stating the GL held both
 * legs netting to zero when the claim reads F4111 only (and the GL was ONE
 * zero-value leg on 80 of 83 rows); a completion card stating the GL was searched
 * "under any company, under any document type" when the query is scoped to the
 * row's own company and to two document types; four linked cards stating "DMAAI
 * routings resolve correctly, mapping ruled out" when no linking pass reads an
 * AAI at all; a duplicate-sales card stating the variance equals the duplicated
 * relief when there is no amount test; an account card stating both sides posted
 * when nothing checks presence. The word "Confirmed." was the tell every time.
 *
 * So the two lists are DIFFERENT KINDS OF SENTENCE and the difference is enforced:
 *
 *   checked[]  { a: '<assertion id>', t: '<text>' }. `a` names an assertion the
 *              CLASSIFIER declares in its own claim block as an `@asserts` line
 *              (see usp8_txv_*.sql in RapidReconciler-DB). Tools/check_txv_cards.py
 *              FAILS the build on a bare string, on an id no proc declares, and on
 *              an empty `t`. RRV8/txv-assertions.json is the generated manifest and
 *              the DB repo's CI fails if it drifts from the SQL. That gate is why a
 *              bullet under "What happened" can be trusted.
 *   context[]  plain strings. True, useful, and NOT tested on these rows — a
 *              specimen measurement, a JDE behaviour, a scope limit the analyst
 *              has to widen by hand. Renders under its own heading, "Not tested on
 *              these rows". A bullet here must not read as a test result.
 *
 * ADDING A CHECK: add the `@asserts` line to the proc first, then cite its id.
 * If there is no assertion to cite, the sentence belongs in `context` or nowhere.
 * Never invent an id to get a bullet past the gate — that reintroduces the disease
 * with a green build on top of it.
 *
 * Classifiers, also here so no consumer re-implements one:
 *   code(row)      Home: SubType -> code, else transaction Type -> a T-*
 *                  terminal. Every row lands in exactly one code, so the cards
 *                  partition the residual.
 *   gridCode(row)  Details: the duplicate-relief flag, then SubType, then the
 *                  cardex/GL grid shape. Finer than code() only for rows the
 *                  server left unclassified.
 *   Both route through subtypeCode(), which console.warns ONCE per unmapped
 *   SubType. An unmapped SubType used to fall silently into the grid-shape
 *   branch and render under the wrong card; now it is noisy.
 *
 * ADDING A CARD: one META entry, one SUBTYPE entry. Every surface picks it up.
 * A code with no `cause` / no `finding` warns in the console rather than
 * rendering a generic sentence nobody notices.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var META = {
    // ---- SINGLE DOCUMENT (Phase 2) — in usp8_txv_classify claim order ---------
    //      usp8_txv_net runs first (it nets, it does not stamp a card), then
    //      account_mismatch, period_mismatch, and the ten claims inside
    //      usp8_txv_flags. The order below IS that order, read off a run log — a
    //      card earlier in this list has PRECEDENCE over one later, because it
    //      claims first and every claim guards on an unclaimed SubType.
    'ACCT': {
      title: 'Account Mismatch', kind: 'rebalance', tier: 'single', disposition: 'rebalance',
      cause: 'The item ledger and the GL put this document on two different accounts, and the two offset, so the document itself balances. Compare the GL class behind each account, correct the class on the affected items, and turn off account entry and override on the version in use.',
      desc: 'Both sides of the document posted, and the variance nets to zero across the accounts it touched, so the value is sitting on the wrong account rather than missing. One account carries the item-ledger amount, another carries the GL amount, and the row names the offset. Usual causes: the two accounts belong to different GL classes under the same AAI, so a class that changed after the document posted sends one side elsewhere, or the two legs read their class from different places (on a material issue the credit takes each component\'s GL class while the debit takes the parent\'s). The other case is a program version that lets the operator key a GL account at entry, so the AAI account reaches F4111 while the keyed account reaches F0911.',
      action: 'Read the offset account named on the row against the account on the item-ledger side, and work out which AAI and GL class each one resolves from. Where they differ only by GL class, correct the class on the affected items so both legs resolve together. On inventory documents, turn off Allow Entry of GL Account and Allow Override of GL Account on the version in use: either one left on lets the account be keyed over the AAI every time. On sales documents the Business Unit Source option on R42800 decides the business unit segment, so check it there. Re-run the company and period, and corrected documents drop off.',
      finding: {
        dmaai: true,
        mech: 'The document is in balance, and its value sits on two accounts that offset each other.',
        checked: [
          { a: 'ACCT.netswithin', t: 'The variance nets to within tolerance across the accounts this document touched, in one batch and one period.' },
          { a: 'ACCT.offsetnamed', t: 'The offset account is named on the row.' }
        ],
        alsoChecked: [
          { a: 'ACCT.sameperiod', t: 'Period is part of that grain, so both offsetting rows are in the same month. A cut-off cannot explain this one.' },
          { a: 'ACCT.samebatch', t: 'Batch is part of that grain, so both rows came out of the same run.' },
          { a: 'ACCT.ungrouped', t: 'Single document, not a leg of a transfer, direct-ship or intercompany group.' },
          { a: 'POP.inventoryaccount', t: 'Both accounts are inventory accounts.' }
        ],
        context: [
          'Not tested: whether both sides posted. This card is about WHERE the value sits, and the classifier never checks that an entry exists. On a manufacturing row the ledger ties to the GL by work-order subledger, not document number, so a zero GL amount means the correlation found nothing — never that F0911 is empty.',
          'Not tested: which side each account holds. The card describes the item ledger on one account and the GL on the other, and that is only one of the shapes this claim admits: both accounts can carry both sides and simply offset. Read the two rows before assuming which one you have.'
        ],
        found: [
          'The document itself balances. What is wrong is which account holds each side.',
          'Likely cause, not yet confirmed: the two accounts belong to different GL classes under the same AAI, and the class that applied when the entry was written is not the one the item resolves through now.',
          'Second possibility: the account was keyed at entry and the AAI never got to route it.'
        ],
        fix: [
          'Read the offset account named on the row against the account on the item-ledger side, and compare the AAI and GL class each resolves from.',
          'Where they differ only by GL class, correct the class on the affected items so both legs resolve to one account.',
          'On inventory documents, turn off Allow Entry of GL Account and Allow Override of GL Account in the version in use.',
          'Re-run this company and period. Documents whose legs now resolve together drop off.'
        ]
      }
    },
    'PER': {
      title: 'Period Mismatch', kind: 'self', tier: 'single', disposition: 'self',
      cause: 'The item ledger and the GL recorded these documents in different months. Set GL Date Source to follow the transaction date, and schedule the batch runs to finish before the period closes.',
      desc: 'The cardex movement and its GL counterpart landed in different months — the document is reported in one period and posted in another. Usual causes: a GL Date Source processing option pointed at the invoice or promised date rather than the item-ledger date, or a batch program (Sales Update, Manufacturing Accounting, the cycle-count update) that ran after the period closed.',
      action: 'Set the GL Date Source option so the GL date follows the item-ledger date. It is named that on P4312 for PO receipts and P4314 for voucher match, it sits on the Defaults tab of R42800 for Sales Update, and cycle counts carry it as the GL Date option in R41413 / R41610. Schedule those runs to complete before the period closes so the two dates cannot straddle a period end. Re-run both periods afterwards: the document should net to zero across the two, and a gap that survives the next close is not a cut-off.',
      finding: {
        mech: 'This document\'s variance offsets against the same document in another month.',
        checked: [
          { a: 'PER.netswithin', t: 'The variance nets to within tolerance once the two months are added together, on one account and one batch.' },
          { a: 'PER.acrossperiods', t: 'The offsetting period is named on the row.' }
        ],
        alsoChecked: [
          { a: 'PER.sameaccount', t: 'Account is part of that grain, so both rows sit on the same account. This is not an account mismatch.' },
          { a: 'PER.ungrouped', t: 'Single document, not a leg of a transfer, direct-ship or intercompany group.' }
        ],
        context: [
          'Not tested: the dates themselves. No item-ledger date is compared against a G/L date anywhere in the classifier. What is tested is that the variance offsets across two months on one account and batch, which is the SHAPE of a cut-off. Confirm the two dates on one document before you take it to whoever owns the run.',
          'Not tested: whether both sides posted. For the row in front of you the amounts do NOT agree — they agree only after both months are added together. The usual shape is one leg carrying only a cardex amount and the other only a GL amount, but mixed pairs occur, so read both rows.',
          'Not every row on this card is timing. Most pairs sit one month apart, which is a period-end straddle, but some are several months apart and one that far apart is not a cut-off. Read the two periods on the row before you call it one.'
        ],
        found: [
          'Likely cause, not yet confirmed: a GL Date Source option is set to the invoice or promised date instead of the transaction date.',
          'Second possibility: a batch program ran after the period closed.'
        ],
        fix: [
          'Set GL Date Source to follow the transaction date: P4312 on PO receipts, P4314 on voucher match, the Defaults tab of R42800 on Sales Update, the GL Date option in R41413 and R41610 on cycle counts.',
          'Schedule those runs to finish before the period closes.',
          'Re-run both periods. The document should net to zero across the two.',
          'A gap still there after the next close is a posting error, not a cut-off.'
        ]
      }
    },
    // DAC-28 — promoted from Comment-only annotations to their own cards.
    'DUP': {
      title: 'Duplicate Sales', kind: 'rebalance', tier: 'single', disposition: 'triage',
      cause: 'The same order line was relieved from inventory twice while the GL booked it once, so the extra item-ledger line is the variance. Either the line was ship-confirmed again after it closed, or Sales Update abended and the re-run wrote the relief a second time.',
      desc: 'The same order line was relieved on the cardex more than once at the same (line, branch, item, location, lot) while the GL booked it once, so the variance equals the duplicated relief. JDE increments the line number for a genuine partial shipment, so a repeated line number is a double relief, not a split. Either the line was ship-confirmed a second time, or an interrupted Sales Update re-ran against a workfile that still held its records.',
      action: 'Reverse the duplicate relief at the source and leave the original. Then establish which case it was, because the preventive change differs. A re-confirmed line means restricting the statuses at which ship-confirm is allowed. An abended Sales Update means recovering its workfile before any re-run, and finding out why it abended. Check next period: a step that fires twice duplicates the next order too.',
      finding: {
        mech: 'An order on this document was relieved from inventory twice. The GL booked it once.',
        checked: [
          { a: 'DUP.integrityflag', t: 'The duplicate-sales integrity check flags this order for this period.' },
          // Trimmed from 40 words to 25 on 2026-08-15 to clear the word limit once
          // `checked` stopped being baselined. Both ideas kept: the shape of the
          // repeat, and why a repeat is a relief rather than a split.
          { a: 'DUP.repeatedlineid', t: 'Repeated line ID at one item, location and lot, net quantity non-zero. JDE increments the line on a partial shipment, so repeats are double relief.' }
        ],
        alsoChecked: [
          { a: 'DUP.ordergrain', t: 'The flag is at ORDER grain. Every row of this order in this period carries it, including rows that are not themselves the duplicate — check the item-ledger column per row before you act on one.' }
        ],
        context: [
          'Not tested: that the variance equals the duplicated relief. No amount is compared anywhere in this claim. Rows on this card need not show a doubled amount at all, and some carry no item-ledger side. Find the duplicated line yourself; the card points at the order, not the row.'
        ],
        found: [
          'Inventory was relieved twice for one shipment, so the item ledger is short by that value.',
          'Likely cause, not yet confirmed: the line was ship-confirmed a second time after it closed.',
          'Second possibility: Sales Update abended and the re-run wrote the relief again from a workfile that still held it.'
        ],
        fix: [
          'Reverse the duplicate relief at the source with an inventory adjustment. Leave the original.',
          'If the line was re-confirmed: restrict the statuses at which ship-confirm is allowed.',
          'If Sales Update abended: recover its workfile before any re-run, and find out why it abended.',
          'Check next period. A step that fires twice will duplicate the next order too.'
        ]
      }
    },
    // Two F0911 legs that cancel, neither on the inventory account. LedgerAmount = 0
    // here does NOT mean "no G/L entry" — the entry posted and self-cancelled elsewhere.
    'VCHR': {
      title: 'A/P Voucher on Inventory', kind: 'rebalance', tier: 'single', disposition: 'expense',
      cause: 'A/P vouchers posted to an inventory account instead of the A/P variance account. DMAAI 4330 is routing voucher variances into inventory. Correcting that route stops it; restricting account overrides on the voucher-match version keeps it corrected.',
      // 4330 DOES write to F4111 — do not put "a voucher moves no inventory" back
      // (UI-83). RRUniversity/inventory-distribution-aais.html lists 4330 as "Written
      // to F4111" and deliberately flags 4332 / 4335 / 4340 as "Not written to F4111",
      // so the exception is authored, not an oversight. Measured on
      // RCardexLedgerCompare2 where recstatus = 1 and SubType = 'Vouchers': Demo2 has
      // 1,033 of 3,812 voucher rows carrying a non-zero cardex amount, holding
      // $752,088.82 of item-ledger value and $156,068.43 of variance; Demo3 has 1 of 7.
      // The old copy told the analyst there was nothing to look at in a column holding
      // three quarters of a million dollars. The batch-type half of this card IS
      // correct: all 3,812 Demo2 rows carry BatchType V.
      desc: 'A/P voucher variance posted to an inventory account instead of the A/P variance account — DMAAI 4330 routes inventory items there. Read the cardex column per row before assuming the whole amount is the variance: most voucher rows carry no item-ledger side, but DMAAI 4330 writes to F4111 when the line type has Voucher Match Variance Account checked, and those rows tie against a real cardex figure.',
      action: 'Check DMAAI 4330 for this company and GL class. Correct the route so voucher variances land on the variance account, then restrict who can override the GL account on the voucher-match version. The value already posted stays in the inventory account until the accountant reclassifies it out.',
      finding: {
        dmaai: true,
        mech: 'A/P vouchers posted to an inventory account instead of the A/P variance account.',
        checked: [
          { a: 'VCHR.batchtypev', t: 'Batch type on these documents: V, so A/P voucher processing wrote the batch.' },
          { a: 'POP.inventoryaccount', t: 'The account they landed on is an inventory account.' }
        ],
        context: [
          { k: 'dmaai', t: 'Not tested: the DMAAI. Batch type is the whole test — nothing in the classifier reads AAI 4330 or any other route. 4330 is the likeliest way a voucher variance reaches an inventory account, which is why the card names it, but you have to look it up.' },
          'Read the item-ledger column per row. A voucher variance usually moves no inventory, but 4330 does write to F4111 when the line type has Voucher Match Variance Account checked, and those rows tie against a real cardex figure rather than against zero.'
        ],
        found: [
          'Likely cause, not yet confirmed: DMAAI 4330 is sending voucher variances to inventory for this company and GL class.',
          'Alternative, if 4330 reads correctly in JDE: the account was overridden at posting time.'
        ],
        fix: [
          'Correct DMAAI 4330 so voucher variances land on the variance account.',
          'Restrict who can override the GL account on the voucher-match version, or route those overrides through approval.',
          'Put the next voucher through and confirm its variance lands off inventory.'
        ]
      }
    },
    // Split out of Transfer Integrity 2026-08-10 (AN-2). The old card's population
    // divided absolutely on item-ledger leg count: the documents it could not explain
    // all held exactly ONE F4111 row, the ones it could explain all held two or more.
    // Different fault, different fix, and on the specimen company the missing-leg half
    // carried 87% of the dollars while the card's advice (compare the cost setup of
    // failing items against clean ones) had nothing at the end of it for an absent row.
    // usp8_txv_flags section C1 claims it on the structural test and runs ahead of C2.
    // THE CAUSE IS OPEN AND STAYS OPEN IN THE COPY. Whether JDE never wrote the row or
    // the load dropped it cannot be settled from the RR database; F4111's primary key is
    // ILUKID alone, so a collision is lost silently on insert. The decisive query is
    // against SOURCE F4111, and the card hands the analyst that query rather than a verdict.
    'TLM': {
      title: 'Transfer Leg Missing', kind: 'review', tier: 'single', disposition: 'triage',
      cause: 'A location transfer wrote one item-ledger leg. JDE writes a transfer as a pair, a relief and a receipt, and the counterpart of the row on file was never written, so the item ledger carries a one-way move of quantity and value both. The GL holds both legs on the same account and they net to zero, so the transfer itself completed. What happened to the missing row is the open question, and one query against the source F4111 settles it.',
      desc: 'An inventory-transfer (IT) document with a single F4111 row. JDE writes a transfer as a line-ID pair, .000 for the relief and .500 for the receipt, so one row on file means its counterpart never reached the item ledger. Quantity and value both moved one way, which leaves the receiving location short units as well as dollars and separates this from the priced-at-zero shape on Transfer Integrity. The GL is not the problem: F0911 holds both legs of these documents on the same account, posted, netting to zero, which is what a value-neutral location move should do. Either JDE never wrote the row, or it was lost on the way into RapidReconciler. F4111 is keyed on ILUKID alone, so a colliding key is dropped on load without an error. Nothing in this database separates the two.',
      action: 'Query the source JDE F4111 for the document numbers on this card and look for the missing line ID. That one lookup is what names the cause. Rows present in JDE and absent here point at the load, and the document numbers are what support needs to chase it. Rows absent in JDE as well make it a one-sided item-ledger write by the transfer program, which goes to Oracle through IT with the F0911 legs attached as evidence: both legs posted, one cardex row written. Read item, location, lot and date across the documents before you go, because a cluster on one combination and one day is a different conversation from failures scattered across the file. Restoring the inventory balance is a quantity-and-value adjustment the accountant books.',
      finding: {
        mech: 'A location transfer wrote one item-ledger leg. Its counterpart was never written, so quantity and value moved one way.',
        checked: [
          { a: 'TLM.oneleg', t: 'Item-ledger rows for the document: exactly one. JDE writes a transfer as a line-ID pair, .000 relief and .500 receipt, so the counterpart is absent.' }
        ],
        alsoChecked: [
          { a: 'TLM.doctypeit', t: 'Document type IT, an inventory transfer.' },
          { a: 'TLM.cardexonly', t: 'The GL correlation returned nothing for the row. That is what the zero in the ledger column means — not that F0911 is empty.' }
        ],
        context: [
          'Not tested per row: the GL side. The classifier reads F4111 here and nothing else. What has been seen on this pattern: an F0911 entry on the same account netting to zero, which is what a value-neutral location move should do, though not always as a clean pair — a single zero-amount leg also occurs. Pull the GL for your document rather than assuming the pair.',
          'Not tested: the extended cost on the leg that is present. The priced-but-never-extended fault behind Transfer Integrity is not screened out here; the leg count is the whole test.',
          'Which leg goes missing is not fixed. Either direction occurs, so leg direction is not a screen.'
        ],
        found: [
          'One leg of the pair never reached the item ledger, so the receiving location is short units as well as value.',
          'The GL generally carries the leg the item ledger does not have, so the transfer itself completed and the item-ledger write is what went missing. Confirm that on your document.',
          'Two candidates, and this database cannot choose between them: JDE never wrote the row, or the load dropped it. F4111 is keyed on ILUKID alone, so a colliding key goes silently.'
        ],
        fix: [
          'Query the source JDE F4111 for these document numbers and look for the missing line ID. That answers which of the two it is; nothing in RapidReconciler does.',
          'Present in JDE and absent here means a load fault. Hand over the document numbers.',
          'Absent in JDE as well means a one-sided item-ledger write by the transfer program. Take it to Oracle through IT with the F0911 legs as evidence.',
          'Read item, location, lot and date across the documents first. A cluster on one combination and one day points somewhere different from failures spread across the file.',
          'Restoring the inventory balance is a quantity-and-value adjustment the accountant books.'
        ]
      }
    },
    'TXI': {
      title: 'Transfer Integrity', kind: 'review', tier: 'single', disposition: 'triage',
      cause: 'A location transfer took value off the item ledger and the GL correlation found nothing to match it, so a move that should be value-neutral came off one-way. Both item-ledger legs are on file, which is what separates this from Transfer Leg Missing. The suspected fault is the receipt leg carrying a unit cost that never extended, so the amount never calculated — confirm that signature on one document before you work the rest, because this card holds every residual transfer the leg-count test did not take, not only the priced-at-zero ones.',
      desc: 'An inventory-transfer (IT) document that relieved value on the item ledger, whose GL correlation returned nothing, and which holds more than one item-ledger leg. Documents holding exactly one leg are claimed by Transfer Leg Missing before this card runs. Those four facts are the whole test. The suspected mechanism is a receipt leg that carried a unit cost with a zero extended cost, so the item-ledger amount never calculated and a value-neutral move destroyed inventory value — measured on a specimen as the receipt leg every time, but not screened for on your rows. A zero extended cost by itself is ordinary on transfer legs and harmless; it is the unit cost sitting on a leg that never extended that matters. No vendor article has been cited, so do not name it as a known defect.',
      action: 'Confirm the signature per document first, because the card does not: pull the F4111 legs and check whether the receipt leg carries a unit cost with a zero extended cost. Pull the GL for the document at the same time — the shape varies, and a valueless GL leg reads differently from a cancelling pair on another account. Where the signature holds, compare the cost setup of the failing items against items that transferred cleanly in the same period; that difference is the lead. Count the failures per period before treating the setup as still wrong: a clean recent period at normal transfer volume points at a cost change or a specific set of items rather than a permanent fault. Restoring the lost value is a dollars-only adjustment the accountant books.',
      finding: {
        mech: 'A location transfer took value off the item ledger and the GL correlation found nothing to match it.',
        checked: [
          { a: 'TXI.cardexonly', t: 'The item ledger carries value and the GL correlation returned nothing for the row.' }
        ],
        alsoChecked: [
          { a: 'TXI.doctypeit', t: 'Document type IT, an inventory transfer.' },
          { a: 'TXI.notoneleg', t: 'More than one item-ledger leg on the document. Documents holding exactly one are claimed by Transfer Leg Missing before this card runs, so a missing leg is ruled out.' }
        ],
        context: [
          'Not tested: the pricing. There is no extended-cost, unit-cost or leg-direction check anywhere in this claim — it takes every residual transfer the leg-count test did not take. The receipt-leg-priced-but-never-extended signature came from one investigated dataset, and it is a hypothesis on your rows until you pull the legs.',
          'Not tested, and it varies more than the card used to say: the GL side. Two different shapes have been seen on this card — a single GL leg for 0.00 on the same account as the item ledger, and legs sitting on a DIFFERENT account with nothing on the inventory account at all, not always netting to zero. Pull the GL for your document before you describe it to anyone.',
          { k: 'dmaai', t: 'Not tested: the DMAAI. Nothing in this claim reads a routing, so mapping is not ruled out here.' }
        ],
        found: [
          'Value came off the item ledger and the GL correlation found nothing carrying it.',
          'Cause not confirmed. The lead is a receipt leg that priced the quantity and never extended it. A zero extended cost on a transfer leg is common and harmless on its own, and only a small fraction of those legs also carry a unit cost — that combination is the signature to look for.',
          // recurrenceIdx points here — replaced at render with the count from the
          // loaded rows (UI-59). This general form must state no figure, because
          // the burst pattern verified on two companies is not a universal rate.
          'It arrives in bursts, not every period. Read the periods either side before calling it a standing fault: a recent clean period at normal transfer volume means the trigger stopped, which is a different problem from a setup that is still wrong.'
        ],
        recurrenceIdx: 2,
        fix: [
          'Confirm the signature per document FIRST: the receipt leg carrying a unit cost with a zero extended cost. The card did not test it.',
          'Pull the GL for the same document while you are there. The shape varies across installs and it changes what you tell the customer.',
          'Where the signature holds, compare the cost setup of those items against items that transferred cleanly in the same period. That difference is the lead.',
          'Check the periods either side and count the failures per period. A burst that starts and stops points at a cost change or a specific set of items rather than a permanent setup fault.',
          'Restoring the lost value is a dollars-only inventory adjustment, which the accountant books.'
        ]
      }
    },
    // Mfg completion on the cardex with NO completion entry in the GL — a
    // genuine posting gap. R31802A stamps the cardex batch and drops a slice of
    // EVERY run's completions (SPECIMEN figures, ONE dataset, do NOT ship them
    // as copy: 58 batches / 8 periods, none clean, none empty, 0.6%-24.6% per
    // batch — the card computes its own from the loaded rows, see UI-59);
    // the same run's other orders journal fine, so a healthy batch/account
    // doesn't clear it. NO vendor article matches it — KB 420628 is a near miss
    // ruled out on shape (its failure drops the IM entry, which would SUPPRESS
    // this card). No repost exists. Specimen evidence lives in the guide.
    'CNJ': {
      title: 'Completion Not Journaled', kind: 'review', tier: 'single', disposition: 'triage',
      cause: 'Work-order completions received finished goods into inventory with no GL entry for them, while the material issues for the same orders did post. Manufacturing accounting stamped the item ledger and wrote no entry. The pattern is a run that journals most of its completions and drops a slice, at a severity that moves from run to run; the card states the recurrence across your loaded periods. No Oracle Support article matches the shape. The fault is in the run, not these orders.',
      desc: 'A work-order completion received finished goods into inventory with no GL entry for it. The material issues for the same order did post. Manufacturing accounting stamped the batch on the item-ledger row, so it processed the row and wrote no entry. The batches and the account are healthy: both carry completions for many other orders. The pattern is a run that journals most of its completions and drops a slice, never a whole run failing outright, at a severity that moves from run to run. The finding below states the recurrence measured across the periods loaded here. No Oracle Support article matches the shape; KB 420628 is a near miss whose failure drops the material issue entry, which would suppress this card rather than create it.',
      action: 'Confirm in three checks. Search the GL for the work order: issues present, completion absent. Widen the search, no company or document-type restriction: still no completion. Check that the same batch and account carry completions for other orders: if they do, the gap is real. Then have whoever runs R31802A read the error report that run produces. Take it to Oracle through IT as an undocumented R31802A condition, not as KB 420628 — that article has a different cause and its manual-journal-entry remedy does not fit. Do not delete an unposted manufacturing batch, because nothing regenerates the entry.',
      finding: {
        mech: 'Work-order completions received finished goods into inventory with no GL entry for them.',
        checked: [
          { a: 'CNJ.nocompletion', t: 'No GL completion for this work order.' },
          { a: 'CNJ.issuespresent', t: 'Material issues (IM) for the same work order ARE in the GL, so the order did go through manufacturing accounting.' }
        ],
        alsoChecked: [
          { a: 'CNJ.mfgic', t: 'A work-order completion (IC) on the item ledger, in a manufacturing batch.' },
          { a: 'CNJ.searchscope', t: 'How far that search went: document types IC and IM, on this document\'s own company, on rows carrying a numeric work-order subledger. Widen it yourself before you tell the customer the entry does not exist.' },
          { a: 'CNJ.batchstamped', t: 'A batch is stamped on the item-ledger row, so R31802A processed the transaction and wrote no completion detail for it.' },
          { a: 'CNJ.unpostedwouldsuppress', t: 'Unposted is ruled out by the card firing at all: unposted GL entries are loaded, so an unposted completion would suppress this card and show up as a GL batch variance instead.' },
          // Orphaned until 2026-08-15 -- the classifier makes this assertion and no
          // bullet cited it, so the gate reported it as referenced-by-no-card.
          { a: 'CNJ.cardexonly', t: 'The row carries a cardex amount and no ledger amount, so the GL correlation found nothing for it.' }
        ],
        context: [
          'Not tested: the batches and the account. The card used to say both were healthy because they carry completions for other orders. That was a specimen finding, and it is the strongest evidence you can gather — go and check it on one of your own batches, because a batch full of other orders\' completions is what turns this from "a run failed" into "the run dropped this order".',
          'Not tested: summarization, and the test is BLIND to it rather than ruling it out. The GL search only counts rows with a numeric work-order subledger, so a summarized completion carrying no subledger is invisible and would CREATE this card. On both demos every completion in these batches carries a subledger, so summarization is not what is happening there — check yours.',
          'Not tested: other document types. A work order can carry GL rows under a document type this search does not count, journal entries among them, and whether any of those is the completion is unknown. Read the subledger before concluding the entry was never written.',
          'Not tested: whether the GL rows are posted, or whether the batches all reached our copy of the GL. Both were true on the demos.'
        ],
        found: [
          'No GL completion was found for these work orders under a work-order subledger. The material issues for the same orders were.',
          'Manufacturing accounting stamped the batch on the item-ledger rows, so it processed them and wrote no entry.',
          // recurrenceIdx points here. Replaced at render with the count from the
          // loaded rows (UI-59). This general form stands only when the loaded
          // window is too short to evidence recurrence either way — it must not
          // state a figure, because the figure differs per install.
          'Read the periods either side before treating this as a one-off. The pattern is a run that journals most of its completions and drops a slice, at a severity that moves from run to run.',
          'A batch that posted most of its completions is not evidence this order posted. Confirm per work order, never per batch.',
          'No Oracle Support article matches this. KB 420628 is the near miss, ruled out on shape: its failure drops the material issue entry, which would suppress this card rather than create it.'
        ],
        recurrenceIdx: 2,
        fix: [
          'Have whoever runs R31802A read the error report that run produces.',
          'Take it to Oracle through IT as an undocumented R31802A condition, not as KB 420628. That article has a different cause, and its manual-journal-entry remedy does not fit this.',
          'Do not delete an unposted manufacturing batch. The unaccounted units are already cleared, so nothing regenerates the entry.'
        ]
      }
    },
    // The sales-side analog of CNJ: cardex relieved inventory, a batch is stamped, and
    // F0911 holds NOTHING for the document under ANY doc type. Not posted elsewhere and
    // not posted in another period — absent. An UNPOSTED batch is not this (RR loads
    // unposted F0911, so an unposted entry SUPPRESSES the card and surfaces as the
    // separate GL Batches variance).
    // ⚠ WITHDRAWN SERVER-SIDE (DB PR #97). This card CANNOT currently fire and the copy
    // below describes behaviour that is no longer produced. Verified 2026-08-06: the
    // SubType is absent from usp8_txv_flags (the only proc that emits SubTypes), and
    // zero rows carry it on Demo1, Demo2 or Demo3. The entry is retained deliberately so
    // that a stale database still emitting it renders a titled card rather than the bare
    // string 'SNJ' — do NOT treat its presence here as evidence the claim is live.
    // WHY it was withdrawn, and the part that matters for whatever replaces it: the test
    // asked "is there an F0911 row for this DocNumber". Sales doc type JS posts internal
    // GL document numbers, so that question answers no regardless of truth. The rows it
    // held on Demo3 are order type SA, sample and lab issues out of sample locations,
    // which relieve the cardex and journal nothing. See transaction-detail-analysis.md
    // Section 5.22 and WORKLIST AN-11. The successor claim keys on ORDER TYPE plus
    // location, never on document type.
    'OFF': {
      title: 'Offsetting GL Entries', kind: 'rebalance', tier: 'single', disposition: 'rebalance',
      cause: 'The GL posted two entries that cancel each other and neither reached the inventory account, so the document nets to zero in the GL while inventory came off the item ledger. Nothing shows on the P&L — only the balance sheet moves, which is why it went unnoticed. The lever is the sales cost-of-sales pair 4240 and 4220, read for this ORDER type: when neither of them reaches an inventory account, nothing relieves inventory and the two legs simply cancel wherever they landed. Point one of them at the inventory account per GL class, matching an order type on the same company that already ties.',
      desc: 'Two F0911 legs for the same document, equal and opposite, both posted, in the same batch as the item ledger — and neither on the inventory account the item ledger used. LedgerAmount nets to zero, which does NOT mean the GL entry is missing: it posted and cancelled itself somewhere else. The order line type is stock, so a GL entry against inventory was due.',
      action: 'Read 4240 and 4220 for this order type: if neither reaches an inventory account, that is the fault, and two different profit-and-loss accounts fail as completely as one shared account. Diff them against an order type on the same company that ties, GL class by GL class, to get the target values. Check every order type sharing that configuration before calling this one isolated. The accountant restores the inventory account for the documents already posted. Re-run this company and period: a document that comes back was not corrected.',
      finding: {
        mech: 'The GL posted two entries that cancel each other, and neither one reached the inventory account.',
        checked: [
          { a: 'OFF.cardexonly', t: 'The item ledger carries value and the GL correlation returned nothing against that account. The entry posted; it posted somewhere else.' },
          { a: 'OFF.noneoninvaccount', t: 'None of them landed on the account the item ledger used.' }
        ],
        alsoChecked: [
          { a: 'OFF.twolegs', t: 'The GL holds two or more entries for this document.' },
          { a: 'OFF.legsnetzero', t: 'They sum to zero, so the document nets out in the GL.' },
          { a: 'OFF.docscope', t: 'That GL search is by document number and document type, across every company, so it is a wide search rather than a narrow one.' }
        ],
        context: [
          'Not tested: posting status and the batch. Neither is a predicate here, and on this pattern the entries have been found posted and in the same batch as the item-ledger row — so "go post the batch" is the wrong instruction. Confirm it on your document.',
          'Not tested: the order line type. This claim never reads F40205. Most documents on this card have been found sitting on an order that carries at least one non-stock line — so do NOT assume a stock line was due a GL entry against inventory. Check the line type before you take this to the customer as a routing fault.',
          'Not tested: whether the two accounts are P&L accounts. It has been seen where a whole family of order types routed both legs to P&L for every one of their GL classes. That is the likeliest reason a cancellation goes unnoticed, and it is what you confirm by reading the routes.'
        ],
        found: [
          'Inventory came off the item ledger. The GL never touched the inventory account for it.',
          'The two entries cancel, so the document nets out in the GL and the balance sheet is out by the full item-ledger amount.',
          'Where both accounts are P&L accounts there is no profit-and-loss signal at all, which is how this survives a P&L review. Read the routes to confirm that is the case here.',
          // recurrenceIdx points here.
          'Read the periods either side before treating this as a one-off.',
          'Likely cause, not yet confirmed: the account instructions for this order type send both sides of the entry away from inventory. Order types on this same company whose shipments tie send one side to the inventory account for each GL class — that is the target to match.'
        ],
        recurrenceIdx: 3,
        fix: [
          'Read 4240 and 4220 for this order type and check whether either one reaches an inventory account. Two different profit-and-loss accounts fail exactly as completely as one shared account, and they fail without showing on the P&L.',
          'Compare against an order type on the same company whose shipments tie, GL class by GL class. That comparison is the diagnosis and it also gives the exact target accounts.',
          'Check every order type sharing that configuration before calling this one isolated. Only the ones that shipped this period are in front of you; the rest carry the same fault and no rows yet.',
          'The accountant restores the inventory account for the documents already posted.',
          'Re-run this company and period. A document that comes back was not corrected.'
        ]
      }
    },
    // The non-stock line cost ties to the variance and sits in an inventory account.
    // A correction IS required: F0911 does not tie to F4111. The lever is the item's
    // G/L class, NOT the non-stock DMAAI (that entry is correct).
    'NSL': {
      title: 'Non-Stock Sales Lines', kind: 'rebalance', tier: 'single', disposition: 'rebalance',
      cause: 'A non-stock line posted its cost to an inventory account, and that cost accounts for the whole variance to the penny. The non-stock account instruction is correct — the GL class carried on those lines is a stock class, and that is what resolves to inventory. Correct the GL class on the items.',
      desc: 'A non-stock line posted its GL cost to an inventory account, and the non-stock extended cost ties exactly to the variance, either on the document or across the order. The non-stock DMAAI itself points away from inventory, so it is not the fault: the GL class carried on the non-stock lines is a stock item class, and that is what resolves to inventory. A non-stock item holds no inventory, so the value does not belong there.',
      action: 'Correct the GL class on these items so a non-stock line stops resolving to the inventory account. Do not change the non-stock DMAAI — it already points at the right account. Check whether other non-stock line types carry the same overridden class before assuming these items are the only ones. The accountant reclassifies the value already posted out of the inventory account. Re-run this company and period: a document that comes back was not corrected.',
      finding: {
        mech: 'A non-stock line posted its cost to an inventory account. The non-stock cost accounts for the whole variance.',
        checked: [
          // Trimmed from 28 words to 23 on 2026-08-15 for the word limit, once
          // `checked` stopped being baselined. Nothing dropped but the count of
          // lines, which the row itself carries.
          { a: 'NSL.nonstockline', t: 'Order lines are non-stock: F40205 inventory interface N, carrying an extended cost. A non-stock line posts to the GL and moves no inventory.' },
          { a: 'NSL.costtiesvariance', t: 'The non-stock cost ties to the variance to the penny, either on this document or across the order.' }
        ],
        alsoChecked: [
          { a: 'POP.inventoryaccount', t: 'The account the GL used is an inventory account.' },
          { a: 'NSL.sales', t: 'A sales-side document.' },
          { a: 'NSL.ordernumberonly', t: 'The order lines were matched on order number alone, with no company scope. Confirm the order belongs to this company before you act.' }
        ],
        context: [
          { k: 'dmaai', t: 'Not tested: the non-stock DMAAI, and not tested: the GL class on those lines. This claim reads the sales tables and F40205 — never a routing, never a class. The specimen behind the card found the non-stock AAI pointing correctly away from inventory while every type-N line carried a STOCK item\'s class, which is what resolved to inventory. That is the lead and it is why the fix is the class, but read both before you tell the customer the routing is fine.' }
        ],
        found: [
          'The variance is the non-stock cost, to the penny. The cause is identified.',
          'Non-stock cost is sitting in an inventory account. A non-stock item holds no inventory, so it does not belong there.',
          'Your GL inventory balance is overstated against the item ledger by exactly this amount, on every order carrying a non-stock line.',
          // recurrenceIdx points here.
          'Read the periods either side before treating this as a one-off.',
          'This is not a leave-it row. The two sides do not tie, so it needs a correction.'
        ],
        recurrenceIdx: 3,
        fix: [
          'Correct the GL class on these items so a non-stock line stops resolving to the inventory account.',
          'Do not change the non-stock DMAAI. It is already pointing at the right account, and changing it will not fix this.',
          'The accountant reclassifies the non-stock value already posted out of the inventory account.',
          'Check whether other non-stock line types carry the same overridden class before assuming these items are the only ones.',
          'Re-run this company and period. A document that comes back was not corrected.'
        ]
      }
    },
    // Every line on the order is non-stock (F40205 Inventory Interface 'N'), so no
    // cardex row was ever due and GL-only is correct processing. Sibling of NSL and
    // deliberately separate: NSL needs the non-stock cost to TIE to the variance, and a
    // CHARGE line has no extended cost to tie with, so NSL never reaches these.
    'XBC': {
      title: 'Cross-Batch Completion', kind: 'review', tier: 'single', disposition: 'triage',
      cause: 'Completions journaled in a later batch than the one stamped on the item ledger. Matched by work order rather than by batch, these tie exactly — a work order issues material over weeks in separate batches and completes later in its own. Confirm one document with the batch ignored, then close the card. Posting an entry would create the shortfall it looks like.',
      desc: 'The completion was journaled in a later batch than the one stamped on the item ledger, so a comparison that pairs the two sides within a batch shows a gap. Regrained to (work order, account, doc type) across every batch and period, the two sides agree to the penny. A work order issues material over weeks, each issue in its own batch, and the completion is not generated until the product is finished — days or weeks later, in a batch of its own. Not a variance.',
      action: 'Confirm on one document before dismissing the rest: the item-ledger completion against F0911 for the same work order, ignoring the batch. Then close the card — no journal entry and no source fix. Reading it as a shortfall and posting an entry would create the error it looks like. If the count grows period over period, the correlation grain is what to raise, not the transactions.',
      finding: {
        mech: 'The completion was journaled in a later batch than the one stamped on the item ledger.',
        checked: [
          { a: 'XBC.glcompletionsameaccount', t: 'A GL completion exists for this work order on this account, in a different batch.' },
          { a: 'XBC.amounttiesrow', t: 'Summed across every batch and period, that GL completion equals this item-ledger row to the penny.' }
        ],
        alsoChecked: [
          { a: 'XBC.glsideaggregated', t: 'One thing to know about that comparison: the GL side is summed across batches, the item-ledger side is this single row. Where a work order and account carry several ledger rows, check the totals rather than the row.' },
          { a: 'XBC.mfgic', t: 'A work-order completion (IC) in a manufacturing batch.' },
          // A STAMPED BATCH IS NOT EVIDENCE THE JOURNAL WAS WRITTEN (UI-83).
          // ANALYST_GROUNDING forbids this inference twice and T-MFG forbids it again;
          // the CNJ card exists precisely because it fails. Measured on
          // RCardexLedgerCompare2 where recstatus = 1: Completion Not Journaled carries
          // 320 rows on Demo1 and 125 on Demo3, and NONE of them has a zero batch —
          // every row on that card has a batch and no GL completion. Cross-Batch
          // Completion is the same (3 on Demo1, 450 on Demo3, none zero-batch), so the
          // batch discriminates nothing between the two cards. The first two bullets
          // above already carry the real evidence.
          { a: 'XBC.batchstamped', t: 'Batch present on the item-ledger row, so R31802A processed it. That is not evidence the journal was written; the GL completion found above is.' }
        ],
        found: [
          'Not a variance. A work order issues material over weeks, each issue in its own batch, and the completion is not generated until the product is finished — days or weeks later, in a batch of its own.',
          'It appears here because the comparison pairs the two sides within a batch. Match by work order and it ties.',
          'Nothing to correct on the transaction. Reading it as a shortfall and posting an entry would create the error it looks like.'
        ],
        fix: [
          'Confirm on one document before dismissing the rest: the item-ledger completion against F0911 for the same work order, ignoring the batch.',
          'No journal entry. No source fix. Close the card.',
          'If the count grows period over period, the correlation grain is the thing to raise, not the transactions.'
        ]
      }
    },
    // Journaled, same account, amount DIFFERS at work-order grain. The population CNJ
    // explicitly hands off ("completion posted, amount differs") and nothing implemented
    // until now. Still a tie-out failure: a correction IS required. Usual driver is a
    // cost basis that moved between the cardex write and the R31802A run — and F4111
    // ordered by ilukid IS the unit-cost history, since JDE has no cost-history table.
    'MCM': {
      title: 'Mfg Cost Mismatch', kind: 'review', tier: 'single', disposition: 'expense',
      cause: 'A GL completion exists for the work order on the same account and the amount disagrees with the item ledger. The cost basis behind the journal is not the one behind the ledger row. Order the item and branch by the ledger sequence to find the cost step — the item ledger is the cost history, and an adjustment journals as a zero-quantity row carrying the delta. Prevention is sequencing: cost the item before it is issued.',
      desc: 'The item ledger and the GL valued the same completion quantity at different unit costs. The variance is quantity times the difference. The usual driver is a cost that moved between the item-ledger write and the accounting run: the Frozen Cost Update (R30822) moved the standard after the completion posted and WIP Revaluation (R30837) never carried it through. R30837 is optional under standard costing, needs the variance AAI configured for the routing, and skips work orders already closed.',
      action: 'Confirm the gap is actually a cost-basis difference before treating it as one: it should be a modest share of the transaction and fall either side of it. A gap exceeding half the item-ledger amount, or running one direction across the population, is a different problem. Order the item and branch by the ledger sequence to find the cost step — the item ledger IS the cost history, and a cost adjustment journals as its own zero-quantity row carrying the delta, not the new cost. Then have WIP Revaluation (R30837) run as part of the cost update, driven by the Frozen Cost Update (R30822), so the next roll reaches the GL as well as the item ledger — check which version is in use here, because the processing options differ per site. Confirm the variance AAI, 3240 or 3260, is configured for the routings in use. Closed work orders are outside its reach, so time cost rolls against the open population.',
      finding: {
        mech: 'A GL completion exists on this account for the work order and the amount disagrees with the item ledger.',
        checked: [
          { a: 'MCM.amountdiffers', t: 'Summed across every batch and period, the two sides differ. The cross-batch card takes everything that ties, so what is here does not.' }
        ],
        // glcompletionsameaccount leads this block rather than "What happened": its own
        // sentence ends "so the completion-gap shape is ruled out", which is an
        // exclusion, not the detection. The detection on this card is the disagreement.
        alsoChecked: [
          { a: 'MCM.glcompletionsameaccount', t: 'A GL completion exists for this work order on this account, so the completion-gap shape is ruled out.' },
          { a: 'MCM.iconly', t: 'Completions only on the GL side. The completion carries labor and overhead out of WIP and the issue does not, so the two are never netted against each other.' },
          { a: 'MCM.glsideaggregated', t: 'One thing to know about that comparison: the GL side is summed across batches, the item-ledger side is this single row. Where a work order and account carry several ledger rows, check the totals rather than the row.' },
          { a: 'MCM.mfgic', t: 'A work-order completion (IC) in a manufacturing batch.' },
          { a: 'MCM.batchstamped', t: 'A batch is stamped on the item-ledger row, so a manufacturing accounting run processed it.' }
        ],
        context: [
          'Not tested: that a cost basis is what moved. There is no cost, quantity or cost-method check in this claim — only that a GL completion exists and the amounts differ. A quantity difference or a partial completion produces the same shape, which is why the first action is to confirm the gap looks like a cost difference at all.'
        ],
        found: [
          'Likely cause, not yet confirmed: the cost basis behind the journal is not the cost basis behind the item-ledger row.',
          'The usual driver is a cost that moved between the item-ledger write and the accounting run. The item ledger itself is the cost history — read the unit cost transaction by transaction and the steps are the changes.',
          'A cost adjustment journals as its own zero-quantity ledger row carrying the DELTA, not the new cost. Read it that way or the arithmetic will not close.'
        ],
        fix: [
          'Order this item and branch by the ledger sequence and find the step. Compare the cost in force when the transaction was written against the cost the journal used.',
          'A correction is required — the GL does not tie to the item ledger, and naming the cause is not the same as leaving it.',
          'Prevention is sequencing: cost the item before it is issued, and keep a cost update from landing between a transaction and the run that journals it.'
        ]
      }
    },
    // 'NZR' (DMAAI Net Zero) WITHDRAWN 2026-08-10. It claimed rows where AAI 3110 and AAI
    // 3130 resolve to one account. THAT IS NOT A PAIR. Net zero means the DEBIT and the
    // CREDIT AAI of ONE transaction land on one account. Per Oracle's published JDE 9.2
    // manufacturing AAI documentation an IM books 3110 (CR, Inventory/Raw Materials)
    // against 3120 (DR, Work in Process), and an IC books 3120 (CR) against 3130 (DR,
    // Sub-Assembly/Finished Goods) -- so the only valid manufacturing net-zero tests are
    // 3110 = 3120 and 3120 = 3130. Measured on raw F4095 across all three demos under
    // every relaxation (full account, object only, symmetric '****' wildcards, ignoring
    // order type): both return ZERO slices, and the 3120 account set is wholly disjoint
    // from 3110 and 3130. There was nothing to rebuild, only to remove.
    //
    // 98% of what the card claimed was IM -- the one document type whose legs are 3110
    // and 3120, which therefore cannot exhibit the condition the card described. It then
    // told the analyst to configure 3120, which was already configured.
    //
    // Owner ruling 2026-08-10: a shared inventory account is ASSUMED INTENDED, especially
    // where the customer runs a single inventory account. Do not re-add a card that reads
    // two matching accounts as a defect without first establishing that the two AAIs are a
    // debit/credit pair on ONE document.
    //
    // Removed from usp8_txv_flags block I and from the usp8_txv_classify whitelist in the
    // same change. Rows fall back to unclassified Mfg; tracked for analysis as AN-13.
    'NCL': {
      title: 'Non-Stock Charge Lines', kind: 'rebalance', tier: 'single', disposition: 'triage',
      cause: 'Every line on the order is non-stock, so the GL posts and inventory never moves. GL-only is correct processing here, not a gap. Confirm the line types on one order; if these should not reach an inventory account at all, the lever is the GL class on the line, not the non-stock account instruction.',
      desc: 'Every line on the order resolves to an F40205 Inventory Interface of N, so no item-ledger row was ever due and GL-only is what correct processing looks like. Separate from the non-stock sales card: that one matches when the non-stock cost equals the variance, and a charge line carries no extended cost to match with. The tie-out still fails, so the balance may need restating even though nothing is wrong with the transaction.',
      action: 'Confirm the line types on one order against F40205 rather than inferring from the line-type letters. If these should not be reaching an inventory account at all, the lever is the GL class on the line, not the non-stock account instruction. Otherwise there is no action on the transaction, and the accountant decides whether the balance needs restating.',
      finding: {
        mech: 'Every line on the order is non-stock, so the GL posts and inventory never moves.',
        checked: [
          { a: 'NCL.everylinenonstock', t: 'Every line on the order resolves to an inventory interface of N. Read from F40205, not inferred from the line-type letters.' },
          { a: 'NCL.glonly', t: 'The item-ledger side is zero, which is correct for a non-stock line rather than a gap.' }
        ],
        alsoChecked: [
          { a: 'NCL.sales', t: 'A sales-side document.' },
          { a: 'NCL.ordernumberonly', t: 'The order lines were matched on order number alone, with no company scope. Confirm the order belongs to this company before you act.' }
        ],
        context: [
          'Separate from the non-stock sales card: that one matches when the non-stock cost equals the variance, and a charge line carries no extended cost to match with.'
        ],
        found: [
          'GL-only is what correct processing looks like for these lines. The line type is the first question on any GL-only row and it answers this one.',
          'Where the charge is a customer-specific process, the card names it and stops. There is no source fix to chase.'
        ],
        fix: [
          'Confirm the line types on one order before accepting the rest.',
          'If these should not be reaching an inventory account at all, the lever is the GL class on the line, not the non-stock account instruction.',
          'Otherwise no action on the transaction. The tie-out still fails, so the accountant decides whether the balance needs restating.'
        ]
      }
    },
    // The sales cost-of-sales AAI pair resolves to ONE account for the order type, so the
    // shipment's debit and credit land together and no F0911 detail is written at all. The
    // degenerate case of OFF: that card needs two or more GL legs to see the cancellation,
    // so it cannot reach a document carrying none. A VALID net-zero pairing, which is what
    // separates it from the withdrawn NZR: 4220 (cost of goods) and 4240 (inventory) are
    // the two legs of ONE sales transaction. Claimed by usp8_txv_flags block L.
    //
    // WHAT THE MONEY IS (owner attested 2026-08-12). These are orders where the customer
    // asked for samples, so they ship at no charge. Order type SA is the first indication;
    // no price on the lines confirms it. THE COST OF A SAMPLE BELONGS IN COST OF GOODS, so
    // the net-to-zero is the PRIMARY defect: cost that should hit the P&L cancels itself
    // across two accounts instead. A DMAAI resolving somewhere other than the 4152 model is
    // the SECONDARY one, and the analyzer computes and states that itself — do not write a
    // count of mismatches into this copy.
    //
    // THE ZERO-PRICE TEST IS NOT MADE BY THE CLASSIFIER and cannot be, so the samples
    // framing lives in `context` as the analyst's own confirmation step and never in
    // `checked`. Measured 2026-08-12, recorded in the block-L header of usp8_txv_flags.sql:
    // unit price is not in the RR F4211 extract at all, and extended price — the only price
    // the sanctioned vcr_F42119 union exposes — is non-zero on most of the shipped legs on
    // the reference dataset. A claim built on it would suppress nearly the whole population.
    //
    // NO `flag` FIELD. The chip beside the Variance Analyzer disclosure is COMPUTED by
    // _txCombosSummary in inventory-transactions.html, from the same list the resolution
    // table draws, so it cannot claim one thing over a table showing another. It used to be
    // a hand-written constant here and on this card it read "The DMAAI pair nets to zero"
    // above a table reading "3 of 3 inventory DMAAIs resolve to a different account than
    // the cardex model" ([[feedback_one_producer_per_figure]]). Do not add it back.
    'SAC': {
      title: 'Sales DMAAI Net Zero', kind: 'rebalance', tier: 'single', disposition: 'rebalance',
      cause: 'The two cost-of-sales DMAAIs for this order type resolve to one account, so the shipment writes its debit and its credit to the same place and they net to zero. The cost of the goods that left never reaches cost of goods sold, and the item-ledger relief has no counterpart. Point 4240 at the inventory account per GL class the way the order types that ship correctly do, and 4220 at cost of goods sold.',
      desc: 'Inventory was relieved on the item ledger and the GL holds nothing for the document under any type. The posting run did not fail. DMAAI 4220 and DMAAI 4240 resolve to the same account for this order type, so the debit and the credit land together, net to zero, and no journal detail survives to post. 4220 carries cost of goods sold and 4240 relieves inventory; on one account they cancel silently and the P&L never sees the cost. Where the order type is SA — sample and lab issues, shipped at no charge — the cost of the sample is exactly what should be reaching cost of goods, and the cancellation is what stops it. Every shipment on the order type does it again.',
      action: 'Read 4220 and 4240 for the order type on the document, resolving the way JDE does: the item’s GL class first, the **** wildcard second. On the 42xx sales instructions the order type sits in the document-type column, not the order-type column the manufacturing instructions use. One account on both is the finding. Diff it against an order type on the same company that ships correctly, GL class by GL class — that comparison hands the customer the target values. Then point 4240 at the inventory account per GL class and 4220 at cost of goods sold. No journal entry prevents recurrence, so the AAI change is the fix; the accountant separately books the cost that never reached the GL. Re-check the following period. New documents on the order type with no GL entry mean the AAI was not changed.',
      finding: {
        mech: 'DMAAI 4220 and 4240 resolve to one account for this order type, so the shipment’s debit and credit land together and the batch nets to zero. The post program writes nothing for a zero-dollar batch, so no GL entry exists at all and the cost never reaches cost of goods. The posting followed its DMAAI — nothing was mis-keyed; the configuration itself sends both sides to one account.',
        // Copy trimmed to what an analyst acts on (owner 2026-08-12). It ran ~210
        // words of method: how the wildcard resolves, why the zero test is a
        // tolerance and not a rounding, how a mixed-class document is claimed.
        // All true, none of it changes the next move, and a new analyst does not
        // yet know enough to want it. The lookup mechanics belong in the guide.
        //
        // Sized per rule 11, no install-specific figures. The routing WAS measured
        // (RapidReconciler_Demo3, co 30002, order type SA, GL class P50: 4220 and
        // 4240 both land on one inventory account, while every other sales order
        // type at that GL class routes 4220 to a cost-of-goods object, and three
        // more order types carry the same broken routing). Those accounts and
        // counts live in the claim-block header and the audit doc so they can be
        // re-measured; the card states the shape.
        //
        // The assertion ids are unchanged. They are the citation contract the CI
        // gate checks, so trimming prose must not drop them.
        checked: [
          { a: 'SAC.aaipaircancels', t: 'DMAAI 4220 (cost of goods) and 4240 (inventory) point to one account for this company, order type and GL class.' },
          { a: 'SAC.cardexrelief', t: 'Item ledger relieved inventory. The batch nets to zero, so the post program writes no GL entry and cost never reaches cost of goods.' }
        ],
        // "Not tested on these rows" removed (owner 2026-08-12): it helped nothing
        // on this card. The scope limit it carried now belongs in `action`, where
        // the analyst is already being told what to do next.
        context: [],
        // `found` is empty and `recurrenceIdx` is GONE (owner 2026-08-12). Its five
        // bullets restated the mechanism the two above already carry, or gave the
        // analyst reading rather than doing. The recurrence point it held survives
        // as the second action below, which is where it changes behaviour.
        // recurrenceIdx MUST go with it: _txFindingText guards on
        // `typeof sel.recurrenceIdx === 'number'` before indexing `found`, so
        // leaving the index behind over an empty array is a live break.
        found: [],
        // Two actions, in the order the analyst takes them: fix this routing, then
        // establish whether it is isolated. Naming the target account is deliberate
        // (4220 belongs on cost of goods) and carries no install-specific value,
        // per rule 11.
        fix: [
          'Point DMAAI 4220 to cost of goods for this order type — every GL class it routes, not just the one on this document.',
          // Trimmed 37 -> 20 words (owner 2026-08-15). `fix` caps at 2 bullets so
          // this could not be split; every idea survives the cut. What went is the
          // sentence FORM, not content: "It reports other companies and GL classes
          // the pair collapses on" became the bare list. The clause the standard
          // warned about losing -- order types that shipped nothing and therefore
          // appear nowhere on this card -- is the reason to open the tab at all and
          // is kept verbatim.
          'DMAAIs tab, Fix First: Sales, AAIs 4240/4220 - other companies, other GL classes, and order types that shipped nothing this period.'
        ],
        // The five SAC assertions the classifier makes and no bullet cited. They
        // were orphaned by the 2026-08-12 trim from ~210 words: the prose that
        // carried them went, the ids stayed in the manifest, and the gate has been
        // reporting them as referenced-by-no-card ever since. `alsoChecked` (added
        // 2026-08-15) is where a cited-but-not-leading check belongs, so they get a
        // home instead of being deleted from the manifest -- the classifier really
        // does make all five, and an assertion nobody cites is evidence lost.
        alsoChecked: [
          { a: 'SAC.sales', t: 'A sales document, not a manufacturing or transfer one.' },
          { a: 'SAC.everyclasscancels', t: 'Every GL class the document carries cancels. One mixing a cancelling class with a working one is left unclaimed.' },
          { a: 'SAC.missingaainotclaimed', t: 'A missing AAI is not counted as a cancel. Where either route is absent the comparison is null.' },
          { a: 'SAC.noglforowndoctype', t: 'No GL row exists for this document number under its own document type, on any company.' },
          { a: 'SAC.ordertypeinmldct', t: 'The 42xx sales AAIs carry the order type in the document-type column, not the order-type column the 31xx manufacturing AAIs use.' }
        ]
      }
    },
    // The inventory cost-change AAI pair resolves to ONE account, so an item cost change
    // books its inventory leg (4134) and its expense leg (4136) to the same place and the
    // two cancel. The SECOND valid net-zero pairing to ship, and it earned the name the
    // same way SAC did: the guide's Sections 5 and 9 name 4134 and 4136 as the debit and
    // the credit of ONE cost-change document, and the GL confirms the shape rather than
    // merely allowing it -- every claimed document carries exactly two equal-and-opposite
    // F0911 legs, one batch, one account. That demonstration is what separates both cards
    // from the withdrawn NZR (3110 vs 3130, never a pair). It is NOT a licence to add the
    // other four pairings the product labels. Claimed by usp8_txv_flags block M.
    //
    // THE SHAPE IS THE MIRROR OF OFF, NOT A DUPLICATE OF IT. Offsetting Entries takes a
    // cancelling GL pair where NEITHER leg is on the inventory account -- the money went
    // somewhere else. Here BOTH legs are on it and the money went nowhere. OFF's own SQL
    // excludes this population, so the two never compete for a row.
    //
    // AND THE ROUTING IS READ FROM THE RESOLVED TABLES, NOT THE EXTRACT. On the reference
    // data F4095 holds this pair only at company 00000 with a wildcard GL class, so a card
    // that sends the analyst to the extract to confirm sends them somewhere the routing is
    // not. `action` points at P40950 and the DMAAIs tab instead.
    //
    // NO `flag` FIELD, for the same reason SAC has none -- the chip beside the Variance
    // Analyzer disclosure is COMPUTED by _txCombosSummary. Do not add one.
    'IAC': {
      title: 'Inventory DMAAI Net Zero', kind: 'rebalance', tier: 'single', disposition: 'rebalance',
      cause: 'The two cost-change DMAAIs resolve to one account, so an item cost change books its inventory leg and its expense leg to the same place and they cancel. The item ledger revalues, the GL nets to zero, and the change in value never reaches the P&L. Point 4136 at the expense account the cost change belongs in and leave 4134 on inventory.',
      desc: 'The item ledger carries a cost-change revaluation and the GL holds a pair of entries that cancel each other on the same inventory account. The posting run did not fail and nothing was mis-keyed. DMAAI 4134 routes the inventory leg of a cost change and DMAAI 4136 the expense leg; where both resolve to one account the debit and the credit land together, net to zero, and the revaluation never leaves inventory. The perpetual balance moves, the GL does not, and the tie-out fails by the full value of the change. Every cost change the routing touches does it again, and because the pair cancels the P&L shows nothing, so this survives a review that reads the income statement.',
      action: 'Read 4134 and 4136 for the company and GL class on the document in P40950. One account on both sides is the finding. Point 4136 at the expense or cost-of-goods account the cost change belongs in and leave 4134 on inventory, then diff against a company on the same install whose cost changes post correctly — that comparison hands over the target values. No journal entry prevents recurrence, so the DMAAI change is the fix; the accountant separately books the value stranded in inventory. Re-check the following period. A new cost change still cancelling means the DMAAI was not changed.',
      finding: {
        mech: 'DMAAI 4134 and 4136 resolve to one account, so the cost change books its inventory leg and its expense leg to the same place and they cancel. The entry exists and posts — it just nets to zero inside inventory, so the revaluation never reaches the P&L. The posting followed its DMAAI; the configuration itself sends both sides to one account.',
        checked: [
          { a: 'IAC.aaipaircancels', t: 'DMAAI 4134 (inventory) and 4136 (expense) resolve to one account for this company, order type and document type, on every GL class carried.' },
          { a: 'IAC.glcancelsoninventory', t: 'The GL cancels itself on the inventory account the item ledger used: two or more legs summing to zero, none elsewhere. Nothing failed to post.' }
        ],
        context: [
          'Not Offsetting Entries: that card takes a cancelling pair that landed away from inventory. Here both legs sit on inventory and the money went nowhere.',
          'Confirm the routing in P40950 or the DMAAIs tab, not the extract: it carries this pair as a company-00000 wildcard the transaction never resolved against.'
        ],
        found: [],
        fix: [
          'Point DMAAI 4136 at the expense account for this company, every GL class it routes, not just the one here. 4134 stays on inventory.',
          'DMAAIs tab, Fix First: Inventory, AAIs 4134/4136 - other companies, other GL classes, and routings that saw no cost change this period.'
        ],
        alsoChecked: [
          { a: 'IAC.inventory', t: 'An inventory-side document, not a sales, purchasing or manufacturing one.' },
          { a: 'IAC.cardexvalue', t: 'The item ledger carries value and the ledger side is zero within tolerance: a tolerance not a rounding, because the ledger amount is a float.' },
          { a: 'IAC.everyclasscancels', t: 'Every GL class the document carries cancels. One mixing a cancelling class with a working one is left unclaimed.' },
          // 2026-08-17: these four cited `IAC.resolvedtables`, `IAC.flexnormalised`,
          // `IAC.singleaccounteachside` and `IAC.missingaainotclaimed`. usp8_txv_flags
          // block M declares SEVEN ids, not ten -- where two predicates are one test in
          // the SQL they are declared as one statement -- so those four ids exist in no
          // manifest and the gate was failing on them (and on 8 bullets against a cap of
          // 5). Collapsed onto the id the SQL actually declares. The single-account fold
          // and the missing-4136 exclusion are part of `IAC.aaipaircancels` above.
          { a: 'IAC.resolvedrouting', t: 'The routing was read from the resolved account-instruction tables, not the DMAAI extract, and a segment leaves the comparison only where the AAI flexes it.' },
          { a: 'IAC.docscope', t: 'The GL legs were matched on document number and document type, with no company scope. Confirm the document belongs to this company before you act.' }
        ]
      }
    },
    // WITHDRAWN SERVER-SIDE (DB PR #97) and its EVIDENCE was withdrawn too, 2026-08-10.
    // The claim gated on "no F0911 row exists for this DocNumber" and concluded a failed
    // posting run. Sales document type JS posts internal GL document numbers, so that
    // question answers no regardless of truth. The rows it held are order type SA — sample
    // and lab issues out of sample locations, which relieve the cardex and journal nothing.
    // The FIVE checked bullets it carried were re-measured against the same database they
    // were taken from and every one of them was either untested or false, so they are gone
    // rather than relabelled: the 159 JS legs DO exist, all match an F4111 document AND its
    // batch, there is no summarization anywhere in the population, and nothing was ever
    // established about whether the order lines were open. The real cause is claimed by SAC.
    // The entry is retained ONLY so a stale database still emitting the SubType renders a
    // titled card instead of the bare string 'SNJ'. It cannot fire: the SubType is absent
    // from usp8_txv_flags, which is the only proc that emits SubTypes, and no row carries it
    // on any demo. Do NOT read its presence here as evidence the claim is live, and do not
    // restore the copy — see transaction-detail-analysis.md Section 5.22.
    'SNJ': {
      title: 'Sales Not Journaled', kind: 'review', tier: 'single', disposition: 'triage',
      cause: 'This claim was withdrawn. It read a missing GL document number as a failed posting run, and on sales document type JS the GL carries its own internal document numbers, so the test answered no whether or not the entry existed. Nothing on this card has been verified. Treat these rows as unclassified and work them from the item ledger up.',
      desc: 'A withdrawn claim, retained only so a database still carrying the old SubType renders a named card rather than a code. The test asked whether the GL held a row for the document number. Sales document type JS posts internal GL document numbers, so the answer was always no and the conclusion — a failed run — did not follow. Rows that used to land here were order type SA: sample and lab issues out of sample locations. Those relieve the item ledger while the GL posts a pair that cancels, so the cost never reaches cost of goods (owner ruling 2026-08-12) — the cancellation is the fault, not the design. Where the cause is genuinely an account instruction that nets itself to zero, Sales DMAAI Net Zero claims it and states what it tested.',
      action: 'Do not work this card as written and do not send anyone to a run error report on the strength of it. Establish the correct item-ledger-to-GL match key for sales first — document number is the wrong one — then read the order type and the location. If the rows are sample or lab issues out of a sample location, find where the cost landed: a sample ships at no charge and its cost belongs in cost of goods, so a GL pair that cancels is the fault rather than the design. Raise it rather than resolving it from this copy.',
      finding: {
        mech: 'This claim was withdrawn. A missing GL document number was read as a failed posting run, and on this document type the GL carries its own numbers.',
        checked: [],
        context: [
          'Nothing was checked. Every bullet this card used to carry was re-measured and none of them survived: the GL legs it called absent do exist and match the item ledger on document AND batch, there is no summarization in the population, and the state of the order lines was never established.',
          'A zero in the ledger column means the correlation found nothing under the key it used. On sales that key is not the document number.'
        ],
        found: [
          'No cause established. Do not carry this card\'s old wording into a finding.',
          'Where these rows are order type SA out of a sample location, the item ledger is relieved and the GL posts a pair that cancels, so nothing reaches cost of goods. A sample ships at no charge and its cost belongs in cost of goods, so the cancellation is the fault. Sales DMAAI Net Zero claims that population and states what it tested.'
        ],
        fix: [
          'Establish the correct item-ledger-to-GL match key for sales before concluding any entry is absent.',
          'Read the order type and the location on the rows. Sample and lab issues are a different conversation from a failed run.',
          'Raise it. Do not send anyone to a posting error report on the strength of this card.'
        ]
      }
    },
    // BATCH CANNOT AGGREGATE MANUFACTURING AMOUNTS (owner ruling 2026-08-05). A work
    // order issues material over weeks, each issue in its own batch, and the IC is not
    // generated until the product is complete — days or weeks later, in its own batch.
    // Regrained to (work order, account, doc type) these tie to the penny, so the row is
    // NOT a variance: it is the batch key stranding a completion journaled in a later
    // run. Claimed rather than suppressed so the analyst is told why it appeared.
    // ---- LINKED TRANSACTIONS (Phase 0-1) — grouped before anything is claimed -
    //      usp8_txv_build stamps Make to Order and Intercompany and assigns every
    //      groupcode; usp8_txv_group then disposes each group WHOLE. These form
    //      first, so their rows never reach the single-document claims below.
    'MTO': {
      title: 'Make to Order', kind: 'mto', tier: 'linked', disposition: 'triage',
      cause: 'Make-to-order work orders, grouped with their customer sales orders. Not one variance type: the residual splits into expected standard-cost variances, completions where both sides carry value and disagree, and completions with no GL entry at all. The three need different work, and the middle slice no longer has a confirmed cause. Drill in for the counts and dollars per shape.',
      desc: 'A work order linked to its customer sales order — a business grouping, not one variance type. The residual is ordinary manufacturing cardex-vs-GL and splits three ways by shape: GL-only standard-cost variances, both-sides-differ completion cost differences, and cardex-only completions the GL holds no entry for. Account mapping is not the mechanism here.',
      action: 'Work the shapes separately. Both-differ rows have no confirmed cause: the gap is too large a share of the transaction and too one-directional for the cost-basis story, so take them by account, largest account first, with cost accounting. Item-ledger-only rows are completions missing from the GL, which is a run-level fault, not these orders, and they belong in the completion-gap workflow. GL-only rows need no action. Match by work order, not document number.',
      finding: {
        mech: 'Make-to-order work orders. A business grouping, not one variance type — the residual splits three ways by shape.',
        checked: [
          { a: 'MTO.notnetted', t: 'The group did not net out within tolerance, so the legs are genuinely open rather than a timing artefact.' }
        ],
        // All three of these describe how the card was ASSEMBLED — the sales-order
        // link, the group key, the row typing. None of them is a thing that went
        // wrong, and they occupied the first three lines of "What happened".
        alsoChecked: [
          { a: 'MTO.salesorderlink', t: 'A customer sales order names this work order, with a work-order type of WO, W1 or WR. That link is what puts the two on one card.' },
          { a: 'MTO.groupkeyedonwo', t: 'The group is keyed on the work order, so the issue and completion legs stay together across accounts and periods instead of being split by them.' },
          { a: 'MTO.mfg', t: 'Manufacturing rows, typed from the batch the program wrote.' }
        ],
        context: [
          { k: 'dmaai', t: 'Not tested: the DMAAI routings. Nothing in the linking passes reads an AAI, so mapping is not ruled out here — it is simply unexamined.' },
          'Not tested: whether the sales orders shipped or closed. The link only needs a sales-order line naming the work order.',
          'The shape split below — GL only, both differ, item ledger only — is read off the loaded rows on this page, not from the classifier.',
          'The gap size and direction on the both-differ rows were measured on a specimen and came back wrong for a cost-basis difference. That is why the card no longer asserts one.'
        ],
        found: [
          'This is three different problems under one grouping, so do not work it as one. The shape split above is the finding.',
          'GL-only rows are standard-cost variance components. They belong in the GL. Explained, no action.',
          'Item-ledger-only rows are the completion-gap shape: a completion on the cardex with no GL entry for the order. That is the Completion Not Journaled investigation, not cost work, and it is grouped here only because the make-to-order claim reached these rows first.',
          // recurrenceIdx points here.
          'Read the periods either side before treating any slice as a one-off.',
          'Both-differ rows do NOT fit a cost basis difference, which is what this card used to assert. A standard-versus-actual gap is a modest slice of the transaction and falls either side of it. Here most of the value sits on rows where the gap exceeds HALF the item-ledger amount, and the GL side is the larger one in roughly two thirds of the rows and the large majority of the value. Cause NOT confirmed.',
          'The both-differ value also concentrates on very few accounts rather than spreading across the card, so one account will explain most of it.'
        ],
        recurrenceIdx: 3,
        fix: [
          'Split the card by shape first and route each slice separately. Working it as one variance is what makes it unworkable.',
          'Take the both-differ rows by account, largest account first, with cost accounting. The concentration means the top account is most of the answer.',
          'Do not carry the old cost-basis story into that conversation. The gap is too large a share of the transaction and too one-directional for it, so the question is open.',
          'Where a standard cost did move after a completion posted, WIP Revaluation (R30837) is the mechanism that carries it to the GL, driven by the Frozen Cost Update (R30822). Have it run as part of the cost update, and check which version is in use here because the processing options differ per site.',
          'Send the item-ledger-only rows to the completion-gap workflow instead. Cost accounting cannot act on a missing GL entry.',
          'Match item ledger to GL by work order, not document number. Manufacturing accounting assigns its own GL document number.'
        ]
      }
    },
    'ICO': {
      title: 'Intercompany Sales', kind: 'ico', tier: 'linked', disposition: 'rebalance',
      cause: 'Intercompany orders whose selling and buying legs have not offset. Confirm the matching leg posted in the counterpart company, and compare against the prior period to tell a pair that clears from one that is stuck.',
      desc: 'An intercompany order (OK/SK) where the selling and buying companies\' inventory legs haven\'t fully offset — a three-document timing gap across the two companies\' books.',
      action: 'Verify the matching leg posted in the counterpart company; the pair nets once both sides complete, and a leg that never arrives is chased in the counterpart company rather than adjusted on this side. Why a pair persists past both companies\' closes is not yet determined — establish it before changing anything upstream: compare the same orders against the prior period to separate a self-clearing pair from a stuck one, and use the batch number on the row as the join key for the F0911 search in the counterpart company.',
      finding: {
        mech: 'Intercompany orders whose selling and buying inventory legs have not offset.',
        checked: [
          { a: 'ICO.notnetted', t: 'The selling and buying legs did not net out within tolerance.' }
        ],
        alsoChecked: [
          { a: 'ICO.interco', t: 'An intercompany order: either JDE flags the transaction as one, or the order type is SI or SK on the sales side, OK on the purchasing side.' },
          { a: 'ICO.groupmaybeempty', t: 'Check whether this row is grouped. An order with no intercompany cross-reference keeps this card with NO group, which means the counterpart leg may not be in this database at all — a different problem from a leg that has not posted.' }
        ],
        context: [
          'Not tested: whether both companies are in scope, and not tested: whether this company\'s leg posted. The row being here means it reached the comparison, which is not the same statement.',
          { k: 'dmaai', t: 'Not tested: the DMAAI routings. Nothing in the linking passes reads an AAI.' }
        ],
        found: [
          'One side of the pair is missing or late, so the two legs do not net.',
          'Cause not confirmed. Most likely the counterpart company’s leg simply has not posted yet, which clears on its own.',
          'Second possibility: the counterpart document was never created, which does not clear.',
          'To tell them apart: compare the same orders against the prior period. A pair that persists is the second case.'
        ],
        fix: [
          'Confirm the matching leg posted in the counterpart company.',
          'Where a leg is missing, trace the document in that company using the batch number on this row. Do not adjust this side.',
          'Re-check next period. A pair still open after both companies close is a posting failure, not timing.'
        ]
      }
    },
    //      Transfers and Direct Ship — 2 documents, 1:1 SO<->PO.
    'TRF': {
      title: 'Transfer Orders', kind: 'linked', tier: 'linked', disposition: 'rebalance',
      cause: 'Inter-branch transfers whose shipping and receiving legs have not met — different periods, or the receiving branch carrying the shipping cost. A second case lands here too: Sales Update abends and the re-run duplicates the item-ledger relief while the GL posts once.',
      desc: 'An inter-branch transfer (ST/OT) whose shipping and receiving legs posted to inventory in different periods or at different costs — the two sides haven\'t met yet. A second signature lands on this card too: a duplicated cardex relief, where Sales Update (R42800) abends, its workfile keeps the records, and the re-run writes the F4111 relief twice while the GL posts once.',
      action: 'Confirm both legs posted. Where the cost differs, the receiving branch is carrying the shipping cost, so correct the receiving cost at the source. Where the relief is duplicated, find out why Sales Update abended and recover its workfile before any re-run. Confirm both branch plants sit in the same company: a cross-company move belongs on the intercompany flow. Re-check next period, since a pair still open after both legs posted is a cost difference, not timing.',
      finding: {
        mech: 'Inter-branch transfers whose shipping and receiving legs have not met.',
        checked: [
          { a: 'TRF.transfertype', t: 'JDE flags these orders as inter-branch transfers.' },
          { a: 'TRF.notnetted', t: 'The shipping and receiving legs did not net out within tolerance, so the pair is genuinely open.' }
        ],
        context: [
          'Not tested: whether either leg posted, or at what cost. Read the receiving leg yourself — that is the first thing to establish.',
          { k: 'dmaai', t: 'Not tested: the DMAAI routings. Nothing in the linking passes reads an AAI.' },
          'Read the item ledger for a duplicated relief before assuming a pairing gap. If the relief appears twice, this is the duplicate case below.'
        ],
        found: [
          'Cause not confirmed. Two likely causes, and they need different fixes.',
          'The legs landed in different periods or at different costs, so the receiving branch is carrying the shipping cost.',
          'Or Sales Update abended and the re-run wrote the item-ledger relief a second time while the GL posted once. A known JDE quirk.'
        ],
        fix: [
          'Where the cost differs: correct the receiving cost at the source.',
          'Where the relief is duplicated: find out why Sales Update abended, and recover its workfile before any re-run.',
          'Confirm both branch plants sit in the same company. A cross-company move belongs on the intercompany flow, and forcing it through a transfer order leaves the in-transit account permanently out.',
          'Re-check next period. A pair still open after both legs posted is a cost difference, not timing.'
        ]
      }
    },
    'DS': {
      title: 'Direct Ship', kind: 'linked', tier: 'linked', disposition: 'rebalance',
      cause: 'Direct-ship orders whose sales and purchase legs have not offset. Confirm both legs posted and compare their costs, then compare against the prior period to tell a pair that clears from one that is stuck.',
      desc: 'A direct-ship order (transship) — the sales order and its linked purchase order ship straight to the customer, and the two legs haven\'t fully offset yet.',
      action: 'Confirm both legs posted and compare the purchase cost against the sales relief. The pair nets once both land in the same period at the same cost. Why a pair persists instead of clearing is not yet established, so do not change anything upstream first. Compare the same orders against the prior period, and trace whichever leg is short using its batch number.',
      finding: {
        mech: 'Direct-ship orders whose sales and purchase legs have not offset.',
        checked: [
          { a: 'DS.directshiptype', t: 'JDE flags these orders as direct ship, so the sales order and its purchase order ship straight to the customer.' },
          { a: 'DS.notnetted', t: 'Neither the group netting nor the direct-ship leg pass could pair these off within tolerance.' }
        ],
        context: [
          'Not tested: whether either leg posted, or at what cost. Compare the purchase cost against the sales relief yourself.',
          { k: 'dmaai', t: 'Not tested: the DMAAI routings. Nothing in the linking passes reads an AAI.' }
        ],
        found: [
          'The two legs have not met, so they do not net.',
          'Cause not confirmed. Most likely the legs landed in different periods, which clears on its own.',
          'Second possibility: the purchase cost and the sales relief differ, which does not clear.',
          'To tell them apart: compare the purchase cost against the sales relief, and compare the same orders against the prior period.'
        ],
        fix: [
          'Confirm both legs posted and compare their costs.',
          'Where a leg is short, trace it using the batch number on this row.',
          'Re-check next period. A pair still open after both legs posted is a cost difference, not timing.'
        ]
      }
    },
    // ---- NOTHING CLAIMED THESE (Phase 3) — the residual, split by type -------
    'T-SALES': {
      title: 'Unclassified — Sales', kind: 'review', tier: 'terminal', disposition: 'triage',
      cause: 'Sales documents no claim matched. The cause is not identified yet. Read the shape first — these rows can carry both sides, the item ledger only, or the GL only, and the shape decides where to look. Then take the largest documents and compare the item-ledger detail against the GL amount. Check the order line type before chasing a GL-only row.',
      desc: 'Sales documents that reached the end of the classifier with no claim matching. Every shape lands here: both sides carrying value and disagreeing, an item-ledger-only row, or a GL-only row. Nothing about the shape is what put them on this card, so read it per row. The cause is undetermined, not absent.',
      action: 'Sort by shape first. Then take the largest documents and compare the item-ledger detail, quantity times unit cost, against the GL amount for the same document and account. Read the order line type on any GL-only row before chasing it — a type-N non-stock line posts to the GL and moves no inventory. On an item-ledger-only row, establish the right match key before concluding the GL entry is absent: on sales the GL carries its own document numbers. Whatever the comparison names, fix it at the source and re-run this company and period.',
      finding: {
        triage: true,
        mech: 'Sales documents that no claim matched. The cause is undetermined.',
        checked: [
          { a: 'T-SALES.unclaimed', t: 'Every claim in the classifier ran ahead of this card and none of them matched this row.' },
          { a: 'T-SALES.notlinked', t: 'Not a transfer, direct-ship or intercompany order.' },
          { a: 'T-SALES.notmismatch', t: 'The variance does not offset across accounts or across periods.' },
          { a: 'T-SALES.notflagged', t: 'No duplicate-sales flag and no A/P voucher batch type.' },
          { a: 'T-SALES.notnonstock', t: 'Neither non-stock claim matched: the non-stock cost does not tie to the variance, and not every line on the order is non-stock.' },
          { a: 'T-SALES.notaaicancel', t: 'The sales AAI cancel claim did not match either — so either the GL does hold a row for this document, or the 4220/4240 pair does not resolve to one account for every class it carries.' },
          { a: 'POP.shapemixed', t: 'Read the two amount columns per row. This card holds both-sided, item-ledger-only and GL-only rows, because the shape is not what put them here.' }
        ],
        found: [
          'Cause not identified. I have not pinned it to one mechanism yet.',
          'Next: take the largest documents first and compare the item-ledger detail, quantity times unit cost, against the GL amount for the same document and account.',
          'Read the order line type on any GL-only row. A type-N non-stock line posts to the GL and moves no inventory, which names the cause but still leaves a correction to make — check which account the GL leg landed on.'
        ],
        fix: ['Whatever the comparison names, fix it at the source and re-run this company and period. A document that comes back was not fixed.']
      }
    },
    'T-PURCH': {
      title: 'Unclassified — Purchasing', kind: 'review', tier: 'terminal', disposition: 'triage',
      cause: 'Purchasing documents no claim matched. The cause is not identified yet. Read the shape per row, then compare the receipt cost against the voucher cost, then the item-ledger detail against the GL amount.',
      desc: 'Purchasing documents that reached the end of the classifier with no claim matching. Every shape lands here — both sides disagreeing, item ledger only, or GL only — because nothing about the shape is what put them on this card. The cause is undetermined, not absent.',
      action: 'Compare the receipt cost against the voucher cost — a landed-cost or price difference posts to the GL with no matching inventory move. Then compare the item-ledger detail against the GL amount for the same document and account. On purchasing the GL correlates by order number, so establish the key before concluding an entry is absent. Whatever the comparison names, fix it at the source and re-run this company and period.',
      finding: {
        triage: true,
        mech: 'Purchasing documents that no claim matched. The cause is undetermined.',
        checked: [
          { a: 'T-PURCH.unclaimed', t: 'Every claim in the classifier ran ahead of this card and none of them matched this row.' },
          { a: 'T-PURCH.notlinked', t: 'Not a transfer, direct-ship or intercompany order.' },
          { a: 'T-PURCH.notmismatch', t: 'The variance does not offset across accounts or across periods.' },
          { a: 'T-PURCH.notvoucher', t: 'Not an A/P voucher batch, so the voucher claim did not match.' },
          { a: 'POP.shapemixed', t: 'Read the two amount columns per row. This card holds both-sided, item-ledger-only and GL-only rows.' }
        ],
        found: [
          'Cause not identified. I have not pinned it to one mechanism yet.',
          'Next: compare the receipt cost against the voucher cost. A landed-cost or price difference posts to the GL with no matching inventory move.',
          'Then compare the item-ledger detail against the GL amount for the same document and account.'
        ],
        fix: ['Whatever the comparison names, fix it at the source and re-run this company and period. A document that comes back was not fixed.']
      }
    },
    'T-MFG': {
      title: 'Unclassified — Manufacturing', kind: 'review', tier: 'terminal', disposition: 'triage',
      cause: 'Manufacturing documents no claim matched. The cause is not identified yet. Read the shape per row — an item-ledger-only completion here is NOT ruled out as a GL gap, it just failed one of the completion claim\'s other tests. Match by work order, not document number, and check for a cost change that never reached the GL as a WIP revaluation.',
      desc: 'Manufacturing documents that reached the end of the classifier with no claim matching. Every shape lands here — both sides disagreeing, item ledger only, or GL only. An item-ledger-only completion on this card is worth reading closely: the completion-gap claim also requires a stamped batch and material issues in the GL, so a row failing either of those tests lands here rather than on that card. The cause is undetermined, not absent.',
      action: 'Match item ledger to GL by work order, not document number — manufacturing accounting assigns its own GL document number. Sort by shape: an item-ledger-only completion needs the completion-gap questions asked by hand, and a both-sided row is a cost comparison. Check for a standard-cost change that landed on the item ledger without the matching WIP Revaluation (R30837) in the GL. A batch number means the row was processed; it does not prove the GL entry exists, so confirm the entry rather than assuming it.',
      finding: {
        triage: true,
        mech: 'Manufacturing documents that no claim matched. The cause is undetermined.',
        checked: [
          { a: 'T-MFG.unclaimed', t: 'Every claim in the classifier ran ahead of this card and none of them matched this row.' },
          { a: 'T-MFG.notmto', t: 'Not make-to-order: no sales order names this work order.' },
          { a: 'T-MFG.notmismatch', t: 'The variance does not offset across accounts or across periods.' },
          { a: 'T-MFG.notcostclaim', t: 'No GL completion was found for this work order on this account, so neither the cross-batch nor the cost-mismatch claim applied.' },
          { a: 'T-MFG.notcompletiongap', t: 'The completion-gap claim did not match, and that does NOT mean the completion is present. It means one of three things: the GL holds a completion for the order, or it holds no material issues for it either, or the item-ledger row carries no batch. Establish which before you work the row.' },
          { a: 'POP.shapemixed', t: 'Read the two amount columns per row. This card holds both-sided, item-ledger-only and GL-only rows.' }
        ],
        found: [
          'Cause not identified. I have not pinned it to one mechanism yet.',
          'On a both-sided row the likeliest cause is a cost-basis difference: a standard-cost change landed on the item ledger without the matching WIP Revaluation (R30837) in the GL.',
          'Next: match item ledger to GL by work order, not document number. Manufacturing accounting assigns its own GL document number.',
          'A batch number means manufacturing accounting processed the row. It does not prove the GL entry exists, so confirm the entry rather than assuming it.'
        ],
        fix: ['Whatever the comparison names, fix it at the source and re-run this company and period. A document that comes back was not fixed.']
      }
    },
    'T-INV': {
      title: 'Unclassified — Inventory', kind: 'review', tier: 'terminal', disposition: 'triage',
      cause: 'Inventory documents no claim matched, plus anything the classifier could not type. The cause is not identified yet. Read the shape per row, compare the item-ledger detail against the GL amount, then compare the item’s branch GL class against its location GL class.',
      desc: 'Inventory documents that reached the end of the classifier with no claim matching. This card also catches any row whose transaction type the classifier could not resolve, so it is the widest of the four. Every shape lands here — both sides disagreeing, item ledger only, or GL only. The cause is undetermined, not absent.',
      action: 'Compare the item-ledger detail against the GL amount for the same document and account. On an inventory document there is no order or subledger to correlate on, so the document and account are the key. Then compare the item’s branch GL class against its location GL class — JD Edwards lets the two disagree without a warning, and a split gives the item two identities in RapidReconciler on any document type. Whatever the comparison names, fix it at the source and re-run this company and period.',
      finding: {
        triage: true,
        mech: 'Inventory documents that no claim matched, plus rows the classifier could not type. The cause is undetermined.',
        checked: [
          { a: 'T-INV.unclaimed', t: 'Every claim in the classifier ran ahead of this card and none of them matched this row.' },
          { a: 'T-INV.notmismatch', t: 'The variance does not offset across accounts or across periods.' },
          { a: 'T-INV.nottransferclaim', t: 'Neither transfer claim matched — but note both only ever look at document type IT with a zero ledger amount and value on the item ledger, so a one-sided move under another document type would still land here.' },
          { a: 'POP.shapemixed', t: 'Read the two amount columns per row. This card holds both-sided, item-ledger-only and GL-only rows.' }
        ],
        context: [
          'One-sided rows are normal here, not exceptional, and a card can be made up entirely of them. Do not open a row expecting two figures to compare.'
        ],
        found: [
          'Cause not identified. I have not pinned it to one mechanism yet.',
          'Next: compare the item-ledger detail against the GL amount for the same document and account.',
          'Then compare the item’s branch GL class against its location GL class. A split gives the item two identities here, on any document type.'
        ],
        fix: ['Whatever the comparison names, fix it at the source and re-run this company and period. A document that comes back was not fixed.']
      }
    }
  };

  // Server-set SubType (lower-cased, trimmed) -> card code.
  var SUBTYPE = {
    'make to order':            'MTO',
    'intercompany':             'ICO',
    'transfers':                'TRF',
    'direct ship':              'DS',
    'accounts':                 'ACCT',
    'periods':                  'PER',
    'vouchers':                 'VCHR',
    'duplicate sales':          'DUP',
    'transfer leg missing':     'TLM',
    'transfer integrity':       'TXI',
    'completion not journaled': 'CNJ',
    'offsetting entries':       'OFF',
    'non-stock sales lines':    'NSL',
    // DB beta.74 / beta.75 — the five claims that took the manufacturing residual to
    // zero on every demo database. Keys are the server SubType lower-cased and trimmed.
    'non-stock charge lines':   'NCL',
    // 2026-08-10 — cardex-only sales where the 4220 / 4240 pair resolves to one account.
    'sales dmaai net zero':     'SAC',
    // 2026-08-17 — item cost change (IB) whose 4134 / 4136 pair resolves to one account,
    // so the GL posts two legs that cancel on the inventory account.
    'inventory dmaai net zero': 'IAC',
    // The pre-rename string, kept so a database not yet re-classified still lands on the
    // same card instead of falling through to a terminal one (owner renamed it 2026-08-10).
    'sales aai cancels':        'SAC',
    'sales not journaled':      'SNJ',
    'cross-batch completion':   'XBC',
    'mfg cost mismatch':        'MCM'
  };
  // No subtype -> terminal card by transaction Type. Anything else (including
  // 'Inventory' and an unrecognized type) falls to T-INV.
  var TYPE = { 'sales': 'T-SALES', 'purchasing': 'T-PURCH', 'mfg': 'T-MFG' };

  // ---- GRID: Details-only shapes for rows the server left without a SubType --
  // These never become Home cards (those rows roll into the T-* terminals by
  // transaction type), so they carry no `cause`. One name each — the scope band,
  // the pattern card and the work panel all read `title`.
  var GRID = {
    'GL-ONLY': {
      title: 'GL-Only Entry (No Cardex)', disposition: 'rebalance',
      desc: 'An F0911 entry sits on an inventory account with no F4111 counterpart. Read the order line type first: a non-stock line (type N, Inventory Interface N) posts to the GL and moves no inventory, so no cardex row exists. That names the cause; the value still sits on an inventory account it does not belong on, so a correction is required. Otherwise the value was keyed straight onto an inventory account, or a return went through a correction batch (IB rather than I) that posted the GL without writing a cardex record.',
      action: 'Read the LineTy column, then read which account the GL leg landed on. Where a non-stock line is landing on inventory, correct the DMAAI for that non-stock line type so the cost posts to its own non-inventory account — one DMAAI fix stops the whole recurring population instead of document-by-document work. The value already posted stays in the inventory account until the accountant reclassifies it out. Where an inventory account is being keyed directly, restrict who can post to inventory accounts on the entry program, or route those entries through an approval step, so the next one cannot be keyed the same way.'
    },
    'CDX-ONLY': {
      title: 'Cardex-Only Entry (No GL)', disposition: 'rebalance',
      desc: 'An F4111 movement with no F0911 posting on the same account. The batch is usually still open — the cardex writes at transaction time and the GL entry only exists once the batch posts. Where the batch already shows posted and one line is still missing, that single line failed the GL interface while its siblings in the same batch went through.',
      action: 'Post the open batch. If the post errors, the batch is waiting in the Work Center. Where the batch already shows posted, search the GL for the document across all accounts, not just inventory: a misrouted entry looks identical to a missing one from this side. If open batches keep appearing, confirm the post is scheduled for the batch types carrying inventory activity, and that approval is automatic on the system-generated types. Manual approval is what leaves them sitting.'
    },
    // DT=BV is a standard-cost revaluation; DT=IB with no GL leg is a balance
    // adjustment. ONE name has to cover both, so it names the mechanism they
    // share rather than either specific trigger (this code carried two different
    // names across two maps until UI-63).
    'STD-COST': {
      title: 'Cardex Revaluation', disposition: 'self',
      desc: 'An F4111 cardex revaluation from a standard cost change (DT=BV), or an unposted cardex-only balance adjustment (DT=IB with no GL leg). The item ledger revalued and the GL side has not landed yet.',
      action: 'Confirm the matching GL revaluation posts in the next batch — this reconciles itself when it does. A revaluation still cardex-only after the next close is not timing: chase the unposted batch at the source.'
    },
    'OTHER': {
      title: 'Other Variance', disposition: 'triage',
      desc: 'Cardex and GL both posted but disagree, and the variance doesn\'t fit a narrower grid-level pattern. The cause is undetermined, not absent.',
      action: 'Take the largest documents first. Export a representative row: the analyzer reads the line detail and names a narrower pattern. Search the GL for the document across all accounts. On work-order documents, match by work order rather than document number. Compare against the prior period to separate a gap that self-clears from one that persists. Do not adopt a preventive change before the cause is named.'
    }
  };

  // ---- SIGNAL: pseudo-codes the Details finding engine selects instead of the
  // card. Row-truth signals are definitive from the rows themselves, so they
  // pre-empt the card mechanism (the "check duplicate sales first" rule);
  // UNSCOPED covers a grid the analyst reached without drilling a card.
  var SIGNAL = {
    'NON-STOCK': {
      title: 'Non-stock on inventory account',
      finding: {
        mech: 'Non-stock lines posted their GL value to an inventory account.',
        checked: [
          'Order line type on these rows: N, Non-Stock. Inventory Interface N on the line-type constant. Confirmed.',
          'Item-ledger side: nothing. A non-stock line moves no inventory, so no cardex row exists.',
          'Account the GL leg posted to: the inventory account the cardex uses. Confirmed.',
          'Non-stock extended cost on those lines against the GL amount: it accounts for the variance exactly.'
        ],
        found: [
          'The non-stock cost is sitting in an inventory account. A non-stock item holds no inventory, so that value does not belong there.',
          'The tie between the non-stock cost and the GL amount identifies the cause. It does not clear the row — a correction is required.',
          'The DMAAI directing this non-stock line type is sending non-stock cost to the inventory account, so every order carrying such a line repeats it.',
          'Until it is corrected, the GL inventory balance is overstated against the item ledger by exactly the non-stock total.'
        ],
        fix: [
          'Correct the DMAAI for this non-stock line type so the cost lands on its own non-inventory account.',
          'One DMAAI fix stops the whole population. Do not work these document by document.',
          'The value already posted stays in the inventory account until the accountant reclassifies it out. That reclass is the accountant’s lane.',
          'Put the next order carrying a non-stock line through and confirm its value lands off inventory.'
        ]
      }
    },
    'DMAAI-MIS': {
      title: 'DMAAI mismatch',
      finding: {
        dmaai: true,
        mech: '',    // set per-render from the mismatch count
        found: [
          'The inventory AAI for these DMAAIs points somewhere other than the item-ledger model account.',
          'Every document on the DMAAI relieves inventory at the wrong account, so this repeats until the AAI is aligned.'
        ],
        fix: [
          'Align the inventory AAI for the flagged DMAAIs so it resolves to the model account.',
          'Re-run this company and period. Every posted account in the DMAAI table should then match its model account.',
          'Documents already posted keep the old account. They need their own correction.'
        ]
      }
    },
    'UNSCOPED': {
      title: 'Cause not yet identified',
      finding: {
        triage: true,
        mech: 'Both sides posted on these documents and disagree. The view is not scoped to one card, so no single mechanism covers it.',
        found: [
          'Cause not identified. This view mixes several mechanisms.',
          'Next: scope the view to one card. Each card carries its own findings and corrective action.',
          'Or take the largest documents first and compare the item-ledger detail against the GL amount for the same document and account.'
        ],
        fix: ['Whatever the comparison names, fix it at the source and re-run this company and period. A document that comes back was not fixed.']
      }
    }
  };

  // Codes are non-numeric string keys, so Object.keys returns them in insertion
  // order — the ORDER array and META can never disagree.
  var ORDER = Object.keys(META);
  var TITLE = {};
  ORDER.forEach(function (c) { TITLE[c] = META[c].title; });
  Object.keys(GRID).forEach(function (c) { TITLE[c] = GRID[c].title; });

  // ---- Drift alarms ---------------------------------------------------------
  // Every miss below used to render a plausible-looking generic string. Warn
  // once per distinct key so a real drift is noisy without spamming per row.
  var _warned = {};
  function warnOnce(key, msg) {
    if (_warned[key]) return;
    _warned[key] = 1;
    console.warn('[txv] ' + msg);
  }

  function normCode(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  function entry(v) {
    var c = normCode(v);
    return META[c] || GRID[c] || SIGNAL[c] || null;
  }
  // info(code) — the copy bundle every surface reads. A missing code is a drift,
  // not a display case: warn and hand back a shape the caller can render.
  function info(v) {
    var c = normCode(v), e = entry(c);
    if (!e) {
      warnOnce('info:' + c, 'no catalog entry for code "' + c + '" — add one to META / GRID / SIGNAL in config.js. Surfaces will show the bare code.');
      return { title: c, desc: '', action: '', disposition: 'triage' };
    }
    if (!e.desc && !e.action && !e.finding) {
      warnOnce('copy:' + c, 'catalog entry "' + c + '" carries no desc / action / finding — the analyst gets a bare title.');
    }
    return e;
  }
  function cause(v) {
    var c = normCode(v), e = entry(c);
    if (e && e.cause) return e.cause;
    if (e && (e.desc || e.action)) return [e.desc, e.action].filter(Boolean).join(' ');
    warnOnce('cause:' + c, 'no `cause` copy for card "' + c + '" — the card falls back to a generic line. Add `cause` to its META entry in config.js.');
    return '';
  }
  function finding(v) {
    var c = normCode(v), e = entry(c);
    if (e && e.finding) return e.finding;
    if (e) warnOnce('finding:' + c, 'no `finding` block for code "' + c + '" — the findings panel cannot draft an investigation report for it. Add `finding` to its catalog entry in config.js.');
    return null;
  }
  function isCode(v) { return !!(META[normCode(v)]); }
  function title(v) { var e = entry(v); return e ? e.title : ''; }

  // ---- Classifiers ---------------------------------------------------------
  // subtypeCode — the ONE place a server SubType becomes a card code. An
  // unmapped non-empty SubType is the failure that shipped twice: the row is
  // correctly classified by the server and lands under the wrong card because
  // the client never learned the name. It warns now.
  function subtypeCode(r) {
    var st = String((r && r.SubType) == null ? '' : r.SubType).trim().toLowerCase();
    if (!st) return '';
    if (Object.prototype.hasOwnProperty.call(SUBTYPE, st)) return SUBTYPE[st];
    warnOnce('subtype:' + st, 'server SubType "' + st + '" has no card code — rows carrying it are falling back to a generic classification. Add it to SUBTYPE in config.js.');
    return '';
  }
  // Home: SubType -> card, else transaction Type -> a T-* terminal. Every row
  // lands in exactly one code, so the cards partition the residual.
  function code(r) {
    r = r || {};
    var c = subtypeCode(r);
    if (c) return c;
    var ty = String(r.Type == null ? '' : r.Type).trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(TYPE, ty) ? TYPE[ty] : 'T-INV';
  }
  // Details: the duplicate-relief integrity flag (actionable root cause, wins
  // over SubType), then SubType, then the cardex/GL grid shape. Finer than
  // code() only for rows the server left without a SubType.
  function gridCode(r) {
    r = r || {};
    var eps = 0.01;
    if (String(r.Comment == null ? '' : r.Comment).trim().toLowerCase() === 'check duplicate sales integrity') return 'DUP';
    var c = subtypeCode(r);
    if (c) return c;
    var ot = String(r.OT == null ? '' : r.OT).trim().toUpperCase();
    var dt = String(r.DT == null ? '' : r.DT).trim().toUpperCase();
    var cardex = Number(r.CardexAmount) || 0;
    var ledger = Number(r.LedgerAmount) || 0;
    if (ot === 'OP' && dt === 'PV') return 'VCHR';
    // A MISMATCH NEEDS TWO SIDES (UI-77). MCM asserts a comparison — "the item
    // ledger and the GL valued the same completion quantity at different unit
    // costs", "the variance is quantity times the difference" — and its finding
    // report claims checks that only make sense with both sides present: "an F0911
    // completion exists for the work order on this account, so the completion-gap
    // shape is ruled out", "the amounts still differ". A row with no cardex value
    // has one side. There is no second cost basis to disagree with, so it cannot be
    // a cost mismatch, and the attached finding asserts checks that were never made.
    //
    // MEASURED on Demo3: 9 rows reached this branch, totalling -$93,815.51, and ALL
    // NINE carry CardexAmount = 0.00 exactly (sum of |CardexAmount| = 0.00). Largest
    // is DocNumber 900620, doc type IM, ledger -$54,170.89. Zero rows reached it with
    // a cardex value — so on that database this branch was firing ONLY on GL-only
    // rows and never once on a genuine two-sided mismatch. Demo1 sends no rows here
    // at all. They are now GL-ONLY, which is the shape they actually are.
    //
    // NOT A DOUBLE COUNT, A MISLABEL: the Home cards filter on code(), not gridCode(),
    // so no dollar was ever counted twice. These 9 rows have no SubType and Type
    // 'Mfg', so code() puts them in T-MFG either way. What changed is the mechanism
    // and the corrective action the analyst reads inside that drill.
    //
    // FIXED AS A PRECONDITION, NOT A REORDER, on purpose: adding the two-sided test
    // to this branch changes exactly the rows measured above and leaves the relative
    // order of VCHR / STD-COST / CDX-ONLY untouched. Reordering GL-ONLY above this
    // line would also have re-labelled STD-COST rows, which is unmeasured.
    //
    // STD-COST BELOW WAS CHECKED AND LEFT ALONE. Its `IB` clause requires
    // |ledger| < eps and so can never overlap GL-ONLY (which requires
    // |ledger| >= eps) — structurally impossible, not merely unobserved. Its `BV`
    // clause could overlap in principle, but the branch matches ZERO rows in either
    // database, so there is nothing to measure and nothing to justify moving.
    // Cardex-only work-order rows still land on MCM: unmeasured here (zero rows), so
    // deliberately unchanged.
    if (ot === 'WO' && (dt === 'IM' || dt === 'IC' || dt === 'IH') && Math.abs(cardex) >= eps) return 'MCM';
    if (dt === 'BV' || (dt === 'IB' && Math.abs(ledger) < eps)) return 'STD-COST';
    if (Math.abs(cardex) < eps && Math.abs(ledger) >= eps) return 'GL-ONLY';
    if (Math.abs(ledger) < eps && Math.abs(cardex) >= eps) return 'CDX-ONLY';
    return 'OTHER';
  }

  window.RRV8.txv = {
    META: META, GRID: GRID, SIGNAL: SIGNAL, ORDER: ORDER, TITLE: TITLE, SUBTYPE: SUBTYPE,
    code: code, gridCode: gridCode, isCode: isCode, normCode: normCode, title: title,
    info: info, cause: cause, finding: finding
  };
})();

/*
 * RRV8.excluded — the ONE producer of every excluded-GL-class figure (UI-71).
 *
 * The excluded population is quoted on three surfaces: the Model DMAAI Table
 * band on Home, the AI day-brief fact block behind it, and the Model DMAAI
 * Review page. Before this they were computed three ways and disagreed in the
 * same viewport:
 *
 *   - Home's day-brief fact said "5 GL classes excluded (801 items out of
 *     reconciliation)" from the agent's /model-approval, whose report3Count is
 *     `report3.size()` — ROWS of v_integrity3_exc_glc, at item/branch/location/
 *     lot grain — and whose report3GlClassCount is every excluded class
 *     regardless of the verdict the analyst already recorded. Measured on a
 *     demo company: 801 rows, 440 item/branch, 5 classes, 2 still open.
 *   - The band beside it said "2 GL classes excluded" from its own read.
 *   - The Review page's own AI lead said "the largest is SUPP … (509 items)"
 *     while its table showed that class's stocking-type rows summing to 185
 *     items, because the lead re-aggregated the raw rows per class instead of
 *     reusing the slices it had already built.
 *
 * Every one of those numbers was arithmetically correct and differently
 * grained. The fix is not a better label — it is one function. Grain names are
 * fixed here and nowhere else:
 *
 *   rows    a v_integrity3_exc_glc row: one item, branch, LOCATION and LOT
 *   items   distinct (ShortItem, Branch) — what the analyst calls an item
 *   slices  distinct (company, GL class, stocking type) — the verdict grain
 *   classes distinct (company, GL class) — the DMAAI 4152 fix grain
 *
 * A caller that wants rows says rows. Nothing here returns one grain under
 * another grain's name.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  'use strict';
  // Field access is case-tolerant because the agent's row keys are not
  // stable-cased across reports (CompanyNumber vs companynumber, GLCLass vs
  // GLClass). Both consumers had their own copy of this; now there is one.
  // Always returns a TRIMMED string. The source columns are SQL nchar, which
  // pads — an untrimmed stocking type or branch would fan one slice into two
  // that look identical on screen.
  function field(r, name) {
    if (!r) return '';
    if (r[name] != null) return String(r[name]).trim();
    var lower = String(name).toLowerCase();
    for (var k in r) {
      if (Object.prototype.hasOwnProperty.call(r, k) && String(k).toLowerCase() === lower) {
        return r[k] == null ? '' : String(r[k]).trim();
      }
    }
    return '';
  }
  function sliceKey(co, gl, stkt) { return co + '\x01' + gl + '\x01' + stkt; }
  function classKey(co, gl) { return co + '\x01' + gl; }

  // Rows -> slices. `company` narrows; blank/absent keeps every company.
  //
  // ONE ROW PER (company, GL class, stocking type), not per GL class. A class
  // routinely spans stocking types that do not deserve the same verdict — on a
  // demo company NS40 spans four and 138 items on one of them hold 94% of that
  // class's excluded value while the other three hold nothing. F4102 is unique
  // on (item, branch), verified, so the stocking type cannot fan a row out and
  // the split totals still tie to the unsplit population exactly.
  function slices(rows, company) {
    var co0 = company == null ? '' : String(company).trim();
    var map = Object.create(null), out = [];
    (rows || []).forEach(function (r) {
      var co = field(r, 'CompanyNumber');
      if (co0 && co && co !== co0) return;
      var gl = field(r, 'GLClass');
      // '' is a REAL stocking type: the item has no F4102 record for its
      // branch. It gets its own slice rather than being folded in with a code.
      var stkt = field(r, 'StockingType');
      var amt = Number(field(r, 'Amount')) || 0;      // on-hand $ (rperpetualinv), summed in the view
      var key = sliceKey(co, gl, stkt);
      var g = map[key];
      if (!g) {
        g = map[key] = { key: key, co: co, gl: gl, stkt: stkt, items: 0, amount: 0, qty: 0,
                         costed: 0, split: 0, brClasses: [], rowsTotal: 0, rows: [],
                         _seen: Object.create(null), _br: Object.create(null) };
        out.push(g);
      }
      // The view is at item/LOCATION/LOT grain (DAC-56), so one item in three
      // locations is three rows. `items` must stay an ITEM count or the
      // headline silently multiplies and stops meaning what the column says.
      var ik = field(r, 'ShortItem') + '\x01' + field(r, 'Branch');
      if (!g._seen[ik]) { g._seen[ik] = 1; g.items++; }
      g.amount += amt;
      // Rows carrying a unit cost — drives the latent-exclusion marker: 0.00
      // with a cost behind it is empty, not free.
      if ((Number(field(r, 'UnitCost')) || 0) !== 0) g.costed++;
      // Rows whose BRANCH class disagrees with the LOCATION class this slice is
      // grouped by. Work-order moves take the class from the branch and every
      // other move takes it from the location, so a split means part of these
      // items' activity routes to an account that IS in the model and part does
      // not.
      var bc = field(r, 'BranchClass');
      if (bc && bc !== gl) { g.split++; g._br[bc] = 1; }
      g.rowsTotal++;
      g.qty += Number(field(r, 'Quantity')) || 0;
      g.rows.push(r);
    });
    out.forEach(function (g) {
      // Order the ITEMS the way the slices are ordered — biggest first. A
      // 183-row detail list opening on a zero-value item makes the analyst
      // scroll to find the money, and the money is why the list is open.
      g.rows.sort(function (x, y) {
        return Math.abs(Number(field(y, 'Amount')) || 0) - Math.abs(Number(field(x, 'Amount')) || 0);
      });
      g.brClasses = Object.keys(g._br);
    });
    // Sorted by absolute amount, biggest first — the whole triage order.
    return out.sort(function (a, b) { return Math.abs(b.amount) - Math.abs(a.amount); });
  }

  // Slices + recorded verdicts -> the counts every surface quotes.
  //
  // `reviews` is a map keyed exactly as sliceKey() builds it; a slice counts as
  // reviewed when its entry carries a non-blank `status`. A caller with no
  // verdict source passes nothing, and every slice reads as open — which
  // OVERSTATES the work and never hides an exclusion. That is the safe
  // direction: an older Services build with no verdict endpoint degrades to
  // "nothing reviewed", never to "nothing excluded".
  //
  // A CLASS is open while ANY of its slices lacks a verdict, because the class
  // is what maps to a DMAAI 4152 fix — it is not settled until every slice
  // under it is.
  function progress(sl, reviews) {
    sl = sl || []; reviews = reviews || {};
    var classes = Object.create(null), open = Object.create(null), items = Object.create(null);
    // The CODES of the still-open classes, not just how many. The band above the routing
    // list says "N GL classes excluded" and the list under it could not show WHICH, because
    // this function computed the identities and returned only the count.
    var openCodes = Object.create(null);
    var reviewed = 0, totalAmt = 0, openAmt = 0, rows = 0;
    sl.forEach(function (g) {
      var ck = classKey(g.co, g.gl);
      classes[ck] = 1;
      totalAmt += g.amount;
      rows += g.rowsTotal;
      var rev = reviews[g.key];
      if (rev && String(rev.status || '').trim()) reviewed++;
      else { open[ck] = 1; openAmt += g.amount; if (g.gl) openCodes[String(g.gl).trim()] = 1; }
      // Distinct items ACROSS slices. Summing g.items would double-count an
      // item that appeared under two stocking types; F4102's uniqueness on
      // (item, branch) makes that impossible today, and this does not depend
      // on it staying true.
      for (var ik in g._seen) { if (Object.prototype.hasOwnProperty.call(g._seen, ik)) items[ik] = 1; }
    });
    var nSlices = sl.length;
    return {
      classes: Object.keys(classes).length,
      openClasses: Object.keys(open).length,
      // Codes, so a consumer can point at the rows the count refers to.
      openCodes: Object.keys(openCodes),
      slices: nSlices,
      reviewed: reviewed,
      items: Object.keys(items).length,
      rows: rows,
      totalAmt: totalAmt,
      openAmt: openAmt,
      // "Every exclusion has a verdict" — NOT the same as "nothing is excluded".
      allReviewed: nSlices > 0 && reviewed === nSlices
    };
  }

  // Slices rolled up to the GL CLASS, for a surface that names the largest
  // class rather than the largest slice. Derived FROM the slices, never from
  // the rows again — re-aggregating the rows is exactly how the Review page's
  // lead came to say 509 items for a class its own table showed as 185.
  function byClass(sl) {
    var map = Object.create(null), out = [];
    (sl || []).forEach(function (g) {
      var ck = classKey(g.co, g.gl);
      var c = map[ck];
      if (!c) { c = map[ck] = { co: g.co, code: g.gl, items: 0, amount: 0, slices: 0, rows: 0, _seen: Object.create(null) }; out.push(c); }
      c.amount += g.amount;
      c.slices++;
      c.rows += g.rowsTotal;
      for (var ik in g._seen) {
        if (Object.prototype.hasOwnProperty.call(g._seen, ik) && !c._seen[ik]) { c._seen[ik] = 1; c.items++; }
      }
    });
    return out.sort(function (a, b) { return Math.abs(b.amount) - Math.abs(a.amount); });
  }

  window.RRV8.excluded = { slices: slices, progress: progress, byClass: byClass, sliceKey: sliceKey, field: field };
})();

/*
 * RRV8.rollForward — the ONE producer of account roll-forward state (UI-71).
 *
 * Home's Account Roll Forward band and inventory-account-rollforward.html read
 * the SAME rows (POST /inventory/integrity {report:'v6ui_raccountsummary'}) and
 * used to classify them independently. Home tested GLOK/VarOK for the literal
 * 'no' and called everything else clean; the page normalised the tokens first
 * and kept a THIRD bucket for rows it could not evaluate. So the page could
 * show amber "N accounts could not be evaluated" while Home, in the band that
 * links to it, showed a green tick and "Every period rolled forward cleanly".
 * Reported by the owner 2026-08-09 on fourteen accounts.
 *
 * The fourteen turned out to be baseline rows — fixed by classifying them as
 * baseline on both axes, not as unevaluated (see normRow below). The DIVERGENCE
 * was not fixed by that: Home still had no third bucket, so the next genuinely
 * unevaluated row would have reproduced it exactly. Both surfaces call this now.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  'use strict';
  function tok(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (s === 'no' || s === 'baseline' || s === 'yes') return s;
    if (s.indexOf('end') === 0) return 'end';        // 'end' and 'end - <timestamp>'
    return 'unk';
  }
  // A BASELINE ROW IS BASELINE ON BOTH AXES. It is the opening snapshot, so it
  // has no prior period BY DEFINITION — that is what the label means — and
  // calling it "not evaluated" states a shortcoming that does not exist.
  //
  // It read as unevaluated for a data reason, not a logic one: on a baseline row
  // GLOK is the token 'baseline' but VarOK carries a BARE TIMESTAMP (measured:
  // GLOK 'baseline', VarOK '2026-08-07 12:14:24', period 2024-12-31). tok() has
  // a prefix rule for the 'end - <timestamp>' pair but a bare timestamp matches
  // nothing, so it fell through to 'unk', and the unevaluated bucket is an OR
  // across the two columns. Keyed on GLOK because that is the column that
  // carries the token. Owner 2026-08-09.
  //
  // MUTATES the row, which is what the roll-forward page has always done on
  // ingest so its grid chips render the normalised token. Home passes rows it
  // shares with other readers, so it uses classify() instead, which does not.
  function normRow(r) {
    if (!r) return r;
    r.GLOK = tok(r.GLOK);
    r.VarOK = (r.GLOK === 'baseline') ? 'baseline' : tok(r.VarOK);
    return r;
  }
  // THE 'end' TOKEN IS NOT A VERDICT (UI-57 / DAC-33). 'end' marks the company's
  // CURRENT OPEN period, and usp6_009_account_summary's two break comparisons
  // explicitly skip it (`and raccountsummary.glrollok != 'end'`). So the one
  // period the analyst is actually reconciling was the one period never
  // evaluated, and it counted as neither a break nor unevaluated — a neutral
  // grey chip, absent from both totals. Same defect class as the '' -> 'yes'
  // fallback above: an unevaluated state rendering as a benign one.
  //
  // DAC-33 added the verdict as its own columns. v8_raccountsummary_rollcheck
  // applies the SAME two comparisons to the open period and v6ui_raccountsummary
  // surfaces them as EndGLOK / EndVarOK. We resolve an 'end' row's break/pass
  // from those and leave GLOK / VarOK carrying 'end' for display, because three
  // consumers key on that literal (usp6returnvalidationstatus's own end-branch,
  // the oobrollok timestamp overwrite in usp6_009, and this page's chip class).
  //
  // A MISSING VERDICT IS 'unk', NEVER 'yes'. The producer inner-joins the prior
  // period, so an end row with no predecessor yields NULL — that is "no prior
  // period to roll from", which is exactly the unevaluated case, not a pass.
  // Defaulting it to 'yes' is the bug that was fixed above; do not reintroduce
  // it here.
  function endTok(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    return (s === 'yes' || s === 'no') ? s : 'unk';
  }
  // Non-mutating: the pair of normalised tokens for one row.
  function classify(r) {
    var gl = tok(r && r.GLOK);
    if (gl === 'baseline') return { glok: 'baseline', varok: 'baseline' };
    if (gl === 'end') return { glok: endTok(r && r.EndGLOK), varok: endTok(r && r.EndVarOK) };
    return { glok: gl, varok: tok(r && r.VarOK) };
  }
  // The three buckets, over rows already narrowed to the scope the caller means.
  //
  //   gl    GL balance break  — F0902 does not tie to posted F0911. Actionable:
  //         R099102 in JD Edwards first, then Reload GL.
  //   varc  variance break    — did not carry forward. NO manual step; it
  //         re-clears on the next refresh.
  //   unk   never evaluated   — no prior period to roll forward from. Amber and
  //         named, never green: "clean" would be a claim about rows nobody
  //         compared. Baseline rows are NOT in here.
  //
  // `breaks` counts ROWS that are broken on either axis — DISTINCT rows, not
  // gl.rows + varc.rows. A row broken on both axes is one broken row, and adding
  // the buckets would report it twice. Home has always meant the row count here
  // (its consumers test it > 0 today, which hides the difference, and a figure
  // that is only correct while nobody prints it is the UI-71 shape).
  function summary(rows, match) {
    var scope = [];
    (rows || []).forEach(function (r) {
      if (typeof match === 'function' && !match(r)) return;
      scope.push(r);
    });
    var gl = [], varc = [], unk = [], broken = 0;
    scope.forEach(function (r) {
      var c = classify(r);
      if (c.glok === 'no') gl.push(r);
      if (c.varok === 'no') varc.push(r);
      if (c.glok === 'no' || c.varok === 'no') broken++;
      // OR across the two columns, deliberately: either side unevaluated means
      // the row is not proven. A row can be both a break and unevaluated (broken
      // on one axis, never compared on the other) and belongs in both buckets —
      // this is the roll-forward page's own rule, unchanged.
      // An 'end' row whose verdict is NULL lands here on purpose: no prior period
      // to roll the open period from is the unevaluated case, not a pass.
      if (c.glok !== 'baseline' && (c.glok === 'unk' || c.varok === 'unk')) unk.push(r);
    });
    function acctsOf(arr) {
      var seen = Object.create(null), out = [];
      arr.forEach(function (r) {
        var k = String(r.CompanyNumber) + '\x01' + String(r.LongAccount);
        if (!seen[k]) { seen[k] = 1; out.push({ co: String(r.CompanyNumber), acct: String(r.LongAccount) }); }
      });
      return out;
    }
    return {
      scopeRows: scope.length,
      breaks: broken,
      gl:   { rows: gl.length,   accts: acctsOf(gl) },
      varc: { rows: varc.length, accts: acctsOf(varc) },
      unk:  { rows: unk.length,  accts: acctsOf(unk) }
    };
  }
  window.RRV8.rollForward = { tok: tok, endTok: endTok, normRow: normRow, classify: classify, summary: summary };
})();

/*
 * RRV8.residual — the ONE definition of "zero-quantity" for the residual-dust model.
 *
 * THE BUG THIS FIXES. Every surface tested `Number(Quantity) === 0` — an EXACT zero —
 * while the grids render quantity at two decimals. A row holding 0.004 KG shows "0" and
 * was not a candidate. Measured 2026-08-19 on Demo3 Co 30001 / 2023-05-31, 20,473 rows:
 *
 *     Quantity exactly 0 ................   1 row
 *     |Quantity| < 0.005 (displays as 0) . 177 rows, |Amount| 0.00 .. 33.20
 *
 * So the Residual Optimizer correctly hid the single exactly-zero row and looked broken,
 * because 176 rows that read as zero on screen were invisible to it. The optimizer was
 * right; the definition was wrong.
 *
 * QTY_EPS is not a tolerance anyone picked — it is the display precision. The grids use
 * maximumFractionDigits: 2, so |q| < 0.005 is exactly the set that renders as "0". The
 * rule is "if the screen says zero, the model treats it as zero", which is the only
 * version an analyst can check by looking.
 *
 * Widening the CANDIDATE set does not widen what gets HIDDEN: the cumulative walk still
 * only hides rows while the running |Amount| stays inside the target, so a near-zero
 * quantity carrying real value becomes a candidate and is then judged on its amount.
 *
 * Used by the Full Perpetual page, Home's Perpetual At-a-Glance and the audit report's
 * Residuals Audit line — the three had four copies of the old test between them, and
 * their own comments already insisted they stay in lockstep.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var QTY_EPS = 0.005;
  window.RRV8.residual = {
    QTY_EPS: QTY_EPS,
    isZeroQty: function (q) { return Math.abs(Number(q) || 0) < QTY_EPS; }
  };
})();

/*
 * RRV8.varianceTieOut — the ONE producer of the six-component variance decomposition
 * and the identity that ties it to the account's out-of-balance.
 *
 * THE IDENTITY (measured 2026-08-19 on v6ui_raccountsummary across Demo1/2/3, every
 * row with |OOB| >= 1 — Demo1 36 rows, Demo2 107, Demo3 68):
 *
 *     BegVar + Variance + JEs + CardexVar − UnpostBatch − EndofDay = OOB
 *
 * Demo1 and Demo3 miss on ZERO rows. Demo2 misses on 4, by exactly $0.01 each, all on
 * the same account across four periods — float dust, which is why `closes` runs on a
 * one-cent tolerance rather than an exact compare.
 *
 * ⚠ THE TWO TIMING COMPONENTS SUBTRACT, and getting that wrong is not a rounding
 * problem — it doubles the error. Straight addition of all six was measured failing on
 * 32 Demo2 rows and 12 Demo3 rows, and on those rows the miss is EXACTLY twice the miss
 * of the four-term version, because the timing amount lands on the wrong side of the
 * equation and is therefore counted twice. Unposted GL is already inside EndGL (the
 * roll-forward's own `EndGL = BegGL + PerGL + UnpostBatch`), so it has to come back out
 * to reconcile against perpetual; End of Day behaves the same way.
 *
 * ⚠ DEMO1 CANNOT TELL THE VARIANTS APART. It has no account carrying material timing,
 * so every sign arrangement ties there — including the wrong ones. Verify sign changes
 * against Demo2 or Demo3, never Demo1 alone.
 *
 *   COMPONENTS                     the six, in roll-forward order, each with its sign
 *   decompose(row)                 from a v6ui_raccountsummary-shaped row
 *   decomposeByName(comp, oob)     from a name-keyed aggregate (the company grain)
 *   TOLERANCE                      0.01
 *
 * Both return { parts, total, oob, diff, closes }. `parts[].raw` is the component as
 * stored; `parts[].signed` is it with the identity's sign applied — render `raw` next
 * to a leading −, never `signed`, or a negative deduction reads as a double negative.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var TOLERANCE = 0.01;
  // Order is the reading order of the tie-out, NOT a magnitude sort: this is an
  // equation, and an equation whose terms move around cannot be checked at a glance.
  // `role` is what the triage/AI surfaces already split on — keep it here so the six
  // components are declared once for every consumer.
  // `name` is CANONICAL and load-bearing beyond display: the AI grounding text defines
  // the components by these exact strings, and _COMP_SUB / _COMP_KEY are keyed on them.
  // Do not shorten it. `short` is display-only, for the chip row in the per-account
  // drawer where six labels have to fit one line — it matches the grid's own column
  // headers wherever one exists (Unposted, End of Day) so a chip and the column above
  // it never carry two different names for the same figure.
  var COMPONENTS = [
    { f: 'BegVar',      name: 'Carry forward',       short: 'Carry fwd',    role: 'Accountant', sign:  1 },
    { f: 'Variance',    name: 'Transactions',        short: 'Transactions', role: 'Accountant', sign:  1 },
    { f: 'JEs',         name: 'Manual entries',      short: 'Manual JEs',   role: 'Accountant', sign:  1 },
    { f: 'CardexVar',   name: 'Cardex',              short: 'Cardex',       role: 'Analyst',    sign:  1 },
    { f: 'UnpostBatch', name: 'Unposted GL batches', short: 'Unposted',     role: 'Analyst',    sign: -1 },
    { f: 'EndofDay',    name: 'End of Day',          short: 'EOD',          role: 'Analyst',    sign: -1 }
  ];
  function _core(get, oob) {
    var parts = COMPONENTS.map(function (k) {
      var raw = Number(get(k)) || 0;
      return { f: k.f, name: k.name, short: k.short, role: k.role, sign: k.sign, raw: raw, signed: k.sign * raw };
    });
    var total = parts.reduce(function (s, p) { return s + p.signed; }, 0);
    var o = Number(oob) || 0, diff = total - o;
    // The epsilon is not slack in the tolerance, it is float representation. The
    // measured dust is exactly one cent, and summing six doubles lands it at
    // 0.010000000002 — a bare `<= 0.01` rejected the very rows the tolerance exists
    // to admit. Caught by Tools/test-variance-tieout.js, which is the only reason
    // anyone would ever have known: the drawer would just have flagged four healthy
    // accounts as not closing, forever.
    return { parts: parts, total: total, oob: o, diff: diff, closes: Math.abs(diff) <= TOLERANCE + 1e-9 };
  }
  function decompose(row) { row = row || {}; return _core(function (k) { return row[k.f]; }, row.OOB); }
  function decomposeByName(comp, oob) { comp = comp || {}; return _core(function (k) { return comp[k.name]; }, oob); }
  window.RRV8.varianceTieOut = { COMPONENTS: COMPONENTS, decompose: decompose,
                                 decomposeByName: decomposeByName, TOLERANCE: TOLERANCE };
})();

/*
 * RRV8.oeEntry — the ONE producer of the adjusting-entry composition arithmetic
 * (UI-21). Given the account rows the Accounts grid is already showing for one
 * company + period, it decides which accounts are journal-able, how much each one
 * takes, and what a deferred carry-forward comes to.
 *
 * WHY IT LIVES HERE AND NOT IN home.html. home.html has no module boundary, so
 * anything inline is unreachable from a test harness — and this arithmetic has the
 * failure mode that never shows up as an error: an entry that still LOOKS balanced
 * while carrying the wrong amount, or a deferred carry-forward figure that drifts
 * from what actually got left out. Both render perfectly. Tools/test-oe-compose.js
 * asserts this against measured RapidReconciler_Demo1 rows.
 *
 *   compose(rows, opts) -> { lines, drTot, crTot, timingTotal, net, cfTotal, cfExcluded }
 *
 * rows  = v6ui_raccountsummary-shaped objects, ALREADY filtered to one company +
 *         period and to |OOB| >= the materiality floor (that filtering is the
 *         caller's, because the floor is a UI setting).
 * opts  = { exclCF: bool }  — exclude the carry-forward component.
 * lines = [{ acct, je, amt }] one per journal-able account, in row order. The caller
 *         turns each into the account/offset PAIR the modal and the workbook render;
 *         each pair is self-balancing, which is why drTot always equals crTot.
 *
 * THE COMPONENTS. The accountant-owned gap is carry-forward (BegVar) + transactions
 * (Variance) + manual entries (JEs). It deliberately EXCLUDES unposted / end-of-day
 * timing, which self-clears when operations posts, and CardexVar, which is an analyst
 * re-roll. Journaling the full out-of-balance while timing is present would
 * over-correct and open a new gap next period.
 *
 * WHY cfTotal IS SUMMED BEFORE THE DROP. A row whose only accountant-owned content is
 * the carry-forward has je == 0 once it's excluded, so it drops out of the entry
 * entirely. Its carry-forward is precisely what got deferred, so it has to be counted
 * before the row disappears. Measured on Demo1: Co 80002 / 2025-07-31 is three such
 * rows, and excluding the carry-forward empties the entry completely.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var DROP_UNDER = 1;   // under a dollar there is nothing worth journaling on that account
  function _n(v) { return Number(v) || 0; }
  function compose(rows, opts) {
    var exclCF = !!(opts && opts.exclCF);
    var lines = [], drTot = 0, crTot = 0, timingTotal = 0, net = 0, cfTotal = 0;
    // What the entry is MADE OF, over the rows that survived the drop. Distinct from
    // cfTotal, which counts every row: cfTotal answers "how much was deferred",
    // comp.cf answers "how much of this entry is carry-forward" and is 0 when it's
    // excluded. The AI read is grounded on comp, so it can never describe a component
    // the entry does not contain.
    var comp = { cf: 0, tx: 0, je: 0 };
    (rows || []).forEach(function (r) {
      var cf = _n(r.BegVar);
      cfTotal += cf;
      timingTotal += Math.abs(_n(r.UnpostBatch)) + Math.abs(_n(r.EndofDay));
      var je = (exclCF ? 0 : cf) + _n(r.Variance) + _n(r.JEs);
      if (Math.abs(je) < DROP_UNDER) return;
      var amt = Math.abs(je);
      // Per-line components ride along so the exported Explanation can say what drove
      // THAT account ("mostly carry forward") instead of a generic label on every row.
      lines.push({ acct: r.LongAccount == null ? '' : String(r.LongAccount), je: je, amt: amt,
                   comp: { cf: exclCF ? 0 : cf, tx: _n(r.Variance), je: _n(r.JEs) } });
      drTot += amt; crTot += amt; net += je;
      comp.cf += exclCF ? 0 : cf; comp.tx += _n(r.Variance); comp.je += _n(r.JEs);
    });
    return { lines: lines, drTot: drTot, crTot: crTot, timingTotal: timingTotal, net: net,
             cfTotal: cfTotal, cfExcluded: exclCF ? cfTotal : 0, comp: comp };
  }
  window.RRV8.oeEntry = { compose: compose, DROP_UNDER: DROP_UNDER };
})();

/*
 * RRV8.integrityCount — rows vs items for the three data-integrity reports
 * (v_integrity4_uom_conv, v_integrity5_gl_class, v_integrity7_frozen_cost).
 *
 * Home's Data Health check called `rows.length` "N items flagged"; the Reports
 * badge on inventory-asof.html called the same number "N rows in scope". Both
 * words for one figure, and only one of them can be right (UI-71).
 *
 * Measured 2026-08-09 on all three demos: rows == distinct item x branch for all
 * three reports, so nothing on screen is wrong today. It is not GUARANTEED —
 * v_integrity5_gl_class carries Location and Lot, so one item on two locations
 * with a branch/location class split is two rows for one item, and no demo has
 * that shape. This is the DAC-58 pattern in the UI: correct in the data we have,
 * unsound in the code. Count the items, say items, and carry the rows alongside.
 */
window.RRV8 = window.RRV8 || {};
window.RRV8.integrityCount = function (rows) {
  rows = rows || [];
  var seen = Object.create(null), items = 0, keyed = 0;
  rows.forEach(function (r) {
    if (!r) return;
    var it = r.ShortItem == null ? r.shortitem : r.ShortItem;
    if (it == null || String(it).trim() === '') it = (r.ItemNumber == null ? r.itemnumber : r.ItemNumber);
    var br = r.BranchPlant == null ? r.branchplant : r.BranchPlant;
    if (it == null || String(it).trim() === '') return;    // no item key on this row — cannot claim an item count for it
    keyed++;
    var k = String(it).trim() + '\x01' + String(br == null ? '' : br).trim();
    if (!seen[k]) { seen[k] = 1; items++; }
  });
  // A report whose rows carry no item key at all gets rows back as items rather
  // than a zero that would read as "nothing flagged".
  return { rows: rows.length, items: keyed ? items : rows.length };
};

/*
 * RRV8.drillReport — the permanent tie-out for count-then-drill navigation.
 *
 * Every Home card / worklist row shows a COUNT computed on one surface, then
 * links to a details page that RE-DERIVES the same slice from the same data.
 * Those two derivations are separate code paths, so they drift. This makes the
 * drift announce itself instead of hiding behind a plausible-looking grid.
 *
 * The source builds its link with `&expect=<rowCount>`; the destination calls
 * this once per drill landing, after its first render. Console only — never a
 * visible diagnostic. Cheap (one string join) and safe (never throws).
 *
 *   surface  short page name, e.g. 'transactions'
 *   applied  { dimension: value } the destination ACTUALLY filtered on
 *   ignored  [param, ...] URL params the destination read but did NOT apply
 *   expected the source's row count from ?expect= (may be null)
 *   actual   the destination's rendered row count
 */
window.RRV8.drillReport = function (o) {
  try {
    o = o || {};
    var applied = o.applied || {}, bits = [];
    for (var k in applied) {
      if (!Object.prototype.hasOwnProperty.call(applied, k)) continue;
      if (applied[k] == null || applied[k] === '') continue;
      bits.push(k + '=' + applied[k]);
    }
    var ign = (o.ignored || []).filter(Boolean);
    console.log('[drill] ' + (o.surface || '?')
      + ' | applied: ' + (bits.length ? bits.join(' ') : '(none)')
      + ' | ignored: ' + (ign.length ? ign.join(' ') : '(none)')
      + ' | rows: ' + (o.actual == null ? '?' : o.actual));
    var exp = (o.expected == null || o.expected === '') ? null : parseInt(o.expected, 10);
    if (exp != null && isFinite(exp) && o.actual != null && exp !== o.actual) {
      console.error('[drill] TIE-OUT MISMATCH on ' + (o.surface || '?')
        + ' — the card counted ' + exp + ' rows, the details grid rendered ' + o.actual
        + '. Scope filters applied: ' + (bits.length ? bits.join(' ') : '(none)') + '.');
    }
  } catch (_) { /* a diagnostic must never break the page */ }
};

/*
 * RRV8.cardStore — the card-keyed resolution store for the analyst
 * Transaction-Variance view (UI-26). ONE record per
 * (database, company, card_code, period_end) — the closed-card resolution
 * record + the convergence auto-reopen spine. Replaces the legacy per-row
 * work-note derivation FOR TX-VARIANCE (a card carries ~10 rows per company
 * per period, not thousands of row-notes, and survives B->C row churn).
 *
 * Self-contained (own fetch + JWT + RRDB.agentBase base) exactly like
 * exportName / logActivity — never throws, always resolves. Server-first with a
 * per-browser localStorage fallback (key rrv8.txvCards.<dbName>.<company>, a
 * JSON map) so the card lifecycle works with ZERO console errors before the
 * owner ships the /inventory/txv endpoints + dbo.RTxvCardResolution.
 *
 *   load(company)              -> Promise<map>  keyed "<co>|<cardCode>|<periodEnd>";
 *                                 cached per (activeDb, company); tries the agent,
 *                                 falls back to localStorage on any failure OR empty.
 *   save(record)               -> Promise       optimistic in-memory + localStorage
 *                                 mirror immediately, then POST; resolves regardless
 *                                 (server failure = localStorage-only persistence).
 *   get(company, code, period) -> record | null (SYNC; caller must load() first)
 *   forCompany(company)        -> [record, ...] all cached records for a company
 *                                 across periods (for recurrence derivation).
 *
 * record = { company, cardCode, periodEnd, status, note, sourceFix, varAmount, by, at }
 * status in { open | worked | complete | reopened }. `by` is filled server-side
 * from the JWT; the localStorage mirror stores by:'' (the browser can't attest
 * identity). periodEnd is the 10-char YYYY-MM-DD.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var _cache = {};   // "<dbName>|<company>" -> { map: { "<co>|<code>|<period>": record } }
  function _db() {
    try { return (window.RRDB && RRDB.name && RRDB.name()) || '_'; } catch (_) { return '_'; }
  }
  function _base() {
    try {
      return (window.RRDB && RRDB.agentBase && RRDB.agentBase())
        || (window.RR_CONFIG && RR_CONFIG.testAgentBase) || '';
    } catch (_) { return ''; }
  }
  function _auth(h) {
    try { var t = localStorage.getItem('rrv8.token'); if (t) h['Authorization'] = 'Bearer ' + t; } catch (_) {}
    return h;
  }
  function _p10(p) { return String(p == null ? '' : p).slice(0, 10); }
  function _key(co, code, periodEnd) { return String(co) + '|' + String(code) + '|' + _p10(periodEnd); }
  function _cacheKey(co) { return _db() + '|' + String(co); }
  function _lsKey(co) { return 'rrv8.txvCards.' + _db() + '.' + String(co); }
  function _lsRead(co) {
    try { var raw = localStorage.getItem(_lsKey(co)); return raw ? (JSON.parse(raw) || {}) : {}; }
    catch (_) { return {}; }
  }
  function _lsWrite(co, map) {
    try { localStorage.setItem(_lsKey(co), JSON.stringify(map || {})); } catch (_) {}
  }
  function _norm(rec) {
    rec = rec || {};
    return {
      company:   String(rec.company == null ? '' : rec.company),
      cardCode:  String(rec.cardCode == null ? '' : rec.cardCode),
      periodEnd: _p10(rec.periodEnd),
      status:    String(rec.status == null ? '' : rec.status),
      note:      String(rec.note == null ? '' : rec.note),
      sourceFix: rec.sourceFix == null ? '' : String(rec.sourceFix),
      varAmount: (rec.varAmount == null || rec.varAmount === '') ? null : Number(rec.varAmount),
      by:        rec.by == null ? '' : String(rec.by),
      at:        rec.at == null ? '' : String(rec.at)
    };
  }
  function _fallback(company, ck) {
    var map = {}, ls = _lsRead(company);
    for (var k in ls) if (Object.prototype.hasOwnProperty.call(ls, k)) map[k] = _norm(ls[k]);
    _cache[ck] = { map: map };
    return map;
  }
  function load(company) {
    var ck = _cacheKey(company), base = _base();
    if (!base) return Promise.resolve(_fallback(company, ck));
    var h = _auth({ 'Accept': 'application/json' });
    return fetch(base + '/inventory/txv/resolutions?company=' + encodeURIComponent(company), { headers: h })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (arr) {
        // AN EMPTY LIST IS AN ANSWER, NOT A FAILURE. This used to treat `[]` the same as
        // an unreachable agent and fall back to localStorage, which was harmless only
        // while findings could never be removed: a row that existed locally also existed
        // on the server, so resurrecting it changed nothing. UI-122 makes a row able to
        // legitimately disappear, and with the old branch the LAST discarded finding on a
        // company came back on the next machine that opened it — the server says none, the
        // mirror says one, and the mirror won. Unreachable still falls back, via the
        // .catch below; a non-array still falls back, because that is a broken response
        // rather than an empty one.
        if (!Array.isArray(arr)) return _fallback(company, ck);
        var map = {};
        arr.forEach(function (rec) {
          var n = _norm(rec);
          if (!n.company) n.company = String(company);
          map[_key(n.company, n.cardCode, n.periodEnd)] = n;
        });
        _cache[ck] = { map: map };
        _lsWrite(company, map);   // mirror server truth locally so a later offline read agrees
        return map;
      })
      .catch(function () { return _fallback(company, ck); });   // any failure -> localStorage
  }
  function get(company, cardCode, periodEnd) {
    var c = _cache[_cacheKey(company)];
    return c ? (c.map[_key(company, cardCode, periodEnd)] || null) : null;
  }
  function forCompany(company) {
    var c = _cache[_cacheKey(company)]; if (!c) return [];
    var out = [];
    for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) out.push(c.map[k]);
    return out;
  }
  function save(record) {
    var n = _norm(record);
    n.at = new Date().toISOString();   // mirror stamp; the server overwrites `by`/`at` authoritatively
    var ck = _cacheKey(n.company);
    var c = _cache[ck] || (_cache[ck] = { map: {} });
    c.map[_key(n.company, n.cardCode, n.periodEnd)] = n;   // optimistic in-memory update
    var mirror = {};                                       // mirror the whole company map to localStorage now
    for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) mirror[k] = c.map[k];
    _lsWrite(n.company, mirror);
    var base = _base();
    if (!base) return Promise.resolve(n);
    var h = _auth({ 'Content-Type': 'application/json;charset=UTF-8', 'Accept': 'application/json' });
    return fetch(base + '/inventory/txv/resolution', {
      method: 'POST', headers: h,
      body: JSON.stringify({
        company: n.company, cardCode: n.cardCode, periodEnd: n.periodEnd,
        status: n.status, note: n.note, sourceFix: n.sourceFix, varAmount: n.varAmount
      })
    }).then(function () { return n; }).catch(function () { return n; });   // localStorage already holds it
  }
  // Discard one recorded finding (UI-122). Mirrors save()'s shape: optimistic local
  // removal first, then the server, and localStorage stays the fallback truth.
  //
  // Resolves with the record it removed, or null when there was nothing to remove.
  // THAT RETURN IS THE UNDO: the caller holds a complete record and re-saves it
  // through save(), which is the same write path that created it — so undo cannot
  // drift from create the way a second, dedicated restore path would. A discard is
  // the only destructive act on this store, and a review action without an undo is a
  // one-way door (owner ruling 2026-08-13, on the period review).
  //
  // A server refusal is NOT swallowed the way save() swallows one. save() can afford
  // to: localStorage already holds the record, so the finding survives and a later
  // load re-syncs it. A discard is the opposite — swallowing the failure would leave
  // the card gone from this screen and still present for everyone else, which is the
  // silent divergence this store exists to prevent. The local record is restored and
  // the rejection is re-thrown so the caller can say so.
  function discard(company, cardCode, periodEnd) {
    var ck = _cacheKey(company), c = _cache[ck] || (_cache[ck] = { map: {} });
    var k = _key(company, cardCode, _p10(periodEnd));
    var had = c.map[k] || null;
    if (!had) return Promise.resolve(null);
    delete c.map[k];
    var mirror = {};
    for (var mk in c.map) if (Object.prototype.hasOwnProperty.call(c.map, mk)) mirror[mk] = c.map[mk];
    _lsWrite(company, mirror);
    var base = _base();
    if (!base) return Promise.resolve(had);
    var q = '?company=' + encodeURIComponent(company)
          + '&cardCode=' + encodeURIComponent(cardCode)
          + '&periodEnd=' + encodeURIComponent(_p10(periodEnd));
    return fetch(base + '/inventory/txv/resolution' + q,
                 { method: 'DELETE', headers: _auth({ 'Accept': 'application/json' }) })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return had;
      })
      .catch(function (e) {
        c.map[k] = had;                                   // put it back — the server still has it
        var back = {};
        for (var bk in c.map) if (Object.prototype.hasOwnProperty.call(c.map, bk)) back[bk] = c.map[bk];
        _lsWrite(company, back);
        throw e;
      });
  }
  window.RRV8.cardStore = { load: load, save: save, discard: discard, get: get, forCompany: forCompany, key: _key };
})();

/*
 * RRV8.beStore — the balancing-entry EXPORT + VERIFICATION store (accountant side
 * of the Audit spine). When the accountant exports a period-end balancing entry,
 * RR mints a short token, hands them a ready-to-paste JDE Explanation carrying it,
 * and records the export here as UNVERIFIED. On a later load the agent matches the
 * token against F0911.GLEXA (the posted JE's Explanation) and flips the record to
 * VERIFIED with the matched batch/amount — turning a self-reported "I posted it"
 * into evidence reconciled against the system of record (JDE).
 *
 * Same self-contained, server-first + localStorage-fallback shape as cardStore, so
 * the token flow works with ZERO console errors before the owner ships the
 * /inventory/balancing-entry endpoints + dbo.RBalancingEntryExport. Grain: ONE
 * record per token (a company+period may have more than one export over time).
 *
 *   load(company)       -> Promise<map>  keyed by token; cached per (activeDb, company)
 *   save(record)        -> Promise       optimistic localStorage mirror, then POST
 *   forCompany(company) -> [record, ...] all cached records for a company
 *
 * record = { company, periodEnd, token, amount, clearingAccount, entryType, status,
 *            matchedBatch, matchedAmount, by, at }
 * entryType in { balancing | adjusting } — which entry path minted it (Audit title).
 * status in { unverified | verified }. Verification (matchedBatch/Amount, verified)
 * is server-owned — the localStorage mirror can only ever hold 'unverified'.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var _cache = {};   // "<dbName>|<company>" -> { map: { "<token>": record } }
  function _db() { try { return (window.RRDB && RRDB.name && RRDB.name()) || '_'; } catch (_) { return '_'; } }
  function _base() {
    try { return (window.RRDB && RRDB.agentBase && RRDB.agentBase()) || (window.RR_CONFIG && RR_CONFIG.testAgentBase) || ''; }
    catch (_) { return ''; }
  }
  function _auth(h) { try { var t = localStorage.getItem('rrv8.token'); if (t) h['Authorization'] = 'Bearer ' + t; } catch (_) {} return h; }
  function _p10(p) { return String(p == null ? '' : p).slice(0, 10); }
  function _cacheKey(co) { return _db() + '|' + String(co); }
  function _lsKey(co) { return 'rrv8.beExports.' + _db() + '.' + String(co); }
  function _lsRead(co) { try { var raw = localStorage.getItem(_lsKey(co)); return raw ? (JSON.parse(raw) || {}) : {}; } catch (_) { return {}; } }
  function _lsWrite(co, map) { try { localStorage.setItem(_lsKey(co), JSON.stringify(map || {})); } catch (_) {} }
  function _norm(rec) {
    rec = rec || {};
    return {
      company:         String(rec.company == null ? '' : rec.company),
      periodEnd:       _p10(rec.periodEnd),
      token:           String(rec.token == null ? '' : rec.token),
      amount:          (rec.amount == null || rec.amount === '') ? null : Number(rec.amount),
      clearingAccount: rec.clearingAccount == null ? '' : String(rec.clearingAccount),
      // Which entry path minted it: 'balancing' (Overview clearing-account entry) or
      // 'adjusting' (Accounts deep-dive per-account offset entry). Drives the Audit
      // card title. Defaults to 'balancing' so pre-tag records read as before.
      entryType:       String(rec.entryType == null || rec.entryType === '' ? 'balancing' : rec.entryType),
      status:          String(rec.status == null ? 'unverified' : rec.status),
      matchedBatch:    rec.matchedBatch == null ? '' : String(rec.matchedBatch),
      matchedAmount:   (rec.matchedAmount == null || rec.matchedAmount === '') ? null : Number(rec.matchedAmount),
      by:              rec.by == null ? '' : String(rec.by),
      at:              rec.at == null ? '' : String(rec.at)
    };
  }
  function _fallback(company, ck) {
    var map = {}, ls = _lsRead(company);
    for (var k in ls) if (Object.prototype.hasOwnProperty.call(ls, k)) map[k] = _norm(ls[k]);
    _cache[ck] = { map: map };
    return map;
  }
  function load(company) {
    var ck = _cacheKey(company), base = _base();
    if (!base) return Promise.resolve(_fallback(company, ck));
    var h = _auth({ 'Accept': 'application/json' });
    return fetch(base + '/inventory/balancing-entry/exports?company=' + encodeURIComponent(company), { headers: h })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (arr) {
        if (!Array.isArray(arr)) return _fallback(company, ck);
        var map = {}, ls = _lsRead(company);
        // Server is authoritative for verification; keep any local-only records the
        // server hasn't ingested yet (offline export before the endpoint shipped).
        for (var lk in ls) if (Object.prototype.hasOwnProperty.call(ls, lk)) map[lk] = _norm(ls[lk]);
        arr.forEach(function (rec) { var n = _norm(rec); if (!n.company) n.company = String(company); if (n.token) map[n.token] = n; });
        _cache[ck] = { map: map };
        _lsWrite(company, map);
        return map;
      })
      .catch(function () { return _fallback(company, ck); });
  }
  function forCompany(company) {
    var c = _cache[_cacheKey(company)]; if (!c) return [];
    var out = []; for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) out.push(c.map[k]);
    return out;
  }
  function save(record) {
    var n = _norm(record);
    if (!n.at) n.at = new Date().toISOString();
    if (!n.status) n.status = 'unverified';
    var ck = _cacheKey(n.company);
    var c = _cache[ck] || (_cache[ck] = { map: {} });
    if (n.token) c.map[n.token] = n;   // optimistic
    var mirror = {}; for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) mirror[k] = c.map[k];
    _lsWrite(n.company, mirror);
    var base = _base();
    if (!base) return Promise.resolve(n);
    var h = _auth({ 'Content-Type': 'application/json;charset=UTF-8', 'Accept': 'application/json' });
    return fetch(base + '/inventory/balancing-entry/export', {
      method: 'POST', headers: h,
      body: JSON.stringify({ company: n.company, periodEnd: n.periodEnd, token: n.token, amount: n.amount, clearingAccount: n.clearingAccount, entryType: n.entryType })
    }).then(function () { return n; }).catch(function () { return n; });
  }
  window.RRV8.beStore = { load: load, save: save, forCompany: forCompany };
})();

/*
 * RRV8.dispoStore — the accountant per-company period DISPOSITION store (UI-27 /
 * UI-34). ONE record per (database, company, period). When the accountant marks a
 * company complete for the period, the disposition REASON
 * (immaterial | corrected | analyst | timing) is recorded here — the "record the
 * decision" half of the Audit spine, and the shared signal the analyst view reads.
 *
 * Same self-contained, server-first + localStorage-fallback shape as cardStore.
 *
 *   load(company)         -> Promise<map>  keyed "<co>|<period>"; cached per (db, company)
 *   get(company, period)  -> record | null (SYNC; caller must load() first)
 *   forCompany(company)   -> [record, ...]
 *   save(record)          -> Promise       optimistic mirror, then POST /inventory/disposition
 *   clear(company, period)-> Promise       optimistic remove, then POST .../reopen
 *
 * record = { company, periodEnd, reason, by, at }. `by`/`at` are server-owned; the
 * localStorage mirror stores by:'' (the browser can't attest identity).
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var _cache = {};   // "<dbName>|<company>" -> { map: { "<co>|<period>": record } }
  function _db() { try { return (window.RRDB && RRDB.name && RRDB.name()) || '_'; } catch (_) { return '_'; } }
  function _base() {
    try { return (window.RRDB && RRDB.agentBase && RRDB.agentBase()) || (window.RR_CONFIG && RR_CONFIG.testAgentBase) || ''; }
    catch (_) { return ''; }
  }
  function _auth(h) { try { var t = localStorage.getItem('rrv8.token'); if (t) h['Authorization'] = 'Bearer ' + t; } catch (_) {} return h; }
  function _p10(p) { return String(p == null ? '' : p).slice(0, 10); }
  function _key(co, period) { return String(co) + '|' + _p10(period); }
  function _cacheKey(co) { return _db() + '|' + String(co); }
  function _lsKey(co) { return 'rrv8.dispos.' + _db() + '.' + String(co); }
  function _lsRead(co) { try { var raw = localStorage.getItem(_lsKey(co)); return raw ? (JSON.parse(raw) || {}) : {}; } catch (_) { return {}; } }
  function _lsWrite(co, map) { try { localStorage.setItem(_lsKey(co), JSON.stringify(map || {})); } catch (_) {} }
  function _norm(rec) {
    rec = rec || {};
    return {
      company:   String(rec.company == null ? '' : rec.company),
      periodEnd: _p10(rec.periodEnd),
      reason:    String(rec.reason == null ? '' : rec.reason),
      by:        rec.by == null ? '' : String(rec.by),
      at:        rec.at == null ? '' : String(rec.at)
    };
  }
  function _fallback(company, ck) {
    var map = {}, ls = _lsRead(company);
    for (var k in ls) if (Object.prototype.hasOwnProperty.call(ls, k)) map[k] = _norm(ls[k]);
    _cache[ck] = { map: map };
    return map;
  }
  function load(company) {
    var ck = _cacheKey(company), base = _base();
    if (!base) return Promise.resolve(_fallback(company, ck));
    var h = _auth({ 'Accept': 'application/json' });
    return fetch(base + '/inventory/disposition/list?company=' + encodeURIComponent(company), { headers: h })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (arr) {
        if (!Array.isArray(arr)) return _fallback(company, ck);
        var map = {};
        arr.forEach(function (rec) { var n = _norm(rec); if (!n.company) n.company = String(company); map[_key(n.company, n.periodEnd)] = n; });
        _cache[ck] = { map: map };
        _lsWrite(company, map);   // mirror server truth (authoritative — replaces local)
        return map;
      })
      .catch(function () { return _fallback(company, ck); });
  }
  function get(company, period) {
    var c = _cache[_cacheKey(company)];
    return c ? (c.map[_key(company, period)] || null) : null;
  }
  function forCompany(company) {
    var c = _cache[_cacheKey(company)]; if (!c) return [];
    var out = []; for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) out.push(c.map[k]);
    return out;
  }
  function save(record) {
    var n = _norm(record);
    if (!n.at) n.at = new Date().toISOString();
    var ck = _cacheKey(n.company), c = _cache[ck] || (_cache[ck] = { map: {} });
    c.map[_key(n.company, n.periodEnd)] = n;   // optimistic
    var mirror = {}; for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) mirror[k] = c.map[k];
    _lsWrite(n.company, mirror);
    var base = _base();
    if (!base) return Promise.resolve(n);
    var h = _auth({ 'Content-Type': 'application/json;charset=UTF-8', 'Accept': 'application/json' });
    return fetch(base + '/inventory/disposition', {
      method: 'POST', headers: h,
      body: JSON.stringify({ company: n.company, periodEnd: n.periodEnd, reason: n.reason })
    }).then(function () { return n; }).catch(function () { return n; });
  }
  function clear(company, period) {
    var ck = _cacheKey(company), c = _cache[ck] || (_cache[ck] = { map: {} });
    delete c.map[_key(company, period)];   // optimistic remove
    var mirror = {}; for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) mirror[k] = c.map[k];
    _lsWrite(company, mirror);
    var base = _base();
    if (!base) return Promise.resolve();
    var h = _auth({ 'Content-Type': 'application/json;charset=UTF-8', 'Accept': 'application/json' });
    return fetch(base + '/inventory/disposition/reopen', {
      method: 'POST', headers: h,
      body: JSON.stringify({ company: String(company), periodEnd: _p10(period) })
    }).then(function () {}).catch(function () {});
  }
  window.RRV8.dispoStore = { load: load, get: get, forCompany: forCompany, save: save, clear: clear, key: _key };
})();

/*
 * RRV8.offsetStore — the accountant's standing per-line OFFSET accounts (UI-162).
 * ONE record per (database, company, inventory GL account). Home's balancing entry
 * debits the inventory account and credits the offset; Journal Entry Complete stays
 * disabled until every row in the entry carries a real account.
 *
 * ⚠ THIS STORE HAS NO localStorage FALLBACK, AND THAT IS THE DESIGN, not an
 * omission. Every other store in this file mirrors to localStorage and falls back
 * to it silently when the agent is unreachable. That shape is wrong here for two
 * reasons, and both of them are the point of the row that asked for this:
 *
 *   1. The mapping is shared accounting configuration. A second accountant on
 *      another machine must see the same offsets. A browser-local mirror looks
 *      identical on screen to the shared mapping and is not it.
 *   2. A pre-filled offset that came from THIS browser is exactly the value that
 *      reads as "one the accountant just chose". A wrong offset still balances, so
 *      no tie-out anywhere catches it — the only defence is that a pre-filled value
 *      always carries provenance, and a browser cannot attest to any.
 *
 * So when the agent cannot be reached, this store stays EMPTY and says why. The
 * grid then pre-fills nothing and shows the reason, which is the honest failure:
 * the accountant types the offsets, exactly as they did before this existed.
 *
 *   load()                     -> Promise<map>  keyed "<co>|<acct>"; cached per db
 *   get(co, acct)              -> record | null (SYNC; caller must load() first)
 *   all()                      -> [record, ...] every mapping for the active db
 *   save(co, acct, offset)     -> Promise<record>  PUT; rejects on a bad account
 *   clear(co, acct)            -> Promise        DELETE
 *   ready()                    -> true once a load has SUCCEEDED for this db
 *   problem()                  -> '' or why the last load failed
 *
 * record = { company, account, offsetAccount, offsetName, exists, updatedBy,
 * updatedDate }. Everything but company/account/offsetAccount is server-owned.
 * `exists:false` means the stored offset no longer resolves in the account master
 * for that company — the server re-checks on every read precisely because the chart
 * of accounts moves underneath a stored mapping and nothing else would ever notice.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var _cache = {};   // dbName -> { map: {...}, ok: bool, why: '' }
  function _db() { try { return (window.RRDB && RRDB.name && RRDB.name()) || '_'; } catch (_) { return '_'; } }
  function _base() {
    try { return (window.RRDB && RRDB.agentBase && RRDB.agentBase()) || (window.RR_CONFIG && RR_CONFIG.testAgentBase) || ''; }
    catch (_) { return ''; }
  }
  function _auth(h) { try { var t = localStorage.getItem('rrv8.token'); if (t) h['Authorization'] = 'Bearer ' + t; } catch (_) {} return h; }
  function _key(co, acct) { return String(co == null ? '' : co).trim() + '|' + String(acct == null ? '' : acct).trim(); }
  function _slot() { var d = _db(); return _cache[d] || (_cache[d] = { map: {}, ok: false, why: '' }); }
  function _norm(rec) {
    rec = rec || {};
    return {
      company:       String(rec.company == null ? '' : rec.company).trim(),
      account:       String(rec.account == null ? '' : rec.account).trim(),
      offsetAccount: String(rec.offsetAccount == null ? '' : rec.offsetAccount).trim(),
      offsetName:    rec.offsetName == null ? '' : String(rec.offsetName),
      // Absent `exists` means an older agent that does not run the check. Treat it
      // as UNKNOWN-but-not-verified rather than true: claiming an account was
      // validated when nothing validated it is the failure this field exists to
      // prevent. The UI shows an unverified value differently from a checked one.
      exists:        rec.exists === true,
      checked:       typeof rec.exists === 'boolean',
      updatedBy:     rec.updatedBy == null ? '' : String(rec.updatedBy),
      updatedDate:   rec.updatedDate == null ? '' : String(rec.updatedDate)
    };
  }
  function load() {
    var slot = _slot(), base = _base();
    if (!base) { slot.map = {}; slot.ok = false; slot.why = 'no agent configured for this database'; return Promise.resolve({}); }
    return fetch(base + '/inventory/gl-offset-account', { headers: _auth({ 'Accept': 'application/json' }) })
      .then(function (r) {
        if (!r.ok) throw new Error('the service answered ' + r.status);
        return r.json();
      })
      .then(function (j) {
        var arr = j && Array.isArray(j.data) ? j.data : null;
        if (!arr) throw new Error('the service returned an unexpected shape');
        var map = {};
        arr.forEach(function (rec) { var n = _norm(rec); if (n.company && n.account) map[_key(n.company, n.account)] = n; });
        slot.map = map; slot.ok = true; slot.why = '';
        return map;
      })
      .catch(function (e) {
        // No fallback, and no pretending. An empty map with a reason is the only
        // honest answer: the caller must not pre-fill anything it cannot attribute.
        slot.map = {}; slot.ok = false;
        slot.why = (e && e.message) ? e.message : 'the saved offset accounts could not be loaded';
        return {};
      });
  }
  function get(co, acct) { var s = _cache[_db()]; return s ? (s.map[_key(co, acct)] || null) : null; }
  function all() {
    var s = _cache[_db()]; if (!s) return [];
    var out = []; for (var k in s.map) if (Object.prototype.hasOwnProperty.call(s.map, k)) out.push(s.map[k]);
    return out;
  }
  function ready() { var s = _cache[_db()]; return !!(s && s.ok); }
  function problem() { var s = _cache[_db()]; return s ? (s.why || '') : ''; }
  function save(co, acct, offset) {
    var base = _base();
    if (!base) return Promise.reject(new Error('no agent configured for this database'));
    var h = _auth({ 'Content-Type': 'application/json;charset=UTF-8', 'Accept': 'application/json' });
    return fetch(base + '/inventory/gl-offset-account', {
      method: 'PUT', headers: h,
      body: JSON.stringify({ company: String(co).trim(), account: String(acct).trim(), offsetAccount: String(offset).trim() })
    }).then(function (r) {
      // The 400 body carries WHICH account did not resolve. Surfacing the server's
      // sentence beats a generic "could not save" — the accountant needs to know it
      // was rejected as a non-existent account, not as a network problem.
      if (!r.ok) return r.text().then(function (t) { throw new Error(_reason(t, r.status)); });
      return r.json();
    }).then(function (rec) {
      var n = _norm(rec); var s = _slot();
      if (n.company && n.account) s.map[_key(n.company, n.account)] = n;
      return n;
    });
  }
  function clear(co, acct) {
    var base = _base();
    if (!base) return Promise.reject(new Error('no agent configured for this database'));
    var q = '?company=' + encodeURIComponent(String(co).trim()) + '&account=' + encodeURIComponent(String(acct).trim());
    return fetch(base + '/inventory/gl-offset-account' + q, { method: 'DELETE', headers: _auth({ 'Accept': 'application/json' }) })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error(_reason(t, r.status)); });
        var s = _slot(); delete s.map[_key(co, acct)];
      });
  }
  function _reason(body, status) {
    try {
      var j = JSON.parse(body);
      if (j && j.message) return String(j.message);
      if (j && j.error) return String(j.error);
    } catch (_) {}
    return 'the service answered ' + status;
  }
  // A database switch must drop the prior install's mapping outright. Two installs
  // routinely carry the same company number, so a surviving cache would pre-fill
  // database A's offset account into database B's journal entry.
  function reset() { _cache = {}; }
  window.RRV8.offsetStore = { load: load, get: get, all: all, save: save, clear: clear, ready: ready, problem: problem, reset: reset, key: _key };
})();

/*
 * RRV8.analystReviewStore — the per-company period REVIEW store for the analyst
 * Transaction-Variance view (Pass 1). ONE record per (database, company, period).
 * When the analyst finishes a period — some sources fixed, the rest let to ride —
 * they mark the period reviewed; the tally (how many card slices they fixed at the
 * source vs. let ride) is recorded here. This is the analyst counterpart to the
 * accountant dispoStore: the "I've looked, here's what I did" signal that Pass 2
 * will surface into the Audit Center.
 *
 * Same self-contained, server-first + localStorage-fallback shape as cardStore /
 * dispoStore. GET / POST / DELETE /inventory/txv/period-review and
 * dbo.RTxvPeriodReview now exist (TxvPeriodReviewController), so the server is the
 * store and localStorage is the mirror it was always described as.
 *
 * ⚠ The fallback is silent BY DESIGN, and that cuts both ways now. Every request
 * here swallows its failure, which was correct while nothing answered these routes
 * and is a liability now that something does: if the table is not deployed to a
 * database, or a path or parameter drifts, the page keeps working against the mirror
 * and NOTHING reports it. A review that looks saved may be browser-only. When
 * changing this store, change the controller in the same pass.
 *
 *   load(company)         -> Promise<map>  keyed "<co>|<period>"; cached per (db, company)
 *   get(company, period)  -> record | null (SYNC; caller must load() first)
 *   forCompany(company)   -> [record, ...]
 *   save(record)          -> Promise       optimistic mirror, then POST
 *
 * record = { company, periodEnd, sourcesFixed, letRide, note, by, at }. `by`/`at`
 * are server-owned; the localStorage mirror stores by:'' (the browser can't attest
 * identity). sourcesFixed / letRide are integer card counts.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var _cache = {};   // "<dbName>|<company>" -> { map: { "<co>|<period>": record } }
  function _db() { try { return (window.RRDB && RRDB.name && RRDB.name()) || '_'; } catch (_) { return '_'; } }
  function _base() {
    try { return (window.RRDB && RRDB.agentBase && RRDB.agentBase()) || (window.RR_CONFIG && RR_CONFIG.testAgentBase) || ''; }
    catch (_) { return ''; }
  }
  function _auth(h) { try { var t = localStorage.getItem('rrv8.token'); if (t) h['Authorization'] = 'Bearer ' + t; } catch (_) {} return h; }
  function _p10(p) { return String(p == null ? '' : p).slice(0, 10); }
  function _int(v) { var n = parseInt(v, 10); return isFinite(n) ? n : 0; }
  function _key(co, period) { return String(co) + '|' + _p10(period); }
  function _cacheKey(co) { return _db() + '|' + String(co); }
  function _lsKey(co) { return 'rrv8.analystReview.' + _db() + '.' + String(co); }
  function _lsRead(co) { try { var raw = localStorage.getItem(_lsKey(co)); return raw ? (JSON.parse(raw) || {}) : {}; } catch (_) { return {}; } }
  function _lsWrite(co, map) { try { localStorage.setItem(_lsKey(co), JSON.stringify(map || {})); } catch (_) {} }
  function _norm(rec) {
    rec = rec || {};
    return {
      company:      String(rec.company == null ? '' : rec.company),
      periodEnd:    _p10(rec.periodEnd),
      sourcesFixed: _int(rec.sourcesFixed),
      letRide:      _int(rec.letRide),
      note:         String(rec.note == null ? '' : rec.note),
      by:           rec.by == null ? '' : String(rec.by),
      at:           rec.at == null ? '' : String(rec.at)
    };
  }
  function _fallback(company, ck) {
    var map = {}, ls = _lsRead(company);
    for (var k in ls) if (Object.prototype.hasOwnProperty.call(ls, k)) map[k] = _norm(ls[k]);
    _cache[ck] = { map: map };
    return map;
  }
  function load(company) {
    var ck = _cacheKey(company), base = _base();
    if (!base) return Promise.resolve(_fallback(company, ck));
    var h = _auth({ 'Accept': 'application/json' });
    return fetch(base + '/inventory/txv/period-review?company=' + encodeURIComponent(company), { headers: h })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (arr) {
        if (!Array.isArray(arr)) return _fallback(company, ck);
        var map = {};
        arr.forEach(function (rec) { var n = _norm(rec); if (!n.company) n.company = String(company); map[_key(n.company, n.periodEnd)] = n; });
        _cache[ck] = { map: map };
        _lsWrite(company, map);   // mirror server truth (authoritative — replaces local)
        return map;
      })
      .catch(function () { return _fallback(company, ck); });
  }
  function get(company, period) {
    var c = _cache[_cacheKey(company)];
    return c ? (c.map[_key(company, period)] || null) : null;
  }
  function forCompany(company) {
    var c = _cache[_cacheKey(company)]; if (!c) return [];
    var out = []; for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) out.push(c.map[k]);
    return out;
  }
  function save(record) {
    var n = _norm(record);
    if (!n.at) n.at = new Date().toISOString();
    var ck = _cacheKey(n.company), c = _cache[ck] || (_cache[ck] = { map: {} });
    c.map[_key(n.company, n.periodEnd)] = n;   // optimistic
    var mirror = {}; for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) mirror[k] = c.map[k];
    _lsWrite(n.company, mirror);
    var base = _base();
    if (!base) return Promise.resolve(n);
    var h = _auth({ 'Content-Type': 'application/json;charset=UTF-8', 'Accept': 'application/json' });
    return fetch(base + '/inventory/txv/period-review', {
      method: 'POST', headers: h,
      body: JSON.stringify({ company: n.company, periodEnd: n.periodEnd, sourcesFixed: n.sourcesFixed, letRide: n.letRide, note: n.note })
    }).then(function () { return n; }).catch(function () { return n; });
  }
  /* remove(company, period) -> Promise — UNDO an INERT period review.
   *
   * Why this exists: marking a period reviewed was a ONE-WAY DOOR. `save` had no
   * counterpart, and home.html replaces the "Mark period reviewed" button with a
   * static chip once a record exists, so a mis-click could not be undone from the
   * UI at all (owner, 2026-08-10).
   *
   * ⚠ INERT REVIEWS ONLY, and the CALLER enforces that — this function cannot see
   * whether anything downstream acted on the close. A review is inert when no card
   * was handed off and no corrective adjustment was recorded for the period. Once
   * either happened, someone downstream saw the close, and reversing it needs an
   * ATTRIBUTED entry in the Audit Center rather than a silent delete. That trail
   * cannot be built here: `by`/`at` are server-owned and the browser cannot attest
   * identity, so a client-side "undo" of a consequential review would look like a
   * trail while carrying no author. WORKLIST UI-89 holds that half; do not widen
   * this one to cover it.
   *
   * Same optimistic mirror-then-server shape as save(). DELETE
   * /inventory/txv/period-review IS shipped now and returns { ok, reopened }, where
   * reopened:false means there was no row to remove. This function still ignores the
   * response, which is correct for the INERT case it serves: the local delete has
   * already happened and there is nothing for the analyst to decide. An ATTRIBUTED
   * reopen must NOT reuse this path — it needs the response, needs to report failure,
   * and needs to show who reversed it. UI-89 holds that half; the server side it was
   * waiting on now exists.
   */
  function remove(company, period) {
    var co = String(company == null ? '' : company), per = _p10(period);
    var k = _key(co, per), ck = _cacheKey(co);
    // Optimistic: drop it from the in-memory cache and the localStorage mirror first,
    // so the panel repaints even with no server behind it.
    try { if (_cache[ck] && _cache[ck].map) delete _cache[ck].map[k]; } catch (_) {}
    var ls = _lsRead(co); if (ls && ls[k]) { delete ls[k]; _lsWrite(co, ls); }
    var base = _base();
    if (!base) return Promise.resolve();
    return fetch(base + '/inventory/txv/period-review?company=' + encodeURIComponent(co)
                 + '&period=' + encodeURIComponent(per),
                 { method: 'DELETE', headers: _auth({ 'Accept': 'application/json' }) })
      .then(function () {}, function () {});   // inert path: outcome is not actionable
  }
  /* reopen(company, period) -> Promise<{ok, reopened}>, REJECTS on failure.
   *
   * The ATTRIBUTED counterpart to remove(). Everything remove() does silently and
   * optimistically, this does loudly and server-first, because the two serve
   * opposite cases:
   *
   *   remove()  an INERT review. Nothing downstream saw the close, so the local
   *             delete is the whole story and a failed request changes no
   *             decision. Silence is correct.
   *   reopen()  a CONSEQUENTIAL review. Work already left the period. The analyst
   *             is reversing something another person acted on, so they have to
   *             learn whether it actually reversed, and the caller has to be able
   *             to abandon the attempt.
   *
   * Server FIRST, with no optimistic local delete. An optimistic drop here would
   * repaint the period as un-reviewed while the server still holds the review —
   * so the analyst would believe they had reopened it, the next load() would put
   * it back, and the audit record would describe a reversal that never happened.
   * The mirror is only updated once the server confirms.
   *
   * `reopened:false` is NOT an error: it means the row was already gone. The
   * caller should say so rather than claim a reversal.
   */
  function reopen(company, period) {
    var co = String(company == null ? '' : company), per = _p10(period);
    var base = _base();
    if (!base) {
      return Promise.reject(new Error('no Services connection, so the review could not be reopened on the server'));
    }
    return fetch(base + '/inventory/txv/period-review?company=' + encodeURIComponent(co)
                 + '&period=' + encodeURIComponent(per),
                 { method: 'DELETE', headers: _auth({ 'Accept': 'application/json' }) })
      .then(function (r) {
        if (!r.ok) {
          throw new Error(r.status === 401 || r.status === 403
            ? 'your session is not authorized to reopen this period'
            : 'the server refused the reopen (HTTP ' + r.status + ')');
        }
        return r.json().catch(function () { return { ok: true, reopened: true }; });
      })
      .then(function (body) {
        // Server confirmed. NOW drop the local copies so the panel and the mirror
        // agree with it.
        var k = _key(co, per), ck = _cacheKey(co);
        try { if (_cache[ck] && _cache[ck].map) delete _cache[ck].map[k]; } catch (_) {}
        var ls = _lsRead(co); if (ls && ls[k]) { delete ls[k]; _lsWrite(co, ls); }
        return { ok: true, reopened: !!(body && body.reopened) };
      });
  }
  window.RRV8.analystReviewStore = { load: load, get: get, forCompany: forCompany, save: save, remove: remove, reopen: reopen, key: _key };
})();

/*
 * RRDEMO — staged, non-production sample data for the demo. Callers gate on
 * RR_CONFIG.mode !== 'prod', so production always renders live data; this only
 * surfaces in demo/staging. Timestamps are relative to page load so the feed
 * always reads "recent". No customer identifiers — generic counts/dates only.
 */
window.RRDEMO = window.RRDEMO || {};
// A realistic Application Activity Log (newest first) shared by the Home card
// mini-feed and the full Activity Log page, so the two always agree.
window.RRDEMO.activityLog = function () {
  var now = Date.now(), M = 60000, H = 3600000, D = 86400000;
  function at(ago) { return new Date(now - ago).toISOString(); }
  return [
    { at: at(2 * H),               event: 'Report engine started',  detail: 'Service resumed after the nightly maintenance window',                by: 'System' },
    { at: at(6 * H),               event: 'Data refresh completed', detail: 'Scheduled JDE import finished — 1,284,102 rows across 3 companies',    by: 'Scheduler' },
    { at: at(6 * H + 52 * M),      event: 'Data refresh started',   detail: 'Nightly scheduled import from JD Edwards began',                       by: 'Scheduler' },
    { at: at(20 * H),              event: 'Reconciliation reviewed',detail: 'Period 2026-06 inventory reconciliation opened and reviewed',          by: 'Administrator' },
    { at: at(1 * D + 2 * H),       event: 'Cardex reloaded',        detail: 'Perpetual cardex rebuilt from 2026-05-01',                             by: 'Administrator' },
    { at: at(1 * D + 3 * H),       event: 'GL reloaded',            detail: 'GL roll-forward reloaded from 2026-04-01 to clear a balance break',    by: 'Administrator' },
    { at: at(1 * D + 4 * H),       event: 'User signed in',         detail: 'Administrator session started',                                        by: 'Administrator' },
    { at: at(2 * D + 1 * H),       event: 'Access review completed',detail: 'Team access reviewed and confirmed — next review Jul 27, 2026',        by: 'Administrator' },
    { at: at(2 * D + 5 * H),       event: 'User added',             detail: 'New team member granted the Accountant role',                          by: 'Administrator' },
    { at: at(3 * D),               event: 'Password policy updated',detail: 'Complex-password requirement enabled for 2 companies',                 by: 'Administrator' },
    { at: at(3 * D + 6 * H),       event: 'Report engine started',  detail: 'Service started after an application update',                          by: 'System' },
    { at: at(3 * D + 6 * H + 40 * M), event: 'Data refresh completed', detail: 'Scheduled JDE import finished — 1,190,447 rows across 3 companies', by: 'Scheduler' },
    { at: at(4 * D + 3 * H),       event: 'Fiscal calendar checked',detail: 'No period-end date changes detected',                                 by: 'Scheduler' },
    { at: at(5 * D + 2 * H),       event: 'Purge completed',        detail: 'Removed data older than the 24-month retention window',                by: 'Scheduler' },
    { at: at(6 * D + 5 * H),       event: 'Report engine started',  detail: 'Initial service start',                                                by: 'System' }
  ];
};
