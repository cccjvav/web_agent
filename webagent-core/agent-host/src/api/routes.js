const express = require('express');
const path = require('path');
const fs = require('fs');
const { config, generateNewSecret } = require('../config');
const { getToolList, callTool, runMultiModelConsensus } = require('../tools');
const { getTaskState, resetTaskState } = require('../tools/progressTracker');
const { resolveSafePath, computeHash } = require('../tools/patchEngine');
const { runChat } = require('../agent/runChat');
const { listRemoteModels } = require('../agent/providers');
const store = require('../models/store');
const { loadCustom, patchCustom } = require('../models/customizations');
const { detectEnvironment, detectTechStack } = require('../models/profile');
const { listSkills } = require('../tools/skills');
const eventBus = require('../utils/eventBus');
const { snapshot: mcpSnapshot, reset: mcpReset } = require('../mcp/session');
const { resetHashes, rememberHash } = require('../tools/readCache');
const { getBootstrapPrompt } = require('../mcp/instructions');
const { listClients } = require('../mcp/clients');
const oauth = require('../mcp/oauth');
const tunnel = require('../tunnel/cloudflared');

const router = express.Router();

function publicOrigin(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || `127.0.0.1:${config.workbenchPort}`).split(',')[0].trim();
  return `${proto}://${host}`;
}

function mcpOrigin(req) {
  if (config.publicTunnelUrl) return String(config.publicTunnelUrl).replace(/\/$/, '');
  return publicOrigin(req);
}

function mcpInfo(req) {
  const origin = mcpOrigin(req);
  const mcpPath = `/mcp/${config.secretKey}`;
  const mcpUrl = `${origin}${mcpPath}`;
  const mcpCanonicalUrl = `${origin}/mcp`;
  const urls = { mcpUrl, mcpCanonicalUrl };
  return {
    secretKey: config.secretKey,
    mcpPath,
    mcpUrl,
    mcpCanonicalUrl,
    prompt: getBootstrapPrompt(mcpUrl),
    clients: listClients(urls),
    pairing: oauth.snapshotPairing(),
    tunnel: tunnel.snapshot()
  };
}

router.get('/status', (req, res) => {
  const cfg = store.load();
  res.json({
    status: 'online',
    version: config.version,
    serverName: config.serverName,
    productName: config.productName,
    port: config.port,
    workbenchPort: config.workbenchPort,
    workspaceRoot: config.workspaceRoot,
    installId: config.installId,
    tools: getToolList(),
    taskState: getTaskState(),
    recentLogs: eventBus.getRecentLogs(40),
    bridgeRunning: config.bridgeRunning,
    tunnelProvider: cfg.bridge.tunnelProvider,
    ...mcpInfo(req),
    models: cfg.models.map((m) => ({
      id: m.id,
      name: m.name,
      protocol: m.protocol,
      modelId: m.modelId,
      baseUrl: m.baseUrl,
      hasKey: Boolean(m.apiKey)
    })),
    activeModelId: cfg.activeModelId,
    multiModel: cfg.multiModel,
    bridgeAccount: {
      loggedIn: cfg.bridge.loggedIn,
      provider: cfg.bridge.provider,
      username: cfg.bridge.username,
      license: cfg.bridge.license,
      deviceAuthorized: cfg.bridge.deviceAuthorized
    },
    mcpSession: mcpSnapshot()
  });
});

router.post('/bridge/reset-secret', (req, res) => {
  const oldSecret = config.secretKey;
  generateNewSecret();
  oauth.revokeAll();
  eventBus.broadcast('secret_rotated', { oldSecret, newSecret: config.secretKey });
  res.json({ success: true, ...mcpInfo(req) });
});

router.post('/bridge/start', async (req, res) => {
  const cfg = store.load();
  if (!cfg.bridge.loggedIn || !cfg.bridge.deviceAuthorized) {
    return res.status(403).json({ success: false, error: '需要先点本机演示授权。Chat 不受影响。源码没有接 GitHub OAuth。' });
  }
  const provider = (req.body && req.body.tunnelProvider) || cfg.bridge.tunnelProvider || 'cloudflare';
  store.patch({ bridge: { tunnelProvider: provider } });
  config.bridgeRunning = true;
  config.tunnelProvider = provider;
  oauth.ensurePairing();

  let tunnelError = null;
  if (provider === 'cloudflare') {
    try {
      await tunnel.startQuickTunnel({ port: config.port });
    } catch (err) {
      tunnelError = err && err.message ? err.message : String(err);
    }
  }

  const info = mcpInfo(req);
  const tunnelUrl = info.tunnel && info.tunnel.url;
  let note;
  if (tunnelUrl) {
    note = `Quick Tunnel 已就绪：${tunnelUrl}`;
  } else if (tunnelError) {
    note = `${tunnelError} MCP 暂走当前页面源（本机预览可用）。`;
  } else {
    note = '未启动 Quick Tunnel（仅 cloudflare 会拉起 cloudflared）。MCP 走当前页面源。';
  }

  eventBus.broadcast('bridge_started', { provider, tunnelUrl: tunnelUrl || null, tunnelError });
  res.json({
    success: true,
    running: true,
    provider,
    tunnelError,
    note,
    ...info
  });
});

router.post('/bridge/stop', (req, res) => {
  tunnel.stopTunnel();
  config.bridgeRunning = false;
  eventBus.broadcast('bridge_stopped', {});
  res.json({ success: true, running: false, ...mcpInfo(req) });
});

router.post('/bridge/reset-round', (req, res) => {
  const mcpSession = mcpReset();
  resetHashes();
  eventBus.broadcast('bridge_round_reset', {});
  res.json({ success: true, mcpSession });
});

