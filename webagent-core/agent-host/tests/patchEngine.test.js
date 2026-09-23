const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');
const { applyPatch, computeHash } = require('../src/tools/patchEngine');
const { readFile, grepSearch } = require('../src/tools/fileOps');
const { findFiles } = require('../src/tools/findFiles');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-patch-'));
config.workspaceRoot = tmp;

async function missingTargetSafety() {
  const bus = require('../src/utils/eventBus');
  const { recalledHash } = require('../src/tools/readCache');
  const events = []; const observe = event => events.push(event);
  bus.on('file_patched', observe);
  const empty = '<<<<<<< SEARCH\n=======\nfirst\n>>>>>>> REPLACE';
  const change = '<<<<<<< SEARCH\nfirst\n=======\nsecond\n>>>>>>> REPLACE';
  const cases = [
    { patch: 'raw new body', expectedHash: computeHash('old'), code: 'E_STALE_FILE' },
    { patch: empty, expectedHash: computeHash(''), code: 'E_STALE_FILE' },
    { patch: change, code: 'E_CONFLICT' },
    { patch: empty + '\n' + change, code: 'E_BAD_ARGS' },
    { patch: empty + '\n' + empty, code: 'E_BAD_ARGS' }
  ];
  try {
    for (let i = 0; i < cases.length; i++) {
      for (const dryRun of [true, false]) {
        const filePath = `missing-case-${i}-${dryRun}/file.txt`;
        const { code, ...input } = cases[i];
        const count = events.length;
        await assert.rejects(applyPatch({ filePath, ...input, dryRun }), error => {
          assert.strictEqual(error.code, code);
          if (code === 'E_STALE_FILE') assert.strictEqual(error.detail.currentHash, null);
          return true;
        });
        assert.strictEqual(fs.existsSync(path.join(tmp, filePath.split('/')[0])), false, 'rejection must not even create a parent directory');
        assert.strictEqual(recalledHash(filePath), null);
        assert.strictEqual(events.length, count, 'rejected patch cannot broadcast success');
      }
    }
    // The supplied read precondition survives external deletion, including dryRun.
    fs.writeFileSync(path.join(tmp, 'deleted-after-read.txt'), 'old');
    const old = readFile({ filePath: 'deleted-after-read.txt' });
    fs.unlinkSync(path.join(tmp, 'deleted-after-read.txt'));
    for (const dryRun of [true, false]) {
      await assert.rejects(applyPatch({ filePath: 'deleted-after-read.txt', patch: empty, expectedHash: old.hash, dryRun }), error => error.code === 'E_STALE_FILE');
      assert.strictEqual(fs.existsSync(path.join(tmp, 'deleted-after-read.txt')), false);
      assert.strictEqual(recalledHash('deleted-after-read.txt'), old.hash, 'failure must not publish a new hash');
    }
    for (const [index, patch, content] of [[0,'raw body\r\n','raw body\r\n'],[1,empty,'first']]) {
      const filePath = `valid-new-${index}/file.txt`, count = events.length;
      const preview = await applyPatch({ filePath, patch, dryRun: true });
      assert.strictEqual(preview.baseHash, null);
      assert.strictEqual(preview.proposedHash, computeHash(content));
      assert.strictEqual(fs.existsSync(path.join(tmp, `valid-new-${index}`)), false);
      assert.strictEqual(recalledHash(filePath), null);
      assert.strictEqual(events.length, count);
      const written = await applyPatch({ filePath, patch });
      assert.strictEqual(written.newHash, preview.proposedHash);
      assert.strictEqual(fs.readFileSync(path.join(tmp, filePath), 'utf8'), content);
      assert.strictEqual(events.length, count + 1);
      assert.strictEqual(recalledHash(filePath), written.newHash);
    }
    // Existing-file multi-block editing remains supported; only ambiguous creation is refused.
    fs.writeFileSync(path.join(tmp, 'existing-multi.txt'), 'first');
    const second = '<<<<<<< SEARCH\nsecond\n=======\nthird\n>>>>>>> REPLACE';
    const result = await applyPatch({ filePath: 'existing-multi.txt', patch: change + '\n' + second, expectedHash: computeHash('first') });
    assert.strictEqual(result.newHash, computeHash('third'));
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'existing-multi.txt'), 'utf8'), 'third');
  } finally { bus.removeListener('file_patched', observe); }
}

