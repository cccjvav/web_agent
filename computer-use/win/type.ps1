# type.ps1 - text entry into a window
#   -Method clip (default): Set-Clipboard(Text) -> POST Ctrl+V to target window -> restore previous clipboard.
#                 Background (no focus steal); classic Win32 apps handle it, modern UI (WinUI/CEF/Chromium) may not.
#   -Method fg  : Set-Clipboard(Text) -> real Ctrl+V via keybd_event on the FOREGROUND window -> restore clipboard.
#                 Needs target foreground (or bringable); never blind-types: ERR_NOFOCUS if focus unavailable.
#   -Mode char  : background WM_CHAR per char, no clipboard use (classic edit controls only)
#   SUBMITTED means input sent, not proof the application accepted the text.
param(
  [string]$WindowTitle="",
  [string]$Text="",
  [ValidateSet("clip","fg")][string]$Method="clip",     # clip | fg
  [ValidateSet("","char")][string]$Mode="",           # "" | char
  [ValidateRange(0,10000)][int]$DelayMs=900,
  [switch]$KeepClipboard
)
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$ErrorActionPreference="Stop"
$here=Split-Path -Parent $MyInvocation.MyCommand.Path
Add-Type -Path (Join-Path $here "keys.cs")
if(-not $WindowTitle){ Write-Output "ERR_NO_WINDOW"; exit 2 }
$matches=@(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle.IndexOf($WindowTitle,[StringComparison]::OrdinalIgnoreCase) -ge 0 })
  if($matches.Count -ne 1){ Write-Output "ERR_WINDOW_MISSING_OR_AMBIGUOUS"; exit 2 }
  $p=$matches[0]
if(-not $p){ Write-Output "ERR_NO_WINDOW"; exit 2 }
$hwnd=$p.MainWindowHandle

if($Mode -eq "char"){
  $r=[WinBgKeys]::SendChars($hwnd,$Text)
  if($r -like "ERR_*"){ Write-Output $r; exit 3 }
  Write-Output ("BGTYPE char " + $r + " chars=" + $Text.Length)
  exit 0
}

# Snapshot all available formats before modifying; fail closed if snapshot fails.
Add-Type -AssemblyName System.Windows.Forms
$old=New-Object System.Windows.Forms.DataObject
$hadOld=$false
if(-not $KeepClipboard){
  try {
    $data=[System.Windows.Forms.Clipboard]::GetDataObject()
    if($null -ne $data){
      foreach($format in $data.GetFormats($false)){ $old.SetData($format,$false,$data.GetData($format,$false)); $hadOld=$true }
    }
  } catch { Write-Output "ERR_CLIPBOARD_SNAPSHOT"; exit 3 }
}
$changed=$false; $resultCode=0; $sequence=0
try {
  [System.Windows.Forms.Clipboard]::SetText($Text)
  $changed=$true; $sequence=[WinBgKeys]::GetClipboardSequenceNumber()
  Start-Sleep -Milliseconds 200
  if($Method -eq "fg"){ $r=[WinBgKeys]::PasteFg($hwnd) }
  else { $r=[WinBgKeys]::PasteClipboard($hwnd) }
  if($r -like "ERR_*"){ throw $r }
  Start-Sleep -Milliseconds $DelayMs
  Write-Output ("BGTYPE " + $Method + " " + $r + " chars=" + $Text.Length)
} catch { Write-Output ("ERR_TYPE " + $_.Exception.Message); $resultCode=3 }
finally {
  if($changed -and -not $KeepClipboard){
    try {
      if([WinBgKeys]::GetClipboardSequenceNumber() -ne $sequence){ throw "Clipboard changed externally; not overwriting it" }
      if($hadOld){ [System.Windows.Forms.Clipboard]::SetDataObject($old,$true) }
      else { [System.Windows.Forms.Clipboard]::Clear() }
    } catch { Write-Output ("ERR_CLIPBOARD_RESTORE " + $_.Exception.Message); $resultCode=4 }
  }
}
exit $resultCode
