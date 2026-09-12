'use strict';
// Mechanical documentation regressions, NOT proof that prose explains every branch.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const root = path.resolve(__dirname, '../../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const config = JSON.parse(read('docs-site/documentation.config.json'));
const routes = new Map(config.extraSiteDocs.map(d => [d.path, d.id]));
const pairs = [
  ["webagent-core/agent-host/tests/workbenchHtml.test.js", "webagent-core/workbench/页面结构详解.md"],
  ["webagent-core/admin-host/app.js", "webagent-core/admin-host/统计服务详解.md"],
  ["webagent-core/admin-host/index.js", "webagent-core/admin-host/统计服务详解.md"],
  ["docs-site/check-docs.js", "docs-site/清单与构建详解.md"],
  ["docs-site/build.js", "docs-site/清单与构建详解.md"],
  ["docs-site/app.js", "docs-site/浏览与服务详解.md"],
  ["docs-site/serve.js", "docs-site/浏览与服务详解.md"],
  ["webagent-core/agent-host/tests/adminHost.test.js", "webagent-core/agent-host/tests/统计与文档测试详解.md"],
  ["webagent-core/agent-host/tests/docsSite.test.js", "webagent-core/agent-host/tests/统计与文档测试详解.md"],
  ["webagent-core/agent-host/tests/docsHttp.test.js", "webagent-core/agent-host/tests/统计与文档测试详解.md"],

  ["webagent-core/scripts/ensure-code-server.js", "webagent-core/scripts/编辑器编排详解.md"],
  ["webagent-core/scripts/codeServerAuth.js", "webagent-core/scripts/编辑器编排详解.md"],
  ["webagent-core/scripts/run-code-oss.js", "webagent-core/scripts/编辑器编排详解.md"],
  ["webagent-core/scripts/install-desktop-extension.js", "webagent-core/scripts/编辑器编排详解.md"],

  ["webagent-core/agent-host/src/tunnel/cloudflared.js", "webagent-core/agent-host/src/tunnel/隧道生命周期详解.md"],
  ["webagent-core/agent-host/src/tunnel/ngrok.js", "webagent-core/agent-host/src/tunnel/隧道生命周期详解.md"],

  ["webagent-core/workbench/js/state.js", "webagent-core/workbench/js/状态与编辑器详解.md"],
  ["webagent-core/workbench/js/dom.js", "webagent-core/workbench/js/状态与编辑器详解.md"],
  ["webagent-core/workbench/js/tabs.js", "webagent-core/workbench/js/状态与编辑器详解.md"],
  ["webagent-core/workbench/js/monaco.js", "webagent-core/workbench/js/状态与编辑器详解.md"],
  ["webagent-core/workbench/js/picker.js", "webagent-core/workbench/js/状态与编辑器详解.md"],
  ["webagent-core/workbench/app.js", "webagent-core/workbench/js/启动与Chat详解.md"],
  ["webagent-core/workbench/js/chat.js", "webagent-core/workbench/js/启动与Chat详解.md"],
  ["webagent-core/workbench/js/bridge.js", "webagent-core/workbench/js/Bridge与设置详解.md"],
  ["webagent-core/workbench/js/settings.js", "webagent-core/workbench/js/Bridge与设置详解.md"],
  ["webagent-core/workbench/js/bind.js", "webagent-core/workbench/js/交互绑定详解.md"],

  ["webagent-core/extension/ptyHost.js", "webagent-core/extension/PTY扩展详解.md"],
  ["webagent-core/extension/ptyPolicy.js", "webagent-core/extension/PTY扩展详解.md"],
  ["webagent-core/extension/extension.js", "webagent-core/extension/入口与Webview详解.md"],
  ["webagent-core/extension/modeFromChatRequest.js", "webagent-core/extension/入口与Webview详解.md"],
  ["webagent-core/extension/workspaceMatch.js", "webagent-core/extension/入口与Webview详解.md"],

  ["webagent-core/agent-host/src/tools/patchEngine.js", "webagent-core/agent-host/src/tools/补丁与路径详解.md"],
  ["webagent-core/agent-host/src/tools/fileOps.js", "webagent-core/agent-host/src/tools/文件与搜索详解.md"],
  ["webagent-core/agent-host/src/tools/findFiles.js", "webagent-core/agent-host/src/tools/文件与搜索详解.md"],
  ["webagent-core/agent-host/src/tools/searchWorker.js", "webagent-core/agent-host/src/tools/文件与搜索详解.md"],
  ["webagent-core/agent-host/src/tools/executor.js", "webagent-core/agent-host/src/tools/命令与PTY详解.md"],
  ["webagent-core/agent-host/src/tools/ptyJobs.js", "webagent-core/agent-host/src/tools/命令与PTY详解.md"],
  ["webagent-core/agent-host/src/tools/index.js", "webagent-core/agent-host/src/tools/工具入口与命令策略详解.md"],
  ["webagent-core/agent-host/src/tools/normalize.js", "webagent-core/agent-host/src/tools/工具入口与命令策略详解.md"],
  ["webagent-core/agent-host/src/tools/dangerous.js", "webagent-core/agent-host/src/tools/工具入口与命令策略详解.md"],
  ["webagent-core/agent-host/src/tools/board.js", "webagent-core/agent-host/src/tools/任务板与工作区详解.md"],
  ["webagent-core/agent-host/src/tools/gitOps.js", "webagent-core/agent-host/src/tools/任务板与工作区详解.md"],
  ["webagent-core/agent-host/src/tools/workspaceInfo.js", "webagent-core/agent-host/src/tools/任务板与工作区详解.md"],

  ["webagent-core/agent-host/src/api/routes.js", "webagent-core/agent-host/src/api/路由逐项详解.md"],
  ["webagent-core/agent-host/src/tools/readCache.js", "webagent-core/agent-host/src/tools/缓存与进度详解.md"],
  ["webagent-core/agent-host/src/tools/progressTracker.js", "webagent-core/agent-host/src/tools/缓存与进度详解.md"],
  ["webagent-core/agent-host/src/tools/skills.js", "webagent-core/agent-host/src/tools/技能与隐藏规则详解.md"],
  ["webagent-core/agent-host/src/tools/sensitive.js", "webagent-core/agent-host/src/tools/技能与隐藏规则详解.md"],
  ["webagent-core/agent-host/src/utils/diff.js", "webagent-core/agent-host/src/utils/差异展示详解.md"],

  ["webagent-core/agent-host/src/mcp/session.js", "webagent-core/agent-host/src/mcp/会话与结果详解.md"],
  ["webagent-core/agent-host/src/mcp/errors.js", "webagent-core/agent-host/src/mcp/会话与结果详解.md"],
  ["webagent-core/agent-host/src/mcp/budget.js", "webagent-core/agent-host/src/mcp/会话与结果详解.md"],
  ["webagent-core/agent-host/src/mcp/instructions.js", "webagent-core/agent-host/src/mcp/资源与客户端详解.md"],
  ["webagent-core/agent-host/src/mcp/resources.js", "webagent-core/agent-host/src/mcp/资源与客户端详解.md"],
  ["webagent-core/agent-host/src/mcp/clients.js", "webagent-core/agent-host/src/mcp/资源与客户端详解.md"],
  ["webagent-core/agent-host/src/mcp/server.js", "webagent-core/agent-host/src/mcp/请求分发详解.md"],
  ["webagent-core/agent-host/src/mcp/oauth.js", "webagent-core/agent-host/src/mcp/OAuth授权详解.md"],
  ["webagent-core/agent-host/src/utils/localControl.js", "webagent-core/agent-host/src/utils/控制面与Origin详解.md"],
  ["webagent-core/agent-host/src/utils/corsAllow.js", "webagent-core/agent-host/src/utils/控制面与Origin详解.md"],
  ["webagent-core/agent-host/src/utils/eventBus.js", "webagent-core/agent-host/src/utils/事件总线详解.md"],

  ["webagent-core/agent-host/src/agent/runChat.js", "webagent-core/agent-host/src/agent/Chat调度详解.md"],
  ["webagent-core/agent-host/src/agent/openai.js", "webagent-core/agent-host/src/agent/模型调用详解.md"],
  ["webagent-core/agent-host/src/agent/providers.js", "webagent-core/agent-host/src/agent/模型调用详解.md"],
  ["webagent-core/agent-host/src/agent/computerUse.js", "webagent-core/agent-host/src/agent/模型调用详解.md"],
  ["webagent-core/agent-host/src/agent/toolLabel.js", "webagent-core/agent-host/src/agent/模型调用详解.md"],
  ["webagent-core/agent-host/src/tools/planRound.js", "webagent-core/agent-host/src/tools/Plan状态详解.md"],
  ["webagent-core/agent-host/src/tools/consensusEngine.js", "webagent-core/agent-host/src/tools/Plan状态详解.md"],
  ["webagent-core/agent-host/src/models/store.js", "webagent-core/agent-host/src/models/配置存储详解.md"],
  ["webagent-core/agent-host/src/models/customizations.js", "webagent-core/agent-host/src/models/画像与记忆详解.md"],
  ["webagent-core/agent-host/src/models/profile.js", "webagent-core/agent-host/src/models/画像与记忆详解.md"],
  ["webagent-core/agent-host/src/models/memory.js", "webagent-core/agent-host/src/models/画像与记忆详解.md"],
  ["webagent-core/agent-host/src/auth/github.js", "webagent-core/agent-host/src/auth/GitHub身份详解.md"],
  ["webagent-core/agent-host/src/usage/tracker.js", "webagent-core/agent-host/src/usage/用量上报详解.md"],
  ["webagent-core/agent-host/src/config.js", "webagent-core/agent-host/src/运行配置详解.md"],
  ["webagent-core/agent-host/src/extensionVersion.js", "webagent-core/agent-host/src/运行配置详解.md"],

  ['installer/launch.js', 'installer/函数详解.md'],
  ['installer/package.js', 'installer/函数详解.md'],
  ['webagent-core/agent-host/src/index.js', 'webagent-core/agent-host/src/入口详解.md'],
  ['webagent-core/agent-host/src/utils/requestScope.js', 'webagent-core/agent-host/src/utils/函数详解.md'],
  ['webagent-core/agent-host/src/utils/boundedFile.js', 'webagent-core/agent-host/src/utils/函数详解.md'],
  ['webagent-core/agent-host/src/tunnel/stopProcess.js', 'webagent-core/agent-host/src/tunnel/停止进程详解.md'],
  ['webagent-core/agent-host/scripts/run-tests.js', 'webagent-core/agent-host/scripts/运行器详解.md']
];
function namedFunctions(node, result = new Set()) {
  if (!node || typeof node !== 'object') return result;
  if (node.type === 'ClassDeclaration' && node.id) result.add(node.id.name);
  if (node.type === 'MethodDefinition' && !node.computed && node.key.name) result.add(node.key.name);
  if (node.type === 'FunctionDeclaration' && node.id) result.add(node.id.name);
  if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init &&
      /^(ArrowFunctionExpression|FunctionExpression)$/.test(node.init.type)) result.add(node.id.name);
  if (node.type === 'Property' && !node.computed && node.value && node.value.type === 'FunctionExpression') {
    if (node.key.name) result.add(node.key.name);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => namedFunctions(child, result));
    else if (value && typeof value === 'object') namedFunctions(value, result);
  }
  return result;
}
// Negative fixture: this collector must not silently omit named nested callbacks.
assert.deepStrictEqual([...namedFunctions(acorn.parse('function outer(){const cancel=()=>{};}', { ecmaVersion: 'latest' }))], ['outer', 'cancel']);
assert.deepStrictEqual([...namedFunctions(acorn.parse('class Bus { constructor(){} broadcast(){} }', { ecmaVersion: 'latest' }))], ['Bus', 'constructor', 'broadcast']);
for (const [source, guide] of pairs) {
  const body = read(guide);
  assert.ok(routes.has(guide), guide + ': available in documentation viewer');
  assert.ok(body.includes('验证'), guide + ': verification and limitations');
  for (const name of namedFunctions(acorn.parse(read(source), { ecmaVersion: 'latest', sourceType: source.startsWith('webagent-core/workbench/') ? 'module' : 'script' }))) {
    assert.ok(body.includes(name), source + ': named function missing from guide: ' + name);
  }
}
// File-level evidence for non-JS prose: no semantic or selector completeness claim.
const artifactPairs = [
  [
    "docs-site/documentation.config.json",
    "docs-site/清单与构建详解.md"
  ],
  [
    "docs-site/index.html",
    "docs-site/浏览与服务详解.md"
  ],
  [
    "docs-site/styles.css",
    "docs-site/样式规则详解.md"
  ],
  [
    "webagent-core/workbench/index.html",
    "webagent-core/workbench/页面结构详解.md"
  ],
  [
    "webagent-core/workbench/favicon.svg",
    "webagent-core/workbench/页面结构详解.md"
  ],
  [
    "webagent-core/workbench/styles.css",
    "webagent-core/workbench/样式规则详解.md"
  ],
  [
    "webagent-core/extension/package.json",
    "webagent-core/extension/入口与Webview详解.md"
  ],
  [
    "webagent-core/extension/resources/icon.svg",
    "webagent-core/extension/入口与Webview详解.md"
  ]
];
for (const [source, guide] of artifactPairs) {
  assert.ok(read(source).length, source + ': artifact exists');
  assert.ok(routes.has(guide), guide + ': artifact guide is navigable');
  assert.ok(read(guide).includes(path.basename(source)), guide + ': identifies source artifact');
}
const docs = new Set([...artifactPairs.map(p => p[1]), ...pairs.map(p => p[1]), 'Conda环境说明.md', '代码复盘指南.md', 'review/CHECKLIST_WINDOWS.md']);
for (const doc of docs) {
  assert.ok(routes.has(doc), doc + ': has viewer route');
  let fenced = false, columns = null;
  for (const line of read(doc).split('\n')) {
    if (line.startsWith('```')) {
      if (!fenced) assert.ok(line.trim().length > 3, doc + ': code block needs a language');
      fenced = !fenced; columns = null; continue;
    }
    if (fenced) continue;
    if (line.startsWith('|')) {
      const count = line.split('|').length;
      if (columns !== null) assert.strictEqual(count, columns, doc + ': rectangular table');
      columns = count;
    } else columns = null;
  }
  assert.ok(!fenced, doc + ': balanced fences');
}
const conda = read('Conda环境说明.md');
for (const contract of ['process.execPath', 'sys.executable', 'conda run', '--include=dev', '-NoProfile', '未执行', '本轮沙箱没有 Conda']) assert.ok(conda.includes(contract), contract);
const checklist = read('review/CHECKLIST_WINDOWS.md');
for (const section of ['E1–E6', '## F.', '## G.', '## H.', '未执行', '不自动删']) assert.ok(checklist.includes(section), section);
assert.ok(!checklist.includes('33 test files passed'));
assert.ok(!checklist.includes('不需要在真机做的（沙箱已覆盖）'));
const packaged = require('../../../installer/package').collect(root);
for (const p of ['Conda环境说明.md', '代码复盘指南.md', 'review/CHECKLIST_WINDOWS.md']) assert.ok(packaged.includes(p), p + ': ships with product');
assert.ok(read('代码复盘指南.md').includes('尚须继续补齐'));
console.log('learning documentation names, navigation, formatting and Conda/acceptance contracts passed; not semantic certification');
