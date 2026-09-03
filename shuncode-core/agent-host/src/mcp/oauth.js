const crypto = require('crypto');
const express = require('express');
const { config } = require('../config');

const router = express.Router();

const clients = new Map();
const authCodes = new Map();
const accessTokens = new Map();
const refreshTokens = new Map();

const PAIRING_TTL_MS = 5 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let pairing = null;

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

function requestOrigin(req) {
  if (config.publicTunnelUrl) return String(config.publicTunnelUrl).replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || `127.0.0.1:${config.port}`).split(',')[0].trim();
  return `${proto}://${host}`;
}

function issuePairing() {
  pairing = {
    code: randomPairingCode(),
    createdAt: now(),
    expiresAt: now() + PAIRING_TTL_MS,
    attempts: 0
  };
  return snapshotPairing();
}

function snapshotPairing() {
  if (!pairing || pairing.expiresAt < now()) {
    return { code: null, expiresInSec: 0, expired: true };
  }
  return {
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

function consumePairing(code) {
  const snap = snapshotPairing();
  if (!pairing || snap.expired) {
    const err = new Error('配对码已过期，请在工作台重新生成');
    err.status = 400;
    throw err;
  }
  pairing.attempts += 1;
  if (pairing.attempts > 5) {
    pairing = null;
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
  return `Bearer realm="ShunCode", resource_metadata="${origin}/.well-known/oauth-protected-resource"`;
}

function registerClient(body = {}) {
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter(Boolean) : [];
  if (!redirectUris.length) {
    const err = new Error('redirect_uris required');
    err.status = 400;
    throw err;
  }
  const clientId = randomToken('sccid_', 12);
  const clientSecret = randomToken('sccsec_', 16);
  const rec = {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: redirectUris,
    client_name: body.client_name || 'mcp-client',
    token_endpoint_auth_method: body.token_endpoint_auth_method || 'none',
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

function verifyAccessToken(token) {
  if (!token) return null;
  if (token === config.secretKey) return { kind: 'secret', clientId: 'url-secret' };
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
  pairing = null;
}

function authorizeHtml(query, error) {
  const q = query || {};
  const err = error ? `<p class="err">${escapeHtml(error)}</p>` : '';
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/><title>ShunCode 配对</title>
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
  <h1>ShunCode 配对</h1>
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

function completeAuthorize(body) {
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
  consumePairing(body.pairing_code);
  const code = randomToken('sccode_', 16);
  authCodes.set(code, {
    clientId: client.client_id,
    redirectUri: body.redirect_uri,
    challenge: body.code_challenge,
    exp: now() + CODE_TTL_MS
  });
  const url = new URL(body.redirect_uri);
  url.searchParams.set('code', code);
  if (body.state) url.searchParams.set('state', body.state);
  return url.toString();
}

function handleToken(body = {}) {
  const grant = body.grant_type;
  if (grant === 'authorization_code') {
    const rec = authCodes.get(body.code);
    if (!rec || rec.exp < now()) {
      const err = new Error('invalid or expired code');
      err.status = 400;
      throw err;
    }
    authCodes.delete(body.code);
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
    if (!body.code_verifier || s256(body.code_verifier) !== rec.challenge) {
      const err = new Error('PKCE verification failed');
      err.status = 400;
      throw err;
    }
    const issued = issueAccess(rec.clientId);
    return tokenResponse(issued);
  }
  if (grant === 'refresh_token') {
    const rec = refreshTokens.get(body.refresh_token);
    if (!rec || rec.refreshExp < now()) {
      const err = new Error('invalid refresh_token');
      err.status = 400;
      throw err;
    }
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

function sendError(res, err) {
  const status = err.status || 500;
  res.status(status).json({ error: status === 400 ? 'invalid_request' : 'server_error', error_description: err.message });
}

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
    res.status(201).json(registerClient(req.body || {}));
  } catch (err) {
    sendError(res, err);
  }
}
router.post('/oauth/register', registerHandler);
router.post('/register', registerHandler);

router.get('/oauth/authorize', (req, res) => {
  ensurePairing();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(authorizeHtml(req.query));
});

router.post('/oauth/authorize', (req, res) => {
  try {
    const loc = completeAuthorize(req.body || {});
    res.redirect(302, loc);
  } catch (err) {
    res.status(err.status || 400);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(authorizeHtml(req.body, err.message));
  }
});

router.post('/oauth/token', (req, res) => {
  try {
    res.json(handleToken(req.body || {}));
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/oauth/revoke', (req, res) => {
  const token = (req.body && (req.body.token || req.body.access_token)) || '';
  accessTokens.delete(token);
  refreshTokens.delete(token);
  res.status(200).json({ revoked: true });
});

module.exports = {
  router,
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
  s256
};
