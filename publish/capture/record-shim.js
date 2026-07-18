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
 * Recording format (recording.json):
 * {
 *   "version": 1,
 *   "createdAt": "<ISO>",
 *   "entries": [
 *     { "sig", "method", "path", "query", "bodyKey", "status", "statusText",
 *       "contentType", "encoding": "text"|"base64", "body", "write": bool,
 *       "via": "fetch"|"xhr" }
 *   ]
 * }
 * entries are in capture order. Replay keys on `sig`; when one sig was captured
 * more than once (e.g. a read whose value changed after a write), the entries
 * replay in recorded order (before-state then after-state), so keeping the list
 * ordered matters -- do not de-dupe here.
 */
(function (root) {
  'use strict';

  if (!root.DemoSig) {
    throw new Error('record-shim: request-signature.js (DemoSig) must load first');
  }
  var Sig = root.DemoSig;

  var nativeFetch = root.fetch ? root.fetch.bind(root) : null;
  var NativeXHR = root.XMLHttpRequest;

  // Recording persists to sessionStorage so it ACCUMULATES across page
  // navigations within one capture walk (same :8765 origin). Without this the
  // in-memory recording reset on every navigation and only the last page was
  // saved. Re-hydrate on load; a full re-serialize on each record() is fine for
  // capture (not a hot path); a quota/disabled failure degrades to in-memory.
  var SS_KEY = '__demoCaptureRecording';
  var recording = null;
  try { var _saved = root.sessionStorage && root.sessionStorage.getItem(SS_KEY); if (_saved) recording = JSON.parse(_saved); } catch (e) { recording = null; }
  if (!recording || !recording.entries) recording = { version: 1, createdAt: new Date().toISOString(), entries: [] };
  function persist() {
    try { if (root.sessionStorage) root.sessionStorage.setItem(SS_KEY, JSON.stringify(recording)); } catch (e) { /* quota/disabled: keep recording in-memory */ }
  }

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

  function record(rec) {
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
      body:        rec.body_out,
      write:       Sig.isWriteMethod(rec.method),
      via:         rec.via
    };
    // Capture-completeness aid: for the AI answer surface, stamp the semantic
    // (tier|question) the sig is keyed on, so recording.json can be eyeballed to
    // confirm every pill x tier combo was actually visited during the walk.
    if (u.path === '/api/v1/ai/explain' && Sig.aiExplainKey) entry.aiKey = Sig.aiExplainKey(rec.body);
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
            try {
              bodyOut = (root.TextDecoder ? new TextDecoder('utf-8').decode(bytes)
                                          : String.fromCharCode.apply(null, bytes));
            } catch (e) { bodyOut = ''; }
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

  // ---- public API --------------------------------------------------------
  root.__demoCapture = {
    dump: function () { return recording; },
    toJson: function (pretty) { return JSON.stringify(recording, null, pretty ? 2 : 0); },
    count: function () { return recording.entries.length; },
    clear: function () { recording.entries.length = 0; recording.createdAt = new Date().toISOString(); try { if (root.sessionStorage) root.sessionStorage.removeItem(SS_KEY); } catch (e) {} },
    download: function (filename) {
      filename = filename || 'recording.json';
      var blob = new Blob([this.toJson(true)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
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
    function label() { return '\u2b07 Save recording (' + recording.entries.length + ')'; }
    btn.textContent = label();
    btn.addEventListener('click', function () {
      root.__demoCapture.download();                       // 1. snapshot -> recording.json (client-side blob; server not needed)
      btn.disabled = true; btn.textContent = 'Saved — stopping…';
      // 2. One-and-done: ask VALC to stop capture + restore the RR App on :8765.
      //    The staging origin is CORS-allowed on VALC /api/**. Gated on
      //    __rrCaptureStopUrl (injected only in capture-staging) so this shim stays
      //    reusable for non-capture record/replay uses (REC-1) with no auto-stop.
      var stopUrl = root.__rrCaptureStopUrl;
      if (stopUrl && root.fetch) { try { root.fetch(stopUrl, { method: 'POST' }).catch(function () {}); } catch (_) {} }
      // 3. Close this (script-opened) tab after the download has a beat to flush.
      root.setTimeout(function () { try { root.close(); } catch (_) {} }, 900);
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
