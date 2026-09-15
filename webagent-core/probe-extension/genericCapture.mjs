import {createStreamProbe} from './browserReference.mjs';
import {collectModelFields,evidenceFromHeaders,SOURCE_WEIGHTS} from '../../arena-model-probe/src/classify.js';
// Same debugger owner, passive samples only. Never starts a page request or reads credentials.
let profile='standard';
const profiles={standard:{bytes:262144,streams:8,ms:15000},light:{bytes:65536,streams:2,ms:5000}};
export function setCaptureProfile(value){if(!Object.hasOwn(profiles,value))throw Error('Unknown sampling profile');profile=value;}
export function createGenericCapture({command,publishUpdate,isTrace}) {
  const owners=new WeakMap();
  const trusted=url=>{try{const u=new URL(url);return u.hostname==='arena.ai'&&['https:','wss:'].includes(u.protocol);}catch{return false;}};
  function state(owner){if(!owners.has(owner))owners.set(owner,{streams:new Map(),requests:new Map()});return owners.get(owner);}
  function feed(entry,data){if(typeof data!=='string'||data.length>349528)throw Error('Stream budget');const raw=atob(data);entry.bytes+=raw.length;if(entry.bytes>entry.limit)throw Error('Stream budget');entry.tap.push(entry.decoder.decode(Uint8Array.from(raw,c=>c.charCodeAt(0)),{stream:true}));}
  function finish(tabId,owner,id,partial=false){const entry=state(owner).streams.get(id);if(!entry)return;clearTimeout(entry.timer);state(owner).streams.delete(id);if(entry.generation!==owner.generation||entry.pageSession!==owner.pageSession)return;entry.tap.finish();owner.probeStream={...entry.tap.snapshot(),truncated:partial||entry.truncated||entry.tap.snapshot().truncated};publishUpdate(tabId);}
  async function capture(tabId,owner,method,p){
    const db=state(owner), id=p.requestId;
    if(method==='Network.requestWillBeSent' && trusted(p.request?.url) && !isTrace(p.request.url)){
      if(db.requests.size>=64)db.requests.delete(db.requests.keys().next().value);
      const evidence=[];const body=p.request.postData;
      if(typeof body==='string'&&body.length<=32768){try{for(const hit of collectModelFields(JSON.parse(body)).slice(0,100))evidence.push({source:'request.body.model',modelId:hit.value,weight:SOURCE_WEIGHTS['request.body.model']});}catch{}}
      db.requests.set(id,evidence);return false;
    }
    if((method==='Network.responseReceived'&&trusted(p.response?.url)&&!isTrace(p.response.url)&&['Fetch','XHR','EventSource'].includes(p.type))||(method==='Network.webSocketCreated'&&trusted(p.url))){
      if(db.streams.size>=profiles[profile].streams){owner.probeCaptureNotice='Generic sample concurrency limit reached; omitted';publishUpdate(tabId);return true;}
      const tap=createStreamProbe(String(id).slice(0,128));
      tap.add([...(db.requests.get(id)||[]),...evidenceFromHeaders(p.response?.headers)]);db.requests.delete(id);
      const entry={tap,limit:profiles[profile].bytes,generation:owner.generation,pageSession:owner.pageSession,bytes:0,streamed:false,pending:[],pendingBytes:0,ready:false,decoder:new TextDecoder(),socket:method==='Network.webSocketCreated',truncated:false};db.streams.set(id,entry);
      entry.timer=setTimeout(()=>finish(tabId,owner,id,true),profiles[profile].ms);
      if(!entry.socket){try{const buffered=await command(tabId,'Network.streamResourceContent',{requestId:id});if(!db.streams.has(id))return true;entry.streamed=true;if(buffered.bufferedData)feed(entry,buffered.bufferedData);for(const data of entry.pending)feed(entry,data);}catch{entry.truncated=true;}finally{entry.ready=true;entry.pending=[];}}
      return true;
    }
    const entry=db.streams.get(id);if(!entry)return false;if(entry.generation!==owner.generation||entry.pageSession!==owner.pageSession){clearTimeout(entry.timer);db.streams.delete(id);return true;}
    if(method==='Network.responseReceived'&&!trusted(p.response?.url)){finish(tabId,owner,id,true);return true;}
    if(method==='Network.dataReceived'){
      if(typeof p.data==='string'){try{if(!entry.ready){entry.pendingBytes+=p.data.length;if(entry.pendingBytes>349528)throw Error('Pending budget');entry.pending.push(p.data);}else{feed(entry,p.data);owner.probeStream=entry.tap.snapshot();publishUpdate(tabId);}}catch{finish(tabId,owner,id,true);}}return true;
    }
    if(method==='Network.webSocketFrameReceived'){
      if(p.response?.opcode!==1){entry.truncated=true;return true;}
      const text=String(p.response.payloadData||'');entry.bytes+=text.length;
      if(entry.bytes>entry.limit){finish(tabId,owner,id,true);return true;}
      entry.tap.push(text+'\n');owner.probeStream=entry.tap.snapshot();publishUpdate(tabId);return true;
    }
    if(method==='Network.loadingFinished'){
      try{
        if(entry.streamed){finish(tabId,owner,id,entry.truncated);return true;}
        // CDP gives no bounded partial getResponseBody. Refuse large encoded bodies before retrieval;
        // the decoded response is checked again before parsing. This is sampling, not full retention.
        if(!Number.isFinite(p.encodedDataLength)||p.encodedDataLength>262144)throw Error('Response budget');
        const body=await command(tabId,'Network.getResponseBody',{requestId:id});
        if(!db.streams.has(id))return true;
        if(typeof body.body!=='string'||body.body.length>349528)throw Error('Decoded response budget');
        const text=body.base64Encoded?atob(body.body):body.body;if(text.length>262144)throw Error('Decoded response budget');entry.tap.push(text);
      }catch{entry.truncated=true;}
      finish(tabId,owner,id,entry.truncated);return true;
    }
    if(['Network.loadingFailed','Network.webSocketClosed','Network.webSocketFrameError'].includes(method)){finish(tabId,owner,id,method!=='Network.webSocketClosed');return true;}
    return true;
  }
  capture.stop=owner=>{const db=owners.get(owner);if(db)for(const entry of db.streams.values())clearTimeout(entry.timer);owners.delete(owner);};
  return capture;
}
