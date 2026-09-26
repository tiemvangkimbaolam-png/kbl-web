'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { matchesSchema } = require('../modules/kbl-deepseek-json');

const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const start = source.indexOf('const KBL_PROMPT_CONSULT_SCHEMA=');
const end = source.indexOf('// KBL PROMPT AI · DEEPSEEK AUTO MODEL DISCOVERY SAFE.', start);
assert(start >= 0 && end > start);
const adapter = source.slice(start, end);
function schemaFixture(schema){
  if(schema.type==='object')return Object.fromEntries(Object.entries(schema.properties||{}).map(([key,value])=>[key,schemaFixture(value)]));
  if(schema.type==='array')return [];
  if(schema.type==='boolean')return false;
  if(schema.type==='integer'||schema.type==='number')return 1;
  return 'fixture';
}

async function scenario({images=[],dedicatedFree=false,geminiStatus=402,deepSeekStatus=200,enabled=true,expertEnabled=true,escalate=false,deepSeekKey=true}={}) {
  const calls=[];
  let reply;
  const ctx={
    AbortController, setTimeout, clearTimeout,
    GEMINI_TEXT_API_KEY:dedicatedFree?'free-project':'paid-project',GEMINI_API_KEY:'paid-project',
    DEEPSEEK_API_KEY:deepSeekKey?'fixture-deepseek':'',KBL_PROMPT_DEEPSEEK_BASE:'https://api.deepseek.com',
    KBL_PROMPT_DEEPSEEK_CONSULT_FALLBACK:enabled,
    KBL_PROMPT_DEEPSEEK_EXPERT_FALLBACK:expertEnabled,
    KBL_AI_V3_GOOGLE_SEARCH_ENABLED:false,KBL_AI_MASTER_CONTRACT:'Keep verified facts only.',
    kblPromptGeminiCandidates:async()=>['gemini-3.8-flash','gemini-3.7-flash'],
    kblPromptImages:x=>x,kblPromptHistory:()=>[],kblPromptProfileText:()=>'',
    kblPromptBusinessContextText:()=>'',kblPromptText:(x,n)=>String(x||'').slice(0,n),
    kblAiV61NeedsFreshWeb:()=>false,plainVietnamese:x=>String(x||''),
    number:x=>Number(x)||0,cleanLabelText:x=>String(x||''),
    matchesSchema,
    geminiTextGenerationConfig:(_model,settings)=>settings,
    geminiResponseText:data=>data.text,kblPromptBriefPromptCount:()=>1,
    kblPromptGeminiCache:{selected:''},kblPromptDeepSeekRuntimeModel:()=> 'deepseek-flash',
    kblAiFetch:async(url,opts)=>{
      const isGemini=url.includes('googleapis.com');
      calls.push({url,body:JSON.parse(opts.body)});
      if(isGemini)return new Response(JSON.stringify(geminiStatus===200?{text:JSON.stringify({...reply,reply:'Gemini OK'})}:{error:{message:'Your prepayment credits are depleted.'}}),{status:geminiStatus});
      return new Response(JSON.stringify(deepSeekStatus===200?{choices:[{message:{content:JSON.stringify({...reply,reply:'DeepSeek OK',escalateToDeepSeek:false,escalationReason:''})}}],usage:{prompt_tokens:120,completion_tokens:60,total_tokens:180}}:{error:{message:'DeepSeek balance depleted.'}}),{status:deepSeekStatus});
    }
  };
  const {run,schema}=vm.runInNewContext(adapter+'\n({run:kblPromptGeminiConsult,schema:KBL_PROMPT_CONSULT_SCHEMA})',ctx);
  reply=schemaFixture(schema);
  reply.escalateToDeepSeek=escalate;reply.escalationReason=escalate?'Cần phân tích chiến lược chuyên sâu.':'';
  assert(matchesSchema(reply,schema));
  const args={mode:'image',message:'Tư vấn bài đăng',history:[],profile:{},images,businessContext:{}};
  try{return {result:await run(args),calls}}catch(error){return {error,calls}}
}

