const path = require('path');
const crypto = require('crypto');

const config = {
  port: parseInt(process.env.AGENT_HOST_PORT || '48271', 10),
  host: '0.0.0.0',
  workspaceRoot: process.env.WORKSPACE_ROOT || path.resolve('/home/user/workspace'),
  secretKey: crypto.randomBytes(12).toString('hex'),
  version: '0.6.9',
  serverName: 'ShunCode-AgentHost',
  tunnelProvider: 'quick',
  publicTunnelUrl: null
};

function generateNewSecret() {
  config.secretKey = crypto.randomBytes(12).toString('hex');
  return config.secretKey;
}

module.exports = {
  config,
  generateNewSecret
};
