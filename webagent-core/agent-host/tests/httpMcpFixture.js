'use strict';
// A minimal loopback HTTP MCP server for the final hands-on acceptance (F132: saved registrations survive a host
// restart) and for externalSaved.test.js, which runs this file as a real child process. Never started by the product.
// Usage: node httpMcpFixture.js [port] [token]   (port 0 picks a free one; without a token no Authorization is needed)
// It listens on 127.0.0.1 only, offers one tool (echo), and prints one line per request without the token value.
const http = require('http');

const SUPPORTED = ['2024-11-05', '2025-03-26', '2025-06-18'];

function reply(res, status, body) {
  res.writeHead(status, body === undefined ? {} : { 'content-type': 'application/json' });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

function answer(message) {
  if (message.method === 'initialize') {
    const asked = message.params && message.params.protocolVersion;
    return { protocolVersion: SUPPORTED.includes(asked) ? asked : '2025-03-26', capabilities: { tools: {} },
      serverInfo: { name: 'webagent-http-fixture', version: '1.0.0' } };
  }
  if (message.method === 'tools/list') {
    return { tools: [{ name: 'echo', description: 'Returns its arguments as text.', inputSchema: { type: 'object' } }] };
  }
  if (message.method === 'tools/call') {
    return { content: [{ type: 'text', text: JSON.stringify((message.params && message.params.arguments) || {}) }] };
  }
  return null;
}

function createFixture(token = '') {
  return http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const authorized = !token || req.headers.authorization === `Bearer ${token}`;
      let message;
      try { message = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { message = null; }
      const method = message && typeof message.method === 'string' ? message.method : '(无效请求)';
      console.log(`[fixture] ${req.method} ${method}${token ? (authorized ? '（Token正确）' : '（Token缺失或错误，回401）') : ''}`);
      if (req.method !== 'POST' || !message) return reply(res, 400, { error: 'POST a JSON-RPC message' });
      if (!authorized) return reply(res, 401, { error: 'unauthorized' });
      if (message.id === undefined) return reply(res, 202);
      const result = answer(message);
      return reply(res, 200, result ? { jsonrpc: '2.0', id: message.id, result }
        : { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } });
    });
  });
}

if (require.main === module) {
  const port = Number(process.argv[2] || 48390), token = process.argv[3] || '';
  const server = createFixture(token);
  server.listen(port, '127.0.0.1', () => {
    console.log(`[fixture] HTTP MCP夹具在 http://127.0.0.1:${server.address().port}/mcp 监听${token ? '（需要Token）' : ''}；按 Ctrl+C 停止。`);
  });
}

module.exports = { createFixture };
