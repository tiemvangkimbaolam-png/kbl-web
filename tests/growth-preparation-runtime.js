'use strict';
// V1.3.8 Availability-First integration test.
// Real app state normalization, persistence, deterministic composer, QR decoder,
// scheduler dispatch and admin route. Only Gemini/vision and public HTTPS transport
// are fixtures; no real social post is created by this test.
const fs=require('fs'),path=require('path'),os=require('os'),Module=require('module'),assert=require('assert');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kbl-prep-v138-')),pub=path.join(tmp,'public'),data=path.join(tmp,'data');
fs.mkdirSync(data,{recursive:true});fs.mkdirSync(path.join(pub,'images','kbl-growth'),{recursive:true});
for(const name of ['kbl-logo-production.png','kbl-website-qr.png'])fs.copyFileSync(path.join(root,'public/images/kbl-growth',name),path.join(pub,'images/kbl-growth',name));
fs.writeFileSync(path.join(data,'growth-autopilot-v1.json'),JSON.stringify({settings:{enabled:false,autoPublishPosts:false,autoImages:false,autoMarket:false,maxAiImagesPerDay:12,minGapMinutes:30,samePlatformGapMinutes:120}}));
fs.writeFileSync(path.join(data,'growth-autopilot-full-auto-v1.2.7.json'),JSON.stringify({appliedAt:new Date().toISOString()}));
Object.assign(process.env,{KBL_DATA_DIR:data,KBL_AI_MASTER_ENABLED:'0',KBL_GOLD_INTEL_ENABLED:'0',KBL_GEMINI_AUTO_MODEL_ENABLED:'0',KBL_PROMPT_DEEPSEEK_AUTO_MODEL_ENABLED:'0',KBL_GEMINI_API_KEY:'fixture-key-not-a-real-key',KBL_ADMIN_TOKEN:'T'.repeat(40),KBL_PUBLIC_BASE_URL:'https://tiemvangkimbaolam.id.vn',PORT:'0',HOST:'127.0.0.1'});
const routes=[];
function makeApp(){
  const app=function(_req,res){if(res&&typeof res.end==='function')res.end();};
  app.use=function(){return app;};
  for(const name of ['get','post','put','delete'])app[name]=function(){const args=[...arguments];if(typeof args[0]==='string')routes.push({method:name.toUpperCase(),path:args[0],handlers:args.slice(1).filter(x=>typeof x==='function')});return app;};
  for(const name of ['set','disable'])app[name]=function(){return app;};
  app.listen=function(){const cb=[...arguments].find(x=>typeof x==='function');if(cb)setImmediate(cb);return {close(){}};};
  return app;
}
function express(){return makeApp();}
express.response={json:function(){return this;},send:function(){return this;}};express.request={};
for(const name of ['json','raw','static','urlencoded'])express[name]=()=>function(_req,_res,next){if(next)next();};
const originalLoad=Module._load;Module._load=function(request,parent,isMain){if(request==='express')return express;return originalLoad.call(this,request,parent,isMain);};
function makeReq(token='',body={}){return {headers:{...(token?{'x-kbl-admin-token':token}:{}),host:'tiemvangkimbaolam.id.vn'},body,method:'POST',url:'/api/admin/growth-autopilot/prepare',originalUrl:'/api/admin/growth-autopilot/prepare',protocol:'https',ip:'127.0.0.1',socket:{remoteAddress:'127.0.0.1'},get(name){return String(name||'').toLowerCase()==='host'?'tiemvangkimbaolam.id.vn':'';}};}
function makeRes(){return {statusCode:200,body:null,headers:{},status(c){this.statusCode=c;return this;},set(k,v){this.headers[k]=v;return this;},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},type(){return this;},json(v){this.body=v;return this;},send(v){this.body=v;return this;},end(v){if(v!==undefined)this.body=v;return this;}};}
async function callRoute(method,routePath,req){const route=routes.find(r=>r.method===method&&r.path===routePath);if(!route)throw new Error('Route not registered: '+method+' '+routePath);const res=makeRes();let idx=0;const next=async()=>{const fn=route.handlers[idx++];if(!fn)return;const out=fn(req,res,next);if(out&&typeof out.then==='function')await out;};await next();return res;}
const nativeFetch=global.fetch;let generationCalls=0,visionCalls=0,dispatches=0,lastPayload=null,app;
global.fetch=async(url,options)=>{
  const u=new URL(String(url));
  if(u.hostname==='tiemvangkimbaolam.id.vn'){
    const file=path.resolve(pub,'.'+u.pathname);if(!file.startsWith(pub+path.sep))throw Error('Unsafe fixture path');
    if(!fs.existsSync(file))return new Response('',{status:503});
    return new Response(fs.readFileSync(file),{status:200,headers:{'content-type':'image/png'}});
  }
  throw Error('Unexpected external request in offline test: '+u.hostname);
};
const source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace("const PUBLIC_DIR = path.join(ROOT, 'public');",'const PUBLIC_DIR = '+JSON.stringify(pub)+';');
const injection=`
module.exports.growthTest={
 get state(){return kblGrowthState},get file(){return KBL_GROWTH_AUTOPILOT_FILE},version:KBL_GROWTH_PREP_FIRST_VERSION,
 seed(rows){products=rows;prices.price_sell_610=8000000;kblGrowthState.queue=['facebook','instagram'].map(platform=>({id:'fixture-'+platform,campaignId:'fixture',platform,productIds:rows.map(x=>x.id),skus:rows.map(x=>x.sku),products:rows,status:'prep-blocked',preparationStage:'MEDIA',dueAt:new Date(Date.now()+3600000).toISOString(),qa:{approved:true},ideaReview:{approved:true,score:90}}));kblGrowthSave()},
 save:kblGrowthSave,prepare:kblGrowthPrepareCampaign,pending:kblGrowthPreparePending,public:kblGrowthPreparedPostsPublic,
 refresh:kblGrowthRefreshPreparedPriceLayer,qr:kblGrowthPrepQrQa,publish:kblGrowthPublishDue,enhance:kblGrowthEnhanceCampaign,
 setAutoImages(v){kblGrowthState.settings.autoImages=Boolean(v);kblGrowthSave()},
 changePrice(value=9000000){prices.price_sell_610=value},
 install(generator,review,store){kblGeminiStudioGenerate=generator;kblGrowthDesignReviewOne=review;kblGrowthStorePosterFacts=()=>store},
 forceDue(){for(const r of kblGrowthState.queue)r.dueAt=new Date(Date.now()-1000).toISOString();kblGrowthState.settings.enabled=true;kblGrowthState.settings.autoPublishPosts=true;kblGrowthSave()},
 stubDispatch(callback){publisherPreflightRunItem=()=>({status:'queued'});publisherQueueRun=(req,run,platforms,payload)=>{callback(payload());};kblGrowthLastDispatchAt=()=>0;}
};`;
(async()=>{
 try{
  const m=new Module(path.join(root,'app.js'),module);m.filename=path.join(root,'app.js');m.paths=Module._nodeModulePaths(root);m._compile(source+injection,m.filename);app=m.exports;
  const api=app.growthTest,sharp=require(path.join(root,'vendor/sharp'));
  assert.strictEqual(api.version,'1.3.8-minimal-regression-fix');
  const base=await sharp({create:{width:1080,height:1350,channels:3,background:'#94422f'}}).png().toBuffer();
  fs.writeFileSync(path.join(pub,'images','fixture.png'),base);
  const store={name:'KBL — KIỂM THỬ',website:'https://tiemvangkimbaolam.id.vn',websiteHost:'tiemvangkimbaolam.id.vn',phone:'0000000000',address:'Địa chỉ giả lập để kiểm thử bố cục, không dùng để đăng'};
  api.install(async()=>{generationCalls++;return {ok:false,error:'HTTP 429 — fixture quota'}},async()=>{visionCalls++;return {approved:true,score:95,model:'fixture-review',reason:'Fixture review'}},store);
  const rows=[1,2,3].map(i=>({id:'fixture-'+i,sku:'TEST-'+i,name:'Sản phẩm kiểm thử '+i,kind:'current',status:'available',publicationStatus:'published',goldCode:'610',weightChi:1.234,sizeLabel:'12',image:'/images/fixture.png'}));
  api.seed(rows);

  // Core V1.3.8 contract: a V1.3.7 prep-blocked campaign auto-recovers;
  // media/template becomes READY before Gemini enhancement.
  const recovered=await api.pending(4);
  assert.strictEqual(recovered,1,'Scheduler prep worker should recover one legacy blocked campaign');
  assert(api.state.queue.every(r=>r.status==='fallback-ready'),'Legacy prep-blocked rows should recover automatically');
  assert.strictEqual(generationCalls,0,'Preparation must not wait for Gemini when autoImages is off');
  assert(api.state.queue.every(r=>r.status==='fallback-ready'),'All scheduled rows should be availability-ready');
  const prep=api.state.queue[0].preparedPost;
  assert(prep&&prep.ready,'Prepared media must be READY');
  assert(prep.templateReady,'Deterministic template should be READY when vendored Sharp is available');
  assert.strictEqual(prep.cleanUrls.length,3);assert.strictEqual(prep.posterImages.length,3);assert.strictEqual(prep.posterUrls.length,3);
  assert(prep.factQa&&prep.factQa.approved);assert(prep.qrQa&&prep.qrQa.approved);assert(prep.mediaQa&&prep.mediaQa.approved);
  assert(api.public()[0].ready,'Public status must report READY');
  const disk=JSON.parse(fs.readFileSync(api.file));assert(disk.queue.every(r=>r.preparedPost&&r.preparedPost.ready),'READY must survive persistence');

  // Verify the QR in every final deterministic poster, not merely the source QR asset.
  const tools=require(path.join(root,'modules/kbl-growth-poster'));
  for(const rel of prep.posterImages){const scan=await tools.scan(sharp,fs.readFileSync(path.resolve(pub,'.'+rel)),store.website);assert(scan.approved,'Final poster QR did not decode to store website');}

  // Re-running the preparation is idempotent.
  const again=await api.prepare('fixture','test-repeat');assert(again.ok&&again.already);assert.strictEqual(generationCalls,0);

  // Gemini/Art Director may fail later; deterministic READY must survive that failure.
  api.setAutoImages(true);
  const enhanced=await api.enhance('fixture','test-enhance');
  assert(enhanced.ok,'Enhancement failure must be absorbed as a safe READY result');
  assert.strictEqual(generationCalls,1,'One failed Gemini attempt is enough for this fixture');
  const afterEnhance=api.state.queue[0].preparedPost;
  assert(afterEnhance.ready&&afterEnhance.templateReady&&!afterEnhance.brandedReady,'Template READY must survive Gemini failure');
  assert.strictEqual(afterEnhance.mode,'template-fallback');
  assert.strictEqual(afterEnhance.posterImages.length,3);assert(afterEnhance.qrQa.approved);

  // Price/size refresh rebuilds deterministic overlays without asking Gemini again.
  api.changePrice(9000000);
  const refreshed=await api.refresh(rows,afterEnhance);
  assert(refreshed.ready&&refreshed.templateReady,'Price refresh should keep deterministic template READY');
  assert.strictEqual(generationCalls,1,'Price refresh must not spend Gemini calls');
  assert.strictEqual(refreshed.posterImages.length,3);assert(refreshed.qrQa.approved);assert(refreshed.mediaQa.approved);
  for(const r of api.state.queue)r.preparedPost=refreshed;api.save();

  // Admin prepare endpoint keeps auth and async-start contract.
  let response=await callRoute('POST','/api/admin/growth-autopilot/prepare',makeReq('',{campaignId:'fixture'}));assert.equal(response.statusCode,401);
  response=await callRoute('POST','/api/admin/growth-autopilot/prepare',makeReq('T'.repeat(40),{campaignId:'missing'}));assert.equal(response.statusCode,404);
  response=await callRoute('POST','/api/admin/growth-autopilot/prepare',makeReq('T'.repeat(40),{campaignId:'fixture'}));assert.equal(response.statusCode,202);

  // Due-time publisher uses the already prepared 3 posters and does not call Gemini.
  api.forceDue();api.stubDispatch(payload=>{dispatches++;lastPayload=payload});
  const published=await api.publish();
  assert.strictEqual(published.count,1);assert.strictEqual(dispatches,1);assert(lastPayload&&lastPayload.media&&lastPayload.media.images.length===3);
  assert.strictEqual(generationCalls,1,'Due-time dispatch must not call Gemini');
  assert(lastPayload.media.images.every(x=>String(x).startsWith('https://')),'Publisher must receive public HTTPS media URLs');

  console.log('GROWTH_PREPARATION_RUNTIME_OK availability-first + deterministic-3/3 + final-QR + Gemini-independent + price-refresh + due-dispatch');
 }finally{if(app)app.closeServer();global.fetch=nativeFetch;Module._load=originalLoad;fs.rmSync(tmp,{recursive:true,force:true});}
})().then(()=>process.exit(0),error=>{console.error(error.stack||error);process.exit(1)});
