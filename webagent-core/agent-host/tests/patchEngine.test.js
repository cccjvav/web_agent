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

async function main() {
  await missingTargetSafety();
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

  await unmarkedBodyNeverReplacesExistingFile();
  await searchReplaceDividerIsLineBased();

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('patchEngine tests passed');
}

// F70 (external review P1-1): an existing file is only ever PATCHED. A body with no
// SEARCH/REPLACE block and no unified diff used to replace the whole file — and because the
// host silently reuses the path's last read hash, one call with a forgotten marker turned a
// 3-line file into a 1-line fragment and reported success (+1 -3). Whole-file replacement
// is write_file's explicit contract; apply_patch must refuse with zero side effects.
async function unmarkedBodyNeverReplacesExistingFile() {
  const bus = require('../src/utils/eventBus');
  const { recalledHash } = require('../src/tools/readCache');
  const events = []; const observe = event => events.push(event);
  bus.on('file_patched', observe);
  try {
    const original = 'line1\nline2\nline3\n';
    fs.writeFileSync(path.join(tmp, 'unmarked.txt'), original);
    const { hash } = readFile({ filePath: 'unmarked.txt' });
    const attempts = [
      { patch: 'line2 changed\n' },                                   // recalled hash only
      { patch: 'line2 changed\n', expectedHash: hash },               // explicit hash
      { patch: 'line2 changed\n', expectedHash: hash, dryRun: true }, // a dry run must not "pass"
      { patch: '', expectedHash: hash }                               // empty body would wipe the file
    ];
    for (const input of attempts) {
      await assert.rejects(applyPatch({ filePath: 'unmarked.txt', ...input }), error => {
        assert.strictEqual(error.code, 'E_BAD_ARGS', JSON.stringify(input));
        assert.ok(/neither SEARCH\/REPLACE/.test(error.message), error.message);
        assert.ok(/write_file/.test(error.detail.retryHint), 'the refusal must name the explicit whole-file tool');
        return true;
      });
      assert.strictEqual(fs.readFileSync(path.join(tmp, 'unmarked.txt'), 'utf8'), original, 'file bytes unchanged');
    }
    assert.strictEqual(recalledHash('unmarked.txt'), hash, 'a refused patch must not publish a new hash');
    assert.strictEqual(events.length, 0, 'a refused patch must not broadcast file_patched');
    // The format refusal comes before the hash gate: retrying the same body with a fresh hash
    // can never succeed, so the model must learn the real problem first.
    await assert.rejects(applyPatch({ filePath: 'unmarked.txt', patch: 'x', expectedHash: '0'.repeat(64) }),
      error => error.code === 'E_BAD_ARGS');
    // Creation keeps its documented full-body contract.
    const created = await applyPatch({ filePath: 'unmarked-new.txt', patch: 'fresh body\n' });
    assert.strictEqual(created.isNewFile, true);
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'unmarked-new.txt'), 'utf8'), 'fresh body\n');
  } finally { bus.off('file_patched', observe); }
}

