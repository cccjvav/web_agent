'use strict';
// Operator-configured, memory-only loopback HTTP, explicitly confirmed public HTTPS or stdio.
// No package installation, arbitrary remote launch configuration, or auto-retry.
const { randomUUID } = require('crypto');
const { config } = require('../config');
const { currentSignal, checkCancelled, runWithSignal } = require('../utils/requestScope');
const { isToolFailure } = require('../utils/toolTrace');
const approvals = require('../utils/operatorQueue');
const stdioLaunch = require('./stdioLaunch');
const stdioTransport = require('./stdioTransport');
const clients = new Map();
const MAX_BYTES = 256 * 1024;

function endpoint(value, publicHttps = false) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid endpoint length');
  const url = new URL(value);
  const local = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if ((publicHttps ? url.protocol !== 'https:' || local : !['http:', 'https:'].includes(url.protocol) || !local)
    || url.username || url.password || url.search || url.hash) throw new Error('Use loopback HTTP(S), or explicitly authorize public HTTPS; URL credentials/query/fragment are forbidden');
  if (publicHttps && config.publicTunnelUrl && url.origin === new URL(config.publicTunnelUrl).origin) throw new Error('Do not register this host public tunnel');
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if ([config.port, config.workbenchPort].includes(port)) throw new Error('Do not register this host itself as an external MCP server');
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1'; // Never depend on DNS for the loopback boundary.
  return url.href;
}
async function responseMessage(response, id) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty MCP response');
  const sse = (response.headers.get('content-type') || '').toLowerCase().includes('text/event-stream');
  let bytes = 0, text = '', pendingCR = false;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('MCP response exceeds 256 KiB');
      let decoded = decoder.decode(chunk.value, { stream: true });
      if (sse && decoded) {
        if (pendingCR && decoded.startsWith('\n')) decoded = decoded.slice(1);
        pendingCR = decoded.endsWith('\r');
        decoded = decoded.replace(/\r\n?/g, '\n');
      }
      text += decoded;
      if (sse) {
        let end;
        while ((end = text.indexOf('\n\n')) >= 0) {
          const frame = text.slice(0, end); text = text.slice(end + 2);
          const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (!data) continue;
          const message = JSON.parse(data);
          if (message.id === id) return message;
        }
      }
    }
    if (!sse) {
      const message = JSON.parse(text + decoder.decode());
      if (message.id === id) return message;
    }
    throw new Error('MCP response ID not found');
  } finally { await reader.cancel().catch(() => {}); }
}
async function rpc(client, method, params, notification = false) {
  checkCancelled();
  if (clients.get(client.id) !== client) throw new Error('Server removed');
  if (client.transport) return client.transport.request(method, params, notification);
  const controller = new AbortController(), parent = currentSignal();
  const abort = () => controller.abort();
  parent?.addEventListener('abort', abort, { once: true });
  if (parent?.aborted) abort();
  const timer = setTimeout(abort, 30000);
  client.controllers.add(controller);
  const id = randomUUID();
  try {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    if (client.token) headers.Authorization = `Bearer ${client.token}`;
    if (client.session) headers['Mcp-Session-Id'] = client.session;
    if (client.protocol) headers['MCP-Protocol-Version'] = client.protocol;
    const body = JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, params });
    const response = client.publicHttps
      ? await require('./publicHttps').post(client.url, {signal:controller.signal,headers,body})
      : await fetch(client.url, {method:'POST',redirect:'error',signal:controller.signal,headers,body});
    if (!response.ok) { await response.body?.cancel(); throw new Error(`External MCP HTTP ${response.status}`); }
    const session = response.headers.get('mcp-session-id');
    if (session !== null) {
      // fetch合并重复响应头为"a, b"；本项目采用1–512可见ASCII且无逗号的会话策略（比协议更窄）。
      // 合并串/含空白或控制字符的值拒绝保存，也不回放给对端（F54续批，与入站400合同对称）。
      if (!/^[\x21-\x7E]{1,512}$/.test(session) || session.includes(',')) throw new Error('Invalid session header');
    }
    if (notification) {
      await response.body?.cancel();
      if (session !== null) client.session = session;
      return {};
    }
    const message = await responseMessage(response, id);
    if (message.jsonrpc !== '2.0' || Object.hasOwn(message, 'error') || !message.result || typeof message.result !== 'object' || Array.isArray(message.result)) throw new Error('External MCP protocol error');
    // Commit the candidate header only after this RPC response has been accepted.
    // A rejected response must not silently retarget the next approved call's session.
    if (session !== null) client.session = session;
    return message.result;
  } finally {
    controller.abort();
    clearTimeout(timer); parent?.removeEventListener('abort', abort); client.controllers.delete(controller);
  }
}
function list(local = false) {
  return [...clients.values()].map(client => ({ serverId: client.id, name: client.name, status: client.status, transport: client.transport ? 'stdio' : 'http', publicHttps: Boolean(client.publicHttps),
    tools: JSON.parse(JSON.stringify(client.tools)), ...(local ? client.transport ? { launch: JSON.parse(JSON.stringify(client.launch)), process: client.transport.status() } : { endpoint: client.url } : {}) }));
}
async function discoverTools(client) {
  const tools = [], names = new Set(), cursors = new Set();
  let cursor, bytes = 0;
  for (let page = 0; page < 10; page++) {
    const result = await rpc(client, 'tools/list', cursor == null ? {} : { cursor });
    checkCancelled();
    bytes += Buffer.byteLength(JSON.stringify(result));
    if (bytes > MAX_BYTES) throw new Error('Tool inventory exceeds 256 KiB across pages');
    if (!Array.isArray(result.tools) || tools.length + result.tools.length > 100) throw new Error('Tool inventory requires an array of at most 100 tools');
    for (const tool of result.tools) {
      if (!tool || typeof tool.name !== 'string' || !/^[a-zA-Z0-9_.-]{1,120}$/.test(tool.name) || names.has(tool.name)) throw new Error('Invalid or duplicate tool name');
      const schema = tool.inputSchema === undefined ? { type: 'object' } : tool.inputSchema;
      if (!schema || typeof schema !== 'object' || Array.isArray(schema) || schema.type !== 'object') throw new Error('Tool inputSchema must describe an object');
      names.add(tool.name);
      tools.push({ name: tool.name, description: String(tool.description || '').slice(0, 500), inputSchema: schema, requiresApproval: true });
    }
    if (result.nextCursor == null) return tools;
    cursor = result.nextCursor;
    if (typeof cursor !== 'string' || !cursor || cursor.length > 1024 || cursors.has(cursor)) throw new Error('Invalid or repeated tool inventory cursor');
    cursors.add(cursor);
  }
  throw new Error('Tool inventory exceeds ten pages');
}
async function add(input) {
  const { name, url, token = '', publicHttps = false, confirmedPublic = false } = input;
  if (typeof publicHttps !== 'boolean') throw new Error('publicHttps must be boolean');
  if (publicHttps) {
    if (confirmedPublic !== true) throw new Error('Explicit public HTTPS disclosure confirmation required');
    require('../utils/workspaceBinding').assertWorkspaceBinding(input, config);
  }
  if (clients.size >= 8) throw new Error('At most eight external servers');
  if (typeof token !== 'string' || token.length > 4096 || /[\r\n]/.test(token)) throw new Error('Invalid bearer token');
  const client = { id: randomUUID(), name: String(name || 'Local MCP').slice(0, 120), url: endpoint(url, publicHttps), token, publicHttps,
    controllers: new Set(), tools: [], status: 'connecting', session: '', protocol: '' };
  return establish(client);
}
async function startStdio(input) {
  if (clients.size >= 8) throw new Error('At most eight external servers');
  const launch = stdioLaunch.consume(input);
  const client = { id: randomUUID(), name: launch.name, controllers: new Set(), tools: [], status: 'connecting', protocol: '',
    launch: { program: launch.program, args: [...launch.args], cwd: launch.cwd, envKeys: Object.keys(launch.env) } };
  client.transport = stdioTransport.open(launch, () => { client.status = 'stopped'; });
  return establish(client);
}
async function establish(client) {
  clients.set(client.id, client);
  const registration = new AbortController(), parent = currentSignal();
  const abort = () => registration.abort();
  parent?.addEventListener('abort', abort, { once: true });
  if (parent?.aborted) abort();
  client.controllers.add(registration);
  const timer = setTimeout(abort, 30000);
  try {
    return await runWithSignal(registration.signal, async () => {
      const initialized = await rpc(client, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'WebAgent-approved-client', version: config.version } });
      if (!['2024-11-05', '2025-03-26', '2025-06-18'].includes(initialized.protocolVersion)) throw new Error('Unsupported MCP protocol');
      client.protocol = initialized.protocolVersion;
      await rpc(client, 'notifications/initialized', {}, true);
      client.tools = await discoverTools(client);
      checkCancelled();
      client.status = 'discovered';
      return list(true).find(item => item.serverId === client.id);
    });
  } catch (error) { remove(client.id); if (client.transport) await client.transport.closed; throw error; }
  finally { clearTimeout(timer); parent?.removeEventListener('abort', abort); client.controllers.delete(registration); }
}
function remove(id) {
  const client = clients.get(id);
  if (client) for (const controller of client.controllers) controller.abort();
  if (client?.transport) client.transport.stop('Server removed');
  clients.delete(id);
  return { removed: Boolean(client), ...(client?.transport ? { stopping: true } : {}) };
}
function request(input = {}, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['serverId', 'tool', 'arguments', 'requestKey'].includes(key))) throw new Error('Unknown external request field');
  const { serverId, tool, arguments: args = {}, requestKey } = input;
  const client = clients.get(serverId);
  if (!client || client.status !== 'discovered' || !client.tools.some(item => item.name === tool)) throw new Error('Unknown external server/tool');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('arguments must be an object');
  return approvals.submit('external-mcp', { serverId, tool, arguments: args }, options, requestKey);
}
async function execute(input) {
  const client = clients.get(input.serverId);
  if (!client || client.status !== 'discovered' || !client.tools.some(tool => tool.name === input.tool)) return { ok: false, error: 'Server removed or tool unavailable; not executed' };
  const output = await rpc(client, 'tools/call', { name: input.tool, arguments: input.arguments });
  const reportedUnknown = output.verification?.state === 'unknown';
  const failed = isToolFailure(output);
  const reported = { ...output, verification: reportedUnknown
    ? { state: 'unknown', note: 'External tool reported unknown completion; effects may exist and were not independently verified.' }
    : { state: 'external-reported', note: 'External tool output is not an independent verification of effects.' } };
  // Evaluate the original response before replacing its untrusted verification
  // metadata. Otherwise an explicit unknown signal can be erased into success.
  reported.ok = !failed;
  return reported;
}
approvals.register('external-mcp', execute);
async function closeAll() {
  stdioLaunch.clear();
  for (const id of [...clients.keys()]) remove(id);
  await stdioTransport.closeAll();
}
module.exports = { endpoint, responseMessage, add, remove, list, request, startStdio, previewStdio: stdioLaunch.preview, closeAll };
