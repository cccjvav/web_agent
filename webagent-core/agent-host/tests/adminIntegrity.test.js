'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { once } = require('events');
const { createServer, ingest, loadReports } = require('../../admin-host/app');

function request(port, target, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({hostname:'127.0.0.1',port,path:target,method:body === undefined ? 'GET':'POST',headers:{Authorization:'Bearer fixture-admin','Content-Type':'application/json'}}, res => {
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString()}));
    });
    req.on('error',reject);req.setTimeout(5000,()=>req.destroy(new Error('fixture request timed out')));
    req.end(body);
  });
}
async function isolatedServer(dir) {
  const child=spawn(process.execPath,['--unhandled-rejections=strict',__filename,'--child',dir],{stdio:['ignore','pipe','pipe']});
  let output='',errors='';child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-2000);});
  const exited=once(child,'exit');
  const port=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(new Error('admin fixture startup timed out'));},10000);
    child.stdout.on('data',chunk=>{output+=chunk;const match=/READY (\d+)/.exec(output);if(match){clearTimeout(timer);resolve(Number(match[1]));}});
    child.once('error',err=>{clearTimeout(timer);reject(err);});
    child.once('exit',()=>{clearTimeout(timer);if(!/READY/.test(output))reject(new Error(errors||'early fixture exit'));});
  });
  return {child,port,exited,diagnostics:()=>errors};
}
async function run() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'webagent-admin-integrity-'));
  const file=path.join(root,'reports.json');
  const valid={installId:'fixture',day:'2026-09-22',toolCalls:2,fail:1};
  const failed=[];
  async function check(name,fn){try{await fn();console.log('PASS',name);}catch(err){failed.push(name);console.error('FAIL',name,err.message);}}
  try {
    await check('malformed URL gets 400 and the real HTTP process survives',async()=>{
      const server=await isolatedServer(root);
      try {
        const response=await request(server.port,'//[');
        assert.strictEqual(response.status,400);
        assert.strictEqual((await request(server.port,'/health')).status,200);
        assert.strictEqual(server.child.exitCode,null);
      } finally {
        if(server.child.exitCode===null)server.child.kill();
        const exit=await server.exited;
        if(exit[0]!==null && exit[0]!==0)console.log("isolated admin exit",exit[0],"invalid URL:",server.diagnostics().includes("ERR_INVALID_URL"));
      }
    });
    await check('corrupt, truncated, wrong-shape and over-budget stores remain byte-identical',()=>{
      for(const bad of ['{broken','[','{}','[null]','[{"installId":"x"}]',JSON.stringify([valid]),' '.repeat(4*1024*1024+1)]) {
        fs.writeFileSync(file,bad);
        assert.throws(()=>ingest(root,valid),err=>err.code==='E_REPORT_STORE');
        assert.strictEqual(fs.readFileSync(file,'utf8'),bad);
      }
    });
    await check('unreadable stores fail closed rather than becoming empty',()=>{
      fs.writeFileSync(file,'[]');
      const original=fs.openSync;
      fs.openSync=function(target,...args){if(String(target)===file)throw Object.assign(new Error('fixture denied'),{code:'EACCES'});return original.call(this,target,...args);};
      try {assert.throws(()=>ingest(root,valid),err=>err.code==='E_REPORT_STORE');}
      finally {fs.openSync=original;}
      assert.strictEqual(fs.readFileSync(file,'utf8'),'[]');
    });
    await check('a store disappearing between stat and open is not recreated as an empty ledger',()=>{
      fs.writeFileSync(file,'[]');
      const original=fs.openSync;
      fs.openSync=function(target,...args){if(String(target)===file){fs.unlinkSync(file);throw Object.assign(new Error('fixture disappeared'),{code:'ENOENT'});}return original.call(this,target,...args);};
      try {assert.throws(()=>ingest(root,valid),err=>err.code==='E_REPORT_STORE');}
      finally {fs.openSync=original;}
      assert.ok(!fs.existsSync(file));
    });
    await check('failed temporary write or atomic rename preserves prior data and cleans scratch',()=>{
      for(const phase of ['write','rename']) {
        fs.writeFileSync(file,'[]');ingest(root,valid);
        const before=fs.readFileSync(file);
        const write=fs.writeFileSync,rename=fs.renameSync;
        if(phase==='write') fs.writeFileSync=function(target,...args){
          if(String(target).includes('.tmp.')){write.call(this,target,'partial',{flag:'wx'});throw Object.assign(new Error('fixture write interruption'),{code:'EIO'});}
          return write.call(this,target,...args);
        };
        else fs.renameSync=function(from,to){if(String(to)===file)throw Object.assign(new Error('fixture rename interruption'),{code:'EIO'});return rename.call(this,from,to);};
        try {assert.throws(()=>ingest(root,{...valid,toolCalls:3}),err=>err.code==='E_REPORT_STORE');}
        finally {fs.writeFileSync=write;fs.renameSync=rename;}
        assert.deepStrictEqual(fs.readFileSync(file),before);
        assert.ok(!fs.readdirSync(root).some(name=>name.includes('.tmp.')));
      }
    });
    await check('finite counters, real dates and bounded string fields are checked before writes',()=>{
      fs.writeFileSync(file,'[]');
      const invalid=[{toolCalls:Infinity},{toolCalls:null},{fail:null},{day:null},{toolCalls:1.2},{toolCalls:-1},{fail:3},{successRate:101},{successRate:'99'},{day:'2026-02-31'},{installId:{}},{provider:{}},{githubUser:'x'.repeat(300)},{unknown:'field'},null,[]];
      for(const item of invalid) {
        const body=item===null||Array.isArray(item)?item:{...valid,...item};
        assert.throws(()=>ingest(root,body),err=>err.status===400);
        assert.strictEqual(fs.readFileSync(file,'utf8'),'[]');
      }
      ingest(root,valid);ingest(root,{...valid,toolCalls:3});
      const rows=loadReports(root);assert.strictEqual(rows.length,1);assert.strictEqual(rows[0].toolCalls,3);
    });
    await check('HTTP rejects bad JSON/schema and reports corrupt storage without committing a 200 header',async()=>{
      fs.writeFileSync(file,'[]');
      const {server}=createServer({dataDir:root,token:'fixture-admin'});
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      try {
        for(const body of ['{bad','{"installId":"x","toolCalls":1e999}','null'])assert.strictEqual((await request(server.address().port,'/api/report',body)).status,400);
        fs.writeFileSync(file,'{broken');
        const stats=await request(server.address().port,'/api/stats');
        assert.strictEqual(stats.status,500);assert.strictEqual(JSON.parse(stats.body).code,'E_REPORT_STORE');
        assert.strictEqual((await request(server.address().port,'/health')).status,200);
      } finally {await new Promise(resolve=>server.close(resolve));}
    });
    await check('only a genuinely absent store starts empty',()=>{
      fs.rmSync(file,{force:true});assert.deepStrictEqual(loadReports(root),[]);
      ingest(root,valid);assert.strictEqual(loadReports(root).length,1);
    });
  } finally {fs.rmSync(root,{recursive:true,force:true});}
  assert.deepStrictEqual(failed,[],'admin integrity regressions');
}
if(process.argv[2]==='--child') {
  const {server}=createServer({dataDir:process.argv[3],token:'fixture-admin'});
  server.listen(0,'127.0.0.1',()=>console.log('READY '+server.address().port));
} else run().catch(err=>{console.error(err);process.exitCode=1;});
