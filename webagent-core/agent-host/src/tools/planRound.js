const eventBus = require('../utils/eventBus');

let round = null;

function clampMax(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 4;
  return Math.min(8, Math.max(2, Math.round(v)));
}

function previewOf(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

function snapshot() {
  if (!round) {
    return {
      active: false,
      task: '',
      maxBranches: 4,
      branches: [],
      merged: false,
      canBranch: false,
      canMerge: false
    };
  }
  const n = round.branches.length;
  return {
    active: true,
    task: round.task,
    maxBranches: round.maxBranches,
    mergeModelId: round.mergeModelId,
    thinkLevel: round.thinkLevel,
    merged: Boolean(round.merged),
    canBranch: n >= 1 && n < round.maxBranches && !round.merged,
    canMerge: n >= 2 && !round.merged,
    branches: round.branches.map((b) => ({
      id: b.id,
      index: b.index,
      modelId: b.modelId,
      modelName: b.modelName,
      thinkLevel: b.thinkLevel,
      simulated: Boolean(b.simulated),
      preview: previewOf(b.answer)
    }))
  };
}

function reset() {
  round = null;
  return snapshot();
}

function start({ task, maxBranches, mergeModelId, thinkLevel }) {
  const t = String(task || '').trim();
  if (!t) {
    const err = new Error('先输入任务再发 Plan。空发送只在已有分支时表示新分支。');
    err.code = 'E_PLAN_NO_TASK';
    throw err;
  }
  round = {
    task: t,
    maxBranches: clampMax(maxBranches),
    mergeModelId: mergeModelId || 'active',
    thinkLevel: thinkLevel || 'high',
    branches: [],
    merged: null
  };
  eventBus.broadcast('plan_round_started', snapshot());
  return round;
}

function current() {
  return round;
}

function addBranch(branch) {
  if (!round) {
    const err = new Error('还没有 Plan 任务。先发一条问题，再换模型空发做新分支。');
    err.code = 'E_PLAN_NO_ROUND';
    throw err;
  }
  if (round.merged) {
    const err = new Error('本轮已经总结过。再发一条新任务会开新回合。');
    err.code = 'E_PLAN_MERGED';
    throw err;
  }
  if (round.branches.length >= round.maxBranches) {
    const err = new Error(`已到最大分支 ${round.maxBranches}。先点总结，或发新任务开下一回合。`);
    err.code = 'E_PLAN_FULL';
    throw err;
  }
  const index = round.branches.length + 1;
  const rec = {
    id: String(index),
    index,
    modelId: branch.modelId || 'builtin',
    modelName: branch.modelName || branch.modelId || '内置探索',
    thinkLevel: branch.thinkLevel || round.thinkLevel,
    simulated: Boolean(branch.simulated),
    focus: branch.focus || '',
    answer: String(branch.answer || '').trim(),
    createdAt: new Date().toISOString()
  };
  round.branches.push(rec);
  eventBus.broadcast('plan_branch', { branch: rec, round: snapshot() });
  return rec;
}

function markMerged(result) {
  if (!round) {
    const err = new Error('还没有可总结的分支。');
    err.code = 'E_PLAN_NO_ROUND';
    throw err;
  }
  if (round.branches.length < 2) {
    const err = new Error('至少两个分支才能总结。换一个模型，空发送再作答一次。');
    err.code = 'E_PLAN_NEED_TWO';
    throw err;
  }
  round.merged = result || { at: new Date().toISOString() };
  eventBus.broadcast('plan_merged', snapshot());
  return snapshot();
}

function branches() {
  return round ? round.branches.slice() : [];
}

module.exports = {
  clampMax,
  snapshot,
  reset,
  start,
  current,
  addBranch,
  markMerged,
  branches
};
