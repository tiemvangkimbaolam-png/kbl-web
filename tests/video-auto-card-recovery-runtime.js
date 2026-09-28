'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const staleStart=source.indexOf('function resetStaleVideoRenderJobs()'),staleEnd=source.indexOf('function videoRenderQueueStatus()',staleStart);
const retryStart=source.indexOf("app.post('/api/admin/video-studio/retry/:id'"),retryEnd=source.indexOf("app.post('/api/admin/video-studio/approve/:id'",retryStart);
assert(staleStart>0&&staleEnd>staleStart&&retryStart>0&&retryEnd>retryStart);

const job={id:'VID-SCAN',status:'failed',autoCardScanOnly:true,sourceVideo:'/uploads/studio/raw.mp4',durationSeconds:26,title:'Video thử',startedAt:'',createdAt:new Date().toISOString()};
const videoRenderJobs=[job],scheduled=[],scans=[];let retryRoute,saveCount=0;
const context={
  app:{post:(_route,_limit,fn)=>{retryRoute=fn}},rateLimit:()=>()=>{},requireAdmin:()=>true,json:(_res,status,payload)=>({status,...payload}),
  videoRenderJobs,VIDEO_RENDER_JOB_MAX_AGE_MS:10*60*1000,GEMINI_VIDEO_API_KEY:'fixture-key',MIN_SECRET_LENGTH:32,
  safeStudioVideoSource:x=>x,kblStudioVideoFilePath:()=>'/tmp/raw.mp4',persistVideoRenderJobs:()=>{saveCount++},
  auditEvent:()=>{},videoRenderPublicJob:x=>({...x}),videoRenderQueueStatus:()=>({}),
  kblRunAutoCardScanBackground:(...args)=>scans.push(args),setImmediate:fn=>scheduled.push(fn),
  number:Number,cleanLabelText:x=>String(x||''),Date
};
vm.runInNewContext(source.slice(staleStart,staleEnd)+source.slice(retryStart,retryEnd),context);
const req={params:{id:job.id},body:{}};
let response=retryRoute(req,{});
assert.equal(response.status,202);
assert.equal(job.status,'running','failed scan must restart Gemini, not enter the FFmpeg queue');
assert.equal(scheduled.length,1);scheduled.shift()();assert.equal(scans.length,1);
response=retryRoute(req,{});assert.equal(response.status,409,'a running scan cannot be charged twice');
job.startedAt=new Date(Date.now()-11*60*1000).toISOString();context.resetStaleVideoRenderJobs();
assert.equal(job.status,'failed','a stale scan must never become a worker render job without cues');
assert.match(job.message,/video RAW vẫn còn/);
job.status='pending';context.resetStaleVideoRenderJobs();assert.equal(job.status,'failed','old pending scan jobs must be removed from the worker queue');
assert(saveCount>=2);

