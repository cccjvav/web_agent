'use strict';
// F70 (external review P2-6): the host's single shutdown path stops the commands it started.
//
// Baseline 26a167e: run_command/start_command children run detached in their own POSIX process
// group, so a terminal Ctrl+C never reached them, and shutdown() only closed external MCP
// servers. Reproduced with a real host: `start_command sleep …`, SIGINT to the host, host exits 0
// and the sleep keeps running as an orphan. A second, independent SIGINT handler in
// tunnel/cloudflared.js also raced shutdown() for process.exit.
//
// POSIX only: Node cannot deliver a real Ctrl+C to a Windows child (child.kill('SIGINT')
// terminates it outright), and Windows commands are already bound to a kill-on-close OS job by
// commandJob.cs. Everything runs against a self-created temporary workspace.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

if (process.platform === 'win32') {
  console.log('hostShutdown: skipped on Windows (no real SIGINT delivery; commandJob kill-on-close covers it)');
  process.exit(0);
}

const hostDir = path.resolve(__dirname, '..');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-shutdown-'));
const uiPort = 23000 + Math.floor(Math.random() * 2000);
const mcpPort = 25000 + Math.floor(Math.random() * 2000);
// A unique argv makes the probe immune to unrelated `sleep` processes on the machine.
const duration = (400 + Math.random() * 100).toFixed(3);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function probeProcesses() {
  return execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' })
    .split('\n').map(line => line.trim()).filter(line => line.endsWith(`sleep ${duration}`));
}

function killLeftovers() {
  for (const line of probeProcesses()) {
    try { process.kill(Number(line.split(/\s+/)[0]), 'SIGKILL'); } catch (_) {}
  }
}

async function main() {
  const host = spawn(process.execPath, ['src/index.js'], {
    cwd: hostDir,
    env: { ...process.env, WORKSPACE_ROOT: workspace, WORKBENCH_PORT: String(uiPort), AGENT_HOST_PORT: String(mcpPort), WEBAGENT_TELEMETRY: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  host.stdout.on('data', chunk => { output += chunk; });
  host.stderr.on('data', chunk => { output += chunk; });
  const exited = new Promise(resolve => host.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    for (let i = 0; i < 150 && !output.includes('MCP listening'); i++) await wait(100);
    assert.ok(output.includes('MCP listening'), 'host must start: ' + output);

    const response = await fetch(`http://127.0.0.1:${uiPort}/api/tool/call`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'start_command', arguments: { command: `sleep ${duration}`, timeoutSec: 600 }, mode: 'code' })
    });
    const body = await response.json();
    assert.strictEqual(response.status, 200, JSON.stringify(body));
    assert.strictEqual(body.result.status, 'running');
    for (let i = 0; i < 50 && probeProcesses().length === 0; i++) await wait(100);
    assert.strictEqual(probeProcesses().length, 1, 'the background command must be running before shutdown');

    host.kill('SIGINT');
    const result = await Promise.race([exited, wait(12000).then(() => null)]);
    assert.ok(result, 'the host must exit within its 8 s shutdown deadline');
    assert.strictEqual(result.code, 0, 'a clean shutdown exits 0: ' + output.slice(-400));
    // SIGKILL to the process group is asynchronous; give the kernel a moment to reap.
    for (let i = 0; i < 30 && probeProcesses().length; i++) await wait(100);
    assert.deepStrictEqual(probeProcesses(), [], 'no command may outlive the host (orphaned process group)');
    console.log('hostShutdown: SIGINT stops running commands before the host exits; no orphan left');
  } finally {
    killLeftovers();
    try { host.kill('SIGKILL'); } catch (_) {}
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); killLeftovers(); process.exitCode = 1; });
