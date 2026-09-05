const EventEmitter = require('events');

const MAX_STR = 4000;
const MAX_FIELD = 500;
const MAX_KEYS = 40;
const MAX_ARR = 40;
const MAX_DEPTH = 6;
const CLIP_KEYS = /^(diff|patch|content|chunk|stdout|stderr|args|body)$/i;
const SECRET_KEYS = /^(apiKey|token|password|secret|secretKey|authorization|access_token|refresh_token|pat)$/i;
const SECRET_RE = /(ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._\-+=/]{8,})/gi;

function clipStr(s, max = MAX_STR) {
  let t = String(s);
  if (t.length > max) t = `${t.slice(0, max)}…`;
  return t.replace(SECRET_RE, '[redacted]');
}

function sanitizePayload(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === 'string') return clipStr(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= MAX_DEPTH) return '[…]';
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARR).map((item) => sanitizePayload(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    const keys = Object.keys(value).slice(0, MAX_KEYS);
    for (const key of keys) {
      if (SECRET_KEYS.test(key)) {
        out[key] = '[redacted]';
        continue;
      }
      let next = value[key];
      if (CLIP_KEYS.test(key) && typeof next === 'string') next = clipStr(next, MAX_FIELD);
      out[key] = sanitizePayload(next, depth + 1);
    }
    return out;
  }
  return clipStr(String(value), 200);
}

class BridgeEventBus extends EventEmitter {
  constructor() {
    super();
    this.wsClients = new Set();
    this.logs = [];
    this.maxLogs = 500;
  }

  addWsClient(ws) {
    this.wsClients.add(ws);
    ws.on('close', () => {
      this.wsClients.delete(ws);
    });
  }

  broadcast(type, payload = {}) {
    const eventObj = {
      type,
      timestamp: new Date().toISOString(),
      payload: sanitizePayload(payload)
    };

    this.logs.unshift(eventObj);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    const message = JSON.stringify(eventObj);
    for (const ws of this.wsClients) {
      if (ws.readyState === 1) {
        try {
          ws.send(message);
        } catch (err) {}
      }
    }

    this.emit(type, payload);
  }

  getRecentLogs(limit = 50) {
    return this.logs.slice(0, limit);
  }
}

const eventBus = new BridgeEventBus();
module.exports = eventBus;
module.exports.sanitizePayload = sanitizePayload;
