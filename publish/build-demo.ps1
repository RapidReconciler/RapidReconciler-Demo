# build-demo.ps1 -- SKELETON of the demo assembly step.
#
# STATUS: documented stub. The asset-assembly and shim-injection steps are real
# and runnable; the live CAPTURE WALK (step 3) is a marked TODO because it needs
# the running product plus the tour definition, which are out of scope for the
# foundation task. Run with -WhatIf-ish caution; nothing here writes to a DB.
#
# What a finished build-demo does, end to end (see docs/architecture.md):
#   1. Check out RapidReconciler-UI at a chosen version.        [manual today]
#   2. Point its config at demo/capture mode.                   [TODO]
#   3. Run the capture harness: walk every screen the tour defines against the
#      demo DBs through the running product, recording each request/response
#      pair via publish/capture/record-shim.js -> recording.json.   [TODO]
#   4. Capture the canned AI answers for the scripted prompts.  [TODO]
#   5. Assemble bundle/: product snapshot + vendored assets + replay shim +
#      request-signature + recording + launcher.                [IMPLEMENTED]
#   6. Deploy bundle/ to the private demo host.                 [out of scope]
#
# ASCII only (PS 5.1 / cp1252 parsing safety).

param(
  [string]$UiRepo   = 'C:\source\repos\RapidReconciler-AI',
  [string]$DemoRepo = (Split-Path $PSScriptRoot -Parent),
  [string]$Recording = '',   # path to a recording.json produced by the capture walk
  [switch]$SkipRecordingCheck
)

$ErrorActionPreference = 'Stop'

$SrcApp     = Join-Path $UiRepo 'RRV8'                       # product snapshot source
$Runtime    = Join-Path $DemoRepo 'bundle-runtime'           # shims + launcher (this repo)
$BundleName = if ($env:RR_BUNDLE_DIR) { $env:RR_BUNDLE_DIR } else { 'bundle' }
$BundleDir  = Join-Path $DemoRepo $BundleName                # OUTPUT (gitignored); RR_BUNDLE_DIR overrides for a locked-bundle workaround

Write-Host "build-demo (skeleton)" -ForegroundColor Cyan
Write-Host "  UI repo   : $UiRepo"
Write-Host "  demo repo : $DemoRepo"
Write-Host "  bundle out: $BundleDir"
Write-Host ""

# --- Step 1/2/3/4: capture (TODO) ------------------------------------------
# The capture walk is the make-or-break integration and is intentionally NOT
# wired here. When built, it will:
#   - launch (or attach to) the running product with record-shim.js injected,
#   - drive the tour steps defined in ..\tour\ (one walk step per screen +
#     interaction; keep the walk list and the tour definition as ONE source so
#     new screens are always visited),
#   - collect window.__demoCapture.dump() into $Recording (recording.json),
#   - collect the canned AI answers for the scripted prompts.
# Until then, pass -Recording <path> to assemble a bundle from a recording you
# produced by hand (e.g. via publish/capture/_selftest.html or a manual walk).
if (-not $Recording) {
  Write-Host "TODO: capture walk not wired. Re-run with -Recording <recording.json>" -ForegroundColor Yellow
  if (-not $SkipRecordingCheck) {
    Write-Host "      (or pass -SkipRecordingCheck to assemble a shim-only bundle for testing)" -ForegroundColor Yellow
    return
  }
}

# --- Step 5: assemble bundle/ ----------------------------------------------
if (Test-Path $BundleDir) { Remove-Item $BundleDir -Recurse -Force }
New-Item -ItemType Directory -Path $BundleDir | Out-Null

# 5a. Product snapshot. Copy RRV8/* to the bundle root (pages are flat, so the
#     injected absolute /request-signature.js and root recording.json resolve).
#     RRV8/vendor and RRV8/fonts come along in this copy, so the vendored xlsx /
#     jspdf libs and the self-hosted woff2 fonts are already offline -- no CDN.
if (Test-Path $SrcApp) {
  Write-Host "  copying product snapshot from $SrcApp ..."
  Copy-Item (Join-Path $SrcApp '*') -Destination $BundleDir -Recurse -Force
} else {
  Write-Host "  WARN: product snapshot source not found: $SrcApp" -ForegroundColor Yellow
}

