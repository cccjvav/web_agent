const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const eventBus = require('../utils/eventBus');
const { stopProcess } = require('./stopProcess');
const { canonicalNamedUrl } = require('./cloudflared');

const NGROK_URL_RE = /https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/i;
const NGROK_READY_RE = /started tunnel|Forwarding\s+https:\/\//i;

let child = null;
let generation = 0, cancelPending = null;
let stopping = Promise.resolve();
let ngrokUrl = null;

function parseNgrokUrl(chunk) {
  const text = String(chunk || '');
  const jsonUrl = text.match(/"url"\s*:\s*"(https:\/\/[^"]+)"/i);
  if (jsonUrl) return jsonUrl[1].replace(/\/$/, '');
  const tagged = text.match(/(?:url=|Forwarding\s+)(https:\/\/[^\s"'\\]+)/i);
  if (tagged) return tagged[1].replace(/\/$/, '').replace(/[.,;]+$/, '');
  const m = text.match(NGROK_URL_RE);
  if (!m) return null;
  const url = m[0].replace(/\/$/, '');
  if (/\.ngrok(?:-free)?\.(?:app|dev|io)\b/i.test(url) || /\.ngrok\.io\b/i.test(url)) return url;
  return null;
}

function resolveNgrokToken(token) {
  const fromArg = String(token || '').trim();
  if (fromArg) return fromArg;
  return String(process.env.NGROK_AUTHTOKEN || '').trim();
}

function findNgrok() {
  if (process.env.NGROK_PATH && fs.existsSync(process.env.NGROK_PATH)) {
    return process.env.NGROK_PATH;
  }
  const which = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(which, ['ngrok'], {
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
      path.join(process.env.LOCALAPPDATA || '', 'ngrok', 'ngrok.exe'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'ngrok', 'ngrok.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'ngrok', 'ngrok.exe')
    ]
    : ['/usr/local/bin/ngrok', '/opt/homebrew/bin/ngrok', '/usr/bin/ngrok'];
  return guesses.find((p) => p && fs.existsSync(p)) || null;
}

function installHint() {
  if (process.platform === 'win32') {
    return '未找到 ngrok。在 Windows 终端执行：winget install Ngrok.Ngrok   装完后关掉本窗口再运行 run-webagent.cmd。也可从 https://ngrok.com/download 下载 ngrok.exe 并加入 PATH，或设 NGROK_PATH。';
  }
  return '未找到 ngrok。macOS: brew install ngrok/ngrok/ngrok；其它系统见 https://ngrok.com/download';
}

function stopNgrok() {
  generation++;
  if (cancelPending) { cancelPending(); cancelPending = null; }
  const previous = child;
  child = null;
  ngrokUrl = null;
  config.publicTunnelUrl = null;
  config.bridgeRunning = false;
  const other = Promise.resolve();
  stopping = Promise.all([stopping, stopProcess(previous), other]).then(() => undefined);
  stopping.catch(() => {}); // Callers awaiting stop still receive failures.
  return stopping;
}

async function startNgrokTunnel({ hostname, token, port = config.port, timeoutMs = 25000 } = {}) {
  const tok = resolveNgrokToken(token);
  if (!tok) {
    const err = new Error('ngrok 需要 Authtoken（dashboard.ngrok.com 复制，或设环境变量 NGROK_AUTHTOKEN）。');
    err.code = 'E_NGROK_TOKEN';
    return Promise.reject(err);
  }
  const named = hostname ? canonicalNamedUrl(hostname) : null;
  if (hostname && String(hostname).trim() && !named) {
    const err = new Error('ngrok 域名无效。可留空用随机地址，或填 mcp.ngrok-free.app 这类主机名。');
    err.code = 'E_NGROK_HOSTNAME';
    return Promise.reject(err);
  }
  const stopped = require('./cloudflared').stopTunnel();
  const ticket = generation;
  await stopped;
  if (ticket !== generation) throw new Error('Tunnel start superseded');
  const bin = findNgrok();
  if (!bin) {
    const err = new Error(installHint());
    err.code = 'E_NO_NGROK';
    return Promise.reject(err);
  }
  const target = `127.0.0.1:${port}`;
  return new Promise((resolve, reject) => {
    const args = ['http', target, '--log=stdout', '--log-format=term'];
    if (named) args.push('--url', named);
    const isWin = process.platform === 'win32';
    const needShell = isWin && /\.(cmd|bat)$/i.test(bin);
    const proc = spawn(bin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: needShell,
      env: { ...process.env, NGROK_AUTHTOKEN: tok }
    });
    child = proc;
    let buf = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (child === proc && ticket === generation) stopNgrok().catch(() => {});
      reject(new Error('ngrok 已启动但 25 秒内没有给出公网地址。请确认 Authtoken、预留域名（若填了）以及本机网络。'));
    }, timeoutMs);

    const finish = (url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ngrokUrl = url;
      config.publicTunnelUrl = url;
      eventBus.broadcast('tunnel_ready', { url, target: `http://${target}`, ngrok: true });
      resolve({ url, binary: bin, target: `http://${target}`, ngrok: true });
    };

    const onData = (chunk) => {
      if (child !== proc || ticket !== generation) return;
      const text = chunk.toString();
      buf = (buf + text).slice(-65536);
      const safe = tok ? text.split(tok).join('[token]') : text;
      eventBus.broadcast('tunnel_log', { chunk: safe.slice(0, 400) });
      const parsed = parseNgrokUrl(buf);
      if (named && NGROK_READY_RE.test(buf)) return finish(named);
      if (parsed) return finish(parsed);
    };

    cancelPending = () => {
      if (settled) return; settled = true; clearTimeout(timer); reject(new Error('Tunnel start cancelled'));
    };
    const clearActive = () => {
      if (child !== proc || ticket !== generation) return;
      child = null; ngrokUrl = null; config.publicTunnelUrl = null; config.bridgeRunning = false;
      eventBus.broadcast('tunnel_stopped', {});
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', (err) => {
      if (!proc.pid) clearActive();
      else if (child === proc && ticket === generation) stopNgrok().catch(() => {});
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`无法启动 ngrok: ${err.message}`));
    });
    proc.on('exit', (code) => {
      clearActive();
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`ngrok 退出（code ${code}）。${installHint()}`));
    });
  });
}

function snapshot() {
  return {
    binary: findNgrok(),
    url: ngrokUrl || null,
    running: Boolean(child && !child.killed)
  };
}

module.exports = {
  parseNgrokUrl,
  findNgrok,
  installHint,
  startNgrokTunnel,
  stopNgrok,
  snapshot
};
