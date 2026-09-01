const { spawn } = require('child_process');
const path = require('path');
const { config } = require('../config');
const eventBus = require('../utils/eventBus');

let commandSequence = 0;

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
      resolve(result);
    });
  });
}

module.exports = {
  executeCommand
};
