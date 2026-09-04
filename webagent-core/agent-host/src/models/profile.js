const fs = require('fs');
const path = require('path');
const { config } = require('../config');

function detectEnvironment() {
  const plat = process.platform;
  const os = plat === 'win32' ? 'windows' : plat === 'darwin' ? 'macos' : 'linux';
  const shell = os === 'windows' ? 'powershell' : 'bash';
  return {
    os,
    shell,
    replyLanguage: 'zh-CN',
    commitLanguage: 'zh-CN',
    notes: ''
  };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

function detectTechStack(workspaceRoot) {
  const root = workspaceRoot || config.workspaceRoot;
  const languages = [];
  const frameworks = [];
  let packageManager = '';
  let testCommand = '';
  const notes = [];

  const pkg = exists(root, 'package.json') ? readJson(path.join(root, 'package.json')) : null;
  if (pkg) {
    languages.push('JavaScript');
    if (exists(root, 'tsconfig.json') || exists(root, 'jsconfig.json')) languages.push('TypeScript');
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (deps.react || deps.next) frameworks.push(deps.next ? 'Next.js' : 'React');
    if (deps.vue || deps.nuxt) frameworks.push(deps.nuxt ? 'Nuxt' : 'Vue');
    if (deps.express) frameworks.push('Express');
    if (exists(root, 'pnpm-lock.yaml')) packageManager = 'pnpm';
    else if (exists(root, 'yarn.lock')) packageManager = 'yarn';
    else packageManager = 'npm';
    if (pkg.scripts && pkg.scripts.test) testCommand = `${packageManager} test`;
  }
  if (exists(root, 'pyproject.toml') || exists(root, 'requirements.txt') || exists(root, 'pytest.ini')) {
    languages.push('Python');
    if (!packageManager) packageManager = 'pip';
    if (!testCommand) testCommand = 'python -m pytest -q';
  }
  if (exists(root, 'Cargo.toml')) {
    languages.push('Rust');
    if (!packageManager) packageManager = 'cargo';
    if (!testCommand) testCommand = 'cargo test';
  }
  if (exists(root, 'go.mod')) {
    languages.push('Go');
    if (!packageManager) packageManager = 'go';
    if (!testCommand) testCommand = 'go test ./...';
  }
  if (exists(root, 'index.html') && !languages.includes('HTML')) languages.push('HTML');

  const uniq = (arr) => [...new Set(arr.filter(Boolean))];
  return {
    languages: uniq(languages).join(', '),
    frameworks: uniq(frameworks).join(', '),
    packageManager,
    testCommand,
    notes: notes.join('\n')
  };
}

function resolveEnvironment(custom) {
  const detected = detectEnvironment();
  const env = (custom && custom.environment) || {};
  return {
    os: env.os && env.os !== 'auto' ? env.os : detected.os,
    shell: env.shell && env.shell !== 'auto' ? env.shell : detected.shell,
    replyLanguage: env.replyLanguage || detected.replyLanguage,
    commitLanguage: env.commitLanguage || detected.commitLanguage,
    notes: env.notes || ''
  };
}

function resolveTechStack(custom, workspaceRoot) {
  const detected = detectTechStack(workspaceRoot);
  const stack = (custom && custom.techStack) || {};
  return {
    languages: stack.languages || detected.languages,
    frameworks: stack.frameworks || detected.frameworks,
    packageManager: stack.packageManager || detected.packageManager,
    testCommand: stack.testCommand || detected.testCommand,
    notes: stack.notes || ''
  };
}

function languageLabel(code) {
  if (code === 'zh-CN' || code === 'zh') return '中文';
  if (code === 'en') return 'English';
  if (code === 'follow-user') return '跟随用户提问的语言';
  return code || '';
}

function osLabel(os) {
  return os === 'windows' ? 'Windows' : os === 'macos' ? 'macOS' : os === 'linux' ? 'Linux' : os;
}

function formatWorkspaceContext(custom, skills) {
  const env = resolveEnvironment(custom);
  const stack = resolveTechStack(custom);
  const lines = [];
  lines.push('## Environment preference');
  lines.push(`- OS: ${osLabel(env.os)}`);
  lines.push(`- Shell: ${env.shell}`);
  lines.push(`- Reply language: ${languageLabel(env.replyLanguage)}`);
  lines.push(`- Commit messages: ${languageLabel(env.commitLanguage)}`);
  if (env.notes) lines.push(`- Notes: ${env.notes}`);
  if (custom && custom.preference) lines.push(`- Preference: ${custom.preference}`);

  lines.push('');
  lines.push('## Tech stack');
  if (stack.languages) lines.push(`- Languages: ${stack.languages}`);
  if (stack.frameworks) lines.push(`- Frameworks: ${stack.frameworks}`);
  if (stack.packageManager) lines.push(`- Package manager: ${stack.packageManager}`);
  if (stack.testCommand) lines.push(`- Test command: ${stack.testCommand}`);
  if (stack.notes) lines.push(`- Notes: ${stack.notes}`);
  if (!stack.languages && !stack.testCommand) lines.push('- (not declared; inspect the workspace)');

  const list = skills || [];
  lines.push('');
  lines.push('## Skills');
  if (!list.length) {
    lines.push('- None yet. Skills are folders with SKILL.md under .webagent/skills/. Call load_skill to list.');
  } else {
    lines.push('Call load_skill with name when the task matches. Catalog:');
    for (const s of list) {
      const desc = String(s.preview || '').split('\n').find((l) => l.trim() && !l.startsWith('#')) || '';
      lines.push(`- ${s.name} (${s.path})${desc ? `: ${desc.slice(0, 80)}` : ''}`);
    }
  }
  return lines.join('\n');
}

function markdownPreference(custom) {
  const env = resolveEnvironment(custom);
  return [
    '# 环境偏好',
    '',
    `- 操作系统: ${osLabel(env.os)}`,
    `- Shell: ${env.shell}`,
    `- 回复语言: ${languageLabel(env.replyLanguage)}`,
    `- 提交说明: ${languageLabel(env.commitLanguage)}`,
    env.notes ? '' : null,
    env.notes ? env.notes : null,
    custom && custom.preference ? '' : null,
    custom && custom.preference ? custom.preference : null,
    ''
  ]
    .filter((l) => l !== null)
    .join('\n');
}

function markdownTechStack(custom) {
  const stack = resolveTechStack(custom);
  return [
    '# 技术栈',
    '',
    stack.languages ? `- 语言: ${stack.languages}` : '- 语言: （未声明）',
    stack.frameworks ? `- 框架: ${stack.frameworks}` : null,
    stack.packageManager ? `- 包管理: ${stack.packageManager}` : null,
    stack.testCommand ? `- 测试命令: ${stack.testCommand}` : '- 测试命令: （未声明）',
    stack.notes ? '' : null,
    stack.notes || null,
    ''
  ]
    .filter((l) => l !== null)
    .join('\n');
}

module.exports = {
  detectEnvironment,
  detectTechStack,
  resolveEnvironment,
  resolveTechStack,
  formatWorkspaceContext,
  markdownPreference,
  markdownTechStack
};
