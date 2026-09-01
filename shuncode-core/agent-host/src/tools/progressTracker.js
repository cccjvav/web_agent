const eventBus = require('../utils/eventBus');

let currentTaskState = {
  status: 'idle',
  progress: 0,
  stepName: '',
  lastMessage: '',
  lastUpdated: null,
  todos: []
};

function reportProgress({ message, percentage = 0, stepName = '' }) {
  currentTaskState.status = percentage >= 100 ? 'completed' : 'in_progress';
  currentTaskState.progress = Math.min(100, Math.max(0, percentage));
  currentTaskState.stepName = stepName || currentTaskState.stepName;
  currentTaskState.lastMessage = message;
  currentTaskState.lastUpdated = new Date().toISOString();

  eventBus.broadcast('progress_updated', { ...currentTaskState });

  return {
    success: true,
    progress: currentTaskState.progress,
    stepName: currentTaskState.stepName,
    message: currentTaskState.lastMessage
  };
}

function setTodos({ todos = [] }) {
  currentTaskState.todos = todos.map((item, index) => ({
    id: item.id || `todo-${index + 1}`,
    title: item.title || item.text || item.description || 'Task item',
    status: item.status || 'pending'
  }));
  currentTaskState.lastUpdated = new Date().toISOString();

  eventBus.broadcast('todos_updated', {
    todos: currentTaskState.todos
  });

  return {
    success: true,
    totalTodos: currentTaskState.todos.length,
    todos: currentTaskState.todos
  };
}

function getTaskState() {
  return currentTaskState;
}

function resetTaskState() {
  currentTaskState = {
    status: 'idle',
    progress: 0,
    stepName: '',
    lastMessage: '',
    lastUpdated: null,
    todos: []
  };
  eventBus.broadcast('progress_updated', currentTaskState);
  return currentTaskState;
}

module.exports = {
  reportProgress,
  setTodos,
  getTaskState,
  resetTaskState
};
