const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { config } = require('../config');

const NESTED_NAMES = ['config.json', 'read-hashes.json', 'usage.json', 'board.json', 'memory/', 'customizations.json', 'instructions.md', 'preference.md', 'tech-stack.md'];
const SECRET_REL = NESTED_NAMES.map(name => `.webagent/${name}`);

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

// Cheap change detector for hot readers that cache something derived from load() (e.g. the
// Bridge permission policy, read on every remote tool call). Folds in:
//  * saves — bumped by save() in this process, so a save inside one mtime tick is still seen;
//  * the workspace root — tests and future callers may switch it;
//  * the file's size, mtime and inode — so an external edit, replace or delete invalidates too.
// A key is only a hint to re-read; it never replaces load()'s own validation.
let saves = 0;
function revisionKey() {
  let stat = 'absent';
  try {
    const st = fs.statSync(storePath(), { bigint: true });
    stat = `${st.size}:${st.mtimeNs}:${st.ino}`;
  } catch (_) {}
  return `${config.workspaceRoot}\0${saves}\0${stat}`;
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

// Machine-local second layer: the repository's own `info/exclude`, which Git reads like a
// .gitignore but which is never committed and never shows up in the user's diffs.
//
// F70 (external review P1-6): this used to append to the user's TRACKED root `.gitignore` on every
// start — a tool process silently editing a version-controlled file in the user's project. It was
// also redundant: the nested `.webagent/.gitignore` above already ignores every protected file on
// its own. The exclude entry only matters when someone deletes that nested file. The path comes
// from `git rev-parse --git-path`, so worktrees and `.git` files (submodules) resolve correctly;
// a workspace that is not a repository, or has no usable Git, gets nothing here and loses nothing.
// Once per workspace root and process: save() calls protectWorkspaceSecrets on every config write
// and must not spawn git each time. `--path-format` needs Git 2.31+; older Git fails the call and
// the nested .gitignore stays the protection.
const excludeChecked = new Set();

function ensureLocalExclude() {
  if (excludeChecked.has(config.workspaceRoot)) return;
  // Not a repository (yet): cheap check, not cached, so a later `git init` is still picked up.
  if (!fs.existsSync(path.join(config.workspaceRoot, '.git'))) return;
  excludeChecked.add(config.workspaceRoot);
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-path', 'info/exclude'], {
    cwd: config.workspaceRoot, encoding: 'utf8', windowsHide: true, timeout: 4000
  });
  const exclude = r && r.status === 0 ? String(r.stdout || '').trim() : '';
  if (!exclude || !path.isAbsolute(exclude)) return;
  let cur = '';
  try {
    cur = fs.readFileSync(exclude, 'utf8');
  } catch (_) {}
  // Anchored at the repository root, i.e. only when the workspace IS the repository root; for a
  // nested workspace the nested `.webagent/.gitignore` remains the protection.
  const missing = SECRET_REL.filter((rel) => !alreadyIgnored(cur, rel)).map((rel) => `/${rel}`);
  if (!missing.length) return;
  const eol = detectEol(cur);
  const start = cur && !cur.endsWith('\n') && !cur.endsWith('\r\n') ? eol : '';
  const gap = cur ? eol : '';
  const block = [
    '# Web Agent — keep MCP secret and API keys out of Git (local exclude; the tracked .gitignore is left alone)',
    ...missing
  ].join(eol);
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  fs.writeFileSync(exclude, cur + start + gap + block + eol, 'utf8');
}

function protectWorkspaceSecrets() {
  try {
    ensureNestedIgnore();
    if (fs.existsSync(storePath())) restrictFileMode(storePath());
  } catch (_) {}
  // Independent of the nested file: a read-only or odd .git layout must not skip the steps above.
  try {
    ensureLocalExclude();
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
  } finally {
    // Bump even when the rename failed: the file may or may not have changed, so derived caches
    // must re-read rather than trust their old copy.
    saves += 1;
    try { fs.unlinkSync(tmp); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
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
  revisionKey,
  patch,
  defaults,
  protectWorkspaceSecrets,
  trackedSecretFiles,
  warnTrackedSecrets,
  reset,
  isFakeGithub
};
