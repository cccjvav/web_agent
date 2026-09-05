function normalizeBase(url) {
  return String(url || '')
    .trim()
    .replace(/\/$/, '')
    .replace(/\/chat\/completions$/i, '');
}

function probeCaps(m) {
  if (!m || typeof m !== 'object') return [];
  if (Array.isArray(m.capabilities) && m.capabilities.length) return m.capabilities.map(String);
  if (Array.isArray(m.supported_features) && m.supported_features.length) return m.supported_features.map(String);
  if (Array.isArray(m.caps) && m.caps.length) return m.caps.map(String);
  return [];
}

function probeContext(m) {
  if (!m || typeof m !== 'object') return '';
  const n = m.context_length || m.context_window || m.max_model_len || m.contextSize;
  if (n == null || n === '') return '';
  if (typeof n === 'number' && Number.isFinite(n)) {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1000) return `${Math.round(n / 1000)}K`;
    return String(n);
  }
  return String(n);
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
      contextSize: probeContext(m),
      caps: probeCaps(m),
      pricing: m.pricing || ''
    };
  });
}

module.exports = { listRemoteModels, normalizeBase, probeCaps, probeContext };
