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

function reset() {
  sessions.clear();
  httpSessions.clear();
  return snapshot();
}

module.exports = {
  touch,
  snapshot,
  sessionKey,
  reset,
  createHttpSession,
  touchHttpSession,
  destroyHttpSession
};
