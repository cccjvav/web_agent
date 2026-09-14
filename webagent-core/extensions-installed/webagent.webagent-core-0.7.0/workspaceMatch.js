'use strict';

// 桌面 VS Code 打开的文件夹 vs agent-host 的 workspaceRoot。
// 不依赖 vscode 模块，测试可直接 require。
function normalizePath(p) {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function sameWorkspace(vscodeFolder, hostRoot) {
  if (!vscodeFolder || !hostRoot) return false;
  return normalizePath(vscodeFolder) === normalizePath(hostRoot);
}

module.exports = { normalizePath, sameWorkspace };
