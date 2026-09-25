// F62: negative cases for sensitive-rule cost and Git read-only scope.
// These assert behaviour that the baseline (2f6e7ab) did NOT have:
//   1. .webagentignore is read once per evaluation batch, not once per path.
//   2. A hostile/large .webagentignore cannot make a bounded search unbounded.
//   3. git_status / git_diff never project files that live outside workspaceRoot.
// Fixtures only touch self-created temporary directories; no real secrets are read.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-sensitive-'));
process.env.WORKSPACE_ROOT = tmp;
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const sensitive = require('../src/tools/sensitive');
const fileOps = require('../src/tools/fileOps');

function countIgnoreReads(fn) {
  const realRead = fs.readFileSync;
  const realExists = fs.existsSync;
  let reads = 0;
  let exists = 0;
  fs.readFileSync = function (p, ...rest) {
    if (String(p).endsWith('.webagentignore')) reads += 1;
    return realRead.call(fs, p, ...rest);
  };
  fs.existsSync = function (p) {
    if (String(p).endsWith('.webagentignore')) exists += 1;
    return realExists.call(fs, p);
  };
  try {
    return { value: fn(), reads, exists };
  } finally {
    fs.readFileSync = realRead;
    fs.existsSync = realExists;
  }
}

// Windows 8.3 short names are a second spelling of an existing file (".webagent" -> "WEBAGE~1").
// Built-in rules match by name, so a short spelling must not reach a protected file through read,
// write, list or search. Only a real NTFS volume with 8.3 generation can produce such aliases.
function shortNameOf(fullPath) {
  const out = spawnSync('cmd.exe', ['/d', '/c', `for %I in ("${fullPath}") do @echo %~sI`],
    { encoding: 'utf8', windowsVerbatimArguments: true, windowsHide: true });
  const line = String(out.stdout || '').trim().split(/\r?\n/).pop() || '';
  return line ? path.basename(line) : '';
}

async function windowsShortNameAliases() {
  if (process.platform !== 'win32') {
    console.log('sensitiveBoundary: 8.3 alias cases need Windows; skipped on ' + process.platform);
    return;
  }
  const dir = path.join(tmp, '.webagent');
  fs.mkdirSync(dir, { recursive: true });
  const secret = 'AUDIT_SHORTNAME_FAKE_SECRET';
  fs.writeFileSync(path.join(dir, 'config.json'), secret + '\n');
  fs.writeFileSync(path.join(tmp, 'credentials.json'), secret + '\n');
  const sd = shortNameOf(dir);
  const sf = shortNameOf(path.join(dir, 'config.json'));
  const sc = shortNameOf(path.join(tmp, 'credentials.json'));
  if (!sd || sd.toLowerCase() === '.webagent' || !sc || sc.toLowerCase() === 'credentials.json') {
    console.log(`sensitiveBoundary: volume produced no 8.3 aliases (${sd}, ${sc}); alias cases skipped`);
    return;
  }
  assert.ok(sd.includes('~') && sc.includes('~'), `fixture must yield real 8.3 aliases, got ${sd} ${sc}`);
  // Positive control: the long spelling is denied today; the alias must be denied the same way.
  assert.throws(() => fileOps.readFile({ filePath: '.webagent/config.json' }));
  const aliases = [`${sd}/config.json`, `.webagent/${sf}`, `${sd}/${sf}`, sc, `${sd.toLowerCase()}/config.json`];
  for (const rel of aliases) {
    let leaked = null;
    try { leaked = fileOps.readFile({ filePath: rel }).content; } catch (_) { /* denied */ }
    assert.strictEqual(leaked, null, `read_file through 8.3 alias ${rel} must be denied`);
  }
  let found = 0;
  try { found = fileOps.scanSearch({ query: secret, searchPath: sd }).totalMatches; } catch (_) { /* denied */ }
  assert.strictEqual(found, 0, `search through 8.3 alias ${sd} must not return protected content`);
  let listed = [];
  try { listed = fileOps.listDir({ dirPath: sd }).items.map((i) => i.name.toLowerCase()); } catch (_) { /* denied */ }
  assert.ok(!listed.includes('config.json'), `list_dir through 8.3 alias ${sd} must not expose config.json`);
  let wrote = false;
  try { await fileOps.writeFile({ filePath: `${sd}/config.json`, content: 'overwritten\n', confirmOverwrite: true }); wrote = true; } catch (_) { /* denied */ }
  assert.strictEqual(wrote, false, 'write_file through an 8.3 alias must be denied');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'), secret + '\n');
  // Ordinary long names inside the workspace keep working.
  fs.writeFileSync(path.join(tmp, 'ordinary-long-name.txt'), 'hello\n');
  assert.ok(fileOps.readFile({ filePath: 'ordinary-long-name.txt' }).content.includes('hello'));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(path.join(tmp, 'credentials.json'), { force: true });
  console.log(`sensitiveBoundary: 8.3 alias cases ran (${sd}, ${sf}, ${sc})`);
}

