'use strict';
// Sidebar click feedback and chat failure reasons (R6 phase-1 acceptance feedback, 2026-09-26).
// Runs the real extension activate() with VS Code, HTTP transport and HostManager replaced, then runs the
// generated sidebar/chat page scripts against a small DOM fixture.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sidebar-feedback-'));
const subscriptions = [];

async function main() {
  delete process.env.WEBAGENT_AGENT_HOST_URL;
  const commands = new Map(), providers = new Map();
  const infos = [], warnings = [], errors = [], settingsPanels = [];
  let confirmAnswer;
  const vscode = {
    workspace: {
      get workspaceFolders() { return [{ uri: { scheme: 'file', fsPath: tmp } }]; },
      isTrusted: true,
      getConfiguration: () => ({ get: () => undefined, inspect: () => ({}) }),
      onDidChangeWorkspaceFolders: () => ({ dispose: () => {} })
    },
    window: {
      showInformationMessage: message => { infos.push(message); return Promise.resolve(); },
      showWarningMessage: (message, options) => { warnings.push({ message, options }); return Promise.resolve(confirmAnswer); },
      showErrorMessage: (message, options) => { errors.push({ message, options }); return Promise.resolve(); },
      createStatusBarItem: () => ({ show: () => {}, dispose: () => {} }),
      createOutputChannel: () => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }),
      registerWebviewViewProvider: (id, provider) => { providers.set(id, provider); return { dispose: () => {} }; },
      // The settings tab (section 6): a minimal WebviewPanel.
      createWebviewPanel: (viewType, title, column, options) => {
        const panel = { viewType, title, options, posted: [], revealed: 0, disposed: false, listeners: [], onDispose: [],
          webview: { cspSource: 'vscode-webview://test', html: '', asWebviewUri: uri => ({ toString: () => 'vscode-webview://test' + uri.fsPath }),
            postMessage: message => { panel.posted.push(message); return Promise.resolve(true); },
            onDidReceiveMessage: fn => { panel.listeners.push(fn); return { dispose: () => { panel.listeners = []; } }; } },
          reveal: () => { panel.revealed++; },
          onDidDispose: fn => { panel.onDispose.push(fn); },
          dispose: () => { if (!panel.disposed) { panel.disposed = true; panel.onDispose.forEach(fn => fn()); } } };
        settingsPanels.push(panel);
        return panel;
      }
    },
    commands: {
      registerCommand: (id, fn) => { commands.set(id, fn); return { dispose: () => {} }; },
      executeCommand: async (id, ...args) => (commands.has(id) ? commands.get(id)(...args) : undefined)
    },
    chat: { createChatParticipant: () => ({ dispose: () => {} }) },
    env: { clipboard: { writeText: async () => {} } },
    Uri: { file: fsPath => ({ fsPath }) },
    ViewColumn: { Active: -1 },
    StatusBarAlignment: { Right: 2 }
  };
  // Controllable stand-in for hostManager.js: tests set the snapshot and what start/stop do.
  const fake = { snap: { state: 'idle' }, stops: 0, stopResult: { stopped: true, external: false }, start: async () => fake.snap };
  class FakeHostManager {
    snapshot() { return { ...fake.snap }; }
    currentUrl() { return null; }
    checkSource() { return Promise.resolve({}); }
    attachExisting() { return Promise.resolve(); }
    start(folder) { return fake.start(folder); }
    async stop() { fake.stops++; return fake.stopResult; }
    markLost() {}
    dispose() { return Promise.resolve({ stopped: false }); }
  }
  const context = vm.createContext({
    module: { exports: {} }, console, process, URL, Buffer, setTimeout, clearTimeout, setInterval, clearInterval,
    require: name => name === 'vscode' ? vscode
      : name === './workspaceMatch' ? require('../../extension/workspaceMatch')
      : name === './hostManager' ? { HostManager: FakeHostManager, readHostLocation: () => ({ root }) }
      : name === './settingsPanel' ? require('../../extension/settingsPanel')
      : name === './apiRelay' ? require('../../extension/apiRelay')
      : name === './editorReview' ? { registerEditorReview: () => {} }
      : name === './ptyHost' ? { startPtyHost: () => ({ dispose: () => {} }) }
      : name === './modeFromChatRequest' ? { modeFromChatRequest: () => 'code' }
      : name.startsWith('./') ? {} : require(name)
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'webagent-core/extension/extension.js'), 'utf8')
    + '\nmodule.exports.activate = activate;', context);
  context.activate({ subscriptions, extensionPath: tmp });

  const oldSecret = 'a'.repeat(24), newSecret = 'b'.repeat(24);
  let bridgeRunning = true, secret = oldSecret, rejectPost = false;
  const posts = [];
  context.transport = async (method, url, body) => {
    if (method === 'GET') return { status: 200, json: { status: 'online', workspaceRoot: tmp, bridgeRunning, identity: { hostInstanceId: 'instance' }, secretKey: secret } };
    posts.push({ url, body });
    if (rejectPost) throw new Error('本机API请求超时');
    if (url.endsWith('/api/bridge/reset-secret')) {
      secret = newSecret;
      return { status: 200, json: { success: true, secretKey: newSecret, mcpPath: '/mcp/' + newSecret, mcpUrl: 'https://host.test/mcp/' + newSecret, mcpCanonicalUrl: 'https://host.test/mcp' } };
    }
    return { status: 200, json: { success: true, running: false } };
  };
  vm.runInContext('requestJson = transport;', context);
  function clear() { infos.length = 0; warnings.length = 0; errors.length = 0; posts.length = 0; fake.stops = 0; confirmAnswer = undefined; bridgeRunning = true; rejectPost = false; fake.stopResult = { stopped: true, external: false }; }

  // 1. stopHost reports what happened (the command path the sidebar button uses).
  const stopHost = () => commands.get('webagent.stopHost')();
  clear(); fake.snap = { state: 'starting', owned: false };
  assert.equal(await stopHost(), 'cancelled-start'); assert.equal(fake.stops, 1);
  clear(); fake.snap = { state: 'external', owned: false };
  assert.equal(await stopHost(), 'external'); assert.equal(fake.stops, 0);
  assert.ok(infos.some(m => m.includes('插件不会关闭它')), 'external host explains why it is not stopped');
  clear(); fake.snap = { state: 'idle', owned: false };
  assert.equal(await stopHost(), 'none'); assert.equal(fake.stops, 0);
  clear(); fake.snap = { state: 'running', owned: true }; confirmAnswer = undefined;
  assert.equal(await stopHost(), 'declined'); assert.equal(fake.stops, 0, 'declining the modal must not stop the host');
  assert.ok(warnings[0] && warnings[0].options && warnings[0].options.modal === true);
  clear(); fake.snap = { state: 'running', owned: true }; confirmAnswer = '停止';
  assert.equal(await stopHost(), 'stopped'); assert.equal(fake.stops, 1);
  clear(); fake.snap = { state: 'running', owned: true }; bridgeRunning = false;
  assert.equal(await stopHost(), 'stopped'); assert.equal(warnings.length, 0, 'no Bridge running: no modal');
  clear(); fake.snap = { state: 'running', owned: true }; bridgeRunning = false; fake.stopResult = { stopped: false, external: false };
  assert.equal(await stopHost(), 'unconfirmed');

  // 2. Every sidebar click with an actionId is answered with actionDone, success or failure.
  const bridge = providers.get('webagent.bridgeView');
  const sent = [];
  let receiver;
  bridge.refresh = async () => {};
  bridge.resolveWebviewView({ webview: { options: {}, postMessage: m => { sent.push(m); return Promise.resolve(true); }, onDidReceiveMessage: fn => { receiver = fn; } } });
  const done = async (msg) => { sent.length = 0; await receiver(msg); return sent.filter(m => m.type === 'actionDone'); };
  const one = async (msg) => { const answers = await done(msg); assert.equal(answers.length, 1, JSON.stringify(msg)); assert.equal(answers[0].actionId, msg.actionId); return answers[0]; };

  clear(); fake.snap = { state: 'running', owned: true };
  assert.deepEqual(JSON.parse(JSON.stringify(await one({ type: 'hostStop', actionId: 'a3' }))), { type: 'actionDone', actionId: 'a3', ok: true, text: '已取消，主机继续运行' });
  clear(); fake.snap = { state: 'running', owned: true }; confirmAnswer = '停止';
  assert.equal((await one({ type: 'hostStop', actionId: 'a4' })).text, '主机已停止');
  clear(); fake.snap = { state: 'running', owned: true }; bridgeRunning = false; fake.stopResult = { stopped: false, external: false };
  const unconfirmed = await one({ type: 'hostStop', actionId: 'a5' });
  assert.equal(unconfirmed.ok, false); assert.ok(unconfirmed.text.includes('停止未确认'));

  clear(); fake.snap = { state: 'idle' }; fake.start = async () => { fake.snap = { state: 'running', owned: true }; return fake.snap; };
  assert.equal((await one({ type: 'hostStart', actionId: 'a6' })).text, '主机已启动');
  clear(); fake.snap = { state: 'idle' }; fake.start = async () => { fake.snap = { state: 'external', owned: false }; return fake.snap; };
  assert.equal((await one({ type: 'hostStart', actionId: 'a7' })).text, '已接管外部启动的主机');
  // startHost swallows errors (it shows its own message) and returns null: judge by the real state.
  clear(); fake.snap = { state: 'idle' }; fake.start = async () => { fake.snap = { state: 'error', error: 'x' }; throw new Error('找不到 Node'); };
  const failedStart = await one({ type: 'hostStart', actionId: 'a8' });
  assert.equal(failedStart.ok, false); assert.equal(failedStart.text, '未启动：原因见提示与【日志】');
  assert.ok(errors.some(e => e.message === '找不到 Node'), 'startHost still shows the reason');
  clear(); fake.snap = { state: 'idle' }; fake.start = async () => { fake.snap = { state: 'running', owned: true }; throw new Error('Bridge 启动被拒绝'); };
  const halfStart = await one({ type: 'hostStart', actionId: 'a9' });
  assert.equal(halfStart.ok, true); assert.equal(halfStart.text, '主机已启动，但后续步骤出错（见提示）');

  clear();
  assert.equal((await one({ type: 'stop', actionId: 'a10' })).text, 'Bridge 已停止');
  clear(); rejectPost = true;
  const failedStop = await one({ type: 'stop', actionId: 'a11' });
  assert.equal(failedStop.ok, false); assert.ok(failedStop.text.startsWith('失败：停止结果未确认'), failedStop.text);
  assert.ok(errors.some(e => e.options && e.options.modal === true), 'a thrown action still shows the modal error');
  clear();
  assert.equal((await one({ type: 'start', tunnelProvider: 'cloudflare', actionId: 'a12' })).text, 'Bridge 已启动');
  clear(); confirmAnswer = undefined;
  const declinedReset = await one({ type: 'reset', actionId: 'a13' });
  assert.equal(declinedReset.ok, false); assert.equal(declinedReset.text, '未重置（见提示）');
  assert.equal(posts.length, 0, 'declined reset sends nothing');
  clear(); confirmAnswer = '重置'; secret = oldSecret;
  const reset = await one({ type: 'reset', actionId: 'a14' });
  assert.equal(reset.ok, true); assert.ok(reset.text.startsWith('密钥已重置'));
  assert.ok(!reset.text.includes(newSecret) && !reset.text.includes(oldSecret), 'feedback never carries the secret');
  clear();
  assert.equal((await one({ type: 'control', workMode: 'chat', actionId: 'a15' })).text, '已由主机应用');

  clear(); fake.snap = { state: 'running', owned: true }; bridgeRunning = false;
  assert.equal((await done({ type: 'hostStop' })).length, 0, 'no actionId: no actionDone');
  clear(); fake.snap = { state: 'running', owned: true }; bridgeRunning = false;
  assert.equal((await done({ type: 'hostStop', actionId: 'x1' })).length, 0);
  assert.equal(fake.stops, 0, 'a malformed actionId rejects the whole message');

  // 3. Message validation.
  for (const ok of ['a1', 'a123456789']) assert.equal(context.validWebviewMessage({ type: 'hostStart', actionId: ok }, 'bridge'), true, ok);
  for (const bad of ['a', 'b1', 'a1234567890', 'a1 ', 7, null, {}]) assert.equal(context.validWebviewMessage({ type: 'hostStart', actionId: bad }, 'bridge'), false, String(bad));

  // 4. Native chat line: the failure reason is shown, one line, clipped, markdown-escaped.
  assert.equal(context.toolLineMarkdown({ name: 'read', ok: true, durationMs: 12 }), '\n\n- **read** · 12 ms\n');
  assert.equal(context.toolLineMarkdown({ name: 'run_command', ok: false }), '\n\n- **run_command** · Failed\n');
  assert.equal(context.toolLineMarkdown({ name: 'run_command', ok: false, error: 'PTY approval/execution deadline expired' }),
    '\n\n- **run_command** · Failed：PTY approval/execution deadline expired\n');
  const hostile = context.toolLineMarkdown({ name: 'x', error: '**bold** [link](http://e.test)\n<img src=x> `code` a_b' });
  assert.ok(hostile.includes('Failed：\\*\\*bold\\*\\* \\[link\\]\\(http://e\\.test\\) \\<img src=x\\> \\`code\\` a\\_b'), hostile);
  assert.ok(!/\n[^\n]*\n[^\n]*\n\n/.test(hostile.slice(2)), 'reason collapsed to one line');
  assert.equal(context.toolFailureReason({ message: 'EACCES' }), 'EACCES');
  assert.equal(context.toolFailureReason({ code: 'E_X' }), '{"code":"E_X"}');
  assert.equal(context.toolFailureReason(undefined), '');
  const long = context.toolFailureReason('x'.repeat(400));
  assert.equal(long.length, 301); assert.ok(long.endsWith('…'));

  // 5. Generated pages.
  function runPage(html) {
    const script = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)[1];
    function element(id) {
      const classes = new Set();
      return { id, children: [], style: {}, textContent: '', title: '', className: '', disabled: false,
        classList: { toggle(name, force) { (force === undefined ? !classes.has(name) : force) ? classes.add(name) : classes.delete(name); }, remove(name) { classes.delete(name); }, contains(name) { return classes.has(name); } },
        appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
        querySelector() { return null; }, querySelectorAll() { return []; }, remove() {} };
    }
    const nodes = new Map(), listeners = {}, posted = [];
    const node = id => { if (!nodes.has(id)) { const el = element(id); if (/^(host-start|host-stop|host-log|start|stop|copy|reset|mode-chat|mode-bridge|save-access)$/.test(id)) el.textContent = html.match(new RegExp('<button id="' + id + '">([^<]*)</button>'))[1]; nodes.set(id, el); } return nodes.get(id); };
    const page = vm.createContext({
      document: { getElementById: node, createElement: element, addEventListener() {} },
      window: { addEventListener(event, fn) { listeners[event] = fn; } },
      acquireVsCodeApi: () => ({ postMessage: m => posted.push(m) }), setInterval() {}
    });
    vm.runInContext(script, page);
    return { page, node, listeners, posted };
  }
  const side = runPage(context.bridgeHtml());
  const status = (s, host) => side.listeners.message({ data: { type: 'status', status: s, host } });
  const click = id => { if (!side.node(id).disabled) side.node(id).onclick(); };
  side.posted.length = 0;
  status({ mcpUrl: 'http://127.0.0.1:48271/mcp/k', bridgeRunning: false }, { state: 'idle' });
  assert.equal(side.node('host-start').disabled, false);
  assert.equal(side.node('host-stop').disabled, true);
  assert.equal(side.node('host-stop').title, '没有插件启动的主机', 'a disabled button says why');
  click('host-start');
  assert.deepEqual(JSON.parse(JSON.stringify(side.posted.filter(m => m.type === 'hostStart'))), [{ type: 'hostStart', actionId: 'a1' }]);
  assert.equal(side.node('host-start').textContent, '启动中…');
  assert.equal(side.node('host-start').disabled, true);
  assert.ok(side.node('host-start').classList.contains('busy'));
  side.node('host-start').disabled = false; side.node('host-start').onclick();
  assert.equal(side.posted.filter(m => m.type === 'hostStart').length, 1, 'a busy button cannot send twice');
  status({ mcpUrl: 'u', bridgeRunning: false }, { state: 'idle' });
  assert.equal(side.node('host-start').disabled, true, 'the 4-second repaint keeps a busy button disabled');
  status({ mcpUrl: 'u', bridgeRunning: false }, { state: 'starting', owned: false });
  assert.equal(side.node('host-stop').disabled, false, 'Stop stays available to cancel a start');
  side.listeners.message({ data: { type: 'actionDone', actionId: 'a99', ok: true, text: 'stale' } });
  assert.equal(side.node('host-start').textContent, '启动中…', 'an unknown actionId changes nothing');
  status({ mcpUrl: 'u', bridgeRunning: false }, { state: 'running', owned: true });
  side.listeners.message({ data: { type: 'actionDone', actionId: 'a1', ok: true, text: '主机已启动' } });
  assert.equal(side.node('host-start').textContent, '启动');
  assert.ok(!side.node('host-start').classList.contains('busy'));
  assert.equal(side.node('host-start').disabled, true, 'after the action the real state decides');
  assert.equal(side.node('host-start').title, '主机已在运行');
  assert.equal(side.node('host-stop').disabled, false);
  assert.equal(side.node('host-result').textContent, '主机已启动');
  assert.equal(side.node('host-result').className, 'result');
  click('host-stop');
  side.listeners.message({ data: { type: 'actionDone', actionId: 'a2', ok: false, text: '停止未确认：见【日志】并检查任务管理器' } });
  assert.equal(side.node('host-result').className, 'result fail');
  assert.equal(side.node('host-stop').textContent, '停止');
  side.listeners.message({ data: { type: 'actionDone', actionId: 'a2', ok: true, text: 'again' } });
  assert.equal(side.node('host-result').textContent, '停止未确认：见【日志】并检查任务管理器', 'a finished action is not finished twice');

  // Bridge card buttons follow the Bridge state; unknown state keeps Stop available.
  status({ mcpUrl: 'u', bridgeRunning: true }, { state: 'running', owned: true });
  assert.equal(side.node('start').disabled, true); assert.equal(side.node('start').title, 'Bridge 已在运行');
  assert.equal(side.node('stop').disabled, false);
  status({ mcpUrl: 'u', bridgeRunning: false }, { state: 'running', owned: true });
  assert.equal(side.node('start').disabled, false); assert.equal(side.node('stop').disabled, true);
  status({ error: '主机离线' }, { state: 'idle' });
  assert.equal(side.node('start').disabled, true); assert.equal(side.node('start').title, '主机未连接');
  assert.equal(side.node('stop').disabled, false, 'unknown Bridge state: never hide Stop');
  assert.equal(side.node('reset').disabled, true); assert.equal(side.node('copy').disabled, true);
  status({ mcpUrl: 'u', bridgeRunning: false }, { state: 'running', owned: true });
  click('start');
  const startMsg = side.posted.filter(m => m.type === 'start').pop();
  assert.equal(startMsg.actionId, 'a3'); assert.equal(side.node('start').textContent, '启动中…（等隧道地址）');
  assert.equal(side.node('stop').disabled, false, 'Stop cancels a Bridge start in flight (host still says not running)');
  status({ mcpUrl: 'u', bridgeRunning: false }, { state: 'running', owned: true });
  assert.equal(side.node('stop').disabled, false, 'the repaint during the start keeps Stop available');
  side.listeners.message({ data: { type: 'actionDone', actionId: 'a3', ok: false, text: '失败：' + 'y'.repeat(400) } });
  assert.equal(side.node('bridge-result').textContent.length, 300, 'feedback text is clipped');
  assert.equal(side.node('bridge-result').className, 'result fail');
  side.node('mode-chat').onclick();
  assert.equal(side.node('mode-chat').textContent, '切换中…');
  side.listeners.message({ data: { type: 'controlSaved' } });
  side.listeners.message({ data: { type: 'actionDone', actionId: 'a4', ok: true, text: '已由主机应用' } });
  assert.equal(side.node('access-result').textContent, '已由主机应用');
  assert.equal(side.node('mode-chat').disabled, false);

  // Styles exist for both states (the acceptance finding: disabled looked identical to enabled).
  const css = /<style>([\s\S]*?)<\/style>/.exec(context.bridgeHtml())[1];
  assert.ok(/button:disabled\{[^}]*cursor:not-allowed/.test(css), 'disabled style');
  assert.ok(/button\.busy,button\.busy:disabled\{[^}]*cursor:progress/.test(css), 'busy style overrides disabled');

  // Sidebar chat: failed tool rows carry the reason (the template literal must keep \s intact).
  const chat = runPage(context.chatHtml());
  assert.equal(chat.page.failedText(' PTY  approval\n deadline '), 'Failed：PTY approval deadline');
  assert.equal(chat.page.failedText(''), 'Failed');
  assert.equal(chat.page.failedText({ message: 'EACCES' }), 'Failed：EACCES');
  assert.equal(chat.page.failedText('z'.repeat(400)).length, 'Failed：'.length + 301);
  chat.listeners.message({ data: { type: 'event', ev: { type: 'tool', name: 'search_files', ok: false, error: 'bad regex' } } });
  const rows = chat.node('log').children;
  assert.equal(rows[rows.length - 1].textContent, 'search_files   Failed：bad regex');
  assert.equal(rows[rows.length - 1].className, 'tool fail');

  // 6. The settings tab through the real activate: the registered command opens it from the host.json checkout,
  //    and a page request reaches this window's host through requestJson with the relay's options.
  errors.length = 0;
  await commands.get('webagent.openSettings')('bridge');
  assert.deepStrictEqual(errors, [], 'the tab opens');
  assert.equal(settingsPanels.length, 1);
  const tab = settingsPanels[0];
  assert.equal(tab.title, 'Web Agent 设置');
  assert.deepStrictEqual(tab.options.localResourceRoots, [{ fsPath: path.join(root, 'webagent-core', 'workbench') }], 'served from the host.json checkout');
  assert.ok(tab.webview.html.includes('data-initial-page="bridge"'));
  const relayed = [];
  context.transport = async (method, url, body, options) => {
    relayed.push({ method, url, body, options });
    return { status: 200, contentType: 'application/json', raw: '{"status":"online"}', json: { status: 'online' } };
  };
  vm.runInContext('requestJson = transport;', context);
  tab.listeners.forEach(fn => fn({ type: 'webagent-api', id: 'q1', method: 'POST', path: '/api/models', body: '{"activeModelId":"builtin"}' }));
  await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve));
  assert.equal(relayed.length, 1);
  assert.equal(relayed[0].method, 'POST');
  assert.ok(/^http:\/\/127\.0\.0\.1:\d+\/api\/models$/.test(relayed[0].url), relayed[0].url);
  assert.equal(relayed[0].body, undefined, 'the page body goes as rawBody, never re-serialized');
  assert.equal(relayed[0].options.rawBody, '{"activeModelId":"builtin"}');
  assert.ok(relayed[0].options.signal && relayed[0].options.timeoutMs > 0, 'cancellable, with the relay deadline');
  assert.deepStrictEqual(tab.posted.at(-1), { type: 'webagent-api-result', id: 'q1', ok: true, status: 200, contentType: 'application/json', body: '{"status":"online"}' });
  // A menu click passes no page (or a non-string); reopening reveals the same tab.
  await commands.get('webagent.openSettings')({ some: 'context' });
  assert.equal(settingsPanels.length, 1); assert.equal(tab.revealed, 1);
  // Deactivate closes the tab (subscriptions), cancelling what is still in flight.
  for (const d of subscriptions) { if (d && d.dispose && String(d.dispose).includes('settings.dispose')) d.dispose(); }
  assert.equal(tab.disposed, true);

  finished = true;
  console.log('sidebarFeedback: stop outcomes, actionDone for every click, busy/disabled painting, chat failure reasons, settings tab via activate passed');
}

// A promise that never settles would let Node exit 0 early; only reaching the end counts as a pass.
let finished = false;
process.on('exit', code => {
  if (!finished && code === 0) { console.error('sidebarFeedback ended before its last assertion (a promise never settled)'); process.exitCode = 1; }
});
main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => {
  // Like VS Code on deactivate: dispose everything activate registered (the 5-second status-bar timer).
  for (const d of subscriptions) { try { d.dispose(); } catch { /* ignore */ } }
  fs.rmSync(tmp, { recursive: true, force: true });
});
