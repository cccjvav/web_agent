'use strict';

const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();
const jobs = new Map();
let clientSeenAt = 0;

const CLIENT_TTL_MS = 8000;
const CONFIRM_TIMEOUT_MS = 90000;

function runWithPty(ctx, fn) {
  return als.run(ctx || {}, fn);
}

function ptyContext() {
  return als.getStore() || null;
}

function wantsPty() {
  const ctx = ptyContext();
  return Boolean(ctx && ctx.pty && !ctx.remote);
}

function noteClient() {
  clientSeenAt = Date.now();
}

function hasClient() {
  return Date.now() - clientSeenAt < CLIENT_TTL_MS;
}

function publicJob(job) {
  return {
    jobId: job.jobId,
    execId: job.execId,
    kind: job.kind,
    command: job.command,
    cwd: job.cwd,
    input: job.input,
    timeoutSec: job.timeoutSec,
    state: job.state
  };
}

function listPending() {
  const out = [];
  for (const job of jobs.values()) {
    if (job.state === 'done') continue;
    out.push(publicJob(job));
  }
  return out;
}

function snapshot() {
  return { clientLive: hasClient(), pending: listPending().length };
}

function armTimer(job, ms) {
  if (job.timer) clearTimeout(job.timer);
  job.timer = setTimeout(() => {
    if (job.state === 'done') return;
    finish(job.jobId, {
      status: 'timeout',
      ok: false,
      message: job.state === 'queued'
        ? 'Timed out waiting for the VS Code plugin to confirm the terminal command.'
        : 'PTY job timed out waiting for the integrated terminal.'
    });
  }, Math.max(1000, ms));
  if (job.timer.unref) job.timer.unref();
}

function enqueue(kind, payload = {}) {
  const jobId = crypto.randomBytes(8).toString('hex');
  const execId = String(payload.execId || jobId);
  return new Promise((resolve) => {
    const job = {
      jobId,
      execId,
      kind: kind || 'run',
      command: payload.command,
      cwd: payload.cwd || '.',
      input: payload.input,
      timeoutSec: payload.timeoutSec || 30,
      state: 'queued',
      stdout: '',
      stderr: '',
      onChunk: typeof payload.onChunk === 'function' ? payload.onChunk : null,
      resolve,
      createdAt: Date.now()
    };
    jobs.set(jobId, job);
    const ctx = ptyContext();
    if (ctx && typeof ctx.emit === 'function') {
      ctx.emit('pty_request', publicJob(job));
    }
    const waitMs = kind === 'run'
      ? CONFIRM_TIMEOUT_MS
      : Math.min(15000, CONFIRM_TIMEOUT_MS);
    armTimer(job, waitMs);
  });
}

function finish(jobId, result = {}) {
  const job = jobs.get(String(jobId));
  if (!job || job.state === 'done') return false;
  job.state = 'done';
  if (job.timer) clearTimeout(job.timer);
  const stdout = result.stdout != null ? String(result.stdout) : job.stdout;
  const stderr = result.stderr != null ? String(result.stderr) : job.stderr;
  job.stdout = stdout;
  job.stderr = stderr;
  const rec = {
    ok: result.ok !== false && result.status !== 'denied' && result.status !== 'error' && result.status !== 'timeout',
    execId: job.execId,
    jobId: job.jobId,
    command: job.command,
    status: result.status || 'done',
    exitCode: result.exitCode,
    stdout,
    stderr,
    durationMs: Date.now() - job.createdAt,
    execution: 'pty',
    outputCaptured: result.outputCaptured !== false,
    message: result.message
  };
  job.resolve(rec);
  return true;
}

function report(jobId, body = {}) {
  const job = jobs.get(String(jobId));
  if (!job) return null;
  const state = String(body.state || '');
  if (state === 'accepted') {
    if (job.state !== 'queued') return { already: true, state: job.state };
    job.state = 'running';
    const cmdMs = Math.max(1000, (Number(job.timeoutSec) || 30) * 1000 + 15000);
    armTimer(job, cmdMs);
    return { accepted: true };
  }
  if (state === 'progress') {
    if (body.stdout) {
      job.stdout += String(body.stdout);
      if (job.onChunk) job.onChunk(String(body.stdout), 'stdout');
    }
    if (body.stderr) {
      job.stderr += String(body.stderr);
      if (job.onChunk) job.onChunk(String(body.stderr), 'stderr');
    }
    if (job.state === 'queued') job.state = 'running';
    return { ok: true };
  }
  if (state === 'done' || state === 'denied' || state === 'error' || state === 'timeout') {
    const status = body.status || (state === 'done' ? 'done' : state);
    finish(job.jobId, {
      status,
      ok: body.ok,
      exitCode: body.exitCode,
      stdout: body.stdout,
      stderr: body.stderr,
      outputCaptured: body.outputCaptured,
      message: body.message
    });
    return { finished: true, status };
  }
  return { ok: false, error: 'unknown state' };
}

function resetForTests() {
  for (const job of jobs.values()) {
    if (job.timer) clearTimeout(job.timer);
    if (job.state !== 'done') {
      job.state = 'done';
      job.resolve({
        ok: false,
        execId: job.execId,
        jobId: job.jobId,
        status: 'cancelled',
        stdout: '',
        stderr: '',
        execution: 'pty',
        message: 'resetForTests'
      });
    }
  }
  jobs.clear();
  clientSeenAt = 0;
}

module.exports = {
  runWithPty,
  ptyContext,
  wantsPty,
  noteClient,
  hasClient,
  listPending,
  snapshot,
  enqueue,
  finish,
  report,
  resetForTests
};
