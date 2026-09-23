'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
const { collect, stage } = require('../../../installer/package');
const { prepareRuntime, resolveWorkspace, safeRelative, userHome, appOrigin, ready } = require('../../../installer/launch');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-package-'));
(async () => {
try {
  const source = path.join(tmp, 'source');
  for (const rel of collect(root)) {
    const dest = path.join(source, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, rel), dest);
  }
  const forbidden = ['webagent-core/agent-host/tests/tunnelCleanupAclFixture.cs', 'webagent-core/agent-host/tests/tunnelCleanupAclFixture.ps1', 'webagent-core/agent-host/tests/tunnelCleanupAcl.test.js', 'webagent-core/admin-host/data/admin-token.txt', 'webagent-core/agent-host/node_modules/private.json',
    'arena-model-probe/recon/raw.json', 'arena-model-probe/src/main.js', 'arena-model-probe/arena_probe.py',
    'webagent-core/agent-host/src/.webagent/tunnel-processes-v1/receipt.json',
    'workspace/.webagent/config.json', 'webagent-repro/server.js', '.config/code-server/config.yaml', 'manager/privacy.md'];
  for (const rel of forbidden) {
    const dest = path.join(source, rel); fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, 'PRIVATE_FIXTURE_DO_NOT_PACKAGE');
  }
  const output = path.join(tmp, 'payload');
  const manifest = stage(source, output);
  assert.ok(manifest.files.length > 50);
  for (const guide of ['docs/README.md', 'docs/guides/README.md', 'docs/development/README.md', 'docs/development/架构导读.md', 'docs/guides/Bridge权限与工作模式.md', '探针入口与实际可用范围.md', '使用指南.md']) assert.ok(manifest.files.some(f => f.path === guide));
  assert.ok(!manifest.files.some(f => f.path === '双向连接核对使用指南.md' || f.path.startsWith('review/archive/')));
  assert.deepStrictEqual(manifest.files.filter(f => f.path.startsWith('arena-model-probe/')).map(f => f.path), ['arena-model-probe/webagent-connection.user.js']);
  assert.ok(manifest.files.some(f => f.path === 'installer/launch.js'));
  assert.ok(manifest.files.some(f => f.path === 'installer/appWindow.js', 'installer/preparation.js')), 'app bootstrap helper ships with the launcher';
  assert.ok(manifest.files.some(f => f.path === 'installer/tunnel-recovery.ps1'));
  assert.ok(manifest.files.some(f => f.path === 'webagent-core/agent-host/src/utils/fileCheckpoints.js'));
  for (const file of ['stdioBridge.cs', 'stdioBridge.ps1', 'stdioSupervisor.js', 'stdioTransport.js', 'stdioLaunch.js', 'publicHttps.js']) assert.ok(manifest.files.some(f => f.path === 'webagent-core/agent-host/src/mcp/' + file));
  for (const file of ['src/tunnel/helperDiagnostics.js', 'scripts/tunnel-cleanup.js', 'src/tunnel/tunnelCleanup.js', 'src/tunnel/tunnelCleanup.ps1', 'src/tunnel/tunnelCleanup.cs', 'scripts/tunnel-residue.js', 'src/tunnel/tunnelRegistry.js', 'src/tunnel/processIdentity.js', 'src/tunnel/receiptProtection.js', 'src/tunnel/receiptProtection.ps1']) assert.ok(manifest.files.some(f => f.path === 'webagent-core/agent-host/' + file));
  assert.ok(manifest.files.some(f => f.path === 'computer-use/win/input.cs'));
  for (const f of manifest.files) assert.ok(!fs.readFileSync(path.join(output, f.path), 'utf8').includes('PRIVATE_FIXTURE_DO_NOT_PACKAGE'));
  assert.ok(!manifest.files.some(f => f.path.startsWith('webagent-repro/')));
  assert.throws(() => stage(source, tmp), /Invalid staging/);
  const sourceDocs = path.join(source, 'docs-site/content.js');
  const savedDocs = fs.readFileSync(sourceDocs);
  try {
    fs.writeFileSync(sourceDocs, 'invalid prebuilt data');
    assert.throws(() => stage(source, output), /Invalid prebuilt documentation/);
    assert.ok(fs.existsSync(path.join(output, 'installation.json')), 'invalid prebuilt docs must not remove previous staging');
  } finally { fs.writeFileSync(sourceDocs, savedDocs); }
  assert.ok(fs.existsSync(path.join(output, 'docs-site/bundled.json')));
  assert.ok(!fs.existsSync(path.join(output, 'docs-site/build.js')), 'installed docs are prebuilt, not a partial build toolchain');
  for (const entry of manifest.files.filter(f => f.path.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(output, entry.path), 'utf8');
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = match[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) continue;
      const dest = path.resolve(path.dirname(path.join(output, entry.path)), decodeURIComponent(href.split('#')[0]));
      assert.ok(fs.existsSync(dest), `broken packaged link: ${entry.path} -> ${href}`);
    }
  }
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
  assert.strictEqual((iss.match(/^#define AppVer "([^"]+)"/m) || [])[1], require('../../extension/package.json').version, 'installer and extension release versions must agree');
  // F70 (review P3-3): the host package said 1.0.0 with a nonexistent main while everything else
  // shipped as 0.7.2. All release manifests must name the same version, and main must exist.
  const release = require('../../extension/package.json').version;
  const hostPackage = require('../package.json');
  assert.strictEqual(hostPackage.version, release, 'agent-host package.json must carry the release version');
  assert.strictEqual(require('../package-lock.json').version, release, 'agent-host lockfile must carry the release version');
  assert.strictEqual(require('../../../package.json').version, release, 'root package.json must carry the release version');
  assert.ok(fs.existsSync(path.resolve(__dirname, '..', hostPackage.main)), 'agent-host package.json main must point at a real file');
  assert.ok(iss.includes('function PrepareToInstall(var NeedsRestart: Boolean): String;'));
  assert.ok(!iss.includes('ShellExec('));
  assert.ok(iss.includes("CompareText(NormalizePathEntry(Entry), AppDir)"));
  assert.ok(!iss.includes("StringChangeEx(P, ';' + AppDir"));
  assert.ok(iss.includes('Source: "output\\payload\\*"'));
  assert.ok(!iss.includes('Source: "..\\*"'));
  assert.strictEqual(appOrigin({}), 'http://127.0.0.1:3000');
  assert.strictEqual(appOrigin({ CODE_SERVER_PORT: '4321' }), 'http://127.0.0.1:4321');
  for (const port of ['0', '65536', '-1', '3000/path', 'abc']) assert.throws(() => appOrigin({ CODE_SERVER_PORT: port }), /CODE_SERVER_PORT/);
  let status = 200;
  const server = require('http').createServer((req, res) => {
    assert.strictEqual(req.url, '/healthz'); res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({status:'expired',lastHeartbeat:0}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = appOrigin({ CODE_SERVER_PORT: String(server.address().port) });
    assert.strictEqual(await ready(origin), true, 'probe must use configured nondefault port');
    status = 503;
    assert.strictEqual(await ready(origin), false);
  } finally { await new Promise(resolve => server.close(resolve)); }
  const cmd = fs.readFileSync(path.join(root, 'run-tests.cmd'), 'utf8');
  assert.ok(cmd.includes('node_modules\\acorn\\package.json'));
  assert.ok(cmd.includes('npm ci --include=dev --no-audit --no-fund'));
  console.log('installer packaging/runtime tests passed; Inno/CMD execution requires Windows');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

})().catch(err => { console.error(err); process.exitCode = 1; });
