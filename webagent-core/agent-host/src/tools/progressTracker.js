const eventBus = require('../utils/eventBus');
const { config } = require('../config');
const { createHash } = require('crypto');
const { checkCancelled } = require('../utils/requestScope');
const remoteStates = new Map();
const MAX_SESSIONS = 16, MAX_TODOS = 50, TTL_MS = 30 * 60 * 1000;
let currentRoot = config.workspaceRoot;
function initialState(source = 'Local', sessionId = 'local') {
  return { source, sessionId, status: 'idle', progress: 0, stepName: '', lastMessage: '', lastUpdated: null, todos: [] };
}
let currentTaskState = initialState();
function cleanStates() {
  if (currentRoot !== config.workspaceRoot) {
    currentRoot = config.workspaceRoot; remoteStates.clear(); currentTaskState = initialState();
  }
  const cutoff = Date.now() - TTL_MS;
  for (const [id, state] of remoteStates) if (Date.parse(state.lastUpdated) <= cutoff) remoteStates.delete(id);
}
function stateFor(options = {}) {
  cleanStates();
  if (!options.remote) return currentTaskState;
  const id = createHash('sha256').update(config.hostInstanceId + ':' + String(options.callerKey || 'local')).digest('hex').slice(0, 16);
  if (!remoteStates.has(id)) {
    if (remoteStates.size >= MAX_SESSIONS) throw new Error('Too many task-reporting sessions; wait for inactive reports to expire');
    remoteStates.set(id, initialState('Bridge-Remote', id));
  }
  return remoteStates.get(id);
}
function snapshot(state) { return { ...state, todos: state.todos.map(todo => ({ ...todo })) }; }
function text(value, field, max = 500) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`Invalid ${field}: expected text up to ${max} characters`);
  return value;
}
function reportProgress({ message, percentage = 0, stepName = '' }, options) {
  checkCancelled();
  text(message, 'message'); text(stepName, 'stepName');
  if (!Number.isFinite(percentage)) throw new Error('percentage must be a finite number');
  const state = stateFor(options);
  state.status = percentage >= 100 ? 'completed' : 'in_progress';
  state.progress = Math.min(100, Math.max(0, percentage));
  state.stepName = stepName || state.stepName;
  state.lastMessage = message;
  state.lastUpdated = new Date().toISOString();
  eventBus.broadcast('progress_updated', snapshot(state));
  return { success: true, progress: state.progress, stepName: state.stepName, message: state.lastMessage };
}
function setTodos({ todos = [] }, options) {
  checkCancelled();
  if (!Array.isArray(todos) || todos.length > MAX_TODOS) throw new Error('todos must be an array of at most 50 items');
  const ids = new Set();
  const normalized = todos.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid todo item');
    const id = text(item.id || `todo-${index + 1}`, 'id', 80);
    const title = text(item.title || item.text || item.description || 'Task item', 'title');
    const status = item.status || 'pending';
    if (!['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'blocked'].includes(status) || ids.has(id)) throw new Error('Invalid todo status or duplicate id');
    ids.add(id); return { id, title, status };
  });
  const state = stateFor(options);
  state.todos = normalized;
  state.lastUpdated = new Date().toISOString();
  eventBus.broadcast('todos_updated', snapshot(state));
  return { success: true, totalTodos: normalized.length, todos: snapshot(state).todos };
}
function getTaskState() { cleanStates(); return snapshot(currentTaskState); }
function getBridgeTaskStates() { cleanStates(); return [...remoteStates.values()].map(snapshot); }
function resetTaskState() {
  remoteStates.clear(); currentTaskState = initialState(); currentRoot = config.workspaceRoot;
  eventBus.broadcast('progress_updated', snapshot(currentTaskState));
  eventBus.broadcast('todos_updated', { source: 'Bridge-Remote', todos: [] });
  return snapshot(currentTaskState);
}
module.exports = { reportProgress, setTodos, getTaskState, getBridgeTaskStates, resetTaskState };
