const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');
const dist = path.join(repoRoot, 'bin/code-server-dist');
const ensure = fs.readFileSync(path.join(repoRoot, 'webagent-core/scripts/ensure-code-server.js'), 'utf8');
const runner = fs.readFileSync(path.join(repoRoot, 'webagent-core/scripts/run-code-oss.js'), 'utf8');

assert.ok(!fs.existsSync(dist), 'do not vendor a code-server-dist tree');

const mainLaunchers = [
  fs.readFileSync(path.join(repoRoot, 'run-webagent.cmd'), 'utf8'),
  fs.readFileSync(path.join(repoRoot, 'run-webagent.sh'), 'utf8')
].join('\n');
assert.ok(!/code-server/i.test(mainLaunchers), 'run-webagent must not start code-server');
assert.ok(/agent-host/.test(mainLaunchers));

assert.ok(fs.existsSync(path.join(repoRoot, 'run-webagent-vscode.cmd')));
assert.ok(fs.existsSync(path.join(repoRoot, 'webagent-core/scripts/run-code-oss.js')));
assert.ok(ensure.includes('bin/code-server-runtime'));
assert.ok(ensure.includes('code-server@4.135.0') || ensure.includes("'code-server': VERSION"));
assert.ok(!ensure.includes('code-server-dist'));
assert.ok(!runner.includes('code-server-dist'));

console.log('vscode launcher uses npm runtime, not a vendored dist');
