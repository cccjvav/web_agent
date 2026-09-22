'use strict';
// Independent F62 regressions. All content, including secret markers, is synthetic.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-read-safety-'));
process.env.WORKSPACE_ROOT = root;
const { config } = require('../src/config');
const { readBoundedText } = require('../src/utils/boundedFile');
const { readFile, writeFile } = require('../src/tools/fileOps');
const { applyPatch, computeHash } = require('../src/tools/patchEngine');
const { gitDiff, gitStatus } = require('../src/tools/gitOps');

function git(args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
async function run() {
  const failures = [];
  async function check(name, fn) {
    try { await fn(); console.log('PASS', name); }
    catch (error) { failures.push(name); console.error('FAIL', name, error.message); }
  }
  try {
    await check('invalid UTF-8 is rejected, including truncated and overlong sequences', () => {
      for (const bytes of [[0x41,0xff,10], [0x41,0xfe,10], [0xc0,0xaf], [0xe2,0x82], [0xed,0xa0,0x80]]) {
        fs.writeFileSync(path.join(root, 'invalid.txt'), Buffer.from(bytes));
        assert.throws(() => readBoundedText(path.join(root, 'invalid.txt')), error => error.code === 'E_INVALID_TEXT');
        assert.deepStrictEqual([...fs.readFileSync(path.join(root, 'invalid.txt'))], bytes);
      }
    });
    await check('valid UTF-8, BOM, CRLF and literal replacement characters retain byte hashes', () => {
      for (const content of ['', '\ufeff中文\r\n😀\r\n', '\ufffd is a valid literal character\n', 'a'.repeat(65535) + '鹈鹕😀']) {
        const bytes = Buffer.from(content);
        fs.writeFileSync(path.join(root, 'valid.txt'), bytes);
        assert.strictEqual(readBoundedText(path.join(root, 'valid.txt')), content);
        assert.strictEqual(readFile({filePath:'valid.txt'}).hash, require('crypto').createHash('sha256').update(bytes).digest('hex'));
      }
    });
    await check('changed invalid bytes cannot be overwritten or patched with an earlier hash', async () => {
      // This hash was issued by the old lossy decoder for a different byte sequence.
      const hash = computeHash(Buffer.from([0x41,0xff,10]).toString('utf8'));
      const changed = Buffer.from([0x41,0xfe,10]);
      fs.writeFileSync(path.join(root, 'protected.txt'), changed);
      await assert.rejects(writeFile({filePath:'protected.txt',content:'wrong',expectedHash:hash,confirmOverwrite:true}), error => error.code === 'E_INVALID_TEXT');
      await assert.rejects(applyPatch({filePath:'protected.txt',patch:'wrong',expectedHash:hash}), error => error.code === 'E_INVALID_TEXT');
      assert.deepStrictEqual(fs.readFileSync(path.join(root, 'protected.txt')), changed);
    });
    await check('valid stale hashes still refuse writes and BOM files still support reviewed writes', async () => {
      fs.writeFileSync(path.join(root, 'bom.txt'), '\ufeff中文\r\n');
      const hash = readFile({filePath:'bom.txt'}).hash;
      await writeFile({filePath:'bom.txt',content:'\ufeff修改\r\n',expectedHash:hash});
      assert.strictEqual(fs.readFileSync(path.join(root, 'bom.txt'),'utf8'), '\ufeff修改\r\n');
      await assert.rejects(writeFile({filePath:'bom.txt',content:'stale',expectedHash:hash}), error => error.code === 'E_STALE_FILE');
      assert.strictEqual(computeHash('\ufeff修改\r\n'), readFile({filePath:'bom.txt'}).hash);
    });

    git(['init']); git(['config','user.name','Audit fixture']); git(['config','user.email','fixture@example.invalid']);
    for (const [name, content] of Object.entries({
      '.env':'ROOT_SECRET=old\n', 'scope/.env':'NESTED_SECRET=old\n', 'scope/plain.txt':'public-old\n',
      'custom.txt':'CUSTOM_SECRET=old\n', 'rename.key':'RENAMED_SECRET=old\n', 'outside.txt':'outside-old\n'
    })) { fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true}); fs.writeFileSync(path.join(root,name),content); }
    git(['add','.env','scope','custom.txt','rename.key','outside.txt']); git(['commit','-m','synthetic fixture']);
    fs.writeFileSync(path.join(root,'.webagentignore'),'custom.txt\n');
    for (const name of ['.env','scope/.env','scope/plain.txt','custom.txt','outside.txt']) {
      fs.appendFileSync(path.join(root,name), name.includes('plain') ? 'public-new\n' : 'PRIVATE_MARKER_' + name + '\n');
    }
    await check('aggregate and directory diffs omit protected contents, not all public changes', () => {
      for (const options of [{},{filePath:'.'},{filePath:'scope'},{stat:true}]) {
        const result = gitDiff(options);
        assert.ok(!/ROOT_SECRET|NESTED_SECRET|CUSTOM_SECRET|PRIVATE_MARKER_\.env/.test(result.diff), JSON.stringify(options));
        assert.ok(result.omittedFiles > 0 && result.truncated, 'filtered output must disclose incompleteness');
        if (!options.stat) assert.ok(result.diff.includes('public-new'));
      }
      assert.throws(() => gitDiff({filePath:'.env'}), /ACCESS_DENIED/);
      assert.strictEqual(gitDiff({filePath:'*.txt'}).diff, '', 'pathspec remains literal');
    });
    git(['add','.env','scope','custom.txt','outside.txt']); git(['mv','rename.key','renamed-public.txt']);
    await check('staged renames protect BOTH names, even when the new public name is requested', () => {
      for (const options of [{staged:true},{staged:true,filePath:'renamed-public.txt'},{staged:true,stat:true}]) {
        const result = gitDiff(options);
        assert.ok(!/ROOT_SECRET|NESTED_SECRET|CUSTOM_SECRET|RENAMED_SECRET/.test(result.diff));
        assert.ok(result.omittedFiles > 0);
      }
    });
    await check('nested workspaces do not expose parent diff, status paths or rename origins', () => {
      git(['config','diff.relative','true']); // A local preference must not change metadata coordinates.
      config.workspaceRoot = path.join(root,'scope');
      const result = gitDiff({staged:true});
      assert.ok(result.diff.includes('public-new'));
      assert.ok(!/outside|ROOT_SECRET|PRIVATE_MARKER|CUSTOM_SECRET|RENAMED_SECRET/.test(result.diff));
      const status = gitStatus();
      assert.ok(status.files.some(item => item.path === 'plain.txt'));
      assert.ok(status.files.every(item => !item.path.includes('scope/') && !item.path.includes('outside') && !item.path.startsWith('../')));
      config.workspaceRoot = root;
      // Preserve content so Git detects the cross-boundary rename (not a fresh add).
      fs.writeFileSync(path.join(root,'outside.txt'),'outside-old\n');
      git(['add','outside.txt']);
      git(['mv','outside.txt','scope/from-parent.txt']);
      config.workspaceRoot = path.join(root,'scope');
      const moved = gitStatus();
      assert.ok(moved.files.every(item => !item.originalPath || !item.originalPath.includes('outside')));
      assert.strictEqual(gitDiff({staged:true,filePath:'from-parent.txt'}).diff, '');
    });
    config.workspaceRoot = root;
    await check('NUL-delimited names, deleted paths, empty selections and diff helper protections remain usable', () => {
      const name = process.platform === 'win32' ? '中文 file.txt' : '中文\nfile.txt';
      fs.writeFileSync(path.join(root,name),'old\n'); git(['add',name]); git(['commit','-m','names']);
      fs.writeFileSync(path.join(root,name),'new-safe\n');
      assert.ok(gitDiff({filePath:name}).diff.includes('new-safe'));
      fs.unlinkSync(path.join(root,name));
      assert.ok(gitDiff({filePath:name}).diff.includes('-old'));
      assert.strictEqual(gitDiff({filePath:'not-here'}).diff,'');
    });
  } finally { config.workspaceRoot = root; fs.rmSync(root,{recursive:true,force:true}); }
  assert.deepStrictEqual(failures, [], 'independent file safety regressions');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
