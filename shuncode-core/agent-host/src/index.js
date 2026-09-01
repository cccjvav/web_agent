const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { config, persistIdentity } = require('./config');
const mcpRouter = require('./mcp/server');
const apiRouter = require('./api/routes');
const eventBus = require('./utils/eventBus');
const store = require('./models/store');

persistIdentity(store);

if (!fs.existsSync(config.workspaceRoot)) {
  if (process.env.WORKSPACE_ROOT) {
    console.error(`WORKSPACE_ROOT 不存在: ${config.workspaceRoot}`);
    process.exit(1);
  }
  fs.mkdirSync(config.workspaceRoot, { recursive: true });
}

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

function listenOrExit(server, port, label) {
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`端口 ${port} 已被占用（${label}）。关掉占用该端口的程序后重试。`);
      process.exit(1);
    }
    console.error(err);
    process.exit(1);
  });
  server.listen(port, config.host);
}

const skipWorkbench = process.env.SHUNCODE_SKIP_WORKBENCH === '1';

if (!skipWorkbench) {
  listenOrExit(uiServer, config.workbenchPort, '工作台 UI');
  uiServer.on('listening', () => {
    console.log('===========================================================');
    console.log(` ${config.productName} ${config.version}  workbench + agent-host`);
    console.log(`  UI        http://127.0.0.1:${config.workbenchPort}`);
    console.log(`  MCP       http://127.0.0.1:${config.port}/mcp/${config.secretKey}`);
    console.log('  Bridge    启动后走 cloudflared Quick Tunnel（需本机已安装 cloudflared）');
    console.log(`  Workspace ${config.workspaceRoot}`);
    console.log('===========================================================');
  });
} else {
  console.log('===========================================================');
  console.log(` ${config.productName} ${config.version}  agent-host (网页 VS Code 模式)`);
  console.log('  UI        由 code-server 提供，本进程不占用 3000');
  console.log(`  MCP       http://127.0.0.1:${config.port}/mcp/${config.secretKey}`);
  console.log(`  Workspace ${config.workspaceRoot}`);
  console.log('===========================================================');
}
listenOrExit(mcpServer, config.port, 'MCP');
mcpServer.on('listening', () => {
  console.log(`agent-host MCP/API listening on ${config.host}:${config.port}`);
});

module.exports = { app, uiServer, mcpServer };
