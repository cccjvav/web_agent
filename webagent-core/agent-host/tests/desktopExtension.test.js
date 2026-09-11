'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { sameWorkspace, normalizePath } = require('../../extension/workspaceMatch');
const {
  readManifest,
  installTo,
  pruneOld,
  defaultExtensionDirs,
  SRC
} = require('../../scripts/install-desktop-extension');

assert.strictEqual(normalizePath('D:\\code\\my-app\\'), 'd:/code/my-app');
assert.ok(sameWorkspace('D:\\code\\My-App', 'd:/code/my-app'));
assert.ok(!sameWorkspace('D:\\code\\my-app', 'D:\\code\\other'));
assert.ok(!sameWorkspace('', 'D:\\code\\my-app'));
assert.ok(!sameWorkspace('D:\\code\\my-app', ''));

const prevExt = process.env.WEBAGENT_VSCODE_EXTENSIONS;
process.env.WEBAGENT_VSCODE_EXTENSIONS = path.join(os.tmpdir(), 'webagent-vscode-ext-env');
try {
  const dirs = defaultExtensionDirs();
  assert.strictEqual(dirs.length, 1);
  assert.strictEqual(path.resolve(dirs[0]), path.resolve(process.env.WEBAGENT_VSCODE_EXTENSIONS));
} finally {
  if (prevExt === undefined) delete process.env.WEBAGENT_VSCODE_EXTENSIONS;
  else process.env.WEBAGENT_VSCODE_EXTENSIONS = prevExt;
}

const man = readManifest();
assert.strictEqual(man.publisher, 'webagent');
assert.strictEqual(man.name, 'webagent-core');
assert.ok(man.version);
assert.strictEqual(man.folderName, `webagent.webagent-core-${man.version}`);
assert.ok(fs.existsSync(path.join(SRC, 'extension.js')));
assert.ok(fs.existsSync(path.join(SRC, 'workspaceMatch.js')));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-ext-'));
try {
  const stale = path.join(tmp, 'webagent.webagent-core-0.0.1');
  fs.mkdirSync(stale, { recursive: true });
  fs.writeFileSync(path.join(stale, 'old.txt'), 'x');
  const installed = installTo(tmp);
  assert.ok(fs.existsSync(path.join(installed.dest, 'package.json')));
  assert.ok(fs.existsSync(path.join(installed.dest, 'extension.js')));
  assert.ok(fs.existsSync(path.join(installed.dest, 'workspaceMatch.js')));
  assert.ok(fs.existsSync(path.join(installed.dest, 'modeFromChatRequest.js')));
  assert.ok(fs.existsSync(path.join(installed.dest, 'ptyHost.js')));
  assert.ok(fs.existsSync(path.join(installed.dest, 'ptyPolicy.js')));
  assert.ok(fs.existsSync(path.join(installed.dest, 'resources', 'icon.svg')));
  assert.ok(!fs.existsSync(path.join(installed.dest, 'README.md')), 'README 不进安装副本');
  assert.ok(!fs.existsSync(stale), '旧版本目录应被摘掉');
  const pkg = JSON.parse(fs.readFileSync(path.join(installed.dest, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.publisher, 'webagent');
  pruneOld(tmp, installed.folderName);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const repoRoot = path.resolve(__dirname, '../../..');
const cmd = fs.readFileSync(path.join(repoRoot, 'install-vscode-extension.cmd'), 'utf8');
assert.ok(/installer\\launch\.js" extension/.test(cmd));
assert.ok(fs.readFileSync(path.join(repoRoot, 'installer/launch.js'), 'utf8').includes("extension: 'webagent-core/scripts/install-desktop-extension.js'"));
assert.ok(/chcp 65001/.test(cmd));
assert.ok(!/code-server/i.test(cmd), '桌面插件安装不得拉起 code-server');

const extJs = fs.readFileSync(path.join(SRC, 'extension.js'), 'utf8');
assert.ok(/workspaceMatch/.test(extJs), '插件应核对 VS Code 文件夹与 agent-host 工作区');
assert.ok(/run-webagent\.cmd/.test(extJs), '连不上 48271 时应提示 run-webagent.cmd');

console.log('desktopExtension tests passed');
