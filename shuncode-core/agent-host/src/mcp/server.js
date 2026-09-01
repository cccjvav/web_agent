const express = require('express');
const { getToolList, callTool } = require('../tools');
const { config } = require('../config');
const { loadCustom } = require('../models/customizations');
const eventBus = require('../utils/eventBus');
const { getInstructions } = require('./instructions');
const { listResources, readResource } = require('./resources');
const { clipJson, clipText } = require('./budget');
const { ProtocolError, publicError } = require('./errors');
const { touch, snapshot } = require('./session');

const router = express.Router();

function validateSecret(req, res, next) {
  const secret = req.params.secret || req.headers['x-mcp-secret'] || req.query.secret;
  if (!secret || secret !== config.secretKey) {
    return res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Unauthorized: Invalid ShunCode MCP secret.' },
      id: req.body ? req.body.id : null
    });
  }
  next();
}

function promptsFromCustom() {
  const custom = loadCustom();
  return (custom.prompts || []).map((p) => ({
    name: p.id || p.name,
    title: p.name,
    description: (p.content || '').slice(0, 120)
  }));
}

async function handleRpc(req) {
  const { id, method, params } = req.body || {};
  switch (method) {
    case 'initialize': {
      const clientInfo = (params && params.clientInfo) || { name: 'External-Agent' };
      touch(req, { clientInfo, key: `${clientInfo.name}@${req.ip || 'local'}` });
      eventBus.broadcast('agent_connected', { clientInfo, ip: req.ip });
      return {
        protocolVersion: '2024-11-05',
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

router.get('/:secret', validateSecret, (req, res) => {
  res.json({
    status: 'online',
    server: config.serverName,
    version: config.version,
    workspace: config.workspaceRoot,
    tools: getToolList().map((t) => t.name),
    resources: listResources().map((r) => r.uri),
    session: snapshot()
  });
});

router.post('/:secret', validateSecret, async (req, res) => {
  const { jsonrpc, id, method } = req.body || {};
  if (jsonrpc !== '2.0') {
    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' },
      id: id || null
    });
  }

  try {
    const result = await handleRpc(req);
    if (method && String(method).startsWith('notifications/')) {
      return res.status(204).end();
    }
    return res.json({ jsonrpc: '2.0', id, result });
  } catch (err) {
    const info = publicError(err);
    const http = info.code === 'E_UNKNOWN_CMD' ? 404 : 200;
    const rpcCode = err.rpcCode || (info.code === 'E_UNKNOWN_CMD' ? -32601 : info.layer === 'protocol' ? -32602 : -32603);
    return res.status(http).json({
      jsonrpc: '2.0',
      id: id || null,
      error: { code: rpcCode, message: `[${info.layer}] ${info.code}: ${info.msg}`, data: info }
    });
  }
});

module.exports = router;
module.exports.handleRpc = handleRpc;
module.exports.promptsFromCustom = promptsFromCustom;
