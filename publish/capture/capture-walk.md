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

### 0.2 AI must return 200, not 403

`POST /api/v1/ai/explain` is the demo centerpiece. Confirm it answers
before capturing AI surfaces, or you will record 403s where Opus
(`claude-opus-4-8`) answers belong. Quick check from a :8765 page:
`fetch('http://localhost:34537/api/v1/ai/health',{headers:{Authorization:'Bearer '+localStorage.rrv8.token}})`
should be 200, and a small `ai/explain` POST should return a real body.
Note `claude-opus-4-8` rejects a `temperature` param (400 → VALC 502) —
omit it.

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
// 2. download with an explicit filename
window.__demoCapture.download('recording-demo3.json');
```
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

- **pdf.js CDN vendoring** — `inventory-account-rollforward.html` pulls
  pdf.js from Cloudflare. A recording that visits it carries a live
  external dependency, which breaks true-offline replay. Vendor the asset
  as a build-demo (offline-replay) step. NOT part of the capture driver.
- **Curated free-text AI prompt list** — the full set of scripted "Ask"
  prompts the tour uses is a tour-definition input, authored with the
  tour, not by this driver. A validation run fires one representative Ask
  per AI surface; the demo needs the complete list defined so every
  scripted prompt has a captured answer (free-form typing MISSes).
