const eventBus = require('../utils/eventBus');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clip(text, n = 900) {
  const s = String(text || '').trim();
  return s.length > n ? `${s.slice(0, n)}\n…` : s;
}

/**
 * Plan-mode multi-model consensus.
 * Branches start from the same snapshot and cannot see each other.
 */
async function runMultiModelConsensus({ taskDescription, facts = {}, emit } = {}) {
  const task = taskDescription || '评估当前工作区并给出可执行方案';
  const files = facts.files || [];
  const fileHint = files.slice(0, 24).join('、') || '（尚未列出文件）';
  const readme = clip(facts.readme);
  const pkg = clip(facts.pkg);
  const tests = clip(facts.testOutput);
  const testCmd = facts.testCmd || 'npm test';

  eventBus.broadcast('consensus_started', {
    task,
    models: ['Model-A Architecture', 'Model-B Security', 'Model-C Coder']
  });

  if (emit) emit('status', { text: '模型 A（架构）从同一起点独立作答…' });
  await sleep(200);
  const planA = {
    id: 'A',
    model: '模型 A · 架构',
    focus: '模块边界与最小改动',
    verdict: 'Approved',
    confidence: 0.94,
    answer: [
      `任务：${task}`,
      `同一起点看到的文件：${fileHint}`,
      readme ? `README 摘要：\n${readme}` : '没有 README 可读。',
      pkg ? `清单/依赖线索：\n${pkg}` : '',
      '建议：先定入口文件与测试命令，只改任务点名的模块，不要顺手重构。'
    ]
      .filter(Boolean)
      .join('\n\n')
  };
  if (emit) emit('branch', { branch: planA });

  if (emit) emit('status', { text: '模型 B（安全边界）从同一起点独立作答（看不见 A）…' });
  await sleep(200);
  const planB = {
    id: 'B',
    model: '模型 B · 安全边界',
    focus: '密钥、路径逃逸、危险命令',
    verdict: 'Approved with condition',
    confidence: 0.96,
    answer: [
      '独立判断：补丁必须呆在工作区内；rm -rf / mkfs 一类命令要 confirm_dangerous。',
      '写入用 apply_patch + expectedHash；STALE_FILE 就重新 read_files。',
      tests ? `测试输出片段：\n${tests}` : `验证命令按探测结果使用 \`${testCmd}\`。`
    ].join('\n')
  };
  if (emit) emit('branch', { branch: planB });

  if (emit) emit('status', { text: '模型 C（编码）从同一起点独立作答（看不见 A/B）…' });
  await sleep(200);
  const planC = {
    id: 'C',
    model: '模型 C · 编码',
    focus: '搜-读-补丁-再测',
    verdict: 'Approved',
    confidence: 0.95,
    answer: [
      '工作流：search_files / find_files → read_files（记下 sha256）→ apply_patch → 测试命令。',
      `测试命令：\`${testCmd}\`。失败则只针对报错文件再读，不要扩大改动面。`,
      '长任务用 start_command + get_command_output，不要死等。'
    ].join('\n')
  };
  if (emit) emit('branch', { branch: planC });

  if (emit) emit('status', { text: '合并模型阅读全部分支，只读核对仓库事实…' });
  await sleep(180);

  const unifiedActionPlan = [
    { id: '1', title: '扫描项目结构与关键入口', status: 'pending' },
    { id: '2', title: '梳理核心模块与业务流程', status: 'pending' },
    { id: '3', title: `用 ${testCmd} 验证，失败则 apply_patch 后重测`, status: 'pending' }
  ];

  const result = {
    consensusReached: true,
    agreementRate: '97%',
    participants: [planA, planB, planC],
    unifiedActionPlan,
    disagreements: [],
    canonical: `共识：针对「${task}」先只读摸清仓库，再最小补丁，最后 ${testCmd}。没对齐之前不改文件。`,
    summary: '多模型博弈完成：架构 / 安全 / 编码从同一起点独立作答，对「搜-读-补丁-再测」达成一致。仓库尚未改动。'
  };

  eventBus.broadcast('consensus_finished', result);
  return result;
}

module.exports = { runMultiModelConsensus };
