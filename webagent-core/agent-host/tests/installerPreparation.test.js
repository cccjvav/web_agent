'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { EventEmitter } = require('events');
const { spawn: realSpawn } = require('child_process');
const root = path.resolve(__dirname, '../../..');
const launchSrc = fs.readFileSync(path.join(root, 'installer/launch.js'), 'utf8');
const ensureSrc = fs.readFileSync(path.join(root, 'webagent-core/scripts/ensure-code-server.js'), 'utf8');

function bounded(promise, ms = 1500) {
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('fixture guard timeout')), ms); });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}
function fakeClock() {
  let now = 0, next = 0;
  const timers = new Map();
  return {
    timers,
    setTimeout(fn, ms) { const id = ++next; timers.set(id, { fn, at: now + Number(ms) }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        let chosen = null;
        for (const [id, timer] of timers) {
          if (timer.at <= until && (!chosen || timer.at < chosen.at || (timer.at === chosen.at && id < chosen.id))) chosen = { id, at: timer.at, fn: timer.fn };
        }
        if (!chosen) break;
        now = chosen.at; timers.delete(chosen.id); chosen.fn();
      }
      now = until;
    }
  };
}
function hangingChild() {
  const child = new EventEmitter();
  Object.assign(child, { pid: 4242, exitCode: null, signalCode: null, kills: [] });
  child.kill = signal => { child.kills.push(signal); return true; };
  return child;
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
function fixtureLaunch({ exists = false, hang = false, live = false, throwSync = false, clock } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-prep-'));
  const cwd = path.join(tmp, 'webagent-core/agent-host'); fs.mkdirSync(cwd, { recursive: true });
  const calls = [];
  const fakeFs = {
    ...fs,
    existsSync(p) { if (String(p).endsWith('express')) return exists; return fs.existsSync(p); }
  };
  const context = {
    module: { exports: {} }, __dirname: path.join(root, 'installer'), console,
    setTimeout: clock ? clock.setTimeout.bind(clock) : setTimeout,
    clearTimeout: clock ? clock.clearTimeout.bind(clock) : clearTimeout,
    process: { platform: 'win32', execPath: process.execPath, argv: ['node', 'launch.js', 'classic'], env: {} },
    require(name) {
      if (name === 'fs') return fakeFs;
      if (name === 'child_process') return {
        spawn(cmd, args, opts) {
          if (throwSync) throw new Error('fixture spawn threw');
          const child = live
            ? realSpawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' })
            : hangingChild();
          if (!live && !hang) queueMicrotask(() => { child.exitCode = 0; child.emit('exit', 0, null); });
          calls.push({ cmd, args, opts, child });
          return child;
        }
      };
      if (name === './appWindow') return { appOrigin: () => 'http://127.0.0.1:3000', ready: async () => true, appWindow: async () => {} };
      return require(name);
    }
  };
  const wrapped = launchSrc + '\nmodule.exports.ensureDependencies = ensureDependencies;';
  vm.runInNewContext(wrapped, context, { filename: path.join(root, 'installer/launch.js') });
  return { api: context.module.exports, tmp, cwd, calls, async close() {
    for (const call of calls) {
      const child = call.child;
      if (!child || child.exitCode != null || child.signalCode != null || typeof child.kill !== 'function') continue;
      if (child.kills) continue;
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGKILL');
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 1000))]);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  } };
}
function fixtureEnsure({ hang = false, throwSync = false, clock } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-ensure-'));
  const calls = [];
  const fakeFs = {
    ...fs,
    existsSync(p) {
      const text = String(p);
      if (text.includes('code-server') && text.endsWith('entry.js')) return false;
      if (text.endsWith('1ds-core-js')) return true;
      if (text.endsWith('package.json') && text.includes('code-server-runtime')) return true;
      return false;
    },
    mkdirSync() {},
    writeFileSync() { throw new Error('fixture must not write the real code-server runtime'); }
  };
  const context = {
    module: { exports: {} }, __dirname: path.join(root, 'webagent-core/scripts'), console,
    process: { platform: process.platform, versions: { node: process.versions.node }, env: {} }
  };
  vm.runInNewContext(ensureSrc, {
    ...context,
    setTimeout: clock ? clock.setTimeout.bind(clock) : setTimeout,
    clearTimeout: clock ? clock.clearTimeout.bind(clock) : clearTimeout,
    path,
    require(name) {
      if (name === 'fs') return fakeFs;
      if (name === 'child_process') return {
        spawn(cmd, args, opts) {
          if (throwSync) throw new Error('fixture spawn threw');
          const child = hangingChild();
          if (!hang) queueMicrotask(() => { child.exitCode = 0; child.emit('exit', 0, null); });
          calls.push({ cmd, args, opts, child });
          return child;
        }
      };
      return require(name);
    }
  });
  return { api: context.module.exports, tmp, calls, close() { fs.rmSync(tmp, { recursive: true, force: true }); } };
}

