const { createServer } = require('./app');

const port = Number(process.env.WEBAGENT_ADMIN_PORT || 4174);
const host = process.env.WEBAGENT_ADMIN_BIND || '127.0.0.1';
const { server, dataDir, token } = createServer();

server.listen(port, host, () => {
  const shown = (host === '0.0.0.0' || host === '::') ? '127.0.0.1' : host;
  console.log(`[webagent-admin] bind ${host}:${port}`);
  console.log(`[webagent-admin] http://${shown}:${port}/`);
  console.log(`[webagent-admin] 数据目录 ${dataDir}`);
  if (!process.env.WEBAGENT_ADMIN_TOKEN) {
    console.log(`[webagent-admin] 上报令牌已写入 ${require('path').join(dataDir, 'admin-token.txt')}`);
  }
  console.log('[webagent-admin] 客户端设置 WEBAGENT_TELEMETRY_URL 指向本机 /api/report，WEBAGENT_TELEMETRY_TOKEN 与上报令牌相同。GET / 与 /api/stats 也要 Bearer。');
  void token;
});
