'use strict';
const { AsyncLocalStorage } = require('async_hooks');
const { randomUUID, createHash } = require('crypto');
const fs = require('fs');
const { config } = require('../config');
const eventBus = require('./eventBus');
const { readBoundedText } = require('./boundedFile');
const { resolveSafePath, computeHash } = require('../tools/patchEngine');
const context = new AsyncLocalStorage();
const records = new Map();
const LIMIT = 200, ACTIVE_LIMIT = 64;

function withTask(info, fn) { return context.run({ ...info, taskId: info.taskId || randomUUID() }, fn); }
function taskId(value) {
  return typeof value === 'string' && (/^t[1-9][0-9]{0,8}$/.test(value) || /^[0-9a-f-]{36}$/i.test(value)) ? value : randomUUID();
}
function beginCall(tool, options = {}) {
  if ([...records.values()].filter(record => record.status === 'running').length >= ACTIVE_LIMIT) {
    const err = new Error('Too many active tool calls'); err.code = 'E_BUSY'; throw err;
  }
  const inherited = context.getStore() || {};
  const source = options.remote ? 'Bridge-Remote' : inherited.source || 'Local';
  const sessionId = createHash('sha256').update(config.hostInstanceId + ':' + String(options.callerKey || 'local')).digest('hex').slice(0, 16);
  const record = { hostInstanceId: config.hostInstanceId, callId: randomUUID(),
    taskId: taskId(options.taskId || inherited.taskId), sessionId, source,
    tool: String(tool).slice(0, 120), status: 'running', startedAt: new Date().toISOString(), verification: 'not-applicable' };
  records.set(record.callId, record);
  for (const [id, old] of records) {
    if (records.size <= LIMIT) break;
    if (old.status !== 'running') records.delete(id);
  }
  eventBus.broadcast('tool_execution_start', record);
  return record;
}
function finishCall(record, result, error) {
  record.finishedAt = new Date().toISOString();
  record.durationMs = Date.parse(record.finishedAt) - Date.parse(record.startedAt);
  const reported = result && result.status;
  record.status = error?.code === 'E_CANCELLED' || reported === 'cancelled' ? 'cancelled'
    : (result?.verification?.state === 'unknown' || reported === 'unknown') ? 'unknown'
      : error || result?.isTimeout || ['error', 'failed', 'timeout', 'denied', 'expired'].includes(reported) || (typeof result?.exitCode === 'number' && result.exitCode !== 0) || result?.ok === false || result?.success === false || result?.isError === true ? 'failed'
        : ['running', 'waiting-approval'].includes(reported) ? 'accepted' : 'succeeded';
  record.verification = result?.verification?.state || 'not-applicable';
  if (result?.execId && /^[a-zA-Z0-9_-]{1,80}$/.test(result.execId)) record.execId = result.execId;
  if (typeof result?.requestId === 'string' && /^[a-f0-9-]{36}$/.test(result.requestId)) record.operationId = result.requestId;
  if (error) record.errorCode = /^[A-Z0-9_]{1,50}$/.test(error.code || '') ? error.code : 'E_TOOL_FAILED';
  eventBus.broadcast('tool_execution_end', record);
  return { ...record };
}
function snapshot(source) {
  return [...records.values()].filter(record => !source || record.source === source).map(record => ({ ...record })).reverse();
}
function clearCompleted() { for (const [id, record] of records) if (record.status !== 'running') records.delete(id); }

// Point-in-time postcondition only. A later writer can still change the file.
// Unknown verification never causes automatic replay of an already performed mutation.
function verifyMutation(tool, input, result) {
  if (!result || result.success === false || result.ok === false || input.dryRun) return result;
  if (!['write_file', 'apply_patch', 'delete_file', 'rename_file'].includes(tool)) return result;
  try {
    if (tool === 'write_file' || tool === 'apply_patch') {
      const expected = result.hash || result.newHash;
      if (!expected || computeHash(readBoundedText(resolveSafePath(input.filePath))) !== expected) throw new Error('Read-back hash mismatch');
    } else if (tool === 'delete_file') {
      if (fs.existsSync(resolveSafePath(input.filePath))) throw new Error('Path still exists');
    } else {
      if (fs.existsSync(resolveSafePath(input.from || input.filePath)) || !fs.existsSync(resolveSafePath(input.to || input.dest))) throw new Error('Rename postcondition not met');
    }
    return { ...result, verification: { state: 'verified', method: tool === 'write_file' || tool === 'apply_patch' ? 'read-back-hash' : 'path-postcondition' } };
  } catch (_) {
    return { ...result, ok: false, success: false, code: 'E_VERIFY_UNKNOWN',
      error: 'Mutation may already have happened; read-back verification failed. Inspect before any retry.',
      verification: { state: 'unknown', method: 'postcondition' } };
  }
}
module.exports = { withTask, beginCall, finishCall, snapshot, clearCompleted, verifyMutation };
