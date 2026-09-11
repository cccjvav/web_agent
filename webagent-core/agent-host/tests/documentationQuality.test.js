'use strict';
// Editorial regression checks, not an automated proof of semantic correctness.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../../..');
const docs = [
  'webagent-core/README.md', 'webagent-core/agent-host/README.md', 'webagent-core/agent-host/src/README.md',
  ...['agent', 'api', 'auth', 'mcp', 'models', 'tools', 'tunnel', 'usage', 'utils'].map(name => 'webagent-core/agent-host/src/' + name + '/README.md'),
  'webagent-core/agent-host/tests/README.md', 'webagent-core/extension/README.md', 'webagent-core/workbench/README.md',
  'webagent-core/scripts/README.md', 'webagent-core/admin-host/README.md', 'installer/README.md', 'docs-site/README.md', '启动脚本说明.md'
];
for (const file of docs) {
  const text = fs.readFileSync(path.join(root, file), 'utf8').split('<!-- docs-inventory:start -->')[0];
  assert.strictEqual((text.match(/^# /gm) || []).length, 1, file + ': one document title');
  assert.ok(text.includes('职责') && /流程|执行链/.test(text) && /验证|测试/.test(text), file + ': explain responsibility, flow and evidence');
  assert.ok(!/\*\*Function .*（L\d/.test(text), file + ': no obsolete hand-copied function line listings');
  assert.ok(!/2026-09-11当前整改语义|第六批：请求取消/.test(text), file + ': corrections integrated into prose');
  let inFence = false, columns = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      if (!inFence) assert.ok(line.trim().length > 3, file + ': fenced examples declare language');
      inFence = !inFence; columns = null; continue;
    }
    if (inFence) continue;
    if (line.startsWith('|')) {
      const width = line.split('|').length;
      if (columns != null) assert.strictEqual(width, columns, file + ': rectangular markdown table');
      columns = width;
    } else columns = null;
  }
  assert.ok(!inFence, file + ': balanced code fences');
}
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
assert.ok(!read('webagent-core/agent-host/src/agent/README.md').includes('失败改 builtin'));
assert.ok(read('webagent-core/agent-host/src/mcp/README.md').includes('没有建立RPC请求ID到执行AbortController的映射'));
assert.ok(read('webagent-core/agent-host/src/models/README.md').includes('不是四文件事务'));
assert.ok(read('webagent-core/agent-host/src/api/README.md').includes('done是流处理结束'));
assert.ok(read('webagent-core/agent-host/README.md').includes('开发依赖含Acorn'));
// Exercise the actual renderer with ordinary text requiring escaping and a non-ASCII section ID.
const app = read('docs-site/app.js');
const escape = app.slice(app.indexOf('  function escapeText('), app.indexOf('  function escapeAttr('));
const render = app.slice(app.indexOf('  function renderFiles()'), app.indexOf('  function renderTerms()'));
const main = { innerHTML: '' }, id = '章节说明';
let scrolled = false;
const doc = { id: 'fixture', path: 'module/README.md', group: 'test', html: '<h2>Section</h2>', toc: [{ level: 2, id, text: 'read & write' }] };
const context = vm.createContext({
  window: { DOCS: { fileIndex: [doc], files: { fixture: doc } } },
  $: () => main, $$: () => [], route: () => ({ rest: ['fixture', encodeURIComponent(id)] }),
  pageChrome: () => '', go: () => {},
  document: { getElementById: key => key === id ? { scrollIntoView() { scrolled = true; } } : null }
});
vm.runInContext(escape + render + '\nrenderFiles();', context);
assert.ok(main.innerHTML.includes('aria-label="本页章节"'));
assert.ok(main.innerHTML.includes('read &amp; write'));
assert.ok(main.innerHTML.includes('#/files/fixture/' + encodeURIComponent(id)));
assert.ok(scrolled, 'Encoded Chinese anchor resolves to the real section');
console.log('documentation editorial contracts, table/fence checks and local TOC fixture passed');
