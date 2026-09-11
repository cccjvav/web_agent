const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { resolveSafePath } = require('./patchEngine');
const { ProtocolError } = require('../mcp/errors');

const MAX_SKILL_BYTES = 128 * 1024;
function readSkillPrefix(file, chars) {
  if (!fs.statSync(file).isFile()) {
    throw new ProtocolError('E_BAD_ARGS', 'SKILL.md must be a regular file.');
  }
  const fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_SKILL_BYTES) {
      throw new ProtocolError('E_BAD_ARGS', 'SKILL.md must be a regular file no larger than 128 KiB.');
    }
    const buffer = Buffer.alloc(Math.min(stat.size, (chars + 1) * 4));
    const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const text = buffer.subarray(0, bytes).toString('utf8');
    return { content: text.slice(0, chars), truncated: bytes < stat.size || text.length > chars };
  } finally {
    fs.closeSync(fd);
  }
}
function preview(file) {
  try { return readSkillPrefix(file, 240).content; }
  catch (err) { if (err.code === 'E_BAD_ARGS') return err.message; throw err; }
}


function skillRoots() {
  return [
    path.join(config.workspaceRoot, '.webagent', 'skills'),
    path.join(config.workspaceRoot, 'skills')
  ];
}

const BUNDLED_SKILL_NAMES = ['computer-use', 'project-manager', 'multi-agent-board'];

function bundledSkills() {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const out = [];
  for (const name of BUNDLED_SKILL_NAMES) {
    const dir = path.join(repoRoot, name);
    const md = path.join(dir, 'SKILL.md');
    if (!fs.existsSync(md)) continue;
    out.push({
      name,
      path: path.relative(config.workspaceRoot, dir),
      absDir: dir,
      preview: preview(md)
    });
  }
  return out;
}

function skillFileFields(dir) {
  const md = path.join(dir, 'SKILL.md');
  return {
    skillFile: path.relative(config.workspaceRoot, md).replace(/\\/g, '/'),
    skillFileAbs: md
  };
}

function addSkill(skills, seen, entry) {
  if (seen.has(entry.name)) return;
  seen.add(entry.name);
  skills.push({ ...entry, ...skillFileFields(entry.absDir || path.join(config.workspaceRoot, entry.path)) });
}

function listSkills() {
  const skills = [];
  const seen = new Set();
  for (const root of skillRoots()) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      const dir = path.join(root, name);
      const md = path.join(dir, 'SKILL.md');
      if (fs.existsSync(md) && fs.statSync(dir).isDirectory()) {
        try { resolveSafePath(path.relative(config.workspaceRoot, md)); }
        catch (_) { continue; } // A user skill may not inherit the bundled-skill path exception.
        addSkill(skills, seen, {
          name,
          path: path.relative(config.workspaceRoot, dir),
          absDir: dir,
          preview: preview(md)
        });
      }
    }
  }
  for (const b of bundledSkills()) addSkill(skills, seen, b);
  return skills;
}

function loadSkill({ name } = {}) {
  const skills = listSkills();
  if (!name) {
    return {
      skills: skills.map(({ name: n, path: p, preview, skillFile, skillFileAbs }) => ({
        name: n,
        path: p,
        preview,
        skillFile,
        skillFileAbs
      })),
      hint: skills.length ? 'Pass name to load a SKILL.md in full.' : 'No skills yet. Put a folder with SKILL.md under .webagent/skills/.'
    };
  }
  const hit = skills.find((s) => s.name === name);
  if (!hit) {
    return {
      found: false,
      name,
      available: skills.map((s) => s.name),
      hint: 'Unknown skill. Use one of available or omit name to list.'
    };
  }
  const md = path.join(hit.absDir, 'SKILL.md');
  const prefix = readSkillPrefix(md, 28000);
  const out = {
    found: true,
    name: hit.name,
    path: hit.path,
    absDir: hit.absDir,
    skillFile: hit.skillFile,
    skillFileAbs: hit.skillFileAbs,
    content: prefix.content,
    truncated: prefix.truncated
  };
  if (hit.name === 'computer-use') {
    // 「手」的薄转发：脚本在仓库根（不在工作区），给模型绝对目录与现成命令模板。
    // run_command 的 cwd 仍锁在工作区；命令串可达该目录是 SECURITY.md 已披露的边界。
    out.scriptsDir = path.join(hit.absDir, 'win');
    out.runHint = [
      'Windows 本机 Chat：经 run_command 执行（cwd 留在工作区），例如',
      `& "${path.join(out.scriptsDir, 'snap.ps1')}" -WindowTitle <标题子串> -Out shots\\cur.png`,
      '截图请用 -Out 存到工作区内（如 shots\\cur.png）：Chat 会把新截图作为图片附进下一轮请求（模型需标记 vision）。',
      'Bridge / 网页 MCP 会把新产生的截图作为 image 内容附进 tools/call 回包（第三阶段，用户签字后启用）；远程危险命令仍被拒。'
    ].join('\n');
  }
  return out;
}

module.exports = { loadSkill, listSkills };
