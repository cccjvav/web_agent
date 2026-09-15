'use strict';
// Connection evidence, never model/person authentication or permission elevation.
const { randomBytes, createHash } = require('crypto');
const { hostIdentity } = require('./hostDiagnostics');
const records = new Map();
const TTL = 120000;
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function prune() {
  for (const [id, record] of records) if (Date.now() >= record.expiresAt) records.delete(id);
}
function observation(input) {
  if (!input || Array.isArray(input) || typeof input !== 'object' || Buffer.byteLength(JSON.stringify(input)) > 2048
    || Object.keys(input).sort().join(',') !== 'observedAt,origin,pageDigest,pageKind,schema'
    || input.schema !== 'webagent-browser-observation/v1' || input.origin !== 'https://arena.ai'
    || !['agent', 'other'].includes(input.pageKind) || typeof input.pageDigest !== 'string' || !/^[a-f0-9]{64}$/.test(input.pageDigest)
    || typeof input.observedAt !== 'string' || !Number.isFinite(Date.parse(input.observedAt))
    || Date.parse(input.observedAt) > Date.now() + 30000 || Date.now() - Date.parse(input.observedAt) > 600000) {
    throw new Error('Invalid or stale browser observation; export again. No tokens/raw captures accepted.');
  }
  return { schema: input.schema, origin: input.origin, observedAt: input.observedAt, pageKind: input.pageKind, pageDigest: input.pageDigest };
}
function view(record) {
  return { checkId: record.id, expiresAt: record.expiresAt, status: record.status,
    observation: { ...record.observation }, observationHash: record.observationHash,
    identity: hostIdentity(), ...(record.receipt ? { receipt: { ...record.receipt } } : {}),
    boundary: 'Browser-reported metadata plus authenticated MCP connection echo; not model/person identity, not browser attestation, no new permissions.' };
}
function create(input) {
  prune();
  if (records.size >= 8) throw new Error('At most eight connection checks; clear or wait for expiry');
  const data = observation(input), challenge = randomBytes(32).toString('hex');
  const id = randomBytes(16).toString('hex');
  const record = { id, observation: data, observationHash: digest(JSON.stringify(data)),
    challengeHash: digest(challenge), expiresAt: Date.now() + TTL, status: 'waiting' };
  records.set(id, record);
  return { ...view(record), challenge, instruction: 'Ask the connected external client to call confirm_connection with this challenge once, then compare the returned host identity. Do not send login credentials.' };
}
function inspect(id) {
  prune(); const record = records.get(id);
  if (!record) throw new Error('Connection check missing or expired; explicitly create a new check');
  return view(record);
}
function confirm(input, options = {}) {
  if (!options.remote || !String(options.callerKey || '').startsWith('peer:')) throw new Error('Authenticated initialized remote MCP session required');
  if (!input || Object.keys(input).join(',') !== 'challenge' || typeof input.challenge !== 'string' || !/^[a-f0-9]{64}$/.test(input.challenge)) throw new Error('Invalid challenge');
  prune(); const hash = digest(input.challenge);
  const record = [...records.values()].find(item => item.challengeHash === hash);
  if (!record || record.status !== 'waiting') throw new Error('Challenge missing, expired or already consumed');
  record.status = 'echo-confirmed'; delete record.challengeHash;
  record.receipt = { confirmedAt: new Date().toISOString(), sessionFingerprint: digest(options.callerKey), evidence: 'authenticated-session-echo' };
  return { checkId: record.id, observationHash: record.observationHash, identity: hostIdentity(),
    receipt: { ...record.receipt }, modelIdentityVerified: false, permissionsChanged: false };
}
function clear() { records.clear(); return { cleared: true }; }
module.exports = { observation, create, inspect, confirm, clear };
