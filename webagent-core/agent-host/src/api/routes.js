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

const CHAT_FIELDS = ['mode', 'message', 'history', 'modelId', 'thinkLevel', 'planAction', 'client', 'workspaceRoot', 'hostInstanceId'];
function rejectApiRequest(res) {
  return res.status(400).json({ success: false, error: 'API请求字段或类型无效', code: 'E_BAD_API_REQUEST' });
}
function isRequestRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function fixedRequestRecord(value, res, allowed) {
  const record = value === undefined ? {} : value;
  if (!isRequestRecord(record) || Object.keys(record).some(key => !allowed.includes(key))) {
    rejectApiRequest(res);
    return null;
  }
  return record;
}
function apiRequestBody(req, res, allowed) {
  return fixedRequestRecord(req.body, res, allowed);
}
function apiRequestQuery(req, res, allowed) {
  return fixedRequestRecord(req.query, res, allowed);
}
function apiString(value, maxBytes, { nonEmpty = false, singleLine = false } = {}) {
  return typeof value === 'string'
    && Buffer.byteLength(value, 'utf8') <= maxBytes
    && (!nonEmpty || value.length > 0)
    && (!singleLine || !/[\r\n\0]/.test(value));
}
function apiHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function validChatHistory(history) {
  if (history === undefined) return true;
  if (!Array.isArray(history) || history.length > 12) return false;
  let bytes = 0;
  for (const item of history) {
    if (!isRequestRecord(item)
      || Object.keys(item).some(key => key !== 'role' && key !== 'content')
      || !['user', 'assistant'].includes(item.role)
      || !apiString(item.content, 256 * 1024)) return false;
    bytes += Buffer.byteLength(item.content, 'utf8');
    if (bytes > 1024 * 1024) return false;
  }
  return true;
}
function validChatRequest(body) {
  const mode = Object.hasOwn(body, 'mode') ? body.mode : 'ask';
  if (!['ask', 'plan', 'code'].includes(mode)
    || (Object.hasOwn(body, 'message') && (!apiString(body.message, 1024 * 1024) || body.message.includes('\0')))
    || !validChatHistory(body.history)
    || (Object.hasOwn(body, 'modelId') && !apiString(body.modelId, 256, { nonEmpty: true, singleLine: true }))
    || (Object.hasOwn(body, 'thinkLevel') && !['low', 'medium', 'high'].includes(body.thinkLevel))
    || (Object.hasOwn(body, 'planAction') && !['start', 'branch', 'merge', 'reset'].includes(body.planAction))) return false;
  const action = body.planAction;
  if (action && mode !== 'plan') return false;
  if ((mode === 'ask' || mode === 'code' || (mode === 'plan' && (!action || action === 'start')))
    && (!apiString(body.message, 1024 * 1024, { nonEmpty: true }) || !body.message.trim())) return false;
  const extension = body.client === 'vscode-extension';
  if (Object.hasOwn(body, 'client') && !extension) return false;
  const hasBinding = Object.hasOwn(body, 'workspaceRoot') || Object.hasOwn(body, 'hostInstanceId');
  if (extension) {
    if ((Object.hasOwn(body, 'workspaceRoot') && !apiString(body.workspaceRoot, 4096, { nonEmpty: true, singleLine: true }))
      || (Object.hasOwn(body, 'hostInstanceId') && !apiString(body.hostInstanceId, 256, { nonEmpty: true, singleLine: true }))) return false;
  } else if (hasBinding) return false;
  return true;
}
function validFileWriteRequest(body) {
  if (!apiString(body.path, 4096, { nonEmpty: true, singleLine: true })
    || !apiString(body.content, MAX_TEXT_BYTES)
    || (Object.hasOwn(body, 'createOnly') && typeof body.createOnly !== 'boolean')
    || (Object.hasOwn(body, 'expectedHash') && !apiHash(body.expectedHash))) return false;
  if (body.createOnly === true) return !Object.hasOwn(body, 'expectedHash');
  return apiHash(body.expectedHash);
}
const PTY_IDENTITY_FIELDS = ['clientId', 'workspace'];
const PTY_REPORT_FIELDS = [...PTY_IDENTITY_FIELDS, 'state', 'status', 'message', 'stdout', 'stderr', 'ok', 'exitCode', 'outputCaptured'];
const PTY_TERMINAL_STATES = new Set(['done', 'denied', 'error', 'timeout', 'cancelled']);
function validPtyIdentity(body) {
  return apiString(body.clientId, 80, { nonEmpty: true, singleLine: true })
    && /^[a-zA-Z0-9_-]{8,80}$/.test(body.clientId)
    && apiString(body.workspace, 4096, { nonEmpty: true, singleLine: true });
}
function validPtyReport(body) {
  if (!validPtyIdentity(body) || !apiString(body.state, 16, { nonEmpty: true, singleLine: true })) return false;
  const base = new Set([...PTY_IDENTITY_FIELDS, 'state']);
  let allowed = base;
  if (body.state === 'progress') allowed = new Set([...base, 'stdout', 'stderr']);
  else if (PTY_TERMINAL_STATES.has(body.state)) {
    allowed = new Set([...base, 'status', 'message', 'stdout', 'stderr', 'ok', 'exitCode', 'outputCaptured']);
  } else if (!['check', 'claimed', 'accepted'].includes(body.state)) return false;
  if (Object.keys(body).some(key => !allowed.has(key))) return false;
  if (body.state === 'progress') {
    if (!Object.hasOwn(body, 'stdout') && !Object.hasOwn(body, 'stderr')) return false;
  }
  if ((Object.hasOwn(body, 'stdout') && !apiString(body.stdout, 1024 * 1024))
    || (Object.hasOwn(body, 'stderr') && !apiString(body.stderr, 1024 * 1024))
    || (Object.hasOwn(body, 'message') && !apiString(body.message, 64 * 1024))
    || (Object.hasOwn(body, 'status') && !PTY_TERMINAL_STATES.has(body.status))
    || (Object.hasOwn(body, 'ok') && typeof body.ok !== 'boolean')
    || (Object.hasOwn(body, 'exitCode') && !Number.isSafeInteger(body.exitCode))
    || (Object.hasOwn(body, 'outputCaptured') && typeof body.outputCaptured !== 'boolean')) return false;
  const effectiveStatus = body.status || body.state;
  if (PTY_TERMINAL_STATES.has(body.state)
    && ((body.state !== 'done' && Object.hasOwn(body, 'status') && body.status !== body.state)
      || (effectiveStatus !== 'done' && body.ok === true))) return false;
  return true;
}
function validExternalRegistration(body) {
  const hasWorkspace = Object.hasOwn(body, 'workspaceRoot');
  const hasHost = Object.hasOwn(body, 'hostInstanceId');
  if (!apiString(body.url, 2048, { nonEmpty: true, singleLine: true })
    || (Object.hasOwn(body, 'name') && !apiString(body.name, 120, { singleLine: true }))
    || (Object.hasOwn(body, 'token') && (!apiString(body.token, 4096) || /[\r\n\0]/.test(body.token)))
    || (Object.hasOwn(body, 'publicHttps') && typeof body.publicHttps !== 'boolean')
    || (Object.hasOwn(body, 'confirmedPublic') && typeof body.confirmedPublic !== 'boolean')
    || (hasWorkspace && !apiString(body.workspaceRoot, 4096, { nonEmpty: true, singleLine: true }))
    || (hasHost && !apiString(body.hostInstanceId, 256, { nonEmpty: true, singleLine: true }))
    || hasWorkspace !== hasHost) return false;
  if (body.publicHttps === true) return body.confirmedPublic === true && hasWorkspace;
  return body.confirmedPublic !== true;
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
router.get('/execution-control', (req, res) => {
  if (!apiRequestQuery(req, res, [])) return;
  res.json(control.snapshot());
});
router.post('/execution-control', (req, res) => {
  const body = apiRequestBody(req, res, ['workspaceRoot', 'hostInstanceId', 'permissions', 'workMode', 'revision']);
  if (!body) return;
  try {
    assertWorkspaceBinding(body, config);
    if (body.permissions !== undefined && body.workMode !== undefined) throw Error('模式与权限请分开修改');
    const result = body.workMode !== undefined ? control.selectMode(body.workMode) : control.updatePermissions(body.permissions, body.revision);
    eventBus.broadcast('execution_control_changed', result);
    res.json({success:true, ...result});
  } catch(error) { res.status(error.status || 409).json({success:false,error:error.message,code:error.code}); }
});
router.post('/probe/links', operationApi(req => probeBridge.pair(req.body)));
router.get('/probe/links', operationApi(() => probeBridge.list()));
router.get('/probe/links/:id/reports/:tabId', operationApi(req => probeBridge.report(req.params.id, req.params.tabId)));
router.delete('/probe/links/:id', operationApi(req => { probeBridge.drop(req.params.id); return {ok: true}; }));
router.post('/probe/actions', operationApi(req => probeBridge.request(req.body)));
router.get('/checkpoints', (req, res) => {
  if (!apiRequestQuery(req, res, [])) return;
  try { res.json(fileCheckpoints.list()); }
  catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});
router.post('/checkpoints', (req, res) => {
  const body = apiRequestBody(req, res, ['paths', 'confirmed', 'workspaceRoot', 'hostInstanceId']);
  if (!body) return;
  try { res.json(fileCheckpoints.create(body)); }
  catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});
router.post('/checkpoints/:id/preview', (req, res) => {
  const body = apiRequestBody(req, res, ['workspaceRoot', 'hostInstanceId']);
  if (!body) return;
  try { res.json(fileCheckpoints.preview(req.params.id, body)); }
  catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});
router.post('/checkpoints/:id/restore', async (req, res) => {
  const body = apiRequestBody(req, res, ['workspaceRoot', 'hostInstanceId', 'previewId', 'confirmed']);
  if (!body) return;
  try { res.json(await fileCheckpoints.restore(req.params.id, body)); }
  catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});
router.post('/checkpoints/:id/remove', (req, res) => {
  const body = apiRequestBody(req, res, ['workspaceRoot', 'hostInstanceId']);
  if (!body) return;
  try { res.json(fileCheckpoints.remove(req.params.id, body)); }
  catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});
router.get('/operations', (req, res) => {
  if (!apiRequestQuery(req, res, [])) return;
  res.json({ requests: operatorQueue.list(), servers: externalClient.list(true) });
});
router.get('/operations/:id', async (req, res) => {
  if (!apiRequestQuery(req, res, [])) return;
  try { res.json(await operatorQueue.inspect(req.params.id)); }
  catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});
router.post('/operations/:id/approve', async (req, res) => {
  const body = apiRequestBody(req, res, ['confirm']);
  if (!body) return;
  try { res.json(await operatorQueue.approve(req.params.id, body.confirm)); }
  catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});
router.post('/operations/:id/cancel', async (req, res) => {
  if (!apiRequestBody(req, res, [])) return;
  try { res.json(await operatorQueue.cancel(req.params.id)); }
  catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});
router.post('/external/stdio/preview', (req, res) => {
  if (!apiRequestQuery(req, res, [])) return;
  const body = apiRequestBody(req, res, ['name', 'program', 'args', 'cwd', 'env', 'reviewFiles']);
  if (!body) return;
  try { res.json(externalClient.previewStdio(body)); }
  catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});
router.post('/external/stdio/start', async (req, res) => {
  if (!apiRequestQuery(req, res, [])) return;
  const body = apiRequestBody(req, res, ['previewId', 'confirmed']);
  if (!body) return;
  if (!apiString(body.previewId, 36, { nonEmpty: true, singleLine: true })
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(body.previewId)
    || body.confirmed !== true) return rejectApiRequest(res);
  try { res.json(await externalClient.startStdio(body)); }
  catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});
router.post('/external/servers', async (req, res) => {
  if (!apiRequestQuery(req, res, [])) return;
  const body = apiRequestBody(req, res, ['name', 'url', 'token', 'publicHttps', 'confirmedPublic', 'workspaceRoot', 'hostInstanceId']);
  if (!body) return;
  if (!validExternalRegistration(body)) return rejectApiRequest(res);
  try { res.json(await externalClient.add(body)); }
  catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});
router.delete('/external/servers/:id', (req, res) => {
  if (!apiRequestQuery(req, res, []) || !apiRequestBody(req, res, [])) return;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(req.params.id)) return rejectApiRequest(res);
  try { res.json(externalClient.remove(req.params.id)); }
  catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});
