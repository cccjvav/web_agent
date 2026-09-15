// Trusted shipped source, isolated from the VS Code UI. No browser boot or network hooks.
import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const load = name => import(pathToFileURL(path.join(workerData.engineRoot, name)).href);
const engine = await load('classify.js');
const probe = await load('probe.js');
const learned = await load('learned.js');
const registry = await load('registry.js');
const { BUS, SSETap } = await load('interceptor.js');
const observation = workerData.observation;
// Each worker starts fresh; no previous request, token, mapping or localStorage state.
const tap = new SSETap({ url: observation.origin, slot: observation.requestId });
tap.feed(observation.text); tap.finish();
const evidence = observation.evidence.map(item => ({ ...item, weight: engine.SOURCE_WEIGHTS[item.source] }));
evidence.push(...BUS.evidence);
const mapping = new Map(); const conflicts = [];
for (const item of observation.models || []) {
  const key = item.id.toLowerCase();
  if (mapping.has(key) && mapping.get(key) !== item.publicName) conflicts.push(key);
  else mapping.set(key, item.publicName);
}
for (const item of [...evidence]) {
  const key = item.modelId?.toLowerCase();
  if (mapping.has(key) && !conflicts.includes(key)) evidence.push({ source: 'idmap.resolve', modelId: mapping.get(key), weight: engine.SOURCE_WEIGHTS['idmap.resolve'] });
}
const protocol = engine.protocolFingerprint(observation.text);
// Analyze text only. Do not generate/send questions or contact any provider.
const behavior = probe.runCanaries(observation.text);
for (const item of behavior) evidence.push(item);
const bySource = new Map();
for (const item of evidence) {
  const key = JSON.stringify([item.source, item.modelId || null, item.family || null]);
  if (!bySource.has(key) || item.weight > bySource.get(key).weight) bySource.set(key, item);
}
const unique = [...bySource.values()];
const classificationInput = unique.filter(item => item.source === 'idmap.resolve' || !mapping.has(item.modelId?.toLowerCase()) || conflicts.includes(item.modelId?.toLowerCase()));
const verdict = engine.classify(classificationInput);
const report = {
  schema: 'webagent-model-analysis/v1', requestId: observation.requestId, observedAt: observation.observedAt,
  registryVersion: registry.REGISTRY_VERSION, truncated: observation.truncated || Boolean(tap.truncated), parserLimit: tap.truncated,
  provenance: 'user-imported; not independently verified', modelIdentityVerified: false, permissionsChanged: false,
  candidate: { mode: verdict.mode, modelId: verdict.modelId, family: verdict.family, label: verdict.label, heuristicScore: verdict.confidence },
  alternatives: (verdict.alternatives || []).map(({ confidence, ...item }) => ({ ...item, heuristicScore: confidence })),
  sources: unique.map(item => ({ source: item.source, modelId: item.modelId || null, family: item.family || null })),
  protocol: protocol.map(item => ({ family: item.family, label: item.label, heuristicScore: item.score })),
  mappingConflicts: [...new Set(conflicts)],
  codename: verdict.modelId ? learned.parseCodename(verdict.modelId) : null,
  fingerprint: engine.fingerprintVector(observation),
  tokenizer: observation.promptTokens > 0 ? probe.matchTokenizer(observation.promptTokens) : null,
  warnings: ['Scores are uncalibrated heuristics, not identity probabilities.', 'Imported source labels and mappings can be forged.', 'Tokenizer comparison is meaningful only for the original benchmark input.']
};
if (report.truncated) report.warnings.push('Input was truncated; missing evidence may change the result.');
parentPort.postMessage(report);
