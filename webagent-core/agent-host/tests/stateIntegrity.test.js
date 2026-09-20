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
  const { createUnifiedDiff } = require('../src/utils/diff');
  assert.strictEqual(createUnifiedDiff('a', 'x\n', 'x\n\n').additions, 1);
  assert.strictEqual(createUnifiedDiff('a', '\n\n', '').deletions, 2);
  const clock = Date.now;
  try {
    session.touch({}, { key: 'expired-fixture' });
    session.createHttpSession();
    Date.now = () => clock() + 25 * 60 * 60 * 1000;
    assert.strictEqual(session.snapshot().httpSessions, 0);
    assert.strictEqual(session.allSessions().length, 0);
  } finally { Date.now = clock; }
  // F54借鉴ShunCode会话驱逐：有在途工作的会话不因容量/TTL被驱逐；release后恢复可驱逐。
  {
    session.reset();
    const busy = session.createHttpSession({ principal: 'busy-owner' });
    const releaseBusy = session.beginHttpSessionWork(busy);
    session.touchHttpSession(busy, 'busy-owner').lastSeen = Date.now() - 1000000;
    for (let i = 0; i < 205; i++) session.createHttpSession({ principal: 'filler' });
    assert.ok(session.touchHttpSession(busy, 'busy-owner'), 'active session must survive capacity eviction');
    const busyClock = Date.now;
    try {
      Date.now = () => busyClock() + 25 * 60 * 60 * 1000;
      session.createHttpSession();
      assert.ok(session.touchHttpSession(busy, 'busy-owner'), 'active session must survive TTL prune');
    } finally { Date.now = busyClock; }
    assert.strictEqual(releaseBusy(), true);
    assert.strictEqual(releaseBusy(), false, 'release is single-use');
    session.touchHttpSession(busy, 'busy-owner').lastSeen = Date.now() - 1000000;
    for (let i = 0; i < 205; i++) session.createHttpSession({ principal: 'filler2' });
    assert.strictEqual(session.touchHttpSession(busy, 'busy-owner'), null, 'released session is evictable again');
    assert.strictEqual(session.beginHttpSessionWork('missing-id')(), false, 'unknown id yields no-op release');
    session.reset();
  }

  // All-busy is refusal, never a license to destroy another owner's active session.
  {
    session.reset();
    const ids = [], releases = [];
    for (let i = 0; i < 200; i++) {
      const id = session.createHttpSession(); ids.push(id);
      releases.push(session.beginHttpSessionWork(id));
    }
    assert.strictEqual(session.createHttpSession(), null);
    assert.ok(ids.every(id => session.touchHttpSession(id)));
    releases.forEach(release => release());
    session.reset();
    const id = session.createHttpSession(), release = session.beginHttpSessionWork(id);
    const realClock = Date.now;
    try {
      const finish = realClock() + 25 * 60 * 60 * 1000;
      Date.now = () => finish;
      assert.strictEqual(session.snapshot().httpSessions, 1);
      assert.strictEqual(release(), true);
      assert.strictEqual(session.snapshot().httpSessions, 1, 'completion starts idle TTL');
      Date.now = () => finish + 23 * 60 * 60 * 1000;
      assert.strictEqual(release(), false, 'duplicate release must not refresh idle TTL');
      Date.now = () => finish + 25 * 60 * 60 * 1000;
      assert.strictEqual(session.snapshot().httpSessions, 0);
    } finally { Date.now = realClock; session.reset(); }
    const shared = session.createHttpSession(), first = session.beginHttpSessionWork(shared), second = session.beginHttpSessionWork(shared);
    const record = session.touchHttpSession(shared);
    assert.strictEqual(record.active, 2);
    first(); first();
    assert.strictEqual(record.active, 1, 'one completion cannot release another request');
    second();
    assert.strictEqual(record.active, 0);
    session.reset();
    const gone = session.createHttpSession(), done = session.beginHttpSessionWork(gone);
    session.destroyHttpSession(gone); done();
    assert.strictEqual(session.snapshot().httpSessions, 0, 'release never resurrects deleted sessions');
  }

  const owned = session.createHttpSession({ principal: 'fixture-owner' });
  session.setHttpSessionKey(owned, 'peer:fixture-public-label');
  const record = session.touchHttpSession(owned, 'fixture-owner');
  const seen = record.lastSeen;
  try {
    Date.now = () => seen + 1000;
    assert.strictEqual(session.getHttpSession(owned, 'different-owner'), null);
    assert.strictEqual(session.getHttpSession(owned, 'fixture-owner'), record);
    assert.strictEqual(record.lastSeen, seen, 'admission lookup must not renew even the correct owner');
    Date.now = () => seen + 25 * 60 * 60 * 1000;
    assert.strictEqual(session.getHttpSession(owned, 'fixture-owner'), null);
    assert.strictEqual(record.lastSeen, seen);
    Date.now = () => seen + 1000;
    assert.strictEqual(session.touchHttpSession(owned, 'different-owner'), null);
    assert.strictEqual(session.keyForReq({ mcpSessionId: owned, mcpPrincipal: 'different-owner' }), null);
    assert.strictEqual(session.destroyHttpSession(owned, 'different-owner'), false);
    assert.strictEqual(record.lastSeen, seen, 'wrong principal must not renew the session lifetime');
    assert.strictEqual(session.keyForReq({ mcpSessionId: owned, mcpPrincipal: 'fixture-owner' }), 'peer:fixture-public-label');
    assert.strictEqual(record.lastSeen, seen + 1000);
    assert.strictEqual(session.destroyHttpSession(owned, 'fixture-owner'), true);
  } finally { Date.now = clock; }


  const custom = require('../src/models/customizations');
  fs.mkdirSync(path.join(tmp, '.webagent'), { recursive: true });
  const customFile = path.join(tmp, '.webagent/customizations.json');
  fs.writeFileSync(customFile, '{broken custom');
  assert.throws(() => custom.loadCustom(), /CORRUPT/);
  assert.throws(() => custom.saveCustom(custom.defaults()), /CORRUPT/);
  assert.strictEqual(fs.readFileSync(customFile, 'utf8'), '{broken custom');
  fs.unlinkSync(customFile);
  custom.saveCustom(custom.defaults());
  const customBefore = fs.readFileSync(customFile, 'utf8');
  const renameCustom = fs.renameSync;
  try {
    fs.renameSync = (a, b) => { if (b === customFile) throw new Error('custom rename fixture'); return renameCustom(a, b); };
    assert.throws(() => custom.patchCustom({ preference: 'must not publish' }), /custom rename/);
    assert.strictEqual(fs.readFileSync(customFile, 'utf8'), customBefore);
    assert.ok(!fs.readdirSync(path.dirname(customFile)).some(n => n.includes('.tmp.')));
  } finally { fs.renameSync = renameCustom; }
  const boardFile = path.join(tmp, '.webagent/board.json');
  fs.writeFileSync(boardFile, '{broken board');
  await assert.rejects(() => board.boardCreate({ title: 'no overwrite' }), /CORRUPT/);
  assert.strictEqual(fs.readFileSync(boardFile, 'utf8'), '{broken board');
  fs.unlinkSync(boardFile);
  await board.boardCreate({ title: 'keep board' });
  const boardBefore = fs.readFileSync(boardFile, 'utf8');
  try {
    fs.renameSync = (a, b) => { if (b === boardFile) throw new Error('board rename fixture'); return renameCustom(a, b); };
    await assert.rejects(() => board.boardCreate({ title: 'not committed' }), /board rename/);
    assert.strictEqual(fs.readFileSync(boardFile, 'utf8'), boardBefore);
    assert.ok(!fs.readdirSync(path.dirname(boardFile)).some(n => n.includes('.tmp.')));
  } finally { fs.renameSync = renameCustom; }
  if (process.platform !== 'win32') {
    assert.strictEqual(fs.statSync(customFile).mode & 0o777, 0o600);
    assert.strictEqual(fs.statSync(boardFile).mode & 0o777, 0o600);
  }
  const { publicError } = require('../src/mcp/errors');
  for (const name of ['required.md', 'timeout.log']) assert.strictEqual(publicError(new Error('File not found: ' + name)).code, 'E_NOT_FOUND');

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
  const ctx = { callerKey: session.keyForReq(req('', {}, a)) };
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
