'use strict';
// Safe to run on hosting: no Sharp, API, data writes or social publishing.
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),PNG=require('../vendor/pngjs').PNG,poster=require('../modules/kbl-growth-poster');
(async()=>{
  await poster.ensureComposer(null);
  const base=PNG.sync.write({width:16,height:20,data:Buffer.alloc(16*20*4,255)});
  const store={name:'KIM BẢO LÂM',website:'https://tiemvangkimbaolam.id.vn',websiteHost:'tiemvangkimbaolam.id.vn',phone:'0000000000',address:'Dữ liệu kiểm thử; không đăng lên mạng xã hội'};
  const result=await poster.compose({sharp:null,base,logo:fs.readFileSync(path.join(root,'public/images/kbl-growth/kbl-logo-production.png')),qr:fs.readFileSync(path.join(root,'public/images/kbl-growth/kbl-website-qr.png')),facts:{name:'Kiểm thử bộ ghép ảnh tiếng Việt',sku:'TEST-ONLY',priceText:'1.000.000 đ'},store});
  const output=PNG.sync.read(result.buffer);
  assert.equal(output.width,1080);assert.equal(output.height,1350);assert(result.qrQa.approved);
  assert(!(await poster.scan(null,result.buffer,'https://wrong.example')).approved,'Wrong QR destination must remain blocked');
  console.log('PORTABLE_POSTER_OK: '+process.platform+' '+process.arch+' '+process.version+' · 1080x1350 · final QR verified · no Sharp');
})().catch(error=>{console.error('PORTABLE_POSTER_ERROR: '+error.message);process.exit(1)});
