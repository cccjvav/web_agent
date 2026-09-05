const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

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

function loadReports(dataDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(reportsFile(dataDir), 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveReports(dataDir, rows) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(reportsFile(dataDir), JSON.stringify(rows, null, 2), 'utf8');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ingest(dataDir, body) {
  const installId = String((body && body.installId) || '').trim();
  if (!installId) {
    const err = new Error('installId required');
    err.status = 400;
    throw err;
  }
  const day = String((body && body.day) || today()).slice(0, 10);
  const githubUser = body && body.githubUser
    ? String(body.githubUser).replace(/^@/, '').trim()
    : '';
  const rec = {
    installId,
    githubUser,
    githubId: body && body.githubId ? String(body.githubId) : '',
    provider: (body && body.provider) || '',
    day,
    toolCalls: Math.max(0, Number(body && body.toolCalls) || 0),
    fail: Math.max(0, Number(body && body.fail) || 0),
    successRate: body && body.successRate == null ? null : Number(body.successRate),
    lastAt: (body && body.lastAt) || new Date().toISOString(),
    reportedAt: new Date().toISOString(),
    product: (body && body.product) || 'Web Agent',
    version: (body && body.version) || ''
  };
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
    body { margin: 0; background: #f6f8fa; }
    main { max-width: 960px; margin: 32px auto; padding: 0 20px 48px; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    .lead { color: #656d76; font-size: 13px; margin: 0 0 16px; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .pill { border: 1px solid #d0d7de; background: #fff; border-radius: 99px; padding: 4px 12px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d0d7de; border-radius: 8px; overflow: hidden; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #d0d7de; font-size: 14px; vertical-align: top; }
    th { color: #656d76; font-weight: 600; font-size: 12px; letter-spacing: .04em; background: #f6f8fa; }
    td.num { font-variant-numeric: tabular-nums; font-weight: 600; }
    tr:last-child td { border-bottom: 0; }
    .local { color: #656d76; }
    .sub { font-size: 11px; color: #8c959f; font-family: ui-monospace, Consolas, monospace; margin-top: 2px; }
    .empty { color: #656d76; text-align: center; }
  </style>
</head>
<body>
  <main>
    <h1>Tool calls 使用统计</h1>
    <p class="lead">客户端每 15 分钟随身份校验上报一次当日 Bridge 工具调用次数，按天累计。成功率来自同一天的失败次数。</p>
    <div class="toolbar"><span></span><span class="pill">${escapeHtml(day)}</span></div>
    <table>
      <thead>
        <tr>
          <th>排名</th>
          <th>GITHUB 用户</th>
          <th>TOOL CALLS</th>
          <th>成功率</th>
          <th>最近上报</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </main>
</body>
</html>`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function bearer(req) {
  const h = String(req.headers.authorization || '');
  if (/^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim();
  return '';
}

function createHandler({ dataDir, token }) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        const day = url.searchParams.get('day') || today();
        const html = renderPage(loadReports(dataDir), day);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, product: 'Web Agent Admin' }));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/stats') {
        const day = url.searchParams.get('day') || today();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ day, rows: rankDay(loadReports(dataDir), day) }));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/report') {
        if (bearer(req) !== token) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'unauthorized' }));
          return;
        }
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
      res.end(JSON.stringify({ error: err.message || String(err) }));
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
