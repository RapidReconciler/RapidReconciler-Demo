# merge-recording.ps1 - append the gap-filling entries of a DELTA recording into a
# BASE recording, without disturbing the base's per-signature order.
#
# Why append-only-if-absent: replay-shim.js pick() is sequence-aware -- repeated
# captures of one signature replay in order and the LAST one sticks. Appending a
# delta entry for a signature the base already has would make the delta's response
# the sticky one, which can silently swap a company- or period-scoped screen. So
# only signatures the base has never seen are added; everything else is dropped.
#
# -Refresh <path prefixes> is the deliberate exception: it appends the delta's
# entries for those paths EVEN IF the base already has the signature, because the
# underlying data genuinely changed and the base's response is now stale. pick()
# sticks on the LAST entry, so an appended response becomes the one that replays.
#
# Use it narrowly. Measured 2026-08-22: completing a review on Demo2 populated the
# audit trail, so the base's empty /admin/activity response had to be superseded --
# but refreshing /inventory/txv/resolutions in the same pass would have pushed the
# save-and-reflect card past "Your recorded finding" into "In audit findings" and
# skipped the state the beat exists to show. Refresh the surface whose data changed,
# never a signature whose SEQUENCE a beat depends on.
#
# ---------------------------------------------------------------------------
# WHY THIS NO LONGER SPLICES ON A TEXT SEARCH (rewritten 2026-08-24, UI-123)
# ---------------------------------------------------------------------------
# The old version found the insertion point with $baseText.LastIndexOf(']}') and
# the signature set with a regex for "sig":"...". Both read the FILE as prose, and
# both are wrong on a real recording:
#
#   * MEASURED: recording-demo2.json ends
#         ..."}],"session":"1787574992157"}
#     `entries` is NOT the last key, so there is no ']}' at the tail at all. The
#     search therefore ran backwards INTO the data and found a ']}' inside an
#     escaped response body -- splicing a new entry at char 41,666,807, in the
#     middle of another entry's payload. The result parsed in neither Python nor
#     the browser, and the browser symptom was fetch('/recording.json') returning
#     4 bytes of `null` while curl returned the whole file, which reads as a
#     server bug and is not one.
#   * The "sig" regex matches inside escaped bodies too, so a body that happens to
#     contain the text "sig":"..." silently marks a signature as already present
#     and the delta entry it needed gets dropped with a cheerful "nothing to
#     append".
#
# Both are now done by a string-aware scan (RrRecScan below, compiled C# so a
# 50 MB file is milliseconds rather than a PS5.1 char loop). It tracks quotes and
# escapes, so nothing inside a body can be mistaken for structure. If it cannot
# find the entries array it THROWS rather than guessing an offset -- a merge that
# cannot locate the array must not write a file.
#
# It also handles the v2 body pool. A v2 delta's entries carry `bodyRef` into the
# delta's own `bodies` map; appending them raw would produce entries whose refs
# resolve to nothing in the base, i.e. empty bodies replaying as 200s. Appended
# entries get their body INLINED instead (replay-shim's bodyOf() prefers bodyRef
# and falls back to body, so a mixed file is fine). That keeps this a tail splice:
# merging pools would need a second splice into `bodies`, which is the thing that
# just cost a day.
#
# ASCII-only, for PS 5.1.
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

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Text;

// A minimal, string-aware scanner over a recording.json. It does NOT build an
// object model (a 50 MB parse is what this exists to avoid) -- it walks the text
// once, tracking string/escape state, and answers two structural questions:
//   EntriesEnd(s)  -> index of the ']' that closes the top-level "entries" array
//   Sigs(s)        -> the "sig" value of every element of that array
// Anything inside a quoted string is data and can never be structure.
public static class RrRecScan
{
    // Walk from i (which must be at the opening quote of a JSON string) to the
    // index just past its closing quote. Handles backslash escapes.
    static int SkipString(string s, int i)
    {
        i++;                                  // past the opening quote
        while (i < s.Length)
        {
            char c = s[i];
            if (c == '\\') { i += 2; continue; }
            if (c == '"') return i + 1;
            i++;
        }
        throw new FormatException("unterminated string at " + i);
    }

