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

const sh = fs.readFileSync(path.join(repoRoot, 'run-webagent.sh'), 'utf8');
assert.ok(/\$1/.test(sh), 'sh must accept a workspace path like the .cmd');
assert.ok(/command -v node/.test(sh), 'sh must check that node is installed');
assert.ok(/mkdir/.test(sh), 'sh must mkdir the default workspace');
assert.ok(/does not exist/.test(sh), 'sh must refuse a missing custom workspace');

const runtimePkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'bin/code-server-runtime/package.json'), 'utf8'));
assert.strictEqual(runtimePkg.name, 'webagent-code-server-runtime');
assert.ok(!/shuncode/i.test(JSON.stringify(runtimePkg)));

const vscodeSh = fs.readFileSync(path.join(repoRoot, 'run-webagent-vscode.sh'), 'utf8');
assert.ok(/command -v node/.test(vscodeSh), 'vscode sh must check node');
assert.ok(/does not exist/.test(vscodeSh), 'vscode sh must refuse a missing workspace');
assert.ok(!/mkdir/.test(vscodeSh), 'vscode sh must not mkdir a workspace');

assert.ok(fs.existsSync(path.join(repoRoot, 'run-webagent-vscode.cmd')));
assert.ok(fs.existsSync(path.join(repoRoot, 'webagent-core/scripts/run-code-oss.js')));
assert.ok(ensure.includes('bin/code-server-runtime'));
assert.ok(ensure.includes('code-server@4.135.0') || ensure.includes("'code-server': VERSION"));
assert.ok(!ensure.includes('code-server-dist'));
assert.ok(!runner.includes('code-server-dist'));
assert.ok(runner.includes("require('./codeServerAuth')"));
assert.ok(!/'--auth',\s*'none'/.test(runner), 'auth none must not be hardcoded');
assert.ok(!runner.includes("'--trusted-origins',\n    '*'"));
assert.ok(runner.includes('trustedOrigins('));
assert.ok(!runner.includes('--disable-workspace-trust'), 'workspace trust must stay on by default');

console.log('vscode launcher uses npm runtime, not a vendored dist');
