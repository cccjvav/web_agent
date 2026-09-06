const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const eventBus = require('../utils/eventBus');

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

let child = null;
let quickUrl = null;

function parseTunnelUrl(chunk) {
  const m = String(chunk || '').match(URL_RE);
  return m ? m[0].replace(/\/$/, '') : null;
}

function findCloudflared() {
  if (process.env.CLOUDFLARED_PATH && fs.existsSync(process.env.CLOUDFLARED_PATH)) {
    return process.env.CLOUDFLARED_PATH;
  }
  const which = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(which, ['cloudflared'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    windowsHide: true
  });
  const hit = String(r.stdout || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s && fs.existsSync(s));
  if (hit) return hit;
  const guesses = process.platform === 'win32'
    ? [
      path.join(process.env.LOCALAPPDATA || '', 'cloudflared', 'cloudflared.exe'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'cloudflared', 'cloudflared.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'cloudflared', 'cloudflared.exe')
    ]
    : ['/usr/local/bin/cloudflared', '/opt/homebrew/bin/cloudflared', '/usr/bin/cloudflared'];
  return guesses.find((p) => p && fs.existsSync(p)) || null;
}

function installHint() {
  if (process.platform === 'win32') {
    return '未找到 cloudflared。在 Windows 终端执行：winget install --id Cloudflare.cloudflared   装完后关掉本窗口再运行 run-webagent.cmd，然后点「启动 Bridge」。也可从 https://github.com/cloudflare/cloudflared/releases 下载 cloudflared-windows-amd64.exe，改名为 cloudflared.exe 并加入 PATH。';
  }
  return '未找到 cloudflared。macOS: brew install cloudflared；Linux: 见 https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/';
}

function stopTunnel() {
  try {
    const ngrok = require('./ngrok');
    if (typeof ngrok.stopNgrok === 'function') ngrok.stopNgrok();
  } catch (_) {}
  if (child && !child.killed) {
    try { child.kill('SIGTERM'); } catch (_) {}
    setTimeout(() => {
      try { if (child && !child.killed) child.kill('SIGKILL'); } catch (_) {}
    }, 1500);
  }
  child = null;
  quickUrl = null;
  config.publicTunnelUrl = null;
}

function canonicalNamedUrl(hostname) {
  let h = String(hostname || '').trim().toLowerCase();
  h = h.replace(/^https?:\/\//, '');
  h = h.split('/')[0];
  h = h.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)) return null;
  return `https://${h}`;
}

const NAMED_READY_RE = /Registered tunnel connection|\bconnIndex=/i;

function startNamedTunnel({ hostname, token, port = config.port, timeoutMs = 25000 } = {}) {
  const url = canonicalNamedUrl(hostname);
  if (!url) {
    const err = new Error('Named Tunnel 需要主机名，例如 mcp.example.com。');
    err.code = 'E_NAMED_HOSTNAME';
    return Promise.reject(err);
  }
  const tok = String(token || '').trim();
  if (!tok) {
    const err = new Error('Named Tunnel 需要 Tunnel Token（Cloudflare Zero Trust 控制台复制）。');
    err.code = 'E_NAMED_TOKEN';
    return Promise.reject(err);
  }
  stopTunnel();
  const bin = findCloudflared();
  if (!bin) {
    const err = new Error(installHint());
    err.code = 'E_NO_CLOUDFLARED';
    return Promise.reject(err);
  }
  const target = `http://127.0.0.1:${port}`;
  return new Promise((resolve, reject) => {
    const args = ['tunnel', '--no-autoupdate', 'run', '--token', tok];
    const isWin = process.platform === 'win32';
    const needShell = isWin && /\.(cmd|bat)$/i.test(bin);
    const proc = spawn(bin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: needShell
    });
    child = proc;
    let buf = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      stopTunnel();
      reject(new Error('cloudflared Named Tunnel 已启动但 25 秒内没有连上 Cloudflare。请确认 Token、Public Hostname 指到 ' + target + '，以及本机网络。'));
    }, timeoutMs);

    const onData = (chunk) => {
      const text = chunk.toString();
      buf = (buf + text).slice(-65536);
      const safe = tok ? text.split(tok).join('[token]') : text;
      eventBus.broadcast('tunnel_log', { chunk: safe.slice(0, 400) });
      if (NAMED_READY_RE.test(buf) && !settled) {
        settled = true;
        clearTimeout(timer);
        quickUrl = url;
        config.publicTunnelUrl = url;
        eventBus.broadcast('tunnel_ready', { url, target, named: true });
        resolve({ url, binary: bin, target, named: true });
      }
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child = null;
      reject(new Error(`无法启动 cloudflared: ${err.message}`));
    });
    proc.on('exit', (code) => {
      child = null;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`cloudflared 退出（code ${code}）。${installHint()}`));
    });
  });
}

function startQuickTunnel({ port = config.port, timeoutMs = 25000 } = {}) {
  stopTunnel();
  const bin = findCloudflared();
  if (!bin) {
    const err = new Error(installHint());
    err.code = 'E_NO_CLOUDFLARED';
    return Promise.reject(err);
  }
  const target = `http://127.0.0.1:${port}`;
  return new Promise((resolve, reject) => {
    const args = ['tunnel', '--url', target, '--no-autoupdate'];
    const isWin = process.platform === 'win32';
    const needShell = isWin && /\.(cmd|bat)$/i.test(bin);
    const proc = spawn(bin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: needShell
    });
    child = proc;
    let buf = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      stopTunnel();
      reject(new Error('cloudflared 已启动但 25 秒内没有给出 trycloudflare.com 地址。请检查网络，或把 CLOUDFLARED_PATH 指到 cloudflared.exe。'));
    }, timeoutMs);

    const onData = (chunk) => {
      const text = chunk.toString();
      buf = (buf + text).slice(-65536);
      eventBus.broadcast('tunnel_log', { chunk: text.slice(0, 400) });
      const url = parseTunnelUrl(buf);
      if (url && !settled) {
        settled = true;
        clearTimeout(timer);
        quickUrl = url;
        config.publicTunnelUrl = url;
        eventBus.broadcast('tunnel_ready', { url, target });
        resolve({ url, binary: bin, target });
      }
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child = null;
      reject(new Error(`无法启动 cloudflared: ${err.message}`));
    });
    proc.on('exit', (code) => {
      child = null;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`cloudflared 退出（code ${code}）。${installHint()}`));
    });
  });
}

function snapshot() {
  let extra = { running: false, binary: null, url: null };
  try { extra = require('./ngrok').snapshot(); } catch (_) {}
  const cfRunning = Boolean(child && !child.killed);
  return {
    binary: cfRunning ? findCloudflared() : (extra.running ? extra.binary : findCloudflared() || extra.binary),
    url: quickUrl || extra.url || config.publicTunnelUrl,
    running: cfRunning || extra.running
  };
}

process.on('exit', stopTunnel);
process.on('SIGINT', () => { stopTunnel(); process.exit(0); });
process.on('SIGTERM', () => { stopTunnel(); process.exit(0); });

module.exports = {
  parseTunnelUrl,
  canonicalNamedUrl,
  findCloudflared,
  installHint,
  startQuickTunnel,
  startNamedTunnel,
  stopTunnel,
  snapshot
};
