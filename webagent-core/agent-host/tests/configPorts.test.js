'use strict';
// F98 (2026-09-29 review P3-1): AGENT_HOST_PORT / WORKBENCH_PORT were parseInt'ed without
// validation, so `48271x` silently became 48271, `-1`/`70000`/`abc` reached server.listen and
// failed there with a Node RangeError that never named the variable. config.js now rejects them
// by name at load time; 0 (ephemeral) and the unset/empty fallbacks keep working.
const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const hostDir = path.resolve(__dirname, '..');

function loadConfig(env) {
  const result = spawnSync(process.execPath, ['-e', 'const { config } = require("./src/config"); console.log(JSON.stringify({ port: config.port, workbenchPort: config.workbenchPort }));'], {
    cwd: hostDir,
    env: { ...process.env, WORKSPACE_ROOT: hostDir, AGENT_HOST_PORT: '', WORKBENCH_PORT: '', ...env },
    encoding: 'utf8',
    windowsHide: true
  });
  return { status: result.status, out: result.stdout.trim(), err: result.stderr };
}

let ok = loadConfig({});
assert.strictEqual(ok.status, 0, ok.err);
assert.deepStrictEqual(JSON.parse(ok.out), { port: 48271, workbenchPort: 3000 }, 'unset/empty variables keep the documented defaults');

ok = loadConfig({ AGENT_HOST_PORT: '0', WORKBENCH_PORT: ' 51234 ' });
assert.strictEqual(ok.status, 0, ok.err);
assert.deepStrictEqual(JSON.parse(ok.out), { port: 0, workbenchPort: 51234 }, '0 is the ephemeral port; surrounding whitespace is tolerated');

for (const [name, value] of [['AGENT_HOST_PORT', '48271x'], ['AGENT_HOST_PORT', 'abc'], ['AGENT_HOST_PORT', '-1'],
  ['AGENT_HOST_PORT', '70000'], ['WORKBENCH_PORT', '3000.5'], ['WORKBENCH_PORT', '0x1F90']]) {
  const bad = loadConfig({ [name]: value });
  assert.notStrictEqual(bad.status, 0, `${name}=${value} must be rejected`);
  assert.ok(bad.err.includes(`${name} must be an integer between 0 and 65535`), `the error names the variable: ${bad.err.slice(0, 300)}`);
  assert.ok(bad.err.includes(JSON.stringify(value)), 'and quotes the offending value');
}

console.log('config port validation passed');
