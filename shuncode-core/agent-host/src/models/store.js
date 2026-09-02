const fs = require('fs');
const path = require('path');
const { config } = require('../config');

function dir() {
  return path.join(config.workspaceRoot, '.shuncode');
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
        modelId: 'shuncode-explore'
      }
    ],
    multiModel: {
      enabled: true,
      mergeModel: 'auto',
      thinkLevel: 'high',
      maxBranches: 3,
      mergeAllowsRead: true
    },
    bridge: {
      loggedIn: true,
      provider: 'github',
      username: 'demo',
      license: '永久顺',
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

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    return {
      ...defaults(),
      ...raw,
      models: Array.isArray(raw.models) && raw.models.length ? raw.models : defaults().models,
      bridge: { ...defaults().bridge, ...(raw.bridge || {}) },
      multiModel: { ...defaults().multiModel, ...(raw.multiModel || {}) }
    };
  } catch {
    return defaults();
  }
}

function save(next) {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function patch(partial) {
  const current = load();
  const next = {
    ...current,
    ...partial,
    bridge: { ...current.bridge, ...(partial.bridge || {}) },
    multiModel: { ...current.multiModel, ...(partial.multiModel || {}) },
    models: partial.models || current.models
  };
  return save(next);
}

module.exports = { load, save, patch, defaults };
