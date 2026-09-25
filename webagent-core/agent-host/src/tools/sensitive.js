const fs = require('fs');
const path = require('path');
const { config } = require('../config');

const SENSITIVE_PATTERNS = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '*.jks',
  '*.keystore',
  'id_rsa',
  'id_rsa.*',
  'id_ed25519',
  'id_ed25519.*',
  'id_ecdsa',
  'id_dsa',
  '.ssh/',
  '.aws/',
  '.gnupg/',
  '.npmrc',
  '.netrc',
  '_netrc',
  '.git-credentials',
  '.cloudflared/',
  'credentials.json',
  'service-account*.json',
  'secrets.json',
  '.webagent/config.json',
  // The operator's custom rule file is itself protected: a model with Edit could otherwise rewrite or
  // delete it and switch the custom rules off. Built-in patterns cannot be negated by "!" rules.
  '.webagentignore'
];

const SENSITIVE_EXCEPTIONS = ['.env.example', '.env.sample', '.env.template'];

const NOISE_NAMES = new Set([
  'node_modules',
  '.git',
  '.cache',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'coverage',
  '.turbo',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  'target',
  '.idea',
  '.local'
]);

// A rule file is operator-controlled workspace data, not a trusted program: cap how much of it
// is honoured and how long a single evaluation may take, so an oversized or hostile file cannot
// turn a bounded list/search into an unbounded one.
const MAX_CUSTOM_PATTERNS = 512;
const MAX_CUSTOM_BYTES = 64 * 1024;

function toPosix(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

// Compiling the same glob repeatedly dominated deep-path checks; the pattern set is small and
// bounded, so memoising the compiled form is safe and keeps behaviour identical.
const globCache = new Map();
const MAX_GLOB_CACHE = 2048;

function globRegex(pattern) {
  const cached = globCache.get(pattern);
  if (cached) return cached;
  const re = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '::DS::')
      .replace(/\*/g, '[^/]*')
      .replace(/::DS::/g, '.*')}$`
  );
  if (globCache.size >= MAX_GLOB_CACHE) globCache.clear();
  globCache.set(pattern, re);
  return re;
}

function globMatch(pattern, rel) {
  const p = toPosix(pattern);
  const r = toPosix(rel);
  if (!r || r === '.') return false;
  if (p.endsWith('/')) {
    const dir = p.slice(0, -1);
    return r === dir || r.startsWith(`${dir}/`);
  }
  const re = globRegex(p);
  const base = r.split('/').pop();
  return re.test(r) || re.test(base);
}

let customCache = { root: null, identity: null, patterns: [], truncated: false };

function ruleIdentity(stat) {
  if (!stat) return 'absent';
  // mtimeNs + size + inode: any ordinary edit changes at least one of them, so a live edit is
  // still observed while repeated checks within one list/search reuse the parsed rules.
  return `${stat.mtimeNs}:${stat.size}:${stat.ino}:${stat.ctimeNs}`;
}

function statRuleFile(file) {
  try {
    const stat = fs.statSync(file, { bigint: true });
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

function readCustomRules(file, stat) {
  const size = Number(stat.size);
  let raw = '';
  try {
    // Only the first MAX_CUSTOM_BYTES are honoured; the remainder is ignored rather than
    // silently half-parsed into a partial rule.
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(Math.min(size, MAX_CUSTOM_BYTES));
      const read = fs.readSync(fd, buf, 0, buf.length, 0);
      raw = buf.subarray(0, read).toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return { patterns: [], truncated: false };
  }
  const bytesTruncated = size > MAX_CUSTOM_BYTES;
  const lines = raw.split(/\r?\n/);
  if (bytesTruncated) lines.pop(); // The final line may have been cut mid-pattern.
  const all = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  return {
    patterns: all.slice(0, MAX_CUSTOM_PATTERNS),
    truncated: bytesTruncated || all.length > MAX_CUSTOM_PATTERNS
  };
}

// One cheap stat per check replaces one full open/read/parse per checked path. The rules are
// re-read only when the workspace root or the file's identity changed, so editing or deleting
// `.webagentignore` still takes effect on the very next check.
function loadCustomPatterns() {
  const file = path.join(config.workspaceRoot, '.webagentignore');
  const stat = statRuleFile(file);
  const identity = ruleIdentity(stat);
  if (customCache.root === config.workspaceRoot && customCache.identity === identity) {
    return customCache.patterns;
  }
  const next = stat ? readCustomRules(file, stat) : { patterns: [], truncated: false };
  customCache = {
    root: config.workspaceRoot,
    identity,
    patterns: next.patterns,
    truncated: next.truncated
  };
  return customCache.patterns;
}

function customRuleStatus() {
  loadCustomPatterns();
  return { count: customCache.patterns.length, truncated: customCache.truncated, maxPatterns: MAX_CUSTOM_PATTERNS, maxBytes: MAX_CUSTOM_BYTES };
}

function resetCustomPatternCache() {
  customCache = { root: null, identity: null, patterns: [], truncated: false };
}

function isSensitive(relPath) {
  const rel = toPosix(relPath);
  // Built-in protections are case-insensitive and apply at every directory depth.
  const parts = rel.toLowerCase().split('/');
  const suffixes = parts.map((_, i) => parts.slice(i).join('/'));
  const base = parts[parts.length - 1];
  for (const pat of SENSITIVE_PATTERNS) {
    if (SENSITIVE_EXCEPTIONS.includes(base) && (pat === '.env' || pat === '.env.*')) continue;
    if (suffixes.some((suffix) => globMatch(pat, suffix))) return true;
  }
  for (const pat of loadCustomPatterns()) {
    if (pat.startsWith('!')) {
      if (globMatch(pat.slice(1), rel)) return false;
      continue;
    }
    if (globMatch(pat, rel)) return true;
  }
  return false;
}

function isNoise(relPath) {
  const rel = toPosix(relPath);
  if (!rel || rel === '.') return false;
  const parts = rel.split('/');
  return parts.some((p) => NOISE_NAMES.has(p));
}

function isHidden(relPath) {
  return isSensitive(relPath) || isNoise(relPath);
}

function assertNotSensitive(relPath) {
  if (isSensitive(relPath)) {
    const err = new Error(`ACCESS_DENIED_SENSITIVE_FILE: "${toPosix(relPath)}" is blocked from MCP and Chat tools.`);
    err.code = 'E_FORBIDDEN';
    throw err;
  }
}

module.exports = {
  SENSITIVE_PATTERNS,
  MAX_CUSTOM_PATTERNS,
  MAX_CUSTOM_BYTES,
  isSensitive,
  isNoise,
  isHidden,
  assertNotSensitive,
  customRuleStatus,
  resetCustomPatternCache,
  toPosix
};
