// R6 phase 2 batch 2: the settings panel's request relay.
//   A. extension/apiRelay.js alone (fake send): deny-by-default route list, path tricks, body rules, request ids,
//      in-flight cap, abort, failures and dispose.
//   B. workbench/js/vscodeRelay.js alone: fetch semantics (Response for any HTTP status, TypeError for a refusal,
//      AbortError plus an abort message for a cancelled request).
//   C. End to end: webview transport -> relay -> the extension's real requestJson -> a real host over HTTP.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { config } = require('../src/config');
const { createApiRelay, checkRequest, MAX_BODY_BYTES, MAX_IN_FLIGHT, MAX_TIMEOUT_MS } = require('../../extension/apiRelay');

// vscodeRelay.js is a browser ES module (the workbench folder has no package.json and CI runs Node 18/20, which
// cannot import it directly). Evaluate its two exports as a script in this realm, so Response/DOMException are
// the real globals.
function loadRelayModule() {
  const source = fs.readFileSync(path.resolve(__dirname, '../../workbench/js/vscodeRelay.js'), 'utf8');
  assert.deepStrictEqual((source.match(/^export function (\w+)/gm) || []).map(line => line.split(' ')[2]),
    ['createRelayTransport', 'createHostServices'], 'vscodeRelay.js exports exactly the transport and the host services');
  assert.strictEqual((source.match(/^export /gm) || []).length, 2);
  return vm.runInThisContext(`(() => {\n${source.replace(/^export /gm, '')}\nreturn { createRelayTransport, createHostServices };\n})()`);
}
const loadRelayTransport = () => loadRelayModule().createRelayTransport;

const tick = () => new Promise(resolve => setImmediate(resolve));

