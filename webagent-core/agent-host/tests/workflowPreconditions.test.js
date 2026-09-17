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
    // A real write followed by a failing subscriber is not a proven no-effect failure.
    const eventBus = require('../src/utils/eventBus');
    for (const [index, code] of ['E_LISTENER_FAILED','E_CANCELLED'].entries()) {
      const target = `interrupted-${index}.txt`, later = `not-run-${index}.txt`;
      const interrupted = workflows.request({definition:{steps:[writeStep('write',target,'effect remains'),writeStep('later',later,'never')]},requestKey:`interrupted-${index}`});
      eventBus.once('file_written', () => {const error=new Error('fixture after disk write');error.code=code;throw error;});
      await queue.approve(interrupted.requestId,true);
      const interruptedResult = queue.inspect(interrupted.requestId);
      assert.strictEqual(fs.readFileSync(path.join(root,target),'utf8'),'effect remains');
      assert.strictEqual(interruptedResult.status,'unknown','exception after write dispatch must not pretend effects are known');
      assert.strictEqual(interruptedResult.result.steps[0].status,'unknown');
      assert.strictEqual(interruptedResult.result.steps[0].execution,'dispatched');
      assert.ok(!fs.existsSync(path.join(root,later)));
      await queue.approve(interrupted.requestId,true);
      assert.ok(!fs.existsSync(path.join(root,later)),'terminal requests never replay');
    }
    const cancelled = workflows.request({definition:{steps:[writeStep('first','cancel-first.txt','kept'),writeStep('later','cancel-later.txt','never')]},requestKey:'cancel-between-steps'});
    eventBus.once('file_written',()=>queue.cancel(cancelled.requestId));
    await queue.approve(cancelled.requestId,true);
    const cancelledJob = queue.inspect(cancelled.requestId);
    assert.strictEqual(cancelledJob.status,'cancelled');
    assert.strictEqual(cancelledJob.cancelRequested,true,'retain cancellation intent after clearing the controller');
    assert.strictEqual(cancelledJob.result.steps[1].execution,'not-started');
    assert.strictEqual(fs.readFileSync(path.join(root,'cancel-first.txt'),'utf8'),'kept');
    assert.ok(!fs.existsSync(path.join(root,'cancel-later.txt')));
    assert.strictEqual(cancelledJob.result.steps[0].status,'succeeded','cancellation does not erase confirmed earlier effects');
    const completed = workflows.request({definition:{steps:[writeStep('only','cancel-completed.txt','verified')]},requestKey:'cancel-at-completion'});
    eventBus.once('file_written',()=>queue.cancel(completed.requestId));
    await queue.approve(completed.requestId,true);
    assert.strictEqual(queue.inspect(completed.requestId).status,'succeeded','last step with a verified success is not made unknown just because cancellation was requested');
    assert.strictEqual(queue.inspect(completed.requestId).cancelRequested,true);
    const tools = require('../src/tools'), originalCall = tools.callTool;
    try {
      for (const [index, output] of [null,{trace:{status:'accepted',callId:'fixture'}},{trace:{status:'succeeded'},verification:{state:'unknown'}},{trace:{status:'succeeded'},status:'running'}].entries()) {
        let dispatched = 0;
        tools.callTool = async () => {dispatched++;return output;};
        const unconfirmed = workflows.request({definition:{steps:[{id:'read',tool:'ping',arguments:{}},writeStep('later',`unconfirmed-${index}.txt`,'never')]},requestKey:`unconfirmed-${index}`});
        await queue.approve(unconfirmed.requestId,true);
        assert.strictEqual(queue.inspect(unconfirmed.requestId).status,'unknown');
        assert.strictEqual(dispatched,1,'unconfirmed completion cannot start later steps');
      }
    } finally {tools.callTool=originalCall;}
    console.log('workflow preconditions: review drift, immutable approval, no replay, partial effects, strict schema and path guard passed');
  } finally { config.workspaceRoot = previous; fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
