'use strict';
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const LIMIT = 262144;
const { validateTraceExport } = require('./traceInput');
const SOURCES = ['request.body.model', 'response.header.model', 'response.json.model', 'sse.chunk.model', 'run.trace.model', 'url.path.model', 'self.report'];
function validateObservation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Buffer.byteLength(JSON.stringify(input)) > LIMIT) throw new Error('Invalid analysis input');
  if (input.schemaVersion === 1 && Array.isArray(input.calls)) return validateTraceExport(input);
  const keys = ['schema', 'requestId', 'observedAt', 'origin', 'truncated', 'evidence', 'text', 'models', 'promptTokens', 'completionTokens', 'reasoningTokens', 'ttftMs', 'totalMs', 'frames'];
  if (Object.keys(input).some(key => !keys.includes(key)) || input.schema !== 'webagent-model-observation/v1'
    || typeof input.requestId !== 'string' || !/^[\w.-]{1,128}$/.test(input.requestId)
    || typeof input.observedAt !== 'string' || !Number.isFinite(Date.parse(input.observedAt))
    || input.origin !== 'https://arena.ai' || typeof input.truncated !== 'boolean'
    || !Array.isArray(input.evidence) || input.evidence.length > 100
    || typeof input.text !== 'string' || input.text.length > 200000) throw new Error('Invalid analysis schema');
  for (const item of input.evidence) {
    if (!item || Object.keys(item).sort().join(',') !== 'modelId,source' || !SOURCES.includes(item.source)
      || typeof item.modelId !== 'string' || item.modelId.length < 2 || item.modelId.length > 120) throw new Error('Invalid evidence');
  }
  if (input.models !== undefined && (!Array.isArray(input.models) || input.models.length > 1000)) throw new Error('Invalid map');
  for (const model of input.models || []) {
    if (!model || Object.keys(model).sort().join(',') !== 'id,publicName'
      || typeof model.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(model.id)
      || typeof model.publicName !== 'string' || !model.publicName.length || model.publicName.length > 120) throw new Error('Invalid map entry');
  }
  for (const key of ['promptTokens', 'completionTokens', 'reasoningTokens', 'ttftMs', 'totalMs']) {
    if (input[key] !== undefined && input[key] !== null && (!Number.isFinite(input[key]) || input[key] < 0 || input[key] > 1e9)) throw new Error('Invalid metric');
  }
  if (input.frames !== undefined && (!Array.isArray(input.frames) || input.frames.length > 64 || input.frames.some(frame => typeof frame !== 'string' || frame.length > 128))) throw new Error('Invalid frames');
  return JSON.parse(JSON.stringify(input));
}
async function readObservation(file) {
  const handle = await fs.promises.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > LIMIT) throw new Error('Analysis file exceeds limit');
    const buffer = Buffer.alloc(LIMIT + 1); let count = 0;
    while (count < buffer.length) {
      const part = await handle.read(buffer, count, buffer.length - count, null);
      if (!part.bytesRead) break;
      count += part.bytesRead;
    }
    if (count > LIMIT) throw new Error('Analysis file exceeds limit');
    return validateObservation(JSON.parse(buffer.subarray(0, count).toString('utf8')));
  } finally { await handle.close(); }
}
function analyze(input, signal) {
  const observation = validateObservation(input);
  if (signal?.aborted) return Promise.reject(new Error('Analysis cancelled'));
  const engineRoot = fs.existsSync(path.join(__dirname, 'engine/package.json'))
    ? path.join(__dirname, 'engine') : path.resolve(__dirname, '../../arena-model-probe/src');
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'analysisWorker.mjs'), {
      workerData: { observation, engineRoot, traceRoot: fs.existsSync(path.join(__dirname, 'trace-engine/package.json')) ? path.join(__dirname, 'trace-engine') : path.resolve(__dirname, '../../arena-trace-inspector') }, resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 }
    });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return; settled = true;
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      worker.terminate().catch(() => {});
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(new Error('Analysis cancelled'));
    const timer = setTimeout(() => finish(new Error('Analysis deadline exceeded')), 10000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.once('message', result => finish(null, result));
    worker.once('error', () => finish(new Error('Analysis worker failed')));
    worker.once('exit', () => { if (!settled) finish(new Error('Analysis worker exited')); });
  });
}
module.exports = { validateObservation, readObservation, analyze };
