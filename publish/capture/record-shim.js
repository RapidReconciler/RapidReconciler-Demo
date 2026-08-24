/*
 * record-shim.js  -- the CAPTURE side of record/replay.
 *
 * Loaded (by the capture harness) into the LIVE product before any page code
 * runs. It monkeypatches window.fetch AND window.XMLHttpRequest so that every
 * network call still goes to the real network (pass-through) but its
 * request/response pair is also recorded into an in-memory recording, keyed by
 * DemoSig.signature(...). When the capture walk finishes, call
 *   window.__demoCapture.dump()      -> the recording object
 *   window.__demoCapture.toJson()    -> recording.json text
 *   window.__demoCapture.download()  -> save recording.json (browser)
 *
 * Requires request-signature.js (window.DemoSig) to be loaded FIRST.
 *
 * Vanilla ES5. No dependencies beyond DemoSig.
 *
 * Recording format (recording.json) -- version 2:
 * {
 *   "version": 2,
 *   "createdAt": "<ISO>",
 *   "bodies": { "<ref>": "<response body>" },
 *   "entries": [
 *     { "sig", "method", "path", "query", "bodyKey", "status", "statusText",
 *       "contentType", "encoding": "text"|"base64", "bodyRef", "write": bool,
 *       "via": "fetch"|"xhr" }
 *   ]
 * }
 * entries are in capture order. Replay keys on `sig`; when one sig was captured
 * more than once (e.g. a read whose value changed after a write), the entries
 * replay in recorded order (before-state then after-state), so keeping the list
 * ordered matters -- NOTHING here may drop an entry.
 *
 * WHY THE BODY POOL (v2, 2026-08-24). The Demo1 analyst walk buffered 349 MB
 * across 553 entries because POST /inventory/transactions returns a ~4.5 MB grid
 * and the walk loaded it 74 times. The fix used to be a hand-run "drop
 * consecutive byte-identical responses" snippet, and that snippet is LOSSY in the
 * one place it matters: a save-and-reflect beat depends on the exact NUMBER of
 * before-state reads, so collapsing [before x3, after x4] to [before, after]
 * flips the card on the next page's own boot. Pooling gets the same size win
 * losslessly -- every entry survives, identical bodies are stored once and
 * referenced by `bodyRef`. Sequence length is therefore structurally preserved
 * and no caller has to remember an exemption list.
 *
 * v1 recordings (inline `body`, no `bodies` map) still replay: replay-shim reads
 * `bodyRef` when present and falls back to `body`.
 */
