import { $, $$, state, ui } from './state.js';
import { escapeHtml, renderMd } from './dom.js';

export function emptyChat() {
  return `<div class="chat-empty">
    <div class="bubble">💬</div>
    <h3>使用智能体构建</h3>
    <p>AI 答复可能不准确。</p>
    <p style="margin-top:10px">
      <button type="button" class="gen-instr" data-page="instructions">生成智能体指令</button> ·
      <button type="button" class="gen-instr" data-page="env">环境偏好</button> ·
      <button type="button" class="gen-instr" data-page="stack">技术栈</button> ·
      <button type="button" class="gen-instr" data-page="skills">技能引导</button>
    </p>
  </div>`;
}

export function paintChat() {
  const paint = (box) => {
    if (!box) return;
    if (!state.messages.length) {
      box.innerHTML = emptyChat();
      box.querySelectorAll('.gen-instr').forEach((a) => {
        a.onclick = () => ui.openModal(a.dataset.page || 'instructions');
      });
      return;
    }
    box.innerHTML = '';
    state.messages.forEach((m) => box.appendChild(renderMsg(m)));
    box.scrollTop = box.scrollHeight;
  };
  paint($('#chat-stream'));
  paint($('#agent-stream'));
}

export function summarizeTool(result) {
  if (result == null || typeof result !== 'object') return result;
  const copy = { ...result };
  if (typeof copy.content === 'string' && copy.content.length > 800) copy.content = copy.content.slice(0, 800) + '\n…';
  if (typeof copy.stdout === 'string' && copy.stdout.length > 1000) copy.stdout = copy.stdout.slice(0, 1000) + '\n…';
  return copy;
}

export function renderMsg(m) {
  const wrap = document.createElement('div');
  if (m.kind === 'user') { wrap.className = 'msg user'; wrap.textContent = m.text; return wrap; }
  if (m.kind === 'status') { wrap.className = 'status-line'; wrap.textContent = m.text; return wrap; }
  if (m.kind === 'tool') {
    const ok = m.ok !== false && !m.error;
    wrap.className = 'tool-card' + (ok ? '' : ' fail');
    const right = ok ? `${m.durationMs || 0} ms` : 'Failed';
    const title = m.label || m.name;
    wrap.innerHTML = `<button type="button" class="tool-card-toggle" aria-expanded="false"><span>${escapeHtml(title)}</span><span class="dur">${escapeHtml(right)}</span></button><pre>${escapeHtml(JSON.stringify(m.error ? { error: m.error } : summarizeTool(m.result), null, 2))}</pre>`;
    wrap.querySelector('.tool-card-toggle').onclick = (event) => {
      const pre = wrap.querySelector('pre');
      const expanded = pre.style.display === 'none' || !pre.style.display;
      pre.style.display = expanded ? 'block' : 'none';
      event.currentTarget.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    };
    return wrap;
  }
  if (m.kind === 'consensus') {
    wrap.className = 'consensus';
    const r = m.result || {};
    const parts = r.participants || [];
    const tag = r.simulated === false ? '合并主模型' : '本机拼接 · 未调模型';
    wrap.innerHTML = `<h3><span>多模型总结</span><span>${escapeHtml(tag)}</span></h3>
      <div class="branch-tabs">${['合并', ...parts.map((p) => p.model || p.id)].map((lab, i) =>
        `<button type="button" data-i="${i}" class="${i === 0 ? 'on' : ''}">${escapeHtml(lab)}</button>`).join('')}</div>
      <div class="branch-body"></div>
      <button type="button" class="adopt">按总结切到 Code 执行</button>`;
    const body = $('.branch-body', wrap);
    const show = (i) => {
      $$('.branch-tabs button', wrap).forEach((b, idx) => b.classList.toggle('on', idx === i));
      if (i === 0) {
        body.innerHTML = `<div>${renderMd(r.canonical || r.summary || '')}</div><ul>${(r.unifiedActionPlan || []).map((t) => `<li>${escapeHtml(t.title)}</li>`).join('')}</ul>`;
      } else {
        const p = parts[i - 1];
        body.innerHTML = `<p><strong>${escapeHtml(p.model)}</strong> · ${escapeHtml(p.focus || '')}</p><div>${renderMd(p.answer || '')}</div>`;
      }
    };
    show(0);
    wrap.querySelector('.branch-tabs').onclick = (e) => {
      const b = e.target.closest('button');
      if (b) show(Number(b.dataset.i));
    };
    $('.adopt', wrap).onclick = () => {
      ui.setAgentMode('code');
      ui.sendChat('按已对齐方案执行：搜相关文件、read_files、apply_patch、再跑测试');
    };
    return wrap;
  }
  wrap.className = 'msg assistant';
  wrap.innerHTML = `<div>${renderMd(m.text || '')}</div>`;
  if (m.branch) {
    const b = m.branch;
    const row = document.createElement('div');
    row.className = 'branch-pill-row';
    row.innerHTML = `<span class="branch-pill">${escapeHtml(b.modelName || '')} · 分支 ${escapeHtml(String(b.index))}/${escapeHtml(String(b.max))}${b.simulated ? ' · 本机草案' : ''}</span>`;
    wrap.appendChild(row);
  }
  return wrap;
}

