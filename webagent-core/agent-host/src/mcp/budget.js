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

// Soft character target: never discard array members, identifiers or pagination
// metadata to meet it. Tool-specific bounds remain the hard resource limits.
function clipJson(value, maxChars = MAX_CHARS) {
  if (value == null) return value;
  if (typeof value === 'string') return clipText(value, maxChars).text;
  const raw = JSON.stringify(value);
  if (raw.length <= maxChars) return value;
  const textFields = new Set(['stdout', 'stderr', 'content', 'preview', 'text', 'diff', 'answer', 'description', 'summary']);
  const leaves = [];
  function copy(node, protectedPage = false) {
    if (!node || typeof node !== 'object') return node;
    const page = protectedPage || ['offset', 'cursor', 'nextCursor'].some(key => Object.hasOwn(node, key));
    if (Array.isArray(node)) return node.map(item => copy(item, page));
    const result = {};
    for (const [key, val] of Object.entries(node)) {
      Object.defineProperty(result, key, { value: copy(val, page), enumerable: true, writable: true, configurable: true });
      if (!page && textFields.has(key) && typeof val === 'string') leaves.push({ result, key, val });
    }
    return result;
  }
  const result = copy(JSON.parse(raw));
  for (const leaf of leaves) leaf.result[leaf.key] = '';
  const available = Math.max(0, maxChars - JSON.stringify(result).length - 150);
  const share = Math.floor(available / Math.max(1, leaves.length));
  let truncated = false;
  for (const leaf of leaves) {
    const clipped = clipText(leaf.val, share);
    leaf.result[leaf.key] = clipped.text; truncated ||= clipped.truncated;
  }
  if (!Array.isArray(result)) {
    if (truncated) { result._truncated = true; result.originalChars = raw.length; }
    if (JSON.stringify(result).length > maxChars) result._budgetExceeded = true;
  }
  return result;
}

module.exports = { MAX_CHARS, estimateTokens, clipText, clipJson };
