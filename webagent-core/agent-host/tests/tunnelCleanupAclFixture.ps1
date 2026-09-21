# Test-only: changes DACLs ONLY on this disposable PowerShell host and its own Node child.
# All restore/termination uses handles acquired before denial. Never shipped in installer.
$ErrorActionPreference = 'Stop'
try {
  Add-Type -Path @(([IO.Path]::Combine($PSScriptRoot, '../src/tunnel/tunnelCleanup.cs')), ([IO.Path]::Combine($PSScriptRoot, 'tunnelCleanupAclFixture.cs')))

  $program = [Console]::ReadLine()
  if ([string]::IsNullOrEmpty($program)) { throw 'Missing fixture executable' }
  [TunnelAclFixture]::Run($program)
} catch {
  [Console]::Error.WriteLine($_.ToString())
  exit 1
}
