'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),Module=require('module'),assert=require('assert');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kbl-startup-'));
process.env.KBL_DATA_DIR=path.join(tmp,'data');
process.env.KBL_AI_MASTER_ENABLED='0';
process.env.KBL_GOLD_INTEL_ENABLED='0';
process.env.KBL_GEMINI_AUTO_ENABLED='0';
process.env.KBL_PUBLIC_BASE_URL='https://tiemvangkimbaolam.id.vn';
process.env.KBL_ADMIN_TOKEN='A'.repeat(32);
process.env.PORT='0';

const routes=[];
function makeApp(){
  const app=function(_req,res){ if(res&&typeof res.end==='function')res.end(); };
  app.use=function(){return app;};
  for(const name of ['get','post','put','delete'])app[name]=function(){
    const args=[...arguments];
    if(typeof args[0]==='string')routes.push({method:name.toUpperCase(),path:args[0],handlers:args.slice(1).filter(x=>typeof x==='function')});
    return app;
  };
  for(const name of ['set','disable'])app[name]=function(){return app;};
  app.listen=function(){const cb=[...arguments].find(x=>typeof x==='function');if(cb)setImmediate(cb);return {close(){}};};
  return app;
}
function express(){return makeApp();}
express.response={json:function(){return this;},send:function(){return this;}};
express.request={};
for(const name of ['json','raw','static','urlencoded'])express[name]=()=>function(_req,_res,next){if(next)next();};
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){if(request==='express')return express;if(request==='sharp'){const e=new Error('forced npm sharp missing');e.code='MODULE_NOT_FOUND';throw e;}return originalLoad.call(this,request,parent,isMain);};
let loaded;
function makeReq(){return {headers:{'x-kbl-admin-token':'A'.repeat(32),host:'tiemvangkimbaolam.id.vn'},method:'GET',url:'/api/admin/growth-autopilot/status',originalUrl:'/api/admin/growth-autopilot/status',protocol:'https',ip:'127.0.0.1',socket:{remoteAddress:'127.0.0.1'},get(name){return String(name||'').toLowerCase()==='host'?'tiemvangkimbaolam.id.vn':'';}};}
function makeRes(){return {statusCode:200,body:null,headers:{},status(c){this.statusCode=c;return this;},set(k,v){this.headers[k]=v;return this;},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},type(){return this;},json(v){this.body=v;return this;},send(v){this.body=v;return this;},end(v){if(v!==undefined)this.body=v;return this;}};}
(async()=>{
  try{
    loaded=require(path.join(__dirname,'..','app.js'));
    if(!loaded||!loaded.app||typeof loaded.closeServer!=='function')throw new Error('app.js export contract missing');
    const route=routes.find(r=>r.method==='GET'&&r.path==='/api/admin/growth-autopilot/status');
    if(!route||!route.handlers.length)throw new Error('Growth status route was not registered');
    const req=makeReq(),res=makeRes();
    let idx=0;
    const next=async()=>{const fn=route.handlers[idx++];if(!fn)return;const out=fn(req,res,next);if(out&&typeof out.then==='function')await out;};
    await next();
    assert.strictEqual(res.statusCode,200);
    assert(res.body&&res.body.success===true,'Growth status did not return success');
    assert(res.body.growth&&res.body.growth.version==='1.3.7-startup-recovery','Unexpected Growth version');
    assert(res.body.growth.composer&&res.body.growth.composer.ready===true,'Vendored deterministic composer not READY in runtime status');
    assert(/sharp/i.test(String(res.body.growth.composer.diagnostic||'')),'Composer diagnostic missing');
    loaded.closeServer();
    console.log('APP_STARTUP_STATUS_RUNTIME_SMOKE_OK routes='+routes.length+' composer='+res.body.growth.composer.diagnostic);
  }catch(e){console.error(e&&e.stack||e);process.exitCode=1;try{loaded&&loaded.closeServer&&loaded.closeServer();}catch(_){} }
  finally{
    Module._load=originalLoad;
    try{fs.rmSync(tmp,{recursive:true,force:true});}catch(_){}
    setTimeout(()=>process.exit(process.exitCode||0),20).unref();
  }
})();
