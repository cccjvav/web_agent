const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function trustedOrigins(port) {
  const p = Number(port) || 3000;
  return `http://127.0.0.1:${p},http://localhost:${p}`;
}

function resolveAuth({ userData, env = process.env } = {}) {
  const mode = String(env.CODE_SERVER_AUTH || 'password').trim().toLowerCase();
  if (mode === 'none') {
    return { mode: 'none', password: null, passwordFile: null };
  }

  const dir = userData || path.join(__dirname, '../../.local/share/code-server');
  const passwordFile = path.join(dir, 'webagent-password');
  const fromEnv = String(env.CODE_SERVER_PASSWORD || '').trim();
  if (fromEnv) {
    return { mode: 'password', password: fromEnv, passwordFile };
  }

  let existing = '';
  try {
    existing = fs.readFileSync(passwordFile, 'utf8').trim();
  } catch (_) {}
  if (existing) {
    return { mode: 'password', password: existing, passwordFile };
  }

  const password = crypto.randomBytes(12).toString('base64url');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(passwordFile, `${password}\n`, { encoding: 'utf8', mode: 0o600 });
  return { mode: 'password', password, passwordFile };
}

module.exports = { trustedOrigins, resolveAuth };
