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
const eventBus = require('../utils/eventBus');
const { snapshot: mcpSnapshot } = require('../mcp/session');
const { getBootstrapPrompt } = require('../mcp/instructions');
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
  return {
    secretKey: config.secretKey,
    mcpPath,
    mcpUrl: `${origin}${mcpPath}`,
    prompt: getBootstrapPrompt(`${origin}${mcpPath}`),
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
  eventBus.broadcast('secret_rotated', { oldSecret, newSecret: config.secretKey });
  res.json({ success: true, ...mcpInfo(req) });
});

router.post('/bridge/start', (req, res) => {
  const cfg = store.load();
  if (!cfg.bridge.loggedIn || !cfg.bridge.deviceAuthorized) {
    return res.status(403).json({ success: false, error: '需要先登录并确认当前设备已授权。Chat 模式不受影响。' });
  }
  const provider = (req.body && req.body.tunnelProvider) || cfg.bridge.tunnelProvider || 'cloudflare';
  store.patch({ bridge: { tunnelProvider: provider } });
  config.bridgeRunning = true;
  config.tunnelProvider = provider;
  eventBus.broadcast('bridge_started', { provider });
  res.json({
    success: true,
    running: true,
    provider,
    note: '本复现环境将 MCP 挂在同一预览域名上（无需 cloudflared）。桌面版可选 Quick / Named / ngrok 三种隧道。',
    ...mcpInfo(req)
  });
});

router.post('/bridge/stop', (req, res) => {
  config.bridgeRunning = false;
  eventBus.broadcast('bridge_stopped', {});
  res.json({ success: true, running: false });
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
    res.json({
      path: filePath,
      content,
      hash: computeHash(content),
      size: content.length
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/files/content', (req, res) => {
  try {
    const filePath = req.body && req.body.path;
    const content = req.body && req.body.content;
    if (!filePath || typeof content !== 'string') {
      return res.status(400).json({ error: 'path and content required' });
    }
    const full = resolveSafePath(filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
    eventBus.broadcast('file_written', { filePath, hash: computeHash(content) });
    res.json({ success: true, path: filePath, hash: computeHash(content) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/skills', (req, res) => {
  const roots = [
    path.join(config.workspaceRoot, '.shuncode', 'skills'),
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

router.get('/customizations', (req, res) => {
  res.json(loadCustom());
});

router.put('/customizations', (req, res) => {
  const body = req.body || {};
  const next = patchCustom(body);
  res.json({ success: true, customizations: next });
});

router.post('/skills', (req, res) => {
  const name = String((req.body && req.body.name) || '')
    .trim()
    .replace(/[^\w\-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  if (!name) return res.status(400).json({ error: 'name required' });
  const content = String((req.body && req.body.content) || `# Skill: ${name}\n\n把路径告诉模型就会用。\n`);
  const dir = path.join(config.workspaceRoot, '.shuncode', 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf8');
  res.json({ success: true, path: path.relative(config.workspaceRoot, dir) });
});

router.post('/bridge/login', (req, res) => {
  const provider = (req.body && req.body.provider) || 'github';
  const username = (req.body && req.body.username) || 'demo';
  store.patch({
    bridge: {
      loggedIn: true,
      provider,
      username,
      license: '永久顺',
      deviceAuthorized: true
    }
  });
  res.json({ success: true, username, provider });
});

router.post('/bridge/logout', (req, res) => {
  store.patch({ bridge: { loggedIn: false, username: '', deviceAuthorized: false } });
  tunnel.stopTunnel();
  config.bridgeRunning = false;
  res.json({ success: true });
});

module.exports = router;
