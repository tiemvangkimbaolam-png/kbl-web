'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sharp = require('../vendor/sharp');
const poster = require('../modules/kbl-growth-poster');

(async () => {
  const root = path.resolve(__dirname, '..');
  const base = await sharp({create:{width:160,height:400,channels:3,background:'#c92d31'}}).png().toBuffer();
  const logo = fs.readFileSync(path.join(root,'public/images/kbl-growth/kbl-logo-production.png'));
  const qr = fs.readFileSync(path.join(root,'public/images/kbl-growth/kbl-website-qr.png'));
  const store = {name:'Kim Bảo Lâm',website:'https://tiemvangkimbaolam.id.vn',websiteHost:'tiemvangkimbaolam.id.vn',phone:'0000000000',address:'Địa chỉ kiểm thử'};
  const facts = {name:'Trang sức kiểm thử',sku:'TEST-1',goldCode:'610',weightChi:1,sizeLabel:'12',priceText:'1.000.000 đ'};
  for (const engine of [sharp, null]) {
    const result = await poster.compose({sharp:engine,base,logo,qr,facts,store,sourcePhoto:true});
    assert(result.qrQa.approved,'The final poster QR must resolve to the verified shop domain');
    const left = await sharp(result.buffer).extract({left:0,top:100,width:1,height:1}).raw().toBuffer();
    const center = await sharp(result.buffer).extract({left:540,top:100,width:1,height:1}).raw().toBuffer();
    assert.deepStrictEqual([...left.subarray(0,3)],[255,248,237],'Portrait must be contained, not cropped to fill the canvas');
    assert.deepStrictEqual([...center.subarray(0,3)],[201,45,49],'The product pixels must be preserved above the price layer');
  }
  console.log('original product poster: portrait preserved and final QR verified with both compositors');
})().catch(error => { console.error(error); process.exitCode=1; });
