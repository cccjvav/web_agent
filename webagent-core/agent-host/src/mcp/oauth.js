const crypto = require('crypto');
const express = require('express');
const { config } = require('../config');
const store = require('../models/store');

const router = express.Router();

const clients = new Map();
const authCodes = new Map();
const accessTokens = new Map();
const refreshTokens = new Map();
const spentRefresh = new Map();

const PAIRING_TTL_MS = 5 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CLIENTS = 80;
// spentRefresh is the replay-detection tombstone set. Entries only expire after REFRESH_TTL_MS,
// so a paired client that keeps rotating its refresh token adds one permanent-ish entry per call
// with nothing to evict it: at the /oauth/token rate limit of 60/min sustained over the 7 day TTL
// that is ~604800 entries (~109MB measured). Every other store here is bounded (MAX_CLIENTS,
// the 1000-key rate limiter), so this one was the outlier. Cap it and drop oldest-first.
// Consequence of eviction, stated plainly: replaying a refresh token whose tombstone has been
// evicted is reported as a plain invalid_grant instead of triggering revokeClientTokens. The
// token is still refused either way -- what is lost is the extra punitive revocation, not the
// rejection. Bounding memory is worth that, and the cap is far above real client behaviour.
const MAX_SPENT_REFRESH = 5000;

let pairing = null;

// OAuth pairing is opt-in (user decision 2026-09-25). URL-secret clients such as Arena never use it,
// yet its discovery/register/authorize/token/revoke endpoints were reachable on every tunnel. While
// off: those endpoints 404, issued OAuth tokens stop authenticating, 401s no longer point clients at
// OAuth discovery, and Bridge start issues no pairing code. The URL secret is unaffected. The flag
// lives in config.json (bridge.oauthEnabled, default false) and is cached on the store revision
// like the Bridge permission policy, because verifyAccessToken runs on every MCP request.
let enabledCache = null;
function oauthEnabled() {
  let enabled = false;
  try {
    const key = store.revisionKey();
    if (!enabledCache || enabledCache.key !== key) {
      enabledCache = { key, enabled: store.load().bridge.oauthEnabled === true };
    }
    enabled = enabledCache.enabled;
  } catch (_) {
    // A corrupt/unreadable config.json fails closed for OAuth only, and is not cached. This gate sits
    // in front of every /mcp request; letting it throw turned URL-secret requests (which never read
    // config.json before the switch) into generic 500s. The store error still surfaces where the
    // config is actually needed (initialize, permissions, the workbench).
    enabledCache = null;
  }
  // A flag turned off by editing config.json directly must not leave live grants behind that would
  // revive if it were turned on again: drop in-memory OAuth state the first time "off" is observed.
  if (!enabled && (clients.size || accessTokens.size || refreshTokens.size || authCodes.size || pairing)) {
    revokeAll();
  }
  return enabled;
}

function setOauthEnabled(enabled) {
  const on = enabled === true;
  store.patch({ bridge: { oauthEnabled: on } });
  if (!on) revokeAll();
  else if (config.bridgeRunning) ensurePairing();
  return snapshotPairing();
}

function now() {
  return Date.now();
}

function randomToken(prefix, bytes = 24) {
  return `${prefix}${crypto.randomBytes(bytes).toString('hex')}`;
}

function randomPairingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = crypto.randomBytes(8);
  return [...buf].map((b) => alphabet[b % alphabet.length]).join('');
}

function safeOrigin(value) {
  if (typeof value !== 'string' || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch (_) { return null; }
}

function requestOrigin(req) {
  const configured = safeOrigin(config.publicTunnelUrl);
  if (configured) return configured;
  // Remote discovery must use the tunnel origin configured by the local control plane.
  // Never trust arbitrary Host or forwarded headers to select an OAuth issuer.
  const host = req.headers && req.headers.host;
  const local = safeOrigin(`${req.protocol === 'https' ? 'https' : 'http'}://${host || ''}`);
  if (local && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(local).hostname)) return local;
  return `http://127.0.0.1:${config.port}`;
}

function issuePairing() {
  if (!oauthEnabled()) return snapshotPairing();
  pairing = {
    code: randomPairingCode(),
    createdAt: now(),
    expiresAt: now() + PAIRING_TTL_MS,
    attempts: new Map()
  };
  return snapshotPairing();
}