// Renaming an ancestor must not move a protected file out from under a path-shaped rule
// (".webagent/config.json", or a custom "private/*"): the directory name itself is not sensitive.
async function renameCannotUnprotect() {
  const dir = path.join(tmp, '.webagent');
  fs.mkdirSync(dir, { recursive: true });
  const secret = 'AUDIT_RENAME_FAKE_SECRET';
  fs.writeFileSync(path.join(dir, 'config.json'), secret + '\n');
  fs.writeFileSync(path.join(dir, 'instructions.md'), 'notes\n');
  assert.throws(() => fileOps.readFile({ filePath: '.webagent/config.json' }), 'positive control: long path is protected');
  await assert.rejects(fileOps.renameFile({ from: '.webagent', to: 'exposed' }), /protected/,
    'renaming a directory that holds a protected file must be refused');
  assert.ok(fs.existsSync(path.join(dir, 'config.json')), 'refused rename leaves the file in place');
  assert.ok(!fs.existsSync(path.join(tmp, 'exposed')), 'refused rename creates no destination');
  // Same for a nested ancestor and for a custom path-shaped rule.
  fs.mkdirSync(path.join(tmp, 'outer', 'private'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'outer', 'private', 'note.txt'), secret + '\n');
  fs.writeFileSync(path.join(tmp, '.webagentignore'), 'outer/private/*\n');
  await assert.rejects(fileOps.renameFile({ from: 'outer', to: 'outer2' }), /protected/);
  await assert.rejects(fileOps.renameFile({ from: 'outer/private', to: 'outer/public' }), /protected/);
  fs.rmSync(path.join(tmp, '.webagentignore'), { force: true });
  // Ordinary directory renames keep working, including ones whose files stay protected by name.
  fs.mkdirSync(path.join(tmp, 'plain', 'deep'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'plain', 'deep', 'a.txt'), 'a\n');
  fs.writeFileSync(path.join(tmp, 'plain', '.env'), 'X=1\n');
  const moved = await fileOps.renameFile({ from: 'plain', to: 'plain2' });
  assert.strictEqual(moved.success, true);
  assert.ok(fs.existsSync(path.join(tmp, 'plain2', 'deep', 'a.txt')));
  assert.throws(() => fileOps.readFile({ filePath: 'plain2/.env' }), 'name-based rules still protect after a rename');
  fs.rmSync(path.join(tmp, 'plain2'), { recursive: true, force: true });
  fs.rmSync(path.join(tmp, 'outer'), { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
}

function run() {
  // --- Built-in rules stay exactly as documented. ---
  assert.strictEqual(sensitive.isSensitive('.env'), true);
  assert.strictEqual(sensitive.isSensitive('nested/deep/.env'), true);
  assert.strictEqual(sensitive.isSensitive('.env.example'), false);
  assert.strictEqual(sensitive.isSensitive('.env.production'), true);
  assert.strictEqual(sensitive.isSensitive('a/.ssh/id_rsa'), true);
  assert.strictEqual(sensitive.isSensitive('src/app.js'), false);
  assert.strictEqual(sensitive.isSensitive('.webagent/config.json'), true);
  assert.strictEqual(sensitive.isNoise('a/node_modules/b'), true);
  assert.strictEqual(sensitive.isNoise('a/b'), false);

  // --- Custom rules: first-match-wins, negation, and case handling are unchanged. ---
  fs.writeFileSync(path.join(tmp, '.webagentignore'), '# comment\nprivate/*\n*.priv\n!private/allowed.txt\n');
  assert.strictEqual(sensitive.isSensitive('private/x.txt'), true);
  assert.strictEqual(sensitive.isSensitive('secret.priv'), true);
  assert.strictEqual(sensitive.isSensitive('other/x.txt'), false);
  // A custom negation cannot unblock a built-in protection.
  fs.writeFileSync(path.join(tmp, '.webagentignore'), '!.env\n');
  assert.strictEqual(sensitive.isSensitive('.env'), true);

  // --- Live edits are still observed (no stale permanently-cached rule set). ---
  fs.writeFileSync(path.join(tmp, '.webagentignore'), 'first-rule/*\n');
  assert.strictEqual(sensitive.isSensitive('first-rule/a.txt'), true);
  assert.strictEqual(sensitive.isSensitive('second-rule/a.txt'), false);
  fs.writeFileSync(path.join(tmp, '.webagentignore'), 'second-rule/*\n');
  assert.strictEqual(sensitive.isSensitive('second-rule/a.txt'), true, 'rule file edits must take effect');
  assert.strictEqual(sensitive.isSensitive('first-rule/a.txt'), false, 'removed rules must stop matching');
  fs.rmSync(path.join(tmp, '.webagentignore'), { force: true });
  assert.strictEqual(sensitive.isSensitive('second-rule/a.txt'), false, 'deleting the rule file must take effect');

  // --- F62-01: one rule-file read per batch, not one per path. ---
  fs.writeFileSync(path.join(tmp, '.webagentignore'), 'private/*\n');
  const batch = countIgnoreReads(() => {
    const out = [];
    for (let i = 0; i < 200; i++) out.push(sensitive.isSensitive('dir/file-' + i + '.txt'));
    return out;
  });
  assert.strictEqual(batch.value.filter(Boolean).length, 0);
  assert.ok(
    batch.reads <= 2,
    `expected the ignore file to be read at most twice for 200 checks, saw ${batch.reads}`
  );
  assert.ok(
    batch.exists <= 2,
    `expected at most two existsSync probes for 200 checks, saw ${batch.exists}`
  );

  // --- F62-02: a huge rule file cannot blow up a bounded scan. ---
  const hostile = [];
  for (let i = 0; i < 20000; i++) hostile.push('pattern-' + i + '/**/*.tmp');
  fs.writeFileSync(path.join(tmp, '.webagentignore'), hostile.join('\n'));
  const reloaded = fs.readFileSync(path.join(tmp, '.webagentignore'), 'utf8').split('\n');
  assert.ok(reloaded.length > 5000, 'fixture must really be oversized');
  const scanDir = path.join(tmp, 'scan');
  fs.mkdirSync(scanDir, { recursive: true });
  for (let i = 0; i < 200; i++) fs.writeFileSync(path.join(scanDir, 'f' + i + '.txt'), 'needle here\n');
  const started = Date.now();
  const scan = fileOps.scanSearch({ query: 'needle', searchPath: 'scan' });
  const elapsed = Date.now() - started;
  assert.strictEqual(scan.totalMatches, 200);
  assert.ok(
    elapsed < 4000,
    `bounded search must not be dominated by ignore-rule evaluation; took ${elapsed}ms`
  );
  // Rules beyond the cap are ignored rather than silently applied, and the cap is documented.
  assert.strictEqual(sensitive.MAX_CUSTOM_PATTERNS > 0, true);
  fs.rmSync(path.join(tmp, '.webagentignore'), { force: true });

  // --- F62-03: git tools must not project outside the workspace root. ---
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-gitscope-'));
  try {
    const git = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' });
    git('init', '-q');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    fs.mkdirSync(path.join(repo, 'sub'));
    fs.writeFileSync(path.join(repo, 'outside-marker.txt'), 'AUDIT_OUTSIDE=before\n');
    fs.writeFileSync(path.join(repo, 'sub', 'inside.txt'), 'AUDIT_INSIDE=before\n');
    git('add', '-A');
    git('commit', '-qm', 'fixture');
    fs.writeFileSync(path.join(repo, 'outside-marker.txt'), 'AUDIT_OUTSIDE=after\n');
    fs.writeFileSync(path.join(repo, 'sub', 'inside.txt'), 'AUDIT_INSIDE=after\n');

    config.workspaceRoot = path.join(repo, 'sub');
    const gitOps = require('../src/tools/gitOps');
    const diff = gitOps.gitDiff();
    assert.ok(diff.diff.includes('AUDIT_INSIDE=after'), 'in-scope change must still be visible');
    assert.ok(
      !diff.diff.includes('AUDIT_OUTSIDE=after'),
      'default git_diff must not leak changes from outside the workspace root'
    );
    const status = gitOps.gitStatus();
    const paths = JSON.stringify(status.files);
    assert.ok(paths.includes('inside.txt'), 'in-scope status entry must still be listed');
    assert.ok(
      !paths.includes('outside-marker'),
      'git_status must not list files outside the workspace root'
    );

    // --- F62-04: tracked-then-ignored sensitive files must not leak through a broad diff. ---
    config.workspaceRoot = repo;
    fs.writeFileSync(path.join(repo, '.env'), 'AUDIT_FAKE_VALUE=before\n');
    git('add', '-f', '.env');
    git('commit', '-qm', 'tracked env fixture');
    fs.writeFileSync(path.join(repo, '.env'), 'AUDIT_FAKE_VALUE=after\n');
    let explicitDenied = false;
    try { gitOps.gitDiff({ filePath: '.env' }); } catch (_) { explicitDenied = true; }
    assert.strictEqual(explicitDenied, true, 'explicit sensitive path must stay denied');
    const broad = gitOps.gitDiff();
    assert.ok(
      !broad.diff.includes('AUDIT_FAKE_VALUE=after'),
      'default git_diff must respect the same sensitive-path rules as an explicit diff'
    );
    git('add', '.env');
    const staged = gitOps.gitDiff({ staged: true });
    assert.ok(
      !staged.diff.includes('AUDIT_FAKE_VALUE=after'),
      'staged git_diff must respect the same sensitive-path rules'
    );
    const statusAfter = gitOps.gitStatus();
    assert.ok(
      !JSON.stringify(statusAfter.files).includes('AUDIT_FAKE_VALUE'),
      'status never carries file contents'
    );
    // Non-sensitive files in the same broad diff are still reported.
    fs.writeFileSync(path.join(repo, 'sub', 'inside.txt'), 'AUDIT_INSIDE=third\n');
    assert.ok(gitOps.gitDiff().diff.includes('AUDIT_INSIDE=third'), 'ordinary files stay visible');
  } finally {
    config.workspaceRoot = tmp;
    fs.rmSync(repo, { recursive: true, force: true });
  }

}

// renameFile/writeFile go through the async write lock and return promises; a sync try/catch or
// assert.throws around them passes or fails for the wrong reason, so these cases are awaited.
(async () => {
  try {
    run();
    await windowsShortNameAliases();
    await renameCannotUnprotect();
    console.log('sensitiveBoundary.test.js ok');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
