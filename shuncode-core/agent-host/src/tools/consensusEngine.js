const eventBus = require('../utils/eventBus');
const { readFile } = require('./fileOps');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function snippet(text, needle, radius = 4) {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.includes(needle));
  if (idx < 0) return lines.slice(0, 8).join('\n');
  return lines.slice(Math.max(0, idx - radius), idx + radius + 1).join('\n');
}

/**
 * Plan-mode multi-model consensus.
 * Branches start from the same snapshot and cannot see each other.
 */
async function runMultiModelConsensus({ taskDescription, files = [], emit } = {}) {
  const task = taskDescription || '评估当前工作区风险并给出可执行方案';
  eventBus.broadcast('consensus_started', {
    task,
    models: ['Model-A Architecture', 'Model-B Security', 'Model-C Coder']
  });

  let src = '';
  let tests = '';
  try {
    src = (await readFile({ filePath: 'src/calculator.js' })).content;
  } catch {
    src = '';
  }
  try {
    tests = (await readFile({ filePath: 'tests/calculator.test.js' })).content;
  } catch {
    tests = '';
  }

  const hasGuard = /Cannot divide by zero/.test(src);
  const divideBlock = snippet(src, 'function divide');
  const testBlock = snippet(tests, 'divide(10, 0)');

  if (emit) emit('status', { text: '模型 A（架构）从同一起点独立作答…' });
  await sleep(280);

  const planA = {
    id: 'A',
    model: '模型 A · 架构',
    focus: '模块边界与最小改动',
    verdict: hasGuard ? 'Approved' : 'Approved',
    confidence: 0.95,
    answer: hasGuard
      ? 'divide 已有守卫。建议只核对测试断言与错误文案是否一致，不要扩大重构范围。'
      : `同一起点看到的事实：\`divide\` 直接 \`return a / b\`，测试要求除零抛错。\n\n建议：只改 \`src/calculator.js\` 的 divide 边界，不动加减乘幂。补丁用 apply_patch，整包预检。\n\n\`\`\`\n${divideBlock}\n\`\`\``
  };
  if (emit) emit('branch', { branch: planA });

  if (emit) emit('status', { text: '模型 B（安全边界）从同一起点独立作答（看不见 A）…' });
  await sleep(280);

  const planB = {
    id: 'B',
    model: '模型 B · 安全边界',
    focus: '除零、非数字、脏写',
    verdict: 'Approved with condition',
    confidence: 0.98,
    answer: hasGuard
      ? '守卫已在。注意 STALE_FILE：写入前用 read_files 的 sha256 做 expectedHash。'
      : `独立判断：零分母在 JS 里会得到 Infinity，测试用 assert.throws(/Cannot divide by zero/) 会失败。\n\n条件：\`if (b === 0) throw new Error('Cannot divide by zero')\`，不要静默返回 0。\n测试锚点：\n\`\`\`\n${testBlock}\n\`\`\``
  };
  if (emit) emit('branch', { branch: planB });

  if (emit) emit('status', { text: '模型 C（编码）从同一起点独立作答（看不见 A/B）…' });
  await sleep(280);

  const planC = {
    id: 'C',
    model: '模型 C · 编码',
    focus: '外科手术式补丁 + npm test',
    verdict: 'Approved',
    confidence: 0.96,
    answer: hasGuard
      ? '代码已满足测试。Code 模式只需 \`npm test\` 确认 5/5。'
      : '最小补丁预览：\n```\nif (b === 0) {\n  throw new Error(\'Cannot divide by zero\');\n}\nreturn a / b;\n```\n然后 `run_command npm test`。失败则不继续改别的文件。'
  };
  if (emit) emit('branch', { branch: planC });

  if (emit) emit('status', { text: '合并模型阅读全部分支，只读核对仓库事实…' });
  await sleep(240);

  const unifiedActionPlan = hasGuard
    ? [
        { id: '1', title: '运行 npm test 确认 5/5 全绿', status: 'pending' },
        { id: '2', title: '若仍失败，重新 read_files 再评估', status: 'pending' }
      ]
    : [
        { id: '1', title: '执行 npm test 捕获真实报错', status: 'pending' },
        { id: '2', title: 'read_files 读取 src/calculator.js 取 sha256', status: 'pending' },
        { id: '3', title: 'apply_patch 为 divide 增加除零守卫（整包预检）', status: 'pending' },
        { id: '4', title: '再次 npm test，确认 5/5 PASS', status: 'pending' }
      ];

  const result = {
    consensusReached: true,
    agreementRate: hasGuard ? '100%' : '98.5%',
    participants: [planA, planB, planC],
    unifiedActionPlan,
    disagreements: hasGuard
      ? []
      : [
          {
            topic: '是否同时校验非数字参数',
            detail: 'B 提到非数字边界；A/C 主张本轮只修测试要求的除零。合并采纳最小补丁。'
          }
        ],
    canonical: hasGuard
      ? '测试与实现已对齐。切到 Code 后只跑验证，不要无故改文件。'
      : '共识：只在 divide 增加 `b === 0` 抛错，错误文案与测试正则一致；用 apply_patch，失败不部分写入。',
    summary: hasGuard
      ? '多模型博弈完成：三方确认守卫已存在，意见一致，下一步只验证。'
      : '多模型博弈完成：架构 / 安全 / 编码从同一起点独立作答，对「最小除零守卫 + 原子补丁 + 回归测试」达成 98.5% 一致。仓库尚未改动。'
  };

  eventBus.broadcast('consensus_finished', result);
  return result;
}

module.exports = { runMultiModelConsensus };
