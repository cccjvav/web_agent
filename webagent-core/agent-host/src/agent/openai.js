const { clipJson } = require('../mcp/budget');
const { callTool, getToolList } = require('../tools');
const { loadCustom } = require('../models/customizations');
const { config } = require('../config');
const { formatWorkspaceContext, resolveEnvironment } = require('../models/profile');
const { listSkills } = require('../tools/skills');
const { toolLabel } = require('./toolLabel');
const { collectShot } = require('./computerUse');
const { fetchText, checkCancelled } = require('../utils/requestScope');
const { isToolFailure } = require('../utils/toolTrace');

const MODEL_REQUEST_MAX_BYTES = 12 * 1024 * 1024;
const MODEL_RESPONSE_MAX_BYTES = 1024 * 1024;
const MODEL_TOOL_CALL_MAX = 64;
const MODEL_TOOL_EXECUTION_MAX = 8;
const MODEL_TOOL_ARGUMENT_MAX_BYTES = 256 * 1024;

function isResponseRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function encodeModelRequest(body) {
  const encoded = JSON.stringify(body);
  if (Buffer.byteLength(encoded, 'utf8') > MODEL_REQUEST_MAX_BYTES) {
    const error = new Error(`模型请求超过 ${MODEL_REQUEST_MAX_BYTES} 字节上限`);
    error.code = 'E_MODEL_REQUEST_TOO_LARGE';
    error.maxBytes = MODEL_REQUEST_MAX_BYTES;
    throw error;
  }
  return encoded;
}

function normalizeAssistantMessage(data) {
  if (!isResponseRecord(data) || !Array.isArray(data.choices) || !isResponseRecord(data.choices[0])
    || !isResponseRecord(data.choices[0].message)) throw new Error('模型没有 message');
  const source = data.choices[0].message;
  if (source.role !== undefined && source.role !== 'assistant') throw new Error('模型 message.role 类型无效');
  if (source.content !== undefined && source.content !== null && typeof source.content !== 'string') {
    throw new Error('模型 message.content 类型无效');
  }
  const rawCalls = source.tool_calls == null ? [] : source.tool_calls;
  if (!Array.isArray(rawCalls)) throw new Error('模型 tool_calls 类型无效');
  if (rawCalls.length > MODEL_TOOL_CALL_MAX) throw new Error(`模型工具调用超过${MODEL_TOOL_CALL_MAX}项上限`);
  const ids = new Set();
  const calls = rawCalls.map(call => {
    if (!isResponseRecord(call) || typeof call.id !== 'string' || !call.id
      || Buffer.byteLength(call.id, 'utf8') > 256 || /[\r\n\0]/.test(call.id)
      || ids.has(call.id) || (call.type !== undefined && call.type !== 'function')
      || !isResponseRecord(call.function)
      || typeof call.function.name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_.-]{0,119}$/.test(call.function.name)
      || typeof call.function.arguments !== 'string'
      || Buffer.byteLength(call.function.arguments, 'utf8') > MODEL_TOOL_ARGUMENT_MAX_BYTES) {
      throw new Error('模型工具调用形状无效');
    }
    let args;
    try { args = JSON.parse(call.function.arguments); }
    catch (_) { throw new Error('模型工具调用参数不是对象JSON'); }
    if (!isResponseRecord(args)) throw new Error('模型工具调用参数不是对象JSON');
    ids.add(call.id);
    return { id: call.id, name: call.function.name, arguments: call.function.arguments, args };
  });
  return {
    message: {
      role: 'assistant',
      content: source.content == null ? null : source.content,
      ...(calls.length ? { tool_calls: calls.map(call => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments }
      })) } : {})
    },
    calls
  };
}

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

// Reasoning model families reject sampling parameters: OpenAI answers o1/o3/o4-mini/gpt-5* with
// `400 Unsupported value: 'temperature' ... Only the default (1) value is supported`. Because
// provider error bodies are deliberately never reflected (see runOpenAI), a user who picked such
// a model saw nothing but "模型 HTTP 400" on every request. Matched on the configured modelId,
// optionally behind a provider prefix (`openai/gpt-5`); an unmatched id keeps today's behaviour.
const REASONING_MODEL = /^(?:[\w.-]+\/)?(?:o\d+(?:$|[-_.])|gpt-5)/i;

