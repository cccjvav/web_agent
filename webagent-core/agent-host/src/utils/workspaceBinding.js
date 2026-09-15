'use strict';
const fs=require('fs');
const path=require('path');
function assertWorkspaceBinding(input, config) {
  if(typeof config.workspaceRoot!=='string'||!config.workspaceRoot||!fs.existsSync(config.workspaceRoot)||!fs.statSync(config.workspaceRoot).isDirectory())throw Error('工作区不存在或不是文件夹，请选择有效工作区后重新启动主机。');
  if(typeof input?.workspaceRoot!=='string'||!path.isAbsolute(input.workspaceRoot)||input.hostInstanceId!==config.hostInstanceId)throw Error('没有确认当前工作区或主机已重启，请打开文件夹并刷新后再启动 Bridge。');
  const normalize=value=>{const resolved=path.resolve(value);return process.platform==='win32'?resolved.toLowerCase():resolved;};
  if(normalize(input.workspaceRoot)!==normalize(config.workspaceRoot))throw Error('IDE/页面工作区与主机不一致，已阻止操作。请打开主机对应文件夹，或为目标项目重新启动主机。');
}
module.exports={assertWorkspaceBinding};
