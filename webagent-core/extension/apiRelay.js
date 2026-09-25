'use strict';
// R6 phase 2: the "Web Agent 设置" webview never calls 127.0.0.1 itself. Its workbench modules send every
// request through js/api.js, whose VS Code transport posts it here; the extension process forwards it to the
// host this window started or attached to (the caller injects `send`, bound to agentHostUrl()).
//
// Deny by default. Only the routes the settings pages need are relayed. Deliberately absent:
//  * /api/chat, /api/tool/call, /api/pty/*, /api/files/*, /api/tasks/reset: chat, terminal and editor are not
//    settings; tool/call would turn the panel into an arbitrary tool runner.
//  * /api/external/*, /api/consensus/*: decision D4 keeps external MCP and multi-model in the web workbench
//    until the end of phase 2.
//  * /api/probe/*: the probes are paused and owned elsewhere.
// Requests leave the extension without Origin or Sec-Fetch-* headers and with Host 127.0.0.1, which is exactly
// the local CLI path the host already accepts; the host's own checks are not widened.
const ID = '[A-Za-z0-9_-]{1,128}';
const RULES = [
  ['GET', '/health'],
  ['GET', '/api/status'],
  ['GET', '/api/execution-control'], ['POST', '/api/execution-control'],
  ['GET', '/api/diagnostics'],
  ['GET', '/api/bridge/activity'],
  ['POST', '/api/bridge/start'], ['POST', '/api/bridge/stop'], ['POST', '/api/bridge/reset-secret'],
  ['POST', '/api/bridge/reset-round'], ['POST', '/api/bridge/oauth'],
  ['POST', '/api/bridge/login'], ['POST', '/api/bridge/token'], ['POST', '/api/bridge/logout'],
  ['POST', '/api/bridge/device'], ['POST', '/api/bridge/device/poll'], ['POST', '/api/bridge/github/clear'],
  ['GET', '/api/models'], ['POST', '/api/models'], ['POST', '/api/providers/probe'],
  ['GET', '/api/customizations'], ['PUT', '/api/customizations'],
  ['GET', '/api/profile/detect'],
  ['GET', '/api/skills'], ['POST', '/api/skills'], ['GET', '/api/skills/load', { query: true }],
  ['GET', '/api/operations'], ['GET', `/api/operations/${ID}`],
  ['POST', `/api/operations/${ID}/approve`], ['POST', `/api/operations/${ID}/cancel`],
  ['POST', '/api/workflows/preview'], ['POST', '/api/workflows/request'],
  ['GET', '/api/checkpoints'], ['POST', '/api/checkpoints'],
  ['POST', `/api/checkpoints/${ID}/preview`], ['POST', `/api/checkpoints/${ID}/restore`], ['POST', `/api/checkpoints/${ID}/remove`],
  ['POST', '/api/connection-checks'], ['GET', `/api/connection-checks/${ID}`], ['DELETE', '/api/connection-checks']
].map(([method, pattern, options = {}]) => ({ method, pattern: new RegExp(`^${pattern}$`), query: Boolean(options.query) }));

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_PATH_LENGTH = 2048;
const MAX_IN_FLIGHT = 16;
// Above every workbench module's own AbortController timer, so the module's timeout (relayed as an abort)
// always fires first; this cap only stops a request nobody is waiting for any more.
const MAX_TIMEOUT_MS = 120000;
const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Returns { method, path } for an allowed request, or throws with a reason the panel shows as a failed request.
function checkRequest(message) {
  const method = typeof message.method === 'string' ? message.method.toUpperCase() : '';
  const raw = message.path;
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.length > MAX_PATH_LENGTH
    || /[\\\u0000-\u001f\u007f#]/.test(raw)) throw new Error('设置页请求路径无效');
  const url = new URL(raw, 'http://relay.invalid');
  const rawPath = raw.split('?')[0];
  // Anything the URL parser would rewrite ("..", ".", encoded dots) is refused instead of normalised.
  if (url.origin !== 'http://relay.invalid' || url.pathname !== rawPath || /%2e/i.test(rawPath)) throw new Error('设置页请求路径无效');
  const rule = RULES.find(item => item.method === method && item.pattern.test(rawPath));
  if (!rule) throw new Error(`设置页不转发 ${method || '?'} ${rawPath.slice(0, 120)}`);
  if (url.search && !rule.query) throw new Error('该接口不接受查询参数');
  const body = message.body;
  if (body !== undefined && body !== null) {
    if (method === 'GET' || method === 'DELETE') throw new Error(`${method} 请求不带正文`);
    if (typeof body !== 'string' || Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) throw new Error('设置页请求正文须为1MiB以内的JSON文本');
    try { JSON.parse(body); } catch { throw new Error('设置页请求正文不是有效JSON'); }
  }
  return { method, path: raw, body: typeof body === 'string' ? body : null };
}

// send(method, path, body, { signal, timeoutMs }) -> Promise<{ status, contentType, raw }>.
// post(reply) delivers one reply to the panel. A request id answers exactly once.
function createApiRelay({ send, post, maxInFlight = MAX_IN_FLIGHT, timeoutMs = MAX_TIMEOUT_MS }) {
  if (typeof send !== 'function' || typeof post !== 'function') throw new TypeError('send and post are required');
  const inFlight = new Map();
  let disposed = false;
  const reply = message => { if (!disposed) post(message); }; // Never post into a closed panel.

  async function request(message) {
    const id = message.id;
    if (typeof id !== 'string' || !REQUEST_ID.test(id)) return false; // No usable id to answer to: ignore rather than guess.
    if (disposed) return true;
    if (inFlight.has(id)) { reply({ type: 'webagent-api-result', id, ok: false, error: '重复的请求编号' }); return true; }
    let checked;
    try {
      if (inFlight.size >= maxInFlight) throw new Error(`同时进行的请求超过${maxInFlight}个，请稍后再试`);
      checked = checkRequest(message);
    } catch (error) {
      reply({ type: 'webagent-api-result', id, ok: false, error: error.message });
      return true;
    }
    const controller = new AbortController();
    inFlight.set(id, controller);
    try {
      const result = await send(checked.method, checked.path, checked.body, { signal: controller.signal, timeoutMs });
      const status = Number(result && result.status);
      if (!Number.isInteger(status) || status < 200 || status > 599) throw new Error('主机返回了无法识别的状态码');
      reply({ type: 'webagent-api-result', id, ok: true, status,
        contentType: String(result.contentType || '').slice(0, 200), body: typeof result.raw === 'string' ? result.raw : '' });
    } catch (error) {
      // Network failure, deadline, cancel or redirect: the panel sees a rejected fetch, never a made-up status.
      reply({ type: 'webagent-api-result', id, ok: false, error: String((error && error.message) || error).slice(0, 500) });
    } finally {
      inFlight.delete(id);
    }
    return true;
  }

  function abort(message) {
    const controller = inFlight.get(message && message.id);
    if (controller) controller.abort();
    return Boolean(controller);
  }

  // Route one webview message. Returns true when it was a relay message (handled here).
  function handle(message) {
    if (!message || typeof message !== 'object') return false;
    if (message.type === 'webagent-api') { void request(message); return true; }
    if (message.type === 'webagent-api-abort') { abort(message); return true; }
    return false;
  }

  // Panel closed: cancel everything still running; their late failures are not posted (see reply).
  function dispose() {
    disposed = true;
    for (const controller of inFlight.values()) controller.abort();
  }

  return { handle, request, abort, dispose, get size() { return inFlight.size; } };
}

module.exports = { createApiRelay, checkRequest, RULES, MAX_BODY_BYTES, MAX_IN_FLIGHT, MAX_TIMEOUT_MS };
