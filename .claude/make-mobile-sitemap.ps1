<#
  make-mobile-sitemap.ps1 -- generate mobile/sitemap.xml from mobile/phones.json

  WHY THIS EXISTS
  Until 2026-08-16 the mobile sitemap held exactly one URL -- the homepage --
  because the phone site had no per-phone pages to list. It now has one per
  phone, served by mobile/functions/_middleware.js off the same phones.json,
  so the sitemap is the ONLY place a phone id has to be repeated. Generating
  it removes the chance to get that wrong, and check-sync.ps1 fails the push
  if the file on disk disagrees with the catalog.

    powershell -NoProfile -ExecutionPolicy Bypass -File .claude\make-mobile-sitemap.ps1

  Re-run after ANY edit to mobile/phones.json.
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
$src  = Join-Path $root 'mobile\phones.json'
$dest = Join-Path $root 'mobile\sitemap.xml'
$site = 'https://mobile.lazycomparo.com'

$phones = @((Read-SourceText -Path $src | ConvertFrom-Json))
if ($phones.Count -eq 0) { throw "no phones parsed from $src" }

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('<?xml version="1.0" encoding="UTF-8"?>')
$lines.Add('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
$lines.Add("  <url><loc>$site/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>")
foreach ($p in $phones) {
    if (-not $p.id) { throw "a phone entry has no id" }
    # Catalog prices are reviewed periodically, not fetched live, so these
    # change on our schedule -- monthly is the honest signal.
    $lines.Add("  <url><loc>$site/phone/$($p.id)</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>")
}
$lines.Add('</urlset>')

$xml = ($lines -join "`n") + "`n"

if ($AsString) { return $xml }

Write-Utf8NoBom -Path $dest -Content $xml
Write-Host "  wrote mobile/sitemap.xml -- $($phones.Count) phone URLs" -ForegroundColor Green
