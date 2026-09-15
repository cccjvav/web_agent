'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
async function exercise(change){
  let listener,clicks=0;const tasks=[];
  class TextArea {constructor(){this.tagName='TEXTAREA';this.isConnected=true;this.value='';}get value(){return this.text||'';}set value(v){this.text=v;}getClientRects(){return[{}];}getAttribute(){return null;}focus(){}dispatchEvent(){}}
  const editor=new TextArea();let editors=[editor];
  const button={isConnected:true,getClientRects:()=>[{}],getAttribute:()=> 'Send',click:()=>clicks++};
  const sandbox={ArenaConversationRename:{rename:async()=>{},archive:async()=>{},sessionFromPath:()=> 'session'},location:{pathname:'/agent/session',origin:'https://arena.ai'},confirm:()=>true,Date,Set,HTMLTextAreaElement:TextArea,Event:class{},setTimeout:fn=>tasks.push(fn),document:{querySelectorAll:query=>query==='button'?[button]:editors},chrome:{runtime:{id:'fixture',sendMessage:async()=>({connected:true}),onMessage:{addListener:fn=>{listener=fn;}}}}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../probe-extension/browserActions.js'),'utf8'),sandbox);
  const pending=new Promise(resolve=>listener({type:'WA_EXECUTE',command:{id:'one',sessionId:'session',deadline:Date.now()+30000,action:'question',text:'approved question'}},{id:'fixture'},resolve));
  await Promise.resolve();assert.equal(editor.value,'approved question');
  change({editor,button,replace:()=>{const next=new TextArea();next.value=editor.value;editors=[next];}});
  for(const task of tasks)task();const result=await pending;return{result,clicks,editor};
}
async function main(){
  let outcome=await exercise(()=>{});assert.equal(outcome.result.ok,true);assert.equal(outcome.clicks,1);
  outcome=await exercise(({editor})=>{editor.value='user changed draft';});assert.equal(outcome.result.ok,false);assert.equal(outcome.clicks,0);assert.equal(outcome.editor.value,'user changed draft');
  for(const change of [({replace})=>replace(),({editor})=>{editor.isConnected=false;},({editor})=>{editor.readOnly=true;},({button})=>{button.disabled=true;}]){outcome=await exercise(change);assert.equal(outcome.result.ok,false);assert.equal(outcome.clicks,0);}
  console.log('Browser question guards: immutable approved draft, same editor, attachment, readonly and send-button state passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
