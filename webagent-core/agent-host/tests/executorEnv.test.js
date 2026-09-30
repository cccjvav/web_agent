'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectPosixShell, prepareCommandEnv, executeCommand } = require('../src/tools/executor');
const { config } = require('../src/config');

async function testDetectPosixShell() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-test-'));
  try {
    const fakeShell = path.join(tmp, 'my-custom-sh');
    fs.writeFileSync(fakeShell, '#!/bin/sh\nexit 0', { mode: 0o755 });

    // 1. Explicit SHELL pointing to existing absolute path wins
    assert.strictEqual(detectPosixShell({ SHELL: fakeShell }), fakeShell);

    // 2. Explicit SHELL pointing to non-existent path falls back to bash/sh
    const fallback = detectPosixShell({ SHELL: '/path/does/not/exist/zsh' });
    assert.ok(fallback === '/bin/bash' || fallback === '/usr/bin/bash' || fallback === '/bin/sh');

    // 3. Empty or missing SHELL falls back
    const emptyFallback = detectPosixShell({});
    assert.ok(emptyFallback === '/bin/bash' || emptyFallback === '/usr/bin/bash' || emptyFallback === '/bin/sh');

    // 4. Specific /bin/sh if it exists
    if (fs.existsSync('/bin/sh')) {
      assert.strictEqual(detectPosixShell({ SHELL: '/bin/sh' }), '/bin/sh');
    }
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