router.post('/external/request', operationApi(req => externalClient.request(req.body || {}, { callerKey: 'local' })));
router.post('/workflows/preview', operationApi(req => workflows.previewRequest(req.body || {})));
router.post('/workflows/request', operationApi(req => workflows.request(req.body || {}, { callerKey: 'local' })));

const connectionCheck = require('../utils/connectionCheck');
router.post('/connection-checks', (req, res) => {
  if (!apiRequestQuery(req, res, [])) return;
  const body = apiRequestBody(req, res, ['schema', 'origin', 'observedAt', 'pageKind', 'pageDigest']);
  if (!body) return;
  try { res.json(connectionCheck.create(body)); }
  catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});
router.get('/connection-checks/:id', (req, res) => {
  if (!apiRequestQuery(req, res, [])) return;
  if (!/^[a-f0-9]{32}$/.test(req.params.id)) return rejectApiRequest(res);
  try { res.json(connectionCheck.inspect(req.params.id)); }
  catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});
router.delete('/connection-checks', (req, res) => {
  if (!apiRequestQuery(req, res, []) || !apiRequestBody(req, res, [])) return;
  res.json(connectionCheck.clear());
});

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
  const body = apiRequestBody(req, res, ['taskDescription']);
  if (!body) return;
  if (!apiString(body.taskDescription, 1024 * 1024, { nonEmpty: true }) || !body.taskDescription.trim()) return rejectApiRequest(res);
  try {
    const result = await control.run('chat', () => runMultiModelConsensus({ taskDescription: body.taskDescription }));
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/tool/call', async (req, res) => {
  const body = apiRequestBody(req, res, ['name', 'arguments', 'mode']);
  if (!body) return;
  if (!apiString(body.name, 128, { nonEmpty: true, singleLine: true })
    || !/^[a-z][a-z0-9_]*$/.test(body.name)
    || (Object.hasOwn(body, 'arguments') && !isRequestRecord(body.arguments))
    || (Object.hasOwn(body, 'mode') && !['ask', 'plan', 'code'].includes(body.mode))) return rejectApiRequest(res);
  const name = body.name;
  const toolArgs = Object.hasOwn(body, 'arguments') ? body.arguments : {};
  const mode = body.mode || 'code';
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
  const body = apiRequestBody(req, res, CHAT_FIELDS);
  if (!body) return;
  if (!validChatRequest(body)) return rejectApiRequest(res);
  if (body.client === 'vscode-extension') {
    try { assertWorkspaceBinding(body, config); }
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

  const client = body.client || '';
  const pty = client === 'vscode-extension';
  try {
    await runWithSignal(controller.signal, () => ptyJobs.runWithPty({ pty, remote: false, emit }, async () => {
      await runChat({
        mode: body.mode,
        message: body.message,
        history: body.history || [],
        modelId: body.modelId,
        thinkLevel: body.thinkLevel,
        planAction: body.planAction,
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
  if (!apiRequestQuery(req, res, [])) return;
  const body = apiRequestBody(req, res, PTY_IDENTITY_FIELDS);
  if (!body) return;
  if (!validPtyIdentity(body)) return rejectApiRequest(res);
  if (!ptyJobs.noteClient(body)) return res.status(409).json({ ok: false, error: 'workspace/client mismatch' });
  res.json({ ok: true, ...ptyJobs.snapshot() });
});

router.get('/pty/jobs', (req, res) => {
  const query = apiRequestQuery(req, res, PTY_IDENTITY_FIELDS);
  if (!query) return;
  if (!validPtyIdentity(query)) return rejectApiRequest(res);
  if (!ptyJobs.noteClient(query)) return res.status(409).json({ ok: false, error: 'workspace/client mismatch' });
  res.json({ jobs: ptyJobs.listPending(query.clientId), ...ptyJobs.snapshot() });
});

router.post('/pty/jobs/:jobId', (req, res) => {
  if (!apiRequestQuery(req, res, [])) return;
  const body = apiRequestBody(req, res, PTY_REPORT_FIELDS);
  if (!body) return;
  if (!/^[a-f0-9]{16}$/.test(req.params.jobId) || !validPtyReport(body)) return rejectApiRequest(res);
  if (!ptyJobs.noteClient({ clientId: body.clientId, workspace: body.workspace })) {
    return res.status(409).json({ ok: false, error: 'workspace/client mismatch' });
  }
  const report = {};
  for (const key of PTY_REPORT_FIELDS) if (!PTY_IDENTITY_FIELDS.includes(key) && Object.hasOwn(body, key)) report[key] = body[key];
  const out = ptyJobs.report(req.params.jobId, report, body.clientId);
  if (!out) return res.status(404).json({ ok: false, error: 'unknown job' });
  res.json({ ok: true, ...out });
});

router.post('/tasks/reset', (req, res) => {
  if (!apiRequestBody(req, res, [])) return;
  res.json({ success: true, taskState: resetTaskState() });
});

router.get('/files/tree', async (req, res) => {
  if (!apiRequestQuery(req, res, [])) return;
  try {
    const tree = await callTool('list_directory', { dirPath: '.', recursive: true, maxDepth: 5 }, 'ask');
    res.json(tree);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/files/content', (req, res) => {
  const query = apiRequestQuery(req, res, ['path']);
  if (!query) return;
  if (!apiString(query.path, 4096, { nonEmpty: true, singleLine: true })) return rejectApiRequest(res);
  try {
    const filePath = query.path;
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
  const body = apiRequestBody(req, res, ['path', 'content', 'expectedHash']);
  if (!body) return;
  const { path: filePath, content, expectedHash } = body;
  if (!apiString(filePath, 4096, { nonEmpty: true, singleLine: true })
    || !apiString(content, MAX_TEXT_BYTES) || !apiHash(expectedHash)) return rejectApiRequest(res);
  try {
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
  if (!apiRequestQuery(req, res, [])) return;
  try { res.json(editorUndo.preview(req.params.id)); }
  catch(error) { res.status(409).json({error:error.message}); }
});
router.post('/files/undo/:id', async (req, res) => {
  const body = apiRequestBody(req, res, ['confirmed', 'expectedHash', 'workspaceRoot', 'hostInstanceId']);
  if (!body) return;
  if (body.confirmed !== true || !apiHash(body.expectedHash)
    || !apiString(body.workspaceRoot, 4096, { nonEmpty: true, singleLine: true })
    || !apiString(body.hostInstanceId, 256, { nonEmpty: true, singleLine: true })) return rejectApiRequest(res);
  try {
    assertWorkspaceBinding(body, config);
    res.json(await editorUndo.restore(req.params.id, body));
  } catch(error) { res.status(409).json({error:error.message}); }
});

router.put('/files/content', async (req, res) => {
  const body = apiRequestBody(req, res, ['path', 'content', 'expectedHash', 'createOnly']);
  if (!body) return;
  if (!validFileWriteRequest(body)) return rejectApiRequest(res);
  try {
    const filePath = body.path;
    const content = body.content;
    const createOnly = body.createOnly === true;
    const undoSnapshot = createOnly ? null : editorUndo.capture(filePath, body.expectedHash, content);
    const result = await callTool('write_file', {
      filePath,
      content,
      createOnly,
      confirm_overwrite: !createOnly,
      expectedHash: body.expectedHash
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

router.get('/skills', (req, res) => {
  if (!apiRequestQuery(req, res, [])) return;
  res.json(discoverSkills());
});

router.get('/skills/load', async (req, res) => {
  const query = apiRequestQuery(req, res, ['name', 'resource', 'expectedHash', 'offset', 'limit', 'cursor', 'pageSize']);
  if (!query) return;
  if ((Object.hasOwn(query, 'name') && !apiString(query.name, 256, { nonEmpty: true, singleLine: true }))
    || (Object.hasOwn(query, 'resource') && !apiString(query.resource, 2048, { nonEmpty: true, singleLine: true }))
    || (Object.hasOwn(query, 'expectedHash') && !apiHash(query.expectedHash))
    || ['offset', 'limit', 'cursor', 'pageSize'].some(key => Object.hasOwn(query, key) && (typeof query[key] !== 'string' || !/^\d{1,10}$/.test(query[key])))) return rejectApiRequest(res);
  try {
    const args = { name: query.name, resource: query.resource || 'SKILL.md', expectedHash: query.expectedHash };
    for (const key of ['offset', 'limit', 'cursor', 'pageSize']) if (query[key] != null) args[key] = Number(query[key]);
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
  const body = apiRequestBody(req, res, ['name', 'content']);
  if (!body) return;
  if (!apiString(body.name, 256, { nonEmpty: true, singleLine: true })
    || (Object.hasOwn(body, 'content') && !apiString(body.content, MAX_TEXT_BYTES))) return rejectApiRequest(res);
  const name = body.name
    .trim()
    .replace(/[^\w\-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  if (!name) return res.status(400).json({ error: 'name required' });
  const content = body.content || `# Skill: ${name}\n\n把路径告诉模型就会用。\n`;
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
