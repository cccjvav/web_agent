'use strict';
const crypto = require('crypto');
const { config } = require('../config');
const store = require('../models/store');
const { ProtocolError } = require('../mcp/errors');
const state = { mode: 'idle', active: { chat: 0, bridge: 0 } };
const keys = ['read', 'edit', 'execute', 'capture'];
const READ = new Set(['workspace_info','get_capabilities','get_logs','get_task_status','recall','list_directory','find_files','search_files','read_files','git_status','git_diff','peers_list','board_list','load_skill','get_command_output','probe_links','probe_report','external_servers','operation_result','workflow_request']);
const EDIT = new Set(['remember','board_create','board_claim','board_update','apply_patch','write_file','delete_file','rename_file']);
const CONTROL = new Set(['ping','confirm_connection','wait','report_progress','set_todos','cancel_command','workflow_preview']);
function fail(code, message) { const error = new ProtocolError(code, message); error.status = 409; throw error; }
function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 4 || keys.some(k => typeof value[k] !== 'boolean')) fail('E_BAD_ARGS', '权限必须包含read/edit/execute/capture四个布尔值');
  if (value.edit && !value.read) fail('E_BAD_ARGS', 'Edit需要Read，以便版本核对和安全修改');
  if (value.execute && keys.some(k => !value[k])) fail('E_BAD_ARGS', '任意Execute可读写和截图，必须同时允许Read/Edit/Capture；否则请关闭Execute');
  return Object.fromEntries(keys.map(k => [k, value[k]]));
}
// permissions() runs on every remote tool call and once PER TOOL in a remote tools/list (39
// store.load() JSON parses of config.json for one list). Cache the validated policy keyed on the
// config file's identity (size + mtime + inode) plus the store's in-process save counter, so an
// in-process save and an external edit of config.json both invalidate it. A failed load or
// validation is never cached: the next call re-reads and throws again (fail closed).
let permissionCache = null;
function permissions() {
  const key = store.revisionKey();
  if (permissionCache && permissionCache.key === key) return { ...permissionCache.policy };
  const saved = store.load().bridge?.permissions;
  const policy = saved === undefined ? { read: true, edit: true, execute: true, capture: true } : validate(saved);
  permissionCache = { key, policy };
  return { ...policy };
}
function revision(policy) { return crypto.createHash('sha256').update(JSON.stringify(policy)).digest('hex'); }
function snapshot() { const policy = permissions(); return { mode: state.mode, active: { ...state.active }, permissions: policy, revision: revision(policy) }; }
function blockers(includeWaiting = true) {
  const commands = require('../tools/executor').activeCount();
  const jobs = require('./operatorQueue').list().filter(j => j.status === 'running' || includeWaiting && j.status === 'waiting-approval');
  const stdio = require('../mcp/stdioTransport').snapshot().some(s => !s.closed);
  const pty = require('../tools/ptyJobs').activeCount();
  return commands || jobs.length || stdio || pty;
}
function assertIdle() {
  if (state.active.chat || state.active.bridge || blockers()) fail('E_BUSY', '存在在途任务、待批准操作或后台命令/stdio服务；请先结束或明确取消，再切换模式');
}
function selectMode(mode) {
  if (!['chat','bridge'].includes(mode)) fail('E_BAD_ARGS', '工作模式必须是chat或bridge');
  if (state.mode === mode) return snapshot();
  assertIdle();
  if (mode === 'chat' && config.bridgeRunning) fail('E_MODE_CONFLICT', '请先停止Bridge隧道，再切换Chat');
  state.mode = mode;
  return snapshot();
}
function enter(mode) {
  if (state.mode === 'idle') state.mode = config.bridgeRunning ? 'bridge' : mode;
  if (state.mode !== mode) fail('E_MODE_CONFLICT', `当前为${state.mode}工作模式，不能同时执行${mode}；请由本机操作者切换`);
  state.active[mode]++;
  let released = false;
  return () => { if (!released) { released = true; state.active[mode]--; } };
}
async function run(mode, fn) { const release = enter(mode); try { return await fn(); } finally { release(); } }
function updatePermissions(value, expectedRevision) {
  const policy = validate(value);
  if (expectedRevision !== snapshot().revision) fail('E_STALE_POLICY', '权限已变化，请刷新核对后再保存');
  if (state.active.chat || state.active.bridge || blockers(false)) fail('E_BUSY', '先结束在途任务和后台命令/stdio服务，再调整权限；不会偷偷强杀或重放');
  store.patch({ bridge: { permissions: policy } });
  return snapshot();
}
function requirements(tool) {
  if (CONTROL.has(tool)) return [];
  if (READ.has(tool)) return ['read'];
  if (EDIT.has(tool)) return ['read','edit'];
  return keys; // Unknown/opaque tools, shell and third-party execution fail closed.
}
function assertAllowed(tool) {
  const policy = permissions();
  const denied = requirements(tool).filter(k => !policy[k]);
  if (denied.length) throw new ProtocolError('E_FORBIDDEN', `Bridge权限禁止${tool}：${denied.join(', ')}；只能由本机操作者更改权限`);
}
function allowed(tool) { const p = permissions(); return requirements(tool).every(k => p[k]); }
module.exports = { assertIdle, snapshot, selectMode, enter, run, updatePermissions, permissions, requirements, assertAllowed, allowed };
