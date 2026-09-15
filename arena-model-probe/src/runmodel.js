/**
 * runmodel.js — 从 Trigger.dev run trace 提取【真实模型名】
 *
 * 为什么需要这个模块：
 *   Agent Mode 的响应流里不含模型名（实测：请求体无 modelId、响应体穷举
 *   搜索 model/provider/harness 键名 0 个）。但服务端会下发一个
 *   public-access-token（JWT, pub:true），其 scope 明确包含
 *   read:runs:<runId> —— 即授予客户端读取该 run 的权限。
 *   读该 run 的 trace，里面 ai.streamText.doStream span 的标签
 *   就是 worker 自己写入的**真实模型名**，例如：
 *       qwen3.8-max-0902
 *       qwen-latest-series-invite-202608-m4
 *
 * 本模块把这些步骤全部自动化，让探针直接显示真实模型名，
 * 而不是只报"家族未知"。
 */

import { BUS } from './interceptor.js';

const TRIGGER_API = 'https://api.trigger.dev';

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */
const STATE = {
  token: null,
  runId: null,
  tokenAt: 0,
  tokenExp: 0,
  lastFetchAt: 0,
  lastError: null,
  modelName: null,
  modelHistory: [],       // [{name, at, runId, tokens}]
  fetching: false,
  fetchCount: 0,
};

/* ------------------------------------------------------------------ *
 * JWT 解码
 * ------------------------------------------------------------------ */
function b64urlDecode(s) {
  let t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  try {
    if (typeof atob === 'function') {
      const bin = atob(t);
      // atob 返回 latin1，需按 UTF-8 还原
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    }
  } catch { /* noop */ }
  return null;
}

export function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const head = b64urlDecode(parts[0]);
  const body = b64urlDecode(parts[1]);
  let h = null, p = null;
  try { h = head ? JSON.parse(head) : null; } catch { /* noop */ }
  try { p = body ? JSON.parse(body) : null; } catch { /* noop */ }
  return { header: h, payload: p };
}

/** 从 JWT 的 scopes 里提取 run id */
export function runIdFromPayload(payload) {
  if (!payload) return null;
  const scopes = payload.scopes || [];
  for (const s of scopes) {
    const m = String(s).match(/(?:read|write):[a-zA-Z]+:(run_[A-Za-z0-9]+)/);
    if (m) return m[1];
  }
  const m2 = JSON.stringify(payload).match(/(run_[A-Za-z0-9]{10,})/);
  return m2 ? m2[1] : null;
}

/* ------------------------------------------------------------------ *
 * 接收 token（由 interceptor 的 stream-header 事件触发）
 * ------------------------------------------------------------------ */
export function acceptToken(name, value) {
  if (!name || !value) return false;
  if (!/access-token/i.test(name)) return false;
  if (!/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(value)) return false;

  const dec = decodeJwt(value);
  const rid = runIdFromPayload(dec && dec.payload);
  const exp = (dec && dec.payload && dec.payload.exp) || 0;

  // 同一 run 且 token 未过期 → 忽略
  if (STATE.token === value) return false;

  STATE.token = value;
  STATE.runId = rid || STATE.runId;
  STATE.tokenAt = Date.now();
  STATE.tokenExp = exp * 1000;
  STATE.lastError = null;

  BUS.emit({
    kind: 'run-token',
    data: {
      runId: STATE.runId,
      pub: dec && dec.payload ? dec.payload.pub : null,
      expiresInSec: exp ? Math.round(exp - Date.now() / 1000) : null,
      scopes: (dec && dec.payload && dec.payload.scopes) || [],
    },
  });
  return true;
}

export function state() {
  return { ...STATE, modelHistory: STATE.modelHistory.slice(-20) };
}

/* ------------------------------------------------------------------ *
 * 读取 run trace 并提取模型名
 * ------------------------------------------------------------------ */
/**
 * 从 trace 文本里抽取模型标签。
 * span 结构（实测）：
 *   "message":"ai.streamText.doStream","style":{"icon":"hero-sparkles",
 *     "accessory":{"style":"pills","items":[
 *        {"text":"qwen3.8-max-0902","icon":"tabler-cube"},   <- 模型
 *        {"text":"7.0k","icon":"tabler-hash"}]}}
 */
