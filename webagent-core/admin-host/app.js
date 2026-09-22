const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const { readBoundedText } = require('../agent-host/src/utils/boundedFile');
const MAX_STORE_BYTES = 4 * 1024 * 1024;
const MAX_REPORTS = 10000;

function defaultDataDir() {
  return process.env.WEBAGENT_ADMIN_DATA
    || path.join(__dirname, 'data');
}

function reportsFile(dataDir) {
  return path.join(dataDir, 'reports.json');
}

function tokenFile(dataDir) {
  return path.join(dataDir, 'admin-token.txt');
}

function ensureToken(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const fromEnv = String(process.env.WEBAGENT_ADMIN_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  const file = tokenFile(dataDir);
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch (_) {}
  const created = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(file, `${created}\n`, 'utf8');
  try {
    fs.chmodSync(file, 0o600);
  } catch (_) {}
  return created;
}

function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function reportString(value, required = false) {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 256
    && !/[\x00-\x1f\x7f]/.test(value) && (!required || Boolean(value.trim()));
}

function validReport(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)
    || !reportString(row.installId, true) || !validDay(row.day)
    || !Number.isSafeInteger(row.toolCalls) || row.toolCalls < 0
    || !Number.isSafeInteger(row.fail) || row.fail < 0 || row.fail > row.toolCalls
    || (row.successRate != null && (typeof row.successRate !== 'number' || !Number.isFinite(row.successRate) || row.successRate < 0 || row.successRate > 100))) return false;
  for (const key of ['githubUser', 'githubId', 'provider', 'lastAt', 'reportedAt', 'product', 'version']) {
    if (row[key] != null && !reportString(row[key])) return false;
  }
  for (const key of ['lastAt', 'reportedAt']) {
    if (!reportString(row[key], true) || !Number.isFinite(Date.parse(row[key]))) return false;
  }
  return true;
}

function storageError() {
  const error = new Error('Statistics storage is unavailable, invalid or over budget. Preserve the original file and repair it explicitly.');
  error.code = 'E_REPORT_STORE';
  error.status = 500;
  return error;
}

function loadReports(dataDir) {
  const file = reportsFile(dataDir);
  let observed = false;
  try {
    // Do not treat a broken link, wrong type, invalid JSON or read error as an empty ledger.
    const stat = fs.lstatSync(file);
    observed = true;
    if (!stat.isFile()) throw storageError();
    const raw = JSON.parse(readBoundedText(file, MAX_STORE_BYTES));
    if (!Array.isArray(raw) || raw.length > MAX_REPORTS || !raw.every(validReport)) throw storageError();
    return raw;
  } catch (error) {
    // Only initial absence is empty. A disappearance after observation is a failed read.
    if (error.code === 'ENOENT' && !observed) return [];
    throw storageError();
  }
}

function saveReports(dataDir, rows) {
  let temporary;
  try {
    const text = JSON.stringify(rows, null, 2);
    if (rows.length > MAX_REPORTS || Buffer.byteLength(text, 'utf8') > MAX_STORE_BYTES) throw storageError();
    fs.mkdirSync(dataDir, { recursive: true });
    temporary = reportsFile(dataDir) + '.tmp.' + crypto.randomBytes(12).toString('hex');
    fs.writeFileSync(temporary, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, reportsFile(dataDir));
  } catch (_) { throw storageError(); }
  finally { if (temporary) { try { fs.unlinkSync(temporary); } catch (_) {} } }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ingest(dataDir, body) {
  const keys = ['installId', 'githubUser', 'githubId', 'provider', 'day', 'toolCalls', 'fail', 'successRate', 'lastAt', 'product', 'version'];
  const bad = () => { const error = new Error('Invalid report: use bounded text, a real ISO day and finite non-negative integer counters.'); error.status = 400; error.code = 'E_BAD_ARGS'; throw error; };
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !keys.includes(key))) bad();
  const rec = {
    installId: body.installId,
    githubUser: body.githubUser ?? '',
    githubId: body.githubId ?? '',
    provider: body.provider ?? '',
    day: body.day === undefined ? today() : body.day,
    toolCalls: body.toolCalls === undefined ? 0 : body.toolCalls,
    fail: body.fail === undefined ? 0 : body.fail,
    successRate: body.successRate ?? null,
    lastAt: body.lastAt ?? new Date().toISOString(),
    reportedAt: new Date().toISOString(),
    product: body.product ?? 'Web Agent',
    version: body.version ?? ''
  };
  if (!validReport(rec)) bad();
  rec.installId = rec.installId.trim();
  rec.githubUser = rec.githubUser.replace(/^@/, '').trim();
  const rows = loadReports(dataDir).filter((r) => !(r.installId === rec.installId && r.day === rec.day));
  rows.push(rec);
  saveReports(dataDir, rows);
  return rec;
}

