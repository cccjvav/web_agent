'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const testsDir = path.join(root, 'tests');

if (!fs.existsSync(path.join(root, 'node_modules', 'express'))) {
  console.error('缺少依赖。先在 webagent-core/agent-host 跑：npm install');
  process.exit(2);
}

const preferred = [
  'documentationPolicy.test.js',
  'documentationQuality.test.js',
  'documentationLearning.test.js',
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
  'extensionCopy.test.js',
  'ptyJobs.test.js'
];

const found = fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.js'));
const extra = found.filter((f) => !preferred.includes(f)).sort();
const missing = preferred.filter((f) => !found.includes(f));
let filter = '';
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--filter=') && arg.slice(9)) filter = arg.slice(9);
  else {
    console.error('Usage: npm test -- --filter=filename-substring');
    process.exit(2);
  }
}
if (missing.length) {
  console.error('missing preferred files:', missing.join(', '));
  process.exit(1);
}
const files = [...preferred, ...extra].filter(f => !filter || f.includes(filter));
if (!files.length) {
  console.error(`No test files match filter: ${filter}`);
  process.exit(2);
}
const timeout = Number(process.env.WEBAGENT_TEST_TIMEOUT_MS || 120000);
if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 600000) {
  console.error('WEBAGENT_TEST_TIMEOUT_MS must be an integer from 1000 to 600000.');
  process.exit(2);
}

let failed = 0;
const results = [];
for (const f of files) {
  console.log(`\n—— ${f} ——`);
  const r = spawnSync(process.execPath, [path.join(testsDir, f)], {
    cwd: root,
    stdio: 'inherit',
    timeout
  });
  if (r.error) console.error(`${f}: ${r.error.message}`);
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
if (failed) {
  console.error(`\n${failed}/${files.length} test files failed`);
  process.exit(1);
}
console.log(`\n${files.length} test files passed`);
