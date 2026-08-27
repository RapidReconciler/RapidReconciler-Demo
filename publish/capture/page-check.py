"""Replay-check the bundle pages that no rail visits.

  python page-check.py <port> <rail-to-seed-with> <page.html> [page.html ...]
  python page-check.py 8771 administrator-summit.html admin-activity-log.html

The rails are the only bundle pages that establish a session (they run
tour-seed.js). Everything else redirects to a login.html the bundle does not
contain, so a direct visit reports a blank page and no misses -- which reads
as a clean result and is a page that never ran. Seed on a rail first, then
navigate within the same origin.

Prints, per page: __demoReplay.misses() / .missBodies(), and any element whose
text looks like the product's own failure copy -- because a page can replay
with zero misses and still be showing a failure band from a request that was
covered but answered with an error body.
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Chrome

PORT = int(sys.argv[1])
RAIL = sys.argv[2]
PAGES = sys.argv[3:]
BASE = 'http://localhost:%d' % PORT

PROBE = r"""
(function(){
  var r = window.__demoReplay;
  var bad = [];
  var rx = /(Couldn.t load|could not|Could not|unavailable|try again|failed|No answer came back|restarting)/i;
  [].slice.call(document.querySelectorAll('div,p,section,span,td')).forEach(function(e){
    if (e.children.length) return;
    var t = (e.textContent || '').trim();
    if (t.length > 12 && t.length < 220 && rx.test(t) && bad.indexOf(t) < 0) bad.push(t);
  });
  return {
    url: location.pathname,
    hasReplay: !!r,
    misses: r ? r.misses() : null,
    missBodies: r ? r.missBodies() : null,
    failureCopy: bad.slice(0, 6)
  };
})()
"""

with Chrome(port=9334) as c:
    t = c.new_tab(BASE + '/' + RAIL)
    t.wait_load()
    time.sleep(10)
    print('seeded on %s -> activeDb=%s' % (RAIL, t.eval('localStorage.getItem("rrv8.activeDb")')))
    for p in PAGES:
        t.navigate(BASE + '/' + p)
        t.wait_load()
        time.sleep(9)
        print(json.dumps(t.eval(PROBE), ensure_ascii=False))
