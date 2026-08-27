# capture-walk.md — the reusable capture-walk driver

The repeatable procedure for recording a demo chunk against the LIVE
product. Re-run this to reproduce or extend a capture. It is the automation
companion to `build-capture-staging.ps1` / `record-shim.js` /
`request-signature.js` and the coverage plan in
`RapidReconciler-AI/docs/plans/demo-capture-manifest.md`.

**The walk is now a program, not just a runbook.** These live beside this
file; the prose below is why they do what they do, and stays the place to
read before changing them:

| File | What it is |
|---|---|
| `cdp.py` | drives a dedicated headless Chrome over CDP (§0.4b) |
| `capture-drive.py` | one database per run: rails, then the audit exports, then the pages no rail touches |
| `capture-sign.js` | appended to the **capture-staging copy** of `tour-seed.js` to re-sign its token (§3c-2) |
| `sign-service.py` | the capture-time signer it posts to; holds the private key, and stays out of `bundle/` |
| `audit-cover.js` | the per-company focus + Excel export sequence (§3i) |
| `reload-cardex-preview.js` | fires the preview by hand on a database whose end-of-day snooze stops it firing by itself (§3i) |
| `rail-walk.py` | the OFFLINE control: walk a built bundle's rail and report `misses()` per beat |
| `page-check.py` | the same control for the pages NO rail visits — seeds on a rail first, because a direct visit redirects to a `login.html` the bundle does not contain and then reports zero misses for a page that never ran |
| `recording-inspect.py` | run this on a delta BEFORE merging (§4) |
| `recording-prune.py` | REMOVES entries — the operation merge cannot do, and §3j explains why appending is not always enough |

The walk runs THROUGH VALC (`capture/start`), not by self-serving :8765.
VALC (LocalSystem) stops the RR App, restages `capture-staging\` with the
shim injected, and serves it on :8765 from t=0 — so the shim patches
`fetch`/`XHR` before any product code runs and no first-load request is
missed. A user-context serve can't do this (the RR App holds :8765 and a
non-elevated session can't kill it).

---

## 0. Prerequisites — check ALL of these before you start

A capture is only worth running when every one of these holds. The first
one is the one that bites: it is a data/control-plane state check, not a
code check, and it is invisible until you see empty grids.

### 0.1 The browser token must scope to the DB + companies you intend to capture — THE #1 GOTCHA

The product picks the active DB from `localStorage.rrv8.activeDb`
(resolved BY NAME against the token's `dbs[]`, see `RRV8/config.js`
`RRDB`). Every work endpoint then carries `{companies:[...], period}` in
its body, and the Services agent **post-filters every returned row
against the token's per-DB allowed-companies list** (`i` in the JWT;
`TransactionsRepository.findRows` intersects `CompanyNumber` with
`userRequest.getAllowedCompanies()`). If the token's company list does
not match the company numbers actually in the DB, **every row is
filtered out and the grid is empty — with a 200, not an error.** You will
capture a walk full of `total:0` and not know why.

This is exactly what blocks Golden Harvest today (2026-07-17):

- Physical demo DBs on the box are `RapidReconciler_Demo1 / _Demo2 /
  _Demo3` (the Dev→Demo1 / NA→Demo2 / TR→Demo3 rename landed
  2026-07-10). Golden Harvest 30001/30002 lives in `_Demo3`, served by
  the agent on **:37384**.
- The token in the browser predates the rename. It lists DB names
  `RapidReconciler_NA / _TR / _Demo1` and scopes the Golden Harvest
  agent (:37384, labeled `RapidReconciler_TR`) to companies
  **`00001` / `00002`**. The DB's real companies are **`30001` /
  `30002`**. Intersection is empty → transactions/rows/variance all
  return `total:0` for every period, both companies.
- Verified three ways: `v8ui_reconcilingitems` holds 1,950 rows for
  30001 and 143 for 30002 (data is there); the agent at :37384 returns
  Golden Harvest periods (2022-02 .. 2023-05, routing is fine); and the
  same POST with the stale token returns `total:0` (the JWT filter is
  the cause).

**Check before every capture:** decode `localStorage.rrv8.token` and
confirm, for the DB you will capture, that the `dbs[]` entry's `i`
(companies) array equals the company numbers you expect the pickers to
show. Cross-check against SQL:
`SELECT DISTINCT CompanyNumber FROM <DB>.dbo.v8ui_reconcilingitems`.
If they differ, STOP — a walk will silently record empty screens.

**Fix (owner decision, one of):**

- **Preferred:** correct VALC's registration for the Golden Harvest
  client_database (right DB name, right `service_port`, and licensed
  companies = 30001/30002 — VALC Postgres `client_databases` /
  `client_licensed_company`, or the Clients admin page), then have the
  owner **log in fresh** at `http://localhost:8765/login.html`. Login
  mints the `i` list from those tables (`AuthController.resolveCompanyIds`),
  so a fresh token then carries 30001/30002 and both the picker and the
  agent filter line up.
- **Dev shortcut (needs explicit owner sign-off):** because the dev
  agent runs with `agent.jwt.skip-verification=true` (it parses the JWT
  payload without checking the signature), a locally corrected token —
  same user, same DBs, only the company numbers swapped to match the
  renumbered data — is accepted. This is a dev-fixture correction, but it
  edits an auth token, so it is the owner's call to make, not the
  driver's. (The automated agent is blocked from doing it by the safety
  classifier, by design.)

### 0.1b Pre-flight the DATA, not just the token — one call per surface

The token check above proves the scope lines up. It does not prove the
screens have anything on them, and a beat that opens a modal on a check
with zero flagged rows records an empty panel that nobody notices until
replay. Ask the agent directly before walking, from any page on the
:8765 origin (the token is already there):

```js
const tok = localStorage.getItem('rrv8.token');
const H = { 'Content-Type': 'application/json;charset=UTF-8', Authorization: 'Bearer ' + tok };
// Agent routes carry NO /api/v1 prefix -- rrFetch builds base + '/' + area.
await fetch('http://localhost:34537/inventory/integrity', { method:'POST', headers:H,
  body: JSON.stringify({ report:'v_integrity7_frozen_cost',
    reconciliationFilter:{companies:['80002','80008'],businessUnits:[],objects:[],subsidiaries:[],currencies:[]},
    take:20000, skip:0, page:1, pageSize:20000 }) }).then(r=>r.json());
```

