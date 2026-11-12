'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');
const { loadSkill, listSkills, discoverSkills, userSkillsRoot, SKILL_LOAD_REASONS } = require('../src/tools/skills');
const { clipJson } = require('../src/mcp/budget');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-skills-'));
const before = config.workspaceRoot;
config.workspaceRoot = path.join(root, 'workspace');
fs.mkdirSync(config.workspaceRoot);
// The global skill folder lives under the OS home; keep it on a temp dir for the whole file (F131).
const homeBefore = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
const home = path.join(root, 'home');
fs.mkdirSync(home); process.env.HOME = home; process.env.USERPROFILE = home;
function put(relative, text) {
  const file = path.join(config.workspaceRoot, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); return file;
}
try {
  const long = '---\nname: Not-the-folder-id\ndescription: >\n  Use for safe review\n  and evidence collection.\n---\n# Review\n' + '中😀'.repeat(10000);
  const md = put('.webagent/skills/review/SKILL.md', long);
  put('skills/review/SKILL.md', '# Shared\nDifferent source.');
  put('skills/vendor/skills/check/SKILL.md', '# Nested\nCheck this task.');
  put('skills/vendor/assets/readme.md', 'Not a skill');
  put('skills/runner-only/run.py', 'raise Exception("MUST NOT RUN")');
  put('.webagent/skills/review/scripts/run.py', 'raise Exception("MUST NOT RUN")');
  put('.webagent/skills/review/references/check.md', 'READ-ONLY-REFERENCE');
  put('.webagent/skills/review/references/.env.md', 'SECRET');
  put('.webagent/skills/review/references/binary.md', Buffer.from([65, 0, 66]));
  put('.webagent/skills/review/references/invalid.txt', Buffer.from([0xff, 0xfe]));
  put('.webagent/skills/review/workflow.json', JSON.stringify({ steps: [{ id: 'ping', tool: 'ping', arguments: {} }] }));
  put('outside.md', 'Outside this skill');
  const catalog = discoverSkills();
  assert.strictEqual(catalog.truncated, false);
  assert.ok(catalog.skills.some(s => s.id === 'shared:vendor/skills/check'));
  assert.ok(!catalog.skills.some(s => /assets|runner-only/.test(s.id)));
  const local = catalog.skills.find(s => s.id === 'workspace:review');
  assert.strictEqual(local.description, 'Use for safe review and evidence collection.');
  assert.strictEqual(local.executable, false);
  assert.strictEqual(catalog.skills.find(s => s.id === 'shared:review').shadowed, true);
  assert.strictEqual(catalog.skills.find(s => s.id === 'shared:review').shadowedBy, 'workspace:review', 'shadowed entry names the winner');
  assert.ok(catalog.skills.find(s => s.id === 'shared:review').shadowFix.includes('完整 ID'));
  assert.strictEqual(local.shadowedBy, undefined);
  assert.strictEqual(loadSkill({ name: 'review' }).id, 'workspace:review');
  assert.strictEqual(loadSkill({ name: 'shared:review' }).content, '# Shared\nDifferent source.');
  assert.strictEqual(loadSkill({ name: 'check' }).found, false, 'no ambiguous recursive basename guessing');
  let page = loadSkill({ name: 'workspace:review', limit: 777 }), joined = page.content;
  assert.ok(page.resources.some(r => r.path === 'scripts/run.py' && r.executable === false));
  assert.ok(!page.resources.some(r => r.path.includes('.env')));
  assert.strictEqual(page.policy.includes('not permission grants'), true);
  while (page.nextOffset !== null) {
    page = loadSkill({ name: local.id, offset: page.nextOffset, limit: 777, expectedHash: page.hash });
    assert.strictEqual(clipJson(page).content, page.content, 'MCP clipping must preserve paged text');
    joined += page.content;
  }
  assert.strictEqual(joined, long);
  assert.throws(() => loadSkill({ name: local.id, offset: 1 }), /expectedHash/);
  assert.throws(() => loadSkill({ name: local.id, limit: 9000 }), /limit/);
  assert.throws(() => loadSkill({ name: local.id, offset: -1 }), /offset/);
  fs.appendFileSync(md, '\nCHANGED');
  assert.throws(() => loadSkill({ name: local.id, offset: 777, expectedHash: page.hash }), /changed/);
  assert.strictEqual(loadSkill({ name: local.id, resource: 'references/check.md' }).content, 'READ-ONLY-REFERENCE');
  assert.ok(loadSkill({ name: local.id, resource: 'scripts/run.py' }).content.includes('MUST NOT RUN'));
  for (const resource of ['../outside.md', '/tmp/outside.md', 'C:\\outside.md', 'references/.env.md', 'references/binary.md', 'references/invalid.txt']) {
    assert.throws(() => loadSkill({ name: local.id, resource }), /resource|UTF-8|Binary|path/i);
  }
  const outside = put('external/outside.md', 'Not a skill resource');
  fs.symlinkSync(path.dirname(outside), path.join(config.workspaceRoot, '.webagent/skills/review/references/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => loadSkill({ name: local.id, resource: 'references/linked/outside.md' }), /Symbolic/);
  assert.ok(!loadSkill({ name: local.id }).resources.some(r => r.path.includes('linked')));
  put('.webagent/skills/computer-use/SKILL.md', '# Local override\nMust not inherit bundled script hints.');
  assert.strictEqual(loadSkill({ name: 'computer-use' }).scriptsDir, undefined);
  assert.ok(loadSkill({ name: 'bundled:computer-use' }).scriptsDir);
  const first = loadSkill({ pageSize: 2 });
  const second = loadSkill({ pageSize: 2, cursor: first.nextCursor });
  assert.strictEqual(new Set([...first.skills, ...second.skills].map(s => s.id)).size, 4);
  // F131: <home>/.webagent/skills is a global source after the workspace ones, with its own containment rules.
  assert.strictEqual(userSkillsRoot(), path.join(home, '.webagent', 'skills'));
  assert.ok(!listSkills().some(s => s.source === 'user'), 'no global folder, no global skills');
  const putHome = (relative, text) => { const file = path.join(home, '.webagent', 'skills', relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); return file; };
  putHome('translate/SKILL.md', '---\ndescription: Global helper\n---\n# Translate');
  putHome('translate/references/terms.md', 'GLOBAL-TERMS');
  putHome('translate/references/.env.md', 'SECRET');
  putHome('review/SKILL.md', '# Global review');
  putHome('.hidden/SKILL.md', '# hidden');
  const globalCatalog = listSkills();
  const translate = globalCatalog.find(s => s.id === 'user:translate');
  assert.ok(translate && translate.ready && translate.description === 'Global helper', JSON.stringify(translate));
  assert.strictEqual(translate.path, '~/.webagent/skills/translate'); assert.strictEqual(translate.skillFile, '~/.webagent/skills/translate/SKILL.md');
  assert.ok(!JSON.stringify(discoverSkills()).includes(home) && !JSON.stringify(loadSkill({ pageSize: 50 })).includes(home), 'the home path is never serialized');
  assert.ok(!JSON.stringify(loadSkill({ name: 'user:translate' })).includes(home) && translate.skillFileAbs === undefined);
  assert.strictEqual(globalCatalog.find(s => s.id === 'user:review').shadowedBy, 'workspace:review', 'a project skill overrides a global one by name');
  assert.ok(!globalCatalog.some(s => s.id.includes('hidden')), 'hidden folders are skipped');
  assert.ok(globalCatalog.findIndex(s => s.id === 'user:translate') < globalCatalog.findIndex(s => s.source === 'bundled'), 'global skills come before bundled ones');
  assert.strictEqual(loadSkill({ name: 'translate' }).content.includes('# Translate'), true);
  assert.strictEqual(loadSkill({ name: 'user:translate', resource: 'references/terms.md' }).content, 'GLOBAL-TERMS');
  assert.ok(!loadSkill({ name: 'user:translate' }).resources.some(r => r.path.includes('.env')));
  for (const resource of ['references/.env.md', '../review/SKILL.md', '../../../workspace/outside.md']) {
    assert.throws(() => loadSkill({ name: 'user:translate', resource }), /resource|path/i, resource);
  }
  const elsewhere = path.join(root, 'elsewhere'); fs.mkdirSync(path.join(elsewhere, 'linked'), { recursive: true });
  fs.writeFileSync(path.join(elsewhere, 'linked', 'SKILL.md'), '# linked');
  fs.symlinkSync(path.join(elsewhere, 'linked'), path.join(home, '.webagent', 'skills', 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.ok(!listSkills().some(s => s.id === 'user:linked'), 'a linked or junctioned global skill folder is not followed');
  if (process.platform !== 'win32' && process.getuid && process.getuid() !== 0) {
    // An unreadable global skill: the system error names the path, the catalog shows it as ~.
    const locked = putHome('locked/SKILL.md', '# locked'); fs.chmodSync(locked, 0o000);
    try {
      const entry = listSkills().find(s => s.id === 'user:locked');
      assert.ok(entry && entry.ready === false && entry.reason === 'unreadable' && !entry.preview.includes(home) && entry.preview.includes('~/.webagent/skills'), JSON.stringify(entry));
    } finally { fs.chmodSync(locked, 0o600); }
  }
  const workspaceBefore = config.workspaceRoot; config.workspaceRoot = home;
  try {
    const atHome = listSkills();
    assert.ok(atHome.some(s => s.id === 'workspace:translate') && !atHome.some(s => s.source === 'user'), 'a workspace at the home folder lists the folder once');
  } finally { config.workspaceRoot = workspaceBefore; }
  fs.rmSync(path.join(home, '.webagent'), { recursive: true, force: true });
  put('.webagent/skills/huge/SKILL.md', 'a'.repeat(129 * 1024));
  const huge = listSkills().find(s => s.id === 'workspace:huge');
  assert.strictEqual(huge.ready, false); assert.strictEqual(huge.reason, 'too-large'); assert.strictEqual(huge.fix, SKILL_LOAD_REASONS['too-large']);
  assert.throws(() => loadSkill({ name: 'workspace:huge' }), error => error.code === 'E_NOT_READY' && /too-large/.test(error.message) && /128 KiB/.test(error.message) && error.message.includes(SKILL_LOAD_REASONS['too-large']));
  // Every load failure of SKILL.md gets a stable reason code with a fix.
  const reasonCases = { binary: Buffer.from([35, 0, 65]), 'not-utf8': Buffer.from([0xff, 0xfe, 0x41]), empty: ' \r\n\t' };
  for (const [reason, bytes] of Object.entries(reasonCases)) {
    put(`.webagent/skills/r-${reason}/SKILL.md`, bytes);
    const entry = listSkills().find(s => s.id === `workspace:r-${reason}`);
    assert.strictEqual(entry.ready, false, reason); assert.strictEqual(entry.reason, reason); assert.ok(entry.fix, reason);
  }
  put('.webagent/skills/r-bom/SKILL.md', '\uFEFF# BOM is fine');
  assert.strictEqual(listSkills().find(s => s.id === 'workspace:r-bom').ready, true, 'a UTF-8 BOM alone does not make SKILL.md unusable');
  assert.strictEqual(listSkills().find(s => s.id === 'workspace:r-bom').reason, undefined);
  if (process.platform !== 'win32') {
    put('.webagent/skills/r-symlink/real.md', '# Real');
    fs.symlinkSync('real.md', path.join(config.workspaceRoot, '.webagent/skills/r-symlink/SKILL.md'));
    const linked = listSkills().find(s => s.id === 'workspace:r-symlink');
    assert.strictEqual(linked, undefined, 'a symbolic SKILL.md is not discovered as a skill at all');
    fs.rmSync(path.join(config.workspaceRoot, '.webagent/skills/r-symlink'), { recursive: true });
  }
  for (const reason of Object.keys(reasonCases).concat('r-bom')) fs.rmSync(path.join(config.workspaceRoot, `.webagent/skills/${reason.startsWith('r-') ? reason : 'r-' + reason}`), { recursive: true });
  // No mtime cache: direct edits must be visible immediately.
  put('skills/review/SKILL.md', '# Changed\nImmediately visible.');
  assert.ok(loadSkill({ name: 'shared:review' }).content.includes('Immediately visible'));
  if (process.platform === 'linux') {
    require('child_process').execFileSync('mkfifo', [path.join(config.workspaceRoot, '.webagent/skills/review/references/pipe.md')]);
    assert.throws(() => loadSkill({ name: 'workspace:review', resource: 'references/pipe.md' }), /regular file/);
  }
  for (let i = 0; i < 140; i++) put(`.webagent/skills/bulk-${i}/SKILL.md`, '# bounded');
  const bounded = discoverSkills();
  assert.strictEqual(bounded.truncated, true);
  assert.ok(bounded.skills.length <= 131);
  assert.ok(bounded.skills.some(s => s.id === 'bundled:computer-use'));
  console.log('Skill lifecycle: discovery, origins, progressive/hash-bound reads, resources, bounds and no execution passed');
} finally {
  config.workspaceRoot = before;
  for (const [key, value] of Object.entries(homeBefore)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  fs.rmSync(root, { recursive: true, force: true });
}
