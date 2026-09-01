const path = require('path');
const crypto = require('crypto');

// Default workspace is workspace_demo
const defaultWorkspace = path.resolve(__dirname, '../workspace_demo');

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: '0.0.0.0',
  workspaceRoot: process.env.WORKSPACE_ROOT || defaultWorkspace,
  secretKey: crypto.randomBytes(12).toString('hex'), // Initial secret path
  tunnelProvider: 'quick', // 'quick' (Cloudflare) | 'named' | 'ngrok' | 'local'
  tunnelUrl: null,
  version: '0.6.9',
  serverName: 'ShunCode-Bridge',
  timeoutMs: 30000,
  maxCommandTimeout: 60000,
  allowShellExecution: true,
  autoApprove: true
};

function generateNewSecret() {
  config.secretKey = crypto.randomBytes(12).toString('hex');
  return config.secretKey;
}

function setWorkspaceRoot(newRoot) {
  config.workspaceRoot = path.resolve(newRoot);
}

module.exports = {
  config,
  generateNewSecret,
  setWorkspaceRoot
};
