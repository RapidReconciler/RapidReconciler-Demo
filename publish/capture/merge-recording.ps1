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

# -Refresh <path prefixes> is the deliberate exception to append-only-if-absent: it
# appends the delta's entries for those paths EVEN IF the base already has the
# signature, because the underlying data genuinely changed and the base's response is
# now stale. pick() sticks on the LAST entry, so an appended response becomes the one
# that replays.
#
# Use it narrowly. Measured 2026-08-22: completing a review on Demo2 populated the
# audit trail, so the base's empty /admin/activity response had to be superseded --
# but refreshing /inventory/txv/resolutions in the same pass would have pushed the
# save-and-reflect card past "Your recorded finding" into "In audit findings" and
# skipped the state the beat exists to show. Refresh the surface whose data changed,
# never a signature whose SEQUENCE a beat depends on.
param(
  [Parameter(Mandatory=$true)][string]$Base,
  [Parameter(Mandatory=$true)][string]$Delta,
  [Parameter(Mandatory=$true)][string]$Out,
  # COMMA-SEPARATED STRING, not [string[]]. Invoking this script through
  # `powershell -File` flattens an array argument into a single token, so a
  # [string[]] parameter silently receives one useless element and every
  # StartsWith test fails. Measured 2026-08-22: the merge reported
  # "refreshed: 0" and the stale response shipped, with no error anywhere.
  # Splitting inside the script works under -File and -Command alike.
  [string]$Refresh = ''
)

$RefreshList = @($Refresh -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })

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
function Test-Refresh([string]$path) {
  foreach ($pre in $RefreshList) { if ($path -and $path.StartsWith($pre, [System.StringComparison]::OrdinalIgnoreCase)) { return $true } }
  return $false
}
if ($RefreshList.Count) { Write-Host ("refresh prefixes: {0}" -f ($RefreshList -join ' | ')) -ForegroundColor Yellow }

$new = @(); $refreshed = 0
foreach ($e in $deltaObj.entries) {
  if (-not $baseSigs.Contains($e.sig)) { $new += $e; [void]$baseSigs.Add($e.sig); continue }
  if (Test-Refresh $e.path) { $new += $e; $refreshed++ }
}
Write-Host ("delta entries: {0}, new signatures: {1}, refreshed (already present): {2}" -f $deltaObj.entries.Count, ($new.Count - $refreshed), $refreshed)

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
