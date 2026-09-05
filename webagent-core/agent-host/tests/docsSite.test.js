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
