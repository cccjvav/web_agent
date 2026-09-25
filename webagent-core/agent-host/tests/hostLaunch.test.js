'use strict';
// One-click host (R6 phase 1): host lifeline, launch.js host mode, host.json install stamp and the
// extension's HostManager — including a real host started, attached and stopped end to end.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const vm = require('vm');
const { EventEmitter } = require('events');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '../../..');
const { watchLifeline, takeLaunchEnv } = require('../src/utils/lifeline');
const { ownerLifeline } = require('../../../installer/launch');
const installer = require('../../scripts/install-desktop-extension');
const hm = require('../../extension/hostManager');
const { sameWorkspace } = require('../../extension/workspaceMatch');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'host-launch-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Every manager created here is disposed at the end, pass or fail, so a failed assertion reports
// promptly instead of leaving a running host that keeps the test process alive until the CI timeout.
const managers = [];
class TrackedManager extends hm.HostManager {
  constructor(options) { super(options); managers.push(this); }
}

function writeHostJson(dir, data) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'host.json'), JSON.stringify(data));
  return dir;
}

// A throwaway "host root" whose launch.js is the given script (for failure paths).
function fakeRoot(name, script) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(path.join(dir, 'installer'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'webagent-core/agent-host/src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'installer/launch.js'), script);
  fs.writeFileSync(path.join(dir, 'webagent-core/agent-host/src/index.js'), '// placeholder\n');
  return dir;
}

async function waitFor(check, ms, label) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await sleep(100); }
  throw new Error('timed out: ' + label);
}

// Pick a block of free ports away from the product defaults so parallel runs do not collide.
async function freePortNear(span) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const base = 30000 + Math.floor(Math.random() * 20000);
    let ok = true;
    for (let p = base; p < base + span && ok; p++) ok = await hm.portFree(p);
    if (ok) return base;
  }
  throw new Error('no free port block');
}

// The two fakes below deliberately ignore stdin EOF (to exercise the tree kill). They still exit
// when the test process disappears, so a test killed from outside (runner or command timeout)
// cannot leave them behind: they are spawned detached on POSIX and escape a process-group kill.
const EXIT_WITH_PARENT = 'const parentPid = process.ppid; setInterval(() => { try { process.kill(parentPid, 0); } catch { process.exit(0); } }, 300);';

const FAKE_STATUS_SERVER = `
const http = require('http');
const ws = process.argv[3];
http.createServer((req, res) => { res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({ workspaceRoot: process.env.FAKE_WS || ws, identity: { hostInstanceId: 'fake' } })); })
  .listen(Number(process.env.AGENT_HOST_PORT), '127.0.0.1');
`;

