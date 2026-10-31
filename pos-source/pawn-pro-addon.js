/* KBL Pawn Pro 1.0 - mo rong cam do thuong mai, khong thay doi engine lai/phi cu */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let fs=null,path=null,pathToFileURL=null,webUtils=null,shell=null,ipc=null;
  try {
    fs=require('fs'); path=require('path'); pathToFileURL=require('url').pathToFileURL;
    const electron=require('electron'); webUtils=electron.webUtils; shell=electron.shell; ipc=electron.ipcRenderer;
  } catch (_) {}

  const state={ assetPhotos:[], customerPhotoPath:'', details:{}, loadedId:'', restoring:false };
  const fieldDefs={
    gold:[['goldKind','Loại trang sức / vàng','text','VD: Nhẫn, dây, lắc...'],['goldNote','Đặc điểm nhận dạng','text','Màu, ký hiệu, đá, dấu riêng...']],
    motorbike:[['brand','Hãng xe','datalist','Honda|Yamaha|Piaggio|Suzuki|SYM|VinFast'],['model','Dòng xe','text','VD: SH160i, Vision, Exciter...'],['version','Phiên bản','text','ABS / CBS / bản đặc biệt...'],['year','Năm sản xuất','number','2026'],['plate','Biển số','text','59X1-123.45'],['frameNo','Số khung','text',''],['engineNo','Số máy','text',''],['km','Số km','number',''],['color','Màu xe','text',''],['papers','Giấy tờ đi kèm','text','Đăng ký xe, bảo hiểm...'],['condition','Tình trạng','textarea','Mô tả ngoại hình, máy móc, trầy xước...']],
    car:[['brand','Hãng ô tô','datalist','Toyota|Ford|Hyundai|Kia|Mazda|Honda|Mercedes-Benz|BMW|VinFast|Mitsubishi'],['model','Model','text','VD: Vios, Ranger, Accent...'],['version','Phiên bản','text','G CVT / Titanium / Premium...'],['year','Năm sản xuất','number','2026'],['plate','Biển số','text','51K-123.45'],['vin','Số VIN','text',''],['engineNo','Số máy','text',''],['km','Số km','number',''],['color','Màu xe','text',''],['registration','Đăng ký xe','text','Số/ghi chú'],['inspection','Đăng kiểm','text','Hạn đăng kiểm'],['insurance','Bảo hiểm','text','Thông tin bảo hiểm'],['condition','Tình trạng','textarea','Mô tả thân vỏ, máy, nội thất...']],
    phone:[['brand','Hãng','datalist','Apple|Samsung|Xiaomi|OPPO|vivo|realme|Sony|Dell|HP|Lenovo|Asus'],['model','Model','text',''],['imei','IMEI / Serial','text',''],['configuration','Cấu hình','text','Dung lượng, RAM, CPU...'],['accessories','Phụ kiện','text','Sạc, hộp, dây...'],['condition','Tình trạng','textarea','Màn hình, pin, vỏ, lỗi...']],
    papers:[['paperType','Loại giấy tờ','text','Giấy đăng ký xe, sổ, chứng từ...'],['paperNo','Số giấy tờ','text',''],['owner','Tên chủ giấy tờ','text',''],['condition','Ghi chú / tình trạng','textarea','']],
    other:[['customType','Loại tài sản','text','Nhập loại tài sản'],['condition','Mô tả chi tiết','textarea','Đặc điểm nhận dạng, số seri, tình trạng...']]
  };

  function dataDir(){
    try { if(typeof window.pawnGetStableDataDir==='function'){const d=String(window.pawnGetStableDataDir()||'');if(d)return d;} } catch(_){}
    if(!path)return''; const base=process.env.APPDATA||process.env.LOCALAPPDATA||process.env.USERPROFILE||process.cwd();
    return path.join(base,'GoldShopPOS_Commercial_Unlocked','data');
  }
  function ensureDir(dir){try{if(dir&&fs)fs.mkdirSync(dir,{recursive:true});return dir;}catch(_){return'';}}
  function atomicWriteJson(file,obj){
    if(!fs||!path||!file)return false;
    try{ensureDir(path.dirname(file));const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(obj,null,2),'utf8');fs.renameSync(tmp,file);return true;}catch(e){console.warn('[PAWN PRO] write',e);return false;}
  }
  function readJson(file,fallback){try{if(fs?.existsSync(file))return JSON.parse(fs.readFileSync(file,'utf8')||'null')??fallback;}catch(_){}return fallback;}
  function contractsFile(){return path?path.join(dataDir(),'pawn_contracts.json'):'';}
  function customersFile(){return path?path.join(dataDir(),'pawn_customers.json'):'';}
  function assetDir(id){return path?ensureDir(path.join(dataDir(),'pawn_asset_images',String(id||'UNSAVED').replace(/[^a-zA-Z0-9_-]/g,'_'))):'';}
  function customerPhotoDir(id){return path?ensureDir(path.join(dataDir(),'pawn_customer_images',String(id||'UNSAVED').replace(/[^a-zA-Z0-9_-]/g,'_'))):'';}
  function parseLocalContracts(){try{const x=JSON.parse(localStorage.getItem('kimBaoLamData')||'[]');return Array.isArray(x)?x:[];}catch(_){return[];}}
  function contractDateScore(c){return Date.parse(c?.updatedAt||c?.createdAt||c?.dateStartRaw||'')||0;}
  function buildCustomers(contracts){
    const map=new Map();
    [...contracts].sort((a,b)=>contractDateScore(a)-contractDateScore(b)).forEach(c=>{
      const key=String(c?.cccd||c?.phone||c?.name||'').trim(); if(!key)return;
      const old=map.get(key)||{};
      map.set(key,{...old,key,cccd:c.cccd||old.cccd||'',name:c.name||old.name||'',phone:c.phone||old.phone||'',address:c.address||old.address||'',dateIssueRaw:c.dateIssueRaw||old.dateIssueRaw||'',placeIssue:c.placeIssue||old.placeIssue||'',imgFrontPath:c.imgFrontPath||old.imgFrontPath||'',imgBackPath:c.imgBackPath||old.imgBackPath||'',customerPhotoPath:c.customerPhotoPath||old.customerPhotoPath||'',lastContractId:c.id||old.lastContractId||'',lastSeenAt:c.updatedAt||c.dateStartRaw||old.lastSeenAt||'',contractCount:Number(old.contractCount||0)+1});
    });
    return [...map.values()];
  }
  function mirrorContracts(contracts){
    const list=Array.isArray(contracts)?contracts:parseLocalContracts();
    const ok=atomicWriteJson(contractsFile(),list); if(ok)atomicWriteJson(customersFile(),buildCustomers(list));
    return ok;
  }
  function recoverContracts(){
    if(!fs||!contractsFile())return;
    try{
      const file=contractsFile(), local=parseLocalContracts();
      if(fs.existsSync(file)){
        const disk=readJson(file,null);
        if(Array.isArray(disk) && (disk.length || !local.length)){
          localStorage.setItem('kimBaoLamData',JSON.stringify(disk));
          return;
        }
      }
      if(local.length) atomicWriteJson(file,local);
    }catch(error){console.warn('[KBL PAWN RECOVERY]',error&&error.message);}
  }

  function readStandaloneSettings(){return readJson(path?path.join(dataDir(),'settings.json'):'',{})||{};}
  function saveStandaloneSettings(next){const current=readStandaloneSettings();return atomicWriteJson(path.join(dataDir(),'settings.json'),{...current,...next});}
  function installPriceFallbacks(){
    const oldPrice=window.getPawnPosBuyPrice;
    window.getPawnPosBuyPrice=function(code){
      let value=0; try{value=Number(typeof oldPrice==='function'?oldPrice(code):0)||0;}catch(_){}
      if(value>0)return value;
      const s=readStandaloneSettings(); return Number(s[`price_buy_${String(code||'').trim()}`]||0)||0;
    };
    const oldKey=window.getPawnGeminiApiKey;
    window.getPawnGeminiApiKey=function(){
      let key='';try{key=String(typeof oldKey==='function'?oldKey():'').trim();}catch(_){}
      if(key)return key; const s=readStandaloneSettings(); return String(s.gemini_api_key||'').trim();
    };
  }

  function htmlEscape(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function numberFromVnd(v){return Number(String(v||'').replace(/[^0-9.-]/g,''))||0;}
  function fmt(v){return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v)||0))+'đ';}

  function saveCurrentDetailInputs(){document.querySelectorAll('#kbl-asset-fields [data-asset-key]').forEach(el=>{state.details[el.dataset.assetKey]=el.value;});}
  function renderAssetFields(){
    saveCurrentDetailInputs(); const type=$('kbl-asset-category')?.value||'gold'; const box=$('kbl-asset-fields');if(!box)return;box.innerHTML='';
    (fieldDefs[type]||fieldDefs.other).forEach(([key,label,kind,placeholder])=>{
      const wrap=document.createElement('div'); if(kind==='textarea'||key==='condition')wrap.className='wide';
      const listId=`kbl-list-${type}-${key}`;
      const control=kind==='textarea'
        ? `<textarea data-asset-key="${key}" rows="2" placeholder="${htmlEscape(placeholder)}">${htmlEscape(state.details[key]||'')}</textarea>`
        : `<input data-asset-key="${key}" type="${kind==='number'?'number':'text'}" ${kind==='datalist'?`list="${listId}"`:''} value="${htmlEscape(state.details[key]||'')}" placeholder="${htmlEscape(placeholder)}">${kind==='datalist'?`<datalist id="${listId}">${String(placeholder).split('|').map(x=>`<option value="${htmlEscape(x)}"></option>`).join('')}</datalist>`:''}`;
      wrap.innerHTML=`<label>${label}</label>${control}`;box.appendChild(wrap);
    });
    toggleGoldUi(type); updateValuation();
  }
  function toggleGoldUi(type){const show=type==='gold';const price=$('inp-gold-price');const row=price?.closest('.form-row');if(row)row.style.display=show?'':'none';const calc=document.querySelector('.gold-calc-frame');if(calc)calc.style.display=show?'':'none';}
  function collectAssetDetails(){saveCurrentDetailInputs();return {...state.details};}
  function composeAssetName(){
    const type=$('kbl-asset-category')?.value||'other';const d=collectAssetDetails();let text='';
    if(type==='gold')text=[d.goldKind,d.goldNote].filter(Boolean).join(' · ');
    if(type==='motorbike')text=['Xe máy',d.brand,d.model,d.version,d.year,d.plate].filter(Boolean).join(' ');
    if(type==='car')text=['Ô tô',d.brand,d.model,d.version,d.year,d.plate].filter(Boolean).join(' ');
    if(type==='phone')text=[d.brand,d.model,d.imei?`IMEI ${d.imei}`:''].filter(Boolean).join(' · ');
    if(type==='papers')text=[d.paperType,d.paperNo].filter(Boolean).join(' · ');
    if(type==='other')text=[d.customType,d.condition].filter(Boolean).join(' · ');
    if(text&&$('inp-asset')){$('inp-asset').value=text;try{syncAllData();}catch(_){}}
  }
  function updateValuation(){
    const mode=$('kbl-valuation-mode')?.value||'manual'; const ref=Number($('kbl-market-reference')?.value||0)||0; const ratio=Math.max(1,Math.min(100,Number($('kbl-loan-ratio')?.value||65)||65)); let suggested=0;
    if(mode==='gold')suggested=numberFromVnd($('out-gold-valuation')?.value||0);
    else if(mode==='market')suggested=Math.round(ref*ratio/100);
    else suggested=Number($('inp-money')?.value||0)||0;
    if($('kbl-suggested-loan'))$('kbl-suggested-loan').value=fmt(suggested); if($('kbl-apply-loan'))$('kbl-apply-loan').dataset.value=String(suggested);
  }
  function applySuggestedLoan(){const n=Number($('kbl-apply-loan')?.dataset.value||0)||0;if(n>0&&$('inp-money')){$('inp-money').value=n;try{tinhLaiCamDo();}catch(_){}}}

  async function fileToBuffer(file){
    try{const p=webUtils?.getPathForFile?.(file)||file.path;if(p&&fs?.existsSync(p))return fs.readFileSync(p);}catch(_){}
    const ab=await file.arrayBuffer();return Buffer.from(ab);
  }
  async function onAssetPhotos(e){
    const files=[...(e.target.files||[])].slice(0,8); if(!files.length)return; const id=$('inp-id')?.value||`P-${Date.now()}`;const dir=assetDir(id);if(!dir)return;
    for(let i=0;i<files.length;i++){
      try{const f=files[i],ext=(path.extname(f.name||'')||'.jpg').slice(0,8),name=`asset_${Date.now()}_${i+1}${ext}`,dest=path.join(dir,name);fs.writeFileSync(dest,await fileToBuffer(f));state.assetPhotos.push(dest);}catch(err){console.warn('[PAWN PRO] asset photo',err);}
    }
    state.assetPhotos=[...new Set(state.assetPhotos)].slice(0,12); renderAssetPhotos(); e.target.value='';
  }
  function renderAssetPhotos(){const box=$('kbl-photo-list');if(!box)return;box.innerHTML='';state.assetPhotos.forEach((p,i)=>{const wrap=document.createElement('div');wrap.style.position='relative';let src='';try{src=pathToFileURL(p).href;}catch(_){src=p;}wrap.innerHTML=`<img class="kbl-photo-thumb" src="${htmlEscape(src)}"><button type="button" data-rm="${i}" style="position:absolute;right:2px;top:2px;min-height:22px;width:22px;padding:0;border:0;border-radius:50%;background:#b42318;color:#fff">×</button>`;box.appendChild(wrap);});box.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{state.assetPhotos.splice(Number(b.dataset.rm),1);renderAssetPhotos();});}
  async function onCustomerPhoto(e){
    const f=e.target.files?.[0];if(!f)return;const key=$('inp-cccd')?.value||$('inp-id')?.value||`KH-${Date.now()}`;const dir=customerPhotoDir(key);if(!dir)return;
    try{const ext=(path.extname(f.name||'')||'.jpg').slice(0,8),dest=path.join(dir,`customer_${Date.now()}${ext}`);fs.writeFileSync(dest,await fileToBuffer(f));state.customerPhotoPath=dest;renderCustomerPhoto();}catch(err){console.warn('[PAWN PRO] customer photo',err);}
    e.target.value='';
  }
  function renderCustomerPhoto(){const box=$('kbl-customer-photo-preview');if(!box)return;if(!state.customerPhotoPath){box.innerHTML='<span style="color:#64748b">Chưa có ảnh khách.</span>';return;}let src='';try{src=pathToFileURL(state.customerPhotoPath).href;}catch(_){src=state.customerPhotoPath;}box.innerHTML=`<img class="kbl-photo-thumb" style="width:96px;height:96px;object-fit:cover" src="${htmlEscape(src)}"><button id="kbl-customer-photo-remove" type="button" class="btn btn-gray" style="margin-left:8px">Bỏ ảnh khỏi hồ sơ</button>`;$('kbl-customer-photo-remove').onclick=()=>{state.customerPhotoPath='';renderCustomerPhoto();};}

  function currentExtras(){return {customerPhotoPath:state.customerPhotoPath||'',assetCategory:$('kbl-asset-category')?.value||'gold',assetDetails:collectAssetDetails(),assetPhotos:[...state.assetPhotos],valuation:{mode:$('kbl-valuation-mode')?.value||'manual',marketReference:Number($('kbl-market-reference')?.value||0)||0,loanRatio:Number($('kbl-loan-ratio')?.value||65)||65,suggestedLoan:numberFromVnd($('kbl-suggested-loan')?.value||0)},updatedAt:new Date().toISOString()};}
  function persistExtras(id){
    const contracts=parseLocalContracts();const idx=contracts.findIndex(c=>String(c?.id||'')===String(id||''));if(idx<0)return false;contracts[idx]={...contracts[idx],...currentExtras()};try{localStorage.setItem('kimBaoLamData',JSON.stringify(contracts));mirrorContracts(contracts);return true;}catch(_){return false;}
  }
  function applyExtras(item){
    state.loadedId=String(item?.id||'');state.details={...(item?.assetDetails||{})};state.assetPhotos=Array.isArray(item?.assetPhotos)?[...item.assetPhotos]:[];state.customerPhotoPath=String(item?.customerPhotoPath||'');
    const cat=item?.assetCategory||inferCategory(item?.asset||'');if($('kbl-asset-category'))$('kbl-asset-category').value=cat;
    renderAssetFields();renderAssetPhotos();renderCustomerPhoto();const v=item?.valuation||{};if($('kbl-valuation-mode'))$('kbl-valuation-mode').value=v.mode||'manual';if($('kbl-market-reference'))$('kbl-market-reference').value=v.marketReference||'';if($('kbl-loan-ratio'))$('kbl-loan-ratio').value=v.loanRatio||65;updateValuation();
  }
  function inferCategory(asset){const s=String(asset||'').toLowerCase();if(/ô tô|oto|car|vios|ranger|accent|mazda|kia/.test(s))return'car';if(/xe máy|xe may|honda|yamaha|vision|exciter|sh\b/.test(s))return'motorbike';if(/iphone|samsung|điện thoại|dien thoai|laptop|macbook|imei/.test(s))return'phone';if(/giấy|giay|đăng ký|dang ky|cavet|cà vẹt/.test(s))return'papers';if(/vàng|vang|nhẫn|nhan|lắc|lac|dây|day|kiềng|kieng/.test(s))return'gold';return'other';}
  function resetExtras(){state.details={};state.assetPhotos=[];state.customerPhotoPath='';if($('kbl-asset-category'))$('kbl-asset-category').value='gold';if($('kbl-valuation-mode'))$('kbl-valuation-mode').value='manual';if($('kbl-market-reference'))$('kbl-market-reference').value='';if($('kbl-loan-ratio'))$('kbl-loan-ratio').value='65';renderAssetFields();renderAssetPhotos();renderCustomerPhoto();updateValuation();}

  function installWrappers(){
    if(typeof window.executeSaveContract==='function'&&!window.executeSaveContract.__kblPro){const old=window.executeSaveContract;const fn=function(...args){const out=old.apply(this,args);setTimeout(()=>{const id=String($('inp-id')?.value||args[2]||'');persistExtras(id);updateDashboard();},20);return out;};fn.__kblPro=true;window.executeSaveContract=fn;}
    if(typeof window.pawnPersistContracts==='function'&&!window.pawnPersistContracts.__kblPro){const old=window.pawnPersistContracts;const fn=function(contracts,...rest){const out=old.call(this,contracts,...rest);if(out!==false)mirrorContracts(contracts);setTimeout(updateDashboard,20);return out;};fn.__kblPro=true;window.pawnPersistContracts=fn;}
    if(typeof window.fillFormFromHistory==='function'&&!window.fillFormFromHistory.__kblPro){const old=window.fillFormFromHistory;const fn=function(index,...rest){const out=old.call(this,index,...rest);try{const item=(typeof window.readPawnContracts==='function'?window.readPawnContracts():parseLocalContracts())[index];applyExtras(item||{});}catch(_){}return out;};fn.__kblPro=true;window.fillFormFromHistory=fn;}
    if(typeof window.clearForm==='function'&&!window.clearForm.__kblPro){const old=window.clearForm;const fn=function(...args){const out=old.apply(this,args);resetExtras();return out;};fn.__kblPro=true;window.clearForm=fn;}
    if(typeof window.resetTransactionFieldsForCustomerCopy==='function'&&!window.resetTransactionFieldsForCustomerCopy.__kblPro){const old=window.resetTransactionFieldsForCustomerCopy;const fn=function(...args){const out=old.apply(this,args);resetExtras();return out;};fn.__kblPro=true;window.resetTransactionFieldsForCustomerCopy=fn;}
    if(typeof window.loadHistory==='function'&&!window.loadHistory.__kblPro){const old=window.loadHistory;const fn=function(...args){const out=old.apply(this,args);setTimeout(updateDashboard,0);return out;};fn.__kblPro=true;window.loadHistory=fn;}
  }

  function updateDashboard(){
    const list=parseLocalContracts(); const active=list.filter(x=>!['Đã chuộc','Đã thanh lý'].includes(x.status)); const overdue=active.filter(x=>x.isOverdue||x.status==='Quá hạn'); const principal=active.reduce((s,x)=>s+(Number(x.money)||0),0); const today=new Date().toISOString().slice(0,10); const todayCount=list.filter(x=>String(x.dateStartRaw||'')===today).length;
    const set=(id,v)=>{if($(id))$(id).textContent=v;};set('kbl-stat-active',active.length);set('kbl-stat-principal',fmt(principal));set('kbl-stat-overdue',overdue.length);set('kbl-stat-today',todayCount);
  }

  function addTopUi(){
    if($('kbl-pawn-quicknav'))return; const nav=document.createElement('div');nav.id='kbl-pawn-quicknav';nav.innerHTML=`<button class="primary" data-go="inp-cccd">➕ Cầm mới</button><button data-go="history-table">📚 Phiếu cầm</button><button data-act="customers">👥 Khách hàng</button><button data-act="reports">📊 Báo cáo</button><button data-act="interest">💵 Đóng lãi / gia hạn</button><button data-act="redeem">✅ Chuộc</button><button data-act="lost">📝 Mất phiếu</button><button data-act="liquidate">🔴 Thanh lý</button><button data-act="device">⚙️ Thiết bị</button><button data-act="data">💾 Dữ liệu</button>`;document.body.insertAdjacentElement('afterbegin',nav);
    nav.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>($(b.dataset.go)||document.querySelector(`#${b.dataset.go}`))?.scrollIntoView({behavior:'smooth',block:'center'}));
    nav.querySelector('[data-act="customers"]').onclick=()=>openCustomersModal();
    nav.querySelector('[data-act="reports"]').onclick=()=>openPawnReportModal();
    nav.querySelector('[data-act="interest"]').onclick=()=>{const b=$('btn-pay-interest');if(b)b.click();else $('inp-pawn-topup')?.scrollIntoView({behavior:'smooth'});};
    nav.querySelector('[data-act="redeem"]').onclick=()=>document.querySelector('[onclick*="redeem"],[onclick*="chuoc" i]')?.click();
    nav.querySelector('[data-act="lost"]').onclick=()=>window.openLostTicketDeclaration?.();
    nav.querySelector('[data-act="liquidate"]').onclick=()=>document.querySelector('[onclick*="liquid" i],[onclick*="thanh" i]')?.click();
    nav.querySelector('[data-act="device"]').onclick=()=>{try{if(window.KBLDeviceAssistant?.open)return window.KBLDeviceAssistant.open();if(window.parent&&window.parent!==window&&window.parent.KBLDeviceAssistant?.open)return window.parent.KBLDeviceAssistant.open();}catch(_){}openStandaloneDeviceBox();};
    nav.querySelector('[data-act="data"]').onclick=()=>openDataBox();
    const dash=document.createElement('div');dash.id='kbl-pawn-dashboard';dash.innerHTML=`<div class="kbl-stat"><b id="kbl-stat-active">0</b><span>Phiếu đang cầm</span></div><div class="kbl-stat"><b id="kbl-stat-principal">0đ</b><span>Gốc đang cho cầm</span></div><div class="kbl-stat"><b id="kbl-stat-overdue">0</b><span>Phiếu quá hạn</span></div><div class="kbl-stat"><b id="kbl-stat-today">0</b><span>Phiếu mới hôm nay</span></div>`;
    const firstH=document.querySelector('h1,h2');if(firstH)firstH.insertAdjacentElement('beforebegin',dash);else document.body.insertBefore(dash,nav.nextSibling);
  }

  function addAssetUi(){
    if($('kbl-pawn-pro-box'))return;const anchor=$('inp-asset')?.closest('.form-row');if(!anchor)return;const box=document.createElement('div');box.id='kbl-pawn-pro-box';box.innerHTML=`<div class="kbl-pawn-title">🧩 Hồ sơ tài sản & định giá</div><div class="kbl-pawn-pro-grid"><div><label>Loại tài sản</label><select id="kbl-asset-category"><option value="gold">Vàng / Trang sức</option><option value="motorbike">Xe máy</option><option value="car">Ô tô</option><option value="phone">Điện thoại / Điện tử</option><option value="papers">Giấy tờ / Hồ sơ</option><option value="other">Tài sản khác</option></select></div><div><label>Cách định giá</label><select id="kbl-valuation-mode"><option value="manual">Chủ tiệm tự định giá</option><option value="gold">Theo giá vàng POS</option><option value="market">Theo giá thị trường nhập tham khảo</option></select></div><div><label>Giá thị trường tham khảo</label><input id="kbl-market-reference" type="number" placeholder="0"></div><div><label>Tỷ lệ cho cầm (%)</label><input id="kbl-loan-ratio" type="number" min="1" max="100" value="65"></div><div><label>Mức cho cầm gợi ý</label><input id="kbl-suggested-loan" readonly value="0đ"></div><div style="display:flex;align-items:end"><button id="kbl-apply-loan" type="button" class="btn btn-gold" style="width:100%">Áp dụng tiền cầm</button></div><div class="wide"><div id="kbl-asset-fields" class="kbl-asset-fields"></div></div><div class="wide"><label>Ảnh khách tại thời điểm giao dịch</label><input id="kbl-customer-photo" type="file" accept="image/*" capture="user"><div id="kbl-customer-photo-preview" style="margin-top:8px"></div></div><div class="wide"><label>Ảnh tài sản (tối đa 8 ảnh/lần)</label><input id="kbl-asset-photos" type="file" accept="image/*" multiple><div id="kbl-photo-list" class="kbl-photo-list"></div></div><div class="wide"><button id="kbl-compose-asset" type="button" class="btn btn-gray">Tạo tên tài sản từ thông tin trên</button></div></div>`;anchor.insertAdjacentElement('afterend',box);
    $('kbl-asset-category').onchange=renderAssetFields;$('kbl-valuation-mode').onchange=updateValuation;$('kbl-market-reference').oninput=updateValuation;$('kbl-loan-ratio').oninput=updateValuation;$('kbl-apply-loan').onclick=applySuggestedLoan;$('kbl-compose-asset').onclick=composeAssetName;$('kbl-asset-photos').onchange=onAssetPhotos;$('kbl-customer-photo').onchange=onCustomerPhoto; $('inp-money')?.addEventListener('input',updateValuation); $('inp-gold-price')?.addEventListener('input',()=>setTimeout(updateValuation,0));
    renderAssetFields();renderCustomerPhoto();
  }

  function openDataBox(){
    const d=dataDir(); const list=parseLocalContracts(); mirrorContracts(list);
    const msg=`Dữ liệu cầm đồ đang lưu tại:\n${d}\n\nPhiếu: ${list.length}\nẢnh CCCD: pawn_cccd_images\nẢnh tài sản: pawn_asset_images\nBản chính: pawn_contracts.json\nKhách hàng: pawn_customers.json`;
    if(confirm(msg+'\n\nBấm OK để mở thư mục dữ liệu.')){try{shell?.openPath?.(d);}catch(_){}}
  }
  function openStandaloneDeviceBox(){alert('Trong bản Cầm Đồ riêng, bấm “Tự cài thiết bị” ở thanh trên cùng để POS dò máy in, camera và cân.');}

  function injectStandaloneSettings(){
    if(window.parent!==window||$('kbl-pawn-settings-box'))return; const historyHeading=[...document.querySelectorAll('h2')].find(x=>/LỊCH SỬ|KHO DỮ LIỆU/i.test(x.textContent||''));const host=historyHeading?.parentElement||document.body;const box=document.createElement('details');box.id='kbl-pawn-settings-box';box.style.margin='14px 0';box.innerHTML=`<summary style="cursor:pointer;font-weight:900;color:#102a43;padding:10px;background:#f3efe7;border-radius:10px">⚙️ Cài đặt Cầm Đồ riêng</summary><div style="padding:12px;border:1px solid #e4ddd0;border-radius:0 0 10px 10px"><div class="kbl-pawn-pro-grid"><div class="wide"><label>Gemini API Key (đọc CCCD)</label><input id="kbl-pawn-gemini" type="password" placeholder="Để trống nếu không dùng AI"></div>${['9999','980','750','610','585','416'].map(c=>`<div><label>Giá MUA ${c} / chỉ</label><input id="kbl-buy-${c}" type="number"></div>`).join('')}<div class="wide"><button id="kbl-save-pawn-settings" type="button" class="btn btn-primary">💾 Lưu cài đặt</button></div></div></div>`;host.appendChild(box);
    const s=readStandaloneSettings();$('kbl-pawn-gemini').value=s.gemini_api_key||'';['9999','980','750','610','585','416'].forEach(c=>{$(`kbl-buy-${c}`).value=s[`price_buy_${c}`]||'';});
    $('kbl-save-pawn-settings').onclick=()=>{const out={gemini_api_key:$('kbl-pawn-gemini').value.trim()};['9999','980','750','610','585','416'].forEach(c=>out[`price_buy_${c}`]=Number($(`kbl-buy-${c}`).value||0)||0);saveStandaloneSettings(out);alert('✅ Đã lưu cài đặt Cầm Đồ trên máy.');try{applyPawnAutoGoldPrice(true);}catch(_){}};
  }

  function ensureBusinessModal(id,title){
    let modal=$(id); if(modal)return modal;
    modal=document.createElement('div'); modal.id=id; modal.style.cssText='position:fixed;inset:0;z-index:10950;background:rgba(15,23,42,.52);display:none;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML=`<div style="width:min(1050px,97vw);max-height:92vh;overflow:auto;background:#fffdf9;border-radius:16px;padding:18px;box-shadow:0 25px 80px rgba(0,0,0,.3)"><div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><h2 style="margin:0!important">${title}</h2><button data-close type="button">✕</button></div><div data-body style="margin-top:12px"></div></div>`;
    document.body.appendChild(modal); modal.querySelector('[data-close]').onclick=()=>modal.style.display='none'; modal.addEventListener('click',e=>{if(e.target===modal)modal.style.display='none';}); return modal;
  }
  function openCustomersModal(){
    const modal=ensureBusinessModal('kbl-customers-modal','👥 Hồ sơ khách hàng'); const body=modal.querySelector('[data-body]'); const contracts=parseLocalContracts(); const customers=buildCustomers(contracts).sort((a,b)=>String(b.lastSeenAt||'').localeCompare(String(a.lastSeenAt||'')));
    body.innerHTML=`<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input id="kbl-customer-search" placeholder="Tìm tên / SĐT / CCCD" style="flex:1"><b>${customers.length} khách</b></div><div style="overflow:auto"><table style="width:100%"><thead><tr><th>Khách hàng</th><th>CCCD</th><th>SĐT</th><th>Địa chỉ</th><th>Số phiếu</th><th>Phiếu gần nhất</th></tr></thead><tbody id="kbl-customer-rows"></tbody></table></div>`;
    const render=(q='')=>{const norm=String(q||'').toLowerCase().trim();const rows=customers.filter(c=>!norm||[c.name,c.cccd,c.phone,c.address].some(v=>String(v||'').toLowerCase().includes(norm)));$('kbl-customer-rows').innerHTML=rows.map(c=>`<tr><td><b>${htmlEscape(c.name||'')}</b></td><td>${htmlEscape(c.cccd||'')}</td><td>${htmlEscape(c.phone||'')}</td><td>${htmlEscape(c.address||'')}</td><td>${Number(c.contractCount||0)}</td><td>${htmlEscape(c.lastContractId||'')}</td></tr>`).join('')||'<tr><td colspan="6">Không có dữ liệu.</td></tr>';};
    render(); $('kbl-customer-search').oninput=e=>render(e.target.value); modal.style.display='flex';
  }
  function paymentCollected(contract){
    const history=Array.isArray(contract?.paymentHistory)?contract.paymentHistory:[];
    const fromHistory=history.reduce((sum,x)=>sum+(Number(x?.interestAmount||x?.interest||0)||0)+(Number(x?.feeAmount||x?.fee||0)||0),0);
    if(fromHistory>0)return fromHistory; return (Number(contract?.paidInterestTotal)||0)+(Number(contract?.paidFeeTotal)||0);
  }
  function pawnReportRows(from,to){
    const all=parseLocalContracts(); const within=c=>{const d=String(c?.dateStartRaw||'');return(!from||d>=from)&&(!to||d<=to);}; return all.filter(within);
  }
  function openPawnReportModal(){
    const modal=ensureBusinessModal('kbl-report-modal','📊 Báo cáo Cầm Đồ'); const body=modal.querySelector('[data-body]'); const now=new Date();const first=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;const today=now.toISOString().slice(0,10);
    body.innerHTML=`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end"><div><label>Từ ngày</label><input id="kbl-rp-from" type="date" value="${first}"></div><div><label>Đến ngày</label><input id="kbl-rp-to" type="date" value="${today}"></div><button id="kbl-rp-run" class="btn btn-primary" type="button">Xem báo cáo</button><button id="kbl-rp-csv" class="btn btn-gray" type="button">Xuất CSV</button></div><div id="kbl-rp-summary" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px"></div><div style="overflow:auto;margin-top:10px"><table style="width:100%"><thead><tr><th>Phiếu</th><th>Khách</th><th>Tài sản</th><th>Gốc</th><th>Trạng thái</th><th>Lãi + phí đã thu</th></tr></thead><tbody id="kbl-rp-rows"></tbody></table></div>`;
    const run=()=>{const rows=pawnReportRows($('kbl-rp-from').value,$('kbl-rp-to').value);const principal=rows.reduce((s,c)=>s+(Number(c.money)||0),0);const collected=rows.reduce((s,c)=>s+paymentCollected(c),0);const redeemed=rows.filter(c=>c.status==='Đã chuộc').length;const liquid=rows.filter(c=>c.status==='Đã thanh lý').length;$('kbl-rp-summary').innerHTML=[[rows.length,'Phiếu phát sinh'],[fmt(principal),'Tổng gốc'],[fmt(collected),'Lãi + phí đã thu'],[`${redeemed} / ${liquid}`,'Chuộc / Thanh lý']].map(([v,l])=>`<div class="kbl-stat"><b>${v}</b><span>${l}</span></div>`).join('');$('kbl-rp-rows').innerHTML=rows.map(c=>`<tr><td>${htmlEscape(c.id||'')}</td><td>${htmlEscape(c.name||'')}</td><td>${htmlEscape(c.asset||'')}</td><td>${fmt(c.money||0)}</td><td>${htmlEscape(c.status||'')}</td><td>${fmt(paymentCollected(c))}</td></tr>`).join('')||'<tr><td colspan="6">Không có dữ liệu.</td></tr>';return rows;};
    $('kbl-rp-run').onclick=run; $('kbl-rp-csv').onclick=()=>{const rows=run();if(!fs||!path)return alert('Không thể ghi file trên môi trường này.');const csv=['Ma phieu,Khach hang,CCCD,SDT,Tai san,Tien goc,Trang thai,Lai phi da thu',...rows.map(c=>[c.id,c.name,c.cccd,c.phone,c.asset,c.money,c.status,paymentCollected(c)].map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(','))].join('\ufeff\n');const file=path.join(dataDir(),`bao_cao_cam_do_${$('kbl-rp-from').value}_${$('kbl-rp-to').value}.csv`);fs.writeFileSync(file,'\ufeff'+csv.replace(/^\ufeff/,''),'utf8');alert('✅ Đã xuất: '+file);};
    run(); modal.style.display='flex';
  }
  function createLostModal(){
    if($('kbl-lost-modal'))return;const modal=document.createElement('div');modal.id='kbl-lost-modal';modal.style.cssText='position:fixed;inset:0;z-index:11000;background:rgba(15,23,42,.52);display:none;align-items:center;justify-content:center;padding:16px';modal.innerHTML=`<div style="width:min(900px,97vw);max-height:92vh;overflow:auto;background:#fffdf9;border-radius:16px;padding:18px;box-shadow:0 25px 80px rgba(0,0,0,.3)"><div style="display:flex;justify-content:space-between;gap:10px"><div><h2 style="margin:0!important">📝 Chuộc đồ mất giấy</h2><div id="kbl-lost-summary" style="color:#64748b;margin-top:4px"></div></div><button id="kbl-lost-close" type="button">✕</button></div><div class="kbl-pawn-pro-grid" style="margin-top:12px"><div><label>Ngày báo mất</label><input id="kbl-lost-date" type="date"></div><div><label>SĐT xác nhận</label><input id="kbl-lost-phone"></div><div class="wide"><label>Lý do / hoàn cảnh mất</label><textarea id="kbl-lost-reason" rows="3"></textarea></div><div class="wide" style="background:#f7f3ea;padding:10px;border-radius:10px"><label><input id="kbl-lost-check-cccd" type="checkbox"> Đã đối chiếu CCCD/CMND bản gốc và ảnh hồ sơ.</label><br><label><input id="kbl-lost-check-info" type="checkbox"> Đã đối chiếu người giao dịch, tài sản, ngày cầm và thông tin phiếu.</label><br><label><input id="kbl-lost-check-sign" type="checkbox"> Khách đã đọc, hiểu và tự nguyện ký cam kết.</label></div><div class="wide" style="display:flex;gap:8px;flex-wrap:wrap"><button id="kbl-lost-save" class="btn btn-gold" type="button">💾 Lưu cam kết</button><button id="kbl-lost-print" class="btn btn-primary" type="button">🖨️ In A4</button></div></div><div id="kbl-lost-preview" style="margin-top:14px;border:1px solid #d8d2c7;background:white;padding:16px;border-radius:10px"></div></div>`;document.body.appendChild(modal);$('kbl-lost-close').onclick=()=>modal.style.display='none';modal.addEventListener('click',e=>{if(e.target===modal)modal.style.display='none';});['kbl-lost-date','kbl-lost-phone','kbl-lost-reason'].forEach(id=>$(id).addEventListener('input',renderLostPreview));$('kbl-lost-save').onclick=saveLost;$('kbl-lost-print').onclick=printLost;
  }
  let lostRecord=null;
  function lostHtml(){
    const r=lostRecord||{};const report=$('kbl-lost-date')?.value||'…………';const phone=$('kbl-lost-phone')?.value||r.phone||'…………';const reason=$('kbl-lost-reason')?.value||'Không ghi thêm';
    return `<div style="font-family:Arial;color:#111;font-size:12px"><div style="text-align:center;font-weight:800" data-shop-field="companyName">${htmlEscape(window.KBLShop?.companyName?.()||'CƠ SỞ CẦM ĐỒ')}</div><div style="text-align:center;font-size:11px">${htmlEscape(window.KBLShop?.value?.('address','')||'')} · ${htmlEscape(window.KBLShop?.value?.('phone','')||'')}</div><h1 style="text-align:center;font-size:19px">BIÊN BẢN XÁC NHẬN MẤT PHIẾU CẦM<br>VÀ ĐỀ NGHỊ NHẬN LẠI TÀI SẢN</h1><p><b>Phiếu:</b> ${htmlEscape(r.id||'')} &nbsp; <b>Họ tên:</b> ${htmlEscape(r.name||'')} &nbsp; <b>CCCD:</b> ${htmlEscape(r.cccd||'')}</p><p><b>SĐT:</b> ${htmlEscape(phone)} &nbsp; <b>Ngày cầm:</b> ${htmlEscape(r.dateStart||r.dateStartRaw||'')}</p><p><b>Tài sản:</b> ${htmlEscape(r.asset||'')}</p><p><b>Tiền gốc:</b> ${fmt(r.money||0)} &nbsp; <b>Tổng tiền chuộc dự kiến:</b> ${htmlEscape(r.redeemTotalText||'')}</p><h3>1. Xác nhận mất phiếu</h3><p>Tôi xác nhận phiếu cầm do tôi giữ đã bị mất/thất lạc. Ngày báo mất: <b>${htmlEscape(report)}</b>. Lý do/hoàn cảnh: ${htmlEscape(reason)}.</p><h3>2. Cam kết của khách hàng</h3><ol><li>Thông tin nhân thân, giao dịch và tài sản tôi cung cấp là đúng.</li><li>Tôi là người giao dịch hoặc người có quyền hợp pháp nhận lại tài sản sau khi cơ sở xác minh.</li><li>Phiếu đã báo mất không được chuyển giao hoặc dùng để nhận tài sản lần nữa.</li><li>Tôi chỉ nhận tài sản sau khi hoàn thành đầy đủ nghĩa vụ theo hợp đồng.</li><li>Tôi chịu trách nhiệm đối với khai báo gian dối, giả mạo giấy tờ hoặc xâm phạm quyền của người khác.</li><li>Nếu tìm lại phiếu cũ sau khi nhận tài sản, phiếu đó không còn giá trị thực hiện giao dịch.</li></ol><h3>3. Xác minh của cơ sở</h3><p>☐ Đối chiếu CCCD &nbsp; ☐ Đối chiếu hồ sơ/tài sản &nbsp; ☐ Khách tự nguyện ký</p><div style="display:grid;grid-template-columns:1fr 1fr 1fr;text-align:center;margin-top:34px"><b>KHÁCH HÀNG</b><b>NGƯỜI KIỂM TRA</b><b>NGƯỜI DUYỆT</b></div></div>`;
  }
  function renderLostPreview(){if($('kbl-lost-preview'))$('kbl-lost-preview').innerHTML=lostHtml();}
  function openLostStandalone(record){lostRecord=record;createLostModal();$('kbl-lost-summary').textContent=`${record.id||''} · ${record.name||''} · ${record.asset||''}`;$('kbl-lost-date').value=new Date().toISOString().slice(0,10);$('kbl-lost-phone').value=record.phone||'';$('kbl-lost-reason').value='';['kbl-lost-check-cccd','kbl-lost-check-info','kbl-lost-check-sign'].forEach(id=>$(id).checked=false);renderLostPreview();$('kbl-lost-modal').style.display='flex';}
  function saveLost(){if(!lostRecord?.id)return;if(!['kbl-lost-check-cccd','kbl-lost-check-info','kbl-lost-check-sign'].every(id=>$(id).checked))return alert('Cần hoàn tất đủ 3 bước xác minh trước khi lưu.');const file=path.join(dataDir(),'pawn_lost_declarations.json');const list=readJson(file,[]);const id=`MAT-${lostRecord.id}`;const rec={id,pawnId:lostRecord.id,name:lostRecord.name||'',cccd:lostRecord.cccd||'',phone:$('kbl-lost-phone').value.trim(),reportDate:$('kbl-lost-date').value,reason:$('kbl-lost-reason').value.trim(),status:'Đã lập cam kết',pawnSnapshot:lostRecord,updatedAt:new Date().toISOString()};const idx=list.findIndex(x=>x.id===id);if(idx>=0)list[idx]=rec;else list.unshift(rec);atomicWriteJson(file,list);try{const contracts=parseLocalContracts();const ci=contracts.findIndex(x=>String(x?.id||'')===String(lostRecord.id));if(ci>=0){contracts[ci]={...contracts[ci],lostTicketDeclarationId:id,lostTicketDeclaredAt:new Date().toISOString(),ticketDocumentStatus:'MẤT_PHIẾU'};localStorage.setItem('kimBaoLamData',JSON.stringify(contracts));mirrorContracts(contracts);}}catch(_){}alert('✅ Đã lưu hồ sơ chuộc mất giấy trên máy.');}
  async function printLost(){if(!lostRecord?.id)return;saveLost();try{const r=await ipc?.invoke('gold:print-a4-document',{html:`<!doctype html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:12mm}body{margin:0;font-family:Arial}h1{font-size:19px}h3{margin:12px 0 4px}li{margin:5px 0;line-height:1.35}</style></head><body>${lostHtml()}</body></html>`,deviceName:localStorage.getItem('kbl_invoice_printer')||''});if(!r?.success)alert('Chưa in được: '+(r?.failureReason||''));}catch(e){window.print();}}
  function installLostOverride(){
    const old=window.openLostTicketDeclaration;
    window.openLostTicketDeclaration=function(){
      if(window.parent!==window&&typeof old==='function')return old();
      const id=String($('inp-id')?.value||'').trim();if(!id)return alert('Hãy mở đúng phiếu cầm trước.');const rec=parseLocalContracts().find(x=>String(x.id||'')===id);if(!rec)return alert('Không tìm thấy phiếu.');if(['Đã chuộc','Đã thanh lý'].includes(rec.status))return alert(`Phiếu đã ${rec.status}.`);try{tinhLaiCamDo();}catch(_){}openLostStandalone({...rec,redeemTotalText:$('out-tong-tra')?.value||''});
    };
  }

  function boot(){
    recoverContracts();installPriceFallbacks();addTopUi();addAssetUi();injectStandaloneSettings();createLostModal();installWrappers();installLostOverride();mirrorContracts(parseLocalContracts());updateDashboard();
    window.addEventListener('beforeunload',()=>mirrorContracts(parseLocalContracts()));
    setTimeout(()=>{try{window.loadHistory?.();}catch(_){}updateDashboard();},300);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
