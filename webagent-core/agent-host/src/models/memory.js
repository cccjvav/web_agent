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
  const cap = Math.max(1, Math.min(200, Number(limit) || 40));
  const files = day
    ? [dayFile(day)]
    : fs.readdirSync(memoryDir()).filter((f) => f.endsWith('.md')).sort().reverse().map((f) => path.join(memoryDir(), f));
  const bullets = [];
  let truncated = false;
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const body = fs.readFileSync(file, 'utf8');
    for (const line of body.split('\n')) {
      if (!/^\s*-\s/.test(line)) continue;
      if (bullets.length >= cap) {
        truncated = true;
        break;
      }
      bullets.push(line.trim());
    }
    if (truncated) break;
  }
  let text = bullets.join('\n') || '(empty memory)';
  if (text.length > 8000) {
    text = `${text.slice(0, 7920)}\n…`;
    truncated = true;
  }
  return {
    files: files.map((f) => path.relative(config.workspaceRoot, f)),
    text,
    count: bullets.length,
    truncated
  };
}

module.exports = { remember, recall, memoryDir };
