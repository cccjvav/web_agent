'use strict';
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'approved-ops-'));
config.workspaceRoot = tmp;
const { callTool } = require('../src/tools');
const queue = require('../src/utils/operatorQueue');
const external = require('../src/mcp/externalClient');
const workflows = require('../src/tools/workflows');
let calls = 0, onHangingCall;
const server = http.createServer(async (req, res) => {
  let text = ''; for await (const chunk of req) text += chunk;
  const message = JSON.parse(text);
  assert.equal(req.headers.authorization, 'Bearer private-token');
  if (message.method === 'notifications/initialized') { res.writeHead(202); res.end(); return; }
  let result;
  if (message.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: {} };
  if (message.method === 'tools/list') result = { tools: [{ name: 'count', inputSchema: { type: 'object' } }] };
  if (message.method === 'tools/call') { calls++;
    if (message.params.arguments.hang) { res.setHeader('Content-Type', 'application/json'); res.write('{'); onHangingCall(); return; }
    result = { content: [{ type: 'text', text: 'executed' }] }; }
  res.setHeader('Content-Type', 'application/json'); res.setHeader('Mcp-Session-Id', 'fixture-session');
  res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
});
(async () => {
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    for (const url of ['https://example.com/mcp', 'file:///tmp/x', 'http://127.0.0.1/a?token=x']) assert.throws(() => external.endpoint(url));
    const registered = await external.add({ url: `http://127.0.0.1:${server.address().port}/mcp`, token: 'private-token' });
    assert.ok(!JSON.stringify(external.list()).includes('private-token'));
    const args = { serverId: registered.serverId, tool: 'count', arguments: {}, requestKey: 'request-001' };
    const options = { remote: true, callerKey: 'peer:test-session' };
    await assert.rejects(callTool('external_request', args, 'ask', options));
    await assert.rejects(callTool('external_request', args, 'code', { remote: true, callerKey: 'ip:bad' }));
    const pending = await callTool('external_request', args, 'code', options);
    assert.equal(pending.trace.status, 'accepted'); assert.equal(pending.taskId, pending.trace.taskId); assert.equal(calls, 0);
    assert.equal((await callTool('external_request', args, 'code', options)).requestId, pending.requestId);
    assert.throws(() => queue.result(pending.requestId, { remote: true, callerKey: 'peer:other' }));
    await assert.rejects(queue.approve(pending.requestId, false));
    await Promise.all([queue.approve(pending.requestId, true), queue.approve(pending.requestId, true)]);
    assert.equal(calls, 1); assert.equal(queue.result(pending.requestId, options).result.verification.state, 'external-reported');
    await queue.approve(pending.requestId, true); assert.equal(calls, 1);
    const denied = external.request({ ...args, requestKey: 'request-002' }, options); queue.cancel(denied.requestId);
    await queue.approve(denied.requestId, true); assert.equal(calls, 1);
    const definition = { steps: [{ id: 'write', tool: 'write_file', arguments: { filePath: 'proof.txt', content: 'approved only' }, expect: { path: 'proof.txt', contains: 'approved only' } }] };
    workflows.preview(definition); assert.equal(fs.existsSync(path.join(tmp, 'proof.txt')), false);
    const workflow = await callTool('workflow_request', { definition, requestKey: 'workflow-001' }, 'code', options);
    assert.equal(fs.existsSync(path.join(tmp, 'proof.txt')), false);
    await queue.approve(workflow.requestId, true);
    assert.equal(queue.result(workflow.requestId, options).status, 'succeeded'); assert.equal(fs.readFileSync(path.join(tmp, 'proof.txt'), 'utf8'), 'approved only');
    const stopped = workflows.request({ definition: { steps: [
      { id: 'check', tool: 'ping', arguments: {}, expect: { path: 'missing.txt', exists: true } },
      { id: 'never', tool: 'write_file', arguments: { filePath: 'never.txt', content: 'no' } }
    ] }, requestKey: 'workflow-002' });
    await queue.approve(stopped.requestId, true); assert.equal(queue.inspect(stopped.requestId).status, 'unknown'); assert.equal(fs.existsSync(path.join(tmp, 'never.txt')), false);
    assert.throws(() => workflows.preview({ steps: [{ id: 'bad', tool: 'run_command', arguments: { command: 'echo nope' } }] }));
    assert.throws(() => workflows.resolveValues('$steps.x.__proto__', { x: {} }));
    assert.deepEqual(workflows.resolveValues('$steps.x.hash', { x: { hash: 'abc' } }), 'abc');
    const waiting = new Promise(resolve => { onHangingCall = resolve; });
    const hanging = external.request({ ...args, arguments: { hang: true }, requestKey: 'request-hang' }, options);
    const execution = queue.approve(hanging.requestId, true); await waiting; queue.cancel(hanging.requestId); await execution;
    assert.equal(queue.inspect(hanging.requestId).status, 'unknown'); assert.equal(calls, 2);
    await queue.approve(hanging.requestId, true); assert.equal(calls, 2);
    const removed = external.request({ ...args, requestKey: 'request-003' }, options); external.remove(registered.serverId);
    await queue.approve(removed.requestId, true); assert.equal(queue.inspect(removed.requestId).status, 'failed'); assert.equal(calls, 2);
    const streamed = new Response('data: {"jsonrpc":"2.0","id":"sse","result":{}}\n\n', { headers: { 'content-type': 'text/event-stream' } });
    assert.deepEqual((await external.responseMessage(streamed, 'sse')).result, {});
    await assert.rejects(external.responseMessage(new Response('x'.repeat(256 * 1024 + 1)), 'large'));
    console.log('approved operations: real MCP discovery/call, gating, ownership, dedupe, workflow verification/stop and response bounds passed');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
