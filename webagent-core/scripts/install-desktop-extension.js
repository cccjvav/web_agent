'use strict';

// 把 webagent-core/extension 拷进本机桌面 VS Code 的 extensions 目录。
// code-server 仍走 ensure-code-server.syncExtension（extensions-installed/）。
// 覆盖：WEBAGENT_VSCODE_EXTENSIONS 指向自定义 extensions 根（测试用）。
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../..');
const SRC = path.join(repoRoot, 'webagent-core/extension');

function readManifest() {
  const pkg = JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8'));
  const publisher = String(pkg.publisher || 'webagent');
  const name = String(pkg.name || 'webagent-core');
  const version = String(pkg.version || '0.0.0');
  return {
    publisher,
    name,
    version,
    folderName: `${publisher}.${name}-${version}`,
    id: `${publisher}.${name}`
  };
}

function copyTree(from, to, isRoot = true) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (isRoot && name === 'README.md') continue;
    const src = path.join(from, name);
    const dest = path.join(to, name);
    const st = fs.lstatSync(src);
    if (st.isSymbolicLink()) throw new Error('Extension inputs must not be symbolic links: ' + src);
    if (st.isDirectory()) copyTree(src, dest, false);
    else fs.copyFileSync(src, dest);
  }
}

function pruneOld(extensionsDir, keepName) {
  if (!fs.existsSync(extensionsDir)) return [];
  const removed = [];
  for (const name of fs.readdirSync(extensionsDir)) {
    if (/^webagent\.webagent-core-/.test(name) && name !== keepName) {
      fs.rmSync(path.join(extensionsDir, name), { recursive: true, force: true });
      removed.push(name);
    }
  }
  return removed;
}

function defaultExtensionDirs() {
  if (process.env.WEBAGENT_VSCODE_EXTENSIONS) {
    return [path.resolve(process.env.WEBAGENT_VSCODE_EXTENSIONS)];
  }
  const home = os.homedir();
  const dirs = [path.join(home, '.vscode', 'extensions')];
  if (fs.existsSync(path.join(home, '.vscode-insiders'))) {
    dirs.push(path.join(home, '.vscode-insiders', 'extensions'));
  }
  return dirs;
}

// Same selection as copyTree: every file except the root README.md, in sorted order.
function contentHash(dir = SRC) {
  const hash = crypto.createHash('sha256');
  (function walk(rel) {
    for (const name of fs.readdirSync(rel ? path.join(dir, rel) : dir).sort()) {
      if (!rel && (name === 'README.md' || name === 'host.json')) continue;
      const child = rel ? rel + '/' + name : name;
      const st = fs.lstatSync(path.join(dir, child));
      if (st.isDirectory()) walk(child);
      else if (st.isFile()) {
        hash.update(child + '\0');
        hash.update(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, child))).digest('hex') + '\n');
      }
    }
  })('');
  return hash.digest('hex');
}

// Source commit of the tree the extension was copied from; null outside a Git checkout
// (installed runtime copies have no .git). Never fails the install.
function sourceCommit(root = repoRoot) {
  try {
    const out = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^[0-9a-f]{40}$/.test(out) ? out : null;
  } catch { return null; }
}

// host.json tells the installed extension where the host code lives (launch.js host) and which
// source it was installed from, so a stale install is visible instead of silent (R8 deviation c).
function hostLocation(root = repoRoot) {
  return { format: 1, root: path.resolve(root), commit: sourceCommit(root), contentHash: contentHash(SRC), installedAt: new Date().toISOString() };
}

function installTo(extensionsDir) {
  const man = readManifest();
  fs.mkdirSync(extensionsDir, { recursive: true });
  const dest = path.join(extensionsDir, man.folderName);
  copyTree(SRC, dest);
  const host = hostLocation();
  fs.writeFileSync(path.join(dest, 'host.json'), JSON.stringify(host, null, 2) + '\n');
  pruneOld(extensionsDir, man.folderName);
  return { dest, host, ...man };
}

function installAll(dirs = defaultExtensionDirs()) {
  return dirs.map((d) => installTo(d));
}

module.exports = {
  readManifest,
  copyTree,
  contentHash,
  sourceCommit,
  hostLocation,
  pruneOld,
  defaultExtensionDirs,
  installTo,
  installAll,
  SRC
};

if (require.main === module) {
  try {
    const results = installAll();
    for (const r of results) {
      console.log('已安装 Web Agent 插件:');
      console.log('  ' + r.dest);
      console.log('  来源提交 ' + (r.host.commit || '（非 Git 目录，未知）') + '，内容 hash ' + r.host.contentHash.slice(0, 16));
      console.log('  主机位置 ' + r.host.root);
    }
    console.log('');
    console.log('下一步：');
    console.log('  1. 完全退出 VS Code 再打开（或命令面板 Developer: Reload Window）');
    console.log('  2. 文件 → 打开文件夹，选择要让 Agent 工作的项目');
    console.log('  3. 活动栏 Web Agent → 侧栏“主机”卡片点【启动】（不需要 CMD 或浏览器）');
    console.log('  4. 仓库更新后请重新运行本脚本，否则插件会提示来源提交不一致');
    console.log('  已用 run-webagent.cmd 为同一文件夹启动过主机时，插件会直接接管该主机。');
    console.log('需要 VS Code 1.90 或更新。');
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
