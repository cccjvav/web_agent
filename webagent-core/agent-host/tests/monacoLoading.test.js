'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const rawSource = fs.readFileSync(path.join(__dirname, '../../workbench/js/monaco.js'), 'utf8');
(async () => {
  for (const eol of ['\n', '\r\n']) {
  // F98: monaco.js imports its font-size helpers from dom.js as well; strip every leading import.
  const source = rawSource.replace(/\r?\n/g, eol).replace(/^(?:import[^\r\n]*;\r?\n)+/, '').replace('export function', 'function');
  let script, deadline, captured = 0, activated = 0;
  const status = {}, state = { activeTab: 'file' }, window = {};
  const createOptions = [];
  const context = vm.createContext({
    $: () => status, state, window,
    EDITOR_BASE_FONT_PX: 13, editorFontSize: scale => Math.round(13 * scale),
    ui: { captureActiveFile() { captured++; }, activateTab() { activated++; }, currentTextScale: () => 1.2 },
    document: { createElement: () => ({}), documentElement: { dataset: {} }, head: { appendChild(s) { script = s; } } },
    setTimeout(fn) { deadline = fn; return 1; }, clearTimeout() {}
  });
  vm.runInContext(source, context);
  const failed = context.loadMonaco(); assert.ok(status.textContent.includes('加载中'));
  script.onerror(); assert.strictEqual(await failed, false); assert.ok(status.textContent.includes('纯文本'));
  const slow = context.loadMonaco(); deadline(); assert.strictEqual(await slow, false);
  window.require = (deps, ok) => ok(); window.require.config = () => {};
  window.monaco = { editor: { create: (_el, options) => { createOptions.push(options); return {}; } } };
  script.onload(); assert.strictEqual(captured, 1); assert.strictEqual(activated, 1);
  assert.strictEqual(createOptions[0].fontSize, 16, 'F98: the editor is created at the current text scale (13px × 1.2)');
  assert.ok(status.textContent.includes('就绪'), 'late load preserves buffer and upgrades status');
  const missing = context.loadMonaco(); delete window.require; script.onload();
  assert.strictEqual(await missing, false);
  }
  console.log('Monaco LF/CRLF loading/failure/late-upgrade fixtures passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
