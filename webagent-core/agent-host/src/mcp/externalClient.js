'use strict';
// Deliberately HTTP-only, loopback-only, operator-configured, and memory-only.
// No npx/uvx installation, child process spawning, arbitrary URL tools or auto-retry.
const { randomUUID } = require('crypto');
const { config } = require('../config');
const { currentSignal, checkCancelled } = require('../utils/requestScope');
const approvals = require('../utils/operatorQueue');
const clients = new Map();
const MAX_BYTES = 256 * 1024;

function endpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid endpoint length');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
    || url.username || url.password || url.search || url.hash) throw new Error('Use a loopback HTTP(S) MCP endpoint without credentials, query or fragment');
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if ([config.port, config.workbenchPort].includes(port)) throw new Error('Do not register this host itself as an external MCP server');
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1'; // Never depend on DNS for the loopback boundary.
  return url.href;
}
async function responseMessage(response, id) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty MCP response');
  const sse = (response.headers.get('content-type') || '').includes('text/event-stream');
  let bytes = 0, text = '';
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('MCP response exceeds 256 KiB');
      text += decoder.decode(chunk.value, { stream: true });
      if (sse) {
        text = text.replace(/\r\n/g, '\n');
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
    const response = await fetch(client.url, { method: 'POST', redirect: 'error', signal: controller.signal, headers,
      body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, params }) });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`External MCP HTTP ${response.status}`); }
    const session = response.headers.get('mcp-session-id');
    if (session) {
      if (session.length > 512) throw new Error('Invalid session header');
      client.session = session;
    }
    if (notification) { await response.body?.cancel(); return {}; }
    const message = await responseMessage(response, id);
    if (message.jsonrpc !== '2.0' || message.error || !message.result || typeof message.result !== 'object') throw new Error('External MCP protocol error');
    return message.result;
  } finally {
    controller.abort();
    clearTimeout(timer); parent?.removeEventListener('abort', abort); client.controllers.delete(controller);
  }
}
function list(local = false) {
  return [...clients.values()].map(client => ({ serverId: client.id, name: client.name, status: client.status,
    tools: client.tools.map(tool => ({ ...tool })), ...(local ? { endpoint: client.url } : {}) }));
}
async function add({ name, url, token = '' }) {
  if (clients.size >= 8) throw new Error('At most eight external servers');
  if (typeof token !== 'string' || token.length > 4096 || /[\r\n]/.test(token)) throw new Error('Invalid bearer token');
  const client = { id: randomUUID(), name: String(name || 'Local MCP').slice(0, 120), url: endpoint(url), token,
    controllers: new Set(), tools: [], status: 'connecting', session: '', protocol: '' };
  clients.set(client.id, client);
  try {
    const initialized = await rpc(client, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'WebAgent-approved-client', version: config.version } });
    if (!['2024-11-05', '2025-03-26', '2025-06-18'].includes(initialized.protocolVersion)) throw new Error('Unsupported MCP protocol');
    client.protocol = initialized.protocolVersion;
    await rpc(client, 'notifications/initialized', {}, true);
    const discovered = await rpc(client, 'tools/list', {});
    if (!Array.isArray(discovered.tools) || discovered.nextCursor || discovered.tools.length > 100) throw new Error('Unsupported/oversized tool inventory; at most 100 tools, no pagination');
    const names = new Set();
    client.tools = discovered.tools.map(tool => {
      if (typeof tool.name !== 'string' || !/^[a-zA-Z0-9_.-]{1,120}$/.test(tool.name) || names.has(tool.name)) throw new Error('Invalid or duplicate tool name');
      names.add(tool.name);
      return { name: tool.name, description: String(tool.description || '').slice(0, 500), inputSchema: tool.inputSchema || { type: 'object' }, requiresApproval: true };
    });
    client.status = 'discovered';
    return list(true).find(item => item.serverId === client.id);
  } catch (error) { remove(client.id); throw error; }
}
function remove(id) {
  const client = clients.get(id);
  if (client) for (const controller of client.controllers) controller.abort();
  clients.delete(id);
  return { removed: Boolean(client) };
}
function request({ serverId, tool, arguments: args = {}, requestKey }, options = {}) {
  const client = clients.get(serverId);
  if (!client || client.status !== 'discovered' || !client.tools.some(item => item.name === tool)) throw new Error('Unknown external server/tool');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('arguments must be an object');
  return approvals.submit('external-mcp', { serverId, tool, arguments: args }, options, requestKey);
}
async function execute(input) {
  const client = clients.get(input.serverId);
  if (!client || !client.tools.some(tool => tool.name === input.tool)) return { ok: false, error: 'Server removed or tool unavailable; not executed' };
  const output = await rpc(client, 'tools/call', { name: input.tool, arguments: input.arguments });
  return { ...output, ok: output.isError !== true, verification: { state: 'external-reported', note: 'External tool output is not an independent verification of effects.' } };
}
approvals.register('external-mcp', execute);
module.exports = { endpoint, responseMessage, add, remove, list, request };