Group the rows by `CompanyNumber` and you know which company carries the
story before spending a walk on it. Measured on Demo1 2026-08-20:
`v_integrity4_uom_conv` 2 rows (80002 only), `v_integrity7_frozen_cost`
301/134, `v_integrity5_gl_class` 5/1, `v6ui_itemrollintegritydialog` 8
across both. That is how it was known in advance that only 80002 opens
all three integrity modals.

Also worth a call: `GET /available-periods` (Demo1 tops out at
`2025-08-28`, prior `2025-07-31` — a year behind Demo2, and not
month-ends).

### 0.1c A once-per-session cache will hide a request from the recording

**This is the subtlest gap in the whole procedure.** Some reads fire
once per browser session and cache in `sessionStorage`, so a walk that
loads the same page ten times records them ONCE — with whatever scope
applied on the first load. If replay then asks with a different scope,
you get a miss on a screen the walk definitely visited.

Measured 2026-08-20: the DMAAI preload
(`POST /inventory/integrity[v_integrity_jde_aais]`, `loadDmaaisNow`) is
guarded by "already warmed this session" and only ever fired once, with
`period` 2025-07-31. The bundle asked for 2025-08-28 and missed — and
the visible symptom was not an error but a DEGRADED headline: "numbers
current to Aug 28, 2025. Account-mismatch checks load when you open
Transaction Variance" instead of "connected, numbers current to Aug 28,
2025, inventory loaded".

To capture a second scope of a once-per-session read: `sessionStorage.clear()`,
set the scope, reload. Do this for each scope the tour will visit.

### 0.2 AI must return 200 — and the health check is a VALC route, not an agent one

`POST /api/v1/ai/explain` is the demo centerpiece. Confirm it answers
before capturing AI surfaces, or you will record 403s where Opus
(`claude-opus-5`) answers belong.

**Do not ask the Services agent.** It does not serve `/api/v1/ai/health`
on any port — it answers **403** there. That is the same status a real
tier block returns, so the check this section used to prescribe fails its
own criterion by construction. Ask VALC, and pass the active database:

```
curl "http://localhost:8080/api/v1/ai/health?db=RapidReconciler_Demo3"
-> {"configured":true,"model":"claude-opus-5","maxLevel":"full"}
```

**`?db=` is not optional for the answer to mean anything.**
`AiController.health` (`@RequestParam(required = false) String db`)
resolves the tier from the database's owning client; with no `db` it
falls back to the unauthenticated caller's tier and answers
`maxLevel:"off"`, which also reads as a hard blocker and is not one.

Measured 2026-08-24 on this box, every call run:

| Call | Answer |
|---|---|
| `:34537/api/v1/ai/health` (agent) | **403** |
| `:8080/api/v1/ai/health` (no `db`) | 200, `maxLevel:"off"` |
| `:8080/...?db=RapidReconciler_Demo1` | 200, `maxLevel:"full"` |
| `:8080/...?db=RapidReconciler_Demo2` | 200, `maxLevel:"full"` |
| `:8080/...?db=RapidReconciler_Demo3` | 200, `maxLevel:"full"` |

Then confirm a small `ai/explain` POST returns a real body. The model is
**`claude-opus-5`** (`AiService.MODEL`), and it rejects `temperature`,
`top_p` and `top_k` (400 → VALC 502) — omit them.

### 0.3 The dev stack is up

`:8080` VALC, `:34537`/`:37384`/`:45585` the per-DB Services agents,
`:1433` SQL. `start-all.cmd` if not. Confirm the agent for your target
DB is serving the RIGHT data (hit `/available-periods` on its port and
check the period range matches the DB you expect).

### 0.4 A browser that is not the owner's — two ways, and the second is better

**(a) The MCP-connected Chrome.** The dev token persists per-origin, so a
tab on :8765 already carries it. **Do NOT hijack the owner's working
tab** — create your own with `tabs_create_mcp`, do all work there, and
close it when done.

**(b) A dedicated headless Chrome over CDP. Prefer this.** Measured
2026-08-27, when the MCP browser tools were unavailable for the whole
session and the entire capture cluster would otherwise have been blocked:

```
chrome.exe --headless=new --disable-gpu
           --remote-debugging-port=9333
           --user-data-dir=<scratchpad>/cprof9333
           --remote-allow-origins=*        # without this the CDP websocket
                                           # handshake is refused 403
           --no-first-run --no-default-browser-check
```

Then `PUT /json/new?<url>`, open the returned `webSocketDebuggerUrl`, and
drive `Page.navigate` / `Runtime.evaluate`. A ~150-line driver is enough;
`websocket-client` is the only dependency.

Three reasons it is the better option, not merely the fallback:

- **Isolation is structural.** `feedback_dont_share_browser` notes that a
  separate TAB in the owner's browser still shares the profile's
  localStorage, which is why the fix was two different browser apps. A
  separate `--user-data-dir` is a third, stronger separation: its own
  localStorage, IndexedDB and cookies. Nothing a walk does can reach the
  owner's session, and `rrv8.activeDb` cannot race.
- **It composites.** `reference_headless_analyzer_verification` records
  that on this box `document.visibilityState` is `hidden` and
  `requestAnimationFrame` NEVER fires. That is a property of the attached
  browser, not of the box: in this instance `visibilityState` is
  `visible` and rAF fires. Anything gated on rAF actually runs.
- **The walk is a file.** The driver is diffable and re-runnable, which is
  the "in-page walker" durability the bottom of this doc asks for, without
  having to inject anything into the product.

Because capture-staging serves on :8765, the token still carries by
origin — but a fresh profile has no token at all, so a CDP walk MUST
establish its own session. See §3c-2.

---

## 1. Start capture (through VALC)

```
POST http://localhost:8080/api/services/capture/start
```

VALC SecurityConfig is `permitAll`, so no auth header. It: (1) frees
:8765 (stops the RR App), (2) runs `build-capture-staging.ps1` to
restage with the shim injected, (3) serves `capture-staging\` on :8765
detached. Returns `{"started":true,"pid":N}`.

Then poll until staging answers (the FLAT path — the build flattens
`RRV8/` to the root):

```
curl http://localhost:8765/home.html    # poll until HTTP 200
```

`/home.html` 200 (not `/RRV8/home.html`) confirms staging is up.

---

## 2. Open the walk tab

1. `tabs_context_mcp` to see existing tabs. Leave the owner's alone.
2. `tabs_create_mcp` → your tab id.
3. `navigate` your tab to `http://localhost:8765/home.html` (flat URLs
   only — never `/RRV8/...`; the build flattened it).
