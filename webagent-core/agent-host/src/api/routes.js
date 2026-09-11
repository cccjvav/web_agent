const { readBoundedText, MAX_TEXT_BYTES } = require('../utils/boundedFile');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { config, generateNewSecret } = require('../config');
const { getToolList, callTool, runMultiModelConsensus } = require('../tools');
const { getTaskState, resetTaskState } = require('../tools/progressTracker');
const { resolveSafePath, computeHash } = require('../tools/patchEngine');
const { runChat } = require('../agent/runChat');
const planRound = require('../tools/planRound');
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
const ngrok = require('../tunnel/ngrok');
const github = require('../auth/github');
const tracker = require('../usage/tracker');
const ptyJobs = require('../tools/ptyJobs');
const { runWithSignal } = require('../utils/requestScope');

const router = express.Router();
let bridgeGeneration = 0;

function publicOrigin(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || `127.0.0.1:${config.workbenchPort}`).split(',')[0].trim();
  return `${proto}://${host}`;
}

function mcpOrigin(req) {
  if (config.publicTunnelUrl) return String(config.publicTunnelUrl).replace(/\/$/, '');
  return `http://127.0.0.1:${config.port}`;
}

function isNamedTunnelProvider(provider) {
  return provider === 'cloudflare-named' || provider === 'named';
}

function isNgrokProvider(provider) {
  return provider === 'ngrok';
}

function recentToolLogs(limit = 12) {
  return eventBus.getRecentLogs(40)
    .filter((e) => e.type === 'tool_call_end')
    .slice(0, Math.max(1, Math.min(40, Number(limit) || 12)))
    .map((e) => ({
      type: e.type,
      timestamp: e.timestamp,
      payload: {
        tool: e.payload && e.payload.tool,
        success: e.payload && e.payload.success,
        durationMs: e.payload && e.payload.durationMs
      }
    }));
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
    tools: getToolList().map(({ name, description }) => ({ name, description })),
    taskState: getTaskState(),
    recentLogs: recentToolLogs(12),
    bridgeRunning: config.bridgeRunning,
    tunnelProvider: cfg.bridge.tunnelProvider,
    namedDomain: cfg.bridge.namedDomain || '',
    ngrokDomain: cfg.bridge.ngrokDomain || '',
    ...mcpInfo(req),
    // Workbench paintProviderTable reads GET /api/status.models (not /api/models).
    // Keep display fields; never send apiKey (hasKey only).
    models: cfg.models.map((m) => ({
      id: m.id,
      name: m.name,
      protocol: m.protocol,
      modelId: m.modelId,
      baseUrl: m.baseUrl,
      hasKey: Boolean(m.apiKey),
      group: m.group || '',
      contextSize: m.contextSize || '',
      caps: Array.isArray(m.caps) ? m.caps : [],
      vision: Boolean(m.vision),
      pricing: m.pricing || ''
    })),
    activeModelId: cfg.activeModelId,
    multiModel: cfg.multiModel,
    planRound: planRound.snapshot(),
    bridgeAccount: {
      loggedIn: cfg.bridge.loggedIn,
      provider: cfg.bridge.provider,
      username: cfg.bridge.username,
      githubId: cfg.bridge.githubId || '',
      license: cfg.bridge.license,
      deviceAuthorized: cfg.bridge.deviceAuthorized
    },
    githubAuth: {
      deviceAvailable: github.deviceAvailable()
    },
    usage: tracker.snapshot(),
    mcpSession: mcpSnapshot()
  });
});

router.post('/bridge/reset-secret', (req, res) => {
  generateNewSecret();
  oauth.revokeAll();
  eventBus.broadcast('secret_rotated', { rotated: true });
  res.json({ success: true, ...mcpInfo(req) });
});

