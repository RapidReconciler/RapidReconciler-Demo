# recording-sink.ps1 - one-shot local HTTP sink that writes a POSTed body to disk.
# Exists because a 47 MB programmatic blob download does not persist in the
# automated browser context (capture-walk.md section 5 fallback). Local only,
# loopback only, single request, then exits.

param(
  [int]$Port = 8791,
  [string]$OutFile = 'C:\source\repos\RapidReconciler-Demo\publish\capture\recording-demo1.json'
)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "sink listening on http://localhost:$Port/ -> $OutFile"

try {
  while ($true) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $res.Headers.Add('Access-Control-Allow-Origin', '*')
    $res.Headers.Add('Access-Control-Allow-Headers', '*')
    $res.Headers.Add('Access-Control-Allow-Methods', 'POST, OPTIONS')

    if ($req.HttpMethod -eq 'OPTIONS') {
      $res.StatusCode = 204
      $res.Close()
      continue
    }

    $fs = [System.IO.File]::Create($OutFile)
    $req.InputStream.CopyTo($fs)
    $written = $fs.Length
    $fs.Close()

    $body = [System.Text.Encoding]::UTF8.GetBytes("{""ok"":true,""bytes"":$written}")
    $res.StatusCode = 200
    $res.ContentType = 'application/json'
    $res.OutputStream.Write($body, 0, $body.Length)
    $res.Close()
    Write-Host ("wrote {0} bytes to {1}" -f $written, $OutFile)
    break
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}
