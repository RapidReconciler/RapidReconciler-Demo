# Minimal static file server for the RapidReconciler sales demo.
# Serves the demo repo root on :8770 (override with $env:PORT).
# Relaunch after a reboot:  powershell -ExecutionPolicy Bypass -File serve.ps1
# Note: writes a body on every response, so use GET (a HEAD request hangs).
$port = if ($env:PORT) { [int]$env:PORT } else { 8770 }
$root = (Get-Location).Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$port/"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".woff" = "font/woff"
  ".woff2"= "font/woff2"
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $relPath = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart("/"))
    if ($relPath -eq "" -or $relPath.EndsWith("/")) { $relPath += "index.html" }
    $full = Join-Path $root $relPath
    if (Test-Path $full -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] }
      # Dev server: never let the browser cache. Rebuilds change files in place, so
      # a cached page shows stale content and a soft reload (F5) won't refetch.
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [Text.Encoding]::UTF8.GetBytes("404: $relPath")
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
    $res.Close()
  } catch {
    Write-Host "err: $_"
  }
}
