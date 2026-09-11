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
const { runWithSignal } = require('../src/utils/requestScope');
(async () => {
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
    const controller = new AbortController();
    const pending = runWithSignal(controller.signal, () => grepSearch({ query: 'needle' }));
    controller.abort(); await assert.rejects(pending, /cancelled/);
    assert.ok((await grepSearch({ query: 'needle' })).totalMatches > 0);
    for (let i = 0; i < 1002; i++) fs.writeFileSync(path.join(tmp, 'f' + i), '');
    const listed = listDir({}); assert.strictEqual(listed.truncated, true); assert.ok(listed.items.length <= 1000);
  } finally { config.workspaceRoot = old; fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('resource and schema budget regressions passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
