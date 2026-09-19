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

const MAX_LIST_ITEMS = 100;
const LIST_FIELDS = {
  agents: { id: 256, name: 1024, role: 64 * 1024 },
  prompts: { id: 256, name: 1024, content: MAX_TEXT_BYTES },
  hooks: { event: 256, command: 64 * 1024 },
  mcpServers: { name: 1024, url: 4096 },
  plugins: { name: 1024 },
  quickLinks: { name: 1024, url: 4096 }
};

function invalidCustom(message) {
  throw new ProtocolError('E_BAD_ARGS', message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value, field, maxBytes = MAX_TEXT_BYTES) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > maxBytes || value.includes('\0')) {
    invalidCustom(field + ' must be bounded text');
  }
  return value;
}

function fixedStringRecord(value, fields, label, strict) {
  if (!isRecord(value)) invalidCustom(label + ' must be an object');
  if (strict && Object.keys(value).some(key => !Object.hasOwn(fields, key))) invalidCustom('unknown ' + label + ' field');
  const out = {};
  for (const [field, limit] of Object.entries(fields)) {
    if (Object.hasOwn(value, field)) out[field] = text(value[field], `${label}.${field}`, limit);
  }
  return out;
}

function fixedList(value, label, strict) {
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) invalidCustom(label + ' must be a bounded list');
  const fields = LIST_FIELDS[label];
  return value.map((item) => {
    if (label === 'plugins' && typeof item === 'string') return text(item, 'plugins[]', fields.name);
    return fixedStringRecord(item, fields, `${label}[]`, strict);
  });
}

function normalizeCustom(value, { strict = true } = {}) {
  if (!isRecord(value)) invalidCustom('customizations must be an object');
  const base = defaults();
  const allowed = new Set(Object.keys(base));
  if (strict && Object.keys(value).some(key => !allowed.has(key))) invalidCustom('unknown customization field');
  const out = {};
  for (const field of ['preference', 'instructions']) {
    if (Object.hasOwn(value, field)) out[field] = text(value[field], field);
  }
  for (const field of ['environment', 'techStack']) {
    if (Object.hasOwn(value, field)) {
      const limits = Object.fromEntries(Object.keys(base[field]).map(key => [key, 64 * 1024]));
      out[field] = fixedStringRecord(value[field], limits, field, strict);
    }
  }
  for (const field of Object.keys(LIST_FIELDS)) {
    if (Object.hasOwn(value, field)) out[field] = fixedList(value[field], field, strict);
  }
  for (const field of ['voice', 'dictation']) {
    if (Object.hasOwn(value, field)) out[field] = text(value[field], field, 1024);
  }
  if (Object.hasOwn(value, 'codex')) {
    if (!isRecord(value.codex)) invalidCustom('codex must be an object');
    if (strict && Object.keys(value.codex).some(key => !['loggedIn', 'account'].includes(key))) invalidCustom('unknown codex field');
    out.codex = {};
    if (Object.hasOwn(value.codex, 'loggedIn')) {
      if (typeof value.codex.loggedIn !== 'boolean') invalidCustom('codex.loggedIn must be boolean');
      out.codex.loggedIn = value.codex.loggedIn;
    }
    if (Object.hasOwn(value.codex, 'account')) out.codex.account = text(value.codex.account, 'codex.account', 1024);
  }
  return out;
}

function loadCustom() {
  try {
    const raw = normalizeCustom(JSON.parse(readBoundedText(file())), { strict: false });
    const base = defaults();
    return {
      ...base,
      ...raw,
      environment: { ...base.environment, ...(raw.environment || {}) },
      techStack: { ...base.techStack, ...(raw.techStack || {}) },
      codex: { ...base.codex, ...(raw.codex || {}) }
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
  const normalized = normalizeCustom(next);
  loadCustom(); // Fail closed on unreadable existing state, even for direct saves.

  const merged = { ...defaults(), ...normalized };
  if (normalized.environment) merged.environment = { ...defaults().environment, ...normalized.environment };
  if (normalized.techStack) merged.techStack = { ...defaults().techStack, ...normalized.techStack };
  if (normalized.codex) merged.codex = { ...defaults().codex, ...normalized.codex };
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
  const normalized = normalizeCustom(partial);
  if (!Object.keys(normalized).length) invalidCustom('customization patch must not be empty');
  const current = loadCustom();
  return saveCustom({ ...current, ...normalized,
    environment: { ...current.environment, ...normalized.environment },
    techStack: { ...current.techStack, ...normalized.techStack },
    codex: { ...current.codex, ...normalized.codex }
  });
}

module.exports = { loadCustom, saveCustom, patchCustom, defaults };
