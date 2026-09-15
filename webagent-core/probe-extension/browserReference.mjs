let catalogModels = new Map();
export function setCatalog(models) {
  if (!Array.isArray(models) || models.length > 1000) throw Error('Catalog limit');
  const next = new Map(), conflicts = new Set();
  for (const item of models) {
    if (typeof item?.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item.id) || typeof item.publicName !== 'string' || !item.publicName || item.publicName.length > 120) throw Error('Invalid catalog');
    const id=item.id.toLowerCase(); if(next.has(id)&&next.get(id)!==item.publicName)conflicts.add(id); else next.set(id,item.publicName);
  }
  for(const id of conflicts)next.delete(id); catalogModels=next;
}
import {REGISTRY_VERSION} from '../../arena-model-probe/src/registry.js';
import {classify, SOURCE_WEIGHTS} from '../../arena-model-probe/src/classify.js';
import {parseCodename} from '../../arena-model-probe/src/learned.js';
// No hooks, localStorage, active prompts or network requests are installed here.
export function referencesForRun(run) {
  return (run?.spans || []).slice(0, 100).map(span => {
    const model = span.evidence?.model?.value || span.model;
    const source = span.evidence?.model?.value ? 'run.trace.model' : 'local.history.model';
    const mapped = catalogModels.get(model?.toLowerCase());
    const verdict = classify(model ? [{source: mapped ? 'idmap.resolve' : source, modelId: mapped || model, weight: mapped ? 0.92 : SOURCE_WEIGHTS[source] || 0.4}] : []);
    return {runId: run.runId, spanId: span.spanId, modelId: verdict.modelId, family: verdict.family,
      heuristicScore: verdict.confidence, codename: model ? parseCodename(model) : null, modelIdentityVerified: false};
  });
}

import {BUS, SSETap, CAPTURE_LIMITS} from '../../arena-model-probe/src/interceptor.js';
import {protocolFingerprint, fingerprintVector} from '../../arena-model-probe/src/classify.js';
import {runCanaries} from '../../arena-model-probe/src/probe.js';
// This bundle is the sole owner of the imported Probe BUS; no Probe boot/listeners.
export function createStreamProbe(requestId) {
  const tap = new SSETap({url: 'https://arena.ai', slot: requestId});
  const evidence = new Map();
  const clear = () => { BUS.evidence.length = 0; BUS.observations.length = 0; };
  const collect = () => {
    for (const item of BUS.evidence) {
      if (item.slot !== requestId) continue;
      const key = JSON.stringify([item.source, item.modelId || null, item.family || null]);
      if (evidence.size < 100 || evidence.has(key)) evidence.set(key, item);
    }
  };
  return {
    add(items) { for(const item of items.slice(0,100)) { if(evidence.size>=100)break; evidence.set(JSON.stringify([item.source,item.modelId||null,item.family||null]),item); } },
    push(bytes) { clear(); try { tap.feed(bytes); collect(); } finally { clear(); } },
    finish() { clear(); try { tap.finish(); collect(); } finally { clear(); } },
    snapshot() {
      const protocol = protocolFingerprint(tap.text);
      const behavior = runCanaries(tap.text);
      const combined = new Map(evidence);
      for (const item of [...behavior, ...protocol.map(p => ({source: 'protocol.framing', family: p.family, weight: p.score}))]) {
        const key = JSON.stringify([item.source, item.modelId || null, item.family || null]);
        if (!combined.has(key) || item.weight > combined.get(key).weight) combined.set(key, item);
      }
      const mapped = [...combined.values()].map(item => { const name = catalogModels.get(item.modelId?.toLowerCase()); return name ? {...item, modelId:name, source:'idmap.resolve', weight:0.92} : item; });
      const verdict = classify(mapped);
      return {requestId, registryVersion:REGISTRY_VERSION, observedAt:new Date().toISOString(), fingerprint:fingerprintVector({text:tap.text,promptTokens:tap.promptTokens,completionTokens:tap.completionTokens}), scope: 'sampled-response; not bound to a trace run', modelIdentityVerified: false,
        modelId: verdict.modelId, family: verdict.family, mode: verdict.mode, heuristicScore: verdict.confidence,
        truncated: Boolean(tap.truncated) || tap.text.length >= CAPTURE_LIMITS.text || evidence.size >= 100,
        protocol: protocol.map(p => ({family: p.family, label: p.label, heuristicScore: p.score})),
        behavior: behavior.map(p => ({family: p.family || null, source: p.source, heuristicScore: p.weight})),
        note: 'Raw responses and token headers are not exported; model fields may still be sensitive. Sampling and heuristic errors remain possible.'};
    }
  };
}
