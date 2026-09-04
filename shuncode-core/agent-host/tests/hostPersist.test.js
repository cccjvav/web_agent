const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shuncode-persist-'));
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
  const hashPath = path.join(tmp, '.shuncode', 'read-hashes.json');
  assert.ok(fs.existsSync(hashPath));
  const saved = JSON.parse(fs.readFileSync(hashPath, 'utf8'));
  assert.strictEqual(saved['src/app.js'], 'abc123def');

  delete require.cache[require.resolve('../src/tools/readCache')];
  const rc2 = require('../src/tools/readCache');
  assert.strictEqual(rc2.recalledHash('src/app.js'), 'abc123def');

  resetHashes();
  assert.strictEqual(recalledHash('src/app.js'), null);
  assert.ok(!fs.existsSync(hashPath));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('host persist tests passed');
}

main();
