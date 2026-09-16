'use strict';
// Operator-created, volatile content checkpoints. Never automatic compensation.
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { config } = require('../config');
const { resolveSafePath, computeHash } = require('../tools/patchEngine');
const { assertWorkspaceBinding } = require('./workspaceBinding');
const { checkCancelled } = require('./requestScope');
const checkpoints = new Map();
const LIMIT = 65536, TOTAL = 262144, TTL = 15 * 60 * 1000;
function prune() {
  for (const [id, record] of checkpoints) if (record.state !== 'running' && Date.now() >= record.expiresAt) checkpoints.delete(id);
}
function read(filePath) {
  const file = fs.realpathSync(resolveSafePath(filePath));
  // Recheck the canonical target through the workspace policy, not just the UI path.
  resolveSafePath(path.relative(fs.realpathSync(config.workspaceRoot), file));
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > LIMIT) throw Error('检查点只支持64KiB内已有普通文本文件');
    const buffer = Buffer.alloc(LIMIT + 1); let count = 0, size;
    while (count < buffer.length && (size = fs.readSync(fd, buffer, count, buffer.length - count, null))) count += size;
    if (count > LIMIT) throw Error('文件超过64KiB');
    const bytes = buffer.subarray(0, count);
    if (bytes.includes(0) || (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) throw Error('不支持二进制或BOM文件');
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { file, content, hash: computeHash(content), bytes: count };
  } finally { fs.closeSync(fd); }
}
function metadata(record) {
  return { id: record.id, paths: record.files.map(item => item.path), createdAt: record.createdAt,
    expiresAt: record.expiresAt, state: record.state, result: record.result ? JSON.parse(JSON.stringify(record.result)) : null };
}
function get(id, input) {
  assertWorkspaceBinding(input, config); prune();
  const record = checkpoints.get(id);
  if (!record || record.workspace !== config.workspaceRoot || record.host !== config.hostInstanceId) throw Error('检查点不存在、已过期或主机/工作区已变化');
  return record;
}
function create(input) {
  assertWorkspaceBinding(input, config); prune();
  if (input.confirmed !== true) throw Error('必须确认把所选文件原文暂存于本机内存');
  if (checkpoints.size >= 8) throw Error('最多保留8个检查点，请移除旧记录');
  if (!Array.isArray(input.paths) || !input.paths.length || input.paths.length > 12) throw Error('请选择1–12个已有文件');
  const names = new Set(); let total = 0;
  const files = input.paths.map(name => {
    if (typeof name !== 'string' || !name || name.length > 2048) throw Error('无效文件路径');
    const snapshot = read(name), key = process.platform === 'win32' ? snapshot.file.toLowerCase() : snapshot.file;
    if (names.has(key)) throw Error('同一真实文件不能重复登记');
    names.add(key); total += snapshot.bytes;
    if (total > TOTAL) throw Error('检查点原文合计超过256KiB');
    return { path: path.relative(fs.realpathSync(config.workspaceRoot), snapshot.file), ...snapshot };
  });
  const record = { id: randomUUID(), files, workspace: config.workspaceRoot, host: config.hostInstanceId,
    createdAt: Date.now(), expiresAt: Date.now() + TTL, state: 'ready', ticket: null, result: null };
  checkpoints.set(record.id, record); return metadata(record);
}
function preview(id, input) {
  const record = get(id, input);
  if (record.state !== 'ready') throw Error('此检查点已执行或结果未知，不可重放');
  record.ticket = null;
  let total = 0;
  const files = record.files.map(original => {
    const current = read(original.path);
    if (current.file !== original.file) throw Error('文件真实路径已变化');
    if (current.content.split('\n').length > 2000 || original.content.split('\n').length > 2000) throw Error('预览超过2000行预算');
    const diff = require('diff').createTwoFilesPatch('current/' + original.path, 'checkpoint/' + original.path, current.content, original.content, '', '', { timeout: 100, maxEditLength: 4000 });
    if (typeof diff !== 'string') throw Error('差异复杂度超过预算');
    total += Buffer.byteLength(diff);
    if (total > TOTAL) throw Error('差异合计超过256KiB');
    return { path: original.path, expectedHash: current.hash, targetHash: original.hash, changed: current.hash !== original.hash, diff };
  });
  record.ticket = { id: randomUUID(), files };
  return { ...metadata(record), previewId: record.ticket.id, files, warning: '非原子事务；全部预检后逐文件恢复，中途失败保留已完成写入，不能重放。' };
}
async function restore(id, input) {
  const record = get(id, input);
  if (input.confirmed !== true || record.state !== 'ready' || !record.ticket || input.previewId !== record.ticket.id) throw Error('必须明确确认最新差异；旧预览或已执行检查点不可重放');
  const ticket = record.ticket; record.ticket = null;
  const control = require('./executionControl');
  const release = control.enter(control.snapshot().mode === 'bridge' ? 'bridge' : 'chat');
  try {
    // Preflight every file before the first mutation; each write then checks its own hash again.
    for (let index = 0; index < record.files.length; index++) {
      checkCancelled(); const current = read(record.files[index].path);
      if (current.file !== record.files[index].file || current.hash !== ticket.files[index].expectedHash) throw Error('预览后文件已变化；本次未开始恢复，请重新审阅');
    }
    record.state = 'running';
    const results = ticket.files.map(item => ({ path: item.path, status: item.changed ? 'not-started' : 'unchanged' }));
    record.result = { success: false, status: 'running', files: results };
    for (let index = 0; index < results.length; index++) {
      if (!ticket.files[index].changed) continue;
      try {
        checkCancelled(); get(id, input);
        const current = read(record.files[index].path);
        if (current.file !== record.files[index].file || current.hash !== ticket.files[index].expectedHash) throw Error('恢复期间文件已变化');
        results[index].status = 'unknown';
        const output = await require('../tools').callTool('write_file', {
          filePath: record.files[index].path, content: record.files[index].content,
          expectedHash: ticket.files[index].expectedHash, confirm_overwrite: true
        }, 'code');
        if (output.success !== true || output.verification?.state !== 'verified' || output.hash !== record.files[index].hash) throw Error('恢复结果未确认');
        results[index].status = 'restored';
      } catch (_) {
        record.state = 'consumed';
        record.result.status = results.some(item => item.status === 'unknown') ? 'unknown' : 'failed';
        record.result.warning = '已停止。已恢复文件保留，当前文件效果可能未知，后续未开始；请核对磁盘，不重放或自动补偿。';
        return metadata(record);
      }
    }
    record.state = 'consumed'; record.result.success = true; record.result.status = 'succeeded';
    return metadata(record);
  } finally { release(); }
}
function list() {
  prune(); return [...checkpoints.values()].filter(record => record.workspace === config.workspaceRoot && record.host === config.hostInstanceId).map(metadata);
}
function remove(id, input) {
  const record = get(id, input);
  if (record.state === 'running') throw Error('不能移除正在恢复的检查点');
  checkpoints.delete(id); return { removed: true };
}
module.exports = { create, preview, restore, list, remove };