router.post('/consensus/run', async (req, res) => {
  const { taskDescription } = req.body || {};
  try {
    const result = await runMultiModelConsensus({ taskDescription });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/tool/call', async (req, res) => {
  const { name, arguments: toolArgs, mode = 'code' } = req.body || {};
  try {
    eventBus.broadcast('tool_call_start', { tool: name, args: toolArgs, source: `Chat-${mode}` });
    const result = await callTool(name, toolArgs, mode);
    eventBus.broadcast('tool_call_end', { tool: name, success: true, result });
    res.json({ success: true, result });
  } catch (err) {
    eventBus.broadcast('tool_call_end', { tool: name, success: false, error: err.message });
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/chat', async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const emit = (type, data = {}) => {
    res.write(`${JSON.stringify({ type, ...data })}\n`);
  };

  try {
    await runChat({
      mode: req.body && req.body.mode,
      message: req.body && req.body.message,
      history: (req.body && req.body.history) || [],
      emit
    });
    emit('done', {});
  } catch (err) {
    emit('error', { message: err.message });
  }
  res.end();
});

router.post('/tasks/reset', (req, res) => {
  res.json({ success: true, taskState: resetTaskState() });
});

router.get('/files/tree', async (req, res) => {
  try {
    const tree = await callTool('list_directory', { dirPath: '.', recursive: true, maxDepth: 5 }, 'ask');
    res.json(tree);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/files/content', (req, res) => {
  try {
    const filePath = String(req.query.path || '');
    const full = resolveSafePath(filePath);
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      return res.status(404).json({ error: 'not found' });
    }
    const content = fs.readFileSync(full, 'utf8');
    const hash = computeHash(content);
    rememberHash(filePath, hash);
    res.json({
      path: filePath,
      content,
      hash,
      size: content.length
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/files/content', async (req, res) => {
  try {
    const filePath = req.body && req.body.path;
    const content = req.body && req.body.content;
    if (!filePath || typeof content !== 'string') {
      return res.status(400).json({ error: 'path and content required' });
    }
    const result = await callTool('write_file', {
      filePath,
      content,
      confirm_overwrite: true,
      expectedHash: req.body.expectedHash || undefined
    }, 'code');
    res.json({ success: true, path: filePath, hash: result.hash });
  } catch (err) {
    const stale = err.code === 'E_STALE_FILE' || /STALE_FILE/.test(String(err.message || ''));
    res.status(stale ? 409 : 400).json({
      error: err.message,
      code: err.code,
      detail: err.detail
    });
  }
});

router.get('/skills', (req, res) => {
  const roots = [
    path.join(config.workspaceRoot, '.webagent', 'skills'),
    path.join(config.workspaceRoot, 'skills')
  ];
  const skills = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      const dir = path.join(root, name);
      const skillMd = path.join(dir, 'SKILL.md');
      if (fs.existsSync(skillMd)) {
        skills.push({
          name,
          path: path.relative(config.workspaceRoot, dir),
          preview: fs.readFileSync(skillMd, 'utf8').slice(0, 400)
        });
      }
    }
  }
  res.json({ skills });
});

router.post('/providers/probe', async (req, res) => {
  const body = req.body || {};
  try {
    const models = await listRemoteModels(body.baseUrl, body.apiKey);
    res.json({ success: true, models });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/models', (req, res) => {
  const cfg = store.load();
  res.json({
    activeModelId: cfg.activeModelId,
    models: cfg.models.map((m) => ({ ...m, apiKey: m.apiKey ? '••••' : '' })),
    multiModel: cfg.multiModel
  });
});

router.post('/models', (req, res) => {
  const body = req.body || {};
  const cfg = store.load();
  if (body.activeModelId) cfg.activeModelId = body.activeModelId;
  if (Array.isArray(body.models)) cfg.models = body.models;
  if (body.model) {
    const idx = cfg.models.findIndex((m) => m.id === body.model.id);
    if (idx >= 0) cfg.models[idx] = { ...cfg.models[idx], ...body.model };
    else cfg.models.push(body.model);
  }
  if (body.multiModel) cfg.multiModel = { ...cfg.multiModel, ...body.multiModel };
  store.save(cfg);
  res.json({ success: true, activeModelId: cfg.activeModelId });
});

router.get('/logs', (req, res) => {
  res.json({ logs: eventBus.getRecentLogs(80) });
});

router.get('/profile/detect', (req, res) => {
  res.json({
    environment: detectEnvironment(),
    techStack: detectTechStack(),
    skills: listSkills()
  });
});

router.get('/customizations', (req, res) => {
  res.json(loadCustom());
});

router.put('/customizations', (req, res) => {
  const body = req.body || {};
  const next = patchCustom(body);
  res.json({ success: true, customizations: next });
});

router.post('/skills', async (req, res) => {
  const name = String((req.body && req.body.name) || '')
    .trim()
    .replace(/[^\w\-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  if (!name) return res.status(400).json({ error: 'name required' });
  const content = String((req.body && req.body.content) || `# Skill: ${name}\n\n把路径告诉模型就会用。\n`);
  const filePath = `.webagent/skills/${name}/SKILL.md`;
  try {
    await callTool('write_file', { filePath, content, confirm_overwrite: true }, 'code');
    res.json({ success: true, path: `.webagent/skills/${name}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/bridge/login', (req, res) => {
  store.patch({
    bridge: {
      loggedIn: true,
      provider: 'local-demo',
      username: 'local',
      license: 'local-demo',
      deviceAuthorized: true
    }
  });
  res.json({ success: true, demo: true, provider: 'local-demo', username: 'local' });
});

router.post('/bridge/logout', (req, res) => {
  store.patch({ bridge: { loggedIn: false, username: '', deviceAuthorized: false } });
  tunnel.stopTunnel();
  config.bridgeRunning = false;
  res.json({ success: true });
});

module.exports = router;
