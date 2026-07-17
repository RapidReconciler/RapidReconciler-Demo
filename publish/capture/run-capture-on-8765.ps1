# run-capture-on-8765.ps1 -- serve the capture-staging bundle ON :8765 for a
# capture walk against the LIVE backends.
#
# WHY :8765 (not the demo default :8770):
#   VALC (:8080) and Services (:34537) only allow CORS origin
#   http://localhost:8765 (VALC hardcodes it in Java; Services in yml). To
#   record the dynamic-body POST screens (transactions / as-of grids, AI) we
#   must call those backends from the browser. Serving capture-staging ON :8765
#   makes every backend call SAME-ORIGIN, so the CORS check never fires and we
#   touch zero backend config. A dev-only, dev-window repoint of :8765.
#
# The capture shim injects ABSOLUTE script paths
#   <script src="/request-signature.js"></script>
#   <script src="/record-shim.js"></script>
# so the staging dir MUST BE the served root (a subfolder would 404 those).
# That is why we repoint :8765 itself rather than serving a subpath.
#
# WHAT THIS DOES:
#   1. Detects whether :8765 is already occupied by the normal product server.
#      - If FREE:     rebuilds capture-staging\ and serves it on :8765.
#      - If OCCUPIED: prints how to free the port via VALC's dashboard and exits
#                     WITHOUT touching the running process. This script needs NO
#                     admin rights and never kills anything.
#
# WHY WE DON'T KILL :8765:
#   The :8765 static server is spawned by the VALC service as LocalSystem (via
#   VALC's "RR App start/stop" sidebar control). A non-elevated user session
#   gets Access-denied trying to kill it, and requiring an elevated shell every
#   capture run is friction. The clean path is to stop the RR App server from
#   VALC's dashboard sidebar first, which frees :8765, then re-run this script.
#
# AFTER THE CAPTURE WALK (restore the normal :8765 product server):
#   Ctrl-C this window, then either:
#     - start the RR App server from VALC's dashboard sidebar ("RR App start"), OR
#     - from the UI repo run:
#         powershell -ExecutionPolicy Bypass -File C:\source\repos\RapidReconciler-AI\run-static-server.ps1
#   (or re-run start-all). That re-binds :8765 to the UI repo root.
#
# The dev token in localStorage.rrv8.token persists per-origin, so because
# capture-staging serves ON :8765 the token is already present -- no re-paste.
#
# ASCII only (PS 5.1 / cp1252 parsing safety).

param(
  [string]$UiRepo   = 'C:\source\repos\RapidReconciler-AI',
  [string]$DemoRepo = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
)

$ErrorActionPreference = 'Stop'

$Port          = 8765
$Staging       = Join-Path $DemoRepo 'capture-staging'
$DemoServe     = Join-Path $DemoRepo 'serve.ps1'
$BuildScript   = Join-Path $PSScriptRoot 'build-capture-staging.ps1'
$RestoreScript = Join-Path $UiRepo 'run-static-server.ps1'

# --- helper: find the process(es) that own an http.sys URL on $Port ---------
# HttpListener registers with http.sys (kernel), so Get-NetTCPConnection reports
# the owning process as PID 4 (System). The reliable process mapping lives in
# 'netsh http show servicestate', under each request-queue block:
#     Processes:
#         ID: <pid>, image: <?>
#     Registered URLs:
#         HTTP://LOCALHOST:8765/
function Get-PortOwnerPids {
  param([int]$P)
  $state = (netsh http show servicestate) | Out-String
  $lines = $state -split "`r?`n"
  $result   = @()
  $curPids  = @()
  $hasPort  = $false
  $inQueue  = $false
  foreach ($ln in $lines) {
    if ($ln -match 'Request queue name:') {
      if ($inQueue -and $hasPort) { $result += $curPids }
      $curPids = @(); $hasPort = $false; $inQueue = $true
      continue
    }
    if ($ln -match 'ID:\s*(\d+),\s*image:') { $curPids += [int]$Matches[1] }
    if ($ln -match (":{0}/" -f $P))          { $hasPort = $true }
  }
  if ($inQueue -and $hasPort) { $result += $curPids }
  $result | Sort-Object -Unique
}

Write-Host "run-capture-on-8765" -ForegroundColor Cyan
Write-Host ("=" * 50)

