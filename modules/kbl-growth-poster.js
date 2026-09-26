'use strict';

// One geometry contract for the text layer, logo, QR and final scan.
let qrDecoder;
function loadQrDecoder() {
  if(qrDecoder)return qrDecoder;
  try { qrDecoder=require('../vendor/jsqr/jsQR.js'); }
  catch (vendorError) {
    try { qrDecoder=require('jsqr'); }
    catch (_) { throw new Error('Thiếu bộ quét QR: cập nhật vendor/jsqr/jsQR.js và khởi động lại ứng dụng.'); }
  }
  if(typeof qrDecoder!=='function')throw new Error('Bộ quét QR không hợp lệ; cập nhật lại vendor/jsqr/jsQR.js.');
  return qrDecoder;
}
let portableState={ready:false,diagnostic:'Đang kiểm tra bộ ghép ảnh WebAssembly.'},portableCheck;
function portable(){return require('./kbl-poster-portable');}
function runtimeStatus(sharp) {
  try {
    loadQrDecoder();
    if(sharp)return {ready:true,engine:'sharp-deterministic',diagnostic:'QR decoder jsQR 1.4.0 ready'};
    if(!portableCheck)portableCheck=portable().selfTest().then(()=>{portableState={ready:true,engine:'wasm-deterministic',diagnostic:'Bộ ghép WebAssembly + QR đã kiểm tra; không cần Sharp.'}}).catch(error=>{portableState={ready:false,diagnostic:error.message}});
    return portableState;
  }
  catch(error) { return {ready:false,diagnostic:error.message}; }
}
async function ensureComposer(sharp){
  loadQrDecoder();
  if(!sharp){await portable().selfTest();portableState={ready:true,engine:'wasm-deterministic',diagnostic:'Bộ ghép WebAssembly + QR đã kiểm tra; không cần Sharp.'};}
}
const layout = Object.freeze({width:1080,height:1350,footerTop:880,pad:36,
  logo:{left:36,top:914,width:128,height:128},
  qr:{left:884,top:914,width:160,height:160}});
