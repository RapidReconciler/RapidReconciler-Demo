# tune-save-sequence.ps1 - duplicate the FIRST recorded response for one signature,
# so a save-and-reflect beat flips at the right moment during replay.
#
# WHY THIS EXISTS
# replay-shim.js pick() is sequence-aware: repeated captures of one signature are
# served in capture order, and the LAST one sticks. A "the save must actually
# reflect" beat therefore depends on an exact COUNT, not just an order:
#
#   reads consumed before the presenter clicks Save  ==  number of before-state entries
#
# Measured on the Demo1 analyst walk (2026-08-20): the card state comes from
# GET /inventory/txv/resolutions?company=<co>, and the path
# "load Home -> click Transaction Variance" consumes TWO reads (one at boot, one
# on the tab click). The capture produced [before, after], so the second read --
# the one that paints the card the presenter is looking at -- already served the
# after-state, and the card showed the recorded finding BEFORE anything was saved.
# That is exactly the "appears to work" the owner ruled out.
#
# Duplicating the before-state entry once gives [before, before, after]:
#   boot        -> before
#   tab click   -> before   (card reads LIKELY CAUSE, nothing saved yet)
#   Save        -> POST
#   boot again  -> after
#   tab click   -> after    (last one sticks; card reads YOUR RECORDED FINDING)
#
# Insertion is a TEXT splice, not a JSON round-trip: PS5.1's ConvertFrom-Json on a
# 50 MB recording is slow and memory-hungry, and a re-serialize would rewrite every
# entry. Entries end with the "via" field, which is short and cannot occur inside a
# recorded response body, so it is a safe terminator to scan for.

param(
  [Parameter(Mandatory=$true)][string]$Path,
  [Parameter(Mandatory=$true)][string]$Sig,     # exact signature, e.g. 'GET /inventory/txv/resolutions?company=80002'
  [int]$Copies = 1,
  [string]$Out = ''
)

$ErrorActionPreference = 'Stop'
if (-not $Out) { $Out = $Path }

$t = [System.IO.File]::ReadAllText($Path)
Write-Host ("in : {0:N0} bytes" -f $t.Length)

$needle = '{"sig":"' + $Sig.Replace('\', '\\').Replace('"', '\"') + '"'
$start = $t.IndexOf($needle)
if ($start -lt 0) { throw "signature not found in the recording: $Sig" }

# Entries are emitted flat and end with the "via" field. Find the first one after
# the entry start, then the object's closing brace right after its value.
$viaIdx = $t.IndexOf('"via":"', $start)
if ($viaIdx -lt 0) { throw 'no "via" field after the entry start; the recording shape changed' }
$close = $t.IndexOf('}', $viaIdx)
if ($close -lt 0) { throw 'no closing brace after the "via" field' }

$entry = $t.Substring($start, $close - $start + 1)
Write-Host ("first entry for that signature: {0:N0} bytes at char {1:N0}" -f $entry.Length, $start)

# Sanity: the slice must be parseable on its own. Cheap, and it catches a bad scan
# before a 50 MB file is overwritten.
try { $null = $entry | ConvertFrom-Json } catch { throw "the extracted entry does not parse as JSON; refusing to write. $_" }

$insert = ''
for ($i = 0; $i -lt $Copies; $i++) { $insert += $entry + ',' }
$merged = $t.Substring(0, $start) + $insert + $t.Substring($start)
[System.IO.File]::WriteAllText($Out, $merged)

Write-Host ("out: {0:N0} bytes (+{1} copy/copies of the before-state)" -f $merged.Length, $Copies) -ForegroundColor Green
