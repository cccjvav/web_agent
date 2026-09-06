const assert = require('assert');
const http = require('http');
const express = require('express');
const {
  isLoopbackOrigin,
  isExtensionOrigin,
  isAllowedMcpOrigin,
  isAllowedApiBrowserOrigin,
  rejectCrossSiteApi,
  rejectDisallowedMcpOrigin,
  mcpCors
} = require('../src/utils/corsAllow');

assert.strictEqual(isLoopbackOrigin('http://127.0.0.1:3000'), true);
assert.strictEqual(isLoopbackOrigin('http://localhost:48271'), true);
assert.strictEqual(isLoopbackOrigin('https://chat.deepseek.com'), false);
assert.strictEqual(isExtensionOrigin('chrome-extension://kdmpkkahkhdmdhfkdihkopikgcocbpbf'), true);
assert.strictEqual(isExtensionOrigin('https://chat.deepseek.com'), false);

assert.strictEqual(isAllowedMcpOrigin(undefined), true);
assert.strictEqual(isAllowedMcpOrigin(''), true);
assert.strictEqual(isAllowedMcpOrigin('https://chat.deepseek.com'), true);
assert.strictEqual(isAllowedMcpOrigin('https://chatgpt.com'), true);
assert.strictEqual(isAllowedMcpOrigin('https://gemini.google.com'), true);
assert.strictEqual(isAllowedMcpOrigin('https://arena.ai'), true);
assert.strictEqual(isAllowedMcpOrigin('chrome-extension://abcd'), true);
assert.strictEqual(isAllowedMcpOrigin('http://127.0.0.1:3000'), true);
assert.strictEqual(isAllowedMcpOrigin('https://evil.example'), false);

assert.strictEqual(isAllowedApiBrowserOrigin(undefined), true);
assert.strictEqual(isAllowedApiBrowserOrigin('http://127.0.0.1:3000'), true);
assert.strictEqual(isAllowedApiBrowserOrigin('https://chat.deepseek.com'), false);
assert.strictEqual(isAllowedApiBrowserOrigin('https://evil.example'), false);

const prev = process.env.WEBAGENT_CORS_ORIGINS;
process.env.WEBAGENT_CORS_ORIGINS = 'https://www.doubao.com, https://tongyi.aliyun.com';
assert.strictEqual(isAllowedMcpOrigin('https://www.doubao.com'), true);
assert.strictEqual(isAllowedMcpOrigin('https://tongyi.aliyun.com'), true);
assert.strictEqual(isAllowedMcpOrigin('https://evil.example'), false);
if (prev === undefined) delete process.env.WEBAGENT_CORS_ORIGINS;
else process.env.WEBAGENT_CORS_ORIGINS = prev;

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    }
  };
}

{
  let nextCalled = false;
  const res = fakeRes();
  rejectCrossSiteApi(
    { headers: { origin: 'https://evil.example' } },
    res,
    () => { nextCalled = true; }
  );
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 404);
}

{
  let nextCalled = false;
  rejectCrossSiteApi(
    { headers: { origin: 'http://127.0.0.1:3000' } },
    fakeRes(),
    () => { nextCalled = true; }
  );
  assert.strictEqual(nextCalled, true);
}

{
  let nextCalled = false;
  rejectCrossSiteApi({ headers: {} }, fakeRes(), () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
}

{
  let nextCalled = false;
  const res = fakeRes();
  rejectCrossSiteApi(
    { headers: { referer: 'https://evil.example/attack' } },
    res,
    () => { nextCalled = true; }
  );
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 404);
}

{
  let nextCalled = false;
  const res = fakeRes();
  rejectDisallowedMcpOrigin(
    { headers: { origin: 'https://evil.example' } },
    res,
    () => { nextCalled = true; }
  );
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
}

{
  let nextCalled = false;
  rejectDisallowedMcpOrigin({ headers: {} }, fakeRes(), () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
}

{
  let nextCalled = false;
  rejectDisallowedMcpOrigin(
    { headers: { origin: 'https://chat.deepseek.com' } },
    fakeRes(),
    () => { nextCalled = true; }
  );
  assert.strictEqual(nextCalled, true);
}

function request(server, method, urlPath, body, headers) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path: urlPath,
        method,
        headers: {
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
          ...(headers || {})
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
          resolve({ status: res.statusCode, json: parsed, raw });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-cors-mcp-'));
  const { config } = require('../src/config');
  config.workspaceRoot = tmp;
  const mcpRouter = require('../src/mcp/server');

  const app = express();
  app.use(express.json());
  app.use(mcpCors());
  app.use('/mcp', rejectDisallowedMcpOrigin, mcpRouter);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const secret = config.secretKey;
    const evil = await request(server, 'POST', `/mcp/${secret}`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'run_command', arguments: { command: 'echo EVIL_EXEC' } }
    }, { Origin: 'https://evil.com' });
    assert.strictEqual(evil.status, 403);
    assert.ok(!/EVIL_EXEC/.test(evil.raw || ''));

    const noOrigin = await request(server, 'POST', `/mcp/${secret}`, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'ping', arguments: {} }
    });
    assert.strictEqual(noOrigin.status, 200);
    assert.strictEqual(noOrigin.json.result.isError, false);
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('corsAllow tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
