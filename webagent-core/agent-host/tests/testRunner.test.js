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
const contextLine = selected.stdout.split('\n').find(line => line.startsWith('[test-context] '));
const resultLine = selected.stdout.split('\n').find(line => line.startsWith('[test-result] '));
assert.ok(contextLine && resultLine, 'runner must publish bounded context and completion metadata');
const context = JSON.parse(contextLine.slice('[test-context] '.length));
const result = JSON.parse(resultLine.slice('[test-result] '.length));
assert.equal(context.node, process.version); assert.equal(context.platform, process.platform);
assert.equal(context.timeoutMs, Number(process.env.WEBAGENT_TEST_TIMEOUT_MS || 120000)); assert.equal(result.status, 0); assert.ok(result.elapsedMs >= 0);
assert.equal(result.errorCode, null);
assert.ok(!contextLine.includes(root), 'metadata must not expose workspace paths');
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
  const acorn = path.join(fixture, 'node_modules/acorn');fs.mkdirSync(acorn,{recursive:true});fs.writeFileSync(path.join(acorn,'package.json'),'{}');
  fs.mkdirSync(path.join(fixture,'tests'));
  for (const name of fs.readdirSync(path.join(root,'tests')).filter(name=>name.endsWith('.test.js'))) fs.writeFileSync(path.join(fixture,'tests',name),'');
  for (const [name,body] of [['fixtureFailure.test.js','process.exit(7)'],['fixtureTimeout.test.js','setInterval(()=>{},1000)']]) {
    fs.writeFileSync(path.join(fixture,'tests',name),body);
    const result=spawnSync(process.execPath,['scripts/run-tests.js','--filter='+name],{cwd:fixture,env:{...process.env,GITHUB_ACTIONS:'true',WEBAGENT_TEST_TIMEOUT_MS:'1000'},encoding:'utf8',timeout:15000});
    assert.equal(result.status,1,result.stdout+result.stderr);
    const metadata=JSON.parse(result.stdout.split('\n').find(line=>line.startsWith('[test-result] ')).slice('[test-result] '.length));
    assert.equal(metadata.file,name);assert.equal(metadata.timeoutMs,1000);
    if(name.includes('Timeout')) assert.equal(metadata.errorCode,'ETIMEDOUT');else assert.equal(metadata.status,7);
    assert.ok(result.stdout.includes('::error title='+name+'::'));
  }
} finally { fs.rmSync(fixture, { recursive: true, force: true }); }
