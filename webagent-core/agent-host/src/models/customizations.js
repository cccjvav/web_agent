const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readBoundedText, MAX_TEXT_BYTES } = require('../utils/boundedFile');
const { resolveSafePath } = require('../tools/patchEngine');
const { ProtocolError } = require('../mcp/errors');
const { markdownPreference, markdownTechStack } = require('./profile');

function file() {
  return resolveSafePath('.webagent/customizations.json');
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

function validateCustom(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProtocolError('E_BAD_ARGS', 'customizations must be an object');
  const base = defaults();
  for (const key of ['preference', 'instructions']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') throw new ProtocolError('E_BAD_ARGS', key + ' must be text');
  }
  for (const key of ['environment', 'techStack']) {
    if (value[key] === undefined) continue;
    const record = value[key];
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new ProtocolError('E_BAD_ARGS', key + ' must be an object');
    for (const field of Object.keys(base[key])) {
      if (record[field] !== undefined && typeof record[field] !== 'string') throw new ProtocolError('E_BAD_ARGS', key + '.' + field + ' must be text');
    }
  }
}

function loadCustom() {
  try {
    const raw = JSON.parse(readBoundedText(file()));
    validateCustom(raw);
    const base = defaults();
    return {
      ...base,
      ...raw,
      environment: { ...base.environment, ...(raw.environment || {}) },
      techStack: { ...base.techStack, ...(raw.techStack || {}) }
    };
  } catch (err) {
    if (err.code === 'ENOENT') return defaults();
    const failure = new Error('E_CUSTOM_CORRUPT: customizations could not be read; original file preserved. ' + err.message);
    failure.code = 'E_CUSTOM_CORRUPT';
    throw failure;
  }
}

function writeCustomFile(target, text) {
  const tmp = target + '.tmp.' + crypto.randomBytes(8).toString('hex');
  try {
    fs.writeFileSync(tmp, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, target);
  } finally {
    try { fs.unlinkSync(tmp); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
}

function saveCustom(next = {}) {
  validateCustom(next);
  loadCustom(); // Fail closed on unreadable existing state, even for direct saves.

  const merged = { ...defaults(), ...next };
  if (next && next.environment) merged.environment = { ...defaults().environment, ...next.environment };
  if (next && next.techStack) merged.techStack = { ...defaults().techStack, ...next.techStack };
  const outputs = [
    [file(), JSON.stringify(merged, null, 2)],
    [resolveSafePath('.webagent/instructions.md'), merged.instructions || ''],
    [resolveSafePath('.webagent/preference.md'), markdownPreference(merged)],
    [resolveSafePath('.webagent/tech-stack.md'), markdownTechStack(merged)]
  ];
  for (const [, text] of outputs) {
    if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) throw new ProtocolError('E_BAD_ARGS', 'customization output exceeds text budget');
  }
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  for (const [target, text] of outputs) writeCustomFile(target, text);
  return merged;
}

function patchCustom(partial) {
  validateCustom(partial);
  const current = loadCustom();
  return saveCustom({ ...current, ...partial,
    environment: { ...current.environment, ...partial.environment },
    techStack: { ...current.techStack, ...partial.techStack }
  });
}

module.exports = { loadCustom, saveCustom, patchCustom, defaults };
