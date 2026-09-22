'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-diff-budget-'));
process.env.WORKSPACE_ROOT = tmp;
const { createUnifiedDiff } = require('../src/utils/diff');
const { applyPatch, computeHash } = require('../src/tools/patchEngine');

async function run() {
  try {
    // Run the adversarial algorithm in a separately killable test process.
    const code = `const {createUnifiedDiff}=require(${JSON.stringify(require.resolve('../src/utils/diff'))});
      const before=Array.from({length:8000},(_,i)=>'old-'+i+'\\n').join('');
      const after=Array.from({length:8000},(_,i)=>'new-'+i+'\\n').join('');
      try {createUnifiedDiff('test.txt',before,after);process.exitCode=2;}
      catch(error) {if(error.code!=='E_DIFF_LIMIT') throw error;console.log('bounded');}`;
    const result = spawnSync(process.execPath, ['-e',code], {encoding:'utf8',timeout:3000});
    assert.ifError(result.error);
    assert.strictEqual(result.status,0,result.stderr);
    assert.ok(result.stdout.includes('bounded'));

    for (const [before, after, additions, deletions] of [['x\n','x\n\n',1,0], ['\n\n','',0,2], ['a','b',1,1], ['','',0,0], ['a\r\n','b\r\n',1,1]]) {
      const diff = createUnifiedDiff('正常.txt',before,after);
      assert.strictEqual(diff.additions,additions);
      assert.strictEqual(diff.deletions,deletions);
      assert.strictEqual(require('diff').applyPatch(before,diff.patch),after);
    }
    assert.throws(() => createUnifiedDiff('big','a'.repeat(1048577),'b'), error => error.code === 'E_DIFF_LIMIT');
    assert.throws(() => createUnifiedDiff('output','a'.repeat(150000),'b'.repeat(150000)), error => error.code === 'E_DIFF_LIMIT');

    // A preview rejection is a preflight failure, including the new-file branch.
    const big = 'x'.repeat(300000);
    for (const dryRun of [true,false]) {
      await assert.rejects(applyPatch({filePath:'new-folder/new.txt',patch:big,dryRun}), error => error.code === 'E_DIFF_LIMIT');
      assert.ok(!fs.existsSync(path.join(tmp,'new-folder')), 'over-budget creation must not even create its parent');
    }
    const original = 'original\n';
    fs.writeFileSync(path.join(tmp,'existing.txt'),original);
    await assert.rejects(applyPatch({filePath:'existing.txt',patch:big,expectedHash:computeHash(original)}), error => error.code === 'E_DIFF_LIMIT');
    assert.strictEqual(fs.readFileSync(path.join(tmp,'existing.txt'),'utf8'),original);
    const normal = await applyPatch({filePath:'small.txt',patch:'中文\n'});
    assert.strictEqual(normal.success,true);
    assert.strictEqual(normal.newHash,computeHash('中文\n'));
    console.log('diff budget and pre-write ordering regressions passed');
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
}
run().catch(error => { console.error(error); process.exitCode=1; });
