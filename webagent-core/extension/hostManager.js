'use strict';

// One-click host for the VS Code extension. Pure Node (no vscode import) so it is testable.
// - Finds the host code through host.json written by install-desktop-extension.js.
// - Before spawning, looks for a host already serving this workspace on 48271–48290 (for example
//   one started by run-webagent.cmd, or by another VS Code window) and attaches to it instead.
// - Spawns `node installer/launch.js host <workspace>` (no workbench port) on a free port, owns the
//   write end of its stdin (the lifeline), and stops it by closing stdin so the host runs its own
//   shutdown(); only if it does not exit in time is the process tree killed.
// - Never stops a host it did not start.
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn, execFile } = require('child_process');

const HOST_PORT_BASE = 48271;
const HOST_PORT_SPAN = 20;

function readHostLocation(extensionDir) {
  const file = path.join(extensionDir, 'host.json');
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    throw new Error(error && error.code === 'ENOENT'
      ? '插件目录里没有 host.json，不知道主机代码在哪里。桌面 VS Code：请在仓库根重新运行 install-vscode-extension.cmd，然后重载窗口。网页 VS Code（run-webagent-vscode.cmd）：主机由该脚本启动，请重新运行它。'
      : 'host.json 无法读取或不是合法 JSON，请重新运行 install-vscode-extension.cmd。');
  }
  if (!data || data.format !== 1 || typeof data.root !== 'string' || !path.isAbsolute(data.root)) {
    throw new Error('host.json 格式无效，请重新运行 install-vscode-extension.cmd。');
  }
  const root = path.resolve(data.root);
  for (const rel of ['installer/launch.js', 'webagent-core/agent-host/src/index.js']) {
    if (!fs.existsSync(path.join(root, rel))) {
      throw new Error(`host.json 指向的主机目录已不存在或不完整（缺 ${rel}）：${root}。仓库移动过的话，请在新位置重新运行 install-vscode-extension.cmd。`);
    }
  }
  const commit = typeof data.commit === 'string' && /^[0-9a-f]{40}$/.test(data.commit) ? data.commit : null;
  const contentHash = typeof data.contentHash === 'string' && /^[0-9a-f]{64}$/.test(data.contentHash) ? data.contentHash : null;
  return { root, commit, contentHash };
}

function portFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

async function findFreePort({ base = HOST_PORT_BASE, span = HOST_PORT_SPAN, isFree = portFree } = {}) {
  for (let port = base; port < base + span; port++) if (await isFree(port)) return port;
  return null;
}

// GET /api/status with a short deadline; null for anything that is not a Web Agent host answer.
function probeStatus(url, { timeoutMs = 1500 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    const req = http.get(url + '/api/status', { timeout: timeoutMs, headers: { Accept: 'application/json' } }, (res) => {
      const chunks = []; let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) { req.destroy(); done(null); return; }
        chunks.push(chunk);
      });
      res.on('end', () => {
        if (res.statusCode !== 200) return done(null);
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          // Real contract: GET /api/status → { workspaceRoot, identity: { hostInstanceId, … }, … }.
          done(json && typeof json.workspaceRoot === 'string' && typeof json.identity?.hostInstanceId === 'string' ? json : null);
        } catch { done(null); }
      });
      res.on('error', () => done(null));
    });
    req.on('timeout', () => { req.destroy(); done(null); });
    req.on('error', () => done(null));
  });
}

function repoCommit(root) {
  return new Promise((resolve) => {
    execFile('git', ['-C', root, 'rev-parse', 'HEAD'], { timeout: 5000, windowsHide: true }, (error, stdout) => {
      const out = String(stdout || '').trim();
      resolve(!error && /^[0-9a-f]{40}$/.test(out) ? out : null);
    });
  });
}

function killTree(pid, platform = process.platform) {
  return new Promise((resolve) => {
    if (!pid) return resolve();
    if (platform === 'win32') {
      execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, timeout: 10000 }, () => resolve());
      return;
    }
    try { process.kill(-pid, 'SIGKILL'); }
    catch { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
    resolve();
  });
}

