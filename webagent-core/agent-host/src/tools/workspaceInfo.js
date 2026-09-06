const path = require('path');
const fs = require('fs');
const { config } = require('../config');
const { loadCustom } = require('../models/customizations');
const { resolveEnvironment, resolveTechStack } = require('../models/profile');
const { listSkills } = require('./skills');
const { gitStatus } = require('./gitOps');
const { listDir } = require('./fileOps');
const { getInstructions } = require('../mcp/instructions');

function workspaceInfo() {
  const custom = loadCustom();
  const environment = resolveEnvironment(custom);
  const techStack = resolveTechStack(custom);
  let git = { available: false };
  try {
    git = { available: true, ...gitStatus() };
  } catch (err) {
    git = { available: false, error: err.message };
  }
  let topLevel = [];
  try {
    const listed = listDir({ dirPath: '.', recursive: false, maxDepth: 1 });
    topLevel = (listed.items || []).map((it) => ({ name: it.name, type: it.type, path: it.path }));
  } catch {
    topLevel = [];
  }
  const pkgPath = path.join(config.workspaceRoot, 'package.json');
  let packageName = null;
  try {
    if (fs.existsSync(pkgPath)) {
      packageName = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).name || null;
    }
  } catch {
    packageName = null;
  }
  return {
    root: config.workspaceRoot,
    packageName,
    git: {
      available: git.available,
      branch: git.branch || null,
      error: git.error || null
    },
    environment,
    techStack,
    skills: listSkills().map((s) => s.name),
    topLevel,
    rules: getInstructions(),
    hint: 'Some web MCP clients drop initialize.instructions. Follow `rules` here. Then search_files / read_files; do not dump the whole tree.'
  };
}

module.exports = { workspaceInfo };
