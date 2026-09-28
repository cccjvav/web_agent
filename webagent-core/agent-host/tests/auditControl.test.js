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
// Opens a real client on the production /ws and resolves once the server's welcome message arrived.
// Every client opened here is terminated in wsResourceBounds' finally, so a failed assertion reports promptly
// instead of the host's server.close() waiting on leftover sockets.
const openedWs = new Set();
function openWs(port, options = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, options);
    openedWs.add(ws);
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('WS open timed out')); }, 3000);
    ws.once('message', () => { clearTimeout(timer); resolve(ws); });
    ws.once('error', err => { clearTimeout(timer); reject(err); });
  });
}
const closed = (ws, ms = 3000) => new Promise((resolve, reject) => {
  if (ws.readyState === WebSocket.CLOSED) { resolve({ code: 'already' }); return; }
  const timer = setTimeout(() => reject(new Error('WS was not closed')), ms);
  ws.once('close', code => { clearTimeout(timer); resolve({ code }); });
});
const turn = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

// Event-stream resource bounds on the production /ws (F94): a client that stops reading or stops answering pings
// is dropped instead of making the host buffer events for it and hold one of the 32 slots; a client cannot make
// the host buffer large inbound frames either.
async function wsResourceBounds(port) {
  const eventBus = require('../src/utils/eventBus');
  const baseline = eventBus.wsClients.size;
  try {
    // 1. Inbound frames are capped (the workbench never sends): 5000 bytes closes with 1009.
    const sender = await openWs(port);
    const senderClosed = closed(sender);
    sender.send('x'.repeat(5000));
    assert.strictEqual((await senderClosed).code, 1009, 'an oversized client frame closes the socket with 1009');
    for (let i = 0; i < 50 && eventBus.wsClients.size !== baseline; i++) await turn(10);
    assert.strictEqual(eventBus.wsClients.size, baseline);

    // 1b. A malformed frame (unmasked text frame, as no conforming client sends) closes that socket only; before
    // F94 the socket's unhandled 'error' crashed the whole host process.
    await new Promise((resolve, reject) => {
      const raw = require('net').connect(port, '127.0.0.1', () => raw.write('GET /ws HTTP/1.1\r\nHost: 127.0.0.1\r\n'
        + 'Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n'));
      const timer = setTimeout(() => { raw.destroy(); reject(new Error('malformed-frame socket was not closed')); }, 3000);
      let upgraded = false;
      raw.on('data', data => {
        if (!upgraded && data.toString('latin1').startsWith('HTTP/1.1 101')) { upgraded = true; raw.write(Buffer.from([0x81, 0x02, 0x68, 0x69])); }
      });
      raw.on('error', () => {});
      raw.on('close', () => { clearTimeout(timer); upgraded ? resolve() : reject(new Error('no upgrade')); });
    });
    for (let i = 0; i < 50 && eventBus.wsClients.size !== baseline; i++) await turn(10);
    assert.strictEqual(eventBus.wsClients.size, baseline, 'the malformed client no longer holds a slot');
    assert.strictEqual((await controlRequest(port, '/api/status')).status, 200, 'the host is still serving');

    // 2. Heartbeat: a peer that never answers pings is dropped on the second round; a normal client stays.
    const healthy = await openWs(port);
    const silent = await openWs(port, { autoPong: false });
    assert.strictEqual(eventBus.wsClients.size, baseline + 2);
    const silentClosed = closed(silent);
    const pinged = new Promise(resolve => healthy.once('ping', resolve));
    eventBus._heartbeatRound();
    await pinged; await turn(50); // the automatic pong reaches the host
    eventBus._heartbeatRound();
    await silentClosed;
    assert.strictEqual(healthy.readyState, WebSocket.OPEN, 'a client that answers pings is kept');
    assert.strictEqual(eventBus.wsClients.size, baseline + 1, 'the unresponsive peer no longer holds a slot');

    // 3. A client that stops reading is dropped once more than WS_MAX_BUFFERED bytes are queued for it, while a
    // client that keeps reading through the same broadcasts is kept. ~160 KB per event (40 fields x 4000 chars).
    const stalled = await openWs(port);
    stalled._socket.pause();
    const payload = {};
    for (let i = 0; i < 40; i++) payload['field' + i] = String(i % 10).repeat(4000);
    let received = 0; healthy.on('message', () => { received++; });
    let sent = 0;
    for (; sent < 600 && eventBus.wsClients.size === baseline + 2; sent++) {
      eventBus.broadcast('fixture_large_event', payload);
      await turn(); // let the healthy socket drain between events, as real events are spread out
    }
    assert.strictEqual(eventBus.wsClients.size, baseline + 1, `stalled reader dropped (after ${sent} events)`);
    assert.ok(sent > 1, 'not dropped before anything was queued');
    assert.strictEqual(healthy.readyState, WebSocket.OPEN, 'a reading client is not dropped by the same burst');
    for (let i = 0; i < 200 && received < sent; i++) await turn(10);
    assert.strictEqual(received, sent, 'the reading client received every event');
    const stalledClosed = closed(stalled);
    stalled._socket.resume();
    await stalledClosed;

    const healthyClosed = closed(healthy); healthy.close(); await healthyClosed;
    for (let i = 0; i < 50 && eventBus.wsClients.size !== baseline; i++) await turn(10);
    assert.strictEqual(eventBus.wsClients.size, baseline);
    console.log(`ws resource bounds passed (stalled reader dropped after ${sent} events of ~160 KB)`);
  } finally {
    for (const ws of openedWs) ws.terminate();
    openedWs.clear();
  }
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
    await wsResourceBounds(port);
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
