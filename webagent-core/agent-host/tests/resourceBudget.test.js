'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { clipJson } = require('../src/mcp/budget');
const { readBoundedText } = require('../src/utils/boundedFile');
const { config } = require('../src/config');
const { grepSearch, readFiles, listDir } = require('../src/tools/fileOps');
const { findFiles } = require('../src/tools/findFiles');
const { withWriteLock, atomicWriteText } = require('../src/tools/patchEngine');
const { runWithSignal } = require('../src/utils/requestScope');
(async () => {
  const dated = clipJson({ mtime: new Date('2026-09-11T00:00:00Z'), stdout: 'x'.repeat(20000) });
  assert.strictEqual(dated.mtime, '2026-09-11T00:00:00.000Z');
  const page = { cursor: 50, nextCursor: 150, matches: Array.from({ length: 100 }, (_, i) => ({ line: i, content: 'x'.repeat(400) })) };
  const clipped = clipJson(page);
  assert.strictEqual(clipped.matches.length, 100); assert.strictEqual(clipped.nextCursor, 150);
  assert.deepStrictEqual(clipped.matches, page.matches); assert.strictEqual(clipped._budgetExceeded, true);
  assert.ok(Array.isArray(clipJson(Array.from({ length: 200 }, () => ({ text: 'x'.repeat(1000) })))));
  assert.strictEqual(clipJson({ success: true, hash: 'a'.repeat(64), stdout: 'x'.repeat(20000) }).success, true);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-budget-')), old = config.workspaceRoot;
  try {
    config.workspaceRoot = tmp;
    fs.writeFileSync(path.join(tmp, 'root.txt'), 'needle');
    assert.throws(() => readBoundedText(path.join(tmp, 'root.txt'), 3), /budget/);
    assert.throws(() => readFiles({ paths: Array(21).fill('root.txt') }), /20 paths/);
    assert.ok(findFiles({ glob: '**/*.txt' }).files.includes('root.txt'));
    // find_files runs on the main thread. The old glob->RegExp translation backtracked
    // exponentially on repeated "**/": ten of them on a 25-deep path took ~9 s, twelve ~100 s,
    // freezing every other request. The matcher must stay linear and keep the old semantics.
    {
      let deep = tmp;
      for (let i = 0; i < 25; i++) deep = path.join(deep, 'd' + i);
      fs.mkdirSync(deep, { recursive: true });
      fs.writeFileSync(path.join(deep, 'leaf.txt'), '');
      const started = Date.now();
      assert.deepStrictEqual(findFiles({ glob: '**/'.repeat(10) + 'nomatch' }).files, []);
      assert.ok(Date.now() - started < 3000, `repeated **/ must not backtrack (took ${Date.now() - started} ms)`);
      const { compileGlob, matchGlob, MAX_GLOB_LENGTH } = require('../src/tools/findFiles');
      const cases = [ // [glob, path, expected] -- the old RegExp semantics, including edge precedence
        ['**/*', 'a/b.js', true], ['*.js', 'a.js', true], ['*.js', 'a/b.js', false], ['src/**', 'src/a/b', true],
        ['src/**/*.js', 'src/a.js', true], ['src/**/*.js', 'src/x/y/a.js', true], ['**/test?.js', 'test1.js', true],
        ['**/test?.js', 'test12.js', false], ['a/*/c', 'a/x/c', true], ['a/*/c', 'a/x/y/c', false], ['**.md', 'd/R.md', true],
        ['a.b', 'axb', false], ['(x)', '(x)', true], ['[ab]', 'a', false], ['***/', 'b', true], ['***/', 'b/', true],
        ['***\\', 'b', true], ['*\\**', 'x/yz', true], ['?', '/', false], ['', '', true], ['中*', '中文.md', true]
      ];
      for (const [g, p, want] of cases) assert.strictEqual(matchGlob(compileGlob(g), p), want, `glob ${JSON.stringify(g)} vs ${JSON.stringify(p)}`);
      assert.ok(findFiles({ glob: '**/leaf.txt' }).files.some(f => f.endsWith('d24/leaf.txt')));
      assert.throws(() => findFiles({ glob: 'a'.repeat(MAX_GLOB_LENGTH + 1) }), err => err.code === 'E_BAD_ARGS');
      fs.rmSync(path.join(tmp, 'd0'), { recursive: true, force: true });
    }
    assert.throws(() => atomicWriteText(path.join(tmp, 'root.txt'), 'overwrite', { exclusive: true }), /EEXIST/);
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'root.txt'), 'utf8'), 'needle');
    let release;
    const held = withWriteLock('root.txt', () => new Promise(resolve => { release = resolve; }));
    await new Promise(resolve => setImmediate(resolve));
    const queuedController = new AbortController();
    const queued = runWithSignal(queuedController.signal, () => withWriteLock('root.txt', () => atomicWriteText(path.join(tmp, 'root.txt'), 'bad')));
    queuedController.abort(); release(); await held; await assert.rejects(queued, err => err.code === 'E_CANCELLED');
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'root.txt'), 'utf8'), 'needle');
    const controller = new AbortController();
    const pending = runWithSignal(controller.signal, () => grepSearch({ query: 'needle' }));
    controller.abort(); await assert.rejects(pending, /cancelled/);
    assert.ok((await grepSearch({ query: 'needle' })).totalMatches > 0);
    for (let i = 0; i < 1002; i++) fs.writeFileSync(path.join(tmp, 'f' + i), '');
    const listed = listDir({}); assert.strictEqual(listed.truncated, true); assert.ok(listed.items.length <= 1000);
  } finally { config.workspaceRoot = old; fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('resource and schema budget regressions passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
