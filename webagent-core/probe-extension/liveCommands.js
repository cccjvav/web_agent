'use strict';
const path = require('path');
const {randomUUID} = require('crypto');
const {localBase} = require('./client');
const {liveRequest} = require('./liveClient');
const {validateReference} = require('./referenceInput');
const {analyze} = require('./analysis');
function activateLive(vscode, context, hooks, transport = liveRequest) {
  let watching = null, timer = null, stopped = false, running = false;
  const ask = async (method, route, body) => {
    if (!hooks.allowed()) throw Error('Untrusted workspace');
    const controller = new AbortController(); hooks.controllers.add(controller);
    try { return await transport(hooks.base(), method, route, body, controller.signal); }
    finally { hooks.controllers.delete(controller); }
  };
  const workspace = root => {
    const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
    if (typeof root !== 'string' || !vscode.workspace.workspaceFolders?.some(folder => folder.uri.scheme === 'file' && normalize(folder.uri.fsPath) === normalize(root))) throw Error('Host is not an open workspace folder');
  };
  function stop() { watching = null; clearTimeout(timer); }
  async function chooseTarget() {
    const links = await ask('GET','/api/probe/links');
    const items = links.flatMap(link => link.tabs.map(tab => ({label: link.workspaceRoot + ' · tab ' + tab.tabId + ' · ' + tab.sessionId, link, tab})));
    const selected = await vscode.window.showQuickPick(items,{title:'选择已明确配对的浏览器会话'});
    if (selected) workspace(selected.link.workspaceRoot);
    return selected;
  }
  async function tick() {
    const target = watching;
    if (!target || stopped || !hooks.allowed()) return stop();
    try {
      workspace(target.link.workspaceRoot);
      const sample = await ask('GET', '/api/probe/links/' + target.link.id + '/reports/' + target.tab.tabId);
      if (watching !== target) return;
      if (!sample || sample.sessionId !== target.tab.sessionId) throw Error('Browser navigated');
      if (sample.reference && target.kind === 'response') {const reference=validateReference(sample.reference), key=JSON.stringify(reference);if(target.referenceKey!==key){hooks.onReport(reference);target.referenceKey=key;}}
      if (sample.trace && target.kind === 'trace') {
        const key = JSON.stringify({...sample.trace, exportedAt: null});
        if (target.key !== key) {
          const controller = new AbortController(); hooks.controllers.add(controller);
          try { const result = await analyze(sample.trace, controller.signal); if (watching === target && hooks.allowed()) {hooks.onReport(result); target.key = key;} }
          finally { hooks.controllers.delete(controller); }
        }
      }
      if (watching === target) timer = setTimeout(() => void tick(), 2000);
    } catch (_) { stop(); await vscode.window.showWarningMessage('实时参考已停止：连接、会话或工作区发生变化。请明确重新选择，不自动重连。'); }
  }
  async function run(action) {
    if (!hooks.allowed() || stopped || running) return;
    running = true;
    try {
      if (action === 'pairBrowser') {
        const extensionId = await vscode.window.showInputBox({title:'输入整合版浏览器扩展ID（扩展管理页，32位a-p）'});
        if (extensionId === undefined) return;
        if (!/^[a-p]{32}$/.test(extensionId)) throw Error('Extension ID');
        const links = await ask('POST','/api/probe/links',{extensionId});
        try {
          if (links.schema !== 'webagent-probe-pair/v1' || !/^[a-f0-9-]{36}$/.test(links.id || '') || !/^[a-f0-9]{64}$/.test(links.token || '') || !Number.isFinite(links.expiresAt) || links.expiresAt <= Date.now() || links.expiresAt > Date.now()+16*60000 || typeof links.hostInstanceId !== 'string') throw Error('Invalid pairing response');
          workspace(links.workspaceRoot);
          const answer = await vscode.window.showWarningMessage('配对到工作区：' + links.workspaceRoot + '。15分钟内允许此扩展向WebAgent共享参考，供已连接客户端读取；写操作仍需审批。配对凭据会进入剪贴板，请只粘贴到该扩展。', {modal:true}, '复制配对');
          if (answer !== '复制配对' || !hooks.allowed()) { await ask('DELETE','/api/probe/links/'+links.id); return; }
          await vscode.env.clipboard.writeText(JSON.stringify({schema:links.schema,id:links.id,token:links.token,expiresAt:links.expiresAt,workspaceRoot:links.workspaceRoot,hostInstanceId:links.hostInstanceId,base:localBase(hooks.base())}));
        } catch (error) { await ask('DELETE','/api/probe/links/'+links.id).catch(()=>{}); throw error; }
      } else if (action === 'watchBrowser') { const selected = await chooseTarget(); if (selected && hooks.allowed()) {selected.kind=await vscode.window.showQuickPick(['trace','response'],{title:'订阅轨迹调用或独立响应采样（不强行关联run）'});if(!selected.kind||!hooks.allowed())return;stop(); watching=selected; void tick();} }
      else if (action === 'revokeBrowser') {
        const links = await ask('GET','/api/probe/links');
        const selected = await vscode.window.showQuickPick(links.map(link=>({label:link.origin+' · '+link.workspaceRoot,link})),{title:'撤销浏览器配对（会取消未完成操作）'});
        if(selected&&hooks.allowed()){await ask('DELETE','/api/probe/links/'+selected.link.id);stop();}
      } else if (action === 'requestBrowser') {
        const selected=await chooseTarget(); if(!selected)return;
        const action=await vscode.window.showQuickPick(['start','stop','rename','archive','question','refresh-map'],{title:'申请一次操作；下一步仍需在本机审批'}); if(!action)return;
        let text; if(['rename','question'].includes(action)){text=await vscode.window.showInputBox({title:action==='question'?'将发送的完整题目（可能计费）':'新的会话标题'});if(text===undefined)return;}
        hooks.show(await ask('POST','/api/probe/actions',{linkId:selected.link.id,tabId:selected.tab.tabId,sessionId:selected.tab.sessionId,action,...(text!==undefined?{text}:{}),requestKey:randomUUID()}));
      } else if (action === 'approveBrowser' || action === 'cancelBrowser') {
        const {requests}=await ask('GET','/api/operations');
        const selected=await vscode.window.showQuickPick(requests.filter(job=>job.kind==='probe-browser'&&['waiting-approval','running'].includes(job.status)).map(job=>({label:job.status+' · '+job.requestId,job})),{title:'浏览器操作审批'});if(!selected)return;
        const id=selected.job.requestId;
        if(action==='cancelBrowser'){hooks.show(await ask('POST','/api/operations/'+id+'/cancel',{}));return;}
        const job=await ask('GET','/api/operations/'+id);
        const answer=await vscode.window.showWarningMessage('批准以下一次操作？归档会同时删除该会话的浏览器本地记录，发送题目可能计费。结果未知时不重放。\n'+JSON.stringify(job.input),{modal:true},'批准一次');
        if(answer==='批准一次'&&hooks.allowed())hooks.show(await ask('POST','/api/operations/'+id+'/approve',{confirm:true}));
      }
    } catch (_) { if (!stopped) await vscode.window.showWarningMessage('浏览器整合操作未完成。请检查主机版本、工作区、配对期限及审批；不自动重试。'); }
    finally { running=false; }
  }
  for(const action of ['pairBrowser','watchBrowser','revokeBrowser','requestBrowser','approveBrowser','cancelBrowser']) context.subscriptions.push(vscode.commands.registerCommand('webagentProbe.'+action,()=>run(action)));
  context.subscriptions.push(vscode.commands.registerCommand('webagentProbe.stopWatch',stop),{dispose(){stopped=true;stop();}});
  return stop;
}
module.exports = {activateLive};
