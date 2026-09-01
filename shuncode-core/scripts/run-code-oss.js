const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { ensure, syncExtension, repoRoot } = require('./ensure-code-server');

const workspace = path.resolve(
  process.argv[2] || process.env.WORKSPACE_ROOT || path.join(repoRoot, 'workspace')
);
const mcpPort = parseInt(process.env.AGENT_HOST_PORT || '48271', 10);
const codePort = parseInt(process.env.CODE_SERVER_PORT || '3000', 10);

if (!fs.existsSync(workspace)) {
  console.error(`工作区不存在: ${workspace}`);
  process.exit(1);
}

function waitHealth(url, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error('agent-host 未在时限内就绪'));
        setTimeout(tick, 200);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error('agent-host 未在时限内就绪'));
        setTimeout(tick, 200);
      });
    };
    tick();
  });
}

function run(command, args, opts) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    windowsHide: true,
    shell: Boolean(opts.shell),
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env }
  });
  child.on('error', (err) => {
    console.error(`无法启动 ${command}: ${err.message}`);
    process.exit(1);
  });
  return child;
}

async function main() {
  console.log('===========================================================');
  console.log('  ShunCode  +  网页 VS Code (code-server 4.135.0)');
  console.log('===========================================================');

  const entry = ensure();
  const extDir = path.join(repoRoot, 'shuncode-core/extensions-installed');
  syncExtension();

  const agentHostDir = path.join(repoRoot, 'shuncode-core/agent-host');
  if (!fs.existsSync(path.join(agentHostDir, 'node_modules/express'))) {
    console.log('Installing agent-host dependencies…');
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    await new Promise((resolve, reject) => {
      const child = run(npm, ['install', '--no-audit', '--no-fund'], {
        cwd: agentHostDir,
        shell: process.platform === 'win32'
      });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('npm install agent-host 失败'))));
    });
  }

  const children = [];
  const stop = () => {
    for (const c of children) {
      if (!c || c.killed) continue;
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(c.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
        } else {
          c.kill('SIGTERM');
        }
      } catch (_) {}
    }
  };
  process.on('SIGINT', () => {
    stop();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stop();
    process.exit(0);
  });

  const agent = run(process.execPath, ['src/index.js'], {
    cwd: agentHostDir,
    env: {
      WORKSPACE_ROOT: workspace,
      AGENT_HOST_PORT: String(mcpPort),
      SHUNCODE_SKIP_WORKBENCH: '1'
    }
  });
  children.push(agent);
  agent.on('exit', (code) => {
    if (code) {
      console.error(`agent-host 退出 ${code}`);
      stop();
      process.exit(code);
    }
  });

  await waitHealth(`http://127.0.0.1:${mcpPort}/health`, 15000);

  const userData = path.join(repoRoot, '.local/share/code-server');
  const configFile = path.join(repoRoot, '.config/code-server/config.yaml');
  fs.mkdirSync(userData, { recursive: true });

  const csArgs = [
    entry,
    '--auth',
    'none',
    '--bind-addr',
    `0.0.0.0:${codePort}`,
    '--disable-telemetry',
    '--disable-update-check',
    '--disable-workspace-trust',
    '--trusted-origins',
    '*',
    '--app-name',
    'ShunCode',
    '--user-data-dir',
    userData,
    '--extensions-dir',
    extDir,
    '--config',
    configFile,
    workspace
  ];

  console.log(`  VS Code   http://127.0.0.1:${codePort}`);
  console.log(`  MCP       http://127.0.0.1:${mcpPort}/mcp/…`);
  console.log(`  Workspace ${workspace}`);
  console.log('  侧栏点 ShunCode 图标打开 Chat / Bridge（连本机 agent-host）');
  console.log('  停止: Ctrl+C');
  console.log('===========================================================');

  const cs = run(process.execPath, csArgs, { cwd: path.dirname(entry) });
  children.push(cs);
  cs.on('exit', (code) => {
    stop();
    process.exit(code || 0);
  });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
