const editorUndo = require('../utils/editorUndo');
const fileCheckpoints = require('../utils/fileCheckpoints');
const control = require('../utils/executionControl');
const { isToolFailure } = require('../utils/toolTrace');
const {assertWorkspaceBinding} = require('../utils/workspaceBinding');
const probeBridge = require('../utils/probeBridge');
const operatorQueue = require('../utils/operatorQueue');
const externalClient = require('../mcp/externalClient');
const workflows = require('../tools/workflows');
const { diagnostics, hostIdentity } = require('../utils/hostDiagnostics');
const { readBoundedText, MAX_TEXT_BYTES } = require('../utils/boundedFile');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { config, generateNewSecret } = require('../config');
const { getToolList, callTool, runMultiModelConsensus } = require('../tools');
const { getTaskState, getBridgeTaskStates, resetTaskState } = require('../tools/progressTracker');
const { resolveSafePath, computeHash } = require('../tools/patchEngine');
const { runChat } = require('../agent/runChat');
const planRound = require('../tools/planRound');
const { listRemoteModels, addProvider } = require('../agent/providers');
const store = require('../models/store');
const { publicModel, publicMultiModel, updateModelSettings } = require('../models/modelSettings');
const { loadCustom, patchCustom } = require('../models/customizations');
const { detectEnvironment, detectTechStack } = require('../models/profile');
const { listSkills, discoverSkills } = require('../tools/skills');
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
  return eventBus.getBridgeActivity().logs
    .slice(0, Math.max(1, Math.min(40, Number(limit) || 12)))
    .map(record => ({ type: 'tool_call_end', timestamp: record.timestamp,
      payload: { tool: record.tool, success: record.success, durationMs: record.durationMs } }));
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

function operationApi(handler) {
  return async (req, res) => {
    try { res.json(await handler(req)); }
    catch (error) { res.status(400).json({ ok: false, error: error.message }); }
  };
}

