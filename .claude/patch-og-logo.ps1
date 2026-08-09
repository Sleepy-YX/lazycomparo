# Swaps the old gradient-bolt logo in landing/og-image.png for the current
# brand mark, in place.
#
# Why a patch and not a full regenerate: the original generator script was not
# kept in the repo, and the card is set in Fraunces, which is a webfont here and
# not installed on this machine - re-typesetting it locally would silently fall
# back to Georgia and change the card. The logo corner is flat #f6f1e7 paper
# (verified by sampling), so painting over it composites cleanly.
#
# Idempotent: it repaints the same rectangle, so running it twice is harmless.
# If the card is ever redesigned, delete this and write a real generator.
#
# ASCII-only (PS 5.1 reads BOM-less .ps1 as ANSI).

Add-Type -AssemblyName System.Drawing

$repo = Split-Path -Parent $PSScriptRoot
$file = Join-Path $repo 'landing\og-image.png'

$ember = [System.Drawing.ColorTranslator]::FromHtml('#d9482b')
$paper = [System.Drawing.ColorTranslator]::FromHtml('#f6f1e7')

# Old bolt measured at x 101..144, y 64..112. Clear a margin around it, well
# clear of the "LazyComparo" wordmark which starts near x=165.
$clear = New-Object System.Drawing.Rectangle(90, 54, 68, 68)

# New mark: 48px tile on the bolt's own centre (122.5, 88).
$markX = 98.5
$markY = 64.0
$mark = 48.0
$s = $mark / 64.0

$bars = @(
    @{ X = 14.0; Y = 17.0;  W = 36.0; H = 7.5; A = 255 },
    @{ X = 14.0; Y = 28.25; W = 26.0; H = 7.5; A = 158 },
    @{ X = 14.0; Y = 39.5;  W = 16.0; H = 7.5; A = 97  }
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

$src = New-Object System.Drawing.Bitmap($file)
$bmp = New-Object System.Drawing.Bitmap($src.Width, $src.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.DrawImage($src, 0, 0, $src.Width, $src.Height)
$src.Dispose()

$g.FillRectangle((New-Object System.Drawing.SolidBrush($paper)), $clear)

$tile = New-RoundedPath $markX $markY $mark $mark (15 * $s)
$g.FillPath((New-Object System.Drawing.SolidBrush($ember)), $tile)
$tile.Dispose()

foreach ($b in $bars) {
    $col = [System.Drawing.Color]::FromArgb($b.A, $paper.R, $paper.G, $paper.B)
    $br = New-Object System.Drawing.SolidBrush($col)
    $barPath = New-RoundedPath ($markX + $b.X * $s) ($markY + $b.Y * $s) ($b.W * $s) ($b.H * $s) (3.75 * $s)
    $g.FillPath($br, $barPath)
    $barPath.Dispose()
    $br.Dispose()
}

$g.Dispose()
$bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "patched $file"
