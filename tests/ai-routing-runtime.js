'use strict';
// Real Express routes and provider adapters. External providers are fixtures;
// no production keys, customer records, uploads, orders or social posts are used.
const fs=require('fs'),path=require('path'),os=require('os'),Module=require('module'),assert=require('assert');
const {spawnSync}=require('child_process');
const mode=process.argv[2];
if(!mode){
  for(const scenario of ['no-keys','providers']){
    const child=spawnSync(process.execPath,[__filename,scenario],{encoding:'utf8',timeout:60000});
    if(child.status!==0){process.stderr.write(child.stdout||'');process.stderr.write(child.stderr||'');throw child.error||Error('AI routing failed: '+scenario)}
    console.log(child.stdout.split('\n').filter(x=>x.startsWith('AI_ROUTING_OK')).join('\n'));
  }
}else{
  const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kbl-ai-routing-')),pub=path.join(tmp,'public'),data=path.join(tmp,'data');
  fs.mkdirSync(pub);fs.mkdirSync(data);
  fs.mkdirSync(path.join(data,'ai-knowledge'));
  fs.writeFileSync(path.join(data,'ai-knowledge/kbl-store-policies.json'),JSON.stringify([{id:'fixture-policy',sourceFile:'fixture-policy.html',heading:'Bảo hành',topics:['warranty'],text:'Chính sách bảo hành kiểm thử: mang sản phẩm và phiếu bảo hành đến tiệm để kiểm tra.'}]));
  const hasKeys=mode==='providers';
  Object.assign(process.env,{KBL_DATA_DIR:data,PORT:'0',HOST:'127.0.0.1',KBL_ADMIN_TOKEN:'R'.repeat(40),KBL_AI_MASTER_ENABLED:'0',KBL_GOLD_INTEL_ENABLED:'0',KBL_GEMINI_AUTO_MODEL_ENABLED:'1',KBL_PROMPT_DEEPSEEK_AUTO_MODEL_ENABLED:'1',KBL_GEMINI_API_KEY:hasKeys?'fixture-gemini':'',GEMINI_API_KEY:'',DEEPSEEK_API_KEY:hasKeys?'fixture-deepseek':'',KBL_DEEPSEEK_API_KEY:'',OPENAI_API_KEY:hasKeys?'fixture-openai':'',KBL_OPENAI_API_KEY:'',KBL_PUBLIC_BASE_URL:'https://tiemvangkimbaolam.id.vn'});
  fs.writeFileSync(path.join(data,'growth-autopilot-v1.json'),JSON.stringify({settings:{enabled:false,autoPublishPosts:false,autoImages:false,autoMarket:false}}));
  fs.writeFileSync(path.join(data,'growth-autopilot-full-auto-v1.2.7.json'),JSON.stringify({appliedAt:new Date().toISOString()}));
  const nativeFetch=global.fetch,calls=[],failures=[];let providerDown=false,deepseekProbeDown=false,nextJson=null;
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
  function example(schema){if(schema.enum)return schema.enum[0];if(schema.type==='object')return Object.fromEntries(Object.entries(schema.properties||{}).map(([k,v])=>[k,example(v)]));if(schema.type==='array')return [];if(schema.type==='number'||schema.type==='integer')return 0;if(schema.type==='boolean')return false;return ''}
  global.fetch=async(url,opts={})=>{
    const u=new URL(String(url));if(u.hostname==='127.0.0.1')return nativeFetch(url,opts);
    if(!['generativelanguage.googleapis.com','api.deepseek.com','api.openai.com'].includes(u.hostname))throw Error('Offline audit blocks '+u.hostname);
    calls.push({host:u.hostname,path:u.pathname,body:opts.body?JSON.parse(opts.body):null});
    if(u.hostname==='api.openai.com'){
      const schema=JSON.parse(opts.body).text.format.schema;
      function strict(s){if(!s||typeof s!=='object')return;if(s.type==='object'){assert.equal(s.additionalProperties,false,'Strict OpenAI objects must prohibit extra fields');assert.deepEqual([...(s.required||[])].sort(),Object.keys(s.properties||{}).sort())}Object.values(s).forEach(v=>{if(Array.isArray(v))v.forEach(strict);else strict(v)})}
      try{strict(schema)}catch(error){return json({error:{message:error.message}},400)}
      return json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(example(schema))}]}]});
    }
    if(providerDown)return json({error:{message:'Fixture key rejected'}},401);
    if(u.hostname==='api.deepseek.com'){
      if(u.pathname==='/models')return json({data:[{id:'deepseek-v4-flash'}]});
      if(deepseekProbeDown)return json({error:{message:'Fixture chat unavailable'}},403);
      return json({choices:[{message:{content:'KBL_OK'}}]});
    }
    if(u.pathname==='/v1beta/models')return json({models:[{name:'models/gemini-3.7-flash',supportedGenerationMethods:['generateContent']}]});
    if(u.pathname.endsWith('/interactions'))return json({error:{message:'Fixture forces GenerateContent image fallback'}},404);
    const body=JSON.parse(opts.body),allowed=new Set(['contents','system_instruction','systemInstruction','tools','toolConfig','safetySettings','generationConfig','cachedContent','serviceTier','store']);
    for(const key of Object.keys(body))assert(allowed.has(key),'Unknown GenerateContent field '+key);
    assert(Array.isArray(body.contents)&&body.contents.length);
    if(body.generationConfig?.responseModalities?.includes('IMAGE')){
      assert(u.pathname.startsWith('/v1beta/models/'));
      assert(!body.generationConfig.responseFormat,'legacy image responseFormat must not receive aspect ratio strings');
      assert(['3:4','4:5'].includes(body.generationConfig.imageConfig?.aspectRatio));
      return json({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:Buffer.from('fixture-image'.repeat(40)).toString('base64')}}]}}]});
    }
    assert(!JSON.stringify(body.generationConfig?.responseSchema||{}).includes('additionalProperties'));
    const value=nextJson||(body.generationConfig?.responseSchema?example(body.generationConfig.responseSchema):null);nextJson=null;
    const answer=value?JSON.stringify(value):'Trang sức cần được vệ sinh nhẹ nhàng bằng khăn mềm.';
    const half=Math.floor(answer.length/2);
    return json({candidates:[{content:{role:'model',parts:[{thought:true,text:'INTERNAL_FIXTURE_THOUGHT'},{text:answer.slice(0,half)},{text:answer.slice(half)}]},groundingMetadata:{groundingChunks:[{web:{uri:'https://example.com/fixture',title:'Offline fixture'}}]}}]});
  };
  let app;
  async function check(name,fn){try{await fn()}catch(error){failures.push(name+': '+error.message)}}
  (async()=>{try{
    const filename=path.join(root,'app.js'),source=fs.readFileSync(filename,'utf8').replace("const PUBLIC_DIR = path.join(ROOT, 'public');",'const PUBLIC_DIR = '+JSON.stringify(pub)+';');
    const expose=`\nmodule.exports.audit={studioImage:kblGeminiStudioGenerate,tryOn:geminiTryOnImage,text:geminiResponseText,json:geminiGenerateJson,master:kblMasterGenerateJson,seed(){prices.price_sell_610=8000000;products=[{id:'small',sku:'AUDIT-1',weightChi:.25},{id:'large',sku:'AUDIT-2',weightChi:1},{id:'sold',sku:'AUDIT-3',weightChi:1,status:'sold'}].map(p=>({name:'Nhẫn kiểm thử',kind:'current',status:'available',publicationStatus:'published',category:'ring',goldCode:'610',image:'/images/fixture.png',...p}))}};`;
    const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(root);m._compile(source+expose,filename);app=m.exports;
    if(!app.server.listening)await new Promise(r=>app.server.once('listening',r));app.audit.seed();
    const base='http://127.0.0.1:'+app.server.address().port;
    async function request(url,body,admin=true){const r=await nativeFetch(base+url,{method:body===undefined?'GET':'POST',headers:{...(admin?{'x-kbl-admin-token':process.env.KBL_ADMIN_TOKEN}:{}),'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});return {status:r.status,body:await r.json()}}
    await check('admin auth',async()=>assert.equal((await request('/api/admin/ai-master/status',undefined,false)).status,401));
    await check('diagnostics require admin',async()=>{for(const body of [undefined,{}])assert.equal((await request('/api/admin/ai-api/'+(body?'probe':'status'),body,false)).status,401)});
    await check('diagnostics no secret',async()=>{const r=await request('/api/admin/ai-api/status');assert.equal(r.status,200);assert.equal(r.body.diagnostics.release,'1.3.11-ai-api-recovery');assert(!JSON.stringify(r.body).includes('fixture-gemini'));assert.equal(r.body.diagnostics.providers.find(x=>x.id==='gemini').configured,hasKeys)});
    await check('empty adviser input',async()=>assert.equal((await request('/api/adviser/recommend',{message:''},false)).status,400));
    await check('inventory budget and sold exclusion',async()=>{const r=await request('/api/adviser/recommend',{message:'Tìm nhẫn vàng 610 trên 4 triệu'},false);assert.equal(r.status,200);assert.equal(r.body.mode,'product');assert(r.body.products.length>0,JSON.stringify(r.body));assert(r.body.products.every(p=>p.id==='large'),JSON.stringify(r.body.products))});
    await check('topic change to published policy',async()=>{const r=await request('/api/adviser/recommend',{message:'Chính sách bảo hành của tiệm thế nào?',context:['Tìm nhẫn trên 4 triệu']},false);assert.equal(r.status,200);assert.equal(r.body.mode,'policy');assert(r.body.policySources.length>0);assert.deepEqual(r.body.products,[])});
    await check('thought filtering and multipart text',async()=>assert.equal(app.audit.text({candidates:[{content:{parts:[{text:'hidden',thought:true},{text:'A'},{text:'B'}]}},{content:{parts:[{text:'other candidate'}]}}]}),'AB'));
    if(hasKeys){
      const schema={type:'object',additionalProperties:false,properties:{answer:{type:'string'}},required:['answer']};
      await check('Studio and Try-on GenerateContent contract',async()=>{const ref={mimeType:'image/png',data:Buffer.from('source-image'.repeat(40)).toString('base64')};assert((await app.audit.studioImage([ref],'Fixture poster','4:5')).ok);assert((await app.audit.tryOn(ref,ref,'ring',{name:'Fixture',sku:'SKU-1'},'3:4')).success)});
      await check('shared JSON adapter',async()=>{nextJson={answer:'complete answer'};const result=await app.audit.json('Fixture','Fixture',schema);assert.equal(result?.data?.answer,'complete answer')});
      await check('AI Master and Sales text adapter',async()=>{nextJson={answer:'master answer'};const result=await app.audit.master('Fixture','Fixture',schema,{stage:'offline-audit'});assert.equal(result?.data?.answer,'master answer')});
      await check('Gemini verified refresh',async()=>{const r=await request('/api/admin/ai-master/model-refresh',{});assert.equal(r.status,200);assert(r.body.success);assert.equal(r.body.model.status,'ready')});
      await check('DeepSeek verified refresh',async()=>{const r=await request('/api/admin/prompt-ai/deepseek-refresh',{});assert.equal(r.status,200);assert(r.body.success);assert(r.body.state.probeCount>0)});
      await check('manual DeepSeek refresh probes unchanged model',async()=>{deepseekProbeDown=true;const before=calls.filter(c=>c.path==='/chat/completions').length;const r=await request('/api/admin/prompt-ai/deepseek-refresh',{});assert(calls.filter(c=>c.path==='/chat/completions').length>before,'manual refresh skipped chat probe');assert.equal(r.body.success,false);assert.equal(r.status,502)});
      providerDown=true;
      await check('Sales Studio OpenAI fallback schema',async()=>{const studio=require('../modules/kbl-studio-ai').createAI({generateText:app.audit.master});for(const kind of ['ideas','pack','captions']){const result=await studio.text(kind,{});assert(result.data);assert(calls.some(c=>c.host==='api.openai.com'))}});
      await check('Gemini stale verification is not current success',async()=>{const r=await request('/api/admin/ai-master/model-refresh',{});assert.equal(r.body.model.status,'degraded');assert.equal(r.body.success,false);assert.equal(r.status,502)});
      await check('Gemini discovery error is not success',async()=>{const r=await request('/api/admin/prompt-ai/gemini-refresh',{});assert.equal(r.body.success,false);assert.equal(r.status,502);assert(r.body.message.includes('Fixture key rejected'))});
    }else{
      for(const url of ['/api/admin/ai-master/model-refresh','/api/admin/prompt-ai/gemini-refresh','/api/admin/prompt-ai/deepseek-refresh'])await check('missing key '+url,async()=>{const r=await request(url,{});assert.equal(r.body.success,false);assert.equal(r.status,503)});
    }
    await check('honest adviser outage',async()=>{const r=await request('/api/adviser/recommend',{message:'Viết giúp tôi một câu chúc sinh nhật ngắn cho người bạn thích mèo.'},false);assert.equal(r.status,503,JSON.stringify(r.body));assert.equal(r.body.code,'AI_PROVIDER_UNAVAILABLE');assert.equal(r.body.success,false)});
    if(failures.length)throw Error(failures.join('\n'));
    console.log('AI_ROUTING_OK '+mode+': auth, adviser inventory/policy, provider adapters and honest refresh states; external providers simulated');
  }finally{if(app)app.closeServer();global.fetch=nativeFetch;fs.rmSync(tmp,{recursive:true,force:true})}})().then(()=>process.exit(0),e=>{console.error(e.stack);process.exit(1)});
}
