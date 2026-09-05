const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-persist-'));
const { config, generateNewSecret, persistIdentity } = require('../src/config');
config.workspaceRoot = tmp;

const store = require('../src/models/store');
const { rememberHash, recalledHash, resetHashes } = require('../src/tools/readCache');

function main() {
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
  const hashPath = path.join(tmp, '.webagent', 'read-hashes.json');
  assert.ok(fs.existsSync(hashPath));
  const saved = JSON.parse(fs.readFileSync(hashPath, 'utf8'));
  assert.strictEqual(saved['src/app.js'], 'abc123def');

  delete require.cache[require.resolve('../src/tools/readCache')];
  const rc2 = require('../src/tools/readCache');
  assert.strictEqual(rc2.recalledHash('src/app.js'), 'abc123def');

  const nested = path.join(tmp, '.webagent', '.gitignore');
  assert.ok(fs.existsSync(nested));
  const nestedText = fs.readFileSync(nested, 'utf8');
  assert.ok(/config\.json/.test(nestedText));
  assert.ok(/read-hashes\.json/.test(nestedText));
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
  const ignored = spawnSync('git', ['check-ignore', '-q', '.webagent/config.json'], { cwd: tmp });
  assert.strictEqual(ignored.status, 0);
  store.protectWorkspaceSecrets();
  const gi2 = fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8');
  assert.strictEqual(gi2.split('.webagent/config.json').length - 1, 1);

  const rootGi = fs.readFileSync(path.join(__dirname, '../../../.gitignore'), 'utf8');
  assert.ok(rootGi.includes('**/.webagent/config.json'));

  resetHashes();
  assert.strictEqual(recalledHash('src/app.js'), null);
  assert.ok(!fs.existsSync(hashPath));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('host persist tests passed');
}

main();
