import { $, $$, state, ui } from './state.js';
import { escapeHtml, renderMd } from './dom.js';

export function emptyChat() {
  return `<div class="chat-empty">
    <div class="bubble">💬</div>
    <h3>使用智能体构建</h3>
    <p>AI 答复可能不准确。</p>
    <p style="margin-top:10px">
      <a class="gen-instr" data-page="instructions">生成智能体指令</a> ·
      <a class="gen-instr" data-page="env">环境偏好</a> ·
      <a class="gen-instr" data-page="stack">技术栈</a> ·
      <a class="gen-instr" data-page="skills">技能引导</a>
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
    wrap.innerHTML = `<header><span>${escapeHtml(title)}</span><span class="dur">${escapeHtml(right)}</span></header><pre>${escapeHtml(JSON.stringify(m.error ? { error: m.error } : summarizeTool(m.result), null, 2))}</pre>`;
    wrap.querySelector('header').onclick = () => {
      const pre = wrap.querySelector('pre');
      pre.style.display = pre.style.display === 'none' || !pre.style.display ? 'block' : 'none';
    };
    return wrap;
  }
  if (m.kind === 'consensus') {
    wrap.className = 'consensus';
    const r = m.result || {};
    const parts = r.participants || [];
    wrap.innerHTML = `<h3><span>多模型博弈 · 意见一致再行动</span><span>${escapeHtml(r.agreementRate || '')}</span></h3>
      <div class="branch-tabs">${['合并', ...parts.map((p) => p.id || p.model)].map((lab, i) =>
        `<button type="button" data-i="${i}" class="${i === 0 ? 'on' : ''}">${escapeHtml(lab)}</button>`).join('')}</div>
      <div class="branch-body"></div>
      <button type="button" class="adopt">采纳共识并切到 Code 执行</button>`;
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

export async function sendChat(text, opts = {}) {
  if (state.sending) return;
  const message = text != null ? text : ($('#chat-input').value || ($('#agent-input') && $('#agent-input').value) || '');
  if (text == null) {
    $('#chat-input').value = '';
    if ($('#agent-input')) $('#agent-input').value = '';
  }
  const fromAgent = $('#agent-pane') && !$('#agent-pane').classList.contains('hidden') && $('#agent-mode');
  ui.setAgentMode(fromAgent ? $('#agent-mode').value : ($('#mode-select').value || state.mode));
  state.sending = true;
  state.stayOnBridge = !!opts.stayOnBridge;
  if (!opts.stayOnBridge) ui.setRight('chat');
  const history = state.history.slice(-12);
  if (message) {
    pushMsg({ kind: 'user', text: message });
    state.history.push({ role: 'user', content: message });
  } else pushMsg({ kind: 'user', text: '（空输入 · 分支作答）' });
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: state.mode, message: message || '', history })
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let assistantText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let ev; try { ev = JSON.parse(line); } catch { continue; }
        handleEvent(ev);
        if (ev.type === 'message' && ev.text) assistantText += ev.text;
      }
    }
    if (assistantText) state.history.push({ role: 'assistant', content: assistantText });
  } catch (err) {
    pushMsg({ kind: 'assistant', text: '请求失败：' + err.message });
  } finally {
    state.sending = false;
    ui.refreshStatus();
    ui.loadTree();
  }
}

export function handleEvent(ev) {
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
    if (ev.name === 'apply_patch' && ev.result && ev.result.filePath) {
      const p = ev.result.filePath;
      const tab = state.tabs.find((t) => t.path === p);
      if (tab) {
        fetch(`/api/files/content?path=${encodeURIComponent(p)}`).then((r) => r.json()).then((d) => {
          tab.content = d.content;
          if (state.activeTab === tab.id) ui.applyEditor(tab);
        });
      }
      if (ev.result.diff) ui.openDiff(p, ev.result.diff);
    }
  } else if (ev.type === 'consensus') pushMsg({ kind: 'consensus', result: ev.result });
  else if (ev.type === 'message') pushMsg({ kind: 'assistant', text: ev.text });
  else if (ev.type === 'error') pushMsg({ kind: 'assistant', text: '错误：' + ev.message });
}

export function paintTodos(todos) {
  const list = todos || [];
  const done = list.filter((t) => t.status === 'completed').length;
  ['chat', 'bridge'].forEach((prefix) => {
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
}

ui.emptyChat = emptyChat;
ui.paintChat = paintChat;
ui.summarizeTool = summarizeTool;
ui.renderMsg = renderMsg;
ui.pushMsg = pushMsg;
ui.sendChat = sendChat;
ui.handleEvent = handleEvent;
ui.paintTodos = paintTodos;
ui.agentLabel = agentLabel;
ui.setAgentMode = setAgentMode;
