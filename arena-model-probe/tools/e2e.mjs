/**
 * e2e.mjs — 端到端集成测试
 *
 * 为什么需要它：单测只证明 classify 的逻辑对。
 * 但探针真正的价值在"能否从真实 fetch 流量里捞出证据"，
 * 所以本测试在 Node 里搭出真实的 Response / ReadableStream / TextDecoder，
 * 装上 interceptor 钩子，模拟 arena 风格的 SSE 响应，断言证据链端到端跑通。
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ *
 * 0. 浏览器环境 shim（只补 interceptor 真正用到的 API）
 * ------------------------------------------------------------------ */
const mkEl = () => ({
  style: {}, id: '', className: '',
  attachShadow: () => ({ appendChild() {}, querySelector: () => null, querySelectorAll: () => [] }),
  appendChild() {}, remove() {}, addEventListener() {},
  classList: { toggle() {} },
  querySelector: () => null, querySelectorAll: () => [],
  getAttribute: () => null, parentElement: null,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h || ''; },
});

const define = (k, v) => { try { Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true }); } catch { /* noop */ } };
const store = new Map();
define('localStorage', {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
});
define('performance', { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 });
define('document', {
  readyState: 'complete', documentElement: mkEl(), activeElement: null,
  createElement: mkEl, addEventListener() {},
});
define('window', globalThis);
define('navigator', { clipboard: { writeText() {} } });
define('location', { href: 'https://arena.ai/agent' });
define('innerWidth', 1200);
define('XMLHttpRequest', class { open() {} send() {} addEventListener() {} });
define('WebSocket', class { constructor() {} addEventListener() {} });
define('EventSource', class { constructor() {} addEventListener() {} });

if (!globalThis.Response) throw new Error('Node 需提供全局 Response');
if (!globalThis.ReadableStream) throw new Error('Node 需提供全局 ReadableStream');

/* ------------------------------------------------------------------ *
 * 1. 真实的 fetch / SSE 流工厂
 * ------------------------------------------------------------------ */
const enc = new TextEncoder();

/** 构造一个逐块吐出的 SSE Response（模拟真实流式响应） */
function sseResponse(chunks, { headers = {}, delayMs = 1 } = {}) {
  const h = new Headers({ 'content-type': 'text/event-stream', ...headers });
  let i = 0;
  const stream = new ReadableStream({
    async pull(ctrl) {
      if (i >= chunks.length) { ctrl.close(); return; }
      await new Promise(r => setTimeout(r, delayMs));
      ctrl.enqueue(enc.encode(chunks[i++]));
    },
  });
  return new Response(stream, { status: 200, headers: h });
}

/** 构造 JSON Response */
function jsonResponse(obj, { headers = {} } = {}) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
  });
}

let fetchCount = 0;
const routes = new Map();
function route(match, makeRes, { delayMs = 1 } = {}) {
  routes.set(match, { makeRes, delayMs });
}

define('fetch', async function (input, init) {
  fetchCount++;
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  for (const [m, r] of routes) {
    if (url.includes(m)) return r.makeRes(url, init, r.delayMs);
  }
  return new Response('{}', { status: 200, headers: new Headers({ 'content-type': 'application/json' }) });
});

/* ------------------------------------------------------------------ *
 * 2. 载入探针（走打包产物，等于验证最终交付物）
 * ------------------------------------------------------------------ */
const { BUS, installFetchHook, installXHRHook, installSocketHook } = await import('../src/interceptor.js');

/* ------------------------------------------------------------------ *
 * 3. 测试框架
 * ------------------------------------------------------------------ */
