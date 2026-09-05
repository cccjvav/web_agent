const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-gh-'));
process.env.WORKSPACE_ROOT = tmp;
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const github = require('../src/auth/github');
const store = require('../src/models/store');

function jsonResp(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
    async json() {
      return body;
    }
  };
}

async function run() {
  github.resetPending();
  store.reset();
  store.patch({
    bridge: {
      loggedIn: true,
      deviceAuthorized: true,
      provider: 'local-demo',
      username: 'local',
      githubId: '',
      license: 'local-demo'
    }
  });

  let threw = false;
  try {
    await github.loginWithToken('   ');
  } catch (err) {
    threw = true;
    assert.strictEqual(err.status, 400);
  }
  assert.ok(threw);

  const fakeFetch = async (url, opts) => {
    if (String(url).includes('api.github.com/user')) {
      const auth = opts && opts.headers && opts.headers.Authorization;
      assert.ok(String(auth).startsWith('Bearer ghp_'));
      return jsonResp(200, { login: 'octocat', id: 1, name: 'The Octocat' });
    }
    throw new Error(`unexpected ${url}`);
  };
  const out = await github.loginWithToken('ghp_test', fakeFetch);
  assert.strictEqual(out.success, true);
  assert.strictEqual(out.provider, 'github');
  assert.strictEqual(out.username, 'octocat');
  const cfg = store.load();
  assert.strictEqual(cfg.bridge.provider, 'github');
  assert.strictEqual(cfg.bridge.githubId, '1');
  assert.strictEqual(cfg.bridge.loggedIn, true);

  github.clearGithubKeepDemo();
  const after = store.load();
  assert.strictEqual(after.bridge.provider, 'local-demo');
  assert.strictEqual(after.bridge.username, 'local');
  assert.strictEqual(after.bridge.githubId, '');

  delete process.env.WEBAGENT_GITHUB_CLIENT_ID;
  assert.strictEqual(github.deviceAvailable(), false);
  threw = false;
  try {
    await github.startDeviceLogin(fakeFetch);
  } catch (err) {
    threw = true;
    assert.strictEqual(err.code, 'E_NO_GITHUB_APP');
  }
  assert.ok(threw);

  process.env.WEBAGENT_GITHUB_CLIENT_ID = 'Iv1.test';
  assert.strictEqual(github.deviceAvailable(), true);
  const deviceFetch = async (url, opts) => {
    if (String(url).includes('/login/device/code')) {
      const body = String(opts.body || '');
      assert.ok(body.includes('client_id=Iv1.test'));
      return jsonResp(200, {
        device_code: 'dev',
        user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5
      });
    }
    if (String(url).includes('/login/oauth/access_token')) {
      const body = String(opts.body || '');
      assert.ok(body.includes('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code'));
      return jsonResp(200, { error: 'authorization_pending' });
    }
    throw new Error(`unexpected ${url}`);
  };
  const started = await github.startDeviceLogin(deviceFetch);
  assert.strictEqual(started.userCode, 'ABCD-1234');
  const pending = await github.pollDeviceLogin(deviceFetch);
  assert.strictEqual(pending.pending, true);

  const doneFetch = async (url) => {
    if (String(url).includes('/login/oauth/access_token')) {
      return jsonResp(200, { access_token: 'ghp_from_device' });
    }
    if (String(url).includes('api.github.com/user')) {
      return jsonResp(200, { login: 'hubber', id: 99, name: 'Hub' });
    }
    throw new Error(`unexpected ${url}`);
  };
  const done = await github.pollDeviceLogin(doneFetch);
  assert.strictEqual(done.done, true);
  assert.strictEqual(done.username, 'hubber');
  assert.strictEqual(store.load().bridge.githubId, '99');

  github.resetPending();
  github.clearGithubKeepDemo();
  delete process.env.WEBAGENT_GITHUB_CLIENT_ID;
  store.reset();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('githubAuth.test.js ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
