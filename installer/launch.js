'use strict';
// No dependencies: installed product stays read-only; executable runtime copies are per user.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const sourceRoot = path.resolve(__dirname, '..');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function userHome(env = process.env) {
  return path.resolve(env.WEBAGENT_DATA_HOME || path.join(env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'WebAgent'));
}
function safeRelative(rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\\') || rel.includes(':') || rel.includes('\0')
    || path.posix.isAbsolute(rel) || rel.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Invalid package path');
  return rel;
}
function prepareRuntime(source = sourceRoot, home = userHome()) {
  const manifestPath = path.join(source, 'installation.json');
  if (!fs.existsSync(manifestPath)) return { root: source, installed: false };
  const raw = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(raw);
  if (manifest.format !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Invalid installation manifest');
  const version = hash(raw);
  const parent = path.join(home, 'releases');
  const dest = path.join(parent, version);
  if (fs.existsSync(path.join(dest, '.ready'))) return { root: dest, installed: true };
  fs.mkdirSync(parent, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(parent, '.prepare-'));
  try {
    for (const item of manifest.files) {
      const rel = safeRelative(item.path);
      const input = path.join(source, rel);
      const real = fs.realpathSync(input);
      if (!real.startsWith(fs.realpathSync(source) + path.sep) || !fs.statSync(input).isFile()) throw new Error('Invalid package file');
      const data = fs.readFileSync(input);
      if (hash(data) !== item.sha256) throw new Error('Package verification failed: ' + rel);
      const output = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, data);
    }
    fs.writeFileSync(path.join(tmp, '.ready'), version);
    try { fs.renameSync(tmp, dest); }
    catch (err) { if (!fs.existsSync(path.join(dest, '.ready'))) throw err; }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return { root: dest, installed: true };
}
function resolveWorkspace(value, cwd, fallback) {
  const explicit = Boolean(value);
  let workspace = path.resolve(cwd, value || fallback);
  if (fs.existsSync(workspace) && fs.statSync(workspace).isFile()) workspace = path.dirname(workspace);
  if (!fs.existsSync(workspace)) {
    if (explicit) throw new Error('工作区不存在：' + workspace);
    fs.mkdirSync(workspace, { recursive: true });
  }
  if (!fs.statSync(workspace).isDirectory()) throw new Error('工作区不是目录');
  return workspace; // Do not strip a Windows drive root's trailing separator.
}
function ensureDependencies(root) {
  const cwd = path.join(root, 'webagent-core/agent-host');
  if (fs.existsSync(path.join(cwd, 'node_modules/express'))) return;
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd, stdio: 'inherit', shell: process.platform === 'win32'
  });
  if (r.error || r.status !== 0) throw new Error('npm ci失败，请检查Node/npm与网络');
}
function ready() {
  return new Promise(resolve => {
    const req = http.get('http://127.0.0.1:3000/healthz', { timeout: 1500 }, res => {
      res.resume(); resolve(res.statusCode === 200);
    });
    req.on('timeout', () => req.destroy()); req.on('error', () => resolve(false));
  });
}
async function appWindow(root, workspace, env, home) {
  if (!await ready()) {
    fs.mkdirSync(home, { recursive: true });
    const fd = fs.openSync(path.join(home, 'startup.log'), 'a');
    try {
      const child = spawn(process.execPath, [path.join(root, 'webagent-core/scripts/run-code-oss.js'), workspace],
        { env, cwd: root, detached: true, windowsHide: true, stdio: ['ignore', fd, fd] });
      child.on('error', err => console.error(err.message)); child.unref();
    } finally { fs.closeSync(fd); }
    const deadline = Date.now() + 120000;
    while (!await ready()) {
      if (Date.now() >= deadline) throw new Error('VS Code未在120秒内就绪；后台启动日志：' + path.join(home, 'startup.log'));
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  const candidates = [
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')
  ];
  const browser = candidates.find(p => path.isAbsolute(p) && fs.existsSync(p));
  const child = browser ? spawn(browser, ['--app=http://127.0.0.1:3000'], { detached: true, stdio: 'ignore' })
    : spawn('rundll32.exe', ['url.dll,FileProtocolHandler', 'http://127.0.0.1:3000'], { detached: true, stdio: 'ignore' });
  child.on('error', err => console.error('浏览器启动失败：' + err.message)); child.unref();
}
async function main() {
  const mode = process.argv[2];
  const entries = { classic: 'webagent-core/agent-host/src/index.js', vscode: 'webagent-core/scripts/run-code-oss.js',
    admin: 'webagent-core/admin-host/index.js', extension: 'webagent-core/scripts/install-desktop-extension.js' };
  if (!entries[mode] && mode !== 'app') throw new Error('Unknown launch mode');
  const home = userHome();
  const runtime = prepareRuntime();
  const workspace = resolveWorkspace(process.argv[3] || process.env.WORKSPACE_ROOT, process.cwd(),
    runtime.installed ? path.join(home, 'workspace') : path.join(runtime.root, 'workspace'));
  const env = { ...process.env, WORKSPACE_ROOT: workspace };
  if (runtime.installed) {
    env.WEBAGENT_USER_DATA_DIR = path.join(home, 'code-server');
    env.WEBAGENT_ADMIN_DATA = path.join(home, 'admin');
  }
  if (mode !== 'extension') ensureDependencies(runtime.root);
  if (mode === 'app') return appWindow(runtime.root, workspace, env, home);
  const child = spawn(process.execPath, [path.join(runtime.root, entries[mode]), ...(mode === 'vscode' ? [workspace] : [])],
    { cwd: runtime.root, env, stdio: 'inherit' });
  child.on('error', err => { console.error(err.message); process.exitCode = 1; });
  child.on('exit', (code, signal) => { process.exitCode = code == null ? 1 : code; });
}
if (require.main === module) main().catch(err => { console.error(err.message); process.exitCode = 1; });
module.exports = { userHome, safeRelative, prepareRuntime, resolveWorkspace };
