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

  console.log('sensitiveBoundary.test.js ok');
}

try {
  run();
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
