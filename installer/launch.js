'use strict';
// No dependencies: installed product stays read-only; executable runtime copies are per user.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
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
function abortedLaunch() { return Object.assign(new Error('启动准备已停止'), { code: 'ABORT_ERR' }); }
function checkLaunchSignal(signal) { if (signal?.aborted) throw abortedLaunch(); }
async function ensureDependencies(root, { timeoutMs = 120000, signal } = {}) {
  checkLaunchSignal(signal);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('npm准备期限无效');
  const cwd = path.join(root, 'webagent-core/agent-host');
  if (fs.existsSync(path.join(cwd, 'node_modules/express'))) return;
  await require('./preparation').runPreparation(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd, shell: process.platform === 'win32', timeoutMs, signal
  });
  checkLaunchSignal(signal);
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
// launch.js host: headless host for the VS Code extension (no workbench port). When the extension
// passes WEBAGENT_LIFELINE=stdin it holds the write end of our stdin; EOF (explicit stop, or the
// extension host dying) aborts dependency preparation, or is forwarded to the host's own stdin so
// its single shutdown() stops commands and the tunnel. Classic/CMD starts never read stdin.
function ownerLifeline(mode, env = process.env, stdin = process.stdin) {
  const waiters = [];
  const state = { enabled: mode === 'host' && env.WEBAGENT_LIFELINE === 'stdin', gone: false,
    onGone(fn) { if (state.gone) fn(); else waiters.push(fn); },
    release() { if (state.enabled) { try { stdin.destroy(); } catch (_) { /* already closed */ } } } };
  if (state.enabled) {
    const gone = () => { if (state.gone) return; state.gone = true; waiters.splice(0).forEach(fn => { try { fn(); } catch (_) { /* best effort */ } }); };
    stdin.on('data', () => {}); stdin.once('end', gone); stdin.once('close', gone); stdin.once('error', gone); stdin.resume();
  }
  return state;
}
async function main() {
  const mode = process.argv[2];
  if (mode === 'recovery') return launchRecovery();
  const entries = { classic: 'webagent-core/agent-host/src/index.js', host: 'webagent-core/agent-host/src/index.js',
    vscode: 'webagent-core/scripts/run-code-oss.js',
    admin: 'webagent-core/admin-host/index.js', extension: 'webagent-core/scripts/install-desktop-extension.js' };
  if (!entries[mode] && mode !== 'app') throw new Error('Unknown launch mode');
  const lifeline = ownerLifeline(mode);
  const home = userHome();
  const runtime = prepareRuntime();
  const workspace = resolveWorkspace(process.argv[3] || process.env.WORKSPACE_ROOT, process.cwd(),
    runtime.installed ? path.join(home, 'workspace') : runtime.root);
  const env = { ...process.env, WORKSPACE_ROOT: workspace };
  if (mode === 'host') env.WEBAGENT_SKIP_WORKBENCH = '1';
  if (runtime.installed) {
    env.WEBAGENT_USER_DATA_DIR = path.join(home, 'code-server');
    env.WEBAGENT_ADMIN_DATA = path.join(home, 'admin');
  }
  if (mode !== 'extension') {
    const controller = new AbortController();
    const onSignal = () => controller.abort();
    process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
    lifeline.onGone(onSignal);
    try {
      await ensureDependencies(runtime.root, { signal: controller.signal });
      checkLaunchSignal(controller.signal);
    } finally {
      process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
    }
  }
  if (mode === 'app') return appWindow(runtime.root, workspace, env, home);
  const child = spawn(process.execPath, [path.join(runtime.root, entries[mode]), ...(mode === 'vscode' ? [workspace] : [])],
    { cwd: runtime.root, env, stdio: lifeline.enabled ? ['pipe', 'inherit', 'inherit'] : 'inherit' });
  if (lifeline.enabled) {
    child.stdin.on('error', () => {});
    lifeline.onGone(() => child.stdin.end());
  }
  child.on('error', err => { console.error(err.message); process.exitCode = 1; lifeline.release(); });
  child.on('exit', (code, signal) => { process.exitCode = code == null ? 1 : code; lifeline.release(); });
}
if (require.main === module) main().catch(err => { console.error(err.message); process.exitCode = 1; });
module.exports = { userHome, safeRelative, prepareRuntime, resolveWorkspace, ensureDependencies, appOrigin, ready, launchRecovery, ownerLifeline };
