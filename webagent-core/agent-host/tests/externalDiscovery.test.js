'use strict';
const assert = require('assert');
const http = require('http');
const external = require('../src/mcp/externalClient');
const queue = require('../src/utils/operatorQueue');
const { runWithSignal } = require('../src/utils/requestScope');
function fragmentedResponse(text) {
  const bytes = new TextEncoder().encode(text); let offset = 0;
  return new Response(new ReadableStream({ pull(controller) {
    if (offset === bytes.length) controller.close();
    else controller.enqueue(bytes.subarray(offset, ++offset));
  } }), { headers: { 'content-type': 'Text/Event-Stream; charset=utf-8' } });
}
async function main() {
  let mode = 'paged', lists = 0, calls = 0, waiting, lastSessionSeen;
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const message = JSON.parse(body);
    assert.strictEqual(req.headers.authorization, 'Bearer fixture-private');
    lastSessionSeen = req.headers['mcp-session-id'];
    if (message.method === 'notifications/initialized') {
      if (mode === 'notification-session') res.setHeader('Mcp-Session-Id', 'notification-session-token');
      res.writeHead(202); res.end(); return;
    }
    let result = { protocolVersion: '2025-03-26', capabilities: {} };
    if (message.method === 'tools/call') { calls++; result = { content: [] }; }
    if (message.method === 'tools/list') {
      lists++;
      const second = message.params.cursor != null;
      const tool = { name: second ? 'second' : 'first', inputSchema: { type: 'object', properties: { x: { type: 'string' } } }, annotations: { readOnlyHint: true } };
      result = { tools: [tool], ...(second ? {} : { nextCursor: 'next' }) };
      if (mode === 'repeat') result = { tools: [], nextCursor: 'same' };
      if (mode === 'duplicate') tool.name = 'first';
      if (mode === 'pages') result = { tools: [], nextCursor: `page-${lists}` };
      if (mode === 'bytes') tool.inputSchema.description = 'x'.repeat(150000);
      if (mode === 'result-array') result = [];
      if (mode === 'schema') tool.inputSchema = [];
      if (mode === 'null-schema') tool.inputSchema = null;
      if (mode === 'cursor') result.nextCursor = 123;
      if (mode === 'count') result = { tools: Array.from({ length: 101 }, (_, i) => ({ name: `tool-${i}` })) };
      if (mode === 'hang') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); waiting(); return; }
    }
    res.setHeader('Content-Type', 'application/json');
    // F54续批：外部服务器回重复会话头（fetch合并成"a, b"）或含空白/控制字符的
    // 会话头，客户端必须拒绝保存，不得在后续请求回放合并串。
    if (mode === 'session-merged') res.setHeader('Mcp-Session-Id', ['evil-a', 'evil-b']);
    if (mode === 'session-space') res.setHeader('Mcp-Session-Id', 'bad session token');
    if (mode === 'session-empty') res.setHeader('Mcp-Session-Id', '');
    if (mode === 'session-valid') res.setHeader('Mcp-Session-Id', 'valid-session-token');
    const envelope = { jsonrpc: '2.0', id: message.id, result };
    const errors = { 'error-null': null, 'error-false': false, 'error-zero': 0 };
    const errorMode = mode.replace(/^sse-/, '');
    if (Object.hasOwn(errors, errorMode)) envelope.error = errors[errorMode];
    // Valid header, rejected RPC: the candidate SID must never become durable state.
    if (errorMode.startsWith('sid-')) {
      res.setHeader('Mcp-Session-Id', 'candidate-session-token');
      if (errorMode === 'sid-status') res.statusCode = 500;
      if (errorMode === 'sid-error') envelope.error = null;
      if (errorMode === 'sid-id') envelope.id = 'unmatched';
      if (errorMode === 'sid-version') envelope.jsonrpc = '1.0';
      if (errorMode === 'sid-array') envelope.result = [];
      if (errorMode === 'sid-budget') envelope.result = { text: 'x'.repeat(256 * 1024 + 1) };
      if (errorMode === 'sid-json') {
        if (mode.startsWith('sse-')) res.setHeader('Content-Type', 'text/event-stream');
        res.end(mode.startsWith('sse-') ? 'data: {\n\n' : '{'); return;
      }
    }
    if (mode.startsWith('sse-')) { res.setHeader('Content-Type', 'text/event-stream'); res.end('data: ' + JSON.stringify(envelope) + '\n\n'); }
    else res.end(JSON.stringify(envelope));
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const options = { url: `http://127.0.0.1:${server.address().port}/mcp`, token: 'fixture-private' };
    const added = await external.add(options);
    assert.deepStrictEqual(added.tools.map(tool => tool.name), ['first', 'second']);
    assert.strictEqual(lists, 2); assert.strictEqual(calls, 0);
    assert.ok(added.tools.every(tool => tool.requiresApproval));
    added.tools[0].inputSchema.properties.x.type = 'number';
    assert.strictEqual(external.list()[0].tools[0].inputSchema.properties.x.type, 'string');
    assert.ok(!JSON.stringify(external.list()).includes('fixture-private'));
    external.remove(added.serverId);
    for (const scenario of ['error-null', 'error-false', 'error-zero', 'sse-error-null', 'sse-error-false', 'sse-error-zero', 'repeat', 'duplicate', 'pages', 'bytes', 'result-array', 'schema', 'null-schema', 'cursor', 'count', 'session-merged', 'session-space', 'session-empty']) {
      mode = scenario; lists = 0;
      await assert.rejects(external.add(options));
      assert.deepStrictEqual(external.list(), []); assert.ok(lists <= 10); assert.strictEqual(calls, 0);
    }
    // A malformed reply after an approved call is unknown, not success or safe to retry.
    mode = 'paged'; const callable = await external.add(options);
    for (const scenario of ['error-null', 'error-false', 'error-zero', 'sse-error-null', 'sse-error-false', 'sse-error-zero']) {
      mode = scenario; const before = calls;
      const pending = external.request({ serverId: callable.serverId, tool: 'first', arguments: {}, requestKey: 'envelope-' + scenario }, { callerKey: 'local' });
      await queue.approve(pending.requestId, true);
      assert.strictEqual(queue.inspect(pending.requestId).status, 'unknown');
      assert.strictEqual(calls, before + 1);
      await queue.approve(pending.requestId, true);
      assert.strictEqual(calls, before + 1, 'unknown response must not replay the remote call');
    }
    external.remove(callable.serverId); calls = 0;
    mode = 'hang'; const controller = new AbortController();
    const started = new Promise(resolve => { waiting = resolve; });
    const registering = runWithSignal(controller.signal, () => external.add(options));
    const rejected = assert.rejects(registering); await started; controller.abort(); await rejected;
    assert.deepStrictEqual(external.list(), []);
    const removalStarted = new Promise(resolve => { waiting = resolve; });
    const removedRegistration = external.add(options), removalRejected = assert.rejects(removedRegistration);
    await removalStarted;
    const connecting = external.list()[0];assert.strictEqual(connecting.status,'connecting');
    assert.deepStrictEqual(external.remove(connecting.serverId),{removed:true});await removalRejected;
    assert.deepStrictEqual(external.list(),[]);assert.deepStrictEqual(external.remove(connecting.serverId),{removed:false});
    assert.strictEqual(calls,0);assert.strictEqual(server.listening,true,'removing the host connection does not stop the external HTTP server');
    mode='paged';const explicitlyReadded=await external.add(options);
    assert.strictEqual(explicitlyReadded.status,'discovered');external.remove(explicitlyReadded.serverId);
    mode = 'session-valid'; lastSessionSeen = undefined;
    const sessionful = await external.add(options);
    assert.strictEqual(lastSessionSeen, 'valid-session-token', 'a single valid session token is retained and replayed');
    for (const prefix of ['', 'sse-']) {
      for (const failure of ['status', 'error', 'id', 'version', 'array', 'json', 'budget']) {
        mode = prefix + 'sid-' + failure; const before = calls;
        const rejectedCall = external.request({ serverId: sessionful.serverId, tool: 'first', arguments: {}, requestKey: 'session-reject-' + mode }, { callerKey: 'local' });
        await queue.approve(rejectedCall.requestId, true);
        assert.strictEqual(queue.inspect(rejectedCall.requestId).status, 'unknown');
        assert.strictEqual(calls, before + 1);
        await queue.approve(rejectedCall.requestId, true);
        assert.strictEqual(calls, before + 1, 'rejected response is not permission to replay');
        const failedMode = mode; mode = 'paged';
        const fresh = external.request({ serverId: sessionful.serverId, tool: 'first', arguments: {}, requestKey: 'session-fresh-' + failedMode }, { callerKey: 'local' });
        await queue.approve(fresh.requestId, true);
        assert.strictEqual(lastSessionSeen, 'valid-session-token', failedMode + ': rejected response cannot replace the retained SID');
        assert.strictEqual(queue.inspect(fresh.requestId).status, 'succeeded');
        assert.strictEqual(calls, before + 2, 'the next call requires a separate explicit approval');
      }
    }
    // Preserve the existing behavior for an accepted result carrying a new valid SID.
    mode = 'sid-accepted';
    const accepted = external.request({ serverId: sessionful.serverId, tool: 'first', arguments: {}, requestKey: 'session-accepted' }, { callerKey: 'local' });
    await queue.approve(accepted.requestId, true);
    assert.strictEqual(queue.inspect(accepted.requestId).status, 'succeeded');
    mode = 'paged';
    const afterAccepted = external.request({ serverId: sessionful.serverId, tool: 'first', arguments: {}, requestKey: 'session-after-accepted' }, { callerKey: 'local' });
    await queue.approve(afterAccepted.requestId, true);
    assert.strictEqual(lastSessionSeen, 'candidate-session-token');
    external.remove(sessionful.serverId);
    mode = 'notification-session';
    const notified = await external.add(options);
    assert.strictEqual(lastSessionSeen, 'notification-session-token', 'accepted notifications retain their existing SID behavior');
    external.remove(notified.serverId);
    for (const ending of ['\r', '\r\n', '\n']) {
      const message = JSON.stringify({ jsonrpc: '2.0', id: 'wanted', result: { content: '中文🙂' } });
      const response = fragmentedResponse(`: heartbeat${ending}${ending}data: {"method":"notification"}${ending}${ending}data: ${message}${ending}${ending}`);
      assert.strictEqual((await external.responseMessage(response, 'wanted')).result.content, '中文🙂');
    }
    await assert.rejects(external.responseMessage(new Response(Uint8Array.from([0xff, 0xfe])), 'bad'));
    console.log('external discovery: bounded pagination, invalid catalogs, cancellation, immutable metadata and fragmented SSE passed');
  } finally {
    for (const client of external.list()) external.remove(client.serverId);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
