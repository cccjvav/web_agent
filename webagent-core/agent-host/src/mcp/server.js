const express = require('express');
const { getToolList, callTool } = require('../tools');
const { config } = require('../config');
const { loadCustom } = require('../models/customizations');
const eventBus = require('../utils/eventBus');
const { getInstructions, getBootstrapPrompt } = require('./instructions');
const { listResources, readResource } = require('./resources');
const { clipJson, clipText } = require('./budget');
const { ProtocolError, publicError } = require('./errors');
const { touch, snapshot, createHttpSession, touchHttpSession, destroyHttpSession } = require('./session');
const oauth = require('./oauth');
const tracker = require('../usage/tracker');
// 第三阶段（用户 2026-09-07 书面同意）：run_command 截图以 MCP image 内容回给网页 Agent。
// 白名单与 6MB 上限复用 agent 层 computerUse；授权记录见 review/REPORT_SHUNCODE_S3.md。
const { collectShot } = require('../agent/computerUse');

const router = express.Router();
const SUPPORTED_PROTOCOL = ['2024-11-05', '2025-03-26', '2025-06-18'];

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
    id: req.body ? req.body.id : null
  });
}

function requireAuth(req, res, next) {
  if (!isAuthorized(req)) return rejectUnauthorized(req, res);
  next();
}

function wantsSse(req) {
  return String(req.headers.accept || '').includes('text/event-stream');
}

const MAX_SSE = 32;
const SSE_IDLE_MS = 10 * 60 * 1000;
let sseOpen = 0;

function incomingSessionId(req) {
  return String((req.headers && req.headers['mcp-session-id']) || '').trim() || null;
}

function bindHttpSession(req, { createIfMissing = false } = {}) {
  const incoming = incomingSessionId(req);
  if (incoming) {
    if (touchHttpSession(incoming)) {
      req.mcpSessionId = incoming;
      return { ok: true };
    }
    if (createIfMissing) {
      req.mcpSessionId = createHttpSession({ replaced: incoming });
      return { ok: true };
    }
    return { ok: false };
  }
  if (createIfMissing) req.mcpSessionId = createHttpSession();
  return { ok: true };
}

function mcpEndpointPath(req) {
  if (req.params && req.params.secret) return `/mcp/${req.params.secret}`;
  return '/mcp';
}

function rejectUnknownSession(req, res) {
  return res.status(404).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'Session not found. Call initialize again, or omit Mcp-Session-Id.' },
    id: req.body && req.body.id != null ? req.body.id : null
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
      touch(req, { clientInfo, key: `${clientInfo.name}@${req.ip || 'local'}` });
      eventBus.broadcast('agent_connected', { clientInfo, ip: req.ip });
      return {
        protocolVersion: pickProtocol(params),
        capabilities: {
          tools: { listChanged: true },
          resources: { listChanged: true },
          prompts: { listChanged: true },
          logging: {}
        },
        serverInfo: { name: config.serverName, version: config.version },
        instructions: getInstructions()
      };
    }

    case 'notifications/initialized':
    case 'notifications/cancelled':
    case 'logging/setLevel':
      return {};

    case 'ping': {
      const sess = touch(req, { incCall: true });
      return {
        ok: true,
        ts: Date.now(),
        busy: false,
        session: { lastSeen: sess.lastSeen, calls: sess.calls },
        host: snapshot()
      };
    }

    case 'tools/list':
      touch(req);
      return { tools: getToolList() };

    case 'tools/call': {
      const { name, arguments: toolArgs } = params || {};
      if (!name) throw new ProtocolError('E_BAD_ARGS', 'tools/call requires params.name');
      eventBus.broadcast('tool_call_start', { tool: name, args: toolArgs, source: 'Bridge-Remote' });
      const started = Date.now();
      try {
        const result = await callTool(name, toolArgs || {}, remoteToolMode(params), { remote: true });
        const clipped = clipJson(result);
        const durationMs = Date.now() - started;
        touch(req, { incCall: true });
        tracker.record({ ok: true });
        eventBus.broadcast('tool_call_end', { tool: name, success: true, durationMs, truncated: Boolean(clipped && clipped._truncated) });
        const text = typeof clipped === 'string' ? clipped : JSON.stringify(clipped, null, 2);
        const content = [{ type: 'text', text: clipText(text).text }];
        // 第三阶段（已获用户书面同意）：run_command 产生的截图附为 image 内容。
        // base64 只进 MCP 响应，不经 eventBus 广播；认不出截图就只回文本，不让调用失败。
        if (name === 'run_command') {
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
          isError: false
        };
      } catch (err) {
        const durationMs = Date.now() - started;
        const info = publicError(err);
        touch(req, { incCall: true, incFail: true });
        tracker.record({ ok: false });
        eventBus.broadcast('tool_call_end', { tool: name, success: false, durationMs, error: info });
        return {
          content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
          isError: true
        };
      }
    }

    case 'resources/list':
      return { resources: listResources() };

    case 'resources/read': {
      const uri = params && params.uri;
      const doc = readResource(uri);
      if (!doc) throw new ProtocolError('E_NOT_FOUND', `Unknown resource ${uri}`);
      return { contents: [doc] };
    }

    case 'prompts/list':
      return { prompts: promptsFromCustom() };

    case 'prompts/get': {
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
    tools: getToolList().map((t) => t.name),
    resources: listResources().map((r) => r.uri),
    instructions: getInstructions(),
    session: snapshot(),
    transports: ['streamable-http', 'sse'],
    auth: ['url-secret', 'bearer', 'oauth']
  };
}

