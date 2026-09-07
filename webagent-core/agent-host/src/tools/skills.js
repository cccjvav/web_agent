const fs = require('fs');
const path = require('path');
const { config } = require('../config');

function skillRoots() {
  return [
    path.join(config.workspaceRoot, '.webagent', 'skills'),
    path.join(config.workspaceRoot, 'skills')
  ];
}

const BUNDLED_SKILL_NAMES = ['computer-use', 'project-manager'];

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
      preview: fs.readFileSync(md, 'utf8').slice(0, 240)
    });
  }
  return out;
}

function addSkill(skills, seen, entry) {
  if (seen.has(entry.name)) return;
  seen.add(entry.name);
  skills.push(entry);
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
        addSkill(skills, seen, {
          name,
          path: path.relative(config.workspaceRoot, dir),
          absDir: dir,
          preview: fs.readFileSync(md, 'utf8').slice(0, 240)
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
      skills: skills.map(({ name: n, path: p, preview }) => ({ name: n, path: p, preview })),
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
  const out = {
    found: true,
    name: hit.name,
    path: hit.path,
    absDir: hit.absDir,
    content: fs.readFileSync(md, 'utf8').slice(0, 28000)
  };
  if (hit.name === 'computer-use') {
    // 「手」的薄转发：脚本在仓库根（不在工作区），给模型绝对目录与现成命令模板。
    // run_command 的 cwd 仍锁在工作区；命令串可达该目录是 SECURITY.md 已披露的边界。
    out.scriptsDir = path.join(hit.absDir, 'win');
    out.runHint = [
      'Windows 本机 Chat：经 run_command 执行（cwd 留在工作区），例如',
      `& "${path.join(out.scriptsDir, 'snap.ps1')}" -WindowTitle <标题子串> -Out shots\\cur.png`,
      '截图请用 -Out 存到工作区内（如 shots\\cur.png）：Chat 会把新截图作为图片附进下一轮请求（模型需标记 vision）。',
      'Bridge / 网页 MCP 不回传图片，远程网页 Agent 看不了屏幕。'
    ].join('\n');
  }
  return out;
}

module.exports = { loadSkill, listSkills };