async function partA() {
  const sent = [], replies = [];
  let behaviour = async () => ({ status: 200, contentType: 'application/json; charset=utf-8', raw: '{"ok":true}' });
  const relay = createApiRelay({ send: (...args) => { sent.push(args); return behaviour(...args); }, post: message => replies.push(message) });
  const ask = async message => { replies.length = 0; relay.handle({ type: 'webagent-api', ...message }); await tick(); await tick(); return replies.slice(); };

  let [reply] = await ask({ id: 'a1', method: 'GET', path: '/api/status' });
  assert.deepStrictEqual(reply, { type: 'webagent-api-result', id: 'a1', ok: true, status: 200, contentType: 'application/json; charset=utf-8', body: '{"ok":true}' });
  assert.strictEqual(sent.at(-1)[0], 'GET'); assert.strictEqual(sent.at(-1)[1], '/api/status'); assert.strictEqual(sent.at(-1)[2], null);
  assert.strictEqual(sent.at(-1)[3].timeoutMs, MAX_TIMEOUT_MS); assert.ok(sent.at(-1)[3].signal instanceof AbortSignal);

  // Allowed routes, including ids, the one query route and a JSON body.
  for (const [method, p, body] of [['post', '/api/operations/0b2e-Id_9/approve', '{"confirm":true}'], ['GET', '/api/skills/load?id=a&cursor=2'],
    ['PUT', '/api/customizations', '{}'], ['DELETE', '/api/connection-checks'], ['GET', '/health'], ['POST', '/api/checkpoints/x1/restore', '{}'],
    // D4 (2026-09-26): external MCP registration moved into the settings tab.
    ['POST', '/api/external/servers', '{"name":"x"}'], ['DELETE', '/api/external/servers/0b2e0c1a-1111-4222-8333-444455556666'],
    ['POST', '/api/external/stdio/preview', '{}'], ['POST', '/api/external/stdio/start', '{"confirmed":true}']]) {
    const before = sent.length;
    [reply] = await ask({ id: 'ok' + before, method, path: p, body });
    assert.strictEqual(reply.ok, true, `${method} ${p} must be relayed: ${reply.error}`);
    assert.strictEqual(sent.length, before + 1);
    assert.strictEqual(sent.at(-1)[2], body === undefined ? null : body, 'the JSON text is forwarded unchanged');
  }

  // Deny by default: not settings (chat/tool/terminal/editor), a local external tool call, D4 multi-model, probes,
  // wrong method (external registration GET/PUT, a server id with a slash).
  const denied = [['POST', '/api/tool/call'], ['POST', '/api/chat'], ['GET', '/api/files/tree'], ['PUT', '/api/files/content'],
    ['POST', '/api/files/undo/x'], ['GET', '/api/pty/jobs'], ['POST', '/api/pty/hello'], ['POST', '/api/tasks/reset'],
    ['POST', '/api/external/request'], ['POST', '/api/consensus/run'], ['GET', '/api/external/servers'], ['PUT', '/api/external/stdio/start'],
    ['DELETE', '/api/external/servers'], ['DELETE', '/api/external/servers/a/b'], ['POST', '/api/external/stdio/stop'],
    ['POST', '/api/probe/links'], ['GET', '/api/logs'], ['POST', '/api/status'], ['DELETE', '/api/models'], ['PATCH', '/api/models'], ['GET', '/mcp'],
    ['GET', '/api/status/'], ['GET', '/API/status']];
  // Path tricks: absolute or protocol-relative URLs, dot segments (plain or encoded), fragments, backslashes,
  // control characters, a query on a route without one, an id that smuggles a slash.
  const tricks = ['http://evil.example/api/status', '//evil.example/api/status', '/api/../api/tool/call', '/api/./status',
    '/api/%2e%2e/tool/call', '/api/%2E/status', '/api/status#x', '/api\\status', '/api/status\n', '/api/status?x=1',
    '/api/operations/a%2Fb/approve', '/api/operations/a/b/approve', 'api/status', '', '/' + 'a'.repeat(3000)];
  for (const [method, p] of [...denied, ...tricks.map(t => ['GET', t])]) {
    const before = sent.length;
    [reply] = await ask({ id: 'deny', method, path: p });
    assert.strictEqual(reply.ok, false, `${method} ${JSON.stringify(p)} must be refused`);
    assert.strictEqual(sent.length, before, `${method} ${JSON.stringify(p)} must never reach the host`);
  }
  assert.ok(/不转发 POST \/api\/tool\/call/.test((await ask({ id: 'm', method: 'POST', path: '/api/tool/call' }))[0].error));
  assert.throws(() => checkRequest({ method: 'GET', path: 123 }), /路径无效/);

  // Body rules.
  for (const [method, p, body, why] of [['GET', '/api/status', '{}', /不带正文/], ['DELETE', '/api/connection-checks', '{}', /不带正文/],
    ['POST', '/api/models', 'not json', /不是有效JSON/], ['POST', '/api/models', { a: 1 }, /JSON文本/],
    ['POST', '/api/models', JSON.stringify('x'.repeat(MAX_BODY_BYTES)), /1MiB/]]) {
    const before = sent.length;
    [reply] = await ask({ id: 'body', method, path: p, body });
    assert.ok(reply.ok === false && why.test(reply.error), `${method} ${p} body ${String(body).slice(0, 20)}: ${reply.error}`);
    assert.strictEqual(sent.length, before);
  }

  // Request ids: none or malformed is ignored (nothing to answer to); non-relay messages are not consumed.
  for (const id of [undefined, '', 'bad id', 'x'.repeat(65), 7]) assert.deepStrictEqual(await ask({ id, method: 'GET', path: '/api/status' }), []);
  assert.strictEqual(relay.handle({ type: 'chat', text: 'hi' }), false);
  assert.strictEqual(relay.handle(null), false);

  // Failures are rejected requests, never invented statuses.
  behaviour = async () => { throw new Error('本机API请求超过120秒，结果未确认；没有自动重试'); };
  [reply] = await ask({ id: 'net', method: 'GET', path: '/api/status' });
  assert.deepStrictEqual([reply.ok, reply.status, /120秒/.test(reply.error)], [false, undefined, true]);
  for (const status of [0, 199, 600, 302.5, undefined]) {
    behaviour = async () => ({ status, raw: '' });
    [reply] = await ask({ id: 'st', method: 'GET', path: '/api/status' });
    assert.strictEqual(reply.ok, false, `status ${status} is not relayed`);
  }
  behaviour = async () => ({ status: 409, contentType: 'application/json', raw: '{"success":false}' });
  [reply] = await ask({ id: 'st409', method: 'POST', path: '/api/models', body: '{}' });
  assert.deepStrictEqual([reply.ok, reply.status, reply.body], [true, 409, '{"success":false}'], 'HTTP errors pass through as answers');

  // In flight: duplicate ids, the cap, abort.
  const hanging = [];
  behaviour = (method, p, body, { signal }) => new Promise((resolve, reject) => {
    hanging.push(resolve);
    signal.addEventListener('abort', () => reject(new Error('本机API请求已取消，结果未确认；没有自动重试')), { once: true });
  });
  replies.length = 0;
  for (let i = 0; i < MAX_IN_FLIGHT; i++) relay.handle({ type: 'webagent-api', id: 'h' + i, method: 'GET', path: '/api/status' });
  await tick();
  assert.strictEqual(relay.size, MAX_IN_FLIGHT); assert.deepStrictEqual(replies, []);
  relay.handle({ type: 'webagent-api', id: 'h0', method: 'GET', path: '/api/status' });
  relay.handle({ type: 'webagent-api', id: 'over', method: 'GET', path: '/api/status' });
  await tick();
  assert.deepStrictEqual(replies.map(r => [r.id, r.ok, r.error]), [['h0', false, '重复的请求编号'], ['over', false, '同时进行的请求超过16个，请稍后再试']]);
  replies.length = 0;
  assert.strictEqual(relay.handle({ type: 'webagent-api-abort', id: 'h3' }), true);
  await tick();
  assert.deepStrictEqual(replies.map(r => [r.id, r.ok, /已取消/.test(r.error)]), [['h3', false, true]]);
  assert.strictEqual(relay.abort({ id: 'h3' }), false, 'a finished request cannot be aborted twice');
  hanging[1]({ status: 200, contentType: 'text/plain', raw: 'late but valid' });
  await tick();
  assert.deepStrictEqual(replies.slice(1).map(r => [r.id, r.ok, r.body]), [['h1', true, 'late but valid']]);

  // Dispose cancels the rest and posts nothing more, not even for new requests.
  replies.length = 0;
  relay.dispose();
  await tick(); await tick();
  assert.strictEqual(relay.size, 0); assert.deepStrictEqual(replies, [], 'a closed panel receives no messages');
  relay.handle({ type: 'webagent-api', id: 'after', method: 'GET', path: '/api/status' });
  await tick();
  assert.deepStrictEqual(replies, []);
  assert.throws(() => createApiRelay({ post() {} }), TypeError);
}

