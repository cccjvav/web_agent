'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
const { collect, stage } = require('../../../installer/package');
const { prepareRuntime, resolveWorkspace, safeRelative, userHome } = require('../../../installer/launch');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-package-'));
try {
  const source = path.join(tmp, 'source');
  for (const rel of collect(root)) {
    const dest = path.join(source, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, rel), dest);
  }
  const forbidden = ['webagent-core/admin-host/data/admin-token.txt', 'webagent-core/agent-host/node_modules/private.json',
    'workspace/.webagent/config.json', 'webagent-repro/server.js', '.config/code-server/config.yaml', 'manager/privacy.md'];
  for (const rel of forbidden) {
    const dest = path.join(source, rel); fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, 'PRIVATE_FIXTURE_DO_NOT_PACKAGE');
  }
  const output = path.join(tmp, 'payload');
  const manifest = stage(source, output);
  assert.ok(manifest.files.length > 50);
  assert.ok(manifest.files.some(f => f.path === 'installer/launch.js'));
  assert.ok(manifest.files.some(f => f.path === 'computer-use/win/input.cs'));
  for (const f of manifest.files) assert.ok(!fs.readFileSync(path.join(output, f.path), 'utf8').includes('PRIVATE_FIXTURE_DO_NOT_PACKAGE'));
  assert.ok(!manifest.files.some(f => f.path.startsWith('webagent-repro/')));
  assert.throws(() => stage(source, tmp), /Invalid staging/);
  const home = path.join(tmp, 'user-data');
  const before = fs.readFileSync(path.join(output, 'installation.json'));
  const runtime = prepareRuntime(output, home);
  assert.ok(runtime.installed && runtime.root.startsWith(home + path.sep));
  assert.strictEqual(prepareRuntime(output, home).root, runtime.root);
  assert.deepStrictEqual(fs.readFileSync(path.join(output, 'installation.json')), before);
  fs.writeFileSync(path.join(runtime.root, 'user-marker'), 'preserved');
  prepareRuntime(output, home);
  assert.strictEqual(fs.readFileSync(path.join(runtime.root, 'user-marker'), 'utf8'), 'preserved');
  assert.strictEqual(prepareRuntime(source, home).installed, false);
  fs.appendFileSync(path.join(output, manifest.files[0].path), 'changed');
  assert.throws(() => prepareRuntime(output, path.join(tmp, 'other-user')), /verification failed/);
  assert.ok(!fs.readdirSync(path.join(tmp, 'other-user/releases')).some(n => n.startsWith('.prepare-')));
  assert.throws(() => safeRelative('../outside'), /Invalid package/);
  assert.throws(() => safeRelative('C:\\file'), /Invalid package/);
  const ws = path.join(tmp, 'work space'); fs.mkdirSync(ws);
  fs.writeFileSync(path.join(ws, 'file.txt'), 'x');
  assert.strictEqual(resolveWorkspace('work space/file.txt', tmp, ''), ws);
  assert.strictEqual(resolveWorkspace(path.parse(ws).root, tmp, ''), path.parse(ws).root);
  assert.throws(() => resolveWorkspace('missing', tmp, ws), /不存在/);
  assert.ok(!fs.existsSync(path.join(tmp, 'missing')));
  assert.strictEqual(resolveWorkspace('', tmp, path.join(tmp, 'default')), path.join(tmp, 'default'));
  assert.ok(userHome({ LOCALAPPDATA: tmp }).startsWith(tmp));
  const iss = fs.readFileSync(path.join(root, 'installer/webagent.iss'), 'utf8');
  assert.ok(/^#define AppVer /m.test(iss));
  assert.ok(iss.includes('function PrepareToInstall(var NeedsRestart: Boolean): String;'));
  assert.ok(!iss.includes('ShellExec('));
  assert.ok(iss.includes("CompareText(NormalizePathEntry(Entry), AppDir)"));
  assert.ok(!iss.includes("StringChangeEx(P, ';' + AppDir"));
  assert.ok(iss.includes('Source: "output\\payload\\*"'));
  assert.ok(!iss.includes('Source: "..\\*"'));
  console.log('installer packaging/runtime tests passed; Inno/CMD execution requires Windows');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
