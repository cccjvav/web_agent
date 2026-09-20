'use strict';
const assert = require('assert');
const http = require('http');
const external = require('../src/mcp/externalClient');
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
    if (message.method === 'notifications/initialized') { res.writeHead(202); res.end(); return; }
    let result = { protocolVersion: '2025-03-26', capabilities: {} };
    if (message.method === 'tools/call') calls++;
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
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
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
    for (const scenario of ['repeat', 'duplicate', 'pages', 'bytes', 'result-array', 'schema', 'null-schema', 'cursor', 'count', 'session-merged', 'session-space', 'session-empty']) {
      mode = scenario; lists = 0;
      await assert.rejects(external.add(options));
      assert.deepStrictEqual(external.list(), []); assert.ok(lists <= 10); assert.strictEqual(calls, 0);
    }
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
    external.remove(sessionful.serverId);
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
