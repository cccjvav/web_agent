const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const path = require('path');
const { config } = require('./config');
const mcpRouter = require('./mcp/server');
const apiRouter = require('./api/routes');
const eventBus = require('./utils/eventBus');
const tunnelManager = require('./tunnel/tunnelManager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// WebSocket connection for real-time live events to the IDE UI
wss.on('connection', (ws) => {
  eventBus.addWsClient(ws);
  // Send initial handshake
  ws.send(JSON.stringify({
    type: 'connected',
    timestamp: new Date().toISOString(),
    payload: {
      serverName: config.serverName,
      version: config.version,
      secretKey: config.secretKey
    }
  }));
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// Static frontend
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/mcp', mcpRouter);
app.use('/api', apiRouter);

// Fallback to index.html for SPA
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/mcp')) {
    return res.sendFile(path.join(__dirname, '../public/index.html'));
  }
  next();
});

// Start listening
server.listen(config.port, config.host, () => {
  console.log('====================================================');
  console.log(`🚀 Web Agent Bridge Host v${config.version} Started!`);
  console.log(`📡 Local Port: http://${config.host}:${config.port}`);
  console.log(`🔒 Active MCP Secret: ${config.secretKey}`);
  console.log(`🔗 MCP Streamable Endpoint: http://127.0.0.1:${config.port}/mcp/${config.secretKey}`);
  console.log(`📂 Workspace Root: ${config.workspaceRoot}`);
  console.log('====================================================');

  // Auto initialize tunnel in local/default mode
  tunnelManager.startTunnel('local').catch(console.error);
});

module.exports = { app, server };