function snapshotPairing() {
  const enabled = oauthEnabled();
  if (!enabled || !pairing || pairing.expiresAt < now()) {
    return { enabled, code: null, expiresInSec: 0, expired: true };
  }
  return {
    enabled,
    code: pairing.code,
    expiresInSec: Math.max(0, Math.round((pairing.expiresAt - now()) / 1000)),
    expired: false
  };
}

function ensurePairing() {
  const snap = snapshotPairing();
  if (snap.expired || !snap.code) return issuePairing();
  return snap;
}

function consumePairing(code, clientId = 'direct') {
  const snap = snapshotPairing();
  if (!pairing || snap.expired) {
    const err = new Error('配对码已过期，请在工作台重新生成');
    err.status = 400;
    throw err;
  }
  const attempts = (pairing.attempts.get(clientId) || 0) + 1;
  pairing.attempts.set(clientId, attempts);
  if (attempts > 5) {
    const err = new Error('配对码尝试次数过多');
    err.status = 429;
    throw err;
  }
  if (String(code || '').trim().toUpperCase() !== pairing.code) {
    const err = new Error('配对码不正确');
    err.status = 400;
    throw err;
  }
  pairing = null;
  return true;
}

function authorizationServerMetadata(origin) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: ['mcp', 'openid']
  };
}

function protectedResourceMetadata(origin) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp']
  };
}

function wwwAuthenticate(origin) {
  if (!oauthEnabled()) return 'Bearer realm="Web Agent"';
  const trusted = safeOrigin(origin) || `http://127.0.0.1:${config.port}`;
  return `Bearer realm="Web Agent", resource_metadata="${trusted}/.well-known/oauth-protected-resource"`;
}

function pruneExpiredTokens() {
  const t = now();
  for (const [tok, rec] of accessTokens) {
    if (rec.accessExp < t) accessTokens.delete(tok);
  }
  for (const [tok, rec] of refreshTokens) {
    if (rec.refreshExp < t) refreshTokens.delete(tok);
  }
  for (const [tok, rec] of spentRefresh) {
    if (t - rec.at > REFRESH_TTL_MS) spentRefresh.delete(tok);
  }
  for (const [code, rec] of authCodes) {
    if (rec.exp < t) authCodes.delete(code);
  }
}

function rememberSpentRefresh(token, clientId) {
  // Map preserves insertion order, so the first key is the oldest tombstone.
  spentRefresh.set(token, { clientId, at: now() });
  while (spentRefresh.size > MAX_SPENT_REFRESH) {
    const oldest = spentRefresh.keys().next();
    if (oldest.done) break;
    spentRefresh.delete(oldest.value);
  }
}

function revokeClientTokens(clientId) {
  for (const [tok, rec] of accessTokens) {
    if (rec.clientId === clientId) accessTokens.delete(tok);
  }
  for (const [tok, rec] of refreshTokens) {
    if (rec.clientId === clientId) refreshTokens.delete(tok);
  }
}

function pruneClients() {
  pruneExpiredTokens();
  if (clients.size < MAX_CLIENTS) return;
  const protectedIds = new Set();
  for (const records of [authCodes, accessTokens, refreshTokens]) {
    for (const rec of records.values()) protectedIds.add(rec.clientId);
  }
  for (const [id, rec] of clients) {
    if (!protectedIds.has(id) && now() - rec.createdAt > CODE_TTL_MS) {
      clients.delete(id);
      if (clients.size < MAX_CLIENTS) return;
    }
  }
  const err = new Error('client registration capacity reached; retry later');
  err.status = 503;
  err.oauthError = 'temporarily_unavailable';
  throw err;
}

function validateRedirectUri(value) {
  const reject = () => { const err = new Error('invalid redirect_uri'); err.status = 400; throw err; };
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\s\\#]/.test(value)) return reject();
  let url;
  try { url = new URL(value); } catch (_) { return reject(); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || !url.hostname ||
    !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) return reject();
  return url;
}