# --- 1. detect whether :8765 is occupied (do NOT kill) ----------------------
$owners = @(Get-PortOwnerPids -P $Port)
if ($owners.Count -gt 0) {
  # Show the owning PID(s) for context via the netsh mapping.
  $ownerDesc = foreach ($opid in $owners) {
    $proc = Get-Process -Id $opid -ErrorAction SilentlyContinue
    if ($proc) { "PID {0} ({1})" -f $opid, $proc.ProcessName } else { "PID {0}" -f $opid }
  }
  Write-Host ("  [busy]  :{0} is currently held by {1}" -f $Port, ($ownerDesc -join ', ')) -ForegroundColor Yellow
  Write-Host ""
  Write-Host ("=" * 50) -ForegroundColor DarkGray
  Write-Host ("  :{0} IS OCCUPIED -- FREE IT VIA VALC, THEN RE-RUN THIS SCRIPT" -f $Port) -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  The :8765 static server is spawned by the VALC service as LocalSystem,"
  Write-Host "  so it can't be killed from this (non-elevated) session -- and it shouldn't"
  Write-Host "  be. Free the port the clean way:"
  Write-Host ""
  Write-Host "    1. Open the VALC dashboard (:8080) and use the sidebar" -ForegroundColor Yellow
  Write-Host "       'RR App start/stop' control to STOP the RR App server on :8765."
  Write-Host "    2. Re-run this script:"
  Write-Host ("         powershell -ExecutionPolicy Bypass -File {0}" -f $PSCommandPath)
  Write-Host ""
  Write-Host ("=" * 50) -ForegroundColor DarkGray
  exit 1
}

Write-Host ("  [ok]    :{0} is free" -f $Port) -ForegroundColor Green
Write-Host ""

# --- 2. (re)build capture-staging -------------------------------------------
Write-Host "  [build] rebuilding capture-staging..." -ForegroundColor Cyan
& $BuildScript -UiRepo $UiRepo -DemoRepo $DemoRepo
if (-not (Test-Path $Staging)) { throw "build did not produce staging dir: $Staging" }
Write-Host ""

# --- 3. guard: bail if something grabbed :8765 during the build -------------
# (No kill -- if the port got taken again, instruct and exit rather than hang.)
$owners = @(Get-PortOwnerPids -P $Port)
if ($owners.Count -gt 0) {
  Write-Host ("  [ERR]   :{0} became occupied during the build (PID(s): {1})." -f $Port, (($owners) -join ',')) -ForegroundColor Red
  Write-Host  "          Stop the RR App server from VALC's dashboard sidebar, then re-run." -ForegroundColor Red
  exit 1
}

# --- 4. next-step + restore instructions (printed BEFORE the blocking serve) -
Write-Host ("=" * 50) -ForegroundColor DarkGray
Write-Host "  CAPTURE STAGING IS ABOUT TO SERVE ON :$Port" -ForegroundColor Green
Write-Host ""
Write-Host "  NEXT STEPS (in a browser at http://localhost:$Port/ -- NOT file://):" -ForegroundColor Yellow
Write-Host "    1. Pages are FLAT at the root (RRV8 is flattened by the build), e.g.:"
Write-Host "         http://localhost:$Port/home.html"
Write-Host "         http://localhost:$Port/inventory-transactions.html"
Write-Host "         http://localhost:$Port/inventory-asof.html"
Write-Host "    2. Walk the tour screens so every backend POST fires (load grids,"
Write-Host "       run queries, ask the AI). The shim records each request/response."
Write-Host "    3. Check progress any time in the console:"
Write-Host "         window.__demoCapture.count()"
Write-Host "    4. When done, save the recording:"
Write-Host "         window.__demoCapture.download()   // -> recording.json"
Write-Host ""
Write-Host "  RESTORE the normal :$Port product server when finished:" -ForegroundColor Yellow
Write-Host "    Ctrl-C this window, then either:"
Write-Host "      - start the RR App server from VALC's dashboard sidebar, OR"
Write-Host ("      - run: powershell -ExecutionPolicy Bypass -File {0}" -f $RestoreScript)
Write-Host "    (or re-run start-all.cmd). That re-binds :$Port to the UI repo root."
Write-Host ("=" * 50) -ForegroundColor DarkGray
Write-Host ""

# --- 5. serve capture-staging on :8765 (foreground; blocks until Ctrl-C) -----
# The demo serve.ps1 roots at (Get-Location), so set location to staging first.
Set-Location $Staging
$env:PORT = $Port
& $DemoServe
