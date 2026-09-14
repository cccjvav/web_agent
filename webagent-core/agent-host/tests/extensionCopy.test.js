const assert = require('assert');
const fs = require('fs');
const path = require('path');

const srcRoot = path.resolve(__dirname, '../../extension');
const version = require('../../extension/package.json').version;
const copyRoot = path.resolve(__dirname, `../../extensions-installed/webagent.webagent-core-${version}`);

function listFiles(root) {
  const out = [];
  function walk(rel) {
    const dir = rel ? path.join(root, rel) : root;
    for (const name of fs.readdirSync(dir).sort()) {
      if (!rel && name === 'README.md') continue;
      const child = rel ? `${rel}/${name}` : name;
      const st = fs.statSync(path.join(root, child));
      if (st.isDirectory()) walk(child);
      else out.push(child);
    }
  }
  walk('');
  return out.sort();
}

assert.ok(fs.existsSync(srcRoot), 'extension/ missing');
assert.ok(fs.existsSync(copyRoot), 'extensions-installed copy missing');

const srcFiles = listFiles(srcRoot);
const copyFiles = listFiles(copyRoot);
assert.deepStrictEqual(copyFiles, srcFiles, 'extension copy file list drifted');

for (const rel of srcFiles) {
  const a = fs.readFileSync(path.join(srcRoot, rel));
  const b = fs.readFileSync(path.join(copyRoot, rel));
  assert.ok(a.equals(b), `extension copy drifted: ${rel}`);
}

console.log('extensionCopy tests passed');

const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'webagent-sync-'));
try {
  const stale = path.join(tmp, 'webagent.webagent-core-0.0.1');
  fs.mkdirSync(stale); fs.writeFileSync(path.join(stale, 'old.txt'), 'old');
  const other = path.join(tmp, 'other.extension-1.0.0'); fs.mkdirSync(other);
  const dest = require('../../scripts/ensure-code-server').syncExtension(tmp);
  assert.deepStrictEqual(listFiles(dest), srcFiles);
  for (const rel of srcFiles) assert.ok(fs.readFileSync(path.join(dest, rel)).equals(fs.readFileSync(path.join(srcRoot, rel))), rel);
  assert.ok(!fs.existsSync(stale)); assert.ok(fs.existsSync(other));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'extensions.json'), 'utf8'))[0].version, version);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
