const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-persist-'));
const { config, generateNewSecret, persistIdentity } = require('../src/config');
config.workspaceRoot = tmp;

const store = require('../src/models/store');
const { rememberHash, recalledHash, sessionHash, resetHashes } = require('../src/tools/readCache');

function main() {
  const extPkg = require('../../extension/package.json');
  assert.strictEqual(config.version, extPkg.version);

  // F106: the sign-in gate is gone; defaults carry no account keys and legacy ones are dropped on load.
  for (const key of ['loggedIn', 'provider', 'username', 'githubId', 'license', 'deviceAuthorized']) {
    assert.ok(!Object.hasOwn(store.defaults().bridge, key), 'default has no ' + key);
  }
  store.save({
    ...store.defaults(),
    bridge: { ...store.defaults().bridge, license: '永久顺', provider: 'github', username: 'octocat', githubId: '1', loggedIn: false, deviceAuthorized: false }
  });
  const migrated = store.load();
  for (const key of ['loggedIn', 'provider', 'username', 'githubId', 'license', 'deviceAuthorized']) {
    assert.ok(!Object.hasOwn(migrated.bridge, key), 'legacy key dropped: ' + key);
  }
  assert.strictEqual(migrated.bridge.tunnelProvider, 'cloudflare');

  const first = generateNewSecret();
  const disk = store.load();
  assert.strictEqual(disk.secretKey, first);
  assert.strictEqual(config.secretKey, first);

  const configFile = path.join(tmp, '.webagent', 'config.json');
  const validConfig = fs.readFileSync(configFile, 'utf8');
  fs.writeFileSync(configFile, '{bad json');
  assert.throws(generateNewSecret, e => e.code === 'E_CONFIG_CORRUPT');
  assert.strictEqual(config.secretKey, first, 'failed rotation must preserve runtime credential');
  assert.strictEqual(fs.readFileSync(configFile, 'utf8'), '{bad json');
  fs.writeFileSync(configFile, validConfig);
  const originalPatch = store.patch;
  try {
    store.patch = () => { const err = new Error('fixture storage refusal'); err.code = 'EACCES'; throw err; };
    assert.throws(generateNewSecret, e => e.code === 'EACCES');
    assert.strictEqual(config.secretKey, first);
    assert.strictEqual(fs.readFileSync(configFile, 'utf8'), validConfig);
  } finally { store.patch = originalPatch; }

  const old = config.secretKey;
  config.secretKey = 'deadbeefdead';
  persistIdentity(store);
  assert.strictEqual(config.secretKey, old);

  rememberHash('src/app.js', 'abc123def');
  assert.strictEqual(recalledHash('src/app.js'), 'abc123def');
  assert.strictEqual(sessionHash('src/app.js'), 'abc123def');
  const hashPath = path.join(tmp, '.webagent', 'read-hashes.json');
  assert.ok(fs.existsSync(hashPath));
  const saved = JSON.parse(fs.readFileSync(hashPath, 'utf8'));
  assert.strictEqual(saved['src/app.js'], 'abc123def');

  delete require.cache[require.resolve('../src/tools/readCache')];
  const rc2 = require('../src/tools/readCache');
  assert.strictEqual(rc2.recalledHash('src/app.js'), 'abc123def');
  assert.strictEqual(rc2.sessionHash('src/app.js'), null, 'session hashes must not survive a process restart');

  // F95: session reads are per reader; the operator (a person at the workbench) records nothing.
  assert.strictEqual(rc2.readerOf({ operator: true }), null);
  assert.strictEqual(rc2.readerOf({ operator: true, remote: true, callerKey: 'k' }), null, 'operator wins over remote');
  assert.strictEqual(rc2.readerOf({ remote: true, initializedSession: true, callerKey: 'k' }), 'remote:k');
  assert.strictEqual(rc2.readerOf({ remote: true, initializedSession: true }), 'remote:');
  assert.strictEqual(rc2.readerOf({ remote: true, callerKey: 'k' }), null, 'F112: a sessionless remote call has no reader');
  assert.strictEqual(rc2.readerOf({ remote: true, initializedSession: 'yes', callerKey: 'k' }), null, 'only a real true counts');
  assert.strictEqual(rc2.readerOf({}), 'local');
  assert.strictEqual(rc2.readerOf(undefined), 'local');
  rc2.rememberHash('src/op.js', 'operator-hash', null);
  assert.strictEqual(rc2.recalledHash('src/op.js'), null, 'operator reads are not remembered on disk either');
  assert.strictEqual(rc2.sessionHash('src/op.js', null), null);
  rc2.rememberHash('src/two.js', 'h-remote', 'remote:k');
  assert.strictEqual(rc2.sessionHash('src/two.js', 'remote:k'), 'h-remote');
  assert.strictEqual(rc2.sessionHash('src/two.js'), null, 'local does not see a remote read');
  assert.strictEqual(rc2.sessionHash('src/two.js', 'remote:other'), null);
  assert.strictEqual(rc2.recalledHash('src/two.js'), 'h-remote', 'the on-disk record stays shared (apply_patch still checks content)');
  rc2.rememberHash('src/two.js', 'h-remote', 'local'); // same hash, already newest on disk: session still recorded
  assert.strictEqual(rc2.sessionHash('src/two.js'), 'h-remote');
  rc2.forgetHash('src/two.js');
  assert.strictEqual(rc2.sessionHash('src/two.js', 'remote:k'), null, 'forget drops every reader');
  assert.strictEqual(rc2.sessionHash('src/two.js'), null);
  // The session map is capped at 4000 entries, oldest first; re-reading refreshes an entry's age.
  rc2.rememberHash('cap/keep.js', 'keep', 'remote:cap');
  for (let i = 0; i < 4000; i += 1) { // with cap/keep.js: 4001 entries, one over the cap
    rc2.rememberHash(`cap/${i}.js`, 'h' + i, 'remote:cap');
    if (i === 3000) rc2.rememberHash('cap/keep.js', 'keep', 'remote:cap');
  }
  assert.strictEqual(rc2.sessionHash('cap/0.js', 'remote:cap'), null, 'oldest read evicted');
  assert.strictEqual(rc2.sessionHash('cap/1.js', 'remote:cap'), 'h1');
  assert.strictEqual(rc2.sessionHash('cap/keep.js', 'remote:cap'), 'keep', 're-read entry is refreshed, not evicted');
  assert.strictEqual(rc2.sessionHash('cap/3999.js', 'remote:cap'), 'h3999');
  // F99: spelling variants of one path share one key (they name one file inside the workspace).
  rc2.rememberHash('src/one.js', 'h-one', 'local');
  for (const variant of ['src//one.js', './src/one.js', 'src/./one.js', 'src\\one.js', 'lib/../src/one.js', './src//./one.js']) {
    assert.strictEqual(rc2.sessionHash(variant), 'h-one', `${variant} is the same file as src/one.js`);
    assert.strictEqual(rc2.recalledHash(variant), 'h-one');
  }
  assert.strictEqual(rc2.sessionHash('src/one.js/'), null, 'a trailing slash names a directory, not the file');
  assert.strictEqual(rc2.sessionHash('src/One.js'), null, 'letter case is kept (case-insensitive filesystems still see one file per read)');
  rc2.rememberHash('', 'ignored', 'local');
  rc2.rememberHash('.', 'ignored', 'local');
  rc2.rememberHash('./', 'ignored', 'local');
  assert.strictEqual(rc2.recalledHash('.'), null, 'the workspace root is never a file key');
  rc2.forgetHash('./src//one.js');
  assert.strictEqual(rc2.sessionHash('src/one.js'), null, 'forget accepts any spelling too');
  rc2.resetHashes();

  const nested = path.join(tmp, '.webagent', '.gitignore');
  assert.ok(fs.existsSync(nested));
  const nestedText = fs.readFileSync(nested, 'utf8');
  assert.ok(/config\.json/.test(nestedText));
  assert.ok(/read-hashes\.json/.test(nestedText));
  assert.ok(nestedText.includes('usage.json'));
  if (process.platform !== 'win32') {
    assert.strictEqual(fs.statSync(path.join(tmp, '.webagent', 'config.json')).mode & 0o777, 0o600);
  }

  fs.unlinkSync(nested);
  persistIdentity(store);
  assert.ok(fs.existsSync(nested));
  assert.ok(!fs.existsSync(path.join(tmp, '.gitignore')));

  const gitInit = spawnSync('git', ['init'], { cwd: tmp, encoding: 'utf8' });
  assert.strictEqual(gitInit.status, 0, gitInit.stderr || gitInit.stdout);
  // F70 (external review P1-6): the host must not edit a tracked file in the user's repository.
  // It used to append a block to the root .gitignore on every start. Protection now comes from
  // the nested .webagent/.gitignore plus the machine-local info/exclude, neither of which the
  // user ever commits or sees in a diff.
  const userIgnore = '# the user\'s own rules\nnode_modules/\n';
  fs.writeFileSync(path.join(tmp, '.gitignore'), userIgnore);
  store.protectWorkspaceSecrets();
  persistIdentity(store);
  assert.strictEqual(fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8'), userIgnore, 'the tracked .gitignore must stay byte-identical');
  const exclude = fs.readFileSync(path.join(tmp, '.git', 'info', 'exclude'), 'utf8');
  assert.ok(exclude.includes('/.webagent/config.json'));
  assert.ok(exclude.includes('/.webagent/read-hashes.json'));
  assert.ok(exclude.includes('/.webagent/usage.json'));
  for (const rel of ['config.json', 'board.json', 'memory/note.md', 'customizations.json', 'instructions.md', 'preference.md', 'tech-stack.md']) {
    const result = spawnSync('git', ['check-ignore', '-q', '.webagent/' + rel], { cwd: tmp });
    assert.strictEqual(result.status, 0, rel + ' must be private by default');
  }
  // The local exclude alone still protects: delete the nested file and check again.
  fs.renameSync(nested, nested + '.bak');
  const excludeOnly = spawnSync('git', ['check-ignore', '-q', '.webagent/config.json'], { cwd: tmp });
  assert.strictEqual(excludeOnly.status, 0, 'info/exclude must protect even without the nested .gitignore');
  fs.renameSync(nested + '.bak', nested);
  fs.unlinkSync(path.join(tmp, '.gitignore'));
  const ignored = spawnSync('git', ['check-ignore', '-q', '.webagent/config.json'], { cwd: tmp });
  assert.strictEqual(ignored.status, 0);
  assert.deepStrictEqual(store.trackedSecretFiles(), []);
  const forceAdd = spawnSync('git', ['add', '-f', '--', '.webagent/config.json'], { cwd: tmp, encoding: 'utf8' });
  assert.strictEqual(forceAdd.status, 0, forceAdd.stderr || forceAdd.stdout);
  const tracked = store.trackedSecretFiles();
  assert.ok(tracked.some((rel) => rel.replace(/\\/g, '/') === '.webagent/config.json'), tracked.join(','));
  const warns = [];
  store.warnTrackedSecrets((msg) => warns.push(String(msg)));
  assert.ok(warns.length === 1);
  assert.ok(/git rm --cached/.test(warns[0]));
  spawnSync('git', ['rm', '-f', '--cached', '--', '.webagent/config.json'], { cwd: tmp });
  assert.deepStrictEqual(store.trackedSecretFiles(), []);
  store.protectWorkspaceSecrets();
  assert.ok(!fs.existsSync(path.join(tmp, '.gitignore')), 'repeated protection never creates a root .gitignore');
  const exclude2 = fs.readFileSync(path.join(tmp, '.git', 'info', 'exclude'), 'utf8');
  assert.strictEqual(exclude2.split('/.webagent/config.json').length - 1, 1, 'the exclude block is written once');

  const rootGi = fs.readFileSync(path.join(__dirname, '../../../.gitignore'), 'utf8');
  assert.ok(rootGi.includes('**/.webagent/config.json'));
  assert.ok(rootGi.includes('**/.webagent/usage.json'));

  resetHashes();
  assert.strictEqual(recalledHash('src/app.js'), null);
  assert.ok(!fs.existsSync(hashPath));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('host persist tests passed');
}

main();
