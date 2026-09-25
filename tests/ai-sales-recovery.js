'use strict';
// Targeted offline regressions for the observed adviser, media and billing failures.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function section(start,end,from=0){
  const at=source.indexOf(start,from),until=source.indexOf(end,at+start.length);
  assert(at>=0&&until>at,'Source section missing: '+start);
  return source.slice(at,until);
}
const plain=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();

const policy={plainVietnamese:plain,cleanLabelText:(value,max)=>String(value||'').slice(0,max),kblAiV6PolicyRows:[
  {id:'support',topics:['support'],heading:'Kênh hỗ trợ',text:'Loại vấn đề | Phản hồi ban đầu | Dự kiến giải quyết. Website, Zalo, điện thoại.'},
  {id:'warranty',topics:['warranty'],heading:'Bảo hành',text:'Khách mang sản phẩm và giấy đảm bảo vàng hoặc hóa đơn để tiệm kiểm tra khi cần bảo hành.'}
]};
vm.createContext(policy);
vm.runInContext(section('const KBL_AI_V6_POLICY_TOPIC_RULES = [','const KBL_AI_V6_PRODUCT_GENERIC'),policy);
const question='Tiệm có hỗ trợ làm sạch nhẫn không? Nếu có, tôi cần mang theo gì?';
assert.strictEqual(policy.kblAiV6PolicyTopic(question),'warranty');
const answer=policy.kblAiV6PolicyReply(question,'warranty');
assert.match(answer.reply,/chưa thấy chính sách công bố xác nhận tiệm có nhận làm sạch/i);
assert(!answer.reply.includes('Loại vấn đề |'));

const media={
  safeStudioVideoSource:()=>'',publicationStatusFor:()=> 'published',
  safeImageSource:value=>{const s=String(value||'');return s.startsWith('data:')&&s.length>2800000?'':s},
  kblCatalogMedia:{imageFor:()=>'/api/catalog-media/cG9zX2tibA/image/'+'a'.repeat(64)},
  cleanInventoryCode:value=>String(value||'')
};
vm.createContext(media);
vm.runInContext(section('function publisherMediaForProduct(','function publisherAbsoluteUrl('),media);
const product={id:'fixture',sku:'KBL-K0007',status:'available',image:'data:image/png;base64,'+'A'.repeat(3000000)};
assert(media.publisherProductReady(product),'Published catalogue photo must qualify for preparation');
assert(media.publisherMediaForProduct(product).image.startsWith('/api/catalog-media/'));

let providerCalls=0;
const image={
  AI_PHOTO_STUDIO_ENABLED:true,GEMINI_API_KEY:'fixture',GEMINI_PHOTO_MODELS:['gemini-fixture'],GEMINI_IMAGE_MODEL:'gemini-fixture',
  fetch:()=>{},photoModelIsCoolingDown:()=>false,photoModelLabel:x=>x,photoStudioResponseFormat:()=>({}),
  AI_TRYON_TIMEOUT_MS:500,AbortController,setTimeout,clearTimeout,
  kblAiFetch:async()=>{providerCalls++;return new Response(JSON.stringify({error:{message:'Prepayment credits depleted'}}),{status:402,headers:{'content-type':'application/json'}})},
  readGeminiJsonResponse:async response=>({payload:await response.json(),raw:''}),
  geminiApiErrorDetail:payload=>payload.error.message,
  conciseGeminiImageError:(model,status,detail)=>model+': HTTP '+status+' · '+detail,
  photoModelCooldowns:new Map(),AI_PHOTO_QUOTA_COOLDOWN_MS:60000
};
vm.createContext(image);
vm.runInContext(section('async function kblGeminiStudioGenerate(','async function geminiProductStudioImage('),image);

