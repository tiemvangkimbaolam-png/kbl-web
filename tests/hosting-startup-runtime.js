'use strict';
// Real HTTP server, using the old hosting dependency set and incomplete uploads.
// No external calls, real credentials, social posts or production data.
const fs=require('fs'),path=require('path'),os=require('os'),Module=require('module'),assert=require('assert');
const {spawnSync}=require('child_process');
const mode=process.argv[2];
if(!mode){
  for(const scenario of ['npm-qr-missing','all-qr-missing','poster-module-missing','sharp-missing','sharp-and-portable-missing']){
    const child=spawnSync(process.execPath,[__filename,scenario],{encoding:'utf8',timeout:25000});
    if(child.status!==0){process.stderr.write(child.stdout||'');process.stderr.write(child.stderr||'');throw child.error||new Error('Hosting startup failed: '+scenario);}
    console.log(child.stdout.split('\n').filter(x=>x.startsWith('HOSTING_STARTUP_OK')).join('\n'));
  }
}else{
  const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kbl-hosting-startup-'));
  fs.writeFileSync(path.join(tmp,'growth-autopilot-v1.json'),JSON.stringify({settings:{enabled:false,autoPublishPosts:false,autoImages:false,autoMarket:false}}));
  fs.writeFileSync(path.join(tmp,'growth-autopilot-full-auto-v1.2.7.json'),JSON.stringify({appliedAt:new Date().toISOString()}));
  Object.assign(process.env,{KBL_DATA_DIR:tmp,KBL_ADMIN_TOKEN:'S'.repeat(40),KBL_AI_MASTER_ENABLED:'0',KBL_GOLD_INTEL_ENABLED:'0',KBL_GEMINI_AUTO_MODEL_ENABLED:'0',KBL_PROMPT_DEEPSEEK_AUTO_MODEL_ENABLED:'0',KBL_PUBLIC_BASE_URL:'https://tiemvangkimbaolam.id.vn',PORT:'0',HOST:'127.0.0.1'});
  const nativeFetch=global.fetch,nativeLoad=Module._load;
  global.fetch=(url,options)=>new URL(String(url)).hostname==='127.0.0.1'?nativeFetch(url,options):Promise.reject(new Error('External calls blocked in startup test'));
  Module._load=function(request,parent,isMain){
    const noSharp=mode.startsWith('sharp-')&&(request==='sharp'||request.includes('vendor/sharp'));
    if(noSharp||request==='jsqr'||(mode==='all-qr-missing'&&request.includes('vendor/jsqr/'))||(mode==='poster-module-missing'&&request.includes('modules/kbl-growth-poster'))||(mode==='sharp-and-portable-missing'&&request.includes('kbl-poster-portable'))){
      const error=new Error('Cannot find module '+request+' (hosting fixture)');error.code='MODULE_NOT_FOUND';throw error;
    }
    return nativeLoad.call(this,request,parent,isMain);
  };
  let server;
  (async()=>{
    try{
      server=require(path.join(root,'app.js'));
      if(mode==='sharp-missing')await require(path.join(root,'modules/kbl-growth-poster')).ensureComposer(null);
      if(!server.server.listening)await new Promise(resolve=>server.server.once('listening',resolve));
      const base='http://127.0.0.1:'+server.server.address().port;
      const admin=await fetch(base+'/admin');assert.equal(admin.status,200);assert((await admin.text()).includes('growth-autopilot-card'));
      const home=await fetch(base+'/vi');assert.equal(home.status,200);assert((await home.text()).includes('catalog-show-all'));
      assert(home.headers.get('content-security-policy').includes('https://www.tradingview-widget.com'),'TradingView iframe host must be allowed by the real response header');
      const unauthorized=await fetch(base+'/api/admin/growth-autopilot/status');assert.equal(unauthorized.status,401);
      const response=await fetch(base+'/api/admin/growth-autopilot/status',{headers:{'x-kbl-admin-token':'S'.repeat(40)}});
      assert.equal(response.status,200);const body=await response.json();assert(body.success);
      const composer=body.growth.composer;
      assert.equal(composer.ready,mode==='npm-qr-missing'||mode==='sharp-missing');
      if(mode==='npm-qr-missing'||mode==='sharp-missing'){
        const poster=require(path.join(root,'modules/kbl-growth-poster'));
        const qr=await poster.scan(mode==='sharp-missing'?null:require(path.join(root,'vendor/sharp')),fs.readFileSync(path.join(root,'public/images/kbl-growth/kbl-website-qr.png')),'https://tiemvangkimbaolam.id.vn');
        if(mode==='sharp-missing')assert.equal(composer.engine,'wasm-deterministic');
        assert(qr.approved,'Vendored QR decoder must actually read the production QR');
      }else{
        assert(/QR|poster/.test(composer.diagnostic));
        assert(body.growth.runtime.degraded,'Unavailable image tooling must be reported accurately');
      }
      console.log('HOSTING_STARTUP_OK '+mode+': Admin/Home 200; auth 401; composer.ready='+composer.ready);
    }finally{
      if(server)server.closeServer();Module._load=nativeLoad;global.fetch=nativeFetch;fs.rmSync(tmp,{recursive:true,force:true});
    }
  })().then(()=>process.exit(0),error=>{console.error(error.stack||error);process.exit(1)});
}
