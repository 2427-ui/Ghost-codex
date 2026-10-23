param([long]$WindowHandle, [string]$OutputFile, [string]$ExecutablePath)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class GhostIconReader {
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr handle, uint message, IntPtr wParam, IntPtr lParam);
}
'@
$iconHandle = [GhostIconReader]::SendMessage([IntPtr]$WindowHandle, 0x007F, [IntPtr]1, [IntPtr]0)
if ($iconHandle -eq [IntPtr]::Zero) { throw 'The native window did not expose a large icon.' }
function Save-GhostIcon([System.Drawing.Icon]$Icon, [string]$Destination) {
  $bitmap = $Icon.ToBitmap()
  try {
  $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
  $visible = 0
  $colored = 0
  for ($y = 0; $y -lt $bitmap.Height; $y++) {
    for ($x = 0; $x -lt $bitmap.Width; $x++) {
      $pixel = $bitmap.GetPixel($x, $y)
      if ($pixel.A -gt 0) {
        $visible++
        if ([Math]::Abs([int]$pixel.R - [int]$pixel.G) -gt 2 -or [Math]::Abs([int]$pixel.G - [int]$pixel.B) -gt 2) { $colored++ }
      }
    }
  }
  return [PSCustomObject]@{Width=$bitmap.Width;Height=$bitmap.Height;VisiblePixels=$visible;ColoredPixels=$colored}
  } finally { $bitmap.Dispose() }
}
$windowIcon = Save-GhostIcon ([System.Drawing.Icon]::FromHandle($iconHandle)) $OutputFile
$associatedIcon = [System.Drawing.Icon]::ExtractAssociatedIcon($ExecutablePath)
try {
  $exeIcon = Save-GhostIcon $associatedIcon (Join-Path (Split-Path -LiteralPath $OutputFile) 'exe-resource-icon.png')
} finally { $associatedIcon.Dispose() }
[PSCustomObject]@{WindowIcon=$windowIcon;ExeIcon=$exeIcon} | ConvertTo-Json -Compress