4. Confirm the shim is live and the token is present:
   ```js
   ({ hasShim: !!window.__demoCapture, count: window.__demoCapture && window.__demoCapture.count(),
      hasToken: !!localStorage.getItem('rrv8.token'),
      activeDb: localStorage.getItem('rrv8.activeDb') })
   ```
5. Set the active DB for the chunk and reload so DB-global reads fire for
   the right DB:
   ```js
   localStorage.setItem('rrv8.activeDb', 'RapidReconciler_TR'); // Golden Harvest agent (:37384)
   ```
   (Use whatever `dbs[].n` the token gives for the target agent. Today
   Golden Harvest is labeled `RapidReconciler_TR` in the token even
   though the physical DB is `_Demo3` — routing is by the entry's `ip`,
   scope by its `i`.)

Record the original `rrv8.activeDb` and `rrv8.token` first so you can
restore them in step 6.

---

## 3. Walk each manifest entry — the network-gated loop

This is the make-or-break part. **Never use a fixed sleep** — it captures
half-loaded screens and leaves silent gaps. Gate on terminal network
status instead.

For every manifest entry (screen / scope / drill):

1. **Open `read_network_requests` BEFORE navigating.** It only tracks
   from its first call. Pass `clear:true` so counts don't accumulate
   across the same-domain nav.
2. Set scope (DB / company / period) via the footer controls, or by
   invoking the page's own scope setters, then navigate the flat URL or
   trigger the interaction/drill.
3. **Poll `read_network_requests` filtered to the expected endpoint(s)
   until each shows a TERMINAL status (not pending).** That is the
   between-screen gate. `urlPattern` is literal-substring, not regex.
4. Only then move to the next entry.

Chunk-1 entry list (Demo3 / Golden Harvest, companies 30001 then 30002,
the 2 most-recent periods `2023-05-31` and `2023-04-30`):

| Screen (flat URL) | Gate on (urlPattern substring) | Drills |
|---|---|---|
| `home.html` — Data Health tab | `inventory/integrity`, `admin/service-health`, `inventory/cardex-tolerance`, `api/v1/ai/health`, `admin/acks`, `poll` | DB/company/period switch |
| `home.html` — Transaction Variance tab | `available-periods`, `inventory/integrity` | period switch |
| `home.html` — Cardex Variance tab | `inventory/cardex-tolerance`, `inventory/integrity` | — |
| `home.html` — AI briefing + one Ask | `api/v1/ai/explain` | scripted Ask prompt |
| `inventory-transactions.html` | `inventory/transactions`, `inventory/reconciliation/rows`, `inventory/variance-component`, `available-periods`, `inventory/status` | card→`inventory/transactions/details`; GL-Class View→`v8ui_dmaai_routes`; DMAAI resolve; AI |
| `inventory-cardex-variance.html` | `inventory/integrity` (`v8ui_item_rollforward`), `inventory/as-of/details`, `inventory/adjustment-ledger` | adjust→`set-beginning-balance`; undo→`undo-adjustment`; as-of position→`inventory/as-of/item-position` |
| `inventory-asof.html` | `inventory/as-of`, `inventory/integrity`, `inventory/reconciliation/history`, `api/v1/ai/explain` | as-of run; AI |
| `inventory-account-rollforward.html` | `inventory/integrity` (`v6ui_raccountsummary`), `admin/activity` | roll-forward drill |
| `accounting-model-review.html` | `inventory/status`, `inventory/integrity`, `inventory/integrity/model-baseline`, `api/v1/ai/explain` | GL-Class View; approve→`model-approval`; AI |
| `accounting-dmaais.html` | `inventory/integrity` (`v_integrity1_aai_base`, `v_integrity3_exc_glc`), `inventory/integrity/aai-analysis-latest`, `inventory/integrity/aai-responses` | save→`aai-save-responses` |
| `inventory-variance-source.html` | `inventory/status`, `inventory/integrity`, `inventory/variance-component`, `inventory/reconciliation/history`, `reconciliation` | — |

Repeat the company-scoped screens for 30001 then 30002, and for each of
the 2 periods. DB-global reads (`available-periods`, `inventory/status`,
`cardex-tolerance`, `poll`, `service-health`) are period/company-
independent — captured once per DB, no need to re-walk per state.

Progress check any time: `window.__demoCapture.count()` and
`window.__demoCapture.dump().entries` (the entry list; each screen should
add to it). Confirm no `api/v1/ai/explain` entry has status 403.

### AI surfaces are prompt-keyed

`ai/explain` keys on the body hash of `{prompt}` (plus `{system,level}`
when sent). Auto-generated briefing prompts fire on load and are captured
for free. Free-form typing at replay will MISS. Capture the **scripted**
Ask prompts the tour uses — a fixed list, not ad-hoc. The full demo
prompt set is a separate tour-definition input (see Flags below); for a
validation run, fire one representative Ask per AI surface.

---

## 3b. WALK THE TOUR, NOT THE SCREENS — for any surface a rail will replay

**Added 2026-08-24 after three failed attempts to reproduce two signatures by
hand.** If the surface you are capturing is going to be replayed by a tour rail,
capture it by driving **the rail itself**, not by visiting the same screens in
the same order.

Copy the rail and the seeder into the staging directory and open it on :8765:

```
copy tour\analyst-golden.html  capture-staging\
copy tour\tour-seed.js         capture-staging\
```
then walk `http://localhost:8765/analyst-golden.html` with its own Next button.

The staging build serves flat, which is the same layout the bundle serves, so the
rail's iframe loads the product from the same origin and the injected record shim
sits inside that iframe. `__demoCapture` therefore lives on the **iframe's**
window — reach it as
`document.querySelector('iframe').contentWindow.__demoCapture`.

**Why this is not just tidier — it is the difference between a hit and a miss.**
`ai/explain` keys on the body hash, and the day brief **re-asks as its facts
arrive**: measured on Demo3, one page load fired the same `ctx` with THREE
different body hashes (`2ceaefac`, `08a8a0a9`, `3cb20515`). So "the prompt for
company X period Y" is not one request, it is a family of them, and which member
fires depends on the exact state and timing of the walk. Visiting the same
screens by hand produced a different member every time and never the one the
bundle was asking for — that one had been produced against data that had since
moved.

Driving the rail removes the guesswork: every request recorded is by construction
a request the rail makes, because the rail made it. This is what
`docs/architecture.md` means by "keep the tour definition and the capture list as
one thing", and `tour/README.md` by the same rule.

