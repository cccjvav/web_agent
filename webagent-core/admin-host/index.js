const { createServer } = require('./app');

const port = Number(process.env.WEBAGENT_ADMIN_PORT || 4174);
const { server, dataDir, token } = createServer();

server.listen(port, '0.0.0.0', () => {
  console.log(`[webagent-admin] http://127.0.0.1:${port}/`);
  console.log(`[webagent-admin] 数据目录 ${dataDir}`);
  if (!process.env.WEBAGENT_ADMIN_TOKEN) {
    console.log(`[webagent-admin] 上报令牌已写入 ${require('path').join(dataDir, 'admin-token.txt')}`);
  }
  console.log('[webagent-admin] 客户端设置 WEBAGENT_TELEMETRY_URL 指向本机 /api/report，WEBAGENT_TELEMETRY_TOKEN 与上报令牌相同。');
  void token;
});