router.post('/bridge/start', async (req, res) => {
  const bridgeTicket = ++bridgeGeneration;
  const cfg = store.load();
  if (!cfg.bridge.loggedIn || !cfg.bridge.deviceAuthorized) {
    return res.status(403).json({ success: false, error: '需要先点本机演示授权或完成 GitHub 验证。Chat 不受影响。' });
  }
  const body = req.body || {};
  const provider = body.tunnelProvider || cfg.bridge.tunnelProvider || 'cloudflare';
  const named = isNamedTunnelProvider(provider);
  const ngrokProv = isNgrokProvider(provider);
  const namedDomain = String(body.namedDomain != null ? body.namedDomain : (cfg.bridge.namedDomain || '')).trim();
  const bodyToken = String(body.namedToken || '').trim();
  const namedToken = bodyToken || String(cfg.bridge.namedToken || '').trim();
  const ngrokDomain = String(body.ngrokDomain != null ? body.ngrokDomain : (cfg.bridge.ngrokDomain || '')).trim();
  const bodyNgrokTok = String(body.ngrokToken || '').trim();
  const ngrokToken = bodyNgrokTok || String(cfg.bridge.ngrokToken || '').trim();
  const bridgePatch = { tunnelProvider: provider, namedDomain, ngrokDomain };
  if (bodyToken) bridgePatch.namedToken = bodyToken;
  if (bodyNgrokTok) bridgePatch.ngrokToken = bodyNgrokTok;
  store.patch({ bridge: bridgePatch });
  config.bridgeRunning = false;
  config.publicTunnelUrl = null;
  config.tunnelProvider = provider;
  oauth.ensurePairing();

  let tunnelError = null;
  try { await tunnel.stopTunnel(); } catch (err) { tunnelError = err.message; }
  if (bridgeTicket !== bridgeGeneration) return res.status(409).json({ success: false, running: false, error: 'Bridge start superseded' });
  if (!tunnelError && provider === 'cloudflare') {
    try {
      await tunnel.startQuickTunnel({ port: config.port });
    } catch (err) {
      tunnelError = err && err.message ? err.message : String(err);
    }
  } else if (!tunnelError && named) {
    try {
      await tunnel.startNamedTunnel({
        hostname: namedDomain,
        token: namedToken,
        port: config.port
      });
    } catch (err) {
      tunnelError = err && err.message ? err.message : String(err);
    }
  } else if (!tunnelError && ngrokProv) {
    try {
      await ngrok.startNgrokTunnel({
        hostname: ngrokDomain,
        token: ngrokToken,
        port: config.port
      });
    } catch (err) {
      tunnelError = err && err.message ? err.message : String(err);
    }
  }

  if (bridgeTicket !== bridgeGeneration) return res.status(409).json({ success: false, running: false, error: 'Bridge start superseded by a newer request' });
  const info = mcpInfo(req);
  const tunnelUrl = !tunnelError && config.publicTunnelUrl;
  config.bridgeRunning = Boolean(tunnelUrl);
  let note;
  if (tunnelUrl) {
    note = named
      ? `Named Tunnel 已就绪：${tunnelUrl}`
      : (ngrokProv ? `ngrok 已就绪：${tunnelUrl}` : `Quick Tunnel 已就绪：${tunnelUrl}`);
  } else if (tunnelError) {
    note = `${tunnelError} 远程Bridge未就绪；MCP仅可通过本机48271端口访问。`;
  } else if (named) {
    note = '未启动 Named Tunnel。MCP仅可通过本机48271端口访问。';
  } else if (ngrokProv) {
    note = '未启动 ngrok。MCP仅可通过本机48271端口访问。';
  } else {
    note = '未启动 Quick Tunnel（cloudflare / Named Tunnel / ngrok 才会拉起对应进程）。MCP仅可通过本机48271端口访问。';
  }

  eventBus.broadcast(config.bridgeRunning ? 'bridge_started' : 'bridge_failed', { provider, tunnelUrl: tunnelUrl || null, tunnelError });
  res.json({
    success: config.bridgeRunning,
    running: config.bridgeRunning,
    provider,
    tunnelError,
    note,
    ...info
  });
});

