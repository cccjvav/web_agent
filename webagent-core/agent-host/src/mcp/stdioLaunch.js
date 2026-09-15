'use strict';
// Local operator-only launch previews. Hashing is not executing or sandboxing.
const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('crypto');
const { config } = require('../config');
const { resolveSafePath } = require('../tools/patchEngine');
const previews = new Map();
const KEEP_MS = 2 * 60 * 1000;
const BASE_ENV = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE']);
function launchEnv(extra = {}) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) throw new Error('env must be an object');
  const env = Object.create(null);
  for (const [key, value] of Object.entries(process.env)) if (BASE_ENV.has(key.toUpperCase())) env[key] = value;
  if (Object.keys(extra).length > 32 || Buffer.byteLength(JSON.stringify(extra)) > 8192) throw new Error('At most 32 environment entries / 8 KiB');
  for (const [key, value] of Object.entries(extra)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(key) || typeof value !== 'string' || /[\0\r\n]/.test(value)
      || BASE_ENV.has(key.toUpperCase()) || /^(WEBAGENT_|NODE_|PYTHONPATH$|PYTHONHOME$|LD_|DYLD_|BASH_ENV$|ENV$|COMSPEC$|PSMODULEPATH$)/i.test(key)) throw new Error('Invalid or protected environment key: ' + key);
    if (Object.keys(env).some(old => old.toUpperCase() === key.toUpperCase())) throw new Error('Duplicate environment key');
    env[key] = value;
  }
  return env;
}
function fileStamp(file, maxBytes) {
  const real = fs.realpathSync(file);
  if (!fs.statSync(real).isFile()) throw new Error('Launch files must be regular files');
  const fd = fs.openSync(real, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('Launch file exceeds review budget');
    const hash = createHash('sha256'), buffer = Buffer.alloc(64 * 1024); let bytes = 0, count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) {
      bytes += count; if (bytes > maxBytes) throw new Error('Launch file grew beyond review budget');
      hash.update(buffer.subarray(0, count));
    }
    return { path: real, bytes, sha256: hash.digest('hex') };
  } finally { fs.closeSync(fd); }
}
function preview(input) {
  for (const [id, record] of previews) if (Date.now() >= record.expiresAt) previews.delete(id);
  if (previews.size >= 8) throw new Error('At most eight launch previews; wait for expiry');
  if (!input || typeof input !== 'object' || Array.isArray(input) || Buffer.byteLength(JSON.stringify(input)) > 32768
    || Object.keys(input).some(key => !['name', 'program', 'args', 'cwd', 'env', 'reviewFiles'].includes(key))) throw new Error('Invalid launch configuration (max 32 KiB)');
  const { program, args = [], cwd = '.', env = {}, reviewFiles = [] } = input;
  if (typeof program !== 'string' || !path.isAbsolute(program) || program.length > 2048 || /[\0\r\n]/.test(program)) throw new Error('program must be an absolute executable path; no PATH lookup or package installation');
  if (!Array.isArray(args) || args.length > 64 || args.some(arg => typeof arg !== 'string' || arg.length > 2048 || /[\0\r\n]/.test(arg))
    || Buffer.byteLength(JSON.stringify(args)) > 16384) throw new Error('args must be at most 64 literal strings / 16 KiB');
  if (!Array.isArray(reviewFiles) || reviewFiles.length > 8 || reviewFiles.some(file => typeof file !== 'string' || !file)) throw new Error('reviewFiles requires at most eight workspace paths');
  const programStamp = fileStamp(program, 256 * 1024 * 1024);
  if (process.platform === 'win32' && !/\.exe$/i.test(programStamp.path)) throw new Error('Windows stdio requires an .exe, not a .cmd/.bat shell launcher');
  if (/^(?:npm|npx|pnpm|yarn|uvx|pip|pip3|cmd|powershell|pwsh|bash|sh|zsh|dash)(?:\.exe)?$/i.test(path.basename(programStamp.path))) throw new Error('Direct shell/package-manager launchers are not supported; select an already installed MCP executable');
  fs.accessSync(programStamp.path, process.platform === 'win32' ? fs.constants.R_OK : fs.constants.X_OK);
  if (typeof cwd !== 'string' || cwd.length > 2048) throw new Error('cwd must be a workspace-relative path');
  const workingDir = fs.realpathSync(resolveSafePath(cwd));
  if (!fs.statSync(workingDir).isDirectory()) throw new Error('cwd must be a workspace directory');
  const launch = { name: String(input.name || 'Local stdio MCP').slice(0, 120), program: programStamp.path, args: [...args], cwd: workingDir, env: launchEnv(env) };
  const files = reviewFiles.map(file => ({ requested: file, stamp: fileStamp(resolveSafePath(file), 4 * 1024 * 1024) }));
  const previewId = randomUUID(), expiresAt = Date.now() + KEEP_MS;
  previews.set(previewId, { launch, programStamp, files, workspace: fs.realpathSync(config.workspaceRoot), cwdRequest: cwd, expiresAt });
  return JSON.parse(JSON.stringify({ previewId, expiresAt, transport: 'stdio', launch: { name: launch.name, program: launch.program, args: launch.args, cwd: launch.cwd, envKeys: Object.keys(launch.env) },
    programStamp, reviewFiles: files.map(item => item.stamp), requiresConfirmation: true,
    warning: 'Starting executes trusted third-party code as your OS user, before any tool call. Not an OS sandbox: code can access files/network or install things itself. Only executable and explicit reviewFiles are hash-bound, not imported dependencies. Never put secrets in args. No automatic install/restart/retry.' }));
}
function consume({ previewId, confirmed } = {}) {
  if (confirmed !== true) throw new Error('Explicit local operator launch confirmation required');
  const record = previews.get(previewId); previews.delete(previewId); // Single use, including failed launches.
  if (!record || Date.now() >= record.expiresAt) throw new Error('Launch preview missing or expired; preview again');
  if (record.workspace !== fs.realpathSync(config.workspaceRoot) || fs.realpathSync(resolveSafePath(record.cwdRequest)) !== record.launch.cwd) throw new Error('Workspace changed since preview');
  if (fileStamp(record.launch.program, 256 * 1024 * 1024).sha256 !== record.programStamp.sha256) throw new Error('Executable changed since preview');
  for (const file of record.files) {
    const stamp = fileStamp(resolveSafePath(file.requested), 4 * 1024 * 1024);
    if (stamp.path !== file.stamp.path || stamp.sha256 !== file.stamp.sha256) throw new Error('Reviewed file changed since preview');
  }
  return record.launch;
}
function clear() { previews.clear(); }
module.exports = { preview, consume, clear, launchEnv, fileStamp };
