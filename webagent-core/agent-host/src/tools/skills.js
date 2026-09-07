const fs = require('fs');
const path = require('path');
const { config } = require('../config');

function skillRoots() {
  return [
    path.join(config.workspaceRoot, '.webagent', 'skills'),
    path.join(config.workspaceRoot, 'skills')
  ];
}

function bundledSkills() {
  const dir = path.resolve(__dirname, '../../../../computer-use');
  const md = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(md)) return [];
  return [{
    name: 'computer-use',
    path: path.relative(config.workspaceRoot, dir),
    absDir: dir,
    preview: fs.readFileSync(md, 'utf8').slice(0, 240)
  }];
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
  return {
    found: true,
    name: hit.name,
    path: hit.path,
    content: fs.readFileSync(md, 'utf8').slice(0, 8000)
  };
}

module.exports = { loadSkill, listSkills };
