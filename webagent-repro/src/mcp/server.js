const express = require('express');
const { getToolList, callTool } = require('./tools');
const { validateSecret } = require('./auth');
const { config } = require('../config');
const eventBus = require('../utils/eventBus');

const router = express.Router();

/**
 * Diagnostic & Info page if opened directly in browser
 */
router.get('/:secret', validateSecret, (req, res) => {
  res.json({
    status: 'online',
    server: config.serverName,
    version: config.version,
    workspace: config.workspaceRoot,
    protocol: 'mcp-streamable-http',
    endpoints: {
      jsonrpc: `POST /mcp/${config.secretKey}`,
      sse: `GET /mcp/${config.secretKey}/sse`,
      messages: `POST /mcp/${config.secretKey}/messages`
    },
    toolsCount: getToolList().length,
    tools: getToolList().map(t => t.name)
  });
});

/**
 * Primary MCP JSON-RPC 2.0 endpoint (Streamable HTTP)
 */
router.post('/:secret', validateSecret, async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};

  if (!jsonrpc || jsonrpc !== '2.0') {
    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' },
      id: id || null
    });
  }

  const callStartTime = Date.now();

  try {
    switch (method) {
      case 'initialize': {
        const clientInfo = params?.clientInfo || { name: 'Unknown-Client' };
        eventBus.broadcast('agent_connected', {
          clientInfo,
          protocolVersion: params?.protocolVersion || '2024-11-05',
          ip: req.ip
        });

        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {
                listChanged: true
              },
              prompts: {},
              resources: {},
              logging: {}
            },
            serverInfo: {
              name: config.serverName,
              version: config.version
            }
          }
        });
      }

      case 'notifications/initialized': {
        return res.json({ jsonrpc: '2.0', id, result: {} });
      }

      case 'ping': {
        return res.json({ jsonrpc: '2.0', id, result: {} });
      }

      case 'tools/list': {
        const tools = getToolList();
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            tools
          }
        });
      }

      case 'tools/call': {
        const { name, arguments: toolArgs } = params || {};
        if (!name) {
          return res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32602, message: 'Missing tool "name" parameter' },
            id
          });
        }

        eventBus.broadcast('tool_call_start', {
          tool: name,
          args: toolArgs,
          timestamp: new Date().toISOString()
        });

        try {
          const result = await callTool(name, toolArgs || {});
          const durationMs = Date.now() - callStartTime;

          eventBus.broadcast('tool_call_end', {
            tool: name,
            success: true,
            durationMs,
            result
          });

          // MCP response format
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                }
              ],
              isError: false
            }
          });
        } catch (toolErr) {
          const durationMs = Date.now() - callStartTime;

          eventBus.broadcast('tool_call_end', {
            tool: name,
            success: false,
            durationMs,
            error: toolErr.message
          });

          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Tool Execution Error: ${toolErr.message}`
                }
              ],
              isError: true
            }
          });
        }
      }

      default: {
        return res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method not found: "${method}"` },
          id
        });
      }
    }
  } catch (serverErr) {
    return res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: `Internal server error: ${serverErr.message}` },
      id
    });
  }
});

/**
 * Server-Sent Events (SSE) MCP Stream
 */
router.get('/:secret/sse', validateSecret, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const endpointUrl = `/mcp/${config.secretKey}/messages`;
  res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

module.exports = router;
