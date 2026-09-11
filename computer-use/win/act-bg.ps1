# act-bg.ps1 - background click (PostMessage): no cursor move / no focus steal
param([string]$WindowTitle="",[int]$X=0,[int]$Y=0)
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$ErrorActionPreference="Stop"
$here=Split-Path -Parent $MyInvocation.MyCommand.Path
Add-Type -Path (Join-Path $here "input2.cs")
if($WindowTitle){
  $matches=@(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle.IndexOf($WindowTitle,[StringComparison]::OrdinalIgnoreCase) -ge 0 })
  if($matches.Count -ne 1){ Write-Output "ERR_WINDOW_MISSING_OR_AMBIGUOUS"; exit 2 }
  $p=$matches[0]
  if(-not $p){ Write-Output "ERR_NO_WINDOW"; exit 2 }
  $r=[WinBgInput]::ClickBg($p.MainWindowHandle,$X,$Y)
  if($r -like "ERR_*"){ Write-Output $r; exit 3 }
  Write-Output ("BGCLICK " + $r + " at " + $X + "," + $Y)
} else {
  Write-Output "ERR_NO_WINDOW"; exit 2
}

