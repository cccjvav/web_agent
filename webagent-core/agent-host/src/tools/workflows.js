'use strict';
const fs = require('fs');
const { resolveSafePath, computeHash } = require('./patchEngine');
const { readBoundedText } = require('../utils/boundedFile');
const { checkCancelled } = require('../utils/requestScope');
const approvals = require('../utils/operatorQueue');
const READ = new Set(['ping', 'workspace_info', 'read_files', 'list_directory', 'search_files', 'find_files', 'git_status', 'git_diff']);
const WRITE = new Set(['write_file', 'apply_patch']);

function validate(definition) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)
    || Buffer.byteLength(JSON.stringify(definition)) > 32 * 1024
    || !Array.isArray(definition.steps) || definition.steps.length < 1 || definition.steps.length > 12) throw new Error('Workflow requires 1–12 steps and at most 32 KiB');
  const ids = new Set();
  for (const step of definition.steps) {
    if (!step || !/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(step.id || '') || ids.has(step.id)) throw new Error('Unique step IDs required');
    if (!READ.has(step.tool) && !WRITE.has(step.tool)) throw new Error('Unsupported workflow tool: commands, deletion, external tools and nested workflows are not allowed');
    if (!step.arguments || typeof step.arguments !== 'object' || Array.isArray(step.arguments)) throw new Error('Step arguments must be an object');
    if ('retry' in step) throw new Error('Automatic retry is not supported');
    if (WRITE.has(step.tool)) {
      if (typeof step.arguments.filePath !== 'string' || step.arguments.filePath.startsWith('$steps.')) throw new Error('Write paths must be explicit literals');
      const body = step.tool === 'write_file' ? step.arguments.content : step.arguments.patch;
      if (typeof body !== 'string' || body.startsWith('$steps.')) throw new Error('Write content/patch must be an explicit literal for operator review');
    }
    // Reject forward step references before any approval or execution.
    const encoded = JSON.stringify(step.arguments);
    for (const match of encoded.matchAll(/\$steps\.([a-zA-Z][a-zA-Z0-9_-]*)\./g)) {
      if (!ids.has(match[1])) throw new Error('References must point to an earlier step');
    }
    if (step.expect) {
      if (!['exists', 'contains', 'sha256'].some(key => Object.hasOwn(step.expect, key)) || typeof step.expect.path !== 'string' || step.expect.path.startsWith('$steps.')
        || (step.expect.sha256 != null && !/^[0-9a-f]{64}$/.test(step.expect.sha256))
        || (step.expect.contains != null && (typeof step.expect.contains !== 'string' || step.expect.contains.length > 2000))
        || (step.expect.exists != null && typeof step.expect.exists !== 'boolean')) throw new Error('Invalid explicit file postcondition');
    }
    ids.add(step.id);
  }
  return JSON.parse(JSON.stringify(definition));
}
function preview(definition) {
  const checked = validate(definition);
  return { ok: true, requiresApproval: true, risk: checked.steps.some(step => WRITE.has(step.tool)) ? 'writes-workspace' : 'reads-workspace',
    steps: checked.steps, constraints: 'No commands, automatic retries, dynamic write paths/content, nested or external tools. Failure/unknown stops remaining steps.' };
}
function resolveValues(value, outputs) {
  if (typeof value === 'string' && value.startsWith('$steps.')) {
    const parts = value.slice(7).split('.');
    let result = outputs;
    for (const part of parts) {
      if (['__proto__', 'prototype', 'constructor'].includes(part) || result == null || !Object.hasOwn(result, part)) throw new Error('Unresolved step reference');
      result = result[part];
    }
    return JSON.parse(JSON.stringify(result));
  }
  if (Array.isArray(value)) return value.map(item => resolveValues(item, outputs));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValues(item, outputs)]));
  return value;
}
function checkExpectation(expect) {
  if (!expect) return;
  const file = resolveSafePath(expect.path), exists = fs.existsSync(file);
  if (expect.exists != null && exists !== expect.exists) throw new Error('Existence postcondition failed');
  if (expect.contains != null || expect.sha256 != null) {
    const content = readBoundedText(file);
    if (expect.contains != null && !content.includes(expect.contains)) throw new Error('Content postcondition failed');
    if (expect.sha256 != null && computeHash(content) !== expect.sha256) throw new Error('Hash postcondition failed');
  }
}
function request({ definition, requestKey }, options = {}) {
  return approvals.submit('workflow', { definition: validate(definition) }, options, requestKey);
}
async function execute({ definition }, options) {
  const checked = validate(definition), outputs = Object.create(null), steps = [];
  for (const step of checked.steps) {
    try {
      checkCancelled();
      const args = resolveValues(step.arguments, outputs);
      const output = await require('./index').callTool(step.tool, args, WRITE.has(step.tool) ? 'code' : 'ask', options);
      outputs[step.id] = output;
      const failed = output.ok === false || output.success === false || output.isError === true || ['failed', 'unknown', 'cancelled'].includes(output.trace.status);
      steps.push({ id: step.id, tool: step.tool, status: output.trace.status, callId: output.trace.callId, verification: output.verification?.state || 'not-applicable' });
      if (failed) return { ok: false, status: output.trace.status === 'unknown' || output.verification?.state === 'unknown' ? 'unknown' : output.trace.status === 'cancelled' ? 'cancelled' : 'failed', steps, stoppedAt: step.id };
      try { checkExpectation(step.expect); }
      catch (_) { steps[steps.length - 1].verification = 'unknown'; return { ok: false, status: 'unknown', steps, stoppedAt: step.id, error: 'Postcondition failed after execution; inspect existing effects. No retry performed.' }; }
    } catch (error) {
      steps.push({ id: step.id, tool: step.tool, status: error.code === 'E_CANCELLED' ? 'cancelled' : 'failed', errorCode: error.code || 'E_STEP_FAILED' });
      return { ok: false, status: error.code === 'E_CANCELLED' ? 'cancelled' : 'failed', steps, stoppedAt: step.id };
    }
  }
  return { ok: true, status: 'succeeded', steps, note: 'Only the specified point-in-time tool/file conditions were checked; not a general goal-completion proof.' };
}
approvals.register('workflow', execute);
module.exports = { validate, preview, resolveValues, checkExpectation, request };
