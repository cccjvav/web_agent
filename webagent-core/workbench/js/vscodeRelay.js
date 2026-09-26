// Transport for js/api.js inside the VS Code "Web Agent 设置" panel (R6 phase 2). Only the panel entry loads
// this; the browser workbench never imports it and keeps plain fetch. Each request is posted to the extension
// process (webagent-core/extension/apiRelay.js), which forwards it to the local host and answers once.
// The promise follows fetch semantics: an HTTP answer of any status resolves with a Response; a relay refusal,
// network failure or deadline rejects with a TypeError; an abort rejects with an AbortError and tells the
// extension to cancel.

function abortError() {
  if (typeof DOMException === 'function') return new DOMException('The operation was aborted.', 'AbortError');
  return Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
}

// Response forbids a body for these statuses.
const NULL_BODY = new Set([101, 204, 205, 304]);
function defaultResponse(body, status, contentType) {
  return new Response(NULL_BODY.has(status) ? null : body, { status, headers: contentType ? { 'content-type': contentType } : {} });
}

// postMessage(message) sends to the extension; onMessage(handler) subscribes to its replies.
export function createRelayTransport({ postMessage, onMessage, makeResponse = defaultResponse }) {
  if (typeof postMessage !== 'function' || typeof onMessage !== 'function') throw new TypeError('postMessage and onMessage are required');
  const pending = new Map();
  const prefix = Math.random().toString(36).slice(2, 10);
  let sequence = 0;

  onMessage(message => {
    if (!message || message.type !== 'webagent-api-result') return;
    const entry = pending.get(message.id);
    if (!entry) return; // Aborted or unknown: the answer is dropped.
    pending.delete(message.id);
    entry.cleanup();
    if (message.ok === true) {
      try { entry.resolve(makeResponse(typeof message.body === 'string' ? message.body : '', message.status, message.contentType)); }
      catch (error) { entry.reject(new TypeError('设置页无法解析主机响应：' + error.message)); }
    } else entry.reject(new TypeError(String(message.error || '设置页请求失败，结果未确认')));
  });

  return function relayTransport(input, init = {}) {
    const signal = init && init.signal;
    if (signal && signal.aborted) return Promise.reject(abortError());
    const id = `${prefix}-${++sequence}`;
    const path = typeof input === 'string' ? input : String((input && input.url) || '');
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (!pending.delete(id)) return;
        postMessage({ type: 'webagent-api-abort', id });
        reject(abortError());
      };
      pending.set(id, { resolve, reject, cleanup: () => { if (signal) signal.removeEventListener('abort', onAbort); } });
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      try {
        postMessage({ type: 'webagent-api', id, method: String((init && init.method) || 'GET').toUpperCase(), path,
          ...(init && init.body != null ? { body: init.body } : {}) });
      } catch (error) {
        pending.delete(id);
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(new TypeError('设置页无法发送请求：' + ((error && error.message) || error)));
      }
    });
  };
}

// The two browser services the webview lacks (see setHostServices in api.js), answered by the extension:
// { type: 'webagent-service', id, service: 'confirm' | 'copy', text } -> { type: 'webagent-service-result', id, ok, value?, error? }.
// confirm resolves true only for an explicit yes and false for "no", a closed dialog or a refused request, so a lost
// answer can never count as consent; copy rejects when the extension did not confirm the clipboard write.
export function createHostServices({ postMessage, onMessage }) {
  if (typeof postMessage !== 'function' || typeof onMessage !== 'function') throw new TypeError('postMessage and onMessage are required');
  const pending = new Map();
  const prefix = 's' + Math.random().toString(36).slice(2, 10);
  let sequence = 0;
  onMessage(message => {
    if (!message || message.type !== 'webagent-service-result') return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    entry(message);
  });
  function ask(service, text) {
    const id = `${prefix}-${++sequence}`;
    return new Promise(resolve => {
      pending.set(id, resolve);
      try { postMessage({ type: 'webagent-service', id, service, text: String(text) }); }
      catch (error) { pending.delete(id); resolve({ ok: false, error: '设置页无法联系插件：' + ((error && error.message) || error) }); }
    });
  }
  return {
    async confirm(text) {
      const reply = await ask('confirm', text);
      return reply.ok === true && reply.value === true;
    },
    async copyText(text) {
      const reply = await ask('copy', text);
      if (reply.ok !== true) throw new Error(String(reply.error || '复制未确认'));
    }
  };
}
