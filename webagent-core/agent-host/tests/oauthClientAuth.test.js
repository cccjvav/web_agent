'use strict';
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');
const tracker = require('../src/usage/tracker');
const oauth = require('../src/mcp/oauth');
function metadataRequest(server, route, headers, body) {
  // Use node:http: fetch may replace a supplied Host, which would weaken this fixture.
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: route,
      method: body === undefined ? 'GET' : 'POST', headers }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('error', reject);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(text) }); }
        catch (error) { reject(error); }
      });
    });
    req.setTimeout(3000, () => req.destroy(new Error('metadata request timed out')));
    req.on('error', reject); req.end(body);
  });
}
(async () => {
  oauth.revokeAll();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-oauth-boundaries-'));
  config.workspaceRoot = tmp; config.host = '127.0.0.1'; config.port = 0; config.workbenchPort = 0;
  require('../src/mcp/oauth').setOauthEnabled(true); // OAuth pairing is opt-in (2026-09-25); this test exercises it.
  const { uiServer, mcpServer: server } = require('../src/index');
  await Promise.all([uiServer, server].map(s => s.listening ? null : new Promise(resolve => s.once('listening', resolve))));
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
      const current = await rotated.json();
      const ping = token => fetch(endpoint.replace('/oauth/token', '/mcp'), { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 39, method: 'ping' }) });
      const accepted = await ping(current.access_token);
      assert.strictEqual(accepted.status, 200);
      assert.ok((await accepted.json()).result);

      const revoke = (payload, auth = authorization) => fetch(endpoint.replace('/token', '/revoke'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(payload)
      });
      const credentials = { client_id: client.client_id, ...(method === 'client_secret_post' ? { client_secret: client.client_secret } : {}) };
      const outsider = oauth.registerClient({ redirect_uris: ['http://localhost/other'] });
      const wrongRefresh = await post({ grant_type: 'refresh_token', client_id: outsider.client_id, refresh_token: current.refresh_token });
      assert.strictEqual(wrongRefresh.status, 400);
      await wrongRefresh.json();
      assert.ok(oauth.verifyAccessToken(current.access_token), 'wrong-client refresh must not consume the pair');
      const wrongOwner = await revoke({ client_id: outsider.client_id, token: current.refresh_token }, '');
      assert.strictEqual(wrongOwner.status, 200);
      await wrongOwner.json();
      assert.ok(oauth.verifyAccessToken(current.access_token), 'another authenticated client cannot revoke this pair');
      if (method !== 'none') {
        const badAuth = await revoke({ client_id: client.client_id, token: current.access_token }, '');
        assert.strictEqual(badAuth.status, 401);
        assert.strictEqual((await badAuth.json()).error, 'invalid_client');
        assert.ok(oauth.verifyAccessToken(current.access_token), 'failed revocation auth must preserve tokens');
      }
      const unknown = await revoke({ ...credentials, token: 'unknown-test-token' });
      assert.strictEqual(unknown.status, 200);
      assert.deepStrictEqual(await unknown.json(), { revoked: true });
      assert.ok(oauth.verifyAccessToken(current.access_token));
      const revoked = await revoke({ ...credentials, token: method === 'client_secret_post' ? current.refresh_token : current.access_token });
      assert.strictEqual(revoked.status, 200);
      assert.deepStrictEqual(await revoked.json(), { revoked: true });
      assert.strictEqual(oauth.verifyAccessToken(current.access_token), null);
      const rejected = await ping(current.access_token);
      assert.strictEqual(rejected.status, 401, 'revoked access must fail the production MCP gate');
      await rejected.json();
      const afterRevoke = await post({ ...refresh, refresh_token: current.refresh_token }, authorization);
      assert.strictEqual(afterRevoke.status, 400, 'revoking either known token deletes the pair');
      await afterRevoke.json();
      const staticSecret = await revoke({ ...credentials, token: config.secretKey });
      assert.strictEqual(staticSecret.status, 200);
      await staticSecret.json();
      assert.strictEqual(oauth.verifyAccessToken(config.secretKey).kind, 'secret', 'OAuth revoke must not rotate the independent URL secret');
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
      // Real production discovery and early 401 use the same trusted issuer.
      const base = endpoint.replace('/oauth/token', '');
      for (const configured of ['', 'https://trusted.example/', 'https://bad.example/path']) {
        config.publicTunnelUrl = configured;
        const expected = configured === 'https://trusted.example/' ? 'https://trusted.example' : fallback;
        const headers = { Host: 'attacker.example', 'X-Forwarded-Host': 'forged.example', 'X-Forwarded-Proto': 'https' };
        for (const route of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
          const response = await metadataRequest(server, route, headers);
          assert.strictEqual(response.status, 200);
          const metadata = response.json;
          if (metadata.issuer) {
            assert.strictEqual(metadata.issuer, expected);
            assert.strictEqual(metadata.token_endpoint, expected + '/oauth/token');
          } else {
            assert.strictEqual(metadata.resource, expected + '/mcp');
            assert.deepStrictEqual(metadata.authorization_servers, [expected]);
          }
        }
        const challenged = await metadataRequest(server, '/mcp', { ...headers, 'Content-Type': 'application/json' }, '{');
        assert.strictEqual(challenged.status, 401);
        assert.strictEqual(challenged.headers['www-authenticate'], oauth.wwwAuthenticate(expected));

      }
      config.publicTunnelUrl = '';
      const local = await metadataRequest(server, '/.well-known/oauth-authorization-server', { Host: 'localhost:8765', 'X-Forwarded-Proto': 'https' });
      assert.strictEqual(local.json.issuer, 'http://localhost:8765');
      // Full authorize POST -> code -> form token exchange, with redirects disabled:
      // never contact the callback host or convert a failed request into a retry.
      const client = oauth.registerClient({ redirect_uris: ['https://callback.example/cb'] });
      const pair = oauth.issuePairing();
      const state = '"><script>test</script>';
      const form = { client_id: client.client_id, redirect_uri: client.redirect_uris[0], pairing_code: pair.code,
        code_challenge: oauth.s256(verifier), code_challenge_method: 'S256', response_type: 'code', state };
      const invalid = await fetch(base + '/oauth/authorize', { method: 'POST', redirect: 'manual',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...form, redirect_uri: 'https://wrong.example/cb' }) });
      assert.strictEqual(invalid.status, 400);
      assert.strictEqual(invalid.headers.get('location'), null);
      const html = await invalid.text();
      assert.ok(!html.includes('<script>test</script>'));
      assert.ok(html.includes('&lt;script&gt;test&lt;/script&gt;'));
      assert.ok(!html.includes(pair.code), 'error HTML must not reflect the supplied pairing code');
      assert.strictEqual(oauth.snapshotPairing().code, pair.code);
      const allowed = await fetch(base + '/oauth/authorize', { method: 'POST', redirect: 'manual',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) });
      assert.strictEqual(allowed.status, 302);
      const location = new URL(allowed.headers.get('location'));
      assert.strictEqual(location.origin, 'https://callback.example');
      assert.strictEqual(location.pathname, '/cb');
      assert.strictEqual(location.searchParams.get('state'), state);
      await allowed.text();
      assert.strictEqual(oauth.snapshotPairing().code, null);
      const exchangeBody = new URLSearchParams({ grant_type: 'authorization_code', client_id: client.client_id,
        code: location.searchParams.get('code'), redirect_uri: form.redirect_uri, code_verifier: verifier });
      const exchange = () => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: exchangeBody });
      const exchanged = await exchange();
      assert.strictEqual(exchanged.status, 200);
      const access = (await exchanged.json()).access_token;
      assert.ok(oauth.verifyAccessToken(access));
      const duplicate = await exchange();
      assert.strictEqual(duplicate.status, 400);
      await duplicate.json();
      assert.ok(oauth.verifyAccessToken(access), 'failed code reuse does not revoke the issued access token');

    } finally { config.publicTunnelUrl = savedOrigin; }
    console.log('OAuth public/secret-post/secret-basic HTTP regressions passed');
  } finally {
    tracker.stopReporter();
    await Promise.all([uiServer, server].map(s => new Promise(resolve => s.close(resolve))));
    oauth.revokeAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
