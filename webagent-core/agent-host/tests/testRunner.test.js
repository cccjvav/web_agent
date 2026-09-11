'use strict';
const assert = require('assert');
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
