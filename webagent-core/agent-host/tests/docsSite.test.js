const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../../..');
const contentPath = path.join(repoRoot, 'docs-site/content.js');
const buildPath = path.join(repoRoot, 'docs-site/build.js');


const serveSrc = fs.readFileSync(path.join(repoRoot, 'docs-site/serve.js'), 'utf8');
assert.ok(serveSrc.includes('ROOT + path.sep'), 'serve.js must reject paths outside ROOT + sep');
assert.ok(/DOCS_HOST \|\| '127\.0\.0\.1'/.test(serveSrc), 'docs-site default bind is loopback');

assert.ok(fs.existsSync(contentPath), 'docs-site/content.js must be committed');
const before = fs.readFileSync(contentPath, 'utf8');

const r = spawnSync(process.execPath, [buildPath], {
  cwd: repoRoot,
  encoding: 'utf8'
});
assert.strictEqual(r.status, 0, r.stderr || r.stdout || 'docs-site/build.js failed');

const after = fs.readFileSync(contentPath, 'utf8');
let firstMismatch = 0;
while (firstMismatch < Math.min(after.length, before.length) && after[firstMismatch] === before[firstMismatch]) firstMismatch++;
assert.ok(after === before, 'docs-site/content.js drift at ' + firstMismatch + ': ' + JSON.stringify({ before: before.slice(firstMismatch, firstMismatch + 160), after: after.slice(firstMismatch, firstMismatch + 160) }));

// Re-run the real builder with every Markdown input converted to CRLF.
// The output must be byte-identical, not just semantically similar HTML.
let crlfBuild;
const fixtureFs = { ...fs,
  readFileSync(file, ...args) {
    const raw = fs.readFileSync(file, ...args);
    return String(file).endsWith('.md') && typeof raw === 'string' ? raw.replace(/\r?\n/g, '\r\n') : raw;
  },
  writeFileSync(file, data) {
    assert.strictEqual(file, contentPath);
    crlfBuild = data;
  }
};
const buildRequire = require('module').createRequire(buildPath);
require('vm').runInNewContext(fs.readFileSync(buildPath, 'utf8'), {
  require(name) { return name === 'fs' ? fixtureFs : buildRequire(name); },
  __dirname: path.dirname(buildPath), Buffer, console: { log() {} }
});
assert.ok(crlfBuild === after, 'Markdown CRLF must not change generated documentation bytes');

console.log('docs-site content.js matches build.js');

const context = { window: {} };
require('vm').runInNewContext(after, context);
assert.strictEqual(context.window.DOCS.files.summary.path, 'review/SEMANTIC_REVIEW_2026-09-16.md', 'legacy summary route must resolve to the current ledger source');
assert.ok(context.window.DOCS.files.summary.html.includes('不是全仓源码逐行认证'), 'current ledger must retain the user-clarified Markdown scope');
assert.ok(!fs.existsSync(path.join(repoRoot, 'DOCUMENTATION_SUMMARY.md')), 'retired duplicate statistics must not return');
assert.ok(context.window.DOCS.fileIndex.some(doc => doc.id === 'summary'));

const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs-site/documentation-manifest.json'), 'utf8'));
for (const file of manifest.files) {
  assert.ok(context.window.DOCS.fileIndex.some(doc => doc.path === file.doc), 'Every owning README is navigable: ' + file.doc);
  assert.strictEqual(context.window.DOCS.sources[file.path].sha256, file.sha256);
}
assert.ok(Object.values(context.window.DOCS.files).some(doc => doc.html.includes('#/source/')), 'Source links resolve inside the docs viewer');
assert.ok(context.window.DOCS.files['source-index'].html.includes('/L'));

assert.ok(!context.window.DOCS.sources['webagent-core/agent-host/tests/installerPackaging.test.js'].text, 'Test fixtures are not embedded in distributable docs');

const appSrc = fs.readFileSync(path.join(repoRoot, 'docs-site/app.js'), 'utf8');
assert.ok(appSrc.includes('arenaConnect 仅显示连接指引'), 'connection guidance must not claim to execute MCP');
assert.ok(!appSrc.includes('arenaConnect 打的是本机 /mcp'), 'stale Arena behavior must not return');

assert.ok(context.window.DOCS.files['builtin-explorer-guide'].html.includes('不是本地部署'));
assert.ok(context.window.DOCS.files['adoption-beginner-guide'].html.includes('不是整仓复制'));