const BRIDGE_START_FIELDS = ['workspaceRoot', 'hostInstanceId', 'tunnelProvider', 'namedDomain', 'namedToken', 'ngrokDomain', 'ngrokToken'];
const BRIDGE_PROVIDERS = new Set(['cloudflare', 'cloudflare-named', 'named', 'ngrok', 'local']);
function rejectBridgeRequest(res) {
  return res.status(400).json({ success: false, error: 'Bridge请求字段或长度无效', code: 'E_BAD_BRIDGE_REQUEST' });
}
function bridgeRequestBody(req, res, allowed) {
  const body = req.body === undefined ? {} : req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !allowed.includes(key))) {
    rejectBridgeRequest(res);
    return null;
  }
  return body;
}
function validBridgeString(value, maxBytes) {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= maxBytes && !/[\r\n\0]/.test(value);
}
function validOptionalString(body, key, maxBytes) {
  return !Object.hasOwn(body, key) || validBridgeString(body[key], maxBytes);
}
function validBridgeBindingFields(body, withSecret = false) {
  return validOptionalString(body, 'workspaceRoot', 4096)
    && validOptionalString(body, 'hostInstanceId', 256)
    && (!withSecret || validOptionalString(body, 'expectedSecret', 256));
}
function validateBridgeStart(body, cfg) {
  if (!validBridgeBindingFields(body)
    || !validOptionalString(body, 'namedDomain', 512)
    || !validOptionalString(body, 'ngrokDomain', 512)
    || !validOptionalString(body, 'namedToken', 4096)
    || !validOptionalString(body, 'ngrokToken', 4096)) return null;
  const bridge = cfg?.bridge && typeof cfg.bridge === 'object' && !Array.isArray(cfg.bridge) ? cfg.bridge : {};
  const stored = BRIDGE_PROVIDERS.has(bridge.tunnelProvider) ? bridge.tunnelProvider : 'cloudflare';
  const provider = Object.hasOwn(body, 'tunnelProvider') ? body.tunnelProvider : stored;
  if (typeof provider !== 'string' || !BRIDGE_PROVIDERS.has(provider)) return null;
  const providerFields = isNamedTunnelProvider(provider) ? new Set(['namedDomain', 'namedToken'])
    : isNgrokProvider(provider) ? new Set(['ngrokDomain', 'ngrokToken']) : new Set();
  if (['namedDomain', 'namedToken', 'ngrokDomain', 'ngrokToken']
    .some(key => Object.hasOwn(body, key) && !providerFields.has(key))) return null;
  if (isNamedTunnelProvider(provider)) {
    const domain = Object.hasOwn(body, 'namedDomain') ? body.namedDomain : (typeof bridge.namedDomain === 'string' ? bridge.namedDomain : '');
    const requestedToken = Object.hasOwn(body, 'namedToken') ? body.namedToken : '';
    const token = requestedToken.trim() ? requestedToken : (typeof bridge.namedToken === 'string' ? bridge.namedToken : '');
    if (!validBridgeString(domain, 512) || !validBridgeString(token, 4096)) return null;
  }
  if (isNgrokProvider(provider)) {
    const domain = Object.hasOwn(body, 'ngrokDomain') ? body.ngrokDomain : (typeof bridge.ngrokDomain === 'string' ? bridge.ngrokDomain : '');
    const requestedToken = Object.hasOwn(body, 'ngrokToken') ? body.ngrokToken : '';
    const token = requestedToken.trim() ? requestedToken : (typeof bridge.ngrokToken === 'string' ? bridge.ngrokToken : '');
    if (!validBridgeString(domain, 512) || !validBridgeString(token, 4096)) return null;
  }
  return provider;
}
function publicText(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}
function publicBridge(bridge = {}) {
  return {
    tunnelProvider: BRIDGE_PROVIDERS.has(bridge.tunnelProvider) ? bridge.tunnelProvider : 'cloudflare',
    namedDomain: publicText(bridge.namedDomain, 512),
    ngrokDomain: publicText(bridge.ngrokDomain, 512),
    account: {
      loggedIn: bridge.loggedIn === true,
      provider: publicText(bridge.provider, 64),
      username: publicText(bridge.username, 256),
      githubId: publicText(bridge.githubId, 256),
      license: publicText(bridge.license, 64),
      deviceAuthorized: bridge.deviceAuthorized === true
    }
  };
}
router.get('/execution-control', (req, res) => res.json(control.snapshot()));
router.post('/execution-control', (req, res) => {
  try {
    assertWorkspaceBinding(req.body, config);
    if (req.body.permissions !== undefined && req.body.workMode !== undefined) throw Error('模式与权限请分开修改');
    const result = req.body.workMode !== undefined ? control.selectMode(req.body.workMode) : control.updatePermissions(req.body.permissions, req.body.revision);
    eventBus.broadcast('execution_control_changed', result);
    res.json({success:true, ...result});
  } catch(error) { res.status(error.status || 409).json({success:false,error:error.message,code:error.code}); }
});
router.post('/probe/links', operationApi(req => probeBridge.pair(req.body)));
router.get('/probe/links', operationApi(() => probeBridge.list()));
router.get('/probe/links/:id/reports/:tabId', operationApi(req => probeBridge.report(req.params.id, req.params.tabId)));
router.delete('/probe/links/:id', operationApi(req => { probeBridge.drop(req.params.id); return {ok: true}; }));
router.post('/probe/actions', operationApi(req => probeBridge.request(req.body)));
router.get('/checkpoints', operationApi(() => fileCheckpoints.list()));
router.post('/checkpoints', operationApi(req => fileCheckpoints.create(req.body || {})));
router.post('/checkpoints/:id/preview', operationApi(req => fileCheckpoints.preview(req.params.id, req.body || {})));
router.post('/checkpoints/:id/restore', operationApi(req => fileCheckpoints.restore(req.params.id, req.body || {})));
router.post('/checkpoints/:id/remove', operationApi(req => fileCheckpoints.remove(req.params.id, req.body || {})));
router.get('/operations', operationApi(() => ({ requests: operatorQueue.list(), servers: externalClient.list(true) })));
router.get('/operations/:id', operationApi(req => operatorQueue.inspect(req.params.id)));
router.post('/operations/:id/approve', operationApi(req => operatorQueue.approve(req.params.id, req.body?.confirm === true)));
router.post('/operations/:id/cancel', operationApi(req => operatorQueue.cancel(req.params.id)));
router.post('/external/stdio/preview', operationApi(req => externalClient.previewStdio(req.body || {})));
router.post('/external/stdio/start', operationApi(req => externalClient.startStdio(req.body || {})));
router.post('/external/servers', operationApi(req => externalClient.add(req.body || {})));
router.delete('/external/servers/:id', operationApi(req => externalClient.remove(req.params.id)));
router.post('/external/request', operationApi(req => externalClient.request(req.body || {}, { callerKey: 'local' })));
router.post('/workflows/preview', operationApi(req => workflows.previewRequest(req.body || {})));
router.post('/workflows/request', operationApi(req => workflows.request(req.body || {}, { callerKey: 'local' })));

