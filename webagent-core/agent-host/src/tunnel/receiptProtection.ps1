# CurrentUser DPAPI is an OS-user boundary, NOT a WebAgent application signature.
$ErrorActionPreference = 'Stop'
try {
  [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
  Add-Type -AssemblyName System.Security
  $reader = [IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.UTF8Encoding]::new($false, $true), $false, 4096, $true)
  try { $inputText = $reader.ReadToEnd() } finally { $reader.Dispose() }
  if ($inputText.Length -gt 524288) { throw 'budget' }
  $request = ConvertFrom-Json -InputObject $inputText
  if ($request.operation -notin @('protect', 'unprotect') -or $request.items.Count -gt 32) { throw 'invalid request' }
  $entropy = [Text.Encoding]::UTF8.GetBytes('WebAgent/tunnel-receipt/v2')
  $scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
  $rows = @()
  foreach ($item in $request.items) {
    try {
      if ($item -isnot [string]) { throw 'invalid item' }
      if ($request.operation -eq 'protect') {
        $plain = [Text.Encoding]::UTF8.GetBytes($item)
        if ($plain.Length -gt 8192) { throw 'budget' }
        $blob = [Security.Cryptography.ProtectedData]::Protect($plain, $entropy, $scope)
        $rows += [Convert]::ToBase64String($blob)
      } else {
        if ($item.Length -gt 16384) { throw 'budget' }
        $blob = [Convert]::FromBase64String($item)
        $plain = [Security.Cryptography.ProtectedData]::Unprotect($blob, $entropy, $scope)
        if ($plain.Length -gt 8192) { throw 'budget' }
        $rows += [Text.UTF8Encoding]::new($false, $true).GetString($plain)
      }
    } catch { $rows += $null }
  }
  ConvertTo-Json -InputObject @($rows) -Compress
} catch {
  [Console]::Error.WriteLine('Tunnel receipt protection unavailable')
  exit 1
}
