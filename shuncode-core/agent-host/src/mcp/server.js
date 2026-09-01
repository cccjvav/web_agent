const express = require('express');
const { getToolList, callTool } = require('../tools');
const { config, generateNewSecret } = require('../config');
const eventBus = require('../utils/eventBus');

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

// Info & diagnostic endpoint
router.get('/:secret', validateSecret, (req, res) => {
  res.json({
    status: 'online',
    server: config.serverName,
    version: config.version,
    workspace: config.workspaceRoot,
    tools: getToolList().map(t => t.name)
  });
});

// JSON-RPC 2.0 (Streamable HTTP)
router.post('/:secret', validateSecret, async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (jsonrpc !== '2.0') {
    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' },
      id: id || null
    });
  }

  const startTime = Date.now();

  try {
    switch (method) {
      case 'initialize': {
        eventBus.broadcast('agent_connected', {
          clientInfo: params?.clientInfo || { name: 'External-Agent' },
          ip: req.ip
        });

        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: config.serverName, version: config.version }
          }
        });
      }

      case 'notifications/initialized':
      case 'ping': {
        return res.json({ jsonrpc: '2.0', id, result: {} });
      }

      case 'tools/list': {
        return res.json({
          jsonrpc: '2.0',
          id,
          result: { tools: getToolList() }
        });
      }

      case 'tools/call': {
        const { name, arguments: toolArgs } = params || {};
        eventBus.broadcast('tool_call_start', { tool: name, args: toolArgs, source: 'Bridge-Remote' });

        try {
          const result = await callTool(name, toolArgs || {});
          const durationMs = Date.now() - startTime;
          eventBus.broadcast('tool_call_end', { tool: name, success: true, durationMs, result });

          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
              isError: false
            }
          });
        } catch (err) {
          const durationMs = Date.now() - startTime;
          eventBus.broadcast('tool_call_end', { tool: name, success: false, durationMs, error: err.message });

          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `Tool Execution Error: ${err.message}` }],
              isError: true
            }
          });
        }
      }

      default: {
        return res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method "${method}" not found` },
          id
        });
      }
    }
  } catch (err) {
    return res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: err.message },
      id
    });
  }
});

module.exports = router;
