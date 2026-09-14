'use strict';
const assert = require('assert');
const express = require('express');
const oauth = require('../src/mcp/oauth');
(async () => {
  oauth.revokeAll();
  const app = express(); app.use(express.json()); app.use(oauth.router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const endpoint = `http://127.0.0.1:${server.address().port}/oauth/token`;
  const verifier = 'test-verifier-'.repeat(5);
  const basic = client => 'Basic ' + Buffer.from(client.client_id + ':' + client.client_secret).toString('base64');
  try {
    assert.throws(() => oauth.registerClient({ redirect_uris: ['http://127.0.0.1/cb'], token_endpoint_auth_method: 'unknown' }), /unsupported/);
    for (const method of ['none', 'client_secret_post', 'client_secret_basic']) {
      const client = oauth.registerClient({ redirect_uris: ['http://127.0.0.1/cb'], token_endpoint_auth_method: method });
      const redirect = oauth.completeAuthorize({ client_id: client.client_id, redirect_uri: client.redirect_uris[0],
        pairing_code: oauth.issuePairing().code, code_challenge: oauth.s256(verifier), code_challenge_method: 'S256' });
      const body = { grant_type: 'authorization_code', code: new URL(redirect).searchParams.get('code'),
        client_id: client.client_id, redirect_uri: client.redirect_uris[0], code_verifier: verifier };
      const post = (payload, authorization) => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) }, body: JSON.stringify(payload) });
      if (method !== 'none') {
        const missing = await post(body);
        assert.strictEqual(missing.status, 401);
        assert.strictEqual((await missing.json()).error, 'invalid_client');
        assert.strictEqual((await post({ ...body, client_secret: 'incorrect' })).status, 401);
      }
      const authenticated = method === 'client_secret_post' ? { ...body, client_secret: client.client_secret } : body;
      const authorization = method === 'client_secret_basic' ? basic(client) : undefined;
      if (authorization) assert.strictEqual((await post({ ...body, client_secret: client.client_secret }, authorization)).status, 401);
      for (const invalidVerifier of ['short', {}, 'x'.repeat(129)]) {
        assert.strictEqual((await post({ ...authenticated, code_verifier: invalidVerifier }, authorization)).status, 400);
      }
      const exchanged = await post(authenticated, authorization);
      assert.strictEqual(exchanged.status, 200, 'bad credentials must not consume authorization code');
      const tokens = await exchanged.json();
      assert.ok(oauth.verifyAccessToken(tokens.access_token));
      const refresh = { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id };
      if (method !== 'none') assert.strictEqual((await post(refresh)).status, 401);
      if (method === 'client_secret_post') refresh.client_secret = client.client_secret;
      const rotated = await post(refresh, authorization);
      assert.strictEqual(rotated.status, 200);
      assert.ok(!oauth.verifyAccessToken(tokens.access_token));
    }
    // Invalid registration must not mutate a full registry or revoke a live client.
    oauth.revokeAll();
    const original = oauth.registerClient({ redirect_uris: ['https://example.com/callback'] });
    const auth = { client_id: original.client_id, redirect_uri: original.redirect_uris[0],
      pairing_code: oauth.issuePairing().code, code_challenge: oauth.s256(verifier) };
    const location = oauth.completeAuthorize(auth);
    const active = oauth.handleToken({ grant_type: 'authorization_code', client_id: original.client_id,
      redirect_uri: auth.redirect_uri, code: new URL(location).searchParams.get('code'), code_verifier: verifier });
    let outsider;
    for (let i = 1; i < 80; i++) outsider = oauth.registerClient({ redirect_uris: ['http://localhost/cb'] });
    assert.throws(() => oauth.registerClient({ redirect_uris: [] }), /redirect_uris/);
    assert.ok(oauth.verifyAccessToken(active.access_token), 'invalid registration must not revoke live tokens');
    assert.throws(() => oauth.registerClient({ redirect_uris: ['https://example.com/cb'] }), err => err.status === 503);
    assert.ok(oauth.verifyAccessToken(active.access_token), 'full registry must preserve live tokens');
    const dateNow = Date.now;
    try {
      Date.now = () => dateNow() + 6 * 60 * 1000;
      oauth.registerClient({ redirect_uris: ['https://example.com/next'] });
      assert.ok(oauth.verifyAccessToken(active.access_token), 'reclaim only idle registrations, not live tokens');
    } finally { Date.now = dateNow; }
    const renewed = oauth.handleToken({ grant_type: 'refresh_token', client_id: original.client_id, refresh_token: active.refresh_token });
    assert.throws(() => oauth.handleToken({ grant_type: 'refresh_token', client_id: outsider.client_id,
      refresh_token: active.refresh_token }), /invalid refresh_token/);
    assert.ok(oauth.verifyAccessToken(renewed.access_token), 'other client cannot revoke a spent token owner');
    assert.throws(() => oauth.handleToken({ grant_type: 'refresh_token', client_id: original.client_id,
      refresh_token: active.refresh_token }), /replay/);
    assert.strictEqual(oauth.verifyAccessToken(renewed.access_token), null, 'same-client replay still revokes tokens');
    oauth.revokeAll();
    for (const uri of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/cb', 'http://example.com/cb',
      'https://user:password@example.com/cb', 'https://example.com/cb#fragment', 'https://example.com/\ncb',
      'https://example.com/' + 'x'.repeat(2048), 12, {}]) {
      assert.throws(() => oauth.registerClient({ redirect_uris: [uri] }), /redirect_uri/);
    }
    assert.throws(() => oauth.registerClient({ redirect_uris: Array(17).fill('https://example.com/cb') }), /redirect_uris/);
    assert.throws(() => oauth.registerClient({ redirect_uris: ['https://example.com/cb'], client_name: 'x'.repeat(257) }), /client_name/);
    for (const uri of ['https://example.com/cb?a=b', 'http://127.0.0.1:8765/cb', 'http://[::1]:8765/cb']) {
      oauth.registerClient({ redirect_uris: [uri] });
    }
    const valid = oauth.registerClient({ redirect_uris: ['https://example.com/cb'] });
    const pending = oauth.issuePairing();
    const request = { client_id: valid.client_id, redirect_uri: valid.redirect_uris[0], pairing_code: pending.code,
      code_challenge: oauth.s256(verifier) };
    for (const patch of [{ code_challenge: '' }, { code_challenge: 'bad' }, { code_challenge_method: 'plain' },
      { response_type: 'token' }, { redirect_uri: 'https://example.com/wrong' }, { state: {} }]) {
      assert.throws(() => oauth.completeAuthorize({ ...request, ...patch }));
      assert.strictEqual(oauth.snapshotPairing().code, pending.code, 'invalid authorization must not consume pairing');
    }
    const attacker = oauth.registerClient({ redirect_uris: ['https://attacker.invalid/cb'] });
    for (let i = 0; i < 6; i++) {
      assert.throws(() => oauth.completeAuthorize({ ...request, client_id: attacker.client_id,
        redirect_uri: attacker.redirect_uris[0], pairing_code: 'WRONG' }));
      assert.strictEqual(oauth.snapshotPairing().code, pending.code, 'another client cannot globally invalidate pairing');
    }
    oauth.completeAuthorize(request);
    assert.strictEqual(oauth.snapshotPairing().code, null);
    const authorize = endpoint.replace('/token', '/authorize');
    const page = await fetch(authorize + '?' + new URLSearchParams({ ...request, pairing_code: '' }));
    assert.strictEqual(page.status, 200);
    assert.strictEqual(oauth.snapshotPairing().code, null, 'public GET must not generate pairing');
    assert.strictEqual((await fetch(authorize + '?client_id=unknown')).status, 400);
    const { config } = require('../src/config');
    const savedOrigin = config.publicTunnelUrl;
    try {
      config.publicTunnelUrl = '';
      const fallback = `http://127.0.0.1:${config.port}`;
      assert.strictEqual(oauth.requestOrigin({ headers: { host: 'attacker.example', 'x-forwarded-host': 'evil.example',
        'x-forwarded-proto': 'https' }, protocol: 'http' }), fallback);
      assert.strictEqual(oauth.requestOrigin({ headers: { host: 'localhost:8765', 'x-forwarded-host': 'evil.example' }, protocol: 'http' }), 'http://localhost:8765');
      assert.strictEqual(oauth.requestOrigin({ headers: { host: 'localhost:8765", forged="x' } }), fallback);
      config.publicTunnelUrl = 'https://trusted.example/';
      assert.strictEqual(oauth.requestOrigin({ headers: { host: 'evil.example' } }), 'https://trusted.example');
      assert.ok(!oauth.wwwAuthenticate('https://evil.example/", forged="yes').includes('forged'));
    } finally { config.publicTunnelUrl = savedOrigin; }
    console.log('OAuth public/secret-post/secret-basic HTTP regressions passed');
  } finally { await new Promise(resolve => server.close(resolve)); oauth.revokeAll(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