function rpcId(id) {
  return id === undefined ? null : id;
}

function invalidRpc(id, message) {
  return {
    jsonrpc: '2.0',
    error: { code: -32600, message },
    id: rpcId(id)
  };
}

async function dispatchOne(req, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { kind: 'response', payload: invalidRpc(null, 'Invalid Request'), httpStatus: 400 };
  }
  if (body.jsonrpc !== '2.0') {
    return {
      kind: 'response',
      payload: invalidRpc(body.id, 'Invalid Request: jsonrpc must be "2.0"'),
      httpStatus: 400
    };
  }
  const method = body.method;
  const notify = body.id === undefined || (method && String(method).startsWith('notifications/'));
  req.body = body;
  try {
    const result = await handleRpc(req);
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
  const incoming = req.body;
  if (Array.isArray(incoming) && incoming.length === 0) {
    return sendJsonRpc(req, res, invalidRpc(null, 'Invalid Request: empty batch'), 400);
  }

  const batch = Array.isArray(incoming);
  const items = batch ? incoming : [incoming];
  const hasInit = items.some((b) => b && typeof b === 'object' && b.method === 'initialize');
  const bound = bindHttpSession(req, { createIfMissing: hasInit });
  if (!bound.ok) return rejectUnknownSession(req, res);

  const saved = req.body;
  const responses = [];
  let lastHttp = 200;
  try {
    for (const item of items) {
      const out = await dispatchOne(req, item);
      if (out.kind === 'response') {
        responses.push(out.payload);
        lastHttp = out.httpStatus;
      }
    }
  } finally {
    req.body = saved;
  }

  if (batch) {
    if (!responses.length) return res.status(204).end();
    return sendJsonRpc(req, res, responses, 200);
  }
  if (!responses.length) return res.status(204).end();
  return sendJsonRpc(req, res, responses[0], lastHttp);
}

function handleGet(req, res) {
  const bound = bindHttpSession(req, { createIfMissing: wantsSse(req) });
  if (!bound.ok) return rejectUnknownSession(req, res);

  if (wantsSse(req)) {
    if (sseOpen >= MAX_SSE) {
      return res.status(503).json({ error: 'too many SSE connections' });
    }
    sseOpen += 1;
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
    req.on('close', () => {
      sseOpen = Math.max(0, sseOpen - 1);
      clearInterval(timer);
      clearTimeout(idle);
    });
    return;
  }
  if (req.mcpSessionId) res.setHeader('Mcp-Session-Id', req.mcpSessionId);
  res.json(hostStatus());
}

function handleDelete(req, res) {
  const incoming = incomingSessionId(req);
  if (incoming) destroyHttpSession(incoming);
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
