const fs = require('fs');
const path = require('path');
const { config } = require('../config');

const SECRET_REL = ['.webagent/config.json', '.webagent/read-hashes.json'];
const NESTED_NAMES = ['config.json', 'read-hashes.json'];

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
      license: 'local-demo',
      deviceAuthorized: true,
      tunnelProvider: 'cloudflare',
      persistentMode: false,
      ngrokDomain: '',
      namedDomain: '',
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

function normalizeBridge(bridge) {
  const b = { ...defaults().bridge, ...(bridge || {}) };
  if (b.license === '永久顺') b.license = 'local-demo';
  if (b.provider === 'github') b.provider = 'local-demo';
  if (b.username === 'demo' && b.provider === 'local-demo') b.username = 'local';
  return b;
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    return {
      ...defaults(),
      ...raw,
      models: Array.isArray(raw.models) && raw.models.length ? raw.models : defaults().models,
      bridge: normalizeBridge(raw.bridge),
      multiModel: normalizeMultiModel(raw.multiModel)
    };
  } catch {
    return defaults();
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

function save(next) {
  const cfg = {
    ...next,
    bridge: normalizeBridge(next && next.bridge),
    multiModel: normalizeMultiModel(next && next.multiModel)
  };
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(cfg, null, 2), 'utf8');
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

module.exports = { load, save, patch, defaults, protectWorkspaceSecrets };
