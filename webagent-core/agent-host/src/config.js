const path = require('path');
const crypto = require('crypto');

const workspaceRoot = path.resolve(
  process.env.WORKSPACE_ROOT || path.join(__dirname, '../../../workspace')
);

const config = {
  port: parseInt(process.env.AGENT_HOST_PORT || '48271', 10),
  workbenchPort: parseInt(process.env.WORKBENCH_PORT || '3000', 10),
  host: '0.0.0.0',
  workspaceRoot,
  secretKey: crypto.randomBytes(12).toString('hex'),
  version: '0.6.9',
  serverName: 'WebAgent-AgentHost',
  productName: 'Web Agent',
  tunnelProvider: 'cloudflare',
  publicTunnelUrl: null,
  bridgeRunning: false,
  installId: crypto.randomBytes(8).toString('hex')
};

function generateNewSecret() {
  config.secretKey = crypto.randomBytes(12).toString('hex');
  try {
    require('./models/store').patch({ secretKey: config.secretKey });
  } catch (_) {}
  return config.secretKey;
}

function persistIdentity(store) {
  const saved = store.load();
  if (saved.secretKey) config.secretKey = saved.secretKey;
  else store.patch({ secretKey: config.secretKey });
  if (saved.installId) config.installId = saved.installId;
  else store.patch({ installId: config.installId });
}

module.exports = {
  config,
  generateNewSecret,
  persistIdentity
};
