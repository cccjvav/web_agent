'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../../workbench/js/monaco.js'), 'utf8').replace(/^import .*;\n/, '').replace('export function', 'function');
(async () => {
  let script, deadline, captured = 0, activated = 0;
  const status = {}, state = { activeTab: 'file' }, window = {};
  const context = vm.createContext({
    $: () => status, state, window,
    ui: { captureActiveFile() { captured++; }, activateTab() { activated++; } },
    document: { createElement: () => ({}), documentElement: { dataset: {} }, head: { appendChild(s) { script = s; } } },
    setTimeout(fn) { deadline = fn; return 1; }, clearTimeout() {}
  });
  vm.runInContext(source, context);
  const failed = context.loadMonaco(); assert.ok(status.textContent.includes('加载中'));
  script.onerror(); assert.strictEqual(await failed, false); assert.ok(status.textContent.includes('纯文本'));
  const slow = context.loadMonaco(); deadline(); assert.strictEqual(await slow, false);
  window.require = (deps, ok) => ok(); window.require.config = () => {};
  window.monaco = { editor: { create: () => ({}) } };
  script.onload(); assert.strictEqual(captured, 1); assert.strictEqual(activated, 1);
  assert.ok(status.textContent.includes('就绪'), 'late load preserves buffer and upgrades status');
  const missing = context.loadMonaco(); delete window.require; script.onload();
  assert.strictEqual(await missing, false);
  console.log('Monaco loading/failure/late-upgrade fixtures passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
