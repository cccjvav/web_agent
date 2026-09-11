'use strict';
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');
const { currentSignal, checkCancelled } = require('../utils/requestScope');
const als = new AsyncLocalStorage();
const jobs = new Map(), clients = new Map();
let clientSeenAt = 0;
const CLIENT_TTL_MS = 8000, CONFIRM_TIMEOUT_MS = 90000, OUTPUT_LIMIT = 200 * 1024, KEEP_MS = 15 * 60 * 1000;
function runWithPty(ctx, fn) { return als.run(ctx || {}, fn); }
function ptyContext() { return als.getStore() || null; }
function wantsPty() { const ctx = ptyContext(); return Boolean(ctx && ctx.pty && !ctx.remote); }
function canonical(value) {
  let full = path.resolve(value || '.');
  try { full = fs.realpathSync(full); } catch (_) {}
  return process.platform === 'win32' ? full.toLowerCase() : full;
}
function noteClient(info) {
  if (info) {
    if (typeof info.clientId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(info.clientId)
      || typeof info.workspace !== 'string' || canonical(info.workspace) !== canonical(require('../config').config.workspaceRoot)) return false;
    if (!clients.has(info.clientId) && clients.size >= 128) clients.delete(clients.keys().next().value);
    clients.set(info.clientId, Date.now());
  }
  clientSeenAt = Date.now(); return true;
}
function hasClient() { return Date.now() - clientSeenAt < CLIENT_TTL_MS; }
function prune() {
  for (const [id, job] of jobs) if (job.state === 'done' && Date.now() - job.finishedAt > KEEP_MS) jobs.delete(id);
  for (const [id, time] of clients) if (Date.now() - time > CLIENT_TTL_MS) clients.delete(id);
  if (jobs.size >= 256) for (const [id, job] of jobs) {
    if (job.state === 'done') jobs.delete(id);
    if (jobs.size < 256) break;
  }
}
function publicJob(job) {
  return { jobId: job.jobId, execId: job.execId, kind: job.kind, command: job.command,
    cwd: job.cwd, workspaceRoot: job.workspaceRoot, input: job.input, timeoutSec: job.timeoutSec,
    state: job.state, cancelRequested: Boolean(job.cancelRequested) };
}
function listPending(clientId) {
  prune();
  return [...jobs.values()].filter(job => (job.state !== 'done' || (clientId && job.cancelRequested))
    && (!clientId || !job.owner || job.owner === clientId)).map(publicJob);
}
function snapshot() { return { clientLive: hasClient(), pending: listPending().length, retained: jobs.size }; }
function armTimer(job, ms) {
  if (job.timer) clearTimeout(job.timer);
  job.timer = setTimeout(() => {
    if (job.state === 'done') return;
    job.cancelRequested = Boolean(job.owner);
    finish(job.jobId, { status: 'timeout', ok: false, message: 'PTY approval/execution deadline expired' });
  }, Math.max(1000, ms));
  if (job.timer.unref) job.timer.unref();
}
function enqueue(kind, payload = {}) {
  checkCancelled(); prune();
  if (String(payload.command || '').length > 128000 || String(payload.input || '').length > 64000) return Promise.reject(new Error('PTY input too large'));
  if ([...jobs.values()].filter(j => j.state !== 'done').length >= 32) return Promise.reject(new Error('Too many pending PTY jobs'));
  const jobId = crypto.randomBytes(8).toString('hex');
  return new Promise(resolve => {
    const job = { jobId, execId: String(payload.execId || jobId), kind: kind || 'run', command: payload.command,
      workspaceRoot: require('../config').config.workspaceRoot, cwd: payload.cwd || '.', input: payload.input,
      timeoutSec: Math.max(1, Math.min(600, Number(payload.timeoutSec) || 30)), state: 'queued',
      stdout: '', stderr: '', onChunk: typeof payload.onChunk === 'function' ? payload.onChunk : null,
      resolve, createdAt: Date.now(), owner: null };
    jobs.set(jobId, job);
    const signal = currentSignal();
    if (signal) {
      const abort = () => { job.cancelRequested = Boolean(job.owner); finish(jobId, { status: 'cancelled', ok: false, message: 'Request cancelled' }); };
      signal.addEventListener('abort', abort, { once: true });
      job.cleanup = () => signal.removeEventListener('abort', abort);
      if (signal.aborted) { abort(); return; }
    }
    const ctx = ptyContext();
    if (ctx && typeof ctx.emit === 'function') ctx.emit('pty_request', publicJob(job));
    armTimer(job, kind === 'run' ? CONFIRM_TIMEOUT_MS : 15000);
  });
}
function finish(jobId, result = {}) {
  const job = jobs.get(String(jobId));
  if (!job || job.state === 'done') return false;
  job.state = 'done'; job.finishedAt = Date.now();
  clearTimeout(job.timer); if (job.cleanup) job.cleanup();
  job.stdout = String(result.stdout != null ? result.stdout : job.stdout).slice(-OUTPUT_LIMIT);
  job.stderr = String(result.stderr != null ? result.stderr : job.stderr).slice(-OUTPUT_LIMIT);
  const status = result.status || 'done';
  const ok = status === 'done' && result.ok !== false && result.outputCaptured !== false
    && (job.kind === 'run' ? result.exitCode === 0 : result.ok === true);
  job.resolve({ ok, execId: job.execId, jobId: job.jobId, command: job.command,
    status: status === 'done' && !ok ? 'error' : status, exitCode: result.exitCode,
    stdout: job.stdout, stderr: job.stderr, durationMs: Date.now() - job.createdAt,
    execution: 'pty', outputCaptured: result.outputCaptured !== false, message: result.message });
  job.resolve = null; job.onChunk = null; job.cleanup = null;
  return true;
}
function report(jobId, body = {}, clientId) {
  const job = jobs.get(String(jobId));
  if (!job) return null;
  if (clientId && (!clients.has(clientId) || (job.owner && job.owner !== clientId))) return { ok: false, error: 'PTY owner mismatch' };
  const state = String(body.state || '');
  if (job.state === 'done') {
    if (clientId === job.owner && ['cancelled', 'done'].includes(state)) job.cancelRequested = false;
    return { already: true, state: 'done', ok: false };
  }
  if (state === 'check') return { running: job.state === 'running' };
  if (state === 'claimed') {
    if (job.state !== 'queued') return { already: true, state: job.state };
    job.owner = clientId || null; job.state = 'claimed'; return { claimed: true };
  }
  if (state === 'accepted') {
    if (!['queued', 'claimed'].includes(job.state)) return { already: true, state: job.state };
    if (clientId) job.owner = clientId;
    job.state = 'running'; armTimer(job, job.timeoutSec * 1000 + 15000); return { accepted: true };
  }
  if (state === 'progress') {
    if (job.state !== 'running') return { ok: false, error: 'PTY is not running' };
    for (const field of ['stdout', 'stderr']) if (body[field]) {
      const chunk = String(body[field]).slice(-OUTPUT_LIMIT);
      job[field] = (job[field] + chunk).slice(-OUTPUT_LIMIT);
      if (job.onChunk) job.onChunk(chunk, field);
    }
    return { ok: true };
  }
  if (['done', 'denied', 'error', 'timeout', 'cancelled'].includes(state)) {
    const status = body.status || state;
    finish(jobId, { ...body, status }); return { finished: true, status };
  }
  return { ok: false, error: 'unknown state' };
}
function cancelExec(execId) {
  for (const job of jobs.values()) if (job.execId === String(execId) && job.kind === 'run' && job.state !== 'done') {
    job.cancelRequested = Boolean(job.owner); finish(job.jobId, { status: 'cancelled', ok: false });
  }
}
function resetForTests() {
  for (const job of jobs.values()) finish(job.jobId, { status: 'cancelled', ok: false, message: 'resetForTests' });
  jobs.clear(); clients.clear(); clientSeenAt = 0;
}
module.exports = { runWithPty, ptyContext, wantsPty, noteClient, hasClient, listPending, snapshot, enqueue, finish, report, cancelExec, resetForTests };
