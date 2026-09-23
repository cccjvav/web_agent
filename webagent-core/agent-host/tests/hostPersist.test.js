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

  assert.strictEqual(store.defaults().bridge.license, 'local-demo');
  assert.strictEqual(store.defaults().bridge.provider, 'local-demo');
  store.save({
    ...store.defaults(),
    bridge: { ...store.defaults().bridge, license: '永久顺', provider: 'github', username: 'demo' }
  });
  const migrated = store.load();
  assert.strictEqual(migrated.bridge.license, 'local-demo');
  assert.strictEqual(migrated.bridge.provider, 'local-demo');

  store.save({
    ...store.defaults(),
    bridge: { ...store.defaults().bridge, provider: 'github', username: 'octocat', githubId: '1' }
  });
  const realGh = store.load();
  assert.strictEqual(realGh.bridge.provider, 'github');
  assert.strictEqual(realGh.bridge.username, 'octocat');
  assert.strictEqual(realGh.bridge.githubId, '1');

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
  store.protectWorkspaceSecrets();
  // F63: the host protects secrets through .git/info/exclude (machine-local) and must NOT
  // rewrite the user's tracked .gitignore.
  assert.ok(!fs.existsSync(path.join(tmp, '.gitignore')), 'the tracked .gitignore must not be created or rewritten');
  const gi = fs.readFileSync(path.join(tmp, '.git', 'info', 'exclude'), 'utf8');
  assert.ok(gi.includes('.webagent/config.json'));
  assert.ok(gi.includes('.webagent/read-hashes.json'));
  assert.ok(gi.includes('.webagent/usage.json'));
  for (const rel of ['board.json', 'memory/note.md', 'customizations.json', 'instructions.md', 'preference.md', 'tech-stack.md']) {
    const result = spawnSync('git', ['check-ignore', '-q', '.webagent/' + rel], { cwd: tmp });
    assert.strictEqual(result.status, 0, rel + ' must be private by default');
  }
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
  const gi2 = fs.readFileSync(path.join(tmp, '.git', 'info', 'exclude'), 'utf8');
  assert.strictEqual(gi2.split('.webagent/config.json').length - 1, 1);

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
