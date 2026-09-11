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

function connect(port, origin, allowed) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, origin ? { origin } : {});
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
    const status = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: '/api/status', headers: { Host: 'untrusted.example' } }, res => {
        res.resume(); res.once('end', () => resolve(res.statusCode));
      }).on('error', reject);
    });
    assert.strictEqual(status, 404);
    console.log('audit local control regressions passed');
  } finally {
    tracker.stopReporter();
    await Promise.all([uiServer, mcpServer].map(s => new Promise(resolve => s.close(resolve))));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
