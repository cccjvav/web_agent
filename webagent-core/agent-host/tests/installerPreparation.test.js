'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { EventEmitter } = require('events');
const { createRequire } = require('module');
const childProcess = require('child_process');
const root = path.resolve(__dirname, '../../..');
const helperFile = path.join(root, 'installer/preparation.js');
const helperSource = fs.readFileSync(helperFile, 'utf8');
const launchSrc = fs.readFileSync(path.join(root, 'installer/launch.js'), 'utf8');
const ensureSrc = fs.readFileSync(path.join(root, 'webagent-core/scripts/ensure-code-server.js'), 'utf8');
function bounded(promise, ms = 10000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('fixture guard timeout')), ms); })]).finally(() => clearTimeout(timer));
}
function fixture(kind, { exists = false, timeout = false, throwSync = false, preparation } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-prep-'));
  const calls = [], module = { exports: {} };
  const filename = path.join(root, kind === 'launch' ? 'installer/launch.js' : 'webagent-core/scripts/ensure-code-server.js');
  const load = createRequire(filename);
  vm.runInNewContext(kind === 'launch' ? launchSrc : ensureSrc, {
    module, __dirname: kind === 'launch' ? path.join(tmp, 'installer') : path.join(tmp, 'webagent-core/scripts'), process, console,
    require(name) {
      if (name.endsWith('/preparation')) return { runPreparation(cmd, args, opts) {
        calls.push({ cmd, args, opts });
        if (throwSync) throw new Error('fixture spawn threw');
        if (timeout) return Promise.reject(Object.assign(new Error('准备超时'), { code: 'ETIMEDOUT' }));
        return preparation ? preparation(cmd, args, opts) : Promise.resolve();
      } };
      if (name === 'fs') return { ...fs, existsSync(p) {
        if (String(p).endsWith('express')) return exists;
        if (String(p).endsWith('entry.js')) return false;
        return fs.existsSync(p);
      } };
      return load(name);
    }
  });
  return { api: module.exports, tmp, calls, close() { fs.rmSync(tmp, { recursive: true, force: true }); } };
}
function helper(spawn, clock) {
  const module = { exports: {} };
  vm.runInNewContext(helperSource, { module, setTimeout, clearTimeout,
    require: name => name === 'child_process' ? { spawn } : name === 'perf_hooks' && clock ? { performance: clock } : require(name) });
  return module.exports.runPreparation;
}
function fakeChild() {
  const child = new EventEmitter();
  Object.assign(child, { pid: 123, exitCode: null, signalCode: null, kills: [], unrefs: 0,
    unref() { this.unrefs++; }, kill(signal) { this.kills.push(signal); return true; } });
  return child;
}
(async () => {
  const failures = [];
  const test = async (name, fn) => {
    try { await bounded(Promise.resolve().then(fn)); console.log('PASS ' + name); }
    catch (e) { failures.push(name); console.error('FAIL ' + name + '\n' + e.stack); }
  };
  await test('ensureDependencies respects existing installation', async () => {
    const h = fixture('launch', { exists: true });
    try { await h.api.ensureDependencies(h.tmp); assert.equal(h.calls.length, 0); } finally { h.close(); }
  });
  await test('ensureDependencies passes original deadline and reports timeout', async () => {
    const h = fixture('launch', { timeout: true });
    try { await assert.rejects(h.api.ensureDependencies(h.tmp, { timeoutMs: 10 }), { code: 'ETIMEDOUT' }); assert.equal(h.calls[0].opts.timeoutMs, 10); } finally { h.close(); }
  });
  await test('ensureDependencies pre-abort and invalid timeout do no work', async () => {
    const h = fixture('launch');
    try {
      const c = new AbortController(); c.abort();
      await assert.rejects(h.api.ensureDependencies(h.tmp, { signal: c.signal }), { code: 'ABORT_ERR' });
      for (const timeoutMs of [0, -1, NaN, Infinity]) await assert.rejects(h.api.ensureDependencies(h.tmp, { timeoutMs }));
      assert.equal(h.calls.length, 0);
    } finally { h.close(); }
  });
  await test('ensure download preserves 180s deadline and pre-abort prevents download', async () => {
    const h = fixture('ensure', { timeout: true });
    try {
      await assert.rejects(h.api.ensure(), { code: 'ETIMEDOUT' }); assert.equal(h.calls[0].opts.timeoutMs, 180000);
      const c = new AbortController(); c.abort();
      await assert.rejects(h.api.ensure({ signal: c.signal }), { code: 'ABORT_ERR' }); assert.equal(h.calls.length, 1);
    } finally { h.close(); }
  });
  await test('runNpm synchronous spawn throw still propagates', async () => {
    const h = fixture('ensure', { throwSync: true });
    try { await assert.rejects(h.api.runNpm(['fixture'], h.tmp), /fixture spawn threw/); } finally { h.close(); }
  });
  await test('real preparation receives in-flight abort before starting the next stage', async () => {
    const c = new AbortController(); let child, exited = false, nextStage = false;
    const run = helper((_cmd, _args, opts) => {
      child = childProcess.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { ...opts, shell: false });
      child.once('exit', () => { exited = true; });
      child.once('spawn', () => setImmediate(() => c.abort()));
      return child;
    });
    const h = fixture('ensure', { preparation: run });
    try {
      await assert.rejects(h.api.ensure({ signal: c.signal }).then(() => { nextStage = true; }), { code: 'ABORT_ERR' });
      assert.ok(exited); assert.equal(nextStage, false); assert.equal(h.calls.length, 1);
    } finally { if (child && !exited) child.kill('SIGKILL'); h.close(); }
  });
  await test('real deadline observes exit; Linux confirms TERM was actually ignored', async () => {
    let child, exited = false;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-term-'));
    const ready = path.join(tmp, 'ready'), ignored = path.join(tmp, 'ignored');
    const code = `const fs=require('fs'); process.on('SIGTERM',()=>fs.writeFileSync(${JSON.stringify(ignored)},'yes')); fs.writeFileSync(${JSON.stringify(ready)},'yes'); setInterval(()=>{},1000);`;
    const waitFile = async file => {
      const end = Date.now() + 3500;
      while (!fs.existsSync(file)) { if (Date.now() > end) throw new Error('fixture readiness missing'); await new Promise(resolve => setTimeout(resolve, 10)); }
    };
    const run = helper((_cmd, _args, opts) => {
      child = childProcess.spawn(process.execPath, ['-e', code], { ...opts, shell: false });
      child.once('exit', () => { exited = true; }); return child;
    });
    let outcome;
    try {
      outcome = run('fixture', [], { timeoutMs: 5000 }).then(() => null, e => e);
      await waitFile(ready);
      if (process.platform !== 'win32') { child.kill('SIGTERM'); await waitFile(ignored); assert.equal(exited, false); }
      assert.equal((await outcome).code, 'ETIMEDOUT');
      assert.ok(exited, 'must observe exit, not merely signal delivery'); assert.equal(child.signalCode, 'SIGKILL');
    } finally {
      if (child && !exited) { const closed = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await bounded(closed); }
      if (outcome) await outcome;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
  await test('helper pre-abort and invalid deadlines spawn nothing', async () => {
    let calls = 0; const run = helper(() => { calls++; }); const c = new AbortController(); c.abort();
    await assert.rejects(run('fixture', [], { timeoutMs: 10, signal: c.signal }), { code: 'ABORT_ERR' });
    for (const timeoutMs of [0, -1, Infinity, NaN]) await assert.rejects(run('fixture', [], { timeoutMs }));
    assert.equal(calls, 0);
  });
  await test('helper handles success, nonzero, signaled exit and spawn errors', async () => {
    for (const [code, signal] of [[0, null], [2, null], [null, 'SIGTERM']]) {
      const run = helper(() => { const c = fakeChild(); queueMicrotask(() => c.emit('exit', code, signal)); return c; });
      const p = run('fixture', [], { timeoutMs: 1000 });
      if (code === 0) await p; else await assert.rejects(p, /失败/);
    }
    await assert.rejects(helper(() => { throw new Error('sync spawn'); })('fixture', [], { timeoutMs: 1000 }), /sync spawn/);
    await assert.rejects(helper(() => { const c = fakeChild(); c.pid = undefined; queueMicrotask(() => c.emit('error', new Error('async spawn'))); return c; })('fixture', [], { timeoutMs: 1000 }), /async spawn/);
  });
  await test('unknown exit is bounded, non-success, unrefed and not retried', async () => {
    const child = fakeChild(), c = new AbortController(); let calls = 0;
    const run = helper(() => { calls++; return child; });
    const p = run('fixture', [], { timeoutMs: 5000, signal: c.signal });
    c.abort(); c.abort(); child.emit('error', new Error('kill failed'));
    await assert.rejects(p, e => e.code === 'ABORT_ERR' && e.cleanupUnconfirmed === true);
    assert.deepStrictEqual(child.kills, ['SIGKILL']); assert.equal(calls, 1); assert.equal(child.unrefs, 1);
    child.emit('exit', 0); child.emit('error', new Error('late')); // no revival or unhandled error
  });
  await test('late exit zero cannot beat monotonic deadline before timer dispatch', async () => {
    let now = 0; const child = fakeChild(), c = new AbortController();
    const run = helper(() => child, { now: () => now });
    const p = run('fixture', [], { timeoutMs: 1000, signal: c.signal });
    now = 1001; child.emit('exit', 0, null);
    await assert.rejects(p, { code: 'ETIMEDOUT' });
    assert.equal(require('events').getEventListeners(c.signal, 'abort').length, 0);
    assert.deepStrictEqual(child.kills, [], 'an observed exit must not be killed again');
  });
  await test('abort during spawn registration cannot be lost', async () => {
    const c = new AbortController(), child = fakeChild();
    child.kill = signal => { queueMicrotask(() => child.emit('exit', null, signal)); };
    await assert.rejects(helper(() => { c.abort(); return child; })('fixture', [], { timeoutMs: 1000, signal: c.signal }), { code: 'ABORT_ERR' });
  });
  for (const event of ['SIGINT', 'SIGTERM']) {
    await test('outer launcher ' + event + ' during preparation never starts a mode', async () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-launch-stop-'));
      const proc = new EventEmitter();
      Object.assign(proc, { env: {}, argv: ['node', 'launch', 'classic'], execPath: process.execPath, platform: process.platform, cwd: () => tmp });
      const module = { exports: {} }; let spawns = 0, preparationSignal;
      const load = createRequire(path.join(root, 'installer/launch.js'));
      vm.runInNewContext(launchSrc + '\nmodule.exports.main = main;', { module, __dirname: path.join(tmp, 'installer'), process: proc, console, AbortController,
        require(name) {
          if (name === 'child_process') return { spawn() { spawns++; throw new Error('mode must not start'); } };
          if (name === './preparation') return { runPreparation(_cmd, _args, { signal }) {
            preparationSignal = signal;
            return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { code: 'ABORT_ERR' })), { once: true }));
          } };
          return load(name);
        }
      });
      try {
        const running = module.exports.main(); assert.ok(preparationSignal); proc.emit(event);
        await assert.rejects(running, { code: 'ABORT_ERR' }); assert.equal(spawns, 0);
        assert.equal(proc.listenerCount('SIGINT'), 0); assert.equal(proc.listenerCount('SIGTERM'), 0);
      } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    });
  }
  assert.deepStrictEqual(failures, [], 'installer preparation contracts');
})().catch(e => { console.error(e); process.exitCode = 1; });
