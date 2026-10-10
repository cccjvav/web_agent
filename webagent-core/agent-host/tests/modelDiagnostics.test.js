'use strict';
// F103 (review P2-3 / D-26): provider failures map onto fixed categories with fixed wording; the
// body is only ever *matched*, never copied; the retry-without-stream decision follows the category;
// token and context-size estimates are rough but monotone and reject garbage.
const assert = require('assert');
const { CATEGORIES, describeModelFailure, modelFailure, estimateTokens, parseContextSize } = require('../src/agent/modelDiagnostics');

const SECRET = 'PROVIDER_SECRET_DETAIL_9f3a';
const clean = verdict => { assert.ok(!verdict.message.includes(SECRET), verdict.message); return verdict; };
const describe = (status, body, extra) => clean(describeModelFailure({ status, body, ...extra }));
const openai = (code, message, extra = {}) => ({ error: { message: `${message} ${SECRET}`, type: 'invalid_request_error', code, ...extra } });

// --- Categories by code, by status default and by message shape. ---
assert.deepStrictEqual(Object.keys(CATEGORIES), ['context', 'stream', 'auth', 'forbidden', 'not_found', 'endpoint', 'quota', 'rate_limit', 'overloaded', 'upstream', 'bad_request', 'http']);
assert.ok(Object.isFrozen(CATEGORIES));

for (const [label, status, body, category, retry] of [
  ['openai context code', 400, openai('context_length_exceeded', "This model's maximum context length is 8192 tokens"), 'context', false],
  ['context by message only', 400, { error: { message: `Input is too long for requested model. ${SECRET}` } }, 'context', false],
  ['chinese gateway context', 400, { code: 20015, message: `上下文长度超过限制 ${SECRET}` }, 'context', false],
  ['413 default', 413, `<html>${SECRET}</html>`, 'context', false],
  ['stream param', 400, { error: { message: SECRET, param: 'stream' } }, 'stream', true],
  ['stream_options param', 400, openai('unsupported_parameter', 'Unsupported parameter', { param: 'stream_options' }), 'stream', true],
  ['streaming by message', 422, { detail: 'x', error: { message: `Streaming is not supported for this deployment ${SECRET}` } }, 'stream', true],
  ['"upstream" is not "stream"', 400, { error: { message: `upstream connector failed ${SECRET}` } }, 'bad_request', true],
  ['stream words on a 500 stay upstream', 500, { error: { message: `stream broke ${SECRET}` } }, 'upstream', false],
  ['invalid key code', 401, openai('invalid_api_key', 'Incorrect API key provided'), 'auth', false],
  ['anthropic-style auth type', 401, { type: 'error', error: { type: 'authentication_error', message: SECRET } }, 'auth', false],
  ['401 default', 401, SECRET, 'auth', false],
  ['auth is never decided by message text', 400, { error: { message: `invalid max_tokens token count ${SECRET}` } }, 'bad_request', true],
  ['403 default', 403, '', 'forbidden', false],
  ['permission code on 400', 400, openai('permission_denied', 'no'), 'forbidden', false],
  ['model_not_found', 404, openai('model_not_found', 'The model `x` does not exist'), 'not_found', false],
  ['model missing by message on 400', 400, { error: { message: `The model gpt-x does not exist or you do not have access to it ${SECRET}` } }, 'not_found', false],
  ['insufficient_quota', 429, openai('insufficient_quota', 'You exceeded your current quota', { type: 'insufficient_quota' }), 'quota', false],
  ['balance by message', 402, { error: { message: `Insufficient Balance ${SECRET}` } }, 'quota', false],
  ['rate limit code', 429, openai('rate_limit_exceeded', 'Rate limit reached'), 'rate_limit', false],
  ['429 html default', 429, `<h1>${SECRET}</h1>`, 'rate_limit', false],
  ['overloaded code', 529, { type: 'error', error: { type: 'overloaded_error', message: SECRET } }, 'overloaded', false],
  ['503 default', 503, '', 'overloaded', false],
  ['502 default', 502, SECRET, 'upstream', false],
  ['plain 400', 400, `{"error":"${SECRET}"}`, 'bad_request', true],
  ['plain 422', 422, { detail: [{ msg: SECRET }] }, 'bad_request', false],
  ['odd status', 418, SECRET, 'http', false],
  ['no status', undefined, SECRET, 'http', false],
  ['non-JSON body', 400, `not json ${SECRET}`, 'bad_request', true],
  ['array body', 400, [SECRET], 'bad_request', true],
  ['string error field', 404, { error: `Model not found: ${SECRET}` }, 'not_found', false],
  // A bare 404 is far more often a wrong Base URL (missing /v1, pasted /chat/completions) than a missing model.
  ['404 without a model code', 404, `<html>Cannot POST /chat/completions ${SECRET}</html>`, 'endpoint', false],
  ['404 empty', 404, '', 'endpoint', false]
]) {
  const verdict = describe(status, body);
  assert.strictEqual(verdict.category, category, label);
  assert.strictEqual(verdict.retryWithoutStream, retry, label + ' retry');
  assert.strictEqual(verdict.status, Number.isInteger(status) ? status : 0, label + ' status');
}

