const eventBus = require('../utils/eventBus');

function clip(text, n = 900) {
  const s = String(text || '').trim();
  return s.length > n ? `${s.slice(0, n)}\n…` : s;
}

function localPlanText({ task, facts = {}, modelName, thinkLevel }) {
  const files = facts.files || [];
  const fileHint = files.slice(0, 24).join('、') || '（尚未列出文件）';
  const readme = clip(facts.readme, 500);
  const pkg = clip(facts.pkg, 400);
  const testCmd = facts.testCmd || 'npm test';
  return [
    `任务：${task}`,
    `作答：${modelName || '内置探索'} · 思考 ${thinkLevel || 'high'}`,
    `同一起点看到的文件：${fileHint}`,
    readme ? `README 摘要：\n${readme}` : '没有 README 可读。',
    pkg ? `清单/依赖线索：\n${pkg}` : '',
    `建议：先定入口与测试命令 \`${testCmd}\`，只改任务点名的模块。Plan 不改仓库；落地切 Code。`,
    '这是本机内置探索写的分支，不是远程大模型。要按截图那样换模型作答，到 API Provider 给对应模型填 Endpoint 和 Key。'
  ]
    .filter(Boolean)
    .join('\n\n');
}

function draftLocalBranch({ taskDescription, facts = {}, modelName, thinkLevel, index = 1 } = {}) {
  const task = taskDescription || '评估当前工作区并给出可执行方案';
  return {
    id: String(index),
    model: modelName || '内置探索',
    modelName: modelName || '内置探索',
    focus: '本机只读摸底',
    verdict: 'local',
    simulated: true,
    thinkLevel: thinkLevel || 'high',
    answer: localPlanText({ task, facts, modelName, thinkLevel })
  };
}

function mergeLocalBranches({ taskDescription, branches = [], facts = {} } = {}) {
  const task = taskDescription || '';
  const testCmd = facts.testCmd || 'npm test';
  const parts = branches.map((b, i) => {
    const name = b.modelName || b.model || `分支 ${i + 1}`;
    return `### 分支 ${i + 1} · ${name}\n\n${b.answer || ''}`;
  });
  const canonical = [
    `合并总结（本机拼接，没有调用合并主模型 HTTP）：针对「${task}」。`,
    `共 ${branches.length} 个分支。没配 API Key 时无法让主模型读分支。`,
    `落地前仍只读；切 Code 再补丁，验证命令 \`${testCmd}\`。`
  ].join(' ');
  const unifiedActionPlan = [
    { id: '1', title: '对照各分支，确认入口文件与最小改动面', status: 'pending' },
    { id: '2', title: '切 Code：read_files 取哈希后 apply_patch', status: 'pending' },
    { id: '3', title: `用 ${testCmd} 验证`, status: 'pending' }
  ];
  const result = {
    simulated: true,
    consensusReached: false,
    agreementRate: null,
    participants: branches.map((b, i) => ({
      id: String(b.id || i + 1),
      model: b.modelName || b.model || `分支 ${i + 1}`,
      focus: b.focus || b.thinkLevel || '',
      answer: b.answer || ''
    })),
    unifiedActionPlan,
    disagreements: [],
    canonical,
    summary: `已收集 ${branches.length} 个分支。这不是假的 97% 投票；没 Key 时总结只是原文整理。`
  };
  eventBus.broadcast('consensus_finished', result);
  return result;
}

/** Kept for POST /consensus/run when no live round exists. */
async function runMultiModelConsensus({ taskDescription, facts = {}, emit } = {}) {
  const branch = draftLocalBranch({ taskDescription, facts, index: 1 });
  if (emit) emit('status', { text: '没有进行中的多模型回合，给出一份本机只读草案。' });
  return mergeLocalBranches({
    taskDescription,
    branches: [branch],
    facts
  });
}

module.exports = {
  draftLocalBranch,
  mergeLocalBranches,
  runMultiModelConsensus
};
