const fs = require('fs');
const path = require('path');
const { config } = require('../config');

function skillRoots() {
  return [
    path.join(config.workspaceRoot, '.shuncode', 'skills'),
    path.join(config.workspaceRoot, 'skills')
  ];
}

function listSkills() {
  const skills = [];
  for (const root of skillRoots()) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      const dir = path.join(root, name);
      const md = path.join(dir, 'SKILL.md');
      if (fs.existsSync(md) && fs.statSync(dir).isDirectory()) {
        skills.push({
          name,
          path: path.relative(config.workspaceRoot, dir),
          preview: fs.readFileSync(md, 'utf8').slice(0, 240)
        });
      }
    }
  }
  return skills;
}

function loadSkill({ name } = {}) {
  const skills = listSkills();
  if (!name) {
    return {
      skills,
      hint: skills.length ? 'Pass name to load a SKILL.md in full.' : 'No skills yet. Put a folder with SKILL.md under .shuncode/skills/.'
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
  const md = path.join(config.workspaceRoot, hit.path, 'SKILL.md');
  return {
    found: true,
    name: hit.name,
    path: hit.path,
    content: fs.readFileSync(md, 'utf8').slice(0, 8000)
  };
}

module.exports = { loadSkill, listSkills };
