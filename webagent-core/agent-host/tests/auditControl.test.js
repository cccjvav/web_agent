'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { config } = require('../src/config');
const { isLocalControlPlane } = require('../src/utils/localControl');
const tracker = require('../src/usage/tracker');

function connect(port, origin, allowed, headers = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers, ...(origin ? { origin } : {}) });
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('WS handshake timed out')); }, 3000);
    ws.on('unexpected-response', (_req, res) => {
      clearTimeout(timer); res.resume();
      if (allowed) reject(new Error(`unexpected WS rejection ${res.statusCode}`));
      else { assert.ok([401, 403].includes(res.statusCode)); resolve(); }
    });
    ws.on('message', () => {
      clearTimeout(timer);
      ws.once('close', () => allowed ? resolve() : reject(new Error('cross-site WS was accepted')));
      ws.close();
    });
    ws.on('error', err => { clearTimeout(timer); reject(err); });
  });
}
function controlRequest(port, route, { headers = {}, body, method = body === undefined ? 'GET' : 'POST' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: route, method,
      headers: { ...headers, ...(body === undefined ? {} : {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)
      }) }
    }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }));
      res.on('error', reject);
    });
    req.setTimeout(3000, () => req.destroy(new Error('control request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}
async function main() {
  const req = host => ({ headers: { host }, socket: { remoteAddress: '127.0.0.1' } });
  for (const host of ['untrusted.example', 'localhost.evil', 'localhost:48271,evil', '', 'localhost@evil']) {
    assert.strictEqual(isLocalControlPlane(req(host)), false, host || '(missing host)');
  }
  assert.ok(isLocalControlPlane(req('[::1]:48271')));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-control-regression-'));
  config.workspaceRoot = tmp; config.host = '127.0.0.1'; config.port = 0; config.workbenchPort = 0;
  const { uiServer, mcpServer } = require('../src/index');
  try {
    await Promise.all([uiServer, mcpServer].map(s => s.listening ? null : new Promise(resolve => s.once('listening', resolve))));
    const port = uiServer.address().port;
    await connect(port, 'https://untrusted.example', false);
    await connect(port, `http://127.0.0.1:${port}`, true);
    await connect(port, null, true);
    await connect(port, `http://127.0.0.1:${port}`, false, { Host: 'untrusted.example' });
    await connect(port, null, false, { 'CF-Connecting-IP': '127.0.0.1' });
    const mcpPort = mcpServer.address().port;
    const mcpRoute = `/mcp/${config.secretKey}`;
    // This uses the production mounting order, not a reconstructed Express fixture.
    const deniedBody = await controlRequest(mcpPort, mcpRoute, {
      headers: { Origin: 'https://untrusted.example' }, body: '{'
    });
    assert.strictEqual(deniedBody.status, 403, 'deny disallowed Origin before parsing an authenticated malformed body');
    assert.deepStrictEqual(JSON.parse(deniedBody.text), { error: 'origin not allowed' });
    assert.strictEqual(deniedBody.headers['access-control-allow-origin'], undefined);
    for (const route of ['/mcp', mcpRoute]) {
      const headers = { Origin: 'https://untrusted.example', Authorization: `Bearer ${config.secretKey}` };
      for (const method of ['GET', 'POST', 'OPTIONS']) {
        const denied = await controlRequest(mcpPort, route, { headers, method, body: method === 'POST' ? '{' : undefined });
        assert.strictEqual(denied.status, 403, `${method} ${route === '/mcp' ? 'bearer route' : 'secret route'}`);
      }
      const preflight = await controlRequest(mcpPort, route, {
        method: 'OPTIONS', headers: { Origin: 'https://arena.ai', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' }
      });
      assert.strictEqual(preflight.status, 204, 'allowed preflight needs no auth header');
      assert.strictEqual(preflight.headers['access-control-allow-origin'], 'https://arena.ai');
    }
    // Missing credentials must still be rejected before malformed JSON is parsed.
    for (const origin of [undefined, 'https://arena.ai']) {
      const unauthorized = await controlRequest(mcpPort, '/mcp', {
        headers: origin ? { Origin: origin } : {}, body: '{'
      });
      assert.strictEqual(unauthorized.status, 401);
    }
    for (const origin of [undefined, 'https://arena.ai', 'chrome-extension://abcd']) {
      const initialized = await controlRequest(mcpPort, mcpRoute, {
        headers: origin ? { Origin: origin } : {},
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'audit-control', version: '1' } } })
      });
      assert.strictEqual(initialized.status, 200);
      assert.ok(JSON.parse(initialized.text).result.serverInfo);
    }
    // Both production listeners gate local APIs before parsers; no-origin CLI and
    // different local ports remain intentional. Extra MCP origins do not grant API access.
    for (const serverPort of [port, mcpPort]) {
      for (const headers of [
        { Host: 'untrusted.example' }, { Host: 'localhost.evil' },
        { Host: 'localhost:48271,evil' }, { Host: 'localhost@evil' },
        { Host: 'localhost:0' }, { Host: 'localhost:65536' }, { Host: '127.1' },
        { 'CF-Connecting-IP': '127.0.0.1' }, { 'CF-Ray': 'test' }, { 'CDN-Loop': 'cloudflare' },
        { Origin: 'https://untrusted.example' }, { Origin: 'https://arena.ai' },
        { Referer: 'https://untrusted.example/attack' },
        { Origin: 'https://untrusted.example', Referer: 'http://localhost/workbench' }
      ]) {
        const denied = await controlRequest(serverPort, '/api/status', { headers });
        assert.strictEqual(denied.status, 404);
        const deniedBeforeParse = await controlRequest(serverPort, '/api/status', { headers, body: '{' });
        assert.strictEqual(deniedBeforeParse.status, 404, 'API rejection must precede body parsing');
      }
      for (const headers of [{}, { Origin: 'http://localhost:12345' }, { Referer: 'http://localhost:12345/workbench' }]) {
        assert.strictEqual((await controlRequest(serverPort, '/api/status', { headers })).status, 200);
      }
    }
    console.log('audit local control regressions passed');
  } finally {
    tracker.stopReporter();
    await Promise.all([uiServer, mcpServer].map(s => new Promise(resolve => s.close(resolve))));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