    // Read the string starting at i and return its RAW text (still escaped).
    static string ReadRawString(string s, int i, out int next)
    {
        int start = i;
        next = SkipString(s, i);
        return s.Substring(start + 1, next - start - 2);
    }

    // Index of the '[' that opens the top-level "entries" array, or -1.
    static int EntriesOpen(string s)
    {
        int i = 0, depth = 0;
        while (i < s.Length)
        {
            char c = s[i];
            if (c == '"')
            {
                int after;
                string key = ReadRawString(s, i, out after);
                i = after;
                if (depth == 1 && key == "entries")
                {
                    while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\r' || s[i] == '\n')) i++;
                    if (i < s.Length && s[i] == ':') i++;
                    while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\r' || s[i] == '\n')) i++;
                    if (i < s.Length && s[i] == '[') return i;
                }
                continue;
            }
            if (c == '{' || c == '[') depth++;
            else if (c == '}' || c == ']') depth--;
            i++;
        }
        return -1;
    }

    // Index of the ']' closing the top-level entries array. Throws if absent --
    // guessing an offset is how a 50 MB file gets spliced mid-body.
    public static int EntriesEnd(string s)
    {
        int open = EntriesOpen(s);
        if (open < 0) throw new FormatException("no top-level \"entries\" array found");
        int i = open, depth = 0;
        while (i < s.Length)
        {
            char c = s[i];
            if (c == '"') { i = SkipString(s, i); continue; }
            if (c == '{' || c == '[') { depth++; i++; continue; }
            if (c == '}' || c == ']')
            {
                depth--;
                if (depth == 0) return i;     // the ']' that closes entries
                i++; continue;
            }
            i++;
        }
        throw new FormatException("unterminated \"entries\" array");
    }

    // True when the entries array holds no elements (so the splice must not
    // prepend a comma).
    public static bool EntriesEmpty(string s)
    {
        int open = EntriesOpen(s);
        if (open < 0) throw new FormatException("no top-level \"entries\" array found");
        int i = open + 1;
        while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\r' || s[i] == '\n')) i++;
        return (i < s.Length && s[i] == ']');
    }

    // Every element's "sig" value, read at the element's own top level only, so a
    // body that contains the text "sig":"..." cannot be mistaken for one.
    public static string[] Sigs(string s)
    {
        List<string> outp = new List<string>();
        int open = EntriesOpen(s);
        if (open < 0) throw new FormatException("no top-level \"entries\" array found");
        int i = open + 1, depth = 0;
        string pending = null;
        while (i < s.Length)
        {
            char c = s[i];
            if (c == '"')
            {
                int after;
                string tok = ReadRawString(s, i, out after);
                i = after;
                if (depth == 1)
                {
                    // At an element's own level, a string is either a key or its
                    // value. Track the key, then take the next string as its value.
                    if (pending == null)
                    {
                        int j = i;
                        while (j < s.Length && (s[j] == ' ' || s[j] == '\t' || s[j] == '\r' || s[j] == '\n')) j++;
                        if (j < s.Length && s[j] == ':') { pending = tok; i = j + 1; }
                    }
                    else
                    {
                        if (pending == "sig") outp.Add(tok);
                        pending = null;
                    }
                }
                continue;
            }
            if (c == '{' || c == '[') { depth++; i++; continue; }
            if (c == '}' || c == ']')
            {
                depth--;
                if (depth < 0) break;         // the ']' closing entries
                if (depth == 0) pending = null;
                i++; continue;
            }
            if (c == ',' && depth == 1) { pending = null; i++; continue; }
            i++;
        }
        return outp.ToArray();
    }
}
'@ -Language CSharp

$RefreshList = @($Refresh -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })

$baseText = [System.IO.File]::ReadAllText($Base)
Write-Host ("base: {0:N0} bytes" -f $baseText.Length)

