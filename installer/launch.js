'use strict';
// No dependencies: installed product stays read-only; executable runtime copies are per user.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
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
// Lazy, side-effect-free helper: non-app modes and recovery do not probe/start an editor.
function appOrigin(env = process.env) { return require('./appWindow').appOrigin(env); }
function ready(origin = appOrigin(), options) { return require('./appWindow').ready(origin, options); }
function appWindow(root, workspace, env, home) { return require('./appWindow').appWindow(root, workspace, env, home); }
function launchRecovery() {
  // No workspace resolution, dependency install, server startup or supplied target/confirmation.
  if (process.platform !== 'win32' || !process.stdin.isTTY || !process.stdout.isTTY || process.argv.length !== 3) {
    process.exitCode = 2;
    console.error('Tunnel recovery requires a local Windows console and no arguments.');
    return;
  }
  const runtime = prepareRuntime();
  const child = spawn(process.execPath, [path.join(runtime.root, 'webagent-core/agent-host/scripts/tunnel-cleanup.js')],
    { cwd: runtime.root, stdio: 'inherit', shell: false });
  child.on('error', () => { console.error('Recovery process unavailable; no automatic retry.'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = Number.isInteger(code) ? code : 1; });
}
async function main() {
  const mode = process.argv[2];
  if (mode === 'recovery') return launchRecovery();
  const entries = { classic: 'webagent-core/agent-host/src/index.js', vscode: 'webagent-core/scripts/run-code-oss.js',
    admin: 'webagent-core/admin-host/index.js', extension: 'webagent-core/scripts/install-desktop-extension.js' };
  if (!entries[mode] && mode !== 'app') throw new Error('Unknown launch mode');
  const home = userHome();
  const runtime = prepareRuntime();
  const workspace = resolveWorkspace(process.argv[3] || process.env.WORKSPACE_ROOT, process.cwd(),
    runtime.installed ? path.join(home, 'workspace') : runtime.root);
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
module.exports = { userHome, safeRelative, prepareRuntime, resolveWorkspace, appOrigin, ready, launchRecovery };