Restore afterwards: delete the copied rail and seeder from `capture-staging\`
(the next `capture/start` rebuilds the directory anyway), and note that
`tour-seed.js` **mints its own token on the :8765 origin**, so whoever was signed
in there is signed out. Sign back in if the next walk needs a real login.

---

### 3c. An admin walk needs `a` on the token, not just `t.adm`

**Measured 2026-08-25 walking `administrator-summit` on Demo1.** The Administrator
lane rendered, every card painted, and `GET /inventory/fiscal-period-end-detect`
came back **403** anyway. Two consumers read the admin grant from two different
per-database claims and neither falls back to the other:

| Consumer | Reads | Source |
|---|---|---|
| `home.html` `isAdmin()` | `dbs[].t.adm` | `RRV8/home.html:3598` |
| Services agent `requireAdmin()` | `dbs[].a` | `JwtAuthFilter:172` |

`tour-seed.js` used to mint only `t.adm`, so a seeded admin token was admin to the
UI and **non-admin to the agent** — the worst shape, because the page had already
decided the user could administer and then the data refused. A real login token
cannot disagree with itself: `AuthController:735` stamps `a` and `t.adm` from the
same `rTabAdm`. `tour-seed.js` now mirrors that. Fixed and confirmed by control on
one page load: 403 before, 200 after, nothing else changed.

If you add a claim to the seeder, check BOTH consumers. The agent also reads
`as`, `aite`, `aprs`, `rs` and `su` off the same entry.

### 3c-2. The agents verify RS256 now, so a CAPTURE has to sign. A replay never does.

**Live since VLC-32 was ruled option B, 2026-08-27.** `auth.jwt.key-dir` on
VALC points at `C:\Users\EdwardGutkowski\.rr-valc-jwt-keys`, and every
VALC-spawned agent logs `JWT signature verification enabled (RS256, key=…
public.pem)`. Verification did not go away; only the trust anchor moved to a
keypair a walk can sign with.

`tour-seed.js` still mints `alg:none`, **and that stays true.** Replay
intercepts the network and verifies nothing, so a shipped bundle carrying a
private key would buy nothing and leak everything. The file's own header says
so. Signing is a CAPTURE-time concern and lives in `publish/capture/` —
never in `bundle/`, never in `tour/`.

**Re-sign the seeder's own payload; do not mint a parallel token.** A
hand-built token drifts from the seeder — the dynamically resolved ports, the
company lists, the `a` / `t.adm` pair of §3c. Take the JWT the seeder just
wrote, keep its payload segment byte-for-byte, swap the header to
`{"alg":"RS256"}` and sign. The claims then ARE the seeder's claims and
cannot disagree with it. The capture driver does this by appending a wrapper
around `RRTour.seed` to the **capture-staging copy** of `tour-seed.js`
(gitignored, rebuilt by every `capture/start`), pointed at a scratchpad
signing service holding the private key.

Assert the result before walking a single beat:

```js
JSON.parse(atob(localStorage.getItem('rrv8.token').split('.')[0])).alg   // 'RS256'
```

If that is not `RS256`, **abort the walk**. An unsigned token records 403s,
and §3e is about why those must never reach a recording.

**`sub` is not optional, and the agent will not tell you.** `JwtAuthFilter`
reads the username from `user.u` and only falls back to `sub`, so an
agent-only walk works fine without it. VALC does not fall back. MEASURED
2026-08-27 with two RS256 tokens signed by the same key differing ONLY in
`sub`: `GET /api/v1/messages` answered **401 without it and 200 with it**.
Every `/api/v1/messages` entry in that day's Demo3 delta was a 401, at every
position in the walk, while `/api/v1/ai/explain` on the same VALC and the
same token answered 200 twenty times — which reads as a per-route auth quirk
and is a missing claim. `tour-seed.js` now mints `sub`, mirroring
`AuthController`.

---

### 3c-3. The first page of a NEW capture session can report the OLD session's count

**Measured 2026-08-27, and it silently threw away most of two walks.**
`build-capture-staging.ps1` stamps a fresh `__rrCaptureSession` per build, and
`record-shim.js` starts a new walk clean on a new stamp — but it hydrates from
IndexedDB asynchronously. So the FIRST page loaded after a `capture/start` can
answer `__demoCapture.count()` with the PREVIOUS session's total, and the reset
lands afterwards.

What that looks like: Demo2's `home.html` reported **41** — which was Demo1's
final count from the previous session — and the very next page reported **4**.
Everything home.html recorded was gone, and the walk log read like a page that
had simply made fewer requests.

**A quiescence gate cannot see this.** The number is not moving because it is
the old one, so waiting longer confirms it harder. Nothing throws, the save
succeeds, and the delta is short by exactly one page.

**The reload trick is not enough on its own, and the reason is the HTTP cache.**
Reloading first and counting after still lost the page, twice. The stamp is
INLINE in each page's `<head>`, so a page Chrome serves from cache arrives
carrying the PREVIOUS build's stamp — and then two pages in one walk disagree
about which session they are in, and the one with the newer stamp wipes the
other's entries on its first `persist()`. Nothing errors; the save reports a
cheerful count of whatever survived.

So a capture walk must run with the cache off. `cdp.py` sends
`Network.setCacheDisabled(true)` on every tab it opens. In a hand-driven walk,
open DevTools and tick "Disable cache", or hard-reload every page. Belt and
braces: land on a THROWAWAY shimmed page first, so the page you actually care
about is never the one absorbing the reset, and read `__rrCaptureSession` on
each page — every page of one walk must report the same value.

---

### 3d. Seed BEFORE the first page load, or you record the last walk's database

**Measured 2026-08-25 capturing Demo2's admin lane.** `rrv8.activeDb` persists per
origin, so opening `home.html` on :8765 boots against whatever database the
PREVIOUS walk left active. Seeding after that first load and reloading is too
late: the first load's reads are already in the recording, scoped to the wrong
database. The Demo2 delta arrived carrying
`ai/health?db=RapidReconciler_Demo3` and three
`license-usage?database=RapidReconciler_Demo3` entries.

Those entries are inert at replay — a Demo2 rail never asks with `db=Demo3` — but
they are one dataset's rows filed under another's label, which is the thing the
per-database manifest exists to prevent. Strip them before merging; do not argue
they are harmless.

Two ways to avoid it, both cheap: land on a page that makes no scoped reads
(`index.html`), seed there, THEN navigate to `home.html` — or walk the rail
itself, which seeds before its iframe loads and is what §3b tells you to do
anyway.

Verify per-database scope on any delta before merging:

```
python -c "import json,collections;d=json.load(open('delta.json',encoding='utf-8'));print(collections.Counter(q for e in d['entries'] for q in [e.get('query') or ''] if 'Demo' in q))"
```

### 3e. A 401 or 403 does NOT belong in a merged recording

A replayed 401 makes `misses()` read **clean** while the panel behind it is still
degraded — the gap stops reporting itself. Leave the failed entry out and the
signature stays missing, which is what puts it in `misses()` and in the bundle's
own red "missing recordings" toast, on screen, where somebody sees it.

Measured 2026-08-25: the three VALC routes behind `parseBearer` →
`JwtService.verify` (`clients/current`, `clients/current/access-reviews`,
`api/v1/messages`) cannot be captured with a tour-seeded token at all —
`verify()` is `parseSignedClaims(...).verifyWith(publicKey)` and the seed mints
`alg:none`. They need a real signed login. Excluding them left exactly two
signatures in `misses()` across the whole admin rail, both naming the one root
cause, which is a better handoff than a rail that looks finished.

**SUPERSEDED IN PART, 2026-08-27.** A capture is no longer limited to what an
unsigned token can reach: §3c-2's re-signing gives the walk a real RS256
token, and `GET /api/v1/messages` answers 200 with one — provided it carries
`sub`, which `tour-seed.js` now mints. So the Message Center IS capturable.
It has NOT been captured: all three recordings still hold that signature as a
401 from an older walk, and because merge is append-only-if-absent, a delta
that finally records the 200 is dropped. Closing it needs a
`-Refresh '/api/v1/messages'` on all three, and that is a demo-CONTENT
decision — it puts an operator message banner above everything on Home — so
it is the owner's call, not a merge detail. The rule above is unchanged: do
not let a 401 into a recording.

---

### 3f. A seeded token BLOCKS a later real sign-in, silently

**Measured 2026-08-25, and it cost three round-trips with the owner.** After a
rail walk leaves a `tour-seed.js` token on the :8765 origin, sending the owner to
`http://localhost:8765/login.html` does **not** show them the form.
`login.html` has an "already signed in -> resume" branch: if
`localStorage.rrv8.token` exists and passes `isAdminToken()`, it redirects
straight to Home without rendering the sign-in fields. The seeded token passes
that test easily &mdash; `adm: true`, `exp` in 2036 &mdash; so the page bounces
them to a Home that greets them by name. From their side they are signed in.
Nothing is wrong with that branch; it just assumes the token is real.

