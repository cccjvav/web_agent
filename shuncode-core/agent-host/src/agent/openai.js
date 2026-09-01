const { callTool, getToolList } = require('../tools');
const { loadCustom } = require('../models/customizations');

function systemPrompt(mode) {
  const lock =
    mode === 'code'
      ? 'You may call apply_patch and run_command. Prefer apply_patch over write_file. Preflight the whole patch. On STALE_FILE, re-read then retry.'
      : 'READ-ONLY. You must not call apply_patch, write_file, or run_command. Investigate with list_directory, find_files, search_files, read_files, lsp, get_diagnostics.';

  return [
    'You are ShunCode, a local coding agent. Editor is Code-OSS; you run in agent-host, not the VS Code kernel.',
    `Current mode: ${mode.toUpperCase()}. ${lock}`,
    'Search first, then read only the needed files. Use sha256 from read_files when patching.',
    'Reply in the same language as the user. Be concise. After tools, give a short conclusion.',
    mode === 'plan'
      ? 'Plan mode: produce a concrete plan. Do not modify the repo. Mention that Code mode is required to apply changes.'
      : '',
    loadCustom().instructions ? `Workspace instructions:\n${loadCustom().instructions}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

async function runOpenAI({ mode, message, history = [], emit, model }) {
  const base = String(model.baseUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('baseUrl 为空');
  const tools = getToolList(mode).map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema || { type: 'object', properties: {} }
    }
  }));

  const messages = [
    { role: 'system', content: systemPrompt(mode) },
    ...history
      .filter((h) => h && h.content && (h.role === 'user' || h.role === 'assistant'))
      .slice(-12)
      .map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message || '' }
  ];

  for (let step = 0; step < 10; step++) {
    emit('status', { text: step === 0 ? `请求 ${model.modelId || 'model'}…` : '模型继续调用工具…' });
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${model.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model.modelId,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.2
      })
    });
    const raw = await resp.text();
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${raw.slice(0, 240)}`);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('模型返回不是 JSON');
    }
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) throw new Error('模型没有 message');
    messages.push(msg);

    if (msg.tool_calls && msg.tool_calls.length) {
      for (const tc of msg.tool_calls.slice(0, 8)) {
        const name = tc.function && tc.function.name;
        let args = {};
        try {
          args = JSON.parse((tc.function && tc.function.arguments) || '{}');
        } catch {
          args = {};
        }
        emit('status', { text: `调用 ${name}…` });
        try {
          const result = await callTool(name, args, mode);
          emit('tool', { name, args, result, ok: true });
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result).slice(0, 12000)
          });
        } catch (err) {
          emit('tool', { name, args, error: err.message, ok: false });
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `ERROR: ${err.message}`
          });
        }
      }
      continue;
    }

    emit('message', { text: msg.content || '（无文本输出）' });
    return;
  }
  emit('message', { text: '已达到最大工具轮次。' });
}

module.exports = { runOpenAI, systemPrompt };
