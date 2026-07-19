# build-capture-staging.ps1 -- stage the LIVE product for a capture walk.
#
# The capture half of record/replay (build-demo steps 1-3). Produces a copy of
# the product with request-signature.js + record-shim.js injected at the TOP of
# every page's <head>, so the shim patches fetch/XHR BEFORE any product code runs
# and records every request/response pair while a human (or automation) walks the
# tour against the LIVE backend (VALC :8080 + Services :34537 + the demo DBs).
#
# config.js is left AS-IS (staging mode -> localhost backends) so real data flows;
# the shim passes calls through to the network AND records them. Serve the output
# on its own port, walk the screens, then window.__demoCapture.download() the
# recording.json and feed it to build-demo.ps1 -Recording <path>.
#
# ASCII only (PS 5.1 / cp1252 parsing safety).

param(
  [string]$UiRepo   = 'C:\source\repos\RapidReconciler-AI',
  [string]$DemoRepo = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
)

$ErrorActionPreference = 'Stop'

$SrcApp   = Join-Path $UiRepo 'RRV8'
$Runtime  = Join-Path $DemoRepo 'bundle-runtime'          # request-signature.js lives here
$Capture  = $PSScriptRoot                                 # publish/capture (record-shim.js)
$Staging  = Join-Path $DemoRepo 'capture-staging'         # OUTPUT (gitignored)

Write-Host "build-capture-staging" -ForegroundColor Cyan
Write-Host "  product : $SrcApp"
Write-Host "  staging : $Staging"
Write-Host ""

if (-not (Test-Path $SrcApp)) { throw "product snapshot source not found: $SrcApp" }

if (Test-Path $Staging) { Remove-Item $Staging -Recurse -Force }
New-Item -ItemType Directory -Path $Staging | Out-Null

# Product snapshot (flat pages + vendor + fonts).
Copy-Item (Join-Path $SrcApp '*') -Destination $Staging -Recurse -Force

# The capture scripts at the staging root. date-freeze.js pins the reference
# "now" so a walk records against the same frozen clock the bundle replays with
# (see bundle-runtime/date-freeze.js); it must load FIRST in the boot strip.
Copy-Item (Join-Path $Runtime 'date-freeze.js')       -Destination (Join-Path $Staging 'date-freeze.js')       -Force
Copy-Item (Join-Path $Runtime 'request-signature.js') -Destination (Join-Path $Staging 'request-signature.js') -Force
Copy-Item (Join-Path $Capture 'record-shim.js')       -Destination (Join-Path $Staging 'record-shim.js')       -Force

# Inject record-shim (DemoSig first) at the top of every <head> so it wraps
# fetch/XHR before any product code runs.
# Inline config sets the stop URL BEFORE the shim loads, so the Save button can
# tell VALC to stop capture + restore the RR App (one-and-done). VALC's CORS
# allows the :8765 origin on /api/**. Only capture-staging gets this global, so
# record-shim.js stays reusable (no auto-stop) for other record/replay uses.
$boot = '<script src="/date-freeze.js"></script><script>window.__rrCaptureStopUrl="http://localhost:8080/api/services/capture/stop";</script><script src="/request-signature.js"></script><script src="/record-shim.js"></script>'
$n = 0
# Match ONLY the real <head> tag, injecting exactly once. "<head[^>]*>" also
# matches "<header ...>" (prefix), and [regex]::Replace(...,1) treats the 4th
# arg as RegexOptions, not a count -- together they double-inject the shim.
Get-ChildItem -Path $Staging -Filter '*.html' -Recurse | ForEach-Object {
  $html = Get-Content $_.FullName -Raw -Encoding UTF8
  if ($html -notmatch [regex]::Escape($boot)) {
    $rx = New-Object System.Text.RegularExpressions.Regex '(?i)(<head(?:\s[^>]*)?>)'
    $html = $rx.Replace($html, "`$1$boot", 1)   # 3rd arg = count (replace FIRST only)
    Set-Content -Path $_.FullName -Value $html -Encoding UTF8
    $n++
  }
}
Write-Host "  injected record-shim into $n page(s)" -ForegroundColor Green

# --- Help panel closure (the "?" companion) --------------------------------
# Admin pages carry <body data-help-src="../RRUniversity/...">; Tools/help-sidebar.js
# injects the dark "?" circle and opens an iframe of that help doc in ?embed=1 mode.
# RRV8/* is flattened to the staging root, so a root page's "../Tools/x" and
# "../RRUniversity/y" refs clamp (RFC 3986) to "/Tools/x" and "/RRUniversity/y" at
# the served root; the help docs (one level deep) resolve "../Tools/" and
# "../Images/" to the same root. Stage that closure here so nothing 404s.
# Done AFTER shim injection on purpose: the help docs are static (no fetch/XHR),
# so they must NOT get request-signature.js / record-shim.js injected.
# admin-grid.css + gsi-logo.png aren't the "?" panel itself -- they're chrome the
# help-bearing admin pages pull via the SAME ../Tools//../Images root-clamp, and
# were 404ing in the flattened bundle already (missing topbar logo on every admin
# page; unstyled grid on admin-users). Staged here so the page hosting the panel
# renders correctly.
$HelpTools = @('help-sidebar.js','help-sidebar.css','doc-chrome.js','doc-header.css','doc-print.css','admin-grid.css')
$HelpDocs  = @('administrator-start-here.html','administrator-managing-companies.html','administrator-complex-password.html','administrator-managing-users.html','getting-started-with-rapidreconciler.html')
$HelpImgs  = @('rr-collapse-navigation-bar.png','rr-full-screen.png','rr-help-panel.png','rr-log-out.png','rr-login-screen.png','rr-main-navigation.png','rr-module-status-bar.png','rr-password-reset.png','rr-personal-data.png','rr-system-alerts.png','rr-web-page-banner.png','gsi-logo.png')

$dstTools = Join-Path $Staging 'Tools'
$dstDocs  = Join-Path $Staging 'RRUniversity'
$dstImgs  = Join-Path $Staging 'Images'
New-Item -ItemType Directory -Path $dstTools, $dstDocs, $dstImgs -Force | Out-Null
foreach ($f in $HelpTools) { Copy-Item (Join-Path $UiRepo "Tools\$f")        -Destination (Join-Path $dstTools $f) -Force }
foreach ($f in $HelpDocs)  { Copy-Item (Join-Path $UiRepo "RRUniversity\$f") -Destination (Join-Path $dstDocs  $f) -Force }
foreach ($f in $HelpImgs)  { Copy-Item (Join-Path $UiRepo "Images\$f")       -Destination (Join-Path $dstImgs  $f) -Force }
Write-Host ("  staged help panel closure: {0} Tools + {1} docs + {2} images" -f $HelpTools.Count, $HelpDocs.Count, $HelpImgs.Count) -ForegroundColor Green

Write-Host ""
Write-Host "  NEXT: serve capture-staging and walk the tour screens, then run" -ForegroundColor Yellow
Write-Host "        window.__demoCapture.download() to save recording.json." -ForegroundColor Yellow