function waitExit(child, ms) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.removeListener('exit', onExit); resolve(false); }, ms);
    function onExit() { clearTimeout(timer); resolve(true); }
    child.once('exit', onExit);
  });
}

const short = (sha) => (sha ? sha.slice(0, 7) : '未知');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class HostManager {
  constructor(options = {}) {
    this.extensionDir = options.extensionDir;
    this.log = options.log || (() => {});
    this.onChange = options.onChange || (() => {});
    this.workspaceMatches = options.workspaceMatches || ((a, b) => path.resolve(a) === path.resolve(b));
    this.nodePath = options.nodePath || (() => 'node');
    this.probe = options.probe || probeStatus;
    this.spawnImpl = options.spawnImpl || spawn;
    this.isPortFree = options.isPortFree || portFree;
    this.killTreeImpl = options.killTreeImpl || killTree;
    this.repoCommit = options.repoCommit || repoCommit;
    this.env = options.env || process.env;
    this.platform = options.platform || process.platform;
    this.parentPid = options.parentPid || process.pid;
    this.portBase = options.portBase || HOST_PORT_BASE;
    this.portSpan = options.portSpan || HOST_PORT_SPAN;
    this.readyTimeoutMs = options.readyTimeoutMs || 180000;
    this.pollMs = options.pollMs || 1000;
    this.stopTimeoutMs = options.stopTimeoutMs || 10000;
    this.state = 'idle'; // idle | starting | running | external | error
    this.url = null; this.child = null; this.workspace = null;
    this.error = null; this.warning = null; this.location = null; this.portNote = null; this.others = [];
    this.startPromise = null; this.stopping = false;
  }

  snapshot() {
    return {
      state: this.state, url: this.url, owned: Boolean(this.child), pid: this.child ? this.child.pid : null,
      workspace: this.workspace, error: this.error, warning: [this.warning, this.portNote].filter(Boolean).join('\n') || null,
      commit: this.location ? this.location.commit : null, root: this.location ? this.location.root : null
    };
  }

  currentUrl() { return this.state === 'idle' || this.state === 'error' ? null : this.url; }

  setState(state, extra = {}) {
    this.state = state;
    // The port note only describes a host this manager started and is still running.
    if (state !== 'running' && state !== 'starting') this.portNote = null;
    if (Object.hasOwn(extra, 'error')) this.error = extra.error;
    try { this.onChange(this.snapshot()); } catch { /* UI refresh is best effort */ }
  }

  // Where the installed extension came from, compared with the host checkout's current commit.
  async checkSource() {
    try { this.location = readHostLocation(this.extensionDir); }
    catch (error) { this.location = null; this.warning = null; return { error: error.message }; }
    const now = await this.repoCommit(this.location.root);
    this.warning = this.location.commit && now && now !== this.location.commit
      ? `主机仓库已是提交 ${short(now)}，而插件是从 ${short(this.location.commit)} 安装的。请在仓库根重新运行 install-vscode-extension.cmd 并重载窗口。`
      : null;
    return { commit: this.location.commit, repoCommit: now, warning: this.warning };
  }

  async locate(workspace) {
    const ports = Array.from({ length: this.portSpan }, (_, i) => this.portBase + i);
    const found = await Promise.all(ports.map(async (port) => {
      const url = `http://127.0.0.1:${port}`;
      const status = await this.probe(url);
      if (!status) return null;
      return { url, port, status, same: Boolean(this.workspaceMatches(workspace, status.workspaceRoot)) };
    }));
    // Hosts serving other folders are never attached or stopped, only reported (port choice note).
    this.others = found.filter((f) => f && !f.same).map((f) => ({ port: f.port, workspaceRoot: f.status.workspaceRoot }));
    return found.find((f) => f && f.same) || null;
  }

  // Attach to a host already serving this folder without ever spawning one (activation, refresh).
  async attachExisting(workspace) {
    if ((this.state !== 'idle' && this.state !== 'error') || this.startPromise || this.child) return this.snapshot();
    const found = await this.locate(workspace);
    if (found && (this.state === 'idle' || this.state === 'error') && !this.startPromise && !this.child) {
      this.workspace = workspace; this.url = found.url;
      this.log(`[host] 已连接 ${found.url} 上服务此文件夹的主机（外部启动，插件不会关闭它）`);
      this.setState('external', { error: null });
    }
    return this.snapshot();
  }

  start(workspace) {
    if (this.startPromise) return this.startPromise;
    // The first folder changed while our host still runs for the old one: never orphan it by
    // spawning a second process over it; the user stops it first (Bridge may be running there).
    if (this.child && this.workspace && !this.workspaceMatches(workspace, this.workspace)) {
      return Promise.reject(new Error(`插件已为 ${this.workspace} 启动了主机，请先停止它，再为当前文件夹启动。`));
    }
    if ((this.state === 'running' || this.state === 'external') && this.workspace && this.workspaceMatches(workspace, this.workspace)) {
      return Promise.resolve(this.snapshot());
    }
    this.startPromise = this._start(workspace).finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  async _start(workspace) {
    this.workspace = workspace; this.url = null; this.cancelled = false;
    this.setState('starting', { error: null });
    try {
      const found = await this.locate(workspace);
      this.throwIfCancelled();
      if (found) {
        this.url = found.url;
        this.log(`[host] 已有主机在 ${found.url} 服务此文件夹（外部启动，插件停止时不会关闭它）`);
        this.setState('external');
        return this.snapshot();
      }
      await this.checkSource();
      if (!this.location) this.location = readHostLocation(this.extensionDir); // throws the explanatory error
      if (this.warning) this.log('[host] ' + this.warning);
      const port = await findFreePort({ base: this.portBase, span: this.portSpan, isFree: this.isPortFree });
      if (!port) throw new Error(`端口 ${this.portBase}–${this.portBase + this.portSpan - 1} 都被占用，无法启动主机。`);
      this.portNote = null;
      if (port !== this.portBase) {
        const holder = this.others.find((o) => o.port === this.portBase);
        this.portNote = `端口 ${this.portBase} 已被${holder ? `服务其他文件夹（${holder.workspaceRoot}）的主机` : '其他程序'}占用，本主机改用 ${port}。`
          + `若 Named Tunnel 在 Cloudflare 后台把入口写死为 ${this.portBase}，远程会连到那个占用者，而不是本窗口。`;
        this.log('[host] ' + this.portNote);
      }
      this.throwIfCancelled();
      await this.spawnHost(workspace, port);
      await this.waitReady(workspace);
      this.log(`[host] 主机已就绪：${this.url}（工作区 ${workspace}）`);
      this.setState('running');
      return this.snapshot();
    } catch (error) {
      if (this.child) await this.stop({ quiet: true, cancel: false });
      this.url = null;
      if (this.cancelled) {
        this.cancelled = false;
        this.setState('idle', { error: null });
        throw Object.assign(new Error('已停止启动主机。'), { cancelled: true });
      }
      this.setState('error', { error: error.message });
      throw error;
    }
  }

  throwIfCancelled() {
    if (this.cancelled) throw new Error('cancelled');
  }

  spawnHost(workspace, port) {
    const node = this.nodePath();
    const launch = path.join(this.location.root, 'installer', 'launch.js');
    this.log(`[host] 启动：${node} ${launch} host "${workspace}"（端口 ${port}）`);
    const env = { ...this.env, AGENT_HOST_PORT: String(port), WEBAGENT_PARENT_PID: String(this.parentPid), WEBAGENT_LIFELINE: 'stdin' };
    delete env.WEBAGENT_AGENT_HOST_URL;
    const child = this.spawnImpl(node, [launch, 'host', workspace], {
      cwd: this.location.root, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: this.platform !== 'win32', shell: false
    });
    this.child = child;
    this.url = `http://127.0.0.1:${port}`;
    this.spawnError = null;
    const pipeLines = (stream) => {
      if (!stream) return;
      let buffer = '';
      stream.setEncoding?.('utf8');
      stream.on('data', (text) => {
        buffer += text;
        const lines = buffer.split(/\r?\n/); buffer = lines.pop();
        for (const line of lines) this.log(line.length > 2000 ? line.slice(0, 2000) + '…' : line);
        if (buffer.length > 8000) { this.log(buffer.slice(0, 2000) + '…'); buffer = ''; }
      });
    };
    pipeLines(child.stdout); pipeLines(child.stderr);
    child.stdin?.on('error', () => {});
    child.on('error', (error) => {
      this.spawnError = error && error.code === 'ENOENT'
        ? `找不到 Node（${node}）。请安装 Node LTS，或在 VS Code 用户设置 webagent.nodePath 填 node.exe 的完整路径。`
        : `无法运行主机进程：${error && error.message}`;
      this.log('[host] ' + this.spawnError);
    });
    child.on('exit', (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      const how = signal ? `信号 ${signal}` : `退出码 ${code}`;
      this.log(`[host] 主机进程已结束（${how}）`);
      if (this.stopping) return;
      if (this.state === 'running') {
        this.url = null;
        this.setState('error', { error: `主机进程意外退出（${how}），详见“输出 → Web Agent Host”。` });
      } else if (this.state === 'starting') {
        this.exitBeforeReady = `主机在就绪前退出（${how}），详见“输出 → Web Agent Host”。`;
      }
    });
    this.exitBeforeReady = null;
  }

  async waitReady(workspace) {
    const deadline = Date.now() + this.readyTimeoutMs;
    while (Date.now() < deadline) {
      if (this.spawnError) throw new Error(this.spawnError);
      if (!this.child) throw new Error(this.exitBeforeReady || this.spawnError || '主机在就绪前退出，详见“输出 → Web Agent Host”。');
      const status = await this.probe(this.url);
      if (status) {
        if (!this.workspaceMatches(workspace, status.workspaceRoot)) throw new Error(`端口 ${this.url} 上回答的主机工作区是 ${status.workspaceRoot}，与当前文件夹不一致，已停止。`);
        return status;
      }
      await sleep(this.pollMs);
    }
    throw new Error(`主机 ${Math.round(this.readyTimeoutMs / 1000)} 秒内未就绪（首次启动要安装依赖，需联网），已停止。详见“输出 → Web Agent Host”。`);
  }

  // Stops only a host this manager spawned. For an attached (external) host it just forgets it.
  // cancel=false is the internal cleanup after a failed start; a user stop during start is a cancel.
  async stop({ quiet = false, cancel = true } = {}) {
    const child = this.child;
    if (!child && cancel && this.state === 'starting') {
      // Before the process exists (locating, checking the source, choosing a port): cancel the
      // start so it never spawns. _start checks the flag at each step and before spawning.
      this.cancelled = true;
      this.log('[host] 已请求停止：本次启动在生成主机进程前取消。');
      return { stopped: false, external: false, cancelled: true };
    }
    if (!child) {
      const external = this.state === 'external';
      if (external && !quiet) this.log('[host] 这个主机不是插件启动的，插件不会关闭它；请在启动它的窗口停止。');
      return { stopped: false, external };
    }
    this.stopping = true;
    if (cancel && this.state === 'starting') this.cancelled = true;
    try {
      try { child.stdin.end(); } catch { /* pipe already closed */ }
      let exited = await waitExit(child, this.stopTimeoutMs);
      if (!exited) {
        this.log(`[host] 主机 ${Math.round(this.stopTimeoutMs / 1000)} 秒内未退出，强制结束进程树（pid ${child.pid}）`);
        await this.killTreeImpl(child.pid, this.platform);
        exited = await waitExit(child, 5000);
      }
      if (this.child === child) this.child = null;
      this.url = null;
      if (!quiet) this.setState('idle', { error: exited ? null : '强制结束后仍未确认主机退出，请检查任务管理器。' });
      return { stopped: exited, external: false };
    } finally { this.stopping = false; }
  }

  // An attached host stopped answering: forget it so the next start looks again.
  markLost() {
    if (this.state !== 'external') return;
    this.url = null;
    this.setState('idle', { error: null });
  }

  dispose() { return this.child ? this.stop({ quiet: true }) : Promise.resolve({ stopped: false }); }
}

module.exports = { HostManager, readHostLocation, findFreePort, portFree, probeStatus, repoCommit, killTree, waitExit, HOST_PORT_BASE, HOST_PORT_SPAN };
