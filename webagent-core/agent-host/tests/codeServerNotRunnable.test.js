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
assert.ok(!/mkdir/.test(sh), 'source shell must not create an implicit workspace');
assert.ok(sh.includes('${WORKSPACE_ROOT:-$ROOT}'), 'source shell default must be repository root');
assert.ok(/existing directory/.test(sh), 'sh must refuse a missing custom workspace');

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
assert.ok(ensure.includes('productVersion()'), 'syncExtension must read the extension version');
assert.ok(!ensure.includes('webagent.webagent-core-0.7.0'), 'do not hardcode the extension dest folder');
assert.ok(!ensure.includes('code-server-dist'));
assert.ok(!runner.includes('code-server-dist'));
assert.ok(runner.includes("require('./codeServerAuth')"));
assert.ok(!/'--auth',\s*'none'/.test(runner), 'auth none must not be hardcoded');
assert.ok(!runner.includes("'--trusted-origins',\n    '*'"));
assert.ok(runner.includes('trustedOrigins('));
assert.ok(!runner.includes('--disable-workspace-trust'), 'workspace trust must stay on by default');

const testRunner = fs.readFileSync(
  path.join(repoRoot, 'webagent-core/agent-host/scripts/run-tests.js'),
  'utf8'
);
assert.ok(testRunner.includes("node_modules', 'express'") || testRunner.includes('node_modules/express'));
assert.ok(testRunner.includes('process.exit(2)'));

console.log('vscode launcher uses npm runtime, not a vendored dist');

if (process.platform !== 'win32') {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'webagent-shell-'));
  try {
    const bin = path.join(tmp, 'fake-bin'); fs.mkdirSync(bin);
    fs.mkdirSync(path.join(tmp, 'work space'));
    fs.writeFileSync(path.join(bin, 'node'), '#!/bin/sh\nprintf "WS=%s\\n" "$WORKSPACE_ROOT"\n', { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    for (const script of ['run-webagent.sh', 'run-webagent-vscode.sh']) {
      const result = require('child_process').spawnSync('bash', [path.join(repoRoot, script), 'work space'], {
        cwd: tmp, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH }, encoding: 'utf8', timeout: 5000
      });
      assert.strictEqual(result.status, 0, result.stderr);
      assert.ok(result.stdout.includes('WS=' + path.join(tmp, 'work space')), result.stdout);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
