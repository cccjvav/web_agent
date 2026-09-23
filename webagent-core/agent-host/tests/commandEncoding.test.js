// F62 batch 4: command output must survive pipe chunk boundaries.
// Baseline (c1e76bf): executor.js decoded every stdout/stderr chunk independently with
// data.toString(). Pipe boundaries fall wherever the OS puts them, not on character boundaries,
// so any multi-byte character straddling two chunks became replacement characters. A program
// printing "项目已完成" one byte at a time came back as 15 U+FFFD -- the model then reasoned
// about, and could act on, corrupted command output.
// Everything below runs in a self-created temporary workspace; no network, no user data.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-cmdenc-'));
process.env.WORKSPACE_ROOT = tmp;
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const { callTool } = require('../src/tools');

// A helper program that writes `text` one byte at a time with a gap between writes, forcing the
// parent to observe chunk boundaries in the middle of multi-byte characters. This is not an
// artificial case: interactive tools, progress bars and PTY-backed programs flush like this.
function dribbleScript(text, stream) {
  return `
const b = Buffer.from(${JSON.stringify(text)}, 'utf8');
let i = 0;
const tick = () => {
  if (i >= b.length) return process.exit(0);
  process.${stream}.write(b.slice(i, i + 1));
  i += 1;
  setTimeout(tick, 2);
};
tick();
`;
}

