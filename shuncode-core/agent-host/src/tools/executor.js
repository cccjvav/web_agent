const { spawn } = require('child_process');
const path = require('path');
const { config } = require('../config');
const eventBus = require('../utils/eventBus');

let commandSequence = 0;
const commandStore = new Map();

function executeCommand({ command, cwd = '.', timeoutSec = 30 }) {
  return new Promise((resolve, reject) => {
    const execId = ++commandSequence;
    const workingDir = path.resolve(config.workspaceRoot, cwd);
    const timeoutMs = (timeoutSec || 30) * 1000;
    const startTime = Date.now();

    eventBus.broadcast('command_started', {
      execId,
      command,
      cwd: path.relative(config.workspaceRoot, workingDir) || '.',
      timestamp: new Date().toISOString()
    });

    let stdout = '';
    let stderr = '';
    let isKilled = false;

    const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
    const args = process.platform === 'win32' ? ['-Command', command] : ['-c', command];

    const child = spawn(shell, args, {
      cwd: workingDir,
      env: {
        ...process.env,
        CI: 'true',
        TERM: 'xterm-256color',
        FORCE_COLOR: '1'
      }
    });

    const timer = setTimeout(() => {
      isKilled = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 2000);
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      eventBus.broadcast('command_output', {
        execId,
        stream: 'stdout',
        chunk
      });
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      eventBus.broadcast('command_output', {
        execId,
        stream: 'stderr',
        chunk
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      eventBus.broadcast('command_finished', {
        execId,
        command,
        error: err.message,
        durationMs: Date.now() - startTime
      });
      reject(new Error(`Failed to start command: ${err.message}`));
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      const result = {
        execId,
        command,
        exitCode: code,
        signal,
        durationMs,
        stdout,
        stderr,
        isTimeout: isKilled
      };

      eventBus.broadcast('command_finished', result);
      commandStore.set(String(execId), result);
      resolve(result);
    });
  });
}

function getCommandOutput({ execId, commandId } = {}) {
  const id = String(execId || commandId || commandSequence);
  const result = commandStore.get(id);
  if (!result) {
    return { execId: id, found: false, message: 'No command output for this id yet.' };
  }
  return { found: true, ...result };
}

function sendCommandInput({ execId, input } = {}) {
  return {
    ok: false,
    execId,
    message: 'Interactive PTY input is available in the full ShunCode desktop build. This host captured the last command as a one-shot process.',
    input
  };
}

function wait({ ms = 800 } = {}) {
  const delay = Math.min(15000, Math.max(0, Number(ms) || 800));
  return new Promise((resolve) => {
    setTimeout(() => resolve({ waitedMs: delay }), delay);
  });
}

module.exports = {
  executeCommand,
  getCommandOutput,
  sendCommandInput,
  wait
};
