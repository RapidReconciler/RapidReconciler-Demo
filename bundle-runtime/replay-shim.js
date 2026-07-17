/*
 * replay-shim.js  -- the REPLAY side of record/replay. Ships INSIDE the bundle.
 *
 * Loaded before any product page code. It monkeypatches window.fetch AND
 * window.XMLHttpRequest so that EVERY network call is answered from the recorded
 * responses instead of hitting a server. Nothing phones home.
 *
 * Requires request-signature.js (window.DemoSig) to be loaded FIRST, so the
 * lookup key is computed by the exact same code that wrote it during capture.
 *
 * Loading the recording (in priority order):
 *   1. window.__DEMO_RECORDING  -- an inlined recording object (file:// mode).
 *   2. fetch('recording.json')  -- a sibling static asset (local-server mode),
 *      read with the NATIVE fetch captured before patching. This is a static
 *      file read, not a backend call; the running demo still never phones home.
 * Or call window.__demoReplay.init(recordingObject) yourself.
 *
 * On a MISS (a request whose signature was never captured):
 *   - fail loud: log + show a dev overlay listing the missed signatures, so gaps
 *     in the capture walk are obvious to whoever builds the demo;
 *   - but degrade so the page does not crash:
 *       write-type call (POST/PUT/PATCH/DELETE) -> canned 200 {"ok":true}
 *       read call (GET/HEAD)                    -> neutral 200 JSON null
 *
 * Vanilla ES5 + the Response constructor / Promise / setTimeout (all present in
 * any browser that already runs the product).
 */