# Structural, not textual. Both of these throw rather than guess.
$tailIdx = [RrRecScan]::EntriesEnd($baseText)
$baseEmpty = [RrRecScan]::EntriesEmpty($baseText)
$baseSigList = [RrRecScan]::Sigs($baseText)
$baseSigs = New-Object System.Collections.Generic.HashSet[string]
foreach ($s in $baseSigList) { [void]$baseSigs.Add($s) }
Write-Host ("base entries: {0}, distinct signatures: {1}, entries array closes at char {2:N0} of {3:N0}" -f `
  $baseSigList.Count, $baseSigs.Count, $tailIdx, $baseText.Length)
if ($tailIdx -lt ($baseText.Length - 200)) {
  # Not an error -- `session` legitimately follows `entries` -- but say so, because
  # the old tail assumption was that this never happened.
  Write-Host ("note: {0} chars follow the entries array (other top-level keys)" -f ($baseText.Length - $tailIdx - 1)) -ForegroundColor DarkGray
}

$deltaObj = [System.IO.File]::ReadAllText($Delta) | ConvertFrom-Json
$deltaBodies = $deltaObj.bodies
function Test-Refresh([string]$path) {
  foreach ($pre in $RefreshList) { if ($path -and $path.StartsWith($pre, [System.StringComparison]::OrdinalIgnoreCase)) { return $true } }
  return $false
}
if ($RefreshList.Count) { Write-Host ("refresh prefixes: {0}" -f ($RefreshList -join ' | ')) -ForegroundColor Yellow }

# Inline a v2 entry's pooled body so the appended entry is self-contained.
function Resolve-Body($e) {
  if ($null -eq $e.PSObject.Properties['bodyRef']) { return $e }
  $ref = $e.bodyRef
  $text = ''
  if ($null -ne $deltaBodies -and $null -ne $deltaBodies.PSObject.Properties[$ref]) {
    $text = $deltaBodies.$ref
  } else {
    Write-Host ("  ! delta entry references body '{0}' which its own pool does not hold; appending an EMPTY body would replay as a silent 200 -- refusing" -f $ref) -ForegroundColor Red
    throw "delta bodyRef '$ref' unresolvable"
  }
  $copy = $e | Select-Object -Property * -ExcludeProperty bodyRef
  $copy | Add-Member -NotePropertyName body -NotePropertyValue $text -Force
  return $copy
}

$new = @(); $refreshed = 0; $inlined = 0
foreach ($e in $deltaObj.entries) {
  $takeIt = $false
  if (-not $baseSigs.Contains($e.sig)) { $takeIt = $true; [void]$baseSigs.Add($e.sig) }
  elseif (Test-Refresh $e.path) { $takeIt = $true; $refreshed++ }
  if (-not $takeIt) { continue }
  $r = Resolve-Body $e
  if (-not [object]::ReferenceEquals($r, $e)) { $inlined++ }
  $new += $r
}
Write-Host ("delta entries: {0}, new signatures: {1}, refreshed (already present): {2}, pooled bodies inlined: {3}" -f `
  $deltaObj.entries.Count, ($new.Count - $refreshed), $refreshed, $inlined)

if ($new.Count -eq 0) {
  Write-Host "nothing to append; base is already complete for this delta" -ForegroundColor Yellow
  if ($Out -ne $Base) { [System.IO.File]::WriteAllText($Out, $baseText) }
  exit 0
}

$fragments = New-Object System.Collections.Generic.List[string]
foreach ($e in $new) { $fragments.Add(($e | ConvertTo-Json -Depth 10 -Compress)) }

$sep = ','
if ($baseEmpty) { $sep = '' }
$merged = $baseText.Substring(0, $tailIdx) + $sep + [string]::Join(',', $fragments) + $baseText.Substring($tailIdx)
[System.IO.File]::WriteAllText($Out, $merged)

# Verify what was written, rather than reporting what was intended. A merge that
# produces an unparseable file is the failure this rewrite exists to stop, so the
# check runs on the OUTPUT and a bad file is reported as a failure, not a success.
$outText = [System.IO.File]::ReadAllText($Out)
$outSigs = [RrRecScan]::Sigs($outText)
$expected = $baseSigList.Count + $new.Count
if ($outSigs.Count -ne $expected) {
  Write-Host ("VERIFY FAILED: output holds {0} entries, expected {1}" -f $outSigs.Count, $expected) -ForegroundColor Red
  exit 1
}
Write-Host ("wrote {0} ({1:N0} bytes, {2} entries = {3} base + {4} appended)" -f `
  $Out, $merged.Length, $outSigs.Count, $baseSigList.Count, $new.Count) -ForegroundColor Green
foreach ($e in $new) { Write-Host ("  + {0}" -f $e.sig) }
