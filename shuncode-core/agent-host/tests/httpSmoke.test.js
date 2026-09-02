const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shuncode-smoke-'));
const hostDir = path.resolve(__dirname, '..');
const workbenchPort = 18000 + Math.floor(Math.random() * 2000);
const mcpPort = 20000 + Math.floor(Math.random() * 2000);

function request(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
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
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, raw, json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitHealth(url, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error(`health HTTP ${res.statusCode}`));
        setTimeout(tick, 120);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error('health timeout'));
        setTimeout(tick, 120);
      });
    };
    tick();
  });
}

function stop(proc) {
  if (!proc || proc.killed) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  } else {
    try {
      proc.kill('SIGTERM');
    } catch (_) {}
  }
}

async function main() {
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: hostDir,
    env: {
      ...process.env,
      WORKSPACE_ROOT: tmp,
      WORKBENCH_PORT: String(workbenchPort),
      AGENT_HOST_PORT: String(mcpPort)
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  let log = '';
  child.stdout.on('data', (c) => {
    log += c.toString();
  });
  child.stderr.on('data', (c) => {
    log += c.toString();
  });
  child.on('exit', (code) => {
    if (code && code !== 0 && !log.includes('httpSmoke finished')) {
      // leftover log inspected in catch
    }
  });

  try {
    await waitHealth(`http://127.0.0.1:${workbenchPort}/health`, 12000);

    const health = await request('GET', `http://127.0.0.1:${workbenchPort}/health`);
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.json.ok, true);
    assert.strictEqual(health.json.product, 'ShunCode');

    const page = await request('GET', `http://127.0.0.1:${workbenchPort}/`);
    assert.strictEqual(page.status, 200);
    assert.ok(page.raw.includes('ShunCode'));
    assert.ok(page.raw.includes('编辑进化') || page.raw.includes('CHAT'));
    assert.ok(page.raw.includes('Add API'));
    assert.ok(page.raw.includes('btn-agent-pick'));
    assert.ok(page.raw.includes('agent-pick-menu'));
    assert.ok(page.raw.includes('ShunCode Code'));
    assert.ok(page.raw.includes('环境偏好'));
    assert.ok(page.raw.includes('技术栈'));
    assert.ok(page.raw.includes('技能引导'));

    const status = await request('GET', `http://127.0.0.1:${mcpPort}/api/status`);
    assert.strictEqual(status.status, 200);
    assert.ok(status.json.secretKey);
    assert.ok(status.json.prompt.includes('快速连接这个 MCP（URL），明确使用规则，熟悉可用工具，做好处理接下来一系列工作的准备。'));
    assert.ok(Array.isArray(status.json.tools) && status.json.tools.length === 24);

    const secret = status.json.secretKey;
    const denied = await request('POST', `http://127.0.0.1:${mcpPort}/mcp/not-a-real-secret`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {}
    });
    assert.strictEqual(denied.status, 401);

    const init = await request('POST', `http://127.0.0.1:${mcpPort}/mcp/${secret}`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'http-smoke' } }
    });
    assert.strictEqual(init.status, 200);
    assert.ok(init.json.result.instructions.includes('ShunCode Bridge MCP'));
    assert.ok(init.json.result.instructions.includes('shuncode://instructions'));

    const listed = await request('POST', `http://127.0.0.1:${mcpPort}/mcp/${secret}`, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    });
    assert.strictEqual(listed.status, 200);
    const names = listed.json.result.tools.map((t) => t.name);
    assert.ok(names.includes('apply_patch'));
    assert.ok(names.includes('start_command'));
    assert.strictEqual(names.length, 24);

    const ping = await request('POST', `http://127.0.0.1:${mcpPort}/mcp/${secret}`, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'ping', arguments: {} }
    });
    assert.strictEqual(ping.status, 200);
    assert.strictEqual(ping.json.result.isError, false);
    assert.ok(ping.json.result.content[0].text.includes('"ok": true') || ping.json.result.content[0].text.includes('"ok":true'));

    log += 'httpSmoke finished\n';
    console.log('http smoke tests passed');
  } catch (err) {
    console.error('server log:\n', log);
    throw err;
  } finally {
    stop(child);
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
