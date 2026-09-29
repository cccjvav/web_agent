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
// `onChunk(text, response)` (F102) sees each decoded piece as it arrives so a caller can act on a
// streaming body (SSE deltas) before the whole response is in, or apply a tighter budget of its
// own once it has seen the response headers; it must be synchronous, and an exception it throws
// cancels the body and fails the request. The full text is still returned, still bounded by
// maxBytes, so callers that only need the buffered body behave exactly as before.
function chunkObserver(limits) {
  const onChunk = limits && limits.onChunk;
  if (onChunk === undefined || onChunk === null) return null;
  if (typeof onChunk !== 'function') throw new TypeError('onChunk 必须是函数');
  return onChunk;
}
// `limits.idleMs` (F103, review D-28) is an inactivity budget that complements the total deadline:
// the response head, and then every decoded piece of the body, must arrive within idleMs of the
// previous one. A streamed answer can therefore run up to timeoutMs while a provider that goes
// silent is still given up on after idleMs. Undefined disables it.
function idleBudget(limits) {
  const idleMs = limits && limits.idleMs;
  if (idleMs === undefined || idleMs === null) return 0;
  if (!Number.isSafeInteger(idleMs) || idleMs <= 0) throw new TypeError('idleMs 必须是正安全整数');
  return idleMs;
}
// `limits.signal` (internal, set by fetchText) lets the deadline/idle timers cancel the body even
// through a transport that does not honour the request signal; the pending read then settles and
// the stream's cancel() runs instead of leaking a reader that waits forever.
function bodyAbort(limits) {
  const signal = limits && limits.signal;
  if (signal === undefined || signal === null) return null;
  if (!signal || typeof signal.addEventListener !== 'function') throw new TypeError('signal 必须是 AbortSignal');
  return signal;
}
async function readWebStream(body, maxBytes, onChunk, response, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  const cancel = () => { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch (_) { /* retain the caller-facing error */ } };
  if (signal) { if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true }); }
  let bytes = 0, text = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      const chunk = chunkBytes(part.value);
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        cancel();
        throw responseTooLarge(maxBytes);
      }
      const piece = decoder.decode(chunk, { stream: true });
      text += piece;
      if (onChunk && piece) {
        try { onChunk(piece, response); } catch (error) { cancel(); throw error; }
      }
    }
    const tail = decoder.decode();
    if (onChunk && tail) onChunk(tail, response);
    return text + tail;
  } finally {
    if (signal) signal.removeEventListener('abort', cancel);
    try { reader.releaseLock(); } catch (_) { /* already released/cancelled */ }
  }
}
async function readNodeStream(body, maxBytes, onChunk, response, signal) {
  const decoder = new TextDecoder('utf-8');
  const destroy = () => { if (typeof body.destroy === 'function') body.destroy(); };
  if (signal) { if (signal.aborted) destroy(); else signal.addEventListener('abort', destroy, { once: true }); }
  let bytes = 0, text = '';
  try {
    for await (const value of body) {
      const chunk = chunkBytes(value);
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        destroy();
        throw responseTooLarge(maxBytes);
      }
      const piece = decoder.decode(chunk, { stream: true });
      text += piece;
      if (onChunk && piece) {
        try { onChunk(piece, response); } catch (error) { destroy(); throw error; }
      }
    }
    const tail = decoder.decode();
    if (onChunk && tail) onChunk(tail, response);
    return text + tail;
  } finally {
    if (signal) signal.removeEventListener('abort', destroy);
  }
}
async function readResponseText(response, limits) {
  const maxBytes = responseBudget(limits), onChunk = chunkObserver(limits), signal = bodyAbort(limits);
  const body = response && response.body;
  if (body && typeof body.getReader === 'function') return readWebStream(body, maxBytes, onChunk, response, signal);
  if (body && typeof body[Symbol.asyncIterator] === 'function') return readNodeStream(body, maxBytes, onChunk, response, signal);
  // Test doubles and legacy fetch implementations may expose text() only. Production's
  // WHATWG Response takes the streaming branch above, so remote bytes are bounded pre-buffer.
  if (!response || typeof response.text !== 'function') throw new TypeError('无效的 HTTP 响应');
  const text = String(await response.text());
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw responseTooLarge(maxBytes);
  if (onChunk && text) onChunk(text, response);
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
  const maxBytes = responseBudget(limits), onChunk = chunkObserver(limits), idleMs = idleBudget(limits);
  const expires = performance.now() + timeoutMs;
  const parent = currentSignal(), controller = new AbortController();
  const cancel = () => controller.abort();
  // Whichever budget fires first owns the error; later checks must not rewrite an idle timeout
  // into a generic deadline just because the abort it caused is now visible on the signal.
  let failure = null;
  const expired = (message, reason) => {
    cancel();
    if (!failure) { failure = new Error(message); failure.code = 'E_TIMEOUT'; failure.reason = reason; }
    return failure;
  };
  const checkDeadline = () => {
    if (failure) throw failure;
    if (controller.signal.aborted || performance.now() >= expires) throw expired('HTTP 请求超过截止时间', 'deadline');
  };
  if (parent) parent.addEventListener('abort', cancel, { once: true });
  // Aborting the signal is a REQUEST to stop; it is not a guarantee that the transport honours it.
  // An implementation that ignores `signal` (a test double, or a poorly behaved polyfill) would
  // otherwise leave this promise pending forever and the deadline would be decorative. Race the
  // send against a timer that actually settles, so the budget is enforced by us, not by the peer.
  let expire;
  const timedOut = new Promise((_resolve, reject) => {
    expire = setTimeout(() => reject(expired('HTTP 请求超过截止时间', 'deadline')), timeoutMs);
    if (expire.unref) expire.unref();
  });
  const timer = expire;
  // The idle budget is a second racer, re-armed on every sign of life (response head, each piece).
  let idleTimer = null, idleReject = null;
  const idle = idleMs ? new Promise((_resolve, reject) => { idleReject = reject; }) : null;
  if (idle) idle.catch(() => {});
  const armIdle = () => {
    if (!idle) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => idleReject(expired(`HTTP 请求 ${Math.ceil(idleMs / 1000)} 秒内没有收到新数据`, 'idle')), idleMs);
    if (idleTimer.unref) idleTimer.unref();
  };
  const observe = idle
    ? (piece, response) => { armIdle(); if (onChunk) onChunk(piece, response); }
    : onChunk;
  const racers = promise => (idle ? [promise, timedOut, idle] : [promise, timedOut]);
  try {
    if (parent && parent.aborted) cancel();
    armIdle();
    const response = await Promise.race(racers(send(url, { ...init, signal: controller.signal })));
    // Check the deadline after the response head AND after the body: a slow trickle can keep a
    // stream technically alive long past the budget without ever aborting. From branch 01a0c932.
    checkCancelled(); checkDeadline();
    armIdle();
    const text = await Promise.race(racers(readResponseText(response, { maxBytes, onChunk: observe, signal: controller.signal })));
    checkCancelled(); checkDeadline();
    return { response, text };
  } catch (error) {
    // Transport implementations may surface an abort as a socket/type error.
    // Preserve cancellation/deadline intent rather than relying on its error name.
    checkCancelled(); checkDeadline();
    throw error;
  } finally {
    clearTimeout(timer); clearTimeout(idleTimer); if (parent) parent.removeEventListener('abort', cancel);
  }
}
module.exports = {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_RESPONSE_MAX_BYTES,
  runWithSignal,
  currentSignal,
  checkCancelled,
  readResponseText,
  responseTooLarge,
  fetchText
};
