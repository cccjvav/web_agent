// F62 batch 2: outbound HTTP on the identity/telemetry paths must have a deadline, and the
// read-hash store must not rewrite itself when nothing changed.
// Baseline (c7acac4): auth/github.js and usage/tracker.js called fetch with no signal, no timeout
// and no response budget, so a black-holed host hung login forever and stacked telemetry sockets;
// readCache.rememberHash rewrote the whole store on every call, including no-op re-reads.
// Everything below runs against self-created temporary directories and in-process doubles; no
// real network request is made.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-netbudget-'));
process.env.WORKSPACE_ROOT = tmp;
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const github = require('../src/auth/github');
const tracker = require('../src/usage/tracker');
const readCache = require('../src/tools/readCache');
const { fetchText } = require('../src/utils/requestScope');

function jsonResp(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(body); },
    async json() { return body; }
  };
}

// A transport that never answers unless its signal aborts. This is what a black-holed host looks
// like: the connection is accepted, nothing comes back, and only a client-side deadline ends it.
function blackHole(record) {
  return (url, init) => new Promise((resolve, reject) => {
    record.push(String(url));
    const signal = init && init.signal;
    assert.ok(signal, 'outbound requests must carry an abort signal: ' + url);
    if (signal.aborted) {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
      return;
    }
    signal.addEventListener('abort', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    }, { once: true });
  });
}

async function rejects(promise, label) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new assert.AssertionError({ message: label + ': expected a rejection' });
}

