const fs = require('fs');
const path = require('path');
const { config } = require('../config');

function memoryDir() {
  return path.join(config.workspaceRoot, '.webagent', 'memory');
}

function dayFile(day) {
  const stamp = day || new Date().toISOString().slice(0, 10);
  return path.join(memoryDir(), `${stamp}.md`);
}

function remember({ text, day } = {}) {
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: 'text required' };
  fs.mkdirSync(memoryDir(), { recursive: true });
  const file = dayFile(day);
  const line = `\n- ${new Date().toISOString()} ${body.replace(/\n+/g, ' ')}\n`;
  fs.appendFileSync(file, fs.existsSync(file) ? line : `# ${path.basename(file, '.md')}\n${line}`, 'utf8');
  return { ok: true, path: path.relative(config.workspaceRoot, file) };
}

function recall({ limit = 40, day } = {}) {
  fs.mkdirSync(memoryDir(), { recursive: true });
  const files = day
    ? [dayFile(day)]
    : fs.readdirSync(memoryDir()).filter((f) => f.endsWith('.md')).sort().reverse().map((f) => path.join(memoryDir(), f));
  const chunks = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    chunks.push(`## ${path.basename(file)}\n${fs.readFileSync(file, 'utf8')}`);
    if (chunks.join('\n').length > 8000) break;
  }
  const text = chunks.join('\n\n') || '(empty memory)';
  const lines = text.split('\n').slice(0, Math.max(5, limit));
  return { files: files.map((f) => path.relative(config.workspaceRoot, f)), text: lines.join('\n') };
}

module.exports = { remember, recall, memoryDir };
