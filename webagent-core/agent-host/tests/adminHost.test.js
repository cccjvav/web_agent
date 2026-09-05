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

    const page = await request(server, { method: 'GET', url: '/?day=2026-04-01' });
    assert.strictEqual(page.status, 200);
    assert.ok(page.body.includes('@alice'));
    assert.ok(page.body.includes('@carol'));
    assert.ok(page.body.includes('未绑定 GitHub'));

    const stats = await request(server, { method: 'GET', url: '/api/stats?day=2026-04-01' });
    const json = JSON.parse(stats.body);
    assert.strictEqual(json.rows[0].githubUser, 'alice');
    void token;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('adminHost.test.js ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
