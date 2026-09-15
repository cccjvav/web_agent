'use strict';
// Native Arena Trace Inspector evidence export, not its bulk history/raw trace export.
function validateTraceExport(input) {
  const fail = () => { throw new Error('Invalid Trace Inspector evidence export'); };
  const date = value => value === '' || value === null || (typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)));
  const text = (value, max) => typeof value === 'string' && value.length <= max;
  const keys = ['schemaVersion', 'exportedAt', 'runId', 'checkedAt', 'historical', 'scope', 'calls', 'models'];
  if (!input || input.schemaVersion !== 1 || Object.keys(input).some(k => !keys.includes(k))
    || typeof input.runId !== 'string' || !/^run_[a-zA-Z0-9_-]{1,120}$/.test(input.runId || '') || !date(input.checkedAt) || (typeof input.exportedAt !== 'string' || !input.exportedAt || !date(input.exportedAt))
    || typeof input.historical !== 'boolean' || !text(input.scope, 200)
    || !Array.isArray(input.calls) || input.calls.length > 100) fail();
  const models = input.models || [];
  if (!Array.isArray(models) || models.length > 1000) fail();
  for (const model of models) if (!model || Object.keys(model).sort().join(',') !== 'id,publicName' || typeof model.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(model.id) || !text(model.publicName,120) || !model.publicName) fail();
  const ids = new Set();
  const calls = input.calls.map(call => {
    if (!call || !text(call.spanId, 128) || !call.spanId || ids.has(call.spanId)
      || !text(call.model, 200) || !text(call.provider, 100)) fail();
    ids.add(call.spanId);
    const out = {spanId: call.spanId, model: call.model, provider: call.provider};
    for (const key of ['tokens', 'costUsd']) {
      if (call[key] != null && (!Number.isFinite(call[key]) || call[key] < 0 || call[key] > 1e15)) fail();
      out[key] = call[key] ?? null;
    }
    for (const key of ['partial', 'error', 'cancelled', 'tokensApproximate']) {
      if (call[key] != null && typeof call[key] !== 'boolean') fail();
      out[key] = call[key] ?? null;
    }
    // Do not forward arbitrary fields, token, raw trace, URL or conversation text.
    out.evidence = null;
    if (call.evidence?.schemaVersion === 1) {
      out.evidence = {schemaVersion: 1};
      for (const key of ['model', 'provider', 'tokens', 'cost']) {
        const entry = call.evidence[key];
        if (!entry) continue;
        if (!text(entry.value, 200) || !date(entry.observedAt)) fail();
        out.evidence[key] = {value: entry.value, observedAt: entry.observedAt};
      }
      const flags = call.evidence.flags;
      if (flags) {
        if (!date(flags.observedAt)) fail();
        out.evidence.flags = {observedAt: flags.observedAt};
        for (const key of ['isPartial', 'isError', 'isCancelled']) {
          if (flags[key] != null && typeof flags[key] !== 'boolean') fail();
          out.evidence.flags[key] = flags[key] ?? null;
        }
      }
    }
    return out;
  });
  return {schemaVersion: 1, runId: input.runId, checkedAt: input.checkedAt, exportedAt: input.exportedAt,
    historical: input.historical, scope: input.scope, calls, ...(models.length ? {models: models.map(model=>({...model}))} : {})};
}
module.exports = {validateTraceExport};