const escapeXml = value => String(value == null ? '' : value).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function canonicalUrl(value) {
  try { const u=new URL(value); return u.protocol==='https:'&&!u.username&&!u.password ? u.href : ''; }
  catch (_) { return ''; }
}
function wrap(value, max) {
  const lines=[]; let line='';
  for (const word of String(value||'').trim().split(/\s+/).filter(Boolean)) {
    if(line && (line+' '+word).length>max){lines.push(line);line=word;}else line+=(line?' ':'')+word;
  }
  if(line)lines.push(line);
  return lines;
}
function fitLines(value,width,preferred,min,limit) {
  for(let size=preferred;size>=min;size--){
    const lines=wrap(value,Math.floor(width/(size*.60)));
    if(lines.length<=limit&&lines.every(x=>x.length*size*.60<=width))return {lines,size};
  }
  throw new Error('Nội dung quá dài cho vùng chữ; cần rút gọn tên/địa chỉ trước khi đăng.');
}
function svg(facts,store) {
  const name=fitLines(facts.name,660,30,19,2),address=fitLines(store.address,1008,22,18,2);
  const meta=[facts.goldCode?'Vàng '+facts.goldCode:'',facts.weightChi>0?Number(facts.weightChi).toLocaleString('vi-VN')+' chỉ':'',facts.sizeLabel?'Size '+facts.sizeLabel:''].filter(Boolean).join(' · ');
  const one=(value,x,y,size,width,weight=500)=>{
    const fitted=fitLines(value,width,size,16,1);
    return `<text x="${x}" y="${y}" font-size="${fitted.size}" font-weight="${weight}">${escapeXml(value)}</text>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
    <rect y="880" width="1080" height="470" fill="#fff8ed"/>
    <rect y="880" width="1080" height="4" fill="#b88a2e"/>
    <g font-family="DejaVu Sans,Arial,sans-serif" fill="#493318">
      ${one(store.name,188,937,22,660,700)}
      ${name.lines.map((v,i)=>`<text x="188" y="${980+i*36}" font-size="${name.size}" font-weight="700">${escapeXml(v)}</text>`).join('')}
      ${one('Mã SP: '+facts.sku,188,1050,24,660,700)}
      ${one(meta,188,1084,22,660)}
      ${one(facts.priceText,36,1150,50,1008,800)}
      ${one('Giá tham khảo lúc tạo ảnh · có thể thay đổi',36,1180,18,1008)}
      ${one('SĐT '+store.phone+' · '+store.websiteHost,36,1220,24,1008,600)}
      ${address.lines.map((v,i)=>`<text x="36" y="${1255+i*27}" font-size="${address.size}">${escapeXml(v)}</text>`).join('')}
      ${one('Nhắn mã '+facts.sku+' để giữ mẫu',36,1320,22,1008,700)}
      <text x="964" y="1100" text-anchor="middle" font-size="17" font-weight="600">QUÉT WEBSITE</text>
    </g>
  </svg>`;
}
async function scan(sharp,buffer,expected) {
  const raw=sharp?await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true}):portable().pngPixels(buffer);
  const decoded=loadQrDecoder()(new Uint8ClampedArray(raw.data),raw.info?.width||raw.width,raw.info?.height||raw.height,{inversionAttempts:'dontInvert'});
  const target=canonicalUrl(expected),actual=canonicalUrl(decoded&&decoded.data);
  return {approved:Boolean(target&&actual===target),expected:target,decoded:decoded&&decoded.data||'',
    message:actual===target&&target?'QR quét đúng website.':'QR không đọc được hoặc trỏ sai website.'};
}
async function compose({sharp,base,logo,qr,facts,store,sourcePhoto=false}) {
  if(!logo||!qr)throw new Error('Thiếu file logo hoặc QR.');
  const sourceQr=await scan(sharp,qr,store.website);
  if(!sourceQr.approved)throw new Error(sourceQr.message);
  if(!sharp){
    const buffer=await portable().compose({base,logo,qr,footer:svg(facts,store),sourcePhoto});
    const finalQr=await scan(null,buffer,store.website);
    if(!finalQr.approved)throw new Error('QR trên poster hoàn chỉnh không quét đúng website.');
    return {buffer,qrQa:finalQr,layout,engine:'wasm-deterministic'};
  }
  const logoBuffer=await sharp(logo).resize({width:128,height:128,fit:'contain',background:'#fff8ed'}).png().toBuffer();
  const qrBuffer=await sharp(qr).resize({width:144,height:144,fit:'contain',kernel:'nearest',background:'#fff'})
    .extend({top:8,bottom:8,left:8,right:8,background:'#fff'}).png().toBuffer();
  // The catalog photo stays entirely visible above the price layer. AI art may still fill the canvas.
  const background=sourcePhoto
    ? await sharp(base).rotate().resize({width:1080,height:880,fit:'contain',background:'#fff8ed'}).extend({bottom:470,background:'#fff8ed'}).png().toBuffer()
    : await sharp(base).rotate().resize({width:1080,height:1350,fit:'cover'}).png().toBuffer();
  const buffer=await sharp(background).composite([
    {input:Buffer.from(svg(facts,store))},
    {input:logoBuffer,left:layout.logo.left,top:layout.logo.top},
    {input:qrBuffer,left:layout.qr.left,top:layout.qr.top}
  ]).png({compressionLevel:8}).toBuffer();
  const finalQr=await scan(sharp,buffer,store.website);
  if(!finalQr.approved)throw new Error('QR trên poster hoàn chỉnh không quét đúng website.');
  return {buffer,qrQa:finalQr,layout};
}
module.exports={layout,svg,scan,compose,canonicalUrl,runtimeStatus,ensureComposer};
