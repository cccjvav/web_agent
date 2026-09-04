const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-bridge-'));
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const tunnel = require('../src/tunnel/cloudflared');
const apiRouter = require('../src/api/routes');
const store = require('../src/models/store');

function request(server, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path: urlPath,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {}
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
          resolve({ status: res.statusCode, json: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const origStart = tunnel.startQuickTunnel;
  const origStop = tunnel.stopTunnel;
  let startCalls = 0;
  let stopCalls = 0;

  tunnel.startQuickTunnel = async () => {
    startCalls += 1;
    config.publicTunnelUrl = 'https://random-words-ab12.trycloudflare.com';
    return { url: config.publicTunnelUrl, binary: 'stub', target: `http://127.0.0.1:${config.port}` };
  };
  tunnel.stopTunnel = () => {
    stopCalls += 1;
    config.publicTunnelUrl = null;
  };

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    store.patch({ bridge: { loggedIn: true, deviceAuthorized: true } });

    const started = await request(server, 'POST', '/api/bridge/start', { tunnelProvider: 'cloudflare' });
    assert.strictEqual(started.status, 200);
    assert.strictEqual(started.json.success, true);
    assert.strictEqual(startCalls, 1);
    assert.ok(String(started.json.mcpUrl).includes('random-words-ab12.trycloudflare.com'));
    assert.ok(String(started.json.note).includes('Quick Tunnel 已就绪'));
    assert.strictEqual(started.json.tunnelError, null);

    const status = await request(server, 'GET', '/api/status');
    assert.ok(String(status.json.mcpUrl).includes('trycloudflare.com'));
    assert.strictEqual(status.json.bridgeRunning, true);

    const stopped = await request(server, 'POST', '/api/bridge/stop');
    assert.strictEqual(stopped.status, 200);
    assert.ok(stopCalls >= 1);
    assert.strictEqual(config.publicTunnelUrl, null);

    startCalls = 0;
    tunnel.startQuickTunnel = async () => {
      startCalls += 1;
      const err = new Error('未找到 cloudflared。');
      err.code = 'E_NO_CLOUDFLARED';
      throw err;
    };
    const fallback = await request(server, 'POST', '/api/bridge/start', { tunnelProvider: 'cloudflare' });
    assert.strictEqual(fallback.status, 200);
    assert.strictEqual(fallback.json.success, true);
    assert.strictEqual(startCalls, 1);
    assert.ok(fallback.json.tunnelError);
    assert.ok(String(fallback.json.note).includes('当前页面源'));
    assert.ok(!String(fallback.json.mcpUrl).includes('trycloudflare.com'));

    startCalls = 0;
    const named = await request(server, 'POST', '/api/bridge/start', { tunnelProvider: 'named' });
    assert.strictEqual(named.status, 200);
    assert.strictEqual(startCalls, 0);
    assert.ok(String(named.json.note).includes('未启动 Quick Tunnel'));

    store.patch({ bridge: { loggedIn: false, deviceAuthorized: false } });
    const denied = await request(server, 'POST', '/api/bridge/start', { tunnelProvider: 'cloudflare' });
    assert.strictEqual(denied.status, 403);
  } finally {
    tunnel.startQuickTunnel = origStart;
    tunnel.stopTunnel = origStop;
    config.publicTunnelUrl = null;
    config.bridgeRunning = false;
    await new Promise((r) => server.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('bridge tunnel tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
