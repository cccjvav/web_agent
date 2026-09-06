const assert = require('assert');
const fs = require('fs');
const path = require('path');

const srcRoot = path.resolve(__dirname, '../../extension');
const copyRoot = path.resolve(__dirname, '../../extensions-installed/webagent.webagent-core-0.6.9');

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
