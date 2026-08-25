# capture-walk.md — the reusable capture-walk driver

The repeatable procedure for recording a demo chunk against the LIVE
product, driven by an MCP browser agent. Re-run this to reproduce or
extend a capture. It is the automation companion to
`build-capture-staging.ps1` / `record-shim.js` / `request-signature.js`
and the coverage plan in
`RapidReconciler-AI/docs/plans/demo-capture-manifest.md`.

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

### 0.4 An MCP-connected Chrome with the :8765 session

The owner's Chrome, connected to the MCP server. The dev token persists
per-origin, so a tab on :8765 already carries it. **Do NOT hijack the
owner's working tab** — create your own with `tabs_create_mcp`, do all
work there, and close it when done. Because capture-staging serves on
:8765, the same-origin token carries straight into the walk with no
re-paste.

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

- Confirm the RR App is back: `curl http://localhost:8765/RRV8/home.html`
  → 200 (Save's auto-stop, or the explicit `capture/stop`, rebinds :8765
  to the UI repo root). If not, `POST capture/stop` again.
- Restore the browser state you changed: put `rrv8.activeDb` and
  `rrv8.token` back to what you recorded in step 2 (matters when you
  used the 0.1 dev-token shortcut).
- Close the tab you created. Leave the owner's tab untouched.
- Confirm no stray serve processes on :8765 other than the restored RR
  App.

---

## Durability tradeoff — MCP-agent walk vs in-page walker

Today the walk is driven by an MCP browser agent following this runbook.
That is fine for producing a recording, but the walk logic lives in the
agent's head (this doc), not in code — re-running it depends on an agent
re-reading and re-executing it consistently. A more durable design is an
**in-page walker**: a small script injected alongside the shim that
encodes the manifest entry list + scope steps + terminal-status gates and
drives itself, so a capture is one button, deterministic and diffable.
The MCP approach is right for now (fast to iterate while the entry list is
still moving); promote to an in-page walker once the entry list and drill
sequence stabilize, and keep it as one source with the tour definition so
a new screen is always visited.

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