export function pushMsg(m) {
  state.messages.push(m);
  [$('#chat-stream'), $('#agent-stream')].filter(Boolean).forEach((box) => {
    if (box.querySelector('.chat-empty')) box.innerHTML = '';
    box.appendChild(renderMsg(m));
    box.scrollTop = box.scrollHeight;
  });
}

export function paintPlanComposer() {
  const round = state.planRound || {};
  const plan = state.mode === 'plan';
  const n = (round.branches && round.branches.length) || 0;
  const max = round.maxBranches || 4;
  const badge = $('#plan-badge');
  if (badge) {
    badge.classList.toggle('hidden', !(plan && round.active));
    if (plan && round.active) badge.textContent = `分支 ${n}/${max}`;
  }
  const merge = $('#btn-plan-merge');
  if (merge) merge.classList.toggle('hidden', !(plan && round.canMerge));
  const input = $('#chat-input');
  if (input) {
    input.placeholder = plan
      ? '输入任务后发送。换模型再空发 = 新分支。'
      : '描述要构建的内容';
  }
}

export async function sendChat(text, opts = {}) {
  if (state.sending) { if (state.chatAbort) state.chatAbort.abort(); return; }
  const message = text != null ? text : ($('#chat-input').value || ($('#agent-input') && $('#agent-input').value) || '');
  if (text == null) {
    $('#chat-input').value = '';
    if ($('#agent-input')) $('#agent-input').value = '';
  }
  const fromAgent = $('#agent-pane') && !$('#agent-pane').classList.contains('hidden') && $('#agent-mode');
  ui.setAgentMode(fromAgent ? $('#agent-mode').value : ($('#mode-select').value || state.mode));
  const empty = !String(message || '').trim();
  const round = state.planRound || {};
  let planAction = opts.planAction || null;
  if (empty && planAction !== 'merge') {
    if (state.mode === 'plan' && (planAction === 'branch' || round.canBranch)) {
      planAction = 'branch';
    } else if (state.mode === 'plan') {
      ui.toast('先输入任务再发。已有分支时可换模型后空发送。');
      return;
    } else {
      return;
    }
  }
  state.sending = true;
  state.chatAbort = new AbortController();
  const sendButton = $('#btn-send');
  if (sendButton) { sendButton.textContent = '停止'; sendButton.title = '停止当前任务'; }
  state.stayOnBridge = !!opts.stayOnBridge;
  if (!opts.stayOnBridge) ui.setRight('chat');
  const history = state.history.slice(-12);
  if (planAction === 'merge') {
    pushMsg({ kind: 'status', text: '正在用合并主模型总结各分支…' });
  } else if (String(message || '').trim()) {
    pushMsg({ kind: 'user', text: message });
    state.history.push({ role: 'user', content: message });
  } else {
    pushMsg({ kind: 'user', text: '（空输入 · 新分支）' });
  }
  const modelId = ($('#model-select') && $('#model-select').value) || (state.status && state.status.activeModelId);
  const thinkLevel = ($('#think-select') && $('#think-select').value) || 'high';
  try {
    const res = await fetch('/api/chat', {
      signal: state.chatAbort.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: state.mode,
        message: String(message || '').trim(),
        history,
        modelId,
        thinkLevel,
        planAction: planAction || undefined
      })
    });
    if (!res.ok) {
      const raw = typeof res.text === 'function' ? await res.text() : '';
      let detail = '';
      try { detail = JSON.parse(raw).error || ''; } catch (_) { detail = raw; }
      throw new Error(String(detail || `HTTP ${res.status}`).slice(0, 180));
    }
    if (!res.body || typeof res.body.getReader !== 'function') throw new Error('对话响应不是可读事件流');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', assistantText = '', sawDone = false, sawError = false;
    const consumeLine = (line) => {
      if (!line.trim()) return;
      let event;
      try { event = JSON.parse(line); } catch (_) { throw new Error('对话事件流包含无效 JSON'); }
      if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') {
        throw new Error('对话事件格式无效');
      }
      if (event.type === 'done') sawDone = true;
      if (event.type === 'error') sawError = true;
      handleEvent(event);
      if (event.type === 'message' && typeof event.text === 'string') assistantText += event.text;
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 1024 * 1024) throw new Error('对话事件超过客户端处理上限');
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) consumeLine(line);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeLine(buffer);
    if (!sawDone && !sawError) throw new Error('对话连接提前结束，结果未确认；未自动重试');
    if (sawDone && !sawError && assistantText) state.history.push({ role: 'assistant', content: assistantText });
    return sawDone && !sawError;
  } catch (err) {
    const prefix = err && err.name === 'AbortError' ? '请求已停止，结果可能不完整：' : '请求失败或结果未确认：';
    pushMsg({ kind: 'assistant', text: (prefix + (err.message || '请核对状态')).slice(0, 240) });
    return false;
  } finally {
    state.sending = false;
    state.chatAbort = null;
    if (sendButton) { sendButton.textContent = '↑'; sendButton.title = '发送'; }
    try { Promise.resolve(ui.refreshStatus()).catch(() => ui.toast('状态刷新失败，请重新读取；没有重放对话。')); }
    catch (_) { ui.toast('状态刷新失败，请重新读取；没有重放对话。'); }
    try { Promise.resolve(ui.loadTree()).catch(() => ui.toast('文件树刷新失败；请手动刷新，没有重放对话。')); }
    catch (_) { ui.toast('文件树刷新失败；请手动刷新，没有重放对话。'); }
  }
}

