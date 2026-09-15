'use strict';
const path = require('path');
const fs = require('fs');
const {pathToFileURL} = require('url');
const {fingerprint,DIMS} = require('./referenceInput');
async function clusterHistory(entries) {
  if(!Array.isArray(entries)||entries.length>50)throw Error('Clustering history budget');
  const engine=fs.existsSync(path.join(__dirname,'engine/package.json'))?path.join(__dirname,'engine/classify.js'):path.resolve(__dirname,'../../arena-model-probe/src/classify.js');
  const {cosineSim,FP_DIMS}=await import(pathToFileURL(engine).href);
  if(JSON.stringify(DIMS)!==JSON.stringify(FP_DIMS))throw Error('Fingerprint dimensions changed');
  const groups=[],unclustered=[];
  for(const entry of entries){
    const raw=entry.report.fingerprint;if(!raw){unclustered.push(entry.id);continue;}
    const vector=fingerprint(raw);
    // Timing/length alone are not enough to build an apparently certain identity cluster.
    if(!DIMS.filter(key=>key.startsWith('p_')||key.startsWith('has_')).some(key=>vector[key]>0)){unclustered.push(entry.id);continue;}
    const item={id:entry.id,declaredModel:entry.report.candidate?.modelId||null,vector};
    const group=groups.find(group=>group.every(peer=>cosineSim(peer.vector,vector)>=0.93));
    if(group)group.push(item);else groups.push([item]);
  }
  return {schema:'webagent-sample-clusters/v1',threshold:0.93,groups:groups.map(group=>({samples:group.map(({vector,...sample})=>sample),minimumPairSimilarity:group.length<2?null:Math.min(...group.flatMap((a,i)=>group.slice(i+1).map(b=>cosineSim(a.vector,b.vector))))})),unclustered,modelIdentityVerified:false,
    note:'Complete-link protocol/behavior similarity, not model identity. Labels remain attached to their original samples; no automatic name backfill or certainty upgrade. Load, gateway and prompt differences affect vectors.'};
}
module.exports={clusterHistory};
async function mapHistory(entries, catalog) {
  if(!Array.isArray(entries)||entries.length>50||catalog?.schema!=='webagent-catalog/v1'||!Array.isArray(catalog.models)||catalog.models.length>1000)throw Error('Catalog history budget');
  const {createHash}=require('crypto'), {snapshot}=require('./history');
  const map=new Map(), conflicts=new Set();
  for(const item of catalog.models){
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item?.id||'')||typeof item.publicName!=='string'||!item.publicName||item.publicName.length>120)throw Error('Invalid public model mapping');
    const id=item.id.toLowerCase();if(map.has(id)&&map.get(id)!==item.publicName)conflicts.add(id);else map.set(id,item.publicName);
  }
  for(const id of conflicts)map.delete(id);
  const output=[];
  for(const entry of entries){
    const report=snapshot(entry.report);let changed=false;
    const apply=(candidate,id)=>{const name=map.get(id?.toLowerCase());if(!name||candidate?.modelId===name)return candidate;changed=true;return{modelId:name,family:null,mode:'PUBLIC_UUID_MAPPING',source:'idmap.resolve',heuristicScore:0.92};};
    if(report.schema==='webagent-model-analysis/v1')report.candidate=apply(report.candidate,report.candidate?.modelId);
    else for(const call of report.calls||[])call.reference=apply(call.reference,call.evidence?.model?.value||call.model);
    if(!changed)continue;
    report.mappingSource=createHash('sha256').update(JSON.stringify(catalog.models)).digest('hex');report.historical=true;
    const hash=createHash('sha256').update(JSON.stringify(report)).digest('hex').slice(0,32),id=[hash.slice(0,8),hash.slice(8,12),hash.slice(12,16),hash.slice(16,20),hash.slice(20)].join('-');
    if(!output.some(item=>item.id===id))output.push({id,savedAt:new Date().toISOString(),report});
  }
  return{schema:'webagent-reference-history/v1',exportedAt:new Date().toISOString(),entries:output};
}
module.exports.mapHistory=mapHistory;
