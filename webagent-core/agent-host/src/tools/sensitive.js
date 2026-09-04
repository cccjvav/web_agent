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
  '.webagent/config.json'
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

function toPosix(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function globMatch(pattern, rel) {
  const p = toPosix(pattern);
  const r = toPosix(rel);
  if (!r || r === '.') return false;
  if (p.endsWith('/')) {
    const dir = p.slice(0, -1);
    return r === dir || r.startsWith(`${dir}/`);
  }
  const re = new RegExp(
    `^${p
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '::DS::')
      .replace(/\*/g, '[^/]*')
      .replace(/::DS::/g, '.*')}$`
  );
  const base = r.split('/').pop();
  return re.test(r) || re.test(base);
}

function loadCustomPatterns() {
  const file = path.join(config.workspaceRoot, '.webagentignore');
  try {
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

function isSensitive(relPath) {
  const rel = toPosix(relPath);
  const base = rel.split('/').pop();
  if (SENSITIVE_EXCEPTIONS.includes(base)) return false;
  for (const pat of SENSITIVE_PATTERNS) {
    if (globMatch(pat, rel)) return true;
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
  isSensitive,
  isNoise,
  isHidden,
  assertNotSensitive,
  toPosix
};
