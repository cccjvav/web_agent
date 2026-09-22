const store = require('../models/store');
const { fetchText, currentSignal, checkCancelled } = require('../utils/requestScope');

// 10s: these calls sit behind an interactive login button, so a user is watching.
// 64KiB: a GitHub user / device-code reply is a few hundred bytes; a larger ceiling would let a
// hostile or misconfigured endpoint stream far more than any identity response needs.
const GITHUB_TIMEOUT_MS = Number(process.env.WEBAGENT_GITHUB_TIMEOUT_MS || 10000);
const GITHUB_MAX_BYTES = 64 * 1024;

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

function githubResponseError() {
  const error = new Error('GitHub 返回了无效或不支持的身份响应，请停止本次登录并核对。');
  error.code = 'E_GITHUB_RESPONSE'; error.status = 502; return error;
}

function githubText(value, maxBytes, optional = false) {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= maxBytes
    && !/[\x00-\x1f\x7f]/.test(value) && (optional || Boolean(value.trim()));
}

function deviceUri(value, fallback, userCode) {
  if (value == null || value === '') return fallback;
  if (!githubText(value, 2048)) throw githubResponseError();
  try {
    const url = new URL(value);
    if (url.origin !== 'https://github.com' || url.pathname !== '/login/device' || url.username || url.password || url.hash
      || [...url.searchParams.keys()].some(key => key !== 'user_code')
      || url.searchParams.getAll('user_code').length > 1
      || (url.searchParams.has('user_code') && url.searchParams.get('user_code') !== userCode)) throw githubResponseError();
    return url.href;
  } catch (_) { throw githubResponseError(); }
}

async function githubRequest(url, options, fetchFn) {
  let result;
  try {
    // fetchImpl rides inside options (this branch's injection seam) instead of a 5th positional
    // argument, so the timeout/cancellation/byte budget all still apply to an injected transport.
    // redirect:'error' keeps the Authorization header pinned to the host we chose.
    result = await fetchText(
      url,
      { ...options, redirect: 'error', fetchImpl: fetchFn },
      GITHUB_TIMEOUT_MS,
      { maxBytes: GITHUB_MAX_BYTES }
    );
  } catch (cause) {
    const code = currentSignal()?.aborted || cause?.code === 'E_CANCELLED' ? 'E_CANCELLED'
      : cause?.code === 'E_RESPONSE_TOO_LARGE' ? 'E_RESPONSE_TOO_LARGE'
      : cause?.code === 'E_TIMEOUT' || cause?.name === 'AbortError' ? 'E_TIMEOUT' : 'E_GITHUB_NETWORK';
    const messages = { E_CANCELLED: 'GitHub 身份请求已取消', E_RESPONSE_TOO_LARGE: 'GitHub 身份响应超过64KiB预算', E_TIMEOUT: 'GitHub 身份请求超过10秒期限', E_GITHUB_NETWORK: 'GitHub 网络请求失败或发生不允许的重定向' };
    const error = new Error(messages[code]); error.code = code;
    error.status = code === 'E_CANCELLED' ? 499 : code === 'E_TIMEOUT' ? 504 : 502;
    throw error;
  }
  let data;
  try { data = JSON.parse(result.text); } catch (_) { if (result.response.ok) throw githubResponseError(); data = {}; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    if (result.response.ok) throw githubResponseError();
    data = {};
  }
  return { response: result.response, data };
}

async function fetchGitHubUser(token, fetchFn = fetch) {
  const { response: resp, data } = await githubRequest('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Web-Agent'
    }
  }, fetchFn);
  if (!resp.ok) {
    const err = new Error(`GitHub 拒绝该令牌（HTTP ${resp.status}）。需要 read:user 权限。`);
    err.status = resp.status; err.code = 'E_GITHUB_HTTP'; throw err;
  }
  const id = data.id ?? '', name = data.name ?? data.login;
  if (!githubText(data.login, 256) || !githubText(name, 256, true)
    || !(githubText(id, 128, true) || (Number.isSafeInteger(id) && id >= 0))) throw githubResponseError();
  const login = data.login.trim();
  return { login, id: String(id), name: name.trim() || login };
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
  checkCancelled();
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
  checkCancelled();
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
  const { response: resp, data } = await githubRequest('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Web-Agent'
    },
    body: params
  }, fetchFn);
  if (generation !== identityGeneration) throw supersededError();
  if (!resp.ok) {
    const err = new Error(`无法开始 GitHub 设备码登录（HTTP ${resp.status}）`);
    err.status = resp.status || 502; err.code = 'E_GITHUB_HTTP';
    throw err;
  }
  const interval = data.interval ?? 5, expiresIn = data.expires_in ?? 900;
  if (!githubText(data.device_code, 4096) || !githubText(data.user_code, 128)
    || !Number.isInteger(interval) || interval <= 0 || interval > 60
    || !Number.isInteger(expiresIn) || expiresIn <= 0 || expiresIn > 86400) throw githubResponseError();
  const verificationUri = deviceUri(data.verification_uri, 'https://github.com/login/device', data.user_code);
  const verificationUriComplete = deviceUri(data.verification_uri_complete, '', data.user_code);
  pendingDevice = {
    generation,
    deviceCode: data.device_code,
    interval: Math.max(5, interval),
    expiresAt: Date.now() + expiresIn * 1000,
    userCode: data.user_code,
    polling: false
  };
  return {
    userCode: data.user_code,
    verificationUri,
    verificationUriComplete,
    interval: pendingDevice.interval,
    expiresIn
  };
}

async function pollDeviceLogin(fetchFn = fetch) {
  checkCancelled();
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
    const { response: resp, data } = await githubRequest('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Web-Agent'
      },
      body: params
    }, fetchFn);
    if (!current()) return supersededResult();
    if (!resp.ok) {
      const error = new Error(`GitHub 设备码轮询失败（HTTP ${resp.status}）`);
      error.status = resp.status || 502; error.code = 'E_GITHUB_HTTP';
      throw error;
    }
    if (data.error === 'authorization_pending' || data.error === 'slow_down') {
      if (data.error === 'slow_down') attempt.interval = Math.min(60, attempt.interval + 5);
      return { pending: true, done: false, userCode: attempt.userCode, interval: attempt.interval };
    }
    if (!data.access_token) {
      supersedeIdentityAttempt();
      return { pending: false, done: false, error: 'GitHub 未完成设备码授权，请重新开始或核对授权状态' };
    }
    if (!githubText(data.access_token, 4096)) throw githubResponseError();
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
  // Exported so tests can assert the declared budgets instead of hard-coding the numbers.
  GITHUB_TIMEOUT_MS,
  GITHUB_MAX_BYTES,
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
