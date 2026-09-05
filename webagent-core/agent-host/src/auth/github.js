const store = require('../models/store');

let pendingDevice = null;

function githubClientId() {
  return String(process.env.WEBAGENT_GITHUB_CLIENT_ID || '').trim();
}

function githubClientSecret() {
  return String(process.env.WEBAGENT_GITHUB_CLIENT_SECRET || '').trim();
}

function deviceAvailable() {
  return Boolean(githubClientId());
}

async function fetchGitHubUser(token, fetchFn = fetch) {
  const resp = await fetchFn('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Web-Agent'
    }
  });
  const raw = await resp.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
  if (!resp.ok) {
    const err = new Error(`GitHub 拒绝该令牌（HTTP ${resp.status}）。需要 read:user 权限。`);
    err.status = resp.status;
    throw err;
  }
  const login = String(data.login || '').trim();
  if (!login) {
    const err = new Error('GitHub 未返回用户名');
    err.status = 502;
    throw err;
  }
  return {
    login,
    id: String(data.id || ''),
    name: String(data.name || login)
  };
}

function applyGithubUser(user) {
  store.patch({
    bridge: {
      loggedIn: true,
      deviceAuthorized: true,
      provider: 'github',
      username: user.login,
      githubId: user.id,
      license: 'github'
    }
  });
  return {
    success: true,
    provider: 'github',
    username: user.login,
    githubId: user.id
  };
}

function clearGithubKeepDemo() {
  pendingDevice = null;
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
}

async function loginWithToken(token, fetchFn = fetch) {
  const trimmed = String(token || '').trim();
  if (!trimmed) {
    const err = new Error('请粘贴 GitHub Personal Access Token（read:user）');
    err.status = 400;
    throw err;
  }
  const user = await fetchGitHubUser(trimmed, fetchFn);
  return applyGithubUser(user);
}

async function startDeviceLogin(fetchFn = fetch) {
  const clientId = githubClientId();
  if (!clientId) {
    const err = new Error('未设置 WEBAGENT_GITHUB_CLIENT_ID。也可改用令牌验证。');
    err.code = 'E_NO_GITHUB_APP';
    err.status = 400;
    throw err;
  }
  const params = new URLSearchParams({ client_id: clientId, scope: 'read:user' });
  const secret = githubClientSecret();
  if (secret) params.set('client_secret', secret);
  const resp = await fetchFn('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Web-Agent'
    },
    body: params
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.device_code || !data.user_code) {
    const err = new Error(data.error_description || data.error || `无法开始 GitHub 设备码登录（HTTP ${resp.status}）`);
    err.status = 400;
    throw err;
  }
  pendingDevice = {
    deviceCode: data.device_code,
    interval: Math.max(5, Number(data.interval) || 5),
    expiresAt: Date.now() + (Number(data.expires_in) || 900) * 1000,
    userCode: data.user_code
  };
  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri || 'https://github.com/login/device',
    verificationUriComplete: data.verification_uri_complete || '',
    interval: pendingDevice.interval,
    expiresIn: Number(data.expires_in) || 900
  };
}

async function pollDeviceLogin(fetchFn = fetch) {
  if (!pendingDevice) return { pending: false, done: false, error: '没有进行中的设备码登录' };
  if (Date.now() > pendingDevice.expiresAt) {
    pendingDevice = null;
    return { pending: false, done: false, error: '设备码已过期，请重新开始' };
  }
  const clientId = githubClientId();
  const params = new URLSearchParams({
    client_id: clientId,
    device_code: pendingDevice.deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
  });
  const secret = githubClientSecret();
  if (secret) params.set('client_secret', secret);
  const resp = await fetchFn('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Web-Agent'
    },
    body: params
  });
  const data = await resp.json().catch(() => ({}));
  if (data.error === 'authorization_pending' || data.error === 'slow_down') {
    return { pending: true, done: false, userCode: pendingDevice.userCode };
  }
  if (!data.access_token) {
    pendingDevice = null;
    return { pending: false, done: false, error: data.error_description || data.error || 'GitHub 未返回 access_token' };
  }
  const token = data.access_token;
  pendingDevice = null;
  const user = await fetchGitHubUser(token, fetchFn);
  return { pending: false, done: true, ...applyGithubUser(user) };
}

function resetPending() {
  pendingDevice = null;
}

module.exports = {
  githubClientId,
  deviceAvailable,
  fetchGitHubUser,
  loginWithToken,
  startDeviceLogin,
  pollDeviceLogin,
  applyGithubUser,
  clearGithubKeepDemo,
  resetPending
};
