'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const { config } = require('../src/config');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-'));
config.workspaceRoot = tmp;
const checkpoints = require('../src/utils/fileCheckpoints');
const tools = require('../src/tools');
const binding = { workspaceRoot: tmp, hostInstanceId: config.hostInstanceId };
const file = name => path.join(tmp, name);
function create(paths = ['a.txt', 'b.txt']) { return checkpoints.create({ ...binding, paths, confirmed: true }); }
async function main() {
  const originalCall = tools.callTool;
  let now = Date.now;
  try {
    fs.writeFileSync(file('a.txt'), 'original A'); fs.writeFileSync(file('b.txt'), 'original B');
    assert.throws(() => checkpoints.create({ ...binding, paths: ['a.txt'] }), /确认/);
    assert.throws(() => create(['a.txt', './a.txt']), /重复/);
    assert.throws(() => create(['../outside.txt']));
    assert.throws(() => create(Array(13).fill('a.txt')));
    const record = create();
    assert.equal(fs.readFileSync(file('a.txt'), 'utf8'), 'original A');
    assert(!JSON.stringify(checkpoints.list()).includes('original A'), 'listing does not leak original content');
    fs.writeFileSync(file('a.txt'), 'changed A'); fs.writeFileSync(file('b.txt'), 'changed B');
    let preview = checkpoints.preview(record.id, binding);
    assert.match(preview.files[0].diff, /original A/);
    assert.equal(fs.readFileSync(file('a.txt'), 'utf8'), 'changed A', 'preview is read only');
    await assert.rejects(checkpoints.restore(record.id, { ...binding, previewId: preview.previewId, confirmed: 'true' }));
    fs.writeFileSync(file('b.txt'), 'later B');
    await assert.rejects(checkpoints.restore(record.id, { ...binding, previewId: preview.previewId, confirmed: true }), /未开始/);
    assert.equal(fs.readFileSync(file('a.txt'), 'utf8'), 'changed A', 'all-file preflight prevents partial write');
    const oldTicket = preview.previewId;
    preview = checkpoints.preview(record.id, binding);
    await assert.rejects(checkpoints.restore(record.id, { ...binding, previewId: oldTicket, confirmed: true }));
    const success = await checkpoints.restore(record.id, { ...binding, previewId: preview.previewId, confirmed: true });
    assert.equal(success.result.status, 'succeeded'); assert.deepEqual(success.result.files.map(item => item.status), ['restored', 'restored']);
    assert.equal(fs.readFileSync(file('a.txt'), 'utf8'), 'original A'); assert.equal(fs.readFileSync(file('b.txt'), 'utf8'), 'original B');
    await assert.rejects(checkpoints.restore(record.id, { ...binding, previewId: preview.previewId, confirmed: true }));
    assert.throws(() => checkpoints.preview(record.id, binding), /重放/);
    checkpoints.remove(record.id, binding);
    fs.writeFileSync(file('c.txt'), 'original C');
    const partial = create(['a.txt', 'b.txt', 'c.txt']);
    for (const name of ['a.txt', 'b.txt', 'c.txt']) fs.writeFileSync(file(name), 'changed');
    preview = checkpoints.preview(partial.id, binding);
    let calls = 0;
    tools.callTool = async (...args) => {
      calls++;
      if (calls === 2) throw Error('injected uncertain write failure');
      return originalCall(...args);
    };
    const failed = await checkpoints.restore(partial.id, { ...binding, previewId: preview.previewId, confirmed: true });
    assert.deepEqual(failed.result.files.map(item => item.status), ['restored', 'unknown', 'not-started']);
    assert.equal(fs.readFileSync(file('a.txt'), 'utf8'), 'original A'); assert.equal(fs.readFileSync(file('c.txt'), 'utf8'), 'changed');
    assert.equal(checkpoints.list().find(item => item.id === partial.id).result.status, 'unknown');
    await assert.rejects(checkpoints.restore(partial.id, { ...binding, previewId: preview.previewId, confirmed: true })); assert.equal(calls, 2);
    tools.callTool = originalCall; checkpoints.remove(partial.id, binding);
    // Drift after all-file preflight but before the second dispatch: stop, keep first restoration.
    const lateDrift = create();
    fs.writeFileSync(file('a.txt'), 'late A'); fs.writeFileSync(file('b.txt'), 'late B');
    preview = checkpoints.preview(lateDrift.id, binding); calls = 0;
    tools.callTool = async (...args) => {
      calls++;
      assert.throws(() => checkpoints.remove(lateDrift.id, binding), /正在/);
      assert.throws(() => checkpoints.preview(lateDrift.id, binding), /重放/);
      await assert.rejects(checkpoints.restore(lateDrift.id, { ...binding, previewId: preview.previewId, confirmed: true }));
      const result = await originalCall(...args);
      fs.writeFileSync(file('b.txt'), 'concurrent edit'); return result;
    };
    const stopped = await checkpoints.restore(lateDrift.id, { ...binding, previewId: preview.previewId, confirmed: true });
    assert.equal(stopped.result.status, 'failed'); assert.equal(calls, 1);
    assert.deepEqual(stopped.result.files.map(item => item.status), ['restored', 'not-started']);
    assert.equal(fs.readFileSync(file('b.txt'), 'utf8'), 'concurrent edit');
    tools.callTool = originalCall; checkpoints.remove(lateDrift.id, binding);
    // Real disk publication followed by a throwing subscriber: unknown, never a rollback.
    const interrupted = create();
    fs.writeFileSync(file('a.txt'),'after checkpoint A');fs.writeFileSync(file('b.txt'),'after checkpoint B');
    preview=checkpoints.preview(interrupted.id,binding);
    require('../src/utils/eventBus').once('file_written',()=>{throw new Error('fixture after real checkpoint write');});
    const uncertain=await checkpoints.restore(interrupted.id,{...binding,previewId:preview.previewId,confirmed:true});
    assert.equal(uncertain.result.status,'unknown');
    assert.deepEqual(uncertain.result.files.map(item=>item.status),['unknown','not-started']);
    assert.equal(fs.readFileSync(file('a.txt'),'utf8'),'original A');
    assert.equal(fs.readFileSync(file('b.txt'),'utf8'),'after checkpoint B');
    await assert.rejects(checkpoints.restore(interrupted.id,{...binding,previewId:preview.previewId,confirmed:true}));
    checkpoints.remove(interrupted.id,binding);
    const fresh = create();
    assert.throws(() => checkpoints.preview(fresh.id, { ...binding, hostInstanceId: 'other' }));
    Date.now = () => now() + 16 * 60 * 1000; assert.equal(checkpoints.list().length, 0); Date.now = now;
    for (const bytes of [Buffer.alloc(65537), Buffer.from([0xc3, 0x28]), Buffer.from([0]), Buffer.from([0xef, 0xbb, 0xbf, 65])]) {
      fs.writeFileSync(file('bad.txt'), bytes); assert.throws(() => create(['bad.txt']));
    }
    const huge = [];
    for (let index = 0; index < 5; index++) { const name = 'large' + index; fs.writeFileSync(file(name), 'x'.repeat(65536)); huge.push(name); }
    assert.throws(() => create(huge), /合计/);
    const missing = create(); fs.unlinkSync(file('b.txt')); assert.throws(() => checkpoints.preview(missing.id, binding)); checkpoints.remove(missing.id, binding);
    for (let index = 0; index < 8; index++) create(['a.txt']); assert.throws(() => create(['a.txt']), /8个/);
    console.log('fileCheckpoints: real multi-file restore, all-file preflight, immutable tickets, partial failure/no replay, bounds and binding passed');
  } finally {
    Date.now = now; tools.callTool = originalCall;
    for (const item of checkpoints.list()) checkpoints.remove(item.id, binding);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