// F63: a marker-less patch must never overwrite an EXISTING file. The hash gate proves the
// caller saw the current bytes; it cannot prove the caller MEANT "replace the whole file".
// Baseline: a 3-line file + unmarked fragment patch (even with a valid hash, even dryRun)
// returned success and left the file as the fragment.
async function unmarkedPatchOnExistingFileRejected() {
  const bus = require('../src/utils/eventBus');
  const events = []; const observe = event => events.push(event);
  bus.on('file_patched', observe);
  const target = 'existing-unmarked.txt';
  const original = 'line one\nline two\nline three\n';
  fs.writeFileSync(path.join(tmp, target), original, 'utf8');
  const before = fs.readFileSync(path.join(tmp, target));
  const read = readFile({ filePath: target });
  for (const dryRun of [true, false]) {
    // With an explicit valid hash (the strongest possible precondition)…
    await assert.rejects(
      applyPatch({ filePath: target, patch: '  return x;\n', expectedHash: read.hash, dryRun }),
      error => {
        assert.strictEqual(error.code, 'E_BAD_ARGS');
        assert.ok(/SEARCH\/REPLACE|unified diff/i.test(error.message), 'the error must name the accepted formats');
        return true;
      }
    );
    // …and with a hash silently satisfied by the persisted read cache.
    await assert.rejects(applyPatch({ filePath: target, patch: '  return x;\n', dryRun }), error => error.code === 'E_BAD_ARGS');
    assert.ok(fs.readFileSync(path.join(tmp, target)).equals(before), 'file bytes must be untouched after every rejection');
    assert.strictEqual(events.length, 0, 'no file_patched event may be broadcast');
  }
  // The same body remains VALID for creating a file (creation contract) and SEARCH/REPLACE
  // still patches this file afterwards.
  const created = await applyPatch({ filePath: 'unmarked-new.txt', patch: '  return x;\n' });
  assert.strictEqual(created.isNewFile, true);
  const patched = await applyPatch({
    filePath: target,
    expectedHash: read.hash,
    patch: '<<<<<<< SEARCH\nline two\n=======\nLINE TWO\n>>>>>>> REPLACE'
  });
  assert.strictEqual(patched.success, true);
  assert.strictEqual(fs.readFileSync(path.join(tmp, target), 'utf8'), 'line one\nLINE TWO\nline three\n');
  bus.off('file_patched', observe);
}