# 5b. Verify the offline assets actually made it (defensive -- a demo that
#     reaches out to fonts.googleapis.com is not offline).
foreach ($must in @('vendor', 'fonts')) {
  $p = Join-Path $BundleDir $must
  if (-not (Test-Path $p)) { Write-Host "  WARN: expected offline assets missing: $must" -ForegroundColor Yellow }
}

# 5c. Runtime: date-freeze.js + request-signature.js + replay-shim.js + launcher
#     to bundle root. date-freeze.js pins the demo's reference "now" (see the
#     file header) and MUST be the first boot script (5e) so the clock is frozen
#     before any product or shim code reads the time.
foreach ($f in @('date-freeze.js', 'request-signature.js', 'replay-shim.js', 'launch.ps1', 'launch.cmd')) {
  $src = Join-Path $Runtime $f
  if (Test-Path $src) { Copy-Item $src -Destination (Join-Path $BundleDir $f) -Force }
  else { Write-Host "  WARN: runtime file missing: $f" -ForegroundColor Yellow }
}

# 5d. Recording.
if ($Recording -and (Test-Path $Recording)) {
  Copy-Item $Recording -Destination (Join-Path $BundleDir 'recording.json') -Force
  Write-Host "  recording: $Recording"
} else {
  # Empty recording keeps the shim happy; every call will register as a MISS in
  # the dev overlay -- exactly the signal that the capture walk has not run.
  '{"version":1,"createdAt":"","entries":[]}' | Set-Content -Path (Join-Path $BundleDir 'recording.json') -Encoding UTF8
  Write-Host "  recording: (empty placeholder -- capture walk has not run)" -ForegroundColor Yellow
}

# 5e. Inject the two boot scripts at the TOP of every page's <head> so the shim
#     patches fetch/XHR BEFORE any product code runs. The snapshot is generated,
#     not hand-edited, so a mechanical injection here is the intended pattern.
$boot = '<script src="/date-freeze.js"></script><script src="/request-signature.js"></script><script src="/replay-shim.js"></script>'
# Match ONLY the real <head> tag -- NOT <header ...> (which "<head[^>]*>" would
# also match, since "<head" is a prefix of "<header"). The pattern requires the
# char after "head" to be ">" or whitespace, so <header> can never match. Inject
# exactly once (a double-injected replay-shim re-patches fetch and its second
# copy captures the FIRST shim as "native", so recording.json autoload loops back
# into the shim -> MISS -> no recording ever loads).
Get-ChildItem -Path $BundleDir -Filter '*.html' -Recurse | ForEach-Object {
  $html = Get-Content $_.FullName -Raw -Encoding UTF8
  if ($html -notmatch [regex]::Escape($boot)) {
    # Insert right after the first <head ...> tag only.
    $rx = New-Object System.Text.RegularExpressions.Regex '(?i)(<head(?:\s[^>]*)?>)'
    $html = $rx.Replace($html, "`$1$boot", 1)   # 3rd arg = count (replace FIRST only)
    Set-Content -Path $_.FullName -Value $html -Encoding UTF8
  }
}

