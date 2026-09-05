const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { config, persistIdentity } = require('./config');
const mcpRouter = require('./mcp/server');
const oauth = require('./mcp/oauth');
const apiRouter = require('./api/routes');
const eventBus = require('./utils/eventBus');
const store = require('./models/store');
const { rejectUnlessLocalControl, isLocalControlPlane } = require('./utils/localControl');
const { mcpCors, rejectCrossSiteApi } = require('./utils/corsAllow');
const tracker = require('./usage/tracker');

persistIdentity(store);
tracker.startReporter();

if (!fs.existsSync(config.workspaceRoot)) {
  if (process.env.WORKSPACE_ROOT) {
    console.error(`WORKSPACE_ROOT 不存在: ${config.workspaceRoot}`);
    process.exit(1);
  }
  fs.mkdirSync(config.workspaceRoot, { recursive: true });
}

function applyCommon(app) {
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: false }));
}

function mountHealth(app) {
  app.get('/health', (req, res) => {
    res.json({ ok: true, product: config.productName, version: config.version });
  });
}

const workbenchDir = path.resolve(__dirname, '../../workbench');

function mountWorkbench(app) {
  app.use(express.static(workbenchDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (
      req.path.startsWith('/api')
      || req.path.startsWith('/mcp')
      || req.path.startsWith('/ws')
      || req.path.startsWith('/oauth')
      || req.path.startsWith('/.well-known')
      || req.path === '/register'
    ) return next();
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(workbenchDir, 'index.html'));
  });
}

const uiApp = express();
applyCommon(uiApp);
mountHealth(uiApp);
uiApp.use('/api', rejectUnlessLocalControl, rejectCrossSiteApi, apiRouter);
mountWorkbench(uiApp);

const mcpApp = express();
applyCommon(mcpApp);
mcpApp.use(mcpCors());
mountHealth(mcpApp);
mcpApp.use(oauth.router);
mcpApp.use('/mcp', mcpRouter);
mcpApp.use('/api', rejectUnlessLocalControl, rejectCrossSiteApi, apiRouter);

function attachWss(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    if (!isLocalControlPlane(req)) {
      try { ws.close(1008, 'local only'); } catch (_) {}
      return;
    }
    eventBus.addWsClient(ws);
    ws.send(
      JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString(),
        payload: {
          serverName: config.serverName,
          version: config.version
        }
      })
    );
  });
  return wss;
}

const uiServer = http.createServer(uiApp);
const mcpServer = http.createServer(mcpApp);
attachWss(uiServer);

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

const skipWorkbench = process.env.WEBAGENT_SKIP_WORKBENCH === '1';

if (!skipWorkbench) {
  listenOrExit(uiServer, config.workbenchPort, '工作台 UI');
  uiServer.on('listening', () => {
    console.log('===========================================================');
    console.log(` ${config.productName} ${config.version}  workbench + agent-host`);
    console.log(`  UI        http://127.0.0.1:${config.workbenchPort}`);
    console.log(`  MCP       http://127.0.0.1:${config.port}/mcp/${config.secretKey}`);
    console.log(`  Bind      ${config.host}（默认只听本机；WEBAGENT_BIND=0.0.0.0 才听所有网卡）`);
    console.log('  Bridge    启动后走 cloudflared Quick Tunnel（需本机已安装 cloudflared）');
    console.log('            公网只收 /mcp 与 OAuth 发现文档；/api 与 /ws 仅本机回环');
    console.log(`  Workspace ${config.workspaceRoot}`);
    console.log('===========================================================');
  });
} else {
  console.log('===========================================================');
  console.log(` ${config.productName} ${config.version}  agent-host (网页 VS Code 模式)`);
  console.log('  UI        由 code-server 提供，本进程不占用 3000');
  console.log(`  MCP       http://127.0.0.1:${config.port}/mcp/${config.secretKey}`);
  console.log('  /api      仅本机回环（VS Code 插件）；隧道带 Cloudflare 头时 404');
  console.log(`  Workspace ${config.workspaceRoot}`);
  console.log('===========================================================');
}
listenOrExit(mcpServer, config.port, 'MCP');
mcpServer.on('listening', () => {
  console.log(`agent-host MCP listening on ${config.host}:${config.port}`);
});

module.exports = { uiApp, mcpApp, uiServer, mcpServer };