export function extractModelLabels(traceText) {
  const models = [];
  const tokens = [];
  if (typeof traceText !== 'string' || !traceText) return { models, tokens };
  const re = /"text"\s*:\s*"([^"]{1,80})"\s*,\s*"icon"\s*:\s*"([^"]{1,40})"/g;
  let m;
  while ((m = re.exec(traceText)) !== null) {
    const text = m[1], icon = m[2];
    if (icon.indexOf('cube') >= 0) models.push(text);
    else if (icon.indexOf('hash') >= 0) tokens.push(text);
  }
  return { models, tokens };
}

/** 用已存 token 拉取 trace */
export async function fetchRunModels(opts = {}) {
  const timeoutMs = opts.timeoutMs || 20000;
  if (!STATE.token || !STATE.runId) {
    return { ok: false, reason: 'no-token' };
  }
  if (STATE.tokenExp && Date.now() > STATE.tokenExp) {
    STATE.lastError = 'token-expired';
    return { ok: false, reason: 'token-expired' };
  }
  if (STATE.fetching) return { ok: false, reason: 'busy' };

  STATE.fetching = true;
  STATE.fetchCount++;
  const url = `${TRIGGER_API}/api/v1/runs/${STATE.runId}/events`;

  try {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, timeoutMs);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${STATE.token}`,
        'Accept': 'application/json',
      },
      credentials: 'omit',
      signal: ctrl ? ctrl.signal : undefined,
    });
    clearTimeout(timer);

    if (!res.ok) {
      STATE.lastError = `http-${res.status}`;
      return { ok: false, reason: `http-${res.status}` };
    }
    const text = await res.text();
    const { models, tokens } = extractModelLabels(text);

    STATE.lastFetchAt = Date.now();
    STATE.lastError = null;

    if (models.length) {
      const uniq = [];
      for (const x of models) if (uniq.indexOf(x) < 0) uniq.push(x);
      const name = uniq[uniq.length - 1];   // 取最后一次调用的模型
      STATE.modelName = name;
      STATE.modelHistory.push({
        name,
        all: uniq,
        at: Date.now(),
        runId: STATE.runId,
        tokens: tokens.slice(-3),
      });
      if (STATE.modelHistory.length > 50) STATE.modelHistory.shift();
      return { ok: true, name, models: uniq, tokens: tokens.slice(-3) };
    }
    return { ok: true, name: null, models: [], tokens };
  } catch (e) {
    STATE.lastError = String((e && e.message) || e);
    return { ok: false, reason: STATE.lastError };
  } finally {
    STATE.fetching = false;
  }
}

/**
 * 轮询直到拿到模型名。
 *
 * 为什么需要轮询：run 的 trace 是渐进写入的 —— 提问后 worker 开始执行，
 * 模型调用完成后才会写入 ai.streamText.doStream span 及其标签。
 * 实测首次读取往往只有 17KB（尚无标签），稍后变成 24KB（含 qwen3.8-max-0902）。
 */
export async function pollRunModels(opts = {}) {
  const maxMs = opts.maxMs || 180000;
  const intervalMs = opts.intervalMs || 6000;
  const t0 = Date.now();
  let last = null;

  while (Date.now() - t0 < maxMs) {
    last = await fetchRunModels(opts);
    if (last.ok && last.name) return last;
    if (last.reason === 'token-expired' || last.reason === 'no-token') return last;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return last || { ok: false, reason: 'timeout' };
}

/* ------------------------------------------------------------------ *
 * 与探针联动：把真实模型名作为最高权重证据回灌
 * ------------------------------------------------------------------ */
export function pushModelEvidence(name, runId, detail) {
  if (!name) return false;
  BUS.push({
    source: 'run.trace.model',
    weight: 0.96,
    modelId: name,
    detail: detail || `Trigger.dev run ${runId || '?'} 的 streamText span 标签（worker 写入）`,
    t: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  });
  return true;
}

/* ------------------------------------------------------------------ *
 * 自动编排：收到 token → 轮询 trace → 回灌模型名
 * ------------------------------------------------------------------ */
let autoStarted = false;

export function startAutoResolve(opts = {}) {
  if (autoStarted) return;
  autoStarted = true;

  BUS.on(async (evt) => {
    if (evt.kind !== 'run-token') return;
    const { runId } = evt.data || {};
    if (!runId) return;

    // 延迟一点再开始，给 worker 时间执行模型调用
    await new Promise(r => setTimeout(r, opts.initialDelayMs || 8000));

    const r = await pollRunModels({
      maxMs: opts.maxMs || 180000,
      intervalMs: opts.intervalMs || 6000,
    });
    if (r && r.ok && r.name) {
      pushModelEvidence(r.name, runId);
      BUS.emit({ kind: 'run-model', data: { name: r.name, runId, all: r.models } });
    } else {
      BUS.emit({ kind: 'run-model-failed', data: { runId, reason: (r && r.reason) || 'unknown' } });
    }
  });
}

export function reset() {
  STATE.token = null;
  STATE.runId = null;
  STATE.modelName = null;
  STATE.lastError = null;
  STATE.modelHistory.length = 0;
}
