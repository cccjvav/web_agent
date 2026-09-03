const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');
const { applyPatch, computeHash } = require('../src/tools/patchEngine');
const { readFile, grepSearch } = require('../src/tools/fileOps');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shuncode-patch-'));
config.workspaceRoot = tmp;

async function main() {
  fs.writeFileSync(path.join(tmp, 'sample.js'), 'function add(a, b) {\n  return a + b;\n}\n', 'utf8');

  const read = readFile({ filePath: 'sample.js' });
  assert.ok(read.hash);
  assert.ok(read.content.includes('return a + b'));

  const patched = await applyPatch({
    filePath: 'sample.js',
    expectedHash: read.hash,
    patch: `<<<<<<< SEARCH
  return a + b;
=======
  return Number(a) + Number(b);
>>>>>>> REPLACE`
  });
  assert.strictEqual(patched.success, true);
  const after = fs.readFileSync(path.join(tmp, 'sample.js'), 'utf8');
  assert.ok(after.includes('Number(a)'));

  let stale = false;
  try {
    await applyPatch({
      filePath: 'sample.js',
      expectedHash: read.hash,
      patch: `<<<<<<< SEARCH
  return Number(a) + Number(b);
=======
  return a + b;
>>>>>>> REPLACE`
    });
  } catch (err) {
    stale = /STALE_FILE/.test(err.message);
  }
  assert.ok(stale, 'expected STALE_FILE');

  const fromCache = await applyPatch({
    filePath: 'sample.js',
    patch: `<<<<<<< SEARCH
  return Number(a) + Number(b);
=======
  return a - b;
>>>>>>> REPLACE`
  });
  assert.strictEqual(fromCache.success, true, 'apply_patch without expectedHash should reuse last-read/patched hash');

  fs.writeFileSync(path.join(tmp, 'orphan.js'), 'module.exports = 1;\n', 'utf8');
  let needHash = false;
  let hashDetail = null;
  try {
    await applyPatch({
      filePath: 'orphan.js',
      patch: `<<<<<<< SEARCH
module.exports = 1;
=======
module.exports = 2;
>>>>>>> REPLACE`
    });
  } catch (err) {
    needHash = /HASH_REQUIRED/.test(err.message);
    hashDetail = err.detail && err.detail.currentHash;
  }
  assert.ok(needHash, 'expected HASH_REQUIRED when the file was never read');
  assert.ok(hashDetail, 'HASH_REQUIRED should include currentHash in detail');

  const afterRead = readFile({ filePath: 'sample.js' });
  let conflict = false;
  try {
    await applyPatch({
      filePath: 'sample.js',
      expectedHash: afterRead.hash,
      patch: `<<<<<<< SEARCH
not in file
=======
x
>>>>>>> REPLACE`
    });
  } catch (err) {
    conflict = /Patch conflict/.test(err.message);
  }
  assert.ok(conflict);

  const grep = grepSearch({ query: 'function add', searchPath: '.' });
  assert.ok(grep.totalMatches >= 1);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('patchEngine tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
