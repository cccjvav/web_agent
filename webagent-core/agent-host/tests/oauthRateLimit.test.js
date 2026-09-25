'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {createRequire} = require('module');
const express = require('express');
async function main() {
  // OAuth pairing is opt-in (2026-09-25). The vm copy below shares the real store module, so turn it
  // on inside a throwaway workspace, never the checkout's own .webagent/config.json.
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'webagent-oauth-rl-'));
  require('../src/config').config.workspaceRoot = tmp;
  require('../src/models/store').patch({ bridge: { oauthEnabled: true } });
  const file = path.resolve(__dirname, '../src/mcp/oauth.js');
  let clock = 100000;
  const context = {module:{exports:{}}, require:createRequire(file), Date:{now:()=>clock}, Buffer, URL, URLSearchParams};
  vm.runInNewContext(fs.readFileSync(file, 'utf8') + '\nmodule.exports.fixture={rateLimit,rateHits,clientIp};', context);
  const oauth = context.module.exports, {rateLimit,rateHits,clientIp} = oauth.fixture;
  assert.equal(clientIp({headers:{'x-forwarded-for':'attacker'},socket:{remoteAddress:'127.0.0.1'}}),'127.0.0.1');
  assert.equal(clientIp({ip:'trusted-policy-result',headers:{'x-forwarded-for':'attacker'}}),'trusted-policy-result');
  rateLimit('a',2,10000); rateLimit('a',2,10000);
  for(let i=0;i<500;i++) assert.throws(()=>rateLimit('a',2,10000), error=>error.status===429&&error.retryAfter===10);
  assert.equal(rateHits.get('a').n,2); assert.equal(rateHits.get('a').expiresAt,110000);
  clock=109999; assert.throws(()=>rateLimit('a',2,10000),error=>error.retryAfter===1);
  clock=110000; rateLimit('a',2,10000); assert.equal(rateHits.get('a').n,1);
  rateHits.clear();
  for(let i=0;i<1000;i++) rateLimit('key-'+i,2,10000);
  assert.throws(()=>rateLimit('overflow',2,10000),error=>error.status===429&&error.retryAfter===10);
  rateLimit('key-0',2,10000); assert.equal(rateHits.size,1000);
  clock+=10000;rateLimit('new',2,10000);assert.equal(rateHits.size,1);
  // Deterministic generated schedules, checked against an independent reference model.
  rateHits.clear(); let seed=1701; const model=new Map();
  for(let i=0;i<2000;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;clock+=seed%211;
    const key='client-'+(seed%7);let rec=model.get(key);
    if(!rec||rec.until<=clock){rec={count:0,until:clock+1000};model.set(key,rec);}
    if(rec.count===3) assert.throws(()=>rateLimit(key,3,1000),error=>error.status===429);
    else {rateLimit(key,3,1000);rec.count++;}
    assert.equal(rateHits.get(key).n,rec.count);assert.equal(rateHits.get(key).expiresAt,rec.until);
  }
  rateHits.clear();
  const app=express();app.use(express.json());app.use(express.urlencoded({extended:false}));app.use(oauth.router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const post=(route,body={},ip='forged')=>fetch(`http://127.0.0.1:${server.address().port}${route}`,{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':ip},body:JSON.stringify(body)});
  try {
    for(let i=0;i<20;i++){const res=await post('/oauth/register',{},'forged-'+i);assert.equal(res.status,400);await res.text();}
    const blocked=await post('/register');assert.equal(blocked.status,429);assert.equal(blocked.headers.get('retry-after'),'60');assert.equal((await blocked.json()).error,'slow_down');
    // Endpoint budgets are independent, while authorize GET/POST share one budget.
    for(let i=0;i<30;i++){const res=await post('/oauth/authorize');assert.equal(res.status,400);await res.text();}
    const html=await post('/oauth/authorize');assert.equal(html.status,429);assert.equal(html.headers.get('retry-after'),'60');await html.text();
    clock+=60000;
    const recovered=await post('/oauth/register');assert.equal(recovered.status,400);assert.equal(recovered.headers.get('retry-after'),null);await recovered.text();
  } finally {await new Promise(resolve=>server.close(resolve)); fs.rmSync(tmp,{recursive:true,force:true});}
  console.log('OAuth rate limit: bounds, recovery, generated schedules, forged forwarding headers and real HTTP passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
