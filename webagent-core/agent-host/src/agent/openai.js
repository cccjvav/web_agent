const { clipJson } = require('../mcp/budget');
const { callTool, getToolList } = require('../tools');
const { loadCustom } = require('../models/customizations');
const { config } = require('../config');
const { formatWorkspaceContext, resolveEnvironment } = require('../models/profile');
const { listSkills } = require('../tools/skills');
const { toolLabel } = require('./toolLabel');
const { collectShot } = require('./computerUse');
const { fetchText, checkCancelled } = require('../utils/requestScope');

// 模型会不会看图：显式 vision 标记（设置页 Add API 勾选）或 caps 里带 vision。
// 探测不到的纯文本 Endpoint 一律按「不会看图」处理——宁可诚实拒绝，不假装 OCR。
function modelSeesImages(model) {
  if (!model) return false;
  if (model.vision === true) return true;
  const caps = Array.isArray(model.caps)
    ? model.caps
    : (Array.isArray(model.capabilities) ? model.capabilities : []);
  return caps.some((c) => /vision/i.test(String(c)));
}

function systemPrompt(mode) {
  const lock =
    mode === 'code'
      ? 'You may call apply_patch, delete_file, rename_file, start_command, run_command. Prefer apply_patch over write_file. Prefer start_command for tests/builds. On STALE_FILE, re-read then retry.'
      : 'READ-ONLY. You must not patch, write, delete, rename, or run commands. Investigate with list_directory, find_files, search_files, read_files, git_status, git_diff, load_skill.';

  const custom = loadCustom();
  const env = resolveEnvironment(custom);
  const reply =
    env.replyLanguage === 'follow-user'
      ? 'Reply in the same language as the user.'
      : env.replyLanguage === 'en'
        ? 'Reply in English.'
        : '用中文回复。';
  return [
    'You are Web Agent, a local coding agent. Editor is Code-OSS; you run in agent-host, not the VS Code kernel.',
    `Workspace root: ${config.workspaceRoot}`,
    `Current mode: ${mode.toUpperCase()}. ${lock}`,
    'Loop: search/find → read_files (keep sha256) → apply_patch → run_command or start_command for tests.',
    'Do not assume any particular file exists (including calculator.js). Inspect THIS workspace.',
    'Search first, then read only the needed files. Use sha256 from read_files when patching.',
    `${reply} Be concise. After tools, give a short conclusion.`,
    env.shell === 'powershell' || env.os === 'windows'
      ? 'This machine is Windows. Prefer PowerShell; do not assume bash.'
      : `Shell is ${env.shell}.`,
    mode === 'plan'
      ? 'Plan mode: produce a concrete plan. Do not modify the repo. Mention that Code mode is required to apply changes.'
      : '',
    custom.instructions ? `Workspace instructions:\n${custom.instructions}` : '',
    formatWorkspaceContext(custom, listSkills())
  ]
    .filter(Boolean)
    .join('\n');
}

function temperatureFor(level) {
  if (level === 'low') return 0.1;
  if (level === 'medium') return 0.4;
  return 0.7;
}

