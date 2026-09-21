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
  // Stage metadata in the middle must survive the old head/tail-only annotation window.
  const secret = 'DO_NOT_COPY_COMMAND_PATH_TOKEN';
  const stages = [];
  for (let i = 0; i < 12; i++) stages.push('process lifecycle ' + JSON.stringify({kind:'command',event:'spawn',childPid:101,elapsedMs:i,command:secret}));
  stages.push('process lifecycle ' + JSON.stringify({kind:'command',event:'timeout',childPid:101,elapsedMs:30073,spawned:true,exited:false,stdoutBytes:0,stderrBytes:0,command:secret,env:{token:secret}}));
  stages.push('tunnel helper ' + JSON.stringify({operation:'protect',id:7,event:'callback',elapsedMs:8001,helperStarted:true,helperReady:false,helperCompleted:false,errorCode:secret,stderr:secret}));
  stages.push('process lifecycle ' + JSON.stringify({kind:'search',event:'timeout',threadId:8,elapsedMs:10001,online:true,ready:false,activeSearches:1}));
  stages.push('process lifecycle {malformed');
  stages.push('process lifecycle ' + JSON.stringify({kind:'command',event:secret,elapsedMs:1}));
  stages.push('process lifecycle ' + JSON.stringify({kind:'command',event:'exit',elapsedMs:secret,exitCode:secret,exited:secret}));
  stages.push('process lifecycle ' + JSON.stringify({kind:'command',event:'error',command:'x'.repeat(5000)}));
  const body = 'header\n'.repeat(400) + stages.join('\n') + '\n' + 'footer\n'.repeat(400);
  fs.writeFileSync(path.join(fixture,'tests/fixtureStages.test.js'), 'process.stderr.write(' + JSON.stringify(body) + ');process.exitCode=7;');
  const staged = spawnSync(process.execPath,['scripts/run-tests.js','--filter=fixtureStages.test'],{cwd:fixture,env:{...process.env,GITHUB_ACTIONS:'true'},encoding:'utf8',timeout:15000});
  assert.equal(staged.status,1);
  const annotation = staged.stdout.split('\n').find(line=>line.startsWith('::error title=fixtureStages.test.js::'));
  assert(annotation);
  assert(annotation.includes('[lifecycle-summary]'), 'middle lifecycle diagnostics must survive head/tail truncation');
  const decoded = annotation.replace(/%0A/g,'\n').replace(/%0D/g,'\r').replace(/%25/g,'%');
  const summaryLine = decoded.split('\n').find(line=>line.startsWith('[lifecycle-summary] '));
  const summary = JSON.parse(summaryLine.slice('[lifecycle-summary] '.length));
  assert(summary.length <= 6 && summaryLine.length <= 1820);
  assert(summary.some(row=>row.event==='timeout'&&row.elapsedMs===30073&&row.stdoutBytes===0&&row.exited===false));
  assert(summary.some(row=>row.kind==='tunnel'&&row.operation==='protect'&&row.helperStarted===true&&row.helperReady===false));
  assert(summary.some(row=>row.kind==='search'&&row.ready===false&&row.online===true));
  assert(!summaryLine.includes(secret)); assert(!summary.some(row=>'command' in row));
  assert(!summary.some(row=>'env' in row || 'stderr' in row));
  assert(decoded.slice(decoded.indexOf('::')+2).length < 4700);
} finally { fs.rmSync(fixture, { recursive: true, force: true }); }
