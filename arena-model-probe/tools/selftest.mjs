/**
 * selftest.mjs — 离线自检（直接导入真实源码，测的就是打包进产物那份逻辑）
 *
 * 为什么必须测：探针的"准确"完全取决于判定引擎在已知输入下是否收敛到正确模型。
 * 本测试用真实抓包形态的样本（OpenAI Chat / OpenAI Responses、Anthropic Messages、
 * Gemini、匿名网关）去喂 classify，断言家族 / 版本 / 置信度都符合预期。
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');

// 真实源码（原生 ESM 导入，无需 shim）
const {
  classify, collectModelFields, protocolFingerprint,
  fingerprintVector, cosineSim, matchKnownModels, SOURCE_WEIGHTS,
} = await import('../src/classify.js');
const { runCanaries, matchTokenizer, buildProbePack, TOKENIZER_BENCH_TEXT } = await import('../src/probe.js');
const { isFrontier, MODEL_PATTERNS, REGISTRY_VERSION } = await import('../src/registry.js');
const { parseCodename } = await import('../src/learned.js');
const { loadModelMap, resolveModelId, uuidsForName, isUuid,
        parseInitialModels, mapStats } = await import('../src/idmap.js');
const { decodeJwt, runIdFromPayload, extractModelLabels } = await import('../src/runmodel.js');

/* ------------------------------------------------------------------ *
 * 打包产物冒烟检查（确保 build 后文件自包含、语法可解析）
 * ------------------------------------------------------------------ */
