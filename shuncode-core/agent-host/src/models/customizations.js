const fs = require('fs');
const path = require('path');
const { config } = require('../config');

function file() {
  return path.join(config.workspaceRoot, '.shuncode', 'customizations.json');
}

function defaults() {
  return {
    preference: '',
    instructions: '提交说明用中文。改动尽量走 apply_patch。Ask/Plan 只读，Code 才写文件。',
    agents: [
      {
        id: 'default',
        name: '默认编程智能体',
        role: '在 Ask / Plan / Code 下使用工作区工具，意见一致再行动。'
      }
    ],
    prompts: [
      {
        id: 'diagnose',
        name: '诊断测试失败',
        content: '只读探查工作区测试失败的原因，不要改文件。'
      }
    ],
    hooks: [],
    mcpServers: [],
    plugins: [],
    quickLinks: [],
    voice: '',
    dictation: '',
    codex: { loggedIn: false, account: '' }
  };
}

function loadCustom() {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return { ...defaults(), ...raw };
  } catch {
    return defaults();
  }
}

function saveCustom(next) {
  const dir = path.dirname(file());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(next, null, 2), 'utf8');
  const instr = path.join(dir, 'instructions.md');
  fs.writeFileSync(instr, next.instructions || '', 'utf8');
  return next;
}

function patchCustom(partial) {
  return saveCustom({ ...loadCustom(), ...partial });
}

module.exports = { loadCustom, saveCustom, patchCustom, defaults };