export function handleEvent(ev) {
  if (ev.type === 'pty_request' || ev.type === 'done') return;
  if (ev.type === 'status') pushMsg({ kind: 'status', text: ev.text });
  else if (ev.type === 'tool') {
    pushMsg({
      kind: 'tool',
      name: ev.name,
      args: ev.args,
      result: ev.result,
      error: ev.error,
      ok: ev.ok,
      durationMs: ev.durationMs,
      label: ev.label
    });
    if (state.stayOnBridge) ui.logBridgeTool(ev);
    if (ev.name === 'set_todos' && ev.result && ev.result.todos) paintTodos(ev.result.todos);
    if (ev.name === 'run_command' || ev.name === 'execute_command') {
      const r = ev.result || {};
      if (r.stdout) ui.termLine(r.stdout);
      if (r.stderr) ui.termLine(r.stderr, 'err');
    }
    if (ev.name === 'apply_patch' && ev.ok === true && ev.result && ev.result.filePath) {
      const filePath = ev.result.filePath;
      const tab = state.tabs.find(candidate => candidate.path === filePath);
      if (tab) {
        (async () => {
          try {
            const response = await fetch(`/api/files/content?path=${encodeURIComponent(filePath)}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data && data.error || `HTTP ${response.status || '错误'}`);
            if (data.path !== undefined && data.path !== filePath) throw new Error('文件响应路径不一致');
            const outcome = ui.reconcilePatchedFile(filePath, data);
            if (outcome.status === 'dirty') {
              ui.toast('补丁已更新磁盘；已保留未保存草稿。保存会被版本检查拒绝，请先核对差异。');
            }
          } catch (error) {
            ui.toast(('补丁完成，但重新读取失败：' + (error.message || '请手动刷新文件')).slice(0, 200));
          }
        })();
      }
      if (ev.result.diff) ui.openDiff(filePath, ev.result.diff);
    }
  } else if (ev.type === 'consensus') pushMsg({ kind: 'consensus', result: ev.result });
  else if (ev.type === 'planRound') {
    state.planRound = ev.round;
    paintPlanComposer();
  } else if (ev.type === 'message') {
    pushMsg({ kind: 'assistant', text: ev.text || '', branch: ev.branch || null });
  } else if (ev.type === 'error') pushMsg({ kind: 'assistant', text: '错误：' + ev.message });
}

export function paintTodos(todos) {
  const list = Array.isArray(todos) ? todos.filter(t => t && typeof t === 'object').slice(0, 50) : [];
  const done = list.filter((t) => t.status === 'completed').length;
  ['chat'].forEach((prefix) => {
    const box = $(`#${prefix}-tasks`);
    if (!box) return;
    box.classList.toggle('hidden', !list.length);
    const count = $(`#${prefix}-task-count`);
    if (count) count.textContent = `${done}/${list.length}`;
    const ul = $(`#${prefix}-todo-list`);
    if (ul) {
      ul.innerHTML = list.map((t) => {
        const mark = t.status === 'completed' ? '☑' : t.status === 'in_progress' ? '▶' : '☐';
        return `<li class="${escapeHtml(t.status || '')}"><span class="box">${mark}</span>${escapeHtml(t.title)}</li>`;
      }).join('');
    }
  });
}

export function paintBridgeTasks(groups, unavailable = false) {
  const box = $('#bridge-tasks'), ul = $('#bridge-todo-list'), count = $('#bridge-task-count');
  if (!box || !ul || !count) return;
  box.classList.remove('hidden');
  const states = Array.isArray(groups) ? groups.slice(0, 16).filter(g => g && typeof g === 'object') : [];
  let total = 0, done = 0;
  ul.innerHTML = states.map(group => {
    const todos = Array.isArray(group.todos) ? group.todos.filter(t => t && typeof t === 'object').slice(0, 50) : [];
    total += todos.length; done += todos.filter(t => t.status === 'completed').length;
    return `<li class="tiny">会话 ${escapeHtml(group.sessionId || '未知')} · Agent上报 ${escapeHtml(group.lastUpdated || '')}</li>`
      + (group.lastMessage ? `<li>${escapeHtml(group.lastMessage)}（报告进度 ${escapeHtml(String(group.progress))}%）</li>` : '')
      + todos.map(t => `<li>${t.status === 'completed' ? '☑' : t.status === 'in_progress' ? '▶' : '☐'} ${escapeHtml(t.title || '')} · ${escapeHtml(t.status || '')}</li>`).join('');
  }).join('') || '<li class="tiny">尚未收到任务计划。外部Agent需调用 set_todos / report_progress；工具调用不会自动生成任务。</li>';
  count.textContent = unavailable ? '同步失败（保留最近快照）' : `${done}/${total} · Agent报告，非自动核验`;
}

export function agentLabel(mode) {
  const name = mode === 'ask' ? 'Web Agent Ask' : mode === 'code' ? 'Web Agent Code' : 'Web Agent Plan';
  return 'Agent · ' + name;
}

export function setAgentMode(mode) {
  state.mode = mode;
  $('#mode-select').value = mode;
  if ($('#agent-mode')) $('#agent-mode').value = mode;
  const btn = $('#btn-agent-pick');
  if (btn) btn.textContent = agentLabel(mode) + ' ▾';
  paintPlanComposer();
}

ui.emptyChat = emptyChat;
ui.paintChat = paintChat;
ui.summarizeTool = summarizeTool;
ui.renderMsg = renderMsg;
ui.pushMsg = pushMsg;
ui.sendChat = sendChat;
ui.paintPlanComposer = paintPlanComposer;
ui.handleEvent = handleEvent;
ui.paintTodos = paintTodos;
ui.paintBridgeTasks = paintBridgeTasks;
ui.agentLabel = agentLabel;
ui.setAgentMode = setAgentMode;
