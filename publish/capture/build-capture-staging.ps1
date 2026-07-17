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

# The two capture scripts at the staging root.
Copy-Item (Join-Path $Runtime 'request-signature.js') -Destination (Join-Path $Staging 'request-signature.js') -Force
Copy-Item (Join-Path $Capture 'record-shim.js')       -Destination (Join-Path $Staging 'record-shim.js')       -Force

# Inject record-shim (DemoSig first) at the top of every <head> so it wraps
# fetch/XHR before any product code runs.
# Inline config sets the stop URL BEFORE the shim loads, so the Save button can
# tell VALC to stop capture + restore the RR App (one-and-done). VALC's CORS
# allows the :8765 origin on /api/**. Only capture-staging gets this global, so
# record-shim.js stays reusable (no auto-stop) for other record/replay uses.
$boot = '<script>window.__rrCaptureStopUrl="http://localhost:8080/api/services/capture/stop";</script><script src="/request-signature.js"></script><script src="/record-shim.js"></script>'
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
Write-Host ""
Write-Host "  NEXT: serve capture-staging and walk the tour screens, then run" -ForegroundColor Yellow
Write-Host "        window.__demoCapture.download() to save recording.json." -ForegroundColor Yellow
