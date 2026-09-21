'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm');
const {EventEmitter}=require('events');
const root=path.resolve(__dirname,'../../..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'workspace-entry-'));
async function main(){
  const {assertWorkspaceBinding}=require('../src/utils/workspaceBinding');
  const config={workspaceRoot:tmp,hostInstanceId:'instance'};
  assertWorkspaceBinding({...config},config);
  for(const input of [{},{workspaceRoot:tmp},{workspaceRoot:root,hostInstanceId:'instance'},{workspaceRoot:tmp,hostInstanceId:'old'},{workspaceRoot:'.',hostInstanceId:'instance'}])assert.throws(()=>assertWorkspaceBinding(input,config));
  const file=path.join(tmp,'not-directory');fs.writeFileSync(file,'fixture');assert.throws(()=>assertWorkspaceBinding({workspaceRoot:file,hostInstanceId:'instance'},{...config,workspaceRoot:file}));
  const absent=path.join(tmp,'absent');assert.throws(()=>assertWorkspaceBinding({workspaceRoot:absent,hostInstanceId:'instance'},{...config,workspaceRoot:absent}));assert.ok(!fs.existsSync(absent));
  const source=fs.readFileSync(path.join(root,'installer/launch.js'),'utf8');
  for(const mode of ['classic','vscode','admin','extension']){
    let spawned;
    const proc=new EventEmitter();
    Object.assign(proc,{argv:['node','launch',mode],env:{},platform:process.platform,execPath:process.execPath,cwd:()=>tmp});
    const sandbox={module:{exports:{}},__dirname:path.join(root,'installer'),console,AbortController,process:proc,require:name=>name==='child_process'?{spawn:(command,args,options)=>{
      const child=new EventEmitter(); child.exitCode=null; child.signalCode=null; child.kill=()=>true;
      if (String(command).includes('npm')) { queueMicrotask(()=>{ child.exitCode=0; child.emit('exit',0,null); }); return child; }
      spawned={command,args,options}; return child;
    }}:require(name)};
    vm.runInNewContext(source+'\nmodule.exports.main=main;',sandbox);await sandbox.module.exports.main();
    assert.equal(spawned.options.env.WORKSPACE_ROOT,root,mode+' default root must not depend on caller cwd');
  }
  const {spawnSync}=require('child_process');
  const child=spawnSync(process.execPath,['-e','process.stdout.write(require('+JSON.stringify(path.join(root,'webagent-core/agent-host/src/config'))+').config.workspaceRoot)'],{cwd:tmp,env:{...process.env,WORKSPACE_ROOT:''},encoding:'utf8'});assert.equal(child.status,0);assert.equal(child.stdout,root);
  // Run the real BridgeView receiver with only transport/VSCode replaced.
  let folders=[],trusted=true,receiver,posts=0,gets=0,errors=[],pending;
  const vscode={workspace:{get workspaceFolders(){return folders;},get isTrusted(){return trusted;},getConfiguration:()=>({get:()=> 'http://127.0.0.1:48271'})},window:{showErrorMessage:(message,options)=>errors.push({message,options})},commands:{},env:{}};
  const context=vm.createContext({module:{exports:{}},console,process,URL,require:name=>name==='vscode'?vscode:name.startsWith('./')?(name==='./workspaceMatch'?require('../../extension/workspaceMatch'):{}):require(name)});
  vm.runInContext(fs.readFileSync(path.join(root,'webagent-core/extension/extension.js'),'utf8')+'\nmodule.exports.BridgeView=BridgeView;',context);
  context.transport=async method=>{if(method==='GET'){gets++;if(pending)await pending;return{status:200,json:{workspaceRoot:tmp,identity:{hostInstanceId:'instance'}}};}posts++;return{status:200,json:{success:true}};};
  vm.runInContext('requestJson=transport;',context);
  const view=new context.module.exports.BridgeView();view.refresh=async()=>{};
  view.resolveWebviewView({webview:{onDidReceiveMessage:fn=>{receiver=fn;}}});
  await receiver({type:'start'});assert.equal(gets,0);assert.equal(posts,0);assert.equal(errors.at(-1).options.modal,true);
  folders=[{uri:{scheme:'file',fsPath:root}}];await receiver({type:'start'});assert.equal(posts,0);
  folders=[{uri:{scheme:'file',fsPath:root}},{uri:{scheme:'file',fsPath:tmp}}];await receiver({type:'start'});assert.equal(posts,0,'must match first folder, consistent with PTY owner');
  folders=[{uri:{scheme:'file',fsPath:tmp}}];await receiver({type:'start'});assert.equal(posts,1);
  trusted=false;await receiver({type:'start'});assert.equal(posts,1);trusted=true;
  let release;pending=new Promise(resolve=>{release=resolve;});const racing=receiver({type:'start'});folders=[];release();await racing;assert.equal(posts,1,'Closing folder during status lookup must prevent start');
  console.log('Workspace entry: source launch defaults, invalid/stale binding, empty IDE, mismatch, trust and folder-close race passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(tmp,{recursive:true,force:true}));
