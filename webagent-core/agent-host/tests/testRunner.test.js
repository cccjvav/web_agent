'use strict';
const assert = require('assert');
const fs = require('fs'), os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
function run(args, env = {}) {
  return spawnSync(process.execPath, ['scripts/run-tests.js', ...args], {
    cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 20000
  });
}
const selected = run(['--filter=profile.test']);
assert.strictEqual(selected.status, 0, selected.stderr + selected.stdout);
assert.ok(selected.stdout.includes('1 test files passed'));
assert.ok(!selected.stdout.includes('PASS oauth.test.js'));
assert.strictEqual(run(['--filter=no-such-test']).status, 2);
assert.strictEqual(run(['--unknown']).status, 2);
assert.strictEqual(run(['--filter=profile.test'], { WEBAGENT_TEST_TIMEOUT_MS: 'invalid' }).status, 2);
console.log('test runner filtering/argument regressions passed');

// Isolated launcher copies: never rename/remove dependencies in the real checkout.
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-dependencies-'));
try {
  fs.mkdirSync(path.join(fixture, 'scripts'));
  fs.copyFileSync(path.join(root, 'scripts/run-tests.js'), path.join(fixture, 'scripts/run-tests.js'));
  for (const installed of [[], ['express']]) {
    for (const name of installed) {
      const folder = path.join(fixture, 'node_modules', name); fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, 'package.json'), '{}');
    }
    const result = spawnSync(process.execPath, ['scripts/run-tests.js'], { cwd: fixture, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /acorn/); assert.match(result.stderr, /npm ci --include=dev/);
    assert(!result.stdout.includes('PASS'), 'missing dev dependency cannot start partial test run');
  }
} finally { fs.rmSync(fixture, { recursive: true, force: true }); }
