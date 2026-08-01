<#
  check-sync.ps1 -- catalog consistency check for the games and mobile sites.

  WHY THIS EXISTS
  The same 100 games are written down in three places, by hand:

    games/index.html               the real catalog the app renders
    games/functions/_middleware.js a trimmed copy used for SEO pre-render
    games/sitemap.xml              one <loc> per /game/<id>

  Nothing enforces agreement, and the failure is silent: a game added to the
  app but not the middleware still renders for humans while crawlers get the
  homepage fallback, and a stale price in the middleware is served to Google
  as the indexed price. Both look fine in a browser.

  It also sanity-checks mobile/phones.json, which the mobile app fetches at
  boot -- malformed JSON there is a blank site, not a degraded one.

  Run this before `git push`. Exit code 0 = clean, 1 = something drifted.

    powershell -NoProfile -ExecutionPolicy Bypass -File .claude\check-sync.ps1

  Add a check whenever you add a hand-maintained copy of catalog data.
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\JsLiteral.ps1"

$root       = Split-Path -Parent $PSScriptRoot
$appPath    = Join-Path $root 'games\index.html'
$seoPath    = Join-Path $root 'games\functions\_middleware.js'
$mapPath    = Join-Path $root 'games\sitemap.xml'
$siteOrigin = 'https://pcgames.lazycomparo.com'

$script:Problems = 0

function Report {
    param(
        [Parameter(Mandatory)][string]$Label,
        [string[]]$Failures = @(),
        [string]$Hint
    )
    if ($Failures.Count -eq 0) {
        Write-Host '  [OK]   ' -ForegroundColor Green -NoNewline
        Write-Host $Label
        return
    }
    $script:Problems += $Failures.Count
    Write-Host '  [FAIL] ' -ForegroundColor Red -NoNewline
    Write-Host $Label
    foreach ($f in $Failures) { Write-Host "           $f" -ForegroundColor Yellow }
    if ($Hint) { Write-Host "           -> $Hint" -ForegroundColor DarkGray }
}

Write-Host ''
Write-Host 'LazyComparo -- catalog sync check' -ForegroundColor Cyan

# ---------------------------------------------------------------- load sources
$app     = @(Get-JsLiteral -Path $appPath -Name GAMES)
$seo     = @(Get-JsLiteral -Path $seoPath -Name GAMES)
$buckets = Get-JsLiteral -Path $appPath -Name GENRE_BUCKETS
$stores  = Get-JsLiteral -Path $appPath -Name EXTRA_STORES

$mapXml  = [xml](Read-SourceText -Path $mapPath)
$locs    = @($mapXml.urlset.url | ForEach-Object { $_.loc })
$mapIds  = @($locs | Where-Object { $_ -match '/game/([^/]+)/?$' } |
                     ForEach-Object { [regex]::Match($_, '/game/([^/]+)/?$').Groups[1].Value })

Write-Host ("  games/index.html      {0,3} games" -f $app.Count)   -ForegroundColor DarkGray
Write-Host ("  _middleware.js        {0,3} games" -f $seo.Count)   -ForegroundColor DarkGray
Write-Host ("  sitemap.xml           {0,3} game URLs" -f $mapIds.Count) -ForegroundColor DarkGray
Write-Host ''

$appIds = @($app | ForEach-Object { $_.id })
$seoIds = @($seo | ForEach-Object { $_.id })

# ------------------------------------------------------------- 1. unique ids
$fails = @()
foreach ($grp in ($appIds | Group-Object | Where-Object Count -gt 1)) {
    $fails += "duplicate id '$($grp.Name)' in games/index.html ($($grp.Count)x)"
}
foreach ($grp in ($seoIds | Group-Object | Where-Object Count -gt 1)) {
    $fails += "duplicate id '$($grp.Name)' in _middleware.js ($($grp.Count)x)"
}
# A duplicate AppID means two catalog entries fight over the same live price.
foreach ($grp in (@($app | ForEach-Object { $_.appId }) | Group-Object | Where-Object Count -gt 1)) {
    $names = ($app | Where-Object { "$($_.appId)" -eq $grp.Name } | ForEach-Object { $_.id }) -join ', '
    $fails += "duplicate appId $($grp.Name) shared by: $names"
}
Report -Label 'ids and Steam AppIDs are unique' -Failures $fails

