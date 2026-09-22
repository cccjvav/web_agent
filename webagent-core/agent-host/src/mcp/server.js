const crypto = require('crypto');
const control = require('../utils/executionControl');
const { isToolFailure } = require('../utils/toolTrace');
const { createLifecycle, validRequestId } = require('./requestLifecycle');
const lifecycle = createLifecycle();
const express = require('express');
const { getToolList, callTool } = require('../tools');
const { hostIdentity } = require('../utils/hostDiagnostics');
const { config } = require('../config');
const { loadCustom } = require('../models/customizations');
const eventBus = require('../utils/eventBus');
const { getInstructions, getBootstrapPrompt } = require('./instructions');
const { listResources, readResource } = require('./resources');
const { clipJson, clipText } = require('./budget');
const { resolveToolName } = require('../tools/normalize');
const { ProtocolError, publicError } = require('./errors');
const { touch, snapshot, createHttpSession, touchHttpSession, getHttpSession, destroyHttpSession, keyForReq, setHttpSessionKey, beginHttpSessionWork } = require('./session');
const oauth = require('./oauth');
const tracker = require('../usage/tracker');
// 第三阶段（用户 2026-09-07 书面同意）：run_command 截图以 MCP image 内容回给网页 Agent。
// 白名单与 6MB 上限复用 agent 层 computerUse；授权记录见 review/archive/REPORT_SHUNCODE_S3.md。
const { collectShot } = require('../agent/computerUse');

const router = express.Router();
const SUPPORTED_PROTOCOL = ['2024-11-05', '2025-03-26', '2025-06-18'];
const MAX_BATCH_ITEMS = 64;

function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  if (req.params && req.params.secret) return req.params.secret;
  if (req.headers['x-mcp-secret']) return String(req.headers['x-mcp-secret']);
  if (req.query && req.query.secret) return String(req.query.secret);
  return '';
}

function isAuthorized(req) {
  return Boolean(oauth.verifyAccessToken(extractToken(req)));
}

function rejectUnauthorized(req, res) {
  const origin = oauth.requestOrigin(req);
  res.setHeader('WWW-Authenticate', oauth.wwwAuthenticate(origin));
  return res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Unauthorized: provide Bearer token, /mcp/<secret>, or complete OAuth pairing.' },
    id: rpcId(req.body?.id)
  });
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  const identity = oauth.verifyAccessToken(token);
  if (!identity) return rejectUnauthorized(req, res);
  // OAuth refresh retains the registered client identity. A URL-secret rotation
  // changes identity; neither the raw credential nor this digest is a public peer key.
  req.mcpPrincipal = crypto.createHash('sha256')
    .update(JSON.stringify([identity.kind, identity.kind === 'oauth' ? identity.clientId : token])).digest('hex');
  next();
}

function wantsSse(req) {
  return String(req.headers.accept || '').includes('text/event-stream');
}

const MAX_SSE = 32;
const SSE_IDLE_MS = 10 * 60 * 1000;
let sseOpen = 0;

// 身份感知 touch：握手后同 ip 的后续调用归回具名会话行，不造匿名 mcp@ip 幻影 peer
function sessTouch(req, extra) {
  const k = keyForReq(req);
  return touch(req, k ? Object.assign({ key: k }, extra || {}) : (extra || {}));
}

function sessionKeyFallback(req) {
  const client = (req && req.body && req.body.params && req.body.params.clientInfo && req.body.params.clientInfo.name) || 'mcp';
  return `${client}@${(req && req.ip) || 'local'}`;
}

function incomingSessionId(req) {
  return String((req.headers && req.headers['mcp-session-id']) || '').trim() || null;
}

// HTTP允许同名头重复；Node把非set-cookie重复头合并成"a, b"字符串。
// 旧实现查找合并串会404，initialize还可能另建会话。现在在绑定/分配前拒绝。
// 1–512可见ASCII且禁逗号是本项目较窄策略；不把它冒称为MCP全部合法字符集合。
function hasMalformedSessionHeader(req) {
  const raw = req.headers && req.headers['mcp-session-id'];
  if (raw === undefined) return false;
  const rawHeaders = req.rawHeaders || [];
  let count = 0;
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (String(rawHeaders[i]).toLowerCase() === 'mcp-session-id') count++;
  }
  return count > 1 || typeof raw !== 'string' || !/^[\x21-\x7E]{1,512}$/.test(raw) || raw.includes(',');
}

function rejectMalformedSessionHeader(req, res) {
  return res.status(400).json({
    jsonrpc: '2.0',
    error: { code: -32600, message: 'Invalid Request: send exactly one Mcp-Session-Id header with a single token.' },
    id: rpcId(req.body?.id)
  });
}

