import {createStreamProbe} from './browserReference.mjs';
import {collectModelFields,evidenceFromHeaders,SOURCE_WEIGHTS} from '../../arena-model-probe/src/classify.js';
// One debugger owner; passive samples only. Never starts a page request or reads credentials.
let profile='standard';
const profiles={standard:{bytes:262144,streams:8,ms:15000},light:{bytes:65536,streams:2,ms:5000}};
export function setCaptureProfile(value){if(!Object.hasOwn(profiles,value))throw Error('Unknown sampling profile');profile=value;}
export function createGenericCapture({command,publishUpdate,isTrace}) {
  const owners=new WeakMap(), encoder=new TextEncoder();
  const trusted=url=>{try{const u=new URL(url);return u.hostname==='arena.ai'&&['https:','wss:'].includes(u.protocol);}catch{return false;}};
  function state(owner){if(!owners.has(owner))owners.set(owner,{streams:new Map(),requests:new Map()});return owners.get(owner);}
  function current(owner,db,id,entry){return owners.get(owner)===db && db.streams.get(id)===entry && entry.generation===owner.generation && entry.pageSession===owner.pageSession;}
  function discard(db,id,entry){clearTimeout(entry.timer);entry.pending=[];if(db.streams.get(id)===entry)db.streams.delete(id);}
  function feed(entry,data){
    if(typeof data!=='string'||data.length>Math.ceil(entry.limit/3)*4)throw Error('Stream budget');
    const raw=atob(data);entry.bytes+=raw.length;
    if(entry.bytes>entry.limit)throw Error('Stream budget');
    entry.tap.push(entry.decoder.decode(Uint8Array.from(raw,c=>c.charCodeAt(0)),{stream:true}));
  }
  function finish(tabId,owner,db,id,entry,partial=false){
    if(!current(owner,db,id,entry)){discard(db,id,entry);return;}
    discard(db,id,entry);
    entry.tap.push(entry.decoder.decode());entry.tap.finish();
    const sample=entry.tap.snapshot();
    owner.probeStream={...sample,truncated:partial||entry.truncated||sample.truncated};publishUpdate(tabId);
  }
  async function complete(tabId,owner,db,id,entry){
    if(!current(owner,db,id,entry)||!entry.ready||entry.completing)return;
    entry.completing=true;
    try{
      if(!entry.streamed){
        // CDP has no bounded partial getResponseBody. Encoded size cannot bound
        // decompression's transient allocation; the returned body is checked before parsing.
        if(!Number.isFinite(entry.encodedLength)||entry.encodedLength>entry.limit)throw Error('Response budget');
        const body=await command(tabId,'Network.getResponseBody',{requestId:id});
        if(!current(owner,db,id,entry))return;
        if(typeof body.body!=='string')throw Error('Invalid response body');
        if(body.base64Encoded)feed(entry,body.body);
        else{
          if(body.body.length>entry.limit||encoder.encode(body.body).length>entry.limit)throw Error('Decoded response budget');
          entry.tap.push(body.body);
        }
      }
    }catch{entry.truncated=true;}
    finally{finish(tabId,owner,db,id,entry,entry.truncated);}
  }
  async function capture(tabId,owner,method,p){
    const db=state(owner), id=p.requestId;
    if(method==='Network.requestWillBeSent'){
      db.requests.delete(id);
      // Redirect/reuse starts a new request generation even when the CDP ID is reused.
      const previous=db.streams.get(id);if(previous)discard(db,id,previous);
      if(trusted(p.request?.url)&&!isTrace(p.request.url)){
        if(db.requests.size>=64)db.requests.delete(db.requests.keys().next().value);
        const evidence=[];const body=p.request.postData;
        if(typeof body==='string'&&body.length<=32768){try{for(const hit of collectModelFields(JSON.parse(body)).slice(0,100))evidence.push({source:'request.body.model',modelId:hit.value,weight:SOURCE_WEIGHTS['request.body.model']});}catch{}}
        db.requests.set(id,{evidence,generation:owner.generation,pageSession:owner.pageSession});
      }
      return false;
    }
    if((method==='Network.responseReceived'&&trusted(p.response?.url)&&!isTrace(p.response.url)&&['Fetch','XHR','EventSource'].includes(p.type))||(method==='Network.webSocketCreated'&&trusted(p.url))){
      const previous=db.streams.get(id);if(previous)discard(db,id,previous);
      const request=db.requests.get(id);db.requests.delete(id);
      if(db.streams.size>=profiles[profile].streams){owner.probeCaptureNotice='Generic sample concurrency limit reached; omitted';publishUpdate(tabId);return true;}
      const tap=createStreamProbe(String(id).slice(0,128));
      const evidence=request&&request.generation===owner.generation&&request?.pageSession===owner.pageSession?request.evidence:[];
      tap.add([...evidence,...evidenceFromHeaders(p.response?.headers)]);
      const entry={tap,limit:profiles[profile].bytes,generation:owner.generation,pageSession:owner.pageSession,bytes:0,streamed:false,pending:[],pendingBytes:0,ready:false,decoder:new TextDecoder(),socket:method==='Network.webSocketCreated',truncated:false};
      db.streams.set(id,entry);
      entry.timer=setTimeout(()=>finish(tabId,owner,db,id,entry,true),profiles[profile].ms);
      if(!entry.socket){
        try{
          const buffered=await command(tabId,'Network.streamResourceContent',{requestId:id});
          if(!current(owner,db,id,entry))return true;
          entry.streamed=true;
          if(buffered.bufferedData)feed(entry,buffered.bufferedData);
          for(const data of entry.pending)feed(entry,data);
        }catch{
          if(entry.streamed){finish(tabId,owner,db,id,entry,true);return true;}
          // No stream bytes consumed: a single completed-body fallback is safe (not a retry).
        }finally{
          entry.ready=true;entry.pending=[];
          if(entry.completed&&current(owner,db,id,entry))void complete(tabId,owner,db,id,entry);
        }
      }
      return true;
    }
    const entry=db.streams.get(id);
    if(!entry){if(['Network.loadingFinished','Network.loadingFailed'].includes(method))db.requests.delete(id);return false;}
    if(!current(owner,db,id,entry)){discard(db,id,entry);return true;}
    if(method==='Network.responseReceived'){discard(db,id,entry);db.requests.delete(id);return false;}
    if(method==='Network.dataReceived'){
      if(typeof p.data==='string'){
        try{
          if(!entry.ready){entry.pendingBytes+=p.data.length;if(entry.pendingBytes>Math.ceil(entry.limit/3)*4||entry.pending.length>=1024)throw Error('Pending budget');entry.pending.push(p.data);}
          else{feed(entry,p.data);owner.probeStream=entry.tap.snapshot();publishUpdate(tabId);}
        }catch{finish(tabId,owner,db,id,entry,true);}
      }
      return true;
    }
    if(method==='Network.webSocketFrameReceived'){
      if(p.response?.opcode!==1){entry.truncated=true;return true;}
      const text=p.response.payloadData;
      if(typeof text!=='string'||text.length>entry.limit){finish(tabId,owner,db,id,entry,true);return true;}
      entry.bytes+=encoder.encode(text+'\n').length;
      if(entry.bytes>entry.limit){finish(tabId,owner,db,id,entry,true);return true;}
      entry.tap.push(text+'\n');owner.probeStream=entry.tap.snapshot();publishUpdate(tabId);return true;
    }
    if(method==='Network.loadingFinished'){
      entry.completed=true;entry.encodedLength=p.encodedDataLength;
      await complete(tabId,owner,db,id,entry);return true;
    }
    if(['Network.loadingFailed','Network.webSocketClosed','Network.webSocketFrameError'].includes(method)){finish(tabId,owner,db,id,entry,method!=='Network.webSocketClosed');return true;}
    return true;
  }
  capture.stop=owner=>{const db=owners.get(owner);if(db){for(const [id,entry] of db.streams)discard(db,id,entry);db.requests.clear();}owners.delete(owner);};
  return capture;
}