# --------------------------------------------- 2. app catalog vs SEO middleware
$fails = @()
foreach ($id in ($appIds | Where-Object { $seoIds -notcontains $_ })) {
    $fails += "'$id' is in the app catalog but missing from _middleware.js"
}
foreach ($id in ($seoIds | Where-Object { $appIds -notcontains $_ })) {
    $fails += "'$id' is in _middleware.js but missing from the app catalog"
}
Report -Label 'the SEO middleware lists the same games as the app' -Failures $fails `
       -Hint 'mirror the entry into the GAMES array in games/functions/_middleware.js'

# ------------------------------------------------------- 3. shared field values
# The middleware copy is trimmed, so only compare what both sides carry.
# left  = property path in _middleware.js, right = where it lives in index.html
$mirrored = @(
    @{ Seo = 'title';   App = { param($g) $g.title } }
    @{ Seo = 'appId';   App = { param($g) $g.appId } }
    @{ Seo = 'studio';  App = { param($g) $g.studio } }
    @{ Seo = 'genre';   App = { param($g) $g.genre } }
    @{ Seo = 'year';    App = { param($g) $g.year } }
    @{ Seo = 'price';   App = { param($g) $g.price } }
    @{ Seo = 'rating';  App = { param($g) $g.displayInfo.rating } }
    @{ Seo = 'hours';   App = { param($g) $g.displayInfo.hoursToBeat } }
    @{ Seo = 'players'; App = { param($g) $g.displayInfo.players } }
    @{ Seo = 'pro';     App = { param($g) if ($g.pros.Count) { $g.pros[0] } else { $null } } }
)
$appById = @{}
foreach ($g in $app) { $appById[$g.id] = $g }

$fails = @()
foreach ($s in $seo) {
    if (-not $appById.ContainsKey($s.id)) { continue }   # already reported above
    $a = $appById[$s.id]
    foreach ($f in $mirrored) {
        $seoVal = $s.PSObject.Properties[$f.Seo].Value
        $appVal = & $f.App $a
        $same = if ($seoVal -is [ValueType] -or $appVal -is [ValueType]) {
            [double]$seoVal -eq [double]$appVal
        } else {
            [string]$seoVal -ceq [string]$appVal
        }
        if (-not $same) {
            $fails += ("{0}.{1}: middleware '{2}' vs app '{3}'" -f $s.id, $f.Seo, $seoVal, $appVal)
        }
    }
}
Report -Label 'mirrored fields agree (title, appId, studio, genre, year, price, rating, hours, players, pro)' `
       -Failures $fails -Hint 'the app catalog is the source of truth -- copy its value into _middleware.js'

# -------------------------------------------------------------- 4. sitemap.xml
$fails = @()
if ($locs -notcontains "$siteOrigin/") { $fails += "homepage <loc> $siteOrigin/ is missing" }
foreach ($id in ($appIds | Where-Object { $mapIds -notcontains $_ })) {
    $fails += "'$id' has no sitemap entry ($siteOrigin/game/$id)"
}
foreach ($id in ($mapIds | Where-Object { $appIds -notcontains $_ })) {
    $fails += "sitemap lists '/game/$id', which is not in the catalog"
}
foreach ($grp in ($mapIds | Group-Object | Where-Object Count -gt 1)) {
    $fails += "sitemap lists '/game/$($grp.Name)' $($grp.Count) times"
}
Report -Label 'sitemap.xml covers every game and nothing else' -Failures $fails `
       -Hint 'add <url><loc>.../game/<id></loc><changefreq>weekly</changefreq><priority>0.8</priority></url>'

# --------------------------------------------------- 5. genre buckets coverage
# An unmapped genre silently drops the game into 'Other' in the filter.
$bucketKeys = @($buckets.PSObject.Properties | ForEach-Object { $_.Name })
$fails = @()
foreach ($genre in (@($app | ForEach-Object { $_.genre }) | Sort-Object -Unique)) {
    if ($bucketKeys -notcontains $genre) {
        $used = ($app | Where-Object { $_.genre -eq $genre } | ForEach-Object { $_.id }) -join ', '
        $fails += "genre '$genre' is not in GENRE_BUCKETS -- falls into 'Other' (used by: $used)"
    }
}
Report -Label 'every genre maps to a filter bucket' -Failures $fails `
       -Hint 'add the genre to GENRE_BUCKETS in games/index.html'

