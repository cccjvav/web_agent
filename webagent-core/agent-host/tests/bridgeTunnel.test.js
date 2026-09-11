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
const ngrok = require('../src/tunnel/ngrok');
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
  const origNamed = tunnel.startNamedTunnel;
  const origStop = tunnel.stopTunnel;
  const origNgrok = ngrok.startNgrokTunnel;
  let startCalls = 0;
  let namedCalls = 0;
  let ngrokCalls = 0;
  let stopCalls = 0;
  let lastNamed = null;
  let lastNgrok = null;

  tunnel.startQuickTunnel = async () => {
    startCalls += 1;
    config.publicTunnelUrl = 'https://random-words-ab12.trycloudflare.com';
    return { url: config.publicTunnelUrl, binary: 'stub', target: `http://127.0.0.1:${config.port}` };
  };
  tunnel.startNamedTunnel = async (opts) => {
    namedCalls += 1;
    lastNamed = opts;
    return origNamed(opts);
  };
  tunnel.stopTunnel = () => {
    stopCalls += 1;
    config.publicTunnelUrl = null;
  };
  ngrok.startNgrokTunnel = async (opts) => {
    ngrokCalls += 1;
    lastNgrok = opts;
    return origNgrok(opts);
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
    assert.strictEqual(fallback.json.success, false);
    assert.strictEqual(fallback.json.running, false);
    assert.ok(fallback.json.mcpUrl.startsWith(`http://127.0.0.1:${config.port}/mcp/`));
    assert.strictEqual(startCalls, 1);
    assert.ok(fallback.json.tunnelError);
    assert.ok(String(fallback.json.note).includes('MCP仅可通过本机'));
    assert.ok(!String(fallback.json.mcpUrl).includes('trycloudflare.com'));

    startCalls = 0;
    namedCalls = 0;
    const namedMissing = await request(server, 'POST', '/api/bridge/start', { tunnelProvider: 'named' });
    assert.strictEqual(namedMissing.status, 200);
    assert.strictEqual(startCalls, 0);
    assert.ok(namedCalls >= 1);
    assert.ok(namedMissing.json.tunnelError);
    assert.ok(/主机名|Token|Named/.test(String(namedMissing.json.tunnelError)));
    assert.ok(!String(namedMissing.json.mcpUrl).includes('trycloudflare.com'));

    namedCalls = 0;
    lastNamed = null;
    tunnel.startNamedTunnel = async (opts) => {
      namedCalls += 1;
      lastNamed = opts;
      config.publicTunnelUrl = 'https://mcp.example.com';
      return { url: config.publicTunnelUrl, binary: 'stub', target: `http://127.0.0.1:${config.port}`, named: true };
    };
    const namedOk = await request(server, 'POST', '/api/bridge/start', {
      tunnelProvider: 'cloudflare-named',
      namedDomain: 'mcp.example.com',
      namedToken: 'eyJtest-token-not-for-logs'
    });
    assert.strictEqual(namedOk.status, 200);
    assert.strictEqual(namedCalls, 1);
    assert.strictEqual(lastNamed.hostname, 'mcp.example.com');
    assert.strictEqual(lastNamed.token, 'eyJtest-token-not-for-logs');
    assert.ok(String(namedOk.json.mcpUrl).includes('mcp.example.com'));
    assert.ok(String(namedOk.json.note).includes('Named Tunnel 已就绪'));
    assert.ok(!String(JSON.stringify(namedOk.json)).includes('eyJtest-token-not-for-logs'));
    assert.strictEqual(namedOk.json.tunnelError, null);
    const namedStatus = await request(server, 'GET', '/api/status');
    assert.strictEqual(namedStatus.json.namedDomain, 'mcp.example.com');
    assert.ok(!JSON.stringify(namedStatus.json).includes('eyJtest-token-not-for-logs'));

    startCalls = 0;
    namedCalls = 0;
    ngrokCalls = 0;
    const ngrokMissing = await request(server, 'POST', '/api/bridge/start', { tunnelProvider: 'ngrok' });
    assert.strictEqual(ngrokMissing.status, 200);
    assert.strictEqual(startCalls, 0);
    assert.strictEqual(namedCalls, 0);
    assert.ok(ngrokCalls >= 1);
    assert.ok(ngrokMissing.json.tunnelError);
    assert.ok(/Authtoken|ngrok|Token/i.test(String(ngrokMissing.json.tunnelError)));
    assert.ok(!String(ngrokMissing.json.mcpUrl).includes('trycloudflare.com'));

    ngrokCalls = 0;
    lastNgrok = null;
    ngrok.startNgrokTunnel = async (opts) => {
      ngrokCalls += 1;
      lastNgrok = opts;
      config.publicTunnelUrl = 'https://mcp.ngrok-free.app';
      return { url: config.publicTunnelUrl, binary: 'stub', target: `http://127.0.0.1:${config.port}`, ngrok: true };
    };
    const ngrokOk = await request(server, 'POST', '/api/bridge/start', {
      tunnelProvider: 'ngrok',
      ngrokDomain: 'mcp.ngrok-free.app',
      ngrokToken: 'ngrok_test_token_must_hide'
    });
    assert.strictEqual(ngrokOk.status, 200);
    assert.strictEqual(ngrokCalls, 1);
    assert.strictEqual(lastNgrok.hostname, 'mcp.ngrok-free.app');
    assert.strictEqual(lastNgrok.token, 'ngrok_test_token_must_hide');
    assert.ok(String(ngrokOk.json.mcpUrl).includes('mcp.ngrok-free.app'));
    assert.ok(String(ngrokOk.json.note).includes('ngrok 已就绪'));
    assert.ok(!String(JSON.stringify(ngrokOk.json)).includes('ngrok_test_token_must_hide'));
    assert.strictEqual(ngrokOk.json.tunnelError, null);
    const ngrokStatus = await request(server, 'GET', '/api/status');
    assert.strictEqual(ngrokStatus.json.ngrokDomain, 'mcp.ngrok-free.app');
    assert.ok(!JSON.stringify(ngrokStatus.json).includes('ngrok_test_token_must_hide'));

    let readyStart, finishStart;
    const entered = new Promise(resolve => { readyStart = resolve; });
    tunnel.startQuickTunnel = () => new Promise(resolve => { finishStart = resolve; readyStart(); });
    const pendingStart = request(server, 'POST', '/api/bridge/start', { tunnelProvider: 'cloudflare' });
    await entered;
    const loggedOut = await request(server, 'POST', '/api/bridge/logout', {});
    assert.strictEqual(loggedOut.status, 200);
    finishStart({ url: 'https://obsolete.trycloudflare.com' });
    const staleStart = await pendingStart;
    assert.strictEqual(staleStart.status, 409, 'logout supersedes pending start');
    assert.strictEqual(config.bridgeRunning, false);

    store.patch({ bridge: { loggedIn: false, deviceAuthorized: false } });
    const denied = await request(server, 'POST', '/api/bridge/start', { tunnelProvider: 'cloudflare' });
    assert.strictEqual(denied.status, 403);
  } finally {
    tunnel.startQuickTunnel = origStart;
    tunnel.startNamedTunnel = origNamed;
    tunnel.stopTunnel = origStop;
    ngrok.startNgrokTunnel = origNgrok;
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
