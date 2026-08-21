<#
  check-sync.ps1 -- catalog consistency check for the games and mobile sites.

  WHY THIS EXISTS
  Both catalogs are now data files, each read by exactly one app and one edge
  middleware:

    games/games.json      100 games   -> games/index.html + games/functions/_middleware.js
    mobile/phones.json     50 phones  -> mobile/index.html + mobile/functions/_middleware.js

  That kills the failure this script was written for -- a game added to the app
  but not to the hand-mirrored copy in the middleware, so humans saw it and
  crawlers got the homepage fallback. What is left to police is the DERIVED
  files (two sitemaps and landing/phones-mini.json, all generated) and the
  hand-typed counts in the landing hero, which go stale silently.

  Run this before `git push`. Exit code 0 = clean, 1 = something drifted.

    powershell -NoProfile -ExecutionPolicy Bypass -File .claude\check-sync.ps1

  Add a check whenever you add a derived copy of catalog data.
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\JsLiteral.ps1"

$root        = Split-Path -Parent $PSScriptRoot
$gamesPath   = Join-Path $root 'games\games.json'
$appPath     = Join-Path $root 'games\index.html'
$seoPath     = Join-Path $root 'games\functions\_middleware.js'
$mapPath     = Join-Path $root 'games\sitemap.xml'
$phonesPath  = Join-Path $root 'mobile\phones.json'
$mobileHtml  = Join-Path $root 'mobile\index.html'
$mobileMap   = Join-Path $root 'mobile\sitemap.xml'
$miniPath    = Join-Path $root 'landing\phones-mini.json'
$landingPath = Join-Path $root 'landing\index.html'

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

# Bind before wrapping: PS 5.1 hands a JSON array to the pipeline as ONE item,
# so @(... | ConvertFrom-Json) would yield a nested 1-element array.
function Read-JsonArray {
    param([Parameter(Mandatory)][string]$Path)
    $parsed = Read-SourceText -Path $Path | ConvertFrom-Json
    return @($parsed)
}

Write-Host ''
Write-Host 'LazyComparo -- catalog sync check' -ForegroundColor Cyan

# ---------------------------------------------------------------- load sources
$games   = @()
$phones  = @()
$loadFails = @()
try   { $games  = Read-JsonArray -Path $gamesPath }
catch { $loadFails += "games/games.json is not valid JSON: $($_.Exception.Message)" }
try   { $phones = Read-JsonArray -Path $phonesPath }
catch { $loadFails += "mobile/phones.json is not valid JSON: $($_.Exception.Message)" }

