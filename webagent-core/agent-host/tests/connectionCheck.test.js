'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto, createHash } = require('crypto');
const checks = require('../src/utils/connectionCheck');
const { callTool } = require('../src/tools');
(async () => {
  const input = { schema: 'webagent-browser-observation/v1', origin: 'https://arena.ai', observedAt: new Date().toISOString(), pageKind: 'agent', pageDigest: 'a'.repeat(64) };
  const options = { remote: true, callerKey: 'peer:authenticated-fixture' };
  try {
    for (const bad of [{ ...input, pageDigest: [input.pageDigest] }, { ...input, token: 'secret' }, { ...input, origin: 'https://evil.example' }, { ...input, observedAt: 'bad' }, { ...input, pageDigest: '../x' }, { ...input, observedAt: new Date(Date.now() - 700000).toISOString() }]) assert.throws(() => checks.create(bad));
    const record = checks.create(input);
    record.observation.origin = 'tampered';
    assert.strictEqual(checks.inspect(record.checkId).observation.origin, input.origin);
    assert.ok(!JSON.stringify(checks.inspect(record.checkId)).includes(record.challenge));
    await assert.rejects(callTool('confirm_connection', { challenge: record.challenge }, 'ask'));
    await assert.rejects(callTool('confirm_connection', { challenge: record.challenge }, 'ask', { remote: true, callerKey: 'ip:unauthenticated' }));
    const result = await callTool('confirm_connection', { challenge: record.challenge }, 'ask', options);
    assert.strictEqual(result.modelIdentityVerified, false);
    assert.strictEqual(result.permissionsChanged, false);
    assert.strictEqual(result.observationHash, record.observationHash);
    assert.ok(!JSON.stringify(result).includes(options.callerKey));
    assert.strictEqual(checks.inspect(record.checkId).status, 'echo-confirmed');
    await assert.rejects(callTool('confirm_connection', { challenge: record.challenge }, 'ask', options));
    const stale = checks.create(input), now = Date.now;
    try { Date.now = () => now() + 120001; assert.throws(() => checks.confirm({ challenge: stale.challenge }, options)); assert.throws(() => checks.inspect(stale.checkId)); }
    finally { Date.now = now; }
    checks.clear(); for (let i = 0; i < 8; i++) checks.create(input);
    assert.throws(() => checks.create(input), /eight/);
    checks.clear(); assert.throws(() => checks.inspect(record.checkId));
    // Execute only the new opt-in exporter, never the uploaded capture/trace machinery.
    const nodes = [];
    function node(tag) { const n = { tag, style: {}, append() {}, setAttribute() {}, focus() {}, select() {} }; nodes.push(n); return n; }
    const context = { location: { origin: 'https://arena.ai', pathname: '/agent/private-thread', search: '?token=must-not-export', hash: '#secret' },
      crypto: webcrypto, TextEncoder, Uint8Array, document: { getElementById: () => null, createElement: node, body: { append() {} } },
      fetch() { throw new Error('Exporter must not fetch'); } };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../../arena-model-probe/webagent-connection.user.js'), 'utf8'), context);
    const textarea = nodes.find(n => n.tag === 'textarea');
    assert.strictEqual(textarea.value, undefined, 'no automatic capture');
    await nodes.find(n => n.tag === 'button').onclick();
    const exported = JSON.parse(textarea.value);
    assert.strictEqual(exported.pageDigest, createHash('sha256').update(context.location.pathname).digest('hex'));
    assert.strictEqual(exported.pageKind, 'agent');
    assert.ok(!textarea.value.includes('private-thread') && !textarea.value.includes('secret') && !textarea.value.includes('token'));
    checks.observation(exported);
    console.log('connection check: strict minimal observation, remote session gate, one-use/expiry/cap/clear, explicit no-network exporter passed');
  } finally { checks.clear(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
