// R6 phase 2 batch 3: the "Web Agent 设置" editor tab.
//   A. buildSettingsHtml on the real workbench page: CSP, one nonce'd entry, and a loud refusal for every page change
//      that would break the tab.
//   B. findWorkbenchDir: desktop (host.json root), code-server and development layouts.
//   C. createHostServiceHandler: the extension's answers to the page's confirm / copy requests.
//   D. createHostServices (workbench/js/vscodeRelay.js): the page side of the same protocol.
//   E. createSettingsPanel with a fake vscode: one tab, message routing, relay through send, cleanup on close.
//   F. extension.js registers webagent.openSettings and the sidebar gear.
// The page itself in Chromium (CSP enforced, real relay to a real host) is covered by workbench.browser.js.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const panelModule = require('../../extension/settingsPanel');
const { buildSettingsHtml, createHostServiceHandler, createSettingsPanel, findWorkbenchDir, WORKBENCH_FILES } = panelModule;

const workbenchRoot = path.resolve(__dirname, '../../workbench');
const extensionRoot = path.resolve(__dirname, '../../extension');
const indexHtml = fs.readFileSync(path.join(workbenchRoot, 'index.html'), 'utf8');
const NONCE = 'AbCdEfGhIjKlMnOpQrStUvWx';
const CSP_SOURCE = 'https://file+.vscode-resource.vscode-cdn.net';
const resource = rel => `${CSP_SOURCE}/wb/${rel}`;
const tick = () => new Promise(resolve => setImmediate(resolve));

