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
    return '未找到 cloudflared。在 Windows 终端执行：winget install --id Cloudflare.cloudflared   装完后关掉本窗口再运行 run-shuncode.cmd，然后点「启动 Bridge」。也可从 https://github.com/cloudflare/cloudflared/releases 下载 cloudflared-windows-amd64.exe，改名为 cloudflared.exe 并加入 PATH。';
  }
  return '未找到 cloudflared。macOS: brew install cloudflared；Linux: 见 https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/';
}

function stopTunnel() {
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
    const proc = spawn(bin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
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
      buf += text;
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
  return {
    binary: findCloudflared(),
    url: quickUrl || config.publicTunnelUrl,
    running: Boolean(child && !child.killed)
  };
}

process.on('exit', stopTunnel);
process.on('SIGINT', () => { stopTunnel(); process.exit(0); });
process.on('SIGTERM', () => { stopTunnel(); process.exit(0); });

module.exports = {
  parseTunnelUrl,
  findCloudflared,
  installHint,
  startQuickTunnel,
  stopTunnel,
  snapshot
};
