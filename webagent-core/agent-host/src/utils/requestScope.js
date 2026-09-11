'use strict';
const { AsyncLocalStorage } = require('async_hooks');
const scope = new AsyncLocalStorage();
function runWithSignal(signal, fn) { return scope.run(signal, fn); }
function currentSignal() { return scope.getStore(); }
function checkCancelled() {
  const signal = currentSignal();
  if (signal && signal.aborted) {
    const err = new Error('任务已取消或超过截止时间'); err.code = 'E_CANCELLED'; throw err;
  }
}
async function fetchText(url, options, timeoutMs = 120000) {
  checkCancelled();
  const parent = currentSignal(), controller = new AbortController();
  const cancel = () => controller.abort();
  if (parent) parent.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs); if (timer.unref) timer.unref();
  try {
    if (parent && parent.aborted) cancel();
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    checkCancelled();
    return { response, text };
  } finally {
    clearTimeout(timer); if (parent) parent.removeEventListener('abort', cancel);
  }
}
module.exports = { runWithSignal, currentSignal, checkCancelled, fetchText };