**And `last_login_at` is NOT proof a token was issued.**
`AuthController` stamps `user.setLastLoginAt(Instant.now())` and saves at line
~160, **before** the client-eligibility check and before `jwt.mint()`. It also
updates for a sign-in to the VALC dashboard on :8080, which shares the `users`
table. So the owner's credentials updating `last_login_at` twice, while no JWT
appeared on any origin, was entirely consistent &mdash; and it read like the
login was working.

Before asking for a real sign-in, clear the fixture first:

```js
['rrv8.token','rrv8.activeDb','rrv8.viewRole','rrv8.aiTier',
 'rrv8.sessionStart','rrv8.lastActivity'].forEach(k => localStorage.removeItem(k));
```

Then confirm the form actually renders (no token -> stays on `login.html` with
the email + password inputs visible) rather than assuming it will. Note the
email field pre-fills from `rrv8.lastEmail`, which after an analyst walk holds
`andy@rrdemo.com` &mdash; submitting the prefill signs you in as the wrong
persona.

Diagnosing it the other way round is the cheap route: `rrv8.token`'s third
segment is the literal string `demo` on a seeded token, and a real login token's
`dbs[0]` carries 13 keys (`as`, `aite`, `aprs`, `rs`, `su`, `rn`, `m` ...) where
the seeder writes 6.

---

### 3g. Run merge-recording.ps1 from PowerShell, never through Bash

**Measured 2026-08-25.** `-Refresh '/api/v1/admin/clients/license-usage'` passed
through the Bash tool arrives at the script as
`C:/Program Files/Git/api/v1/admin/clients/license-usage` &mdash; MSYS rewrites a
leading-slash argument into a Windows path. `Test-Refresh` uses `StartsWith`, so
nothing matches and the stale response ships.

**It does not look like a failure.** With two prefixes in the list, the second one
still matched, so the run reported a confident `refreshed (already present): 3`
and printed a list of appended entries. Only reading the merged file showed the
licence body was still `used:12, atLimit:true` after a merge that had announced
success. The script's own header documents this same symptom from 2026-08-22 via
a different route (PS 5.1 splitting) &mdash; the lesson generalises: **the
refresh count is not evidence the right path was refreshed.**

Two rules:

- Invoke it with the PowerShell tool, and pass **absolute** paths for `-Base`,
  `-Delta` and `-Out`. The script resolves relative paths against the process's
  original working directory, not `Set-Location`, so a relative `-Base` fails to
  read from the wrong folder.
- After any `-Refresh`, read the merged file and confirm the **last** entry for
  that signature carries the new body &mdash; `pick()` sticks on the last one:

```
python -c "import json,base64; d=json.load(open('recording-demo1.json',encoding='utf-8')); \
b=d.get('bodies') or {}; e=[x for x in d['entries'] if 'license-usage' in x['path']]; \
v=b.get(str(e[-1].get('bodyRef'))) or e[-1].get('body'); print(v[:120])"
```

---

### 3h. Never copy a product file into the bundle by hand. Rebuild.

**Measured 2026-08-25 after session #59 did it to two files.** There is no
"refresh one page from main" operation. `build-demo.ps1` step 5e injects

```
<script src="/date-freeze.js"></script><script src="/request-signature.js"></script><script src="/replay-shim.js"></script>
```

at the top of every `<head>` in the OUTPUT directory. The line does not exist in
`RapidReconciler-AI/RRV8/`, so a hand-copied page arrives without it and the
shim never patches `fetch`.

What that looks like from the outside: the page renders normally. There is no
error, no toast, and no miss &mdash; `misses()` cannot report a gap because the
object that counts them was never created. `home.html` and
`admin-claude-assistant.html` were served this way on `:8770` and were talking to
the live VALC on `:8080` and the live agent on `:34537`. Both happen to run on
the build box, which is precisely why nothing looked wrong here and Home would
have been dead on a presenter's laptop. `date-freeze.js` goes with it, so the
demo clock unpins too.

Check it in one line before trusting any bundle:

```
for f in *.html; do grep -q "replay-shim.js" "$f" || echo "NO SHIM: $f"; done
```

Seven files are SUPPOSED to be listed: the six rails and `index.html`. They are
staged after 5e on purpose (a shimmed tour shell would try to replay its own
static asset reads). Anything else in that output is a broken bundle.

