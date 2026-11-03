(function(factory){const api=factory(typeof module==='object'&&module.exports?require('./kbl-jsqr.js'):window.jsQR);if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.KBLQrDecoder=api;})(function(jsQR){
 'use strict';
 function regions(width,height){
  const rows=[[0,0,width,height,1600],[0,0,width,height,1000]],cw=Math.round(width*.62),ch=Math.round(height*.62);
  for(const [x,y]of [[0,0],[width-cw,0],[0,height-ch],[width-cw,height-ch],[(width-cw)/2,(height-ch)/2]])rows.push([Math.round(x),Math.round(y),cw,ch,1100]);
  return rows;
 }
 function enhance(pixels){
  const out=new Uint8ClampedArray(pixels.length),hist=new Uint32Array(256);let count=0;
  for(let i=0;i<pixels.length;i+=4){hist[Math.round(.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2])]++;count++;}
  let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];let below=0,total=0,best=-1,threshold=128;
  for(let i=0;i<256;i++){below+=hist[i];if(!below)continue;const above=count-below;if(!above)break;total+=i*hist[i];const score=below*above*(total/below-(sum-total)/above)**2;if(score>best){best=score;threshold=i;}}
  for(let i=0;i<pixels.length;i+=4){const gray=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2],v=gray>threshold?255:0;out[i]=out[i+1]=out[i+2]=v;out[i+3]=255;}return out;
 }
 async function decodeImage(dataUrl,{signal,onProgress=()=>{},document:doc=typeof document!=='undefined'?document:null,ImageClass=typeof Image!=='undefined'?Image:null,decoder=jsQR}={}){
  const src=String(dataUrl||'');if(!/^data:image\/(png|jpeg|webp|jfif|pjpeg);base64,/i.test(src)||src.length>32000000)throw new Error('Ảnh QR chưa hợp lệ. Chọn JPG, PNG hoặc WebP rõ nét.');
  if(!doc||!ImageClass||typeof decoder!=='function')throw new Error('Chưa nạp được bộ đọc QR trên máy. Mở lại POS hoặc nạp lại Remote.');
  const check=()=>{if(signal?.aborted)throw Object.assign(new Error('Đã dừng đọc QR. Ảnh vẫn còn để thử lại.'),{name:'AbortError'});};check();
  const image=await new Promise((resolve,reject)=>{const img=new ImageClass();let timer;const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);img.onload=img.onerror=null;};const stop=()=>{clean();reject(Object.assign(new Error('Đã dừng đọc QR.'),{name:'AbortError'}));};signal?.addEventListener('abort',stop,{once:true});timer=setTimeout(()=>{clean();reject(new Error('Chưa mở được ảnh QR; bấm Đọc lại.'));},15000);img.onload=()=>{clean();resolve(img);};img.onerror=()=>{clean();reject(new Error('Không mở được ảnh QR; chọn ảnh khác hoặc chụp lại.'));};img.src=src;});
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;if(!width||!height)throw new Error('Ảnh QR không có kích thước hợp lệ.');
  const canvas=doc.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Không tạo được khung đọc QR.');
  const started=Date.now();let attempt=0;
  for(const [x,y,w,h,limit]of regions(width,height)){
   check();if(Date.now()-started>14000)break;attempt++;onProgress('Đang dò QR trong ảnh ('+attempt+'/7)…');
   const ratio=Math.min(1,limit/Math.max(w,h));canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));ctx.drawImage(image,x,y,w,h,0,0,canvas.width,canvas.height);
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);let result=decoder(pixels.data,canvas.width,canvas.height,{inversionAttempts:'attemptBoth'});if(result?.data)return result.data;
   if(attempt!==2){result=decoder(enhance(pixels.data),canvas.width,canvas.height,{inversionAttempts:'attemptBoth'});if(result?.data)return result.data;}
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  check();throw new Error('Chưa nhận ra QR. Ảnh đã giữ lại để Đọc lại; nếu vẫn lỗi, chụp gần mã hơn, tránh lóa hoặc dùng ảnh căn cước.');
 }
 return{decodeImage,regions,enhance};
});
