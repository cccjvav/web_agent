const { StringDecoder } = require('string_decoder');
const { spawn, spawnSync } = require('child_process');
const { cachedLookup } = require('./binaryLookup');
const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const eventBus = require('../utils/eventBus');
const { stopProcess } = require('./stopProcess');
const { observeTunnel } = require('./tunnelRegistry');

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

let child = null;
let generation = 0, cancelPending = null;
let stopping = Promise.resolve();
let quickUrl = null;

// One instance per pipe. Hold only a possible token prefix; never flush it raw on exit.
function createTokenRedactor(token) {
  const secret = String(token || '');
  const decoder = new StringDecoder('utf8');
  const prefix = new Uint32Array(secret.length);
  for (let i = 1, j = 0; i < secret.length; i++) {
    while (j && secret[i] !== secret[j]) j = prefix[j - 1];
    if (secret[i] === secret[j]) j++;
    prefix[i] = j;
  }
  let matched = 0;
  return chunk => {
    const text = decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    if (!secret) return text;
    const output = [];
    for (let i = 0; i < text.length; i++) {
      const character = text[i];
      while (matched && character !== secret[matched]) {
        const next = prefix[matched - 1];
        output.push(secret.slice(0, matched - next));
        matched = next;
      }
      if (character === secret[matched]) {
        matched++;
        if (matched === secret.length) { output.push('[token]'); matched = 0; }
      } else output.push(character);
    }
    return output.join('');
  };
}

function parseTunnelUrl(chunk) {
  const m = String(chunk || '').match(URL_RE);
  return m ? m[0].replace(/\/$/, '') : null;
}

function lookupCloudflared() {
  if (process.env.CLOUDFLARED_PATH && fs.existsSync(process.env.CLOUDFLARED_PATH)) {
    return process.env.CLOUDFLARED_PATH;
  }
  const which = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(which, ['cloudflared'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    windowsHide: true,
    timeout: 5000
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

// /api/status calls snapshot() on every workbench poll; lookupCloudflared spawns where/which
// synchronously. See cachedLookup for the staleness contract; starts pass fresh:true.
const cloudflaredLookup = cachedLookup(lookupCloudflared, () => process.env.CLOUDFLARED_PATH);

function findCloudflared({ fresh = false } = {}) {
  return cloudflaredLookup({ fresh });
}

function installHint() {
  if (process.platform === 'win32') {
    return '未找到 cloudflared。在 Windows 终端执行：winget install --id Cloudflare.cloudflared   装完后完全退出并重开 VS Code，再新建集成 CMD 运行 run-webagent.cmd（独立 CMD 请重新打开），然后点「启动 Bridge」。也可从 https://github.com/cloudflare/cloudflared/releases 下载 cloudflared-windows-amd64.exe，改名为 cloudflared.exe 并加入 PATH。';
  }
  return '未找到 cloudflared。macOS: brew install cloudflared；Linux: 见 https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/';
}

function stopTunnel() {
  generation++;
  if (cancelPending) { cancelPending(); cancelPending = null; }
  const previous = child;
  child = null;
  quickUrl = null;
  config.publicTunnelUrl = null;
  config.bridgeRunning = false;
  let other = Promise.resolve();
  try { other = require('./ngrok').stopNgrok(); } catch (_) {}
  stopping = Promise.all([stopping, stopProcess(previous), other]).then(() => undefined);
  stopping.catch(() => {}); // Callers awaiting stop still receive failures.
  return stopping;
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

async function startNamedTunnel({ hostname, token, port = config.port, timeoutMs = 25000 } = {}) {
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
  const stopped = stopTunnel();
  const ticket = generation;
  await stopped;
  if (ticket !== generation) throw new Error('Tunnel start superseded');
  const bin = findCloudflared({ fresh: true });
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
    observeTunnel(proc, 'cloudflare-named', bin);
    const redactLogs = new Map([proc.stdout, proc.stderr].map(stream => [stream, createTokenRedactor(tok)]));
    let buf = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (child === proc && ticket === generation) stopTunnel().catch(() => {});
      reject(new Error('cloudflared Named Tunnel 已启动但 25 秒内没有连上 Cloudflare。请确认 Token、Public Hostname 指到 ' + target + '，以及本机网络。'));
    }, timeoutMs);

    const onData = (chunk, stream) => {
      if (child !== proc || ticket !== generation) return;
      const text = chunk.toString();
      buf = (buf + text).slice(-65536);
      const safe = redactLogs.get(stream)(chunk);
      if (safe) eventBus.broadcast('tunnel_log', { chunk: safe.slice(0, 400) });
      if (NAMED_READY_RE.test(buf) && !settled) {
        settled = true;
        clearTimeout(timer);
        quickUrl = url;
        config.publicTunnelUrl = url;
        eventBus.broadcast('tunnel_ready', { url, target, named: true });
        resolve({ url, binary: bin, target, named: true });
      }
    };

    cancelPending = () => {
      if (settled) return; settled = true; clearTimeout(timer); reject(new Error('Tunnel start cancelled'));
    };
    const clearActive = () => {
      if (child !== proc || ticket !== generation) return;
      child = null; quickUrl = null; config.publicTunnelUrl = null; config.bridgeRunning = false;
      eventBus.broadcast('tunnel_stopped', {});
    };
    proc.stdout.on('data', chunk => onData(chunk, proc.stdout));
    proc.stderr.on('data', chunk => onData(chunk, proc.stderr));
    proc.on('error', (err) => {
      if (!proc.pid) clearActive();
      else if (child === proc && ticket === generation) stopTunnel().catch(() => {});
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`无法启动 cloudflared: ${err.message}`));
    });
    proc.on('exit', (code) => {
      clearActive();
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`cloudflared 退出（code ${code}）。${installHint()}`));
    });
  });
}

