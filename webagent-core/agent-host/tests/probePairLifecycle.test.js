'use strict';
const assert=require('assert');
async function main(){
  const {createBrowserBridge}=await import('../../probe-extension/browserBridge.mjs');
  const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return{promise,resolve};};
  const pair={schema:'webagent-probe-pair/v1',base:'http://127.0.0.1:48271',token:'a'.repeat(64),expiresAt:Date.now()+900000};
  const native=global.fetch;let posts=[],gate=deferred(),calls=0;
  global.fetch=async(url,options)=>{posts.push(JSON.parse(options.body));return new Response('{}');};
  let bridge;
  try{
    bridge=createBrowserBridge({current:async()=>{await gate.promise;return{tabId:1,sessionId:'one',trace:null};},cancel:async()=>{},execute:async()=>{}});
    const connecting=bridge.connect(pair,1);await bridge.disconnect();gate.resolve();await assert.rejects(connecting);assert.equal(bridge.status().connected,false);assert.equal(posts.length,0,'Cancelled pending connect must not upload');
    const first=deferred(),second=deferred();
    bridge=createBrowserBridge({current:async tabId=>{calls++;if(calls===1)await first.promise;if(calls===2)await second.promise;return{tabId,sessionId:'one',trace:null};},cancel:async()=>{},execute:async()=>{}});
    const old=bridge.connect(pair,1),fresh=bridge.connect(pair,2);
    second.resolve();await fresh;first.resolve();await assert.rejects(old);assert.equal(bridge.status().tabId,2);
    await bridge.disconnect();assert.ok(posts.filter(post=>post.type==='sync').every(post=>post.tabId===2));
    // Cancel while the old host is acknowledging disconnect during a reconnect.
    gate=deferred();global.fetch=async(url,options)=>{const body=JSON.parse(options.body);if(body.type==='disconnect')await gate.promise;return new Response('{}');};
    await bridge.connect(pair,2);const replacing=bridge.connect(pair,1);
    await new Promise(resolve=>setImmediate(resolve));await bridge.disconnect();gate.resolve();await assert.rejects(replacing);assert.equal(bridge.status().connected,false);
  }finally{gate.resolve();if(bridge)await bridge.disconnect();global.fetch=native;}
  console.log('Pairing lifecycle: disconnect cancels pending handshake, newest selection wins, no stale uploads/reconnect passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
