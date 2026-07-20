# Admin-tour lessons — reuse these for the analyst + accountant tours

Everything the admin tour taught us, so the next tours don't relearn it. Written
2026-07-19 after the admin tour + re-record shipped. Two audiences: whoever builds
the next tour, and whoever standardizes the next batch of product screens.

---

## 1. The product-page visual standard ("admin-page standard")

The chrome every standardized page shares now lives in
[`RRV8/admin-chrome.css`](../../RapidReconciler-AI/RRV8/admin-chrome.css). A page
opts in by linking it **after `fonts/fonts.css` and BEFORE its own inline
`<style>`** (so page-specific rules still win by source order).

What it provides:
- The canonical `:root` palette (navy `#1f2d4a` / navy-deep `#16223b` / blue
  `#2f6fb0` / bg `#e3e8f1` …). This is the home.html palette, NOT the old
  `#142037`/`#2b5fb0`/`#fafbfd` set the analyst screens still use.
- The **command-center wash** on `body` (layered navy/blue radial + linear
  gradient, `background-attachment:fixed`).
- **Floating corner-chrome**: `.corner-chrome` (fixed top-right) wrapping a
  `.home-fab.topbar-home` pill. No topbar header, no breadcrumb, no footer.
- Page shell: `.main` (64px top padding to clear the floating chrome), `.page`
  (880px), `.page-header`/`.page-title`/`.page-lede`, and the card primitives.

### The transformation (old chrome → standard), page by page
1. `:root` palette → canonical values.
2. `body` → the wash + `background-attachment:fixed`.
3. `.app` grid + `.topbar*` rules → `.app{min-height:100vh}` + `.corner-chrome` +
   `.home-fab`.
4. `.main` → `padding:64px 32px 56px` (drop `grid-area`).
5. Delete `.breadcrumb*` and `.app-footer` CSS.
6. `.card-title` → 18px / 800.
7. Body HTML: `<header class="topbar">` → the floating corner-chrome; delete the
   `<nav class="breadcrumb">` and `<footer class="app-footer">`.
8. **Guard the JS.** Pages set `$('js-topbar-db')` / `$('js-app-ver')` on the
   removed nodes — null-guard before touching (`const el = $('…'); if (el) …`)
   or the page crashes on boot.

### The gotcha that WILL bite again — cascade vs. the `.topbar-home` hook
`sidebar.css` styles `.topbar-home` as a button (padding, 8px radius, solid navy).
When `.home-fab` lived inline in each page it won by source order (inline is last).
Once it moved into `admin-chrome.css` (linked BEFORE `sidebar.css`), the
single-class `.topbar-home` (0,1,0) started winning and the Home button silently
lost its pill shape + gradient. **Fix: the shared rule is scoped
`.corner-chrome .home-fab` (0,2,0)** so it beats `.topbar-home` regardless of load
order. Any future shared chrome that collides with a `sidebar.css` hook class needs
the same specificity bump. **A grep check can't catch this — only a live
computed-style check will.**

### Don't extend by copy-paste
Six admin pages fell out of standard because the chrome was copy-pasted per page and
the roll-out missed them. The shared stylesheet is what prevents the next drift —
add new pages by linking it, never by pasting the block.

---

## 2. Tour patterns (the guided-workflow shell)

From [`tour/administrator.html`](../tour/administrator.html):

- **Persistent workflow map = the progress indicator AND the nav.** N numbered
  beats shown on every page (current lit, past done, clickable to jump). Give it a
  visible **finish line** — a wrap-up node — or the tour just runs out of lit nodes
  and reads unfinished. (We learned this the hard way: the map had 3 responsibility
  nodes and no 4th, and the owner kept looking for the missing step.)
- **Spotlight the demo layer, not the product.** `spotlight(selector)` injects a
  glow into the product iframe by selector and wipes it on step change; product
  source stays untouched (demo == product holds).
- **Spotlight the Home button on modal CLOSE, not open.** Product modals are high
  z-index and paint over a glow applied on open — the highlight is invisible until
  the modal is dismissed. Wire the glow to the Cancel/X handler (mirror the
  licensing invoice-modal beat).