(function (root) {
  'use strict';

  if (!root.DemoSig) {
    throw new Error('record-shim: request-signature.js (DemoSig) must load first');
  }
  var Sig = root.DemoSig;

  var nativeFetch = root.fetch ? root.fetch.bind(root) : null;
  var NativeXHR = root.XMLHttpRequest;

  // Recording ACCUMULATES across page navigations within one capture walk (same
  // :8765 origin) so a multi-page / multi-DB walk builds ONE recording. Persistence
  // is IndexedDB, NOT sessionStorage: analyst data-read payloads run several MB each
  // (integrity / reconciliation reads), which blows sessionStorage's ~5MB per-origin
  // quota -- the failing write then leaves a STALE smaller snapshot that the next
  // navigation reloads, silently dropping the earliest entries. IndexedDB is
  // disk-backed (hundreds of MB), so the whole recording survives.
  //
  // IndexedDB (unlike tab-scoped sessionStorage) persists across capture SESSIONS on
  // this origin, so a per-build session stamp (window.__rrCaptureSession, injected by
  // build-capture-staging on every capture/start) gates hydration: a page from the
  // SAME walk hydrates + appends; a NEW walk (different stamp) starts clean. With no
  // stamp (record-shim reused outside capture-staging) it accumulates regardless.
  // If IndexedDB is unavailable it degrades to in-memory only rather than clobber.
  var recording = { version: 2, createdAt: new Date().toISOString(), bodies: {}, entries: [] };
  var IDB_NAME = '__demoCapture', IDB_STORE = 'recording', IDB_KEY = 'current';
  var SESSION = (root.__rrCaptureSession != null) ? String(root.__rrCaptureSession) : null;
  var _idb = null, _hydrated = false, _flushPending = false;

  // ---- body pool ---------------------------------------------------------
  // Store each distinct response body once; entries hold a `bodyRef` into it.
  // FNV-1a + length buckets the lookup; a full string compare then settles it,
  // so a hash collision cannot serve the wrong body -- it chains to a new ref.
  // The compare only runs when the hash AND length already matched.
  function _fnv1a(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return h.toString(16);
  }
  function poolBody(text) {
    if (text == null) text = '';
    var base = _fnv1a(text) + '-' + text.length, ref = base, k = 1;
    while (true) {
      var held = recording.bodies[ref];
      if (held === undefined) { recording.bodies[ref] = text; return ref; }
      if (held === text) return ref;                    // same body, share the ref
      ref = base + '_' + (++k);                         // genuine collision -> chain
    }
  }
  function bodyOf(entry) {
    if (entry == null) return '';
    if (entry.bodyRef != null) {
      var b = recording.bodies[entry.bodyRef];
      return b == null ? '' : b;
    }
    return entry.body == null ? '' : entry.body;        // v1 entry hydrated from IDB
  }
  // Union another recording's pool into ours, rewriting refs that would collide
  // with a DIFFERENT body. Returns a ref-remap to apply to that side's entries.
  function absorbBodies(otherBodies) {
    var remap = {};
    if (!otherBodies) return remap;
    for (var ref in otherBodies) {
      if (!Object.prototype.hasOwnProperty.call(otherBodies, ref)) continue;
      var body = otherBodies[ref], held = recording.bodies[ref];
      if (held === undefined) { recording.bodies[ref] = body; continue; }
      if (held === body) continue;
      remap[ref] = poolBody(body);
    }
    return remap;
  }
  // Bodies no entry points at (a stale walk's, or a re-pooled collision) are dead
  // weight in a 40 MB file. Sweep on export only -- never during a walk.
  function liveBodies(entries) {
    var out = {}, i, r;
    for (i = 0; i < entries.length; i++) {
      r = entries[i] && entries[i].bodyRef;
      if (r != null && recording.bodies[r] !== undefined) out[r] = recording.bodies[r];
    }
    return out;
  }

  function _openIdb(cb) {
    try {
      if (!root.indexedDB) { cb(null); return; }
      var req = root.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () { try { req.result.createObjectStore(IDB_STORE); } catch (e) {} };
      req.onsuccess = function () { cb(req.result); };
      req.onerror   = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  // Hydrate the accumulated recording from prior pages in this walk, then PREPEND it
  // to anything captured during the async open (this page's early calls) so order
  // stays capture-chronological. persist() is a no-op until _hydrated, so an early
  // flush cannot overwrite the prior pages' entries with this page's alone.
  _openIdb(function (db) {
    _idb = db;
    if (!db) { _hydrated = true; return; }   // no IDB -> in-memory only (persist no-ops)
    try {
      var g = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      g.onsuccess = function () {
        var prior = g.result;
        var sameWalk = prior && (SESSION == null || String(prior.session) === SESSION);
        if (sameWalk && prior.entries && prior.entries.length) {
          // Absorb the prior page's pool FIRST, then its entries, remapping any
          // ref whose body differs from one this page already pooled under the
          // same key. Without the remap a chained collision from page 1 would
          // resolve to page 2's body.
          var remap = absorbBodies(prior.bodies);
          for (var pi = 0; pi < prior.entries.length; pi++) {
            var pe = prior.entries[pi];
            if (!pe) continue;
            if (pe.bodyRef != null && remap[pe.bodyRef]) pe.bodyRef = remap[pe.bodyRef];
            else if (pe.bodyRef == null && pe.body != null) {   // v1 snapshot -> pool it
              pe.bodyRef = poolBody(pe.body); delete pe.body;
            }
          }
          recording.entries = prior.entries.concat(recording.entries);
          if (prior.createdAt) recording.createdAt = prior.createdAt;
        }   // else: new capture session -> ignore stale; first persist() overwrites it
        recording.session = SESSION;
        _hydrated = true; persist();
      };
      g.onerror = function () { recording.session = SESSION; _hydrated = true; };
    } catch (e) { recording.session = SESSION; _hydrated = true; }
  });
  function _flush() {
    _flushPending = false;
    if (!_idb || !_hydrated) return;
    try {
      _idb.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE)
        .put({ version: recording.version, createdAt: recording.createdAt, session: recording.session, bodies: recording.bodies, entries: recording.entries }, IDB_KEY);
    } catch (e) { /* transient; the next record() reschedules a flush */ }
  }
  // Debounced: records() fire in bursts; coalesce to one IDB write ~400ms later.
  // Network-gated walk steps are seconds apart, so a flush completes before the next
  // navigation; pagehide/visibilitychange back it up for a nav inside the window.
  function persist() {
    if (!_idb || !_hydrated || _flushPending) return;
    _flushPending = true;
    try { root.setTimeout(_flush, 400); } catch (e) { _flush(); }
  }
  try {
    root.addEventListener('pagehide', function () { if (_flushPending) _flush(); });
    root.addEventListener('visibilitychange', function () {
      if (root.document && root.document.visibilityState === 'hidden' && _flushPending) _flush();
    });
  } catch (e) {}

  // ---- binary helpers ----------------------------------------------------
  function isTextual(contentType) {
    var ct = String(contentType || '').toLowerCase();
    if (!ct) return true;                                   // assume text when unstated
    if (ct.indexOf('text/') === 0) return true;             // text/*
    if (/^application\/(json|javascript|ecmascript|xml|xhtml\+xml|ld\+json)\b/.test(ct)) return true;
    if (/\+(json|xml)\b/.test(ct)) return true;             // any +json / +xml suffix type
    if (/\b(csv|x-www-form-urlencoded)\b/.test(ct)) return true;
    return false;                                           // xlsx / pdf / octet-stream -> binary
  }
  function bytesToBase64(bytes) {
    // bytes: Uint8Array. Chunked to avoid call-stack blowups on big buffers.
    var bin = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return root.btoa ? root.btoa(bin) : bin;
  }

  // Decode a textual response. The old inline version was
  //   try { TextDecoder ... : String.fromCharCode.apply(null, bytes) }
  //   catch (e) { bodyOut = ''; }
  // and that catch is a trap: String.fromCharCode.apply throws RangeError once
  // the byte count passes the argument limit (the grid reads are megabytes), so
  // the walk recorded an EMPTY body under a 200 with nothing on screen to say
  // so. Chrome always has TextDecoder, so the fallback never ran in a real
  // capture -- which is exactly why it could sit there. Now the fallback is
  // chunked so it cannot overflow, and a genuine failure is LOUD and marks the
  // entry rather than passing for a successful empty response.
  var _decodeFailures = 0;
  function decodeText(bytes, url) {
    if (root.TextDecoder) {
      try { return new TextDecoder('utf-8').decode(bytes); } catch (e) { /* fall through */ }
    }
    try {
      var out = '', CH = 0x8000;
      for (var i = 0; i < bytes.length; i += CH) {
        out += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
      }
      return out;
    } catch (e) {
      _decodeFailures++;
      try {
        console.error('[demo capture] could NOT decode ' + bytes.length
          + ' bytes from ' + url + ' -- recorded as a decode failure, not as an'
          + ' empty body. This entry will replay wrong; re-walk this screen.', e);
      } catch (e2) {}
      return null;
    }
  }

  // While the shim is posting the recording to the capture sink, its OWN request
  // must not be recorded. Measured 2026-08-24: the Demo3 walk shipped a
  // "POST /save" entry because the save was a page-level fetch and the shim
  // faithfully captured it. Rather than ask every caller to remember an ignore
  // list, saveTo() below owns the POST and flips this for its duration.
  var _suppress = false;

  function record(rec) {
    if (_suppress) return;
    // Split the signature back into path/query for the stored fields (handy for
    // humans reading recording.json; replay only needs `sig`).
    var u = Sig.splitUrl(rec.url);
    var entry = {
      sig:         Sig.signature(rec.method, rec.url, rec.body),
      method:      String(rec.method || 'GET').toUpperCase(),
      path:        u.path,
      query:       Sig.sortQuery(u.query),
      bodyKey:     Sig.hashBody(rec.body),
      status:      rec.status,
      statusText:  rec.statusText || '',
      contentType: rec.contentType || '',
      encoding:    rec.encoding,
      bodyRef:     poolBody(rec.body_out == null ? '' : rec.body_out),
      write:       Sig.isWriteMethod(rec.method),
      via:         rec.via
    };
    // Capture-completeness aid: for the AI answer surface, stamp the semantic
    // (tier|question) the sig is keyed on, so recording.json can be eyeballed to
    // confirm every pill x tier combo was actually visited during the walk.
    if (u.path === '/api/v1/ai/explain' && Sig.aiExplainKey) entry.aiKey = Sig.aiExplainKey(rec.body);
    // A decode failure is recorded AS a failure. An entry carrying decodeFailed
    // is not a capture, it is a hole with a 200 on it.
    if (rec.encoding === 'text' && rec.body_out == null) entry.decodeFailed = true;
    recording.entries.push(entry);
    persist();
  }

  // ---- fetch -------------------------------------------------------------
  if (nativeFetch) {
    root.fetch = function (input, init) {
      init = init || {};
      var url, method, body;
      if (input && typeof input === 'object' && 'url' in input) {  // Request object
        url = input.url;
        method = init.method || input.method || 'GET';
        body = init.body;                 // Request-object bodies aren't re-read here
      } else {
        url = input;
        method = init.method || 'GET';
        body = init.body;
      }
      return nativeFetch(input, init).then(function (resp) {
        var ct = resp.headers && resp.headers.get ? resp.headers.get('content-type') : '';
        var clone = resp.clone();
        // Read as bytes so we can faithfully store text OR binary.
        return clone.arrayBuffer().then(function (buf) {
          var bytes = new Uint8Array(buf);
          var encoding, bodyOut;
          if (isTextual(ct)) {
            encoding = 'text';
            bodyOut = decodeText(bytes, url);
          } else {
            encoding = 'base64';
            bodyOut = bytesToBase64(bytes);
          }
          record({
            url: url, method: method, body: body,
            status: resp.status, statusText: resp.statusText, contentType: ct,
            encoding: encoding, body_out: bodyOut, via: 'fetch'
          });
          return resp;   // hand the ORIGINAL response back to the caller
        }, function () { return resp; });
      });
    };
    root.fetch.__isDemoRecordShim = true;
  }

  // ---- XMLHttpRequest ----------------------------------------------------
  // The product itself uses fetch, but vendored libraries (and any future code)
  // may use XHR, so the capture net covers it too. We wrap open/send and read
  // the response on load.
  if (NativeXHR) {
    var RecXHR = function () {
      var xhr = new NativeXHR();
      var meta = { method: 'GET', url: '', body: undefined };

      var origOpen = xhr.open;
      xhr.open = function (method, url) {
        meta.method = method; meta.url = url;
        return origOpen.apply(xhr, arguments);
      };
      var origSend = xhr.send;
      xhr.send = function (body) {
        meta.body = body;
        xhr.addEventListener('load', function () {
          try {
            var ct = xhr.getResponseHeader ? xhr.getResponseHeader('content-type') : '';
            var encoding, bodyOut;
            var rt = xhr.responseType;
            if (rt === 'arraybuffer' && xhr.response) {
              encoding = 'base64'; bodyOut = bytesToBase64(new Uint8Array(xhr.response));
            } else if (rt === '' || rt === 'text' || rt === 'json') {
              if (rt === 'json') { encoding = 'text'; bodyOut = JSON.stringify(xhr.response); }
              else { encoding = isTextual(ct) ? 'text' : 'text'; bodyOut = xhr.responseText; }
            } else {
              encoding = 'text'; bodyOut = '';   // blob/document not captured
            }
            record({
              url: meta.url, method: meta.method, body: meta.body,
              status: xhr.status, statusText: xhr.statusText, contentType: ct,
              encoding: encoding, body_out: bodyOut, via: 'xhr'
            });
          } catch (e) { /* never let capture break the real call */ }
        });
        return origSend.apply(xhr, arguments);
      };
      return xhr;
    };
    RecXHR.__isDemoRecordShim = true;
    root.XMLHttpRequest = RecXHR;
  }

  // ---- export reconciliation --------------------------------------------
  // download() USED to blob the in-memory `recording` synchronously. That races
  // the async hydrate (line ~84 reassigns recording.entries = prior.concat(...))
  // and the 400ms debounced flush: an export fired while either was in flight
  // serialized a stale subset -- a multi-page walk silently lost a page's worth
  // of entries even though count() looked right a tick earlier. Fix: export the
  // UNION of the in-memory buffer AND the persisted IDB snapshot, AFTER
  // hydration completes and a final flush is forced. Neither store being
  // transiently behind can drop an entry the other holds.
  //
  // THIS USED TO DEDUPE BY SIG, KEEPING THE FIRST ENTRY (fixed 2026-08-24). Its
  // own comment justified that with "replay keys on sig and serves the first
  // match" -- replay does no such thing. `pick()` walks a signature's entries in
  // capture order and sticks on the last, which is the entire mechanism behind a
  // save-and-reflect beat. Collapsing to the first entry silently discarded every
  // before/after pair in the walk. Measured on the two shipped recordings: 9
  // multi-entry signatures each, including txv/resolutions?company=80003 with 7
  // (before x3, after x4). Both were saved through the POST-to-sink path, not
  // this one -- which is why the Save BUTTON producing a differently-shaped
  // recording from the same walk went unnoticed. The union is now keyed by
  // (sig, occurrence), so a straggler only ever ADDS an occurrence the in-memory
  // list does not already hold, and no count can shrink.
  function _readIdbEntries(cb) {
    if (!_idb) { cb([]); return; }
    try {
      var g = _idb.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      g.onsuccess = function () {
        var s = g.result;
        var sameWalk = s && (SESSION == null || String(s.session) === SESSION);
        cb(sameWalk && s.entries ? s.entries : []);
      };
      g.onerror = function () { cb([]); };
    } catch (e) { cb([]); }
  }
  function _mergedRecording(cb) {
    if (_flushPending) _flush();                 // push latest in-memory to IDB first
    _readIdbEntries(function (persisted) {
      function keyOf(e) { return e.sig || (e.method + ' ' + e.path + '?' + e.query + ' #' + e.bodyKey); }
      var have = {}, merged = [], i, e, k;
      // in-memory (capture order) is the spine, in full
      for (i = 0; i < recording.entries.length; i++) {
        e = recording.entries[i]; if (!e) continue;
        k = keyOf(e); have[k] = (have[k] || 0) + 1;
        merged.push(e);
      }
      // then only the OCCURRENCES the spine is short of, per signature
      var seenP = {};
      for (i = 0; i < persisted.length; i++) {
        e = persisted[i]; if (!e) continue;
        k = keyOf(e); seenP[k] = (seenP[k] || 0) + 1;
        if (seenP[k] <= (have[k] || 0)) continue;
        if (e.bodyRef == null && e.body != null) { e.bodyRef = poolBody(e.body); delete e.body; }
        merged.push(e);
      }
      cb({ version: recording.version, createdAt: recording.createdAt,
           session: recording.session, bodies: liveBodies(merged), entries: merged });
    });
  }
  function _whenHydrated(fn) {
    if (_hydrated) { fn(); return; }
    var iv = root.setInterval(function () {
      if (_hydrated) { root.clearInterval(iv); fn(); }
    }, 100);
  }

  // ---- public API --------------------------------------------------------
  root.__demoCapture = {
    dump: function () { return recording; },
    toJson: function (pretty) { return JSON.stringify(recording, null, pretty ? 2 : 0); },
    count: function () { return recording.entries.length; },
    clear: function () { recording.entries.length = 0; recording.bodies = {}; recording.createdAt = new Date().toISOString(); try { if (_idb) _idb.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).delete(IDB_KEY); } catch (e) {} },
    // Live pool stats -- the number the 349 MB buffer was hiding. On screen, not
    // in a comment, because it is what tells you a walk is about to be unusable.
    size: function () {
      var chars = 0, refs = 0, r;
      for (r in recording.bodies) if (Object.prototype.hasOwnProperty.call(recording.bodies, r)) { chars += recording.bodies[r].length; refs++; }
      var inline = 0;
      for (var i = 0; i < recording.entries.length; i++) inline += bodyOf(recording.entries[i]).length;
      return { entries: recording.entries.length, distinctBodies: refs,
               pooledChars: chars, unpooledChars: inline,
               savedPct: inline ? Math.round(100 * (inline - chars) / inline) : 0,
               decodeFailures: _decodeFailures };
    },
    bodyOf: function (entry) { return bodyOf(entry); },
    // The SAME reconciled recording download() writes, handed to a callback
    // instead of to a Blob. An MCP-driven walk cannot use download() (the
    // anchor-click never reaches disk -- capture-walk 5a) and POSTs to a loopback
    // sink instead. Before this existed the only public alternative was dump(),
    // which returns the in-memory buffer WITHOUT the IDB reconciliation -- so the
    // save path everyone actually uses skipped the very step that stops a
    // multi-page walk from losing a page. Use this, not dump(), to export.
    reconciled: function (cb) { _whenHydrated(function () { _mergedRecording(cb); }); },
    // POST the reconciled recording to a capture sink. Use THIS rather than
    // reconciled() + your own fetch: the shim suppresses recording for the
    // duration, so the save cannot appear in the recording it is saving.
    // Resolves with { posted, entries, bodies } or { err }.
    saveTo: function (url) {
      return new Promise(function (done) {
        _whenHydrated(function () {
          _mergedRecording(function (rec) {
            var payload = JSON.stringify(rec);
            var n = rec.entries.length, nb = Object.keys(rec.bodies || {}).length;
            _suppress = true;
            var restore = function () { _suppress = false; };
            root.fetch(url, { method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: payload })
              .then(function (r) { restore(); done({ posted: r.status, entries: n, bodies: nb }); })
              .catch(function (e) { restore(); done({ err: String(e) }); });
          });
        });
      });
    },
    // Async: waits for hydration, forces a flush, then blobs the reconciled union.
    // Optional cb(entryCount) fires once the file has been offered for download.
    download: function (filename, cb) {
      filename = filename || 'recording.json';
      _whenHydrated(function () {
        _mergedRecording(function (rec) {
          var blob = new Blob([JSON.stringify(rec, null, 2)], { type: 'application/json' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = filename;
          document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
          if (typeof cb === 'function') cb(rec.entries.length);
        });
      });
    }
  };

  // ---- floating Save button (capture staging only) -----------------------
  // The shim is injected only into the capture-staging bundle, so this button
  // only ever appears during a capture walk -- no product impact. It removes
  // the console step (window.__demoCapture.download()): the analyst walks the
  // screens and clicks to save recording.json. The label carries the live
  // request/response pair count so progress is visible without the console.
  function mountSaveButton() {
    var doc = root.document;
    if (!doc || !doc.body) { root.setTimeout(mountSaveButton, 200); return; }
    if (doc.getElementById('demo-capture-save')) return;
    var btn = doc.createElement('button');
    btn.id = 'demo-capture-save';
    btn.type = 'button';
    btn.title = 'Save the captured request/response pairs to recording.json';
    // High-contrast, fixed bottom-right, above everything. Kept compact so it
    // does not cover product controls; nudged up-left off the very corner.
    btn.style.cssText = [
      'position:fixed', 'right:18px', 'bottom:18px', 'z-index:2147483647',
      'padding:10px 16px', 'border:0', 'border-radius:999px',
      'background:#c62828', 'color:#fff',
      'font:600 13px/1.2 -apple-system,Segoe UI,Roboto,sans-serif',
      'box-shadow:0 4px 14px rgba(0,0,0,.35)', 'cursor:pointer',
      'display:inline-flex', 'align-items:center', 'gap:6px'
    ].join(';');
    // Label uses \u2b07 (DOWNWARDS BLACK ARROW) so the source stays pure ASCII.
    // The label carries the POOLED size, not just the count. 553 entries reads as
    // fine; 349 MB is the number that tells you the walk is about to be unusable,
    // and it was only ever visible after the save. Both go on the button.
    function label() {
      var s = root.__demoCapture.size();
      return '\u2b07 Save recording (' + s.entries + ' \u00b7 '
           + (s.pooledChars / 1048576).toFixed(1) + ' MB'
           + (s.decodeFailures ? ' \u00b7 ' + s.decodeFailures + ' DECODE FAIL' : '') + ')';
    }
    btn.textContent = label();
    btn.addEventListener('click', function () {
      btn.disabled = true; btn.textContent = 'Saving…';
      // 1. snapshot -> recording.json (client-side blob; server not needed). Now
      //    async (waits for hydration + flush + IDB reconcile), so the stop/close
      //    are sequenced in the callback -- never before the file is offered.
      root.__demoCapture.download('recording.json', function () {
        btn.textContent = 'Saved — stopping…';
        // 2. One-and-done: ask VALC to stop capture + restore the RR App on :8765.
        //    The staging origin is CORS-allowed on VALC /api/**. Gated on
        //    __rrCaptureStopUrl (injected only in capture-staging) so this shim stays
        //    reusable for non-capture record/replay uses (REC-1) with no auto-stop.
        var stopUrl = root.__rrCaptureStopUrl;
        if (stopUrl && root.fetch) { try { root.fetch(stopUrl, { method: 'POST' }).catch(function () {}); } catch (_) {} }
        // 3. Close this (script-opened) tab after the download has a beat to flush.
        root.setTimeout(function () { try { root.close(); } catch (_) {} }, 900);
      });
    });
    doc.body.appendChild(btn);
    // Refresh the count live (cheap; the walk fires calls continuously).
    root.setInterval(function () {
      var next = label();
      if (btn.textContent !== next) btn.textContent = next;
    }, 1000);
  }
  mountSaveButton();
})(typeof window !== 'undefined' ? window : this);
