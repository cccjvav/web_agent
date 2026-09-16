'use strict';
const assert = require('assert');
const express = require('express');
const bridge = require('../src/utils/probeBridge');
const queue = require('../src/utils/operatorQueue');
async function main() {
  const app=express();app.use('/probe-link',bridge.transport());
  const server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port, nativeFetch=global.fetch;
  const pair=bridge.pair({extensionId:'a'.repeat(32)}), origin='chrome-extension://'+'a'.repeat(32);
  const post=(body,headers={})=>nativeFetch(base+'/probe-link',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+pair.token,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  let client;
  try {
    assert.strictEqual((await post({type:'sync',tabId:1,sessionId:'one'}, {Origin:'https://arena.ai'})).status,404);
    assert.strictEqual((await post({type:'sync',tabId:1,sessionId:'one'}, {Authorization:'Bearer '+'0'.repeat(64)})).status,403);
    assert.strictEqual((await post({type:'sync',tabId:1,sessionId:'one'})).status,200);
    assert.strictEqual((await post({type:'sync',tabId:2,sessionId:'one'})).status,400);
    assert.ok(!JSON.stringify(bridge.list()).includes(pair.token));
    const {createBrowserBridge}=await import('../../probe-extension/browserBridge.mjs');
    global.fetch=(url,options)=>nativeFetch(url,{...options,headers:{...options.headers,Origin:origin}});
    let executions=0;
    client=createBrowserBridge({current:async()=>({tabId:1,sessionId:'one',trace:null}),cancel:async()=>{},execute:async command=>{executions++;assert.strictEqual(command.sessionId,'one');return{ok:true};}});
    await client.connect({...pair,base},1);
    const input={linkId:pair.id,tabId:1,sessionId:'one',action:'stop',requestKey:'fixture-command'};
    const job=bridge.request(input,{callerKey:'peer:test',remote:true});
    assert.strictEqual(executions,0);assert.strictEqual(job.status,'waiting-approval');
    const result=await queue.approve(job.requestId,true);assert.strictEqual(result.status,'succeeded');assert.strictEqual(executions,1);
    assert.strictEqual(bridge.request(input,{callerKey:'peer:test',remote:true}).requestId,job.requestId);
    await queue.approve(job.requestId,true);assert.strictEqual(executions,1,'No replay');
    assert.throws(()=>queue.result(job.requestId,{callerKey:'peer:other',remote:true}));
    assert.throws(()=>bridge.request({...input,sessionId:'wrong',requestKey:'wrong-session'},{}));
    require('../src/utils/executionControl').selectMode('chat');
    const denied=bridge.request({...input,requestKey:'denied-command'},{});queue.cancel(denied.requestId);await queue.approve(denied.requestId,true);assert.strictEqual(executions,1);
    await client.disconnect();assert.strictEqual(bridge.list().length,0);
    assert.strictEqual((await post({type:'sync',tabId:1,sessionId:'one'})).status,403);
  } finally {if(client)await client.disconnect();bridge.drop(pair.id);global.fetch=nativeFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  console.log('Real HTTP probe bridge: origin/capability/tab binding, browser polling, operator approval, caller ownership, cancellation, no replay and revocation passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
