'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork, spawn } = require('child_process');
const { once } = require('events');
const { createRegistry } = require('../src/tunnel/tunnelRegistry');
const { inspectProcesses } = require('../src/tunnel/processIdentity');
const protection = require('../src/tunnel/receiptProtection');
const { prepareCleanup } = require('../src/tunnel/tunnelCleanup');
async function main() {
  if (process.platform !== 'win32') { console.log('Native tunnel cleanup: Windows-only gate; not executed on this platform'); return; }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-native-cleanup-'));
  const program = path.join(root, 'cloudflared.exe');
  fs.copyFileSync(process.execPath, program); // Disposable Node fixture, NOT a downloaded tunnel binary.
  const owners = []; let unrelated, lease;
  async function startOwner(label) {
    const base = path.join(root, label); fs.mkdirSync(base);
    const proc = fork(path.join(__dirname, 'tunnelOwnerFixture.js'), [base, program], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    const item = { base, proc }; owners.push(item);
    let timeout;
    const [ready] = await Promise.race([once(proc, 'message'), once(proc, 'exit').then(() => { throw Error('Owner failed before receipt'); }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Receipt fixture deadline')), 20000); })]).finally(() => clearTimeout(timeout));
    assert.equal(ready.status, 'recorded'); item.pid = ready.pid;
    item.registry = createRegistry({ baseDirectory: base });
    const directory = path.join(base, '.webagent', 'tunnel-processes-v1');
    item.file = path.join(directory, fs.readdirSync(directory)[0]);
    item.carrier = JSON.parse(fs.readFileSync(item.file));
    item.record = (await protection.unprotect([item.carrier]))[0];
    return item;
  }
  async function stopped(pid) {
    const end = Date.now() + 12000;
    while ((await inspectProcesses([pid])).get(pid).status !== 'absent') {
      if (Date.now() > end) throw Error('Fixture has not exited');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  async function checkSkipped(item, record, expected) {
    fs.writeFileSync(item.file, JSON.stringify(await protection.protect(record)));
    lease = await prepareCleanup(item.registry);
    assert.equal(lease.records[0].status, expected);
    assert.equal((await lease.confirm())[0].status, expected);
    await lease.cancel(); lease = null;
    assert.equal((await inspectProcesses([item.pid])).get(item.pid).status, 'alive');
    fs.writeFileSync(item.file, JSON.stringify(item.carrier));
  }
  try {
    unrelated = spawn(program, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' }); await once(unrelated, 'spawn');
    const orphan = await startOwner('registered');
    await checkSkipped(orphan, orphan.record, 'active-owner');
    // DPAPI alone cannot authorize cleanup: changing the claimed parent still fails native parentage.
    await checkSkipped(orphan, { ...orphan.record, owner: { ...orphan.record.owner, pid: 2147483647 } }, 'parent-mismatch');
    await checkSkipped(orphan, { ...orphan.record, target: { ...orphan.record.target, start: '1' } }, 'identity-changed');
    await checkSkipped(orphan, { ...orphan.record, target: { ...orphan.record.target, executable: path.join(root, 'wrong', 'cloudflared.exe') } }, 'identity-changed');
    const died = once(orphan.proc, 'exit'); orphan.proc.kill('SIGKILL'); await died;
    lease = await prepareCleanup(orphan.registry);
    assert.equal(lease.records[0].status, 'candidate'); await lease.cancel(); lease = null;
    assert.equal((await inspectProcesses([orphan.pid])).get(orphan.pid).status, 'alive', 'closing a held preview must not terminate the target');

    lease = await prepareCleanup(orphan.registry);
    fs.writeFileSync(orphan.file, JSON.stringify(await protection.protect({ ...orphan.record, target: { ...orphan.record.target, start: '2' } })));
    await assert.rejects(lease.confirm(), error => error.code === 'E_CLEANUP_NOT_STARTED'); await lease.closed; lease = null;
    assert.equal((await inspectProcesses([orphan.pid])).get(orphan.pid).status, 'alive');
    fs.writeFileSync(orphan.file, JSON.stringify(orphan.carrier));
    lease = await prepareCleanup(orphan.registry);
    assert.equal((await lease.confirm())[0].status, 'terminated');
    await assert.rejects(lease.confirm()); await lease.cancel(); lease = null;
    await stopped(orphan.pid);
    assert.equal(unrelated.exitCode, null); assert.equal(unrelated.killed, false, 'same-name unrelated live process must survive');

    const ended = await startOwner('ended-during-preview');
    const endedOwner = once(ended.proc, 'exit'); ended.proc.kill('SIGKILL'); await endedOwner;
    lease = await prepareCleanup(ended.registry); assert.equal(lease.records[0].status, 'candidate');
    fs.writeFileSync(path.join(ended.base, 'stop-child'), 'stop'); await stopped(ended.pid);
    assert.equal((await lease.confirm())[0].status, 'exited', 'held handle must not reopen a PID after the target exits');
    await lease.cancel(); lease = null;
    assert.equal(unrelated.exitCode, null);
    console.log('Windows native cleanup: live owner, parent/creation/image mismatch, stale receipt, cancel, same-name isolation, held-target exit and confirmed observed termination passed');
  } finally {
    if (lease) await lease.cancel();
    let safeToDelete = true;
    for (const item of owners) {
      fs.writeFileSync(path.join(item.base, 'stop-child'), 'stop');
      if (item.proc.exitCode === null && item.proc.signalCode === null) { const closed = once(item.proc, 'exit'); item.proc.kill(); await closed; }
      if (item.pid) await stopped(item.pid).catch(() => { safeToDelete = false; });
    }
    if (unrelated && unrelated.exitCode === null && unrelated.signalCode === null) { const closed = once(unrelated, 'exit'); unrelated.kill(); await closed; }
    if (safeToDelete) fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
