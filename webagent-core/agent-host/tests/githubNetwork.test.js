'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-github-network-'));
process.env.WORKSPACE_ROOT = root;
process.env.WEBAGENT_GITHUB_CLIENT_ID = 'isolated-fixture-app';
process.env.WEBAGENT_GITHUB_CLIENT_SECRET = '';
process.env.WEBAGENT_TELEMETRY_URL = '';
const scope = require('../src/utils/requestScope');
const originalFetchText = scope.fetchText;
let shortDeadline = false;
// Keep real fetch/streaming/abort code; only shorten the product's explicit timer in this fixture.
scope.fetchText = (...args) => {
  assert.strictEqual(args[2], 10000);
  assert.strictEqual(args[3].maxBytes, 65536);
  assert.strictEqual(args[1].redirect, 'error');
  if (shortDeadline) args[2] = 500;
  return originalFetchText(...args);
};
const github = require('../src/auth/github');
const store = require('../src/models/store');
function bounded(promise, ms = 1500) {
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('test watchdog, not a product deadline')),ms);})]).finally(()=>clearTimeout(timer));
}
async function run() {
  let mode='normal', entered=()=>{}, received=()=>{};
  const requests=[],sockets=new Set(),failed=[];
  const server=http.createServer((req,res)=>{
    requests.push(req.url);entered();
    if(mode==='hold-headers') return;
    if(mode==='hold-body'){res.writeHead(200,{'Content-Type':'application/json'});res.write('{"login":');return;}
    if(mode==='redirect' && req.url!=='/redirect-target'){res.writeHead(302,{Location:'/redirect-target'});res.end();return;}
    let data={login:'fixture-user',id:1,name:'Synthetic user'};
    if(req.url.endsWith('/device/code'))data={device_code:'device-fixture',user_code:'ABCD-1234',expires_in:900,interval:5,verification_uri:'https://github.com/login/device'};
    if(req.url.endsWith('/oauth/access_token'))data={access_token:'ghp_fixture_not_a_real_token'};
    if(mode==='oversize')data.padding='x'.repeat(70000);
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));
  });
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const fetchProxy=async(url,options)=>{
    const response=await fetch('http://127.0.0.1:'+server.address().port+new URL(url).pathname,{...options,headers:{...options.headers,Connection:'close'}});
    received(response);return response;
  };
  async function resetServer(){
    for(const socket of sockets)socket.destroy();
    await new Promise(resolve=>server.close(resolve));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  }
  async function check(name,fn){
    try{await fn();console.log('PASS',name);}catch(error){failed.push(name);console.error('FAIL',name,error.message);}
    finally{shortDeadline=false;mode='normal';entered=()=>{};received=()=>{};github.resetPending();await resetServer();}
  }
  try {
    store.reset();github.clearGithubKeepDemo();
    await check('response budget does not wait forever for a stream cancel promise',async()=>{
      const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(65537));},cancel(){return new Promise(()=>{});}});
      await bounded(assert.rejects(scope.readResponseText(new Response(stream),{maxBytes:65536}),error=>error.code==='E_RESPONSE_TOO_LARGE'));
    });
    await check('pre-cancelled identity makes zero outgoing requests',async()=>{
      const parent=new AbortController();parent.abort();const before=requests.length;
      await assert.rejects(scope.runWithSignal(parent.signal,()=>github.fetchGitHubUser('fixture',fetchProxy)),error=>error.code==='E_CANCELLED');
      assert.strictEqual(requests.length,before);
    });
    await check('pre-cancelled login or device start cannot supersede a healthy pending attempt',async()=>{
      for(const kind of ['token','device']){
        await github.startDeviceLogin(fetchProxy);
        const parent=new AbortController();parent.abort();const before=requests.length;
        await assert.rejects(scope.runWithSignal(parent.signal,()=>kind==='token'?github.loginWithToken('fixture',fetchProxy):github.startDeviceLogin(fetchProxy)),error=>error.code==='E_CANCELLED');
        assert.strictEqual(requests.length,before);
        assert.strictEqual((await github.pollDeviceLogin(fetchProxy)).done,true,'cancelled requests cannot erase the prior device attempt');
        github.clearGithubKeepDemo();
      }
    });
    await check('real stalled response body inherits cancellation and cannot publish identity',async()=>{
      mode='hold-body';const parent=new AbortController();const ready=new Promise(resolve=>{received=resolve;});
      const pending=scope.runWithSignal(parent.signal,()=>github.loginWithToken('fixture',fetchProxy));
      const response=await bounded(ready);await new Promise(resolve=>setImmediate(resolve));assert.ok(response.body.locked,'cancel after body consumption has begun');parent.abort();
      await bounded(assert.rejects(pending,error=>error.code==='E_CANCELLED'));
      assert.strictEqual(store.load().bridge.provider,'local-demo');
    });
    for(const phase of ['hold-headers','hold-body'])await check('application deadline covers '+phase,async()=>{
      mode=phase;shortDeadline=true;let sawHeaders=false;received=()=>{sawHeaders=true;};
      await bounded(assert.rejects(github.fetchGitHubUser('fixture',fetchProxy),error=>error.code==='E_TIMEOUT'&&error.status===504));
      assert.strictEqual(sawHeaders,phase==='hold-body','body-deadline fixture must actually receive headers');
    });
    await check('late body completion cannot beat an expired deadline when the timer is delayed',async()=>{
      const vm=require('vm');let now=0;
      const context={module:{exports:{}},Buffer,AbortController,setTimeout:()=>({unref(){}}),clearTimeout:()=>{},
        require:name=>name==='perf_hooks'?{performance:{now:()=>now}}:require(name)};
      vm.runInNewContext(fs.readFileSync(require.resolve('../src/utils/requestScope'),'utf8'),context);
      await assert.rejects(context.module.exports.fetchText('fixture',{},100,{maxBytes:100},async()=>({ok:true,text:async()=>{now=101;return '{}';}})),error=>error.code==='E_TIMEOUT');
      now=0;
      await assert.rejects(context.module.exports.fetchText('fixture',{},100,{maxBytes:100},async()=>{now=101;throw new TypeError('fixture socket failure');}),error=>error.code==='E_TIMEOUT');
    });
    await check('all three identity endpoints enforce streaming response budgets',async()=>{
      mode='oversize';
      await assert.rejects(github.fetchGitHubUser('fixture',fetchProxy),error=>error.code==='E_RESPONSE_TOO_LARGE');
      await assert.rejects(github.startDeviceLogin(fetchProxy),error=>error.code==='E_RESPONSE_TOO_LARGE');
      mode='normal';await github.startDeviceLogin(fetchProxy);mode='oversize';
      await assert.rejects(github.pollDeviceLogin(fetchProxy),error=>error.code==='E_RESPONSE_TOO_LARGE');
    });
    await check('device start and token polling inherit the parent signal',async()=>{
      for(const kind of ['start','poll']){
        mode='normal';if(kind==='poll')await github.startDeviceLogin(fetchProxy);
        mode='hold-body';const parent=new AbortController();const ready=new Promise(resolve=>{received=resolve;});
        const pending=scope.runWithSignal(parent.signal,()=>kind==='start'?github.startDeviceLogin(fetchProxy):github.pollDeviceLogin(fetchProxy));
        const response=await bounded(ready);await new Promise(resolve=>setImmediate(resolve));assert.ok(response.body.locked,'cancel after body consumption has begun');parent.abort();await bounded(assert.rejects(pending,error=>error.code==='E_CANCELLED'));
      }
    });
    await check('redirects are not followed with the credential',async()=>{
      mode='redirect';const before=requests.length;
      await assert.rejects(github.fetchGitHubUser('fixture',fetchProxy),error=>error.code==='E_GITHUB_NETWORK');
      assert.deepStrictEqual(requests.slice(before),['/user']);
    });
    await check('bad response shapes and provider error text do not become identity or reflected secrets',async()=>{
      await assert.rejects(github.fetchGitHubUser('fixture',async()=>{throw null;}),error=>error.code==='E_GITHUB_NETWORK');
      const response=(body,status=200)=>async()=>new Response(JSON.stringify(body),{status});
      for(const data of [null,[],{login:{fake:'marker'},id:1},{login:'x'.repeat(300),id:1}])await assert.rejects(github.fetchGitHubUser('fixture',response(data)),error=>error.code==='E_GITHUB_RESPONSE');
      await assert.rejects(github.startDeviceLogin(response({error_description:'DO_NOT_ECHO_FAKE_TOKEN'},400)),error=>!error.message.includes('DO_NOT_ECHO'));
      await assert.rejects(github.startDeviceLogin(response({device_code:'d',user_code:'u',verification_uri:'javascript:alert(1)'})),error=>error.code==='E_GITHUB_RESPONSE');
      await assert.rejects(github.startDeviceLogin(response({device_code:'d',user_code:'u',expires_in:1e100})),error=>error.code==='E_GITHUB_RESPONSE');
    });
    await check('legitimate device login still publishes only the verified user',async()=>{
      await github.startDeviceLogin(fetchProxy);const result=await github.pollDeviceLogin(fetchProxy);
      assert.strictEqual(result.done,true);assert.strictEqual(result.username,'fixture-user');github.clearGithubKeepDemo();
    });

    await check('all three real REST routes establish cancellation on client disconnect',async()=>{
      const express=require('express'),app=express();app.use(express.json());app.use('/api',require('../src/api/routes'));
      const api=http.createServer(app);await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
      const originals={loginWithToken:github.loginWithToken,startDeviceLogin:github.startDeviceLogin,pollDeviceLogin:github.pollDeviceLogin};
      try {
        for(const [route,method,body] of [['token','loginWithToken',{token:'fixture'}],['device','startDeviceLogin',{}],['device/poll','pollDeviceLogin',{}]]){
          let signal,enteredRoute,abortedRoute;
          const ready=new Promise(resolve=>{enteredRoute=resolve;}),aborted=new Promise(resolve=>{abortedRoute=resolve;});
          github[method]=async()=>{
            signal=scope.currentSignal();enteredRoute();
            if(!signal)return {success:false};
            return new Promise((_,reject)=>signal.addEventListener('abort',()=>{abortedRoute();reject(Object.assign(new Error('fixture cancelled'),{code:'E_CANCELLED'}));},{once:true}));
          };
          const req=http.request({hostname:'127.0.0.1',port:api.address().port,path:'/api/bridge/'+route,method:'POST',headers:{'Content-Type':'application/json'}},res=>res.resume());
          req.on('error',()=>{});req.end(JSON.stringify(body));
          try {await bounded(ready);assert.ok(signal instanceof AbortSignal,'REST identity needs a request-owned signal');req.destroy();await bounded(aborted);}
          finally {req.destroy();github[method]=originals[method];}
        }
      } finally {Object.assign(github,originals);api.closeAllConnections?.();await new Promise(resolve=>api.close(resolve));}
    });
  } finally {
    scope.fetchText=originalFetchText;for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});
  }
  assert.deepStrictEqual(failed,[],'GitHub network lifecycle regressions');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
