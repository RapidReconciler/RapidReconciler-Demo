/*
 * date-freeze.js  -- pins the demo's reference "now" to a fixed instant.
 *
 * WHY THIS EXISTS
 * ---------------
 * The demo is a record/replay bundle: the real RRV8 product pages run their own
 * JS at both capture time and replay time. Several product surfaces are computed
 * CLIENT-SIDE from the current clock against recorded absolute timestamps:
 *
 *   - team / user inactivity coloring   (Date.now() - lastLoginAt)
 *       home.html paintTeamHealth, admin-users.html rowHealth
 *   - activity-log "N ago" strings      (Date.now() - eventTime)
 *       home.html fmtAgo, admin-activity-log.html fmtWhen
 *   - access-review "today" levels      (new Date() as today vs. stored review date)
 *       home.html purge/complexPw/schedule/ai/activity review bands
 *   - "Generated <now>" report/export stamps
 *   - the admin AI briefing prompt, which embeds the above ("1d ago", inactivity,
 *     renewal wording) and is POSTed to /api/v1/ai/explain
 *
 * Against the REAL clock these recompute every day, so the bundle drifts daily
 * and the facts fed to the AI answer surface are non-deterministic. Freezing the
 * clock to ONE instant -- used identically at capture AND replay -- makes every
 * one of these stable and reproducible.
 *
 * SCOPE OF THE OVERRIDE (deliberately narrow)
 * -------------------------------------------
 * Only the "what time is it NOW" reads are pinned:
 *     new Date()      (no arguments)  -> the frozen instant
 *     Date.now()                      -> the frozen instant (ms)
 *     Date()          (called as fn)  -> the frozen instant's string form
 * Every other form is delegated UNCHANGED to the native Date:
 *     new Date(iso), new Date(ms), new Date(y, m, d, ...), Date.parse, Date.UTC
 * so all the date PARSING / FORMATTING of recorded timestamps
 * (toLocaleDateString on lastLoginAt, licenseEndDate, event times, ...) keeps
 * working exactly as before. We stabilize "now", not date math in general.
 *
 * This does NOT touch timers: setTimeout / setInterval / requestAnimationFrame /
 * performance.now() are driven by the engine's monotonic clock, not by Date, so
 * record/replay timing, polling, and animations are unaffected. The record and
 * replay shims themselves use Date only for a cosmetic recording.createdAt stamp.
 *
 * WIRING
 * ------
 * Loaded via the SAME <head>-top injection as request-signature.js, into BOTH
 * builds (publish/build-demo.ps1 -> bundle/, publish/capture/build-capture-
 * staging.ps1 -> capture-staging/). It is the FIRST script in the boot strip so
 * the clock is frozen before any product OR shim code reads the time. Loading it
 * on the capture side too means a future re-walk records against the same frozen
 * "now", so the recording and the bundle render identically.
 *
 * Vanilla ES5. No dependencies. Attaches nothing to window except the patched
 * global Date (and window.__demoFrozenNow for diagnostics).
 */
(function (root) {
  'use strict';

  // =========================================================================
  // THE ONE KNOB. Change this single line to move the whole demo's clock.
  // =========================================================================
  // Chosen to match the instant the shipped recording was captured
  // (recording.createdAt = 2026-07-18T09:06Z), so the CLIENT-computed surfaces
  // line up with the SERVER values already baked into recording.json:
  //   - Licensing: recorded daysRemaining = 44 against licenseEndDate 2026-08-31
  //     -> card reads "Renewal due soon" (amber, <=60 days), "Renewal due
  //     Aug 31, 2026". (Server-computed; see note at bottom.)
  //   - Activity log: newest recorded event is 2026-07-17 ~09:54Z, so the feed
  //     reads "1d ago" / hours-ago -- fresh, not stale.
  //   - User inactivity: last-active dates span 2026-05-24 .. 2026-07-18, all
  //     under the 6-month amber threshold -> roster reads green with a calm
  //     "N inactive 30+ days" heads-up. Healthy demo state.
  // OWNER: confirm this instant. It should sit just AFTER the newest recorded
  // activity/login and 30-60 days BEFORE licenseEndDate (2026-08-31) so the
  // renewal reads "soon" without being expired. Re-walks that change the demo
  // data may warrant nudging it.
  var FROZEN_ISO = '2026-07-18T09:30:00Z';
  // =========================================================================

  var OrigDate = root.Date;
  if (typeof OrigDate !== 'function') return;              // no Date? nothing to do

  var FROZEN_MS = OrigDate.parse(FROZEN_ISO);
  if (isNaN(FROZEN_MS)) {                                  // bad constant -> fail safe
    try { (root.console && console.warn)('[demo date-freeze] invalid FROZEN_ISO "' + FROZEN_ISO + '"; leaving the real clock in place'); } catch (e) {}
    return;
  }

  function FrozenDate() {
    // Called as a plain function, e.g. Date() -> the spec returns a STRING of
    // the current time. Return the frozen instant's string form.
    if (!(this instanceof FrozenDate)) {
      return new OrigDate(FROZEN_MS).toString();
    }
    // new Date() with NO args -> the frozen instant.
    if (arguments.length === 0) {
      return new OrigDate(FROZEN_MS);
    }
    // new Date(<args>) -> delegate every other overload UNCHANGED to native
    // Date. The bind/apply trick forwards an arbitrary argument list to a
    // constructor in ES5 (covers ms, ISO string, and the y,m,d,h,mi,s,ms form).
    var args = [null];
    for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
    return new (Function.prototype.bind.apply(OrigDate, args))();
  }

  // Share the native prototype so `x instanceof Date`, all instance methods, and
  // native-Date instances returned above all keep working transparently.
  FrozenDate.prototype = OrigDate.prototype;

  // Static surface: pin now(), pass the rest straight through.
  FrozenDate.now   = function () { return FROZEN_MS; };
  FrozenDate.parse = OrigDate.parse;
  FrozenDate.UTC   = OrigDate.UTC;

  root.Date = FrozenDate;

  // Diagnostics only (handy from the console; not used by product code).
  try { root.__demoFrozenNow = { iso: FROZEN_ISO, ms: FROZEN_MS }; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);

/*
 * RESIDUAL (flagged, out of scope for a client-side shim)
 * -------------------------------------------------------
 * The Licensing card's "renewal due in N days" (daysRemaining) is computed on
 * the SERVER and arrives in the /api/v1/admin/clients/license-usage response, so
 * it is baked into recording.json at capture time and is already stable at
 * replay -- this client freeze cannot (and need not) change it. What it CANNOT
 * fix is a re-CAPTURE walk: the live server recomputes daysRemaining against the
 * real server clock that day, so a re-walk on a different date bakes a different
 * number. To keep re-walks consistent with FROZEN_ISO, either walk near the
 * frozen date, or move the demo DB's license end date so that (endDate -
 * walk-date) lands in the intended "renewal due soon" window.
 */
