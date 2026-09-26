'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const start = source.indexOf('const KBL_PROMPT_CONSULT_SCHEMA=');
const end = source.indexOf('// KBL PROMPT AI · DEEPSEEK AUTO MODEL DISCOVERY SAFE.', start);
assert(start >= 0 && end > start);
const adapter = source.slice(start, end);

async function scenario({images=[],dedicatedFree=false,geminiStatus=402,deepSeekStatus=200,enabled=true}={}) {
  const calls=[];
  const ctx={
    AbortController, setTimeout, clearTimeout,
    GEMINI_TEXT_API_KEY:dedicatedFree?'free-project':'paid-project',GEMINI_API_KEY:'paid-project',
    DEEPSEEK_API_KEY:'fixture-deepseek',KBL_PROMPT_DEEPSEEK_BASE:'https://api.deepseek.com',
    KBL_PROMPT_DEEPSEEK_CONSULT_FALLBACK:enabled,
    KBL_AI_V3_GOOGLE_SEARCH_ENABLED:false,KBL_AI_MASTER_CONTRACT:'Keep verified facts only.',
    kblPromptGeminiCandidates:async()=>['gemini-3.8-flash','gemini-3.7-flash'],
    kblPromptImages:x=>x,kblPromptHistory:()=>[],kblPromptProfileText:()=>'',
    kblPromptBusinessContextText:()=>'',kblPromptText:(x,n)=>String(x||'').slice(0,n),
    kblAiV61NeedsFreshWeb:()=>false,plainVietnamese:x=>String(x||''),
    number:x=>Number(x)||0,cleanLabelText:x=>String(x||''),
    geminiTextGenerationConfig:(_model,settings)=>settings,
    geminiResponseText:data=>data.text,kblPromptBriefPromptCount:()=>1,
    kblPromptGeminiCache:{selected:''},kblPromptDeepSeekRuntimeModel:()=> 'deepseek-flash',
    kblAiFetch:async(url,opts)=>{
      const isGemini=url.includes('googleapis.com');
      calls.push({url,body:JSON.parse(opts.body)});
      if(isGemini)return new Response(JSON.stringify(geminiStatus===200?{text:JSON.stringify({reply:'Gemini OK',brief:{},suggestions:[]})}:{error:{message:'Your prepayment credits are depleted.'}}),{status:geminiStatus});
      return new Response(JSON.stringify(deepSeekStatus===200?{choices:[{message:{content:JSON.stringify({reply:'DeepSeek OK',brief:{},suggestions:[],ready:false})}}],usage:{prompt_tokens:120,completion_tokens:60,total_tokens:180}}:{error:{message:'DeepSeek balance depleted.'}}),{status:deepSeekStatus});
    }
  };
  const run=vm.runInNewContext(adapter+'\nkblPromptGeminiConsult',ctx);
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

  const image=await scenario({images:[{mimeType:'image/png',data:'fixture'}]});
  assert.match(image.error.message,/chưa đọc được ảnh/);
  assert.equal(image.calls.length,1,'image data must not be sent to text fallback');

  const free=await scenario({dedicatedFree:true});
  assert.match(free.error.message,/DeepSeek dự phòng chưa sẵn sàng/);
  assert.equal(free.calls.length,1,'separate Free key must not spend DeepSeek');

  const disabled=await scenario({enabled:false});
  assert.equal(disabled.calls.length,1);
  assert.match(disabled.error.message,/Gemini hết số dư/);

  const depleted=await scenario({deepSeekStatus:402});
  assert.equal(depleted.calls.length,2,'failed fallback must not loop through more paid models');
  assert.match(depleted.error.message,/DeepSeek balance depleted/);

  const html=fs.readFileSync(path.join(__dirname,'../views/taoprompt.html'),'utf8');
  assert.match(html,/addBubble\(mode,'assistant',e.message\)/,'Prompt UI must keep the upstream error visible');
  console.log('PROMPT_AI_BILLING_OK: 402 consult fallback is bounded, image-safe and Free-project-safe');
})().catch(error=>{console.error(error);process.exitCode=1});
