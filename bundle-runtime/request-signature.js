/*
 * request-signature.js  -- the SHARED request-signature function.
 *
 * This is the single source of truth for turning a network request into a
 * stable string key. The CAPTURE side (publish/capture/record-shim.js) and the
 * REPLAY side (bundle-runtime/replay-shim.js) both load THIS FILE and call
 * DemoSig.signature(...). Because the exact same code computes the key on both
 * sides, a key written during capture is guaranteed to match a lookup during
 * replay. Never fork this logic into either shim.
 *
 * Vanilla ES5. No build step. Attaches window.DemoSig. Also exports under
 * CommonJS if a module system happens to be present (harmless in the browser).
 *
 * ---------------------------------------------------------------------------
 * SIGNATURE DESIGN (and why)
 * ---------------------------------------------------------------------------
 * signature = METHOD SP path [ "?" sortedQuery ] [ " #" bodyHash ]
 *
 *   METHOD      Upper-cased HTTP verb (GET, POST, ...).
 *
 *   path        The URL PATHNAME only -- scheme, host and port are dropped.
 *               The product resolves the same logical call to several different
 *               origins at runtime (VALC on :8080, the per-DB Services agent on
 *               :34537 or an external db.ip, the AI gateway on VALC). Those
 *               origins differ between the capture box and any replay machine,
 *               and even between two DBs on the same box. Keying on the path
 *               alone makes the recording host-independent, which is exactly
 *               what a portable, offline bundle needs. The product's paths do
 *               not collide across services (/api/v1/... vs /inventory/... vs
 *               /admin/... vs /poll), so dropping the origin loses no meaning.
 *
 *   sortedQuery Query parameters, parsed and re-serialized sorted by name then
 *               value. Order-independent so ?a=1&b=2 and ?b=2&a=1 match. Query
 *               params DO vary the response (e.g. ?company=..., ?database=...)
 *               so they belong in the key. The product does not add cache-buster
 *               params (it uses cache:'no-store'), so the query is stable.
 *
 *   bodyHash    Present only for methods that carry a body (everything except
 *               GET/HEAD). It is an FNV-1a 32-bit hash (8 hex chars) of the
 *               CANONICALIZED body: objects have their keys sorted recursively
 *               before stringify, so field order never changes the key.
 *
 *               WHY HASH THE WHOLE CANONICAL BODY. The task asks for "a stable
 *               hash of the body fields that actually vary the response." I read
 *               every real POST body in the product (rrFetch opts.body,
 *               agentFetch {report:...}, aiExplain {system,prompt,level}, the
 *               reconciliation/disposition/txv writes). Findings:
 *                 - Every field present in these bodies is response-determining
 *                   (the report name, the company, the period, the item list,
 *                   the AI prompt/level, the write payload). None is decorative.
 *                 - None is VOLATILE: there are no client timestamps, nonces,
 *                   request IDs or random correlation fields in any body. The
 *                   only per-session-varying credential (the JWT) travels in the
 *                   Authorization HEADER, not the body.
 *               So the honest, lowest-surprise choice is to hash the entire
 *               canonical body. A hand-picked field subset would be a second
 *               thing to maintain that silently rots when a new field is added.
 *
 *   Headers are deliberately NOT part of the signature. The captured demo is a
 *   single session against a fixed set of demo DBs; the response depends on the
 *   path + query + body, not on which bearer token was attached. Including the
 *   Authorization header would make every key session-specific and break replay
 *   on a different machine.
 *
 *   IF A VOLATILE BODY FIELD IS EVER INTRODUCED (say a client-sent requestId),
 *   add it to STRIP_FIELDS below. Those keys are removed from the body before
 *   canonicalization on BOTH sides, so capture and replay stay in lock-step.
 */