async function runOpenAI({
  mode,
  message,
  history = [],
  emit,
  model,
  thinkLevel,
  allowTools = true,
  extraSystem
} = {}) {
  const send = typeof emit === 'function' ? emit : () => {};
  const base = String(model.baseUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('baseUrl 为空');
  const tools = allowTools
    ? getToolList(mode).map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema || { type: 'object', properties: {} }
      }
    }))
    : undefined;

  const sys = [systemPrompt(mode), extraSystem].filter(Boolean).join('\n\n');
  const messages = [
    { role: 'system', content: sys },
    ...history
      .filter((h) => h && h.content && (h.role === 'user' || h.role === 'assistant'))
      .slice(-12)
      .map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message || '' }
  ];

  const bodyBase = {
    model: model.modelId,
    messages,
    temperature: temperatureFor(thinkLevel)
  };
  if (tools && tools.length) {
    bodyBase.tools = tools;
    bodyBase.tool_choice = 'auto';
  }

  for (let step = 0; step < 10; step++) {
    send('status', { text: step === 0 ? `请求 ${model.modelId || 'model'}…` : '模型继续调用工具…' });
    checkCancelled();
    const { response: resp, text: raw } = await fetchText(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${model.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...bodyBase, messages })
    });
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
      if (!Array.isArray(msg.tool_calls) || msg.tool_calls.some(tc => !tc || typeof tc.id !== 'string')
        || new Set(msg.tool_calls.map(tc => tc.id)).size !== msg.tool_calls.length) throw new Error('模型工具调用缺少唯一id');
      for (const [index, tc] of msg.tool_calls.entries()) {
        if (index >= 8) {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ ok: false, error: '本轮工具执行上限为8，请在后续轮次重新请求' }) });
          continue;
        }
        const name = tc.function && tc.function.name;
        let args = {};
        try {
          args = JSON.parse((tc.function && tc.function.arguments) || '{}');
        } catch {
          args = {};
        }
        send('status', { text: `调用 ${name}…` });
        const t0 = Date.now();
        try {
          const result = await callTool(name, args, mode);
          if (result && (result.ok === false || result.success === false)) throw new Error(result.error || result.message || '工具执行失败');
          const durationMs = Date.now() - t0;
          send('tool', { name, args, result, ok: true, durationMs, label: toolLabel(name, result, true) });
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(clipJson(result, 12000))
          });
          // 本机 Chat 的「眼睛」：run_command 产生截图（如 computer-use snap.ps1 -Out …）时，
          // 下一轮把 PNG 作为 image_url 部分发给模型。文本通道会被 12000 字截断，不能当眼睛。
          // MCP/Bridge 不走这里：tools/call 仍只回 type:'text'。
          if (name === 'run_command') {
            const shot = collectShot({
              command: String(args.command || ''),
              stdout: String((result && result.stdout) || '')
            });
            if (shot && shot.tooBig) {
              const note = `截图 ${shot.rel} 约 ${Math.round(shot.bytes / 1048576)}MB，超过 6MB 上限，未附加。请让用户降低 snap.ps1 -Quality 或改截更小窗口；如实说明你看不到这张图。`;
              messages.push({ role: 'user', content: `[系统提示] ${note}` });
              send('status', { text: `截图过大未附加：${shot.rel}` });
            } else if (shot && shot.dataUrl) {
              if (modelSeesImages(model)) {
                messages.push({
                  role: 'user',
                  content: [
                    { type: 'text', text: `computer-use 截图 ${shot.rel}（${shot.bytes} 字节）已作为图片附上。看图决策；坐标用这张图的像素空间传给 mark/act-bg。` },
                    { type: 'image_url', image_url: { url: shot.dataUrl } }
                  ]
                });
                send('status', { text: `已把截图作为图片发给模型：${shot.rel}` });
              } else {
                const honest = '截图已生成，但当前模型未标记为可看图（设置 → API → Add API 时勾选「可看图 vision」）。computer-use 看不了屏幕；请把这一点如实转告用户，不要假装看到了画面。';
                messages.push({ role: 'user', content: `[系统提示] ${honest}` });
                send('status', { text: '当前模型不会看图：computer-use 看不了屏幕（设置 → API 换标记 vision 的模型）' });
              }
            }
          }
        } catch (err) {
          const durationMs = Date.now() - t0;
          send('tool', { name, args, error: err.message, ok: false, durationMs, label: toolLabel(name, null, false) });
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `ERROR: ${err.message}`
          });
        }
      }
      continue;
    }

    const text = msg.content || '（无文本输出）';
    send('message', { text });
    return { text };
  }
  const text = '已达到最大工具轮次。';
  send('message', { text });
  return { text };
}

module.exports = { runOpenAI, systemPrompt, temperatureFor, modelSeesImages };
