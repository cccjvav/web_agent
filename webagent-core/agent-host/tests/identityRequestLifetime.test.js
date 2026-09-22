// F62 batch 6: identity routes must inherit the lifetime of the actual HTTP request.
//
// A timeout budget alone is not enough. /api/bridge/token, /bridge/device and /bridge/device/poll
// all call GitHub over the network. If the browser navigates away or the socket dies, the upstream
// request should stop immediately instead of running on to its own budget with nobody waiting for
// the answer. routes.js binds an AbortController to req 'aborted' / res 'close' and runs the
// handler inside runWithSignal, which requestScope.fetchText then propagates to the transport.
//
// This lives in its own file on purpose. github.js keeps module-level identity state
// (identityGeneration / pendingDevice) and supersedes in-flight attempts, so an earlier identity
// test in the same process can abort this one's upstream call at ~150ms and make the assertion
// pass for the wrong reason. A dedicated process keeps "who aborted it" unambiguous.
//
// No real network request is made: the transport is an in-process double that never answers.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-identity-lifetime-'));
process.env.WORKSPACE_ROOT = tmp;
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const apiRouter = require('../src/api/routes');

// Accepts the connection and never answers, exactly like a black-holed host. Only a client-side
// abort ends it, which is what makes it useful for observing who cancels and when.
function hangingTransport(state) {
  return (_url, init) => new Promise((_resolve, reject) => {
    state.started = true;
    state.startedAt = Date.now();
    const signal = init && init.signal;
    assert.ok(signal, 'outbound identity requests must carry an abort signal');
    signal.addEventListener('abort', () => {
      state.aborted = true;
      state.abortedAt = Date.now();
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    }, { once: true });
  });
}

function waitFor(predicate, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (predicate() || Date.now() - started > timeoutMs) return resolve(predicate());
      setTimeout(tick, 10);
    };
    tick();
  });
}

async function run() {
  const state = { started: false, aborted: false };
  const originalFetch = global.fetch;
  // loginWithToken resolves its transport at call time, so replacing the global is enough and is
  // restored below. The route itself is exercised unchanged.
  global.fetch = hangingTransport(state);

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const payload = JSON.stringify({ token: 'ghp_fixture_not_a_real_token' });
    const req = http.request({
      host: '127.0.0.1',
      port: server.address().port,
      path: '/api/bridge/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    });
    req.on('error', () => { /* the client hangs up on purpose */ });
    req.end(payload);

    assert.ok(await waitFor(() => state.started), 'the route must reach the upstream identity call');

    // Hold the connection open well past any startup jitter. Nothing should cancel the upstream
    // call while a client is still waiting for its answer; an abort here would mean some other
    // mechanism (a stray deadline, a superseded attempt) is doing it, not the disconnect.
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.strictEqual(
      state.aborted,
      false,
      'nothing may cancel the upstream call while the client is still connected'
    );

    const disconnectedAt = Date.now();
    req.destroy(); // the browser navigates away / the socket dies

    assert.ok(
      await waitFor(() => state.aborted),
      'a client disconnect must abort the upstream GitHub request instead of leaving it running'
    );
    // Tie the abort to the disconnect rather than to any coincidental timer.
    assert.ok(
      state.abortedAt >= disconnectedAt,
      'the abort must follow the disconnect, not precede it'
    );
    assert.ok(
      state.abortedAt - disconnectedAt < 1000,
      `the abort must follow the disconnect promptly; took ${state.abortedAt - disconnectedAt}ms`
    );

    console.log('identityRequestLifetime.test.js ok');
  } finally {
    global.fetch = originalFetch;
    await new Promise((resolve) => server.close(resolve));
  }
}

run()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => { fs.rmSync(tmp, { recursive: true, force: true }); });