# 5e-help. Help panel closure (the "?" companion). Admin pages carry
#   <body data-help-src="../RRUniversity/...">; Tools/help-sidebar.js injects the
#   dark "?" circle and opens an iframe of that help doc in ?embed=1 mode. RRV8/*
#   is flattened to the bundle root, so a root page's "../Tools/x" /
#   "../RRUniversity/y" refs clamp (RFC 3986) to "/Tools/x" / "/RRUniversity/y" at
#   the served root; the docs (one level deep) resolve "../Tools/" and "../Images/"
#   to the same root. Stage that closure so nothing 404s. Done AFTER the shim
#   injection above on purpose: the help docs are static (no fetch/XHR), so they
#   must NOT get request-signature.js / replay-shim.js injected.
#   OFFLINE NOTE: these help docs <link> Google Fonts (fonts.googleapis.com) in
#   their <head>. That CDN is unreachable in true-offline replay -- the docs fall
#   back to system fonts and the panel still renders. Not vendored here (flagged).
# admin-grid.css + gsi-logo.png aren't the "?" panel itself -- they're chrome the
# help-bearing admin pages pull via the SAME ../Tools//../Images root-clamp, and
# were 404ing in the flattened bundle already (missing topbar logo on every admin
# page; unstyled grid on admin-users). Staged here so the page hosting the panel
# renders correctly.
$HelpTools = @('help-sidebar.js','help-sidebar.css','doc-chrome.js','doc-header.css','doc-print.css','admin-grid.css','home-search.js')
$HelpDocs  = @('administrator-start-here.html','administrator-managing-companies.html','administrator-complex-password.html','administrator-managing-users.html','getting-started-with-rapidreconciler.html')
$HelpImgs  = @('rr-collapse-navigation-bar.png','rr-full-screen.png','rr-help-panel.png','rr-log-out.png','rr-login-screen.png','rr-main-navigation.png','rr-module-status-bar.png','rr-password-reset.png','rr-personal-data.png','rr-system-alerts.png','rr-web-page-banner.png','gsi-logo.png')
if (Test-Path $SrcApp) {
  $dstTools = Join-Path $BundleDir 'Tools'
  $dstDocs  = Join-Path $BundleDir 'RRUniversity'
  $dstImgs  = Join-Path $BundleDir 'Images'
  New-Item -ItemType Directory -Path $dstTools, $dstDocs, $dstImgs -Force | Out-Null
  foreach ($f in $HelpTools) { Copy-Item (Join-Path $UiRepo "Tools\$f")        -Destination (Join-Path $dstTools $f) -Force }
  foreach ($f in $HelpDocs)  { Copy-Item (Join-Path $UiRepo "RRUniversity\$f") -Destination (Join-Path $dstDocs  $f) -Force }
  foreach ($f in $HelpImgs)  { Copy-Item (Join-Path $UiRepo "Images\$f")       -Destination (Join-Path $dstImgs  $f) -Force }
  Write-Host ("  staged help panel closure: {0} Tools + {1} docs + {2} images" -f $HelpTools.Count, $HelpDocs.Count, $HelpImgs.Count) -ForegroundColor Green
}

# 5e-tour. The presenter layer (the ONLY hand-written part of the demo, see
#   tour/README.md). The tour pages iframe the flattened product pages (home.html
#   and the admin sub-pages) as SIBLINGS at the bundle root, so their same-origin
#   relative iframe srcs resolve and the product's absolute /request-signature.js
#   + root recording.json load correctly. Staged AFTER the shim injection (5e) ON
#   PURPOSE: the tour shell makes no product network calls of its own -- it seeds
#   the demo session in localStorage and drives the real product in the iframe --
#   so it must NOT get request-signature.js / replay-shim.js injected (a shimmed
#   tour shell would try to replay its own static asset reads). Its assets/ (the
#   meeting-room background) come along to the bundle root.
$TourDir = Join-Path $DemoRepo 'tour'
if (Test-Path $TourDir) {
  Get-ChildItem -Path $TourDir -Filter '*.html' | ForEach-Object {
    Copy-Item $_.FullName -Destination (Join-Path $BundleDir $_.Name) -Force
  }
  $tourAssets = Join-Path $TourDir 'assets'
  if (Test-Path $tourAssets) {
    $dstAssets = Join-Path $BundleDir 'assets'
    New-Item -ItemType Directory -Path $dstAssets -Force | Out-Null
    Copy-Item (Join-Path $tourAssets '*') -Destination $dstAssets -Recurse -Force
  }
  Write-Host "  staged presenter tour: $((Get-ChildItem -Path $TourDir -Filter '*.html').Count) pages + assets" -ForegroundColor Green
}

# 5f. Entry page. launch.ps1 opens index.html by default; point it at the demo
#     start page. The tour front door (tour/index.html, staged above) is the demo
#     entry when present; otherwise fall back to aliasing home.html as index.html
#     so a shim-only / tourless bundle still launches straight into the product.
$indexDst = Join-Path $BundleDir 'index.html'
$homeSrc  = Join-Path $BundleDir 'home.html'
if (-not (Test-Path $indexDst) -and (Test-Path $homeSrc)) {
  Copy-Item $homeSrc -Destination $indexDst -Force
}

Write-Host ""
Write-Host "  bundle assembled at: $BundleDir" -ForegroundColor Green
Write-Host "  run it offline: double-click bundle\launch.cmd (or: powershell -ExecutionPolicy Bypass -File bundle\launch.ps1)"
Write-Host ""
Write-Host "  NEXT: wire the capture walk (steps 1-4) so recording.json is produced automatically." -ForegroundColor Yellow
