(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.KBLAddressConverter=api;})(function(){
 'use strict';
 const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
 function key(s){let n=fold(s).replace(/^(?:thanh pho|thanhpho|tinh|quan|huyen|thi xa|thi tran|phuong|xa|dac khu)\s+/,'').replace(/^(?:tp|tx|tt|p|q|h)(?:\s+|(?=\d))/,'').trim();return /^\d+$/.test(n)?String(Number(n)):n;}
 function accentedKey(s){let n=String(s||'').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ').replace(/^(?:thành phố|thanh pho|thànhphố|thanhpho|tỉnh|tinh|quận|quan|huyện|huyen|thị xã|thi xa|thị trấn|thi tran|phường|phuong|xã|xa|đặc khu|dac khu)\s+/,'').replace(/^(?:tp|tx|tt|p|q|h)(?:\s+|(?=\d))/,'').trim();return /^\d+$/.test(n)?String(Number(n)):n;}
 function sameName(input,source){const n=accentedKey(input);return key(input)===key(source)&&(n===fold(n)||n===accentedKey(source));}
 const sameProvince=(a,b)=>sameName(a,b)||(['hcm','tphcm'].includes(key(a))&&provinceKey(b)==='ho chi minh')||(accentedKey(a)==='thừa thiên huế'&&provinceKey(b)==='hue');
 function kind(s){const n=fold(s);if(/^(?:phuong\b|p(?:\s|\d))/.test(n))return'ward';if(/^xa\b/.test(n))return'commune';if(/^(?:thi tran\b|tt\s)/.test(n))return'town';if(/^(?:quan\b|q(?:\s|\d))/.test(n))return'district';if(/^(?:huyen\b|h\s)/.test(n))return'rural';if(/^(?:thanh pho\b|tp\s)/.test(n))return'city';if(/^(?:thi xa\b|tx\s)/.test(n))return'township';return'';}
 const sameKind=(a,b)=>!kind(a)||!kind(b)||kind(a)===kind(b);
 const add=(map,k,value)=>{const rows=map.get(k)||[];rows.push(value);map.set(k,rows);};
 const provinceKey=s=>{const n=key(s);return ['hcm','tphcm','ho chi minh'].includes(n)?'ho chi minh':n==='thua thien hue'?'hue':n;};
 function createResolver(data,{now=()=>Date.now(),maxAgeDays=90}={}){
  if(data?.meta?.schema!==1||!Array.isArray(data.oldWards)||!Array.isArray(data.newWards))throw new Error('Bảng đối chiếu địa chỉ chưa hợp lệ.');
  const op=new Map(),np=new Map(),district=new Map(),wards=new Map(),current=new Map();
  for(const p of data.oldProvinces)add(op,provinceKey(p.n),p);
  for(const p of data.newProvinces)add(np,provinceKey(p.n),p);
  for(const d of data.districts)add(district,d.p+'|'+key(d.n),d);
  for(const w of data.oldWards)add(wards,w.d+'|'+key(w.n),w);
  for(const w of data.newWards)add(current,w.p+'|'+key(w.n),w);
  const newByCode=new Map(data.newWards.map(w=>[w.c,w])),provinceByCode=new Map(data.newProvinces.map(p=>[p.c,p]));
  const whole=new Set(['nhap toan bo','giu nguyen','doi loai hinh','doi ten']);
  function resolve(input){
   const original=String(input||'');const base={original,address:original,status:'not_found',candidates:[],catalogAsOf:data.meta.catalogAsOf};
   if(!original.trim())return{...base,status:'empty'};
   const snapshot=Date.parse(data.meta.catalogAsOf+'T00:00:00Z'),age=now()-snapshot;
   if(!Number.isFinite(snapshot)||age>maxAgeDays*86400000||age< -86400000)return{...base,status:'stale'};
   const parts=original.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);let country='';
   if(['viet nam','vietnam','vn'].includes(fold(parts.at(-1))))country=parts.pop();
   if(parts.length<2)return base;
   const ptext=parts.at(-1),dtext=parts.at(-2),wtext=parts.at(-3);
   const finish=(w,prefix)=>{const p=provinceByCode.get(w.p);return p?[...prefix,w.n,p.n,...(country?[country]:[])].join(', '):null;};
   const oldMatches=[];
   if(parts.length>=3)for(const p of op.get(provinceKey(ptext))||[]){
    if(!sameProvince(ptext,p.n))continue;
    for(const d of district.get(p.c+'|'+key(dtext))||[]){
     if(!sameKind(dtext,d.n)||!sameName(dtext,d.n))continue;
     for(const w of wards.get(d.id+'|'+key(wtext))||[])if(sameKind(wtext,w.n)&&sameName(wtext,w.n))oldMatches.push(w);
    }
   }
   if(oldMatches.length){
    if(oldMatches.length!==1||oldMatches.some(w=>w.conflict))return{...base,status:'review',reason:'source_conflict'};
    const w=oldMatches[0],unique=[...new Set(w.t.map(t=>t[0]))],prefix=parts.slice(0,-3);
    const candidates=unique.map(c=>{const dest=newByCode.get(c),address=dest&&finish(dest,prefix);return address?{code:c,address,ward:dest.n,province:provinceByCode.get(dest.p).n}:null;}).filter(Boolean);
    if(candidates.length!==unique.length)return{...base,status:'review',reason:'missing_destination'};
    const entire=w.t.every(t=>whole.has(fold(data.notes[t[1]])));
    if(candidates.length===1&&entire)return{...base,status:'converted',address:candidates[0].address,candidates,oldWardCode:w.c,sourceRows:w.t.map(t=>t[2])};
    return{...base,status:'review',reason:'partial_or_split',candidates,oldWardCode:w.c,sourceRows:w.t.map(t=>t[2])};
   }
   const present=[];
   for(const p of np.get(provinceKey(ptext))||[])if(sameProvince(ptext,p.n))for(const w of current.get(p.c+'|'+key(dtext))||[])if(sameKind(dtext,w.n)&&sameName(dtext,w.n))present.push(w);
   if(present.length===1)return{...base,status:'unchanged',currentWardCode:present[0].c};
   return base;
  }
  return{resolve,meta:data.meta};
 }
 function createAdapter(data,options){
  const resolver=createResolver(data,options);
  const listeners=new WeakMap();
  function present(resolution,field,afterApply){
   if(!field?.ownerDocument)return;
   listeners.get(field)?.();
   const doc=field.ownerDocument,id='kbl-address-'+field.id;doc.getElementById(id)?.remove();
   if(resolution.status==='empty')return;
   const box=doc.createElement('details');box.id=id;box.setAttribute('data-kbl-address-review','1');
   box.style.cssText='margin:6px 0 8px;padding:7px 9px;border:1px solid #e9c8ae;border-radius:8px;background:#fff8ef;color:#153448;font:12px/1.45 Arial,sans-serif;';
   const summary=doc.createElement('summary');summary.style.cssText='cursor:pointer;font-weight:600;color:#924c2e;';
   const labels={converted:'Đã đổi sang địa chỉ mới · xem lại',unchanged:'Địa chỉ thuộc danh mục hiện hành',review:'Địa chỉ cần xác nhận xã/phường',not_found:'Chưa đối chiếu được · giữ địa chỉ trên thẻ',stale:'Cần cập nhật danh mục · giữ địa chỉ trên thẻ'};
   summary.textContent=labels[resolution.status]||labels.not_found;box.appendChild(summary);
   const line=(label,value)=>{const el=doc.createElement('div');el.style.cssText='margin-top:6px;overflow-wrap:anywhere;';el.textContent=label+value;box.appendChild(el);return el;};
   line('Trên căn cước: ',resolution.original);
   let expected=resolution.address;
   const apply=(address)=>{
    if(field.value!==expected){box.remove();return false;}
    field.value=address;expected=address;field.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));field.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));if(typeof afterApply==='function')afterApply();return true;
   };
   const button=(label,action)=>{const el=doc.createElement('button');el.type='button';el.textContent=label;el.style.cssText='margin-top:7px;padding:5px 9px;border:1px solid #cfad91;border-radius:6px;background:#fff;color:#153448;cursor:pointer;';el.addEventListener('click',action);box.appendChild(el);return el;};
   if(resolution.status==='converted'){
    const currentLine=line('Đang dùng: ',resolution.address);
    const undo=button('Dùng lại địa chỉ trên thẻ',()=>{if(apply(resolution.original)){summary.textContent='Đang dùng địa chỉ trên căn cước';currentLine.textContent='Đang dùng: '+resolution.original;undo.disabled=true;}});
   }else if(resolution.status==='review'&&resolution.candidates.length){
    box.open=true;line('', 'Địa bàn cũ có chia tách. Xác nhận nơi cư trú hiện nay với khách.');
    const select=doc.createElement('select');select.style.cssText='display:block;margin-top:6px;width:100%;max-width:100%;padding:6px;background:#fff;color:#153448;border:1px solid #cfad91;border-radius:6px;';
    const empty=doc.createElement('option');empty.value='';empty.textContent='Chọn xã/phường hiện nay…';select.appendChild(empty);
    resolution.candidates.forEach((c,i)=>{const op=doc.createElement('option');op.value=String(i);op.textContent=c.ward+', '+c.province;select.appendChild(op);});box.appendChild(select);
    const confirm=button('Áp dụng địa chỉ đã xác nhận',()=>{if(select.value==='')return;const c=resolution.candidates[Number(select.value)];if(c&&apply(c.address)){summary.textContent='Địa chỉ mới đã được xác nhận';const currentLine=line('Đang dùng: ',c.address);select.disabled=true;confirm.disabled=true;const undo=button('Dùng lại địa chỉ trên thẻ',()=>{if(apply(resolution.original)){summary.textContent='Đang dùng địa chỉ trên căn cước';currentLine.textContent='Đang dùng: '+resolution.original;undo.disabled=true;}});}});confirm.disabled=true;select.addEventListener('change',()=>{confirm.disabled=select.value==='';});
   }else if(resolution.status==='review')line('', 'Dữ liệu chưa đủ chắc chắn. Giữ địa chỉ trên thẻ; kiểm tra và sửa trực tiếp nếu cần.');
   const source=doc.createElement('div');source.style.cssText='margin-top:6px;color:#52616b;font-size:11px;';source.textContent='Danh mục Cục Thống kê · '+resolution.catalogAsOf;box.appendChild(source);
   const removeStale=()=>{if(field.value!==expected){box.remove();field.removeEventListener('input',removeStale);listeners.delete(field);}};field.addEventListener('input',removeStale);listeners.set(field,()=>field.removeEventListener('input',removeStale));
   field.insertAdjacentElement('afterend',box);
  }
  function enrich(result,{field,afterApply}={}){
   const text=result?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
   if(typeof text!=='string')return result;
   let parsed;try{parsed=JSON.parse(text);}catch{return result;}
   if(!parsed?.diaChi)return result;
   let resolution;try{resolution=resolver.resolve(parsed.diaChi);}catch{resolution={original:parsed.diaChi,address:parsed.diaChi,status:'not_found',candidates:[],catalogAsOf:data.meta.catalogAsOf};}
   const updated=structuredClone(result);if(resolution.status==='converted')parsed.diaChi=resolution.address;
   updated.data.candidates[0].content.parts[0].text=JSON.stringify(parsed);updated.addressResolution=resolution;
   try{present(resolution,field,afterApply);}catch{return result;}return updated;
  }
  return{...resolver,enrich,present};
 }
 return{createResolver,createAdapter,key,fold};
});