const connectionCheck = require('../utils/connectionCheck');
router.post('/connection-checks', operationApi(req => connectionCheck.create(req.body)));
router.get('/connection-checks/:id', operationApi(req => connectionCheck.inspect(req.params.id)));
router.delete('/connection-checks', operationApi(() => connectionCheck.clear()));

router.get('/diagnostics', (req, res) => res.json(diagnostics()));

router.get('/bridge/activity', (req, res) => res.json(eventBus.getBridgeActivity()));

router.get('/status', (req, res) => {
  const cfg = store.load();
  const bridge = publicBridge(cfg.bridge);
  res.json({
    status: 'online',
    executionControl: control.snapshot(),
    identity: hostIdentity(),
    version: config.version,
    serverName: config.serverName,
    productName: config.productName,
    port: config.port,
    workbenchPort: config.workbenchPort,
    workspaceRoot: config.workspaceRoot,
    installId: config.installId,
    tools: getToolList().map(({ name, description }) => ({ name, description })),
    taskState: getTaskState(),
    bridgeTaskStates: getBridgeTaskStates(),
    recentLogs: recentToolLogs(12),
    bridgeRunning: config.bridgeRunning,
    tunnelProvider: bridge.tunnelProvider,
    namedDomain: bridge.namedDomain,
    ngrokDomain: bridge.ngrokDomain,
    ...mcpInfo(req),
    // Workbench paintProviderTable reads GET /api/status.models (not /api/models).
    // Keep display fields; never send apiKey (hasKey only).
    models: cfg.models.map((storedModel) => {
      const m = publicModel(storedModel);
      return {
        id: m.id,
        name: m.name,
        protocol: m.protocol,
        modelId: m.modelId,
        baseUrl: m.baseUrl,
        hasKey: m.apiKey === '••••',
        group: m.group || '',
        contextSize: m.contextSize || '',
        caps: Array.isArray(m.caps) ? m.caps : [],
        vision: m.vision === true,
        pricing: m.pricing || ''
      };
    }),
    activeModelId: cfg.activeModelId,
    multiModel: publicMultiModel(cfg.multiModel),
    planRound: planRound.snapshot(),
    bridgeAccount: bridge.account,
    githubAuth: {
      deviceAvailable: github.deviceAvailable()
    },
    usage: tracker.snapshot(),
    mcpSession: mcpSnapshot()
  });
});

router.post('/bridge/reset-secret', (req, res) => {
  // New UI requests opt into binding/CAS; an exactly empty legacy call remains compatible.
  const body = bridgeRequestBody(req, res, ['workspaceRoot', 'hostInstanceId', 'expectedSecret']);
  if (!body) return;
  if (!validBridgeBindingFields(body, true)) return rejectBridgeRequest(res);
  if (['workspaceRoot', 'hostInstanceId', 'expectedSecret'].some(key => Object.hasOwn(body, key))) {
    try { assertWorkspaceBinding(body, config); }
    catch (_) { return res.status(409).json({ success: false, error: 'Rotation binding changed; read status first' }); }
    if (typeof body.expectedSecret !== 'string' || body.expectedSecret !== config.secretKey) {
      return res.status(409).json({ success: false, error: 'Rotation state changed; read status first' });
    }
  }
  generateNewSecret();
  oauth.revokeAll();
  eventBus.broadcast('secret_rotated', { rotated: true });
  res.json({ success: true, ...mcpInfo(req) });
});

