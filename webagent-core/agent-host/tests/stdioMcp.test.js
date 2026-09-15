'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { fork } = require('child_process');
const { config } = require('../src/config');
const external = require('../src/mcp/externalClient');
const launches = require('../src/mcp/stdioLaunch');
const transports = require('../src/mcp/stdioTransport');
const queue = require('../src/utils/operatorQueue');
const { runWithSignal } = require('../src/utils/requestScope');
const { callTool } = require('../src/tools');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stdio-mcp-')), previous = config.workspaceRoot;
const fixture = path.join(__dirname, 'stdioServerFixture.js');
const envBefore = { token: process.env.GH_TOKEN, secret: process.env.WEBAGENT_STDIO_TEST_SECRET };
config.workspaceRoot = root;
process.env.GH_TOKEN = 'must-not-inherit'; process.env.WEBAGENT_STDIO_TEST_SECRET = 'must-not-inherit';
function alive(pid) {
  try {
    process.kill(pid, 0);
    if (process.platform === 'linux' && fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].startsWith('Z')) return false;
    return true;
  } catch (_) { return false; }
}
async function until(predicate) {
  const end = Date.now() + 15000;
  while (!predicate()) { if (Date.now() > end) throw new Error('Process lifecycle deadline exceeded'); await new Promise(resolve => setTimeout(resolve, 50)); }
}
function prepared(mode = 'normal', extra = {}) {
  return external.previewStdio({ program: process.execPath, args: [fixture, mode], ...extra });
}
let stage = 'validation';
async function main() {
  let owner;
  try {
    assert.throws(() => prepared('normal', { program: 'node' }), /absolute/);
    assert.throws(() => prepared('normal', { cwd: '../' }));
    assert.throws(() => prepared('normal', { env: { NODE_OPTIONS: '--eval bad' } }), /protected/);
    assert.throws(() => prepared('normal', { env: { PATH: '/untrusted' } }), /protected/);
    const reviewed = path.join(root, 'entry.js'); fs.writeFileSync(reviewed, 'old');
    const stale = prepared('normal', { reviewFiles: ['entry.js'] }); fs.writeFileSync(reviewed, 'new');
    await assert.rejects(external.startStdio({ previewId: stale.previewId, confirmed: true }), /changed/);
    assert.ok(!fs.existsSync(path.join(root, 'stdio-started.json')));
    const fakeProgram = path.join(root, 'reviewed-program.exe');
    fs.writeFileSync(fakeProgram, 'not executed'); fs.chmodSync(fakeProgram, 0o755);
    const changedProgram = prepared('normal', { program: fakeProgram }); fs.writeFileSync(fakeProgram, 'changed');
    await assert.rejects(external.startStdio({ previewId: changedProgram.previewId, confirmed: true }), /Executable changed/);
    const expiring = prepared(); const now = Date.now;
    try { Date.now = () => now() + 120001; await assert.rejects(external.startStdio({ previewId: expiring.previewId, confirmed: true }), /expired/); }
    finally { Date.now = now; }
    const special = ['', 'with spaces', 'quote"inside', 'trailing\\', '中文🙂'];
    const preview = prepared('normal', { args: [fixture, 'normal', ...special], env: { FIXTURE_TOKEN: 'private-stdio-value' } });
    assert.ok(!JSON.stringify(preview).includes('private-stdio-value'));
    assert.ok(!fs.existsSync(path.join(root, 'stdio-started.json')), 'Preview never starts the executable');
    preview.launch.args.push('mutable-output-must-not-change-start');
    await assert.rejects(external.startStdio({ previewId: preview.previewId, confirmed: false }), /confirmation/);
    stage = 'normal launch';
    const registered = await external.startStdio({ previewId: preview.previewId, confirmed: true });
    await assert.rejects(external.startStdio({ previewId: preview.previewId, confirmed: true }), /missing/);
    assert.strictEqual(registered.transport, 'stdio');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(root, 'stdio-started.json'))).args, special);
    assert.ok(!fs.existsSync(path.join(root, 'stdio-calls.txt')));
    assert.ok(!JSON.stringify(external.list()).includes(fixture));
    const input = { serverId: registered.serverId, tool: 'echo', arguments: { text: 'hello' }, requestKey: 'stdio-call-001' };
    await assert.rejects(callTool('external_request', input, 'ask', { callerKey: 'local' }));
    const waiting = external.request(input, { callerKey: 'local' });
    assert.ok(!fs.existsSync(path.join(root, 'stdio-calls.txt')));
    await queue.approve(waiting.requestId, true);
    const output = JSON.parse(queue.inspect(waiting.requestId).result.content[0].text);
    assert.deepStrictEqual(output.args, special); assert.strictEqual(output.hostSecret, false); assert.strictEqual(output.launchSpec, false); assert.strictEqual(output.explicitKey, true);
    await queue.approve(waiting.requestId, true);
    assert.strictEqual(fs.readFileSync(path.join(root, 'stdio-calls.txt'), 'utf8'), 'call\n');
    const hanging = external.request({ ...input, arguments: { hang: true }, requestKey: 'stdio-hang-001' }, { callerKey: 'local' });
    const execution = queue.approve(hanging.requestId, true);
    await until(() => fs.readFileSync(path.join(root, 'stdio-calls.txt'), 'utf8') === 'call\ncall\n');
    queue.cancel(hanging.requestId); await execution;
    assert.strictEqual(queue.inspect(hanging.requestId).status, 'unknown');
    await external.closeAll();
    assert.ok(!alive(JSON.parse(fs.readFileSync(path.join(root, 'stdio-started.json'))).pid));
    stage = 'budgets';
    for (const mode of ['bad-json', 'large-line', 'stderr', 'frames', 'total', 'exit']) {
      stage = mode; const launch = prepared(mode);
      if (mode === 'stderr') await external.startStdio({ previewId: launch.previewId, confirmed: true }).catch(() => {});
      else await assert.rejects(external.startStdio({ previewId: launch.previewId, confirmed: true }), undefined, mode);
      await until(() => !alive(JSON.parse(fs.readFileSync(path.join(root, 'stdio-started.json'))).pid));
      for (const client of external.list()) { assert.strictEqual(client.status, 'stopped'); external.remove(client.serverId); }
      assert.deepStrictEqual(external.list(), []);
    }
    for (const mode of ['fragmented', 'server-request']) {
      stage = mode; const launch = prepared(mode); await external.startStdio({ previewId: launch.previewId, confirmed: true });
      if (mode === 'server-request') {
        await until(() => fs.existsSync(path.join(root, 'stdio-server-request.json')));
        assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, 'stdio-server-request.json'))).error.code, -32601);
      }
      await external.closeAll();
    }
    stage = 'concurrency';
    const directPreview = prepared(); const direct = transports.open(launches.consume({ previewId: directPreview.previewId, confirmed: true }));
    await direct.request('initialize', {});
    const controller = new AbortController();
    const pending = Array.from({ length: 8 }, () => runWithSignal(controller.signal, () => direct.request('tools/call', { name: 'echo', arguments: { hang: true } })).catch(() => 'rejected'));
    await assert.rejects(direct.request('tools/list', {}), /eight/);
    controller.abort(); assert.ok((await Promise.all(pending)).every(item => item === 'rejected')); await direct.closed;
    // Killing only the owner must not leave the server or ordinary descendants alive.
    stage = 'owner death';
    owner = fork(path.join(__dirname, 'stdioOwnerFixture.js'), [], { env: { ...process.env, WORKSPACE_ROOT: root }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    await new Promise((resolve, reject) => { owner.once('message', resolve); owner.once('exit', () => reject(new Error('Owner fixture exited before launch'))); });
    await until(() => fs.existsSync(path.join(root, 'stdio-grandchild.json')));
    const childPid = JSON.parse(fs.readFileSync(path.join(root, 'stdio-started.json'))).pid;
    const grandPid = JSON.parse(fs.readFileSync(path.join(root, 'stdio-grandchild.json'))).pid;
    assert.ok(alive(childPid) && alive(grandPid));
    owner.kill('SIGKILL'); await until(() => !alive(childPid) && !alive(grandPid));
    console.log('stdio MCP: preview/hash/confirmation, quoting, minimal env, approval, cancellation, framing budgets and owner-death tree cleanup passed');
  } finally {
    owner?.kill('SIGKILL'); await external.closeAll(); await transports.closeAll(); config.workspaceRoot = previous;
    if (envBefore.token == null) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = envBefore.token;
    if (envBefore.secret == null) delete process.env.WEBAGENT_STDIO_TEST_SECRET; else process.env.WEBAGENT_STDIO_TEST_SECRET = envBefore.secret;
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error('stdio failure stage:', stage); console.error(error); process.exitCode = 1; });