async function run() {
  // --- fetchText honours an injected transport while still applying its own budget. ---
  {
    const seen = [];
    const started = Date.now();
    const err = await rejects(
      fetchText('https://example.invalid/slow', { fetchImpl: blackHole(seen) }, 120),
      'fetchText deadline'
    );
    // After the 01a0c932 merge fetchText classifies its own deadline as E_TIMEOUT rather than
    // surfacing the transport's raw AbortError, so callers can distinguish "we gave up" from
    // "the peer hung up". Assert the code, which is the part callers branch on.
    assert.strictEqual(err.code, 'E_TIMEOUT');
    assert.ok(Date.now() - started < 5000, 'the deadline must fire, not the test harness');
    assert.deepStrictEqual(seen, ['https://example.invalid/slow'], 'the injected transport is used');
  }

  // --- The declared budgets exist and are sane. ---
  for (const [label, value] of [
    ['github timeout', github.GITHUB_TIMEOUT_MS],
    ['github max bytes', github.GITHUB_MAX_BYTES],
    ['telemetry timeout', tracker.REPORT_TIMEOUT_MS],
    ['telemetry max bytes', tracker.REPORT_MAX_BYTES]
  ]) {
    assert.ok(Number.isFinite(value) && value > 0, label + ' must be a positive number');
  }

  // --- F62-08: every GitHub identity call must time out instead of hanging forever. ---
  process.env.WEBAGENT_GITHUB_CLIENT_ID = 'Iv1.test';
  process.env.WEBAGENT_GITHUB_TIMEOUT_MS = '150';
  delete require.cache[require.resolve('../src/auth/github')];
  const gh = require('../src/auth/github');
  assert.strictEqual(gh.GITHUB_TIMEOUT_MS, 150, 'the timeout must be configurable');

  for (const [label, invoke] of [
    ['loginWithToken', (fn) => gh.loginWithToken('ghp_test', fn)],
    ['startDeviceLogin', (fn) => gh.startDeviceLogin(fn)],
    ['fetchGitHubUser', (fn) => gh.fetchGitHubUser('ghp_test', fn)]
  ]) {
    const seen = [];
    const started = Date.now();
    const err = await rejects(invoke(blackHole(seen)), label);
    const elapsed = Date.now() - started;
    // The merged fetchText enforces its own deadline (E_TIMEOUT) instead of depending on the
    // transport to honour the abort signal, so assert the code rather than AbortError.
    assert.strictEqual(err.code, 'E_TIMEOUT', label + ' must abort rather than hang');
    assert.ok(elapsed < 5000, `${label} must end near its deadline; took ${elapsed}ms`);
    assert.strictEqual(seen.length, 1, label + ' must not retry on its own');
  }

  // The device-code poller reports the failure instead of leaving the attempt wedged.
  {
    const deviceFetch = async (url) => {
      if (String(url).includes('/login/device/code')) {
        return jsonResp(200, { device_code: 'dev', user_code: 'ABCD-1234', expires_in: 900, interval: 5 });
      }
      throw new Error('unexpected ' + url);
    };
    const start = await gh.startDeviceLogin(deviceFetch);
    assert.strictEqual(start.userCode, 'ABCD-1234');
    const seen = [];
    const started = Date.now();
    const err = await rejects(gh.pollDeviceLogin(blackHole(seen)), 'pollDeviceLogin');
    assert.strictEqual(err.code, 'E_TIMEOUT', 'polling classifies its own deadline');
    assert.ok(Date.now() - started < 5000, 'polling must not hang on a dead endpoint');
    gh.resetPending();
  }

  // A healthy response still works end to end, and an oversized body is refused.
  {
    const ok = await gh.loginWithToken('ghp_test', async () => jsonResp(200, { login: 'octocat', id: 7, name: 'O' }));
    assert.strictEqual(ok.username, 'octocat');
    const huge = 'x'.repeat(gh.GITHUB_MAX_BYTES + 1024);
    const err = await rejects(
      gh.fetchGitHubUser('ghp_test', async () => ({ ok: true, status: 200, async text() { return huge; } })),
      'oversized GitHub body'
    );
    assert.strictEqual(err.code, 'E_RESPONSE_TOO_LARGE');
    gh.clearGithubKeepDemo();
  }

  // --- F62-09: telemetry must not stack sockets against a dead endpoint. ---
  process.env.WEBAGENT_TELEMETRY_URL = 'https://telemetry.invalid/report';
  process.env.WEBAGENT_TELEMETRY_TOKEN = 'tok';
  process.env.WEBAGENT_TELEMETRY_TIMEOUT_MS = '150';
  delete require.cache[require.resolve('../src/usage/tracker')];
  const usage = require('../src/usage/tracker');
  usage.record({ tool: 'read_files', ok: true });
  {
    const seen = [];
    const started = Date.now();
    const result = await usage.reportNow({ fetchFn: blackHole(seen) });
    const elapsed = Date.now() - started;
    // Telemetry is fire-and-forget, so a timeout is reported as a failed result, not thrown.
    assert.strictEqual(result.ok, false, 'a timed-out report must be reported as failed');
    assert.strictEqual(result.skipped, false);
    assert.ok(elapsed < 5000, `telemetry must end near its deadline; took ${elapsed}ms`);
    assert.strictEqual(seen.length, 1, 'telemetry must not retry inside one call');
  }
  // A successful report still records lastReportAt.
  {
    const good = await usage.reportNow({ fetchFn: async () => jsonResp(200, { success: true }) });
    assert.strictEqual(good.ok, true);
    assert.ok(good.lastReportAt, 'a successful report records its timestamp');
  }
  delete process.env.WEBAGENT_TELEMETRY_URL;
  delete process.env.WEBAGENT_TELEMETRY_TOKEN;

  // --- F62-10: the read-hash store must not rewrite itself for a no-op. ---
  {
    const hashPath = path.join(tmp, '.webagent', 'read-hashes.json');
    readCache.resetHashes();
    const realWrite = fs.writeFileSync;
    let writes = 0;
    let bytes = 0;
    fs.writeFileSync = (file, data, ...rest) => {
      if (String(file).includes('read-hashes.json')) {
        writes += 1;
        bytes += Buffer.byteLength(String(data));
      }
      return realWrite(file, data, ...rest);
    };
    try {
      // Re-reading the same unchanged file is the common case while an agent iterates.
      for (let i = 0; i < 400; i += 1) readCache.rememberHash('src/app.js', 'abc123');
      assert.strictEqual(writes, 1, 'an unchanged re-read must not rewrite the store');
      assert.ok(bytes < 4096, `a no-op loop must not rewrite kilobytes; wrote ${bytes}`);

      // Forgetting something that was never recorded changes no bytes either.
      const before = writes;
      readCache.forgetHash('never/recorded.js');
      assert.strictEqual(writes, before, 'forgetting an absent key must not rewrite the store');

      // A genuine change is still persisted immediately.
      readCache.rememberHash('src/app.js', 'def456');
      assert.strictEqual(writes, before + 1, 'a changed hash must be persisted');
    } finally {
      fs.writeFileSync = realWrite;
    }

    // Correctness is unchanged: the newest value wins and survives a reload.
    assert.strictEqual(readCache.recalledHash('src/app.js'), 'def456');
    assert.strictEqual(readCache.sessionHash('src/app.js'), 'def456');
    const saved = JSON.parse(fs.readFileSync(hashPath, 'utf8'));
    assert.strictEqual(saved['src/app.js'], 'def456');

    // Interleaving two files still records both, and eviction order stays by recency.
    readCache.rememberHash('a.js', '1');
    readCache.rememberHash('b.js', '2');
    readCache.rememberHash('a.js', '1');
    assert.strictEqual(readCache.recalledHash('a.js'), '1');
    assert.strictEqual(readCache.recalledHash('b.js'), '2');
    const reloaded = JSON.parse(fs.readFileSync(hashPath, 'utf8'));
    assert.strictEqual(reloaded['a.js'], '1');
    assert.strictEqual(reloaded['b.js'], '2');

    // Publication is atomic; no temporary files are left behind.
    const leftovers = fs.readdirSync(path.join(tmp, '.webagent'))
      .filter((name) => name.includes('read-hashes.json.tmp'));
    assert.deepStrictEqual(leftovers, [], 'atomic publish must not leave temporary files');
  }

  console.log('networkBudget.test.js ok');
}

// fetchText unrefs its deadline timer so it never holds a shutting-down host open. In production
// the HTTP server keeps the loop alive; in this harness nothing else does, so an in-flight
// black-hole request would let Node exit silently with code 0 and skip the remaining assertions.
// Hold one referenced handle for the duration of the run.
const keepAlive = setInterval(() => {}, 1000);

run()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => {
    clearInterval(keepAlive);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
