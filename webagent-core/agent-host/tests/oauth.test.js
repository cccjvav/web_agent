const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-oauth-'));
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const oauth = require('../src/mcp/oauth');
const mcpRouter = require('../src/mcp/server');

function request(server, method, urlPath, { body, headers, json = true } = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path: urlPath,
        method,
        headers: {
          ...(payload && json ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(payload && !json ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(payload) } : {}),
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
          resolve({ status: res.statusCode, headers: res.headers, raw, json: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(oauth.router);
  app.use('/mcp', mcpRouter);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const well = await request(server, 'GET', '/.well-known/oauth-authorization-server');
    assert.strictEqual(well.status, 200);
    assert.ok(well.json.authorization_endpoint.includes('/oauth/authorize'));
    assert.ok(well.json.code_challenge_methods_supported.includes('S256'));

    const prm = await request(server, 'GET', '/.well-known/oauth-protected-resource');
    assert.strictEqual(prm.status, 200);
    assert.ok(prm.json.resource.endsWith('/mcp'));

    const denied = await request(server, 'POST', '/mcp', {
      body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }
    });
    assert.strictEqual(denied.status, 401);
    assert.ok(String(denied.headers['www-authenticate'] || '').includes('resource_metadata='));

    const secretOk = await request(server, 'POST', `/mcp/${config.secretKey}`, {
      body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'url-secret' } } }
    });
    assert.strictEqual(secretOk.status, 200);
    assert.ok(secretOk.json.result.instructions.includes('Web Agent Bridge MCP'));

    const sse = await request(server, 'POST', `/mcp/${config.secretKey}`, {
      body: { jsonrpc: '2.0', id: 2, method: 'ping', params: {} },
      headers: { Accept: 'text/event-stream' }
    });
    assert.strictEqual(sse.status, 200);
    assert.ok(String(sse.headers['content-type'] || '').includes('text/event-stream'));
    assert.ok(sse.raw.includes('event: message'));

    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = oauth.s256(verifier);
    const registered = oauth.registerClient({
      redirect_uris: ['http://127.0.0.1/cb'],
      client_name: 'test'
    });
    const pairing = oauth.issuePairing();
    assert.ok(pairing.code);

    const redirect = oauth.completeAuthorize({
      client_id: registered.client_id,
      redirect_uri: 'http://127.0.0.1/cb',
      pairing_code: pairing.code,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz'
    });
    const redir = new URL(redirect);
    assert.strictEqual(redir.searchParams.get('state'), 'xyz');
    const code = redir.searchParams.get('code');
    assert.ok(code);

    const tokens = oauth.handleToken({
      grant_type: 'authorization_code',
      code,
      client_id: registered.client_id,
      redirect_uri: 'http://127.0.0.1/cb',
      code_verifier: verifier
    });
    assert.ok(tokens.access_token.startsWith('scat_'));

    let pkceFailed = false;
    try {
      oauth.handleToken({
        grant_type: 'authorization_code',
        code: 'nope',
        client_id: registered.client_id,
        redirect_uri: 'http://127.0.0.1/cb',
        code_verifier: 'wrong'
      });
    } catch {
      pkceFailed = true;
    }
    assert.ok(pkceFailed);

    const viaBearer = await request(server, 'POST', '/mcp', {
      body: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'workspace_info', arguments: {} } },
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    assert.strictEqual(viaBearer.status, 200);
    assert.strictEqual(viaBearer.json.result.isError, false);
    assert.ok(viaBearer.json.result.content[0].text.includes(tmp) || viaBearer.json.result.content[0].text.includes('root'));

    oauth.revokeAll();
    const afterRevoke = await request(server, 'POST', '/mcp', {
      body: { jsonrpc: '2.0', id: 4, method: 'ping', params: {} },
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    assert.strictEqual(afterRevoke.status, 401);
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('oauth / streamable http tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
