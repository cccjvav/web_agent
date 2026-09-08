const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-board-'));
config.workspaceRoot = tmp;

const board = require('../src/tools/board');

const A = { callerKey: 'Arena@10.0.0.1' };
const B = { callerKey: 'ChatPlus@10.0.0.2' };

async function main() {
  // create + list
  const c1 = await board.boardCreate({ title: 'fix login css' }, A);
  assert.strictEqual(c1.ok, true);
  const id = c1.task.id;
  assert.strictEqual(c1.task.status, 'open');
  assert.strictEqual(c1.task.owner, null);
  assert.strictEqual(c1.task.createdBy, A.callerKey);
  const list = board.boardList({}, A);
  assert.strictEqual(list.open, 1);
  assert.strictEqual(list.tasks[0].id, id);

  // claim by B, double-claim by A rejected
  const cl = await board.boardClaim({ id }, B);
  assert.strictEqual(cl.ok, true);
  assert.strictEqual(cl.task.owner, B.callerKey);
  assert.strictEqual(cl.task.status, 'claimed');
  const dup = await board.boardClaim({ id }, A);
  assert.strictEqual(dup.ok, false);
  assert.strictEqual(dup.error, 'E_TAKEN');
  assert.ok(String(dup.detail).includes(B.callerKey));

  // status is owner-only; notes are not
  const wrong = await board.boardUpdate({ id, status: 'doing' }, A);
  assert.strictEqual(wrong.ok, false);
  assert.strictEqual(wrong.error, 'E_NOT_OWNER');
  const note = await board.boardUpdate({ id, note: 'reading repo layout' }, A);
  assert.strictEqual(note.ok, true);
  assert.strictEqual(note.task.notes.length, 1);
  assert.strictEqual(note.task.notes[0].by, A.callerKey);
  const prog = await board.boardUpdate({ id, status: 'doing' }, B);
  assert.strictEqual(prog.ok, true);

  // parallel claim race: exactly one winner
  const c2 = await board.boardCreate({ title: 'write tests' }, A);
  const id2 = c2.task.id;
  const race = await Promise.all([board.boardClaim({ id: id2 }, A), board.boardClaim({ id: id2 }, B)]);
  assert.strictEqual(race.filter((r) => r.ok).length, 1);
  assert.strictEqual(race.filter((r) => r.error === 'E_TAKEN').length, 1);

  // release back to pool, re-claim by other peer, finish
  const rel = await board.boardUpdate({ id, status: 'open' }, B);
  assert.strictEqual(rel.ok, true);
  assert.strictEqual(rel.task.owner, null);
  const re = await board.boardClaim({ id }, A);
  assert.strictEqual(re.ok, true);
  const done = await board.boardUpdate({ id, status: 'done', note: 'shipped' }, A);
  assert.strictEqual(done.ok, true);
  assert.strictEqual(done.task.status, 'done');

  // bad args
  assert.strictEqual((await board.boardCreate({}, A)).error, 'E_BAD_ARGS');
  assert.strictEqual((await board.boardClaim({}, A)).error, 'E_BAD_ARGS');
  assert.strictEqual((await board.boardUpdate({ id, status: 'nope' }, A)).error, 'E_BAD_ARGS');
  assert.strictEqual((await board.boardUpdate({ id }, A)).error, 'E_BAD_ARGS');
  assert.strictEqual((await board.boardUpdate({ id: 't999', note: 'anyone there?' }, A)).error, 'E_NOT_FOUND');

  // persistence + peers shape
  const raw = JSON.parse(fs.readFileSync(board._boardPath(), 'utf8'));
  assert.strictEqual(raw.tasks.length, 2);
  const p = board.peersList({}, A);
  assert.ok(Array.isArray(p.peers));
  assert.ok(p.aliveWindowMs > 0);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('board.test ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
