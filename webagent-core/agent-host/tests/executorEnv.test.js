'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectPosixShell, commandShellContract, prepareCommandEnv, executeCommand } = require('../src/tools/executor');
const { config } = require('../src/config');

async function testDetectPosixShell() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-test-'));
  try {
    const fakeShell = path.join(tmp, 'my-custom-sh');
    fs.writeFileSync(fakeShell, '#!/bin/sh\nexit 0', { mode: 0o755 });

    // 0. The model-facing contract names the shell the executor really uses (F129).
    const windows = commandShellContract('win32');
    for (const fact of ['Windows PowerShell 5.1', 'powershell.exe -NoProfile', 'not CMD, bash or pwsh 7', 'no && or ||', '$env:NAME', 'Do not wrap it in another powershell -Command, cmd /c or bash -lc layer', 'overrides the Shell preference']) assert.ok(windows.includes(fact), fact);
    const bashLine = commandShellContract('linux', {}, p => p === '/bin/bash');
    assert.ok(bashLine.includes('/bin/bash -c') && bashLine.includes('bash syntax is available') && bashLine.includes('$SHELL -lc'));
    const shLine = commandShellContract('linux', { SHELL: '/usr/bin/fish' }, p => p === '/bin/sh' || p === '/usr/bin/fish');
    assert.ok(shLine.includes('/bin/sh -c') && shLine.includes('plain POSIX sh'), 'a non-POSIX login shell is never named as the -c shell');
    // 1. bash is preferred over $SHELL (pre-F104 behaviour)
    assert.strictEqual(detectPosixShell({ SHELL: fakeShell }, ['/bin/bash', fakeShell].includes.bind(['/bin/bash', fakeShell])), '/bin/bash');
    // 2. No bash: an absolute POSIX-named SHELL is honoured
    const dash = path.join(tmp, 'dash');
    assert.strictEqual(detectPosixShell({ SHELL: dash }, [dash, '/bin/sh'].includes.bind([dash, '/bin/sh'])), dash);
    // 3. Non-POSIX interactive shells (fish/zsh/nu/csh) are never used for -c
    for (const name of ['fish', 'zsh', 'nu', 'csh']) {
      const p = path.join(tmp, name);
      assert.strictEqual(detectPosixShell({ SHELL: p }, [p, '/bin/sh'].includes.bind([p, '/bin/sh'])), '/bin/sh');
    }
    // 4. Relative SHELL is ignored
    assert.strictEqual(detectPosixShell({ SHELL: './sh' }, ['./sh', '/usr/bin/sh'].includes.bind(['./sh', '/usr/bin/sh'])), '/usr/bin/sh');
    // 5. Alpine-like: only /bin/sh
    assert.strictEqual(detectPosixShell({}, ['/bin/sh'].includes.bind(['/bin/sh'])), '/bin/sh');
    // 6. Missing SHELL falls back on the real system
    const real = detectPosixShell({});
    assert.ok(['/bin/bash', '/usr/bin/bash', '/bin/sh', '/usr/bin/sh'].includes(real));
    void fakeShell;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testPrepareCommandEnv() {
  const input = {
    PATH: '/usr/local/bin:/usr/bin',
    HOME: '/home/testuser',
    GITHUB_TOKEN: 'ghp_secret12345',
    AZURE_STORAGE_KEY: 'storage_secret',
    MY_API_KEY: 'api_secret',
    CUSTOM_VAR: 'normal_value'
  };

  // Test POSIX with default CI
  const r1 = prepareCommandEnv(input, false);
  assert.strictEqual(r1.env.CI, 'true');
  assert.strictEqual(r1.env.TERM, 'xterm-256color');
  assert.strictEqual(r1.env.FORCE_COLOR, '1');
  assert.strictEqual(r1.env.CUSTOM_VAR, 'normal_value');
  assert.strictEqual(r1.env.GITHUB_TOKEN, undefined);
  assert.strictEqual(r1.env.AZURE_STORAGE_KEY, undefined);
  assert.strictEqual(r1.env.MY_API_KEY, undefined);
  assert.deepStrictEqual(r1.stripped, ['AZURE_STORAGE_KEY', 'GITHUB_TOKEN', 'MY_API_KEY']);
  assert.ok(r1.injected.includes('CI=true'));
  assert.ok(r1.injected.includes('TERM=xterm-256color'));
  assert.ok(r1.injected.includes('FORCE_COLOR=1'));
  assert.strictEqual(r1.injected.includes('PYTHONIOENCODING=utf-8'), false);

  // Test with user-specified CI and Windows flag
  const input2 = {
    ...input,
    CI: 'false',
    TERM: 'dumb',
    FORCE_COLOR: '0'
  };
  const r2 = prepareCommandEnv(input2, true);
  assert.strictEqual(r2.env.CI, 'false');
  assert.strictEqual(r2.env.TERM, 'dumb');
  assert.strictEqual(r2.env.FORCE_COLOR, '0');
  assert.strictEqual(r2.env.PYTHONIOENCODING, 'utf-8');
  assert.strictEqual(r2.injected.includes('CI=true'), false);
  assert.ok(r2.injected.includes('PYTHONIOENCODING=utf-8'));
}

async function testExecuteCommandEnvSummary() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-summary-'));
  const oldRoot = config.workspaceRoot;
  config.workspaceRoot = tmp;
  try {
    const res = await executeCommand({ command: 'echo "testing env summary"', timeoutSec: 10 });
    assert.strictEqual(res.ok, true);
    assert.ok(res.envSummary, 'envSummary must be present on execution record');
    assert.ok(Array.isArray(res.envSummary.stripped), 'envSummary.stripped must be an array');
    assert.ok(Array.isArray(res.envSummary.injected), 'envSummary.injected must be an array');
  } finally {
    config.workspaceRoot = oldRoot;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  await testDetectPosixShell();
  testPrepareCommandEnv();
  await testExecuteCommandEnvSummary();
  console.log('executorEnv tests passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