(async()=>{
  const textFallback=await scenario();
  assert.equal(textFallback.result.result.reply,'DeepSeek OK');
  assert.equal(textFallback.result.model,'deepseek-fallback:deepseek-flash');
  assert.equal(textFallback.result.usage.total_tokens,180);
  assert.equal(textFallback.calls.length,2,'one Gemini 402 and one DeepSeek call');
  assert.equal(textFallback.calls[1].body.thinking.type,'disabled');
  assert.equal(textFallback.calls[1].body.response_format.type,'json_object');

  const geminiHealthy=await scenario({geminiStatus:200});
  assert.equal(geminiHealthy.result.result.reply,'Gemini OK');
  assert.equal(geminiHealthy.calls.length,1,'healthy Gemini must not call DeepSeek');

  const expert=await scenario({geminiStatus:200,dedicatedFree:true,escalate:true,images:[{mimeType:'image/png',data:'AAAA'}]});
  assert.equal(expert.result.result.reply,'DeepSeek OK');
  assert.equal(expert.calls.length,2,'a difficult request escalates once even with a Free Gemini key');
  assert.match(expert.calls[1].body.messages[1].content[0].text,/Cần phân tích chiến lược chuyên sâu/);
  assert.equal(expert.calls[1].body.messages[1].content[1].image_url.url,'data:image/png;base64,AAAA');
  assert(expert.calls.every(x=>/generateContent|chat\/completions/.test(x.url)),'consultation must only call text/vision chat APIs');

  const missingExpert=await scenario({geminiStatus:200,escalate:true,deepSeekKey:false});
  assert.equal(missingExpert.calls.length,1);
  assert.match(missingExpert.error.message,/DeepSeek chưa sẵn sàng/);
  const expertFailed=await scenario({geminiStatus:200,escalate:true,deepSeekStatus:402});
  assert.equal(expertFailed.calls.length,2);
  assert.match(expertFailed.error.message,/DeepSeek chưa thể hỗ trợ yêu cầu chuyên sâu/);
  assert.doesNotMatch(expertFailed.error.message,/Gemini hết số dư/);

  const image=await scenario({images:[{mimeType:'image/png',data:'AAAA'}]});
  assert.equal(image.result.result.reply,'DeepSeek OK');
  assert.equal(image.result.model,'deepseek-fallback:deepseek-flash');
  assert.equal(image.calls.length,2,'image consultation uses one Flash vision request after Gemini 402');
  assert.equal(image.calls[1].body.messages[1].content[1].image_url.url,'data:image/png;base64,AAAA');
  assert.equal(image.calls[1].body.messages[1].content[1].image_url.detail,'high');

  const free=await scenario({dedicatedFree:true});
  assert.match(free.error.message,/DeepSeek dự phòng chưa sẵn sàng/);
  assert.equal(free.calls.length,1,'separate Free key must not spend DeepSeek');
  const freeImage=await scenario({dedicatedFree:true,images:[{mimeType:'image/png',data:'AAAA'}]});
  assert.equal(freeImage.calls.length,1,'Free key image failure must not spend DeepSeek');

  const disabled=await scenario({enabled:false});
  assert.equal(disabled.calls.length,1);
  assert.match(disabled.error.message,/Gemini hết số dư/);

  const depleted=await scenario({deepSeekStatus:402});
  assert.equal(depleted.calls.length,2,'failed fallback must not loop through more paid models');
  assert.match(depleted.error.message,/DeepSeek balance depleted/);

  const html=fs.readFileSync(path.join(__dirname,'../views/taoprompt.html'),'utf8');
  assert.match(html,/addBubble\(mode,'assistant',e.message\)/,'Prompt UI must keep the upstream error visible');
  console.log('PROMPT_AI_BILLING_OK: text/vision consultation, expert escalation and bounded 402 fallback');
})().catch(error=>{console.error(error);process.exitCode=1});
