'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { analyze, validateObservation } = require('../../probe-extension/analysis');
async function main() {
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../../arena-trace-inspector/view-model.js'), 'utf8'), context);
  const checkedAt = '2026-09-15T12:00:00Z';
  const spans = ['a', 'b'].map(spanId => ({spanId, model: 'fixture-model', provider: 'fixture', tokens: 10, costUsd: 0, partial: false,
    evidence: {schemaVersion: 1, model: {value: 'fixture-model', observedAt: checkedAt}}}));
  const input = context.ArenaTraceView.exportEvidence(context.ArenaTraceView.build({runId: 'run_fixture', run: {runId: 'run_fixture', checkedAt, spans}}));
  const {referencesForRun} = await import('../../probe-extension/browserReference.mjs');
  const references = referencesForRun({runId: 'run_fixture', spans});
  assert.strictEqual(references.length, 2); assert.strictEqual(references[0].modelId, 'fixture-model');
  const report = await analyze(input);
  assert.strictEqual(report.calls.length, 2); assert.strictEqual(report.totals.spanCount, 2); assert.strictEqual(report.totals.tokens, 20);
  assert.strictEqual(report.calls[0].reference.modelId, 'fixture-model'); assert.strictEqual(report.modelIdentityVerified, false);
  assert.strictEqual(report.calls[0].evidence.model.observedAt, checkedAt);
  input.calls[0].token = 'NEVER_EXPORT'; input.calls[0].evidence.rawTrace = 'NEVER_EXPORT';
  assert.ok(!JSON.stringify(validateObservation(input)).includes('NEVER_EXPORT'));
  input.calls[0].model = 'different-stored-model';
  assert.strictEqual((await analyze(input)).calls[0].conflicts.length, 1);
  input.historical = true; input.calls[0].evidence = null;
  const old = await analyze(input); assert.strictEqual(old.historical, true); assert.match(old.calls[0].provenance, /legacy/);
  for (const bad of [{...input, token: 'reject'}, {...input, calls: [input.calls[0], input.calls[0]]}, {...input, calls: Array(101).fill(input.calls[0])}]) assert.throws(() => validateObservation(bad));
  const controller = new AbortController(); controller.abort(); await assert.rejects(analyze(input, controller.signal), /cancelled/);
  console.log('Native Inspector export -> Probe reference + trace evidence/usage; per-span scope, legacy, conflicts, stripping and cancellation passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
