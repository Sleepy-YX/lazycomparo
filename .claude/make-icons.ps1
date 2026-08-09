# Renders the LazyComparo mark to PNG at any size, for the icon slots that
# cannot take an SVG (apple-touch-icon, the web app manifest, Google's search
# favicon slot). Keep it in sync with */favicon.svg by eye - same geometry,
# expressed in the 0-64 unit box and scaled.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude\make-icons.ps1
#
# ASCII-only on purpose: PS 5.1 reads BOM-less .ps1 as ANSI, so a literal
# em dash here is a parse error (same rule as check-sync.ps1 / JsLiteral.ps1).

Add-Type -AssemblyName System.Drawing

$repo = Split-Path -Parent $PSScriptRoot
$targets = @(
    @{ Dir = 'landing'; Sizes = @(180, 512) },
    @{ Dir = 'games';   Sizes = @(180, 512) },
    @{ Dir = 'mobile';  Sizes = @(180, 512) }
)

$ember = [System.Drawing.ColorTranslator]::FromHtml('#d9482b')
$paper = [System.Drawing.ColorTranslator]::FromHtml('#f6f1e7')

# x, y, w, h, alpha - in the same 64-unit box as favicon.svg
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

# Android crops maskable icons to an arbitrary shape (circle, squircle, ...),
# so that variant must be full-bleed - a rounded tile would leave transparent
# wedges - and must keep its content inside the middle 80% safe zone.
function Write-MaskableIcon {
    param([int]$Size, [string]$OutFile)
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear($ember)

    $inset = 0.74                      # shrink the bars into the safe zone
    $s = ($Size / 64.0) * $inset
    $off = ($Size - (64.0 * $s)) / 2.0
    foreach ($b in $bars) {
        $col = [System.Drawing.Color]::FromArgb($b.A, $paper.R, $paper.G, $paper.B)
        $br = New-Object System.Drawing.SolidBrush($col)
        $barPath = New-RoundedPath ($off + $b.X * $s) ($off + $b.Y * $s) ($b.W * $s) ($b.H * $s) (3.75 * $s)
        $g.FillPath($br, $barPath)
        $barPath.Dispose()
        $br.Dispose()
    }

    $g.Dispose()
    $bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "wrote $OutFile"
}

function Write-Icon {
    # NB: no local may be called $path here - PowerShell variable names are
    # case-insensitive, so it would silently overwrite the [string]$OutFile
    # parameter with a stringified GraphicsPath.
    param([int]$Size, [string]$OutFile)
    $s = $Size / 64.0
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $tile = New-RoundedPath 0 0 $Size $Size (15 * $s)
    $g.FillPath((New-Object System.Drawing.SolidBrush($ember)), $tile)
    $tile.Dispose()

    foreach ($b in $bars) {
        $col = [System.Drawing.Color]::FromArgb($b.A, $paper.R, $paper.G, $paper.B)
        $br = New-Object System.Drawing.SolidBrush($col)
        $barPath = New-RoundedPath ($b.X * $s) ($b.Y * $s) ($b.W * $s) ($b.H * $s) (3.75 * $s)
        $g.FillPath($br, $barPath)
        $barPath.Dispose()
        $br.Dispose()
    }

    $g.Dispose()
    $bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "wrote $OutFile"
}

foreach ($t in $targets) {
    foreach ($size in $t.Sizes) {
        $name = if ($size -eq 180) { 'apple-touch-icon.png' } else { "icon-$size.png" }
        Write-Icon -Size $size -OutFile (Join-Path $repo (Join-Path $t.Dir $name))
    }
    Write-MaskableIcon -Size 512 -OutFile (Join-Path $repo (Join-Path $t.Dir 'icon-maskable-512.png'))
}
