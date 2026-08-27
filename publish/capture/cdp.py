"""cdp.py -- drive a DEDICATED headless Chrome for a capture or a replay walk.

WHY THIS EXISTS AND NOT AN MCP BROWSER (capture-walk.md 0.4b)

A walk needs a browser that is not the owner's. A separate TAB in the owner's
browser is not that: it shares the profile, so it shares localStorage, and
`rrv8.activeDb` then races between the walk and whatever the owner is doing
(feedback_dont_share_browser). A separate --user-data-dir is a real boundary --
its own localStorage, IndexedDB and cookies -- and it needs nothing from the
owner's session to exist.

It also composites. reference_headless_analyzer_verification records that on
this box `document.visibilityState` is `hidden` and requestAnimationFrame NEVER
fires; measured 2026-08-27, that is a property of the ATTACHED browser, not of
the box. In an instance launched this way `visibilityState` is `visible` and
rAF fires, so anything the product gates on a frame actually runs.

    from cdp import Chrome
    with Chrome(port=9333) as c:
        t = c.new_tab('http://localhost:8765/home.html')
        t.wait_load()
        print(t.eval('document.title'))

Only dependency: `python -m pip install websocket-client`.

TRAP: without --remote-allow-origins the CDP websocket handshake is refused
403 with a message that reads like a permissions problem and is a flag.
"""
import json
import os
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def _http(url, method='GET'):
    req = urllib.request.Request(url, method=method)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode('utf-8'))


class Tab:
    def __init__(self, ws_url, port):
        self.port = port
        self.ws = websocket.create_connection(ws_url, timeout=180)
        self._id = 0
        self.send('Page.enable')
        self.send('Runtime.enable')
        self.send('Network.enable')
        # A capture walk must never be served a cached page. build-capture-staging
        # stamps a per-build __rrCaptureSession into every page's <head>, and
        # record-shim uses that stamp to decide whether to absorb the previous
        # page's entries or start a clean walk. A page served from Chrome's cache
        # arrives carrying the PREVIOUS build's stamp, so pages within one walk
        # disagree about which session they belong to and one of them wipes the
        # other's entries. Measured 2026-08-27: a two-page top-up saved only the
        # second page, twice, with no error anywhere.
        self.send('Network.setCacheDisabled', cacheDisabled=True)

    def send(self, method, **params):
        self._id += 1
        mid = self._id
        self.ws.send(json.dumps({'id': mid, 'method': method, 'params': params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == mid:
                if 'error' in msg:
                    raise RuntimeError('%s -> %s' % (method, msg['error']))
                return msg.get('result', {})

    def navigate(self, url):
        return self.send('Page.navigate', url=url)

    def eval(self, expr, timeout=170, await_promise=True):
        """Evaluate in the page. Load long snippets from a .js FILE rather than
        building them inline -- a backslash inside a shell heredoc is eaten and
        the resulting SyntaxError points at the wrong thing entirely
        (feedback_never_build_js_escapes_through_heredoc)."""
        r = self.send('Runtime.evaluate', expression=expr, returnByValue=True,
                      awaitPromise=await_promise, userGesture=True,
                      timeout=timeout * 1000)
        if r.get('exceptionDetails'):
            raise RuntimeError(json.dumps(r['exceptionDetails'])[:2000])
        return r.get('result', {}).get('value')

    def wait_load(self, timeout=90):
        end = time.time() + timeout
        while time.time() < end:
            try:
                st = self.eval('document.readyState', await_promise=False)
            except Exception:
                st = None
            if st == 'complete':
                return True
            time.sleep(0.4)
        return False

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


class Chrome:
    def __init__(self, port=9333, profile=None, headless=True):
        self.port = port
        # The profile goes to TEMP, never beside this file: it is a whole Chrome
        # user-data-dir (tens of MB, with its own IndexedDB holding recorded
        # response bodies) and this directory is a git repo.
        self.profile = profile or os.path.join(tempfile.gettempdir(),
                                               'rr-capture-chrome-%d' % port)
        self.headless = headless
        self.proc = None
        self.tabs = []

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *a):
        self.stop()

    def start(self):
        try:
            _http('http://localhost:%d/json/version' % self.port)
            return                                    # one is already up; reuse it
        except Exception:
            pass
        args = [CHROME,
                '--remote-debugging-port=%d' % self.port,
                '--user-data-dir=%s' % self.profile,
                '--no-first-run', '--no-default-browser-check',
                '--remote-allow-origins=*',           # see the module docstring
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows',
                '--window-size=1600,1100',
                'about:blank']
        if self.headless:
            args.insert(1, '--headless=new')
            args.insert(2, '--disable-gpu')
        self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL,
                                     stderr=subprocess.DEVNULL)
        end = time.time() + 40
        while time.time() < end:
            try:
                _http('http://localhost:%d/json/version' % self.port)
                return
            except Exception:
                time.sleep(0.5)
        raise RuntimeError('chrome did not expose CDP on %d' % self.port)

    def new_tab(self, url='about:blank'):
        t = _http('http://localhost:%d/json/new?%s'
                  % (self.port, urllib.parse.quote(url, safe=':/?=&.')), method='PUT')
        tab = Tab(t['webSocketDebuggerUrl'], self.port)
        self.tabs.append((t['id'], tab))
        return tab

    def close_tab(self, tab):
        for tid, tb in list(self.tabs):
            if tb is tab:
                tb.close()
                try:
                    urllib.request.urlopen(
                        'http://localhost:%d/json/close/%s' % (self.port, tid),
                        timeout=10).read()
                except Exception:
                    pass
                self.tabs.remove((tid, tb))

    def stop(self):
        for _, tb in self.tabs:
            tb.close()
        if self.proc:
            try:
                self.proc.terminate()
            except Exception:
                pass
