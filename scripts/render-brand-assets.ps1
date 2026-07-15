Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$brandDirectory = Join-Path $PSScriptRoot "..\public\brand"
New-Item -ItemType Directory -Force -Path $brandDirectory | Out-Null

$lime = [Windows.Media.ColorConverter]::ConvertFromString("#B8F35A")
$cobalt = [Windows.Media.ColorConverter]::ConvertFromString("#6F89FF")
$ink = [Windows.Media.ColorConverter]::ConvertFromString("#0B0D0C")
$paper = [Windows.Media.ColorConverter]::ConvertFromString("#F2F5EE")
$softPaper = [Windows.Media.ColorConverter]::ConvertFromString("#AEB6AB")
$lightPage = [Windows.Media.ColorConverter]::ConvertFromString("#F4F6EF")
$lightInk = [Windows.Media.ColorConverter]::ConvertFromString("#121612")
$lightSoft = [Windows.Media.ColorConverter]::ConvertFromString("#59615C")
$lightBorder = [Windows.Media.ColorConverter]::ConvertFromString("#D7DCCF")

function New-Brush([Windows.Media.Color]$Color) {
  $brush = [Windows.Media.SolidColorBrush]::new($Color)
  $brush.Freeze()
  return $brush
}

function Save-Drawing([int]$Width, [int]$Height, [string]$Path, [scriptblock]$Draw) {
  $visual = [Windows.Media.DrawingVisual]::new()
  $context = $visual.RenderOpen()
  & $Draw $context
  $context.Close()

  $bitmap = [Windows.Media.Imaging.RenderTargetBitmap]::new(
    $Width,
    $Height,
    96,
    96,
    [Windows.Media.PixelFormats]::Pbgra32
  )
  $bitmap.Render($visual)

  $encoder = [Windows.Media.Imaging.PngBitmapEncoder]::new()
  $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
  $stream = [System.IO.File]::Create($Path)
  try {
    $encoder.Save($stream)
  } finally {
    $stream.Dispose()
  }
}

function Draw-Mark(
  [Windows.Media.DrawingContext]$Context,
  [double]$Left,
  [double]$Top,
  [double]$Scale
) {
  $limeBrush = New-Brush $lime
  $cobaltBrush = New-Brush $cobalt

  $dot = [Windows.Rect]::new($Left + (44 * $Scale), $Top, 32 * $Scale, 34 * $Scale)
  $Context.DrawRoundedRectangle($limeBrush, $null, $dot, 8 * $Scale, 8 * $Scale)

  $leftPanel = [Windows.Media.StreamGeometry]::new()
  $leftContext = $leftPanel.Open()
  $leftContext.BeginFigure([Windows.Point]::new($Left, $Top + (58 * $Scale)), $true, $true)
  $leftContext.LineTo([Windows.Point]::new($Left + (37 * $Scale), $Top + (48 * $Scale)), $true, $false)
  $leftContext.LineTo([Windows.Point]::new($Left + (37 * $Scale), $Top + (190 * $Scale)), $true, $false)
  $leftContext.LineTo([Windows.Point]::new($Left, $Top + (176 * $Scale)), $true, $false)
  $leftContext.Close()
  $leftPanel.Freeze()
  $Context.DrawGeometry($limeBrush, $null, $leftPanel)

  $spine = [Windows.Rect]::new(
    $Left + (44 * $Scale),
    $Top + (47 * $Scale),
    32 * $Scale,
    132 * $Scale
  )
  $Context.DrawRoundedRectangle($cobaltBrush, $null, $spine, 5 * $Scale, 5 * $Scale)

  $rightPanel = [Windows.Media.StreamGeometry]::new()
  $rightContext = $rightPanel.Open()
  $rightContext.BeginFigure([Windows.Point]::new($Left + (83 * $Scale), $Top + (48 * $Scale)), $true, $true)
  $rightContext.LineTo([Windows.Point]::new($Left + (120 * $Scale), $Top + (58 * $Scale)), $true, $false)
  $rightContext.LineTo([Windows.Point]::new($Left + (120 * $Scale), $Top + (142 * $Scale)), $true, $false)
  $rightContext.LineTo([Windows.Point]::new($Left + (83 * $Scale), $Top + (152 * $Scale)), $true, $false)
  $rightContext.Close()
  $rightPanel.Freeze()
  $Context.DrawGeometry($limeBrush, $null, $rightPanel)
}

