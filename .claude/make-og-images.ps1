# Renders the 1200x630 social share card for the games and mobile apps, into
# games/og-image.png and mobile/og-image.png.
#
# WHY THIS EXISTS
# Both apps declared twitter:card=summary_large_image and shipped no og:image
# at all, so every link posted to Discord, Reddit, WhatsApp or X rendered as a
# bare grey text card. The landing page had a card; the two products people
# actually share did not. Per-game pages override this with the game's own
# Steam header art (see games/functions/_middleware.js); this is the card for
# everything else.
#
# FONTS: Fraunces and Inter are webfonts here and are not installed on this
# machine, so this card is DESIGNED for the fallbacks - Georgia for the
# wordmark, Segoe UI for the copy - rather than silently falling back to them.
# Re-run it and it repaints the same card; it is safe to run twice.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude\make-og-images.ps1
#
# ASCII-only on purpose: PS 5.1 reads BOM-less .ps1 as ANSI, so a literal em
# dash here is a parse error (same rule as check-sync.ps1 / make-icons.ps1).

Add-Type -AssemblyName System.Drawing

$repo = Split-Path -Parent $PSScriptRoot

$ember = [System.Drawing.ColorTranslator]::FromHtml('#d9482b')
$paper = [System.Drawing.ColorTranslator]::FromHtml('#f6f1e7')
$ink   = [System.Drawing.ColorTranslator]::FromHtml('#0a0a0b')
$panel = [System.Drawing.ColorTranslator]::FromHtml('#161618')
$muted = [System.Drawing.ColorTranslator]::FromHtml('#a1a1aa')

# The mark, in the same 64-unit box as favicon.svg / make-icons.ps1.
$bars = @(
    @{ X = 14.0; Y = 17.0;   W = 36.0; H = 7.5; A = 255 },
    @{ X = 14.0; Y = 28.25;  W = 26.0; H = 7.5; A = 158 },
    @{ X = 14.0; Y = 39.5;   W = 16.0; H = 7.5; A = 97  }
)

function New-RoundedPath {
    param([single]$X, [single]$Y, [single]$W, [single]$H, [single]$R)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $R * 2
    $p.AddArc($X, $Y, $d, $d, 180, 90)
    $p.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
    $p.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
    $p.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function Draw-Mark {
    param($G, [single]$X, [single]$Y, [single]$Size)
    $s = $Size / 64.0
    $tile = New-RoundedPath $X $Y $Size $Size (15 * $s)
    $brush = New-Object System.Drawing.SolidBrush($ember)
    $G.FillPath($brush, $tile)
    $tile.Dispose(); $brush.Dispose()
    foreach ($b in $bars) {
        $col = [System.Drawing.Color]::FromArgb($b.A, $paper.R, $paper.G, $paper.B)
        $br = New-Object System.Drawing.SolidBrush($col)
        $barPath = New-RoundedPath ($X + $b.X * $s) ($Y + $b.Y * $s) ($b.W * $s) ($b.H * $s) (3.75 * $s)
        $G.FillPath($br, $barPath)
        $barPath.Dispose(); $br.Dispose()
    }
}

function Write-Card {
    param(
        [Parameter(Mandatory)][string]$OutFile,
        [Parameter(Mandatory)][string[]]$Headline,
        [Parameter(Mandatory)][string]$Sub,
        [Parameter(Mandatory)][string]$Domain
    )

    $W = 1200; $H = 630
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear($ink)

    # A charcoal panel inset from the edge, so the card still reads as a card
    # when a client crops or rounds it, plus the ember rule the whole brand uses.
    $g.FillRectangle((New-Object System.Drawing.SolidBrush($panel)), 0, 0, $W, 6)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush($ember)), 0, 0, 210, 6)

    Draw-Mark -G $g -X 80 -Y 74 -Size 84

    $wordFont = New-Object System.Drawing.Font('Georgia', 42, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $g.DrawString('LazyComparo', $wordFont, (New-Object System.Drawing.SolidBrush($paper)), 184, 96)

    $headFont = New-Object System.Drawing.Font('Segoe UI Semibold', 58, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $y = 250.0
    foreach ($line in $Headline) {
        $g.DrawString($line, $headFont, (New-Object System.Drawing.SolidBrush($paper)), 78, $y)
        $y += 74
    }

    $subFont = New-Object System.Drawing.Font('Segoe UI', 30, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $g.DrawString($Sub, $subFont, (New-Object System.Drawing.SolidBrush($muted)), 78, ($y + 26))

    $domFont = New-Object System.Drawing.Font('Segoe UI Semibold', 28, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $g.DrawString($Domain, $domFont, (New-Object System.Drawing.SolidBrush($ember)), 78, 512)

    $g.Dispose()
    $bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "wrote $OutFile" -ForegroundColor Green
}

Write-Card -OutFile (Join-Path $repo 'games\og-image.png') `
    -Headline @('Compare PC game prices', 'across Steam, Epic and GOG') `
    -Sub 'Live cross-store prices, all-time lows and hours-to-beat.' `
    -Domain 'pcgames.lazycomparo.com'

Write-Card -OutFile (Join-Path $repo 'mobile\og-image.png') `
    -Headline @('Compare phones, and know', 'when switching is worth it') `
    -Sub 'Camera, battery, performance and what you lose crossing brands.' `
    -Domain 'mobile.lazycomparo.com'
