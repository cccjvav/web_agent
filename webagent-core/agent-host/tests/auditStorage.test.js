'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');
const { callTool } = require('../src/tools');
const { applyPatch, computeHash, resolveSafePath } = require('../src/tools/patchEngine');
const { writeFile } = require('../src/tools/fileOps');
const { isSensitive } = require('../src/tools/sensitive');
const tracker = require('../src/usage/tracker');
const { listSkills, loadSkill } = require('../src/tools/skills');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-audit-storage-'));
  config.workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(config.workspaceRoot);
  try {
    // Input validation must precede all memory-directory creation/writes.
    for (const day of ['../invalid', '2026-02-30', 'not-a-date', '2026-09-11/extra']) {
      await assert.rejects(() => callTool('remember', { text: 'test', day }, 'ask'), /day|date/i);
      await assert.rejects(() => callTool('recall', { day }, 'ask'), /day|date/i);
    }
    assert.ok(!fs.existsSync(path.join(config.workspaceRoot, '.webagent')), 'invalid dates must not create state');
    await callTool('remember', { text: 'safe note', day: '2024-02-29' }, 'ask');
    assert.strictEqual((await callTool('recall', { day: '2024-02-29' }, 'ask')).count, 1);
    const memory = path.join(config.workspaceRoot, '.webagent', 'memory');
    const savedMemory = memory + '-saved';
    const outsideMemory = path.join(root, 'outside-memory');
    fs.mkdirSync(outsideMemory);
    fs.renameSync(memory, savedMemory);
    fs.symlinkSync(outsideMemory, memory, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(() => callTool('recall', {}, 'ask'), /outside workspace/i);
    await assert.rejects(() => callTool('remember', { text: 'must not write' }, 'ask'), /outside workspace/i);
    assert.deepStrictEqual(fs.readdirSync(outsideMemory), []);
    fs.unlinkSync(memory);
    fs.renameSync(savedMemory, memory);
    for (const p of ['.ENV', 'nested/.webagent/config.json', 'nested/.ssh/config', '.ssh/.env.example']) {
      assert.ok(isSensitive(p), `sensitive path must be blocked: ${p}`);
    }
    assert.strictEqual(isSensitive('nested/.env.example'), false);
    fs.writeFileSync(path.join(config.workspaceRoot, '.env'), 'TEST_ONLY');
    // Windows file-symlink creation may need developer mode; skip explicitly, not assertions.
    let linked = false;
    try {
      fs.symlinkSync('.env', path.join(config.workspaceRoot, 'alias.txt'));
      linked = true;
    } catch (err) {
      if (process.platform !== 'win32' || !['EPERM', 'EACCES'].includes(err.code)) throw err;
      console.log('SKIP file symlink regression: Windows symlink privilege unavailable');
    }
    if (linked) assert.throws(() => resolveSafePath('alias.txt'), /SENSITIVE/);

    const file = path.join(config.workspaceRoot, 'sample.txt');
    const diff = 'diff --git a/sample.txt b/sample.txt\n--- a/sample.txt\n+++ b/sample.txt\n@@ -1 +1 @@\n-old\n+new\n';
    for (const eol of ['\n', '\r\n']) {
      fs.writeFileSync(file, `old${eol}`);
      const hash = computeHash(`old${eol}`);
      const dry = await applyPatch({ filePath: 'sample.txt', expectedHash: hash, patch: '\uFEFF' + diff, dryRun: true });
      assert.ok(dry.success);
      assert.strictEqual(fs.readFileSync(file, 'utf8'), `old${eol}`);
      await applyPatch({ filePath: 'sample.txt', expectedHash: hash, patch: diff });
      assert.strictEqual(fs.readFileSync(file, 'utf8'), `new${eol}`);
    }
    await assert.rejects(() => applyPatch({ filePath: 'sample.txt', patch: 'diff --git malformed', expectedHash: computeHash('new\r\n') }), /diff|patch/i);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'new\r\n');
    await assert.rejects(() => applyPatch({ filePath: 'sample.txt', patch: diff + diff, expectedHash: computeHash('new\r\n') }), /single|one|diff/i);

    await assert.rejects(() => applyPatch({ filePath: 'sample.txt', patch: diff, expectedHash: 'not-a-hash', dryRun: true }), /STALE_FILE/);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'new\r\n');
    const beforeFailure = fs.readFileSync(file, 'utf8');
    const rename = fs.renameSync;
    try {
      fs.renameSync = (from, to) => {
        if (to === file) throw new Error('simulated rename failure');
        return rename(from, to);
      };
      await assert.rejects(() => writeFile({ filePath: 'sample.txt', content: 'must not replace', confirm_overwrite: true }), /simulated/);
      assert.strictEqual(fs.readFileSync(file, 'utf8'), beforeFailure);
      assert.ok(!fs.readdirSync(config.workspaceRoot).some(name => name.startsWith('sample.txt.tmp.')));
    } finally { fs.renameSync = rename; }

    const outcomes = await Promise.allSettled([
      applyPatch({ filePath: 'created.txt', patch: 'first' }),
      applyPatch({ filePath: 'folder/../created.txt', patch: 'second' })
    ]);
    assert.strictEqual(outcomes.filter(r => r.status === 'fulfilled').length, 1, 'aliases must share a creation lock');
    assert.strictEqual(fs.readFileSync(path.join(config.workspaceRoot, 'created.txt'), 'utf8'), 'first');
    if (process.platform !== 'win32') {
      const executable = path.join(config.workspaceRoot, 'run.sh');
      fs.writeFileSync(executable, 'old\n', { mode: 0o755 });
      await writeFile({ filePath: 'run.sh', content: 'new\n', confirm_overwrite: true });
      assert.strictEqual(fs.statSync(executable).mode & 0o777, 0o755);
      await applyPatch({ filePath: 'run.sh', patch: 'updated\n', expectedHash: computeHash('new\n') });
      assert.strictEqual(fs.statSync(executable).mode & 0o777, 0o755);
    }

    const skills = path.join(config.workspaceRoot, '.webagent', 'skills');
    fs.mkdirSync(path.join(skills, 'large'), { recursive: true });
    fs.writeFileSync(path.join(skills, 'large', 'SKILL.md'), 'x'.repeat(140 * 1024));
    assert.ok(listSkills().some(s => s.name === 'large'));
    assert.throws(() => loadSkill({ name: 'large' }), /large|size|KiB/i);
    fs.mkdirSync(path.join(skills, 'prefix'));
    fs.writeFileSync(path.join(skills, 'prefix', 'SKILL.md'), '中'.repeat(30000));
    const prefix = loadSkill({ name: 'prefix' });
    assert.strictEqual(prefix.content.length, 28000);
    assert.strictEqual(prefix.truncated, true);
    const external = path.join(root, 'external-skill');
    fs.mkdirSync(external);
    fs.writeFileSync(path.join(external, 'SKILL.md'), 'not a workspace skill');
    fs.symlinkSync(external, path.join(skills, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.ok(!listSkills().some(s => s.name === 'linked'));

    process.env.WEBAGENT_TELEMETRY_URL = 'https://example.invalid';
    process.env.WEBAGENT_TELEMETRY_TOKEN = 'test-only';
    tracker.record();
    let release;
    const reporting = tracker.reportNow({ fetchFn: () => new Promise(resolve => { release = resolve; }) });
    tracker.record();
    release({ ok: true });
    await reporting;
    assert.strictEqual(tracker.load().toolCalls, 2, 'report response must not overwrite new calls');
    console.log('audit storage regressions passed');
  } finally {
    tracker.stopReporter();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