async function main() {
  // --- 1. host lifeline (src/utils/lifeline.js) ---
  {
    const stdin = new EventEmitter(); stdin.resume = () => {};
    const lost = [];
    const off = watchLifeline({ env: {}, stdin, onLost: (r) => lost.push(r) });
    assert.strictEqual(off.active, false, 'classic/CMD start: no lifeline');
    stdin.emit('end'); assert.deepStrictEqual(lost, []);
    const on = watchLifeline({ env: { WEBAGENT_LIFELINE: 'stdin' }, stdin, onLost: (r) => lost.push(r) });
    assert.strictEqual(on.active, true);
    stdin.emit('end'); stdin.emit('close');
    assert.deepStrictEqual(lost, ['stdin-closed'], 'fires exactly once');
    const pidLost = [];
    const pidWatch = watchLifeline({ env: { WEBAGENT_PARENT_PID: '424242' }, stdin: null, intervalMs: 10, isAlive: () => false, onLost: (r) => pidLost.push(r) });
    assert.strictEqual(pidWatch.active, true);
    await waitFor(() => pidLost.length === 1, 2000, 'parent-exited');
    assert.deepStrictEqual(pidLost, ['parent-exited']);
    for (const bad of ['0', '-5', 'abc', '1e3', '']) {
      assert.strictEqual(watchLifeline({ env: { WEBAGENT_PARENT_PID: bad }, stdin: null, onLost() {} }).active, false, 'invalid pid ' + bad);
    }
    assert.throws(() => watchLifeline({ env: {} }), /onLost/);
    const env = { WEBAGENT_LIFELINE: 'stdin', WEBAGENT_PARENT_PID: '123', WEBAGENT_SKIP_WORKBENCH: '1', PATH: 'x' };
    assert.deepStrictEqual(takeLaunchEnv(env), { WEBAGENT_LIFELINE: 'stdin', WEBAGENT_PARENT_PID: '123', WEBAGENT_SKIP_WORKBENCH: '1' });
    assert.deepStrictEqual(env, { PATH: 'x' }, 'launch-only variables are removed so children cannot inherit them');
    assert.deepStrictEqual(takeLaunchEnv({}), {});
  }

  // --- 2. launch.js ownerLifeline: only host mode with the variable reads stdin ---
  {
    const stdin = new EventEmitter(); stdin.resume = () => {}; stdin.destroy = () => { stdin.destroyed = true; };
    assert.strictEqual(ownerLifeline('classic', { WEBAGENT_LIFELINE: 'stdin' }, stdin).enabled, false);
    assert.strictEqual(ownerLifeline('host', {}, stdin).enabled, false);
    const life = ownerLifeline('host', { WEBAGENT_LIFELINE: 'stdin' }, stdin);
    assert.strictEqual(life.enabled, true);
    const calls = [];
    life.onGone(() => calls.push('abort'));
    stdin.emit('end');
    life.onGone(() => calls.push('late'));
    assert.deepStrictEqual(calls, ['abort', 'late'], 'callbacks registered after EOF run immediately');
    life.release(); assert.strictEqual(stdin.destroyed, true);
  }

  // --- 3. host.json install stamp (R8 deviation c) ---
  {
    const extDir = path.join(tmp, 'vscode-extensions');
    const installed = installer.installTo(extDir);
    const stamp = JSON.parse(fs.readFileSync(path.join(installed.dest, 'host.json'), 'utf8'));
    assert.strictEqual(stamp.format, 1);
    assert.strictEqual(path.resolve(stamp.root), root);
    assert.strictEqual(stamp.contentHash, installer.contentHash(installer.SRC));
    assert.ok(stamp.commit === null || /^[0-9a-f]{40}$/.test(stamp.commit));
    assert.strictEqual(installer.contentHash(installed.dest), stamp.contentHash, 'installed copy hashes like the source (host.json excluded)');
    const loc = hm.readHostLocation(installed.dest);
    assert.strictEqual(loc.root, root);
    const changed = path.join(tmp, 'changed-ext');
    installer.copyTree(installer.SRC, changed);
    fs.appendFileSync(path.join(changed, 'extension.js'), '\n// drift\n');
    assert.notStrictEqual(installer.contentHash(changed), stamp.contentHash, 'any file change alters the hash');
  }

  // --- 4. readHostLocation errors are explanatory ---
  assert.throws(() => hm.readHostLocation(path.join(tmp, 'no-such-ext')), /host\.json/);
  assert.throws(() => hm.readHostLocation(writeHostJson(path.join(tmp, 'bad-format'), { format: 2, root })), /格式无效/);
  assert.throws(() => hm.readHostLocation(writeHostJson(path.join(tmp, 'moved'), { format: 1, root: path.join(tmp, 'gone') })), /不存在或不完整/);

  // --- 5. stale install warning ---
  {
    const ext = writeHostJson(path.join(tmp, 'stale'), { format: 1, root, commit: 'a'.repeat(40) });
    const m = new TrackedManager({ extensionDir: ext, repoCommit: async () => 'b'.repeat(40) });
    const info = await m.checkSource();
    assert.match(info.warning, /重新运行 install-vscode-extension\.cmd/);
    const same = new TrackedManager({ extensionDir: ext, repoCommit: async () => 'a'.repeat(40) });
    assert.strictEqual((await same.checkSource()).warning, null);
  }

  // --- 6. real host: start, attach from a second manager, stop gracefully via the lifeline ---
  const base = await freePortNear(4);
  const workbenchPort = await freePortNear(1);
  const ws = fs.mkdtempSync(path.join(tmp, 'ws-'));
  const ext = writeHostJson(path.join(tmp, 'ext-real'), { format: 1, root });
  const logs = [], kills = [];
  const env = { ...process.env, WORKBENCH_PORT: String(workbenchPort) };
  delete env.WEBAGENT_SKIP_WORKBENCH;
  const first = new TrackedManager({
    extensionDir: ext, portBase: base, portSpan: 4, env, nodePath: () => process.execPath,
    workspaceMatches: sameWorkspace, readyTimeoutMs: 90000, log: (l) => logs.push(l),
    killTreeImpl: async (pid, platform) => { kills.push(pid); return hm.killTree(pid, platform); }
  });
  const snap = await first.start(ws);
  assert.strictEqual(snap.state, 'running');
  assert.strictEqual(snap.owned, true);
  const status = await hm.probeStatus(snap.url);
  assert.ok(sameWorkspace(status.workspaceRoot, ws), 'host serves the VS Code folder');
  assert.strictEqual(await hm.portFree(workbenchPort), true, 'host mode opens no workbench port');
  assert.strictEqual(first.currentUrl(), snap.url);
  assert.strictEqual((await first.start(ws)).pid, snap.pid, 'second start is a no-op (same process)');

  const second = new TrackedManager({ extensionDir: path.join(tmp, 'no-host-json'), portBase: base, portSpan: 4, workspaceMatches: sameWorkspace });
  const attached = await second.start(ws);
  assert.strictEqual(attached.state, 'external', 'another window attaches instead of spawning');
  assert.strictEqual(attached.url, snap.url);
  assert.deepStrictEqual(await second.stop(), { stopped: false, external: true }, 'never stops a host it did not start');
  assert.ok(await hm.probeStatus(snap.url), 'still running after the attached window stops');
  const third = new TrackedManager({ extensionDir: ext, portBase: base, portSpan: 4, workspaceMatches: sameWorkspace });
  assert.strictEqual((await third.attachExisting(ws)).state, 'external', 'activation attaches without spawning');
  const otherWs = fs.mkdtempSync(path.join(tmp, 'other-'));
  const fourth = new TrackedManager({ extensionDir: ext, portBase: base, portSpan: 4, workspaceMatches: sameWorkspace });
  assert.strictEqual((await fourth.attachExisting(otherWs)).state, 'idle', 'a host for another folder is not attached');
  await assert.rejects(first.start(otherWs), /请先停止它/, 'changing the first folder never orphans the running host');
  assert.strictEqual(first.snapshot().pid, snap.pid);
  const afterError = new TrackedManager({ extensionDir: ext, portBase: base, portSpan: 4, workspaceMatches: sameWorkspace });
  afterError.setState('error', { error: '上次启动失败' });
  const recovered = await afterError.attachExisting(ws);
  assert.strictEqual(recovered.state, 'external', 'after a failed start, a host that appeared for the folder is attached');
  assert.strictEqual(recovered.error, null);

  // Commands the agent runs under this host must not inherit the owner variables: a nested host
  // (npm test starting its own agent-host) would otherwise treat its own stdin EOF as "owner gone".
  const probeCmd = 'node -e "console.log(\'LIFE=\'+(process.env.WEBAGENT_LIFELINE||\'none\')+\' PPID=\'+(process.env.WEBAGENT_PARENT_PID||\'none\')+\' SKIP=\'+(process.env.WEBAGENT_SKIP_WORKBENCH||\'none\'))"';
  const call = await fetch(status.mcpUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'run_command', arguments: { command: probeCmd } } }) });
  const callText = await call.text();
  assert.strictEqual(call.status, 200, callText.slice(0, 500));
  assert.match(callText, /LIFE=none PPID=none SKIP=none/, 'run_command inherited launch-only variables: ' + callText.slice(0, 800));

  const stopped = await first.stop();
  assert.deepStrictEqual(stopped, { stopped: true, external: false });
  assert.deepStrictEqual(kills, [], 'graceful: closing stdin was enough, no tree kill');
  assert.ok(logs.some((l) => l.includes('[lifeline]')), 'host ran its own shutdown via the lifeline');
  assert.strictEqual(await hm.probeStatus(snap.url), null);
  assert.strictEqual(first.snapshot().state, 'idle');
  second.markLost();
  assert.strictEqual(second.snapshot().state, 'idle');

  // --- 7. real host exits when its parent process disappears (no stdin lifeline) ---
  {
    const parent = spawn(process.execPath, ['-e', 'setTimeout(()=>{},300)'], { stdio: 'ignore' });
    const port = await freePortNear(1);
    const host = spawn(process.execPath, [path.join(root, 'installer/launch.js'), 'host', ws], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, AGENT_HOST_PORT: String(port), WEBAGENT_PARENT_PID: String(parent.pid), WEBAGENT_LIFELINE: '' }
    });
    let out = '';
    host.stdout.on('data', (d) => { out += d; }); host.stderr.on('data', (d) => { out += d; });
    const exited = await hm.waitExit(host, 30000);
    if (!exited) { await hm.killTree(host.pid); }
    assert.ok(exited, 'host must exit after its parent is gone; output:\n' + out.slice(-2000));
    assert.match(out, /\[lifeline\]/);
  }

  // --- 8. failure paths with fake roots ---
  {
    // Never ready and ignores EOF: start times out, then the tree is killed.
    const hung = fakeRoot('hung', EXIT_WITH_PARENT + ' process.stdin.resume(); setInterval(() => {}, 1000);');
    const kills2 = [];
    const m = new TrackedManager({
      extensionDir: writeHostJson(path.join(tmp, 'ext-hung'), { format: 1, root: hung }), portBase: await freePortNear(2), portSpan: 2,
      nodePath: () => process.execPath, readyTimeoutMs: 1500, pollMs: 100, stopTimeoutMs: 500,
      killTreeImpl: async (pid, platform) => { kills2.push(pid); return hm.killTree(pid, platform); }
    });
    await assert.rejects(m.start(tmp), /未就绪/);
    assert.strictEqual(kills2.length, 1, 'hung host is force-killed after the stdin close is ignored');
    assert.strictEqual(m.snapshot().state, 'error');
    assert.strictEqual(m.snapshot().owned, false);

    // Ready but ignores EOF: stop falls back to the tree kill.
    const stubborn = fakeRoot('stubborn', FAKE_STATUS_SERVER + EXIT_WITH_PARENT + ' process.stdin.resume();');
    const kills3 = [];
    const s = new TrackedManager({
      extensionDir: writeHostJson(path.join(tmp, 'ext-stubborn'), { format: 1, root: stubborn }), portBase: await freePortNear(2), portSpan: 2,
      nodePath: () => process.execPath, pollMs: 100, stopTimeoutMs: 500, workspaceMatches: sameWorkspace,
      killTreeImpl: async (pid, platform) => { kills3.push(pid); return hm.killTree(pid, platform); }
    });
    const ready = await s.start(tmp);
    assert.strictEqual(ready.state, 'running');
    assert.strictEqual((await s.stop()).stopped, true);
    assert.strictEqual(kills3.length, 1);

    // Answers for another folder: refused and stopped.
    const wrong = fakeRoot('wrong', FAKE_STATUS_SERVER + "process.stdin.on('end', () => process.exit(0)); process.stdin.resume();");
    const w = new TrackedManager({
      extensionDir: writeHostJson(path.join(tmp, 'ext-wrong'), { format: 1, root: wrong }), portBase: await freePortNear(2), portSpan: 2,
      nodePath: () => process.execPath, pollMs: 100, workspaceMatches: sameWorkspace, env: { ...process.env, FAKE_WS: path.join(tmp, 'elsewhere') }
    });
    await assert.rejects(w.start(tmp), /不一致/);
    assert.strictEqual(w.snapshot().owned, false);

    // Stop during start is a cancel, not an error.
    const slow = fakeRoot('slow', "process.stdin.on('end', () => process.exit(0)); process.stdin.resume(); setInterval(() => {}, 1000);");
    const c = new TrackedManager({
      extensionDir: writeHostJson(path.join(tmp, 'ext-slow'), { format: 1, root: slow }), portBase: await freePortNear(2), portSpan: 2,
      nodePath: () => process.execPath, pollMs: 100, readyTimeoutMs: 20000
    });
    const pending = c.start(tmp);
    await waitFor(() => c.snapshot().owned, 5000, 'spawned');
    await c.stop();
    await assert.rejects(pending, (error) => error.cancelled === true);
    assert.strictEqual(c.snapshot().state, 'idle');
    assert.strictEqual(c.snapshot().error, null);

    // A host for another folder on the base port is neither attached nor stopped; the new host
    // takes the next port and the snapshot explains it (Named Tunnel ingress fixed to the base port).
    const portBase2 = await freePortNear(3);
    const otherFolder = fakeRoot('other-folder', FAKE_STATUS_SERVER + "process.stdin.on('end', () => process.exit(0)); process.stdin.resume();");
    const occupant = spawn(process.execPath, [path.join(otherFolder, 'installer/launch.js'), 'host', path.join(tmp, 'someone-else')], {
      stdio: ['pipe', 'ignore', 'ignore'], env: { ...process.env, AGENT_HOST_PORT: String(portBase2) } });
    await waitFor(async () => Boolean(await hm.probeStatus('http://127.0.0.1:' + portBase2)), 5000, 'occupant ready');
    const good = fakeRoot('good', FAKE_STATUS_SERVER + "process.stdin.on('end', () => process.exit(0)); process.stdin.resume();");
    const g = new TrackedManager({
      extensionDir: writeHostJson(path.join(tmp, 'ext-good'), { format: 1, root: good }), portBase: portBase2, portSpan: 3,
      nodePath: () => process.execPath, pollMs: 100, workspaceMatches: sameWorkspace
    });
    const moved = await g.start(tmp);
    assert.strictEqual(moved.state, 'running');
    assert.strictEqual(moved.url, 'http://127.0.0.1:' + (portBase2 + 1));
    assert.match(moved.warning, new RegExp('端口 ' + portBase2 + ' 已被服务其他文件夹'));
    assert.match(moved.warning, /Named Tunnel/);
    await g.stop();
    assert.strictEqual(g.snapshot().warning, null, 'note cleared once the host is stopped');
    assert.ok(await hm.probeStatus('http://127.0.0.1:' + portBase2), 'the other folder\'s host is untouched');
    occupant.stdin.end();
    await hm.waitExit(occupant, 5000);

    // Stop before the process exists (while locating): the start is cancelled and never spawns.
    let spawned = 0;
    const early = new TrackedManager({
      extensionDir: writeHostJson(path.join(tmp, 'ext-early'), { format: 1, root: slow }), portBase: await freePortNear(2), portSpan: 2,
      nodePath: () => process.execPath, pollMs: 50,
      probe: async () => { await sleep(300); return null; },
      spawnImpl: (...args) => { spawned++; return spawn(...args); }
    });
    const earlyStart = early.start(tmp);
    await sleep(50);
    assert.strictEqual(early.snapshot().state, 'starting');
    assert.strictEqual(early.snapshot().owned, false);
    assert.deepStrictEqual(await early.stop(), { stopped: false, external: false, cancelled: true });
    await assert.rejects(earlyStart, (error) => error.cancelled === true);
    assert.strictEqual(spawned, 0, 'no host process after an early stop');
    assert.strictEqual(early.snapshot().state, 'idle');

    // Missing node executable and exhausted ports give actionable messages.
    const n = new TrackedManager({ extensionDir: ext, portBase: await freePortNear(2), portSpan: 2, nodePath: () => path.join(tmp, 'no-node', 'node'), pollMs: 50 });
    await assert.rejects(n.start(tmp), /找不到 Node|webagent\.nodePath/);
    const full = new TrackedManager({ extensionDir: ext, portBase: await freePortNear(2), portSpan: 2, isPortFree: async () => false, nodePath: () => process.execPath });
    await assert.rejects(full.start(tmp), /都被占用/);
  }

  // --- 9. extension wiring: explicit URL detection, managed URL, nodePath scope, webview messages ---
  {
    let inspectValue = {};
    const vscode = { workspace: { getConfiguration: () => ({ inspect: () => inspectValue, get: () => 'http://127.0.0.1:48271' }) } };
    const context = vm.createContext({ module: { exports: {} }, console, process: { ...process, env: {} }, URL,
      require: (name) => (name === 'vscode' ? vscode
        : name === './ptyHost' ? { startPtyHost: () => ({}) }
        : name === './editorReview' ? { registerEditorReview: () => {} }
        : name.startsWith('./') ? require(path.join(root, 'webagent-core/extension', name)) : require(name)) });
    vm.runInContext(fs.readFileSync(path.join(root, 'webagent-core/extension/extension.js'), 'utf8')
      + '\nmodule.exports.t={explicitHostUrl,agentHostUrl,nodePathSetting,validWebviewMessage,hostErrorHint,setManager:(m)=>{hostManager=m;}};', context);
    const t = context.module.exports.t;
    assert.strictEqual(t.explicitHostUrl(), '', 'package.json default is not an explicit choice');
    assert.strictEqual(t.agentHostUrl(), 'http://127.0.0.1:48271');
    t.setManager({ currentUrl: () => 'http://127.0.0.1:40123' });
    assert.strictEqual(t.agentHostUrl(), 'http://127.0.0.1:40123', 'managed host URL is used');
    inspectValue = { globalValue: 'http://127.0.0.1:48271' };
    assert.strictEqual(t.agentHostUrl(), 'http://127.0.0.1:48271', 'an explicit setting wins over the managed host');
    inspectValue = { workspaceValue: 'http://example.com:48271' };
    assert.throws(() => t.agentHostUrl(), /webagent\.agentHostUrl/, 'loopback-only rule unchanged');
    inspectValue = { workspaceValue: '/tmp/evil-node' };
    assert.strictEqual(t.nodePathSetting(), 'node', 'workspace cannot choose the node executable');
    inspectValue = { globalValue: 'node18' };
    assert.throws(() => t.nodePathSetting(), /完整路径/);
    inspectValue = { globalValue: process.execPath };
    assert.strictEqual(t.nodePathSetting(), process.execPath);
    for (const ok of [{ type: 'hostStart' }, { type: 'hostStop' }, { type: 'hostLog' }, { type: 'autoBridge', value: true }, { type: 'start', tunnelProvider: 'ngrok' }, { type: 'start' }]) {
      assert.strictEqual(t.validWebviewMessage(ok, 'bridge'), true, JSON.stringify(ok));
    }
    for (const bad of [{ type: 'autoBridge', value: 'yes' }, { type: 'start', tunnelProvider: 'local' }, { type: 'hostStart' }]) {
      assert.strictEqual(t.validWebviewMessage(bad, bad.type === 'hostStart' ? 'chat' : 'bridge'), false, JSON.stringify(bad));
    }
    assert.match(t.hostErrorHint(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })), /点【启动】/);
    assert.strictEqual(t.hostErrorHint(new Error('其他错误')), '其他错误');
  }

  // --- 10. package.json contract ---
  {
    const pkg = require('../../extension/package.json');
    const props = pkg.contributes.configuration.properties;
    assert.strictEqual(props['webagent.nodePath'].scope, 'machine');
    assert.strictEqual(props['webagent.autoStartHost'].default, false);
    const ids = pkg.contributes.commands.map((c) => c.command);
    for (const id of ['webagent.startHost', 'webagent.stopHost', 'webagent.showHostLog']) assert.ok(ids.includes(id), id);
  }
  console.log('host launch: lifeline, launch host mode, host.json stamp, real start/attach/graceful stop, parent-exit, failure paths and extension wiring passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    await Promise.race([Promise.allSettled(managers.map((m) => m.dispose())), sleep(20000)]);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* host may still hold files briefly */ }
    process.exit(process.exitCode || 0);
  });
