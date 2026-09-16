'use strict';
// Volatile content-only undo for explicit local editor saves, never automatic rollback.
const { randomUUID } = require('crypto');
const { config } = require('../config');
const { readBoundedText } = require('./boundedFile');
const { resolveSafePath, computeHash } = require('../tools/patchEngine');
const records = new Map();
const LIMIT = 65536, TTL = 15 * 60 * 1000;
function prune() {
  for (const [id, entry] of records) if (Date.now() >= entry.expiresAt) records.delete(id);
  while (records.size >= 16) records.delete(records.keys().next().value);
}
function capture(filePath, expectedHash, content) {
  if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash) || Buffer.byteLength(content) > LIMIT) return null;
  try {
    const before = readBoundedText(resolveSafePath(filePath), LIMIT);
    if (computeHash(before) !== expectedHash || before === content) return null;
    return { path: filePath, before, afterHash: computeHash(content), workspace: config.workspaceRoot, host: config.hostInstanceId };
  } catch (_) { return null; } // Undo is optional; the real write still enforces paths/hash/budgets.
}
function remember(snapshot, hash) {
  if (!snapshot || snapshot.afterHash !== hash) return null;
  prune();
  const id = randomUUID(), expiresAt = Date.now() + TTL;
  records.set(id, { ...snapshot, expiresAt });
  return { id, expiresAt };
}
function inspect(id) {
  const entry = records.get(id);
  if (!entry || Date.now() >= entry.expiresAt || entry.workspace !== config.workspaceRoot || entry.host !== config.hostInstanceId) {
    records.delete(id); throw Error('回退记录不存在、已过期或主机/工作区已变化');
  }
  const current = readBoundedText(resolveSafePath(entry.path), LIMIT);
  if (computeHash(current) !== entry.afterHash) throw Error('文件已变化，拒绝覆盖；请人工协调，不要强制回退');
  return entry;
}
function preview(id) {
  const entry = inspect(id);
  const current = readBoundedText(resolveSafePath(entry.path), LIMIT);
  if (computeHash(current) !== entry.afterHash) throw Error('预览期间文件已变化');
  if (current.split('\n').length > 2000 || entry.before.split('\n').length > 2000) throw Error('回退预览超过2000行预算');
  const diff = require('diff').createTwoFilesPatch('a/' + entry.path, 'b/' + entry.path, current, entry.before, 'saved', 'undo', { timeout: 100, maxEditLength: 4000 });
  if (typeof diff !== 'string' || Buffer.byteLength(diff) > 262144) throw Error('回退差异超过预算');
  return { success: true, path: entry.path, expectedHash: entry.afterHash, diff, expiresAt: entry.expiresAt };
}
async function restore(id, input) {
  if (input?.confirmed !== true) throw Error('必须明确确认回退');
  const entry = inspect(id);
  if (input.expectedHash !== entry.afterHash) throw Error('回退版本与预览不一致');
  // Once dispatched, including an uncertain failure, do not permit replay of this record.
  records.delete(id);
  const result = await require('../tools').callTool('write_file', {filePath:entry.path,content:entry.before,expectedHash:entry.afterHash,confirm_overwrite:true}, 'code');
  if (result.success !== true || result.verification?.state !== 'verified') throw Error('回退结果未被确认；请检查磁盘，不要重放');
  return { success:true,path:entry.path,content:entry.before,hash:result.hash,verification:result.verification };
}
module.exports = { capture, remember, preview, restore };
