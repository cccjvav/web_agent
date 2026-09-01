const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { config, persistIdentity } = require('./config');
const mcpRouter = require('./mcp/server');
const apiRouter = require('./api/routes');
const eventBus = require('./utils/eventBus');
const store = require('./models/store');

persistIdentity(store);

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '20mb' }));

const workbenchDir = path.resolve(__dirname, '../../workbench');
app.use(express.static(workbenchDir));
app.use('/mcp', mcpRouter);
app.use('/api', apiRouter);

app.get('/health', (req, res) => {
  res.json({ ok: true, product: config.productName, version: config.version });
});

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/mcp') || req.path.startsWith('/ws')) return next();
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(workbenchDir, 'index.html'));
});

function attachWss(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    eventBus.addWsClient(ws);
    ws.send(
      JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString(),
        payload: {
          serverName: config.serverName,
          version: config.version,
          secretKey: config.secretKey
        }
      })
    );
  });
  return wss;
}

const uiServer = http.createServer(app);
const mcpServer = http.createServer(app);
attachWss(uiServer);
attachWss(mcpServer);

uiServer.listen(config.workbenchPort, config.host, () => {
  console.log('===========================================================');
  console.log(` ${config.productName} ${config.version}  workbench + agent-host`);
  console.log(`  UI        http://${config.host}:${config.workbenchPort}`);
  console.log(`  MCP       http://127.0.0.1:${config.port}/mcp/${config.secretKey}`);
  console.log('  Bridge    启动后走 cloudflared Quick Tunnel（需本机已安装 cloudflared）');
  console.log(`  Workspace ${config.workspaceRoot}`);
  console.log('===========================================================');
});

mcpServer.listen(config.port, config.host, () => {
  console.log(`agent-host MCP/API listening on ${config.host}:${config.port}`);
});

module.exports = { app, uiServer, mcpServer };
