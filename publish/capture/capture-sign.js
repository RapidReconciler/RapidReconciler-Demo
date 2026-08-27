
/* ------------------------------------------------------------------------
 * CAPTURE-TIME ONLY. Appended to the capture-staging COPY of tour-seed.js by
 * the capture driver. It is never written to RapidReconciler-Demo/tour/ and
 * never reaches bundle/ -- capture-staging is gitignored and rebuilt by every
 * capture/start.
 *
 * Why: VLC-32 option B put RS256 verification back on the VALC-spawned agents.
 * A capture drives those real agents, so the session token has to be signed.
 * Replay does not, and must not: replay-shim intercepts the network, so a
 * shipped bundle carrying a private key would buy nothing and leak everything.
 *
 * How: it re-signs the payload the seeder just wrote, rather than minting a
 * parallel token. The claims are therefore the seeder's claims by construction
 * -- ports, company lists and the `a` / `t.adm` pair cannot drift apart.
 * ---------------------------------------------------------------------- */
(function (root) {
  'use strict';
  var SIGNER = 'http://127.0.0.1:8792/sign';
  var orig = root.RRTour && root.RRTour.seed;
  if (!orig) return;
  root.__rrCaptureSigned = null;
  root.RRTour.seed = function (a, r) {
    return orig(a, r).then(function (A) {
      var unsigned = root.localStorage.getItem('rrv8.token');
      if (!unsigned) return A;
      return fetch(SIGNER, { method: 'POST', body: unsigned })
        .then(function (x) { return x.json(); })
        .then(function (j) {
          if (j && j.token) {
            root.localStorage.setItem('rrv8.token', j.token);
            root.__rrCaptureSigned = true;
          } else {
            root.__rrCaptureSigned = false;
          }
          return A;
        })
        .catch(function () { root.__rrCaptureSigned = false; return A; });
    });
  };
})(window);
