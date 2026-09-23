'use strict';
// Execute the actual Worker routing code with a simulated fetch/clock.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'../cloudflare-backup/src/index.js'),'utf8').replace(/^import .*;\r?\n/m,'').replace('export class KblHouse2Container','class KblHouse2Container').replace(/export\s*\{[^}]+\};/g,'');
let timerMs,seen;
const ctx={Container:class{},getContainer(){throw Error('Unexpected backup call')},URL,Headers,Request,Response,AbortController,console,setTimeout(fn,ms){timerMs=ms;return 1},clearTimeout(){},fetch:async(url,options)=>{seen={url,options};return new Response(JSON.stringify({success:true}),{headers:{'content-type':'application/json'}})}};
vm.createContext(ctx);vm.runInContext(source,ctx);
const slowAI=['/api/admin/ai-api/probe','/api/admin/growth-autopilot/banana-test','/api/admin/growth-autopilot/auto-check','/api/admin/growth-autopilot/test-media-upload','/api/admin/ai-master/model-refresh','/api/admin/prompt-ai/overview','/api/admin/prompt-ai/gemini-refresh','/api/admin/prompt-ai/deepseek-refresh','/api/admin/publisher/build','/api/admin/publisher/video-job/fixture/captions','/api/admin/content/veo/start','/api/admin/content/veo/job/fixture','/api/international/translate-batch','/api/international/catalog','/api/adviser/recommend','/api/prompt-ai/finalize','/api/tryon/ai'];
(async()=>{
  for(const path of slowAI)assert.equal(ctx.primaryProxyTimeoutFor(path),240000,'AI route prematurely aborted: '+path);
  for(const path of ['/api/admin/growth-autopilot/status','/api/admin/sales-studio/status','/api/products','/api/admin/settings'])assert.equal(ctx.primaryProxyTimeoutFor(path),5000,'Fast route timeout changed: '+path);
  assert.equal(ctx.primaryProxyTimeoutForRequest(new Request('https://tiemvangkimbaolam.id.vn/vi',{headers:{accept:'text/html'}})),15000);
  for(const path of ['/admin','/api/admin/publisher/build','/api/auth/login','/api/tryon/ai','/api/prompt-ai/finalize','/api/local-ai/worker/next','/api/video-studio/worker/studio-next'])assert(ctx.isPrimaryOnlyControlPlanePath(path),'Primary control plane changed: '+path);
  assert.equal(ctx.isPrimaryOnlyControlPlanePath('/vi'),false);
  assert.equal(ctx.isPrimaryAiResponsePath('/api/adviser/recommend'),true);
  assert.equal(ctx.isPrimaryAiResponsePath('/api/international/catalog'),false,'A longer deadline must not change existing public failover behavior');
  assert.equal(ctx.isPrimaryAiResponsePath('/api/public/kbl-knowledge'),false);
  await ctx.fetchPrimaryThroughHiddenOrigin(new Request('https://tiemvangkimbaolam.id.vn/api/admin/publisher/build',{method:'POST',body:'{}'}),{KBL_PRIMARY_ORIGIN_URL:'https://origin.fixture.invalid'});
  assert.equal(timerMs,240000);assert.equal(seen.options.cf.resolveOverride,'origin.fixture.invalid');assert.equal(seen.options.method,'POST');assert.equal(seen.options.headers.get('x-forwarded-host'),'tiemvangkimbaolam.id.vn');
  console.log('EDGE_AI_ROUTING_OK: slow AI routes, fast routes, navigation, primary-only boundary and hidden-origin forwarding');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