function registerClient(body = {}) {
  const method = body.token_endpoint_auth_method || 'none';
  if (!['none', 'client_secret_post', 'client_secret_basic'].includes(method)) {
    const err = new Error('unsupported token_endpoint_auth_method'); err.status = 400; throw err;
  }
  if (!Array.isArray(body.redirect_uris) || !body.redirect_uris.length || body.redirect_uris.length > 16) {
    const err = new Error('redirect_uris must contain 1 to 16 URLs'); err.status = 400; throw err;
  }
  const redirectUris = body.redirect_uris.slice();
  for (const uri of redirectUris) validateRedirectUri(uri);
  if (body.client_name != null && (typeof body.client_name !== 'string' || body.client_name.length > 256)) {
    const err = new Error('invalid client_name'); err.status = 400; throw err;
  }
  // No registry mutation until the entire request is validated.
  pruneClients();
  const clientId = randomToken('sccid_', 12);
  const clientSecret = randomToken('sccsec_', 16);
  const rec = {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: redirectUris,
    client_name: body.client_name || 'mcp-client',
    token_endpoint_auth_method: method,
    createdAt: now()
  };
  clients.set(clientId, rec);
  return {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: rec.token_endpoint_auth_method,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code']
  };
}

function s256(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function issueAccess(clientId) {
  const access = randomToken('scat_', 20);
  const refresh = randomToken('scrt_', 20);
  const rec = {
    clientId,
    access,
    refresh,
    accessExp: now() + ACCESS_TTL_MS,
    refreshExp: now() + REFRESH_TTL_MS
  };
  accessTokens.set(access, rec);
  refreshTokens.set(refresh, rec);
  return rec;
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyAccessToken(token) {
  if (!token) return null;
  if (timingSafeEqualString(token, config.secretKey)) return { kind: 'secret', clientId: 'url-secret' };
  if (!oauthEnabled()) return null;
  pruneExpiredTokens();
  const rec = accessTokens.get(token);
  if (!rec) return null;
  if (rec.accessExp < now()) {
    accessTokens.delete(token);
    return null;
  }
  return { kind: 'oauth', clientId: rec.clientId };
}

function revokeAll() {
  clients.clear();
  authCodes.clear();
  accessTokens.clear();
  refreshTokens.clear();
  spentRefresh.clear();
  pairing = null;
  rateHits.clear();
}

function authorizeHtml(query, error) {
  const q = query || {};
  const err = error ? `<p class="err">${escapeHtml(error)}</p>` : '';
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/><title>Web Agent 配对</title>
<style>
  body{font-family:Segoe UI,sans-serif;background:#1f1f1f;color:#ddd;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  form{background:#252526;border:1px solid #333;border-radius:8px;padding:24px;width:min(420px,92vw)}
  h1{font-size:18px;margin:0 0 8px;color:#fff}
  p{font-size:13px;color:#aaa;line-height:1.45}
  input{width:100%;padding:8px;border-radius:4px;border:1px solid #3c3c3c;background:#3c3c3c;color:#fff;font-size:16px;letter-spacing:.12em;text-transform:uppercase}
  button{margin-top:12px;background:#0e639c;border:0;color:#fff;padding:8px 14px;border-radius:4px;cursor:pointer}
  .err{color:#f14c4c}
</style></head><body>
<form method="post" action="/oauth/authorize">
  <h1>Web Agent 配对</h1>
  <p>在本机工作台 Bridge 页看配对码，填在这里。配对码 5 分钟有效，用过即废。模型看不到长期密钥。</p>
  ${err}
  <input name="pairing_code" autocomplete="one-time-code" required placeholder="配对码" />
  <input type="hidden" name="client_id" value="${escapeHtml(q.client_id || '')}" />
  <input type="hidden" name="redirect_uri" value="${escapeHtml(q.redirect_uri || '')}" />
  <input type="hidden" name="state" value="${escapeHtml(q.state || '')}" />
  <input type="hidden" name="code_challenge" value="${escapeHtml(q.code_challenge || '')}" />
  <input type="hidden" name="code_challenge_method" value="${escapeHtml(q.code_challenge_method || 'S256')}" />
  <input type="hidden" name="response_type" value="code" />
  <button type="submit">确认配对</button>
</form></body></html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function validateAuthorize(body) {
  const client = clients.get(body.client_id);
  if (!client) {
    const err = new Error('unknown client_id');
    err.status = 400;
    throw err;
  }
  if (!client.redirect_uris.includes(body.redirect_uri)) {
    const err = new Error('redirect_uri mismatch');
    err.status = 400;
    throw err;
  }
  if (String(body.code_challenge_method || 'S256') !== 'S256') {
    const err = new Error('only S256 PKCE is supported');
    err.status = 400;
    throw err;
  }
  if ((body.response_type != null && body.response_type !== 'code') ||
    typeof body.code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.code_challenge) ||
    (body.state != null && (typeof body.state !== 'string' || body.state.length > 2048))) {
    const err = new Error('invalid authorization parameters'); err.status = 400; throw err;
  }
  return { client, url: validateRedirectUri(body.redirect_uri) };
}

function completeAuthorize(body) {
  const { client, url } = validateAuthorize(body);
  consumePairing(body.pairing_code, client.client_id);
  const code = randomToken('sccode_', 16);
  authCodes.set(code, {
    clientId: client.client_id,
    redirectUri: body.redirect_uri,
    challenge: body.code_challenge,
    exp: now() + CODE_TTL_MS
  });
  url.searchParams.set('code', code);
  if (body.state) url.searchParams.set('state', body.state);
  return url.toString();
}

function authenticateClient(body, authorization = '', inferredId) {
  let clientId = body.client_id || inferredId;
  let secret = body.client_secret;
  let method = secret == null ? 'none' : 'client_secret_post';
  const reject = () => { const err = new Error('client authentication failed'); err.status = 401; err.oauthError = 'invalid_client'; throw err; };
  if (authorization) {
    if (secret != null || !/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(authorization)) return reject();
    try {
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      if (colon < 1) return reject();
      const decode = value => decodeURIComponent(value.replace(/\+/g, ' '));
      const id = decode(decoded.slice(0, colon));
      if (body.client_id && body.client_id !== id) return reject();
      clientId = id;
      secret = decode(decoded.slice(colon + 1));
      method = 'client_secret_basic';
    } catch (_) { return reject(); }
  }
  const client = clients.get(clientId);
  if (!client || client.token_endpoint_auth_method !== method) return reject();
  if (method !== 'none' && (typeof secret !== 'string' || !timingSafeEqualString(secret, client.client_secret))) return reject();
  return clientId;
}

function handleToken(body = {}, authorization = '') {
  pruneExpiredTokens();
  const tokenRecord = refreshTokens.get(body.refresh_token) || spentRefresh.get(body.refresh_token);
  const clientId = authenticateClient(body, authorization, tokenRecord && tokenRecord.clientId);
  body = { ...body, client_id: clientId };
  const grant = body.grant_type;
  if (grant === 'authorization_code') {
    const rec = authCodes.get(body.code);
    if (!rec || rec.exp < now()) {
      const err = new Error('invalid or expired code');
      err.status = 400;
      throw err;
    }
    if (rec.clientId !== body.client_id) {
      const err = new Error('client_id mismatch');
      err.status = 400;
      throw err;
    }
    if (rec.redirectUri !== body.redirect_uri) {
      const err = new Error('redirect_uri mismatch');
      err.status = 400;
      throw err;
    }
    if (typeof body.code_verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier) || s256(body.code_verifier) !== rec.challenge) {
      const err = new Error('PKCE verification failed');
      err.status = 400;
      throw err;
    }
    authCodes.delete(body.code);
    const issued = issueAccess(rec.clientId);
    return tokenResponse(issued);
  }
  if (grant === 'refresh_token') {
    const presented = body.refresh_token;
    const rec = refreshTokens.get(presented);
    if (!rec || rec.refreshExp < now()) {
      const spent = spentRefresh.get(presented);
      if (spent && spent.clientId === clientId) {
        revokeClientTokens(spent.clientId);
        const replay = new Error('refresh_token replay detected; tokens for this client were revoked');
        replay.status = 400;
        throw replay;
      }
      const err = new Error('invalid refresh_token');
      err.status = 400;
      throw err;
    }
    if (body.client_id && rec.clientId !== body.client_id) {
      const err = new Error('client_id mismatch');
      err.status = 400;
      throw err;
    }
    rememberSpentRefresh(rec.refresh, rec.clientId);
    accessTokens.delete(rec.access);
    refreshTokens.delete(rec.refresh);
    const issued = issueAccess(rec.clientId);
    return tokenResponse(issued);
  }
  const err = new Error('unsupported grant_type');
  err.status = 400;
  throw err;
}

function tokenResponse(issued) {
  return {
    access_token: issued.access,
    token_type: 'Bearer',
    expires_in: Math.round(ACCESS_TTL_MS / 1000),
    refresh_token: issued.refresh,
    scope: 'mcp'
  };
}

const rateHits = new Map();

function clientIp(req) {
  // Express derives req.ip from its explicitly configured trust-proxy policy.
  // Never fall back to an attacker-supplied forwarding header.
  return String(req?.ip || req?.socket?.remoteAddress || 'local');
}

function rateLimit(key, max, windowMs) {
  const t = now();
  for (const [id, hit] of rateHits) {
    if (hit.expiresAt <= t) rateHits.delete(id);
  }
  if (!rateHits.has(key) && rateHits.size >= 1000) {
    const earliest = Math.min(...Array.from(rateHits.values(), hit => hit.expiresAt));
    const err = new Error('rate limiter capacity reached');
    err.status = 429; err.retryAfter = Math.max(1, Math.ceil((earliest - t) / 1000));
    throw err;
  }
  const rec = rateHits.get(key) || { n: 0, start: t, expiresAt: t + windowMs };
  if (rec.n >= max) {
    const err = new Error('too many requests');
    err.status = 429; err.retryAfter = Math.max(1, Math.ceil((rec.expiresAt - t) / 1000));
    throw err; // Rejected requests do not increment or renew this window.
  }
  rec.n += 1;
  rateHits.set(key, rec);
}

function retryHeader(res, err) {
  if (err.status === 429 && Number.isSafeInteger(err.retryAfter) && err.retryAfter > 0) {
    res.setHeader('Retry-After', String(err.retryAfter));
  }
}

function sendError(res, err) {
  retryHeader(res, err);
  const status = err.status || 500;
  if (status === 401) res.setHeader('WWW-Authenticate', 'Basic realm="Web Agent OAuth"');
  const error = err.oauthError || (status === 429 ? 'slow_down' : status === 400 ? 'invalid_request' : 'server_error');
  res.status(status).json({ error, error_description: err.message });
}

// While OAuth is off every route below is skipped, so the request falls through to the app's 404.
router.use((req, res, next) => (oauthEnabled() ? next() : next('router')));

router.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json(authorizationServerMetadata(requestOrigin(req)));
});
router.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json(protectedResourceMetadata(requestOrigin(req)));
});
router.get('/.well-known/oauth-protected-resource/mcp', (req, res) => {
  res.json(protectedResourceMetadata(requestOrigin(req)));
});

function registerHandler(req, res) {
  try {
    rateLimit(`reg:${clientIp(req)}`, 20, 60 * 1000);
    res.status(201).json(registerClient(req.body || {}));
  } catch (err) {
    sendError(res, err);
  }
}
router.post('/oauth/register', registerHandler);
router.post('/register', registerHandler);

router.get('/oauth/authorize', (req, res) => {
  try {
    rateLimit(`auth:${clientIp(req)}`, 30, 60 * 1000);
    validateAuthorize(req.query);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(authorizeHtml(req.query, snapshotPairing().expired ? '请先在本机工作台生成配对码' : ''));
  } catch (err) { sendError(res, err); }
});

router.post('/oauth/authorize', (req, res) => {
  try {
    rateLimit(`auth:${clientIp(req)}`, 30, 60 * 1000);
    const loc = completeAuthorize(req.body || {});
    res.redirect(302, loc);
  } catch (err) {
    retryHeader(res, err);
    res.status(err.status || 400);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(authorizeHtml(req.body, err.message));
  }
});

router.post('/oauth/token', (req, res) => {
  try {
    rateLimit(`tok:${clientIp(req)}`, 60, 60 * 1000);
    res.json(handleToken(req.body || {}, req.headers.authorization || ''));
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/oauth/revoke', (req, res) => {
  try {
    const body = req.body || {};
    const token = body.token || body.access_token || '';
    const rec = accessTokens.get(token) || refreshTokens.get(token);
    const clientId = authenticateClient(body, req.headers.authorization || '', rec && rec.clientId);
    if (rec && rec.clientId === clientId) {
      accessTokens.delete(rec.access);
      refreshTokens.delete(rec.refresh);
    }
    res.status(200).json({ revoked: true });
  } catch (err) { sendError(res, err); }
});

module.exports = {
  router,
  oauthEnabled,
  setOauthEnabled,
  requestOrigin,
  authorizationServerMetadata,
  protectedResourceMetadata,
  wwwAuthenticate,
  registerClient,
  completeAuthorize,
  handleToken,
  verifyAccessToken,
  issuePairing,
  ensurePairing,
  snapshotPairing,
  consumePairing,
  revokeAll,
  s256,
  MAX_SPENT_REFRESH,
  // Test-only view of the replay tombstone set size. Exposing the count (not the tokens) lets the
  // budget test assert the bound directly instead of inferring it from heap growth, which is not
  // reliable without --expose-gc.
  spentRefreshSize: () => spentRefresh.size
};
