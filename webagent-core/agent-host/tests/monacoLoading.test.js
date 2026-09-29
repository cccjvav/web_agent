'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const rawSource = fs.readFileSync(path.join(__dirname, '../../workbench/js/monaco.js'), 'utf8');
(async () => {
  for (const eol of ['\n', '\r\n']) {
  // F98: monaco.js imports its font-size helpers from dom.js as well; strip every leading import.
  const source = rawSource.replace(/\r?\n/g, eol).replace(/^(?:import[^\r\n]*;\r?\n)+/, '').replace(/^export /gm, '');
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
  // F101 (review P1-1): the loader comes from this host's /vendor/monaco, never from a CDN.
  assert.strictEqual(script.src, '/vendor/monaco/vs/loader.js', 'same-origin loader');
  assert.ok(!/https?:\/\/|cdn\./.test(rawSource), 'monaco.js must not reference any remote origin');
  script.onerror(); assert.strictEqual(await failed, false); assert.ok(status.textContent.includes('纯文本'));
  const slow = context.loadMonaco(); deadline(); assert.strictEqual(await slow, false);
  const required = [], configs = [];
  window.require = (deps, ok) => { required.push(deps.join()); ok(); }; window.require.config = cfg => configs.push(cfg);
  window.monaco = { editor: { create: (_el, options) => { createOptions.push(options); return {}; } } };
  script.onload(); assert.strictEqual(captured, 1); assert.strictEqual(activated, 1);
  assert.strictEqual(JSON.stringify(configs), JSON.stringify([{ paths: { vs: '/vendor/monaco/vs' } }]), 'AMD base path is the vendored tree (cross-realm: compare by value)');
  assert.deepStrictEqual(required, ['vs/nls.messages.zh-cn', 'vs/editor/editor.main'], 'zh-cn UI strings are loaded before the editor');
  assert.strictEqual(createOptions[0].fontSize, 16, 'F98: the editor is created at the current text scale (13px × 1.2)');
  assert.ok(status.textContent.includes('就绪'), 'late load preserves buffer and upgrades status');
  {
    // A missing nls bundle must not cost the editor: the error callback mounts editor.main anyway.
    required.length = 0;
    window.require = (deps, ok, fail) => { required.push(deps.join()); if (deps[0].startsWith('vs/nls')) fail(new Error('404')); else ok(); };
    window.require.config = () => {};
    const english = context.loadMonaco(); script.onload();
    assert.strictEqual(await english, true);
    assert.deepStrictEqual(required, ['vs/nls.messages.zh-cn', 'vs/editor/editor.main']);
  }
  const missing = context.loadMonaco(); delete window.require; script.onload();
  assert.strictEqual(await missing, false);
  }
  console.log('Monaco LF/CRLF loading/failure/late-upgrade fixtures passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
