const sessions = new Map();

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
    sessions: list.slice(0, 8)
  };
}

function reset() {
  sessions.clear();
  return snapshot();
}

module.exports = { touch, snapshot, sessionKey, reset };
