'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');
const { loadSkill, listSkills, discoverSkills } = require('../src/tools/skills');
const { clipJson } = require('../src/mcp/budget');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-skills-'));
const before = config.workspaceRoot;
config.workspaceRoot = path.join(root, 'workspace');
fs.mkdirSync(config.workspaceRoot);
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
  put('.webagent/skills/huge/SKILL.md', 'a'.repeat(129 * 1024));
  assert.strictEqual(listSkills().find(s => s.id === 'workspace:huge').ready, false);
  assert.throws(() => loadSkill({ name: 'workspace:huge' }), /128 KiB/);
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
} finally { config.workspaceRoot = before; fs.rmSync(root, { recursive: true, force: true }); }
