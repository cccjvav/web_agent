$ErrorActionPreference = 'Stop'
try {
  $launch = $env:WEBAGENT_STDIO_LAUNCH | ConvertFrom-Json
  Remove-Item Env:\WEBAGENT_STDIO_LAUNCH
  Add-Type -Path @((Join-Path $PSScriptRoot '..\tools\commandJob.cs'), (Join-Path $PSScriptRoot 'stdioBridge.cs')) -ErrorAction Stop
  $result = [WebAgentStdioBridge]::Run([string]$launch.program, [string[]]@($launch.args), [string]$launch.cwd, [int]$launch.parentPid, [string[]]@($launch.envKeys))
  exit $result
} catch {
  [Console]::Error.WriteLine('Stdio process guard or relay failed; no unguarded fallback.')
  exit 125
}
