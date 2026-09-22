'use strict';
const { AsyncLocalStorage } = require('async_hooks');
const { TextDecoder } = require('util');

const scope = new AsyncLocalStorage();
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_RESPONSE_MAX_BYTES = 8 * 1024 * 1024;

function runWithSignal(signal, fn) { return scope.run(signal, fn); }
function currentSignal() { return scope.getStore(); }
function checkCancelled() {
  const signal = currentSignal();
  if (signal && signal.aborted) {
    const err = new Error('任务已取消或超过截止时间'); err.code = 'E_CANCELLED'; throw err;
  }
}
function responseTooLarge(maxBytes) {
  const err = new Error(`HTTP 响应超过 ${maxBytes} 字节上限`);
  err.code = 'E_RESPONSE_TOO_LARGE';
  err.maxBytes = maxBytes;
  return err;
}
function responseBudget(limits) {
  const maxBytes = limits && limits.maxBytes !== undefined
    ? limits.maxBytes
    : DEFAULT_RESPONSE_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new TypeError('maxBytes 必须是正安全整数');
  return maxBytes;
}
function chunkBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return Buffer.from(String(value));
}
async function readWebStream(body, maxBytes) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let bytes = 0, text = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      const chunk = chunkBytes(part.value);
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        try { await reader.cancel(); } catch (_) { /* retain the stable budget error */ }
        throw responseTooLarge(maxBytes);
      }
      text += decoder.decode(chunk, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    try { reader.releaseLock(); } catch (_) { /* already released/cancelled */ }
  }
}
async function readNodeStream(body, maxBytes) {
  const decoder = new TextDecoder('utf-8');
  let bytes = 0, text = '';
  for await (const value of body) {
    const chunk = chunkBytes(value);
    bytes += chunk.byteLength;
    if (bytes > maxBytes) {
      if (typeof body.destroy === 'function') body.destroy();
      throw responseTooLarge(maxBytes);
    }
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}
async function readResponseText(response, limits) {
  const maxBytes = responseBudget(limits);
  const body = response && response.body;
  if (body && typeof body.getReader === 'function') return readWebStream(body, maxBytes);
  if (body && typeof body[Symbol.asyncIterator] === 'function') return readNodeStream(body, maxBytes);
  // Test doubles and legacy fetch implementations may expose text() only. Production's
  // WHATWG Response takes the streaming branch above, so remote bytes are bounded pre-buffer.
  if (!response || typeof response.text !== 'function') throw new TypeError('无效的 HTTP 响应');
  const text = String(await response.text());
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw responseTooLarge(maxBytes);
  return text;
}
// `options.fetchImpl` lets a caller that already accepts an injected fetch (tests, or a module
// whose public API exposes `fetchFn`) keep that injection while still getting the timeout,
// parent-cancellation and byte budget. It is stripped before reaching the transport.
async function fetchText(url, options, timeoutMs = DEFAULT_TIMEOUT_MS, limits) {
  checkCancelled();
  const { fetchImpl, ...init } = options || {};
  const send = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  const parent = currentSignal(), controller = new AbortController();
  const cancel = () => controller.abort();
  if (parent) parent.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs); if (timer.unref) timer.unref();
  try {
    if (parent && parent.aborted) cancel();
    const response = await send(url, { ...init, signal: controller.signal });
    const text = await readResponseText(response, limits);
    checkCancelled();
    return { response, text };
  } finally {
    clearTimeout(timer); if (parent) parent.removeEventListener('abort', cancel);
  }
}
module.exports = {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_RESPONSE_MAX_BYTES,
  runWithSignal,
  currentSignal,
  checkCancelled,
  readResponseText,
  fetchText
};