function bindHttpSession(req, { createIfMissing = false } = {}) {
  const incoming = incomingSessionId(req);
  if (incoming) {
    if (touchHttpSession(incoming, req.mcpPrincipal)) {
      req.mcpSessionId = incoming;
      return { ok: true };
    }
    if (createIfMissing) {
      req.mcpSessionId = createHttpSession({ replaced: incoming, principal: req.mcpPrincipal });
      return req.mcpSessionId ? { ok: true } : { ok: false, full: true };
    }
    return { ok: false };
  }
  if (createIfMissing) {
    req.mcpSessionId = createHttpSession({ principal: req.mcpPrincipal });
    if (!req.mcpSessionId) return { ok: false, full: true };
  }
  return { ok: true };
}

function mcpEndpointPath(req) {
  if (req.params && req.params.secret) return `/mcp/${req.params.secret}`;
  return '/mcp';
}

function rejectSessionCapacity(req, res) {
  return res.status(503).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Session capacity exhausted. Retry when active work completes.' }, id: null });
}

function rejectUnknownSession(req, res) {
  return res.status(404).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'Session not found. Call initialize again, or omit Mcp-Session-Id.' },
    id: rpcId(req.body?.id)
  });
}

function sendJsonRpc(req, res, payload, httpStatus = 200) {
  if (req.mcpSessionId) res.setHeader('Mcp-Session-Id', req.mcpSessionId);
  if (wantsSse(req)) {
    res.status(httpStatus);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
    return res.end();
  }
  return res.status(httpStatus).json(payload);
}

function builtinPrompts() {
  return [
    {
      name: 'connect',
      title: '连接本机 Web Agent',
      description: 'Handshake: treat initialize.instructions as rules, then tools/list.'
    }
  ];
}

function promptsFromCustom() {
  const custom = loadCustom();
  const user = (custom.prompts || []).map((p) => ({
    name: p.id || p.name,
    title: p.name,
    description: (p.content || '').slice(0, 120)
  }));
  return [...builtinPrompts(), ...user];
}

function pickProtocol(params) {
  const asked = params && params.protocolVersion;
  if (asked && SUPPORTED_PROTOCOL.includes(asked)) return asked;
  return '2025-03-26';
}

function remoteToolMode(params) {
  const meta = (params && params._meta) || {};
  const raw = String(meta.mode || meta.webagentMode || 'code').toLowerCase();
  if (raw === 'ask' || raw === 'plan' || raw === 'code') return raw;
  return 'code';
}

