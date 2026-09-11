'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');
const store = require('../src/models/store');
const session = require('../src/mcp/session');
const { handleRpc } = require('../src/mcp/server');
const board = require('../src/tools/board');
const { applyPatch, computeHash, atomicWriteText } = require('../src/tools/patchEngine');
const { writeFile } = require('../src/tools/fileOps');
const tracker = require('../src/usage/tracker');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-state-'));
config.workspaceRoot = tmp;
(async () => {
  store.save(store.defaults());
  const file = path.join(tmp, '.webagent/config.json');
  fs.writeFileSync(file, '{broken config');
  assert.throws(() => store.load(), e => e.code === 'E_CONFIG_CORRUPT');
  assert.throws(() => store.patch({ activeModelId: 'builtin' }), /已保留/);
  assert.throws(() => store.save(store.defaults()), /已保留/);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), '{broken config');
  fs.unlinkSync(file); // Explicit operator recovery; never done by load/save.
  assert.throws(() => store.save({ models: 'invalid' }), /models/);
  store.save(store.defaults());
  const original = fs.readFileSync(file, 'utf8');
  const rename = fs.renameSync;
  try {
    fs.renameSync = (a, b) => { if (b === file) throw new Error('disk failure fixture'); return rename(a, b); };
    assert.throws(() => store.patch({ activeModelId: 'changed' }), /disk failure/);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), original);
    assert.ok(!fs.readdirSync(path.dirname(file)).some(n => n.includes('.tmp.')));
  } finally { fs.renameSync = rename; }
  fs.writeFileSync(path.join(tmp, 'one.txt'), 'original');
  await assert.rejects(() => applyPatch({ filePath: 'one.txt', patch: 'new', expectedHash: computeHash('original').slice(0, 8) }), /STALE/);
  await assert.rejects(() => writeFile({ filePath: 'deleted.txt', content: 'no', expectedHash: computeHash('original') }), /删除/);
  assert.ok(!fs.existsSync(path.join(tmp, 'deleted.txt')));
  if (process.platform !== 'win32') {
    fs.symlinkSync(path.join(tmp, 'one.txt'), path.join(tmp, 'alias.txt'));
    atomicWriteText(path.join(tmp, 'alias.txt'), 'updated');
    assert.ok(fs.lstatSync(path.join(tmp, 'alias.txt')).isSymbolicLink());
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'one.txt'), 'utf8'), 'updated');
  }
  session.reset();
  function req(method, params, id) { return { ip: '127.0.0.1', mcpSessionId: id,
    headers: id ? { 'mcp-session-id': id } : {}, body: { method, params } }; }
  const a = session.createHttpSession(), b = session.createHttpSession();
  await handleRpc(req('initialize', { clientInfo: { name: 'Same Name' } }, a));
  await handleRpc(req('initialize', { clientInfo: { name: 'Same Name' } }, b));
  assert.notStrictEqual(session.keyForReq(req('', {}, a)), session.keyForReq(req('', {}, b)));
  assert.strictEqual(session.keyForReq(req('', {})), null);
  const denied = await handleRpc(req('tools/call', { name: 'board_create', arguments: { title: 'no session' } }));
  assert.strictEqual(denied.isError, true);
  const ctx = { callerKey: 'peer:' + a };
  const created = await board.boardCreate({ title: 'claim required' }, ctx);
  assert.strictEqual((await board.boardUpdate({ id: created.task.id, status: 'done' }, ctx)).ok, false);
  assert.strictEqual((await board.boardClaim({ id: created.task.id, owner: 'other' }, ctx)).ok, false);
  await board.boardClaim({ id: created.task.id }, ctx);
  const before = tracker.snapshot().fail;
  const taken = await handleRpc(req('tools/call', { name: 'board_claim', arguments: { id: created.task.id } }, b));
  assert.strictEqual(taken.isError, true);
  assert.strictEqual(JSON.parse(taken.content[0].text).ok, false);
  assert.strictEqual(tracker.snapshot().fail, before + 1);
  console.log('configuration, hash/link, peer identity and board-state regressions passed');
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => {
  session.reset(); tracker.stopReporter(); fs.rmSync(tmp, { recursive: true, force: true });
});
