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

async function main() {
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