async function handleRpc(req) {
  const { id, method, params } = req.body || {};
  switch (method) {
    case 'initialize': {
      const clientInfo = (params && params.clientInfo) || { name: 'External-Agent' };
      const peerId = req.mcpSessionId || incomingSessionId(req) || createHttpSession({ principal: req.mcpPrincipal });
      req.mcpSessionId = peerId;
      // Public peer labels must not disclose the private HTTP session capability.
      const existing = touchHttpSession(peerId, req.mcpPrincipal);
      const protocolVersion = req.mcpProtocol || existing?.protocolVersion || pickProtocol(params);
      if (existing) existing.protocolVersion = protocolVersion;
      const peerKey = existing && existing.key || `peer:${crypto.randomBytes(16).toString('hex')}`;
      const sessInit = touch(req, { clientInfo, key: peerKey });
      if (req.mcpSessionId) setHttpSessionKey(req.mcpSessionId, sessInit.key);
      eventBus.broadcast('agent_connected', { clientInfo, ip: req.ip });
      return {
        protocolVersion,
        capabilities: {
          tools: { listChanged: true },
          resources: { listChanged: true },
          prompts: { listChanged: true },
          logging: {}
        },
        serverInfo: { name: config.serverName, version: config.version },
        _meta: { identity: hostIdentity() },
        instructions: control.permissions().read ? getInstructions() : 'Bridge文件读取已被本机操作者禁止。'
      };
    }

    case 'notifications/initialized':
    case 'logging/setLevel':
      return {};

    case 'notifications/cancelled':
      lifecycle.cancel(lifecycle.owner(keyForReq(req), extractToken(req)), params?.requestId);
      return {};

    case 'ping': {
      const sess = sessTouch(req, { incCall: true });
      return {
        ok: true,
        ts: Date.now(),
        busy: false,
        session: { lastSeen: sess.lastSeen, calls: sess.calls },
        host: snapshot()
      };
    }

    case 'tools/list':
      sessTouch(req);
      return { tools: getToolList(null, { remote: true }) };

    case 'tools/call': {
      const { name, arguments: toolArgs } = params || {};
      if (!name) throw new ProtocolError('E_BAD_ARGS', 'tools/call requires params.name');
      eventBus.broadcast('tool_call_start', { tool: name, args: toolArgs, source: 'Bridge-Remote' });
      const started = Date.now();
      // 第六阶段：把初始化后的公开peer身份穿给工具层，多 Agent 任务板靠它记归属
      const initializedKey = keyForReq(req);
      if (['board_create', 'board_claim', 'board_update', 'external_request', 'workflow_request', 'confirm_connection'].includes(resolveToolName(name)) && !initializedKey) {
        eventBus.broadcast('tool_call_end', { source: 'Bridge-Remote', tool: name, success: false, durationMs: Date.now() - started });
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'E_SESSION_REQUIRED', detail: 'Initialize and retain Mcp-Session-Id before session-bound operations' }) }], isError: true };
      }
      const callerKey = initializedKey || sessionKeyFallback(req);
      const sess0 = touch(req, { key: callerKey });
      try {
        const result = await callTool(name, toolArgs || {}, remoteToolMode(params), { remote: true, initializedSession: Boolean(initializedKey), callerKey: sess0.key, taskId: params?._meta?.['webagent/taskId'] });
        const failed = isToolFailure(result);
        const clipped = clipJson(result);
        const durationMs = Date.now() - started;
        sessTouch(req, { incCall: true, incFail: failed });
        tracker.record({ ok: !failed });
        eventBus.broadcast('tool_call_end', { source: 'Bridge-Remote', tool: name, success: !failed, durationMs, truncated: Boolean(clipped && clipped._truncated) });
        const text = typeof clipped === 'string' ? clipped : JSON.stringify(clipped);
        const content = [{ type: 'text', text }];
        // 第三阶段（已获用户书面同意）：run_command 产生的截图附为 image 内容。
        // base64 只进 MCP 响应，不经 eventBus 广播；认不出截图就只回文本，不让调用失败。
        if (resolveToolName(name) === 'run_command' && control.permissions().capture) {
          try {
            const shot = collectShot({
              command: String((toolArgs && toolArgs.command) || ''),
              stdout: String((result && result.stdout) || '')
            });
            if (shot && shot.dataUrl) {
              content.push({
                type: 'image',
                data: shot.dataUrl.slice(shot.dataUrl.indexOf(';base64,') + 8),
                mimeType: shot.mime || 'image/png'
              });
            }
          } catch (_) { /* 截图识别失败不影响文本结果 */ }
        }
        return {
          content,
          _meta: { trace: result.trace },
          isError: failed
        };
      } catch (err) {
        const durationMs = Date.now() - started;
        const info = publicError(err);
        sessTouch(req, { incCall: true, incFail: true });
        tracker.record({ ok: false });
        eventBus.broadcast('tool_call_end', { source: 'Bridge-Remote', tool: name, success: false, durationMs, error: info });
        return {
          content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
          _meta: { trace: err.trace },
          isError: true
        };
      }
    }

    case 'resources/list':
      return { resources: listResources() };

    case 'resources/read': {
      control.assertAllowed('read_files');
      const uri = params && params.uri;
      const doc = readResource(uri, { remote: true, callerKey: keyForReq(req) });
      if (!doc) throw new ProtocolError('E_NOT_FOUND', `Unknown resource ${uri}`);
      return { contents: [doc] };
    }

    case 'prompts/list':
      control.assertAllowed('read_files');
      return { prompts: promptsFromCustom() };

    case 'prompts/get': {
      control.assertAllowed('read_files');
      const name = params && params.name;
      if (name === 'connect') {
        return {
          description: '连接本机 Web Agent',
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: [
                getBootstrapPrompt('(this MCP server)'),
                '',
                'Follow initialize.instructions (also at webagent://instructions). Call tools/list, then ping.'
              ].join('\n')
            }
          }]
        };
      }
      const custom = loadCustom();
      const prompt = (custom.prompts || []).find((p) => p.id === name || p.name === name);
      if (!prompt) throw new ProtocolError('E_NOT_FOUND', `Unknown prompt ${name}`);
      return {
        description: prompt.name,
        messages: [{ role: 'user', content: { type: 'text', text: prompt.content } }]
      };
    }

    default:
      throw new ProtocolError('E_UNKNOWN_CMD', `Method "${method}" not found`);
  }
}

