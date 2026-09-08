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

function touch(req, extra = {}) {
  const key = extra.key || sessionKey(req);
  const prev = sessions.get(key) || {
    key,
    connectedAt: new Date().toISOString(),
    calls: 0,
    fail: 0
  };
  const next = {
    ...prev,
    ...extra,
    lastSeen: new Date().toISOString(),
    calls: prev.calls + (extra.incCall ? 1 : 0),
    fail: prev.fail + (extra.incFail ? 1 : 0),
    busy: Boolean(extra.busy)
  };
  sessions.set(key, next);
  return next;
}

function snapshot() {
  const list = [...sessions.values()].sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
  const latest = list[0] || null;
  const ageMs = latest ? Date.now() - Date.parse(latest.lastSeen) : null;
  return {
    clients: list.length,
    staleAfterMs: 10000,
    alive: Boolean(latest && ageMs != null && ageMs < 10000),
    ageMs,
    latest,
    sessions: list.slice(0, 8),
    httpSessions: httpSessions.size
  };
}

function pruneHttpSessions() {
  const now = Date.now();
  for (const [id, rec] of httpSessions) {
    if (now - rec.lastSeen > SESSION_TTL_MS) httpSessions.delete(id);
  }
}

function createHttpSession(extra = {}) {
  pruneHttpSessions();
  while (httpSessions.size >= MAX_HTTP_SESSIONS) {
    let oldestId = null;
    let oldestSeen = Infinity;
    for (const [id, rec] of httpSessions) {
      if (rec.lastSeen < oldestSeen) {
        oldestSeen = rec.lastSeen;
        oldestId = id;
      }
    }
    if (!oldestId) break;
    httpSessions.delete(oldestId);
  }
  const id = crypto.randomBytes(16).toString('hex');
  httpSessions.set(id, { id, createdAt: Date.now(), lastSeen: Date.now(), ...extra });
  return id;
}

function touchHttpSession(id) {
  if (!id) return null;
  pruneHttpSessions();
  const rec = httpSessions.get(id);
  if (!rec) return null;
  rec.lastSeen = Date.now();
  return rec;
}

function destroyHttpSession(id) {
  if (!id) return false;
  return httpSessions.delete(id);
}

function setHttpSessionKey(id, key) {
  const rec = httpSessions.get(id);
  if (rec) rec.key = key;
  return Boolean(rec);
}

// 第六阶段：tools/call 里没有 clientInfo，靠会话 id（initialize 时绑过 key）或 ip 回落认人
function keyForReq(req) {
  const id = req && req.headers && req.headers['mcp-session-id'];
  if (id) {
    const rec = httpSessions.get(id);
    if (rec && rec.key) return rec.key;
  }
  const ip = (req && (req.ip || (req.headers && req.headers['x-forwarded-for']))) || 'local';
  let best = null;
  let bestNamed = null;
  for (const s of sessions.values()) {
    if (String(s.key).endsWith('@' + ip)) {
      if (!best || String(s.lastSeen) > String(best.lastSeen)) best = s;
      // 具名行优先：握手前留下的匿名 mcp@ip 行不得盖过已握手客户端
      if (!String(s.key).startsWith('mcp@') && (!bestNamed || String(s.lastSeen) > String(bestNamed.lastSeen))) bestNamed = s;
    }
  }
  return (bestNamed || best) ? (bestNamed || best).key : null;
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
  setHttpSessionKey,
  reset,
  createHttpSession,
  touchHttpSession,
  destroyHttpSession
};
