const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const store = require('../models/store');

const INTERVAL_MS = 15 * 60 * 1000;

let timer = null;
let debounce = null;

function usagePath() {
  return path.join(config.workspaceRoot, '.webagent', 'usage.json');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyDay(day) {
  return {
    day: day || today(),
    toolCalls: 0,
    fail: 0,
    lastAt: null,
    lastReportAt: null
  };
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(usagePath(), 'utf8'));
    if (!raw || typeof raw !== 'object') return emptyDay();
    if (raw.day !== today()) return emptyDay();
    return {
      day: raw.day,
      toolCalls: Number(raw.toolCalls) || 0,
      fail: Number(raw.fail) || 0,
      lastAt: raw.lastAt || null,
      lastReportAt: raw.lastReportAt || null
    };
  } catch {
    return emptyDay();
  }
}

function save(next) {
  const dir = path.dirname(usagePath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(usagePath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function successRate(rec) {
  if (!rec.toolCalls) return null;
  return Math.round((1 - rec.fail / rec.toolCalls) * 100);
}

function snapshot() {
  const rec = load();
  return {
    ...rec,
    successRate: successRate(rec),
    telemetryConfigured: Boolean(String(process.env.WEBAGENT_TELEMETRY_URL || '').trim()),
    intervalMs: INTERVAL_MS
  };
}

function record({ ok = true } = {}) {
  const rec = load();
  rec.toolCalls += 1;
  if (!ok) rec.fail += 1;
  rec.lastAt = new Date().toISOString();
  save(rec);
  scheduleReport();
  return rec;
}

function identity() {
  const cfg = store.load();
  const github = cfg.bridge && cfg.bridge.provider === 'github' && cfg.bridge.username;
  return {
    installId: config.installId,
    githubUser: github ? String(cfg.bridge.username).replace(/^@/, '') : null,
    githubId: github ? String(cfg.bridge.githubId || '') : '',
    provider: (cfg.bridge && cfg.bridge.provider) || 'local-demo'
  };
}

function payload() {
  const rec = load();
  const who = identity();
  return {
    installId: who.installId,
    githubUser: who.githubUser,
    githubId: who.githubId,
    provider: who.provider,
    day: rec.day,
    toolCalls: rec.toolCalls,
    fail: rec.fail,
    successRate: successRate(rec),
    lastAt: rec.lastAt,
    product: config.productName,
    version: config.version
  };
}

async function reportNow({ fetchFn = fetch } = {}) {
  const url = String(process.env.WEBAGENT_TELEMETRY_URL || '').trim();
  const token = String(process.env.WEBAGENT_TELEMETRY_TOKEN || '').trim();
  if (!url || !token) return { skipped: true, reason: 'not-configured' };
  const rec = load();
  if (!rec.toolCalls) return { skipped: true, reason: 'no-calls' };
  const body = payload();
  const resp = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { skipped: false, ok: false, status: resp.status, error: text.slice(0, 200) };
  }
  rec.lastReportAt = new Date().toISOString();
  save(rec);
  return { skipped: false, ok: true, lastReportAt: rec.lastReportAt };
}

function scheduleReport() {
  if (debounce) return;
  debounce = setTimeout(() => {
    debounce = null;
    reportNow().catch(() => {});
  }, 4000);
  if (typeof debounce.unref === 'function') debounce.unref();
}

function startReporter() {
  if (timer) return;
  timer = setInterval(() => {
    reportNow().catch(() => {});
  }, INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

function stopReporter() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (debounce) {
    clearTimeout(debounce);
    debounce = null;
  }
}

module.exports = {
  INTERVAL_MS,
  load,
  save,
  record,
  snapshot,
  payload,
  reportNow,
  startReporter,
  stopReporter,
  identity
};
