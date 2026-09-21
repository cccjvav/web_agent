'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, fork, spawnSync } = require('child_process');
const { once, EventEmitter } = require('events');
const { randomUUID } = require('crypto');
const { createRegistry, classify, validRecord } = require('../src/tunnel/tunnelRegistry');
const { inspectProcesses, sameIdentity } = require('../src/tunnel/processIdentity');

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-registry-'));
  const instanceId = randomUUID();
  const owner = { pid: 101, start: 'owner-birth', executable: process.execPath };
  const target = { pid: 102, start: 'target-birth', executable: process.execPath };
  const record = { version: 1, id: randomUUID(), platform: process.platform, provider: 'cloudflare', instanceId, owner, target };
  const live = identity => ({ status: 'alive', identity });
  const states = new Map([[101, live(owner)], [102, live(target)]]);
  assert(validRecord(record, record.id));
  assert.equal(classify(record, states, instanceId), 'active-current');
  assert.equal(classify(record, states, randomUUID()), 'active-other');
  states.set(101, { status: 'absent' });
  assert.equal(classify(record, states, instanceId), 'orphan-candidate');
  states.set(101, { status: 'unknown' });
  assert.equal(classify(record, states, instanceId), 'unknown');
  states.set(101, live({ ...owner, start: 'reused-owner-pid' }));
  assert.equal(classify(record, states, instanceId), 'unknown');
  states.set(102, live({ ...target, start: 'reused-target-pid' }));
  assert.equal(classify(record, states, instanceId), 'identity-changed');
  states.set(102, live({ ...target, executable: path.resolve(tmp, 'other-program') }));
  assert.equal(classify(record, states, instanceId), 'identity-changed');
  states.set(102, { status: 'absent' });
  assert.equal(classify(record, states, instanceId), 'exited');
  assert(!validRecord({ ...record, target: { ...target, pid: -1 } }, record.id));
  let realChild, ownerProcess, stopOrphan, completed = false;
  try {
    let inspected = 0;
    const registry = createRegistry({ baseDirectory: tmp, instanceId, ownerPid: 101, inspect: async pids => {
      inspected++; assert(pids.length <= 64); return new Map([[101, live(owner)], [102, live(target)]]);
    } });
    const empty = await registry.snapshot();
    assert.deepEqual(empty.records, []); assert.equal(empty.cleanupAvailable, false);
    assert(!fs.existsSync(path.join(tmp, '.webagent')), 'read-only inspection must not create its directory');
    const proc = new EventEmitter(); Object.assign(proc, { pid: 102, exitCode: null, signalCode: null });
    proc.spawnargs = ['fixture', '--token', 'must-not-save-token'];
    const canonical = fs.realpathSync(process.execPath);
    target.executable = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
    assert.equal((await registry.observe(proc, 'cloudflare', process.execPath)).status, 'recorded');
    const root = path.join(tmp, '.webagent', 'tunnel-processes-v1');
    const filename = fs.readdirSync(root)[0];
    const persisted = JSON.parse(fs.readFileSync(path.join(root, filename)));
    const receipt = persisted.version === 2 ? (await require('../src/tunnel/receiptProtection').unprotect([persisted]))[0] : persisted;
    assert(!JSON.stringify(receipt).includes('must-not-save-token'));
    assert.deepEqual(Object.keys(receipt).sort(), ['id', 'instanceId', 'owner', 'platform', 'provider', 'target', 'version']);
    assert.equal((await registry.snapshot()).records[0].status, 'active-current');
    const a = registry.snapshot(), b = registry.snapshot(); assert.strictEqual(a, b); await a;
    const other = createRegistry({ baseDirectory: tmp, instanceId: randomUUID(), inspect: async () => states });
    states.set(101, live(owner)); states.set(102, live(target));
    assert.equal((await other.snapshot()).records[0].status, 'active-other');
    states.set(101, { status: 'absent' });
    const orphan = await other.snapshot();
    assert.equal(orphan.records[0].status, 'orphan-candidate'); assert.equal(orphan.records[0].canCleanup, false);
    assert(!JSON.stringify(orphan).includes(target.executable), 'public report cannot contain executable paths');
    assert(!JSON.stringify(orphan).includes('owner-birth'));
    fs.writeFileSync(path.join(root, randomUUID() + '.json'), '{bad', { mode: 0o600 });
    fs.writeFileSync(path.join(root, randomUUID() + '.json'), 'x'.repeat(13 * 1024), { mode: 0o600 });
    assert.equal((await registry.snapshot()).invalidRecords, 2);
    if (process.platform !== 'win32') {
      fs.symlinkSync(path.join(root, filename), path.join(root, randomUUID() + '.json'));
      assert.equal((await registry.snapshot()).invalidRecords, 3);
    }
    for (let i = 0; i < 33; i++) fs.writeFileSync(path.join(root, randomUUID() + '.json'), '{}', { mode: 0o600 });
    assert.equal((await registry.snapshot()).complete, false);
    assert.equal((await registry.observe(proc, 'ngrok', process.execPath)).status, 'capacity');
    assert.equal((await registry.observe(proc, 'ngrok', 'wrapper.cmd')).status, 'unsupported-wrapper');
    proc.emit('exit', 0); await new Promise(resolve => setImmediate(resolve));
    assert(inspected > 0);

    const unavailable = createRegistry({ baseDirectory: tmp, inspect: async () => { throw Error('private path/token must not escape'); } });
    const unavailableReport = await unavailable.snapshot();
    assert.equal(unavailableReport.complete, false);
    assert(!JSON.stringify(unavailableReport).includes('private path/token'));
    if (process.platform !== 'win32') {
      const linkedBase = path.join(tmp, 'linked'); fs.mkdirSync(linkedBase);
      fs.symlinkSync(path.join(tmp, '.webagent'), path.join(linkedBase, '.webagent'));
      assert.equal((await createRegistry({ baseDirectory: linkedBase }).snapshot()).error, 'registry-unavailable');
    }
    // Exit while asynchronous metadata capture is in flight cannot leave a late receipt.
    const lateBase = path.join(tmp, 'late'); fs.mkdirSync(lateBase);
    let complete;
    const late = createRegistry({ baseDirectory: lateBase, ownerPid: 101, inspect: () => new Promise(resolve => { complete = resolve; }) });
    const short = new EventEmitter(); Object.assign(short, { pid: 102, exitCode: null, signalCode: null });
    const observing = late.observe(short, 'cloudflare', process.execPath);
    short.emit('exit', 0); complete(new Map([[101, live(owner)], [102, live(target)]]));
    assert.equal((await observing).status, 'unavailable');
    assert(!fs.existsSync(path.join(lateBase, '.webagent')));

    // Actual OS identity reads and a real, unrelated live Node process: observation sends no signal.
    if (['linux', 'win32'].includes(process.platform)) {
      const realBase = path.join(tmp, 'real'); fs.mkdirSync(realBase);
      realChild = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
      await once(realChild, 'spawn');
      const self = (await inspectProcesses([process.pid])).get(process.pid);
      assert.equal(self.status, 'alive'); assert(sameIdentity(self.identity, self.identity));
      const actual = createRegistry({ baseDirectory: realBase, instanceId });
      assert.equal((await actual.observe(realChild, 'ngrok', process.execPath)).status, 'recorded');
      const before = realChild.exitCode;
      const report = await actual.snapshot();
      assert.equal(report.records[0].status, 'active-current');
      assert.equal(realChild.exitCode, before); assert.equal(realChild.killed, false);
      const orphanBase = path.join(tmp, 'orphan'); fs.mkdirSync(orphanBase);
      stopOrphan = path.join(orphanBase, 'stop-child');
      ownerProcess = fork(path.join(__dirname, 'tunnelOwnerFixture.js'), [orphanBase], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      let deadline;
      const [ready] = await Promise.race([
        once(ownerProcess, 'message'),
        once(ownerProcess, 'exit').then(() => { throw Error('Fixture owner exited before registration'); }),
        new Promise((_, reject) => { deadline = setTimeout(() => reject(Error('Fixture registration deadline')), 20000); })
      ]).finally(() => clearTimeout(deadline));
      assert.equal(ready.status, 'recorded');
      const orphanRegistry = createRegistry({ baseDirectory: orphanBase, instanceId });
      assert.equal((await orphanRegistry.snapshot()).records[0].status, 'active-other');
      const ownerClosed = once(ownerProcess, 'exit'); ownerProcess.kill('SIGKILL'); await ownerClosed;
      const leftovers = await orphanRegistry.snapshot();
      assert.equal(leftovers.records[0].status, 'orphan-candidate');
      assert.equal(leftovers.records[0].canCleanup, false);
      assert.equal((await inspectProcesses([ready.pid])).get(ready.pid).status, 'alive', 'detection must not kill the orphan');
      assert.equal(realChild.exitCode, null); assert.equal(realChild.killed, false, 'another live process is untouched');
      fs.writeFileSync(stopOrphan, 'stop');
      const end = Date.now() + 12000;
      while ((await inspectProcesses([ready.pid])).get(ready.pid).status !== 'absent') {
        if (Date.now() > end) throw Error('Fixture child did not exit itself');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const closed = once(realChild, 'exit'); realChild.kill(); await closed;
    }
    await assert.rejects(inspectProcesses([-1]), /Invalid/);
    const rejectedCli = spawnSync(process.execPath, [path.join(__dirname, '../scripts/tunnel-residue.js'), '--cleanup'], { encoding: 'utf8', timeout: 10000 });
    assert.equal(rejectedCli.status, 2); assert(rejectedCli.stderr.includes('no cleanup supported'));
    completed = true;
    console.log('Tunnel receipts: identities, active instances, PID reuse, unknowns, bounds, late exit and read-only live-process checks passed');
  } finally {
    if (stopOrphan) fs.writeFileSync(stopOrphan, 'stop');
    if (ownerProcess && ownerProcess.exitCode === null && ownerProcess.signalCode === null) { const closed = once(ownerProcess, 'exit'); ownerProcess.kill(); await closed; }
    if (realChild && realChild.exitCode === null && realChild.signalCode === null) { const closed = once(realChild, 'exit'); realChild.kill(); await closed; }
    if (!stopOrphan || completed) fs.rmSync(tmp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