router.post('/bridge/start', async (req, res) => {
  const body = bridgeRequestBody(req, res, BRIDGE_START_FIELDS);
  if (!body) return;
  if (!validBridgeBindingFields(body)) return rejectBridgeRequest(res);
  try { assertWorkspaceBinding(body, config); }
  catch(error) { return res.status(409).json({success:false,error:error.message}); }
  const cfg = store.load();
  const provider = validateBridgeStart(body, cfg);
  if (!provider) return rejectBridgeRequest(res);
  if (cfg.bridge.loggedIn !== true || cfg.bridge.deviceAuthorized !== true) {
    return res.status(403).json({ success: false, error: '需要先点本机演示授权或完成 GitHub 验证。Chat 不受影响。' });
  }
  try { control.assertIdle(); control.selectMode('bridge'); }
  catch(error) { return res.status(409).json({success:false,error:error.message}); }
  const releaseMode = control.enter('bridge');
  try {
    const bridgeTicket = ++bridgeGeneration;
    const named = isNamedTunnelProvider(provider);
    const ngrokProv = isNgrokProvider(provider);
    const storedNamedDomain = typeof cfg.bridge.namedDomain === 'string' ? cfg.bridge.namedDomain : '';
    const storedNamedToken = typeof cfg.bridge.namedToken === 'string' ? cfg.bridge.namedToken : '';
    const storedNgrokDomain = typeof cfg.bridge.ngrokDomain === 'string' ? cfg.bridge.ngrokDomain : '';
    const storedNgrokToken = typeof cfg.bridge.ngrokToken === 'string' ? cfg.bridge.ngrokToken : '';
    const namedDomain = (Object.hasOwn(body, 'namedDomain') ? body.namedDomain : storedNamedDomain).trim();
    const bodyToken = (Object.hasOwn(body, 'namedToken') ? body.namedToken : '').trim();
    const namedToken = bodyToken || storedNamedToken.trim();
    const ngrokDomain = (Object.hasOwn(body, 'ngrokDomain') ? body.ngrokDomain : storedNgrokDomain).trim();
    const bodyNgrokTok = (Object.hasOwn(body, 'ngrokToken') ? body.ngrokToken : '').trim();
    const ngrokToken = bodyNgrokTok || storedNgrokToken.trim();
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
  } finally { releaseMode(); }
});

router.post('/bridge/stop', async (req, res) => {
  const body = bridgeRequestBody(req, res, ['workspaceRoot', 'hostInstanceId']);
  if (!body) return;
  if (!validBridgeBindingFields(body)) return rejectBridgeRequest(res);
  if (['workspaceRoot', 'hostInstanceId'].some(key => Object.hasOwn(body, key))) {
    try { assertWorkspaceBinding(body, config); }
    catch (_) { return res.status(409).json({success:false, error:'Stop binding changed; read status first'}); }
  }
  bridgeGeneration++;
  await tunnel.stopTunnel();
  config.bridgeRunning = false;
  eventBus.broadcast('bridge_stopped', {});
  res.json({ success: true, running: false, ...mcpInfo(req) });
});

router.post('/bridge/reset-round', (req, res) => {
  if (!bridgeRequestBody(req, res, [])) return;
  const mcpSession = mcpReset();
  resetHashes();
  eventBus.broadcast('bridge_round_reset', {});
  res.json({ success: true, mcpSession });
});