# --------------------------------------------------- 6. mobile phones.json
# The phone catalog is a separate data file, so a malformed or truncated
# phones.json blanks the mobile site at boot -- worth catching here rather
# than in production.
$phonesPath = Join-Path $root 'mobile\phones.json'
$fails = @()
$phones = @()
try {
    # Bind before wrapping: ConvertFrom-Json emits the array as ONE item, so
    # @(... | ConvertFrom-Json) would yield a nested 1-element array.
    $parsedPhones = Read-SourceText -Path $phonesPath | ConvertFrom-Json
    $phones = @($parsedPhones)
} catch {
    $fails += "phones.json is not valid JSON: $($_.Exception.Message)"
}
if ($fails.Count -eq 0) {
    if ($phones.Count -eq 0) { $fails += 'phones.json contains no phones' }

    foreach ($grp in (@($phones | ForEach-Object { $_.id }) | Group-Object | Where-Object Count -gt 1)) {
        $fails += "duplicate phone id '$($grp.Name)' ($($grp.Count)x)"
    }
    # Every phone must carry the same shape as the first, or a view that reads
    # the missing field renders 'undefined' for that one device only.
    if ($phones.Count -gt 0) {
        $refKeys  = @($phones[0].PSObject.Properties | ForEach-Object { $_.Name })
        $specKeys = @('camera', 'battery', 'performance', 'display')   # used by scorePhone
        foreach ($p in $phones) {
            $keys = @($p.PSObject.Properties | ForEach-Object { $_.Name })
            $missing = @($refKeys | Where-Object { $keys -notcontains $_ })
            if ($missing.Count) { $fails += "phone '$($p.id)' is missing: $($missing -join ', ')" }
            if ($p.PSObject.Properties['specs']) {
                $sk = @($p.specs.PSObject.Properties | ForEach-Object { $_.Name })
                $sm = @($specKeys | Where-Object { $sk -notcontains $_ })
                if ($sm.Count) { $fails += "phone '$($p.id)' has no specs.$($sm -join '/, specs.')" }
            }
        }
    }
    # The app reads the catalog from phones.json now; an inline array left
    # behind in index.html would be dead code that looks authoritative.
    $mobileHtml = Read-SourceText -Path (Join-Path $root 'mobile\index.html')
    if ($mobileHtml -match '(?m)^[ \t]*const[ \t]+PHONES[ \t]*=[ \t]*\[') {
        $fails += 'mobile/index.html still declares an inline PHONES array (phones.json is the source of truth)'
    }
}
Report -Label "mobile/phones.json is loadable and complete ($($phones.Count) phones)" -Failures $fails `
       -Hint 'fix mobile/phones.json -- the mobile site will not render without it'

# ------------------------------------------------------ 7. EXTRA_STORES keys
# A typo'd key here is dead data: it never matches a game and never shows up.
$fails = @()
foreach ($key in ($stores.PSObject.Properties | ForEach-Object { $_.Name })) {
    if ($appIds -notcontains $key) { $fails += "EXTRA_STORES key '$key' matches no game id" }
}
Report -Label 'EXTRA_STORES keys all match real game ids' -Failures $fails `
       -Hint 'fix the key in games/index.html (it must equal the game id)'

# ---------------------------------------------------------------------- result
Write-Host ''
if ($script:Problems -eq 0) {
    Write-Host "  All checks passed -- $($app.Count) games in sync across 3 files." -ForegroundColor Green
    Write-Host ''
    exit 0
}
Write-Host "  $($script:Problems) problem(s) found -- fix before pushing." -ForegroundColor Red
Write-Host ''
exit 1
