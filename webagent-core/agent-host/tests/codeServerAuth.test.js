const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveAuth, trustedOrigins } = require('../../scripts/codeServerAuth');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-cs-auth-'));

try {
  assert.strictEqual(trustedOrigins(3000), 'http://127.0.0.1:3000,http://localhost:3000');
  assert.strictEqual(trustedOrigins(8080), 'http://127.0.0.1:8080,http://localhost:8080');

  const first = resolveAuth({ userData: tmp, env: {} });
  assert.strictEqual(first.mode, 'password');
  assert.ok(first.password && first.password.length >= 8);
  assert.ok(fs.existsSync(first.passwordFile));
  assert.ok(fs.readFileSync(first.passwordFile, 'utf8').includes(first.password));

  const again = resolveAuth({ userData: tmp, env: {} });
  assert.strictEqual(again.password, first.password);

  const chosen = resolveAuth({ userData: tmp, env: { CODE_SERVER_PASSWORD: 'my-local-pass' } });
  assert.strictEqual(chosen.mode, 'password');
  assert.strictEqual(chosen.password, 'my-local-pass');

  const off = resolveAuth({ userData: tmp, env: { CODE_SERVER_AUTH: 'none' } });
  assert.strictEqual(off.mode, 'none');
  assert.strictEqual(off.password, null);

  console.log('codeServerAuth tests passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
