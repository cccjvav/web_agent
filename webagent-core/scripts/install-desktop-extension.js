'use strict';

// 把 webagent-core/extension 拷进本机桌面 VS Code 的 extensions 目录。
// code-server 仍走 ensure-code-server.syncExtension（extensions-installed/）。
// 覆盖：WEBAGENT_VSCODE_EXTENSIONS 指向自定义 extensions 根（测试用）。
const fs = require('fs');
const os = require('os');
const path = require('path');

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

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (name === 'README.md') continue;
    const src = path.join(from, name);
    const dest = path.join(to, name);
    const st = fs.statSync(src);
    if (st.isDirectory()) copyTree(src, dest);
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

function installTo(extensionsDir) {
  const man = readManifest();
  fs.mkdirSync(extensionsDir, { recursive: true });
  const dest = path.join(extensionsDir, man.folderName);
  copyTree(SRC, dest);
  pruneOld(extensionsDir, man.folderName);
  return { dest, ...man };
}

function installAll(dirs = defaultExtensionDirs()) {
  return dirs.map((d) => installTo(d));
}

module.exports = {
  readManifest,
  copyTree,
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
    }
    console.log('');
    console.log('下一步：');
    console.log('  1. 用 run-webagent.cmd 启动 agent-host（可带工作区路径）');
    console.log('  2. 完全退出 VS Code 再打开（或命令面板 Developer: Reload Window）');
    console.log('  3. 文件 → 打开文件夹 = 第 1 步那个工作区（不要打开 web_agent 源码仓）');
    console.log('  4. 活动栏应出现 Web Agent；Chat 里输入 @webagent');
    console.log('需要 VS Code 1.90 或更新。');
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