// Request fields that carry the 思考 low/medium/high choice. Reasoning families get
// `reasoning_effort` (same three values) and no temperature; the gpt-5 `-chat` variants are
// non-reasoning models that also reject a custom temperature, so they get neither. Every other
// model keeps the temperature mapping. Omitting a sampling field is always valid: both are
// optional in the chat/completions contract.
function samplingParams(modelId, level) {
  const id = String(modelId || '');
  if (!REASONING_MODEL.test(id)) return { temperature: temperatureFor(level) };
  if (/-chat(?:$|[-_.])/i.test(id)) return {};
  return { reasoning_effort: ['low', 'medium', 'high'].includes(level) ? level : 'high' };
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
  if (!model || typeof model !== 'object' || Array.isArray(model)) throw new Error('模型配置无效');
  const base = String(model.baseUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('baseUrl 为空');
  if (message !== undefined && message !== null && typeof message !== 'string') throw new Error('模型消息必须是字符串');
  if (extraSystem !== undefined && extraSystem !== null && typeof extraSystem !== 'string') throw new Error('模型系统提示必须是字符串');
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
  const advertisedToolNames = new Set((tools || []).map(tool => tool.function.name));

  const sys = [systemPrompt(mode), extraSystem].filter(Boolean).join('\n\n');
  const messages = [
    { role: 'system', content: sys },
    ...history
      .filter((h) => isResponseRecord(h) && typeof h.content === 'string' && h.content
        && (h.role === 'user' || h.role === 'assistant'))
      .slice(-12)
      .map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message || '' }
  ];

  const bodyBase = {
    model: model.modelId,
    messages,
    ...samplingParams(model.modelId, thinkLevel)
  };
  if (tools && tools.length) {
    bodyBase.tools = tools;
    bodyBase.tool_choice = 'auto';
  }

  for (let step = 0; step < 10; step++) {
    send('status', { text: step === 0 ? `请求 ${model.modelId || 'model'}…` : '模型继续调用工具…' });
    checkCancelled();
    const requestBody = encodeModelRequest({ ...bodyBase, messages });
    const { response: resp, text: raw } = await fetchText(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${model.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: requestBody,
      redirect: 'error'
    }, 120000, { maxBytes: MODEL_RESPONSE_MAX_BYTES });
    if (!resp.ok) {
      const status = Number.isInteger(resp.status) ? ` ${resp.status}` : '';
      throw new Error(`模型 HTTP${status} 请求失败`);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('模型返回不是 JSON');
    }
    const normalized = normalizeAssistantMessage(data);
    if (normalized.calls.some(call => !advertisedToolNames.has(call.name))) {
      throw new Error('模型调用了未声明或已禁用的工具');
    }
    const msg = normalized.message;
    messages.push(msg);

    if (normalized.calls.length) {
      for (const [index, tc] of normalized.calls.entries()) {
        if (index >= MODEL_TOOL_EXECUTION_MAX) {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ ok: false, error: '本轮工具执行上限为8，请在后续轮次重新请求' }) });
          continue;
        }
        const name = tc.name;
        const args = tc.args;
        send('status', { text: `调用 ${name}…` });
        const t0 = Date.now();
        try {
          const result = await callTool(name, args, mode);
          const failed = isToolFailure(result);
          const durationMs = Date.now() - t0;
          send('tool', { name, args, result,
            ...(failed ? { error: result?.error || result?.message || result?.result?.error || '工具执行失败' } : {}),
            ok: !failed, durationMs, label: toolLabel(name, result, !failed) });
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(clipJson(result, 12000))
          });
          // A returned failure is still evidence for the next model turn. Preserve the full
          // bounded result, but do not run success-only consumers such as screenshot capture.
          if (failed) continue;
          // 本机 Chat 的「眼睛」：run_command 产生截图（如 computer-use snap.ps1 -Out …）时，
          // 下一轮把 PNG 作为 image_url 部分发给模型。文本通道会被 12000 字截断，不能当眼睛。
          // MCP/Bridge 不走这里：mcp/server.js 复用 collectShot，以 MCP image 内容回图。
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

module.exports = {
  MODEL_REQUEST_MAX_BYTES,
  MODEL_RESPONSE_MAX_BYTES,
  MODEL_TOOL_CALL_MAX,
  runOpenAI,
  systemPrompt,
  temperatureFor,
  samplingParams,
  modelSeesImages
};
