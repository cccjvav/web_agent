'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { analyze, validateObservation, readObservation } = require('../../probe-extension/analysis');
async function main() {
  const sample = { schema: 'webagent-model-observation/v1', requestId: 'offline-fixture', observedAt: '2026-09-15T00:00:00Z', origin: 'https://arena.ai', truncated: false, evidence: [], text: 'data: {"model":"fixture-a","privateNote":"DO-NOT-REPORT-RAW-TEXT"}\n\n' };
  assert.deepStrictEqual(validateObservation(sample), sample);
  for (const bad of [{ ...sample, token: 'not-accepted' }, { ...sample, truncated: 'false' }, { ...sample, text: 'x'.repeat(200001) }, { ...sample, evidence: [{ source: 'arbitrary-weight', modelId: 'test' }] }, { ...sample, requestId: '../file' }, { ...sample, promptTokens: -1 }, { ...sample, frames: Array(65).fill('x') }]) assert.throws(() => validateObservation(bad));
  const first = await analyze(sample);
  assert.strictEqual(first.candidate.modelId, 'fixture-a');
  assert.strictEqual(first.modelIdentityVerified, false); assert.strictEqual(first.permissionsChanged, false);
  assert.ok(!JSON.stringify(first).includes('DO-NOT-REPORT-RAW-TEXT'));
  assert.ok(first.sources.some(item => item.source === 'sse.chunk.model'));
  assert.strictEqual(new Set(first.sources.map(item => JSON.stringify(item))).size, first.sources.length);
  const unknown = await analyze({ ...sample, text: 'neutral unrelated text' });
  assert.strictEqual(unknown.candidate.modelId, null, 'Previous worker evidence must not survive');
  const [a, b] = await Promise.all(['one', 'two'].map(name => analyze({ ...sample, requestId: name, text: '', evidence: [{ source: 'response.header.model', modelId: 'fixture-' + name }] })));
  assert.strictEqual(a.candidate.modelId, 'fixture-one'); assert.strictEqual(b.candidate.modelId, 'fixture-two');
  const uuid = '00000000-0000-4000-8000-000000000001';
  const mapped = await analyze({ ...sample, text: '', evidence: [{ source: 'response.json.model', modelId: uuid }], models: [{ id: uuid, publicName: 'mapped-fixture' }] });
  assert.strictEqual(mapped.candidate.modelId, 'mapped-fixture');
  const conflict = await analyze({ ...sample, text: '', evidence: [{ source: 'response.json.model', modelId: uuid }], models: [{ id: uuid, publicName: 'map-a' }, { id: uuid, publicName: 'map-b' }] });
  assert.deepStrictEqual(conflict.mappingConflicts, [uuid]); assert.strictEqual(conflict.candidate.modelId, uuid);
  const partial = await analyze({ ...sample, text: 'x'.repeat(65537) });
  assert.strictEqual(partial.truncated, true); assert.strictEqual(partial.parserLimit, 'line-limit');
  const controller = new AbortController(); const pending = analyze(sample, controller.signal); controller.abort();
  await assert.rejects(pending, /cancelled/); await assert.rejects(analyze(sample, controller.signal), /cancelled/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-analysis-'));
  try {
    const file = path.join(dir, 'sample.json'); fs.writeFileSync(file, JSON.stringify(sample));
    assert.deepStrictEqual(await readObservation(file), sample);
    fs.writeFileSync(file, Buffer.alloc(262145)); await assert.rejects(readObservation(file), /limit/);
    fs.writeFileSync(file, 'not-json'); await assert.rejects(readObservation(file));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  console.log('probe analysis: original parser/classifier, offline mapping/conflicts, isolated requests, budgets, cancellation and explicit file input passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
