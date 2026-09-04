/** Clip tool payloads so a remote MCP client does not burn context. ~4k tokens ≈ 16k chars. */
const MAX_CHARS = 16000;

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

function clipText(text, maxChars = MAX_CHARS) {
  const s = String(text == null ? '' : text);
  if (s.length <= maxChars) return { text: s, truncated: false };
  const keep = Math.max(0, maxChars - 80);
  return {
    text: `${s.slice(0, keep)}\n…[truncated ${s.length - keep} chars; use offset/limit, cursor, or get_command_output]`,
    truncated: true,
    originalChars: s.length
  };
}

function clipJson(value, maxChars = MAX_CHARS) {
  if (value == null) return value;
  if (typeof value === 'string') {
    const clipped = clipText(value, maxChars);
    return clipped.truncated
      ? { text: clipped.text, _truncated: true, originalChars: clipped.originalChars }
      : value;
  }
  const raw = JSON.stringify(value);
  if (raw.length <= maxChars) return value;
  const copy = (typeof value === 'object' && !Array.isArray(value)) ? { ...value } : { value };
  for (const key of ['stdout', 'stderr', 'content', 'preview', 'text', 'diff']) {
    if (typeof copy[key] === 'string' && copy[key].length > 2000) {
      const clipped = clipText(copy[key], Math.min(4000, maxChars / 3));
      copy[key] = clipped.text;
    }
  }
  if (Array.isArray(copy.matches) && copy.matches.length > 20) {
    copy.totalMatches = copy.totalMatches || copy.matches.length;
    copy.nextCursor = 20;
    copy.matches = copy.matches.slice(0, 20);
  }
  if (Array.isArray(copy.items) && copy.items.length > 40) {
    copy.nextCursor = 40;
    copy.items = copy.items.slice(0, 40);
  }
  let next = JSON.stringify(copy);
  if (next.length > maxChars) {
    return {
      _truncated: true,
      summary: clipText(next, maxChars - 120).text,
      originalChars: raw.length,
      hint: 'Narrow the path, lower limit, or pass cursor/offset.'
    };
  }
  copy._truncated = true;
  copy.originalChars = raw.length;
  return copy;
}

module.exports = { MAX_CHARS, estimateTokens, clipText, clipJson };
