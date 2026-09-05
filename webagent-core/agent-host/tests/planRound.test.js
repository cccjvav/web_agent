const assert = require('assert');
const planRound = require('../src/tools/planRound');

function throwsCode(fn, code) {
  let err;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  assert.ok(err, `expected ${code}`);
  assert.strictEqual(err.code, code);
}

planRound.reset();
assert.strictEqual(planRound.clampMax(undefined), 4);
assert.strictEqual(planRound.clampMax(1), 2);
assert.strictEqual(planRound.clampMax(99), 8);
assert.strictEqual(planRound.snapshot().active, false);

throwsCode(() => planRound.start({ task: '  ' }), 'E_PLAN_NO_TASK');
throwsCode(() => planRound.addBranch({ answer: 'x' }), 'E_PLAN_NO_ROUND');

const round = planRound.start({ task: '修测试', maxBranches: 3 });
assert.strictEqual(round.maxBranches, 3);
assert.strictEqual(planRound.snapshot().canMerge, false);
assert.strictEqual(planRound.snapshot().canBranch, false);

const a = planRound.addBranch({
  modelId: 'builtin',
  modelName: '内置探索',
  thinkLevel: 'high',
  simulated: true,
  answer: '分支甲：先读测试'
});
assert.strictEqual(a.index, 1);
assert.strictEqual(planRound.snapshot().canBranch, true);
assert.strictEqual(planRound.snapshot().canMerge, false);

planRound.addBranch({
  modelId: 'other',
  modelName: '另一模型',
  thinkLevel: 'low',
  simulated: true,
  answer: '分支乙：先看入口'
});
assert.strictEqual(planRound.snapshot().canMerge, true);
assert.strictEqual(planRound.snapshot().branches.length, 2);

planRound.addBranch({ modelName: '第三', answer: '分支丙' });
throwsCode(() => planRound.addBranch({ answer: '溢出' }), 'E_PLAN_FULL');

const snap = planRound.markMerged({ simulated: true, agreementRate: null });
assert.strictEqual(snap.merged, true);
assert.strictEqual(snap.canMerge, false);
throwsCode(() => planRound.addBranch({ answer: '晚了' }), 'E_PLAN_MERGED');

planRound.reset();
planRound.start({ task: '只要两支', maxBranches: 4 });
planRound.addBranch({ answer: '一' });
throwsCode(() => planRound.markMerged({}), 'E_PLAN_NEED_TWO');
planRound.addBranch({ answer: '二' });
planRound.markMerged({ simulated: true });
assert.ok(planRound.snapshot().merged);
planRound.reset();

console.log('planRound tests passed');
