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
    console.log('OAuth public/secret-post/secret-basic HTTP regressions passed');
  } finally { await new Promise(resolve => server.close(resolve)); oauth.revokeAll(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