And do not argue from file identity. "Byte-identical to the file that was
verified live" was the reasoning that skipped the confirming walk, and it is
backwards: **a correct bundle page is never byte-identical to main.** The
rebuild's diff is what identity should look like &mdash; 157 files in both, two
files differing, 128 bytes each (3 BOM + 123 boot line + 2 newline).

Rebuild per the trap note: build to `bundle-next` with `RR_BUNDLE_DIR`, verify it
on its own port, stop the serve, then rename. Keep the old directory until the
re-walk passes.

---

### 3i. A per-company AI surface needs the company control, and it is not where you'd look

**Measured 2026-08-27 capturing UI-153's `auditcover` ctx.** The audit Excel
export is scoped to the accountant's FOCUS company (`_auditCo` =
`_acctFocusCo(...)` in `RRV8/home.html`), so one export yields one
`?ctx=auditcover-<tier>-co<NN>-<period>` and the walk has to move the focus
between exports. Three things about that control cost a run:

- The only thing that moves it is `input[data-cos-acctco]` in the footer
  company menu, and the menu renders those inputs **only on the accountant
  detail tabs** (`data-sv="account"` / `"perpetual"`). On Overview the same
  menu renders `data-cos-co` CHECKBOXES, which are the include/exclude
  what-if filter and change the focus company not at all.
- Picking one **persists to `rrv8.acctCompany.<db>` and reloads the page**
  (UI-31). The export has to wait for that reload, not just for the click.
- The menu's rows read `Co 30001`, not `30001`. A scrape that matches a bare
  number finds nothing and reports an empty company list, which looks like a
  scope problem and is a selector problem. Read the focus back off
  `.aud-hdr-co` / `.aud-hdr-cn` after the tab opens and print it — the export
  is only worth what the header says it was.

The whole sequence, per company: `[data-sv="account"]` → `#haCosBtn` →
`input[data-cos-acctco="<co>"]` → wait for the reload → `[data-sv="audit"]`
→ `#auditReportMenu` open → `[data-audit-report="excel"]`.

**A request the LIVE product does not make can still be one the REPLAY makes.**
Same shape, different page. `admin-reload-cardex.html` auto-previews only when
the end-of-day snooze is clear, and the snooze is a SERVER ack read from
`/admin/acks` — so on a snoozed database `loadPreview()` never fires at capture
time, while an older `acks` body sitting first in that signature's sequence lets
it fire at replay. The bundle then asks for
`reload-cardex/preview?fromDate=…` and misses, and the walk log shows nothing
wrong because the walk genuinely never made that call.

The fix is not to clear the snooze on a demo database to suit a fixture. It is
to make the request the way the admin does — set `#js-from` and dispatch
`change`, which is the page's own handler
(`$('js-from').addEventListener('change', loadPreview)`). `reload-cardex-preview.js`
does exactly that, with the `suggestedDate` read out of the recording's own
`eod-check` response rather than constructed.

### 3i-2. Rebuilding the bundle snapshots whatever `RRV8/` is RIGHT NOW

`build-demo.ps1` copies the product from `RapidReconciler-AI/RRV8` every time.
So a rebuild does not only publish your new recordings — it publishes whatever
else has landed in the UI repo since the last one, and any request that new
code makes is a request nothing has captured.

**Measured 2026-08-27.** A rebuild picked up UI-162's `RRV8.offsetStore`, which
calls `GET /inventory/gl-offset-account` from the accountant Home. All three
agents answered **404** — the agent half was written and compiled, but the
deployed jar predated it — so the capture recorded a 404 and the three
accountant rails each grew one miss. Neither half was wrong; they were just
hours apart, and the bundle sat in between.

Two habits close it:

- **Record the UI repo's SHA and `git status` at build time**, and check the log
  between it and the previous bundle. Anything touching `RRV8/` is a candidate
  for a new uncaptured request.
- **Re-run the rail control after every rebuild, not only after a capture.** A
  rebuild changes the product half of the pair; that is exactly as likely to
  introduce a miss as a re-record is.

And when the miss is a 404 rather than a gap: do NOT capture it (§3e). Wait for
the jar, confirm the endpoint answers 200, then walk the one page. That is what
happened here — jar rebuilt, agents respawned, endpoint 200 on all three ports,
one short pass per database, done.

### 3j. `aai-responses?runId=` is captured pinned to one analysis run

`GET /inventory/integrity/aai-responses` takes a REQUIRED `runId` and
`accounting-dmaais.html` reads it out of `aai-analysis-latest._meta.runId`.
That value is the timestamp of the latest DMAAI analysis
(`2026-08-27T13:35:12.759Z` on Demo3 the day this was written), and
`request-signature.js` folds the sorted query into the key. So the captured
entry matches only while that run is still the latest one; the next analysis
on that database changes the runId and the recording can never match again.
It is stable within a session — three calls returned the same runId — so it
captures cleanly; it just does not survive a re-analysis. If a bundle starts
missing this one signature, re-analysis is the first thing to check, not the
capture.

**And the two endpoints are a KEY AND A LOCK. Refresh both or neither.**
This is the part that a merge silently gets wrong, measured 2026-08-27 on
the rebuilt Demo1 bundle. `merge-recording.ps1` appends only signatures the
base has never seen, so a freshly captured
`aai-responses?runId=2026-08-27T13:08:44.795Z` merged cleanly — while the
base's `aai-analysis-latest` body still carried
`runId=2026-08-20T12:51:26.440Z`. At replay the page read the OLD runId out
of the OLD analysis body and asked for a response nothing had recorded, so
`accounting-dmaais.html` reported exactly the miss the capture existed to
close, and the entry that would have answered it sat unreachable in the same
file.

The fix is `-Refresh '/inventory/integrity/aai-analysis-latest'`, and it is
safe to a degree worth measuring rather than assuming: diffing the base body
against the new one on all three databases, `fixFirst`, `askCustomer`,
`modules` and `ignoreBlurb` were byte-identical and **only `_meta` differed**
(the runId and the analysis date). `home.html`'s Transaction Variance tab
reads `fixFirst` off the same endpoint and is on every analyst rail, so that
check is what makes the refresh safe rather than merely convenient.

Generalise it: **whenever a captured request's query is derived from another
recorded response, the pair moves together.** Refreshing the derived half
alone is a guaranteed miss, and it is a miss that looks like a capture gap.

## 4. Verify coverage before saving

- `window.__demoCapture.count()` grew across the walk and matches roughly
  the number of screens × scope-states you walked.
