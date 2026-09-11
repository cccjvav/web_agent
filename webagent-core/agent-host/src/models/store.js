const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { config } = require('../config');

const SECRET_REL = ['.webagent/config.json', '.webagent/read-hashes.json', '.webagent/usage.json'];
const NESTED_NAMES = ['config.json', 'read-hashes.json', 'usage.json'];

function dir() {
  return path.join(config.workspaceRoot, '.webagent');
}

function storePath() {
  return path.join(dir(), 'config.json');
}

function defaults() {
  return {
    activeModelId: 'builtin',
    models: [
      {
        id: 'builtin',
        name: '内置探索 Agent',
        protocol: 'builtin',
        baseUrl: '',
        apiKey: '',
        modelId: 'webagent-explore'
      }
    ],
    multiModel: {
      enabled: true,
      mergeModel: 'auto',
      thinkLevel: 'high',
      maxBranches: 4,
      mergeAllowsRead: true
    },
    bridge: {
      loggedIn: true,
      provider: 'local-demo',
      username: 'local',
      githubId: '',
      license: 'local-demo',
      deviceAuthorized: true,
      tunnelProvider: 'cloudflare',
      persistentMode: false,
      ngrokDomain: '',
      ngrokToken: '',
      namedDomain: '',
      namedToken: '',
      namedPort: 48271,
      quickLinks: []
    }
  };
}

function clampBranches(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 4;
  return Math.min(8, Math.max(2, Math.round(v)));
}

function normalizeMultiModel(mm) {
  const next = { ...defaults().multiModel, ...(mm || {}) };
  next.maxBranches = clampBranches(next.maxBranches);
  if (typeof next.enabled !== 'boolean') next.enabled = true;
  if (typeof next.mergeAllowsRead !== 'boolean') next.mergeAllowsRead = true;
  next.mergeModel = next.mergeModel || 'auto';
  next.thinkLevel = next.thinkLevel || 'high';
  return next;
}

function isFakeGithub(b) {
  if (String(b.provider || '') !== 'github') return false;
  if (String(b.githubId || '').trim()) return false;
  const u = String(b.username || '').trim().toLowerCase();
  return !u || u === 'demo' || u === 'local';
}

function normalizeBridge(bridge) {
  const b = { ...defaults().bridge, ...(bridge || {}) };
  if (b.license === '永久顺') b.license = 'local-demo';
  if (isFakeGithub(b)) {
    b.provider = 'local-demo';
    if (!b.username || b.username === 'demo') b.username = 'local';
    b.githubId = '';
  }
  if (b.username === 'demo' && b.provider === 'local-demo') b.username = 'local';
  if (b.provider === 'github') {
    b.loggedIn = true;
    b.deviceAuthorized = true;
  }
  return b;
}

function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('配置必须为JSON对象');
  for (const key of ['bridge', 'multiModel']) {
    if (value[key] != null && (typeof value[key] !== 'object' || Array.isArray(value[key]))) throw new Error('配置字段类型错误: ' + key);
  }
  if (value.models != null) {
    if (!Array.isArray(value.models)) throw new Error('models必须为数组');
    const ids = new Set();
    for (const model of value.models) {
      if (!model || typeof model !== 'object' || typeof model.id !== 'string' || !model.id || ids.has(model.id)) throw new Error('模型id缺失或重复');
      ids.add(model.id);
      for (const key of ['name', 'protocol', 'baseUrl', 'apiKey', 'modelId']) {
        if (model[key] != null && typeof model[key] !== 'string') throw new Error('模型字段类型错误: ' + key);
      }
    }
  }
  if (value.activeModelId != null && typeof value.activeModelId !== 'string') throw new Error('activeModelId必须为字符串');
  return value;
}

function load() {
  try {
    const raw = validateConfig(JSON.parse(fs.readFileSync(storePath(), 'utf8')));
    return {
      ...defaults(),
      ...raw,
      models: Array.isArray(raw.models) && raw.models.length ? raw.models : defaults().models,
      bridge: normalizeBridge(raw.bridge),
      multiModel: normalizeMultiModel(raw.multiModel)
    };
  } catch (err) {
    if (err.code === 'ENOENT') return defaults();
    const failure = new Error('配置读取/校验失败，原文件已保留，请备份并修复：' + storePath());
    failure.code = 'E_CONFIG_CORRUPT';
    throw failure;
  }
}

function restrictFileMode(file) {
  try {
    fs.chmodSync(file, 0o600);
  } catch (_) {}
}