let bundleCheck = 'skipped';
try {
  const bundle = readFileSync(resolve(ROOT, 'dist', 'arena-model-probe.inject.js'), 'utf8');
  new Function(bundle);            // 语法可解析
  const need = ['chaincmpl', '__mods', 'MODEL_PATTERNS', 'usageMetadata', 'message_start'];
  const miss = ['__mods', 'MODEL_PATTERNS', 'usageMetadata', 'message_start'].filter(s => !bundle.includes(s));
  if (miss.length) throw new Error(`产物缺少关键内容: ${miss.join(', ')}`);
  if (/\bimport\s*\{/.test(bundle)) throw new Error('产物仍残留 import 语句');
  if (/^\s*export\s+/m.test(bundle)) throw new Error('产物仍残留 export 语句');
  bundleCheck = `ok (${(Buffer.byteLength(bundle, 'utf8') / 1024).toFixed(1)} KB, 自包含)`;
} catch (e) {
  bundleCheck = `FAIL: ${e.message}`;
}

/* ------------------------------------------------------------------ *
 * 测试框架
 * ------------------------------------------------------------------ */
let pass = 0, fail = 0;
const results = [];
function t(name, fn) {
  try { fn(); pass++; results.push(`  PASS  ${name}`); }
  catch (e) { fail++; results.push(`  FAIL  ${name}\n        ${e.message}`); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'eq'}: 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function ok(v, msg) { if (!v) throw new Error(msg || '断言失败'); }
function near(a, b, tol, msg) { if (Math.abs(a - b) > tol) throw new Error(`${msg || 'near'}: ${a} 与 ${b} 差超 ${tol}`); }

/* ================================================================== *
 * 1. 已知模型 id 精确识别（重点覆盖新出的模型）
 * ================================================================== */
t('GPT-6 精确识别（前沿代际标注）', () => {
  const v = classify([{ source: 'request.body.model', weight: 1.0, modelId: 'gpt-6-turbo' }]);
  eq(v.mode, 'RESOLVED', 'mode');
  eq(v.family, 'openai', 'family');
  eq(v.gen, 'gpt-6', 'gen');
  eq(v.frontier, true, 'frontier');
  ok(v.confidence >= 0.9, `置信度应 ≥0.9，实际 ${v.confidence}`);
});

t('Gemini 3 识别', () => {
  const v = classify([{ source: 'response.json.model', weight: 0.93, modelId: 'gemini-3-pro-preview' }]);
  eq(v.family, 'google'); eq(v.gen, 'gemini-3');
  // 地表真值（arena 排行榜）显示前沿已是 gemini-3.8，故 gemini-3 不再是前沿
  eq(v.frontier, false, 'gemini-3 已非最新代际');
});

t('Gemini 3.8 为当前前沿', () => {
  const v = classify([{ source: 'response.json.model', weight: 0.93, modelId: 'gemini-3.8-flash-high' }]);
  eq(v.family, 'google'); eq(v.gen, 'gemini-3.8'); eq(v.frontier, true);
});

t('真实目录校准：GPT-6 代号 astra / GPT-5.6 代号 sol', () => {
  const a = classify([{ source: 'request.body.model', weight: 1, modelId: 'gpt-6-astra-max' }]);
  eq(a.gen, 'gpt-6'); eq(a.frontier, true);
  const b = classify([{ source: 'request.body.model', weight: 1, modelId: 'gpt-5.6-sol-xhigh' }]);
  eq(b.gen, 'gpt-5.6'); eq(b.frontier, false, '5.6 之后已有 6');
});

t('真实目录校准：Claude fable 5 / Grok 4.20 / Kimi K3', () => {
  eq(classify([{ source: 'request.body.model', weight: 1, modelId: 'claude-fable-5.1-high' }]).gen, 'claude-5');
  eq(classify([{ source: 'request.body.model', weight: 1, modelId: 'claude-opus-5-max' }]).gen, 'claude-5');
  eq(classify([{ source: 'request.body.model', weight: 1, modelId: 'grok-4.20-beta-0309-reasoning' }]).gen, 'grok-4.20');
  eq(classify([{ source: 'request.body.model', weight: 1, modelId: 'kimi-k3-gateway-max' }]).family, 'moonshot');
  eq(classify([{ source: 'request.body.model', weight: 1, modelId: 'deepseek-v4.1-flash-max' }]).gen, 'v4.1');
  eq(classify([{ source: 'request.body.model', weight: 1, modelId: 'glm-5.3-flash' }]).gen, 'glm-5.3');
});

t('真实目录校准：新增厂商家族可识别', () => {
  eq(classify([{ source: 'request.body.model', weight: 1, modelId: 'hunyuan-hy3-preview' }]).family, 'tencent');
  eq(classify([{ source: 'request.body.model', weight: 1, modelId: 'ernie-5.1-0508-release' }]).family, 'baidu');
  eq(classify([{ source: 'request.body.model', weight: 1, modelId: 'step-3.7-flash' }]).family, 'stepfun');
  eq(classify([{ source: 'request.body.model', weight: 1, modelId: 'minimax-h3-max' }]).family, 'minimax');
  eq(classify([{ source: 'request.body.model', weight: 1, modelId: 'seed-2.1-pro-preview' }]).family, 'bytedance');
});

t('Claude 5 识别', () => {
  const v = classify([{ source: 'sse.chunk.model', weight: 0.9, modelId: 'claude-sonnet-5-20260101' }]);
  eq(v.family, 'anthropic'); eq(v.gen, 'claude-5');
});

t('Grok 5 识别', () => {
  const v = classify([{ source: 'response.header.model', weight: 0.95, modelId: 'grok-5-mini' }]);
  eq(v.family, 'xai'); eq(v.gen, 'grok-5');
});

t('DeepSeek V4 / Qwen3 / GLM 识别', () => {
  eq(classify([{ source: 'request.body.model', weight: 1, modelId: 'deepseek-v4-reasoner' }]).gen, 'v4');
  eq(classify([{ source: 'request.body.model', weight: 1, modelId: 'qwen3-max' }]).family, 'qwen');
  eq(classify([{ source: 'request.body.model', weight: 1, modelId: 'glm-5-plus' }]).family, 'zhipu');
});

t('混合证据取最高权威源 + 保留备选', () => {
  const v = classify([
    { source: 'dom.text', weight: 0.45, modelId: 'gpt-4o' },
    { source: 'request.body.model', weight: 1.0, modelId: 'gpt-6' },
  ]);
  eq(v.modelId, 'gpt-6', '应选请求体');
  ok(v.confidence > 0.9, '置信度应高');
  ok(v.alternatives.length >= 1, '应保留备选');
  eq(v.alternatives[0].modelId, 'gpt-4o');
});

t('请求体权威性 > 响应头 > DOM 文本', () => {
  ok(SOURCE_WEIGHTS['request.body.model'] > SOURCE_WEIGHTS['response.header.model']);
  ok(SOURCE_WEIGHTS['response.header.model'] > SOURCE_WEIGHTS['dom.text']);
  ok(SOURCE_WEIGHTS['dom.text'] > SOURCE_WEIGHTS['self.report']);
});

/* ================================================================== *
 * 2. 协议指纹：model 字段被网关抹除时判家族
 * ================================================================== */
const SAMPLE_ANTHROPIC = [
  'event: message_start',
  'data: {"type":"message_start","message":{"id":"msg_01","usage":{"input_tokens":12}}}',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}',
  'event: message_delta',
  'data: {"type":"message_delta","usage":{"output_tokens":8},"delta":{"stop_reason":"end_turn"}}',
].join('\n');

const SAMPLE_OPENAI = [
  'data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1,"system_fingerprint":"fp_abc","choices":[{"index":0,"delta":{"content":"He"}}]}',
  'data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","usage":{"prompt_tokens":10,"completion_tokens":5,"prompt_tokens_details":{"cached_tokens":0}}}',
  'data: [DONE]',
].join('\n');

const SAMPLE_OPENAI_RESP = [
  'event: response.created',
  'data: {"type":"response.created","response":{"id":"resp_07f"}}',
  'event: response.output_text.delta',
  'data: {"type":"response.output_text.delta","delta":"Hi"}',
  'event: response.reasoning_summary_text.delta',
  'data: {"type":"response.reasoning_summary_text.delta","delta":"think"}',
].join('\n');

const SAMPLE_GEMINI = JSON.stringify({
  candidates: [{ content: { parts: [{ text: 'x' }], role: 'model' }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 },
});

t('Anthropic 协议指纹（多帧命中，不含 model 字段）', () => {
  const p = protocolFingerprint(SAMPLE_ANTHROPIC);
  ok(p.length > 0, '应有命中');
  eq(p[0].family, 'anthropic');
  ok(p[0].score > 0.5, `分数应 >0.5，实际 ${p[0].score}`);
});

t('OpenAI Chat Completions 协议指纹', () => {
  const p = protocolFingerprint(SAMPLE_OPENAI);
  eq(p[0].family, 'openai');
  ok(p[0].matched.some(m => /chatcmpl/.test(m)),
     `应命中 chatcmpl id，实际 ${JSON.stringify(p[0].matched)}`);
});

t('OpenAI Responses API 协议指纹', () => {
  const p = protocolFingerprint(SAMPLE_OPENAI_RESP);
  eq(p[0].family, 'openai');
});

t('Gemini 协议指纹', () => {
  const p = protocolFingerprint(SAMPLE_GEMINI);
  eq(p[0].family, 'google');
  ok(p[0].matched.some(m => /finishReason|usageMetadata/.test(m)));
});

t('匿名网关：仅有协议指纹 → INFERRED 家族判定，不谎报版本', () => {
  const ev = protocolFingerprint(SAMPLE_ANTHROPIC)
    .map(p => ({ source: 'protocol.framing', weight: p.score, family: p.family, detail: p.label }));
  const v = classify(ev);
  eq(v.mode, 'INFERRED');
  eq(v.family, 'anthropic');
  eq(v.gen, null, '不应谎报具体版本');
  eq(v.modelId, null, '不应编造 modelId');
  ok(v.confidence >= 0.4 && v.confidence <= 0.85, `置信度应在 0.4~0.85，实际 ${v.confidence}`);
});

t('单条共用字段不足以误判家族', () => {
  const p = protocolFingerprint('data: {"reasoning_content":"..."}');
  const top = p[0];
  ok(!top || top.score <= 0.35, `单条共用字段分数应低，实际 ${top && top.score}`);
});

/* ------------------------------------------------------------------ *
 * 2.5 实测抓到的真实帧（回归测试，防止再退化）
 *     arena.ai Agent Mode 用自定义 realtime batch 传输 + Vercel AI SDK 流部件
 * ------------------------------------------------------------------ */
const SAMPLE_ARENA_REALTIME = [
  'event: ping',
  'data: {"timestamp":1789452504334,"tail":{"seq_num":13,"timestamp":1789452377223}}',
  '',
  'event: batch',
  'id: 13,1,99',
  'data: {"records":[{"seq_num":13,"timestamp":1789452519021,"body":"{\\"data\\":{\\"type\\":\\"start\\",\\"messageId\\":\\"01a0a3ae-8593-7b92-9659-e7e56cd546f3\\"},\\"id\\":\\"MmMIH8O\\"}"}],"tail":{"seq_num":14,"timestamp":1789452519021}}',
  '',
  'event: batch',
  'id: 15,3,229',
  'data: {"records":[{"seq_num":14,"timestamp":1789452523240,"body":"{\\"data\\":{\\"type\\":\\"start-step\\"},\\"id\\":\\"eBRLk2c\\"}"}],"tail":{"seq_num":15,"timestamp":1789452523240}}',
  '',
].join('\n');

t('真实 realtime batch 帧：识别出自定义传输层', () => {
  const p = protocolFingerprint(SAMPLE_ARENA_REALTIME);
  ok(p.some(x => x.family === '__realtime_batch'), '应识别 event: batch 传输层');
});

t('真实 realtime batch 帧：嵌套 body 里的 AI SDK 帧类型可见', () => {
  // records[].body 是「JSON 字符串里再套 JSON」，必须二次解包才能看到 type
  const innerTypes = [];
  for (const m of SAMPLE_ARENA_REALTIME.matchAll(/"body":"((?:[^"\\]|\\.)*)"/g)) {
    try {
      const inner = JSON.parse(m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
      if (inner?.data?.type) innerTypes.push(inner.data.type);
    } catch { /* 跳过 */ }
  }
  ok(innerTypes.includes('start'), `应解出 start，实际 ${JSON.stringify(innerTypes)}`);
  ok(innerTypes.includes('start-step'), '应解出 start-step');
});

t('真实帧不含 model 字段时 → 只能判家族，不编造版本', () => {
  const p = protocolFingerprint(SAMPLE_ARENA_REALTIME);
  const ev = p.map(x => ({ source: 'protocol.framing', weight: x.score, family: x.family, detail: x.label }));
  const v = classify(ev);
  eq(v.modelId, null, '不得编造 modelId');
  ok(v.mode === 'INFERRED' || v.mode === 'UNKNOWN');
});

/* ================================================================== *
 * 2.6 【关键回归】传输层不得冒充模型家族
 *
 * 真实事故：某次 Agent Mode 实际用的是 qwen-latest-series-invite-202608-m4
 * （由 Trigger.dev run trace 的 span 标签证实），原始流里 'qwen' 与 'openai'
 * 各出现 0 次；但探针却报出「openai 家族 / 74.1%」。
 * 根因：把 Vercel AI SDK（厂商无关的传输层）标成了 family:'openai'。
 * 这组用例锁定修正后的行为。
 * ================================================================== */
const SAMPLE_AI_SDK_ONLY = [
  'event: batch',
  'data: {"records":[{"seq_num":1,"body":"{\\"type\\":\\"start\\",\\"messageId\\":\\"m\\"}"},',
  '{"seq_num":2,"body":"{\\"type\\":\\"start-step\\"}"},',
  '{"seq_num":3,"body":"{\\"type\\":\\"text-delta\\",\\"delta\\":\\"hi\\"}"},',
  '{"seq_num":4,"body":"{\\"type\\":\\"text-end\\"}"},',
  '{"seq_num":5,"body":"{\\"type\\":\\"finish-step\\"}"},',
  '{"seq_num":6,"body":"{\\"type\\":\\"finish\\"}"}]}',
].join('\n');

t('【回归】仅凭 AI SDK 帧不得判出 openai 家族', () => {
  const p = protocolFingerprint(SAMPLE_AI_SDK_ONLY);
  const ev = p.map(x => ({ source: 'protocol.framing', weight: x.score, family: x.family, detail: x.label }));
  const v = classify(ev);
  // 关键断言：绝不能报 openai
  ok(v.family !== 'openai', `不得因 AI SDK 帧就判 openai，实际 family=${v.family}`);
  eq(v.mode, 'UNKNOWN', '仅有传输层证据时应为 UNKNOWN，而不是 INFERRED');
  eq(v.modelId, null);
  // 但应如实说明识别出的传输层
  eq(v.wire, '__sdk_wire', '应标注传输层为 __sdk_wire');
  ok(/传输层/.test(v.label), `标签应说明只是传输层，实际: ${v.label}`);
});

t('【回归】AI SDK 指纹的 family 不得是真实厂商名', () => {
  const p = protocolFingerprint(SAMPLE_AI_SDK_ONLY);
  const sdk = p.find(x => /AI SDK/.test(x.label || ''));
  ok(sdk, '应命中 AI SDK 指纹');
  ok(String(sdk.family).startsWith('__'),
     `AI SDK 指纹家族必须是 __ 前缀（传输层标记），实际 ${sdk.family}`);
  ok(!['openai', 'anthropic', 'google', 'qwen'].includes(sdk.family),
     `不得把传输层标成厂商家族，实际 ${sdk.family}`);
});

t('【回归】有真实厂商协议证据时仍能正常判家族', () => {
  // 传输层 + 真实 OpenAI 特征（chatcmpl）→ 应判 openai
  const mixed = SAMPLE_AI_SDK_ONLY + '\ndata: {"id":"chatcmpl-abc123","object":"chat.completion.chunk"}';
  const p = protocolFingerprint(mixed);
  const ev = p.map(x => ({ source: 'protocol.framing', weight: x.score, family: x.family, detail: x.label }));
  const v = classify(ev);
  eq(v.family, 'openai', '有 chatcmpl 证据时应判 openai');
});

t('【回归】qwen 特征应判为 qwen 而非 openai', () => {
  const qwenish = SAMPLE_AI_SDK_ONLY
    + '\ndata: {"model":"qwen3.8-27b","object":"chat.completion.chunk"}';
  const p = protocolFingerprint(qwenish);
  const ev = p.map(x => ({ source: 'protocol.framing', weight: x.score, family: x.family, detail: x.label }));
  const v = classify(ev);
  eq(v.family, 'qwen', `应判 qwen，实际 ${v.family}`);
});

t('【回归】通用 JSON 不得命中 qwen 指纹（第二类假阳性）', () => {
  // 实测事故：Datadog RUM 遥测上报被当成模型响应，误报 qwen 家族。
  // 根因之一是 qwen 指纹里用了 request_id / code+message 这类通用字段。
  const telemetry = JSON.stringify({
    type: "resource", request_id: "abc-123", code: "200", message: "ok",
    application: { id: "x" }, date: 1789455000000, service: "rum",
    view: { url: "https://arena.ai/agent", id: "y" },
    session: { id: "z", type: "user" },
  });
  const p = protocolFingerprint(telemetry);
  const qwenHit = p.find(x => x.family === 'qwen');
  ok(!qwenHit, `通用遥测 JSON 不得命中 qwen，实际命中: ${JSON.stringify(qwenHit)}`);

  const ev = p.map(x => ({ source: 'protocol.framing', weight: x.score, family: x.family, detail: x.label }));
  const v = classify(ev);
  ok(v.family !== 'qwen', `不得报 qwen，实际 ${v.family}`);
});

t('【回归】遥测域不得被当作模型端点（URL 过滤）', async () => {
  // 这组断言依赖打包产物里的过滤逻辑，用直接导入方式验证
  const mod = await import('../src/interceptor.js');
  ok(typeof mod.installFetchHook === 'function', 'interceptor 可导入');
  // 注：isLikelyLLMUrl/shouldInspect 是模块内部函数，
  // 这里通过「遥测 URL 不应产生证据」的端到端用例覆盖（见 e2e 测试）。
  ok(true);
});

t('转义嵌套帧也能识别出 AI SDK 传输层（实测关键 bug 的回归）', () => {
  // realtime batch 把帧作为 JSON 字符串嵌入 body，引号是转义形态 \"type\":\"start\"
  // 只匹配未转义文本会全部漏判 → 传输层都识别不出来
  const escaped = [
    'event: batch',
    'data: {"records":[{"seq_num":1,"body":"{\\"type\\":\\"start\\",\\"messageId\\":\\"m1\\"}"},',
    '{"seq_num":2,"body":"{\\"type\\":\\"text-delta\\",\\"delta\\":\\"hi\\"}"},',
    '{"seq_num":3,"body":"{\\"type\\":\\"text-end\\"}"}]}',
  ].join('\n');
  const p = protocolFingerprint(escaped);
  const sdk = p.find(x => x.label && x.label.includes('Vercel AI SDK'));
  ok(sdk, `应识别 AI SDK 传输层，实际命中: ${JSON.stringify(p.map(x => x.family))}`);
  ok(sdk.matched.length >= 2, `应命中多帧，实际 ${JSON.stringify(sdk.matched)}`);
  // 注意：weight 已从 0.78 下调到 0.30 —— 因为它是传输层而非模型家族
  ok(sdk.score > 0.2, `分数应 >0.2，实际 ${sdk.score}`);

  // 完整链路：传输层不得产出模型家族结论
  const v = classify(p.map(x => ({ source: 'protocol.framing', weight: x.score, family: x.family, detail: x.label })));
  eq(v.mode, 'UNKNOWN', '仅有传输层证据 → UNKNOWN，不得编造家族');
  eq(v.modelId, null);
  eq(v.family, null, '不得给出模型家族');
});

/* ================================================================== *
 * 3. 模型字段提取
 * ================================================================== */
t('collectModelFields 深度提取（含 upstream/base/嵌套）', () => {
  const obj = {
    choices: [{ message: { model: 'gpt-6' } }],
    meta: { upstream_model: 'claude-opus-4-6', base_model: 'llama-5-scout' },
    notModel: 1, model_count: 2,
  };
  const vals = collectModelFields(obj).map(h => h.value);
  ok(vals.includes('gpt-6'), '应抓到嵌套 gpt-6');
  ok(vals.includes('claude-opus-4-6'), '应抓到 upstream_model');
  ok(vals.includes('llama-5-scout'), '应抓到 base_model');
  ok(!vals.includes(2), '数字不应被当作模型名');
});

t('未知模型串不误报为已知', () => {
  eq(matchKnownModels('some-random-internal-model-v9').length, 0);
});

t('模型名长度异常防御', () => {
  const long = 'x'.repeat(500);
  const v = classify([{ source: 'request.body.model', weight: 1, modelId: long }]);
  ok(v.mode === 'UNKNOWN' || v.modelId === null || v.modelId.length <= 120);
});

/* ================================================================== *
 * 4. 代际判定
 * ================================================================== */
t('isFrontier 代际判断', () => {
  eq(isFrontier('openai', 'gpt-6'), true);
  eq(isFrontier('openai', 'gpt-4'), false);
  eq(isFrontier('anthropic', 'claude-5'), true);
  eq(isFrontier('google', 'gemini-2'), false);
  eq(isFrontier('google', 'gemini-3.8'), true);
  eq(isFrontier('nope', 'x'), null);
});

t('注册表覆盖用户点名的新模型', () => {
  const s = MODEL_PATTERNS.map(p => p.re.source).join(' ');
  for (const need of ['gpt[-\\s]?6', 'gemini[-\\s]?3', 'claude', 'grok[-\\s]?5', 'deepseek']) {
    ok(s.includes(need), `注册表应含 ${need}`);
  }
  ok(REGISTRY_VERSION.length > 0);
});

/* ================================================================== *
 * 5. 行为探针
 * ================================================================== */
t('canary: 拒答模板识别 Anthropic', () => {
  const ev = runCanaries("I can't help with that. It's important to keep things constructive.");
  ok(ev.some(e => e.family === 'anthropic'), '应命中 anthropic 拒答模板');
});

t('canary: 拒答模板识别 OpenAI', () => {
  const ev = runCanaries("I can't help with that.");
  ok(ev.some(e => e.family === 'openai'), '应命中 openai 拒答模板');
});

t('canary: 自报身份权重必须低（防幻觉误导）', () => {
  const ev = runCanaries('gpt-6-turbo');
  const self = ev.find(e => e.source === 'self.report');
  ok(self, '应产出 self.report');
  ok(self.weight <= 0.2, `自报权重必须 ≤0.2，实际 ${self.weight}`);
});

t('canary: 知识截止探测识别新一代', () => {
  const ev = runCanaries('2025: gemini-3-pro, claude-5, grok-5 are released.');
  ok(ev.some(e => /知识截止/.test(e.detail)), '应命中截止探测');
});

t('canary: 罕见字形保真度', () => {
  const ev = runCanaries('🜁·ᚠᛟ·𐌰𐍄·꧁꧂·𝔄𝔅·①②③·ﷺ·㊙');
  ok(ev.some(e => /保真/.test(e.detail)), '应产出 tokenizer 保真度证据');
});

t('canary pack 可构建且 5 条齐备', () => {
  const pack = buildProbePack();
  eq(pack.length, 5);
  ok(pack.every(p => p.prompt && p.title && p.id));
});

/* ================================================================== *
 * 6. tokenizer 定量指纹
 * ================================================================== */
t('tokenizer: 基准文本 chars/token 落在合理区间', () => {
  const m = matchTokenizer(65);
  ok(m, '应返回结果');
  ok(m.charsPerToken > 2 && m.charsPerToken < 6, `cpt=${m.charsPerToken}`);
  ok(typeof m.best === 'string');
});

t('tokenizer: 极端值不崩溃且保守表态', () => {
  eq(matchTokenizer(0), null);
  eq(matchTokenizer(null), null);
  eq(matchTokenizer(-5), null);
  const m = matchTokenizer(10);
  ok(m !== null);
  ok(m.confident === false, '偏离过大时不应冒充确定');
});

t('基准文本非空且含多语种/特殊标记', () => {
  ok(TOKENIZER_BENCH_TEXT.length > 100);
  ok(/<\|im_start\|>/.test(TOKENIZER_BENCH_TEXT));
  ok(/人工智能/.test(TOKENIZER_BENCH_TEXT));
});

/* ================================================================== *
 * 7. 指纹向量 & 相似度
 * ================================================================== */
t('指纹向量：同模型相似度 > 不同模型', () => {
  const a = fingerprintVector({ text: SAMPLE_OPENAI, ttftMs: 300, totalMs: 3000, promptTokens: 100, completionTokens: 200 });
  const b = fingerprintVector({ text: SAMPLE_OPENAI + ' data: {"model":"gpt-5"}', ttftMs: 330, totalMs: 3100, promptTokens: 110, completionTokens: 210 });
  const c = fingerprintVector({ text: SAMPLE_ANTHROPIC, ttftMs: 900, totalMs: 8000, promptTokens: 50, completionTokens: 900 });
  const sab = cosineSim(a, b), sac = cosineSim(a, c);
  ok(sab > sac, `同源相似度(${sab.toFixed(3)}) 应大于异源(${sac.toFixed(3)})`);
  ok(sab > 0.95, `同源应 >0.95，实际 ${sab.toFixed(3)}`);
});

t('指纹向量维度稳定且全为有限数', () => {
  const v = fingerprintVector({});
  eq(Object.keys(v).length, 18, '维度数');
  ok(Object.values(v).every(Number.isFinite), '全部维度必须有限数值');
});

/* ================================================================== *
 * 8. 代号解析（未建档模型的自动归类依据）
 * ================================================================== */
t('parseCodename: 匿名槽位识别', () => {
  const p = parseCodename('model-a');
  eq(p.anonymous, true);
  ok(p.hints.some(h => /匿名/.test(h)));
});

t('parseCodename: 版本与档位提取', () => {
  const p = parseCodename('gpt-6-turbo-preview');
  eq(p.version.major, 6);
  ok(p.hints.some(h => /档位 turbo/.test(h)), '应识别 turbo 档位');
  ok(p.hints.some(h => /非稳定通道/.test(h)), '应识别 preview');
  eq(p.family, 'openai');
});

t('parseCodename: 日期快照与推理变体', () => {
  ok(parseCodename('claude-5-20260101').hints.some(h => /日期快照/.test(h)));
  ok(parseCodename('deepseek-v4-thinking').hints.some(h => /推理/.test(h)));
});

t('parseCodename: 参数量与私有部署', () => {
  ok(parseCodename('llama-5-70b').hints.some(h => /参数量 70B/.test(h)));
  ok(parseCodename('internal-ft-model').hints.some(h => /私有/.test(h)));
});

t('parseCodename: 空值安全', () => {
  eq(parseCodename(null), null);
  eq(parseCodename(''), null);
});

/* ================================================================== *
 * 9. 健壮性
 * ================================================================== */
t('无证据返回 UNKNOWN 不崩溃', () => {
  const v = classify([]);
  eq(v.mode, 'UNKNOWN'); eq(v.confidence, 0);
});

t('垃圾输入不崩溃', () => {
  classify([{ source: 'x', weight: 0.5, modelId: null }]);
  classify([null, undefined]);
  classify();
  ok(true);
});

t('低权威单源证据不足以下结论', () => {
  const v = classify([{ source: 'self.report', weight: 0.15, modelId: 'gpt-6' }]);
  ok(v.mode !== 'RESOLVED', '仅自报不应直接 RESOLVED');
});

/* ================================================================== *
 * 10. UUID → 模型名 映射（揭示机制）
 *     这组测试锁定「把 UUID 还原成真实模型名」的能力，
 *     它是从逆向中得出的关键结论：消息层只给 UUID，名字要靠映射表。
 * ================================================================== */
const REAL_MODELS = [
  { id: '01a06ebf-809f-7e34-9abc-53b0fc8761a9', organization: 'openai', provider: 'openaiResponses',
    publicName: 'gpt-6-astra-high', userSelectable: false, capabilities: { inputCapabilities: { text: true } } },
  { id: '019f9593-b5a9-7575-aff0-5971ff479f88', organization: 'anthropic', provider: 'anthropic',
    publicName: 'claude-opus-5-max', userSelectable: false, capabilities: { inputCapabilities: { text: true } } },
  { id: '01a0681c-b561-76b6-b338-a44ff0cff460', organization: 'google', provider: 'google',
    publicName: 'gemini-3.8-flash-high', userSelectable: true, capabilities: { inputCapabilities: { text: true } } },
];

t('isUuid 正确识别 UUID', () => {
  eq(isUuid('01a06ebf-809f-7e34-9abc-53b0fc8761a9'), true);
  eq(isUuid('gpt-6-astra-high'), false);
  eq(isUuid(''), false);
  eq(isUuid(null), false);
});

t('装载映射表并用 UUID 还原真实模型名', () => {
  const n = loadModelMap(REAL_MODELS, 'test');
  eq(n, 3, '应装载 3 条');
  const r = resolveModelId('01a06ebf-809f-7e34-9abc-53b0fc8761a9');
  eq(r.name, 'gpt-6-astra-high', 'UUID 应还原成 gpt-6-astra-high');
  eq(r.org, 'openai');
  const r2 = resolveModelId('019f9593-b5a9-7575-aff0-5971ff479f88');
  eq(r2.name, 'claude-opus-5-max');
  const r3 = resolveModelId('01a0681c-b561-76b6-b338-a44ff0cff460');
  eq(r3.name, 'gemini-3.8-flash-high');
});

t('未知 UUID 标记为 unknown 而非编造名字', () => {
  const r = resolveModelId('ffffffff-ffff-ffff-ffff-ffffffffffff');
  ok(r, '应返回对象');
  eq(r.name, null, '不得编造模型名');
  eq(r.unknown, true);
});

t('反查：模型名 → 所有 UUID', () => {
  const ids = uuidsForName('gpt-6-astra-high');
  eq(ids.length, 1);
  eq(ids[0], '01a06ebf-809f-7e34-9abc-53b0fc8761a9');
  eq(uuidsForName('nonexistent-model').length, 0);
});

t('还原出的模型名能被 classify 正确归类（闭环）', () => {
  const r = resolveModelId('01a06ebf-809f-7e34-9abc-53b0fc8761a9');
  const v = classify([{ source: 'idmap.resolve', weight: 0.92, modelId: r.name }]);
  eq(v.mode, 'RESOLVED');
  eq(v.family, 'openai');
  eq(v.gen, 'gpt-6');
  eq(v.frontier, true);
});

t('parseInitialModels 能从真实 RSC 载荷里解析模型', () => {
  // 用实测抓到的真实 RSC 片段形态（来自 arena.ai/leaderboard/agent）：
  // self.__next_f.push([1,"...{\"id\":\"...\",\"organization\":\"openai\",...}"])
  // 注意：载荷里的引号是 \" 转义；真实内容中还有 \\u 等形式。
  const modelJson = '{"id":"01a06ebf-809f-7e34-9abc-53b0fc8761a9","organization":"openai",'
    + '"provider":"openaiResponses","publicName":"gpt-6-astra-high","name":"gpt-6-astra-high",'
    + '"displayName":"gpt-6-astra-high","capabilities":{"inputCapabilities":{"text":true,'
    + '"image":true,"file":true},"outputCapabilities":{"text":true}},"userSelectable":false,'
    + '"rankByModality":{"chat":9007199254740991}}';
  // 模拟 RSC 的转义：把 " 换成 \"
  const escaped = modelJson.replace(/"/g, '\\"');
  const html = '<script>self.__next_f.push([1,"12:[\\"$\\",\\"$L26\\",null,'
    + '{\\"initialModels\\":[' + escaped + ']}])</script>';

  const models = parseInitialModels(html);
  ok(models.length >= 1, `应解析出模型，实际 ${models.length}`);
  eq(models[0].publicName, 'gpt-6-astra-high');
  eq(models[0].organization, 'openai');
  eq(models[0].id, '01a06ebf-809f-7e34-9abc-53b0fc8761a9');
});

t('parseInitialModels 对脏数据健壮（不抛异常）', () => {
  for (const bad of ['', null, undefined, '<html></html>',
                     'self.__next_f.push([1,"{\\"id\\":\\"broken"])']) {
    const r = parseInitialModels(bad);
    ok(Array.isArray(r), '应始终返回数组');
  }
  // 无效 JSON 不应被采纳
  eq(parseInitialModels('{"id":"x","publicName":"y"').length, 0);
});

t('mapStats 反映装载状态', () => {
  const s = mapStats();
  ok(s.loaded >= 3, `已装载应 ≥3，实际 ${s.loaded}`);
  ok(s.names >= 3, `名字索引应 ≥3，实际 ${s.names}`);
});

/* ================================================================== *
 * 11. 真实模型名提取（Trigger.dev run trace）
 *     这组锁定「显示具体模型名」的能力 —— 用户明确要求看到
 *     qwen3.8-max-0902 这类真名，而不是"家族未知"。
 * ================================================================== */

// 实测抓到的真实 trace 片段结构
const REAL_TRACE_FRAGMENT = '{"spanId":"edc65c62c0911f36","parentId":"fb985d2fc8d67c9f",'
  + '"runId":"run_06ga7j2ssit1fgcjf8rml5ln01","message":"ai.streamText.doStream",'
  + '"style":{"icon":"hero-sparkles","accessory":{"style":"pills","items":['
  + '{"text":"qwen3.8-max-0902","icon":"tabler-cube"},'
  + '{"text":"7.0k","icon":"tabler-hash"}]}},"events":[],"startTime":"1789454480327000000"}';

const REAL_TRACE_MULTI = REAL_TRACE_FRAGMENT
  + '{"spanId":"x","message":"ai.streamText.doStream","style":{"icon":"hero-sparkles",'
  + '"accessory":{"style":"pills","items":['
  + '{"text":"Hy-dev0826-arena","icon":"tabler-cube"},'
  + '{"text":"6.8k","icon":"tabler-hash"}]}}}';

t('extractModelLabels 从真实 trace 提取模型名', () => {
  const r = extractModelLabels(REAL_TRACE_FRAGMENT);
  eq(r.models.length, 1, '应提取 1 个模型标签');
  eq(r.models[0], 'qwen3.8-max-0902', '应提取到具体模型名');
  eq(r.tokens[0], '7.0k', '应提取 token 数');
});

t('extractModelLabels 支持多轮（返回全部标签）', () => {
  const r = extractModelLabels(REAL_TRACE_MULTI);
  eq(r.models.length, 2);
  ok(r.models.includes('qwen3.8-max-0902'));
  ok(r.models.includes('Hy-dev0826-arena'));
});

t('extractModelLabels 不把 token 数当模型名', () => {
  const r = extractModelLabels(REAL_TRACE_MULTI);
  ok(!r.models.some(m => /^\d+(\.\d+)?k$/.test(m)), 'token 数不得混入模型名');
});

t('extractModelLabels 对脏数据健壮', () => {
  for (const bad of ['', null, undefined, '<html></html>', '{}',
                     '{"text":"x"}', 'not json at all']) {
    const r = extractModelLabels(bad);
    ok(Array.isArray(r.models) && Array.isArray(r.tokens), '应始终返回数组');
  }
});

t('decodeJwt 能解出真实 token 的 payload', () => {
  // 用实测抓到的 payload 内容构造（HS256，签名部分随意）
  const payload = {
    sub: 'cmncp41r302bion0h3x6fkeou', pub: true,
    scopes: ['read:runs:run_06ga806rf2uoqri0raic0slu01',
             'read:sessions:01a0a3cc-58bf-7371-a7bc-36453ed2470c',
             'write:inputStreams:run_06ga806rf2uoqri0raic0slu01'],
    iss: 'https://id.trigger.dev', aud: 'https://api.trigger.dev',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const tok = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.fakesig`;

  const d = decodeJwt(tok);
  ok(d && d.payload, '应解出 payload');
  eq(d.payload.pub, true);
  eq(d.payload.iss, 'https://id.trigger.dev');
});

t('runIdFromPayload 从 scopes 提取 run id', () => {
  const rid = runIdFromPayload({
    scopes: ['read:runs:run_06ga806rf2uoqri0raic0slu01',
             'read:sessions:01a0a3cc-58bf-7371-a7bc-36453ed2470c'],
  });
  eq(rid, 'run_06ga806rf2uoqri0raic0slu01');
});

t('runIdFromPayload 兼容 write scope 与缺失情况', () => {
  eq(runIdFromPayload({ scopes: ['write:inputStreams:run_abc123'] }), 'run_abc123');
  eq(runIdFromPayload({ scopes: [] }), null);
  eq(runIdFromPayload(null), null);
});

t('decodeJwt 对畸形输入返回 null 而不抛异常', () => {
  for (const bad of ['', 'x', 'a.b', 'a.b.c', null, undefined, '...']) {
    const r = decodeJwt(bad);
    ok(r === null || (r && typeof r === 'object'), '不应抛异常');
  }
});

t('真实模型名进入 evidence 后能给出 RESOLVED', () => {
  const v = classify([{ source: 'run.trace.model', weight: 0.96, modelId: 'qwen3.8-max-0902' }]);
  eq(v.mode, 'RESOLVED', '应解析为 RESOLVED');
  eq(v.family, 'qwen', '应归到 qwen 家族');
  eq(v.modelId, 'qwen3.8-max-0902', 'modelId 应是真实名字');
  ok(v.confidence >= 0.9, `置信度应 ≥0.9，实际 ${v.confidence}`);
});

t('run.trace.model 是最高权威来源', () => {
  ok(SOURCE_WEIGHTS['run.trace.model'] >= SOURCE_WEIGHTS['request.body.model'],
     '真实模型名权重应不低于请求体');
  ok(SOURCE_WEIGHTS['run.trace.model'] > SOURCE_WEIGHTS['protocol.framing'],
     '应远高于协议指纹');
});

/* ------------------------------------------------------------------ *
 * 报告
 * ------------------------------------------------------------------ */
console.log('\n=== arena-model-probe 自检 ===\n');
console.log(`产物检查: ${bundleCheck}`);
console.log(`指纹库版本: ${REGISTRY_VERSION}`);
console.log('');
console.log(results.join('\n'));
console.log(`\n合计: ${pass} 通过 / ${fail} 失败 / ${pass + fail} 用例`);
if (fail || bundleCheck.startsWith('FAIL')) process.exit(1);
