$ErrorActionPreference = 'Stop'
try {
  [Console]::Out.WriteLine('{"jsonrpc":"2.0","method":"notifications/webagent/stdio-bootstrap","params":{"stage":"script"}}'); [Console]::Out.Flush()
  $launch = $env:WEBAGENT_STDIO_LAUNCH | Microsoft.PowerShell.Utility\ConvertFrom-Json
  [Environment]::SetEnvironmentVariable('WEBAGENT_STDIO_LAUNCH', $null, 'Process')
  [Console]::Out.WriteLine('{"jsonrpc":"2.0","method":"notifications/webagent/stdio-bootstrap","params":{"stage":"config"}}'); [Console]::Out.Flush()
  Microsoft.PowerShell.Utility\Add-Type -Path @([IO.Path]::Combine($PSScriptRoot, '..\tools\commandJob.cs'), [IO.Path]::Combine($PSScriptRoot, 'stdioBridge.cs')) -ErrorAction Stop
  [Console]::Out.WriteLine('{"jsonrpc":"2.0","method":"notifications/webagent/stdio-bootstrap","params":{"stage":"compiled"}}'); [Console]::Out.Flush()
  $result = [WebAgentStdioBridge]::Run([string]$launch.program, [string[]]@($launch.args), [string]$launch.cwd, [int]$launch.parentPid, [string[]]@($launch.envKeys))
  exit $result
} catch {
  [Console]::Error.WriteLine('Stdio process guard or relay failed; no unguarded fallback.')
  exit 125
}