function gitignoreLines(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

function lineCovers(pattern, rel) {
  const p = String(pattern || '').replace(/\\/g, '/');
  const r = String(rel || '').replace(/\\/g, '/');
  if (!p || !r) return false;
  if (p === r || p === `/${r}` || p === `**/${r}`) return true;
  if (p === '.webagent/' || p === '.webagent/**' || p === '**/.webagent/' || p === '**/.webagent/**') return true;
  const base = r.split('/').pop();
  if (p === base || p === `**/${base}`) return true;
  if (p === `.webagent/${base}` || p === `**/.webagent/${base}`) return true;
  return false;
}

function alreadyIgnored(text, rel) {
  return gitignoreLines(text).some((line) => lineCovers(line, rel));
}

function detectEol(text) {
  return String(text || '').includes('\r\n') ? '\r\n' : '\n';
}

function ensureNestedIgnore() {
  fs.mkdirSync(dir(), { recursive: true });
  const nested = path.join(dir(), '.gitignore');
  let cur = '';
  try {
    cur = fs.readFileSync(nested, 'utf8');
  } catch (_) {}
  const missing = NESTED_NAMES.filter((name) => !alreadyIgnored(cur, name) && !alreadyIgnored(cur, `.webagent/${name}`));
  if (!missing.length) return;
  const eol = detectEol(cur) || '\n';
  const block = [
    '# Web Agent — do not commit MCP secret or API keys',
    ...missing
  ].join(eol);
  const prefix = cur ? cur.replace(/\s*$/, '') + eol + eol : '';
  fs.writeFileSync(nested, prefix + block + eol, 'utf8');
}

function ensureWorkspaceGitignore() {
  const gitDir = path.join(config.workspaceRoot, '.git');
  if (!fs.existsSync(gitDir)) return;
  const gi = path.join(config.workspaceRoot, '.gitignore');
  let cur = '';
  try {
    cur = fs.readFileSync(gi, 'utf8');
  } catch (_) {}
  const missing = SECRET_REL.filter((rel) => !alreadyIgnored(cur, rel));
  if (!missing.length) return;
  const eol = detectEol(cur);
  const start = cur && !cur.endsWith('\n') && !cur.endsWith('\r\n') ? eol : '';
  const gap = cur ? eol : '';
  const block = [
    '# Web Agent — do not commit MCP secret or API keys',
    ...missing
  ].join(eol);
  fs.writeFileSync(gi, cur + start + gap + block + eol, 'utf8');
}

function protectWorkspaceSecrets() {
  try {
    ensureNestedIgnore();
    ensureWorkspaceGitignore();
    if (fs.existsSync(storePath())) restrictFileMode(storePath());
  } catch (_) {}
}

function trackedSecretFiles() {
  try {
    const gitDir = path.join(config.workspaceRoot, '.git');
    if (!fs.existsSync(gitDir)) return [];
    const r = spawnSync('git', ['ls-files', '-z', '--', ...SECRET_REL], {
      cwd: config.workspaceRoot,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 4000
    });
    if (!r || r.status !== 0) return [];
    return String(r.stdout || '')
      .split('\0')
      .map((s) => s.trim().replace(/\\/g, '/'))
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function warnTrackedSecrets(log) {
  const hits = trackedSecretFiles();
  if (!hits.length) return hits;
  const write = typeof log === 'function' ? log : console.warn;
  write(
    `警告：工作区 Git 仍跟踪 ${hits.join('、')}。gitignore 挡不住已经提交的文件。请 git rm --cached -- ${hits.join(' ')} ，不要把 MCP 密钥或 API Key 推进仓库。`
  );
  return hits;
}

function save(next) {
  validateConfig(next);
  if (fs.existsSync(storePath())) load(); // Never overwrite an unreadable/corrupt existing configuration.
  const cfg = {
    ...next,
    bridge: normalizeBridge(next && next.bridge),
    multiModel: normalizeMultiModel(next && next.multiModel)
  };
  fs.mkdirSync(dir(), { recursive: true });
  const tmp = storePath() + '.tmp.' + require('crypto').randomBytes(8).toString('hex');
  try {
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fs.renameSync(tmp, storePath());
  } finally { try { fs.unlinkSync(tmp); } catch (err) { if (err.code !== 'ENOENT') throw err; } }
  restrictFileMode(storePath());
  protectWorkspaceSecrets();
  return cfg;
}

function patch(partial) {
  const current = load();
  const next = {
    ...current,
    ...partial,
    bridge: normalizeBridge({ ...current.bridge, ...(partial.bridge || {}) }),
    multiModel: { ...current.multiModel, ...(partial.multiModel || {}) },
    models: partial.models || current.models
  };
  return save(next);
}

function reset() {
  return save(defaults());
}

module.exports = {
  load,
  save,
  patch,
  defaults,
  protectWorkspaceSecrets,
  trackedSecretFiles,
  warnTrackedSecrets,
  reset,
  isFakeGithub
};