function hostStatus() {
  return {
    status: 'online',
    server: config.serverName,
    version: config.version,
    workspace: config.workspaceRoot,
    tools: getToolList(null, { remote: true }).map((t) => t.name),
    resources: listResources().map((r) => r.uri),
    instructions: control.permissions().read ? getInstructions() : 'Bridge文件读取已被本机操作者禁止。' ,
    session: snapshot(),
    transports: ['streamable-http', 'sse'],
    auth: ['url-secret', 'bearer', 'oauth']
  };
}

function rpcId(id) {
  return validRequestId(id) ? id : null;
}

function invalidRpc(id, message) {
  return {
    jsonrpc: '2.0',
    error: { code: -32600, message },
    id: rpcId(id)
  };
}

// Validate the complete envelope before binding/renewing a session or executing any item.
function rpcEnvelopeError(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.jsonrpc !== '2.0') return 'Invalid JSON-RPC envelope';
  if (Object.keys(body).some(key => !['jsonrpc', 'id', 'method', 'params'].includes(key))) return 'Unexpected JSON-RPC envelope field';
  if (typeof body.method !== 'string' || !body.method.length || body.method.length > 256) return 'Invalid method';
  if (Object.hasOwn(body, 'params') && (!body.params || typeof body.params !== 'object' || Array.isArray(body.params))) return 'Named params must be an object';
  const hasId = Object.hasOwn(body, 'id');
  const notification = body.method.startsWith('notifications/');
  if (notification ? hasId : !hasId || !validRequestId(body.id)) return 'Invalid request/notification id';
  if (body.method === 'notifications/cancelled' && !validRequestId(body.params?.requestId)) return 'Invalid cancellation requestId';
  if (body.method === 'initialize' && body.params) {
    const params = body.params;
    if (Object.hasOwn(params, 'protocolVersion') && (typeof params.protocolVersion !== 'string' || !params.protocolVersion.length || params.protocolVersion.length > 64)) return 'Invalid initialization protocolVersion';
    for (const name of ['clientInfo', 'capabilities']) {
      if (Object.hasOwn(params, name) && (!params[name] || typeof params[name] !== 'object' || Array.isArray(params[name]))) return 'Invalid initialization metadata';
    }
  }
  return null;
}

function protocolForRequest(req, initialization) {
  const header = req.headers?.['mcp-protocol-version'];
  const raw = req.rawHeaders || [];
  let count = 0;
  for (let i = 0; i < raw.length; i += 2) if (String(raw[i]).toLowerCase() === 'mcp-protocol-version') count++;
  if (count > 1 || header !== undefined && (typeof header !== 'string' || !SUPPORTED_PROTOCOL.includes(header))) return null;
  const known = getHttpSession(incomingSessionId(req), req.mcpPrincipal)?.protocolVersion;
  const proposed = initialization && Object.hasOwn(initialization.params || {}, 'protocolVersion') ? pickProtocol(initialization.params) : null;
  if (known && proposed && known !== proposed) return null; // Reinitialize cannot downgrade a live session.
  const version = known || proposed || header || '2025-03-26';
  if (header !== undefined && header !== version) return null;
  return version;
}

function postAdmission(req) {
  const batch = Array.isArray(req.body);
  const items = batch ? req.body : [req.body];
  if (!items.length || items.length > MAX_BATCH_ITEMS) return 'Batch must contain 1–64 items';
  const ids = new Set();
  for (const item of items) {
    const error = rpcEnvelopeError(item);
    if (error) return error;
    if (batch && item.method === 'initialize') return 'Initialize must be a standalone request';
    if (Object.hasOwn(item, 'id')) {
      const key = JSON.stringify(item.id); // Distinguishes 0 and "0"; invalid numeric IDs already rejected.
      if (ids.has(key)) return 'Duplicate request id within batch';
      ids.add(key);
    }
  }
  const initialization = !batch && req.body.method === 'initialize' ? req.body : null;
  const version = protocolForRequest(req, initialization);
  if (!version) return 'Invalid, unsupported or inconsistent MCP-Protocol-Version';
  if (batch && version === '2025-06-18') return 'Batch is not supported by protocol 2025-06-18';
  req.mcpProtocol = version;
  return null;
}

async function dispatchOne(req, body, res) {
  const notify = !Object.hasOwn(body, 'id');
  req.body = body;
  try {
    const result = await control.run('bridge', async () => body.method === 'tools/call'
      ? await lifecycle.run(lifecycle.owner(keyForReq(req), extractToken(req)), body.id, res, () => handleRpc(req))
      : await handleRpc(req));
    if (notify) return { kind: 'notification' };
    return { kind: 'response', payload: { jsonrpc: '2.0', id: body.id, result }, httpStatus: 200 };
  } catch (err) {
    if (notify) return { kind: 'notification' };
    const info = publicError(err);
    const httpStatus = info.code === 'E_UNKNOWN_CMD' ? 404 : 200;
    const rpcCode = err.rpcCode || (info.code === 'E_UNKNOWN_CMD' ? -32601 : info.layer === 'protocol' ? -32602 : -32603);
    return {
      kind: 'response',
      payload: {
        jsonrpc: '2.0',
        id: rpcId(body.id),
        error: { code: rpcCode, message: `[${info.layer}] ${info.code}: ${info.msg}`, data: info }
      },
      httpStatus
    };
  }
}