(function (root) {
  'use strict';

  // Body field names to drop before hashing (volatile / non-response-varying).
  // Empty today by design -- see the header note. Add here if the product later
  // starts sending a nonce/timestamp/requestId in a body.
  var STRIP_FIELDS = {};

  // ---- URL parsing -------------------------------------------------------
  // Accepts absolute ("http://h:port/p?q"), protocol-relative ("//h/p") and
  // relative ("/p?q", "p?q") URLs. Returns { path: string, query: string }.
  function splitUrl(url) {
    url = String(url == null ? '' : url);
    var path = url, query = '';
    var hash = path.indexOf('#');
    if (hash >= 0) path = path.slice(0, hash);          // strip fragment
    var q = path.indexOf('?');
    if (q >= 0) { query = path.slice(q + 1); path = path.slice(0, q); }

    // Strip scheme + authority if present.
    var m = path.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\/]*(\/.*)?$/); // scheme://host[/path]
    if (m) {
      path = m[1] || '/';
    } else if (path.slice(0, 2) === '//') {              // protocol-relative //host/path
      var rest = path.slice(2);
      var slash = rest.indexOf('/');
      path = slash >= 0 ? rest.slice(slash) : '/';
    }
    if (path.charAt(0) !== '/') path = '/' + path;       // normalize relative
    // Collapse duplicate slashes and drop a single trailing slash (not the root)
    path = path.replace(/\/{2,}/g, '/');
    if (path.length > 1 && path.charAt(path.length - 1) === '/') path = path.slice(0, -1);
    return { path: path, query: query };
  }

  function sortQuery(query) {
    if (!query) return '';
    var pairs = query.split('&');
    var out = [];
    for (var i = 0; i < pairs.length; i++) {
      if (pairs[i] === '') continue;
      var eq = pairs[i].indexOf('=');
      var k = eq >= 0 ? pairs[i].slice(0, eq) : pairs[i];
      var v = eq >= 0 ? pairs[i].slice(eq + 1) : '';
      out.push({ k: k, v: v, raw: pairs[i] });
    }
    out.sort(function (a, b) {
      if (a.k < b.k) return -1; if (a.k > b.k) return 1;
      if (a.v < b.v) return -1; if (a.v > b.v) return 1; return 0;
    });
    var s = [];
    for (var j = 0; j < out.length; j++) s.push(out[j].raw);
    return s.join('&');
  }

  // ---- canonicalization --------------------------------------------------
  // Deterministic JSON: object keys sorted recursively; arrays keep order.
  function canonicalize(value) {
    return JSON.stringify(sortValue(value));
  }
  function sortValue(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Object.prototype.toString.call(v) === '[object Array]') {
      var arr = [];
      for (var i = 0; i < v.length; i++) arr.push(sortValue(v[i]));
      return arr;
    }
    var keys = [];
    for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) {
      if (STRIP_FIELDS[k]) continue;
      keys.push(k);
    }
    keys.sort();
    var obj = {};
    for (var j = 0; j < keys.length; j++) obj[keys[j]] = sortValue(v[keys[j]]);
    return obj;
  }

  // Turn any body (string | object | undefined | null) into a canonical string.
  function canonicalBody(body) {
    if (body == null || body === '') return '';
    if (typeof body === 'string') {
      // The product almost always passes JSON.stringify(...) as the body. Parse
      // it back so field order can't change the key; if it isn't JSON, hash the
      // raw string as-is.
      try { return canonicalize(JSON.parse(body)); } catch (e) { return body; }
    }
    // FormData / Blob / ArrayBuffer bodies: fall back to a stable tag. The
    // product does not send these today; this keeps the function total.
    if (typeof body === 'object') {
      try { return canonicalize(body); } catch (e2) { return String(body); }
    }
    return String(body);
  }

  // ---- FNV-1a 32-bit -----------------------------------------------------
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      // h *= 16777619, kept in 32-bit range without BigInt
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
      h = h >>> 0;
    }
    var hex = h.toString(16);
    while (hex.length < 8) hex = '0' + hex;
    return hex;
  }

  function hashBody(body) {
    var canon = canonicalBody(body);
    return canon === '' ? '' : fnv1a(canon);
  }

  // ---- the signature -----------------------------------------------------
  function signature(method, url, body) {
    method = String(method || 'GET').toUpperCase();
    var u = splitUrl(url);
    var q = sortQuery(u.query);
    var sig = method + ' ' + u.path + (q ? '?' + q : '');
    if (method !== 'GET' && method !== 'HEAD') {
      var bh = hashBody(body);
      if (bh) sig += ' #' + bh;
    }
    return sig;
  }

  var api = {
    signature: signature,
    canonicalize: canonicalize,
    canonicalBody: canonicalBody,
    hashBody: hashBody,
    splitUrl: splitUrl,
    sortQuery: sortQuery,
    fnv1a: fnv1a,
    isWriteMethod: function (m) { m = String(m || 'GET').toUpperCase(); return m !== 'GET' && m !== 'HEAD'; }
  };

  root.DemoSig = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