$shortformPath = Join-Path $brandDirectory "imagineer-shortform.png"
Save-Drawing 1024 1024 $shortformPath {
  param($context)
  $context.DrawRoundedRectangle(
    (New-Brush $ink),
    $null,
    [Windows.Rect]::new(64, 64, 896, 896),
    190,
    190
  )
  Draw-Mark $context 310 198 3.36
}

$longformPath = Join-Path $brandDirectory "imagineer-longform.png"
Save-Drawing 2400 900 $longformPath {
  param($context)
  $context.DrawRoundedRectangle(
    (New-Brush $ink),
    $null,
    [Windows.Rect]::new(32, 32, 2336, 836),
    72,
    72
  )
  Draw-Mark $context 172 184 2.65

  $typeface = [Windows.Media.Typeface]::new(
    [Windows.Media.FontFamily]::new("Segoe UI"),
    [Windows.FontStyles]::Normal,
    [Windows.FontWeights]::Bold,
    [Windows.FontStretches]::Normal
  )
  $wordmark = [Windows.Media.FormattedText]::new(
    "IMAGINEER",
    [Globalization.CultureInfo]::InvariantCulture,
    [Windows.FlowDirection]::LeftToRight,
    $typeface,
    246,
    (New-Brush $paper),
    1
  )
  $context.DrawText($wordmark, [Windows.Point]::new(610, 218))

  $tagTypeface = [Windows.Media.Typeface]::new(
    [Windows.Media.FontFamily]::new("Segoe UI"),
    [Windows.FontStyles]::Normal,
    [Windows.FontWeights]::SemiBold,
    [Windows.FontStretches]::Normal
  )
  $tagline = [Windows.Media.FormattedText]::new(
    "Imagining better explanations.",
    [Globalization.CultureInfo]::InvariantCulture,
    [Windows.FlowDirection]::LeftToRight,
    $tagTypeface,
    74,
    (New-Brush $softPaper),
    1
  )
  $context.DrawText($tagline, [Windows.Point]::new(626, 560))

  $context.DrawRectangle((New-Brush $lime), $null, [Windows.Rect]::new(610, 532, 270, 12))
}

$shortformLightPath = Join-Path $brandDirectory "imagineer-shortform-light.png"
Save-Drawing 1024 1024 $shortformLightPath {
  param($context)
  $context.DrawRoundedRectangle(
    (New-Brush $lightPage),
    [Windows.Media.Pen]::new((New-Brush $lightBorder), 4),
    [Windows.Rect]::new(66, 66, 892, 892),
    188,
    188
  )
  Draw-Mark $context 310 198 3.36
}

$longformLightPath = Join-Path $brandDirectory "imagineer-longform-light.png"
Save-Drawing 2400 900 $longformLightPath {
  param($context)
  $context.DrawRoundedRectangle(
    (New-Brush $lightPage),
    [Windows.Media.Pen]::new((New-Brush $lightBorder), 4),
    [Windows.Rect]::new(34, 34, 2332, 832),
    70,
    70
  )
  Draw-Mark $context 172 184 2.65

  $typeface = [Windows.Media.Typeface]::new(
    [Windows.Media.FontFamily]::new("Segoe UI"),
    [Windows.FontStyles]::Normal,
    [Windows.FontWeights]::Bold,
    [Windows.FontStretches]::Normal
  )
  $wordmark = [Windows.Media.FormattedText]::new(
    "IMAGINEER",
    [Globalization.CultureInfo]::InvariantCulture,
    [Windows.FlowDirection]::LeftToRight,
    $typeface,
    246,
    (New-Brush $lightInk),
    1
  )
  $context.DrawText($wordmark, [Windows.Point]::new(610, 218))

  $tagTypeface = [Windows.Media.Typeface]::new(
    [Windows.Media.FontFamily]::new("Segoe UI"),
    [Windows.FontStyles]::Normal,
    [Windows.FontWeights]::SemiBold,
    [Windows.FontStretches]::Normal
  )
  $tagline = [Windows.Media.FormattedText]::new(
    "Imagining better explanations.",
    [Globalization.CultureInfo]::InvariantCulture,
    [Windows.FlowDirection]::LeftToRight,
    $tagTypeface,
    74,
    (New-Brush $lightSoft),
    1
  )
  $context.DrawText($tagline, [Windows.Point]::new(626, 560))

  $context.DrawRectangle((New-Brush $cobalt), $null, [Windows.Rect]::new(610, 532, 270, 12))
}

Write-Output $shortformPath
Write-Output $longformPath
Write-Output $shortformLightPath
Write-Output $longformLightPath
