'use strict';
// F72 batch 2: computer-use/win scripts, first line-by-line review.
//  1. snap.ps1 built the output path with Join-Path (Get-Location) $Out, so an ABSOLUTE -Out (which the
//     host's collectShot explicitly supports) became "C:\cwd\C:\x\shot.png" and the capture failed.
//  2. snap.ps1 matched the window with -like "*$WindowTitle*" and took the first hit: an ambiguous
//     title could capture — and send to a model — a different window than intended, and a title
//     containing "[" threw a wildcard-pattern error. act/type already require one literal match.
//  3. mark.cs printed hand-built "JSON" with raw Windows paths ("C:\Users\…"), which is not JSON.
// On Windows the scripts run for real under powershell.exe; elsewhere only the source contract and
// the host-side parsing are checked.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { findShotCandidates, collectShot } = require('../src/agent/computerUse');

const WIN_DIR = path.resolve(__dirname, '../../../computer-use/win');
const read = (name) => fs.readFileSync(path.join(WIN_DIR, name), 'utf8');
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function snapContract() {
  const snap = read('snap.ps1');
  assert.ok(!/-like\s+"\*\$WindowTitle\*"/.test(snap), 'snap.ps1 must not wildcard-match the window title');
  assert.ok(/MainWindowTitle\.IndexOf\(\$WindowTitle,\[StringComparison\]::OrdinalIgnoreCase\)/.test(snap),
    'snap.ps1 matches the title as a literal, case-insensitive substring like act/type');
  assert.ok(/\.Count -ne 1\) ?\{ ?Write-Output "ERR_WINDOW_MISSING_OR_AMBIGUOUS"; exit 2/.test(snap.replace(/\s+/g, ' ')),
    'snap.ps1 refuses a missing or ambiguous window');
  assert.ok(/IsPathRooted\(\$Out\)/.test(snap), 'snap.ps1 keeps an absolute -Out as given');
}

function markContract() {
  const mark = read('mark.cs');
  assert.ok(/static string JsonText\(string/.test(mark), 'mark.cs escapes the strings it prints as JSON');
  for (const field of ['inPath', 'outPath', 'pts']) {
    assert.ok(mark.includes(`JsonText(${field})`), `mark.cs escapes ${field}`);
  }
}

function hostParsesEscapedJson() {
  // mark.cs now prints real JSON, so the out path arrives with doubled backslashes. The host must
  // decode it; it keeps the raw text as a second candidate for output from older script copies.
  const stdout = '{"in":"C:\\\\repo\\\\shots\\\\cur.png","out":"C:\\\\repo\\\\shots\\\\cur-marked.png","pts":"1:1","ok":true}';
  const cands = findShotCandidates({ command: 'mark.ps1 -Path x -Pts 1:1', stdout });
  assert.ok(cands.includes('C:\\repo\\shots\\cur-marked.png'), `decoded JSON out path is a candidate: ${JSON.stringify(cands)}`);
  const legacy = findShotCandidates({ command: 'x', stdout: '{"in":"C:\\temp\\new.png","out":"C:\\temp\\new-marked.png","ok":true}' });
  assert.ok(legacy.includes('C:\\temp\\new-marked.png'), `legacy unescaped out path still a candidate: ${JSON.stringify(legacy)}`);
}

function powershell(file, args) {
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(WIN_DIR, file), ...args],
    { encoding: 'utf8', windowsHide: true, timeout: 120000 });
}

function windowsRuns() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-cu-'));
  try {
    const src = path.join(root, 'shots', 'cur.png');
    fs.mkdirSync(path.dirname(src), { recursive: true });
    fs.writeFileSync(src, Buffer.from(PNG_B64, 'base64'));

    // mark.ps1 with absolute paths prints parseable JSON, and the host attaches the marked copy.
    const outAbs = path.join(root, 'shots', 'cur-marked.png');
    const mark = powershell('mark.ps1', ['-Path', src, '-Pts', '0:0', '-Out', outAbs]);
    assert.strictEqual(mark.status, 0, `mark.ps1 exit ${mark.status}: ${mark.stdout}${mark.stderr}`);
    const line = mark.stdout.trim().split(/\r?\n/).pop();
    const parsed = JSON.parse(line);
    assert.strictEqual(parsed.out, outAbs);
    assert.strictEqual(parsed.ok, true);
    assert.ok(fs.statSync(outAbs).size > 0);
    const shot = collectShot({ command: 'mark.ps1 -Path shots\\cur.png -Pts 0:0', stdout: mark.stdout }, { workspaceRoot: root, cuDir: path.join(root, 'none') });
    assert.ok(shot && shot.abs && shot.abs.toLowerCase() === fs.realpathSync(outAbs).toLowerCase(), `host attaches the marked copy: ${JSON.stringify(shot && shot.abs)}`);

    // A title with wildcard characters is a literal: no pattern error, just "no such window".
    const missing = powershell('snap.ps1', ['-WindowTitle', '[webagent-no-such-window*', '-Out', path.join(root, 'never.png')]);
    assert.strictEqual(missing.status, 2, `snap.ps1 missing window exit ${missing.status}: ${missing.stdout}${missing.stderr}`);
    assert.ok(/ERR_WINDOW_MISSING_OR_AMBIGUOUS/.test(missing.stdout));
    assert.ok(!fs.existsSync(path.join(root, 'never.png')));

    // An absolute -Out is used as given. The runner may have no capturable desktop, so a capture
    // failure is tolerated — but never a malformed-path failure, which was the defect.
    const fullAbs = path.join(root, 'sub dir', 'full.png');
    const full = powershell('snap.ps1', ['-Out', fullAbs]);
    if (full.status === 0) {
      assert.ok(fs.statSync(fullAbs).size > 0, 'absolute -Out file written');
      const meta = JSON.parse(full.stdout.trim().split(/\r?\n/).find(l => l.startsWith('META ')).slice(5));
      assert.strictEqual(meta.file, fullAbs);
    } else {
      assert.strictEqual(full.status, 3, `snap.ps1 exit ${full.status}: ${full.stdout}${full.stderr}`);
      assert.ok(!/format is not supported|illegal characters|not supported/i.test(full.stdout),
        `absolute -Out must not be mangled into an invalid path: ${full.stdout}`);
      console.log('NOTE snap.ps1 capture unavailable on this runner:', full.stdout.trim().slice(0, 160));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

snapContract();
markContract();
hostParsesEscapedJson();
if (process.platform === 'win32') windowsRuns();
else console.log('SKIP computer-use real PowerShell runs: not Windows');
console.log('computerUseScripts tests passed');
