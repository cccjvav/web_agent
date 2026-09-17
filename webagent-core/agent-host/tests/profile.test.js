const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-profile-'));
const { config } = require('../src/config');
const previousRoot = config.workspaceRoot;
config.workspaceRoot = tmp;

const {
  detectEnvironment,
  detectTechStack,
  formatWorkspaceContext,
  markdownPreference,
  markdownTechStack
} = require('../src/models/profile');
const { saveCustom, loadCustom, patchCustom } = require('../src/models/customizations');
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

  fs.writeFileSync(path.join(tmp, 'jsconfig.json'), '{}');
  assert.ok(!detectTechStack(tmp).languages.includes('TypeScript'));
  fs.writeFileSync(path.join(tmp, 'tsconfig.json'), '{}');
  assert.ok(detectTechStack(tmp).languages.includes('TypeScript'));
  fs.unlinkSync(path.join(tmp, 'tsconfig.json'));
  const packageBefore = fs.readFileSync(path.join(tmp, 'package.json'));
  for (const body of ['[]', '{broken', '{"padding":"' + 'x'.repeat(256 * 1024) + '"}']) {
    fs.writeFileSync(path.join(tmp, 'package.json'), body);
    assert.strictEqual(detectTechStack(tmp).testCommand, '');
    assert.strictEqual(detectTechStack(tmp).languages, '');
  }
  fs.unlinkSync(path.join(tmp, 'package.json'));
  fs.writeFileSync(path.join(tmp, 'requirements.txt'), 'requests');
  assert.strictEqual(detectTechStack(tmp).testCommand, '', 'Python alone does not prove pytest');
  fs.writeFileSync(path.join(tmp, 'pytest.ini'), '[pytest]');
  assert.strictEqual(detectTechStack(tmp).testCommand, 'python -m pytest -q');
  fs.unlinkSync(path.join(tmp, 'requirements.txt')); fs.unlinkSync(path.join(tmp, 'pytest.ini'));
  fs.writeFileSync(path.join(tmp, 'package.json'), packageBefore);

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

  patchCustom({environment:{notes:'changed note'},techStack:{notes:'changed stack note'}});
  assert.strictEqual(loadCustom().environment.shell, 'powershell');
  assert.strictEqual(loadCustom().techStack.testCommand, 'npm test');
  const savedFiles = ['customizations.json','instructions.md','preference.md','tech-stack.md'];
  const before = savedFiles.map(name => fs.readFileSync(path.join(tmp,'.webagent',name)));
  for (const invalid of [[], {instructions:{}}, {environment:[]}, {environment:{shell:2}}, {techStack:{testCommand:[]}}, {instructions:'x'.repeat(8*1024*1024)}]) {
    assert.throws(() => patchCustom(invalid), error => error.code === 'E_BAD_ARGS');
    for (let n = 0; n < savedFiles.length; n++) assert.ok(fs.readFileSync(path.join(tmp,'.webagent',savedFiles[n])).equals(before[n]));
  }
  const jsonFile = path.join(tmp,'.webagent/customizations.json');
  fs.writeFileSync(jsonFile, '{"environment":"invalid"}');
  assert.throws(() => loadCustom(), error => error.code === 'E_CUSTOM_CORRUPT');
  assert.throws(() => patchCustom({preference:'no overwrite'}), /CORRUPT/);
  assert.strictEqual(fs.readFileSync(jsonFile,'utf8'), '{"environment":"invalid"}');
  fs.writeFileSync(jsonFile, before[0]);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(),'profile-outside-'));
  try {
    const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(),'profile-link-'));
    const oldRoot = config.workspaceRoot;
    try {
      fs.symlinkSync(outside, path.join(probeRoot,'.webagent'), process.platform === 'win32' ? 'junction' : 'dir');
      config.workspaceRoot = probeRoot;
      assert.throws(() => saveCustom({instructions:'MUST NOT ESCAPE'}));
      assert.deepStrictEqual(fs.readdirSync(outside), []);
    } finally { config.workspaceRoot = oldRoot; fs.rmSync(probeRoot,{recursive:true,force:true}); }
  } finally { fs.rmSync(outside,{recursive:true,force:true}); }

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

  console.log('profile tests passed');
}

try { main(); } finally { config.workspaceRoot = previousRoot; fs.rmSync(tmp, { recursive: true, force: true }); }
