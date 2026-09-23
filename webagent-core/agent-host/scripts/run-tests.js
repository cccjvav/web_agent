'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Preserve small, typed lifecycle metadata even when raw head/tail excerpts miss the middle.
// This is a diagnostic hint, not authenticated evidence or an automatic retry decision.
function lifecycleSummary(stderr) {
  const rows = [];
  const events = new Set(['created', 'spawn', 'exit', 'close', 'error', 'cancel', 'timeout', 'stdout-first', 'stderr-first',
    'online', 'ready', 'scan-start', 'result', 'failed', 'termination-error', 'released', 'callback', 'invalid-json', 'invalid-shape', 'decoded']);
  const errorCodes = new Set(['ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', 'other']);
  const pattern = /(?:^|\n)(process lifecycle |tunnel helper )([^\r\n]{1,4096})\r?(?=\n|$)/g;
  const text = typeof stderr === 'string' ? stderr.slice(0, 16 * 1024 * 1024) : '';
  for (const match of text.matchAll(pattern)) {
    try {
      const input = JSON.parse(match[2]);
      if (!input || typeof input !== 'object' || Array.isArray(input) || !events.has(input.event)) continue;
      const helper = match[1] === 'tunnel helper ';
      if (helper ? !['protect', 'unprotect', 'inspect'].includes(input.operation) : !['command', 'search'].includes(input.kind)) continue;
      const row = { kind: helper ? 'tunnel' : input.kind, event: input.event };
      if (helper) row.operation = input.operation;
      for (const key of ['id', 'pid', 'childPid', 'threadId', 'elapsedMs', 'stdoutBytes', 'stderrBytes', 'activeSearches', 'exitCode', 'count', 'rejected']) {
        const value = input[key];
        if (Number.isSafeInteger(value) && (value >= 0 || key === 'exitCode' || key === 'threadId')) row[key] = value;
      }
      for (const key of ['spawned', 'exited', 'online', 'ready', 'killed', 'helperStarted', 'helperReady', 'helperCompleted']) {
        if (typeof input[key] === 'boolean') row[key] = input[key];
      }
      if (helper && errorCodes.has(input.errorCode)) row.errorCode = input.errorCode;
      if (helper && ['SIGTERM', 'SIGKILL'].includes(input.signal)) row.signal = input.signal;
      rows.push(row);
      while (rows.length > 6 || JSON.stringify(rows).length > 1800) rows.shift();
    } catch (_) { /* Malformed/oversized/untrusted log lines cannot break the runner. */ }
  }
  return rows;
}

const root = path.resolve(__dirname, '..');
const testsDir = path.join(root, 'tests');

const missingDependencies = ['express', 'acorn'].filter(name => !fs.existsSync(path.join(root, 'node_modules', name, 'package.json')));
if (missingDependencies.length) {
  console.error('缺少测试依赖：' + missingDependencies.join(', ') + '。先在 webagent-core/agent-host 跑：npm ci --include=dev --no-audit --no-fund');
  process.exit(2);
}

const preferred = [
  'documentationPolicy.test.js',
  'documentationQuality.test.js',
  'documentationLearning.test.js',
  'patchEngine.test.js',
  'mcpProtocol.test.js',
  'mcpInterop.test.js',
  'workspaceTools.test.js',
  'sensitiveBoundary.test.js',
  'textEncoding.test.js',
  'diffBudget.test.js',
  'sandbox.test.js',
  'hostPersist.test.js',
  'tunnel.test.js',
  'bridgeTunnel.test.js',
  'apiFiles.test.js',
  'localControl.test.js',
  'eventBus.test.js',
  'corsAllow.test.js',
  'githubAuth.test.js',
  'networkBudget.test.js',
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
  'oauthSpentRefreshBudget.test.js',
  'identityRequestLifetime.test.js',
  'docsSite.test.js',
  'workbenchHtml.test.js',
  'dangerousCommands.test.js',
  'commandEncoding.test.js',
  'hostShutdown.test.js',
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
  const context = {file:f,node:process.version,platform:process.platform,arch:process.arch,timeoutMs:timeout};
  console.log('[test-context] ' + JSON.stringify(context));
  const started = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [path.join(testsDir, f)], {
    cwd: root,
    stdio: process.env.GITHUB_ACTIONS === 'true' ? 'pipe' : 'inherit',
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout
  });
  const diagnostic = { ...context, elapsedMs:Number((process.hrtime.bigint()-started)/1000000n),
    status:r.status,signal:r.signal || null,errorCode:r.error?.code || null,
    stdoutBytes:typeof r.stdout === 'string' ? Buffer.byteLength(r.stdout) : null,
    stderrBytes:typeof r.stderr === 'string' ? Buffer.byteLength(r.stderr) : null };
  console.log('[test-result] ' + JSON.stringify(diagnostic));
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.error) console.error(`${f}: ${r.error.message}`);
  const code = r.status == null ? 1 : r.status;
  const ok = code === 0;
  if (!ok) {
    failed += 1;
    if (process.env.GITHUB_ACTIONS === 'true') {
      const stages = lifecycleSummary(r.stderr);
      const detail = [JSON.stringify(diagnostic), stages.length ? '[lifecycle-summary] ' + JSON.stringify(stages) : '', r.error?.message || '', String(r.stderr || '').slice(0, 1600), String(r.stderr || '').slice(-1000), String(r.stdout || '').slice(-1000)].join('\n').slice(0, 4500).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
      console.log(`::error title=${f}::${detail}`);
    }
  }
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
