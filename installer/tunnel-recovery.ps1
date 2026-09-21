# Local console entry only. Never accept a PID, workspace, script path or confirmation argument.
$ErrorActionPreference = 'Stop'
$mutex = $null
$owned = $false
$code = 1
$interactive = ![Console]::IsInputRedirected -and ![Console]::IsOutputRedirected
if (!$interactive -or $args.Count -ne 0) {
  [Console]::Error.WriteLine('Use the local Tunnel Recovery shortcut with no arguments; piped confirmation is refused.')
  exit 2
}
try {
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent()
  try { $name = 'Local\WebAgentTunnelRecovery-' + $sid.User.Value } finally { $sid.Dispose() }
  $mutex = [Threading.Mutex]::new($false, $name)
  try { $owned = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned = $true }
  if (!$owned) {
    [Console]::Error.WriteLine('A recovery window is already open in this Windows session. Return to it; do not replay a confirmation.')
    $code = 2
  } else {
    # Resolve an application, not a PowerShell alias/function or a workspace-provided script.
    $node = Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1
    if (![IO.Path]::IsPathRooted($node.Source) -or [IO.Path]::GetExtension($node.Source) -ine '.exe') { throw 'Node unavailable' }
    $entry = [IO.Path]::Combine($PSScriptRoot, 'launch.js')
    [Console]::WriteLine('Windows tunnel recovery: preview first, then type RECYCLE in the prompt to confirm. Live owners are protected. No automatic retry.')
    # Separate literal arguments: no Invoke-Expression, shell command interpolation or auto-answer.
    & $node.Source $entry 'recovery'
    $code = if ($null -eq $LASTEXITCODE) { 1 } else { $LASTEXITCODE }
  }
} catch {
  [Console]::Error.WriteLine('Recovery launcher unavailable. Check Node.js and the installation. No automatic retry; inspect any previous unknown result separately.')
  $code = 1
} finally {
  # Keep the mutex until this result window is dismissed, not merely until the helper exits.
  try {
    [Console]::WriteLine('Press any key to close this window. This does not confirm or repeat cleanup.')
    [void][Console]::ReadKey($true)
  } finally {
    try { if ($owned) { $mutex.ReleaseMutex() } }
    finally { if ($null -ne $mutex) { $mutex.Dispose() } }
  }
}
exit $code
