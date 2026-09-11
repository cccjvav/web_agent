'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { run, extractSymbols, replaceBlock } = require('../../../docs-site/check-docs');
const root = path.resolve(__dirname, '../../..');
assert.ok(run({ root }).files > 100, 'real checkout is covered');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-docs-'));
const put = (p, text) => { fs.mkdirSync(path.dirname(path.join(tmp, p)), { recursive: true }); fs.writeFileSync(path.join(tmp, p), text); };
try {
  execFileSync('git', ['init', '-q'], { cwd: tmp });
  put('docs-site/documentation.config.json', JSON.stringify({ version: 1, sourceExtensions: ['.js', '.json'], exclusions: [
    { path: 'docs-site/documentation-manifest.json', reason: 'generated' }
  ], rootDoc: 'README.md', rootScriptDoc: 'README.md', extraSiteDocs: [] }));
  put('README.md', '# Fixture\n'); put('docs-site/README.md', '# Tooling\n');
  put('src/main.js', 'function main(a) { return a; }\n');
  assert.throws(() => run({ root: tmp }), /Missing directory README/);
  put('src/README.md', '# Source\n');
  run({ root: tmp, write: true }); run({ root: tmp });
  const before = fs.readFileSync(path.join(tmp, 'src/README.md'), 'utf8');
  put('src/main.js', 'function renamed(a) { return a + 1; }\n');
  assert.throws(() => run({ root: tmp }), /drift/);
  assert.strictEqual(fs.readFileSync(path.join(tmp, 'src/README.md'), 'utf8'), before, 'check is read-only');
  run({ root: tmp, write: true });
  put('src/new.js', 'module.exports = () => 1;\n');
  assert.throws(() => run({ root: tmp }), /drift/);
  run({ root: tmp, write: true });
  fs.unlinkSync(path.join(tmp, 'src/main.js'));
  assert.throws(() => run({ root: tmp }), /drift/);
  run({ root: tmp, write: true });
  put('src/README.md', before + '\n[broken](missing.js)\n');
  assert.throws(() => run({ root: tmp, write: true }), /Broken local link/);
  put('src/README.md', '# Source\n'); run({ root: tmp, write: true });
  put('src/new.js', 'function {');
  assert.throws(() => run({ root: tmp }), /Unexpected token/);
  const symbols = extractSymbols('class A { same(x) { return x; } } class B { same(y) { return y; } } const f = z => z;');
  assert.ok(symbols.some(s => s.id === 'A/same'));
  assert.ok(symbols.some(s => s.id === 'B/same'));
  assert.ok(symbols.some(s => s.id === 'f' && s.parameters[0] === 'z'));
  assert.throws(() => replaceBlock('<!-- docs-inventory:start -->', 'new'), /Broken/);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log('documentation policy and negative drift fixtures passed');
