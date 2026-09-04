const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-profile-'));
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const {
  detectEnvironment,
  detectTechStack,
  formatWorkspaceContext,
  markdownPreference,
  markdownTechStack
} = require('../src/models/profile');
const { saveCustom, loadCustom } = require('../src/models/customizations');
const { getInstructions } = require('../src/mcp/instructions');
const { readResource } = require('../src/mcp/resources');

function main() {
  const env = detectEnvironment();
  assert.ok(['windows', 'macos', 'linux'].includes(env.os));
  assert.ok(['powershell', 'bash'].includes(env.shell));

  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({ name: 'demo', scripts: { test: 'node tests/x.js' }, dependencies: { express: '5.0.0' } })
  );
  const stack = detectTechStack(tmp);
  assert.ok(stack.languages.includes('JavaScript'));
  assert.ok(stack.frameworks.includes('Express'));
  assert.strictEqual(stack.packageManager, 'npm');
  assert.strictEqual(stack.testCommand, 'npm test');

  const custom = saveCustom({
    preference: '改动必须带测试',
    environment: { os: 'windows', shell: 'powershell', replyLanguage: 'zh-CN', commitLanguage: 'zh-CN', notes: '不要用 bash' },
    techStack: { languages: 'JavaScript', frameworks: 'Express', packageManager: 'npm', testCommand: 'npm test', notes: '' },
    instructions: '提交说明用中文。'
  });
  assert.ok(fs.existsSync(path.join(tmp, '.webagent/preference.md')));
  assert.ok(fs.existsSync(path.join(tmp, '.webagent/tech-stack.md')));
  assert.ok(markdownPreference(custom).includes('PowerShell') || markdownPreference(custom).includes('powershell'));
  assert.ok(markdownTechStack(custom).includes('npm test'));

  fs.mkdirSync(path.join(tmp, '.webagent/skills/review'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, '.webagent/skills/review/SKILL.md'),
    '# Skill: review\n\n用户要求审查时使用。\n'
  );

  const ctx = formatWorkspaceContext(loadCustom(), [{ name: 'review', path: '.webagent/skills/review', preview: '用户要求审查时使用。' }]);
  assert.ok(ctx.includes('Environment preference'));
  assert.ok(ctx.includes('Tech stack'));
  assert.ok(ctx.includes('JavaScript'));
  assert.ok(ctx.includes('review'));

  const instr = getInstructions();
  assert.ok(instr.includes('Environment preference'));
  assert.ok(instr.includes('Skills'));
  assert.ok(instr.includes('review'));

  const profile = readResource('webagent://profile');
  assert.ok(profile && profile.text.includes('Tech stack'));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('profile tests passed');
}

main();
