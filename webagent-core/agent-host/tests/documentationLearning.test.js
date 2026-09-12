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
for (const [source, guide] of pairs) {
  const body = read(guide);
  assert.ok(routes.has(guide), guide + ': available in documentation viewer');
  assert.ok(body.includes('验证'), guide + ': verification and limitations');
  for (const name of namedFunctions(acorn.parse(read(source), { ecmaVersion: 'latest' }))) {
    assert.ok(body.includes(name), source + ': named function missing from guide: ' + name);
  }
}
const docs = new Set([...pairs.map(p => p[1]), 'Conda环境说明.md', '代码复盘指南.md', 'review/CHECKLIST_WINDOWS.md']);
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
