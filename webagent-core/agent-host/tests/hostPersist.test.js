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
  const gi = fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8');
  assert.ok(gi.includes('.webagent/config.json'));
  assert.ok(gi.includes('.webagent/read-hashes.json'));
  assert.ok(gi.includes('.webagent/usage.json'));
  const ignored = spawnSync('git', ['check-ignore', '-q', '.webagent/config.json'], { cwd: tmp });
  assert.strictEqual(ignored.status, 0);
  store.protectWorkspaceSecrets();
  const gi2 = fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8');
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
