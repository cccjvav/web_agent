const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { config } = require('../src/config');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-tools-'));
config.workspaceRoot = tmp;

const { callTool, getToolList } = require('../src/tools');
const { ProtocolError } = require('../src/mcp/errors');

function git(args) {
  const r = spawnSync('git', args, { cwd: tmp, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'git failed');
}

async function pollOutput(execId, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let out;
  while (Date.now() < deadline) {
    out = await callTool('get_command_output', { execId });
    if (out.status && out.status !== 'running') return out;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('command did not finish within ' + timeoutMs + 'ms: ' + JSON.stringify(out));
}

async function main() {
  const names = getToolList().map((t) => t.name);
  assert.ok(names.includes('git_status'));
  assert.ok(names.includes('start_command'));
  assert.ok(names.includes('delete_file'));
  assert.ok(names.includes('rename_file'));
  assert.ok(names.includes('load_skill'));
  assert.ok(!names.includes('lsp'));
  assert.ok(!names.includes('get_diagnostics'));
  assert.ok(!names.includes('send_command_input'));

  const noGit = await callTool('git_status', {}, 'ask');
  assert.strictEqual(noGit.ok, true);
  assert.strictEqual(noGit.available, false);
  assert.strictEqual(noGit.git, false);
  const noDiff = await callTool('git_diff', { filePath: 'keep.txt' }, 'plan');
  assert.strictEqual(noDiff.available, false);
  assert.strictEqual(noDiff.git, false);

  spawnSync('git', ['init'], { cwd: tmp, encoding: 'utf8' });
  const unbornBranch = spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], {cwd:tmp,encoding:'utf8'}).stdout.trim();
  assert.strictEqual((await callTool('git_status', {}, 'ask')).branch, unbornBranch);
  spawnSync('git', ['config', 'user.email', 't@t'], { cwd: tmp });
  spawnSync('git', ['config', 'user.name', 't'], { cwd: tmp });
  fs.writeFileSync(path.join(tmp, 'keep.txt'), 'hello\n');
  git(['add', 'keep.txt']);
  git(['commit', '-m', 'init']);

  git(['branch', 'release/1.2.3']);
  git(['symbolic-ref', 'HEAD', 'refs/heads/release/1.2.3']);
  const st = await callTool('git_status', {}, 'ask');
  assert.strictEqual(st.branch, 'release/1.2.3');
  assert.ok(st.branch);
  fs.writeFileSync(path.join(tmp, 'keep.txt'), 'hello world\n');
  const diff = await callTool('git_diff', { filePath: 'keep.txt' }, 'plan');
  assert.ok(String(diff.diff).includes('hello world'));
  const globDiff = await callTool('git_diff', {filePath:'*.txt'}, 'ask');
  assert.strictEqual(globDiff.diff, '', 'path is literal, not a Git wildcard');

  // The fixture helper really runs with ordinary Git, but never via our read-only tools.
  const helper = path.join(tmp, 'diff-helper.js');
  const marker = path.join(tmp, 'helper-ran');
  fs.writeFileSync(helper, 'require("fs").appendFileSync(' + JSON.stringify(marker) + ', "ran"); console.log("converted");');
  const helperCommand = '"' + process.execPath.replace(/\\/g, '/') + '" "' + helper.replace(/\\/g, '/') + '"';
  const oldExternalDiff = process.env.GIT_EXTERNAL_DIFF;
  try {
    process.env.GIT_EXTERNAL_DIFF = helperCommand;
    await callTool('git_diff', {filePath:'keep.txt'}, 'ask');
    assert.ok(!fs.existsSync(marker), 'GIT_EXTERNAL_DIFF must not run in Ask');
    git(['diff', '--', 'keep.txt']);
    assert.ok(fs.existsSync(marker), 'positive control: external diff fixture is executable');
    fs.unlinkSync(marker);
    delete process.env.GIT_EXTERNAL_DIFF;
    git(['config', 'core.fsmonitor', helperCommand]);
    await callTool('git_status', {}, 'ask');
    assert.ok(!fs.existsSync(marker), 'configured fsmonitor hook must not run');
    git(['config', '--unset', 'core.fsmonitor']);
    fs.writeFileSync(path.join(tmp, '.gitattributes'), 'keep.txt diff=fixture\n');
    git(['config', 'diff.fixture.textconv', helperCommand]);
    await callTool('git_diff', {filePath:'keep.txt'}, 'plan');
    assert.ok(!fs.existsSync(marker), 'textconv must not run in Plan');
    git(['diff', '--textconv', '--', 'keep.txt']);
    assert.ok(fs.existsSync(marker), 'positive control: textconv fixture really executes');
    fs.unlinkSync(marker);
    fs.writeFileSync(path.join(tmp, '.gitattributes'), 'keep.txt filter=fixture\n');
    git(['config', 'filter.fixture.clean', helperCommand]);
    git(['config', 'filter.fixture.required', 'true']);
    try {
      const rawDiff = await callTool('git_diff', {filePath:'keep.txt'}, 'ask');
      assert.ok(rawDiff.diff.includes('hello world'));
      assert.ok(!fs.existsSync(marker), 'clean filter is disabled, not merely external diff/textconv');
      git(['diff', '--no-ext-diff', '--no-textconv', '--', 'keep.txt']);
      assert.ok(fs.existsSync(marker), 'positive control: clean filter still executes with only diff helper flags');
      fs.unlinkSync(marker);
      git(['config', 'filter.fixture.process', helperCommand]);
      await callTool('git_diff', {filePath:'keep.txt'}, 'plan');
      assert.ok(!fs.existsSync(marker), 'persistent process filter must also be disabled');
    } finally {
      git(['config', '--unset', 'filter.fixture.clean']);
      git(['config', '--unset', 'filter.fixture.required']);
      git(['config', '--unset', 'filter.fixture.process']);
    }

  } finally {
    if (oldExternalDiff === undefined) delete process.env.GIT_EXTERNAL_DIFF;
    else process.env.GIT_EXTERNAL_DIFF = oldExternalDiff;
    git(['config', '--unset', 'diff.fixture.textconv']);
    fs.rmSync(path.join(tmp, '.gitattributes'), {force:true});
    fs.rmSync(helper, {force:true}); fs.rmSync(marker, {force:true});
  }

  const unicodeName = '中文 file.txt';
  fs.writeFileSync(path.join(tmp, unicodeName), 'unicode');
  git(['add', unicodeName]);
  git(['mv', 'keep.txt', 'renamed file.txt']);
  const renamed = await callTool('git_status', {}, 'ask');
  assert.ok(renamed.files.some(entry => entry.path === unicodeName));
  assert.ok(renamed.files.some(entry => entry.path === 'renamed file.txt' && entry.originalPath === 'keep.txt'));
  git(['mv', 'renamed file.txt', 'keep.txt']);
  if (process.platform !== 'win32') {
    const newlineName = 'line\n##not-a-branch.txt';
    fs.writeFileSync(path.join(tmp, newlineName), 'newline');
    const status = await callTool('git_status', {}, 'ask');
    assert.ok(status.files.some(entry => entry.path === newlineName));
    assert.strictEqual(status.branch, 'release/1.2.3');
    fs.unlinkSync(path.join(tmp, newlineName));
  }


  const baseEntries = (await callTool('git_status', {}, 'ask')).files.length;
  const limitFiles = Array.from({length:80-baseEntries}, (_, i) => 'limit-fixture-' + i + '.txt');
  for (const name of limitFiles) fs.writeFileSync(path.join(tmp, name), 'limit');
  const exactLimit = await callTool('git_status', {}, 'ask');
  assert.strictEqual(exactLimit.files.length, 80);
  assert.strictEqual(exactLimit.truncated, false);
  fs.writeFileSync(path.join(tmp, 'limit-extra.txt'), 'extra');
  assert.strictEqual((await callTool('git_status', {}, 'ask')).truncated, true);
  for (const name of [...limitFiles, 'limit-extra.txt']) fs.unlinkSync(path.join(tmp, name));

  fs.mkdirSync(path.join(tmp, '.webagent', 'skills', 'demo'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.webagent', 'skills', 'demo', 'SKILL.md'), '# Skill: demo\nDo the demo.\n');
  const listed = await callTool('load_skill', {}, 'ask');
  const demoListed = listed.skills.find((s) => s.name === 'demo');
  assert.ok(demoListed);
  assert.ok(demoListed.skillFile && /SKILL\.md$/.test(String(demoListed.skillFile).replace(/\\/g, '/')));
  assert.ok(demoListed.skillFileAbs && path.isAbsolute(demoListed.skillFileAbs));
  const loaded = await callTool('load_skill', { name: 'demo' }, 'ask');
  assert.ok(loaded.found && loaded.content.includes('Do the demo'));
  assert.ok(loaded.skillFile && /SKILL\.md$/.test(String(loaded.skillFile).replace(/\\/g, '/')));
  assert.ok(loaded.skillFileAbs && path.isAbsolute(loaded.skillFileAbs));
  const bundledMd = path.resolve(__dirname, '../../../computer-use/SKILL.md');
  if (fs.existsSync(bundledMd)) {
    assert.ok(listed.skills.some((s) => s.name === 'computer-use'));
    const cu = await callTool('load_skill', { name: 'computer-use' }, 'ask');
    assert.ok(cu.found && String(cu.content).includes('Computer Use'));
  }
  const pmMd = path.resolve(__dirname, '../../../project-manager/SKILL.md');
  if (fs.existsSync(pmMd)) {
    assert.ok(listed.skills.some((s) => s.name === 'project-manager'));
    const pm = await callTool('load_skill', { name: 'project-manager' }, 'ask');
    assert.ok(pm.found && String(pm.content).includes('CONTEXT.md'));
    assert.ok(String(pm.content).includes('核心理念') || String(pm.content).length > 8000);
  }

  fs.writeFileSync(path.join(tmp, 'gone.txt'), 'x');
  let deleteBlocked = false;
  try {
    await callTool('delete_file', { filePath: 'gone.txt' }, 'code');
  } catch (err) {
    deleteBlocked = err instanceof ProtocolError && /confirm=true/.test(err.message);
  }
  assert.ok(deleteBlocked, 'delete_file must require confirm=true');
  const del = await callTool('delete_file', { filePath: 'gone.txt', confirm: true }, 'code');
  assert.ok(del.success);
  assert.ok(!fs.existsSync(path.join(tmp, 'gone.txt')));

  let overwriteBlocked = false;
  try {
    await callTool('write_file', { filePath: 'keep.txt', content: 'nope' }, 'code');
  } catch (err) {
    overwriteBlocked = err instanceof ProtocolError && /confirm_overwrite/.test(err.message);
  }
  assert.ok(overwriteBlocked, 'write_file must require confirm_overwrite on existing files');
  const created = await callTool('write_file', { filePath: 'fresh.txt', content: 'z' }, 'code');
  assert.ok(created.success);
  const overwritten = await callTool(
    'write_file',
    { filePath: 'fresh.txt', content: 'zz', confirm_overwrite: true },
    'code'
  );
  assert.ok(overwritten.success);

  fs.writeFileSync(path.join(tmp, 'old.txt'), 'y');
  const moved = await callTool('rename_file', { from: 'old.txt', to: 'new.txt' }, 'code');
  assert.ok(moved.success);
  assert.ok(fs.existsSync(path.join(tmp, 'new.txt')));

  let blocked = false;
  try {
    await callTool('delete_file', { filePath: 'new.txt' }, 'ask');
  } catch (err) {
    blocked = err instanceof ProtocolError && err.code === 'E_BAD_ARGS';
  }
  assert.ok(blocked, 'delete_file must be locked in Ask');

  let escaped = false;
  try {
    await callTool('delete_file', { filePath: '../outside.txt', confirm: true }, 'code');
  } catch (err) {
    escaped = /outside workspace/i.test(err.message);
  }
  assert.ok(escaped);

  fs.writeFileSync(path.join(tmp, '.env'), 'SECRET=1\n');
  fs.writeFileSync(path.join(tmp, '.env.example'), 'SECRET=\n');
  fs.mkdirSync(path.join(tmp, '.webagent'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.webagent', 'config.json'), '{"secretKey":"nope"}\n');
  let forbidden = false;
  try {
    await callTool('read_files', { filePath: '.env' }, 'ask');
  } catch (err) {
    forbidden = /SENSITIVE|FORBIDDEN/i.test(err.message);
  }
  assert.ok(forbidden, '.env must be blocked');
  let cfgDenied = false;
  try {
    await callTool('read_files', { filePath: '.webagent/config.json' }, 'ask');
  } catch (err) {
    cfgDenied = /SENSITIVE|FORBIDDEN/i.test(err.message);
  }
  assert.ok(cfgDenied, 'MCP secret file must be blocked');
  const example = await callTool('read_files', { filePath: '.env.example' }, 'ask');
  assert.ok(String(example.content).includes('SECRET='));
  const dirList = await callTool('list_directory', { dirPath: '.' }, 'ask');
  const dirNames = (dirList.items || []).map((i) => i.name);
  assert.ok(!dirNames.includes('.env'));
  assert.ok(dirNames.includes('.env.example'));
  // F70 (review P3-18): readdir order is filesystem-dependent. Listings are directories first,
  // then files, case-insensitive with numeric awareness, recursively.
  const orderRoot = path.join(tmp, 'order-fixture');
  fs.mkdirSync(path.join(orderRoot, 'Zeta'), { recursive: true });
  fs.mkdirSync(path.join(orderRoot, 'alpha'));
  for (const name of ['file10.txt', 'File2.txt', 'b.txt', 'A.txt']) fs.writeFileSync(path.join(orderRoot, name), 'x');
  for (const name of ['z.js', 'a.js']) fs.writeFileSync(path.join(orderRoot, 'alpha', name), 'x');
  const ordered = await callTool('list_directory', { dirPath: 'order-fixture', recursive: true }, 'ask');
  assert.deepStrictEqual(ordered.items.map(i => i.name), ['alpha', 'Zeta', 'A.txt', 'b.txt', 'File2.txt', 'file10.txt']);
  assert.deepStrictEqual(ordered.items[0].children.map(i => i.name), ['a.js', 'z.js']);

  const info = await callTool('workspace_info', {}, 'ask');
  assert.ok(info.root === tmp);
  assert.ok(Array.isArray(info.topLevel));
  assert.ok(info.rules && String(info.rules).includes('Web Agent Bridge MCP'));
  assert.ok(/initialize\.instructions/.test(String(info.hint)));

  const viaPath = await callTool('read_files', { path: 'keep.txt' }, 'ask');
  assert.ok(viaPath.hash);
  const viaAliasWrite = await callTool('write_file', { path: 'keep.txt', content: 'from-read-cache\n' }, 'code');
  assert.ok(viaAliasWrite.success);
  assert.ok(fs.readFileSync(path.join(tmp, 'keep.txt'), 'utf8').includes('from-read-cache'));

  fs.writeFileSync(path.join(tmp, 'gone2.txt'), 'x');
  const delStr = await callTool('delete_file', { path: 'gone2.txt', confirm: 'true' }, 'code');
  assert.ok(delStr.success);

  const echoed = await callTool('bash', { cmd: 'echo alias-ok' }, 'code');
  assert.ok(String(echoed.stdout).includes('alias-ok'));

  const listedPath = await callTool('ls', { path: '.' }, 'ask');
  assert.ok(Array.isArray(listedPath.items));

  const started = await callTool('start_command', { command: 'echo async-ok' }, 'code');
  assert.ok(/^[0-9a-f]{16}$/.test(String(started.execId)), 'execId must be a random hex id');
  assert.strictEqual(started.status, 'running');
  const finished = await pollOutput(started.execId);
  assert.strictEqual(finished.status, 'done');
  assert.strictEqual(finished.exitCode, 0);
  assert.ok(String(finished.stdout).includes('async-ok'));

  const sleepy = await callTool(
    'start_command',
    { command: 'node -e "setTimeout(()=>{}, 20000)"', timeoutSec: 25 },
    'code'
  );
  const cancelled = await callTool('cancel_command', { execId: sleepy.execId }, 'code');
  assert.strictEqual(cancelled.cancelled, true);
  assert.strictEqual(cancelled.status, 'cancelled');
  assert.strictEqual(
    (await callTool('get_command_output', { execId: sleepy.execId })).status,
    'cancelled'
  );
  await new Promise((r) => setTimeout(r, 250));
  assert.strictEqual(
    (await callTool('get_command_output', { execId: sleepy.execId })).status,
    'cancelled',
    'close must not overwrite cancelled with done'
  );

  const { rememberHash, clearSession, sessionHash } = require('../src/tools/readCache');
  const { computeHash } = require('../src/tools/patchEngine');
  fs.writeFileSync(path.join(tmp, 'persist-only.txt'), 'old-body\n');
  rememberHash('persist-only.txt', computeHash('old-body\n'));
  clearSession();
  assert.strictEqual(sessionHash('persist-only.txt'), null);
  let persistBlocked = false;
  try {
    await callTool('write_file', { filePath: 'persist-only.txt', content: 'hijack\n' }, 'code');
  } catch (err) {
    persistBlocked = err instanceof ProtocolError && /confirm_overwrite/.test(err.message);
  }
  assert.ok(persistBlocked, 'disk hash from a previous run must not unlock write_file');
  assert.strictEqual(fs.readFileSync(path.join(tmp, 'persist-only.txt'), 'utf8'), 'old-body\n');

  process.env.OPENAI_API_KEY = 'sk-test-should-not-leak';
  const probe = process.platform === 'win32'
    ? 'echo $env:OPENAI_API_KEY'
    : 'printenv OPENAI_API_KEY || true';
  const envOut = await callTool('run_command', { command: probe }, 'code');
  const envBlob = `${envOut.stdout || ''}${envOut.stderr || ''}`;
  assert.ok(!envBlob.includes('sk-test-should-not-leak'), 'child env must not inherit API keys');
  delete process.env.OPENAI_API_KEY;

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('workspace tool tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
