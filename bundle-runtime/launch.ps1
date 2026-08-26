# launch.ps1 -- one-click offline launcher for the RapidReconciler demo bundle.
#
# Serves the bundle folder over http://localhost:<port>/ using a pure .NET
# HttpListener (built into Windows PowerShell -- no install, no Node, no Python)
# and opens the default browser at the demo entry page. Ctrl+C to stop.
#
# WHY A LOCAL SERVER instead of double-clicking the HTML from file:// :
#   The product loads data through fetch(). Under the file:// scheme browsers
#   treat every request as cross-origin to a null origin and BLOCK it, so the
#   replay shim's fetch of recording.json (and any product code that inspects a
#   real URL) fails. Serving over http://localhost gives a normal same-origin
#   context where fetch/XHR behave exactly as they do in production, so the shim
#   is transparent. This needs zero install: HttpListener ships with Windows.
#   See the file:// alternative + tradeoff note in build-demo.ps1.
#
# ASCII ONLY on purpose: PS 5.1 reads scripts as cp1252, so a stray em dash or
# smart quote in a string literal can break parsing.

param(
  [int]$Port = 0,                     # 0 = auto-pick a free port in $PortRange
  [string]$Root = $PSScriptRoot,      # folder to serve (defaults to this script's dir)
  [string]$Entry = 'index.html',      # page to open in the browser
  [switch]$NoBrowser                  # skip auto-opening the browser
)

$ErrorActionPreference = 'Stop'
$PortRange = 8900..8999

function Get-FreePort {
  param([int[]]$Candidates)
  foreach ($p in $Candidates) {
    $listener = $null
    try {
      $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p)
      $listener.Start()
      $listener.Stop()
      return $p
    } catch {
      if ($listener) { try { $listener.Stop() } catch {} }
    }
  }
  throw "No free port found in range $($Candidates[0])..$($Candidates[-1])."
}

# Minimal, offline content-type map. Anything unknown is served as octet-stream.
$Mime = @{
  '.html' = 'text/html; charset=utf-8';   '.htm'  = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.mjs'  = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8';    '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml';              '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg';                 '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif';                  '.ico'  = 'image/x-icon'
  '.woff' = 'font/woff';                  '.woff2'= 'font/woff2'
  '.ttf'  = 'font/ttf';                   '.map'  = 'application/json; charset=utf-8'
  '.xlsx' = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  '.pdf'  = 'application/pdf';            '.txt'  = 'text/plain; charset=utf-8'
  '.bin'  = 'application/octet-stream'
}

if ($Port -eq 0) { $Port = Get-FreePort -Candidates $PortRange }
$Root = (Resolve-Path $Root).Path
$prefix = "http://localhost:$Port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  throw "Could not bind $prefix. $($_.Exception.Message)"
}

Write-Host ""
Write-Host "  RapidReconciler demo -- serving:" -ForegroundColor Cyan
Write-Host "    root : $Root"
Write-Host "    url  : $prefix$Entry"

# ---------------------------------------------------------------------------
# STARTUP INTEGRITY CHECK -- is every product page still shimmed? (UI-152)
#
# build-demo.ps1 step 5e injects date-freeze.js + request-signature.js +
# replay-shim.js at the top of every <head> in the OUTPUT directory. That line
# does not exist in the RRV8 source, so a page hand-copied in from the UI repo
# AFTER the build arrives without it and the shim never patches fetch.
#
# None of that is visible from the page. It renders normally, and misses()
# cannot report the gap because the object that counts misses was never
# created. Worse, on the build box the live agent and VALC answer the
# unintercepted calls, so the bundle looks healthy there and Home is dead on a
# presenter's laptop. Measured 2026-08-25 on home.html and
# admin-claude-assistant.html: fetch was native, __demoReplay was absent, and
# RR_CONFIG was still pointing at localhost:8080 / localhost:34537.
#
# 5e is a build-time loop, so it cannot see a file dropped in afterwards. That
# is why this check lives here instead: at serve time, against the artifact
# actually being served.
#
# The product/shell split is DERIVED, not a hardcoded name list. A tour shell
# loads tour-seed.js and drives the product inside an iframe, so it must NOT be
# shimmed (a shimmed shell tries to replay its own static asset reads -- see
# build-demo.ps1 step 5-tour). Every other root page is product and must be.
# Measured on the 2026-08-25 bundle: 21 root pages carry the shim and no seed,
# 7 carry the seed and no shim. An exact complement, which is what makes the
# derivation safe for rails nobody has written yet.
#
# Subdirectories are skipped on purpose: RRUniversity/ holds the static help
# docs, staged after 5e and correctly unshimmed.
function Test-BundleIntegrity {
  param([string]$Dir)
  $need = @('date-freeze.js', 'request-signature.js', 'replay-shim.js')
  $broken = @(); $shimmedShell = @(); $product = 0; $shell = 0
  foreach ($f in (Get-ChildItem -Path $Dir -Filter '*.html' -File)) {
    $html = ''
    try { $html = Get-Content $f.FullName -Raw -Encoding UTF8 } catch { continue }
    if ($null -eq $html) { $html = '' }
    $has = @($need | Where-Object { $html -like ('*' + $_ + '*') })
    if ($html -like '*tour-seed.js*') {
      $shell++
      if ($has.Count -gt 0) { $shimmedShell += ($f.Name + ' -- carries ' + ($has -join ', ')) }
    } else {
      $product++
      if ($has.Count -lt $need.Count) {
        $missing = @($need | Where-Object { $has -notcontains $_ })
        $broken += ($f.Name + ' -- missing ' + ($missing -join ', '))
      }
    }
  }
  return New-Object psobject -Property @{
    Product = $product; Shell = $shell
    Broken = $broken; ShimmedShell = $shimmedShell
  }
}