const html=fs.readFileSync(path.join(root,'views/admin.html'),'utf8');
const uploadStart=html.indexOf('async function kblChunkVideoUpload('),uploadEnd=html.indexOf('function clearVideoSource()',uploadStart);
assert(uploadStart>0&&uploadEnd>uploadStart);
const requests=[];let chunkAttempts=0;const stored={};
const responseJson=(body,status=200)=>({status,ok:status>=200&&status<300,json:async()=>body});
const uploadContext={
  headers:()=>({}),kblUploadResumeKey:()=> 'resume-video',kblUploadStorageGet:k=>stored[k]||'',kblUploadStorageSet:(k,v)=>{stored[k]=v},
  kblReadApiJson:r=>r.json(),kblBlobSha256:async()=>'',setTimeout,Promise,Math,Number,String,encodeURIComponent,
  fetch:async(url,options)=>{
    requests.push(String(url));
    if(url.endsWith('/init'))return responseJson({success:true,uploadId:'UP-AAAAAAAAAAAAAAAAAAAAAAAA',receivedBytes:0});
    if(url.includes('/chunk/')){chunkAttempts++;if(chunkAttempts===1)throw Error('temporary network failure');return responseJson({success:true,receivedBytes:options.body.size})}
    if(url.includes('/status/'))return responseJson({success:true,receivedBytes:0});
    if(url.includes('/finalize/'))return responseJson({success:true,source:'/uploads/studio/raw.mp4'});
    throw Error('Unexpected request '+url);
  }
};
const upload=vm.runInNewContext(html.slice(uploadStart,uploadEnd)+'\n(kblChunkVideoUpload)',uploadContext);
(async()=>{
  const file={size:1024,name:'raw.mp4',lastModified:1,type:'video/mp4',slice:(start,end)=>new Blob([Buffer.alloc(end-start)])};
  const result=await upload(file,{kind:'veo',onProgress:()=>{}});
  assert.equal(result.source,'/uploads/studio/raw.mp4');assert.equal(chunkAttempts,2,'retry a transient network error without restarting upload');
  assert(requests.some(url=>url.includes('/status/')),'check committed offset before retrying a chunk');
  assert.equal(stored['resume-video'],'');
  const modelStart=source.indexOf('let kblAutoCardModelsCache ='),modelEnd=source.indexOf('function kblBuildAutoCardRenderJob',modelStart);
  assert(modelStart>0&&modelEnd>modelStart);
  const modelCalls=[],deleted=[],cacheKeys=[];let listCalls=0;
  const modelContext={
    kblStudioVideoFilePath:()=>'/tmp/video.mp4',kblLongVideoMimeFromPath:()=> 'video/mp4',
    kblVideoAutoCardCatalog:()=>[],
    GEMINI_VIDEO_API_KEY:'fixture-key',GEMINI_VIDEO_MODEL:'gemini-2.5-flash',
    require:()=>({keys:async(_file,_catalog,models)=>{cacheKeys.push(...models);return models},key:async(_file,_catalog,model)=>model,get:()=>null,put:()=>{}}),
    path,DATA_DIR:'/tmp',kblGeminiUploadVideoFile:async()=>({uri:'files/fixture',name:'files/fixture'}),
    kblGeminiDeleteFile:async(file)=>deleted.push(file.name),
    KBL_AI_MASTER_CONTRACT:'truth',kblAiFetch:async(url)=>{
      if(url.includes('/models?pageSize=')){listCalls++;return {ok:true,json:async()=>({models:[
        {name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']},
        {name:'models/gemini-3.7-flash',supportedGenerationMethods:['generateContent']},
        {name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']},
        {name:'models/gemini-3.8-flash-image',supportedGenerationMethods:['generateContent']}
      ]})}}
      const model=decodeURIComponent(url.match(/models\/([^/:]+)/)[1]);modelCalls.push(model);
      if(model==='gemini-3.8-flash')return {ok:false,status:400,json:async()=>({error:{message:'This model is no longer available to new users'}})};
      return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({summary:'Đã quét',transcriptText:'',cardPlan:[],cautions:[]})}]}}]})};
    },geminiTextGenerationConfig:()=>({}),cleanLabelText:v=>String(v),AbortController,AbortSignal,Date,setTimeout,clearTimeout,JSON,encodeURIComponent
  };
  const scan=vm.runInNewContext(source.slice(modelStart,modelEnd)+'\n(kblAnalyzeVideoForAutoCards)',modelContext);
  const scanResult=await scan('/uploads/studio/video.mp4','Video thử');
  assert.equal(scanResult.model,'gemini-3.7-flash');
  assert.deepEqual(modelCalls,['gemini-3.8-flash','gemini-3.7-flash']);
  assert(!cacheKeys.includes('gemini-2.5-flash'),'legacy model must not drive scan/cache');
  assert.equal(listCalls,2,'model access failure refreshes the API list');
  assert.deepEqual(deleted,['files/fixture']);
  console.log('VIDEO_AUTO_CARD_RECOVERY_OK scan retry and current model fallback; upload resumes transient chunk failure');
})().catch(error=>{console.error(error);process.exitCode=1});