let pass = 0, fail = 0;
const results = [];
async function t(name, fn) {
  try { await fn(); pass++; results.push(`  PASS  ${name}`); }
  catch (e) { fail++; results.push(`  FAIL  ${name}\n        ${e.message}`); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'eq'}: 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function ok(v, msg) { if (!v) throw new Error(msg || '断言失败'); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** 等证据满足条件，最多 waitMs */
async function waitFor(fn, waitMs = 2000, step = 20) {
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs) { if (fn()) return true; await sleep(step); }
  return false;
}

/* ------------------------------------------------------------------ *
 * 4. 场景 1：OpenAI Chat Completions 流（model 出现在请求体 + 每个 chunk）
 * ------------------------------------------------------------------ */
route('/v1/chat/completions', () => sseResponse([
  'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-6-turbo","system_fingerprint":"fp_x","choices":[{"index":0,"delta":{"content":"Hel"}}]}\n\n',
  'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-6-turbo","choices":[{"index":0,"delta":{"content":"lo"}}]}\n\n',
  'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-6-turbo","usage":{"prompt_tokens":42,"completion_tokens":7,"prompt_tokens_details":{"cached_tokens":0}}}\n\n',
  'data: [DONE]\n\n',
], { headers: { 'x-served-model': 'gpt-6-turbo' } }));

await t('E2E-1 从 fetch 请求体抓到 model（最高权威源）', async () => {
  installFetchHook();
  await fetch('https://api.example.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-6-turbo', messages: [{ role: 'user', content: 'hi' }] }),
  });
  await waitFor(() => BUS.evidence.some(e => e.source === 'request.body.model'));
  const e = BUS.evidence.find(e => e.source === 'request.body.model');
  ok(e, '应捕获请求体 model 证据');
  eq(e.modelId, 'gpt-6-turbo');
  eq(e.weight, 1.0);
});

await t('E2E-2 流式 SSE 逐块解析出 chunk 内 model', async () => {
  await waitFor(() => BUS.evidence.some(e => e.source === 'sse.chunk.model'));
  const evs = BUS.evidence.filter(e => e.source === 'sse.chunk.model');
  ok(evs.length >= 1, `应有 sse.chunk.model 证据，实际 ${evs.length}`);
  ok(evs.every(e => e.modelId === 'gpt-6-turbo'), 'chunk model 应为 gpt-6-turbo');
});

await t('E2E-3 响应头 model 被提取（x-served-model）', async () => {
  await waitFor(() => BUS.evidence.some(e => e.source === 'response.header.model'));
  const e = BUS.evidence.find(e => e.source === 'response.header.model');
  ok(e, '应捕获响应头 model');
  ok(/gpt-6-turbo/.test(e.modelId + e.detail), '应含 gpt-6-turbo');
});

await t('E2E-4 协议指纹识别为 openai 家族', async () => {
  await waitFor(() => BUS.evidence.some(e => e.source === 'protocol.framing'));
  const fams = BUS.evidence.filter(e => e.source === 'protocol.framing').map(e => e.family);
  ok(fams.includes('openai'), `应含 openai 家族，实际 ${JSON.stringify(fams)}`);
});

await t('E2E-5 完整观测产出（含 token 数与耗时）', async () => {
  await waitFor(() => BUS.observations.length > 0);
  const o = BUS.observations[0];
  ok(o, '应有观测记录');
  eq(o.requestModel, 'gpt-6-turbo', 'requestModel');
  eq(o.promptTokens, 42, 'promptTokens');
  eq(o.completionTokens, 7, 'completionTokens');
  ok(o.ttftMs >= 0, 'ttft 应 ≥0');
  ok(o.totalMs >= o.ttftMs, '总耗时应 ≥ ttft');
  ok(o.chunks >= 4, `应收到 ≥4 块，实际 ${o.chunks}`);
  ok(o.frames.includes('chat.completion.chunk'), '应记录帧类型');
});

/* ------------------------------------------------------------------ *
 * 5. 场景 2：匿名网关（model 被抹掉，只剩协议指纹）→ 必须判家族而非瞎猜版本
 * ------------------------------------------------------------------ */
