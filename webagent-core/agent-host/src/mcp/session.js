const crypto = require('crypto');

const sessions = new Map();
const httpSessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_HTTP_SESSIONS = 200;

function sessionKey(req) {
  const ip = (req && (req.ip || req.headers && req.headers['x-forwarded-for'])) || 'local';
  const client = (req && req.body && req.body.params && req.body.params.clientInfo && req.body.params.clientInfo.name) || 'mcp';
  return `${client}@${ip}`;
}

function pruneSessions() {
  for (const [id, rec] of sessions) {
    if (Date.now() - Date.parse(rec.lastSeen) > SESSION_TTL_MS) sessions.delete(id);
  }
}

function touch(req, extra = {}) {
  pruneSessions();
  const requestedKey = extra.key || sessionKey(req);
  const key = publicText(requestedKey, 512) || 'mcp@local';
  const prev = sessions.get(key) || {
    key,
    connectedAt: new Date().toISOString(),
    calls: 0,
    fail: 0,
    clientInfo: {}
  };
  const next = {
    key,
    connectedAt: prev.connectedAt,
    clientInfo: Object.hasOwn(extra, 'clientInfo') ? publicClientInfo(extra.clientInfo) : publicClientInfo(prev.clientInfo),
    lastSeen: new Date().toISOString(),
    calls: prev.calls + (extra.incCall ? 1 : 0),
    fail: prev.fail + (extra.incFail ? 1 : 0),
    busy: Boolean(extra.busy)
  };
  if (!sessions.has(key) && sessions.size >= MAX_HTTP_SESSIONS) sessions.delete(sessions.keys().next().value);
  sessions.set(key, next);
  return next;
}

function publicText(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength && !/[\x00-\x1f\x7f]/.test(value) ? value : '';
}

function publicClientInfo(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const clientInfo = {};
  for (const [key, limit] of [['name', 256], ['title', 256], ['version', 128]]) {
    const text = publicText(source[key], limit);
    if (text) clientInfo[key] = text;
  }
  return clientInfo;
}

function publicSession(record) {
  const source = record && typeof record === 'object' ? record : {};
  return {
    key: publicText(source.key, 512),
    connectedAt: publicText(source.connectedAt, 64),
    lastSeen: publicText(source.lastSeen, 64),
    calls: Number.isSafeInteger(source.calls) && source.calls >= 0 ? source.calls : 0,
    fail: Number.isSafeInteger(source.fail) && source.fail >= 0 ? source.fail : 0,
    busy: source.busy === true,
    clientInfo: publicClientInfo(source.clientInfo)
  };
}

function snapshot() {
  pruneSessions();
  pruneHttpSessions();
  const records = [...sessions.values()].sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
  const latestRecord = records[0] || null;
  const ageMs = latestRecord ? Date.now() - Date.parse(latestRecord.lastSeen) : null;
  const list = records.map(publicSession);
  return {
    clients: list.length,
    staleAfterMs: 10000,
    alive: Boolean(latestRecord && ageMs != null && ageMs < 10000),
    ageMs,
    latest: list[0] ? { ...list[0], clientInfo: { ...list[0].clientInfo } } : null,
    sessions: list.slice(0, 8),
    httpSessions: httpSessions.size
  };
}

// 第六阶段审计 F6：snapshot() 的 sessions 截断到 8 供界面用；板工具要全量在场者
function allSessions() {
  pruneSessions();
  return [...sessions.values()]
    .sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)))
    .map(publicSession);
}

function pruneHttpSessions() {
  const now = Date.now();
  for (const [id, rec] of httpSessions) {
    if ((rec.active || 0) > 0) continue;
    if (now - rec.lastSeen > SESSION_TTL_MS) httpSessions.delete(id);
  }
}

// 借鉴ShunCode会话驱逐语义（2026-09-20，F54）：有在途HTTP请求或SSE流的会话
// 不因TTL/容量被驱逐，否则长工具调用期间的取消与后续调用会失去身份绑定。
// 全部在途时拒绝分配，不依赖调用方并发上限来保证这个不变量。
function createHttpSession(extra = {}) {
  pruneHttpSessions();
  while (httpSessions.size >= MAX_HTTP_SESSIONS) {
    let oldestId = null;
    let oldestSeen = Infinity;
    for (const [id, rec] of httpSessions) {
      if ((rec.active || 0) > 0) continue;
      if (rec.lastSeen < oldestSeen) {
        oldestSeen = rec.lastSeen;
        oldestId = id;
      }
    }
    if (!oldestId) return null;
    httpSessions.delete(oldestId);
  }
  const id = crypto.randomBytes(16).toString('hex');
  httpSessions.set(id, { id, createdAt: Date.now(), lastSeen: Date.now(), active: 0, ...extra });
  return id;
}

// 标记一次在途工作（HTTP请求处理或SSE流打开）。返回一次性release；
// 未知ID返回no-op false。最后一个工作完成后重新开始空闲TTL；不延长授权、不代替认证。
function beginHttpSessionWork(id) {
  const rec = id ? httpSessions.get(id) : null;
  if (!rec) return () => false;
  rec.active = (rec.active || 0) + 1;
  let released = false;
  return () => {
    if (released) return false;
    released = true;
    const current = httpSessions.get(id);
    if (current === rec) {
      current.active = Math.max(0, (current.active || 0) - 1);
      if (current.active === 0) current.lastSeen = Date.now();
    }
    return true;
  };
}

// Read-only admission lookup: rejected requests must not renew idle TTL.
function getHttpSession(id, principal) {
  const rec = id ? httpSessions.get(id) : null;
  if (!rec || (principal !== undefined && rec.principal !== principal)) return null;
  if (!(rec.active > 0) && Date.now() - rec.lastSeen > SESSION_TTL_MS) return null;
  return rec;
}

function touchHttpSession(id, principal) {
  if (!id) return null;
  pruneHttpSessions();
  const rec = getHttpSession(id, principal);
  if (!rec) return null;
  rec.lastSeen = Date.now();
  return rec;
}

function destroyHttpSession(id, principal) {
  if (!id) return false;
  const rec = httpSessions.get(id);
  if (principal !== undefined && (!rec || rec.principal !== principal)) return false;
  return httpSessions.delete(id);
}

function setHttpSessionKey(id, key) {
  const rec = httpSessions.get(id);
  if (rec) rec.key = key;
  return Boolean(rec);
}

// HTTP requests carry the verified principal; direct module fixtures may omit it.
// No IP fallback here: only a live session can supply the initialized public peer.
function keyForReq(req) {
  const id = req && (req.mcpSessionId || req.headers && req.headers['mcp-session-id']);
  if (!id) return null;
  const rec = touchHttpSession(id, req.mcpPrincipal);
  return rec && rec.key || null;
}

function reset() {
  sessions.clear();
  httpSessions.clear();
  return snapshot();
}

module.exports = {
  touch,
  snapshot,
  sessionKey,
  keyForReq,
  allSessions,
  setHttpSessionKey,
  reset,
  createHttpSession,
  touchHttpSession,
  getHttpSession,
  destroyHttpSession,
  beginHttpSessionWork
};
