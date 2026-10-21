# publish-pages.ps1 -- publish the built demo bundle to GitHub Pages (UI-222).
#
#   powershell -ExecutionPolicy Bypass -File publish\publish-pages.ps1
#   powershell -ExecutionPolicy Bypass -File publish\publish-pages.ps1 -BundleDir bundle-next
#
# WHAT IT DOES. Copies the built bundle into a scratch folder, adds CNAME and .nojekyll,
# commits it as ONE commit on an orphan branch and force-pushes that branch (gh-pages) to
# origin. Pages serves the branch root at the custom domain.
#
# WHY ONE FORCE-PUSHED COMMIT. The bundle is build output (~210 MB, three ~61 MB recordings)
# and stays out of main (.gitignore). Pushing it as a normal history would add the whole
# bundle to the repo on every rebuild. One orphan commit, replaced each time, keeps a single
# copy.
#
# WHY A CUSTOM DOMAIN, NOT rapidreconciler.github.io/RapidReconciler-Demo/. The bundle is
# root-relative by design: build-demo.ps1 injects /date-freeze.js, /request-signature.js and
# /replay-shim.js (66 refs), and the flattened product pages reach ../Tools, ../RRUniversity
# and ../login.html (90 refs), which resolve only when the bundle IS the site root. Measured
# 2026-10-21. Owner ruling the same day: serve it at its own subdomain.
#
# WHY .nojekyll. Pages runs Jekyll by default, which drops folders whose names start with "_".
#
# Not shipped: _uitest/ (test pages) and the local launchers (launch.ps1 / launch.cmd).
#
# ASCII only: Windows PowerShell 5.1 reads scripts as cp1252.

param(
  [string]$BundleDir = 'bundle',
  [string]$Domain    = 'demo.rapidreconciler.getgsi.com',
  [string]$Branch    = 'gh-pages'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$src  = if ([IO.Path]::IsPathRooted($BundleDir)) { $BundleDir } else { Join-Path $repo $BundleDir }
if (-not (Test-Path (Join-Path $src 'home.html'))) { throw "No built bundle at $src (home.html missing). Run publish\build-demo.ps1 first." }

$remote = (& git -C $repo remote get-url origin).Trim()
if (-not $remote) { throw 'No origin remote on the demo repo.' }

$work = Join-Path $env:TEMP ('rr-demo-pages-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  Write-Host "copying $src -> $work"
  # robocopy exit codes 0-7 are success; 8+ is a failure.
  & robocopy $src $work /E /NFL /NDL /NJH /NJS /NP /XD _uitest /XF launch.ps1 launch.cmd | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit $LASTEXITCODE" }

  Set-Content -Path (Join-Path $work 'CNAME') -Value $Domain -Encoding ASCII -NoNewline
  Set-Content -Path (Join-Path $work '.nojekyll') -Value '' -Encoding ASCII -NoNewline

  $files = (Get-ChildItem $work -Recurse -File).Count
  $mb = [math]::Round(((Get-ChildItem $work -Recurse -File | Measure-Object -Property Length -Sum).Sum) / 1MB, 1)
  Write-Host "staged $files files, $mb MB, CNAME=$Domain"

  & git -C $work init -q
  if ($LASTEXITCODE -ne 0) { throw 'git init failed' }
  & git -C $work checkout -q -b $Branch
  & git -C $work add -A
  $stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm') + 'Z'
  $srcHead = (& git -C $repo rev-parse --short HEAD).Trim()
  & git -C $work -c user.name="$(git -C $repo config user.name)" -c user.email="$(git -C $repo config user.email)" commit -q -m "Publish demo bundle ($BundleDir, built from demo repo $srcHead) $stamp"
  if ($LASTEXITCODE -ne 0) { throw 'git commit failed' }

  Write-Host "pushing $Branch to origin (force, single commit) ..."
  & git -C $work -c http.postBuffer=524288000 push --force $remote "${Branch}:${Branch}"
  if ($LASTEXITCODE -ne 0) { throw "git push failed with exit $LASTEXITCODE" }
  Write-Host ("published: {0} at {1}" -f $Branch, (& git -C $work rev-parse --short HEAD).Trim()) -ForegroundColor Green
}
finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
