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
  vscode.window.createTerminal = () => ({ show() {}, dispose() {}, sendText() { throw new Error('unobserved execution forbidden'); } });
  await assert.rejects(() => host.spawnFallback({ execId: 'no-si' }, tmp), /未执行命令/);
  host.dispose();

  // Real subprocess cancellation is connected to the request scope.
  const commandAbort = new AbortController();
  const running = runWithSignal(commandAbort.signal, () => executeCommand({ command: 'node -e "setInterval(() => {}, 1000)"', timeoutSec: 10 }));
  setTimeout(() => commandAbort.abort(), 100);
  const stopped = await running;
  assert.strictEqual(stopped.status, 'cancelled'); assert.strictEqual(stopped.ok, false);
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
