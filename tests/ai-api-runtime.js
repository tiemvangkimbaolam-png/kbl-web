'use strict';
const assert=require('assert');
const {createAiApi}=require('../modules/kbl-ai-api');
const {createDiagnostics}=require('../modules/kbl-ai-diagnostics');
const nativeFetch=global.fetch;
const key='fixture-secret-never-disclose';
const api=createAiApi({secrets:()=>[key]});
const url='https://generativelanguage.googleapis.com/v1beta/models/fixture-model:generateContent';
const init={method:'POST',headers:{'x-goog-api-key':key},body:JSON.stringify({contents:[{parts:[{text:'PRIVATE CUSTOMER PROMPT'}]}],generationConfig:{maxOutputTokens:256}})};
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
(async()=>{try{
 for(const [status,code] of [[400,'REQUEST'],[401,'AUTH'],[402,'BILLING'],[403,'PERMISSION'],[404,'MODEL'],[429,'QUOTA'],[500,'PROVIDER']]){
  global.fetch=async()=>json({error:{message:'Provider error '+key+' https://example.invalid/?key='+key}},status);
  const r=await api.fetch(url,init,'fixture');assert.equal(r.status,status);assert.equal((await r.json()).error.message.includes(key),true,'caller response preserved');assert.equal(api.snapshot().events[0].code,code);
  assert(!JSON.stringify(api.snapshot()).includes(key));assert(!JSON.stringify(api.snapshot()).includes('PRIVATE CUSTOMER PROMPT'));
 }
 for(const [name,code] of [['AbortError','TIMEOUT'],['TypeError','NETWORK']]){
  global.fetch=async()=>{const e=Error('fixture failure');e.name=name;throw e};await assert.rejects(api.fetch(url,init));assert.equal(api.snapshot().events[0].code,code);
 }
 global.fetch=async()=>new Response('<html>Proxy error</html>');await api.fetch(url,init);assert.equal(api.snapshot().events[0].code,'INVALID_JSON');
 let calls=0;
 global.fetch=async(_,opts)=>{calls++;const body=JSON.parse(opts.body);return calls===1?json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{thought:true,text:'NEVER LOG THOUGHT'}]}}]}):(assert.equal(body.generationConfig.maxOutputTokens,2048),json({candidates:[{content:{parts:[{text:'Complete answer'}]}}]}));};
 const recovered=await (await api.fetch(url,init)).json();assert.equal(calls,2);assert.equal(recovered.candidates[0].content.parts[0].text,'Complete answer');assert(!JSON.stringify(api.snapshot()).includes('NEVER LOG THOUGHT'));
 calls=0;global.fetch=async()=>{calls++;return json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[]}}]});};
 await api.fetch(url,init);assert.equal(calls,2,'retry bounded to one');
 calls=0;await api.fetch(url,{...init,body:JSON.stringify({generationConfig:{responseModalities:['IMAGE'],maxOutputTokens:256}})});assert.equal(calls,1,'no image replay');
 calls=0;global.fetch=async()=>{calls++;return json({promptFeedback:{blockReason:'SAFETY'}})};await api.fetch(url,init);assert.equal(calls,1);assert.equal(api.snapshot().events[0].code,'BLOCKED');
 global.fetch=async()=>json({candidates:[{content:{parts:[{functionCall:{name:'fixture'}}]}}]});await api.fetch(url,init);assert(api.snapshot().events[0].ok,'tool call is valid output');
 let probes=0;
 global.fetch=async(_,opts)=>{probes++;const b=JSON.parse(opts.body);if(b.tools)return json({candidates:[{content:{parts:[{functionCall:{name:'kbl_diagnostic_echo',args:{value:'KBL_OK'}}}]}}]});return json({candidates:[{content:{parts:[{text:b.generationConfig.responseSchema?'\u007b"answer":"KBL_OK"}':'KBL_OK'}]}}]});};
 const diagnostics=createDiagnostics({api,providers:()=>({gemini:{key,model:'fixture-model'},deepseek:{key:'',model:'fixture'}}),generationConfig:(_,opts)=>opts});
 const [a,b]=await Promise.all([diagnostics.run(),diagnostics.run()]);assert(a.ok&&b.ok);assert.equal(probes,3,'single-flight concurrent probe');assert.equal((await diagnostics.run()).cached,true);assert.equal(probes,3,'probe cooldown');assert(!JSON.stringify(diagnostics.snapshot()).includes(key));
 const bad=createDiagnostics({api,providers:()=>({gemini:{key,model:'fixture-model'}}),generationConfig:(_,opts)=>opts});
 global.fetch=async()=>json({error:{message:'bad '+key}},401);const failed=await bad.run();assert(!failed.ok);assert.equal(failed.checks.length,1);assert.equal(failed.checks[0].code,'AUTH');
 for(let i=0;i<150;i++)api.record({provider:'fixture',code:'OK',ok:true});assert.equal(api.snapshot().events.length,120);
 console.log('AI_API_OK: HTTP errors, redaction, timeout/network, malformed JSON, empty thinking recovery, bounded retry, no image replay, tool output, probe auth failure, cooldown and concurrency. Providers simulated.');
 }finally{global.fetch=nativeFetch;}})().catch(e=>{console.error(e);process.exitCode=1});
