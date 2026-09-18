const { currentSignal, checkCancelled } = require('../utils/requestScope');
const { createHash } = require('crypto');
const store = require('../models/store');

function normalizeBase(url) {
  return String(url || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, '');
}

function probeCaps(m) {
  if (!m || typeof m !== 'object') return [];
  if (Array.isArray(m.capabilities) && m.capabilities.length) return m.capabilities.map(String);
  if (Array.isArray(m.supported_features) && m.supported_features.length) return m.supported_features.map(String);
  if (Array.isArray(m.caps) && m.caps.length) return m.caps.map(String);
  return [];
}

function probeContext(m) {
  if (!m || typeof m !== 'object') return '';
  const n = m.context_length || m.context_window || m.max_model_len || m.contextSize;
  if (n == null || n === '') return '';
  if (typeof n === 'number' && Number.isFinite(n)) {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1000) return `${Math.round(n / 1000)}K`;
    return String(n);
  }
  return String(n);
}

function providerError(message, status = 400) {
  const error = new Error(message); error.status = status;
  error.code = status === 409 ? 'E_PROVIDER_EXISTS' : 'E_BAD_PROVIDER';
  return error;
}

function providerEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\x00-\x20\x7f]/.test(value.trim())) throw providerError('Endpoint 必须为有效HTTP(S)地址');
  let url;
  try { url = new URL(normalizeBase(value)); } catch (_) { throw providerError('Endpoint 必须为有效HTTP(S)地址'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw providerError('Endpoint 仅接受HTTP(S)，不能在URL中放凭据、查询参数或片段');
  }
  return url.href.replace(/\/+$/, '');
}

function providerKey(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096
    || value.trim() === '••••' || /[^\x21-\x7e]/.test(value.trim())) throw providerError('请填写有效API Key，而不是脱敏占位符');
  return value.trim();
}

function providerCatalog(list) {
  if (!Array.isArray(list) || !list.length || list.length > 100) throw providerError('模型列表须包含1–100项；可明确填写手动模型ID后添加');
  const ids = new Set();
  return list.map(model => {
    if (!model || typeof model !== 'object' || Array.isArray(model)
      || typeof model.id !== 'string' || !model.id.trim() || model.id.length > 256
      || /[\x00-\x1f\x7f]/.test(model.id) || ids.has(model.id.trim())) throw providerError('模型ID缺失、重复或格式无效');
    const id = model.id.trim(); ids.add(id);
    for (const [key, limit] of [['name',256],['contextSize',64],['pricing',256]]) {
      if (model[key] != null && (typeof model[key] !== 'string' || model[key].length > limit)) throw providerError('模型展示字段格式或长度无效');
    }
    const caps = model.caps == null ? [] : model.caps;
    if (!Array.isArray(caps) || caps.length > 32 || caps.some(cap => typeof cap !== 'string' || cap.length > 128)) throw providerError('模型能力列表格式或长度无效');
    return {id, name:model.name || id, contextSize:model.contextSize || '', caps:caps.slice(), pricing:model.pricing || ''};
  });
}

function addProvider(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw providerError('addProvider必须为对象');
  const baseUrl = providerEndpoint(input.baseUrl), apiKey = providerKey(input.apiKey);
  if (input.vision != null && typeof input.vision !== 'boolean') throw providerError('vision必须为布尔值');
  const catalog = providerCatalog(input.models);
  const group = new URL(baseUrl).host;
  const models = catalog.map(model => ({
    ...model,
    id:'provider-' + createHash('sha256').update(JSON.stringify([baseUrl,model.id])).digest('hex'),
    modelId:model.id, protocol:'chat.completions', baseUrl, apiKey, group,
    vision:input.vision === true || model.caps.some(cap => /vision/i.test(cap))
  }));
  // Read real stored records, never reconstruct previous keys from /status or masked /models.
  // No await between load/check/save: serialized in this host, not a cross-process lock.
  const cfg = store.load();
  if (cfg.models.length + models.length > 100) throw providerError('模型目录最多保存100项，请先整理现有配置');
  for (const model of models) {
    if (cfg.models.some(existing => {
      if (existing.id === model.id) return true;
      if (existing.protocol === 'builtin' || existing.modelId !== model.modelId) return false;
      try { return providerEndpoint(existing.baseUrl) === baseUrl; } catch (_) { return false; }
    })) throw providerError('该Endpoint的模型已存在；未覆盖模型或密钥，请先核对已有配置',409);
  }
  cfg.models = [...cfg.models, ...models];
  store.save(cfg);
  return {success:true, added:models.length, activeModelId:cfg.activeModelId};
}

async function fetchProviderText(base, key, timeoutMs) {
  checkCancelled();
  const parent = currentSignal(), controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs); if (timer.unref) timer.unref();
  if (parent) parent.addEventListener('abort', abort, {once:true});
  let reader;
  try {
    if (parent?.aborted) abort();
    const response = await fetch(`${base}/models`, {
      redirect:'error', signal:controller.signal,
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'}
    });
    reader = response.body?.getReader();
    if (!response.ok) throw providerError(`模型发现失败 HTTP ${response.status}`);
    if (!reader) throw providerError('模型列表响应正文缺失');
    const chunks = []; let size = 0;
    while (true) {
      if (controller.signal.aborted) throw providerError('模型发现已取消或超时');
      const {done,value} = await reader.read();
      if (controller.signal.aborted) throw providerError('模型发现已取消或超时');
      if (done) break;
      size += value.byteLength;
      if (size > 512 * 1024) throw providerError('模型列表正文超过512KiB');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    clearTimeout(timer); if (parent) parent.removeEventListener('abort', abort);
    controller.abort();
    if (reader) await reader.cancel().catch(() => {});
  }
}

async function listRemoteModels(baseUrl, apiKey, { timeoutMs = 15000 } = {}) {
  const base = providerEndpoint(baseUrl), key = providerKey(apiKey);
  const raw = await fetchProviderText(base, key, timeoutMs);
  let data;
  try { data = JSON.parse(raw); }
  catch (_) { throw providerError('模型列表不是JSON，请核对OpenAI兼容Endpoint'); }
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  if (!list.length || list.length > 100) throw providerError('模型列表须包含1–100项；可明确填写手动模型ID后添加');
  return providerCatalog(list.map(model => ({
    id:model?.id || model?.name,
    name:model?.name || model?.id,
    contextSize:probeContext(model), caps:probeCaps(model),
    pricing:typeof model?.pricing === 'string' ? model.pricing : ''
  })));
}

module.exports = { listRemoteModels, normalizeBase, probeCaps, probeContext, addProvider };
