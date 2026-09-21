# Private two-message protocol. EOF/cancel/invalid confirmation only closes handles.
$ErrorActionPreference = 'Stop'
$leases = @()
try {
  [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
  Add-Type -AssemblyName System.Security
  Add-Type -Path ([IO.Path]::Combine($PSScriptRoot, 'tunnelCleanup.cs'))
  $reader = [IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.UTF8Encoding]::new($false, $true), $false, 4096, $true)
  $line = $reader.ReadLine()
  if ($null -eq $line -or $line.Length -gt 524288) { throw 'invalid input' }
  $inputData = ConvertFrom-Json -InputObject $line
  if ($inputData.controllerPid -isnot [int] -or $inputData.controllerPid -le 0 -or $inputData.items.Count -gt 32) { throw 'invalid input' }
  $entropy = [Text.Encoding]::UTF8.GetBytes('WebAgent/tunnel-receipt/v2')
  $rows = @(); $seen = @{}
  foreach ($item in $inputData.items) {
    $lease = $null; $state = 'invalid-record'; $provider = 'unknown'; $targetPid = 0
    if ($item.id -isnot [string] -or $item.id -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') { throw 'invalid id' }
    try {
      if ($item.envelope.version -ne 2 -or $item.envelope.protection -ne 'windows-dpapi-user' -or $item.envelope.payload.Length -gt 16384) { throw 'invalid envelope' }
      $plain = [Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($item.envelope.payload), $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
      if ($plain.Length -gt 8192) { throw 'budget' }
      $record = ConvertFrom-Json -InputObject ([Text.UTF8Encoding]::new($false, $true).GetString($plain))
      if ($record.version -ne 1 -or $record.platform -ne 'win32' -or $record.id -cne $item.id -or $record.provider -notin @('cloudflare', 'cloudflare-named', 'ngrok')) { throw 'invalid record' }
      if ($record.target.pid -isnot [int] -or $record.owner.pid -isnot [int] -or $record.target.pid -le 0 -or $record.owner.pid -le 0) { throw 'invalid pid' }
      foreach ($identity in @($record.target, $record.owner)) {
        if ($identity.start -isnot [string] -or $identity.start -notmatch '^\d{1,20}$' -or $identity.executable -isnot [string] -or $identity.executable.Length -gt 4096 -or ![IO.Path]::IsPathRooted($identity.executable)) { throw 'invalid identity' }
      }
      $provider = $record.provider; $targetPid = $record.target.pid
      $key = [string]$targetPid + ':' + $record.target.start
      if ($seen.ContainsKey($key)) { $state = 'duplicate-target' } else {
        $seen[$key] = $true
        $lease = [WebAgentTunnelLease]::new($targetPid, $record.target.start, $record.target.executable, $record.owner.pid, $record.owner.start, $record.owner.executable, $provider, $inputData.controllerPid)
        $state = $lease.Status
      }
    } catch { $state = 'invalid-record' }
    $leases += $lease
    $rows += @{id=$item.id;provider=$provider;pid=$targetPid;status=$state}
  }
  $nonce = [Guid]::NewGuid().ToString()
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject @{type='preview';nonce=$nonce;records=@($rows)} -Depth 5 -Compress)); [Console]::Out.Flush()
  $confirmation = $reader.ReadLine()
  if ($null -eq $confirmation) { exit 0 }
  if ($confirmation.Length -gt 256) { throw 'invalid confirmation' }
  $decision = ConvertFrom-Json -InputObject $confirmation
  if ($decision.action -cne 'confirm' -or $decision.nonce -cne $nonce) { throw 'invalid confirmation' }
  $clock = [Diagnostics.Stopwatch]::StartNew()
  for ($i=0; $i -lt $rows.Count; $i++) {
    if ($null -ne $leases[$i]) { $rows[$i].status = $leases[$i].Commit([Math]::Max(0, 4000 - [int]$clock.ElapsedMilliseconds)) }
  }
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject @{type='result';nonce=$nonce;records=@($rows)} -Depth 5 -Compress)); [Console]::Out.Flush()
} catch {
  [Console]::Error.WriteLine('Tunnel cleanup verification unavailable')
  exit 1
} finally {
  foreach ($lease in $leases) { if ($null -ne $lease) { $lease.Dispose() } }
  if ($null -ne $reader) { $reader.Dispose() }
}
