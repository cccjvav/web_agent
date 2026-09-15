/**
 * verify-auth.mjs — 判断 arena.ai 的登录是"真实账户"还是"匿名会话"
 *
 * 方法：在页面上下文里读 cookie → 解码 JWT payload → 调 /api/me 看服务端认可度。
 * 这是决定"能不能发消息"的唯一权威依据。
 */
import { CDP, sleep, evaluate } from './cdp.mjs';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(t => t.type === 'page' && /arena\.ai/.test(t.url));
if (!page) { console.error('找不到页面'); process.exit(1); }

const cdp = await new CDP(page.webSocketDebuggerUrl).connect();
await cdp.send('Runtime.enable');
await sleep(2000);

const r = await evaluate(cdp, `(async () => {
  const out = {};

  // 1. 解码 cookie 里的 JWT
  const m = document.cookie.match(/arena-auth-prod-v1=([^;]+)/);
  out.cookiePresent = Boolean(m);
  if (m) {
    let raw = decodeURIComponent(m[1]);
    out.cookieValueHead = raw.slice(0, 30);
    // 形如 base64-<json>，json 内含 access_token
    let json = null;
    try {
      const b64 = raw.replace(/^base64-/, '');
      json = JSON.parse(atob(b64));
    } catch (e) { out.decodeErr = String(e.message); }
    if (json) {
      out.cookieKeys = Object.keys(json);
      const jwt = json.access_token || '';
      out.jwtParts = jwt.split('.').length;
      if (jwt.split('.').length === 3) {
        try {
          const p = JSON.parse(atob(jwt.split('.').replace(/-/g,'+').replace(/_/g,'/').replace(/=+$/,'')));
          out.jwt = {
            iss: p.iss, sub: p.sub, aud: p.aud, role: p.role,
            email: p.email || null,
            exp: p.exp, expISO: p.exp ? new Date(p.exp*1000).toISOString() : null,
            expired: p.exp ? (Date.now()/1000 > p.exp) : null,
            iat: p.iat, iatISO: p.iat ? new Date(p.iat*1000).toISOString() : null,
            app_metadata: p.app_metadata || null,
            user_metadata: p.user_metadata || null,
          };
        } catch (e) { out.jwtErr = String(e.message); }
      }
      out.hasRefresh = Boolean(json.refresh_token);
    }
  }

  // 2. 服务端是否认这个会话
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    out.apiMe = { status: res.status, body: (await res.text()).slice(0, 500) };
  } catch (e) { out.apiMeErr = String(e.message); }

  // 3. 聊天端点探测
  try {
    const res = await fetch('/api/chat', { method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' }, body: '{}' });
    out.apiChatProbe = { status: res.status, body: (await res.text()).slice(0, 300) };
  } catch (e) { out.apiChatErr = String(e.message); }

  return out;
})()`, true).catch(e => ({ err: e.message }));

console.log(JSON.stringify(r, null, 2));

cdp.close();
process.exit(0);
