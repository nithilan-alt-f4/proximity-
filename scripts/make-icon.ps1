# scripts/make-icon.ps1 — generates build/icon.png (1024x1024) for the desktop app.
# Industrial aesthetic: dark charcoal rounded square, red play triangle.
# electron-builder converts this PNG into .ico (win) and .icns (mac) at package time.

Add-Type -AssemblyName System.Drawing

$size = 1024
$dir = Join-Path $PSScriptRoot "..\build"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$outPath = Join-Path $dir "icon.png"

$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Transparent background (electron-builder rounds corners for win; macOS applies its own mask)
$g.Clear([System.Drawing.Color]::Transparent)

# --- Rounded dark plate ---
$plateColor = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 16, 16, 16))
$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 60, 60, 60), 8)

# Rounded rect path
function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc(($x + $w - $d), $y, $d, $d, 270, 90)
    $p.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0, 90)
    $p.AddArc($x, ($y + $h - $d), $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

$margin = 24
$plate = New-RoundedRect $margin $margin ($size - 2*$margin) ($size - 2*$margin) 180
$g.FillPath($plateColor, $plate)
$g.DrawPath($borderPen, $plate)

# --- Subtle top highlight (gives it a machined feel) ---
$highlightPath = New-RoundedRect ($margin+10) ($margin+10) ($size - 2*$margin - 20) (($size - 2*$margin)/3) 160
$hlBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point($margin, $margin)),
    (New-Object System.Drawing.Point($margin, ($margin + 300))),
    [System.Drawing.Color]::FromArgb(40, 255, 255, 255),
    [System.Drawing.Color]::FromArgb(0, 255, 255, 255))
$g.FillPath($hlBrush, $highlightPath)

# --- Red play triangle (slightly right-of-center, optical centering) ---
$red = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 229, 72, 77))
$tri = New-Object System.Drawing.Drawing2D.GraphicsPath
# Triangle spanning ~55% of the plate, pointing right
$cx = $size / 2 - 20   # nudge left so it looks optically centered
$halfH = 250
$leftX = $cx - 160
$rightX = $cx + 200
$tri.AddLine($leftX, ($size/2 - $halfH), $rightX, ($size/2))
$tri.AddLine($rightX, ($size/2), $leftX, ($size/2 + $halfH))
$tri.CloseFigure()
$g.FillPath($red, $tri)

$g.Dispose()
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Host "Icon written to $outPath ($([math]::Round((Get-Item $outPath).Length / 1KB)) KB)"
