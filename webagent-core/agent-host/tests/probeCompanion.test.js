'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const root = path.resolve(__dirname, '../../probe-extension');
const { localBase, parseObservation, request } = require(path.join(root, 'client'));
async function main() {
  const observation = { schema: 'webagent-browser-observation/v1', origin: 'https://arena.ai', pageKind: 'agent', observedAt: new Date().toISOString(), pageDigest: 'a'.repeat(64) };
  assert.strictEqual(localBase('http://localhost:48271'), 'http://127.0.0.1:48271');
  for (const url of ['https://127.0.0.1', 'http://example.com', 'http://127.0.0.1@evil.example', 'http://127.0.0.1/api', 'http://127.0.0.1?secret=x', 'http://[::ffff:127.0.0.1]']) assert.throws(() => localBase(url));
  assert.deepStrictEqual(parseObservation(JSON.stringify(observation)), observation);
  for (const invalid of [{ ...observation, token: 'fixture' }, { ...observation, pageDigest: 123 }, { ...observation, observedAt: '2000-01-01' }, { ...observation, origin: 'https://other.invalid' }]) assert.throws(() => parseObservation(JSON.stringify(invalid)));
  assert.throws(() => parseObservation('x'.repeat(2049)));
  assert.throws(() => request('http://127.0.0.1', 'POST', '/mcp/fixture', {}));
  let mode = 'ok', hits = 0;
  const server = http.createServer((req, res) => {
    hits++;
    if (mode === 'redirect') { res.writeHead(302, { Location: 'https://untrusted.invalid' }); res.end(); }
    else if (mode === 'large') res.end('x'.repeat(70000));
    else if (mode === 'invalid') res.end('not json');
    else res.end(JSON.stringify({ ok: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.deepStrictEqual(await request(origin, 'GET', '/api/diagnostics'), { ok: true });
    for (const value of ['redirect', 'large', 'invalid']) { mode = value; await assert.rejects(request(origin, 'GET', '/api/diagnostics')); }
    assert.strictEqual(hits, 4); // Redirect did not issue a second request.
    const abort = new AbortController(); abort.abort();
    await assert.rejects(request(origin, 'GET', '/api/diagnostics', undefined, abort.signal));
  } finally { await new Promise(resolve => server.close(resolve)); }

  const commands = new Map(), output = [], copied = [], calls = [];
  let input = JSON.stringify(observation), confirmation = '复制', clock = Date.now();
  const identity = { hostInstanceId: 'fixture-host', workspaceRoot: '/fixture', version: 'test' };
  const vscode = {
    UIKind: { Desktop: 1, Web: 2 },
    workspace: { isTrusted: true, getConfiguration: () => ({ get: () => 'http://127.0.0.1:48271' }) },
    env: { uiKind: 1, clipboard: { writeText: async value => copied.push(value) } },
    extensions: { getExtension: () => true },
    window: {
      createOutputChannel: () => ({ clear() { output.length = 0; }, appendLine(value) { output.push(value); }, show() {}, dispose() {} }),
      showWarningMessage: async () => confirmation, showInformationMessage: async () => {}, showInputBox: async () => input,
      showQuickPick: async () => undefined
    },
    commands: { registerCommand(name, handler) { commands.set(name, handler); return { dispose() { commands.delete(name); } }; }, executeCommand: async () => {} }
  };
  const fakeRequest = async (base, method, route) => {
    calls.push({ base, method, route });
    if (route === '/api/diagnostics') return { identity, secretKey: 'NEVER-LOG' };
    if (method === 'POST') return { identity, checkId: 'b'.repeat(32), challenge: 'c'.repeat(64), expiresAt: clock + 120000 };
    return { identity, checkId: 'b'.repeat(32), status: 'echo-confirmed', challenge: 'NEVER-LOG' };
  };
  const sandbox = { module: { exports: {} }, require: name => name === 'vscode' ? vscode : { localBase, parseObservation, request: fakeRequest }, AbortController, Date };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'extension.js'), 'utf8'), sandbox);
  const context = { subscriptions: [] }; sandbox.module.exports.activate(context);
  assert.strictEqual(calls.length, 0, 'Activation must not connect');
  const invoke = action => commands.get('webagentProbe.' + action)();
  await invoke('diagnostics'); assert.ok(!output.join('').includes('NEVER-LOG'));
  vscode.workspace.isTrusted = false; await invoke('import'); assert.strictEqual(calls.length, 1);
  vscode.workspace.isTrusted = true; vscode.env.remoteName = 'ssh-remote'; await invoke('import'); assert.strictEqual(calls.length, 1); delete vscode.env.remoteName;
  vscode.env.uiKind = 2; await invoke('import'); assert.strictEqual(calls.length, 1); vscode.env.uiKind = 1;
  input = JSON.stringify({ ...observation, token: 'do-not-send' }); await invoke('import'); assert.strictEqual(calls.length, 1);
  input = JSON.stringify(observation); await invoke('import'); assert.strictEqual(calls.length, 2);
  assert.ok(!output.join('').includes('c'.repeat(64)));
  confirmation = undefined; await invoke('copy'); assert.strictEqual(copied.length, 0);
  confirmation = '复制'; await invoke('copy'); await invoke('copy'); assert.strictEqual(copied.length, 1);
  assert.strictEqual(JSON.parse(copied[0]).name, 'confirm_connection');
  await invoke('refresh'); assert.ok(output.join('').includes('echo-confirmed')); assert.ok(!output.join('').includes('NEVER-LOG'));
  await invoke('forget'); await invoke('refresh'); assert.strictEqual(calls.length, 3);
  assert.ok(calls.every(call => !call.route.includes('/mcp')));
  for (const subscription of context.subscriptions) subscription.dispose();
  assert.strictEqual(commands.size, 0);
  console.log('probe companion: loopback/schema/redirect/size/abort, explicit activation/import/copy, no self-confirmation, trust/remote rejection and disposal passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
