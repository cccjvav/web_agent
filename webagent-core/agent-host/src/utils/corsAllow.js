const cors = require('cors');

const EXTENSION_PROTOCOLS = new Set([
  'chrome-extension:',
  'moz-extension:',
  'safari-web-extension:'
]);

/** 文档里点名的网页 MCP 客户端 Origin。其它站点用 WEBAGENT_CORS_ORIGINS。 */
const PAGE_ORIGINS = new Set([
  'https://chat.deepseek.com',
  'https://chatgpt.com',
  'https://chat.openai.com',
  'https://gemini.google.com',
  'https://aistudio.google.com',
  'https://arena.ai',
  'https://www.arena.ai'
]);

function extraOrigins() {
  return String(process.env.WEBAGENT_CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseOrigin(origin) {
  try {
    return new URL(String(origin || ''));
  } catch {
    return null;
  }
}

function isLoopbackHostName(name) {
  const n = String(name || '').replace(/^\[|\]$/g, '').toLowerCase();
  return n === '127.0.0.1' || n === 'localhost' || n === '::1';
}

function isLoopbackOrigin(origin) {
  const u = parseOrigin(origin);
  if (!u) return false;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  return isLoopbackHostName(u.hostname);
}

function isExtensionOrigin(origin) {
  const u = parseOrigin(origin);
  return Boolean(u && EXTENSION_PROTOCOLS.has(u.protocol));
}

function extraOriginSet() {
  const set = new Set();
  for (const raw of extraOrigins()) {
    const u = parseOrigin(raw);
    if (u) set.add(u.origin);
    else set.add(raw);
  }
  return set;
}

function isAllowedMcpOrigin(origin) {
  if (!origin) return true;
  if (isLoopbackOrigin(origin)) return true;
  if (isExtensionOrigin(origin)) return true;
  const u = parseOrigin(origin);
  if (!u) return false;
  if (PAGE_ORIGINS.has(u.origin)) return true;
  return extraOriginSet().has(u.origin);
}

function isAllowedApiBrowserOrigin(origin) {
  if (!origin) return true;
  return isLoopbackOrigin(origin);
}

function refererOrigin(req) {
  const r = req && req.headers && (req.headers.referer || req.headers.referrer);
  if (!r) return '';
  const u = parseOrigin(r);
  return u ? u.origin : '';
}

function rejectCrossSiteApi(req, res, next) {
  const origin = String((req && req.headers && req.headers.origin) || '').trim();
  if (origin) {
    if (isAllowedApiBrowserOrigin(origin)) return next();
    return res.status(404).json({ error: 'not found' });
  }
  const ref = refererOrigin(req);
  if (ref && !isLoopbackOrigin(ref)) {
    return res.status(404).json({ error: 'not found' });
  }
  return next();
}

function mcpCors() {
  return cors({
    origin(origin, cb) {
      cb(null, isAllowedMcpOrigin(origin));
    }
  });
}

module.exports = {
  PAGE_ORIGINS,
  extraOrigins,
  isLoopbackOrigin,
  isExtensionOrigin,
  isAllowedMcpOrigin,
  isAllowedApiBrowserOrigin,
  rejectCrossSiteApi,
  mcpCors
};