function rankDay(rows, day) {
  const latest = new Map();
  for (const r of rows) {
    if (r.day !== day) continue;
    const key = r.githubUser ? `gh:${r.githubUser.toLowerCase()}` : `id:${r.installId}`;
    const prev = latest.get(key);
    if (!prev || String(r.reportedAt || r.lastAt) > String(prev.reportedAt || prev.lastAt)) {
      latest.set(key, r);
    }
  }
  return [...latest.values()]
    .sort((a, b) => (b.toolCalls || 0) - (a.toolCalls || 0) || String(a.githubUser || a.installId).localeCompare(String(b.githubUser || b.installId)))
    .map((r, i) => {
      const rate = r.successRate == null && r.toolCalls
        ? Math.round((1 - (r.fail || 0) / r.toolCalls) * 100)
        : r.successRate;
      return {
        rank: i + 1,
        githubUser: r.githubUser || '',
        installId: r.installId,
        toolCalls: r.toolCalls || 0,
        fail: r.fail || 0,
        successRate: rate,
        lastAt: r.reportedAt || r.lastAt || ''
      };
    });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPage(rows, day) {
  const ranked = rankDay(rows, day);
  const body = ranked.length
    ? ranked.map((r) => {
      const user = r.githubUser
        ? `@${escapeHtml(r.githubUser)}`
        : `<span class="local">未绑定 GitHub</span><div class="sub">${escapeHtml(r.installId)}</div>`;
      const rate = r.successRate == null ? '—' : `${r.successRate}%`;
      return `<tr>
        <td>${r.rank}</td>
        <td>${user}</td>
        <td class="num">${r.toolCalls.toLocaleString('en-US')}</td>
        <td class="num">${rate}</td>
        <td>${escapeHtml(String(r.lastAt).replace('T', ' ').slice(0, 19))}</td>
      </tr>`;
    }).join('')
    : '<tr><td colspan="5" class="empty">这一天还没有上报。</td></tr>';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tool calls 使用统计</title>
  <style>
    :root { font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2328; }
    body { margin: 0; background: #f6f8fa; line-height: 1.5; }
    main { max-width: 960px; margin: 32px auto; padding: 0 20px 48px; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    .lead { color: #57606a; font-size: 14px; margin: 0 0 16px; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .pill { border: 1px solid #d0d7de; background: #fff; border-radius: 99px; padding: 4px 12px; font-size: 12px; }
    .scroll-hint { display: none; font-size: 13px; color: #57606a; }
    .table-scroll { overflow-x: auto; border: 1px solid #d0d7de; border-radius: 8px; background: #fff; }
    .table-scroll:focus-visible { outline: 2px solid #0969da; outline-offset: 3px; }
    table { min-width: 620px; width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d0d7de; border-radius: 8px; overflow: hidden; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #d0d7de; font-size: 14px; vertical-align: top; }
    th { white-space: nowrap; color: #57606a; font-weight: 600; font-size: 13px; letter-spacing: .04em; background: #f6f8fa; }
    td.num { font-variant-numeric: tabular-nums; font-weight: 600; }
    tr:last-child td { border-bottom: 0; }
    .local { color: #656d76; }
    .sub { max-width: 240px; overflow-wrap: anywhere; font-size: 12px; color: #57606a; font-family: ui-monospace, Consolas, monospace; margin-top: 2px; }
    .empty { color: #656d76; text-align: center; }
    td:nth-child(2) { max-width: 280px; overflow-wrap: anywhere; }
    @media (max-width: 600px) { .scroll-hint { display: block; } main { margin-top: 20px; padding: 0 16px 32px; } }
  </style>
</head>
<body>
  <main>
    <h1>Tool calls 使用统计</h1>
    <p class="lead">配置上报地址和令牌后，客户端每 15 分钟尝试上报；工具调用也会延后触发。数据由客户端自报，不作为计费或可信审计凭证。</p>
    <div class="toolbar"><span></span><span class="pill">${escapeHtml(day)}</span></div>
    <p class="scroll-hint" id="rank-scroll-hint">窄屏可左右滚动表格，查看调用量、成功率和时间。</p>
    <div class="table-scroll" role="region" aria-label="每日使用排名，可横向滚动" aria-describedby="rank-scroll-hint" tabindex="0">
    <table>
      <thead>
        <tr>
          <th scope="col">排名</th>
          <th scope="col">GITHUB 用户</th>
          <th scope="col">TOOL CALLS</th>
          <th scope="col">成功率</th>
          <th scope="col">最近上报</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    </div>
  </main>
</body>
</html>`;
}

const MAX_BODY_BYTES = 1024 * 1024;

function readBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    let done = false;
    const fail = (err) => {
      if (done) return;
      done = true;
      reject(err);
    };
    req.on('data', (c) => {
      if (done) return;
      n += c.length;
      if (n > maxBytes) {
        const err = new Error('payload too large');
        err.status = 413;
        fail(err);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        const error = new Error('Invalid JSON report body');
        error.status = 400; error.code = 'E_BAD_ARGS'; reject(error);
      }
    });
    req.on('error', fail);
  });
}

function bearer(req) {
  const h = String(req.headers.authorization || '');
  if (/^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim();
  return '';
}

function unauthorized(res) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'unauthorized' }));
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function tokenOk(req, token) {
  return timingSafeEqualString(bearer(req), token);
}

function createHandler({ dataDir, token }) {
  return async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      let url;
      try { url = new URL(req.url, 'http://127.0.0.1'); }
      catch (_) { const error = new Error('Malformed request target'); error.status = 400; error.code = 'E_BAD_ARGS'; throw error; }
      if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, product: 'Web Agent Admin' }));
        return;
      }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        if (!tokenOk(req, token)) return unauthorized(res);
        const day = url.searchParams.get('day') || today();
        const html = renderPage(loadReports(dataDir), day);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/stats') {
        if (!tokenOk(req, token)) return unauthorized(res);
        const day = url.searchParams.get('day') || today();
        const result = JSON.stringify({ day, rows: rankDay(loadReports(dataDir), day) });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(result);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/report') {
        if (!tokenOk(req, token)) return unauthorized(res);
        const body = await readBody(req);
        const rec = ingest(dataDir, body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, rec }));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    } catch (err) {
      const status = err.status || 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || String(err), ...(err.code ? { code: err.code } : {}) }));
    }
  };
}

function createServer(opts = {}) {
  const dataDir = opts.dataDir || defaultDataDir();
  const token = opts.token || ensureToken(dataDir);
  const handler = createHandler({ dataDir, token });
  const server = http.createServer(handler);
  return { server, handler, dataDir, token };
}

module.exports = {
  defaultDataDir,
  ensureToken,
  ingest,
  rankDay,
  loadReports,
  createHandler,
  createServer,
  today
};