async function handlePost(req, res) {
  if (hasMalformedSessionHeader(req)) return rejectMalformedSessionHeader(req, res);
  const admissionError = postAdmission(req);
  if (admissionError) return res.status(400).json(invalidRpc(req.body?.id, admissionError));
  const incoming = req.body;

  const batch = Array.isArray(incoming);
  const items = batch ? incoming : [incoming];
  const hasInit = items.some((b) => b && typeof b === 'object' && b.method === 'initialize');
  const bound = bindHttpSession(req, { createIfMissing: hasInit });
  if (!bound.ok) return bound.full ? rejectSessionCapacity(req, res) : rejectUnknownSession(req, res);

  const saved = req.body;
  const responses = [];
  let lastHttp = 200;
  const releaseWork = beginHttpSessionWork(req.mcpSessionId);
  try {
    for (const item of items) {
      const out = await dispatchOne(req, item, res);
      if (out.kind === 'response') {
        responses.push(out.payload);
        lastHttp = out.httpStatus;
      }
    }
  } finally {
    req.body = saved;
    releaseWork();
  }

  if (batch) {
    if (!responses.length) return res.status(202).end();
    return sendJsonRpc(req, res, responses, 200);
  }
  if (!responses.length) return res.status(202).end();
  return sendJsonRpc(req, res, responses[0], lastHttp);
}

function handleGet(req, res) {
  if (hasMalformedSessionHeader(req)) return rejectMalformedSessionHeader(req, res);
  if (!protocolForRequest(req)) return res.status(400).json(invalidRpc(null, 'Invalid, unsupported or inconsistent MCP-Protocol-Version'));
  try { const release = control.enter('bridge'); release(); }
  catch(error) { return res.status(409).json({error:error.message}); }
  const bound = bindHttpSession(req, { createIfMissing: wantsSse(req) });
  if (!bound.ok) return bound.full ? rejectSessionCapacity(req, res) : rejectUnknownSession(req, res);

  if (wantsSse(req)) {
    if (sseOpen >= MAX_SSE) {
      return res.status(503).json({ error: 'too many SSE connections' });
    }
    sseOpen += 1;
    const releaseWork = beginHttpSessionWork(req.mcpSessionId);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    if (req.mcpSessionId) res.setHeader('Mcp-Session-Id', req.mcpSessionId);
    res.write(`event: endpoint\ndata: ${mcpEndpointPath(req)}\n\n`);
    const timer = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (_) {}
    }, 15000);
    if (timer.unref) timer.unref();
    const idle = setTimeout(() => {
      try { res.end(); } catch (_) {}
    }, SSE_IDLE_MS);
    if (idle.unref) idle.unref();
    res.once('close', () => {
      sseOpen = Math.max(0, sseOpen - 1);
      clearInterval(timer);
      clearTimeout(idle);
      releaseWork();
    });
    return;
  }
  if (req.mcpSessionId) res.setHeader('Mcp-Session-Id', req.mcpSessionId);
  res.json(hostStatus());
}

function handleDelete(req, res) {
  if (hasMalformedSessionHeader(req)) return rejectMalformedSessionHeader(req, res);
  if (!protocolForRequest(req)) return res.status(400).json(invalidRpc(null, 'Invalid, unsupported or inconsistent MCP-Protocol-Version'));
  const incoming = incomingSessionId(req);
  if (incoming) destroyHttpSession(incoming, req.mcpPrincipal);
  return res.status(204).end();
}

router.get('/', requireAuth, handleGet);
router.post('/', requireAuth, handlePost);
router.delete('/', requireAuth, handleDelete);
router.get('/:secret', requireAuth, handleGet);
router.post('/:secret', requireAuth, handlePost);
router.delete('/:secret', requireAuth, handleDelete);

module.exports = router;
module.exports.handleRpc = handleRpc;
module.exports.handlePost = handlePost;
module.exports.promptsFromCustom = promptsFromCustom;
module.exports.isAuthorized = isAuthorized;
module.exports.rejectUnauthorized = rejectUnauthorized;
