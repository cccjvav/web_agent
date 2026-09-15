'use strict';
const {randomUUID} = require('crypto');
const {DIMS,fingerprint} = require('./referenceInput');
const KEY = 'webagent.probe.referenceHistory.v1';
const MAX_BYTES = 1024 * 1024;
// Deliberate projection: arbitrary fields/raw response/token headers never get persisted.
const candidate = {source:100, modelId: 200, family: 100, mode: 80, heuristicScore: 'number'};
const label = {path: 200, value: 200, observedAt: 40};
const evidence = {schemaVersion: 'number', source: 100, spanName: 100, model: label, provider: label, tokens: label, cost: label};
const spec = {provenance:200, schema: 80, requestId: 128, runId: 128, observedAt: 40, checkedAt: 40, historical: 'boolean',
  registryVersion: 100, mappingSource:100, protocol:[{family:100,label:120,heuristicScore:'number'}],behavior:[{family:100,source:120,heuristicScore:'number'}], fingerprint:Object.fromEntries(DIMS.map(key=>[key,'number'])), truncated: 'boolean', candidate,
  sources: [{source: 100, modelId: 200, family: 100}],
  mappingConflicts: [128],
  calls: [{spanId: 128, model: 200, provider: 100, tokens: 'number', costUsd: 'number', tokensApproximate: 'boolean',
    partial: 'boolean', error: 'boolean', cancelled: 'boolean', provenance: 100, conflicts: [200], reference: candidate, evidence}]};
function project(value, shape) {
  if (value == null) return null;
  if (typeof shape === 'number') {
    if (typeof value !== 'string' || value.length > shape) throw new Error('History string limit');
    return value;
  }
  if (typeof shape === 'string') {
    if (typeof value !== shape || (shape === 'number' && !Number.isFinite(value))) throw new Error('History scalar invalid');
    return value;
  }
  if (Array.isArray(shape)) {
    if (!Array.isArray(value) || value.length > 100) throw new Error('History collection limit');
    return value.map(item => project(item, shape[0]));
  }
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('History object invalid');
  const out = {};
  for (const [key, field] of Object.entries(shape)) if (Object.hasOwn(value, key)) out[key] = project(value[key], field);
  return out;
}
function snapshot(report) {
  if (!['webagent-model-analysis/v1', 'webagent-trace-analysis/v1'].includes(report?.schema)) throw new Error('Unknown report');
  const result = project(report, spec);
  if(result.fingerprint)result.fingerprint=fingerprint(result.fingerprint);
  result.modelIdentityVerified = false;
  if (Buffer.byteLength(JSON.stringify(result)) > 65536) throw new Error('History report exceeds 64 KiB');
  return result;
}
function createHistory(state) {
  let queue = Promise.resolve();
  const read = () => {
    const data = state.get(KEY);
    if (data === undefined) return [];
    if (!data || data.version !== 1 || !Array.isArray(data.entries) || data.entries.length > 50
      || Buffer.byteLength(JSON.stringify(data)) > MAX_BYTES) throw new Error('History storage invalid; not overwritten');
    const ids = new Set();
    return data.entries.map(entry => {
      if (!entry || typeof entry.id !== 'string' || !/^[a-f0-9-]{36}$/.test(entry.id) || ids.has(entry.id)
        || typeof entry.savedAt !== 'string' || entry.savedAt.length > 40 || !Number.isFinite(Date.parse(entry.savedAt))) throw new Error('History entry invalid');
      ids.add(entry.id);
      return {id: entry.id, savedAt: entry.savedAt, report: snapshot(entry.report)};
    });
  };
  const mutate = operation => {
    const work = queue.then(async () => {
      const entries = operation(read());
      const data = {version: 1, entries};
      if (entries.length > 50 || Buffer.byteLength(JSON.stringify(data)) > MAX_BYTES) throw new Error('History full; delete explicitly');
      await state.update(KEY, entries.length ? data : undefined);
      return entries;
    });
    queue = work.catch(() => {});
    return work;
  };
  return {
    async list() { await queue; return read(); },
    async exportArchive() { await queue; return {schema:'webagent-reference-history/v1',exportedAt:new Date().toISOString(),entries:read()}; },
    async importArchive(input) {
      if (input?.schema !== 'webagent-reference-history/v1' || typeof input.exportedAt !== 'string' || !Number.isFinite(Date.parse(input.exportedAt))) throw Error('Invalid history archive');
      const incoming = await createHistory({get:()=>({version:1,entries:input.entries})}).list();
      return mutate(entries => {
        const next = [...entries];
        for (const entry of incoming) {
          const old = next.find(item=>item.id===entry.id);
          if (old && JSON.stringify(old.report)!==JSON.stringify(entry.report)) throw Error('History ID conflict; original retained');
          if (!old) next.push(entry);
        }
        return next;
      });
    },
    save(report) { const entry = {id: randomUUID(), savedAt: new Date().toISOString(), report: snapshot(report)}; return mutate(entries => [...entries, entry]); },
    remove(id) { return mutate(entries => entries.filter(entry => entry.id !== id)); }
  };
}
function compare(left, right) {
  const models = report => report.schema === 'webagent-trace-analysis/v1'
    ? (report.calls || []).map(call => call.evidence?.model?.value || call.model).filter(Boolean) : [report.candidate?.modelId].filter(Boolean);
  const a = new Set(models(left.report)), b = new Set(models(right.report));
  return {schema: 'webagent-reference-comparison/v1', left, right,
    onlyLeft: [...a].filter(model => !b.has(model)), onlyRight: [...b].filter(model => !a.has(model)),
    shared: [...a].filter(model => b.has(model)), modelIdentityVerified: false,
    note: 'Historical reference comparison, not a new detection. Different runs/inputs/sampling can explain differences; no identity-change conclusion.'};
}
module.exports = {createHistory, snapshot, compare};
