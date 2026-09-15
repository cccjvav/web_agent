'use strict';
const fs = require('fs');
const path = require('path');
const { config } = require('../config');

function hostIdentity() {
  return { hostInstanceId: config.hostInstanceId, startedAt: config.startedAt,
    workspaceRoot: config.workspaceRoot, version: config.version,
    workbenchPort: config.workbenchPort, mcpPort: config.port };
}

function findExecutable(name) {
  const extensions = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(dir, name + extension);
      try {
        if (!fs.statSync(candidate).isFile()) continue;
        fs.accessSync(candidate, process.platform === 'win32' ? fs.constants.R_OK : fs.constants.X_OK);
        return candidate;
      } catch (_) { /* Discovery only: never execute a PATH candidate. */ }
    }
  }
  return null;
}

function diagnostics() {
  let readable = false, writable = false;
  try { fs.accessSync(config.workspaceRoot, fs.constants.R_OK); readable = fs.statSync(config.workspaceRoot).isDirectory(); } catch (_) {}
  try { fs.accessSync(config.workspaceRoot, fs.constants.W_OK); writable = true; } catch (_) {}
  const ptyLive = require('../tools/ptyJobs').hasClient();
  const powershell = process.platform === 'win32' && Boolean(findExecutable('powershell') || findExecutable('pwsh'));
  return { identity: hostIdentity(), probe: 'read-only; no commands, file writes, installations or desktop input',
    capabilities: [
      { id: 'workspace-read', status: readable ? 'ready' : 'unavailable', reason: readable ? '工作区目录可读；具体文件仍受路径/敏感文件规则约束。' : '工作区不存在或不可读。' },
      { id: 'workspace-write', status: writable ? 'unverified' : 'unavailable', reason: writable ? '目录权限初检通过；未写入测试文件，实际写入必须读回核验。' : '目录写权限初检失败。' },
      { id: 'builtin-explorer', status: readable ? 'ready' : 'unavailable', reason: '确定性扫描/读取，不是通用模型；不需要模型API。' },
      { id: 'commands', status: 'unverified', reason: '命令工具已注册；尚未执行诊断命令。受模式/危险命令/进程树规则约束，不是OS沙箱。' },
      { id: 'desktop-pty', status: ptyLive ? 'unverified' : 'unavailable', reason: ptyLive ? '收到匹配工作区的扩展心跳；执行仍需实际验证与审批。' : '未收到匹配工作区的桌面扩展近期心跳。' },
      { id: 'desktop-input', status: powershell ? 'unverified' : 'unavailable', reason: powershell ? '发现PowerShell；未截图或操作键鼠，真机能力未验收。' : '此诊断未发现Windows桌面输入的必要平台/PowerShell条件。' },
      { id: 'browser-automation', status: 'unavailable', reason: '经典工作台仅有连接指引，不把它冒充可控浏览器。' }
    ] };
}
module.exports = { hostIdentity, findExecutable, diagnostics };
