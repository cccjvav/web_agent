'use strict';
// Identity inspection only. No command lines, environments, process enumeration or signals.
const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { createTrace } = require('./helperDiagnostics');
let activeWindowsQueries = 0;

function validPid(pid) { return Number.isInteger(pid) && pid > 0 && pid <= 2147483647; }
function sameIdentity(left, right) {
  return Boolean(left && right && left.pid === right.pid && left.start === right.start && left.executable === right.executable);
}
async function linuxIdentity(pid) {
  const readStat = () => fs.readFile(`/proc/${pid}/stat`, 'utf8');
  let before;
  try { before = await readStat(); }
  catch (error) { return { status: error.code === 'ENOENT' || error.code === 'ESRCH' ? 'absent' : 'unknown' }; }
  try {
    const fields = before.slice(before.lastIndexOf(')') + 2).split(' ');
    if (['Z', 'X'].includes(fields[0])) return { status: 'absent' };
    const start = fields[19];
    if (!/^\d+$/.test(start)) return { status: 'unknown' };
    const executable = await fs.readlink(`/proc/${pid}/exe`);
    const boot = (await fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
    const after = await readStat();
    if (after.slice(after.lastIndexOf(')') + 2).split(' ')[19] !== start) return { status: 'unknown' };
    return { status: 'alive', identity: { pid, start: `${boot}:${start}`, executable } };
  } catch (_) { return { status: 'unknown' }; }
}
async function inspectProcesses(pids) {
  if (!Array.isArray(pids) || pids.length > 64 || pids.some(pid => !validPid(pid))) throw Error('Invalid process identity request');
  const unique = [...new Set(pids)];
  if (process.platform === 'linux') return new Map(await Promise.all(unique.map(async pid => [pid, await linuxIdentity(pid)])));
  if (process.platform !== 'win32' || !unique.length) return new Map(unique.map(pid => [pid, { status: 'unknown' }]));
  // Fixed OS executable, numeric IDs only. Never pass a command, token or user-supplied script.
  if (activeWindowsQueries >= 2) return new Map(unique.map(pid => [pid, { status: 'unknown' }]));
  const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); if($env:WEBAGENT_DEBUG_PROCESS -eq '1'){try{[Console]::Error.WriteLine('WA_TUNNEL_STARTED');[Console]::Error.WriteLine('WA_TUNNEL_READY')}catch{}}; $rows=@(); foreach($n in @(${unique.join(',')})) { $p=$null; try { $p=[Diagnostics.Process]::GetProcessById($n); $start=$p.StartTime.ToUniversalTime().Ticks.ToString(); $exe=$p.MainModule.FileName; if($p.HasExited -or !$exe) { throw 'unavailable' }; $rows+=@{pid=$n;status='alive';identity=@{pid=$n;start=$start;executable=$exe.ToLowerInvariant()}} } catch [ArgumentException] { $rows+=@{pid=$n;status='absent'} } catch { $rows+=@{pid=$n;status='unknown'} } finally { if($null -ne $p) {$p.Dispose()} } }; if($env:WEBAGENT_DEBUG_PROCESS -eq '1'){try{[Console]::Error.WriteLine('WA_TUNNEL_COMPLETED')}catch{}}; ConvertTo-Json -InputObject @($rows) -Depth 4 -Compress`;
  const diagnostic = createTrace('inspect', unique.length);
  activeWindowsQueries++;
  return new Promise(resolve => {
    const unknown = (event) => { if (event) diagnostic.trace(event); return resolve(new Map(unique.map(pid => [pid, { status: 'unknown' }]))); };
    const child = execFile(shell, ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 8000, maxBuffer: 128 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
      diagnostic.trace('callback', error, stdout, stderr);
      if (error) return unknown();
      try {
        const rows = JSON.parse(stdout.replace(/^\uFEFF/, ''));
        if (!Array.isArray(rows) || rows.length !== unique.length) return unknown('invalid-shape');
        const result = new Map();
        for (const row of rows) {
          if (!unique.includes(row.pid) || result.has(row.pid) || !['alive', 'absent', 'unknown'].includes(row.status)) return unknown('invalid-shape');
          if (row.status === 'alive' && (!row.identity || row.identity.pid !== row.pid || !/^\d+$/.test(row.identity.start) || typeof row.identity.executable !== 'string' || !path.isAbsolute(row.identity.executable))) return unknown('invalid-shape');
          result.set(row.pid, row);
        }
        diagnostic.trace('decoded', null, '', '', rows.filter(row => row.status === 'unknown').length);
        resolve(result);
      } catch (error) { unknown(error instanceof SyntaxError ? 'invalid-json' : 'invalid-shape'); }
    });
    diagnostic.watch(child);
  }).finally(() => { activeWindowsQueries--; });
}
module.exports = { validPid, sameIdentity, inspectProcesses };
