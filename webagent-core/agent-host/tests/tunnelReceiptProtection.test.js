'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { EventEmitter } = require('events');
const authority = require('../src/tunnel/receiptProtection');
const { createRegistry } = require('../src/tunnel/tunnelRegistry');

async function main() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-integrity-'));
  const instanceId = randomUUID(), executable = fs.realpathSync(process.execPath);
  const owner = { pid: 101, start: 'owner-start', executable };
  const target = { pid: 102, start: 'child-start', executable: process.platform === 'win32' ? executable.toLowerCase() : executable };
  const live = identity => ({ status: 'alive', identity });
  const inspect = async () => new Map([[101, { status: 'absent' }], [102, live(target)]]);
  const sealed = new Map();
  // Deterministic trust-boundary fixture, not a simulation of DPAPI cryptographic strength.
  const protection = { supported: true,
    async protect(record) {
      const payload = Buffer.from(randomUUID()).toString('base64');
      sealed.set(payload, structuredClone(record));
      return { version: 2, protection: 'windows-dpapi-user', payload };
    },
    async unprotect(envelopes) { return envelopes.map(envelope => structuredClone(sealed.get(envelope.payload) || null)); }
  };
  try {
    assert(authority.validPayload('YWJj'));
    for (const bad of ['', 'not base64!', 'AAAA\n', 'A'.repeat(16388)]) assert(!authority.validPayload(bad));
    const writer = createRegistry({ baseDirectory: base, instanceId, ownerPid: 101, protection,
      inspect: async () => new Map([[101, live(owner)], [102, live(target)]]) });
    const proc = new EventEmitter(); Object.assign(proc, { pid: 102, exitCode: null, signalCode: null });
    assert.equal((await writer.observe(proc, 'ngrok', process.execPath)).status, 'recorded');
    const root = path.join(base, '.webagent', 'tunnel-processes-v1'), filename = fs.readdirSync(root)[0];
    const carrier = JSON.parse(fs.readFileSync(path.join(root, filename)));
    assert.equal(carrier.version, 2); assert(!JSON.stringify(carrier).includes(executable));
    const reader = createRegistry({ baseDirectory: base, instanceId, inspect, protection });
    const trusted = await reader.snapshot();
    assert.equal(trusted.records[0].integrity, 'os-user-protected');
    assert.equal(trusted.records[0].status, 'orphan-candidate');
    assert.equal(trusted.records[0].canCleanup, false, 'even a protected receipt never enables cleanup in this phase');

    // Renaming an intact carrier cannot rebind the protected payload's receipt ID.
    fs.writeFileSync(path.join(root, randomUUID() + '.json'), JSON.stringify(carrier), { mode: 0o600 });
    assert.equal((await reader.snapshot()).invalidRecords, 1);
    const legacyId = randomUUID();
    const legacy = { version: 1, id: legacyId, platform: process.platform, provider: 'ngrok', instanceId, owner, target,
      integrity: 'os-user-protected', canCleanup: true };
    fs.writeFileSync(path.join(root, legacyId + '.json'), JSON.stringify(legacy), { mode: 0o600 });
    const report = await reader.snapshot();
    const old = report.records.find(record => record.id === legacyId);
    assert.equal(old.integrity, 'unverified'); assert.equal(old.canCleanup, false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, legacyId + '.json'))).version, 1, 'inspection cannot upgrade legacy evidence');
    const corrupt = { ...carrier, payload: 'AAAA' };
    fs.writeFileSync(path.join(root, filename), JSON.stringify(corrupt));
    const damaged = await reader.snapshot();
    assert.equal(damaged.invalidRecords, 2); assert.equal(damaged.records.length, 1);
    const unavailable = createRegistry({ baseDirectory: base, inspect, protection: { ...protection, unprotect: async () => { throw Error('private detail'); } } });
    const unavailableReport = await unavailable.snapshot();
    assert.equal(unavailableReport.complete, false); assert.equal(unavailableReport.error, 'registry-unavailable');
    assert(!JSON.stringify(unavailableReport).includes('private detail'));

    // Failed sealing must not silently produce an unauthenticated Windows-style receipt.
    const failedBase = path.join(base, 'failed'); fs.mkdirSync(failedBase);
    const failed = createRegistry({ baseDirectory: failedBase, ownerPid: 101, inspect: async () => new Map([[101, live(owner)], [102, live(target)]]),
      protection: { ...protection, protect: async () => { throw Error('cannot protect'); } } });
    assert.equal((await failed.observe(proc, 'ngrok', process.execPath)).status, 'unavailable');
    assert.deepEqual(fs.readdirSync(path.join(failedBase, '.webagent', 'tunnel-processes-v1')), []);
    let finish;
    const lateBase = path.join(base, 'late'); fs.mkdirSync(lateBase);
    const late = createRegistry({ baseDirectory: lateBase, ownerPid: 101, inspect: async () => new Map([[101, live(owner)], [102, live(target)]]),
      protection: { ...protection, protect: record => new Promise(resolve => { finish = () => protection.protect(record).then(resolve); }) } });
    const lateProc = new EventEmitter(); Object.assign(lateProc, { pid: 102, exitCode: null, signalCode: null });
    const observing = late.observe(lateProc, 'ngrok', process.execPath);
    const deadline = Date.now() + 2000;
    while (!finish) { if (Date.now() > deadline) throw Error('Sealing fixture deadline'); await new Promise(resolve => setImmediate(resolve)); }
    lateProc.emit('exit', 0); finish();
    assert.equal((await observing).status, 'unavailable');
    assert.deepEqual(fs.readdirSync(path.join(lateBase, '.webagent', 'tunnel-processes-v1')), []);

    if (authority.supported) {
      const plain = { marker: 'fixture-secret-中文🙂', id: randomUUID() };
      const protectedRecord = await authority.protect(plain);
      assert(!JSON.stringify(protectedRecord).includes(plain.marker));
      assert.deepEqual((await authority.unprotect([protectedRecord]))[0], plain, 'independent helper processes can read same-user receipts');
      const bytes = Buffer.from(protectedRecord.payload, 'base64'); bytes[Math.floor(bytes.length / 2)] ^= 1;
      assert.deepEqual(await authority.unprotect([{ ...protectedRecord, payload: bytes.toString('base64') }]), [null]);
      await assert.rejects(authority.protect({ text: 'x'.repeat(8193) }), /protection unavailable/);
      await assert.rejects(authority.unprotect(Array(33).fill(protectedRecord)), /protection unavailable/);
    } else {
      await assert.rejects(authority.protect({}), /protection unavailable/);
      assert.deepEqual(await authority.unprotect([carrier]), [null]);
    }
    console.log('Tunnel receipt integrity: sealed/legacy separation, tampering, filename binding, failure/late-exit guards and platform protection passed; cleanup remains disabled');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
