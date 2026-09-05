const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-usage-'));
process.env.WORKSPACE_ROOT = tmp;

const { config } = require('../src/config');
config.workspaceRoot = tmp;
const tracker = require('../src/usage/tracker');
const store = require('../src/models/store');

async function run() {
  store.reset();
  tracker.stopReporter();
  const rec = tracker.record({ ok: true });
  assert.strictEqual(rec.toolCalls, 1);
  assert.strictEqual(rec.fail, 0);
  tracker.record({ ok: false });
  const snap = tracker.snapshot();
  assert.strictEqual(snap.toolCalls, 2);
  assert.strictEqual(snap.fail, 1);
  assert.strictEqual(snap.successRate, 50);
  assert.strictEqual(snap.telemetryConfigured, false);

  const usageFile = path.join(tmp, '.webagent', 'usage.json');
  assert.ok(fs.existsSync(usageFile));

  store.patch({
    bridge: { provider: 'github', username: 'octocat', githubId: '1', loggedIn: true }
  });
  const body = tracker.payload();
  assert.strictEqual(body.githubUser, 'octocat');
  assert.strictEqual(body.githubId, '1');
  assert.strictEqual(body.toolCalls, 2);

  process.env.WEBAGENT_TELEMETRY_URL = 'https://example.test/api/report';
  process.env.WEBAGENT_TELEMETRY_TOKEN = 'secret';
  let posted = null;
  const fakeFetch = async (url, opts) => {
    posted = { url, opts };
    return { ok: true, status: 200, async text() { return '{}'; } };
  };
  const reported = await tracker.reportNow({ fetchFn: fakeFetch });
  assert.strictEqual(reported.ok, true);
  assert.strictEqual(posted.url, 'https://example.test/api/report');
  assert.ok(String(posted.opts.headers.Authorization).includes('secret'));
  const sent = JSON.parse(posted.opts.body);
  assert.strictEqual(sent.githubUser, 'octocat');
  assert.strictEqual(sent.toolCalls, 2);

  delete process.env.WEBAGENT_TELEMETRY_URL;
  delete process.env.WEBAGENT_TELEMETRY_TOKEN;
  tracker.stopReporter();
  store.reset();
  console.log('usageTracker.test.js ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
