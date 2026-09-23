// F62: bounded bytes are not bounded CPU, and a damaged statistics store must not be overwritten.
// Baseline (2f6e7ab): createUnifiedDiff ran two unbudgeted synchronous passes (an 8000-line
// change blocked the host past a 2s watchdog), and admin-host treated a corrupt reports.json as
// an empty array, so the next report destroyed the original bytes.
// Everything below runs in self-created temporary directories.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-diffbudget-'));
process.env.WORKSPACE_ROOT = tmp;
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const { createUnifiedDiff, DIFF_TIMEOUT_MS, DIFF_MAX_EDIT_LENGTH, DIFF_MAX_INPUT_BYTES } = require('../src/utils/diff');
const { callTool } = require('../src/tools');
const admin = require('../../admin-host/app');

async function run() {
  // --- Ordinary diffs keep their existing shape and counts. ---
  assert.strictEqual(createUnifiedDiff('a', 'x\n', 'x\n\n').additions, 1);
  assert.strictEqual(createUnifiedDiff('a', '\n\n', '').deletions, 2);
  const small = createUnifiedDiff('s.txt', 'a\nb\nc\n', 'a\nB\nc\n');
  assert.strictEqual(small.additions, 1);
  assert.strictEqual(small.deletions, 1);
  assert.ok(small.patch.includes('--- a/s.txt'), 'patch header keeps the a/ prefix');
  assert.ok(small.patch.includes('+++ b/s.txt'), 'patch header keeps the b/ prefix');
  assert.ok(small.patch.includes('@@'), 'patch still contains hunk headers');
  assert.ok(small.patch.includes('-b'), 'removed line is rendered');
  assert.ok(small.patch.includes('+B'), 'added line is rendered');
  // Identical inputs produce an empty change set, not a budget error.
  const same = createUnifiedDiff('s.txt', 'a\nb\n', 'a\nb\n');
  assert.strictEqual(same.additions, 0);
  assert.strictEqual(same.deletions, 0);

  // --- F62-06: the budget exists and is enforced rather than blocking indefinitely. ---
  assert.ok(Number.isFinite(DIFF_TIMEOUT_MS) && DIFF_TIMEOUT_MS > 0, 'a wall-clock budget must be declared');
  assert.ok(Number.isFinite(DIFF_MAX_EDIT_LENGTH) && DIFF_MAX_EDIT_LENGTH > 0, 'an edit budget must be declared');
  const left = Array.from({ length: 8000 }, (_, i) => 'before-' + i).join('\n');
  const right = Array.from({ length: 8000 }, (_, i) => 'after-' + i).join('\n');
  const started = Date.now();
  let budgetError = null;
  try {
    createUnifiedDiff('huge.txt', left, right);
  } catch (err) {
    budgetError = err;
  }
  const elapsed = Date.now() - started;
  assert.ok(budgetError, 'an over-budget diff must be rejected, not silently rendered');
  assert.strictEqual(budgetError.code, 'E_DIFF_BUDGET');
  assert.ok(
    elapsed < DIFF_TIMEOUT_MS * 3,
    `rejection must happen near the declared budget; took ${elapsed}ms for a ${DIFF_TIMEOUT_MS}ms budget`
  );
  assert.ok(!/before-|after-/.test(budgetError.message), 'the error must not echo file content');

  // --- Input and output ceilings, adopted from branch 01a0c932. ---
  // The time/edit budget bounds one run; these bound what may enter and leave it at all. A
  // 1MiB+ input should never reach the super-linear algorithm, and a diff that fits the edit
  // budget can still render into something too large to ship to a browser or a model.
  assert.throws(
    () => createUnifiedDiff('big.txt', 'a'.repeat(DIFF_MAX_INPUT_BYTES + 1), 'b'),
    (err) => err.code === 'E_DIFF_BUDGET',
    'an oversized input must be refused before the algorithm runs'
  );
  assert.throws(
    () => createUnifiedDiff('wide.txt', 'a'.repeat(150000), 'b'.repeat(150000)),
    (err) => err.code === 'E_DIFF_BUDGET',
    'a patch that renders past the output ceiling must be refused'
  );

  // --- The rendered patch must actually reconstruct the target. ---
  // A diff that reports plausible counts but does not apply cleanly would be worse than no diff.
  {
    const beforeText = 'a\nb\nc\n';
    const afterText = 'a\nB\nc\nd\n';
    const round = createUnifiedDiff('round.txt', beforeText, afterText);
    assert.strictEqual(require('diff').applyPatch(beforeText, round.patch), afterText,
      'the rendered patch must apply back to the new content');
  }

  // --- An over-budget NEW file must not even create its parent directory. ---
  {
    const huge = Array.from({ length: 8000 }, (_, i) => 'line-' + i).join('\n');
    const created = await callTool(
      'apply_patch',
      { filePath: 'new-folder/new.txt', patch: huge },
      'code'
    ).then((ok) => ({ ok }), (err) => ({ err }));
    if (created.err) {
      assert.ok(
        !fs.existsSync(path.join(tmp, 'new-folder')),
        'a rejected creation must not leave its parent directory behind'
      );
    }
  }

  // --- A rejected patch on an EXISTING file must leave the file byte-identical. ---
  // (Creating a file diffs against '', which is linear and always inside budget; the
  // expensive shape is replacing existing content.)
  const victim = path.join(tmp, 'existing.txt');
  fs.writeFileSync(victim, left);
  const before = fs.readFileSync(victim);
  const read = await callTool('read_files', { filePath: 'existing.txt', limit: 1 }, 'code');
  // Replace the whole body with a SEARCH/REPLACE block: since F70 apply_patch refuses an
  // unmarked body on an existing file before any diff is computed, and this test is about the
  // diff budget, not the format gate.
  const wholeBody = `<<<<<<< SEARCH\n${left}\n=======\n${right}\n>>>>>>> REPLACE`;
  const rejected = await callTool(
    'apply_patch',
    { filePath: 'existing.txt', patch: wholeBody, expectedHash: read.hash },
    'code'
  ).then((ok) => ({ ok }), (err) => ({ err }));
  assert.ok(rejected.err, 'a patch whose diff cannot be rendered must fail');
  assert.strictEqual(rejected.err.code, 'E_DIFF_BUDGET');
  assert.ok(
    fs.readFileSync(victim).equals(before),
    'a rejected patch must leave the original file byte-identical'
  );
  // dryRun on the same pair is rejected the same way, and also writes nothing.
  const dry = await callTool(
    'apply_patch',
    { filePath: 'existing.txt', patch: wholeBody, expectedHash: read.hash, dryRun: true },
    'code'
  ).then((ok) => ({ ok }), (err) => ({ err }));
  assert.strictEqual(dry.err && dry.err.code, 'E_DIFF_BUDGET', 'dryRun must apply the same budget');
  assert.ok(fs.readFileSync(victim).equals(before), 'dryRun never writes');

  // A small patch on the same file still succeeds afterwards.
  fs.writeFileSync(victim, 'alpha\nbeta\n');
  const reread = await callTool('read_files', { filePath: 'existing.txt', limit: 10 }, 'code');
  const okPatch = await callTool('apply_patch', {
    filePath: 'existing.txt',
    patch: '<<<<<<< SEARCH\nbeta\n=======\nBETA\n>>>>>>> REPLACE',
    expectedHash: reread.hash
  }, 'code');
  assert.strictEqual(okPatch.success, true, 'ordinary patches still apply after a rejected one');
  assert.strictEqual(fs.readFileSync(victim, 'utf8'), 'alpha\nBETA\n');

  // A normal new file still works and still reports its diff summary.
  const created = await callTool('apply_patch', { filePath: 'ok.txt', patch: 'line one\nline two\n' }, 'code');
  assert.strictEqual(created.success, true);
  assert.strictEqual(created.isNewFile, true);
  assert.strictEqual(fs.readFileSync(path.join(tmp, 'ok.txt'), 'utf8'), 'line one\nline two\n');
  assert.ok(/^\+2 /.test(created.diffSummary), 'new file summary still counts added lines');

  // --- F62-07: a damaged statistics store fails closed and keeps its original bytes. ---
  const dataDir = path.join(tmp, 'admin');
  fs.mkdirSync(dataDir, { recursive: true });
  const store = path.join(dataDir, 'reports.json');

  // Missing file is still an empty store, and a first report creates it.
  assert.deepStrictEqual(admin.loadReports(dataDir), []);
  admin.ingest(dataDir, { installId: 'first', day: '2026-04-01', toolCalls: 3 });
  assert.strictEqual(admin.loadReports(dataDir).length, 1);

  for (const [label, bytes] of [
    ['truncated JSON', '{broken'],
    ['JSON object instead of array', '{"installId":"x"}'],
    ['JSON scalar', '42'],
    ['binary noise', Buffer.from([0x00, 0x01, 0xff])]
  ]) {
    fs.writeFileSync(store, bytes);
    const before = fs.readFileSync(store);
    assert.throws(() => admin.loadReports(dataDir), /E_STORE_CORRUPT/, `${label}: read must fail closed`);
    assert.throws(
      () => admin.ingest(dataDir, { installId: 'later', day: '2026-04-01', toolCalls: 1 }),
      /E_STORE_CORRUPT/,
      `${label}: ingest must refuse to overwrite a damaged store`
    );
    assert.ok(
      fs.readFileSync(store).equals(before),
      `${label}: the damaged bytes must be preserved exactly`
    );
  }

  // An empty (zero-byte) file is a legitimately empty store, not damage.
  fs.writeFileSync(store, '');
  assert.deepStrictEqual(admin.loadReports(dataDir), []);
  const recovered = admin.ingest(dataDir, { installId: 'after-empty', day: '2026-04-01', toolCalls: 2 });
  assert.strictEqual(recovered.installId, 'after-empty');
  assert.strictEqual(admin.loadReports(dataDir).length, 1);

  // Publication is atomic: no temporary file is left behind.
  const leftovers = fs.readdirSync(dataDir).filter((name) => name.includes('reports.json.tmp'));
  assert.deepStrictEqual(leftovers, [], 'atomic publish must not leave temporary files');

  console.log('diffBudget.test.js ok');
}

run()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => fs.rmSync(tmp, { recursive: true, force: true }));
