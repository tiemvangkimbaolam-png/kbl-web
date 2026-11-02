'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {pathToFileURL}=require('url');
function createStore(dataDir){
 const dir=path.join(dataDir,'product-photos'),index=path.join(dir,'index.json');
 fs.mkdirSync(dir,{recursive:true});
 let rows=fs.existsSync(index)?JSON.parse(fs.readFileSync(index,'utf8')):{};
 if(!rows||Array.isArray(rows)||typeof rows!=='object')throw Error('Danh mục ảnh không hợp lệ; chưa thay đổi dữ liệu.');
 const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
 function get(code){const r=rows[hash(String(code))];if(!r||r.code!==String(code)||!/^[a-f0-9]{64}\.jpg$/.test(r.file))return null;const full=path.join(dir,r.file);return fs.existsSync(full)?{...r,url:pathToFileURL(full).href}:null;}
 function save(code,bytes,original){
  code=String(code||'').trim();if(!code||code.length>200)throw Error('Mã sản phẩm không hợp lệ.');
  if(!Buffer.isBuffer(bytes)||bytes.length<4||bytes.length>8*1024*1024||bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)throw Error('Ảnh JPEG không hợp lệ hoặc quá lớn.');
  const file=hash(bytes)+'.jpg',full=path.join(dir,file);
  if(!fs.existsSync(full))fs.writeFileSync(full,bytes,{flag:'wx'});
  let originalFile='';
  if(original){
   const b=original.bytes,ext=original.ext;
   if(!Buffer.isBuffer(b)||b.length>20*1024*1024||!['jpg','png','webp'].includes(ext))throw Error('Ảnh gốc không hợp lệ.');
   originalFile=hash(b)+'.original.'+ext;
   const target=path.join(dir,originalFile);if(!fs.existsSync(target))fs.writeFileSync(target,b,{flag:'wx'});
  }
  const next={...rows,[hash(code)]:{code,file,originalFile,updatedAt:new Date().toISOString()}};
  if(fs.existsSync(index))fs.copyFileSync(index,index+'.previous');
  fs.writeFileSync(index+'.tmp',JSON.stringify(next,null,2));fs.renameSync(index+'.tmp',index);rows=next;return get(code);
 }
 return {get,save,dir};
}
function mount({document,window,dataDir,getInventory,getSelection,getCart}){
 const store=createStore(dataDir);
 const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const style=make('style');style.textContent=`
@media screen {
#tab-kho .kbl-photo-compact{padding:10px!important;margin-bottom:10px!important}
#tab-kho .kbl-photo-compact>.card-header{padding:7px 10px!important;min-height:0!important;margin-bottom:8px!important}
.kbl-photo-panel{padding:10px;border:1px solid #94bfe6;border-radius:10px;background:#f0f7ff;color:#123a62;margin:8px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.kbl-photo-panel img{width:130px;height:130px;object-fit:contain;background:white;border-radius:8px}
.kbl-photo-thumb{width:60px;height:60px;object-fit:contain;display:block;background:white;border-radius:6px;margin:4px 0}
.kbl-photo-cell button{font-size:11px;padding:4px 7px;margin:3px 3px 0 0}
.kbl-sale-photos{display:flex;gap:12px;flex-wrap:wrap;max-height:230px;overflow:auto}
.kbl-sale-photos figure{margin:0;max-width:160px;font-size:12px}
}
@media print{.kbl-photo-panel,.kbl-photo-cell{display:none!important}}
`;document.head.append(style);
 const tbody=document.getElementById('inventory-tbody'),invoice=document.getElementById('invoice-preview');
 if(!tbody||!invoice)throw Error('Không tìm thấy khung Kho / Bán hàng.');
 const card=tbody.closest('.card');card.classList.add('kbl-photo-compact');document.getElementById('label-printer')?.closest('.card')?.classList.add('kbl-photo-compact');
 const panel=make('section',null,'kbl-photo-panel'),preview=make('img');preview.hidden=true;preview.alt='Ảnh sản phẩm đang chọn trong kho';
 const content=make('div'),title=make('strong','Ảnh sản phẩm lưu tại POS'),hint=make('p','Bấm “Ảnh” tại dòng sản phẩm để tải hoặc xem ảnh đúng mã.'),status=make('p'),upload=make('input');
 status.setAttribute('role','status');upload.type='file';upload.accept='image/jpeg,image/png,image/webp';upload.disabled=true;
 content.append(title,hint,upload,status);panel.append(preview,content);card.insertBefore(panel,card.firstChild.nextSibling);
 let selectedCode='',busy=false;
 function show(code){if(busy)return;const item=getInventory().find(x=>String(x.code)===code);if(!item)return;selectedCode=code;title.textContent=code+' · '+(item.name||'');upload.disabled=false;const photo=store.get(code);preview.hidden=!photo;if(photo)preview.src=photo.url;else preview.removeAttribute('src');hint.textContent=photo?'Ảnh đã lưu tại POS. Chọn file để thay ảnh.':'Chọn JPEG, PNG hoặc WebP tối đa 20 MB.';status.textContent='';}
 function thumb(code,name,cls){const photo=store.get(code);if(!photo)return make('span','Chưa có ảnh');const img=make('img',null,cls);img.src=photo.url;img.alt=code+' · '+name;img.loading='lazy';return img;}
 function refreshInventory(){for(const row of tbody.rows){const code=row.querySelector('[data-label-code]')?.dataset.labelCode;if(!code||!row.cells[1])continue;row.querySelector('.kbl-photo-cell')?.remove();const box=make('div',null,'kbl-photo-cell');box.append(thumb(code,row.cells[1].textContent,'kbl-photo-thumb'));const button=make('button','📷 Ảnh','btn btn-blue');button.type='button';button.onclick=()=>show(code);box.append(button);row.cells[1].append(box);}}
 const salePanel=make('section',null,'kbl-photo-panel');salePanel.append(make('strong','Ảnh đối chiếu món đang chọn / giỏ hàng — không in trên phiếu'));const gallery=make('div',null,'kbl-sale-photos');salePanel.append(gallery);invoice.before(salePanel);
 function refreshSale(){gallery.replaceChildren();const selection=getSelection(),items=[...(selection?[selection]:[]),...getCart()],seen=new Set();for(const row of items){const code=String(row.code||row.invCode||'');if(!code||seen.has(code))continue;seen.add(code);const item=getInventory().find(x=>String(x.code)===code),name=item?.name||row.itemName||'';const fig=make('figure');fig.append(thumb(code,name,''),make('figcaption',code+' · '+name));gallery.append(fig);}if(!seen.size)gallery.append(make('span','Chọn sản phẩm từ kho để đối chiếu ảnh.'));}
 upload.onchange=async()=>{
  const file=upload.files[0],code=selectedCode;if(!file||!code||busy)return;busy=true;upload.disabled=true;status.textContent='Đang kiểm tra và lưu ảnh…';let url;
  try{
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw Error('Chỉ nhận JPEG/PNG/WebP tối đa 20 MB.');
   url=window.URL.createObjectURL(file);const img=await new Promise((resolve,reject)=>{const i=new window.Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Không đọc được ảnh.'));i.src=url;});
   if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>80000000)throw Error('Kích thước ảnh không phù hợp.');
   const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
   if(!getInventory().some(x=>String(x.code)===code))throw Error('Sản phẩm không còn trong kho; chưa gắn ảnh.');
   store.save(code,Buffer.from(canvas.toDataURL('image/jpeg',0.9).split(',')[1],'base64'),{bytes:Buffer.from(await file.arrayBuffer()),ext:({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[file.type]});busy=false;show(code);status.textContent='Đã lưu tại POS. Chưa đồng bộ ảnh lên website.';refreshInventory();refreshSale();
  }catch(e){status.textContent='Chưa lưu: '+e.message;}finally{if(url)window.URL.revokeObjectURL(url);busy=false;upload.disabled=false;upload.value='';}
 };
 refreshInventory();refreshSale();return {refreshInventory,refreshSale};
}
module.exports={createStore,mount};
