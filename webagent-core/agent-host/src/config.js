const path = require('path');
const crypto = require('crypto');
const { productVersion } = require('./extensionVersion');

const workspaceRoot = path.resolve(
  process.env.WORKSPACE_ROOT || path.resolve(__dirname, '../../..')
);

// F98: a mistyped port (`AGENT_HOST_PORT=48271x`, `-1`, `70000`) used to be parseInt'ed and reach
// server.listen as a truncated number, NaN or an out-of-range value, failing there with a Node
// RangeError that never named the variable. Reject it here, by name. 0 stays valid (ephemeral
// port, used by tests and by WEBAGENT_SKIP_WORKBENCH runs).
function portFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const text = String(raw).trim();
  if (!/^\d{1,5}$/.test(text) || Number(text) > 65535) {
    throw new Error(`${name} must be an integer between 0 and 65535, got ${JSON.stringify(raw)}`);
  }
  return Number(text);
}

const config = {
  hostInstanceId: crypto.randomUUID(),
  startedAt: new Date().toISOString(),
  port: portFromEnv('AGENT_HOST_PORT', 48271),
  workbenchPort: portFromEnv('WORKBENCH_PORT', 3000),
  host: process.env.WEBAGENT_BIND || '127.0.0.1',
  workspaceRoot,
  secretKey: crypto.randomBytes(12).toString('hex'),
  version: productVersion(),
  serverName: 'WebAgent-AgentHost',
  productName: 'Web Agent',
  tunnelProvider: 'cloudflare',
  publicTunnelUrl: null,
  bridgeRunning: false,
  installId: crypto.randomBytes(8).toString('hex')
};

function generateNewSecret() {
  const nextSecret = crypto.randomBytes(12).toString('hex');
  // Publish the new runtime credential only after storage accepted it.
  // Do not report a durable rotation when a corrupt/unwritable config refused it.
  require('./models/store').patch({ secretKey: nextSecret });
  config.secretKey = nextSecret;
  return nextSecret;
}

function persistIdentity(store) {
  const saved = store.load();
  if (saved.secretKey) config.secretKey = saved.secretKey;
  else store.patch({ secretKey: config.secretKey });
  if (saved.installId) config.installId = saved.installId;
  else store.patch({ installId: config.installId });
  try {
    if (typeof store.protectWorkspaceSecrets === 'function') store.protectWorkspaceSecrets();
  } catch (_) {}
  try {
    if (typeof store.warnTrackedSecrets === 'function') store.warnTrackedSecrets();
  } catch (_) {}
}

module.exports = {
  config,
  generateNewSecret,
  persistIdentity
};
