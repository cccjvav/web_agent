'use strict';
const { randomUUID, createHash } = require('crypto');
const { runWithSignal, checkCancelled } = require('./requestScope');
const { withTask, beginCall, finishCall, isToolFailure } = require('./toolTrace');
const handlers = new Map(), jobs = new Map();
const MAX_RESULT = 256 * 1024, MAX_INPUT = 32 * 1024, KEEP_MS = 15 * 60 * 1000, MAX_JOBS = 40;
function register(kind, handler) { handlers.set(kind, handler); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function prune() {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (job.status === 'waiting-approval' && now - job.createdAt > KEEP_MS) {
      job.status = 'expired';
      job.finishedAt = now;
    }
  }
  for (const [id, job] of jobs) {
    const retentionStart = job.finishedAt ?? job.createdAt;
    // Never trade away a still-queryable result or request-key tombstone for availability.
    // New submissions fail closed at MAX_JOBS until an entire retention window has elapsed.
    if (!['waiting-approval', 'running'].includes(job.status) && now - retentionStart > KEEP_MS) jobs.delete(id);
  }
}
function owner(options) {
  if (options.remote && !String(options.callerKey || '').startsWith('peer:')) throw new Error('E_SESSION_REQUIRED: initialize and retain Mcp-Session-Id');
  return options.callerKey || 'local';
}
function publicJob(job, details = false) {
  return { requestId: job.id, kind: job.kind, status: job.status, taskId: job.taskId,
    createdAt: job.createdAt, ...(job.startedAt != null ? { startedAt: job.startedAt } : {}), ...(job.finishedAt != null ? { finishedAt: job.finishedAt } : {}),
    expiresAt: (job.finishedAt ?? job.startedAt ?? job.createdAt) + KEEP_MS,
    nextAction: job.status === 'waiting-approval' ? 'Stop and wait for local operator approval; query operation_result, do not resubmit.' : 'Inspect result. Retention is bounded and process-local; an unknown/expired ID is never permission to replay.',
    cancelRequested: Boolean(job.cancelRequested || job.controller?.signal.aborted),
    ...(details ? { input: clone(job.input), result: job.result == null ? null : clone(job.result) } : {}) };
}
function submit(kind, input, options, requestKey) {
  checkCancelled(); prune();
  const control = require('./executionControl');
  const workMode = options.remote || control.snapshot().mode === 'bridge' ? 'bridge' : 'chat';
  const release = control.enter(workMode); release();
  if (!handlers.has(kind)) throw new Error('Unsupported operation');
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(requestKey || '')) throw new Error('requestKey requires 8–80 letters/digits/_/-; reuse it only for the same operation');
  const caller = owner(options);
  const encoded = JSON.stringify(input);
  if (Buffer.byteLength(encoded) > MAX_INPUT) throw new Error('Operation input exceeds 32 KiB');
  const digest = createHash('sha256').update(kind + ':' + encoded).digest('hex');
  for (const job of jobs.values()) if (job.owner === caller && job.requestKey === requestKey) {
    if (job.digest !== digest) throw new Error('E_REQUEST_CONFLICT: same requestKey has different input');
    return publicJob(job);
  }
  if ([...jobs.values()].filter(job => ['waiting-approval', 'running'].includes(job.status)).length >= 20) throw new Error('Too many outstanding approvals');
  if (jobs.size >= MAX_JOBS) throw new Error('Approval history capacity is full; wait for retained results to expire instead of resubmitting');
  const job = { id: randomUUID(), kind, workMode, owner: caller, options: { remote: Boolean(options.remote), callerKey: caller },
    taskId: options.taskId || randomUUID(), input: JSON.parse(encoded), digest, requestKey,
    status: 'waiting-approval', createdAt: Date.now(), result: null };
  jobs.set(job.id, job);
  return publicJob(job);
}
function result(id, options) {
  prune(); const job = jobs.get(id);
  if (!job || job.owner !== owner(options)) throw new Error('Unknown operation for this caller');
  return publicJob(job, true);
}
function resultRequest(input = {}, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'requestId')
    || typeof input.requestId !== 'string') throw new Error('Invalid operation result request');
  return result(input.requestId, options);
}
function list() { prune(); return [...jobs.values()].reverse().map(job => publicJob(job)); }
function inspect(id) { prune(); const job = jobs.get(id); if (!job) throw new Error('Unknown operation'); return publicJob(job, true); }
async function approve(id, confirmed) {
  prune(); const job = jobs.get(id);
  if (confirmed !== true) throw new Error('Explicit operator confirmation required');
  if (!job) throw new Error('Unknown operation');
  if (job.status !== 'waiting-approval') return publicJob(job); // Never execute twice, even after failure.
  if ([...jobs.values()].filter(item => item.status === 'running').length >= 4) throw new Error('Too many running operations');
  const control = require('./executionControl');
  const releaseMode = control.enter(job.workMode);
  job.status = 'running'; job.startedAt = Date.now(); job.controller = new AbortController();
  const timer = setTimeout(() => job.controller.abort(), 60000);
  let execution, handlerDispatched = false;
  try {
    execution = beginCall(job.kind === 'workflow' ? 'approved_workflow' : job.kind === 'probe-browser' ? 'approved_browser_operation' : 'approved_external_call', { ...job.options, taskId: job.taskId });
    execution.operationId = job.id;
    const output = await runWithSignal(job.controller.signal, () => withTask({ source: job.kind === 'probe-browser' ? 'BrowserProbe' : 'Workflow', taskId: job.taskId }, () => {
      checkCancelled();
      if (job.options.remote) control.assertAllowed(job.kind === 'workflow' ? 'workflow_request' : 'external_request');
      handlerDispatched = true;
      return handlers.get(job.kind)(clone(job.input), { ...job.options, taskId: job.taskId });
    }));
    const encoded = JSON.stringify(output);
    if (Buffer.byteLength(encoded || '') > MAX_RESULT) throw new Error('Output budget exceeded');
    job.result = output == null ? null : JSON.parse(encoded);
    // Accepted/running is not completion: this queue cannot poll a handler's background work.
    job.status = !output || typeof output !== 'object' || Array.isArray(output)
      || ['running','waiting-approval','accepted','pending','unknown'].includes(output.status)
      || (output.trace?.status != null && !['succeeded','failed','cancelled'].includes(output.trace.status))
      || output.verification?.state === 'unknown' ? 'unknown'
      : output.status === 'cancelled' || output.trace?.status === 'cancelled' ? 'cancelled'
        : isToolFailure(output) ? 'failed' : 'succeeded';
  } catch (error) {
    job.status = 'unknown';
    job.result = { ok: false, status: 'unknown', error: 'Execution interrupted, failed or exceeded a budget. Effects may already exist; inspect before submitting anything again.' };
    if (!handlerDispatched && error.code === 'E_FORBIDDEN') { job.status = 'failed'; job.result = {ok:false,status:'failed',error:error.message}; }
  } finally {
    if (!['waiting-approval', 'running'].includes(job.status) && job.finishedAt == null) job.finishedAt = Date.now();
    try { if (execution) finishCall(execution, { ...job.result, status: job.status, requestId: job.id }); }
    finally { clearTimeout(timer); job.cancelRequested = Boolean(job.controller?.signal.aborted); job.controller = null; releaseMode(); }
  }
  return publicJob(job);
}
function cancel(id) {
  prune();
  const job = jobs.get(id); if (!job) throw new Error('Unknown operation');
  if (job.status === 'waiting-approval') { job.status = 'denied'; job.finishedAt = Date.now(); }
  else if (job.status === 'running') job.controller.abort();
  return publicJob(job);
}
module.exports = { register, submit, result, resultRequest, list, inspect, approve, cancel };
