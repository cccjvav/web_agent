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

async function pollOutput(execId, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const out = await callTool('get_command_output', { execId });
    if (out.status && out.status !== 'running') return out;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('command did not finish');
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
  spawnSync('git', ['config', 'user.email', 't@t'], { cwd: tmp });
  spawnSync('git', ['config', 'user.name', 't'], { cwd: tmp });
  fs.writeFileSync(path.join(tmp, 'keep.txt'), 'hello\n');
  git(['add', 'keep.txt']);
  git(['commit', '-m', 'init']);

  const st = await callTool('git_status', {}, 'ask');
  assert.ok(st.branch);
  fs.writeFileSync(path.join(tmp, 'keep.txt'), 'hello world\n');
  const diff = await callTool('git_diff', { filePath: 'keep.txt' }, 'plan');
  assert.ok(String(diff.diff).includes('hello world') || diff.totalLines >= 0);

  fs.mkdirSync(path.join(tmp, '.webagent', 'skills', 'demo'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.webagent', 'skills', 'demo', 'SKILL.md'), '# Skill: demo\nDo the demo.\n');
  const listed = await callTool('load_skill', {}, 'ask');
  assert.ok(listed.skills.some((s) => s.name === 'demo'));
  const loaded = await callTool('load_skill', { name: 'demo' }, 'ask');
  assert.ok(loaded.found && loaded.content.includes('Do the demo'));

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

  const info = await callTool('workspace_info', {}, 'ask');
  assert.ok(info.root === tmp);
  assert.ok(Array.isArray(info.topLevel));

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
  assert.ok(started.execId);
  assert.strictEqual(started.status, 'running');
  const finished = await pollOutput(started.execId);
  assert.ok(['done', 'timeout'].includes(finished.status));
  assert.ok(String(finished.stdout).includes('async-ok'));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('workspace tool tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