async function startQuickTunnel({ port = config.port, timeoutMs = 25000 } = {}) {
  const stopped = stopTunnel();
  const ticket = generation;
  await stopped;
  if (ticket !== generation) throw new Error('Tunnel start superseded');
  const bin = findCloudflared({ fresh: true });
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
    observeTunnel(proc, 'cloudflare', bin);
    let buf = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (child === proc && ticket === generation) stopTunnel().catch(() => {});
      reject(new Error('cloudflared 已启动但 25 秒内没有给出 trycloudflare.com 地址。请检查网络，或把 CLOUDFLARED_PATH 指到 cloudflared.exe。'));
    }, timeoutMs);

    const onData = (chunk) => {
      if (child !== proc || ticket !== generation) return;
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

    cancelPending = () => {
      if (settled) return; settled = true; clearTimeout(timer); reject(new Error('Tunnel start cancelled'));
    };
    const clearActive = () => {
      if (child !== proc || ticket !== generation) return;
      child = null; quickUrl = null; config.publicTunnelUrl = null; config.bridgeRunning = false;
      eventBus.broadcast('tunnel_stopped', {});
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', (err) => {
      if (!proc.pid) clearActive();
      else if (child === proc && ticket === generation) stopTunnel().catch(() => {});
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`无法启动 cloudflared: ${err.message}`));
    });
    proc.on('exit', (code) => {
      clearActive();
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

// Last-resort signal to the tunnel child on any exit (only synchronous work runs here). Graceful
// SIGINT/SIGTERM handling lives in the host's single shutdown() in src/index.js; a second
// handler here used to race it for process.exit.
process.on('exit', () => { stopTunnel().catch(() => {}); });

module.exports = {
  createTokenRedactor,
  parseTunnelUrl,
  canonicalNamedUrl,
  findCloudflared,
  installHint,
  startQuickTunnel,
  startNamedTunnel,
  stopTunnel,
  snapshot
};
