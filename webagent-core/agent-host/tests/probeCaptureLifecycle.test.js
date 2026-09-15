'use strict';
const assert=require('assert');
async function main(){
  const {createGenericCapture,setCaptureProfile}=await import('../../probe-extension/genericCapture.mjs');
  const encode=text=>Buffer.from(text).toString('base64');
  const response=id=>({requestId:id,type:'Fetch',response:{url:'https://arena.ai/sample',headers:{}}});
  const ended=id=>({requestId:id,encodedDataLength:100});
  const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  let owner={generation:0,pageSession:'one'}, updates=[],fallbacks=0;
  let setup=deferred();
  let capture=createGenericCapture({isTrace:()=>false,publishUpdate:()=>updates.push(owner.probeStream),command:async(tab,method)=>{if(method==='Network.streamResourceContent')return setup.promise;fallbacks++;return{body:'data: {"model":"fallback"}\n\n'};}});
  try{
    const opening=capture(1,owner,'Network.responseReceived',response('first'));
    await capture(1,owner,'Network.dataReceived',{requestId:'first',data:encode('data: {"model":"queued"}\n\n')});
    await capture(1,owner,'Network.loadingFinished',ended('first'));
    assert.equal(updates.length,0,'Completion must wait for streaming setup');
    setup.resolve({bufferedData:encode('data: {"object":"chat.completion"}\n\n')});await opening;await tick();
    assert.equal(fallbacks,0);assert.equal(owner.probeStream.modelId,'queued');assert.equal(updates.length,1);
    // A delayed buffered response cannot publish after navigation.
    setup=deferred();const navigation=capture(1,owner,'Network.responseReceived',response('navigation'));
    owner.generation++;owner.pageSession='two';setup.resolve({bufferedData:encode('data: {"model":"old-page"}\n\n')});await navigation;
    await capture(1,owner,'Network.loadingFinished',ended('navigation'));assert.equal(updates.length,1);
    // Reusing an ID must not let the first setup feed or finish the replacement entry.
    const first=deferred(),second=deferred();let n=0;
    capture.stop(owner);capture=createGenericCapture({isTrace:()=>false,publishUpdate:()=>updates.push(owner.probeStream),command:()=> (++n===1?first.promise:second.promise)});
    const old=capture(1,owner,'Network.responseReceived',response('reuse'));
    const fresh=capture(1,owner,'Network.responseReceived',response('reuse'));
    first.resolve({bufferedData:encode('data: {"model":"stale-id"}\n\n')});await old;
    second.resolve({bufferedData:encode('data: {"model":"fresh-id"}\n\n')});await fresh;
    await capture(1,owner,'Network.loadingFinished',ended('reuse'));assert.equal(owner.probeStream.modelId,'fresh-id');assert.equal(updates.length,2);
    // Stop invalidates an in-flight fallback even if a new owner DB reuses that ID.
    capture.stop(owner);const body=deferred();
    capture=createGenericCapture({isTrace:()=>false,publishUpdate:()=>updates.push(owner.probeStream),command:async(tab,method)=>{if(method==='Network.streamResourceContent')throw Error('Unavailable');return body.promise;}});
    await capture(1,owner,'Network.responseReceived',response('fallback'));
    const waiting=capture(1,owner,'Network.loadingFinished',ended('fallback'));capture.stop(owner);
    await capture(1,owner,'Network.responseReceived',response('fallback'));
    body.resolve({body:'data: {"model":"stopped"}\n\n'});await waiting;assert.equal(updates.length,2);
    capture.stop(owner);
    // Light-mode limits are UTF-8 byte limits on every transport, not JS string lengths.
    setCaptureProfile('light');
    capture=createGenericCapture({isTrace:()=>false,publishUpdate:()=>updates.push(owner.probeStream),command:async(tab,method)=>{if(method==='Network.streamResourceContent')throw Error('Unavailable');return{body:'界'.repeat(22000)};}});
    await capture(1,owner,'Network.responseReceived',response('unicode'));
    await capture(1,owner,'Network.loadingFinished',ended('unicode'));assert.equal(owner.probeStream.truncated,true);assert.equal(owner.probeStream.fingerprint.len_chars,0);
    await capture(1,owner,'Network.webSocketCreated',{requestId:'ws',url:'wss://arena.ai/events'});
    await capture(1,owner,'Network.webSocketFrameReceived',{requestId:'ws',response:{opcode:1,payloadData:'界'.repeat(22000)}});assert.equal(owner.probeStream.truncated,true);assert.equal(owner.probeStream.fingerprint.len_chars,0);
    // Fallback base64 is decoded as UTF-8, never as a Latin-1 string.
    capture.stop(owner);capture=createGenericCapture({isTrace:()=>false,publishUpdate:()=>{},command:async(tab,method)=>{if(method==='Network.streamResourceContent')throw Error('Unavailable');return{base64Encoded:true,body:encode('data: {"model":"中文模型"}\n\n')};}});
    await capture(1,owner,'Network.responseReceived',response('utf8'));await capture(1,owner,'Network.loadingFinished',ended('utf8'));assert.equal(owner.probeStream.modelId,'中文模型');assert.equal(owner.probeStream.truncated,false);
    // Request metadata from a previous page must not seed a new response.
    await capture(1,owner,'Network.requestWillBeSent',{requestId:'meta',request:{url:'https://arena.ai/sample',postData:'{"model":"old-page-selection"}'}});
    owner.generation++;owner.pageSession='three';
    await capture(1,owner,'Network.responseReceived',response('meta'));await capture(1,owner,'Network.loadingFinished',ended('meta'));assert.equal(owner.probeStream.modelId,'中文模型');
  }finally{capture.stop(owner);setCaptureProfile('standard');}
  console.log('Probe capture lifecycle: setup/completion order, navigation, ID reuse, stop, UTF-8 budgets and metadata ownership passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
