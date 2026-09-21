'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const { EventEmitter } = require('events');
const { createTrace } = require('../src/tunnel/helperDiagnostics');
const secret = 'NEVER_LOG_RECEIPT_PATH_TOKEN_STDERR';
function load(name, response) {
  const file = path.join(__dirname, '../src/tunnel', name + '.js');
  const localRequire = createRequire(file), module = { exports: {} };
  const execFile = (shell, args, options, callback) => {
    assert.equal(options.timeout, 8000, 'do not increase the helper deadline');
    assert.equal(options.maxBuffer, name === 'receiptProtection' ? 512 * 1024 : 128 * 1024);
    const child = new EventEmitter(); child.stdin = new EventEmitter(); child.stdin.end = () => {};
    setImmediate(() => {
      child.emit('spawn');
      child.emit('exit', response.error?.code || 0, response.error?.signal || null);
      callback(response.error || null, response.stdout, response.stderr || '');
    });
    return child;
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, __dirname: path.dirname(file),
    process: { platform: 'win32', env: process.env }, Buffer,
    require: name => name === 'child_process' ? { execFile } : localRequire(name) }, { filename: file });
  return module.exports;
}
async function main() {
  const original = { debug: process.env.WEBAGENT_DEBUG_PROCESS, error: console.error };
  const logs = [], allLogs = [];
  const records = () => logs.filter(row => row[0] === 'tunnel helper').map(row => JSON.parse(row[1]));
  try {
    process.env.WEBAGENT_DEBUG_PROCESS = '1'; console.error = (...args) => { logs.push(args); allLogs.push(args); };
    const stdout = JSON.stringify(['QUFBQQ==']);
    const stderr = 'WA_TUNNEL_STARTED\r\nWA_TUNNEL_READY\r\n' + secret;
    assert.equal((await load('receiptProtection', { stdout, stderr }).protect({ private: secret })).payload, 'QUFBQQ==');
    assert(records().some(row => row.event === 'decoded'));
    const callback = records().find(row => row.event === 'callback');
    assert(callback.spawned && callback.exited && callback.helperStarted && callback.helperReady && !callback.helperCompleted);
    assert.equal(callback.stdoutBytes, Buffer.byteLength(stdout));
    logs.length = 0;
    const error = Object.assign(Error(secret), { code: 'ETIMEDOUT', signal: 'SIGTERM', killed: true, path: secret, cmd: secret });
    await assert.rejects(load('receiptProtection', { stdout: secret, stderr, error }).protect({ private: secret }), /Tunnel receipt protection unavailable/);
    const failed = records().find(row => row.event === 'callback');
    assert.equal(failed.errorCode, 'ETIMEDOUT'); assert.equal(failed.killed, true);
    for (const text of ['{', '{}']) {
      logs.length = 0;
      await assert.rejects(load('receiptProtection', { stdout: text }).protect({ private: secret }));
      assert(records().some(row => row.event === (text === '{' ? 'invalid-json' : 'invalid-shape')));
    }
    logs.length = 0;
    await assert.rejects(load('receiptProtection', { stdout: '[null]' }).protect({ private: secret }));
    assert(records().some(row => row.event === 'decoded' && row.rejected === 1));
    logs.length = 0;
    const unknown = await load('processIdentity', { stdout: '', stderr, error }).inspectProcesses([123]);
    assert.equal(unknown.get(123).status, 'unknown');
    assert(records().some(row => row.event === 'callback' && row.killed));
    for (const text of ['{', '{}', '[{"pid":123,"status":"unknown"}]']) {
      logs.length = 0;
      assert.equal((await load('processIdentity', { stdout: text }).inspectProcesses([123])).get(123).status, 'unknown');
      assert(records().some(row => row.event === (text === '{' ? 'invalid-json' : text === '{}' ? 'invalid-shape' : 'decoded')));
    }
    logs.length = 0;
    const bounded = createTrace('inspect', 1);
    for (let i = 0; i < 100; i++) bounded.trace('callback', { code: secret, message: secret, signal: secret }, secret, secret);
    assert.equal(records().length, 10);
    assert(!JSON.stringify(allLogs).includes(secret));
    for (const row of records()) {
      assert(row.elapsedMs >= 0); assert.equal(row.errorCode === null || row.errorCode === 'other', true);
      assert(!['stdout', 'stderr', 'path', 'cmd', 'payload', 'pid', 'identity'].some(key => key in row));
    }
    logs.length = 0; process.env.WEBAGENT_DEBUG_PROCESS = '0';
    assert.equal((await load('receiptProtection', { stdout, stderr }).protect({ private: secret })).version, 2);
    assert.equal((await load('processIdentity', { stdout: '[{"pid":123,"status":"absent"}]' }).inspectProcesses([123])).get(123).status, 'absent');
    assert.equal(logs.length, 0);
    process.env.WEBAGENT_DEBUG_PROCESS = '1'; console.error = () => { throw Error(secret); };
    assert.equal((await load('receiptProtection', { stdout }).protect({ private: secret })).version, 2);
    assert.equal((await load('processIdentity', { stdout: '[{"pid":123,"status":"unknown"}]' }).inspectProcesses([123])).get(123).status, 'unknown');
  } finally {
    console.error = original.error;
    if (original.debug === undefined) delete process.env.WEBAGENT_DEBUG_PROCESS; else process.env.WEBAGENT_DEBUG_PROCESS = original.debug;
  }
  console.log('Tunnel helper diagnostics: fixed metadata, bounded output, unchanged deadlines/results, default off and broken sink safety passed (simulated helpers)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
