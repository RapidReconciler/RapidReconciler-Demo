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
$BundleDir  = Join-Path $DemoRepo 'bundle'                   # OUTPUT (gitignored)

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

# 5c. Runtime: request-signature.js + replay-shim.js + launcher to bundle root.
foreach ($f in @('request-signature.js', 'replay-shim.js', 'launch.ps1', 'launch.cmd')) {
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
$boot = '<script src="/request-signature.js"></script><script src="/replay-shim.js"></script>'
Get-ChildItem -Path $BundleDir -Filter '*.html' -Recurse | ForEach-Object {
  $html = Get-Content $_.FullName -Raw -Encoding UTF8
  if ($html -notmatch [regex]::Escape($boot)) {
    # Insert right after the first <head ...> tag.
    $html = [regex]::Replace($html, '(?i)(<head[^>]*>)', "`$1$boot", 1)
    Set-Content -Path $_.FullName -Value $html -Encoding UTF8
  }
}

# 5f. Entry page. launch.ps1 opens index.html by default; point it at the demo
#     start page. Until the tour intro exists, alias home.html as index.html.
$homeSrc = Join-Path $BundleDir 'home.html'
$indexDst = Join-Path $BundleDir 'index.html'
if ((Test-Path $homeSrc) -and (-not (Test-Path $indexDst))) {
  Copy-Item $homeSrc -Destination $indexDst -Force
}

Write-Host ""
Write-Host "  bundle assembled at: $BundleDir" -ForegroundColor Green
Write-Host "  run it offline: double-click bundle\launch.cmd (or: powershell -ExecutionPolicy Bypass -File bundle\launch.ps1)"
Write-Host ""
Write-Host "  NEXT: wire the capture walk (steps 1-4) so recording.json is produced automatically." -ForegroundColor Yellow
