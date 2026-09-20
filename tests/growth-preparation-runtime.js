'use strict';
// Real app state normalization, persistence, composer, QR decoder and HTTP router.
// Only external image/vision providers and HTTPS media transport use fixtures.
const fs=require('fs'),path=require('path'),os=require('os'),Module=require('module'),assert=require('assert');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kbl-prep-test-')),pub=path.join(tmp,'public'),data=path.join(tmp,'data');
const withoutSharp=process.argv.includes('--without-sharp'),fixtureSharp=require(path.join(root,'vendor/sharp')),nativeModuleLoad=Module._load;
if(withoutSharp)Module._load=function(request,parent,isMain){if(request==='sharp'||String(request).includes('vendor/sharp')){const error=new Error('Native Sharp unavailable on hosting fixture');error.code='ERR_DLOPEN_FAILED';throw error}return nativeModuleLoad.call(this,request,parent,isMain)};
fs.mkdirSync(data,{recursive:true});fs.mkdirSync(path.join(pub,'images','kbl-growth'),{recursive:true});
for(const name of ['kbl-logo-production.png','kbl-website-qr.png'])fs.copyFileSync(path.join(root,'public/images/kbl-growth',name),path.join(pub,'images/kbl-growth',name));
fs.writeFileSync(path.join(data,'growth-autopilot-v1.json'),JSON.stringify({settings:{enabled:false,autoPublishPosts:false,autoImages:true,autoMarket:false,maxAiImagesPerDay:12}}));
fs.writeFileSync(path.join(data,'growth-autopilot-full-auto-v1.2.7.json'),JSON.stringify({appliedAt:new Date().toISOString()}));
Object.assign(process.env,{KBL_DATA_DIR:data,KBL_AI_MASTER_ENABLED:'0',KBL_GOLD_INTEL_ENABLED:'0',KBL_GEMINI_AUTO_MODEL_ENABLED:'0',KBL_PROMPT_DEEPSEEK_AUTO_MODEL_ENABLED:'0',KBL_GEMINI_API_KEY:'fixture-key-not-a-real-key',KBL_ADMIN_TOKEN:'T'.repeat(40),KBL_PUBLIC_BASE_URL:'https://tiemvangkimbaolam.id.vn',PORT:'0',HOST:'127.0.0.1'});
const nativeFetch=global.fetch;let generationCalls=0,visionCalls=0,failAt=2,blockMedia=false,dispatches=0,app;
global.fetch=async(url,options)=>{
  const u=new URL(String(url));
  if(u.hostname==='127.0.0.1')return nativeFetch(url,options);
  if(u.hostname==='tiemvangkimbaolam.id.vn'){
    const file=path.resolve(pub,'.'+u.pathname);if(!file.startsWith(pub+path.sep))throw Error('Unsafe fixture path');
    if(blockMedia||!fs.existsSync(file))return new Response('',{status:503});
    return new Response(fs.readFileSync(file),{status:200,headers:{'content-type':'image/png'}});
  }
  throw Error('Unexpected external request in offline test: '+u.hostname);
};
const source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace("const PUBLIC_DIR = path.join(ROOT, 'public');",'const PUBLIC_DIR = '+JSON.stringify(pub)+';');
const injection=`
module.exports.growthTest={
 get state(){return kblGrowthState},get products(){return products},get file(){return KBL_GROWTH_AUTOPILOT_FILE},
 seed(rows){products=rows;prices.price_sell_610=8000000;kblGrowthState.queue=['facebook','instagram'].map(platform=>({id:'fixture-'+platform,campaignId:'fixture',platform,productIds:rows.map(x=>x.id),skus:rows.map(x=>x.sku),products:rows,status:'scheduled',dueAt:new Date(Date.now()+3600000).toISOString(),qa:{approved:true},ideaReview:{approved:true}}));kblGrowthSave()},
 save:kblGrowthSave,prepare:kblGrowthPrepareCampaign,pending:kblGrowthPreparePending,public:kblGrowthPreparedPostsPublic,
 ready:kblGrowthIsReady,refresh:kblGrowthRefreshPreparedPriceLayer,qr:kblGrowthPrepQrQa,publish:kblGrowthPublishDue,
 composer:kblGrowthPosterRuntimeStatus,
 markSharpBlocked(){for(const row of kblGrowthState.queue){row.status='prep-blocked';row.preparationError='Chưa có bộ ghép ảnh Sharp.'}kblGrowthSave()},
 changePrice(value=9000000){prices.price_sell_610=value},
 rejectRefreshAfterSave(){const original=kblGrowthRefreshPreparedPriceLayer;kblGrowthRefreshPreparedPriceLayer=async(bundle,prep)=>{kblGrowthSave();return {...prep,ready:false,brandedReady:false,message:'Fixture changed facts'}};return ()=>{kblGrowthRefreshPreparedPriceLayer=original}},
 changePriceDuringReview(){const original=kblGrowthDesignReviewOne;let changed=false;kblGrowthDesignReviewOne=async(...args)=>{const result=await original(...args);if(!changed){changed=true;prices.price_sell_610=10000000}return result};return ()=>{kblGrowthDesignReviewOne=original}},
 install(generator,review,store){kblGeminiStudioGenerate=generator;kblGrowthDesignReviewOne=review;kblGrowthStorePosterFacts=()=>store},
 forceDue(){for(const r of kblGrowthState.queue)r.dueAt=new Date(Date.now()-1000).toISOString();kblGrowthState.settings.autoPublishPosts=true;kblGrowthSave()},
 stubDispatch(callback){publisherPreflightRunItem=()=>({status:'queued'});publisherQueueRun=(req,run,platforms,payload)=>{callback(payload());};kblGrowthLastDispatchAt=()=>0;}
};`;
(async()=>{
 try{
  const m=new Module(path.join(root,'app.js'),module);m.filename=path.join(root,'app.js');m.paths=Module._nodeModulePaths(root);m._compile(source+injection,m.filename);app=m.exports;
  if(!app.server.listening)await new Promise(resolve=>app.server.once('listening',resolve));
  const api=app.growthTest,sharp=fixtureSharp;
  const base=await sharp({create:{width:1080,height:1350,channels:3,background:'#94422f'}}).png().toBuffer();
  fs.writeFileSync(path.join(pub,'images','fixture.png'),base);
  const store={name:'KBL — KIỂM THỬ',website:'https://tiemvangkimbaolam.id.vn',websiteHost:'tiemvangkimbaolam.id.vn',phone:'0000000000',address:'Địa chỉ giả lập để kiểm thử bố cục, không dùng để đăng'};
  api.install(async()=>{generationCalls++;await new Promise(r=>setTimeout(r,10));if(generationCalls===failAt)return {ok:false,error:'HTTP 429 — fixture quota'};return {ok:true,image:{mimeType:'image/png',data:base.toString('base64')}}},async()=>{visionCalls++;return {approved:true,score:95,model:'fixture-review',reason:'Fixture review'}},store);
  const rows=[1,2,3].map(i=>({id:'fixture-'+i,sku:'TEST-'+i,name:'Sản phẩm kiểm thử '+i,kind:'current',status:'available',publicationStatus:'published',goldCode:'610',weightChi:1.234,sizeLabel:'12',image:'/images/fixture.png'}));
  api.seed(rows);const old=api.state.queue[0];api.save();assert.notStrictEqual(api.state.queue[0],old,'Fixture must exercise real cloned queue state');
  let result;
  if(withoutSharp){await require(path.join(root,'modules/kbl-growth-poster')).ensureComposer(null);api.markSharpBlocked();assert.equal(await api.pending(),1,'Old Sharp-blocked campaign should recover automatically');result={ok:api.state.queue[0].status==='ready'};assert.equal(api.composer().engine,'wasm-deterministic');}
  else result=await api.prepare('fixture');
  assert(!result.ok);assert.equal(generationCalls,2);assert.equal(api.state.queue[0].status,'retry-wait');
  assert(api.state.queue[0].preparationError.includes('429'));assert(api.state.queue[0].preparedPost.posterResults[0].posterImage);
  assert(!api.public()[0].ready);assert(api.public()[0].nextPreparationAt);
  assert.equal(await api.pending(),0,'Backoff must skip this campaign');
  const failedState=JSON.parse(fs.readFileSync(api.file));assert.equal(failedState.queue[0].status,'retry-wait');
  for(const asset of Object.values(api.state.assets))asset.nextRetryAt='';for(const r of api.state.queue)r.nextPreparationAt='';api.save();
  const concurrent=await Promise.all([api.prepare('fixture'),api.prepare('fixture')]);
  assert(concurrent.every(x=>x.ok));assert.equal(generationCalls,4,'Resume must reuse first generated image');
  assert.equal(visionCalls,3);assert(api.state.queue.every(r=>r.status==='ready'&&api.ready(r.preparedPost)));
  const disk=JSON.parse(fs.readFileSync(api.file));assert(disk.queue.every(r=>r.preparedPost.ready&&r.preparedPost.posterUrls.length===3),'READY must survive actual save');
  const readyPrep=api.state.queue[0].preparedPost;
  await api.prepare('fixture');assert.equal(generationCalls,4,'Ready retry must be idempotent');
  api.changePrice();const restoreReview=api.changePriceDuringReview();const changedDuringReview=await api.refresh(rows,readyPrep);restoreReview();assert(!api.ready(changedDuringReview),'A concurrent price update must invalidate the in-flight review');
  const refreshed=await api.refresh(rows,readyPrep);assert(api.ready(refreshed));assert.equal(generationCalls,4);assert.notEqual(refreshed.priceSnapshots[0].priceVnd,readyPrep.priceSnapshots[0].priceVnd);
  assert(refreshed.posterResults.every(x=>x.qrQa.approved));
  for(const r of api.state.queue)r.preparedPost=refreshed;api.save();
  const url='http://127.0.0.1:'+app.server.address().port+'/api/admin/growth-autopilot/prepare';
  let response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"campaignId":"fixture"}'});assert.equal(response.status,401);
  response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-kbl-admin-token':'T'.repeat(40)},body:'{"campaignId":"missing"}'});assert.equal(response.status,404);assert((await response.json()).message.includes('bộ ảnh'));
  response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-kbl-admin-token':'T'.repeat(40)},body:'{"campaignId":"fixture"}'});assert.equal(response.status,202);await api.prepare('fixture');assert.equal(generationCalls,4);
  // Rejected QR must block before spending more image calls.
  store.website='https://wrong.example/';assert(!(await api.qr()).approved);store.website='https://tiemvangkimbaolam.id.vn';
  // A legacy fallback must never be dispatched as a fully-approved poster.
  const approved=api.state.queue[0].preparedPost;
  api.forceDue();api.stubDispatch(()=>dispatches++);
  const restoreRefresh=api.rejectRefreshAfterSave();await api.publish();restoreRefresh();
  assert.equal(dispatches,0);assert.equal(api.state.queue[0].status,'retry-wait','Failed revalidation must update the current normalized row');
  assert.equal(JSON.parse(fs.readFileSync(api.file)).queue[0].status,'retry-wait');
  for(const r of api.state.queue){r.preparedPost={...approved,ready:true,brandedReady:false,mode:'clean-fallback'};r.status='fallback-ready';}
  api.forceDue();api.stubDispatch(()=>dispatches++);await api.publish();assert.equal(dispatches,0);
  for(const r of api.state.queue){r.preparedPost=approved;r.status='ready';}api.save();
  const dispatchResults=await Promise.all([api.publish(),api.publish()]);assert.equal(dispatches,1,'Concurrent dispatch calls must share one run');
  assert(dispatchResults.every(x=>x.count===1));
  // Verify the final poster bytes, not merely the original QR asset.
  const tools=require(path.join(root,'modules/kbl-growth-poster'));
  const finalPath=path.join(pub,approved.posterImages[0]);const scan=await tools.scan(sharp,fs.readFileSync(finalPath),store.website);assert(scan.approved);
  if(process.env.KBL_TEST_ARTIFACT_DIR){fs.mkdirSync(process.env.KBL_TEST_ARTIFACT_DIR,{recursive:true});fs.copyFileSync(finalPath,path.join(process.env.KBL_TEST_ARTIFACT_DIR,'poster-layout-fixture.png'));fs.writeFileSync(path.join(process.env.KBL_TEST_ARTIFACT_DIR,'state.json'),JSON.stringify({failed:failedState,ready:disk},null,2));}
  if(withoutSharp)assert((await tools.scan(null,fs.readFileSync(finalPath),store.website)).approved);
  console.log('GROWTH_PREPARATION_RUNTIME_OK '+(withoutSharp?'WITHOUT_SHARP (auto-recovery + WASM)':'native')+': actual-save + partial-resume + concurrency + backoff + QR-final + price-refresh + HTTP-auth + strict-dispatch');
 }finally{if(app)app.closeServer();global.fetch=nativeFetch;Module._load=nativeModuleLoad;fs.rmSync(tmp,{recursive:true,force:true});}
})().then(()=>process.exit(0),error=>{console.error(error.stack||error);process.exit(1)});
