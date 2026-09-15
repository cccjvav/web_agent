'use strict';
const DIMS=['ttft_ms','tok_per_sec','out_in_ratio','len_chars','p_openai_chat','p_openai_resp','p_anthropic','p_google','has_reasoning_field','has_cached_tokens','has_cache_creation','has_system_fingerprint','has_toolu','has_call','has_fc','prompt_tokens','completion_tokens','reasoning_ratio'];
function fingerprint(value) {
  if(!value||typeof value!=='object'||Object.keys(value).length!==DIMS.length)throw Error('Fingerprint shape');
  const result={};for(const key of DIMS){if(!Number.isFinite(value[key])||value[key]<0||value[key]>1)throw Error('Fingerprint range');result[key]=value[key];}return result;
}
function validateReference(input) {
  const text=(value,max)=>{if(value===null)return null;if(typeof value!=='string'||value.length>max)throw Error('Reference string');return value;};
  if(input?.schema!=='webagent-model-analysis/v1'||!Number.isFinite(Date.parse(input.observedAt))||!Number.isFinite(input.candidate?.heuristicScore)||input.candidate.heuristicScore<0||input.candidate.heuristicScore>1||typeof input.truncated!=='boolean')throw Error('Reference shape');
  const hints=(items,type)=>{if(items===undefined)return [];if(!Array.isArray(items)||items.length>32)throw Error('Reference hints');return items.map(item=>{if(!Number.isFinite(item.heuristicScore)||item.heuristicScore<0||item.heuristicScore>1)throw Error('Hint score');return {family:text(item.family,100),[type]:text(item[type],120),heuristicScore:item.heuristicScore};});};
  return {schema:input.schema,requestId:text(input.requestId,128),observedAt:text(input.observedAt,40),truncated:input.truncated,
    candidate:{modelId:text(input.candidate.modelId,120),family:text(input.candidate.family,100),mode:text(input.candidate.mode,80),heuristicScore:input.candidate.heuristicScore},
    fingerprint:fingerprint(input.fingerprint),protocol:hints(input.protocol,'label'),behavior:hints(input.behavior,'source'),modelIdentityVerified:false,registryVersion:input.registryVersion?text(input.registryVersion,100):'browser-probe-reference/v1'};
}
module.exports={DIMS,fingerprint,validateReference};
