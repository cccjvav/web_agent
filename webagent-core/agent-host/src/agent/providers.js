function normalizeBase(url) {
  return String(url || '')
    .trim()
    .replace(/\/$/, '')
    .replace(/\/chat\/completions$/i, '');
}

function guessCaps(id) {
  const s = String(id || '').toLowerCase();
  const caps = ['工具'];
  if (/vision|image|gpt-4o|flash|pro/.test(s)) caps.push('视觉');
  if (/video/.test(s)) caps.push('视频');
  return caps;
}

function guessContext(id) {
  const s = String(id || '').toLowerCase();
  if (/video|image/.test(s)) return '1.3M';
  if (/mini|haiku|lite/.test(s)) return '128K';
  return '1.3M';
}

async function listRemoteModels(baseUrl, apiKey) {
  const base = normalizeBase(baseUrl);
  if (!base) throw new Error('API Endpoint URL 不能为空');
  if (!apiKey) throw new Error('API Key 不能为空');
  const resp = await fetch(`${base}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });
  const raw = await resp.text();
  if (!resp.ok) {
    throw new Error(`探测失败 HTTP ${resp.status}: ${raw.slice(0, 200)}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('模型列表不是 JSON。确认 Endpoint 是 OpenAI 兼容的 /v1');
  }
  const list = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
  if (!list.length) throw new Error('接口没有返回 models.data');
  const host = (() => {
    try {
      return new URL(base).hostname.replace(/^api\./, '').split('.')[0] || 'provider';
    } catch {
      return 'provider';
    }
  })();
  return list.map((m) => {
    const id = m.id || m.name;
    return {
      id,
      name: id,
      group: host,
      contextSize: guessContext(id),
      caps: guessCaps(id),
      pricing: m.pricing || ''
    };
  });
}

module.exports = { listRemoteModels, normalizeBase };
