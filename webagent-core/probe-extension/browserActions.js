// Isolated extension world only; no window.postMessage or page-supplied commands.
(() => {
  const originalRename = ArenaConversationRename.rename, originalArchive = ArenaConversationRename.archive;
  const cancelled = new Set(); let enabled = false, busy = false;
  void chrome.runtime.sendMessage({type:'WA_STATUS'}).then(state=>{enabled=state?.connected===true;}).catch(()=>{});
  const session = () => ArenaConversationRename.sessionFromPath(location.pathname);
  async function submit(action, args) {
    if (!enabled) return action === 'rename' ? originalRename(args) : originalArchive(args);
    const result = await chrome.runtime.sendMessage({type:'WA_ACTION_REQUEST', action, text: action === 'rename' ? args.model : undefined, sessionId: session()});
    if (result?.error) throw new Error(result.error);
    throw new Error('已提交WebAgent本机审批，尚未执行。请在审批列表确认，勿重复提交。');
  }
  ArenaConversationRename.rename = args => submit('rename', args);
  ArenaConversationRename.archive = args => submit('archive', args);
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'WA_BRIDGE_STATE') { enabled = message.connected === true; return; }
    if (message.type === 'WA_CANCEL') { if (cancelled.size < 200) cancelled.add(message.id); return; }
    if (message.type !== 'WA_EXECUTE') return;
    const c = message.command;
    const guard = () => { if (!c || location.origin !== 'https://arena.ai' || session() !== c.sessionId || c.deadline <= Date.now() || cancelled.has(c.id)) throw Error('操作已过期、取消或页面变化'); };
    if (busy) { reply({ok:false}); return; }
    busy = true;
    (async () => {
      guard();
      if (!confirm('WebAgent已批准此操作，请核对当前页面：' + c.action + (c.text ? '\n' + c.text : '') + '\n操作可能消耗模型额度或修改会话。')) throw Error('本页未确认');
      guard();
      if (c.action === 'rename') await originalRename({sessionId:c.sessionId, model:c.text, isCurrent:()=>{try{guard();return true;}catch{return false;}}});
      else if (c.action === 'archive') await originalArchive({sessionId:c.sessionId, isCurrent:()=>{try{guard();return true;}catch{return false;}}});
      else if (c.action === 'question') {
        const visible = el => el.isConnected && el.getClientRects().length && !el.disabled;
        const editors = [...document.querySelectorAll('textarea,[contenteditable="true"][role="textbox"]')].filter(visible);
        if (editors.length !== 1 || typeof c.text !== 'string' || c.text.length > 6000) throw Error('无法唯一定位输入框');
        const editor = editors[0];
        if ((editor.value || editor.textContent || '').trim()) throw Error('输入框已有内容，未覆盖');
        guard(); editor.focus();
        if (editor.tagName === 'TEXTAREA') Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,c.text);
        else editor.textContent = c.text;
        editor.dispatchEvent(new Event('input',{bubbles:true}));
        await new Promise(resolve => setTimeout(resolve, 200)); guard();
        const buttons = [...document.querySelectorAll('button')].filter(el => visible(el) && ['Send message','Send','发送消息','发送'].includes(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent.trim()));
        if (buttons.length !== 1) throw Error('发送按钮不明确；草稿保留，未自动重试');
        buttons[0].click(); // This acknowledges a click, not completion of the model response.
      } else throw Error('不支持的页面操作');
      reply({ok:true});
    })().catch(() => reply({ok:false})).finally(() => {busy=false; cancelled.delete(c?.id);});
    return true;
  });
})();
