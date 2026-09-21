'use strict';
// Real launcher functions with isolated dependencies; never download/start code-server.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const vm = require('vm');
const { EventEmitter } = require('events');
const { spawn: realSpawn } = require('child_process');
const { createRequire } = require('module');
const acorn = require('acorn');
const filename = path.resolve(__dirname, '../../scripts/run-code-oss.js');
const source = fs.readFileSync(filename, 'utf8');
const entry = acorn.parse(source, { ecmaVersion: 'latest' }).body.at(-1);
assert.ok(source.slice(entry.start).startsWith('main()'), 'test removes only the CLI invocation, not function bodies');
const definition = source.slice(0, entry.start) + '\nglobalThis.fixture = {waitHealth, main, stopChild: typeof stopChild === "function" ? stopChild : null};';
const originalRequire = createRequire(filename);

function bounded(promise, ms = 1500) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('fixture guard: operation did not settle'), { code: 'E_FIXTURE_GUARD' })), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

function fixtureChild(pid) {
  const child = new EventEmitter();
  Object.assign(child, { pid, exitCode: null, signalCode: null, killed: false, signals: [], unrefs: 0 });
  child.end = (code, signal = null) => {
    child.exitCode = code; child.signalCode = signal;
    child.emit('exit', code, signal); child.emit('close', code, signal);
  };
  child.kill = signal => {
    child.killed = true; child.signals.push(signal);
    queueMicrotask(() => child.end(null, signal));
    return true;
  };
  child.unref = () => { child.unrefs++; };
  return child;
}

function healthyHttp({ automatic = true } = {}) {
  const requests = [];
  return { requests, get(...args) {
    const callback = args.at(-1), request = new EventEmitter(), response = new EventEmitter();
    request.destroy = () => { request.destroyed = true; };
    response.destroy = () => { response.destroyed = true; };
    response.resume = () => {};
    response.statusCode = 200;
    requests.push({ request, response, callback });
    if (automatic) queueMicrotask(() => callback(response));
    return request;
  } };
}

