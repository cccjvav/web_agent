const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-skip-'));
const hostDir = path.resolve(__dirname, '..');
const mcpPort = 21000 + Math.floor(Math.random() * 1000);

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
  });
}

function waitOk(url, ms) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        if (Date.now() - start > ms) return reject(new Error('timeout'));
        setTimeout(tick, 120);
      });
      req.on('error', () => {
        if (Date.now() - start > ms) return reject(new Error('timeout'));
        setTimeout(tick, 120);
      });
    };
    tick();
  });
}

// F94: the UI server carries the /ws WebSocketServer, which re-emits the server's own errors. Without a listener
// on it, a busy workbench port crashed with a raw "Unhandled 'error' event" stack before listenOrExit could print
// the port message. The host must exit 1 with that message.
async function busyWorkbenchPort() {
  const net = require('net');
  const blocker = net.createServer();
  await new Promise(resolve => blocker.listen(0, '127.0.0.1', resolve));
  const busy = blocker.address().port;
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-busy-'));
  try {
    const child = spawn(process.execPath, ['src/index.js'], {
      cwd: hostDir,
      // Same address as the blocker: a wildcard bind could coexist with it on Windows.
      env: { ...process.env, WEBAGENT_BIND: '127.0.0.1', WORKSPACE_ROOT: workspace, AGENT_HOST_PORT: '0', WORKBENCH_PORT: String(busy), WEBAGENT_SKIP_WORKBENCH: '' },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
    });
    let output = '';
    child.stdout.on('data', c => { output += c; }); child.stderr.on('data', c => { output += c; });
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('host did not exit on a busy workbench port')); }, 15000);
      child.once('exit', c => { clearTimeout(timer); resolve(c); });
    });
    assert.strictEqual(code, 1);
    assert.ok(output.includes(`端口 ${busy} 已被占用（工作台 UI）`), 'the port message is printed:\n' + output.slice(-800));
    assert.ok(!output.includes("Unhandled 'error' event"), 'no raw unhandled-error crash');
  } finally {
    await new Promise(resolve => blocker.close(resolve));
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

async function main() {
  await busyWorkbenchPort();
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: hostDir,
    env: {
      ...process.env,
      WORKSPACE_ROOT: tmp,
      AGENT_HOST_PORT: String(mcpPort),
      WORKBENCH_PORT: '19999',
      WEBAGENT_SKIP_WORKBENCH: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  try {
    await waitOk(`http://127.0.0.1:${mcpPort}/health`, 10000);
    const health = await get(`http://127.0.0.1:${mcpPort}/health`);
    assert.strictEqual(health.status, 200);
    await new Promise((resolve, reject) => {
      const req = http.get('http://127.0.0.1:19999/health', () => {
        reject(new Error('workbench port should be free when WEBAGENT_SKIP_WORKBENCH=1'));
      });
      req.on('error', () => resolve());
    });
    console.log('skip workbench tests passed');
  } finally {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
    await new Promise((r) => setTimeout(r, 200));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
