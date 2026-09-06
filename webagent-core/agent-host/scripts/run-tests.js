'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const testsDir = path.join(root, 'tests');

const preferred = [
  'patchEngine.test.js',
  'mcpProtocol.test.js',
  'workspaceTools.test.js',
  'sandbox.test.js',
  'hostPersist.test.js',
  'tunnel.test.js',
  'bridgeTunnel.test.js',
  'apiFiles.test.js',
  'localControl.test.js',
  'eventBus.test.js',
  'corsAllow.test.js',
  'githubAuth.test.js',
  'usageTracker.test.js',
  'adminHost.test.js',
  'providers.test.js',
  'httpSmoke.test.js',
  'codeServerNotRunnable.test.js',
  'codeServerAuth.test.js',
  'skipWorkbench.test.js',
  'planRound.test.js',
  'runChat.test.js',
  'chatMode.test.js',
  'toolLabel.test.js',
  'profile.test.js',
  'oauth.test.js',
  'docsSite.test.js',
  'workbenchHtml.test.js',
  'dangerousCommands.test.js',
  'extensionCopy.test.js'
];

const found = fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.js'));
const extra = found.filter((f) => !preferred.includes(f)).sort();
const missing = preferred.filter((f) => !found.includes(f));
const files = [...preferred.filter((f) => found.includes(f)), ...extra];

let failed = 0;
const results = [];
for (const f of files) {
  console.log(`\n—— ${f} ——`);
  const r = spawnSync(process.execPath, [path.join(testsDir, f)], {
    cwd: root,
    stdio: 'inherit'
  });
  const code = r.status == null ? 1 : r.status;
  const ok = code === 0;
  if (!ok) failed += 1;
  results.push({ file: f, ok, code });
  console.log(ok ? `PASS ${f}` : `FAIL ${f} exit ${code}`);
}

console.log('\n—— summary ——');
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.file}`);
}
if (missing.length) {
  console.log('missing preferred files:', missing.join(', '));
}
if (failed) {
  console.error(`\n${failed}/${files.length} test files failed`);
  process.exit(1);
}
console.log(`\n${files.length} test files passed`);