function harness(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-code-lifecycle-'));
  const children = [], calls = [], logs = [], proc = new EventEmitter();
  const host = path.join(root, 'webagent-core/agent-host'); fs.mkdirSync(host, { recursive: true });
  Object.assign(proc, { argv: [process.execPath, filename, root], execPath: process.execPath,
    platform: options.platform || process.platform,
    env: { WEBAGENT_USER_DATA_DIR: path.join(root, 'user-data'), ...options.env },
    exit(code) { throw Object.assign(new Error('unexpected immediate process.exit'), { exitCode: code }); }
  });
  const bindings = {
    path, http: options.http || healthyHttp(),
    fs: { ...fs, existsSync(file) {
      if (file === path.join(host, 'node_modules/express')) return !options.install;
      return fs.existsSync(file);
    }, mkdirSync(file, opts) {
      if (options.mkdirError && file === proc.env.WEBAGENT_USER_DATA_DIR) throw options.mkdirError;
      return fs.mkdirSync(file, opts);
    } },
    child_process: { spawn(command, args, opts) {
      calls.push({ command, args, opts });
      const child = options.spawn ? options.spawn(command, args, opts, children) : fixtureChild(10000 + children.length);
      children.push(child); return child;
    } },
    ...(options.clock ? { perf_hooks: { performance: { now: () => options.clock.now } } } : {}),
    './ensure-code-server': { repoRoot: root, ensure() { return Promise.resolve(path.join(root, 'entry.js')); }, syncExtension() {} },
    './codeServerAuth': { trustedOrigins: originalRequire('./codeServerAuth').trustedOrigins,
      resolveAuth() { if (options.authError) throw options.authError; return { mode: 'password', password: 'fixture-only', passwordFile: null }; }
    }
  };
  const context = { process: proc, console: { log(...args) { logs.push(args.join(' ')); }, error(...args) { logs.push(args.join(' ')); } },
    require(name) { return bindings[name] || originalRequire(name); },
    setTimeout: options.clock?.setTimeout || setTimeout, clearTimeout: options.clock?.clearTimeout || clearTimeout, AbortController };
  vm.runInNewContext(definition, context, { filename });
  return { api: context.fixture, proc, calls, children, logs, root, http: bindings.http, context,
    async close() {
      // Fixture-owned handles only, including red runs where the old launcher leaked.
      for (const child of children) {
        if (child.exitCode !== null || child.signalCode !== null) continue;
        if (typeof child.end === 'function') { child.end(0); continue; }
        const exited = new Promise(resolve => child.once('exit', resolve));
        child.kill('SIGKILL'); await bounded(exited, 5000);
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

function fakeClock() {
  let now = 0, sequence = 0;
  const timers = new Map();
  return { timers, get now() { return now; },
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: now + delay, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    elapse(ms) { now += ms; }, // A stalled event loop: callbacks have not run yet.
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const next = [...timers].filter(([,t]) => t.at <= until).sort((a,b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; timers.delete(next[0]); next[1].fn();
      }
      now = until;
    }
  };
}

const nextTurn = () => new Promise(resolve => setImmediate(resolve));

async function serverFixture(handler) {
  const sockets = new Set();
  const server = http.createServer(handler);
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/health`, sockets,
    async close() { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
  };
}

(async () => {
  const failures = [];
  const test = async (name, fn) => {
    try { await fn(); console.log('PASS ' + name); }
    catch (error) { failures.push(name); console.error('FAIL ' + name + '\n' + error.stack); }
  };
  await test('health deadline closes an accepted silent HTTP connection', async () => {
    let requests = 0;
    const server = await serverFixture(() => { requests++; });
    const h = harness({ http });
    try {
      const failure = await bounded(h.api.waitHealth(server.url, 250)).then(() => null, error => error);
      assert.ok(requests >= 1, 'a real server accepted the probe but sent no headers');
      assert.equal(failure?.code, 'ETIMEDOUT');
      await bounded(Promise.all([...server.sockets].map(socket => new Promise(resolve => socket.once('close', resolve)))));
    } finally { await server.close(); await h.close(); }
  });
  await test('a pre-aborted health probe sends no request', async () => {
    let requests = 0;
    const server = await serverFixture(() => { requests++; });
    const h = harness({ http }), controller = new AbortController(); controller.abort();
    try {
      await assert.rejects(bounded(h.api.waitHealth(server.url, 250, { signal: controller.signal })), { code: 'ABORT_ERR' });
      assert.equal(requests, 0);
    } finally { await server.close(); await h.close(); }
  });
  await test('startup authentication failure reaps the real child before returning', async () => {
    const authError = new Error('fixture authentication storage unavailable');
    const h = harness({ authError, spawn(_command, _args, opts) {
      return realSpawn(process.execPath, ['-e', 'setTimeout(()=>process.exit(0),5000);setInterval(()=>{},1000);'], {
        cwd: opts.cwd, stdio: 'ignore', env: process.env
      });
    } });
    try {
      const outcome = await bounded(h.api.main().then(code => ({ code }), error => ({ code: 1, error })), 12000);
      assert.equal(outcome.code, 1);
      assert.equal(h.children.length, 1, 'code-server must not start after authentication setup fails');
      const child = h.children[0];
      assert.ok(child.exitCode !== null || child.signalCode !== null, 'spawned agent child must be observed exited, not orphaned');
      assert.equal(h.proc.listenerCount('SIGINT'), 0);
      assert.equal(h.proc.listenerCount('SIGTERM'), 0);
      assert.ok(outcome.error === authError || h.logs.some(line => line.includes(authError.message)), 'preserve the initiating failure');
    } finally { await h.close(); }
  });
  await test('health retries dispose open non-200 responses, then release success', async () => {
    let attempts = 0, peak = 0, finalClose;
    const closed = new Promise(resolve => { finalClose = resolve; });
    const server = await serverFixture((_req, res) => {
      attempts++; peak = Math.max(peak, server.sockets.size);
      res.writeHead(attempts === 1 ? 503 : 200); res.flushHeaders(); // Deliberately never end the body.
      if (attempts === 2) res.once('close', finalClose);
    });
    const h = harness({ http });
    try {
      await bounded(h.api.waitHealth(server.url, 1200), 2000);
      await bounded(closed);
      assert.equal(attempts, 2); assert.equal(peak, 1, 'do not accumulate draining/pending responses');
      assert.equal(server.sockets.size, 0);
    } finally { await server.close(); await h.close(); }
  });
  await test('abort during a real HTTP request closes the connection', async () => {
    const controller = new AbortController(); let requests = 0, onClose;
    const closed = new Promise(resolve => { onClose = resolve; });
    const server = await serverFixture((req) => {
      requests++; req.socket.once('close', onClose); controller.abort();
    });
    const h = harness({ http });
    try {
      await assert.rejects(bounded(h.api.waitHealth(server.url, 1200, { signal: controller.signal })), { code: 'ABORT_ERR' });
      await bounded(closed); assert.equal(requests, 1);
    } finally { await server.close(); await h.close(); }
  });
  await test('health cancel clears retry/deadline and ignores late response/errors', async () => {
    const clock = fakeClock(), transport = healthyHttp({ automatic: false }), controller = new AbortController();
    const h = harness({ clock, http: transport });
    try {
      const pending = h.api.waitHealth('http://fixture.invalid/health', 1000, { signal: controller.signal });
      const expected = assert.rejects(pending, { code: 'ABORT_ERR' });
      const attempt = transport.requests[0]; attempt.response.statusCode = 503; attempt.callback(attempt.response);
      assert.ok(attempt.request.destroyed && attempt.response.destroyed);
      assert.equal(clock.timers.size, 2);
      controller.abort(); await expected; assert.equal(clock.timers.size, 0);
      attempt.request.emit('error', new Error('late disposed request'));
      attempt.response.emit('error', new Error('late disposed response'));
      attempt.response.statusCode = 200; attempt.callback(attempt.response);
      clock.advance(2000); assert.equal(transport.requests.length, 1); assert.equal(clock.timers.size, 0);
    } finally { await h.close(); }
  });
  await test('connection errors retry serially inside the same total deadline', async () => {
    const clock = fakeClock(), transport = healthyHttp({ automatic: false }), h = harness({ clock, http: transport });
    try {
      const pending = h.api.waitHealth('http://fixture.invalid/health', 1000);
      transport.requests[0].request.emit('error', new Error('fixture connection refused'));
      assert.ok(transport.requests[0].request.destroyed); clock.advance(200);
      assert.equal(transport.requests.length, 2);
      transport.requests[1].callback(transport.requests[1].response);
      await pending; assert.equal(clock.timers.size, 0);
    } finally { await h.close(); }
  });
  await test('a late 200 cannot win against an elapsed deadline before timer dispatch', async () => {
    const clock = fakeClock(), transport = healthyHttp({ automatic: false });
    const h = harness({ clock, http: transport });
    try {
      const pending = h.api.waitHealth('http://fixture.invalid/health', 1000);
      const expected = assert.rejects(pending, { code: 'ETIMEDOUT' });
      clock.elapse(1001); transport.requests[0].callback(transport.requests[0].response);
      await expected; assert.equal(clock.timers.size, 0); assert.ok(transport.requests[0].request.destroyed);
      for (const limit of [0, -1, NaN, Infinity]) await assert.rejects(h.api.waitHealth('unused', limit));
      assert.equal(transport.requests.length, 1);
    } finally { await h.close(); }
  });
  await test('normal launch keeps authentication/workspace flags and coordinates Ctrl+C once', async () => {
    const h = harness({ env: { AGENT_HOST_PORT: '51321', CODE_SERVER_PORT: '51322' } });
    try {
      let settled = false;
      const running = h.api.main().then(code => { settled = true; return code; });
      await nextTurn(); assert.equal(h.children.length, 2); assert.equal(settled, false);
      const [host, editor] = h.calls;
      assert.equal(editor.args[0], path.join(h.root, 'entry.js'), 'await the prepared entry instead of spawning a Promise');
      assert.deepStrictEqual([...host.args], ['src/index.js']);
      assert.equal(host.opts.env.WORKSPACE_ROOT, h.root); assert.equal(host.opts.env.WEBAGENT_SKIP_WORKBENCH, '1');
      assert.equal(host.opts.env.AGENT_HOST_PORT, '51321'); assert.equal(host.opts.env.WORKBENCH_PORT, '51322');
      assert.equal(editor.opts.env.PASSWORD, 'fixture-only');
      assert.equal(editor.args[editor.args.indexOf('--auth') + 1], 'password');
      assert.equal(editor.args[editor.args.indexOf('--trusted-origins') + 1], 'http://127.0.0.1:51322,http://localhost:51322');
      assert.equal(editor.args[editor.args.indexOf('--bind-addr') + 1], '127.0.0.1:51322');
      assert.equal(editor.args.at(-1), h.root); assert.equal(editor.opts.shell, false);
      assert.ok(!editor.args.includes('--disable-workspace-trust'));
      h.proc.emit('SIGINT'); h.proc.emit('SIGTERM');
      assert.equal(await bounded(running), 0);
      for (const child of h.children) assert.deepStrictEqual(child.signals, ['SIGTERM']);
      assert.equal(h.proc.listenerCount('SIGINT'), 0); assert.equal(h.proc.listenerCount('SIGTERM'), 0);
      assert.equal(h.calls.length, 2, 'cleanup never spawns taskkill or another command');
    } finally { await h.close(); }
  });
  await test('stop while waiting prevents a late healthy response from starting the editor', async () => {
    const clock = fakeClock(), transport = healthyHttp({ automatic: false });
    const h = harness({ clock, http: transport });
    try {
      const running = h.api.main(); await nextTurn(); assert.equal(h.children.length, 1);
      assert.ok([...clock.timers.values()].some(t => t.delay === 15000), 'preserve the production 15s health budget');
      h.proc.emit('SIGTERM');
      transport.requests[0].callback(transport.requests[0].response);
      assert.equal(await bounded(running), 0);
      assert.equal(h.children.length, 1); assert.ok(transport.requests[0].request.destroyed); assert.equal(clock.timers.size, 0);
    } finally { await h.close(); }
  });
  await test('a health deadline fails startup and reaps the agent', async () => {
    const clock = fakeClock(), transport = healthyHttp({ automatic: false });
    const h = harness({ clock, http: transport });
    try {
      const running = h.api.main(); await nextTurn(); clock.advance(15000);
      assert.equal(await bounded(running), 1); assert.equal(h.children.length, 1);
      assert.deepStrictEqual(h.children[0].signals, ['SIGTERM']); assert.equal(clock.timers.size, 0);
      assert.ok(h.logs.some(line => line.includes('时限')));
    } finally { await h.close(); }
  });
  await test('an agent exit before readiness cancels the probe, even for exit zero', async () => {
    const transport = healthyHttp({ automatic: false }), h = harness({ http: transport });
    try {
      const running = h.api.main(); await nextTurn(); h.children[0].end(0);
      assert.equal(await bounded(running), 1); assert.equal(h.children.length, 1);
      assert.deepStrictEqual(h.children[0].signals, [], 'never kill an exited child/PID');
      transport.requests[0].callback(transport.requests[0].response);
      assert.equal(h.calls.length, 1); assert.ok(transport.requests[0].request.destroyed);
    } finally { await h.close(); }
  });
  for (const [index, code, signal, expected] of [[0,0,null,1], [0,7,null,7], [0,null,'SIGKILL',1], [1,0,null,0], [1,9,null,9], [1,null,'SIGKILL',1]]) {
    await test(`peer exit ${index}/${code}/${signal} stops its sibling and preserves failure`, async () => {
      const h = harness();
      try {
        const running = h.api.main(); await nextTurn(); assert.equal(h.children.length, 2);
        h.children[index].end(code, signal); assert.equal(await bounded(running), expected);
        assert.deepStrictEqual(h.children[index].signals, []);
        assert.deepStrictEqual(h.children[1 - index].signals, ['SIGTERM']);
      } finally { await h.close(); }
    });
  }
  for (const kind of ['mkdir', 'spawn-throw', 'spawn-error']) {
    await test(`startup ${kind} failure reaps already-owned children`, async () => {
      const options = kind === 'mkdir' ? { mkdirError: new Error('fixture mkdir denied') } : {
        spawn(_command, _args, _opts, children) {
          if (children.length === 1 && kind === 'spawn-throw') throw new Error('fixture spawn threw');
          const child = fixtureChild(10000 + children.length);
          if (children.length === 1) queueMicrotask(() => {
            child.pid = undefined; child.exitCode = -2;
            child.emit('error', new Error('fixture missing executable')); child.emit('close', -2, null);
          });
          return child;
        }
      };
      const h = harness(options);
      try {
        assert.equal(await bounded(h.api.main()), 1); assert.deepStrictEqual(h.children[0].signals, ['SIGTERM']);
        assert.ok(h.logs.some(line => line.includes('fixture')));
        assert.equal(h.proc.listenerCount('SIGINT'), 0); assert.equal(h.proc.listenerCount('SIGTERM'), 0);
      } finally { await h.close(); }
    });
  }
  for (const outcome of ['success', 'failure', 'cancel']) {
    await test(`dependency installer ${outcome} is owned without late continuation`, async () => {
      const h = harness({ install: true, platform: 'win32' });
      try {
        const running = h.api.main(); await nextTurn(); assert.equal(h.calls[0].command, 'npm.cmd'); assert.equal(h.calls[0].opts.shell, true);
        assert.equal(h.children.length, 1);
        if (outcome === 'cancel') h.proc.emit('SIGINT'); else h.children[0].end(outcome === 'success' ? 0 : 5);
        await nextTurn();
        if (outcome === 'success') { assert.equal(h.children.length, 3); h.proc.emit('SIGTERM'); }
        else assert.equal(h.calls.length, 1);
        assert.equal(await bounded(running), outcome === 'failure' ? 1 : 0);
        assert.ok(h.calls.every(call => call.command !== 'taskkill'));
      } finally { await h.close(); }
    });
  }
  await test('cleanup waits despite killed=true and only forces a retained live handle', async () => {
    const clock = fakeClock(), h = harness({ clock }), child = fixtureChild(10000);
    child.killed = true;
    child.kill = signal => { child.signals.push(signal); if (signal === 'SIGKILL') child.end(null, signal); return true; };
    try {
      const stopping = h.api.stopChild(child, 100, 50); assert.deepStrictEqual(child.signals, ['SIGTERM']);
      clock.advance(100); assert.equal(await stopping, true);
      assert.deepStrictEqual(child.signals, ['SIGTERM', 'SIGKILL']); assert.equal(clock.timers.size, 0);
      const exited = fixtureChild(10000); exited.exitCode = 0;
      assert.equal(await h.api.stopChild(exited), true); assert.deepStrictEqual(exited.signals, []);
    } finally { await h.close(); }
  });
  await test('unconfirmed cleanup is bounded, nonzero, and never escalates by PID/tree', async () => {
    const clock = fakeClock(), h = harness({ clock, platform: 'win32' });
    try {
      const running = h.api.main(); await nextTurn();
      const agent = h.children[0];
      agent.kill = signal => { agent.signals.push(signal); agent.emit('error', new Error('fixture access denied')); return false; };
      h.children[1].end(0); await nextTurn();
      assert.ok([...clock.timers.values()].some(t => t.delay === 9000), 'do not undercut host 8s shutdown grace');
      clock.advance(10000);
      assert.equal(await bounded(running), 1); assert.equal(agent.unrefs, 1); assert.equal(clock.timers.size, 0);
      assert.deepStrictEqual(agent.signals, ['SIGTERM', 'SIGKILL']); assert.equal(h.calls.length, 2);
      assert.ok(h.logs.some(line => line.includes('未能确认'))); assert.equal(h.proc.listenerCount('SIGINT'), 0);
    } finally { await h.close(); }
  });
  await test('real child exit is observed without touching an unrelated live process', async () => {
    const h = harness();
    const program = 'process.on("SIGTERM",()=>{});process.stdout.write("ready\\n");setTimeout(()=>process.exit(0),5000);setInterval(()=>{},1000);';
    const child = realSpawn(process.execPath, ['-e', program], { stdio: ['ignore','pipe','pipe'] });
    const unrelated = realSpawn(process.execPath, ['-e', 'setTimeout(()=>process.exit(0),5000);setInterval(()=>{},1000);'], { stdio:'ignore' });
    h.children.push(child, unrelated);
    try {
      await bounded(new Promise((resolve,reject) => { child.stdout.once('data', resolve); child.once('error', reject); }), 5000);
      assert.equal(await bounded(h.api.stopChild(child, 30, 1000), 1500), true);
      assert.ok(child.exitCode !== null || child.signalCode !== null);
      if (process.platform !== 'win32') assert.equal(child.signalCode, 'SIGKILL', 'uncooperative fixture required force after grace');
      assert.equal(unrelated.exitCode, null); assert.equal(unrelated.signalCode, null);
    } finally { await h.close(); }
  });
  await test('CLI forwards the settled exit code and reports unexpected rejection', async () => {
    for (const expected of [0,7,1]) {
      const proc = {}, logs = [];
      vm.runInNewContext(source.slice(entry.start), {
        process: proc, main: () => expected === 1 ? Promise.reject(new Error('fixture unexpected rejection')) : Promise.resolve(expected),
        console: { error(error) { logs.push(error); } }
      });
      await nextTurn(); assert.equal(proc.exitCode, expected);
      if (expected === 1) assert.ok(logs[0].includes('fixture unexpected rejection'));
    }
  });
  assert.deepStrictEqual(failures, [], 'code-server launcher lifecycle contracts');
  console.log('code-server launcher lifecycle passed; no actual code-server/desktop or dependency installation');
})().catch(error => { console.error(error); process.exitCode = 1; });