const prep={
  crypto,AI_PHOTO_STUDIO_ENABLED:true,GEMINI_API_KEY:'fixture',KBL_GROWTH_POSTER_SOURCE:'ai',
  kblGrowthState:{assets:{},care:{imageCalls:[]},settings:{autoImages:true,imageRetryHours:24}},
  kblGrowthProductCardFacts:p=>({id:p.id,sku:p.sku,image:'/images/fixture.png',name:'Nhẫn mẫu',goldCode:'610',weightChi:.2,sizeLabel:'12'}),
  kblGrowthStorePosterFacts:()=>({website:'https://tiemvangkimbaolam.id.vn'}),
  kblGrowthOptionalSharp:()=>({}),kblGrowthLoadPosterTools:()=>({ensureComposer:async()=>{}}),
  publisherLocalPublicPath:()=>'',kblIsoMs:value=>Date.parse(value||0),
  kblGrowthImageBudget:()=>({allowed:true}),kblGrowthDateAt:()=>new Date(Date.now()+86400000),kblGrowthDateKeyOffset:()=> '2026-09-25',
  kblGrowthImageReference:async()=>({mimeType:'image/png',data:'YWJj'}),
  kblGrowthRecordImageCall(id){const call={at:new Date().toISOString(),productId:id};prep.kblGrowthState.care.imageCalls.unshift(call);return call},
  kblGrowthSave:()=>{},kblPromptDeepSeekFinalize:async()=>({prompt:'Fixture prompt',model:'deepseek-fixture'}),
  kblGrowthVisualOnlyPosterPrompt:()=> 'Preserve product shape',
  kblGeminiStudioGenerate:async()=>({ok:false,error:'gemini-fixture: HTTP 402 · credits depleted'}),
  cleanLabelText:(value,max)=>String(value||'').slice(0,max),number:value=>Number(value||0),
  kblGrowthReadImageBuffer:async()=>null,kblGrowthProbeImageUrl:async()=>({ok:false}),
  kblGrowthDeterministicPosterOverlay:async()=>({ok:false})
};
vm.createContext(prep);
vm.runInContext(section('async function kblGrowthSinglePosterAsset(','async function kblGrowthRefreshPreparedPriceLayer(',source.lastIndexOf('async function kblGrowthSinglePosterAsset(')),prep);

const now=Date.now(),schedules={kblGrowthState:{queue:[
  {id:'old',status:'ready',dueAt:new Date(now-25*3600000).toISOString()},
  {id:'current',status:'ready',dueAt:new Date(now-1000).toISOString()},
  {id:'test',status:'ready',testMode:'near-now',dueAt:new Date(now-25*3600000).toISOString()}
],reviewQueue:[]},kblGrowthPrepActive:row=>row.status==='ready',kblIsoMs:value=>Date.parse(value),kblGrowthSave:()=>{}};
vm.createContext(schedules);
vm.runInContext(section('function kblGrowthExpireStaleSchedules(','async function kblGrowthDispatchReadyDue('),schedules);
assert.equal(schedules.kblGrowthExpireStaleSchedules(now),1);
assert.equal(schedules.kblGrowthState.queue.length,2);
assert.equal(schedules.kblGrowthState.reviewQueue[0].id,'old');
assert.match(schedules.kblGrowthState.reviewQueue[0].message,/quá 24 giờ/);
(async()=>{
  const result=await image.kblGeminiStudioGenerate([{mimeType:'image/png',data:'YWJj'}],'Fixture','4:5');
  assert.equal(providerCalls,1,'One project billing failure must stop image model retries: '+JSON.stringify(result)+'; calls='+providerCalls);
  assert.match(result.error,/HTTP 402/);
  const failed=await prep.kblGrowthSinglePosterAsset({id:'fixture',sku:'KBL-K0007'},1,3);
  assert.match(failed.reason,/HTTP 402/);
  assert.equal(prep.kblGrowthState.care.imageCalls.length,0,'An unfunded request must not consume local image budget');
  assert(Date.parse(failed.nextRetryAt)-Date.now()>50*60000,'Billing should back off for an hour');
  console.log('AI_SALES_RECOVERY_OK policy intent + catalogue photo + Gemini billing stop + image budget refund + stale schedule');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
