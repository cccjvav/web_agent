'use strict';
const { AsyncLocalStorage } = require('async_hooks');
const { TextDecoder } = require('util');
const { performance } = require('perf_hooks');

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
        try { Promise.resolve(reader.cancel()).catch(() => {}); } catch (_) { /* retain the stable budget error */ }
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
async function fetchText(url, options, timeoutMs = DEFAULT_TIMEOUT_MS, limits, fetchFn) {
  checkCancelled();
  // A non-finite or non-positive timeout would make setTimeout fire immediately (or never) and
  // silently defeat the whole budget, so reject it loudly instead. From branch 01a0c932.
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs 必须是正有限数');
  const { fetchImpl, ...init } = options || {};
  // Two injection seams, both honoured: `options.fetchImpl` (used by callers that already expose
  // an injected fetch through their own public API) and a trailing positional argument. Resolving
  // the global lazily also matters -- a caller that supplies a transport must not require a global
  // `fetch` to exist at all, which is exactly the case in a bare vm context.
  const send = typeof fetchImpl === 'function' ? fetchImpl
    : typeof fetchFn === 'function' ? fetchFn
      : (typeof fetch === 'function' ? fetch : null);
  if (!send) throw new TypeError('没有可用的 fetch 实现');
  const maxBytes = responseBudget(limits), expires = performance.now() + timeoutMs;
  const parent = currentSignal(), controller = new AbortController();
  const cancel = () => controller.abort();
  const checkDeadline = () => {
    if (controller.signal.aborted || performance.now() >= expires) {
      cancel();
      const error = new Error('HTTP 请求超过截止时间'); error.code = 'E_TIMEOUT'; throw error;
    }
  };
  if (parent) parent.addEventListener('abort', cancel, { once: true });
  // Aborting the signal is a REQUEST to stop; it is not a guarantee that the transport honours it.
  // An implementation that ignores `signal` (a test double, or a poorly behaved polyfill) would
  // otherwise leave this promise pending forever and the deadline would be decorative. Race the
  // send against a timer that actually settles, so the budget is enforced by us, not by the peer.
  let expire;
  const timedOut = new Promise((_resolve, reject) => {
    expire = setTimeout(() => {
      cancel();
      const error = new Error('HTTP 请求超过截止时间');
      error.code = 'E_TIMEOUT';
      reject(error);
    }, timeoutMs);
    if (expire.unref) expire.unref();
  });
  const timer = expire;
  try {
    if (parent && parent.aborted) cancel();
    const response = await Promise.race([send(url, { ...init, signal: controller.signal }), timedOut]);
    // Check the deadline after the response head AND after the body: a slow trickle can keep a
    // stream technically alive long past the budget without ever aborting. From branch 01a0c932.
    checkCancelled(); checkDeadline();
    const text = await Promise.race([readResponseText(response, { maxBytes }), timedOut]);
    checkCancelled(); checkDeadline();
    return { response, text };
  } catch (error) {
    // Transport implementations may surface an abort as a socket/type error.
    // Preserve cancellation/deadline intent rather than relying on its error name.
    checkCancelled(); checkDeadline();
    throw error;
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
