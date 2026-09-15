import './view-model.js';
import {setCaptureProfile} from './genericCapture.mjs';
import {createBrowserBridge} from './browserBridge.mjs';
import {refreshCatalog} from './catalog.mjs';
import {setCatalog} from './browserReference.mjs';
import {buildProbePack, TOKENIZER_BENCH_TEXT} from './engine/probe.js';
export function createIntegration(services) {
  const {start, stop, restoreForTab, history, storageReady} = services;
  let catalog = null;
  void storageReady.then(async ready => { if (!ready) return; const old = (await chrome.storage.local.get('wa.probe.catalog.v1'))['wa.probe.catalog.v1']; if(old?.schema === 'webagent-catalog/v1') {setCatalog(old.models);catalog=old;} }).catch(()=>{});
  const getSession = url => { try { const u = new URL(url); return u.origin === 'https://arena.ai' ? u.pathname.match(/^\/agent\/([\w-]{1,128})\/?$/)?.[1] : null; } catch { return null; } };
  async function guard(command, signal) {
    const tab = await chrome.tabs.get(command.tabId);
    if (signal?.aborted || command.deadline <= Date.now() || getSession(tab.pendingUrl || tab.url) !== command.sessionId) throw Error('Stale browser command');
  }
  const bridge = createBrowserBridge({
    async current(tabId) {
      const state = await restoreForTab(tabId), tab = await chrome.tabs.get(tabId), sessionId = getSession(tab.pendingUrl || tab.url);
      if (!sessionId) throw Error('No current saved Arena conversation');
      const view = globalThis.ArenaTraceView.build(state);
      const trace = view.calls.length ? globalThis.ArenaTraceView.exportEvidence({...view,calls:view.calls.slice(0,100)}) : null;
      if (trace && catalog) {const ids=new Set(trace.calls.map(call=>(call.evidence?.model?.value||call.model||'').toLowerCase()));trace.models=catalog.models.filter(item=>ids.has(item.id.toLowerCase()));}
      if(trace){let truncated=view.calls.length>100;while(new TextEncoder().encode(JSON.stringify(trace)).length>240*1024&&trace.calls.length>1){trace.calls.pop();truncated=true;}if(truncated)trace.scope+=' [预算截断，非完整调用集合]';}
      const p=state.probeStream;
      const reference=p ? {schema:'webagent-model-analysis/v1',requestId:p.requestId,observedAt:p.observedAt,truncated:p.truncated,candidate:{modelId:p.modelId,family:p.family,mode:p.mode,heuristicScore:p.heuristicScore},fingerprint:p.fingerprint,registryVersion:p.registryVersion,protocol:p.protocol,behavior:p.behavior} : null;
      return {tabId, sessionId, trace, reference};
    },
    async cancel(tabId, id) { if (Number.isInteger(tabId)) await chrome.tabs.sendMessage(tabId, {type:'WA_CANCEL', id}).catch(()=>{}); },
    async execute(command, signal) {
      await guard(command, signal);
      if (command.action === 'start') { await start(command.tabId); return {ok:true}; }
      if (command.action === 'stop') { await stop(command.tabId); return {ok:true}; }
      if (command.action === 'refresh-map') {
        const next = await refreshCatalog(fetch, signal); await guard(command, signal);
        if (!await storageReady) throw Error('Trusted storage unavailable');
        await chrome.storage.local.set({'wa.probe.catalog.v1':next}); catalog=next; setCatalog(next.models); return {ok:true};
      }
      if (!['rename','archive','question'].includes(command.action)) throw Error('Unsupported action');
      if (command.action === 'archive') await stop(command.tabId);
      await guard(command, signal);
      const result = await chrome.tabs.sendMessage(command.tabId, {type:'WA_EXECUTE', command});
      if (result?.ok !== true || signal.aborted) throw Error('Browser result unknown');
      if (command.action === 'archive') { if (!await storageReady) throw Error('Storage unavailable'); await history.remove(command.sessionId); }
      return {ok:true};
    }
  });
  async function handleTask(msg, sender) {
    const popup = sender.url === chrome.runtime.getURL('popup.html');
    if (sender.id !== chrome.runtime.id) throw Error('Wrong extension');
    if (msg.type === 'WA_CONNECT' && popup) {
      const result = await bridge.connect(msg.pair, msg.tabId);
      await chrome.tabs.sendMessage(msg.tabId,{type:'WA_BRIDGE_STATE',connected:true}).catch(()=>{}); return result;
    }
    if (msg.type === 'WA_DISCONNECT' && popup) {
      const tabId=bridge.status().tabId; await bridge.disconnect();
      if (Number.isInteger(tabId)) await chrome.tabs.sendMessage(tabId,{type:'WA_BRIDGE_STATE',connected:false}).catch(()=>{});
      return {connected:false};
    }
    if (msg.type === 'WA_SAMPLING' && popup) {setCaptureProfile(msg.profile);return {profile:msg.profile};}
    if (msg.type === 'WA_CATALOG' && popup) {if(!catalog)throw Error('No catalog');return catalog;}
    if (msg.type === 'WA_STATUS') return {connected: bridge.status().connected && (popup || sender.tab?.id === bridge.status().tabId), expiresAt:bridge.status().expiresAt, catalog:catalog ? {refreshedAt:catalog.refreshedAt, sources:catalog.sources, conflicts:catalog.conflicts, count:catalog.models.length} : null};
    if (msg.type === 'WA_PACK' && popup) return {questions:[...buildProbePack().map(item => item.id === 'refusal-style' ? {...item, prompt:'请用一句话说明你对危险操作请求的安全边界，不提供操作步骤。', title:'安全边界措辞（安全替代题）'} : item), {id:'tokenizer-benchmark',title:'Tokenizer原始基准文本（总token不可替代prompt token）',prompt:TOKENIZER_BENCH_TEXT}]};
    if (msg.type === 'WA_ACTION_REQUEST') {
      const tabId = popup ? msg.tabId : sender.tab?.id;
      if (!popup && (sender.frameId !== 0 || getSession(sender.url) !== msg.sessionId)) throw Error('Wrong frame');
      const tab = await chrome.tabs.get(tabId);
      const sessionId = getSession(tab.pendingUrl || tab.url);
      if (!sessionId || (msg.sessionId && msg.sessionId !== sessionId)) throw Error('Stale session');
      return bridge.request(msg.action,msg.text,tabId,sessionId);
    }
    throw Error('Invalid integration request');
  }
  return {
    handle(msg,sender,reply) {
      if (!['WA_CONNECT','WA_DISCONNECT','WA_STATUS','WA_SAMPLING','WA_CATALOG','WA_PACK','WA_ACTION_REQUEST'].includes(msg.type)) return false;
      handleTask(msg,sender).then(reply,()=>reply({error:'整合操作未完成。请检查配对、当前会话与审批；不会自动重试。'})); return true;
    }
  };
}