(async () => {
  const failures = [];
  const test = async (name, fn) => {
    try { await fn(); console.log('PASS ' + name); }
    catch (e) { failures.push(name); console.error('FAIL ' + name + '\n' + e.stack); }
  };
  await test('ensureDependencies respects existing installation', async () => {
    const h = fixtureLaunch({ exists: true });
    try { await h.api.ensureDependencies(h.tmp); assert.equal(h.calls.length, 0); }
    finally { await h.close(); }
  });
  await test('ensureDependencies timeout signals only the retained npm child', async () => {
    const clock = fakeClock(), h = fixtureLaunch({ exists: false, hang: true, clock });
    try {
      const pending = h.api.ensureDependencies(h.tmp);
      await nextTurn();
      assert.equal(h.calls.length, 1);
      assert.equal(h.calls[0].cmd, 'npm.cmd');
      assert.deepStrictEqual([...h.calls[0].args], ['ci', '--omit=dev', '--no-audit', '--no-fund']);
      assert.equal(h.calls[0].opts.shell, true);
      assert.equal(h.calls[0].opts.timeout, undefined, 'do not rely on spawnSync timeout');
      clock.advance(119999);
      assert.deepStrictEqual(h.calls[0].child.kills, []);
      clock.advance(1);
      assert.deepStrictEqual(h.calls[0].child.kills, ['SIGTERM']);
      clock.advance(1000);
      assert.deepStrictEqual(h.calls[0].child.kills, ['SIGTERM', 'SIGKILL']);
      clock.advance(1000);
      await assert.rejects(pending, /超时/);
      assert.equal(clock.timers.size, 0);
      assert.ok(!JSON.stringify(h.calls).includes('taskkill'));
    } finally { await h.close(); }
  });
  await test('ensureDependencies abort before spawn does no work', async () => {
    const h = fixtureLaunch({ exists: false });
    try {
      const controller = new AbortController(); controller.abort();
      assert.throws(() => h.api.ensureDependencies(h.tmp, { signal: controller.signal }), /停止/);
      assert.equal(h.calls.length, 0);
    } finally { await h.close(); }
  });
  await test('ensureDependencies in-flight abort signals the retained child', async () => {
    const clock = fakeClock(), h = fixtureLaunch({ exists: false, hang: true, clock });
    try {
      const controller = new AbortController();
      const pending = h.api.ensureDependencies(h.tmp, { signal: controller.signal });
      await nextTurn();
      assert.equal(h.calls.length, 1);
      controller.abort();
      assert.deepStrictEqual(h.calls[0].child.kills, ['SIGTERM']);
      clock.advance(2000);
      await assert.rejects(pending, /停止/);
      assert.equal(clock.timers.size, 0);
    } finally { await h.close(); }
  });
  await test('ensureDependencies live abort is observed on the retained handle', async () => {
    const h = fixtureLaunch({ exists: false, live: true });
    try {
      const controller = new AbortController();
      const pending = h.api.ensureDependencies(h.tmp, { signal: controller.signal, timeoutMs: 30000 });
      const start = Date.now();
      while (!h.calls.length && Date.now() - start < 2000) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(h.calls.length, 1);
      controller.abort();
      await assert.rejects(bounded(pending, 4000), /停止/);
      const child = h.calls[0].child;
      const wait = Date.now();
      while (child.exitCode == null && child.signalCode == null && Date.now() - wait < 3000) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.ok(child.exitCode != null || child.signalCode != null, 'retained npm child must be observed exited');
    } finally { await h.close(); }
  });
  await test('ensureDependencies invalid timeout does no work', async () => {
    const h = fixtureLaunch({ exists: false });
    try {
      for (const bad of [0, -1, NaN, Infinity]) assert.throws(() => h.api.ensureDependencies(h.tmp, { timeoutMs: bad }));
      assert.equal(h.calls.length, 0);
    } finally { await h.close(); }
  });
  await test('code-server ensure timeout signals the retained download', async () => {
    const clock = fakeClock(), h = fixtureEnsure({ hang: true, clock });
    try {
      const pending = h.api.ensure({});
      await nextTurn();
      assert.equal(h.calls.length, 1);
      assert.ok(h.calls[0].args.some(arg => String(arg).includes('code-server@4.135.0')));
      clock.advance(179999);
      assert.deepStrictEqual(h.calls[0].child.kills, []);
      clock.advance(1);
      assert.deepStrictEqual(h.calls[0].child.kills, ['SIGTERM']);
      clock.advance(2000);
      await assert.rejects(pending, /超时/);
      assert.equal(clock.timers.size, 0);
    } finally { h.close(); }
  });
  await test('code-server ensure abort prevents download', async () => {
    const h = fixtureEnsure({});
    try {
      const controller = new AbortController(); controller.abort();
      await assert.rejects(h.api.ensure({ signal: controller.signal }), /停止/);
      assert.equal(h.calls.length, 0);
    } finally { h.close(); }
  });
  await test('code-server ensure in-flight abort signals the retained npm child', async () => {
    const clock = fakeClock(), h = fixtureEnsure({ hang: true, clock });
    try {
      const controller = new AbortController();
      const pending = h.api.ensure({ signal: controller.signal });
      await nextTurn();
      assert.equal(h.calls.length, 1);
      controller.abort();
      assert.deepStrictEqual(h.calls[0].child.kills, ['SIGTERM']);
      clock.advance(2000);
      await assert.rejects(pending, /停止/);
    } finally { h.close(); }
  });
  await test('code-server runNpm synchronous throw is not swallowed', async () => {
    const h = fixtureEnsure({ throwSync: true });
    try { await assert.rejects(h.api.runNpm(['install', 'code-server@4.135.0'], h.tmp), /fixture spawn threw/); }
    finally { h.close(); }
  });
  assert.deepStrictEqual(failures, [], 'installer preparation contracts');
})().catch(e => { console.error(e); process.exitCode = 1; });
