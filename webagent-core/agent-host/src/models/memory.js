const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { resolveSafePath } = require('../tools/patchEngine');
const { ProtocolError } = require('../mcp/errors');

function memoryDir() {
  return resolveSafePath('.webagent/memory');
}

function dayFile(day) {
  const stamp = day == null ? new Date().toISOString().slice(0, 10) : String(day);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)
      || !Number.isFinite(Date.parse(stamp))
      || new Date(stamp).toISOString().slice(0, 10) !== stamp) {
    throw new ProtocolError('E_BAD_ARGS', 'day must be a valid YYYY-MM-DD calendar date.');
  }
  return resolveSafePath(`.webagent/memory/${stamp}.md`);
}

function remember({ text, day } = {}) {
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: 'text required' };
  const file = dayFile(day);
  fs.mkdirSync(memoryDir(), { recursive: true });
  const line = `\n- ${new Date().toISOString()} ${body.replace(/\n+/g, ' ')}\n`;
  fs.appendFileSync(file, fs.existsSync(file) ? line : `# ${path.basename(file, '.md')}\n${line}`, 'utf8');
  return { ok: true, path: path.relative(config.workspaceRoot, file) };
}

function recall({ limit = 40, day } = {}) {
  const selectedFile = day == null ? null : dayFile(day);
  const dir = memoryDir();
  const cap = Math.max(1, Math.min(200, Number(limit) || 40));
  const files = selectedFile
    ? [selectedFile]
    : (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse()
      .map((f) => dayFile(f.slice(0, -3)));
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
