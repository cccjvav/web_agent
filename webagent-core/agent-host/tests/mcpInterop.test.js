// F70 batch 7: MCP bridge interoperability, verified against the official MCP TypeScript SDK 1.30.1 / 2.1.0
// clients and the official @modelcontextprotocol/conformance 0.1.16 server suite (both run outside the repo).
// Every case below is a contract those clients enforce and this host broke. The real host is loaded
// (src/index.js) and spoken to over real HTTP, exactly as a remote client would; no handler mocking.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-mcp-interop-'));
config.workspaceRoot = tmp;
config.host = '127.0.0.1';
config.port = 0;
config.workbenchPort = 0;

async function main() {
  const { uiServer, mcpServer } = require('../src/index');
  const tracker = require('../src/usage/tracker');
  try {
    await Promise.all([uiServer, mcpServer].map(s => s.listening ? null : new Promise(resolve => s.once('listening', resolve))));
    const base = `http://127.0.0.1:${mcpServer.address().port}`;
    const auth = { Authorization: `Bearer ${config.secretKey}` };
    const rpc = async (body, { sid, accept = 'application/json, text/event-stream', headers = {} } = {}) => {
      const res = await fetch(`${base}/mcp`, { method: 'POST', headers: {
        ...auth, 'Content-Type': 'application/json', Accept: accept, ...(sid ? { 'Mcp-Session-Id': sid } : {}), ...headers
      }, body: typeof body === 'string' ? body : JSON.stringify(body) });
      const text = await res.text();
      const json = text.startsWith('event:') ? JSON.parse(text.split('\n').find(l => l.startsWith('data:')).slice(5)) : (text ? JSON.parse(text) : null);
      return { status: res.status, sid: res.headers.get('mcp-session-id'), ctype: res.headers.get('content-type') || '', json, text };
    };
    const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'interop', version: '1' } } });
    assert.strictEqual(init.status, 200);
    const sid = init.sid;
    assert.ok(sid, 'initialize must return Mcp-Session-Id');

    // 1. ping MUST answer an empty result. SDK clients validate it with a strict EmptyResult schema: the
    //    old { ok, ts, busy, session, host } body made client.ping() throw "Unrecognized keys" (conformance
    //    scenario "ping" failed). The host snapshot stays available through the ping *tool* and GET /mcp.
    const ping = await rpc({ jsonrpc: '2.0', id: 2, method: 'ping' }, { sid });
    assert.strictEqual(ping.status, 200);
    assert.deepStrictEqual(ping.json.result, {}, 'ping result must be exactly {}');

    // 2. An unknown JSON-RPC method is a JSON-RPC error (-32601) on HTTP 200. On the MCP endpoint HTTP 404
    //    means "session not found, re-initialize" (Streamable HTTP); answering 404 for optional methods that
    //    clients probe (resources/templates/list, completion/complete) conflated the two.
    for (const method of ['resources/templates/list', 'completion/complete', 'no/such/method']) {
      const res = await rpc({ jsonrpc: '2.0', id: 3, method, params: {} }, { sid });
      assert.strictEqual(res.status, 200, `${method}: unknown method must not be HTTP ${res.status}`);
      assert.strictEqual(res.json.error.code, -32601, `${method}: JSON-RPC Method not found`);
      assert.strictEqual(res.json.id, 3);
    }
    // Unknown *session* keeps its 404/-32001 contract.
    const lost = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/list' }, { sid: 'deadbeefdeadbeef' });
    assert.strictEqual(lost.status, 404);
    assert.strictEqual(lost.json.error.code, -32001);

    // 3. Tool annotations. ChatGPT developer mode treats every tool without readOnlyHint as a write action
    //    and asks for confirmation; read tools must say so, and destructive tools must say that too.
    const list = await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/list' }, { sid });
    const tools = new Map(list.json.result.tools.map(t => [t.name, t]));
    for (const name of ['read_files', 'list_directory', 'search_files', 'find_files', 'git_status', 'git_diff', 'workspace_info', 'get_command_output', 'recall', 'board_list']) {
      assert.strictEqual(tools.get(name).annotations && tools.get(name).annotations.readOnlyHint, true, `${name} must be readOnlyHint`);
    }
    for (const name of ['write_file', 'apply_patch', 'delete_file', 'rename_file', 'run_command', 'start_command']) {
      const a = tools.get(name).annotations;
      assert.ok(a && a.readOnlyHint === false, `${name} must not claim read-only`);
    }
    assert.strictEqual(tools.get('delete_file').annotations.destructiveHint, true);
    assert.strictEqual(tools.get('run_command').annotations.destructiveHint, true);
    assert.strictEqual(tools.get('apply_patch').annotations.destructiveHint, true, 'apply_patch rewrites file content');
    assert.strictEqual(tools.get('board_create').annotations.destructiveHint, false, 'additive board writes are not destructive');
    for (const t of tools.values()) {
      assert.strictEqual(typeof (t.annotations && t.annotations.openWorldHint), 'boolean', `${t.name} openWorldHint`);
    }
    assert.strictEqual(tools.get('external_request').annotations.openWorldHint, true, 'third-party calls reach the open world');
    assert.strictEqual(tools.get('read_files').annotations.openWorldHint, false);

    // 4. Malformed or oversized bodies never produce Express's HTML error page (absolute install paths and a
    //    stack trace, reachable unauthenticated through the tunnel on any path). JSON, status preserved.
    const leaks = [];
    for (const [pathName, init2] of [
      ['/mcp', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{bad' }],
      ['/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', Host: 'x.trycloudflare.com', 'cf-ray': '1' }, body: '{bad' }],
      ['/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(70 * 1024) }) }],
      ['/anything', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '[' }]
    ]) {
      const res = await fetch(base + pathName, init2);
      const text = await res.text();
      assert.ok(res.status === 400 || res.status === 413, `${pathName}: status ${res.status}`);
      assert.ok(/application\/json/.test(res.headers.get('content-type') || ''), `${pathName}: must answer JSON, got ${res.headers.get('content-type')}`);
      if (/node_modules|\bat \w|<pre>|<html/i.test(text) || text.includes(path.sep + 'agent-host' + path.sep)) leaks.push(pathName);
      if (pathName === '/mcp') {
        const body = JSON.parse(text);
        assert.strictEqual(body.jsonrpc, '2.0');
        assert.strictEqual(body.error.code, -32700, 'unparseable JSON-RPC is a Parse error');
        assert.strictEqual(body.id, null);
      }
    }
    assert.deepStrictEqual(leaks, [], 'no stack trace or install path in error bodies');

    // 5. The legacy HTTP+SSE transport (2024-11-05: GET opens a stream, `endpoint` event, responses arrive on the
    //    stream) is NOT implemented: POST answers inline. Advertising it made the official SSEClientTransport
    //    wait forever for the initialize response. The GET stream stays (Streamable HTTP listen stream) but must
    //    not announce a legacy endpoint, and the status body must list only what works.
    const status = await (await fetch(`${base}/mcp`, { headers: { ...auth, 'Mcp-Session-Id': sid } })).json();
    assert.deepStrictEqual(status.transports, ['streamable-http'], 'only advertise transports that work');
    // A sessionless GET stream is the legacy handshake: 405 (Streamable HTTP "no SSE stream here") at once, so
    // legacy clients fail fast and SSE-first clients fall back to POST. No session is allocated for it.
    const sessions = require('../src/mcp/session');
    const before = sessions.snapshot().httpSessions;
    const legacy = await fetch(`${base}/mcp`, { headers: { ...auth, Accept: 'text/event-stream' } });
    assert.strictEqual(legacy.status, 405, 'sessionless GET stream must be 405, not an endless stream');
    assert.strictEqual(legacy.headers.get('allow'), 'POST');
    assert.ok(/Streamable HTTP/.test((await legacy.json()).error.message));
    assert.strictEqual(sessions.snapshot().httpSessions, before, 'no session allocated for a rejected legacy GET');
    // An expired/unknown session on the GET stream is 404 (re-initialize), never silently replaced.
    const expired = await fetch(`${base}/mcp`, { headers: { ...auth, Accept: 'text/event-stream', 'Mcp-Session-Id': 'feedfacefeedface' } });
    assert.strictEqual(expired.status, 404);
    assert.strictEqual(expired.headers.get('mcp-session-id'), null, 'no replacement session id handed out');
    await expired.text();
    assert.strictEqual(sessions.snapshot().httpSessions, before);
    const ac = new AbortController();
    const stream = await fetch(`${base}/mcp`, { headers: { ...auth, Accept: 'text/event-stream', 'Mcp-Session-Id': sid }, signal: ac.signal });
    assert.strictEqual(stream.status, 200);
    assert.ok(/text\/event-stream/.test(stream.headers.get('content-type') || ''));
    const reader = stream.body.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    ac.abort();
    await reader.cancel().catch(() => {});
    assert.ok(!/event:\s*endpoint/.test(first), 'GET stream must not announce a legacy HTTP+SSE endpoint: ' + JSON.stringify(first));

    // 6. Remote command time limits. run_command answers inside one request, and SDK clients abandon a request
    //    after 60 s by default, so a remote run_command must finish (or time out) before that: capped at 50 s.
    //    start_command returns immediately and is polled; clamping it to 60 s killed legitimate long builds
    //    (asked 300 s, killed at 60 s) although the poll loop is exactly what the instructions recommend.
    const tools2 = require('../src/tools');
    assert.strictEqual(typeof tools2.remoteTimeoutSec, 'function', 'remote clamp is a named, testable rule');
    assert.strictEqual(tools2.remoteTimeoutSec('run_command', 120), 50);
    assert.strictEqual(tools2.remoteTimeoutSec('run_command', undefined), 30);
    assert.strictEqual(tools2.remoteTimeoutSec('start_command', 300), 300);
    assert.strictEqual(tools2.remoteTimeoutSec('start_command', 5000), 600);
    assert.strictEqual(tools2.remoteTimeoutSec('start_command', undefined), 30);
    assert.strictEqual(tools2.remoteTimeoutSec('start_command', -1), 30);
    // End to end through the real remote dispatch: a remote start_command asking for 120 s must still be
    // running after 61 s would be too slow for a unit test, so assert the value the executor recorded instead.
    const started = await rpc({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'start_command', arguments: { command: 'node -e "setTimeout(()=>{},200)"', timeoutSec: 120 } } }, { sid });
    const startedResult = JSON.parse(started.json.result.content[0].text);
    assert.ok(startedResult.execId, started.text.slice(0, 300));
    assert.strictEqual(startedResult.timeoutSec, 120, 'remote start_command keeps a 120 s limit (was clamped to 60)');

    // 7. Output truncation is visible. A remote command that prints more than the returned tail used to come
    //    back as the last 8000 characters with nothing saying so; the model took it for the whole output.
    const big = await rpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'run_command', arguments: { command: `node -e "process.stdout.write('A'.repeat(30000)+'END')"` } } }, { sid });
    const result = JSON.parse(big.json.result.content[0].text);
    assert.strictEqual(result.exitCode, 0, big.text.slice(0, 400));
    assert.ok(result.stdout.endsWith('END'), 'the tail (where errors usually are) is kept');
    assert.strictEqual(result.stdoutTruncated, true, 'truncation must be flagged');
    assert.strictEqual(result.stdoutChars, 30003, 'total length reported');
    assert.strictEqual(result.stderrTruncated, false);
    const small = await rpc({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'run_command', arguments: { command: 'node -e "process.stdout.write(\'ok\')"' } } }, { sid });
    const smallResult = JSON.parse(small.json.result.content[0].text);
    assert.strictEqual(smallResult.stdout, 'ok');
    assert.strictEqual(smallResult.stdoutTruncated, false);
    assert.strictEqual(smallResult.stdoutChars, 2);

    console.log('mcp interop contracts passed: empty ping, -32601 on 200, annotations, JSON error bodies, honest transports, remote time limits, visible truncation');
  } finally {
    tracker.stopReporter && tracker.stopReporter();
    await Promise.all([uiServer, mcpServer].map(s => new Promise(resolve => s.close(() => resolve()))));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
