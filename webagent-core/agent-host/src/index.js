const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { config, persistIdentity } = require('./config');
if (!fs.existsSync(config.workspaceRoot) || !fs.statSync(config.workspaceRoot).isDirectory()) {
  console.error('WORKSPACE_ROOT 必须是已存在的文件夹，请重新选择工作区。');
  process.exit(1);
}
const mcpRouter = require('./mcp/server');
const oauth = require('./mcp/oauth');
const apiRouter = require('./api/routes');
const eventBus = require('./utils/eventBus');
const store = require('./models/store');
const { rejectUnlessLocalControl, isLocalControlPlane } = require('./utils/localControl');
const { mcpCors, rejectCrossSiteApi, rejectDisallowedMcpOrigin, isAllowedApiBrowserOrigin } = require('./utils/corsAllow');
const tracker = require('./usage/tracker');

persistIdentity(store);
tracker.startReporter();


function applyCommon(app, { mcp = false } = {}) {
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/probe-link', require('./utils/probeBridge').transport());
  // Reject nonlocal/cross-site API and disallowed-origin/unauthenticated MCP before body parsing.
  app.use('/api', rejectUnlessLocalControl, rejectCrossSiteApi);
  if (mcp) {
    // CORS headers alone do not reject a request; gate MCP before preflight and parsers.
    app.use('/mcp', rejectDisallowedMcpOrigin);
    app.use(mcpCors());
    app.all(['/mcp', '/mcp/:secret'], (req, res, next) => {
      if (req.method === 'OPTIONS' || mcpRouter.isAuthorized(req)) return next();
      return mcpRouter.rejectUnauthorized(req, res);
    });
  }
  const oauthJson = express.json({ limit: '64kb' });
  const regularJson = express.json({ limit: '20mb' });
  app.use((req, res, next) => (/^\/(?:oauth(?:\/|$)|register\/?$)/i.test(req.path) ? oauthJson : regularJson)(req, res, next));
  app.use(express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 32 }));
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
applyCommon(mcpApp, { mcp: true });
mountHealth(mcpApp);
mcpApp.use(oauth.router);
mcpApp.use('/mcp', rejectDisallowedMcpOrigin, mcpRouter);
mcpApp.use('/api', rejectUnlessLocalControl, rejectCrossSiteApi, apiRouter);

function attachWss(server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient({ req }) {
      return isLocalControlPlane(req) && isAllowedApiBrowserOrigin(req.headers.origin);
    }
  });
  wss.on('connection', (ws, req) => {
    if (!isLocalControlPlane(req)) {
      try { ws.close(1008, 'local only'); } catch (_) {}
      return;
    }
    if (!eventBus.addWsClient(ws)) return;
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
    console.log('  Bridge    工作台可选 Quick Tunnel / Named Tunnel / ngrok；任务做完请停');
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

// The ONE shutdown path. It used to race a second, independent SIGINT/SIGTERM handler in
// tunnel/cloudflared.js — whichever called process.exit first won, so the other cleanup could be
// cut short — and nothing stopped commands started by run_command/start_command: they run in
// their own process group, so Ctrl+C never reached them and they outlived the host.
// Order: stop issuing work (commands), then external stdio servers and the tunnel in parallel.
// Each step is isolated so one failure cannot skip the others; the 8 s deadline stays.
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const deadline = setTimeout(() => process.exit(1), 8000); deadline.unref();
  let failed = false;
  try { require('./tools/executor').stopAll(); } catch (error) { failed = true; console.error('command cleanup failed:', error.message); }
  const steps = [
    ['external MCP', () => require('./mcp/externalClient').closeAll()],
    ['tunnel', () => require('./tunnel/cloudflared').stopTunnel()]
  ];
  const results = await Promise.allSettled(steps.map(([, run]) => Promise.resolve().then(run)));
  results.forEach((result, i) => {
    if (result.status === 'rejected') { failed = true; console.error(`${steps[i][0]} cleanup failed:`, result.reason && result.reason.message); }
  });
  clearTimeout(deadline);
  process.exit(failed ? 1 : 0);
}
process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);

module.exports = { uiApp, mcpApp, uiServer, mcpServer };
