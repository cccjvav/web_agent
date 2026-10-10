'use strict';
// F103 (review P2-3 / D-26): explain an upstream chat/completions failure without reflecting it.
//
// The project never shows provider error bodies to the user (they can carry tokens, request ids or
// arbitrary text), so until now every failure read "模型 HTTP 400 请求失败" -- context overflow,
// a dead API key and a gateway that rejects `stream` all looked the same. This module parses the
// body for an error *code*, matches a few well-known message shapes, and maps the result onto a
// fixed set of categories whose wording is written here. No fragment of the body is copied out.

const CATEGORIES = Object.freeze({
  context: '对话超出模型上下文长度，请清空历史、缩短消息或换上下文更大的模型',
  stream: '该模型不接受流式请求',
  auth: 'API Key 无效或已失效，请在设置里重新填写',
  forbidden: '该 Key 无权使用此模型或端点',
  not_found: '模型不存在或该端点不提供此模型 ID，请核对设置里的模型 ID',
  endpoint: '端点地址不存在，请核对 Base URL（多数服务以 /v1 这类版本路径结尾，不要带 /chat/completions）和模型 ID',
  quota: '配额或余额不足，请到 Provider 控制台核对',
  rate_limit: '触发限流，请稍后重试',
  overloaded: '模型服务繁忙，请稍后重试',
  upstream: '模型服务端错误，请稍后重试',
  bad_request: '上游拒绝了请求参数（原文未回显）',
  http: ''
});

// Rules are tried in order; the first whose code/param/message matches wins. Message patterns are
// deliberately narrow and only used where a false positive is harmless ("token" alone would match
// max_tokens complaints, so authentication is decided by code/status only).
const RULES = [
  { category: 'context', codes: ['context_length_exceeded', 'context_window_exceeded', 'prompt_too_long', 'input_too_long', 'request_too_large'],
    pattern: /context[ _-]?(length|window)|maximum context|too many tokens|token limit|tokens? exceed|exceeds? the (maximum|model|context|limit)|input is too long|prompt is too long|reduce (the )?length|上下文|超过.*长度|超长|输入过长/i },
  { category: 'stream', params: ['stream', 'stream_options'], pattern: /\bstream(ing)?\b/i, statuses: [400, 422] },
  { category: 'auth', codes: ['invalid_api_key', 'authentication_error', 'invalid_authentication', 'unauthorized', 'invalid_token', 'invalid_request_error:authentication'] },
  { category: 'forbidden', codes: ['permission_denied', 'insufficient_permissions', 'access_denied', 'forbidden', 'model_access_denied'] },
  { category: 'not_found', codes: ['model_not_found', 'not_found_error', 'not_found', 'unknown_model'],
    pattern: /model.{0,40}(not found|does not exist|not exist|unknown|unavailable|not supported)|no such model|unknown model|模型不存在|不支持的模型/i },
  { category: 'quota', codes: ['insufficient_quota', 'insufficient_balance', 'billing_not_active', 'quota_exceeded', 'insufficient_user_quota', 'account_deactivated'],
    pattern: /quota|billing|balance|credits?\b|余额|欠费|配额|额度/i },
  { category: 'rate_limit', codes: ['rate_limit_exceeded', 'rate_limit_error', 'too_many_requests', 'requests_limit_exceeded', 'tokens_limit_exceeded', 'rate_limit'],
    pattern: /rate[ _-]?limit|too many requests|throttl|请求过于频繁|限流|频率/i },
  { category: 'overloaded', codes: ['overloaded_error', 'server_busy', 'engine_overloaded', 'service_unavailable'],
    pattern: /overloaded|server is busy|at capacity|服务繁忙|系统繁忙/i }
];

const STATUS_DEFAULTS = [[401, 'auth'], [403, 'forbidden'], [404, 'endpoint'], [413, 'context'], [429, 'rate_limit'], [503, 'overloaded'], [529, 'overloaded']];

function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

