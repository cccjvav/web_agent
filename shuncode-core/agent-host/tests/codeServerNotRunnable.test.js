const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');
const csRoot = path.join(repoRoot, 'bin/code-server-dist/lib/code-server-4.135.0');

assert.ok(fs.existsSync(path.join(csRoot, 'package.json')), 'vendored package.json should exist');
const pkg = JSON.parse(fs.readFileSync(path.join(csRoot, 'package.json'), 'utf8'));
assert.strictEqual(pkg.name, 'code-server');
assert.strictEqual(pkg.version, '4.135.0');

assert.ok(!fs.existsSync(path.join(csRoot, 'out')), 'compiled out/ is missing — this tree cannot boot');
assert.ok(!fs.existsSync(path.join(csRoot, 'node_modules')), 'node_modules is missing');
assert.ok(!fs.existsSync(path.join(csRoot, 'lib/node')), 'bundled node binary is missing');
assert.ok(!fs.existsSync(path.join(csRoot, 'lib/vscode/out')), 'VS Code workbench build is missing');

const launchers = [
  fs.readFileSync(path.join(repoRoot, 'run-shuncode.cmd'), 'utf8'),
  fs.readFileSync(path.join(repoRoot, 'run-shuncode.sh'), 'utf8')
].join('\n');
assert.ok(!/code-server/i.test(launchers), 'run-shuncode must not start code-server');
assert.ok(/agent-host/.test(launchers));

console.log('code-server layout is not a runnable product path');
