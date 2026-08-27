"""CAPTURE-TIME token signer. Scratchpad only -- never goes near bundle/.

Why it exists: the agents now verify RS256 (VLC-32 option B), and tour-seed.js
mints alg:none on purpose, because replay verifies nothing and a shipped bundle
must never carry or need a private key. A capture, unlike a replay, talks to the
real agents, so it needs a real signature.

Why it re-signs the seeder's OWN payload rather than minting a parallel one:
a hand-built parallel token can drift from the seeder (ports, company lists,
the `a` / `t.adm` pair). Re-signing the exact bytes the seeder wrote makes
divergence structurally impossible -- the claims ARE the seeder's claims.

POST /sign  body = the raw JWT the seeder wrote  ->  same payload, RS256-signed.

  python -m pip install cryptography      # the only dependency
  python sign-service.py 8792

The private key is read from ~/.rr-valc-jwt-keys/private.pem -- VALC's own
auth.jwt.key-dir since VLC-32 -- and never copied anywhere. Nothing here is
reachable from a built bundle.
"""
import base64, json, sys, os
from http.server import BaseHTTPRequestHandler, HTTPServer
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

KEY_PATH = os.path.expanduser('~/.rr-valc-jwt-keys/private.pem')
with open(KEY_PATH, 'rb') as f:
    KEY = serialization.load_pem_private_key(f.read(), password=None)


def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode('ascii')


def sign(unsigned_jwt):
    payload_seg = unsigned_jwt.split('.')[1]
    header = b64u(json.dumps({"alg": "RS256", "typ": "JWT"}, separators=(',', ':')).encode())
    signing_input = ('%s.%s' % (header, payload_seg)).encode('ascii')
    sig = KEY.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    return '%s.%s.%s' % (header, payload_seg, b64u(sig))


class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(n).decode('utf-8').strip()
        try:
            out = sign(raw)
            body = json.dumps({'token': out}).encode()
            self.send_response(200)
        except Exception as e:
            body = json.dumps({'error': str(e)}).encode()
            self.send_response(500)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self._cors(); self.end_headers(); self.wfile.write(body)

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8792
    print('signer on %d, key %s' % (port, KEY_PATH), flush=True)
    HTTPServer(('127.0.0.1', port), H).serve_forever()