// F70: SEARCH/REPLACE markers are whole lines. The old regex made the newline before the
// divider optional, so ANY run of 5+ '=' ended the SEARCH text — a `# ==========` banner or a
// Markdown setext underline silently corrupted the file while reporting success, and an empty
// REPLACE (deleting lines) could not be expressed at all.
async function searchReplaceDividerIsLineBased() {
  const patchWith = async (file, content, patch) => {
    fs.writeFileSync(path.join(tmp, file), content);
    const { hash } = readFile({ filePath: file });
    return applyPatch({ filePath: file, patch, expectedHash: hash });
  };
  const read = file => fs.readFileSync(path.join(tmp, file), 'utf8');

  await patchWith('banner.py', 'x = 1\n# ==========\ndef f():\n    return 1\n',
    '<<<<<<< SEARCH\n# ==========\ndef f():\n    return 1\n=======\n# ==========\ndef f():\n    return 2\n>>>>>>> REPLACE');
  assert.strictEqual(read('banner.py'), 'x = 1\n# ==========\ndef f():\n    return 2\n', 'a banner line is content, not the divider');

  // A setext underline shorter than the 7-character markers is content; the divider is the
  // line whose length matches the opening marker.
  await patchWith('setext.md', 'Title\n=====\nold para\n',
    '<<<<<<< SEARCH\nTitle\n=====\nold para\n=======\nTitle\n=====\nnew para\n>>>>>>> REPLACE');
  assert.strictEqual(read('setext.md'), 'Title\n=====\nnew para\n');

  // An empty REPLACE deletes whole lines cleanly instead of leaving a blank line behind.
  await patchWith('delete.txt', 'keep\ndrop me\nand me\nkeep2\n', '<<<<<<< SEARCH\ndrop me\nand me\n=======\n>>>>>>> REPLACE');
  assert.strictEqual(read('delete.txt'), 'keep\nkeep2\n');
  await patchWith('delete-crlf.txt', 'keep\r\ndrop me\r\nkeep2\r\n', '<<<<<<< SEARCH\r\ndrop me\r\n=======\r\n>>>>>>> REPLACE');
  assert.strictEqual(read('delete-crlf.txt'), 'keep\r\nkeep2\r\n', 'CRLF files keep CRLF after a line deletion');
  // A mid-line match with an empty REPLACE only removes the matched text.
  await patchWith('inline.txt', 'a = b + c;\n', '<<<<<<< SEARCH\n + c\n=======\n>>>>>>> REPLACE');
  assert.strictEqual(read('inline.txt'), 'a = b;\n');

  // Git conflict markers inside SEARCH make the divider genuinely ambiguous: refuse with zero
  // writes instead of guessing (the old parser picked the first '=======' and corrupted the file).
  const conflict = 'start\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\nend\n';
  fs.writeFileSync(path.join(tmp, 'conflict.txt'), conflict);
  const { hash } = readFile({ filePath: 'conflict.txt' });
  await assert.rejects(applyPatch({
    filePath: 'conflict.txt', expectedHash: hash,
    patch: '<<<<<<< SEARCH\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\n=======\nresolved\n>>>>>>> REPLACE'
  }), error => {
    assert.strictEqual(error.code, 'E_BAD_ARGS');
    assert.ok(/ambiguous/i.test(error.message), error.message);
    assert.ok(/unified diff/i.test(error.detail.retryHint));
    return true;
  });
  assert.strictEqual(read('conflict.txt'), conflict, 'an ambiguous block writes nothing');
  // The same edit as a unified diff is unambiguous and applies.
  const resolved = await applyPatch({
    filePath: 'conflict.txt', expectedHash: hash,
    patch: '--- a/conflict.txt\n+++ b/conflict.txt\n@@ -1,7 +1,3 @@\n start\n-<<<<<<< HEAD\n-ours\n-=======\n-theirs\n->>>>>>> feature\n+resolved\n end\n'
  });
  assert.strictEqual(resolved.success, true);
  assert.strictEqual(read('conflict.txt'), 'start\nresolved\nend\n');

  // Marker lines that do not form a complete block are still refused.
  for (const bad of ['<<<<<<< SEARCH\nold\n=======\nnew\n', '<<<<<<< SEARCH\nold\nnew\n>>>>>>> REPLACE', 'old\n=======\nnew\n>>>>>>> REPLACE',
    '<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n=======\n']) {
    fs.writeFileSync(path.join(tmp, 'malformed.txt'), 'old\n');
    const current = readFile({ filePath: 'malformed.txt' });
    await assert.rejects(applyPatch({ filePath: 'malformed.txt', patch: bad, expectedHash: current.hash }),
      error => error.code === 'E_BAD_ARGS' && /malformed/i.test(error.message), bad);
    assert.strictEqual(read('malformed.txt'), 'old\n');
  }

  // A NEW file body without any marker may contain '=' lines (a setext heading) as content.
  const md = await applyPatch({ filePath: 'new-heading.md', patch: 'Heading\n=======\n\ntext\n' });
  assert.strictEqual(md.isNewFile, true);
  assert.strictEqual(read('new-heading.md'), 'Heading\n=======\n\ntext\n');
}

main().catch((err) => {
  console.error(err);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
});