router.post('/bridge/stop', async (req, res) => {
  bridgeGeneration++;
  await tunnel.stopTunnel();
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
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, 5 * 60 * 1000);
  const disconnected = () => { if (!res.writableEnded) abort(); };
  req.on('aborted', abort);
  res.on('close', disconnected);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const emit = (type, data = {}) => {
    if (!res.destroyed && !res.writableEnded) res.write(`${JSON.stringify({ type, ...data })}\n`);
  };

  const client = String((req.body && req.body.client) || '');
  const pty = client === 'vscode-extension';
  try {
    await runWithSignal(controller.signal, () => ptyJobs.runWithPty({ pty, remote: false, emit }, async () => {
      await runChat({
        mode: req.body && req.body.mode,
        message: req.body && req.body.message,
        history: (req.body && req.body.history) || [],
        modelId: req.body && req.body.modelId,
        thinkLevel: req.body && req.body.thinkLevel,
        planAction: req.body && req.body.planAction,
        emit
      });
    }));
    emit('done', {});
  } catch (err) {
    emit('error', { message: err.message });
  }
  clearTimeout(timeout);
  req.off('aborted', abort);
  res.off('close', disconnected);
  if (!res.destroyed) res.end();
});

router.post('/pty/hello', (req, res) => {
  if (!ptyJobs.noteClient(req.body)) return res.status(409).json({ ok: false, error: 'workspace/client mismatch' });
  res.json({ ok: true, ...ptyJobs.snapshot() });
});

router.get('/pty/jobs', (req, res) => {
  if (!ptyJobs.noteClient(req.query)) return res.status(409).json({ ok: false, error: 'workspace/client mismatch' });
  res.json({ jobs: ptyJobs.listPending(req.query.clientId), ...ptyJobs.snapshot() });
});

router.post('/pty/jobs/:jobId', (req, res) => {
  if (!ptyJobs.noteClient(req.body)) return res.status(409).json({ ok: false, error: 'workspace/client mismatch' });
  const out = ptyJobs.report(req.params.jobId, req.body || {}, req.body.clientId);
  if (!out) return res.status(404).json({ ok: false, error: 'unknown job' });
  res.json({ ok: true, ...out });
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
    const content = readBoundedText(full);
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
  res.json({
    skills: listSkills().map(({ name, path: p, preview, skillFile, skillFileAbs }) => ({
      name,
      path: p,
      preview,
      skillFile,
      skillFileAbs
    }))
  });
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
      githubId: '',
      license: 'local-demo',
      deviceAuthorized: true
    }
  });
  res.json({ success: true, demo: true, provider: 'local-demo', username: 'local' });
});

router.post('/bridge/token', async (req, res) => {
  try {
    const out = await github.loginWithToken((req.body && req.body.token) || '');
    res.json(out);
  } catch (err) {
    res.status(err.status || 400).json({ success: false, error: err.message });
  }
});

router.post('/bridge/device', async (req, res) => {
  try {
    const out = await github.startDeviceLogin();
    res.json({ success: true, ...out });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, error: err.message, code: err.code });
  }
});

router.post('/bridge/device/poll', async (req, res) => {
  try {
    const out = await github.pollDeviceLogin();
    res.json(out);
  } catch (err) {
    res.status(err.status || 400).json({ success: false, error: err.message });
  }
});

router.post('/bridge/github/clear', (req, res) => {
  github.clearGithubKeepDemo();
  res.json({ success: true, provider: 'local-demo', username: 'local' });
});

router.post('/bridge/logout', async (req, res) => {
  bridgeGeneration++;
  github.resetPending();
  store.patch({
    bridge: {
      loggedIn: false,
      username: '',
      githubId: '',
      deviceAuthorized: false,
      provider: 'local-demo'
    }
  });
  await tunnel.stopTunnel();
  config.bridgeRunning = false;
  res.json({ success: true });
});

module.exports = router;