// --- Wording: fixed head + fixed hint; estimate appended only for context overflows. ---
assert.strictEqual(describe(401, '').message, '模型 HTTP 401 请求失败：API Key 无效或已失效，请在设置里重新填写');
assert.strictEqual(describe(418, '').message, '模型 HTTP 418 请求失败');
assert.strictEqual(describe(404, '').message, '模型 HTTP 404 请求失败：端点地址不存在，请核对 Base URL（多数服务以 /v1 这类版本路径结尾，不要带 /chat/completions）和模型 ID');
assert.strictEqual(describe(200, { error: { code: 'model_not_found' } }).message, '模型返回了错误：模型不存在或该端点不提供此模型 ID，请核对设置里的模型 ID');
assert.strictEqual(describe(200, { error: { code: 'rate_limit_exceeded' } }, { prefix: '模型在流式响应中报告错误' }).message, '模型在流式响应中报告错误：触发限流，请稍后重试');
{
  const plain = describe(400, openai('context_length_exceeded', 'x'));
  assert.strictEqual(plain.message, '模型 HTTP 400 请求失败：对话超出模型上下文长度，请清空历史、缩短消息或换上下文更大的模型');
  assert.strictEqual(plain.estimate, null);
  const sized = describe(400, openai('context_length_exceeded', 'x'), { requestBody: JSON.stringify({ messages: [{ role: 'user', content: '你好'.repeat(100) }] }) });
  assert.match(sized.message, /^模型 HTTP 400 请求失败：对话超出模型上下文长度（本次请求约 \d+ tokens，估算值），请清空历史/);
  assert.ok(sized.estimate >= 200, 'the estimate covers the whole serialized request');
  assert.strictEqual(describe(401, '', { requestBody: 'x'.repeat(1000) }).estimate, null, 'only context failures carry an estimate');
}
{
  const error = modelFailure({ status: 429, body: openai('insufficient_quota', 'x', { type: 'insufficient_quota' }) });
  assert.ok(error instanceof Error);
  assert.strictEqual(error.code, 'E_MODEL_HTTP');
  assert.strictEqual(error.status, 429);
  assert.strictEqual(error.category, 'quota');
  assert.strictEqual(Object.hasOwn(error, 'estimate'), false);
  assert.ok(!error.message.includes(SECRET));
  assert.strictEqual(modelFailure({ status: 400, body: openai('context_length_exceeded', 'x'), requestBody: 'abc' }).estimate, 1);
}

// --- Hostile bodies: deep, huge or non-string fields neither throw nor take long. ---
{
  const started = Date.now();
  describe(400, { error: { message: 'a'.repeat(4 * 1024 * 1024), code: { nested: true }, param: ['stream'] } });
  describe(400, '{'.repeat(100000));
  describe(400, JSON.stringify({ error: { message: 'x'.repeat(1024 * 1024) + ' stream' } }));
  assert.ok(Date.now() - started < 1500, 'classification stays cheap on large bodies');
  assert.strictEqual(describe(400, { error: { message: 'x'.repeat(5000) + ' context length exceeded' } }).category, 'bad_request', 'messages are clipped to 2000 characters before matching');
  assert.strictEqual(describe(400, { error: { code: 42, message: null } }).category, 'bad_request');
}

// --- estimateTokens: CJK ~1 token per character, everything else ~3.5 characters per token. ---
assert.strictEqual(estimateTokens(''), 0);
assert.strictEqual(estimateTokens(undefined), 0);
assert.strictEqual(estimateTokens('abcd'.repeat(35)), 40);
assert.strictEqual(estimateTokens('汉字测试一二三四五六'), 10);
assert.strictEqual(estimateTokens('汉字 and 7 chars'), Math.ceil(2 + 13 / 3.5));
assert.strictEqual(estimateTokens({ a: '汉' }), Math.ceil(1 + 8 / 3.5));
assert.ok(estimateTokens('x'.repeat(1000)) < estimateTokens('x'.repeat(2000)));

// --- parseContextSize: catalogue display text -> tokens, garbage -> null. ---
for (const [input, expected] of [
  ['128K', 128000], ['128k', 128000], ['1M', 1000000], ['1.5M', 1500000], ['32768', 32768], [32768, 32768], ['200k tokens', 200000],
  [' 8K ', 8000], ['8k-context', 8000], ['', null], [undefined, null], [null, null], ['unknown', null], ['12345abc', null], [0, null],
  ['-5', null], [Infinity, null], ['gpt-4 128K', null], ['0.5', null], ['1e6', null]
]) assert.strictEqual(parseContextSize(input), expected, `parseContextSize(${JSON.stringify(input)})`);

console.log('modelDiagnostics: fixed-text failure categories, retry decision, estimate and context-size parsing passed');
