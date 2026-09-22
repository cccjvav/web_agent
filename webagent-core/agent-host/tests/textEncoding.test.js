// F62: the read hash must be a faithful token for the bytes on disk.
// Baseline (2f6e7ab) decoded with Buffer#toString('utf8'), so illegal bytes collapsed into
// U+FFFD: two different files produced the same hash and a stale write was accepted.
// Fixtures write only to a self-created temporary workspace.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-encoding-'));
process.env.WORKSPACE_ROOT = tmp;
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const { readBoundedText, decodeStrictUtf8, EncodingError } = require('../src/utils/boundedFile');
const { computeHash } = require('../src/tools/patchEngine');
const { classifyToolError } = require('../src/mcp/errors');
const fileOps = require('../src/tools/fileOps');
const { callTool } = require('../src/tools');

function write(rel, bytes) {
  const full = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8'));
  return full;
}

async function run() {
  // --- Valid UTF-8 keeps working exactly as before. ---
  write('plain.txt', 'hello\n');
  write('cjk.txt', '中文内容\nsecond 行\n');
  write('emoji.txt', 'a 🚀 b\n');
  write('crlf.txt', 'one\r\ntwo\r\n');
  write('bom.txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('after bom\n', 'utf8')]));
  assert.strictEqual(readBoundedText(path.join(tmp, 'plain.txt')), 'hello\n');
  assert.strictEqual(readBoundedText(path.join(tmp, 'cjk.txt')), '中文内容\nsecond 行\n');
  assert.strictEqual(readBoundedText(path.join(tmp, 'emoji.txt')), 'a 🚀 b\n');
  assert.strictEqual(readBoundedText(path.join(tmp, 'crlf.txt')), 'one\r\ntwo\r\n');
  // A BOM must be RETAINED, not swallowed. The whole point of strict decoding is that the decoded
  // string re-encodes to the exact bytes on disk, so its hash identifies those bytes. An earlier
  // version of this file used ignoreBOM:false plus an endsWith() assertion that passed either way;
  // a plain read->patch->write cycle then silently deleted the BOM from the user's file. The
  // parallel audit on branch 01a0c932 caught it. Assert the round trip, not merely readability.
  const bomBytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('after bom\n', 'utf8')]);
  const bomText = readBoundedText(path.join(tmp, 'bom.txt'));
  assert.strictEqual(bomText, '\uFEFFafter bom\n', 'the BOM is kept as U+FEFF, not stripped');
  assert.ok(Buffer.from(bomText, 'utf8').equals(bomBytes), 'decoded text must re-encode to the original bytes');

  // Keeping the BOM for text reads and feeding JSON.parse are in direct conflict: JSON.parse
  // rejects a leading U+FEFF outright. Windows editors (Notepad, PowerShell Out-File) write config
  // files with a BOM, so after the round-trip fix above, a BOM'd config was reported to the user as
  // corrupt -- Windows CI went red on all three Node versions while Linux stayed green, because
  // Linux fixtures happen not to carry a BOM. readBoundedJsonText is the explicit JSON-side strip.
  {
    const { readBoundedJsonText, stripBom } = require('../src/utils/boundedFile');
    const rel = 'bom-config.json';
    const payload = { instructions: 'keep me', nested: { n: 1 } };
    write(rel, Buffer.from('\uFEFF' + JSON.stringify(payload), 'utf8'));
    const full = path.join(tmp, rel);

    // The text read still keeps the BOM, so hashes stay faithful to the bytes on disk.
    assert.strictEqual(readBoundedText(full).charCodeAt(0), 0xfeff, 'text reads still keep the BOM');

    // The JSON read strips it, so a BOM'd config is not reported as corrupt.
    assert.deepStrictEqual(JSON.parse(readBoundedJsonText(full)), payload);

    // Only ONE leading BOM is removed: a second U+FEFF is real content, and silently dropping it
    // would repeat the very bug this file exists to prevent.
    assert.strictEqual(stripBom('\uFEFF\uFEFFx'), '\uFEFFx');
    assert.strictEqual(stripBom('no bom'), 'no bom');
    assert.strictEqual(stripBom('x\uFEFFy'), 'x\uFEFFy', 'a BOM that is not leading is content');
  }

  // End to end: an ordinary read -> patch -> write cycle must leave the BOM bytes on disk.
  // This is the failure the unit assertion above would not have caught on its own.
  {
    const rel = 'bom-roundtrip.txt';
    const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('line one\nline two\n', 'utf8')]);
    write(rel, original);
    const read = await callTool('read_files', { filePath: rel, limit: 50 }, 'code');
    const patched = await callTool('apply_patch', {
      filePath: rel,
      patch: '<<<<<<< SEARCH\nline two\n=======\nline TWO\n>>>>>>> REPLACE',
      expectedHash: read.hash
    }, 'code');
    assert.strictEqual(patched.success, true, 'patching a BOM file still works');
    const after = fs.readFileSync(path.join(tmp, rel));
    assert.ok(
      after.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
      'a patch must not silently delete the BOM from the user file'
    );
    assert.strictEqual(after.toString('utf8'), '\uFEFFline one\nline TWO\n');
  }

  // --- A multi-byte sequence split across the internal 64KiB chunk boundary must survive. ---
  const filler = 'x'.repeat(65535);
  write('boundary.txt', filler + '中' + 'y'.repeat(10));
  const boundary = readBoundedText(path.join(tmp, 'boundary.txt'));
  assert.ok(boundary.includes('中'), 'code points split across read chunks must decode intact');
  assert.strictEqual(boundary.length, 65535 + 1 + 10);

  // --- F62-05: invalid UTF-8 is rejected, not silently repaired. ---
  write('invalid.txt', Buffer.from([65, 0xff, 10]));
  let encodingError = null;
  try {
    readBoundedText(path.join(tmp, 'invalid.txt'));
  } catch (err) {
    encodingError = err;
  }
  assert.ok(encodingError instanceof EncodingError, 'illegal bytes must raise EncodingError');
  assert.strictEqual(encodingError.code, 'E_ENCODING');
  assert.strictEqual(classifyToolError(encodingError).code, 'E_ENCODING', 'tool layer must surface E_ENCODING');

  // Lone surrogate halves and truncated sequences are rejected too.
  for (const bytes of [[0xed, 0xa0, 0x80], [0xe4, 0xb8], [0xc0, 0x80], [0xf5, 0x80, 0x80, 0x80]]) {
    assert.throws(() => decodeStrictUtf8(Buffer.from(bytes), 'fixture'), /E_ENCODING/,
      'rejected byte sequence: ' + JSON.stringify(bytes));
  }

  // --- Two different illegal byte sequences must no longer share a hash. ---
  const target = write('encoding.txt', Buffer.from([65, 0xff, 10]));
  assert.throws(() => fileOps.readFile({ filePath: 'encoding.txt' }), /E_ENCODING/,
    'read_files must refuse to hand out a hash it cannot back with real bytes');
  fs.writeFileSync(target, Buffer.from([65, 0xfe, 10]));
  assert.throws(() => fileOps.readFile({ filePath: 'encoding.txt' }), /E_ENCODING/);

  // A hash taken from a valid file still guards a later write, and a raw-byte change is seen.
  write('guard.txt', 'before\n');
  const first = fileOps.readFile({ filePath: 'guard.txt' });
  assert.strictEqual(first.hash, computeHash('before\n'));
  fs.writeFileSync(path.join(tmp, 'guard.txt'), 'changed\n');
  const second = fileOps.readFile({ filePath: 'guard.txt' });
  assert.notStrictEqual(first.hash, second.hash, 'different bytes must produce different hashes');
  await assert.rejects(
    fileOps.writeFile({ filePath: 'guard.txt', content: 'edited\n', expectedHash: first.hash, confirm_overwrite: true }),
    /STALE_FILE/,
    'a stale hash must not be accepted'
  );
  assert.strictEqual(fs.readFileSync(path.join(tmp, 'guard.txt'), 'utf8'), 'changed\n', 'rejected write must not touch disk');
  const fresh = await fileOps.writeFile({ filePath: 'guard.txt', content: 'edited\n', expectedHash: second.hash, confirm_overwrite: true });
  assert.strictEqual(fresh.success, true, 'a current hash must still be accepted');

  // --- Writing over an illegal-UTF-8 file fails closed rather than re-encoding it. ---
  write('overwrite.txt', Buffer.from([65, 0xff, 10]));
  await assert.rejects(
    fileOps.writeFile({ filePath: 'overwrite.txt', content: 'replacement\n', confirm_overwrite: true }),
    /E_ENCODING/,
    'overwriting a non-UTF-8 file must not silently transcode it'
  );
  assert.deepStrictEqual(
    [...fs.readFileSync(path.join(tmp, 'overwrite.txt'))],
    [65, 0xff, 10],
    'the rejected overwrite must leave the original bytes intact'
  );

  // apply_patch on an illegal file is refused before any write.
  write('patchme.txt', Buffer.from([65, 0xff, 10]));
  const patched = await callTool('apply_patch', {
    filePath: 'patchme.txt',
    patch: '<<<<<<< SEARCH\nA\n=======\nB\n>>>>>>> REPLACE'
  }, 'code').then(() => null, (err) => err);
  assert.ok(patched && /E_ENCODING/.test(String(patched.message)), 'apply_patch must refuse non-UTF-8 targets');
  assert.deepStrictEqual([...fs.readFileSync(path.join(tmp, 'patchme.txt'))], [65, 0xff, 10]);

  // --- Search still scans mixed-encoding files instead of aborting the whole scan. ---
  const scanDir = path.join(tmp, 'scan');
  fs.mkdirSync(scanDir, { recursive: true });
  write('scan/ok.txt', 'needle in clean text\n');
  write('scan/mixed.txt', Buffer.concat([Buffer.from('needle here '), Buffer.from([0xff]), Buffer.from('\n')]));
  const scan = fileOps.scanSearch({ query: 'needle', searchPath: 'scan' });
  assert.ok(scan.totalMatches >= 1, 'a clean file in the same directory must still match');
  assert.ok(scan.matches.some((m) => m.file.endsWith('ok.txt')));

  console.log('textEncoding.test.js ok');
}

run()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => fs.rmSync(tmp, { recursive: true, force: true }));
