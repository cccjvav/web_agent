'use strict';
// Execute the real ES modules, rather than merely searching for HTML IDs.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
if (!process.argv.includes('--vm-child')) {
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', __filename, '--vm-child'], { stdio: 'inherit', timeout: 10000 });
  if (result.error) console.error(result.error);
  process.exit(result.status == null ? 1 : result.status);
}
(async () => {
  const button = { setAttribute(name, value) { this[name] = value; } };
  const storage = new Map();
  const themes = [];
  const context = vm.createContext({
    document: { documentElement: { dataset: {} }, querySelector: () => button },
    window: { monaco: { editor: { setTheme: value => themes.push(value) } } },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }
  });
  const root = path.resolve(__dirname, '../../workbench/js');
  const state = new vm.SourceTextModule(fs.readFileSync(path.join(root, 'state.js'), 'utf8'), { context });
  const dom = new vm.SourceTextModule(fs.readFileSync(path.join(root, 'dom.js'), 'utf8'), { context });
  await state.link(() => {});
  await dom.link(specifier => { assert.strictEqual(specifier, './state.js'); return state; });
  await dom.evaluate(); // F01 used to throw here, before boot's catch could run.
  assert.strictEqual(dom.namespace.initTheme(), 'dark');
  assert.strictEqual(dom.namespace.applyTheme('light'), 'light');
  assert.strictEqual(context.document.documentElement.dataset.theme, 'light');
  assert.strictEqual(storage.get('webagent-theme'), 'light');
  assert.strictEqual(themes.at(-1), 'vs');
  assert.strictEqual(button.textContent, '深色');
  assert.strictEqual(dom.namespace.initTheme(), 'light');
  storage.set('webagent-theme', 'invalid');
  assert.strictEqual(dom.namespace.initTheme(), 'dark');
  context.localStorage.getItem = () => { throw new Error('storage unavailable'); };
  context.localStorage.setItem = () => { throw new Error('storage unavailable'); };
  assert.doesNotThrow(() => dom.namespace.initTheme());
  assert.strictEqual(state.namespace.ui.applyTheme, dom.namespace.applyTheme);
  const bridge = new vm.SourceTextModule(fs.readFileSync(path.join(root, 'bridge.js'), 'utf8'), { context });
  await bridge.link(specifier => specifier === './state.js' ? state : dom);
  await bridge.evaluate();
  button.classList = { remove() {} };
  state.namespace.ui.setRight = () => {};
  state.namespace.ui.toast = () => {};
  state.namespace.ui.sendChat = () => { throw new Error('connecting must not execute a task'); };
  context.fetch = () => { throw new Error('guidance must not pretend to initialize MCP'); };
  await bridge.namespace.arenaConnect('example task');
  assert.ok(button.textContent.includes('尚未建立'));
  state.namespace.ui.startBridge = () => { throw new Error('navigation must not start a public tunnel'); };
  state.namespace.ui.closeModal = () => {};
  state.namespace.ui.activateTab = () => {};
  await bridge.namespace.openSite('chatgpt');
  assert.ok(state.namespace.state.tabs.some(tab => tab.id === 'browser:chatgpt'));

  let sockets = 0, activated = 0, warnings = 0;
  const bootUi = Object.fromEntries(['initEditorSafety', 'bind', 'setAgentMode', 'paintTabs', 'paintChat', 'termLine',
    'refreshStatus', 'loadSkills', 'loadCustomizations'].map(name => [name, () => {}]));
  bootUi.loadTree = () => { throw new Error('fixture initial request failure'); };
  bootUi.activateTab = () => { activated++; };
  bootUi.toast = () => { warnings++; };
  const bootContext = vm.createContext({ console: { error() {} }, location: { protocol: 'http:', host: 'localhost:3000' },
    WebSocket: function () { sockets++; this.readyState = 1; } });
  const stateStub = new vm.SyntheticModule(['$', 'state', 'ui'], function () {
    this.setExport('$', () => null); this.setExport('state', { activeTab: 'welcome' }); this.setExport('ui', bootUi);
  }, { context: bootContext });
  const monacoStub = new vm.SyntheticModule(['loadMonaco'], function () {
    this.setExport('loadMonaco', () => Promise.reject(new Error('fixture CDN failure')));
  }, { context: bootContext });
  const empty = new vm.SyntheticModule([], function () {}, { context: bootContext });
  const app = new vm.SourceTextModule(fs.readFileSync(path.join(root, '../app.js'), 'utf8'), { context: bootContext });
  await app.link(specifier => specifier.endsWith('/state.js') ? stateStub : specifier.endsWith('/monaco.js') ? monacoStub : empty);
  await app.evaluate();
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(sockets, 1, 'initial request failure must not prevent websocket startup');
  assert.strictEqual(activated, 1, 'initial tab must still activate');
  assert.strictEqual(warnings, 1, 'partial initialization failure must be visible');
  console.log('workbench module/theme runtime regressions passed (DOM fixture, not browser E2E)');
})().catch(err => { console.error(err); process.exitCode = 1; });
