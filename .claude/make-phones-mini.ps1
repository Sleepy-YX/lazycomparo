<#
  make-phones-mini.ps1 -- derive landing/phones-mini.json from mobile/phones.json

  WHY THIS EXISTS
  The landing page now scores a real phone verdict inline (the 3-question
  advisor in the Phones section), so it needs the catalog. Three ways to get
  it, and only one of them is right:

    1. Fetch mobile/phones.json cross-origin. Needs CORS headers on the mobile
       project, breaks in local preview, and ships 53 KB to score four numbers.
    2. Hand-copy a trimmed list into landing/index.html. Two catalogs, drifting
       from the first edit onward -- exactly what extracting phones.json fixed.
    3. Generate a trimmed copy at build time from the one real catalog, and let
       the pre-push check fail if it is stale. <- this file

  The output carries ONLY what scorePhone() and the picker label need. If the
  landing widget starts showing a field, add it to $Keep below and re-run --
  do not hand-edit landing/phones-mini.json, check-sync.ps1 will reject it.

    powershell -NoProfile -ExecutionPolicy Bypass -File .claude\make-phones-mini.ps1

  Re-run after ANY edit to mobile/phones.json. check-sync.ps1 enforces it.
#>

[CmdletBinding()]
param(
    # Return the JSON instead of writing it -- check-sync.ps1 uses this to
    # compare against what is on disk without touching the file.
    [switch]$AsString
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\JsLiteral.ps1"

$root   = Split-Path -Parent $PSScriptRoot
$src    = Join-Path $root 'mobile\phones.json'
$dest   = Join-Path $root 'landing\phones-mini.json'

# Everything the landing widget touches, and nothing else. `price` is the
# budget filter, `ecosystem`/`ecosystemFamily` drive the friction penalty, and
# the four specs are the entire scoring input.
$Keep      = @('id', 'brand', 'model', 'year', 'price', 'ecosystem', 'ecosystemFamily')
$KeepSpecs = @('camera', 'battery', 'performance', 'display')

$phones = @((Read-SourceText -Path $src | ConvertFrom-Json))
if ($phones.Count -eq 0) { throw "no phones parsed from $src" }

$mini = foreach ($p in $phones) {
    $row = [ordered]@{}
    foreach ($k in $Keep) {
        if (-not $p.PSObject.Properties[$k]) { throw "phone '$($p.id)' has no '$k'" }
        $row[$k] = $p.$k
    }
    $specs = [ordered]@{}
    foreach ($k in $KeepSpecs) {
        if (-not $p.specs.PSObject.Properties[$k]) { throw "phone '$($p.id)' has no specs.$k" }
        $specs[$k] = $p.specs.$k
    }
    $row['specs'] = $specs
    [pscustomobject]$row
}

# -Compress because this is fetched, not read. Depth 4 covers row -> specs.
# ConvertTo-Json escapes non-ASCII to \uXXXX, which is valid JSON and keeps the
# file pure ASCII -- one less encoding question for a file two sites read.
$json = ($mini | ConvertTo-Json -Depth 4 -Compress)

if ($AsString) { return $json }

Write-Utf8NoBom -Path $dest -Content $json
$kb = [math]::Round((Get-Item $dest).Length / 1KB, 1)
Write-Host "  wrote landing/phones-mini.json -- $($mini.Count) phones, $kb KB" -ForegroundColor Green