function parseBody(body) {
  if (isRecord(body)) return body;
  if (typeof body !== 'string') return null;
  const text = body.trim();
  if (!text.startsWith('{')) return null;
  try { const data = JSON.parse(text); return isRecord(data) ? data : null; } catch { return null; }
}

// The fields a classifier may look at. Strings are clipped so a hostile body cannot turn the regex
// pass into a CPU sink; nothing here is ever returned to a caller.
function upstreamFields(body) {
  const data = parseBody(body);
  const str = value => (typeof value === 'string' ? value.slice(0, 2000) : '');
  if (!data) return { code: '', type: '', message: '', param: '' };
  const err = isRecord(data.error) ? data.error : data;
  return {
    code: str(err.code) || str(data.code),
    type: str(err.type),
    message: str(err.message) || str(data.message) || (typeof data.error === 'string' ? str(data.error) : ''),
    param: str(err.param)
  };
}

function matchRule(rule, status, fields) {
  if (rule.statuses && !rule.statuses.includes(status)) return false;
  const code = fields.code.toLowerCase(), type = fields.type.toLowerCase();
  if (rule.codes && (rule.codes.includes(code) || rule.codes.includes(type))) return true;
  if (rule.params && rule.params.includes(fields.param)) return true;
  return Boolean(rule.pattern && fields.message && rule.pattern.test(fields.message));
}

function categoryFor(status, fields) {
  for (const rule of RULES) if (matchRule(rule, status, fields)) return rule.category;
  for (const [code, category] of STATUS_DEFAULTS) if (status === code) return category;
  if (Number.isInteger(status) && status >= 500) return 'upstream';
  if (status === 400 || status === 422) return 'bad_request';
  return 'http';
}

// Rough token count for a request body: CJK/kana/hangul characters cost about one token each,
// everything else about 3.5 characters per token. Good enough to tell "8k" from "200k"; it is
// shown as an estimate and never used to truncate anything.
const WIDE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;
function estimateTokens(text) {
  const source = typeof text === 'string' ? text : (text === undefined ? '' : JSON.stringify(text) || '');
  const wide = (source.match(WIDE) || []).length;
  return Math.ceil(wide + (source.length - wide) / 3.5);
}

// Model catalogues store contextSize as display text ("128K", "1M", "32768", "200k tokens").
function parseContextSize(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*([kKmM])?(?![a-zA-Z0-9])/.exec(String(value === undefined || value === null ? '' : value));
  if (!match) return null;
  if (!match[2] && match[1].includes('.')) return null; // "0.5" tokens is not a size
  const unit = match[2] ? (match[2].toLowerCase() === 'k' ? 1000 : 1000000) : 1;
  const tokens = Math.round(parseFloat(match[1]) * unit);
  return tokens > 0 ? tokens : null;
}

// describeModelFailure({status, body, requestBody?, prefix?}) -> {category, status, message, retryWithoutStream, estimate}
function describeModelFailure({ status, body, requestBody, prefix } = {}) {
  const code = Number.isInteger(status) ? status : 0;
  const category = categoryFor(code, upstreamFields(body));
  let hint = CATEGORIES[category];
  const estimate = category === 'context' && requestBody !== undefined ? estimateTokens(requestBody) : null;
  if (estimate !== null) hint = hint.replace('，请', `（本次请求约 ${estimate} tokens，估算值），请`);
  const head = prefix || (code >= 400 ? `模型 HTTP ${code} 请求失败` : '模型返回了错误');
  return {
    category,
    status: code,
    message: hint ? `${head}：${hint}` : head,
    // Only shape complaints are worth one retry without `stream`; everything else fails the same way.
    retryWithoutStream: category === 'stream' || (code === 400 && category === 'bad_request'),
    estimate
  };
}

function modelFailure(input) {
  const verdict = describeModelFailure(input);
  const error = new Error(verdict.message);
  error.code = 'E_MODEL_HTTP';
  error.status = verdict.status;
  error.category = verdict.category;
  if (verdict.estimate !== null) error.estimate = verdict.estimate;
  return error;
}

module.exports = { CATEGORIES, describeModelFailure, modelFailure, estimateTokens, parseContextSize };
