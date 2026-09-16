'use strict';
// This certificate/key is a public test fixture, never a production credential.
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),https=require('https');
const transport=require('../src/mcp/publicHttps');
const external=require('../src/mcp/externalClient');
const queue=require('../src/utils/operatorQueue');
const {config}=require('../src/config');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'public-mcp-'));config.workspaceRoot=tmp;
const cert=fs.readFileSync(path.join(__dirname,'fixtures/public-mcp-test-cert.pem'));
const key=fs.readFileSync(path.join(__dirname,'fixtures/public-mcp-test-key.pem'));
async function main() {
  for(const ip of ['0.0.0.0','10.2.3.4','127.0.0.1','169.254.169.254','172.16.1.2','192.168.0.1','100.64.1.2','198.18.1.2','192.0.2.1','224.0.0.1','255.255.255.255','::1','::ffff:8.8.8.8','fc00::1','fe80::1','64:ff9b::808:808','2001:db8::1','2002:808:808::1','3fff::1','garbage']) assert.equal(transport.isPublic(ip),false,ip);
  for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111','2001:4860:4860::8888']) assert.equal(transport.isPublic(ip),true,ip);
  const abort=new AbortController();
  const waiting=transport.resolvePublic('pending.test',abort.signal,()=>new Promise(()=>{}));abort.abort();await assert.rejects(waiting,/cancelled/);
  await assert.rejects(transport.resolvePublic('mixed.test',undefined,async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]));
  for(const url of ['https://127.1/mcp','https://0x7f000001/mcp','https://[::ffff:127.0.0.1]/mcp','https://host.test/mcp?token=secret','http://host.test/mcp']) await assert.rejects(transport.post(url,{headers:{},body:'{}'}));
  let mode='ok',calls=0,redirectHits=0,requests=0,dnsCalls=0,rebinding=false,hanging;
  const server=https.createServer({key,cert},async(req,res)=>{
    requests++;assert.equal(req.headers.host,`mcp.example.test:${server.address().port}`);
    assert.equal(req.headers.authorization,'Bearer fixture-private');
    if(req.url==='/redirected')redirectHits++;
    let text='';for await(const chunk of req)text+=chunk;
    const body=JSON.parse(text);
    if(mode==='redirect'){res.writeHead(307,{Location:'/redirected'});res.end();return;}
    if(mode==='hang'){res.writeHead(200,{'Content-Type':'application/json'});res.write('{');hanging();return;}
    if(mode==='large'){res.end('x'.repeat(262145));return;}
    if(body.method==='notifications/initialized'){res.writeHead(202);res.end();return;}
    if(body.method==='tools/call')calls++;
    res.setHeader('Content-Type','application/json');res.setHeader('Mcp-Session-Id','fixture-session');
    res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result:body.method==='initialize'?{protocolVersion:'2025-03-26'}:body.method==='tools/list'?{tools:[{name:'echo',inputSchema:{type:'object'}}]}:{content:[{type:'text',text:'approved'}]}}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const original=transport.post;
  const lookup=async()=>{dnsCalls++;return [{address:rebinding?'127.0.0.1':'8.8.8.8',family:4}];};
  // Route a verified public-address fixture to an isolated TLS server; assert the actual
  // transport's pinned lookup/Host/certificate policy before the test-only routing override.
  const request=(url,options,callback)=>{
    assert.equal(options.agent,false);assert.equal(options.rejectUnauthorized,true);
    options.lookup(url.hostname,{},(error,address,family)=>{assert.ifError(error);assert.equal(address,'8.8.8.8');assert.equal(family,4);});
    options.lookup(url.hostname,{all:true},(error,addresses)=>{assert.ifError(error);assert.deepEqual(addresses,[{address:'8.8.8.8',family:4}]);});
    return https.request(url,{...options,ca:cert,lookup(_host,opts,cb){cb(null,opts.all?[{address:'127.0.0.1',family:4}]:'127.0.0.1',4);}},callback);
  };
  transport.post=(url,options)=>original(url,options,{lookup,request});
  const input={name:'Public fixture',url:`https://mcp.example.test:${server.address().port}/mcp`,publicHttps:true,confirmedPublic:true,workspaceRoot:tmp,hostInstanceId:config.hostInstanceId,token:'fixture-private'};
  try {
    await assert.rejects(external.add({...input,confirmedPublic:'true'}));
    await assert.rejects(external.add({...input,hostInstanceId:'other-host'}));
    await assert.rejects(external.add({...input,publicHttps:false}));assert.equal(requests,0);
    const registered=await external.add(input);assert.equal(registered.publicHttps,true);assert.equal(calls,0);assert.ok(dnsCalls>=3);
    assert.ok(!JSON.stringify(external.list(true)).includes('fixture-private'));
    const job=external.request({serverId:registered.serverId,tool:'echo',arguments:{text:'approved'},requestKey:'public-call-1'},{remote:true,callerKey:'peer:fixture'});
    assert.equal(calls,0);await queue.approve(job.requestId,true);assert.equal(calls,1);
    await queue.approve(job.requestId,true);assert.equal(calls,1);
    const denied=external.request({serverId:registered.serverId,tool:'echo',requestKey:'public-call-2'},{remote:true,callerKey:'peer:fixture'});
    rebinding=true;const before=requests;await queue.approve(denied.requestId,true);assert.equal(requests,before);assert.equal(calls,1);
    assert.notEqual(queue.inspect(denied.requestId).status,'succeeded');rebinding=false;external.remove(registered.serverId);
    mode='redirect';await assert.rejects(external.add(input),/307/);assert.equal(redirectHits,0);
    mode='large';await assert.rejects(external.add(input),/256 KiB/);
    mode='hang';const begun=new Promise(resolve=>{hanging=resolve;});const cancelled=new AbortController();
    const registration=require('../src/utils/requestScope').runWithSignal(cancelled.signal,()=>external.add(input));
    await begun;cancelled.abort();await assert.rejects(registration);assert.deepEqual(external.list(),[]);
    mode='ok';
    // Without the fixture CA, normal TLS verification must reject this self-signed peer.
    await assert.rejects(original(input.url,{headers:{Authorization:'Bearer fixture-private'},body:'{}'}, {lookup,request:(url,options,callback)=>https.request(url,{...options,lookup(_h,o,cb){cb(null,o.all?[{address:'127.0.0.1',family:4}]:'127.0.0.1',4);}},callback)}));
  } finally {transport.post=original;await external.closeAll();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(tmp,{recursive:true,force:true});}
  console.log('public HTTPS: conservative IP/DNS, pinned lookup, real TLS/Host, redirects, bounds, owner binding and approval/no replay passed (isolated routing fixture, not internet acceptance)');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
