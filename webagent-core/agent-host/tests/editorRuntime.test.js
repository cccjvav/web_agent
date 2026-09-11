'use strict';
// Actual workbench ES modules with a DOM/Monaco fixture; not browser E2E.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
if (!process.argv.includes('--vm-child')) {
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', __filename, '--vm-child'], { stdio: 'inherit', timeout: 15000 });
  if (r.error) console.error(r.error);
  process.exit(r.status == null ? 1 : r.status);
}
(async () => {
  function element() {
    return { value: '', innerHTML: '', textContent: '', handlers: {}, children: [],
      classList: { toggle() {} }, appendChild(child) { this.children.push(child); },
      querySelector() { return element(); },
      addEventListener(event, fn) { this.handlers[event] = fn; } };
  }
  const nodes = new Map();
  const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const handlers = {}, messages = [], calls = [], responses = [];
  let confirm = false;
  const context = vm.createContext({
    document: { querySelector: get, createElement: element },
    window: { addEventListener: (event, fn) => { handlers[event] = fn; }, confirm: () => confirm },
    fetch: async (url, options) => {
      calls.push({ url, body: options && JSON.parse(options.body) });
      assert.ok(responses.length, 'unexpected HTTP request');
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    }
  });
  const root = path.resolve(__dirname, '../../workbench/js');
  const modules = {};
  for (const name of ['state', 'dom', 'tabs']) modules[name] = new vm.SourceTextModule(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), { context });
  await modules.state.link(() => {});
  await modules.dom.link(() => modules.state);
  await modules.tabs.link(specifier => modules[specifier.slice(2, -3)]);
  await modules.tabs.evaluate();
  const api = modules.tabs.namespace, { state, ui } = modules.state.namespace;
  ui.toast = message => messages.push(message);
  api.initEditorSafety();
  api.initEditorSafety();
  const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
  const hash = letter => letter.repeat(64);
  responses.push(response({ content: 'first', hash: hash('a') }));
  await api.openFile('one.txt');
  const one = state.tabs.find(t => t.path === 'one.txt');
  const input = get('#editor-fallback');
  input.value = 'edited first'; input.handlers.input();
  assert.strictEqual(one.dirty, true);
  responses.push(response({ content: 'second', hash: hash('b') }));
  await api.openFile('two.txt');
  const two = state.tabs.find(t => t.path === 'two.txt');
  api.activateTab(one.id);
  assert.strictEqual(input.value, 'edited first', 'tab switch must preserve fallback edits');
  api.closeTab(one.id);
  assert.ok(state.tabs.includes(one), 'cancelled discard keeps tab');
  let prevented = false;
  handlers.beforeunload({ preventDefault() { prevented = true; } });
  assert.ok(prevented);

  responses.push(response({ error: 'stale' }, 409));
  await api.saveActive();
  assert.strictEqual(calls.at(-1).body.expectedHash, hash('a'));
  assert.strictEqual(one.savedContent, 'first');
  assert.strictEqual(one.dirty, true);
  assert.ok(messages.at(-1).includes('未覆盖'));
  responses.push(new Error('offline'));
  await api.saveActive();
  assert.ok(messages.at(-1).includes('保存失败'));
  responses.push(response({ error: 'disk unavailable' }, 500));
  await api.saveActive();
  assert.ok(messages.at(-1).includes('disk unavailable'));
  responses.push({ ok: true, status: 200, json: async () => { throw new Error('bad JSON'); } });
  await api.saveActive();
  assert.ok(one.dirty);
  assert.strictEqual(one.hash, hash('a'));

  let finish;
  responses.push(new Promise(resolve => { finish = resolve; }));
  const pending = api.saveActive();
  const count = calls.length;
  await api.saveActive();
  assert.strictEqual(calls.length, count, 'duplicate save while pending ignored');
  confirm = true;
  api.closeTab(one.id);
  assert.ok(state.tabs.includes(one), 'saving tab cannot be closed');
  input.value = 'newer edit'; input.handlers.input();
  api.activateTab(two.id);
  finish(response({ success: true, hash: hash('c') }));
  await pending;
  assert.strictEqual(one.savedContent, 'edited first');
  assert.strictEqual(one.content, 'newer edit');
  assert.strictEqual(one.dirty, true, 'edits made during save remain unsaved');
  assert.strictEqual(two.content, 'second', 'save response cannot mutate another tab');
  api.activateTab(one.id);
  responses.push(response({ success: true, hash: hash('d') }));
  await api.saveActive();
  assert.strictEqual(calls.at(-1).body.expectedHash, hash('c'));
  assert.strictEqual(one.dirty, false);

  // Late Monaco availability migrates current fallback edits, retaining one model per tab.
  input.value = 'migration edit'; input.handlers.input();
  const models = [];
  context.window.monaco = { editor: { createModel(value) {
    let change;
    const model = { value, getValue() { return this.value; },
      setValue(next) { this.value = next; if (change) change(); },
      onDidChangeContent(fn) { change = fn; return { dispose() { model.listenerDisposed = true; } }; },
      dispose() { this.disposed = true; } };
    models.push(model); return model;
  } } };
  state.editor = { setModel(model) { this.model = model; }, saveViewState() { return { line: 3 }; }, restoreViewState(view) { this.view = view; } };
  api.activateTab(one.id);
  const firstModel = one.model;
  assert.strictEqual(firstModel.getValue(), 'migration edit');
  firstModel.setValue('Monaco edit');
  assert.ok(one.dirty);
  api.activateTab(two.id);
  api.activateTab(one.id);
  assert.strictEqual(one.model, firstModel);
  assert.strictEqual(models.length, 2);
  assert.strictEqual(firstModel.getValue(), 'Monaco edit');
  assert.strictEqual(state.editor.view.line, 3);
  api.closeTab(one.id);
  assert.ok(firstModel.disposed && firstModel.listenerDisposed);
  assert.ok(!state.tabs.includes(one));
  assert.strictEqual(state.activeTab, two.id);
  prevented = false;
  handlers.beforeunload({ preventDefault() { prevented = true; } });
  assert.strictEqual(prevented, false, 'clean tabs do not block unload');
  console.log('editor runtime regressions passed (DOM/Monaco fixture, not browser E2E)');
})().catch(err => { console.error(err); process.exitCode = 1; });