- No `403` on any `api/v1/ai/explain` entry (`dump().entries.filter(e =>
  e.path.includes('ai/explain') && e.status===403)` is empty).
- No per-screen miss: each screen's expected endpoints appear as entries
  with terminal status.
- Spot-check that company-scoped POSTs returned real data (a body with
  `total>0` where the DB has variance), not `total:0` — that catches the
  0.1 token/scope trap immediately.

Then run the delta through `recording-inspect.py` before merging anything.
It reports the four things a walk gets silently wrong — foreign-database
query strings (§3d), 401/403 entries (§3e), decode holes, and whether the
endpoints the walk existed to capture are actually in it — and it takes a
list of files, so a base and its delta can be compared side by side:

```
python recording-inspect.py delta-demo2-s62.json
```

**A walk that "went fine" is not evidence.** The Demo3 delta of 2026-08-27
reported `companies in scope: []` and completed exit 0 with zero audit
exports in it; the driver's own log said nothing was wrong because nothing
had thrown. The inspector's `ctx=auditcover  0` is what caught it.

---

## 5. Save + stop

Two options. **Prefer the manual sequence** during a driven walk so you
control the filename and don't lose the tab to the auto-close race:

```js
// 1. inspect first (the Save button auto-closes the tab after ~900ms)
window.__demoCapture.count();
window.__demoCapture.size();   // { entries, distinctBodies, pooledChars, savedPct, decodeFailures }
// 2. download with an explicit filename
window.__demoCapture.download('recording-demo3.json');
```

`size().decodeFailures` must be **0**. Anything else means at least one response
was recorded as a hole with a 200 on it; re-walk that screen before saving.
```
POST http://localhost:8080/api/services/capture/stop   // restores the RR App on :8765
```

The in-page **Save button** does all of this in one click (download →
POST stop → close tab), but it always names the file `recording.json` and
closes the tab before you can inspect. If you use it, read
`window.__demoCapture` FIRST, then click Save.

The download lands in Chrome's default download folder. If a programmatic
download doesn't persist to disk in the automated context, read
`window.__demoCapture.toJson(true)` and write the file yourself (watch
the size — base64 response bodies can be large; chunk if needed).

### 5a. In an MCP-driven walk the download does NOT persist — POST it instead

Measured 2026-08-20: a `Blob` + anchor-click download of the recording
never reached disk, while jsPDF's own `doc.save()` on the same page did.
Do not fight it, and do not try to return 50 MB of JSON through the
agent's own tool channel. Stand up a one-shot loopback sink and POST to
it:

```
powershell -ExecutionPolicy Bypass -File recording-sink.ps1 -Port 8791 -OutFile <path>
```

then from the walk tab:

```js
await window.__demoCapture.saveTo('http://localhost:8791/save');
// -> { posted: 200, entries: 115, bodies: 43 }
```

**Use `saveTo()`, not your own fetch.** The shim records every network call, so a
page-level POST of the recording ends up IN the recording: the first Demo3 walk
shipped a `POST /save` entry that way. `saveTo()` suppresses recording for the
duration of its own request, so it cannot happen.

The sink is a `System.Net.HttpListener` with permissive CORS that writes
one request body to a file and exits.

**Use `reconciled()`, not `dump()`.** `dump()` returns the in-memory buffer
only. The recording accumulates across page navigations through IndexedDB, and
the union of the in-memory buffer with the persisted snapshot is what
`download()` builds and what `reconciled()` now exposes. Exporting `dump()` on a
multi-page walk can silently ship one page short — `count()` looks right a
tick earlier, which is exactly why it goes unnoticed.

### 5b. Size is handled in the shim now — do NOT hand-dedupe

**There is no dedupe step in this procedure any more. If you find yourself
pasting a "drop consecutive identical responses" snippet into the console,
stop: you are re-introducing a defect that has already been fixed.**

The problem was real. The raw buffer for the Demo1 analyst walk was **349 MB**
across 553 entries, because `POST /inventory/transactions` returns the full grid
(5,341 rows for co 80002, ~4.5 MB) and the walk loaded it 74 times.

The old fix was a console snippet that dropped consecutive byte-identical
responses per signature. It got the size down to ~40 MB, and it was **lossy in
the one place that matters** — see 5c: a save-and-reflect beat depends on the
exact NUMBER of before-state reads, and the snippet collapsed
`[before x3, after x4]` to `[before, after]`, which flips the card on the next
page's own boot. That is the "appears to work" failure the ordering rule exists
to prevent, and it was two paragraphs above the warning about it.

`record-shim.js` now solves it losslessly with a **body pool** (recording format
v2). Every distinct response body is stored once under `bodies`, and each entry
carries a `bodyRef` into it. Nothing is ever dropped, so:

- sequence lengths are preserved **structurally** — there is no exemption list
  for anyone to forget;
- the 74 grid loads cost one copy of the grid, not 74;
- `replay-shim.js` resolves `bodyRef` lazily, so the pre-pool size never lands
  in browser memory at replay either.

v1 recordings (inline `body`, no pool) still replay unchanged — `bodyOf()`
prefers `bodyRef` and falls back to `body` — so `recording-demo1.json` and
`recording-demo2.json` need no re-record.

**The size is on the Save button.** It reads
`⬇ Save recording (86 · 40.2 MB)` — entry count and pooled megabytes,
live. Both numbers used to be invisible until after the save, which is how a
349 MB buffer got produced twice. `__demoCapture.size()` reports the same thing
plus `savedPct` and `distinctBodies`.

**Watch the Save button for `DECODE FAIL`.** A response the shim cannot decode
used to be swallowed into an empty string and recorded as a successful 200 —
a hole that replays as an empty body with nothing anywhere to say so. It is now
counted, logged loudly, and marked on the entry (`decodeFailed: true`), and
`__demoReplay.stats()` reports `decodeFailedEntries` on the replay side. Any
non-zero count means re-walk that screen; do not build a bundle from it.

### 5c. A save-and-reflect beat is a COUNT, not just an order

`replay-shim.js` serves a signature's entries in capture order and sticks on the
last. So the number of before-state entries has to equal the number of reads that
happen **before** the presenter clicks Save. Measured on Demo1: Home's boot reads
`GET /inventory/txv/resolutions?company=<co>` **twice**, and the Transaction
Variance tab click reads it a third time. `[before, after]` therefore showed the
recorded finding before anything was saved.

The pool (5b) means a normal walk now preserves this for free — the counts are
whatever the walk actually did. Measured on the two shipped recordings: 9
multi-entry signatures each, `txv/resolutions?company=80003` carrying 7
(before x3, after x4). Two tools remain for when a count still needs checking:

