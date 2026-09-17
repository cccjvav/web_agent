const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { resolveSafePath } = require('../tools/patchEngine');
const { ProtocolError } = require('../mcp/errors');
const { readBoundedText } = require('../utils/boundedFile');

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
  if (text != null && typeof text !== 'string') throw new ProtocolError('E_BAD_ARGS', 'memory text must be a string');
  const body = String(text || '').trim();
  if (Buffer.byteLength(body, 'utf8') > 16 * 1024 || body.includes('\0')) throw new ProtocolError('E_BAD_ARGS', 'memory text must be at most 16 KiB and contain no NUL');
  if (!body) return { ok: false, error: 'text required' };
  const file = dayFile(day);
  const line = `\n- ${new Date().toISOString()} ${body.replace(/[\r\n]+/g, ' ')}\n`;
  let previous;
  try { previous = fs.lstatSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const addition = previous ? line : `# ${path.basename(file, '.md')}\n${line}`;
  if (previous && !previous.isFile()) throw new ProtocolError('E_BAD_ARGS', 'memory target must be a regular file');
  if ((previous ? previous.size : 0) + Buffer.byteLength(addition, 'utf8') > 256 * 1024) throw new ProtocolError('E_BAD_ARGS', 'memory day exceeds 256 KiB; preserve it and choose another explicit destination');
  fs.mkdirSync(memoryDir(), { recursive: true });
  fs.appendFileSync(file, addition, { encoding: 'utf8', mode: 0o600 });
  return { ok: true, path: path.relative(config.workspaceRoot, file) };
}

function memoryFiles(dir, selectedFile) {
  if (selectedFile) return { files: [selectedFile], truncated: false };
  if (!fs.existsSync(dir)) return { files: [], truncated: false };
  const names = [], handle = fs.opendirSync(dir);
  let scanned = 0, truncated = false, entry;
  try {
    while ((entry = handle.readSync())) {
      if (++scanned > 512) { truncated = true; break; }
      if (entry.isFile() && /^\d{4}-\d{2}-\d{2}\.md$/.test(entry.name)) names.push(entry.name);
    }
  } finally { handle.closeSync(); }
  const files = [];
  for (const name of names.sort().reverse()) {
    try { files.push(dayFile(name.slice(0, -3))); }
    catch (_) { truncated = true; }
  }
  return { files: files.slice(0, 30), truncated: truncated || files.length > 30 };
}
function memoryScore(text, terms) {
  const normalized = text.normalize('NFKC').toLowerCase();
  return terms.reduce((score, term) => score + Number(normalized.includes(term)), 0);
}
function recall({ limit = 40, day, query = '' } = {}) {
  const selectedFile = day == null ? null : dayFile(day);
  const dir = memoryDir();
  if (typeof query !== 'string' || query.length > 200) throw new ProtocolError('E_BAD_ARGS', 'query must be a string of at most 200 characters');
  const terms = [...new Set(query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean))];
  if (terms.length > 20) throw new ProtocolError('E_BAD_ARGS', 'query supports at most 20 distinct whitespace-separated terms');
  const cap = Math.floor(Math.max(1, Math.min(200, Number(limit) || 40)));
  const catalog = memoryFiles(dir, selectedFile), records = [], files = [], warnings = [];
  let truncated = catalog.truncated, bytesLeft = 2 * 1024 * 1024, scannedLines = 0;
  for (const file of catalog.files) {
    if (!fs.existsSync(file)) continue;
    if (bytesLeft <= 0 || scannedLines >= 5000) { truncated = true; break; }
    const relative = path.relative(config.workspaceRoot, file);
    let body;
    try { body = readBoundedText(file, Math.min(256 * 1024, bytesLeft)); }
    catch (_) { truncated = true; warnings.push(`${relative}: unreadable or exceeds remaining text budget`); continue; }
    bytesLeft -= Buffer.byteLength(body);
    files.push(relative);
    for (const [index, line] of body.split('\n').entries()) {
      if (++scannedLines > 5000) { truncated = true; break; }
      if (!/^\s*-\s/.test(line)) continue;
      const text = line.trim(), score = terms.length ? memoryScore(text, terms) : 1;
      if (score) records.push({ text, score, source: `${relative}:${index + 1}` });
    }
    // Keep the old date/file order without a query; query scans the bounded corpus.
    if (!terms.length && records.length > cap) { truncated = true; break; }
  }
  if (terms.length) records.sort((a, b) => b.score - a.score);
  const selected = records.slice(0, cap);
  truncated ||= records.length > cap;
  let text = selected.map(item => terms.length ? `${item.text} [${item.source}]` : item.text).join('\n') || '(empty memory)';
  if (text.length > 8000) { text = `${text.slice(0, 7920)}\n…`; truncated = true; }
  return { files, text, count: selected.length, truncated, warnings,
    ranking: terms.length ? 'literal normalized term matches; not semantic search or verified facts' : 'date-descending, then file order',
    ...(terms.length ? { query } : {}) };
}

module.exports = { remember, recall, memoryDir };
