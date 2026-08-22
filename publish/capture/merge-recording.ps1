# merge-recording.ps1 - append the gap-filling entries of a DELTA recording into a
# BASE recording, without disturbing the base's per-signature order.
#
# Why append-only-if-absent: replay-shim.js pick() is sequence-aware -- repeated
# captures of one signature replay in order and the LAST one sticks. Appending a
# delta entry for a signature the base already has would make the delta's response
# the sticky one, which can silently swap a company- or period-scoped screen. So
# only signatures the base has never seen are added; everything else is dropped.
#
# The base file is read as TEXT, never JSON-parsed: a 50 MB recording is slow and
# memory-hungry through PS5.1's ConvertFrom-Json, and the only thing needed from it
# is the set of signatures plus a text splice before the closing "]}".

param(
  [Parameter(Mandatory=$true)][string]$Base,
  [Parameter(Mandatory=$true)][string]$Delta,
  [Parameter(Mandatory=$true)][string]$Out
)

$ErrorActionPreference = 'Stop'

$baseText = [System.IO.File]::ReadAllText($Base)
Write-Host ("base: {0:N0} bytes" -f $baseText.Length)

# Signatures already in the base. Matches the emitted shape "sig":"<value>".
$baseSigs = New-Object System.Collections.Generic.HashSet[string]
foreach ($m in [regex]::Matches($baseText, '"sig"\s*:\s*"((?:[^"\\]|\\.)*)"')) {
  [void]$baseSigs.Add($m.Groups[1].Value)
}
Write-Host ("base signatures: {0}" -f $baseSigs.Count)

$deltaObj = [System.IO.File]::ReadAllText($Delta) | ConvertFrom-Json
$new = @()
foreach ($e in $deltaObj.entries) {
  if (-not $baseSigs.Contains($e.sig)) { $new += $e; [void]$baseSigs.Add($e.sig) }
}
Write-Host ("delta entries: {0}, new signatures to append: {1}" -f $deltaObj.entries.Count, $new.Count)

if ($new.Count -eq 0) {
  Write-Host "nothing to append; base is already complete for this delta" -ForegroundColor Yellow
  if ($Out -ne $Base) { [System.IO.File]::WriteAllText($Out, $baseText) }
  exit 0
}

# Splice before the LAST "]}" so the base's own entry order is untouched.
$tailIdx = $baseText.LastIndexOf(']}')
if ($tailIdx -lt 0) { throw "base does not end with the expected ]} tail; refusing to splice" }

$fragments = New-Object System.Collections.Generic.List[string]
foreach ($e in $new) { $fragments.Add(($e | ConvertTo-Json -Depth 10 -Compress)) }

$merged = $baseText.Substring(0, $tailIdx) + ',' + [string]::Join(',', $fragments) + $baseText.Substring($tailIdx)
[System.IO.File]::WriteAllText($Out, $merged)

Write-Host ("wrote {0} ({1:N0} bytes, +{2} entries)" -f $Out, $merged.Length, $new.Count) -ForegroundColor Green
foreach ($e in $new) { Write-Host ("  + {0}" -f $e.sig) }
