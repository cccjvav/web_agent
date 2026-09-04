const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { markdownPreference, markdownTechStack } = require('./profile');

function file() {
  return path.join(config.workspaceRoot, '.webagent', 'customizations.json');
}

function defaults() {
  return {
    preference: '',
    environment: {
      os: 'auto',
      shell: 'auto',
      replyLanguage: 'zh-CN',
      commitLanguage: 'zh-CN',
      notes: ''
    },
    techStack: {
      languages: '',
      frameworks: '',
      packageManager: '',
      testCommand: '',
      notes: ''
    },
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
    const base = defaults();
    return {
      ...base,
      ...raw,
      environment: { ...base.environment, ...(raw.environment || {}) },
      techStack: { ...base.techStack, ...(raw.techStack || {}) }
    };
  } catch {
    return defaults();
  }
}

function saveCustom(next) {
  const merged = { ...defaults(), ...next };
  if (next && next.environment) merged.environment = { ...defaults().environment, ...next.environment };
  if (next && next.techStack) merged.techStack = { ...defaults().techStack, ...next.techStack };
  const dir = path.dirname(file());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(merged, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'instructions.md'), merged.instructions || '', 'utf8');
  fs.writeFileSync(path.join(dir, 'preference.md'), markdownPreference(merged), 'utf8');
  fs.writeFileSync(path.join(dir, 'tech-stack.md'), markdownTechStack(merged), 'utf8');
  return merged;
}

function patchCustom(partial) {
  return saveCustom({ ...loadCustom(), ...partial });
}

module.exports = { loadCustom, saveCustom, patchCustom, defaults };