router.post('/consensus/run', async (req, res) => {
  const { taskDescription } = req.body || {};
  try {
    const result = await control.run('chat', () => runMultiModelConsensus({ taskDescription }));
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/tool/call', async (req, res) => {
  const { name, arguments: toolArgs, mode = 'code' } = req.body || {};
  try {
    eventBus.broadcast('tool_call_start', { tool: name, args: toolArgs, source: `Chat-${mode}` });
    const result = await control.run('chat', () => callTool(name, toolArgs, mode));
    const success = !isToolFailure(result);
    eventBus.broadcast('tool_call_end', { tool: name, success, result });
    res.json({ success, result });
  } catch (err) {
    eventBus.broadcast('tool_call_end', { tool: name, success: false, error: err.message });
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/chat', async (req, res) => {
  if(req.body?.client==='vscode-extension'){
    try { assertWorkspaceBinding(req.body, config); }
    catch(error){ return res.status(409).json({success:false,error:error.message}); }
  }
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

// Existing-file editor previews are read-only and bounded; saving rechecks the same hash.
router.post('/files/preview', (req, res) => {
  try {
    const { path: filePath, content, expectedHash } = req.body || {};
    if (typeof filePath !== 'string' || !filePath || typeof content !== 'string' || typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash || '')) return res.status(400).json({ error: 'path, content and expectedHash required' });
    if (Buffer.byteLength(content) > 65536 || content.split('\n').length > 2000) return res.status(413).json({ error: '预览限每份文本64KiB/2000行，请缩小修改或使用桌面编辑器' });
    const full = resolveSafePath(filePath);
    if (!fs.existsSync(full)) return res.status(409).json({ error: '文件已删除，不能预览旧版本', code: 'E_STALE_FILE' });
    const current = readBoundedText(full, 65536);
    const hash = computeHash(current);
    if (hash !== expectedHash) return res.status(409).json({ error: '文件已变化，请保留草稿并核对磁盘', code: 'E_STALE_FILE' });
    if (current.split('\n').length > 2000) return res.status(413).json({ error: '磁盘文件超过预览行数预算' });
    const diff = require('diff').createTwoFilesPatch('a/' + filePath, 'b/' + filePath, current, content, 'disk', 'draft', { timeout: 100, maxEditLength: 4000 });
    if (typeof diff !== 'string' || Buffer.byteLength(diff) > 262144) return res.status(413).json({ error: '差异超过预览预算，未保存' });
    res.json({ success: true, path: filePath, expectedHash: hash, newHash: computeHash(content), diff });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.get('/files/undo/:id', (req, res) => {
  try { res.json(editorUndo.preview(req.params.id)); }
  catch(error) { res.status(409).json({error:error.message}); }
});
router.post('/files/undo/:id', async (req, res) => {
  try {
    assertWorkspaceBinding(req.body, config);
    res.json(await editorUndo.restore(req.params.id, req.body));
  } catch(error) { res.status(409).json({error:error.message}); }
});

router.put('/files/content', async (req, res) => {
  try {
    const filePath = req.body && req.body.path;
    const content = req.body && req.body.content;
    if (!filePath || typeof content !== 'string') {
      return res.status(400).json({ error: 'path and content required' });
    }
    const createOnly = req.body.createOnly === true;
    const undoSnapshot = createOnly ? null : editorUndo.capture(filePath, req.body.expectedHash, content);
    const result = await callTool('write_file', {
      filePath,
      content,
      createOnly,
      confirm_overwrite: !createOnly,
      expectedHash: req.body.expectedHash || undefined
    }, 'code');
    if (result.success === false) return res.status(409).json({ error: result.error, code: result.code, verification: result.verification });
    let undo = null;
    try { if (result.verification?.state === 'verified') undo = editorUndo.remember(undoSnapshot, result.hash); } catch (_) { /* Saved file remains successful even if optional undo allocation fails. */ }
    res.json({ success: true, path: filePath, hash: result.hash, verification: result.verification, undo });
  } catch (err) {
    const conflict = err.code === 'E_FILE_EXISTS' || err.code === 'E_STALE_FILE' || /STALE_FILE/.test(String(err.message || ''));
    res.status(conflict ? 409 : 400).json({
      error: err.message,
      code: err.code,
      detail: err.detail
    });
  }
});

router.get('/skills', (req, res) => res.json(discoverSkills()));

router.get('/skills/load', async (req, res) => {
  try {
    const args = { name: req.query.name, resource: req.query.resource || 'SKILL.md', expectedHash: req.query.expectedHash };
    for (const key of ['offset', 'limit', 'cursor', 'pageSize']) if (req.query[key] != null) args[key] = Number(req.query[key]);
    const result = await callTool('load_skill', args, 'ask');
    res.status(result.found === false ? 404 : 200).json(result);
  } catch (error) { res.status(error.code === 'E_STALE_FILE' ? 409 : 400).json({ error: error.message, code: error.code }); }
});

router.post('/providers/probe', async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !['baseUrl', 'apiKey'].includes(key))
    || !Object.hasOwn(body, 'baseUrl') || !Object.hasOwn(body, 'apiKey')) {
    return res.status(400).json({ success: false, error: '模型发现只接受baseUrl与apiKey', code: 'E_BAD_PROVIDER' });
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  const disconnected = () => { if (!res.writableEnded) abort(); };
  req.on('aborted', abort); res.on('close', disconnected);
  try {
    const models = await runWithSignal(controller.signal, () => listRemoteModels(body.baseUrl, body.apiKey));
    if (!res.destroyed) res.json({ success: true, models });
  } catch (err) {
    if (!res.destroyed) res.status(400).json({ success: false,
      error: err.code === 'E_BAD_PROVIDER' ? err.message : '模型发现失败或超时，请核对Endpoint与凭据',
      code: err.code === 'E_BAD_PROVIDER' ? err.code : 'E_PROVIDER_PROBE' });
  } finally { req.removeListener('aborted', abort); res.removeListener('close', disconnected); }
});

router.get('/models', (req, res) => {
  const cfg = store.load();
  res.json({
    activeModelId: cfg.activeModelId,
    models: cfg.models.map(publicModel),
    multiModel: publicMultiModel(cfg.multiModel)
  });
});

router.post('/models', (req, res) => {
  const body = req.body;
  if (body && typeof body === 'object' && !Array.isArray(body) && Object.hasOwn(body, 'addProvider')) {
    if (Object.keys(body).length !== 1) return res.status(400).json({success:false,error:'addProvider不能与整表替换或其他设置混用',code:'E_BAD_MODEL_SETTINGS'});
    try { return res.json(addProvider(body.addProvider)); }
    catch (error) { return res.status(error.status || 500).json({success:false,error:error.message,code:error.code || 'E_INTERNAL'}); }
  }
  try { return res.json(updateModelSettings(body)); }
  catch (error) { return res.status(error.status || 500).json({ success: false, error: error.message, code: error.code || 'E_INTERNAL' }); }
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
  res.setHeader('Cache-Control', 'no-store');
  try { res.json(loadCustom()); }
  catch (error) { res.status(500).json({ success: false, error: error.message, code: error.code || 'E_INTERNAL' }); }
});

router.put('/customizations', (req, res) => {
  const body = req.body || {};
  try {
    const next = patchCustom(body);
    res.json({ success: true, customizations: next });
  } catch (error) {
    res.status(error.code === 'E_BAD_ARGS' ? 400 : 500).json({ success: false, error: error.message, code: error.code || 'E_INTERNAL' });
  }
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
    const result = await callTool('write_file', { filePath, content, createOnly: true }, 'code');
    if (result?.success !== true || result.verification?.state !== 'verified') {
      return res.status(409).json({ success: false,
        error: result?.error || 'Skill write completion could not be verified; inspect the target before retrying',
        code: result?.code || 'E_VERIFY_UNKNOWN', verification: result?.verification || { state: 'unknown' } });
    }
    res.json({ success: true, path: `.webagent/skills/${name}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/bridge/login', (req, res) => {
  if (!bridgeRequestBody(req, res, [])) return;
  github.clearGithubKeepDemo();
  res.json({ success: true, demo: true, provider: 'local-demo', username: 'local' });
});

router.post('/bridge/token', async (req, res) => {
  const body = bridgeRequestBody(req, res, ['token']);
  if (!body) return;
  if (!validOptionalString(body, 'token', 4096)) return rejectBridgeRequest(res);
  try {
    const out = await github.loginWithToken(body.token || '');
    res.json(out);
  } catch (err) {
    res.status(err.status || 400).json({ success: false, error: err.message });
  }
});

router.post('/bridge/device', async (req, res) => {
  if (!bridgeRequestBody(req, res, [])) return;
  try {
    const out = await github.startDeviceLogin();
    res.json({ success: true, ...out });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, error: err.message, code: err.code });
  }
});

router.post('/bridge/device/poll', async (req, res) => {
  if (!bridgeRequestBody(req, res, [])) return;
  try {
    const out = await github.pollDeviceLogin();
    res.json(out);
  } catch (err) {
    res.status(err.status || 400).json({ success: false, error: err.message });
  }
});

router.post('/bridge/github/clear', (req, res) => {
  if (!bridgeRequestBody(req, res, [])) return;
  github.clearGithubKeepDemo();
  res.json({ success: true, provider: 'local-demo', username: 'local' });
});

router.post('/bridge/logout', async (req, res) => {
  if (!bridgeRequestBody(req, res, [])) return;
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