route('/api/anonymous', () => sseResponse([
  'event: message_start\n',
  'data: {"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":10}}}\n\n',
  'event: content_block_delta\n',
  'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n',
  'event: message_delta\n',
  'data: {"type":"message_delta","usage":{"output_tokens":3},"delta":{"stop_reason":"end_turn"}}\n\n',
]));

await t('E2E-6 匿名网关：模型串被抹除时仍判出 anthropic 家族', async () => {
  const before = BUS.evidence.length;
  await fetch('https://gateway.example.com/api/anonymous', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),   // 注意：无 model 字段
  });
  await waitFor(() => BUS.evidence.slice(before).some(e => e.family === 'anthropic'));
  const e = BUS.evidence.slice(before).find(x => x.family === 'anthropic');
  ok(e, '应通过协议指纹判出 anthropic');
  eq(e.source, 'protocol.framing');
});

/* ------------------------------------------------------------------ *
 * 6. 场景 3：非流式 JSON 响应
 * ------------------------------------------------------------------ */
route('/v1/responses', () => jsonResponse({
  id: 'resp_1', model: 'gemini-3-pro',
  candidates: [{ content: { parts: [{ text: 'hi' }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 5 },
}));

await t('E2E-7 非流式 JSON：提取 model 并打指纹', async () => {
  const before = BUS.evidence.length;
  await fetch('https://api.example.com/v1/responses', { method: 'POST', body: '{}' });
  await waitFor(() => BUS.evidence.slice(before).some(e => e.source === 'response.json.model'));
  const e = BUS.evidence.slice(before).find(x => x.source === 'response.json.model');
  ok(e, '应提取 json model');
  eq(e.modelId, 'gemini-3-pro');
  const fams = BUS.evidence.slice(before).filter(x => x.source === 'protocol.framing').map(x => x.family);
  ok(fams.includes('google'), `应识别 google 家族，实际 ${JSON.stringify(fams)}`);
});

/* ------------------------------------------------------------------ *
 * 7. 场景 4：零侵入性验证（这是最重要的安全属性）
 * ------------------------------------------------------------------ */
await t('E2E-8 探针不改变响应体内容（零侵入）', async () => {
  installFetchHook();  // 幂等，不应重复包装
  const res = await fetch('https://api.example.com/v1/chat/completions', {
    method: 'POST', body: JSON.stringify({ model: 'gpt-6-turbo' }),
  });
  const text = await res.text();
  ok(text.includes('chatcmpl-1'), '响应体应完整可读');
  ok(text.includes('[DONE]'), '应读到流结束标记');
  eq(res.status, 200, '状态码');
  eq(res.headers.get('content-type'), 'text/event-stream', '内容类型');
});

await t('E2E-9 fetch 钩子幂等（重复安装不叠加）', async () => {
  const f1 = globalThis.fetch;
  installFetchHook();
  installFetchHook();
  eq(globalThis.fetch, f1, '不应重复包装');
  ok(globalThis.fetch.__probeWrapped === true, '应带包装标记');
});

await t('E2E-10 不相关请求不被解析（避免污染证据链）', async () => {
  const before = BUS.evidence.length;
  await fetch('https://cdn.example.com/static/logo.png');
  await sleep(60);
  eq(BUS.evidence.length, before, '静态资源不应产生证据');
});

await t('E2E-10b 遥测上报不得被当作模型响应（实测假阳性回归）', async () => {
  // 实测事故：Datadog RUM 上报（URL 含 /api/，body 是通用 JSON）
  // 被当成模型响应解析，其字段命中了错误的协议指纹 → 误报 qwen 家族。
  const before = BUS.evidence.length;
  route('/api/v2/rum', () => jsonResponse({
    type: 'resource', request_id: 'abc-123', code: '200', message: 'ok',
    application: { id: 'e9978ef5' }, service: 'rum',
    view: { url: 'https://arena.ai/agent', id: 'bf5a530a' },
    session: { id: '1f522012', type: 'user' },
  }));
  await fetch('https://browser-intake-us3-datadoghq.com/api/v2/rum?ddsource=browser', {
    method: 'POST', body: '{}',
  });
  await sleep(80);
  const added = BUS.evidence.slice(before);
  const bad = added.filter(e => e.family && !String(e.family).startsWith('__'));
  eq(bad.length, 0, `遥测不应产生任何厂商家族证据，实际: ${JSON.stringify(bad.map(b => b.family))}`);
});

await t('E2E-10c PostHog/Sentry 同类遥测也须排除', async () => {
  const before = BUS.evidence.length;
  for (const u of ['https://app.posthog.com/api/capture',
                   'https://o123.ingest.sentry.io/api/123/store/',
                   'https://www.google-analytics.com/api/collect']) {
    route(new URL(u).pathname, () => jsonResponse({ ok: true, model: 'should-not-parse' }));
    await fetch(u, { method: 'POST', body: '{}' });
  }
  await sleep(100);
  const added = BUS.evidence.slice(before);
  eq(added.length, 0, `遥测域不应产生证据，实际 ${added.length} 条`);
});

await t('E2E-11 流被消费后不会挂起（tee 分支正常关闭）', async () => {
  const before = BUS.observations.length;
  await fetch('https://api.example.com/v1/chat/completions', {
    method: 'POST', body: JSON.stringify({ model: 'gpt-6-turbo' }),
  }).then(r => r.text());
  const grew = await waitFor(() => BUS.observations.length > before, 2000);
  ok(grew, '消费响应后应产出观测');
});

/* ------------------------------------------------------------------ *
 * 8. 场景 5：完整链路 —— 采集 → 判定 → 建档
 * ------------------------------------------------------------------ */
await t('E2E-12 采集→判定 全链路得到 RESOLVED', async () => {
  const { classify } = await import('../src/classify.js');
  const v = classify(BUS.evidence.slice(-40));
  eq(v.mode, 'RESOLVED', 'mode');
  eq(v.family, 'openai', 'family');
  ok(v.confidence > 0.9, `置信度应 >0.9，实际 ${v.confidence}`);
});

await t('E2E-13 采集→建档 未知模型自动写入指纹库', async () => {
  store.clear();
  const { learnFromObservation } = await import('../src/learned.js');
  const obs = BUS.observations[BUS.observations.length - 1];
  const r1 = learnFromObservation(
    { ...obs, url: 'https://x.test/api/never-seen', text: 'data: {"model":"totally-new-model-9"}' },
    [{ source: 'request.body.model', weight: 1, modelId: 'totally-new-model-9' }],
  );
  eq(r1.kind, 'NEW_MODEL', '首次见到应 NEW_MODEL');
  eq(r1.entry.resolved, 'totally-new-model-9');

  // 第二次同源观测 → 应命中已有档
  const r2 = learnFromObservation(
    { ...obs, url: 'https://x.test/api/never-seen', text: 'data: {"model":"totally-new-model-9"}', ttftMs: obs.ttftMs + 20 },
    [{ source: 'request.body.model', weight: 1, modelId: 'totally-new-model-9' }],
  );
  ok(r2.kind === 'MATCH' || r2.kind === 'NEW_FOR_SESSION',
    `第二次应命中已有档或同会话归档，实际 ${r2.kind}`);
  const { listLearned } = await import('../src/learned.js');
  ok(listLearned().length >= 1, '指纹库应有条目');
});

/* ------------------------------------------------------------------ *
 * 报告
 * ------------------------------------------------------------------ */
console.log('\n=== arena-model-probe 端到端测试 ===\n');
console.log(results.join('\n'));
console.log(`\n合计: ${pass} 通过 / ${fail} 失败 / ${pass + fail} 用例`);
console.log(`fetch 调用次数: ${fetchCount}，累计证据 ${BUS.evidence.length} 条，观测 ${BUS.observations.length} 次`);
if (fail) process.exit(1);