async function run() {
  // --- Multi-byte output split across chunks must be reassembled, not mangled. ---
  const phrase = '项目已完成，用时 3 秒 ✅';
  fs.writeFileSync(path.join(tmp, 'dribble.js'), dribbleScript(phrase, 'stdout'));
  const out = await callTool('run_command', { command: 'node dribble.js', timeoutSec: 30 }, 'code');
  assert.strictEqual(out.stdout, phrase, 'stdout split mid-character must decode to the original text');
  assert.strictEqual((out.stdout.match(/\uFFFD/g) || []).length, 0, 'no replacement characters');

  // stderr has its own byte stream and must not share partial state with stdout.
  const errPhrase = '错误：磁盘已满 ⚠';
  fs.writeFileSync(path.join(tmp, 'dribble-err.js'), dribbleScript(errPhrase, 'stderr'));
  const err = await callTool('run_command', { command: 'node dribble-err.js', timeoutSec: 30 }, 'code');
  assert.strictEqual(err.stderr, errPhrase, 'stderr split mid-character must decode to the original text');

  // Both streams interleaved in one run keep their own decoders.
  fs.writeFileSync(path.join(tmp, 'both.js'), `
const o = Buffer.from('输出', 'utf8');
const e = Buffer.from('报错', 'utf8');
let i = 0;
const tick = () => {
  if (i >= Math.max(o.length, e.length)) return process.exit(0);
  if (i < o.length) process.stdout.write(o.slice(i, i + 1));
  if (i < e.length) process.stderr.write(e.slice(i, i + 1));
  i += 1;
  setTimeout(tick, 2);
};
tick();
`);
  const both = await callTool('run_command', { command: 'node both.js', timeoutSec: 30 }, 'code');
  assert.strictEqual(both.stdout, '输出', 'interleaved stdout must not absorb stderr bytes');
  assert.strictEqual(both.stderr, '报错', 'interleaved stderr must not absorb stdout bytes');

  // --- A genuinely invalid trailing byte must surface, not vanish silently. ---
  fs.writeFileSync(path.join(tmp, 'truncated.js'), `
process.stdout.write(Buffer.from([0xe4, 0xb8])); // first two bytes of a 3-byte character
process.exit(0);
`);
  const truncated = await callTool('run_command', { command: 'node truncated.js', timeoutSec: 30 }, 'code');
  assert.ok(
    truncated.stdout.includes('\uFFFD'),
    'an incomplete final character must be flushed as a replacement char, not dropped'
  );

  // --- Ordinary ASCII output and exit codes are unchanged. ---
  // Driven through Node scripts rather than shell builtins: `printf`, `>&2` and `;` are POSIX
  // shell syntax that Windows cmd.exe does not provide, and this suite must assert decoding
  // behaviour on every platform rather than silently only on Linux.
  fs.writeFileSync(path.join(tmp, 'ascii.js'), "process.stdout.write('hello world');\n");
  const ascii = await callTool('run_command', { command: 'node ascii.js', timeoutSec: 30 }, 'code');
  assert.strictEqual(ascii.stdout, 'hello world');
  assert.strictEqual(ascii.exitCode, 0);
  assert.strictEqual(ascii.status, 'done');

  fs.writeFileSync(path.join(tmp, 'failing.js'), "process.stderr.write('出错了');\nprocess.exit(3);\n");
  const failing = await callTool('run_command', { command: 'node failing.js', timeoutSec: 30 }, 'code');
  assert.strictEqual(failing.exitCode, 3);
  assert.strictEqual(failing.status, 'error');
  assert.strictEqual(failing.stderr, '出错了', 'non-zero exits still report intact stderr');

  // --- Bulk multi-byte output stays intact through the capture buffer and the tail window. ---
  // get_command_output returns the LAST `tail` characters (default 8000), so the assertion is
  // about the returned window being clean CJK, not about receiving all 20000 characters.
  // A script file rather than `node -e "...'...'..."`: nested quoting is parsed differently by
  // cmd.exe and by POSIX shells, and the point here is the decoder, not shell quoting.
  fs.writeFileSync(path.join(tmp, 'bulk.js'), "process.stdout.write('中'.repeat(20000));\n");
  const bulk = await callTool(
    'run_command',
    { command: 'node bulk.js', timeoutSec: 30 },
    'code'
  );
  assert.strictEqual(bulk.stdout.length, 8000, 'the default tail window is 8000 characters');
  assert.strictEqual((bulk.stdout.match(/\uFFFD/g) || []).length, 0, 'bulk output has no replacement chars');
  assert.strictEqual(bulk.stdout, '中'.repeat(8000), 'the tail window is clean, whole characters');
  // Truncation must cut on character boundaries, never leave half a character at the edge.
  const windowed = await callTool('get_command_output', { execId: bulk.execId, tail: 501 }, 'code');
  assert.strictEqual(windowed.stdout, '中'.repeat(501), 'an odd tail size still yields whole characters');

  // --- The same guarantee must hold for the streaming (start_command) path. ---
  fs.writeFileSync(path.join(tmp, 'dribble2.js'), dribbleScript('后台任务完成', 'stdout'));
  const started = await callTool('start_command', { command: 'node dribble2.js', timeoutSec: 30 }, 'code');
  assert.strictEqual(started.status, 'running');
  let polled = null;
  for (let i = 0; i < 100; i += 1) {
    polled = await callTool('get_command_output', { execId: started.execId }, 'code');
    if (polled.status !== 'running') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.strictEqual(polled.status, 'done', 'the background command must finish');
  assert.strictEqual(polled.stdout, '后台任务完成', 'streamed output must also decode across chunks');

  // --- F70 (external review §5.4-7): tails never split a surrogate pair. ---
  // Tail windows count UTF-16 units, so an odd window over astral characters (emoji, CJK
  // Extension B) used to start on a low surrogate: a lone U+DC00–U+DFFF that is not valid
  // Unicode. Checked on the shared helper and end to end through the tail window.
  const { sliceTextTail } = require('../../extension/ptyPolicy');
  assert.strictEqual(sliceTextTail('😀😀😀', 1), '', 'half of an emoji is dropped, never returned alone');
  assert.strictEqual(sliceTextTail('😀😀😀', 3), '😀', 'an odd window keeps whole characters only');
  assert.strictEqual(sliceTextTail('a😀', 2), '😀');
  assert.strictEqual(sliceTextTail('abc', 10), 'abc');
  assert.strictEqual(sliceTextTail(null, 5), '');
  assert.strictEqual(sliceTextTail('abc', 0), '');
  fs.writeFileSync(path.join(tmp, 'emoji.js'), "process.stdout.write('😀'.repeat(3000));\n");
  const emoji = await callTool('run_command', { command: 'node emoji.js', timeoutSec: 30 }, 'code');
  const emojiTail = await callTool('get_command_output', { execId: emoji.execId, tail: 501 }, 'code');
  assert.ok(!/[\uD800-\uDFFF]/.test(emojiTail.stdout.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')),
    'the tail window must not contain a lone surrogate');
  assert.strictEqual(emojiTail.stdout, '😀'.repeat(250));

  await windowsExitCodeContract();

  console.log('commandEncoding.test.js ok');
}

// F70 (external review §5.4-1): the Windows trailer must keep all three cases of its contract.
// The F62 trailer `if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }` fixed case 1 but broke
// case 2: a failing cmdlet never sets $LASTEXITCODE, so the trailer was the last statement and
// the run exited 0 — the host reported `Get-Item missing.txt` as a success. PowerShell-only
// syntax, so this runs on the Windows CI matrix; Linux has no powershell.exe executor path.
async function windowsExitCodeContract() {
  if (process.platform !== 'win32') return;
  fs.writeFileSync(path.join(tmp, 'ok.js'), 'process.exit(0);\n');
  fs.writeFileSync(path.join(tmp, 'three.js'), 'process.exit(3);\n');
  const cases = [
    // [command, expected exit code or 'nonzero', why]
    ['Get-Item (Join-Path $PWD "definitely-missing.txt")', 'nonzero', 'a failing cmdlet alone must fail'],
    ['node ok.js; Get-Item (Join-Path $PWD "definitely-missing.txt")', 'nonzero', 'a failing cmdlet after a passing native program must fail'],
    ['Get-Item (Join-Path $PWD "definitely-missing.txt"); node ok.js', 0, 'the last command decides when it is a passing native program'],
    ['node three.js', 3, 'a native exit code survives unchanged'],
    ['node three.js; node ok.js', 0, 'the most recent native code wins'],
    ['node ok.js; node three.js', 3, 'a failing native program at the end fails with its own code'],
    ['Write-Output hello', 0, 'a passing cmdlet exits 0'],
    ['node ok.js', 0, 'a passing native program exits 0']
  ];
  for (const [command, expected, why] of cases) {
    const result = await callTool('run_command', { command, timeoutSec: 60 }, 'code');
    if (expected === 'nonzero') {
      assert.notStrictEqual(result.exitCode, 0, `${why}: ${command}`);
      assert.strictEqual(result.status, 'error', `${why}: ${command}`);
      assert.strictEqual(result.ok, false, `${why}: ${command}`);
    } else {
      assert.strictEqual(result.exitCode, expected, `${why}: ${command} (stderr: ${result.stderr})`);
      assert.strictEqual(result.status, expected === 0 ? 'done' : 'error', `${why}: ${command}`);
    }
  }
}

run()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => fs.rmSync(tmp, { recursive: true, force: true }));
