<#
  make-games-sitemap.ps1 -- generate games/sitemap.xml from games/games.json

  WHY THIS EXISTS
  Adding a game used to mean editing the catalog in games/index.html, mirroring
  it into games/functions/_middleware.js, adding a <loc> here by hand, and
  updating EXTRA_STORES -- four hand edits, three of which a check script had to
  police. The catalog now lives in games/games.json and both the app and the
  middleware read it, so this file is the last derived copy, and it is
  generated rather than typed. check-sync.ps1 fails the push if it is stale.

    powershell -NoProfile -ExecutionPolicy Bypass -File .claude\make-games-sitemap.ps1

  Re-run after ANY edit to games/games.json.
#>

[CmdletBinding()]
param(
    # Return the XML instead of writing it -- check-sync.ps1 uses this to
    # compare against what is on disk without touching the file.
    [switch]$AsString
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\JsLiteral.ps1"

$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root 'games\games.json'
$dest = Join-Path $root 'games\sitemap.xml'
$site = 'https://pcgames.lazycomparo.com'

# Bind before wrapping: PS 5.1 hands a JSON array to the pipeline as ONE item.
$parsed = Read-SourceText -Path $src | ConvertFrom-Json
$games  = @($parsed)
if ($games.Count -eq 0) { throw "no games parsed from $src" }

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('<?xml version="1.0" encoding="UTF-8"?>')
$lines.Add('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
$lines.Add("  <url><loc>$site/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>")
$lines.Add('  <!-- Hub pages: regenerated from live pricing on every request, so they change')
$lines.Add('       far more often than the per-game pages. -->')
$lines.Add("  <url><loc>$site/gog</loc><changefreq>daily</changefreq><priority>0.9</priority></url>")
$lines.Add("  <url><loc>$site/deals/all-time-low</loc><changefreq>daily</changefreq><priority>0.9</priority></url>")
foreach ($g in $games) {
    if (-not $g.id) { throw 'a game entry has no id' }
    $lines.Add("  <url><loc>$site/game/$($g.id)</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>")
}
$lines.Add('</urlset>')

$xml = ($lines -join "`n") + "`n"

if ($AsString) { return $xml }

Write-Utf8NoBom -Path $dest -Content $xml
Write-Host "  wrote games/sitemap.xml -- $($games.Count) game URLs" -ForegroundColor Green