if ($loadFails.Count) {
    Report -Label 'catalogs parse' -Failures $loadFails `
           -Hint 'neither site renders without its catalog -- fix the JSON first'
    Write-Host ''
    Write-Host "  $($script:Problems) problem(s) found -- fix before pushing." -ForegroundColor Red
    Write-Host ''
    exit 1
}

$buckets = Get-JsLiteral -Path $appPath -Name GENRE_BUCKETS
$gameIds = @($games | ForEach-Object { $_.id })

Write-Host ("  games/games.json      {0,3} games"  -f $games.Count)  -ForegroundColor DarkGray
Write-Host ("  mobile/phones.json    {0,3} phones" -f $phones.Count) -ForegroundColor DarkGray
Write-Host ''

# ------------------------------------------------------------- 1. games.json shape
# A missing field renders as 'undefined' on one card only, or throws inside the
# middleware's trim() and takes the whole pre-render down with it.
$required     = @('id','appId','title','studio','genre','year','price','accent','maxPlayers','specs','displayInfo','tags','pros','cons')
$requiredSpec = @('combat','story','coop','replay')
$requiredInfo = @('hoursToBeat','rating','players','earlyAccess','platform')
$fails = @()
if ($games.Count -eq 0) { $fails += 'games.json contains no games' }
foreach ($g in $games) {
    $keys = @($g.PSObject.Properties | ForEach-Object { $_.Name })
    $missing = @($required | Where-Object { $keys -notcontains $_ })
    if ($missing.Count) { $fails += "game '$($g.id)' is missing: $($missing -join ', ')"; continue }
    $sk = @($g.specs.PSObject.Properties | ForEach-Object { $_.Name })
    foreach ($k in $requiredSpec) { if ($sk -notcontains $k) { $fails += "game '$($g.id)' has no specs.$k" } }
    $ik = @($g.displayInfo.PSObject.Properties | ForEach-Object { $_.Name })
    foreach ($k in $requiredInfo) { if ($ik -notcontains $k) { $fails += "game '$($g.id)' has no displayInfo.$k" } }
    # `stores` is optional (Steam-only games carry none) but must be a list of
    # real store names when present. 'Steam' is implied everywhere and listing
    # it again would print it twice.
    if ($g.PSObject.Properties['stores']) {
        foreach ($s in @($g.stores)) {
            if ($s -eq 'Steam') { $fails += "game '$($g.id)' lists 'Steam' in stores (it is implied)" }
            elseif ([string]::IsNullOrWhiteSpace($s)) { $fails += "game '$($g.id)' has an empty store name" }
        }
    }
}
Report -Label "games/games.json is loadable and complete ($($games.Count) games)" -Failures $fails `
       -Hint 'copy the shape of an existing entry -- every game needs the same keys'

# ------------------------------------------------------------- 2. unique ids
$fails = @()
foreach ($grp in ($gameIds | Group-Object | Where-Object Count -gt 1)) {
    $fails += "duplicate id '$($grp.Name)' in games.json ($($grp.Count)x)"
}
# A duplicate AppID means two catalog entries fight over the same live price.
foreach ($grp in (@($games | ForEach-Object { $_.appId }) | Group-Object | Where-Object Count -gt 1)) {
    $names = ($games | Where-Object { "$($_.appId)" -eq $grp.Name } | ForEach-Object { $_.id }) -join ', '
    $fails += "duplicate appId $($grp.Name) shared by: $names"
}
foreach ($grp in (@($phones | ForEach-Object { $_.id }) | Group-Object | Where-Object Count -gt 1)) {
    $fails += "duplicate phone id '$($grp.Name)' ($($grp.Count)x)"
}
Report -Label 'ids and Steam AppIDs are unique' -Failures $fails

# ------------------------------------------------- 3. no catalog copies left behind
# Both catalogs are files now. An inline array left in an app -- or a mirrored
# one in a middleware -- would be dead code that still looks authoritative.
$fails = @()
$appHtml = Read-SourceText -Path $appPath
if ($appHtml -match '(?m)^[ \t]*const[ \t]+GAMES[ \t]*=[ \t]*\[') {
    $fails += 'games/index.html still declares an inline GAMES array (games.json is the source of truth)'
}
if ($appHtml -match '(?m)^[ \t]*const[ \t]+EXTRA_STORES[ \t]*=[ \t]*\{') {
    $fails += 'games/index.html still declares EXTRA_STORES (store availability lives on the game now)'
}
$seoJs = Read-SourceText -Path $seoPath
if ($seoJs -match '(?m)^[ \t]*const[ \t]+GAMES[ \t]*=[ \t]*\[') {
    $fails += 'games/functions/_middleware.js still declares its own GAMES copy'
}
if ($seoJs -match '(?m)^[ \t]*const[ \t]+EXTRA_STORES[ \t]*=[ \t]*\{') {
    $fails += 'games/functions/_middleware.js still declares its own EXTRA_STORES copy'
}
$mobHtml = Read-SourceText -Path $mobileHtml
if ($mobHtml -match '(?m)^[ \t]*const[ \t]+PHONES[ \t]*=[ \t]*\[') {
    $fails += 'mobile/index.html still declares an inline PHONES array (phones.json is the source of truth)'
}
Report -Label 'no catalog copies left in the apps or middlewares' -Failures $fails `
       -Hint 'delete the copy -- the JSON file is the only catalog'

# ------------------------------------------------------------- 4. phones.json shape
$fails = @()
if ($phones.Count -eq 0) { $fails += 'phones.json contains no phones' }
if ($phones.Count -gt 0) {
    # Every phone must carry the same shape as the first, or a view that reads
    # the missing field renders 'undefined' for that one device only.
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
Report -Label "mobile/phones.json is loadable and complete ($($phones.Count) phones)" -Failures $fails `
       -Hint 'fix mobile/phones.json -- the mobile site will not render without it'

# --------------------------------------------------- 5. genre buckets coverage
# An unmapped genre silently drops the game into 'Other' in the filter.
$bucketKeys = @($buckets.PSObject.Properties | ForEach-Object { $_.Name })
$fails = @()
foreach ($genre in (@($games | ForEach-Object { $_.genre }) | Sort-Object -Unique)) {
    if ($bucketKeys -notcontains $genre) {
        $used = ($games | Where-Object { $_.genre -eq $genre } | ForEach-Object { $_.id }) -join ', '
        $fails += "genre '$genre' is not in GENRE_BUCKETS -- falls into 'Other' (used by: $used)"
    }
}
Report -Label 'every genre maps to a filter bucket' -Failures $fails `
       -Hint 'add the genre to GENRE_BUCKETS in games/index.html'

# ------------------------------------------------------- 6. sitemaps are fresh
# Both sitemaps are generated from their catalog. The only failure mode worth
# guarding is "someone edited the catalog and forgot to re-run the generator",
# which would leave new pages unlisted and deleted ones advertised.
$derived = @(
    @{ Name = 'games/sitemap.xml';        Path = $mapPath;   Script = 'make-games-sitemap.ps1' }
    @{ Name = 'mobile/sitemap.xml';       Path = $mobileMap; Script = 'make-mobile-sitemap.ps1' }
    @{ Name = 'landing/phones-mini.json'; Path = $miniPath;  Script = 'make-phones-mini.ps1' }
)
foreach ($d in $derived) {
    $fails = @()
    if (-not (Test-Path -LiteralPath $d.Path)) {
        $fails += "$($d.Name) does not exist"
    } else {
        $expected = & (Join-Path $PSScriptRoot $d.Script) -AsString
        $onDisk   = Read-SourceText -Path $d.Path
        # Normalise line endings: git may hand back CRLF on checkout.
        if (($onDisk -replace "`r`n", "`n") -cne ($expected -replace "`r`n", "`n")) {
            $fails += "$($d.Name) does not match the catalog it is generated from"
        }
    }
    Report -Label "$($d.Name) is regenerated from the catalog" -Failures $fails `
           -Hint "run .claude\$($d.Script) (never hand-edit the derived file)"
}

