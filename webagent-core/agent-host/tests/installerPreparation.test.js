'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { EventEmitter } = require('events');
const root = path.resolve(__dirname, '../../..');
const launchSrc = fs.readFileSync(path.join(root, 'installer/launch.js'), 'utf8');
const ensureSrc = fs.readFileSync(path.join(root, 'webagent-core/scripts/ensure-code-server.js'), 'utf8');

function bounded(promise, ms = 1500) {
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('fixture guard timeout')), ms); });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}
function fixtureLaunch({ exists = false, spawnError, spawnTimeout } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-prep-'));
  const cwd = path.join(tmp, 'webagent-core/agent-host'); fs.mkdirSync(cwd, { recursive: true });
  const calls = [];
  const fakeFs = {
    ...fs,
    existsSync(p) { if (String(p).endsWith('express')) return exists; return fs.existsSync(p); }
  };
  const context = {
    module: { exports: {} }, __dirname: path.join(root, 'installer'), console,
    process: { platform: 'win32', execPath: process.execPath, argv: ['node', 'launch.js', 'classic'], env: {} },
    require(name) {
      if (name === 'fs') return fakeFs;
      if (name === 'child_process') return {
        spawnSync(cmd, args, opts) {
          calls.push({ cmd, args, opts });
          if (spawnTimeout) return { error: Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }), status: null };
          if (spawnError) return { error: spawnError, status: null };
          return { status: 0 };
        },
        spawn: () => { throw new Error('spawn not used in this fixture'); }
      };
      if (name === './appWindow') return { appOrigin: () => 'http://127.0.0.1:3000', ready: async () => true, appWindow: async () => {} };
      return require(name);
    }
  };
  // Only expose ensureDependencies, not full main.
  const wrapped = launchSrc + '\nmodule.exports.ensureDependencies = ensureDependencies;';
  vm.runInNewContext(wrapped, context, { filename: path.join(root, 'installer/launch.js') });
  return { api: context.module.exports, tmp, cwd, calls, close() { fs.rmSync(tmp, { recursive: true, force: true }); } };
}
function fixtureEnsure({ timeout = false, throwSync = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-ensure-'));
  const calls = [];
  const fakeFs = {
    ...fs,
    existsSync(p) { if (String(p).includes('code-server') && String(p).endsWith('entry.js')) return false; if (String(p).endsWith('1ds-core-js')) return true; return fs.existsSync(p); }
  };
  const context = {
    module: { exports: {} }, __dirname: path.join(root, 'webagent-core/scripts'), console,
    process: { platform: process.platform, versions: { node: process.versions.node } }
  };
  vm.runInNewContext(ensureSrc, {
    ...context,
    path,
    require(name) {
      if (name === 'fs') return fakeFs;
      if (name === 'child_process') return {
        spawnSync(cmd, args, opts) {
          calls.push({ cmd, args, opts });
          if (throwSync) throw new Error('fixture spawnSync threw');
          if (timeout) return { error: Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }), status: null };
          return { status: 0 };
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
    try { h.api.ensureDependencies(h.tmp); assert.equal(h.calls.length, 0); }
    finally { h.close(); }
  });
  await test('ensureDependencies timeout is bounded and reported', async () => {
    const h = fixtureLaunch({ exists: false, spawnTimeout: true });
    try {
      assert.throws(() => h.api.ensureDependencies(h.tmp, { timeoutMs: 10 }), /超时/);
      assert.equal(h.calls[0].opts.timeout, 10);
    } finally { h.close(); }
  });
  await test('ensureDependencies abort prevents npm work', async () => {
    const h = fixtureLaunch({ exists: false });
    try {
      const controller = new AbortController(); controller.abort();
      assert.throws(() => h.api.ensureDependencies(h.tmp, { signal: controller.signal }), /停止/);
      assert.equal(h.calls.length, 0);
    } finally { h.close(); }
  });
  await test('ensureDependencies invalid timeout does no work', async () => {
    const h = fixtureLaunch({ exists: false });
    try {
      for (const bad of [0, -1, NaN, Infinity]) assert.throws(() => h.api.ensureDependencies(h.tmp, { timeoutMs: bad }));
      assert.equal(h.calls.length, 0);
    } finally { h.close(); }
  });
  await test('code-server ensure timeout is bounded', async () => {
    const h = fixtureEnsure({ timeout: true });
    try { assert.throws(() => h.api.ensure({}), /超时/); assert.ok(h.calls[0].opts.timeout >= 120000); }
    finally { h.close(); }
  });
  await test('code-server ensure abort prevents download', async () => {
    const h = fixtureEnsure({});
    try {
      const controller = new AbortController(); controller.abort();
      assert.throws(() => h.api.ensure({ signal: controller.signal }), /停止/);
      assert.equal(h.calls.length, 0);
    } finally { h.close(); }
  });
  await test('code-server runNpm synchronous throw is not swallowed', async () => {
    const h = fixtureEnsure({ throwSync: true });
    try { assert.throws(() => h.api.runNpm(['install', 'code-server@4.135.0'], h.tmp), /fixture spawnSync threw/); }
    finally { h.close(); }
  });
  assert.deepStrictEqual(failures, [], 'installer preparation contracts');
})().catch(e => { console.error(e); process.exitCode = 1; });
