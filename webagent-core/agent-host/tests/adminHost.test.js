const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createServer, ingest, rankDay, loadReports } = require('../../admin-host/app');

function request(server, { method, url, headers, body }) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const req = http.request({
      hostname: '127.0.0.1',
      port: addr.port,
      method,
      path: url,
      headers
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-admin-'));
  ingest(dataDir, {
    installId: 'a',
    githubUser: 'alice',
    day: '2026-04-01',
    toolCalls: 10,
    fail: 1,
    successRate: 90
  });
  ingest(dataDir, {
    installId: 'b',
    day: '2026-04-01',
    toolCalls: 3,
    fail: 0
  });
  ingest(dataDir, {
    installId: 'a',
    githubUser: 'alice',
    day: '2026-04-01',
    toolCalls: 12,
    fail: 1,
    successRate: 92
  });
  const ranked = rankDay(loadReports(dataDir), '2026-04-01');
  assert.strictEqual(ranked[0].githubUser, 'alice');
  assert.strictEqual(ranked[0].toolCalls, 12);
  assert.strictEqual(ranked[1].githubUser, '');
  assert.strictEqual(ranked[1].toolCalls, 3);

  const { server, token } = createServer({ dataDir, token: 'tok' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const denied = await request(server, {
      method: 'POST',
      url: '/api/report',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installId: 'c', toolCalls: 1, day: '2026-04-01' })
    });
    assert.strictEqual(denied.status, 401);

    const pageDenied = await request(server, { method: 'GET', url: '/?day=2026-04-01' });
    assert.strictEqual(pageDenied.status, 401);

    const statsDenied = await request(server, { method: 'GET', url: '/api/stats?day=2026-04-01' });
    assert.strictEqual(statsDenied.status, 401);

    const health = await request(server, { method: 'GET', url: '/health' });
    assert.strictEqual(health.status, 200);

    const ok = await request(server, {
      method: 'POST',
      url: '/api/report',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer tok'
      },
      body: JSON.stringify({ installId: 'c', githubUser: 'carol', toolCalls: 7, day: '2026-04-01' })
    });
    assert.strictEqual(ok.status, 200);

    const page = await request(server, {
      method: 'GET',
      url: '/?day=2026-04-01',
      headers: { Authorization: 'Bearer tok' }
    });
    assert.strictEqual(page.status, 200);
    assert.ok(page.body.includes('@alice'));
    assert.ok(page.body.includes('@carol'));
    assert.ok(page.body.includes('未绑定 GitHub'));

    const stats = await request(server, {
      method: 'GET',
      url: '/api/stats?day=2026-04-01',
      headers: { Authorization: 'Bearer tok' }
    });
    const json = JSON.parse(stats.body);
    assert.strictEqual(json.rows[0].githubUser, 'alice');

    const huge = await request(server, {
      method: 'POST',
      url: '/api/report',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer tok'
      },
      body: `{"installId":"z","pad":"${'x'.repeat(1024 * 1024 + 8)}"}`
    });
    assert.strictEqual(huge.status, 413);

    const appSrc = fs.readFileSync(path.resolve(__dirname, '../../admin-host/app.js'), 'utf8');
    assert.ok(appSrc.includes('crypto.timingSafeEqual'), 'admin Bearer compare must be timing-safe');
    assert.ok(!appSrc.includes('bearer(req) === token'), 'must not compare admin token with ===');

    const indexSrc = fs.readFileSync(path.resolve(__dirname, '../../admin-host/index.js'), 'utf8');
    assert.ok(indexSrc.includes('WEBAGENT_ADMIN_BIND'));
    assert.ok(!/listen\(\s*port,\s*'0\.0\.0\.0'/.test(indexSrc));
    const adminReadme = fs.readFileSync(path.resolve(__dirname, '../../admin-host/README.md'), 'utf8');
    assert.ok(!adminReadme.includes('**不需要**令牌（本机排行榜）'));
    assert.ok(adminReadme.includes('GET /health'));
    assert.ok(adminReadme.includes('Bearer'));
    void token;
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  await busyPort();
  console.log('adminHost.test.js ok');
}

// The real entry on a busy port exits 1 with a readable message instead of an unhandled-error stack.
async function busyPort() {
  const net = require('net');
  const { spawn } = require('child_process');
  const blocker = net.createServer();
  await new Promise(resolve => blocker.listen(0, '127.0.0.1', resolve));
  const busy = blocker.address().port;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-admin-busy-'));
  try {
    const child = spawn(process.execPath, [path.resolve(__dirname, '../../admin-host/index.js')], {
      env: { ...process.env, WEBAGENT_ADMIN_PORT: String(busy), WEBAGENT_ADMIN_BIND: '127.0.0.1', WEBAGENT_ADMIN_DATA: dataDir, WEBAGENT_ADMIN_TOKEN: 'busy-port-fixture' },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
    });
    let output = '';
    child.stdout.on('data', c => { output += c; }); child.stderr.on('data', c => { output += c; });
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('admin host did not exit on a busy port')); }, 10000);
      child.once('exit', c => { clearTimeout(timer); resolve(c); });
    });
    assert.strictEqual(code, 1);
    assert.ok(output.includes(`端口 ${busy} 已被占用`), output.slice(-600));
    assert.ok(!output.includes("Unhandled 'error' event"));
  } finally {
    await new Promise(resolve => blocker.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
