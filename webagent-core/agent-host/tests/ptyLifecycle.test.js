'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { config } = require('../src/config');
const jobs = require('../src/tools/ptyJobs');
const { runWithSignal, fetchText } = require('../src/utils/requestScope');
const { callTool } = require('../src/tools');
const { executeCommand } = require('../src/tools/executor');
const policy = require('../../extension/ptyPolicy');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-pty-life-'));
config.workspaceRoot = tmp;
(async () => {
  for (const command of ['cat .env', 'type .webagent\\config.json', 'Get-Content ../../../private.txt', 'cat safe.txt', 'git diff', 'git log', 'dd if=/dev/zero of=/dev/sda', 'npm publish', 'Invoke-WebRequest https://example.invalid', 'rm -r folder', 'net user', 'reg add HKCU\\test', 'shutdown /s', 'find . -delete']) {
    for (const state of [{}, { allowSession: true }, { allowedFamilies: new Set(['cat', 'type', 'git', 'dd', 'npm', 'invoke-webrequest', 'get-content']) }]) {
      assert.strictEqual(policy.shouldAutoAllow(command, state).allow, false, command);
    }
  }
  const secrets = ['NGROK_AUTHTOKEN', 'CLOUDFLARE_API_TOKEN', 'CF_TUNNEL_TOKEN', 'AWS_ACCESS_KEY_ID', 'AZURE_STORAGE_KEY', 'ANTHROPIC_AUTH_TOKEN', 'HF_TOKEN', 'WEBAGENT_TELEMETRY_TOKEN', 'WEBAGENT_ADMIN_TOKEN'];
  const env = Object.fromEntries(secrets.map(key => [key, 'test-only']));
  env.PATH = 'keep-path'; env.CONDA_PREFIX = 'keep-conda';
  const scrubbed = policy.scrubEnv(env);
  for (const key of secrets) assert.ok(!(key in scrubbed), key);
  assert.strictEqual(scrubbed.PATH, 'keep-path'); assert.strictEqual(scrubbed.CONDA_PREFIX, 'keep-conda');
  assert.strictEqual(env.HF_TOKEN, 'test-only', 'scrubbing must not mutate caller');
  const executor = require('../src/tools/executor');
  const oldEnqueue = jobs.enqueue;
  let finishLate;
  try {
    jobs.enqueue = kind => kind === 'run' ? new Promise(resolve => { finishLate = resolve; }) : Promise.resolve({ ok: true });
    await jobs.runWithPty({ pty: true, remote: false }, async () => {
      const started = executor.startCommand({ command: 'echo late fixture' });
      await executor.cancelCommand({ execId: started.execId });
      assert.strictEqual(executor.getCommandOutput({ execId: started.execId }).ok, false);
      finishLate({ status: 'done', ok: true, exitCode: 0, outputCaptured: true });
      await new Promise(resolve => setImmediate(resolve));
      const late = executor.getCommandOutput({ execId: started.execId });
      assert.strictEqual(late.status, 'cancelled'); assert.strictEqual(late.ok, false);
    });
  } finally { jobs.enqueue = oldEnqueue; }

  assert.ok(policy.isReadishCommand('git status'));
  assert.strictEqual(policy.isReadishCommand('git branch -D local-test'), false);
  assert.strictEqual(policy.shouldAutoAllow('echo one; echo two', { allowSession: true }).allow, false);
  assert.strictEqual(policy.shouldAutoAllow('git status | cat', { allowedFamilies: new Set(['git']) }).allow, false);
  assert.strictEqual(jobs.noteClient({ clientId: 'client-AAAA', workspace: path.dirname(tmp) }), false);
  assert.ok(jobs.noteClient({ clientId: 'client-AAAA', workspace: tmp }));
  assert.ok(jobs.noteClient({ clientId: 'client-BBBB', workspace: tmp }));
  const pending = jobs.enqueue('run', { command: 'echo fixture' });
  const job = jobs.listPending()[0];
  assert.ok(jobs.report(job.jobId, { state: 'claimed' }, 'client-AAAA').claimed);
  assert.strictEqual(jobs.report(job.jobId, { state: 'accepted' }, 'client-BBBB').ok, false);
  jobs.finish(job.jobId, { status: 'timeout', ok: false });
  assert.ok(jobs.report(job.jobId, { state: 'accepted' }, 'client-AAAA').already);
  assert.strictEqual((await pending).ok, false);
  assert.ok(jobs.report(job.jobId, { state: 'progress', stdout: 'late' }, 'client-AAAA').already);
  for (const result of [{ status: 'done', exitCode: 2 }, { status: 'done', outputCaptured: false, exitCode: 0 }, { status: 'cancelled', exitCode: 0 }, { status: 'done' }]) {
    const p = jobs.enqueue('run', { command: 'echo fixture' });
    const j = jobs.listPending()[0]; jobs.finish(j.jobId, result);
    assert.strictEqual((await p).ok, false);
  }
  const p = jobs.enqueue('run', { command: 'echo fixture' });
  const j = jobs.listPending()[0]; jobs.report(j.jobId, { state: 'accepted' });
  jobs.report(j.jobId, { state: 'progress', stdout: 'x'.repeat(500000) });
  jobs.finish(j.jobId, { status: 'done', exitCode: 0 });
  assert.ok((await p).stdout.length <= 200 * 1024);
  const controller = new AbortController();
  const cancelled = runWithSignal(controller.signal, () => jobs.enqueue('run', { command: 'echo fixture' }));
  controller.abort(); assert.strictEqual((await cancelled).status, 'cancelled');
  await assert.rejects(() => runWithSignal(controller.signal, () => callTool('write_file', { filePath: 'never.txt', content: 'no' }, 'code')), /取消/);
  assert.ok(!fs.existsSync(path.join(tmp, 'never.txt')));

  // Real host code: an approval answered after server timeout must not spawn.
  const originalLoad = Module._load;
  const vscode = { workspace: { workspaceFolders: [{ uri: { fsPath: tmp } }] }, env: {}, window: {} };
  Module._load = function(name, ...rest) {
    if (name === 'vscode') return vscode;
    return originalLoad.call(this, name, ...rest);
  };
  let PtyHost;
  try { ({ PtyHost } = require('../../extension/ptyHost')); } finally { Module._load = originalLoad; }
  const host = new PtyHost({ agentHostUrl: () => 'http://127.0.0.1', requestJson: async (_, url, body) => {
    assert.ok(jobs.noteClient(body));
    return { status: 200, json: jobs.report(url.split('/').pop(), body, body.clientId) };
  } });
  // Polling must not turn a rejected/malformed host response into an empty successful queue.
  const pollReplies = [
    { status: 200, json: { jobs: [{ jobId: 'poll-fixture' }] } },
    { status: 409, json: { ok: false, error: 'workspace mismatch' } },
    { status: 200, json: { jobs: null } }
  ];
  const pollHost = new PtyHost({ agentHostUrl: () => 'http://127.0.0.1', requestJson: async () => pollReplies.shift() });
  const polledJobs = [];
  pollHost.handleIncoming = async job => { polledJobs.push(job.jobId); };
  await pollHost.poll();
  assert.deepStrictEqual(polledJobs, ['poll-fixture']);
  assert.strictEqual(pollHost.pendingHint, 1);
  await pollHost.poll();
  assert.strictEqual(pollHost.pendingHint, 1, 'HTTP rejection preserves the last confirmed pending count');
  await pollHost.poll();
  assert.strictEqual(pollHost.pendingHint, 1, 'malformed JSON cannot publish an empty queue');
  pollHost.dispose();

  const rejectedClaimHost = new PtyHost({agentHostUrl:()=>'',requestJson:async()=>({})});
  let rejectedSpawns=0,rejectedConfirms=0;
  rejectedClaimHost.confirm=async()=>{rejectedConfirms++;return true;};
  rejectedClaimHost.spawn=async()=>{rejectedSpawns++;};
  rejectedClaimHost.postJob=async()=>({status:409,json:{claimed:true,accepted:true}});
  await rejectedClaimHost.handleRun({jobId:'rejected-claim',execId:'rejected-claim',command:'echo no',workspaceRoot:tmp});
  assert.strictEqual(rejectedConfirms,0);assert.strictEqual(rejectedSpawns,0,'an HTTP rejection cannot authorize PTY work');
  let claimStep=0;
  rejectedClaimHost.postJob=async()=>++claimStep===1?{status:200,json:{claimed:true}}:{status:409,json:{accepted:true}};
  await rejectedClaimHost.handleRun({jobId:'rejected-accept',execId:'rejected-accept',command:'echo no',workspaceRoot:tmp});
  assert.strictEqual(rejectedConfirms,1);assert.strictEqual(rejectedSpawns,0,'an HTTP-rejected acceptance cannot spawn');
  rejectedClaimHost.dispose();

  let approve, spawned = 0;
  host.confirm = () => new Promise(resolve => { approve = resolve; });
  host.spawn = async () => { spawned++; };
  const waiting = jobs.enqueue('run', { command: 'echo fixture' });
  const waitingJob = jobs.listPending()[0];
  const handling = host.handleRun(waitingJob);
  await new Promise(resolve => setImmediate(resolve));
  jobs.finish(waitingJob.jobId, { status: 'timeout', ok: false });
  approve(true); await handling; await waiting;
  assert.strictEqual(spawned, 0);
  await host.handleIncoming({ ...waitingJob, jobId: 'other', workspaceRoot: path.dirname(tmp) });
  assert.strictEqual(spawned, 0);
  const reports = [];
  host.postJob = async (_, body) => { reports.push(body); return { json: { running: true } }; };
  let ended;
  vscode.window.onDidEndTerminalShellExecution = fn => { ended = fn; return { dispose() {} }; };
  const execution = { async *read() { yield 'output'; queueMicrotask(() => ended({ execution, exitCode: 3 })); } };
  await host.runShellIntegration({ executeCommand: () => execution }, { jobId: 'fixture', execId: 'fixture', command: 'echo fixture', timeoutSec: 2 }, { dispose() {} });
  assert.strictEqual(reports.at(-1).status, 'error');
  assert.strictEqual(reports.at(-1).exitCode, 3);
  vscode.window.createTerminal = options => { assert.strictEqual(options.strictEnv, true, 'terminal must not merge deleted credentials back from parent'); return { show() {}, dispose() {}, sendText() { throw new Error('unobserved execution forbidden'); } }; };
  await assert.rejects(() => host.spawnFallback({ execId: 'no-si' }, tmp), /未执行命令/);
  host.dispose();

  // Saturated output must have one progress request in flight, then a final snapshot.
  vscode.EventEmitter = class { constructor() { this.event = () => {}; } fire() {} dispose() {} };
  vscode.window.createTerminal = () => ({ show() {}, dispose() {} });
  let onData, onExit, releaseProgress, scriptPath;
  const posted = [];
  const streamHost = new PtyHost({ agentHostUrl: () => '', requestJson: async () => ({}) });
  streamHost.postJob = async (_, body) => {
    posted.push(body);
    if (body.state === 'progress') await new Promise(resolve => { releaseProgress = resolve; });
  };
  const fakePty = { spawn(shell, args) {
    if (args.includes('-File')) scriptPath = args.at(-1);
    return { onData(fn) { onData = fn; }, onExit(fn) { onExit = fn; }, kill() {}, write() {} };
  } };
  streamHost.spawnNodePty(fakePty, { jobId: 'pressure', execId: 'pressure', command: 'x'.repeat(500) }, tmp);
  if (scriptPath) assert.ok(fs.readFileSync(scriptPath, 'utf8').startsWith('\uFEFF'));
  for (let i = 0; i < 1000; i++) onData('x'.repeat(400));
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.strictEqual(posted.length, 1);
  for (let i = 0; i < 1000; i++) onData('y'.repeat(400));
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.strictEqual(posted.length, 1, 'progress must not create concurrent requests');
  const finished = onExit({ exitCode: 0 });
  assert.strictEqual(posted.length, 1, 'final result waits for outstanding progress');
  releaseProgress(); await finished;
  assert.strictEqual(posted.at(-1).state, 'done');
  assert.ok(posted.at(-1).stdout.length <= 200 * 1024);
  if (scriptPath) assert.ok(!fs.existsSync(path.dirname(scriptPath)), 'normal exit removes private temporary directory');
  assert.throws(() => streamHost.spawnNodePty({ spawn(shell, args) {
    if (args.includes('-File')) scriptPath = args.at(-1);
    throw new Error('fixture spawn failure');
  } }, { jobId: 'fail', execId: 'fail', command: 'x'.repeat(500) }, tmp), /fixture spawn failure/);
  if (scriptPath) assert.ok(!fs.existsSync(path.dirname(scriptPath)), 'spawn failure removes private temporary directory');
  streamHost.spawnNodePty(fakePty, { jobId: 'dispose', execId: 'dispose', command: 'x'.repeat(500) }, tmp);
  streamHost.dispose();
  if (scriptPath) assert.ok(!fs.existsSync(path.dirname(scriptPath)), 'dispose cleans up without an onExit callback');

  process.env.WEBAGENT_DEBUG_PROCESS = '1';
  console.log('PTY fixture: approval and shell-integration checks completed');
  // Real subprocess cancellation is connected to the request scope.
  const eventBus = require('../src/utils/eventBus');
  for (const delay of [50, 100, 200, 400, 'ready']) {
    const cancellationStarted = Date.now();
    const commandAbort = new AbortController();
    let readySeen = false;
    const onOutput = event => {
      if (String(event.chunk).includes('246813579')) {
        readySeen = true;
        if (delay === 'ready') commandAbort.abort();
      }
    };
    eventBus.on('command_output', onOutput);
    const running = runWithSignal(commandAbort.signal, () => executeCommand({ command: 'node -e "console.log(246813579);setTimeout(() => {}, 30000)"', timeoutSec: 10 }));
    const timer = setTimeout(() => commandAbort.abort(), delay === 'ready' ? 8000 : delay);
    let stopped;
    try { stopped = await running; }
    finally { clearTimeout(timer); eventBus.removeListener('command_output', onOutput); }
    console.log('PTY cancellation', delay, 'elapsed', Date.now() - cancellationStarted, 'readySeen', readySeen);
    assert.ok(Date.now() - cancellationStarted < 10000, 'Cancellation must close captured subprocess pipes promptly, not wait for natural exit');
    if (delay === 'ready') assert.ok(readySeen, 'must also cancel a confirmed running descendant');
    assert.strictEqual(stopped.status, 'cancelled'); assert.strictEqual(stopped.ok, false);
  }
  if (process.platform === 'win32') {
    const startedAt = Date.now();
    const orphanGuard = await executeCommand({
      command: 'node -e "console.log(975318642);setTimeout(()=>process.kill(process.ppid),100);setTimeout(()=>{},30000)"',
      timeoutSec: 10
    });
    assert.ok(orphanGuard.stdout.includes('975318642'), 'descendant must actually have started');
    assert.ok(Date.now() - startedAt < 10000, 'OS job must close descendant pipes after root-only termination, without taskkill /T');
    assert.strictEqual(orphanGuard.ok, false);
  }
  const oldFetch = global.fetch;
  try {
    global.fetch = (_, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('request aborted')), { once: true });
    });
    // Keep the test alive; production requests have sockets keeping the loop alive.
    const keep = setTimeout(() => {}, 1000);
    try { await assert.rejects(() => fetchText('https://model.invalid', {}, 30), /aborted/); }
    finally { clearTimeout(keep); }
  } finally { global.fetch = oldFetch; }
  console.log('PTY ownership/approval/result/capture/cancellation and request deadline tests passed');
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => {
  jobs.resetForTests(); fs.rmSync(tmp, { recursive: true, force: true });
});