(function (root) {
  'use strict';

  if (!root.DemoSig) {
    throw new Error('replay-shim: request-signature.js (DemoSig) must load first');
  }
  var Sig = root.DemoSig;

  var nativeFetch = root.fetch ? root.fetch.bind(root) : null;
  var NativeXHR = root.XMLHttpRequest;   // captured BEFORE we patch it, for the sync recording load

  // sig -> { entries: [entry,...], ptr: n }
  var index = {};
  var missCounts = {};   // sig -> count
  var loaded = false;

  function buildIndex(recording) {
    index = {};
    var entries = (recording && recording.entries) || [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!index[e.sig]) index[e.sig] = { entries: [], ptr: 0 };
      index[e.sig].entries.push(e);
    }
    loaded = true;
  }

  // Pick the entry for a signature. Sequence-aware: return recorded entries in
  // order (before-state, then after-state), and keep returning the LAST one once
  // the queue is exhausted (a reload re-reads the final state).
  function pick(sig) {
    var slot = index[sig];
    if (!slot || !slot.entries.length) return null;
    var e = slot.entries[Math.min(slot.ptr, slot.entries.length - 1)];
    if (slot.ptr < slot.entries.length - 1) slot.ptr++;
    return e;
  }

  // ---- base64 -> bytes ---------------------------------------------------
  function base64ToBytes(b64) {
    var bin = root.atob ? root.atob(b64) : '';
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // Body + content-type for a recorded entry, as { bodyInit, contentType }.
  function materialize(entry) {
    var ct = entry.contentType || (entry.encoding === 'base64'
      ? 'application/octet-stream' : 'application/json');
    if (entry.encoding === 'base64') {
      return { bodyInit: base64ToBytes(entry.body), contentType: ct, isBinary: true };
    }
    return { bodyInit: entry.body == null ? '' : entry.body, contentType: ct, isBinary: false };
  }

  // ---- dev overlay -------------------------------------------------------
  var overlayEl = null;
  function showMiss(sig, method) {
    missCounts[sig] = (missCounts[sig] || 0) + 1;
    try { (root.console && console.warn)('[demo replay] MISS ' + sig + ' -- not in the recording (capture walk did not visit it)'); } catch (e) {}
    renderOverlay();
  }
  function renderOverlay() {
    if (!root.document || !document.body) return;
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.setAttribute('data-demo-replay-overlay', '');
      overlayEl.style.cssText = [
        'position:fixed', 'z-index:2147483647', 'right:12px', 'bottom:12px',
        'max-width:420px', 'max-height:40vh', 'overflow:auto',
        'background:#7a1020', 'color:#fff', 'font:12px/1.4 monospace',
        'padding:10px 12px', 'border-radius:8px', 'box-shadow:0 6px 24px rgba(0,0,0,.4)'
      ].join(';');
      document.body.appendChild(overlayEl);
    }
    var lines = ['<b>Demo replay: missing recordings</b> (page still runs on neutral responses)'];
    for (var sig in missCounts) if (Object.prototype.hasOwnProperty.call(missCounts, sig)) {
      lines.push('&bull; ' + escapeHtml(sig) + (missCounts[sig] > 1 ? ' &times;' + missCounts[sig] : ''));
    }
    overlayEl.innerHTML = lines.join('<br>');
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- neutral / canned miss responses -----------------------------------
  // Returns { status, contentType, encoding:'text', body } for a miss.
  function missResponse(method) {
    if (Sig.isWriteMethod(method)) {
      return { status: 200, contentType: 'application/json', body: '{"ok":true}', miss: true };
    }
    return { status: 200, contentType: 'application/json', body: 'null', miss: true };
  }

  // ---- fetch -------------------------------------------------------------
  root.fetch = function (input, init) {
    init = init || {};
    var url, method, body;
    if (input && typeof input === 'object' && 'url' in input) {
      url = input.url; method = init.method || input.method || 'GET'; body = init.body;
    } else {
      url = input; method = init.method || 'GET'; body = init.body;
    }
    var sig = Sig.signature(method, url, body);
    var entry = pick(sig);

    var status, statusText, headers, bodyInit;
    if (entry) {
      var m = materialize(entry);
      status = entry.status; statusText = entry.statusText || '';
      headers = { 'Content-Type': m.contentType };
      bodyInit = m.bodyInit;
    } else {
      showMiss(sig, method);
      var mr = missResponse(method);
      status = mr.status; statusText = 'Demo Replay Miss';
      headers = { 'Content-Type': mr.contentType };
      bodyInit = mr.body;
    }
    // Response with a null body is illegal for 204/205; our recordings use 200
    // for reads so this is safe. Wrap in Promise to match fetch's contract.
    var resp = new Response(bodyInit, { status: status, statusText: statusText, headers: headers });
    return Promise.resolve(resp);
  };
  root.fetch.__isDemoReplayShim = true;

  // ---- XMLHttpRequest ----------------------------------------------------
  var ReplayXHR = function () {
    this.readyState = 0;
    this.status = 0;
    this.statusText = '';
    this.responseText = '';
    this.response = null;
    this.responseType = '';
    this.onreadystatechange = null;
    this.onload = null;
    this.onerror = null;
    this._method = 'GET';
    this._url = '';
    this._headers = { 'content-type': '' };
    this._listeners = {};
  };
  ReplayXHR.prototype.open = function (method, url) {
    this._method = method; this._url = url; this._readystate(1);
  };
  ReplayXHR.prototype.setRequestHeader = function () { /* headers are not part of the key */ };
  ReplayXHR.prototype.getResponseHeader = function (name) {
    return this._headers[String(name || '').toLowerCase()] || null;
  };
  ReplayXHR.prototype.getAllResponseHeaders = function () {
    var out = '';
    for (var k in this._headers) if (this._headers[k]) out += k + ': ' + this._headers[k] + '\r\n';
    return out;
  };
  ReplayXHR.prototype.addEventListener = function (type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  };
  ReplayXHR.prototype.removeEventListener = function (type, fn) {
    var a = this._listeners[type]; if (!a) return;
    for (var i = a.length - 1; i >= 0; i--) if (a[i] === fn) a.splice(i, 1);
  };
  ReplayXHR.prototype.abort = function () { /* no-op: nothing in flight */ };
  ReplayXHR.prototype._fire = function (type) {
    if (type === 'readystatechange' && typeof this.onreadystatechange === 'function') this.onreadystatechange();
    if (type === 'load' && typeof this.onload === 'function') this.onload();
    if (type === 'error' && typeof this.onerror === 'function') this.onerror();
    var a = this._listeners[type]; if (a) for (var i = 0; i < a.length; i++) try { a[i].call(this); } catch (e) {}
  };
  ReplayXHR.prototype._readystate = function (s) { this.readyState = s; this._fire('readystatechange'); };
  ReplayXHR.prototype.send = function (body) {
    var self = this;
    var sig = Sig.signature(self._method, self._url, body);
    var entry = pick(sig);
    // Resolve asynchronously so callers that attach handlers after send() work.
    setTimeout(function () {
      var status, ct, encoding, rawBody;
      if (entry) {
        status = entry.status; ct = entry.contentType || 'application/json';
        encoding = entry.encoding; rawBody = entry.body;
      } else {
        showMiss(sig, self._method);
        var mr = missResponse(self._method);
        status = mr.status; ct = mr.contentType; encoding = 'text'; rawBody = mr.body;
      }
      self.status = status;
      self.statusText = entry ? (entry.statusText || '') : 'Demo Replay Miss';
      self._headers['content-type'] = ct;

      if (self.responseType === 'arraybuffer') {
        var bytes = (encoding === 'base64') ? base64ToBytes(rawBody)
          : (root.TextEncoder ? new TextEncoder().encode(String(rawBody)) : strToBytes(String(rawBody)));
        self.response = bytes.buffer;
        self.responseText = '';   // spec: responseText is empty for non-text types
      } else if (self.responseType === 'json') {
        try { self.response = JSON.parse(String(rawBody)); } catch (e) { self.response = null; }
        self.responseText = '';
      } else {
        var text = (encoding === 'base64')
          ? (root.TextDecoder ? new TextDecoder('utf-8').decode(base64ToBytes(rawBody)) : rawBody)
          : String(rawBody);
        self.responseText = text;
        self.response = text;
      }
      self._readystate(2);
      self._readystate(3);
      self._readystate(4);
      self._fire('load');
    }, 0);
  };
  function strToBytes(s) { var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b; }
  ReplayXHR.__isDemoReplayShim = true;
  root.XMLHttpRequest = ReplayXHR;

  // ---- public API + auto-load --------------------------------------------
  root.__demoReplay = {
    init: function (recording) { buildIndex(recording); return this; },
    ready: function () { return loaded; },
    stats: function () { var n = 0; for (var k in index) n += index[k].entries.length; return { signatures: 0 + Object.keys(index).length, entries: n }; },
    misses: function () { var o = {}; for (var k in missCounts) o[k] = missCounts[k]; return o; },
    signature: Sig.signature
  };

  // Load the recording SYNCHRONOUSLY at shim-init. The shim is injected at the
  // TOP of <head>, so a blocking load here guarantees the index is built BEFORE
  // any product code runs its on-load fetches. An async load races: product
  // pages fire their data calls immediately, and a large recording.json (MBs)
  // may not have parsed yet -> those early calls MISS with no retry. A sync XHR
  // on a same-origin static file is a sub-second, one-time cost at page load.
  function loadRecordingSync() {
    if (!NativeXHR) return false;
    try {
      var xhr = new NativeXHR();
      xhr.open('GET', 'recording.json', false);   // false = synchronous
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
        buildIndex(JSON.parse(xhr.responseText));
        return true;
      }
    } catch (e) { /* fall through to async */ }
    return false;
  }

  function autoload() {
    if (root.__DEMO_RECORDING) { buildIndex(root.__DEMO_RECORDING); return; }
    if (loadRecordingSync()) return;              // primary: race-free
    if (nativeFetch) {                            // fallback: async (best-effort)
      nativeFetch('recording.json', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (rec) { if (rec) buildIndex(rec); else console.warn('[demo replay] no recording.json found'); })
        .catch(function () { console.warn('[demo replay] could not load recording.json; call __demoReplay.init(rec)'); });
    }
  }
  autoload();
})(typeof window !== 'undefined' ? window : this);
