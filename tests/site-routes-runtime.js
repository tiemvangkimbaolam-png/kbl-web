'use strict';
// Whole-site read-path regression on isolated data and public uploads.
const fs=require('fs'),path=require('path'),os=require('os'),Module=require('module'),assert=require('assert');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kbl-site-routes-')),data=path.join(tmp,'data'),pub=path.join(tmp,'public');
fs.mkdirSync(data);fs.mkdirSync(pub);
Object.assign(process.env,{KBL_DATA_DIR:data,KBL_ADMIN_TOKEN:'A'.repeat(40),KBL_LOCAL_AI_WORKER_TOKEN:'L'.repeat(40),KBL_VIDEO_WORKER_TOKEN:'V'.repeat(40),KBL_GEMINI_API_KEY:'',GEMINI_API_KEY:'',OPENAI_API_KEY:'',KBL_OPENAI_API_KEY:'',DEEPSEEK_API_KEY:'',KBL_DEEPSEEK_API_KEY:'',KBL_AI_MASTER_ENABLED:'0',KBL_GOLD_INTEL_ENABLED:'0',KBL_GEMINI_AUTO_MODEL_ENABLED:'0',KBL_PROMPT_DEEPSEEK_AUTO_MODEL_ENABLED:'0',KBL_PUBLIC_BASE_URL:'https://tiemvangkimbaolam.id.vn',PORT:'0',HOST:'127.0.0.1'});
fs.writeFileSync(path.join(data,'growth-autopilot-v1.json'),JSON.stringify({settings:{enabled:false,autoPublishPosts:false,autoImages:false,autoMarket:false}}));
fs.writeFileSync(path.join(data,'growth-autopilot-full-auto-v1.2.7.json'),JSON.stringify({appliedAt:new Date().toISOString()}));
const nativeFetch=global.fetch;
global.fetch=(url,options)=>new URL(String(url)).hostname==='127.0.0.1'?nativeFetch(url,options):Promise.reject(Error('External services disabled for offline audit'));
let app;
(async()=>{try{
  const filename=path.join(root,'app.js'),source=fs.readFileSync(filename,'utf8').replace("const PUBLIC_DIR = path.join(ROOT, 'public');",'const PUBLIC_DIR = '+JSON.stringify(pub)+';');
  const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(root);m._compile(source,filename);app=m.exports;
  if(!app.server.listening)await new Promise(r=>app.server.once('listening',r));
  const base='http://127.0.0.1:'+app.server.address().port;
  const health=await (await nativeFetch(base+'/api/health')).json();assert.equal(health.aiRoutingRelease,'1.3.10-ai-routing-audit');assert(health.aiHealthScope.includes('configuration-and-local-state'));
  const routes=app.app.router.stack.filter(l=>l.route).flatMap(l=>(Array.isArray(l.route.path)?l.route.path:[l.route.path]).flatMap(p=>Object.keys(l.route.methods).map(method=>({method:method.toUpperCase(),path:p}))));
  const selected=routes.filter(r=>typeof r.path==='string'&&r.path.startsWith('/api/')&&r.method==='GET'&&!/[:*{]/.test(r.path)&&!r.path.endsWith('/stream'));
  const unauthorized=new Set(['/api/house2-sync/manifest','/api/house2-sync/file','/api/video-studio/worker/studio-next','/api/prompt-ai/orders','/api/my/crm','/api/my/loyalty','/api/my/pawns','/api/video-studio/worker/ping','/api/video-studio/worker/next','/api/local-ai/worker/ping','/api/local-ai/worker/next','/api/sync/international-orders']);
  const expected={'/api/lookup':404,'/api/pawn/remote':404,'/api/social/webhook/meta':403,'/api/international/customer-message-subtitles.vtt':404,'/api/international/fx':503,'/api/international/paypal/sandbox-test-return':400};
  const results=[];
  for(const r of selected){
    const response=await nativeFetch(base+r.path,{headers:{'x-kbl-admin-token':process.env.KBL_ADMIN_TOKEN},signal:AbortSignal.timeout(7000)});
    await response.text();assert.equal(response.status,unauthorized.has(r.path)?401:expected[r.path]||200,r.path);results.push({path:r.path,status:response.status});
  }
  for(const [url,header,token]of [['/api/local-ai/worker/ping','x-kbl-local-ai-token','L'],['/api/local-ai/worker/next','x-kbl-local-ai-token','L'],['/api/video-studio/worker/ping','x-kbl-video-token','V'],['/api/video-studio/worker/next','x-kbl-video-token','V'],['/api/video-studio/worker/studio-next','x-kbl-video-token','V']]){
    const r=await nativeFetch(base+url,{headers:{[header]:token.repeat(40)}});assert.equal(r.status,200,url);const body=await r.json();assert(body.success,url);
  }
  for(const url of ['/','/vi','/en','/admin','/robots.txt','/sitemap.xml','/vi/kbl-ai-evidence','/en/kbl-ai-evidence']){const r=await nativeFetch(base+url);assert.equal(r.status,200,url);const text=await r.text();if(url==='/sitemap.xml')assert(text.includes('/en/kbl-ai-evidence'),'Current sitemap must win over legacy commerce route');if(url==='/robots.txt')assert(text.includes('OAI-SearchBot'),'Current discovery robots must win over legacy commerce route')}
  for(const url of ['/app.js','/.env','/data/ai-knowledge/kbl-store-policies.json']){const r=await nativeFetch(base+url);assert.equal(r.status,404,url);await r.text()}
  if(process.env.KBL_AUDIT_REPORT)fs.writeFileSync(process.env.KBL_AUDIT_REPORT,JSON.stringify({registeredRoutes:routes.length,checkedReadRoutes:results,workerHandshakes:5,publicPages:8,blockedSourcePaths:3,externalServices:'simulated unavailable'},null,2));
  console.log('SITE_ROUTES_OK: '+routes.length+' registrations; '+selected.length+' API GET routes; 5 worker handshakes; 8 public pages; source paths blocked. External services not verified.');
}finally{if(app)app.closeServer();global.fetch=nativeFetch;fs.rmSync(tmp,{recursive:true,force:true})}})().then(()=>process.exit(0),e=>{console.error(e.stack);process.exit(1)});