- `__demoReplay.served('txv/resolutions')` prints which sequence position each
  signature has served, in call order. Measure, don't guess.
- `publish/capture/tune-save-sequence.ps1` duplicates the first entry of one
  signature N times, as a text splice. **Last resort.** If a count is wrong the
  honest fix is to re-walk the beat, because a duplicated entry is a fixture, not
  a capture.

And the shim persists its pointers in `sessionStorage`, so a save on one page
reflects after navigating to another. Call `__demoReplay.resetSequence()` to
rewind a run.

### 5c-2. Merging chunks: use merge-recording.ps1, and read what it prints

`merge-recording.ps1 -Base <master> -Delta <chunk> -Out <master>` appends only
the signatures the base has never seen, so an existing signature's sequence is
never disturbed. `-Refresh <path prefixes>` is the narrow exception for a surface
whose data genuinely changed — never for a signature whose sequence a beat
depends on.

**`-Refresh` out-votes; it does not replace. See §3j.** The appended entry only
wins once the sequence has been drained, so a signature the base holds several
times still serves its stale HEAD to the first caller. When the stale copies have
to go, `recording-prune.py` is the tool; a `-Refresh` on top of a many-entry
sequence is the failure mode that looks like a fix.

**Append-only also means a merge can put back what a prune removed.** A delta
captured before the prune still carries the entry; merging it afterwards
re-adds it, because the base no longer holds that signature and it therefore
counts as new. Measured 2026-08-27: a 404 pruned from `recording-demo1.json`
came back on the next top-up merge. Re-run the prune report after the LAST
merge, not after the first.

It locates the entries array by a string-aware structural scan, not by searching
for a `]}` tail, and it reads signatures the same way. The old textual version
spliced a new entry at char 41,666,807 of the 48.9 MB Demo2 base — inside
another entry's escaped body — because that file ends
`..."}],"session":"..."}`, so `entries` is not the last key and there is no `]}`
at the tail to find. The output parsed in neither Python nor the browser, and the
browser symptom was `fetch('/recording.json')` returning **4 bytes of `null`**
while `curl` returned the whole file, which reads as a server bug and is not one.

It verifies its own output and exits 1 if the entry count is wrong, so trust the
final line, and note that it inlines a v2 delta's pooled bodies into the appended
entries (a mixed file replays fine).

### 5d. Stop the bundle server before running build-demo

`build-demo.ps1` wipes `bundle/` first. A serve running out of that
directory holds a lock, the copy fails, and you are left with an EMPTY
bundle and no `launch.ps1` — which reads like a build script bug and is
not one. Stop the serve, build, restart the serve. (This is session
#24's "locked bundle" blocker; it recurred twice on 2026-08-20.)

Feed the result to `build-demo.ps1 -Recording <path>`. Under the
partition-by-DB plan (manifest option A) name it per DB
(`recording-demo3.json`, ...).

---

## 6. Teardown / restore

**:8765 IS THE OWNER'S PRODUCT URL. A capture takes it away from him.**
Staging serves the V8 app FLATTENED — `home.html` at the root, no `RRV8/`
prefix, no `index.html` — so while a walk is running, every bookmarked
product path and the bare `http://localhost:8765/` answer 404. That is the
design (§1: the shim has to be in place from t=0 and only VALC can free the
port), but nobody watching from outside can tell it from a broken server.
Two rules follow, and they cost nothing:

- **Say so before a long capture, and say when it is back.** A multi-database
  walk holds the port for the better part of an hour.
- **`POST capture/stop` the moment the last save lands** — not at the end of
  the whole session, and not after the merge and rebuild, which need nothing
  from :8765. Do this even if another pass may follow later; re-taking the
  port costs one request.

- Confirm the RR App is back: `curl http://localhost:8765/RRV8/home.html`
  → 200 (Save's auto-stop, or the explicit `capture/stop`, rebinds :8765
  to the UI repo root). If not, `POST capture/stop` again. A 404 on the bare
  `/` is NOT a leftover — the UI repo root has no `index.html`; check
  `/rapidreconciler-help.html` instead, which is the customer-facing cover.
- Restore the browser state you changed: put `rrv8.activeDb` and
  `rrv8.token` back to what you recorded in step 2 (matters when you
  used the 0.1 dev-token shortcut).
- Close the tab you created. Leave the owner's tab untouched.
- Confirm no stray serve processes on :8765 other than the restored RR
  App.

---

## Durability — the walk is code now, and where it still is not

This section used to say the walk lived in an agent's head and should be
promoted to an in-page walker. **Half of that happened on 2026-08-27**, out
of necessity rather than tidiness: the MCP browser tools were unavailable
for a whole session, so the walk had to become a program to happen at all.
`capture-drive.py` + `cdp.py` now encode the page list, the scope steps and
the terminal-status gates, and `rail-walk.py` encodes the control. Three
sessions' worth of runbook prose is executable, deterministic and diffable.

What is still prose, and matters:

- **The gate is entry-count quiescence, not a network filter.** The driver
  waits for `__demoCapture.count()` to stop growing. That is cheaper than
  §3's `read_network_requests` polling and covers the same failure (moving
  on mid-load), but it cannot tell "finished" from "stalled" — a hung
  request looks exactly like a quiet one. It has a hard cap and reports the
  count it stopped at; read that number.
- **It is not one source with the tour definition.** The rails are walked by
  their own Next button, so those surfaces stay in sync by construction
  (§3b). The pages NO rail visits are a hand-maintained list at the top of
  `capture-drive.py`. Adding a product page still means adding it there, and
  nothing will tell you if you forget — which is exactly how UI-158's six
  endpoints went uncaptured for a month.
- **An in-page walker is still the better end state** for the same reason it
  always was: injected alongside the shim, it cannot disagree with the
  product about what loaded.

---

## Flags / separate inputs (not part of this driver)

- ~~**pdf.js CDN vendoring**~~ — **withdrawn 2026-08-20.** Measured: that
  file has no external references, and the PDF path is jsPDF +
  autoTable, both vendored under `RRV8/vendor/` and already copied into
  the bundle by `build-demo.ps1`. The Audit beat was walked offline on
  the Demo1 bundle and both PDFs generated with the network unavailable.
  Nothing to vendor.
- **Curated free-text AI prompt list** — the full set of scripted "Ask"
  prompts the tour uses is a tour-definition input, authored with the
  tour, not by this driver. A validation run fires one representative Ask
  per AI surface; the demo needs the complete list defined so every
  scripted prompt has a captured answer (free-form typing MISSes).
