'use strict';
// Local WebAssembly + JS only; works without Sharp/libvips or system fonts.
const fs=require('fs'),path=require('path');
const PNG=require('../vendor/pngjs').PNG;
const engine=require('../vendor/resvg-wasm');
const fontDir=path.join(__dirname,'..','vendor','poster-fonts');
const fonts=['DejaVuSans.ttf','DejaVuSans-Bold.ttf'].map(name=>fs.readFileSync(path.join(fontDir,name)));
let initialized;
function ensure(){
  if(!initialized)initialized=engine.initWasm(fs.readFileSync(path.join(__dirname,'..','vendor','resvg-wasm','index_bg.wasm')));
  return initialized;
}
function pngPixels(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length<24||buffer.toString('hex',0,8)!=='89504e470d0a1a0a')throw new Error('Bộ quét QR cần ảnh PNG hợp lệ.');
  const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);
  if(!width||!height||width*height>25000000)throw new Error('Ảnh PNG vượt giới hạn 25 triệu điểm ảnh.');
  const raw=PNG.sync.read(buffer);return {data:raw.data,width:raw.width,height:raw.height};
}
function dataUrl(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length>12*1024*1024)throw new Error('Ảnh ghép không hợp lệ hoặc vượt 12 MB.');
  let mime='';
  if(buffer.toString('hex',0,8)==='89504e470d0a1a0a'){pngPixels(buffer);mime='image/png';}
  else if(buffer[0]===255&&buffer[1]===216&&buffer[2]===255)mime='image/jpeg';
  else throw new Error('Bộ ghép độc lập cần ảnh nền PNG/JPEG; định dạng ảnh AI chưa được hỗ trợ.');
  return 'data:'+mime+';base64,'+buffer.toString('base64');
}
async function render(markup){
  await ensure();
  let renderer,image;
  try{
    renderer=new engine.Resvg(markup,{font:{fontBuffers:fonts,defaultFontFamily:'DejaVu Sans'},imageRendering:0});
    image=renderer.render();return Buffer.from(image.asPng());
  }finally{if(image)image.free();if(renderer)renderer.free();}
}
async function compose({base,logo,qr,footer}){
  const content=footer.replace(/^<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
  const markup=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1350" viewBox="0 0 1080 1350">
    <image x="0" y="0" width="1080" height="1350" preserveAspectRatio="xMidYMid slice" xlink:href="${dataUrl(base)}"/>
    ${content}
    <image x="36" y="914" width="128" height="128" preserveAspectRatio="xMidYMid meet" xlink:href="${dataUrl(logo)}"/>
    <rect x="884" y="914" width="160" height="160" fill="white"/>
    <image x="892" y="922" width="144" height="144" image-rendering="optimizeSpeed" preserveAspectRatio="xMidYMid meet" xlink:href="${dataUrl(qr)}"/>
  </svg>`;
  return render(markup);
}
async function selfTest(){
  const result=pngPixels(await render('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#ff0000"/></svg>'));
  if(result.width!==2||result.data[0]!==255)throw new Error('Bộ ghép WebAssembly không vượt qua kiểm tra.');
  return true;
}
module.exports={ensure,pngPixels,compose,selfTest};
