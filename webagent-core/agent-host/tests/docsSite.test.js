const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../../..');
const contentPath = path.join(repoRoot, 'docs-site/content.js');
const buildPath = path.join(repoRoot, 'docs-site/build.js');

function stripBuiltAt(s) {
  return String(s).replace(/"builtAt":"\d{4}-\d{2}-\d{2}"/g, '"builtAt":""');
}

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
assert.strictEqual(
  stripBuiltAt(after),
  stripBuiltAt(before),
  'docs-site/content.js drifted from Markdown. Run: node docs-site/build.js'
);

console.log('docs-site content.js matches build.js');

const context = { window: {} };
require('vm').runInNewContext(after, context);
assert.ok(context.window.DOCS.files.summary.html, 'summary route must have real content');
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
