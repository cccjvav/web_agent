'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { config } = require('../src/config');
const workflows = require('../src/tools/workflows');
const queue = require('../src/utils/operatorQueue');
const { computeHash } = require('../src/tools/patchEngine');
const previous = config.workspaceRoot, root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-before-'));
config.workspaceRoot = root;
function writeStep(id, filePath, content, before) {
  return { id, tool: 'write_file', arguments: { filePath, content, confirm_overwrite: true }, ...(before ? { before } : {}) };
}
async function main() {
  try {
    const original = 'reviewed version';
    fs.writeFileSync(path.join(root, 'target.txt'), original);
    const step = writeStep('edit', 'target.txt', 'approved change', { path: 'target.txt', sha256: computeHash(original) });
    const definition = { steps: [step, writeStep('later', 'later.txt', 'never')] };
    const preview = workflows.preview(definition);
    assert.strictEqual(preview.writeChecks[0].guard, 'explicit-precondition');
    assert.strictEqual(preview.writeChecks[1].guard, 'unguarded');
    assert.strictEqual(fs.readFileSync(path.join(root, 'target.txt'), 'utf8'), original);
    const pending = workflows.request({ definition, requestKey: 'guard-stale-001' });
    definition.steps[0].before.sha256 = computeHash('other edit'); // submitted definition is immutable
    fs.writeFileSync(path.join(root, 'target.txt'), 'other edit');
    await queue.approve(pending.requestId, true);
    const result = queue.inspect(pending.requestId).result;
    assert.strictEqual(result.steps[0].execution, 'not-started');
    assert.strictEqual(result.steps[0].errorCode, 'E_PRECONDITION');
    assert.strictEqual(fs.readFileSync(path.join(root, 'target.txt'), 'utf8'), 'other edit');
    assert.ok(!fs.existsSync(path.join(root, 'later.txt')));
    fs.writeFileSync(path.join(root, 'target.txt'), original);
    await queue.approve(pending.requestId, true); // fixing the condition cannot replay the failed request
    assert.strictEqual(fs.readFileSync(path.join(root, 'target.txt'), 'utf8'), original);
    const success = workflows.request({ definition: { steps: [writeStep('edit', 'target.txt', 'new', { path: 'target.txt', sha256: computeHash(original) })] }, requestKey: 'guard-fresh-001' });
    await queue.approve(success.requestId, true);
    assert.strictEqual(queue.inspect(success.requestId).status, 'succeeded');
    const partial = workflows.request({ definition: { steps: [
      writeStep('first', 'first.txt', 'remains', { path: 'first.txt', exists: false }),
      writeStep('blocked', 'target.txt', 'bad', { path: 'target.txt', exists: false }),
      writeStep('never', 'never.txt', 'bad')
    ] }, requestKey: 'guard-partial-001' });
    await queue.approve(partial.requestId, true);
    assert.strictEqual(queue.inspect(partial.requestId).result.stoppedAt, 'blocked');
    assert.strictEqual(fs.readFileSync(path.join(root, 'first.txt'), 'utf8'), 'remains');
    assert.strictEqual(fs.readFileSync(path.join(root, 'target.txt'), 'utf8'), 'new');
    assert.ok(!fs.existsSync(path.join(root, 'never.txt')));
    for (const condition of [null, {}, [], { path: 'x', exists: null }, { path: 'x', sha256: null }, { path: 'x', contains: 3 }, { path: 'x', exists: false, typo: true }]) {
      for (const field of ['before', 'expect']) assert.throws(() => workflows.preview({ steps: [{ ...writeStep('x', 'x', 'x'), [field]: condition }] }));
    }
    assert.throws(() => workflows.preview({ steps: [{ ...writeStep('x', 'x', 'x'), precondition: { path: 'x', exists: false } }] }), /Unknown/);
    const forbidden = workflows.request({ definition: { steps: [writeStep('x', 'x', 'x', { path: '../outside.txt', exists: false })] }, requestKey: 'guard-path-001' });
    await queue.approve(forbidden.requestId, true);
    assert.strictEqual(queue.inspect(forbidden.requestId).result.steps[0].errorCode, 'E_PRECONDITION');
    assert.ok(!fs.existsSync(path.join(root, 'x')));
    console.log('workflow preconditions: review drift, immutable approval, no replay, partial effects, strict schema and path guard passed');
  } finally { config.workspaceRoot = previous; fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
