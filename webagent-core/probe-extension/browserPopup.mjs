// Popup-only controls; pairing permission must be requested from a user gesture.
const section = document.createElement('section'); section.className='history';
const heading=document.createElement('h2');heading.textContent='WebAgent 实时连接与审批';
const input=document.createElement('input');input.type='password';input.autocomplete='off';input.placeholder='粘贴VS Code生成的配对JSON（15分钟有效）';input.setAttribute('aria-label','配对JSON');
const info=document.createElement('p');info.textContent='配对后会把当前会话参考同步给本机WebAgent及已连接客户端；不发送原始响应或运行令牌。网站写操作进入本机审批。';
section.append(heading,info,input);document.body.append(section);
let tabId;
const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab?.id;
function button(label, handler) {
  const b=document.createElement('button'); b.type='button';b.className='small';b.textContent=label;
  b.addEventListener('click',async()=>{b.disabled=true;try{await handler();}catch{info.textContent='操作未完成，请检查配对/会话/本机审批，不会自动重试。';}finally{b.disabled=false;}});section.append(b);
}
async function send(message) { const result=await chrome.runtime.sendMessage({...message,tabId});if(result?.error)throw Error('Request rejected');return result; }
button('配对并同步当前会话',async()=>{
  const pair=JSON.parse(input.value);input.value='';
  if(!await chrome.permissions.request({origins:['http://127.0.0.1/*']}))throw Error('Permission denied');
  await send({type:'WA_CONNECT',pair});info.textContent='已请求连接。请检查连接状态；服务休眠/重启后需要重新配对。';
});
button('连接状态',async()=>{const state=await send({type:'WA_STATUS'});info.textContent=JSON.stringify(state);});
button('断开并撤销配对',async()=>{await send({type:'WA_DISCONNECT'});info.textContent='已断开；失败时也可在VSCode撤销配对。';});
button('申请刷新公开UUID目录',async()=>{await send({type:'WA_ACTION_REQUEST',action:'refresh-map'});info.textContent='已提交WebAgent审批，尚未刷新目录。';});
const select=document.createElement('select');select.setAttribute('aria-label','主动探针题组');const prompt=document.createElement('textarea');prompt.readOnly=true;prompt.setAttribute('aria-label','将提交审批的完整题目');
const pack=await send({type:'WA_PACK'});
for(const q of pack.questions){const o=document.createElement('option');o.value=q.id;o.textContent=q.title;select.append(o);}
const update=()=>{prompt.value=pack.questions.find(q=>q.id===select.value)?.prompt||'';};select.addEventListener('change',update);update();section.append(select,prompt);
button('申请发送所选题目（可能计费）',async()=>{await send({type:'WA_ACTION_REQUEST',action:'question',text:prompt.value});info.textContent='已提交本机审批。批准后还需当前页面确认；不批量自动发送。';});

button('导出公开UUID目录（用于历史回填）',async()=>{const catalog=await send({type:'WA_CATALOG'});const url=URL.createObjectURL(new Blob([JSON.stringify(catalog,null,2)],{type:'application/json'}));try{const a=document.createElement('a');a.href=url;a.download='webagent-public-catalog.json';a.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}});

button('轻量采样（新请求：64KiB/2并发/5秒）',()=>send({type:'WA_SAMPLING',profile:'light'}));
button('标准采样（新请求：256KiB/8并发/15秒）',()=>send({type:'WA_SAMPLING',profile:'standard'}));