- **Beat setup must be idempotent and run on both the iframe `load` event AND
  `render()`.** If a step renders without a fresh load (direct-jump, reload-less
  render), a load-only setup leaves the beat dead. Extract a `setupBeat(page)` that
  both call; guard listeners against double-attach (`data-demo-wired`). Keep
  advance-on-navigation load-only (running it from render loops).
- **Persona login** (`Enter as <name>`) seeds an offline session and immunizes the
  demo against the stale-token class of bug. Each persona's Exit points at the next.
- **No scripted free-text.** Any free-form typing at replay is a guaranteed MISS in
  front of a prospect. The admin AI's suggested-question **pills** are the interface
  precisely because the pill text is the capture key — training, demo prompt, and
  onboarding in one. The analyst tour must use the same fixed-prompt discipline.

---

## 3. Capture / re-record pipeline

Runbook: [`publish/capture/capture-walk.md`](../publish/capture/capture-walk.md).
What the admin re-record added on top of it:

- **Capture runs THROUGH VALC**, not by self-serving :8765:
  `POST http://localhost:8080/api/services/capture/start` stops the RR App,
  restages `capture-staging\` with the shim injected, serves it **flat** on :8765
  (so `/home.html`, not `/RRV8/home.html`). `.../capture/stop` restores the RR App.
- **Prereqs that actually bite** (check BEFORE walking): the browser token must
  scope to the DB's real companies (a stale token filters every row to `total:0`
  with a 200, not an error); **AI is on VALC :8080, NOT the agent :34537** — testing
  ai/health on :34537 gives a bogus 403 (we made this exact mistake twice).
- **Walk all 6 admin pills × all 3 tiers.** The AI answers differ by tier
  (Basic/Enhanced/Full) and replay is keyed `tier|question`, so every (tier, pill)
  a presenter might click must be captured. Full-tier Opus calls are ~10s each —
  fire pills 2 at a time per browser eval (a 6-pill loop blows the 45s CDP limit).
- **Walk EVERY reachable page, not just the tour's happy path.** The re-record
  missed the 9 maintenance/show-all pages (purge, reload-GL/cardex, job-schedule,
  data-service, fiscal-period, complex-passwords, data-refresh, activity-log) — each
  fires its own GETs and misses on replay. Open the **New Team Member modal** too
  (captures `GET /admin/roles` + the DB list). Enumerate the page set from the file
  system, don't trust the walk list.
- **Exfil gotcha:** Chrome allows exactly ONE automatic download per origin per
  session, then silently blocks the rest — and clipboard write needs document focus
  automation won't grant. Workaround that worked: stash the JSON in `localStorage`,
  stand up a one-shot local HTTP receiver, and `fetch`-POST it straight to disk
  (browser → listener → file, no download, no transcription). The shim also survives
  capture stop/start in browser memory, so a second walk appends to the first.
- **`recording-admin.json` is PII — NEVER `git add` it.** The bundle is gitignored.
- **`serve.ps1` serves its own CWD and must launch from `bundle/`; it holds the
  bundle dir, so a rebuild needs the serve KILLED FIRST** (`build-demo` can't delete
  a locked `bundle/`). This friction is exactly what the VALC dashboard **Restart
  demo server** button (VLC-24, shipped VALC #201) removes once VALC is rebuilt.

---

## 4. Process lessons (hard-won)

- **Verify live, not by grep/compile.** The home-fab regression, the missing
  maintenance pages, and the AI-port 403 were all things static checks passed and
  only a live computed-style / network check caught. Every visual or behavioral
  change gets a live check before it's called done.
- **Background agents are great for mechanical fan-out** (the 5-page standardize,
  the 12-page extraction, the VALC button) — but their grep-level self-verification
  is not enough for visual work. Always re-verify their output live.
- **Multi-step PowerShell combos exit-255 intermittently** on this box (the
  Stop-Process pipeline). Run kill / build / relaunch as SEPARATE calls with a real
  wait between kill and build.