# ------------------------------------------- 7. landing hero proof-strip counts
# The landing hero advertises catalogue sizes as hand-typed numbers. They are
# markup on purpose -- deriving them at runtime would mean a cross-origin fetch
# on the critical path and numbers that pop in after paint. The cost of that
# choice is that they go stale silently, and a comparison site showing a stale
# count is exactly the credibility it sells. So they are checked here instead.
$landing = Read-SourceText -Path $landingPath
$fails = @()

# <div class="stat"><div class="n">100</div><div class="l">Games tracked</div></div>
function Get-ProofStat {
    param([string]$Html, [string]$Label)
    $rx = '<div class="n">\s*([^<]+?)\s*</div>\s*<div class="l">\s*' + [regex]::Escape($Label) + '\s*</div>'
    $m = [regex]::Match($Html, $rx)
    if ($m.Success) { return $m.Groups[1].Value }
    return $null
}

$expected = @(
    @{ Label = 'Games tracked'; Actual = $games.Count }
    @{ Label = 'Phones scored'; Actual = $phones.Count }
)
foreach ($e in $expected) {
    $shown = Get-ProofStat -Html $landing -Label $e.Label
    if ($null -eq $shown) {
        $fails += "no '$($e.Label)' stat found in the landing hero proof strip"
    } elseif ($shown -ne "$($e.Actual)") {
        $fails += "hero says '$shown $($e.Label)' but the catalog holds $($e.Actual)"
    }
}
Report -Label 'landing hero proof strip matches the real catalog sizes' -Failures $fails `
       -Hint 'update the .proof stat in landing/index.html to the real count'

# ------------------------------------------------- 8. games/video.json episodes
# The video card and the VideoObject markup both read this file, so a typo here
# ships a broken player or a rich result pointing at nothing. An empty id is
# LEGAL and means "finished but not uploaded yet" -- it is skipped everywhere.
# What is checked is that every PUBLISHED episode is complete and that its
# poster is a file that actually exists, because a missing thumbnail is the one
# error that looks fine locally and fails only in Search Console.
$fails = @()
$videoPath = Join-Path $root 'games\video.json'

# Every read goes through this: Set-StrictMode makes $e.title THROW when the
# property is absent, and a missing key is exactly what this section is here to
# report -- so it must not take the script out on the way.
function Get-Prop {
    param($Object, [string]$Name)
    if ($null -ne $Object -and $Object.PSObject.Properties.Name -contains $Name) { return $Object.$Name }
    return $null
}

$vj = $null
if (-not (Test-Path $videoPath)) {
    $fails += 'games/video.json is missing'
} else {
    try { $vj = Read-SourceText -Path $videoPath | ConvertFrom-Json }
    catch { $fails += "games/video.json is not valid JSON: $($_.Exception.Message)" }
}
if ($null -ne $vj) {
    $eps = @()
    if ($null -ne (Get-Prop $vj 'episodes')) { $eps = @($vj.episodes) }
    elseif ($null -ne (Get-Prop $vj 'id'))   { $eps = @($vj) }
    else { $fails += 'games/video.json has neither an episodes array nor a legacy id' }

    $seen = @{}
    $dates = @()
    foreach ($e in $eps) {
        $id    = [string](Get-Prop $e 'id')
        $title = Get-Prop $e 'title'
        $pub   = Get-Prop $e 'published'
        $dur   = Get-Prop $e 'durationSeconds'
        $label = if ($id) { $id } else { "(unpublished) $title" }

        # -notcontains, not `-not ... -contains`: the latter binds as
        # (-not $names) -contains $k, which is always $false.
        foreach ($k in 'title','published','durationSeconds') {
            if ($e.PSObject.Properties.Name -notcontains $k) { $fails += "episode $label has no $k" }
        }
        if ($null -ne $title -and "$title".Trim() -eq '') { $fails += "episode $label has an empty title" }
        if ($null -ne $pub) {
            if ("$pub" -notmatch '^\d{4}-\d{2}-\d{2}$') {
                $fails += "episode $label published '$pub' is not YYYY-MM-DD"
            } else { $dates += [datetime]"$pub" }
        }
        if ($null -ne $dur -and [int]$dur -le 0) { $fails += "episode $label has durationSeconds $dur" }

        if ($id) {
            if ($seen.ContainsKey($id)) { $fails += "episode id '$id' appears twice" }
            $seen[$id] = $true
            # Only a published episode's poster is ever requested.
            $poster = Get-Prop $e 'poster'
            if (-not $poster) { $poster = '/video-poster.jpg' }
            if ("$poster" -notmatch '^/') { $fails += "episode $label poster '$poster' must start with /" }
            else {
                $pf = Join-Path $root ('games' + ("$poster" -replace '/', '\'))
                if (-not (Test-Path $pf)) { $fails += "episode $label poster '$poster' does not exist in games/" }
            }
        }
    }
    # Newest first is what makes episodes[0] the featured card.
    for ($i = 1; $i -lt $dates.Count; $i++) {
        if ($dates[$i] -gt $dates[$i - 1]) {
            $fails += 'episodes are not newest-first -- episodes[0] must be the newest'
            break
        }
    }
}
Report -Label 'games/video.json episodes are well-formed and posters exist' -Failures $fails `
       -Hint 'see LazyComparoVideo/<ep>/script.md, section "After it is live"'

# ---------------------------------------------------------------------- result
Write-Host ''
if ($script:Problems -eq 0) {
    Write-Host "  All checks passed -- $($games.Count) games and $($phones.Count) phones, one source each." -ForegroundColor Green
    Write-Host ''
    exit 0
}
Write-Host "  $($script:Problems) problem(s) found -- fix before pushing." -ForegroundColor Red
Write-Host ''
exit 1