async function partB() {
  const createRelayTransport = loadRelayTransport();
  const posted = []; let deliver;
  const transport = createRelayTransport({ postMessage: m => posted.push(m), onMessage: fn => { deliver = fn; } });
  const answer = (index, reply) => deliver({ type: 'webagent-api-result', id: posted[index].id, ...reply });

  let pending = transport('/api/models', { method: 'post', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}', cache: 'no-store' });
  assert.deepStrictEqual({ ...posted[0], id: undefined }, { type: 'webagent-api', id: undefined, method: 'POST', path: '/api/models', body: '{"a":1}' },
    'only method, path and body leave the webview');
  answer(0, { ok: true, status: 409, contentType: 'application/json', body: '{"success":false,"error":"x"}' });
  let response = await pending;
  assert.ok(response instanceof Response); assert.strictEqual(response.ok, false); assert.strictEqual(response.status, 409);
  assert.deepStrictEqual(await response.json(), { success: false, error: 'x' });
  assert.strictEqual(response.headers.get('content-type'), 'application/json');

  pending = transport('/api/status');
  assert.strictEqual(posted[1].method, 'GET'); assert.ok(!('body' in posted[1]));
  answer(1, { ok: true, status: 204, contentType: '', body: '' });
  response = await pending;
  assert.strictEqual(response.status, 204); assert.strictEqual(await response.text(), '');

  pending = transport('/api/tool/call', { method: 'POST', body: '{}' });
  answer(2, { ok: false, error: '设置页不转发 POST /api/tool/call' });
  await assert.rejects(pending, error => error instanceof TypeError && /不转发/.test(error.message));

  const controller = new AbortController();
  pending = transport('/api/bridge/start', { method: 'POST', body: '{}', signal: controller.signal });
  const startId = posted[3].id;
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.deepStrictEqual(posted[4], { type: 'webagent-api-abort', id: startId }, 'abort is forwarded to the extension');
  deliver({ type: 'webagent-api-result', id: startId, ok: true, status: 200, contentType: 'text/plain', body: 'too late' }); // dropped
  await assert.rejects(transport('/api/status', { signal: controller.signal }), error => error.name === 'AbortError');
  assert.strictEqual(posted.length, 5, 'an already aborted signal sends nothing');

  pending = transport('/api/status');
  deliver({ type: 'webagent-api-result', id: posted[5].id, status: 200, body: 'no ok flag' });
  await assert.rejects(pending, TypeError, 'only an explicit ok:true is an HTTP answer');
  deliver({ type: 'webagent-api-result', id: 'unknown', ok: true, status: 200, body: '' }); // ignored, no throw
  deliver({ type: 'other' });
  const failing = createRelayTransport({ postMessage: () => { throw new Error('webview disposed'); }, onMessage() {} });
  await assert.rejects(failing('/api/status'), error => error instanceof TypeError && /webview disposed/.test(error.message));
  assert.throws(() => createRelayTransport({ postMessage() {} }), TypeError);
}

async function partC() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-settings-relay-'));
  config.workspaceRoot = tmp; config.host = '127.0.0.1'; config.port = 0; config.workbenchPort = 0;
  const { uiServer, mcpServer } = require('../src/index');
  const tracker = require('../src/usage/tracker');
  try {
    await Promise.all([uiServer, mcpServer].map(s => s.listening ? null : new Promise(resolve => s.once('listening', resolve))));
    const base = `http://127.0.0.1:${mcpServer.address().port}`;
    // The extension's own requestJson, loaded the way the other native tests load extension.js.
    const vscode = { workspace: { isTrusted: true, workspaceFolders: [], getConfiguration: () => ({ get: () => base }) }, window: {}, commands: {}, env: {} };
    const context = vm.createContext({ module: { exports: {} }, console, process, Buffer, URL, setTimeout, clearTimeout, setInterval, clearInterval,
      require: name => name === 'vscode' ? vscode : name.startsWith('./') ? {} : require(name) });
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../extension/extension.js'), 'utf8') + '\nmodule.exports={requestJson};', context);
    const { requestJson } = context.module.exports;
    // requestJson's relay options against a server that never answers: abort and a custom deadline both reject
    // as unconfirmed, promptly, and close the socket; a pre-aborted signal sends nothing.
    {
      const http = require('http'), sockets = new Set(); let arrived = 0;
      const silent = http.createServer(() => { arrived++; });
      silent.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
      await new Promise(resolve => silent.listen(0, '127.0.0.1', resolve));
      const silentUrl = `http://127.0.0.1:${silent.address().port}/api/status`;
      try {
        const controller = new AbortController(); let started = Date.now();
        const aborted = requestJson('GET', silentUrl, undefined, { signal: controller.signal });
        while (!arrived) await new Promise(resolve => setTimeout(resolve, 10));
        controller.abort();
        await assert.rejects(aborted, /已取消/);
        assert.ok(Date.now() - started < 5000, 'abort does not wait for the 15 s deadline');
        started = Date.now();
        await assert.rejects(requestJson('GET', silentUrl, undefined, { timeoutMs: 1000 }), /超过1秒/);
        assert.ok(Date.now() - started < 5000, 'timeoutMs replaces the 15 s deadline');
        const before = arrived;
        await assert.rejects(requestJson('GET', silentUrl, undefined, { signal: AbortSignal.abort() }), /已取消/);
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.strictEqual(arrived, before, 'a pre-aborted signal sends nothing');
        for (let i = 0; i < 50 && sockets.size; i++) await new Promise(resolve => setTimeout(resolve, 20));
        assert.strictEqual(sockets.size, 0, 'cancelled requests close their sockets');
      } finally { for (const socket of sockets) socket.destroy(); await new Promise(resolve => silent.close(resolve)); }
    }
    const hostRequests = [];
    const relay = createApiRelay({
      send: (method, p, body, options) => { hostRequests.push(`${method} ${p}`); return requestJson(method, base + p, undefined, { ...options, rawBody: body === null ? undefined : body }); },
      post: message => setImmediate(() => deliver(message))
    });
    let deliver;
    const transport = loadRelayTransport()({ postMessage: m => relay.handle(m), onMessage: fn => { deliver = fn; } });

    const status = await transport('/api/status', { cache: 'no-store' });
    assert.strictEqual(status.status, 200, 'the host accepts the relayed request as its local control plane');
    const snapshot = await status.json();
    assert.strictEqual(fs.realpathSync(snapshot.workspaceRoot), fs.realpathSync(tmp));
    assert.ok(/application\/json/.test(status.headers.get('content-type')));

    // A host-side validation error comes back as an HTTP answer, exactly as fetch would give it.
    const bad = await transport('/api/checkpoints', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"paths":[]}' });
    assert.ok(bad.status >= 400 && bad.status < 500, `invalid checkpoint request answers 4xx, got ${bad.status}`);
    assert.strictEqual(bad.ok, false);

    // A write that round-trips through the relay: turn Execute off with the workspace binding, then read it back.
    const control = await (await transport('/api/execution-control', { cache: 'no-store' })).json();
    assert.strictEqual(control.permissions.execute, true);
    const written = await transport('/api/execution-control', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceRoot: snapshot.workspaceRoot, hostInstanceId: snapshot.identity.hostInstanceId,
        permissions: { ...control.permissions, execute: false }, revision: control.revision }) });
    assert.strictEqual(written.status, 200, `permission write through the relay: ${await written.clone().text()}`);
    assert.strictEqual((await written.json()).success, true);
    assert.strictEqual((await (await transport('/api/execution-control')).json()).permissions.execute, false, 'the write reached the host');

    await assert.rejects(transport('/api/tool/call', { method: 'POST', body: '{"name":"run_command","arguments":{"command":"echo hi"}}' }), TypeError);
    assert.ok(!hostRequests.some(line => line.includes('/api/tool/call')), 'a refused route never reaches the host');
    assert.deepStrictEqual(hostRequests, ['GET /api/status', 'POST /api/checkpoints', 'GET /api/execution-control', 'POST /api/execution-control', 'GET /api/execution-control']);
  } finally {
    tracker.stopReporter();
    await Promise.all([uiServer, mcpServer].map(s => new Promise(resolve => s.close(() => resolve()))));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

(async () => {
  await partA();
  await partB();
  await partC();
  console.log('settings relay passed: deny-by-default routes, fetch semantics, abort, and a real host end to end');
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
