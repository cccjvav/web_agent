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

  let conflict = false;
  try {
    await applyPatch({
      filePath: 'sample.js',
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

  const grep = grepSearch({ query: 'Number', searchPath: '.' });
  assert.ok(grep.totalMatches >= 1);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('patchEngine tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