async function main() {
  await missingTargetSafety();
  await unmarkedPatchOnExistingFileRejected();
  const safeBody = 'keep this line\nold\n';
  fs.writeFileSync(path.join(tmp, 'truncated.txt'), safeBody);
  const complete = '<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE';
  for (const broken of ['<<<<<<< SEARCH\nold\n=======\nnew\n', complete + '\n<<<<<<< SEARCH\nkeep', '=======\nnew\n>>>>>>> REPLACE']) {
    for (const dryRun of [false, true]) {
      await assert.rejects(() => applyPatch({ filePath: 'truncated.txt', patch: broken, expectedHash: computeHash(safeBody), dryRun }), e => e.code === 'E_BAD_ARGS' && /SEARCH/.test(e.detail.retryHint));
      assert.strictEqual(fs.readFileSync(path.join(tmp, 'truncated.txt'), 'utf8'), safeBody);
      await assert.rejects(() => applyPatch({ filePath: 'never-created.txt', patch: broken, dryRun }), /incomplete|malformed/i);
      assert.ok(!fs.existsSync(path.join(tmp, 'never-created.txt')));
    }
  }

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

  const grep = await grepSearch({ query: 'function add', searchPath: '.' });
  assert.ok(grep.totalMatches >= 1);

  let nested = false;
  try {
    await grepSearch({ query: '(a+)+', isRegex: true, searchPath: '.' });
  } catch (err) {
    nested = err.code === 'E_BAD_ARGS' || /ReDoS|nested/i.test(err.message);
  }
  assert.ok(nested, 'nested regex quantifiers must be rejected');

  for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(tmp, `cap${i}.txt`), 'x');
  const found = findFiles({ glob: 'cap*.txt', maxResults: 3 });
  assert.strictEqual(found.files.length, 3);
  assert.strictEqual(found.truncated, true);

  const exactDir = path.join(tmp, 'exact-cap');
  fs.mkdirSync(exactDir);
  for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(exactDir, `e${i}.txt`), 'x');
  const exact = findFiles({ glob: 'e*.txt', searchPath: 'exact-cap', maxResults: 3 });
  assert.strictEqual(exact.files.length, 3);
  assert.strictEqual(exact.truncated, false, 'hitting the cap after the last file is not truncation');

  fs.writeFileSync(path.join(tmp, 'huge.txt'), Buffer.alloc(2 * 1024 * 1024, 0x61));
  fs.writeFileSync(path.join(tmp, 'needle.txt'), 'UNIQUE_TOKEN_XYZ\n', 'utf8');
  fs.writeFileSync(path.join(tmp, 'binary.dat'), Buffer.from([0, 1, 2, 65, 66]));
  const capped = await grepSearch({ query: 'UNIQUE_TOKEN_XYZ', searchPath: '.' });
  assert.ok(capped.totalMatches >= 1);
  assert.ok(capped.skippedLarge >= 1, 'files over 1.5MB must be skipped');
  const binHit = await grepSearch({ query: 'AB', searchPath: 'binary.dat' });
  assert.ok(binHit.skippedBinary >= 1 || binHit.totalMatches === 0);

  let unifiedBlocked = false;
  try {
    await applyPatch({
      filePath: 'from-diff.js',
      patch: '--- a/from-diff.js\n+++ b/from-diff.js\n@@ -0,0 +1 @@\n+oops\n'
    });
  } catch (err) {
    unifiedBlocked = /unified diff/i.test(err.message);
  }
  assert.ok(unifiedBlocked, 'new files must refuse a unified diff body');
  assert.ok(!fs.existsSync(path.join(tmp, 'from-diff.js')));

  const created = await applyPatch({
    filePath: 'brand-new.js',
    patch: '<<<<<<< SEARCH\n=======\nmodule.exports = 1;\n>>>>>>> REPLACE'
  });
  assert.strictEqual(created.isNewFile, true);
  assert.ok(fs.readFileSync(path.join(tmp, 'brand-new.js'), 'utf8').includes('module.exports = 1;'));

  const raw = await applyPatch({ filePath: 'raw-new.js', patch: 'hello body\n' });
  assert.strictEqual(raw.isNewFile, true);
  assert.strictEqual(fs.readFileSync(path.join(tmp, 'raw-new.js'), 'utf8'), 'hello body\n');

  fs.writeFileSync(path.join(tmp, 'win.js'), 'function add(a, b) {\r\n  return a + b;\r\n}\r\n', 'utf8');
  const winRead = readFile({ filePath: 'win.js' });
  const winPatched = await applyPatch({
    filePath: 'win.js',
    expectedHash: winRead.hash,
    patch: `<<<<<<< SEARCH
  return a + b;
=======
  return Number(a) + Number(b);
>>>>>>> REPLACE`
  });
  assert.strictEqual(winPatched.success, true);
  const winAfter = fs.readFileSync(path.join(tmp, 'win.js'), 'utf8');
  assert.ok(winAfter.includes('Number(a)'));
  assert.ok(winAfter.includes('\r\n'), 'Windows files must keep CRLF');
  assert.strictEqual(winAfter.includes('\n') && !winAfter.includes('\r\n'), false);
  assert.ok(!/[^\r]\n/.test(winAfter.replace(/\r\n/g, '')), 'no leftover lone LF after stripping CRLF pairs');
  assert.strictEqual(winAfter, 'function add(a, b) {\r\n  return Number(a) + Number(b);\r\n}\r\n');

  fs.writeFileSync(path.join(tmp, 'dup.js'), 'x = 1;\nx = 1;\n', 'utf8');
  const dupRead = readFile({ filePath: 'dup.js' });
  let multi = false;
  try {
    await applyPatch({
      filePath: 'dup.js',
      expectedHash: dupRead.hash,
      patch: `<<<<<<< SEARCH
x = 1;
=======
x = 2;
>>>>>>> REPLACE`
    });
  } catch (err) {
    multi = /matched 2 times/.test(err.message);
  }
  assert.ok(multi, 'duplicate SEARCH must refuse');
  assert.strictEqual(fs.readFileSync(path.join(tmp, 'dup.js'), 'utf8'), 'x = 1;\nx = 1;\n');

  const second = await applyPatch({
    filePath: 'dup.js',
    expectedHash: dupRead.hash,
    occurrence: 2,
    patch: `<<<<<<< SEARCH
x = 1;
=======
x = 2;
>>>>>>> REPLACE`
  });
  assert.strictEqual(second.success, true);
  assert.strictEqual(fs.readFileSync(path.join(tmp, 'dup.js'), 'utf8'), 'x = 1;\nx = 2;\n');

  fs.writeFileSync(path.join(tmp, 'race.js'), 'value = 1;\n', 'utf8');
  const raceRead = readFile({ filePath: 'race.js' });
  const patchA = `<<<<<<< SEARCH\nvalue = 1;\n=======\nvalue = 2;\n>>>>>>> REPLACE`;
  const patchB = `<<<<<<< SEARCH\nvalue = 1;\n=======\nvalue = 3;\n>>>>>>> REPLACE`;
  const raced = await Promise.allSettled([
    applyPatch({ filePath: 'race.js', expectedHash: raceRead.hash, patch: patchA }),
    applyPatch({ filePath: 'race.js', expectedHash: raceRead.hash, patch: patchB })
  ]);
  const ok = raced.filter((r) => r.status === 'fulfilled' && r.value && r.value.success);
  const staleRace = raced.filter((r) => r.status === 'rejected' && /STALE_FILE/.test(r.reason && r.reason.message));
  assert.strictEqual(ok.length, 1, 'exactly one concurrent patch on the same file should win');
  assert.strictEqual(staleRace.length, 1, 'the loser must see STALE_FILE');
  const raceAfter = fs.readFileSync(path.join(tmp, 'race.js'), 'utf8');
  assert.ok(raceAfter === 'value = 2;\n' || raceAfter === 'value = 3;\n');

  const { looksLikeV4A } = require('../src/tools/patchEngine');
  const v4a = `*** Begin Patch\n*** Update File: sample.js\n@@\n-return a + b\n+return 1\n*** End Patch\n`;
  assert.ok(looksLikeV4A(v4a));
  const beforeV4a = fs.readFileSync(path.join(tmp, 'sample.js'), 'utf8');
  const v4aRead = readFile({ filePath: 'sample.js' });
  let v4aRejected = false;
  try {
    await applyPatch({ filePath: 'sample.js', expectedHash: v4aRead.hash, patch: v4a });
  } catch (err) {
    v4aRejected = err.code === 'E_BAD_ARGS' && /V4A/.test(err.message) && err.detail && /SEARCH/.test(err.detail.retryHint);
  }
  assert.ok(v4aRejected, 'V4A must be rejected with SEARCH/REPLACE retryHint');
  assert.strictEqual(fs.readFileSync(path.join(tmp, 'sample.js'), 'utf8'), beforeV4a);

  let v4aNewRejected = false;
  try {
    await applyPatch({
      filePath: 'v4a-new.js',
      patch: '*** Begin Patch\n*** Add File: v4a-new.js\n+hi\n*** End Patch\n'
    });
  } catch (err) {
    v4aNewRejected = err.code === 'E_BAD_ARGS' && /V4A/.test(err.message);
  }
  assert.ok(v4aNewRejected, 'V4A must not create a new file');
  assert.ok(!fs.existsSync(path.join(tmp, 'v4a-new.js')));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('patchEngine tests passed');
}

main().catch((err) => {
  console.error(err);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
});