$integrity = Test-BundleIntegrity -Dir $Root
if ($integrity.Broken.Count -gt 0 -or $integrity.ShimmedShell.Count -gt 0) {
  Write-Host ""
  Write-Host "  ###########################################################" -ForegroundColor Red
  Write-Host "  #  THIS BUNDLE IS BROKEN. OFFLINE REPLAY WILL NOT WORK.   #" -ForegroundColor Red
  Write-Host "  ###########################################################" -ForegroundColor Red
  Write-Host ""
  foreach ($b in $integrity.Broken)       { Write-Host "    UNSHIMMED PRODUCT PAGE : $b" -ForegroundColor Red }
  foreach ($s in $integrity.ShimmedShell) { Write-Host "    SHIMMED TOUR SHELL     : $s" -ForegroundColor Red }
  Write-Host ""
  Write-Host "    $($integrity.Broken.Count) of $($integrity.Product) product pages and $($integrity.ShimmedShell.Count) of $($integrity.Shell) tour shells are wrong." -ForegroundColor Red
  if ($integrity.Broken.Count -gt 0) {
    Write-Host "" 
    Write-Host "    An unshimmed product page was copied in by hand instead of" -ForegroundColor Yellow
    Write-Host "    built. It will call the live server and show nothing on a" -ForegroundColor Yellow
    Write-Host "    machine that has none. See capture-walk.md section 3h." -ForegroundColor Yellow
  }
  if ($integrity.ShimmedShell.Count -gt 0) {
    Write-Host "" 
    Write-Host "    A shimmed tour shell means the shell was in the output dir" -ForegroundColor Yellow
    Write-Host "    when step 5e ran, so it now tries to replay its own static" -ForegroundColor Yellow
    Write-Host "    asset reads. It must be staged AFTER 5e, not before." -ForegroundColor Yellow
  }
  Write-Host "" 
  Write-Host "    Do not demo this bundle. Rebuild it: publish/build-demo.ps1" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "    Serving anyway so you can still inspect it." -ForegroundColor Yellow
  Write-Host ""
} else {
  Write-Host "    replay : $($integrity.Product) product pages shimmed, $($integrity.Shell) tour shells clean" -ForegroundColor Green
}
Write-Host ""
Write-Host "  Press Ctrl+C in this window to stop the demo." -ForegroundColor Yellow
Write-Host ""

if (-not $NoBrowser) {
  try { Start-Process ($prefix + $Entry) } catch { Write-Host "  (could not auto-open the browser; open $prefix$Entry manually)" }
}

# Resolve a request path to a file on disk, guarding against path traversal.
function Resolve-Local {
  param([string]$UrlPath)
  $rel = [System.Uri]::UnescapeDataString($UrlPath.TrimStart('/'))
  if ([string]::IsNullOrWhiteSpace($rel)) { $rel = $Entry }
  $full = [System.IO.Path]::GetFullPath((Join-Path $Root $rel))
  if (-not $full.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) { return $null }  # traversal
  if (Test-Path $full -PathType Container) { $full = Join-Path $full $Entry }
  return $full
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()      # blocks until a request arrives
    $req  = $context.Request
    $res  = $context.Response
    try {
      $file = Resolve-Local -UrlPath $req.Url.AbsolutePath
      if ($null -ne $file -and (Test-Path $file -PathType Leaf)) {
        $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
        $ct  = $Mime[$ext]; if (-not $ct) { $ct = 'application/octet-stream' }
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $res.StatusCode = 200
        $res.ContentType = $ct
        $res.ContentLength64 = $bytes.Length
        # Same-origin localhost; keep caching off so a rebuilt bundle is picked up.
        $res.Headers.Add('Cache-Control', 'no-store')
        # HEAD must send the headers and NO body. Writing the body on a HEAD makes
        # HttpListener throw (the response is already complete), and the client sees
        # a 500 on a file that GETs fine -- measured 2026-08-24, which is why the
        # front door's "is this tour page in the bundle?" probe read every page as
        # missing. Standard method, standard answer.
        if ($req.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
      } else {
        $res.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $($req.Url.AbsolutePath)")
        $res.OutputStream.Write($msg, 0, $msg.Length)
      }
    } catch {
      try { $res.StatusCode = 500 } catch {}
    } finally {
      try { $res.OutputStream.Close() } catch {}
    }
  }
} finally {
  try { $listener.Stop(); $listener.Close() } catch {}
  Write-Host "  Demo server stopped." -ForegroundColor Cyan
}
