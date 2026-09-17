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
const hostPackage = JSON.parse(read('webagent-core/agent-host/package.json'));
const projectPackage = JSON.parse(read('package.json'));
assert.ok(projectPackage.private && projectPackage.scripts.test.includes('agent-host'));
assert.ok(hostPackage.devDependencies.playwright && hostPackage.scripts['test:browser'].includes('workbench.browser.js'));
for (const name of ['测试说明.md', 'Conda环境说明.md', '平台启动与CI详解.md']) {
  const prose = read(name);
  assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(prose), name + ': no hidden control characters in commands');
  assert.ok(prose.includes(hostPackage.devDependencies.playwright), name + ': Playwright version matches package');
  assert.ok(prose.includes('test:browser') && prose.includes('Chromium'), name + ': separate browser runtime and test entry');
}
assert.ok(!read('总览.md').includes('源码根无统一npm包入口'));
assert.ok(read('平台启动与CI详解.md').includes('三个job定义'));
assert.ok(read('check-env.cmd').includes('完全退出并重开 VS Code'));
const tunnelGuide = read('隧道使用指南.md');
for (const stale of ['失败时按钮仍会成功', 'C:\\Windows\\System32', '每次启动 Bridge 都变']) assert.ok(!tunnelGuide.includes(stale));
for (const contract of ['success:false', '停止失败', 'workspace_info', '完全退出并重开 VS Code']) assert.ok(tunnelGuide.includes(contract));
assert.ok(!read('SECURITY.md').includes('跑**非破坏性**命令'));
assert.ok(read('Windows新手逐步验收.md').includes('本机连接未建立'));
assert.ok(read('review/CHECKLIST_WINDOWS.md').includes('M1'));
const skillGuide = read('技能使用指南.md');
assert.ok(!skillGuide.includes('演示工作区里现成的四篇'));
assert.ok(!skillGuide.includes('ShunCode 官方说法'));
for (const contract of ['createOnly', 'frontmatter.name', 'evidence-check', '状态未知']) assert.ok(skillGuide.includes(contract), "Skill guide contract: " + contract);



for (const guide of ['架构导读.md', '组件说明.md', '总览.md']) {
  const body = read(guide);
  for (const obsolete of ['工作区是仓库里那个带测试的小计算器', '没有浏览器自动点选测试', '不是 exe 安装包', '正好 **30** 个', 'GPL v3 会传染许可证']) assert.ok(!body.includes(obsolete), guide + ': obsolete current claim');
  assert.ok(body.includes('Chat') && body.includes('Bridge') && body.includes('互斥'), guide + ': mode contract');
  assert.ok(body.includes('检查点') && body.includes('部分'), guide + ': non-atomic recovery boundary');
}

assert.ok(!read('webagent-core/agent-host/src/agent/README.md').includes('失败改 builtin'));
assert.ok(read('webagent-core/agent-host/src/mcp/README.md').includes('相同初始化peer＋相同凭据＋同类型RPC ID'));
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

// User-directed pause is a management contract, not external project certification.
const probeStage = read('manager/stages/s8-probe-integration.md');
assert.ok(probeStage.includes('当前状态：暂停') && probeStage.includes('phuang6666/arena-ai-probe/tree/arena/01a0ab8a-arena-ai-probe'));
for (const doc of ['manager/CONTEXT.md', 'README.md', 'review/SEMANTIC_REVIEW_2026-09-16.md']) {
  assert.ok(read(doc).includes('暂停') && read(doc).includes('交接'), doc + ': probe handoff pause remains explicit');
}
const usageGuide = read('使用指南.md');
for (const obsolete of ['MCP 走当前页面源', 'MCP 仍走当前页面源', '没 Key 时是本机草案/拼接', '为什么 GitHub 根上没有', 'C:\\Windows\\System32', '浏览器界��']) {
  assert.ok(!usageGuide.includes(obsolete), 'usage guide obsolete claim: ' + obsolete);
}
for (const contract of ['test:browser', '主人权限', '真实工具', '已跟踪', '完整重开VSCode']) assert.ok(usageGuide.includes(contract), contract);

const handoff = read('交接与路线图.md');
for (const id of ['R0','R1','R2','R3','R4','R5','R6','R7','R8','P']) assert.ok(handoff.includes('| ' + id + ' / '), 'handoff route: ' + id);
assert.strictEqual([...handoff.matchAll(/\| R[1-8] \/ 下一项/g)].length, 1, 'handoff has one current next package, not permanently R1');
for (const contract of ['完成标准', '35235675274', '35125290301', '不自动', '探测', '暂停', '本机MCP', 'memoryRecall']) {
  assert.ok(handoff.includes(contract), 'handoff contract: ' + contract);
}
for (const entry of ['README.md', 'AGENTS.md', 'manager/CONTEXT.md']) assert.ok(read(entry).includes('交接与路线图.md'), entry + ': discoverable handoff');
