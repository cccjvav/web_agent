const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { config } = require('./config');
const mcpRouter = require('./mcp/server');
const apiRouter = require('./api/routes');
const eventBus = require('./utils/eventBus');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  eventBus.addWsClient(ws);
  ws.send(JSON.stringify({
    type: 'connected',
    payload: {
      serverName: config.serverName,
      version: config.version,
      secretKey: config.secretKey,
      port: config.port
    }
  }));
});

app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.use('/mcp', mcpRouter);
app.use('/api', apiRouter);

server.listen(config.port, config.host, () => {
  console.log('===========================================================');
  console.log(`🤖 ShunCode Agent Host (Independent Process) v${config.version}`);
  console.log(`🔌 Listening on: http://${config.host}:${config.port}`);
  console.log(`🔒 Bridge MCP Endpoint: http://127.0.0.1:${config.port}/mcp/${config.secretKey}`);
  console.log(`📂 Attached Workspace: ${config.workspaceRoot}`);
  console.log('===========================================================');
});

module.exports = { app, server };
