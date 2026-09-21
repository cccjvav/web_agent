'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(path.join(root, 'installer/launch.js'), 'utf8');
function fixture({ platform = 'win32', input = true, output = true, args = [], preparationFails = false } = {}) {
  const launched = [], errors = [];
  const process = { platform, stdin: { isTTY: input }, stdout: { isTTY: output },
    argv: ['C:\\Node\\node.exe', 'launch.js', 'recovery', ...args], execPath: 'C:\\Node\\node.exe' };
  const runtime = 'C:\\Program Files\\Web Agent & literal %data% !x!';
  let preparations = 0;
  const context = { module: { exports: {} }, __dirname: path.join(root, 'installer'), process,
    console: { error: value => errors.push(value) },
    require: name => name === 'path' ? path.win32 : name === 'child_process' ? { spawn: (...args) => {
      const child = new EventEmitter(); launched.push({ args, child }); return child;
    } } : require(name),
    prepare: () => { preparations++; if (preparationFails) throw Error('invalid manifest'); return { root: runtime }; },
    forbidden: () => { throw Error('Recovery must not resolve workspace, install dependencies or start a server'); }
  };
  vm.createContext(context);
  vm.runInContext(source + '\nprepareRuntime = prepare; resolveWorkspace = forbidden; ensureDependencies = forbidden; appWindow = forbidden; module.exports.main = main;', context);
  return { process, launched, errors, runtime, preparations: () => preparations, main: context.module.exports.main };
}
async function main() {
  for (const options of [{ platform: 'linux' }, { input: false }, { output: false }, { args: ['--yes'] }, { args: ['123'] }, { args: ['C:\\other.js'] }]) {
    const denied = fixture(options); await denied.main();
    assert.equal(denied.process.exitCode, 2); assert.equal(denied.preparations(), 0); assert.equal(denied.launched.length, 0);
  }
  const broken = fixture({ preparationFails: true });
  await assert.rejects(broken.main(), /invalid manifest/); assert.equal(broken.launched.length, 0);
  for (const code of [0, 1, 2, null]) {
    const run = fixture(); await run.main();
    assert.equal(run.preparations(), 1); assert.equal(run.launched.length, 1);
    const { args, child } = run.launched[0];
    assert.equal(args[0], run.process.execPath);
    assert.equal(args[1].length, 1);
    assert.equal(args[1][0], path.win32.join(run.runtime, 'webagent-core/agent-host/scripts/tunnel-cleanup.js'));
    assert.equal(args[2].cwd, run.runtime); assert.equal(args[2].shell, false); assert.equal(args[2].stdio, 'inherit');
    assert(!('env' in args[2]), 'launcher must not inject confirmation or workspace settings');
    child.emit('exit', code); assert.equal(run.process.exitCode, code === null ? 1 : code);
    assert.equal(run.launched.length, 1, 'no automatic replay on nonzero or unknown exit');
  }
  const failed = fixture(); await failed.main(); failed.launched[0].child.emit('error', Error('sensitive path'));
  assert.equal(failed.process.exitCode, 1); assert(!JSON.stringify(failed.errors).includes('sensitive path'));
  assert.equal(failed.launched.length, 1);
  const script = path.join(root, 'installer/tunnel-recovery.ps1');
  const ps = fs.readFileSync(script, 'utf8');
  assert(ps.includes('IsInputRedirected') && ps.includes('IsOutputRedirected') && ps.includes('$args.Count -ne 0'));
  assert(ps.includes('WaitOne(0)') && ps.includes('AbandonedMutexException') && ps.includes('$mutex.ReleaseMutex()'));
  assert(ps.indexOf('ReadKey($true)') < ps.indexOf('$mutex.ReleaseMutex()'), 'mutex stays held until result window is dismissed');
  assert(!ps.split('\n').filter(line => !line.trim().startsWith('#')).join('\n').includes('Invoke-Expression'));
  assert(ps.includes("& $node.Source $entry 'recovery'"));
  const iss = fs.readFileSync(path.join(root, 'installer/webagent.iss'), 'utf8');
  const shortcut = iss.split('\n').find(line => line.includes('Filename:') && line.includes('tunnel-recovery.ps1'));
  assert(shortcut && shortcut.includes('WindowsPowerShell') && shortcut.includes('-NoProfile'));
  assert(!shortcut.includes('runas') && !shortcut.includes('RECYCLE'));
  assert(!iss.slice(iss.indexOf('[Run]'), iss.indexOf('[UninstallDelete]')).includes('tunnel-recovery'), 'installation must never start recovery');
  if (process.platform === 'win32') {
    const shell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const parsed = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-Command',
      `$t=$null;$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${script.replace(/'/g, "''")}',[ref]$t,[ref]$e);if($e.Count){$e|Out-String|Write-Error;exit 1}`],
    { encoding: 'utf8', timeout: 10000, maxBuffer: 65536 });
    assert.ifError(parsed.error); assert.equal(parsed.status, 0, parsed.stderr);
    const piped = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
      { input: 'RECYCLE\n', encoding: 'utf8', timeout: 10000, maxBuffer: 65536 });
    assert.ifError(piped.error); assert.equal(piped.status, 2, piped.stderr);
    assert.match(piped.stderr, /piped confirmation is refused/);
    console.log('Windows recovery shortcut script: actual PowerShell parse and piped-input refusal passed; interactive desktop/mutex UI not exercised');
  } else console.log('Windows shortcut native checks: not executed on this platform');
  console.log('Recovery launcher: local-only gates, literal executable arguments, no workspace/server/dependencies, no replay and shortcut packaging contract passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
