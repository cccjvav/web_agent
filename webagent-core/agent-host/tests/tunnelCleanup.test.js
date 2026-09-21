'use strict';
const assert = require('assert');
const { EventEmitter } = require('events');
const { PassThrough, Writable } = require('stream');
const { randomUUID } = require('crypto');
const { spawnSync } = require('child_process');
const path = require('path');
const { createController } = require('../src/tunnel/tunnelCleanup');
const id = randomUUID(), nonce = randomUUID();
const source = { entries: [{ id, envelope: { version: 2, protection: 'windows-dpapi-user', payload: 'AAAA' } }], fingerprint: 'a'.repeat(64), skipped: 0 };
function helper({ resultStatus = 'terminated', earlyClose = false, extraResult = false } = {}) {
  const proc = new EventEmitter(); proc.stdout = new PassThrough(); proc.stderr = new PassThrough();
  proc.actions = 0; proc.kills = 0; let buffered = '', messages = 0;
  const frame = (type, status) => JSON.stringify({ type, nonce, records: [{ id, provider: 'cloudflare', pid: 123, status }] }) + '\n';
  proc.stdin = new Writable({ write(chunk, _, callback) {
    buffered += chunk.toString();
    let end;
    while ((end = buffered.indexOf('\n')) >= 0) {
      const input = JSON.parse(buffered.slice(0, end)); buffered = buffered.slice(end + 1); messages++;
      if (messages === 1) setImmediate(() => { if (earlyClose) proc.emit('close', 1); else proc.stdout.write(frame('preview', 'candidate')); });
      else {
        assert.equal(input.action, 'confirm'); assert.equal(input.nonce, nonce); proc.actions++;
        setImmediate(() => {
          proc.stdout.write(frame('result', resultStatus));
          if (extraResult) proc.stdout.write(frame('result', resultStatus));
          proc.emit('close', 0);
        });
      }
    }
    callback();
  } });
  proc.kill = () => { proc.kills++; setImmediate(() => proc.emit('close', null)); return true; };
  return proc;
}
async function main() {
  const registry = { cleanupSource: async () => structuredClone(source) };
  let proc = helper();
  const control = createController({ platform: 'win32', launch: () => proc });
  const lease = await control.prepare(registry);
  assert.equal(proc.actions, 0, 'preview must not terminate anything');
  assert.throws(() => { lease.records[0].pid = 99; }, TypeError);
  await assert.rejects(control.prepare(registry));
  const result = await lease.confirm();
  assert.equal(result[0].status, 'terminated'); assert.equal(proc.actions, 1);
  await assert.rejects(lease.confirm()); assert.equal(proc.actions, 1, 'confirmation cannot replay');
  await lease.cancel();

  proc = helper();
  const cancelled = await createController({ platform: 'win32', launch: () => proc }).prepare(registry);
  await cancelled.cancel(); assert.equal(proc.actions, 0); assert.equal(proc.kills, 1);
  proc = helper(); let reads = 0;
  const stale = await createController({ platform: 'win32', launch: () => proc }).prepare({ cleanupSource: async () => ({ ...source, fingerprint: ++reads === 1 ? source.fingerprint : 'b'.repeat(64) }) });
  await assert.rejects(stale.confirm(), error => error.code === 'E_CLEANUP_NOT_STARTED');
  await stale.closed; assert.equal(proc.actions, 0);

  proc = helper({ extraResult: true });
  const bad = await createController({ platform: 'win32', launch: () => proc }).prepare(registry);
  await assert.rejects(bad.confirm(), error => error.code === 'E_CLEANUP_UNKNOWN');
  await bad.closed; assert.equal(proc.actions, 1);
  proc = helper({ earlyClose: true });
  await assert.rejects(createController({ platform: 'win32', launch: () => proc }).prepare(registry), error => error.code === 'E_CLEANUP_NOT_STARTED');

  const originalSet = global.setTimeout, originalClear = global.clearTimeout, timers = new Map();
  try {
    global.setTimeout = (fn, ms) => { const token = {}; timers.set(token, { fn, ms }); return token; };
    global.clearTimeout = token => timers.delete(token);
    proc = helper();
    const expired = await createController({ platform: 'win32', launch: () => proc }).prepare(registry);
    const expiry = [...timers.values()].find(timer => timer.ms === 60000); assert(expiry);
    expiry.fn(); await expired.closed;
    await assert.rejects(expired.confirm()); assert.equal(proc.actions, 0);
  } finally { global.setTimeout = originalSet; global.clearTimeout = originalClear; }
  await assert.rejects(createController({ platform: 'linux', launch: () => { throw Error('must not launch'); } }).prepare(registry));
  const cli = spawnSync(process.execPath, [path.join(__dirname, '../scripts/tunnel-cleanup.js')], { input: 'RECYCLE\n', encoding: 'utf8', timeout: 10000 });
  assert.equal(cli.status, 2, 'piped confirmation must never enable cleanup');
  console.log('Cleanup controller: explicit single-use confirmation, held preview lifetime, stale receipts, expiry, cancellation and unknown outcomes passed (simulated helper)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
