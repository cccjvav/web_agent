'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');
const { recall, remember } = require('../src/models/memory');
const previous = config.workspaceRoot, root = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-recall-'));
config.workspaceRoot = root;
try {
  assert.strictEqual(recall().count, 0);
  assert.ok(!fs.existsSync(path.join(root, '.webagent')), 'Reading does not create memory');
  for (const text of ['x'.repeat(16385), '中'.repeat(5462), 'bad\0note', {}]) assert.throws(() => remember({text}), error => error.code === 'E_BAD_ARGS');
  assert.ok(!fs.existsSync(path.join(root,'.webagent')), 'invalid note creates no directory');
  const budgetDay = '2026-09-12';
  remember({day:budgetDay,text:'one\r\ntwo\rthree'});
  const budgetFile = path.join(root,'.webagent/memory',budgetDay+'.md');
  assert.ok(fs.readFileSync(budgetFile,'utf8').includes('one two three'));
  fs.writeFileSync(budgetFile,'x'.repeat(256*1024-100));
  remember({day:budgetDay,text:'fits'});
  const nearLimit = fs.readFileSync(budgetFile);
  assert.throws(() => remember({day:budgetDay,text:'x'.repeat(16384)}), /256 KiB/);
  assert.ok(fs.readFileSync(budgetFile).equals(nearLimit), 'full day is preserved, never rotated or truncated');
  fs.unlinkSync(budgetFile);
  if (process.platform !== 'win32') {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(),'memory-link-'));
    try {
      const target = path.join(outside,'MUST-NOT-CREATE.md');
      fs.symlinkSync(target,budgetFile);
      assert.throws(() => remember({day:budgetDay,text:'must not escape'}), /regular file/);
      assert.ok(!fs.existsSync(target), 'dangling link cannot create an external target');
      assert.ok(fs.lstatSync(budgetFile).isSymbolicLink(), 'rejected link is preserved');
    } finally { fs.unlinkSync(budgetFile); fs.rmSync(outside,{recursive:true,force:true}); }
  }

  remember({ day: '2026-09-15', text: 'ordinary note' });
  remember({ day: '2026-09-15', text: '中文验收 Windows 操作步骤' });
  remember({ day: '2026-09-14', text: 'Windows only' });
  remember({ day: '2026-09-13', text: 'ＣＯＮＤＡ 环境' });
  const ranked = recall({ query: '中文验收 WINDOWS' });
  assert.strictEqual(ranked.count, 2);
  assert.ok(ranked.text.indexOf('中文验收') < ranked.text.indexOf('Windows only'));
  assert.ok(ranked.text.includes('2026-09-15.md:5'));
  assert.strictEqual(recall({ query: 'conda' }).count, 1);
  assert.strictEqual(recall({ query: 'no-such-term' }).count, 0);
  assert.ok(recall({ query: 'Windows', limit: 1 }).truncated);
  assert.strictEqual(recall({ day: '2026-09-14', query: 'Windows' }).count, 1);
  assert.throws(() => recall({ query: 'a'.repeat(201) }), /query/);
  assert.throws(() => recall({ query: {} }), /query/);
  assert.throws(() => recall({ query: Array.from({ length: 21 }, (_, i) => `k${i}`).join(' ') }), /20 distinct/);
  const dir = path.join(root, '.webagent/memory');
  fs.writeFileSync(path.join(dir, '2026-09-16.md'), '- '.repeat(140000));
  const oversized = recall({ query: 'Windows' });
  assert.ok(oversized.truncated && oversized.warnings.length);
  assert.ok(oversized.text.includes('Windows'));
  fs.writeFileSync(path.join(dir, '2026-09-17.md'), 'padding\n'.repeat(5000) + '- AFTER-LINE-BUDGET');
  const lineBudget = recall({ query: 'AFTER-LINE-BUDGET' });
  assert.strictEqual(lineBudget.count, 0); assert.ok(lineBudget.truncated);
  fs.writeFileSync(path.join(dir, '2026-09-17.md'), '- short\n'.repeat(6000));
  assert.ok(recall({ query: 'short', limit: 200 }).truncated);
  assert.ok(recall({ query: 'short', limit: 200 }).text.length <= 8000);
  fs.writeFileSync(path.join(dir, '2026-99-99.md'), '- invalid day');
  assert.ok(recall().truncated);
  for (const file of ['2026-09-16.md', '2026-09-17.md', '2026-99-99.md']) fs.unlinkSync(path.join(dir, file));
  for (let i = 1; i <= 31; i++) fs.writeFileSync(path.join(dir, `2026-07-${String(i).padStart(2, '0')}.md`), '- bounded corpus');
  const thirty = recall({ query: 'bounded' });
  assert.strictEqual(thirty.files.length, 30); assert.ok(thirty.truncated);
  for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file));
  for (let i = 1; i <= 9; i++) fs.writeFileSync(path.join(dir, `2026-10-0${i}.md`), '- aggregate budget\n' + 'x'.repeat(250 * 1024));
  const aggregate = recall({ query: 'aggregate' });
  assert.strictEqual(aggregate.files.length, 8); assert.ok(aggregate.truncated && aggregate.warnings.length);
  for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file));
  for (let i = 0; i < 600; i++) fs.writeFileSync(path.join(dir, `noise-${i}`), '');
  assert.ok(recall().truncated);
  console.log('memory recall: multilingual literal ranking, provenance, no writes, query/scan/file/line budgets passed');
} finally { config.workspaceRoot = previous; fs.rmSync(root, { recursive: true, force: true }); }
