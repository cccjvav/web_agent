'use strict';
// Phase one: private launch receipts and READ-ONLY assessment, never cleanup authority.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { config } = require('../config');
const receiptProtection = require('./receiptProtection');
const { validPid, sameIdentity, inspectProcesses } = require('./processIdentity');
const MAX_RECORDS = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PROVIDERS = new Set(['cloudflare', 'cloudflare-named', 'ngrok']);
function validIdentity(value) {
  return value && validPid(value.pid) && typeof value.start === 'string' && value.start.length > 0 && value.start.length <= 128
    && typeof value.executable === 'string' && value.executable.length <= 4096 && path.isAbsolute(value.executable);
}
function validRecord(record, id) {
  return record && record.version === 1 && record.id === id && UUID.test(id) && record.platform === process.platform
    && PROVIDERS.has(record.provider) && UUID.test(record.instanceId) && validIdentity(record.owner) && validIdentity(record.target)
    && record.owner.pid !== record.target.pid;
}
function classify(record, processes, instanceId) {
  const target = processes.get(record.target.pid), owner = processes.get(record.owner.pid);
  if (target?.status === 'absent') return 'exited';
  if (target?.status !== 'alive') return 'unknown';
  if (!sameIdentity(record.target, target.identity)) return 'identity-changed';
  if (owner?.status === 'absent') return 'orphan-candidate';
  if (owner?.status !== 'alive' || !sameIdentity(record.owner, owner.identity)) return 'unknown';
  return record.instanceId === instanceId ? 'active-current' : 'active-other';
}
function createRegistry({ baseDirectory = os.homedir(), inspect = inspectProcesses, instanceId = config.hostInstanceId, ownerPid = process.pid, protection = receiptProtection } = {}) {
  let pendingScan = null;
  async function directory(create = false) {
    let current = await fsp.realpath(baseDirectory);
    for (const segment of ['.webagent', 'tunnel-processes-v1']) {
      current = path.join(current, segment);
      if (create) await fsp.mkdir(current, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      const stat = await fsp.lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.uid !== process.getuid() || (stat.mode & 0o022)))) throw Error('Unsafe registry directory');
    }
    return current;
  }
  async function readRecords() {
    const records = [], sealed = [], protectedIds = new Set(); let invalid = 0, complete = true;
    let root;
    try { root = await directory(); }
    catch (error) { if (error.code === 'ENOENT') return { records, invalid, complete, protectedIds, sealed }; throw error; }
    const entries = await fsp.opendir(root);
    let count = 0;
    for await (const entry of entries) {
      if (++count > MAX_RECORDS) { complete = false; break; }
      const id = entry.name.slice(0, -5);
      if (!entry.name.endsWith('.json') || !UUID.test(id) || !entry.isFile()) { invalid++; continue; }
      let handle;
      try {
        const file = path.join(root, entry.name), before = await fsp.lstat(file);
        handle = await fsp.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        const stat = await handle.stat();
        if (!stat.isFile() || before.isSymbolicLink() || stat.ino !== before.ino || stat.dev !== before.dev || stat.nlink !== 1 || stat.size > 12 * 1024
          || (process.platform !== 'win32' && (stat.uid !== process.getuid() || (stat.mode & 0o077)))) throw Error('Unsafe registry record');
        const buffer = Buffer.alloc(12 * 1024 + 1);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        if (bytesRead > 12 * 1024) throw Error('Oversized registry record');
        const record = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
        if (record?.version === 2) {
          if (Object.keys(record).length !== 3 || record.protection !== 'windows-dpapi-user' || !receiptProtection.validPayload(record.payload)) throw Error('Invalid sealed record');
          sealed.push({ id, envelope: record });
        } else {
          if (!validRecord(record, id)) throw Error('Invalid registry record');
          records.push(record); // Legacy plaintext never acquires a protection label.
        }
      } catch (_) { invalid++; }
      finally { if (handle) await handle.close().catch(() => {}); }
    }
    if (sealed.length) {
      const decoded = await protection.unprotect(sealed.map(item => item.envelope));
      if (!Array.isArray(decoded) || decoded.length !== sealed.length) throw Error('Protection unavailable');
      for (let i = 0; i < sealed.length; i++) {
        const record = decoded[i];
        if (!validRecord(record, sealed[i].id)) { invalid++; continue; }
        records.push(record); protectedIds.add(record.id);
      }
    }
    return { records, invalid, complete, protectedIds, sealed };
  }
  async function cleanupSource() {
    // Internal local-CLI input, not an API response. Never promote legacy plaintext.
    const source = await readRecords();
    if (!source.complete) throw Error('Incomplete tunnel registry; cleanup unavailable');
    const entries = source.sealed.filter(item => source.protectedIds.has(item.id))
      .map(item => ({ id: item.id, envelope: item.envelope })).sort((a, b) => a.id.localeCompare(b.id));
    return { entries, skipped: source.invalid + source.records.length - entries.length,
      fingerprint: crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex') };
  }
  async function hasCapacity(root) {
    let count = 0;
    for await (const entry of await fsp.opendir(root)) { if (++count >= MAX_RECORDS) return false; }
    return true;
  }
  async function scan() {
    try {
      const { records, invalid, complete, protectedIds } = await readRecords();
      const pids = [...new Set(records.flatMap(record => [record.owner.pid, record.target.pid]))];
      const processes = await inspect(pids);
      return { readOnly: true, cleanupAvailable: false, coverage: 'registered-launches-only', complete, invalidRecords: invalid,
        records: records.map(record => ({ id: record.id, provider: record.provider, pid: record.target.pid, ownerPid: record.owner.pid,
          status: classify(record, processes, instanceId), integrity: protectedIds.has(record.id) ? 'os-user-protected' : 'unverified', canCleanup: false })) };
    } catch (_) {
      return { readOnly: true, cleanupAvailable: false, coverage: 'registered-launches-only', complete: false, error: 'registry-unavailable', records: [] };
    }
  }
  function snapshot() {
    // Repeated callers share one bounded scan; do not spawn unbounded inspection shells.
    if (!pendingScan) pendingScan = scan().finally(() => { pendingScan = null; });
    return pendingScan;
  }
  function observe(proc, provider, executable) {
    if (!PROVIDERS.has(provider) || !proc || !validPid(proc.pid)) return Promise.resolve({ status: 'unavailable' });
    let exited = proc.exitCode != null || proc.signalCode != null, recordFile = null;
    const clear = () => {
      exited = true;
      if (recordFile) fsp.unlink(recordFile).catch(() => {});
    };
    proc.once('exit', clear);
    return (async () => {
      try {
        if (/\.(cmd|bat)$/i.test(executable)) return { status: 'unsupported-wrapper' };
        const processes = await inspect([ownerPid, proc.pid]);
        const owner = processes.get(ownerPid), target = processes.get(proc.pid);
        if (exited || owner?.status !== 'alive' || target?.status !== 'alive') return { status: 'unavailable' };
        const expected = await fsp.realpath(executable);
        const normalized = process.platform === 'win32' ? expected.toLowerCase() : expected;
        if (normalized !== target.identity.executable) return { status: 'identity-mismatch' };
        const root = await directory(true);
        if (!await hasCapacity(root)) return { status: 'capacity' };
        const id = crypto.randomUUID();
        const record = { version: 1, id, platform: process.platform, provider, instanceId, owner: owner.identity, target: target.identity };
        if (!validRecord(record, id) || exited) return { status: 'unavailable' };
        // Windows sealing failure must not silently downgrade to a plaintext receipt.
        const persisted = protection.supported ? await protection.protect(record) : record;
        const encoded = JSON.stringify(persisted);
        if (Buffer.byteLength(encoded) > 12 * 1024 || exited) return { status: 'unavailable' };
        recordFile = path.join(root, id + '.json');
        await fsp.writeFile(recordFile, encoded, { flag: 'wx', mode: 0o600 });
        if (exited) { await fsp.unlink(recordFile).catch(() => {}); return { status: 'exited' }; }
        return { status: 'recorded' };
      } catch (_) { return { status: 'unavailable' }; }
    })();
  }
  return { observe, snapshot, cleanupSource };
}
const registry = createRegistry();
function observeTunnel(proc, provider, executable) {
  // Metadata failures cannot fail/stop an otherwise working Bridge. No token/argv here.
  registry.observe(proc, provider, executable).then(result => {
    if (!['recorded', 'exited'].includes(result.status)) console.warn('Tunnel ownership record unavailable; residual detection may be incomplete.');
  }).catch(() => {});
}
module.exports = { createRegistry, classify, validRecord, observeTunnel, snapshot: registry.snapshot, cleanupSource: registry.cleanupSource };
