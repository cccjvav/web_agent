'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
function main() {
  if (process.platform !== 'win32') { console.log('Tunnel cleanup actual DACL denial: Windows-only; not executed on this platform'); return; }
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-acl-')));
  const program = path.join(root, 'cloudflared.exe');
  fs.copyFileSync(process.execPath, program);
  const result = spawnSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'tunnelCleanupAclFixture.ps1')],
    { input: program + '\n', encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 65536 });
  // Do not delete a possibly still-mapped executable or hide the primary failure.
  // The disposable child also has a 60s self-exit if the harness is forcibly lost.
  if (result.stdout?.includes('fixture-target-exited')) fs.rmSync(root, { recursive: true, force: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, 'Actual Windows DACL fixture failed:\n' + result.stderr + '\n' + result.stdout);
  assert.match(result.stdout, /TARGET_DENIED=5 OWNER_DENIED=5 inaccessible owner-unknown active-owner single-use passed/);
  assert.match(result.stdout, /fixture-target-exited/);
  console.log('Actual Windows DACL denial: target inaccessible, live owner unknown, no termination, restored live-owner protection and stable-handle fixture teardown passed');
}
main();
