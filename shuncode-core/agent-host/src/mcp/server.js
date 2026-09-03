const express = require('express');
const crypto = require('crypto');
const { getToolList, callTool } = require('../tools');
const { config } = require('../config');
const { loadCustom } = require('../models/customizations');
const eventBus = require('../utils/eventBus');
const { getInstructions, getBootstrapPrompt } = require('./instructions');
const { listResources, readResource } = require('./resources');
const { clipJson, clipText } = require('./budget');
const { ProtocolError, publicError } = require('./errors');
const { touch, snapshot } = require('./session');
const oauth = require('./oauth');

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

function sessionIdFor(req) {
  return req.headers['mcp-session-id'] || crypto.randomBytes(8).toString('hex');
}

function sendJsonRpc(req, res, payload, httpStatus = 200) {
  const sid = sessionIdFor(req);
  res.setHeader('Mcp-Session-Id', sid);
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
      title: '连接本机 ShunCode',
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
        const result = await callTool(name, toolArgs || {});
        const clipped = clipJson(result);
        const durationMs = Date.now() - started;
        touch(req, { incCall: true });
        eventBus.broadcast('tool_call_end', { tool: name, success: true, durationMs, truncated: Boolean(clipped && clipped._truncated) });
        const text = typeof clipped === 'string' ? clipped : JSON.stringify(clipped, null, 2);
        return {
          content: [{ type: 'text', text: clipText(text).text }],
          isError: false
        };
      } catch (err) {
        const durationMs = Date.now() - started;
        const info = publicError(err);
        touch(req, { incCall: true, incFail: true });
        eventBus.broadcast('tool_call_end', { tool: name, success: false, durationMs, error: info });
        if (info.layer === 'protocol') {
          const error = new ProtocolError(info.code, info.msg, info.detail);
          error.rpcCode = -32602;
          throw error;
        }
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
          description: '连接本机 ShunCode',
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: [
                getBootstrapPrompt('(this MCP server)'),
                '',
                'Follow initialize.instructions (also at shuncode://instructions). Call tools/list, then ping.'
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

async function handlePost(req, res) {
  const { jsonrpc, id, method } = req.body || {};
  if (jsonrpc !== '2.0') {
    return sendJsonRpc(req, res, {
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' },
      id: id || null
    }, 400);
  }

  try {
    const result = await handleRpc(req);
    if (method && String(method).startsWith('notifications/')) {
      return res.status(204).end();
    }
    return sendJsonRpc(req, res, { jsonrpc: '2.0', id, result });
  } catch (err) {
    const info = publicError(err);
    const http = info.code === 'E_UNKNOWN_CMD' ? 404 : 200;
    const rpcCode = err.rpcCode || (info.code === 'E_UNKNOWN_CMD' ? -32601 : info.layer === 'protocol' ? -32602 : -32603);
    return sendJsonRpc(req, res, {
      jsonrpc: '2.0',
      id: id || null,
      error: { code: rpcCode, message: `[${info.layer}] ${info.code}: ${info.msg}`, data: info }
    }, http);
  }
}

function handleGet(req, res) {
  if (wantsSse(req)) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Mcp-Session-Id', sessionIdFor(req));
    res.write('event: endpoint\ndata: /mcp\n\n');
    const timer = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (_) {}
    }, 15000);
    req.on('close', () => clearInterval(timer));
    return;
  }
  res.json(hostStatus());
}

router.get('/', requireAuth, handleGet);
router.post('/', requireAuth, handlePost);
router.get('/:secret', requireAuth, handleGet);
router.post('/:secret', requireAuth, handlePost);

module.exports = router;
module.exports.handleRpc = handleRpc;
module.exports.promptsFromCustom = promptsFromCustom;
module.exports.isAuthorized = isAuthorized;
module.exports.rejectUnauthorized = rejectUnauthorized;