function partA() {
  const page = buildSettingsHtml({ html: indexHtml, nonce: NONCE, cspSource: CSP_SOURCE, resource, initialPage: 'bridge' });
  const csp = page.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(csp, 'the page carries a CSP meta');
  assert.ok(page.indexOf('<meta charset="UTF-8" />') < page.indexOf('Content-Security-Policy'), 'charset stays first');
  const policy = csp[1].replace(/&#39;/g, "'");
  assert.strictEqual(policy, `default-src 'none'; script-src 'nonce-${NONCE}' ${CSP_SOURCE}; style-src ${CSP_SOURCE} 'unsafe-inline'; `
    + `img-src ${CSP_SOURCE} data:; font-src ${CSP_SOURCE}; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`);
  assert.deepStrictEqual(page.match(/<script\b[^>]*>/g), [`<script type="module" nonce="${NONCE}" src="${resource('settings-panel.js')}">`],
    'the only script is the nonce\'d settings entry (no app.js, no inline theme script)');
  assert.ok(page.includes(`<link rel="stylesheet" href="${resource('styles.css')}" />\n  <link rel="stylesheet" href="${resource('settings-panel.css')}" />`),
    'the workbench styles, then the panel overrides');
  assert.ok(!page.includes('favicon') && !page.includes('./'), 'no relative resource is left');
  assert.ok(page.includes('<title>Web Agent 设置</title>'));
  assert.ok(page.includes('<html lang="zh-CN" data-theme="dark" data-initial-page="bridge">'));
  assert.ok(page.includes('id="modal"') && page.includes('id="page-operations"'), 'the same modal markup');
  assert.ok(buildSettingsHtml({ html: indexHtml, nonce: NONCE, cspSource: CSP_SOURCE, resource, initialPage: '"><script>' })
    .includes('data-initial-page="overview"'), 'an invalid page name never reaches the markup');
  assert.ok(buildSettingsHtml({ html: indexHtml, nonce: NONCE, cspSource: CSP_SOURCE, resource: () => 'https://x/$&$1' })
    .includes('src="https://x/$&amp;$1"'), 'replacement patterns in a URI are literal');

  // Each page change that would silently break the tab is refused with its reason.
  const broken = [
    ['entry', indexHtml.replace('<script type="module" src="./app.js"></script>', '<script type="module" src="./main.js"></script>'), /（entry）/],
    ['stylesheet', indexHtml.replace('href="./styles.css"', 'href="./style.css"'), /（stylesheet）/],
    ['charset', indexHtml.replace('<meta charset="UTF-8" />', '<meta charset="utf-8">'), /（charset）/],
    ['theme script', indexHtml.replace(/<script>\s*try \{[\s\S]*?<\/script>/, ''), /（theme script）/],
    ['second inline script', indexHtml.replace('</body>', '<script>alert(1)</script></body>'), /无法运行的脚本/],
    ['inline handler', indexHtml.replace('id="modal-close"', 'id="modal-close" onclick="x()"'), /内联事件处理/],
    ['relative file', indexHtml.replace('</body>', '<img src="./logo.png"></body>'), /未提供的本地文件/],
    ['duplicate entry', indexHtml.replace('</body>', '<script type="module" src="./app.js"></script></body>'), /（entry）/]
  ];
  for (const [label, html, reason] of broken) {
    assert.throws(() => buildSettingsHtml({ html, nonce: NONCE, cspSource: CSP_SOURCE, resource }), reason, label);
  }
  for (const bad of [{ nonce: 'short' }, { cspSource: '' }, { resource: null }, { html: null }]) {
    assert.throws(() => buildSettingsHtml({ html: indexHtml, nonce: NONCE, cspSource: CSP_SOURCE, resource, ...bad }), TypeError);
  }

  // Workbench-only features are marked in the shared page and hidden by the panel stylesheet only.
  const css = fs.readFileSync(path.join(workbenchRoot, 'settings-panel.css'), 'utf8');
  assert.ok(/\[data-workbench-only\][^{]*\{ display: none !important; \}/.test(css));
  assert.strictEqual((indexHtml.match(/class="vs-btn open-site" data-workbench-only/g) || []).length, 8);
  assert.ok(/<div data-workbench-only>\s*<label for="ops-name">/.test(indexHtml), 'external MCP registration (D4)');
  assert.ok(indexHtml.includes('data-page="multimodel" data-workbench-only'), 'consensus (D4)');
  assert.ok(indexHtml.includes('id="btn-skill-use" class="vs-btn" data-workbench-only'));
  assert.ok(!fs.readFileSync(path.join(workbenchRoot, 'styles.css'), 'utf8').includes('data-workbench-only'), 'the browser workbench shows everything');
}

function partB() {
  assert.strictEqual(findWorkbenchDir({ extensionDir: extensionRoot }), workbenchRoot, 'development layout: <repo>/webagent-core/extension');
  const files = new Set();
  const exists = file => files.has(file);
  const add = dir => WORKBENCH_FILES.forEach(file => files.add(path.join(dir, file)));
  const repo = path.resolve('/repo'), other = path.resolve('/checkout');
  const codeServerExt = path.join(repo, 'webagent-core', 'extensions-installed', 'webagent.webagent-core-0.7.2');
  add(path.join(repo, 'webagent-core', 'workbench'));
  assert.strictEqual(findWorkbenchDir({ extensionDir: codeServerExt, exists }), path.join(repo, 'webagent-core', 'workbench'), 'code-server layout');
  add(path.join(other, 'webagent-core', 'workbench'));
  assert.strictEqual(findWorkbenchDir({ extensionDir: codeServerExt, hostRoot: other, exists }), path.join(other, 'webagent-core', 'workbench'),
    'host.json root wins');
  files.delete(path.join(other, 'webagent-core', 'workbench', 'settings-panel.js'));
  assert.strictEqual(findWorkbenchDir({ extensionDir: codeServerExt, hostRoot: other, exists }), path.join(repo, 'webagent-core', 'workbench'),
    'a checkout without the panel entry is skipped');
  assert.strictEqual(findWorkbenchDir({ extensionDir: path.resolve('/elsewhere/ext'), exists }), null);
}

function fakeVscode() {
  const calls = { warnings: [], copies: [] };
  let answer = '确认', copyError = null;
  const vscode = {
    window: { showWarningMessage: async (text, options, ...items) => { calls.warnings.push({ text, options, items }); return typeof answer === 'function' ? answer() : answer; } },
    env: { clipboard: { writeText: async text => { if (copyError) throw copyError; calls.copies.push(text); } } }
  };
  return { vscode, calls, answer: value => { answer = value; }, failCopy: error => { copyError = error; } };
}

async function partC() {
  const fake = fakeVscode(), replies = [];
  const handler = createHostServiceHandler({ vscode: fake.vscode, post: message => replies.push(message) });
  const ask = async message => { replies.length = 0; const handled = handler.handle(message); await tick(); await tick(); return { handled, replies: replies.slice() }; };

  let result = await ask({ type: 'webagent-service', id: 'c1', service: 'confirm', text: '确认重置 MCP 地址？' });
  assert.strictEqual(result.handled, true);
  assert.deepStrictEqual(result.replies, [{ type: 'webagent-service-result', id: 'c1', ok: true, value: true }]);
  assert.deepStrictEqual(fake.calls.warnings[0], { text: '确认重置 MCP 地址？', options: { modal: true, detail: '来自“Web Agent 设置”标签页' }, items: ['确认'] });
  for (const answer of [undefined, '取消', 'Confirm']) {
    fake.answer(answer);
    result = await ask({ type: 'webagent-service', id: 'c2', service: 'confirm', text: 'q' });
    assert.deepStrictEqual(result.replies, [{ type: 'webagent-service-result', id: 'c2', ok: true, value: false }], `answer ${answer} is not consent`);
  }
  fake.answer(() => { throw new Error('dialog failed'); });
  result = await ask({ type: 'webagent-service', id: 'c3', service: 'confirm', text: 'q' });
  assert.deepStrictEqual(result.replies, [{ type: 'webagent-service-result', id: 'c3', ok: false, error: 'dialog failed' }]);
  fake.answer('确认');
  const warningsBefore = fake.calls.warnings.length;
  for (const text of ['', '   ', 'x'.repeat(panelModule.MAX_CONFIRM_CHARS + 1), 42]) {
    result = await ask({ type: 'webagent-service', id: 'c4', service: 'confirm', text });
    assert.deepStrictEqual(result.replies, [{ type: 'webagent-service-result', id: 'c4', ok: false, error: '确认内容无效' }]);
  }
  assert.strictEqual(fake.calls.warnings.length, warningsBefore, 'an invalid question never shows a dialog');

  result = await ask({ type: 'webagent-service', id: 'p1', service: 'copy', text: 'https://x.trycloudflare.com/mcp/abc' });
  assert.deepStrictEqual(result.replies, [{ type: 'webagent-service-result', id: 'p1', ok: true, value: true }]);
  assert.deepStrictEqual(fake.calls.copies, ['https://x.trycloudflare.com/mcp/abc']);
  result = await ask({ type: 'webagent-service', id: 'p2', service: 'copy', text: 'y'.repeat(panelModule.MAX_COPY_CHARS + 1) });
  assert.deepStrictEqual(result.replies, [{ type: 'webagent-service-result', id: 'p2', ok: false, error: '复制内容无效或过长' }]);
  fake.failCopy(new Error('clipboard busy'));
  result = await ask({ type: 'webagent-service', id: 'p3', service: 'copy', text: 'z' });
  assert.deepStrictEqual(result.replies, [{ type: 'webagent-service-result', id: 'p3', ok: false, error: 'clipboard busy' }]);
  result = await ask({ type: 'webagent-service', id: 'u1', service: 'openExternal', text: 'https://evil.example' });
  assert.deepStrictEqual(result.replies, [{ type: 'webagent-service-result', id: 'u1', ok: false, error: '设置页不支持该操作' }]);

  // Not a service message: left for others. A service message without a usable id: swallowed, no reply.
  assert.deepStrictEqual(await ask({ type: 'webagent-api', id: 'x' }), { handled: false, replies: [] });
  assert.deepStrictEqual(await ask(null), { handled: false, replies: [] });
  for (const id of [undefined, '', 'bad id', 'a'.repeat(65), 7]) {
    assert.deepStrictEqual(await ask({ type: 'webagent-service', id, service: 'confirm', text: 'q' }), { handled: true, replies: [] });
  }

  // Pending cap and duplicate ids while dialogs are open.
  let release;
  fake.answer(() => new Promise(resolve => { release = resolve; }));
  const held = [];
  const holding = createHostServiceHandler({ vscode: fake.vscode, post: message => held.push(message), maxPending: 2 });
  holding.handle({ type: 'webagent-service', id: 'h1', service: 'confirm', text: 'q' });
  holding.handle({ type: 'webagent-service', id: 'h1', service: 'confirm', text: 'q' });
  assert.deepStrictEqual(held, [{ type: 'webagent-service-result', id: 'h1', ok: false, error: '重复的请求编号' }]);
  holding.handle({ type: 'webagent-service', id: 'h2', service: 'confirm', text: 'q' });
  holding.handle({ type: 'webagent-service', id: 'h3', service: 'confirm', text: 'q' });
  assert.deepStrictEqual(held.at(-1), { type: 'webagent-service-result', id: 'h3', ok: false, error: '设置页同时等待的确认过多' });
  assert.strictEqual(holding.size, 2);
  // Closing the tab: an answer that arrives later is not posted into the closed panel.
  holding.dispose();
  const postedBefore = held.length;
  release('确认'); await tick(); await tick();
  assert.strictEqual(held.length, postedBefore, 'no reply after dispose');
  holding.handle({ type: 'webagent-service', id: 'h9', service: 'copy', text: 'q' }); await tick();
  assert.strictEqual(held.length, postedBefore);
}

function loadHostServices() {
  const source = fs.readFileSync(path.join(workbenchRoot, 'js/vscodeRelay.js'), 'utf8');
  return vm.runInThisContext(`(() => {\n${source.replace(/^export /gm, '')}\nreturn createHostServices;\n})()`);
}

async function partD() {
  const createHostServices = loadHostServices();
  const posted = []; let deliver;
  const services = createHostServices({ postMessage: message => posted.push(message), onMessage: fn => { deliver = fn; } });
  const answer = (index, reply) => deliver({ type: 'webagent-service-result', id: posted[index].id, ...reply });

  let pending = services.confirm('确认批准一次？');
  assert.deepStrictEqual({ ...posted[0], id: undefined }, { type: 'webagent-service', id: undefined, service: 'confirm', text: '确认批准一次？' });
  answer(0, { ok: true, value: true });
  assert.strictEqual(await pending, true);
  for (const [index, reply] of [[1, { ok: true, value: false }], [2, { ok: false, value: true, error: 'x' }], [3, { ok: true, value: 'yes' }], [4, { ok: true }]]) {
    pending = services.confirm('q');
    deliver({ type: 'webagent-service-result', id: 'someone-else', ok: true, value: true }); // unknown ids are ignored
    deliver({ type: 'webagent-api-result', id: posted[index].id, ok: true, value: true }); // other protocols are ignored
    answer(index, reply);
    assert.strictEqual(await pending, false, `only ok:true with value:true is consent: ${JSON.stringify(reply)}`);
  }
  answer(4, { ok: true, value: true }); // a second answer for a settled id changes nothing
  assert.strictEqual(new Set(posted.map(message => message.id)).size, posted.length, 'every request has its own id');

  pending = services.copyText('mcp url');
  assert.deepStrictEqual({ ...posted.at(-1), id: undefined }, { type: 'webagent-service', id: undefined, service: 'copy', text: 'mcp url' });
  answer(posted.length - 1, { ok: true, value: true });
  await pending;
  pending = services.copyText('mcp url');
  answer(posted.length - 1, { ok: false, error: '复制内容无效或过长' });
  await assert.rejects(pending, /复制内容无效或过长/);

  const broken = createHostServices({ postMessage: () => { throw new Error('webview gone'); }, onMessage: () => {} });
  assert.strictEqual(await broken.confirm('q'), false, 'a request that cannot be sent is never consent');
  await assert.rejects(broken.copyText('q'), /设置页无法联系插件：webview gone/);
  assert.throws(() => createHostServices({ postMessage: () => {} }), TypeError);
}

function fakePanelVscode() {
  const panels = [];
  const vscode = {
    ...fakeVscode().vscode,
    ViewColumn: { Active: -1 },
    Uri: { file: fsPath => ({ scheme: 'file', fsPath }) },
    window: {
      ...fakeVscode().vscode.window,
      createWebviewPanel(viewType, title, column, options) {
        const listeners = { message: [], dispose: [] };
        const panel = {
          viewType, title, column, options, revealed: 0, disposed: false, posted: [],
          webview: {
            cspSource: CSP_SOURCE, html: '',
            asWebviewUri: uri => ({ toString: () => `${CSP_SOURCE}${uri.fsPath.split(path.sep).join('/')}` }),
            postMessage(message) { if (panel.disposed) throw new Error('disposed'); panel.posted.push(message); return Promise.resolve(true); },
            onDidReceiveMessage(fn) { listeners.message.push(fn); return { dispose: () => { listeners.message = []; } }; }
          },
          reveal() { panel.revealed++; },
          onDidDispose(fn) { listeners.dispose.push(fn); },
          dispose() { if (panel.disposed) return; panel.disposed = true; listeners.dispose.forEach(fn => fn()); },
          receive(message) { listeners.message.forEach(fn => fn(message)); }
        };
        panels.push(panel);
        return panel;
      }
    }
  };
  return { vscode, panels };
}

async function partE() {
  const { vscode, panels } = fakePanelVscode();
  const sent = [], logs = [];
  let finish;
  const controller = createSettingsPanel({
    vscode, extensionDir: extensionRoot, hostRoot: () => { throw new Error('no host.json'); }, log: line => logs.push(line),
    send: (method, apiPath, body, options) => { sent.push({ method, apiPath, body, options }); return new Promise(resolve => { finish = resolve; }); }
  });
  const first = controller.open('api');
  assert.strictEqual(panels.length, 1);
  assert.strictEqual(first.viewType, 'webagent.settings'); assert.strictEqual(first.title, 'Web Agent 设置'); assert.strictEqual(first.column, -1);
  assert.deepStrictEqual(first.options, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [{ scheme: 'file', fsPath: workbenchRoot }] },
    'scripts on, and only the workbench folder is readable');
  assert.ok(first.webview.html.includes(`script-src 'nonce-`.replace(/'/g, '&#39;')) && first.webview.html.includes('data-initial-page="api"'));
  assert.ok(first.webview.html.includes(`${CSP_SOURCE}${path.join(workbenchRoot, 'settings-panel.js').split(path.sep).join('/')}`), 'entry served from the workbench folder');
  assert.ok(logs.some(line => line.includes(workbenchRoot)), 'the log names where the page came from');
  const nonces = new Set([first.webview.html.match(/nonce="([^"]+)"/)[1]]);

  // Opening again reveals the same tab and switches the page (valid names only).
  assert.strictEqual(controller.open('diagnostics'), first);
  assert.strictEqual(first.revealed, 1);
  // Each reopen also asks the page to re-read (the page only does so after a failed read; workbench.browser).
  assert.deepStrictEqual(first.posted, [{ type: 'webagent-show-page', page: 'diagnostics' }, { type: 'webagent-reload' }]);
  controller.open(); controller.open('../x');
  assert.deepStrictEqual(first.posted.slice(2), [{ type: 'webagent-reload' }, { type: 'webagent-reload' }], 'no page switch without a valid name');
  assert.strictEqual(first.revealed, 3); assert.strictEqual(panels.length, 1);

  // A relay request reaches send with the page's method, path and body; the answer goes back once.
  first.receive({ type: 'webagent-api', id: 'r1', method: 'post', path: '/api/models', body: '{"activeModelId":"builtin"}' });
  await tick();
  assert.deepStrictEqual(sent.map(({ method, apiPath, body }) => [method, apiPath, body]), [['POST', '/api/models', '{"activeModelId":"builtin"}']]);
  finish({ status: 200, contentType: 'application/json', raw: '{"success":true}' }); await tick(); await tick();
  assert.deepStrictEqual(first.posted.at(-1), { type: 'webagent-api-result', id: 'r1', ok: true, status: 200, contentType: 'application/json', body: '{"success":true}' });
  first.receive({ type: 'webagent-api', id: 'r2', method: 'POST', path: '/api/tool/call', body: '{}' }); await tick();
  assert.strictEqual(sent.length, 1, 'a refused route never reaches send');
  assert.deepStrictEqual(first.posted.at(-1), { type: 'webagent-api-result', id: 'r2', ok: false, error: '设置页不转发 POST /api/tool/call' });
  // A service request is answered by the dialog handler.
  first.receive({ type: 'webagent-service', id: 's1', service: 'confirm', text: '确认？' }); await tick(); await tick();
  assert.deepStrictEqual(first.posted.at(-1), { type: 'webagent-service-result', id: 's1', ok: true, value: true });

  // Closing the tab aborts what is still in flight, posts nothing more, and the next open builds a new tab.
  first.receive({ type: 'webagent-api', id: 'r3', method: 'GET', path: '/api/status' }); await tick();
  const inFlight = sent.at(-1).options.signal;
  assert.strictEqual(inFlight.aborted, false);
  const postedBeforeClose = first.posted.length;
  first.dispose();
  assert.strictEqual(inFlight.aborted, true, 'closing the tab cancels the request');
  finish({ status: 200, contentType: 'application/json', raw: '{}' }); await tick(); await tick();
  assert.strictEqual(first.posted.length, postedBeforeClose, 'nothing is posted into a closed tab');
  assert.strictEqual(controller.panel, null);
  const second = controller.open();
  assert.notStrictEqual(second, first); assert.strictEqual(panels.length, 2);
  assert.ok(second.webview.html.includes('data-initial-page="overview"'));
  nonces.add(second.webview.html.match(/nonce="([^"]+)"/)[1]);
  assert.strictEqual(nonces.size, 2, 'a fresh nonce per tab');
  controller.dispose();
  assert.strictEqual(second.disposed, true); assert.strictEqual(controller.panel, null);

  // No workbench next to a moved extension: refused before any tab is created.
  const lonely = fakePanelVscode();
  const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-settings-'));
  try {
    const orphan = createSettingsPanel({ vscode: lonely.vscode, extensionDir: path.join(nowhere, 'a', 'b'), send: async () => ({}) });
    assert.throws(() => orphan.open(), /找不到网页工作台文件/);
    assert.strictEqual(lonely.panels.length, 0);
    // A workbench page that no longer matches: the half-built tab is closed again and the reason surfaces.
    const copy = path.join(nowhere, 'webagent-core', 'workbench');
    for (const file of WORKBENCH_FILES) {
      fs.mkdirSync(path.dirname(path.join(copy, file)), { recursive: true });
      fs.writeFileSync(path.join(copy, file), file === 'index.html' ? indexHtml.replace('./app.js', './other.js') : '');
    }
    const stale = createSettingsPanel({ vscode: lonely.vscode, extensionDir: extensionRoot, hostRoot: () => nowhere, send: async () => ({}) });
    assert.throws(() => stale.open(), /网页工作台页面与设置页不匹配（entry）/);
    assert.strictEqual(lonely.panels.length, 1); assert.strictEqual(lonely.panels[0].disposed, true);
    assert.strictEqual(stale.panel, null);
  } finally {
    fs.rmSync(nowhere, { recursive: true, force: true });
  }
}

function partF() {
  const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
  assert.deepStrictEqual(pkg.contributes.commands.find(item => item.command === 'webagent.openSettings'),
    { command: 'webagent.openSettings', title: 'Web Agent: 打开设置', icon: '$(gear)' });
  assert.deepStrictEqual(pkg.contributes.menus['view/title'].filter(item => item.command === 'webagent.openSettings').map(item => item.when),
    ['view == webagent.bridgeView', 'view == webagent.chatView'], 'the gear sits on both sidebar views');
  const source = fs.readFileSync(path.join(extensionRoot, 'extension.js'), 'utf8');
  assert.ok(source.includes("vscode.commands.registerCommand('webagent.openSettings', (page) => openSettings(page))"));
  assert.ok(/requestJson\(method, agentHostUrl\(\) \+ apiPath, undefined, \{ rawBody: body === null \? undefined : body, signal, timeoutMs \}\)/.test(source),
    'the tab reaches the same host as every other request, through requestJson');
  assert.ok(!source.includes('仍在网页工作台的 Bridge 页保存'), 'the sidebar points to the settings tab for Named Tunnel / ngrok');
}

// A promise that never settles would let Node exit 0 early; only reaching the end counts as a pass.
let finished = false;
process.on('exit', code => {
  if (!finished && code === 0) { console.error('settings panel test ended before its last assertion: a pending promise never settled'); process.exitCode = 1; }
});
(async () => {
  partA();
  partB();
  await partC();
  await partD();
  await partE();
  partF();
  finished = true;
  console.log('settings panel passed: page rewrite and CSP, workbench lookup, dialog/clipboard services, one tab with relay and cleanup');
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
