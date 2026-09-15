'use strict';
const fs = require('fs');
const {createHash} = require('crypto');
const {analyze} = require('./analysis');
const {snapshot} = require('./history');
const LIMIT=2*1024*1024;
async function readArchive(file) {
  const handle=await fs.promises.open(file,'r');
  try {
    const stat=await handle.stat();if(!stat.isFile()||stat.size>LIMIT)throw Error('History file budget');
    const bytes=Buffer.alloc(LIMIT+1);let count=0;
    while(count<bytes.length){const part=await handle.read(bytes,count,bytes.length-count,null);if(!part.bytesRead)break;count+=part.bytesRead;}
    if(count>LIMIT)throw Error('History file budget');return JSON.parse(bytes.subarray(0,count).toString('utf8'));
  } finally {await handle.close();}
}
async function writeArchive(file, archive) {
  const text=JSON.stringify(archive,null,2);if(Buffer.byteLength(text)>LIMIT)throw Error('History export budget');
  // A newly named file only: never clobber an existing file/symlink.
  await fs.promises.writeFile(file,text,{flag:'wx',mode:0o600});
}
async function convertBrowserHistory(input, signal) {
  if (input?.schemaVersion!==1 || !Array.isArray(input.conversations) || input.conversations.length>50
    || typeof input.exportedAt!=='string' || !Number.isFinite(Date.parse(input.exportedAt)))throw Error('Invalid browser history');
  const entries=[];
  for(const record of input.conversations){
    if(!record||typeof record.sessionId!=='string'||!/^[\w-]{1,128}$/.test(record.sessionId))throw Error('Invalid historical session');
    let runs=record.runs || [];
    if(!Array.isArray(runs)||runs.length>50)throw Error('Historical run budget');
    if(!runs.length && Array.isArray(record.observations)) {
      if(record.observations.length>100)throw Error('Legacy history budget');
      const byRun=new Map();
      for(const o of record.observations){if(!byRun.has(o.runId))byRun.set(o.runId,{runId:o.runId,checkedAt:o.lastSeen||null,spans:[]});byRun.get(o.runId).spans.push({spanId:o.spanId||'legacy-'+byRun.get(o.runId).spans.length,model:o.model,provider:o.provider||''});}
      runs=[...byRun.values()];
    }
    for(const run of runs){
      if(signal?.aborted)throw Error('History import cancelled');
      if(entries.length>=50)throw Error('History run budget');
      if(!Array.isArray(run.spans)||run.spans.length>100)throw Error('Historical call budget');
      const spans=run.spans.map(span=>({...span,model:span.model??'',provider:span.provider??''}));
      const report=snapshot(await analyze({schemaVersion:1,exportedAt:input.exportedAt,runId:run.runId,checkedAt:run.checkedAt||null,historical:true,scope:'Imported Inspector local history; not a new observation',calls:spans},signal));
      const hash=createHash('sha256').update(JSON.stringify([record.sessionId,report])).digest('hex').slice(0,32);
      const id=[hash.slice(0,8),hash.slice(8,12),hash.slice(12,16),hash.slice(16,20),hash.slice(20)].join('-');
      if(!entries.some(entry=>entry.id===id))entries.push({id,savedAt:input.exportedAt,report});
    }
  }
  return {schema:'webagent-reference-history/v1',exportedAt:input.exportedAt,entries};
}
module.exports={readArchive,writeArchive,convertBrowserHistory};
