const store = require('../models/store');

let pendingDevice = null;
let identityGeneration = 0;

function supersedeIdentityAttempt() {
  identityGeneration++;
  pendingDevice = null;
  return identityGeneration;
}

function supersededResult() {
  return { pending: false, done: false, code: 'E_SUPERSEDED', error: '设备码登录已被新的身份操作替代' };
}

function supersededError() {
  const error = new Error('身份验证已被新的操作替代');
  error.code = 'E_SUPERSEDED';
  error.status = 409;
  return error;
}

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
  supersedeIdentityAttempt();
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
  const generation = supersedeIdentityAttempt();
  const user = await fetchGitHubUser(trimmed, fetchFn);
  if (generation !== identityGeneration) throw supersededError();
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
  const generation = supersedeIdentityAttempt();
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
  if (generation !== identityGeneration) throw supersededError();
  if (!resp.ok || !data.device_code || !data.user_code) {
    const err = new Error(data.error_description || data.error || `无法开始 GitHub 设备码登录（HTTP ${resp.status}）`);
    err.status = resp.ok ? 400 : (resp.status || 502);
    throw err;
  }
  pendingDevice = {
    generation,
    deviceCode: data.device_code,
    interval: Math.max(5, Number(data.interval) || 5),
    expiresAt: Date.now() + (Number(data.expires_in) || 900) * 1000,
    userCode: data.user_code,
    polling: false
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
  const attempt = pendingDevice;
  if (!attempt) return { pending: false, done: false, error: '没有进行中的设备码登录' };
  const current = () => pendingDevice === attempt && identityGeneration === attempt.generation;
  if (Date.now() > attempt.expiresAt) {
    if (current()) supersedeIdentityAttempt();
    return { pending: false, done: false, error: '设备码已过期，请重新开始' };
  }
  if (attempt.polling) return { pending: true, done: false, userCode: attempt.userCode };
  attempt.polling = true;
  try {
    const clientId = githubClientId();
    const params = new URLSearchParams({
      client_id: clientId,
      device_code: attempt.deviceCode,
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
    if (!current()) return supersededResult();
    if (!resp.ok) {
      const error = new Error(data.error_description || data.error || `GitHub 设备码轮询失败（HTTP ${resp.status}）`);
      error.status = resp.status || 502;
      throw error;
    }
    if (data.error === 'authorization_pending' || data.error === 'slow_down') {
      if (data.error === 'slow_down') attempt.interval = Math.min(60, attempt.interval + 5);
      return { pending: true, done: false, userCode: attempt.userCode, interval: attempt.interval };
    }
    if (!data.access_token) {
      supersedeIdentityAttempt();
      return { pending: false, done: false, error: data.error_description || data.error || 'GitHub 未返回 access_token' };
    }
    const user = await fetchGitHubUser(data.access_token, fetchFn);
    if (!current()) return supersededResult();
    pendingDevice = null;
    return { pending: false, done: true, ...applyGithubUser(user) };
  } finally {
    attempt.polling = false;
  }
}

function resetPending() {
  supersedeIdentityAttempt();
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
