'use strict';
const assert=require('assert');
const {validateObservation,analyze}=require('../../probe-extension/analysis');
async function main(){
  const dump={probe:'arena-model-probe',version:'0.legacy',at:'2026-09-15T00:00:00Z',href:'https://arena.ai/agent/test?SECRET=page',
    verdict:{modelId:'global-verdict-secret'},slots:{a:{modelId:'other-request'}},
    evidence:[{slot:'a',source:'run.trace.model',modelId:'previous-request',weight:999,detail:'SECRET'}],
    observation:{slot:'a',url:'https://arena.ai/api/fixture?SECRET=url',text:'data: {"model":"current-request"}\n\n',promptTokens:100,truncated:false,authorization:'SECRET'}};
  const observation=validateObservation(dump);assert.equal(observation.evidence.length,0);assert.equal(observation.legacyDumpExport,true);assert.ok(!JSON.stringify(observation).includes('SECRET'));
  assert.equal(validateObservation(dump).requestId,observation.requestId);
  const report=await analyze(dump);assert.equal(report.candidate.modelId,'current-request');assert.equal(report.modelIdentityVerified,false);assert.equal(report.tokenizer,null);
  assert.ok(report.provenance.includes('export-time'));assert.ok(report.warnings.some(text=>text.includes('Global BUS')));assert.ok(!JSON.stringify(report).includes('previous-request'));
  const capped=validateObservation({...dump,observation:{...dump.observation,text:'x'.repeat(4000)}});assert.equal(capped.truncated,true);
  const requested=validateObservation({...dump,observation:{...dump.observation,requestModel:'chosen-request'}});assert.deepEqual(requested.evidence,[{source:'request.body.model',modelId:'chosen-request'}]);
  for(const bad of [
    {...dump,href:'https://evil.invalid'}, {...dump,observation:{...dump.observation,url:'https://other.invalid'}},
    {...dump,at:'not-a-time'}, {...dump,observation:null}, {...dump,observation:{...dump.observation,text:'x'.repeat(4001)}},
    {...dump,observation:{...dump.observation,promptTokens:-1}}, {...dump,observation:{...dump.observation,requestModel:{}}},
  ])assert.throws(()=>validateObservation(bad));
  const controller=new AbortController();controller.abort();await assert.rejects(analyze(dump,controller.signal));
  console.log('Legacy Probe dump: request-local evidence, time provenance, truncation, origin, metrics and cancellation passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
