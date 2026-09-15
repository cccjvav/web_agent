import {classify, SOURCE_WEIGHTS} from '../../arena-model-probe/src/classify.js';
import {parseCodename} from '../../arena-model-probe/src/learned.js';
// No hooks, localStorage, active prompts or network requests are installed here.
export function referencesForRun(run) {
  return (run?.spans || []).slice(0, 100).map(span => {
    const model = span.evidence?.model?.value || span.model;
    const source = span.evidence?.model?.value ? 'run.trace.model' : 'local.history.model';
    const verdict = classify(model ? [{source, modelId: model, weight: SOURCE_WEIGHTS[source] || 0.4}] : []);
    return {runId: run.runId, spanId: span.spanId, modelId: verdict.modelId, family: verdict.family,
      heuristicScore: verdict.confidence, codename: model ? parseCodename(model) : null, modelIdentityVerified: false};
  });
}
