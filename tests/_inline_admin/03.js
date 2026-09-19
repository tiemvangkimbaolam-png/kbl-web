
// KBL ADMIN SPEED 20260913: bound read concurrency, share only in-flight reads.
const kblAdminSpeed = (() => {
  const nativeFetch = window.fetch.bind(window), pending = new Map(), queue = [], cooldowns = new Map();
  let active = 0, generation = 0, total = 0, shared = 0, failures = 0;
  const MAX = 4;
  function drain() {
    while (active < MAX && queue.length) {
      const task = queue.shift(); active++;
      Promise.resolve().then(task.run).then(task.resolve, task.reject).finally(() => { active--; drain(); });
    }
  }
  function schedule(run) { return new Promise((resolve,reject) => { queue.push({run,resolve,reject}); drain(); }); }
  function retryResponse(until, scope) {
    const seconds=Math.max(1,Math.ceil((until-Date.now())/1000));
    return new Response(JSON.stringify({success:false,message:'Đang chờ hạn mức đọc dữ liệu. Vui lòng thử lại sau '+seconds+' giây.',retryAfterSeconds:seconds,rateLimitScope:scope}),
      {status:429,headers:{'Content-Type':'application/json','Retry-After':String(seconds),'RateLimit-Scope':scope}});
  }
  function cooldown(key,url) {
    for(const suffix of ['*',url]) {
      const k=key+'|'+suffix, item=cooldowns.get(k);
      if(item&&item.until>Date.now())return retryResponse(item.until,item.scope);
      if(item)cooldowns.delete(k);
    }
    return null;
  }
  window.fetch = function(input,options) {
    let url;
    try { url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,location.href); }
    catch(_){return nativeFetch(input,options);}
    if(url.origin!==location.origin||!url.pathname.startsWith('/api/admin/'))return nativeFetch(input,options);
    const opts=options||{},method=String(opts.method||(input instanceof Request?input.method:'GET')).toUpperCase();
    // Writes/uploads keep native fetch behavior. Never coalesce or retry them.
    if(method!=='GET') { const productWrite=/^\/api\/admin\/(products(?:\/|$)|content\/|local-ai\/)/.test(url.pathname);if(productWrite)window.kblProductWriteVersion=(window.kblProductWriteVersion||0)+1;generation++;return nativeFetch(input,options).finally(()=>{generation++;if(productWrite)window.kblProductWriteVersion=(window.kblProductWriteVersion||0)+1;}); }
    const h=new Headers(opts.headers||(input instanceof Request?input.headers:undefined));
    // Streaming/range/cancellable Request consumers retain their native semantics.
    if(input instanceof Request||opts.signal||h.has('range')||h.get('accept')?.includes('text/event-stream')||/\/(stream|download|export)(\/|$)/.test(url.pathname))return nativeFetch(input,options);
    const auth=h.get('x-kbl-admin-token')||'';
    const context=JSON.stringify([auth,opts.credentials||'same-origin']);
    const urlKey=url.pathname+url.search;
    const blocked=cooldown(context,urlKey);if(blocked){failures++;return Promise.resolve(blocked);}
    const key=JSON.stringify([generation,url.href,[...h.entries()].sort(),opts.credentials||'same-origin',opts.cache||'',opts.mode||'',opts.redirect||'']);
    let job=pending.get(key);
    if(job)shared++;
    else {
      // Snapshot headers so a queued request cannot pick up later mutations.
      const fixed={...opts,headers:new Headers(h)};
      job=schedule(async()=>{
        const laterBlocked=cooldown(context,urlKey);
        if(laterBlocked){failures++;return {response:laterBlocked,bytes:await laterBlocked.arrayBuffer()};}
        total++;
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),60000);
        try {
          const response=await nativeFetch(input,{...fixed,signal:controller.signal});
          // Hold the slot until the body arrives, not just until headers arrive.
          const bytes=await response.arrayBuffer();
          if(!response.ok)failures++;
          if(response.status===429){
            const raw=response.headers.get('Retry-After'),numeric=Number(raw);
            const seconds=raw?(Number.isFinite(numeric)?numeric:(Date.parse(raw)-Date.now())/1000):1;
            const scope=response.headers.get('RateLimit-Scope')||'';
            const whole=['global','admin-api','global-admin-read','admin-read'].includes(scope);
            // Bounded metadata only; no response payload or successful data is cached.
            if(cooldowns.size>=100)cooldowns.clear();
            cooldowns.set(context+'|'+(whole?'*':urlKey),{until:Date.now()+Math.max(1,Math.min(600,seconds||1))*1000,scope});
          }
          return {response,bytes};
        }catch(error){failures++;throw error;}
        finally{clearTimeout(timer);}
      });
      pending.set(key,job);
      job.then(()=>{if(pending.get(key)===job)pending.delete(key);},()=>{if(pending.get(key)===job)pending.delete(key);});
    }
    return job.then(({response,bytes})=>{
      const copy=new Response([204,205,304].includes(response.status)?null:bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
      Object.defineProperties(copy,{url:{value:response.url},redirected:{value:response.redirected},type:{value:response.type}});
      return copy;
    });
  };
  return { get failures(){return failures;},stats:()=>({active,queued:queue.length,total,shared,failures}) };
})();
    const $ = (id) => document.getElementById(id);
    const ADMIN_VIEW_LABELS={autonomous:['Sales Studio','Cơ hội → ý tưởng → video / hình ảnh → QA → đăng → bán hàng'],dashboard:['Tổng quan','AI Director, Gold Watch, analytics và việc cần xử lý'],products:['Sản phẩm & POS','Duyệt SKU mới, gắn media gốc và phân kệ'],studio:['Content Studio','Ảnh thật → ảnh trưng bày → prompt nội dung'],video:['Video Studio','AI plan → Gemini/Veo web → RAW → Local Worker'],publisher:['Xuất bản','Caption Engine V2 + OAuth/API thật'],live:['Live Center','Danh sách SKU + teleprompter + media đã duyệt'],globalai:['AI Global','Knowledge Hub · Discovery · GEO/AEO · Feed'],promptai:['Prompt AI','Gemini tư vấn → DeepSeek Prompt cuối → lượt & thanh toán'],customers:['Khách & Đơn','Đơn hàng · CRM · VIP · Try-on'],operations:['Vận hành','Commerce & Trust · AI Knowledge'],settings:['Cài đặt','Social API · Tiệm & giao hàng']};
    const ADMIN_SUBTABS={customers:[['orders','Đơn hàng'],['crm','CRM'],['vip','VIP & Tri ân'],['tryon','AI Try-on']],operations:[['commerce','Commerce & Trust'],['knowledge','AI Knowledge']],settings:[['social','Social API'],['shop','Tiệm & giao hàng']]};
    const adminSubtabState={};
    function selectAdminSubtab(view,tab){const tabs=ADMIN_SUBTABS[view]||[],chosen=tabs.some(x=>x[0]===tab)?tab:(tabs[0]&&tabs[0][0]||'');adminSubtabState[view]=chosen;document.querySelectorAll('[data-admin-group="'+view+'"][data-admin-subtab]').forEach(section=>{section.hidden=section.dataset.adminSubtab!==chosen});renderAdminSubnav(view)}
    function renderAdminSubnav(view){const box=$('admin-subnav'),tabs=ADMIN_SUBTABS[view]||[];if(!box)return;if(!tabs.length){box.hidden=true;box.innerHTML='';return}const active=adminSubtabState[view]||tabs[0][0];box.hidden=false;box.innerHTML=tabs.map(([id,label])=>'<button type="button" data-admin-subtab-button="'+safe(id)+'" class="'+(id===active?'active':'')+'">'+safe(label)+'</button>').join('');box.querySelectorAll('[data-admin-subtab-button]').forEach(b=>b.onclick=()=>selectAdminSubtab(view,b.dataset.adminSubtabButton))}
    function showAdminView(view,scrollTop=true){
      const chosen=ADMIN_VIEW_LABELS[view]?view:'dashboard';
      document.querySelectorAll('[data-admin-group]').forEach(section=>{section.hidden=section.dataset.adminGroup!==chosen});
      document.querySelectorAll('[data-admin-view]').forEach(button=>button.classList.toggle('active',button.dataset.adminView===chosen));
      if(ADMIN_SUBTABS[chosen])selectAdminSubtab(chosen,adminSubtabState[chosen]||ADMIN_SUBTABS[chosen][0][0]);else renderAdminSubnav(chosen);
      try{sessionStorage.setItem('kbl_admin_view',chosen)}catch(_){}
      if(window.KBLCompactAdmin)window.KBLCompactAdmin.onView(chosen);
      if(chosen==='autonomous'){
        const imagePanel=document.querySelector('[data-sales-studio-panel="image"]');
        if(imagePanel&&imagePanel.classList.contains('active')&&typeof window.KBLSalesStudioImageBoot==='function')window.KBLSalesStudioImageBoot();
      }
      if(scrollTop)window.scrollTo({top:0,behavior:'smooth'});
    }
    function initAdminNavigation(){
      document.querySelectorAll('[data-admin-view]').forEach(button=>button.addEventListener('click',()=>showAdminView(button.dataset.adminView)));
      let initial='dashboard';try{initial=sessionStorage.getItem('kbl_admin_view')||'dashboard'}catch(_){}
      showAdminView(initial,false);
    }
    const productState = { image: '', tryOnImage: '', editingId: '', source: 'manual', publicationStatus: 'published', products: [] };
    // KBL IMAGE IDENTITY FIX: each async image belongs to its originating editor/SKU.
    const kblMediaUi={editorEpoch:0,contentEpoch:0,reads:{},serial:0,editorSaving:false,contentSaving:false,imageDirty:false,tryOnDirty:false,baseImage:'',baseTryOnImage:''};
    function kblResetEditorMedia(product){
      kblMediaUi.editorEpoch++;kblMediaUi.imageDirty=false;kblMediaUi.tryOnDirty=false;
      kblMediaUi.baseImage=product?.image||'';kblMediaUi.baseTryOnImage=product?.tryOnImage||'';
      delete kblMediaUi.reads.image;delete kblMediaUi.reads.tryon;
    }
    function kblResetContentMedia(){kblMediaUi.contentEpoch++;delete kblMediaUi.reads.source;delete kblMediaUi.reads.display;}
    function kblContentContext(){return {id:String($('content-product')?.value||''),epoch:kblMediaUi.contentEpoch};}
    function kblContentCurrent(context){return context.epoch===kblMediaUi.contentEpoch&&context.id===String($('content-product')?.value||'');}
    function kblBeginImageRead(key,area){const state={serial:++kblMediaUi.serial,area,epoch:area==='editor'?kblMediaUi.editorEpoch:kblMediaUi.contentEpoch,status:'pending'};kblMediaUi.reads[key]=state;return state;}
    function kblImageReadCurrent(key,state){return kblMediaUi.reads[key]===state&&state.epoch===(state.area==='editor'?kblMediaUi.editorEpoch:kblMediaUi.contentEpoch);}
    function kblMediaNotReady(keys){return keys.some(key=>['pending','error'].includes(kblMediaUi.reads[key]?.status));}
    function kblMediaError(error){return error?.name==='AbortError'||error?.name==='TimeoutError'?'Máy chủ chưa trả đủ dữ liệu trong thời gian chờ. Bấm TẢI DỮ LIỆU để kiểm tra; không bấm lưu lại liên tục.':(error?.message||'Không xử lý được yêu cầu.');}
    async function kblMediaJson(response){let data;try{data=await response.json();}catch(_){throw new Error('Máy chủ trả dữ liệu không hợp lệ (HTTP '+response.status+'). Hãy tải lại kho để kiểm tra kết quả.');}if(!response.ok||!data.success)throw new Error(data.message||'Yêu cầu thất bại (HTTP '+response.status+').');return data;}
    function kblMergeProduct(product,expectedId){
      if(!product||String(product.id)!==String(expectedId))throw new Error('Mã sản phẩm trả về không khớp. Đã dừng để tránh gán nhầm ảnh.');
      const local=productState.products.find(p=>String(p.id)===String(expectedId));if(local)Object.assign(local,product);
      if(String(productState.editingId)===String(expectedId)){
        if(!kblMediaUi.imageDirty&&!kblMediaNotReady(['image'])){productState.image=product.image||'';kblMediaUi.baseImage=productState.image;setPreview(productState.image,'Ảnh hiện tại của '+(product.sku||expectedId));}
        if(!kblMediaUi.tryOnDirty&&!kblMediaNotReady(['tryon'])){productState.tryOnImage=product.tryOnImage||'';kblMediaUi.baseTryOnImage=productState.tryOnImage;setTryOnPreview(productState.tryOnImage);}
      }
      return local||product;
    }
    function kblMediaStatus(context,text){if(kblContentCurrent(context))$('content-status').textContent=text;}
    async function kblSaveDisplayFor(context){
      if(!context.id)throw new Error('Hãy chọn sản phẩm trước.');
      if(kblMediaNotReady(['display']))throw new Error('Ảnh trưng bày chưa đọc xong hoặc bị lỗi. Hãy chờ ảnh xem trước hợp lệ.');
      const image=contentState.displayUploadImage;if(!image)throw new Error('Hãy tải ảnh trưng bày trước.');
      const data=await kblMediaJson(await fetch('/api/admin/content/save-display-image',{method:'POST',headers:headers(true),body:JSON.stringify({productId:context.id,imageDataUrl:image})}));
      kblMergeProduct(data.product,context.id);
      if(kblContentCurrent(context)){contentState.product={...data.product};contentState.assets.displayCandidateImage=data.image;if(contentState.displayUploadImage===image)contentState.displayUploadImage='';updateContentAssetPreviews();}
      return data;
    }
    async function kblApproveDisplayFor(context){
      if(!context.id)throw new Error('Hãy chọn sản phẩm trước.');
      if(kblMediaNotReady(['display']))throw new Error('Ảnh trưng bày chưa sẵn sàng; chưa duyệt ảnh cũ.');
      const displayRead=kblMediaUi.reads.display;
      let candidate=contentState.assets.displayCandidateImage||selectedContentProduct()?.displayCandidateImage||'';
      if(contentState.displayUploadImage){const saved=await kblSaveDisplayFor(context);candidate=saved.image;}
      if(displayRead!==kblMediaUi.reads.display||kblMediaNotReady(['display']))throw new Error('Ảnh vừa thay đổi trong lúc lưu. Hãy xem lại trước khi duyệt.');
      if(!kblContentCurrent(context))throw new Error('Đã đổi sản phẩm. Ảnh vừa lưu chỉ thuộc mã '+context.id+'; chưa duyệt hoặc trưng bày.');
      if(!candidate)throw new Error('Chưa có ảnh trưng bày chờ duyệt cho sản phẩm này.');
      const data=await kblMediaJson(await fetch('/api/admin/content/approve-display-image',{method:'POST',headers:headers(true),body:JSON.stringify({productId:context.id,expectedCandidateImage:candidate})}));
      kblMergeProduct(data.product,context.id);
      if(kblContentCurrent(context)){contentState.product={...data.product};contentState.assets.displayImage=data.image;contentState.assets.displayCandidateImage='';contentState.displayUploadImage='';renderContentProductPreview();renderAdminProducts();await drawContentCover();}
      return data;
    }
    async function kblDisplayAction(action){
      const context=kblContentContext();if(kblMediaUi.contentSaving){kblMediaStatus(context,'Đang lưu/duyệt ảnh, vui lòng chờ kết quả.');return null;}
      kblMediaUi.contentSaving=true;
      const controls=['content-display-save','content-display-approve','content-display-restore','content-display-file'].map($).filter(Boolean),states=controls.map(b=>b.disabled);controls.forEach(b=>b.disabled=true);
      try{return await action(context);}catch(error){kblMediaStatus(context,'❌ '+kblMediaError(error));return null;}finally{kblMediaUi.contentSaving=false;controls.forEach((b,i)=>b.disabled=states[i]);}
    }
    async function kblReadProductPages(signal,onProgress=()=>{}){
      // Opt-in small responses; old servers still return the full list in one response.
      for(let attempt=0;attempt<3;attempt++){
        const version=window.kblProductWriteVersion||0;let offset=0,revision='',rows=[],restart=false;
        do{
          const response=await fetch('/api/admin/products?limit=25&offset='+offset+(revision?'&revision='+encodeURIComponent(revision):''),{headers:headers(false),cache:'no-store',signal});
          let data;try{data=await kblMediaJson(response);}catch(error){if(response.status===409){restart=true;break;}throw error;}
          if(!Array.isArray(data.products))throw new Error('Danh sách sản phẩm trả về không hợp lệ.');
          rows.push(...data.products);revision=data.revision||revision;onProgress(rows.length,data.total);
          if(data.nextOffset==null)break;
          if(!Number.isSafeInteger(data.nextOffset)||data.nextOffset<=offset)throw new Error('Phân trang kho không hợp lệ.');
          offset=data.nextOffset;
        }while(true);
        if(restart||version!==(window.kblProductWriteVersion||0))continue;
        if(new Set(rows.map(p=>String(p.id))).size!==rows.length)throw new Error('Kho trả về mã nội bộ bị trùng. Đã giữ danh sách hiện tại để tránh sửa nhầm sản phẩm.');
        return rows;
      }
      throw new Error('Kho đang thay đổi trong lúc tải. Đã giữ dữ liệu hiện tại; bấm TẢI DỮ LIỆU lại khi thao tác lưu hoàn tất.');
    }

    const productFieldMap = {
      'product-symbol': 'productSymbol',
      'attached-weight': 'attachedWeightChi',
      'total-weight': 'totalWeightChi',
      'size-label': 'sizeLabel',
      'origin': 'origin',
      'producer-name': 'producerName',
      'producer-code': 'producerCode',
      'producer-address': 'producerAddress',
      'supplier-name': 'supplierName',
      'supplier-address': 'supplierAddress',
      'applicable-standard': 'applicableStandard',
      'special-mark': 'specialMark',
      'warnings': 'warnings',
      'description': 'description',
      'detail': 'detail'
    };
    const displayShelfOptions = Object.freeze({
      'Nhẫn': [
        { value: '', label: '— Chọn ô nhẫn —' },
        { value: 'ring-men', label: 'Nhẫn nam' },
        { value: 'ring-women', label: 'Nhẫn nữ' },
        { value: 'ring-wedding', label: 'Nhẫn cưới' }
      ],
      'Dây chuyền': [
        { value: '', label: '— Chọn ô dây —' },
        { value: 'necklace-no-pendant', label: 'Dây không mặt' },
        { value: 'necklace-with-pendant', label: 'Dây có mặt' },
        { value: 'neck-ring', label: 'Kiềng cổ' }
      ],
      'Mặt dây': [
        { value: 'pendant', label: 'Mặt dây bán rời' }
      ],
      'Bông tai': [
        { value: '', label: '— Chọn ô bông tai —' },
        { value: 'earring-long', label: 'Bông đuôi dài' },
        { value: 'earring-stud', label: 'Bông sát tai' },
        { value: 'earring-short', label: 'Bông đuôi ngắn' }
      ],
      'Lắc tay': [
        { value: '', label: '— Chọn Lắc tay hoặc Vòng —' },
        { value: 'bracelet', label: 'Lắc tay' },
        { value: 'hand-bangle', label: 'Vòng tay' },
        { value: 'ximen', label: 'Vòng Ximen' },
        { value: 'bracelet-child', label: 'Vòng em bé' },
        { value: 'bracelet-adult', label: 'Vòng người lớn' }
      ],
      'Trang sức': [ { value: '', label: 'Trang sức khác' } ]
    });
    const displayShelfLabels = Object.freeze({
      'ring-men':'Nhẫn nam', 'ring-women':'Nhẫn nữ', 'ring-wedding':'Nhẫn cưới',
      'necklace-no-pendant':'Dây không mặt', 'necklace-with-pendant':'Dây có mặt', 'neck-ring':'Kiềng cổ', 'pendant':'Mặt dây bán rời',
      'earring-long':'Bông đuôi dài', 'earring-stud':'Bông sát tai', 'earring-short':'Bông đuôi ngắn',
      'bracelet':'Lắc tay', 'hand-bangle':'Vòng tay', 'ximen':'Vòng Ximen', 'bracelet-child':'Vòng em bé', 'bracelet-adult':'Vòng người lớn'
    });
    function displayShelfLabel(value) { return displayShelfLabels[String(value || '')] || ''; }
    function displayGoldShelfLabel(value) {
      const code = String(value || 'none');
      return code === '9999' ? 'Kệ vàng 9999' : code === '980' ? 'Kệ vàng 980' : 'Không vào kệ vàng';
    }
    function syncGoldShelfOptions(preferred) {
      const select = $('gold-shelf');
      if (!select) return;
      const actualGold = String($('gold')?.value || '').trim();
      const oldProduct = productState.editingId ? productState.products.find((p) => String(p.id) === String(productState.editingId)) : null;
      const legacy = oldProduct && oldProduct.displayGoldShelf !== undefined
        ? String(oldProduct.displayGoldShelf || 'none')
        : (['9999','980'].includes(actualGold) ? actualGold : 'none');
      const wanted = preferred === undefined ? (select.value || legacy) : String(preferred || 'none');
      Array.from(select.options).forEach((option) => {
        option.disabled = (option.value === '9999' || option.value === '980') && ['9999','980'].includes(actualGold) && option.value !== actualGold;
      });
      const safeWanted = ['none','9999','980'].includes(wanted) ? wanted : legacy;
      select.value = (safeWanted === '9999' || safeWanted === '980') && ['9999','980'].includes(actualGold) && safeWanted !== actualGold
        ? actualGold
        : safeWanted;
    }
    function syncDisplayShelfOptions(preferred) {
      const select = $('display-shelf');
      if (!select) return;
      const options = displayShelfOptions[$('category')?.value || 'Trang sức'] || displayShelfOptions['Trang sức'];
      const current = preferred === undefined ? select.value : String(preferred || '');
      select.innerHTML = options.map((option) => '<option value="' + safe(option.value) + '">' + safe(option.label) + '</option>').join('');
      select.value = options.some((option) => option.value === current) ? current : options[0].value;
      updateDisplayShelfFeedback();
    }
    function shelfSelectionRequired(category) { return ['Nhẫn','Dây chuyền','Mặt dây','Bông tai','Lắc tay'].includes(String(category || '')); }
    function displayShelfSelectionValid() {
      const category = $('category').value;
      const value = $('display-shelf').value;
      const options = displayShelfOptions[category] || displayShelfOptions['Trang sức'];
      return options.some(option => option.value === value) && (!shelfSelectionRequired(category) || Boolean(value));
    }
    function updateDisplayShelfFeedback() {
      const select = $('display-shelf');
      if (!select) return;
      const valid = displayShelfSelectionValid();
      if (valid) select.removeAttribute('aria-invalid');
      if ($('status').dataset.fieldError === 'display-shelf' && valid) {
        msg('ℹ️ Đã chọn ' + (displayShelfLabel(select.value) || 'Trang sức khác') + '. Bấm LƯU để cập nhật sản phẩm.', true);
      }
    }
    const posManagedFieldIds = [
      'sku', 'name', 'gold', 'weight', 'work',
      'product-symbol', 'attached-weight', 'total-weight', 'producer-name',
      'producer-code', 'producer-address', 'supplier-name', 'supplier-address',
      'applicable-standard', 'special-mark'
    ];
    function setPosManagedFields(isPos) {
      posManagedFieldIds.forEach((id) => {
        const field = $(id);
        if (field) field.readOnly = Boolean(isPos);
      });
      $('origin').readOnly = true;
      $('origin').value = 'Việt Nam';
      if ($('category')) $('category').disabled = false;
      $('legal-source-note').textContent = isPos
        ? 'Hàng có sẵn: Mã SP, tên, vàng, trọng lượng, công và tem/TCCS lấy từ POS. Riêng KỆ HIỂN THỊ, Ô TRƯNG BÀY CHI TIẾT và KỆ VÀNG 9999/980 được Admin chọn tại đây; POS đồng bộ lại cũng không ghi đè.'
        : 'Hàng tham khảo: ông nhập tay thông tin thực tế; xuất xứ được khóa là Việt Nam.';
    }
    function headers(json) {
      const result = {};
      if (json) result['Content-Type'] = 'application/json';
      if ($('token').value.trim()) result['X-KBL-Admin-Token'] = $('token').value.trim();
      return result;
    }
    function msg(text, good, fieldError = '') {
      $('status').textContent = text;
      $('status').style.color = good ? '#168b57' : '#c0392b';
      $('status').dataset.fieldError = fieldError;
    }
    function money(value) { return new Intl.NumberFormat('vi-VN').format(Number(value) || 0) + 'đ'; }
    function safe(value) {
      const span = document.createElement('span');
      span.textContent = value === undefined || value === null ? '' : String(value);
      return span.innerHTML;
    }
    function dateTime(value) {
      const date = new Date(value || '');
      if (!Number.isFinite(date.getTime())) return 'Chưa có lần đồng bộ';
      return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function renderTraffic(traffic) {
      const today=traffic.today||{};$('traffic-today').textContent=Number(today.pageViews||0).toLocaleString('vi-VN');$('traffic-unique').textContent=Number(today.uniqueVisitors||0).toLocaleString('vi-VN');$('traffic-online').textContent=Number(traffic.onlineApprox||0).toLocaleString('vi-VN');$('traffic-total').textContent=Number(traffic.totalPageViews||0).toLocaleString('vi-VN');$('traffic-last').textContent=traffic.lastSeenAt?'Gần nhất '+dateTime(traffic.lastSeenAt):'Bắt đầu ghi từ bản V5';
      const daily=Array.isArray(traffic.daily)?traffic.daily:[];$('traffic-daily').innerHTML=daily.length?'<table class="v5-mini-table"><thead><tr><th>Ngày</th><th>Lượt xem</th><th>Khách ước tính</th></tr></thead><tbody>'+daily.map(x=>'<tr><td>'+safe(x.date)+'</td><td><b>'+Number(x.pageViews||0).toLocaleString('vi-VN')+'</b></td><td>'+Number(x.uniqueVisitors||0).toLocaleString('vi-VN')+'</td></tr>').join('')+'</tbody></table>':'<div class="empty">Chưa có lượt truy cập sau khi bật thống kê.</div>';
      const paths=Array.isArray(traffic.topPaths)?traffic.topPaths:[];$('traffic-paths').innerHTML=paths.length?'<table class="v5-mini-table"><thead><tr><th>Trang</th><th>Lượt 7 ngày</th></tr></thead><tbody>'+paths.map(x=>'<tr><td><span class="sku">'+safe(x.path)+'</span></td><td><b>'+Number(x.pageViews||0).toLocaleString('vi-VN')+'</b></td></tr>').join('')+'</tbody></table>':'<div class="empty">Chưa đủ dữ liệu.</div>';
      const sources=Array.isArray(traffic.topSources)?traffic.topSources:[];if($('traffic-sources'))$('traffic-sources').innerHTML=sources.length?'<table class="v5-mini-table"><thead><tr><th>Nguồn</th><th>Lượt 7 ngày</th></tr></thead><tbody>'+sources.map(x=>'<tr><td><b>'+safe(x.source||'Direct')+'</b></td><td>'+Number(x.pageViews||0).toLocaleString('vi-VN')+'</td></tr>').join('')+'</tbody></table>':'<div class="empty">Bắt đầu ghi nguồn từ V6.3; dữ liệu cũ vẫn giữ nguyên.</div>';
    }
    async function loadAiSchool(){
      try{const r=await fetch('/api/admin/ai-knowledge',{headers:headers(false),cache:'no-store'}),d=await r.json();if(!r.ok||!d.success||!d.knowledge)throw new Error(d.message||'Không tải được kho AI');renderAiSchool(d.knowledge);}catch(e){$('ai-pending-list').innerHTML='<div class="empty">'+safe(e.message)+'</div>';}
    }
    function renderAiSchool(k){
      const st=k.stats||{};$('ai-training-count').textContent=Number(st.training||0).toLocaleString('vi-VN');$('ai-gold-count').textContent=Number(st.goldKnowledge||0).toLocaleString('vi-VN');$('ai-approved-count').textContent=Number(st.approved||0).toLocaleString('vi-VN');$('ai-pending-count').textContent=Number(st.pending||0).toLocaleString('vi-VN');$('ai-cache-count').textContent=Number(st.cache||0).toLocaleString('vi-VN');
      const pending=Array.isArray(k.pending)?k.pending:[];$('ai-pending-list').innerHTML=pending.length?'<table class="ai-school-table"><thead><tr><th>Câu AI đã tìm</th><th>Kiến thức</th><th>Nguồn</th><th>Thao tác</th></tr></thead><tbody>'+pending.map(x=>'<tr><td><b>'+safe(x.question||'')+'</b><br><span class="customer-meta">'+safe(x.confidence||'')+' · '+safe(dateTime(x.checkedAt))+'</span></td><td class="ai-school-summary">'+safe(x.summary||'')+'</td><td class="ai-school-source">'+safe((x.sources||[]).map(s=>s.title||s.url).join(' · '))+'</td><td><div class="product-actions"><button class="btn-approve" data-ai-approve="'+safe(x.id)+'">DUYỆT</button><button class="btn-soft" data-ai-edit="'+safe(x.id)+'" data-ai-scope="pending">SỬA</button><button class="btn-danger" data-ai-delete="'+safe(x.id)+'" data-ai-scope="pending">XÓA</button></div></td></tr>').join('')+'</tbody></table>':'<div class="empty">✅ Không có kiến thức web nào đang chờ duyệt.</div>';
      const approved=Array.isArray(k.approved)?k.approved:[];$('ai-approved-list').innerHTML=approved.length?'<table class="ai-school-table"><thead><tr><th>Câu</th><th>Kiến thức đã duyệt</th><th>Thao tác</th></tr></thead><tbody>'+approved.map(x=>'<tr><td><b>'+safe(x.question||'')+'</b></td><td class="ai-school-summary">'+safe(x.summary||'')+'</td><td><div class="product-actions"><button class="btn-soft" data-ai-edit="'+safe(x.id)+'" data-ai-scope="approved">SỬA</button><button class="btn-danger" data-ai-delete="'+safe(x.id)+'" data-ai-scope="approved">XÓA</button></div></td></tr>').join('')+'</tbody></table>':'<div class="empty">Chưa có kiến thức web nào được duyệt.</div>';
      document.querySelectorAll('[data-ai-approve]').forEach(b=>b.onclick=()=>aiApprove(b.dataset.aiApprove));document.querySelectorAll('[data-ai-edit]').forEach(b=>b.onclick=()=>aiEdit(b.dataset.aiEdit,b.dataset.aiScope));document.querySelectorAll('[data-ai-delete]').forEach(b=>b.onclick=()=>aiDelete(b.dataset.aiDelete,b.dataset.aiScope));
    }
    async function aiApprove(id){const r=await fetch('/api/admin/ai-knowledge/'+encodeURIComponent(id)+'/approve',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)return msg('❌ '+(d.message||'Không duyệt được kiến thức'),false);renderAiSchool(d.knowledge);msg('✅ Đã duyệt kiến thức mới cho AI.',true)}
    async function aiEdit(id,scope){const rows=scope==='approved'?document.querySelectorAll('[data-ai-edit][data-ai-scope="approved"]'):document.querySelectorAll('[data-ai-edit][data-ai-scope="pending"]');const text=prompt('Nhập nội dung kiến thức đã kiểm tra. Không nhập giá/tồn kho KBL vào đây:','');if(!text||text.trim().length<10)return;const r=await fetch('/api/admin/ai-knowledge/'+encodeURIComponent(id)+'/edit',{method:'POST',headers:headers(true),body:JSON.stringify({summary:text.trim()})}),d=await r.json();if(!r.ok||!d.success)return msg('❌ '+(d.message||'Không sửa được kiến thức'),false);renderAiSchool(d.knowledge);msg('✅ Đã sửa kiến thức AI.',true)}
    async function aiDelete(id,scope){if(!confirm('Xóa kiến thức này khỏi kho AI?'))return;const r=await fetch('/api/admin/ai-knowledge/'+encodeURIComponent(id)+'?scope='+encodeURIComponent(scope||'pending'),{method:'DELETE',headers:headers(false)}),d=await r.json();if(!r.ok||!d.success)return msg('❌ '+(d.message||'Không xóa được kiến thức'),false);renderAiSchool(d.knowledge);msg('✅ Đã xóa kiến thức khỏi kho AI.',true)}
    async function reloadAiSchoolFiles(){const r=await fetch('/api/admin/ai-knowledge/reload',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)return msg('❌ '+(d.message||'Không đọc lại được giáo án'),false);renderAiSchool(d.knowledge);msg('✅ Đã đọc lại file giáo án/kiến thức.',true)}
    function renderDashboard(dashboard) {
      const summary = dashboard.summary || {};
      $('summary-tasks').textContent = Number(summary.tasks) || 0;
      $('summary-pending').textContent = Number(summary.pendingProducts) || 0;
      $('summary-orders').textContent = Number(summary.newOrders) || 0;
      $('summary-published').textContent = Number(summary.publishedProducts) || 0;
      $('summary-pawns').textContent = Number(summary.activePawns) || 0;
      $('summary-pawn-money').textContent = 'Tổng tiền gốc: ' + money(summary.activePawnPrincipal);
      $('cc-generated').textContent = 'Cập nhật ' + dateTime(dashboard.generatedAt);
      renderTraffic(dashboard.traffic || {});

      const syncItems = Object.values(dashboard.sync || {});
      $('cc-sync').innerHTML = syncItems.length ? syncItems.map((item) => {
        const connectionText = item.connections === undefined ? '' : ' · ' + Number(item.connections) + ' kết nối';
        return '<div class="sync-row ' + safe(item.state || 'idle') + '"><span class="sync-dot"></span><div><b>' + safe(item.label || 'Luồng dữ liệu') + '</b><small>' + safe(item.updatedAt ? dateTime(item.updatedAt) : 'Chưa ghi nhận') + safe(connectionText) + '</small></div></div>';
      }).join('') : '<div class="empty">Chưa có dữ liệu đồng bộ.</div>';

      const tasks = Array.isArray(dashboard.tasks) ? dashboard.tasks : [];
      $('cc-tasks').innerHTML = tasks.length ? tasks.map((task) => (
        '<div class="task ' + safe(task.level || 'info') + '"><span class="task-dot"></span><div><b>' + safe(task.title) + '</b><small>' + safe(task.detail || task.reference || '') + '</small></div><button type="button" data-cc-task="' + safe(task.id) + '">' + safe(task.action || 'MỞ') + '</button></div>'
      )).join('') : '<div class="empty">✅ Hiện không có việc mới cần xử lý.</div>';
      $('cc-tasks').querySelectorAll('[data-cc-task]').forEach((button) => button.addEventListener('click', () => {
        const task = tasks.find((item) => String(item.id) === String(button.dataset.ccTask));
        if (!task) return;
        if (task.kind === 'product') {
          const product = productState.products.find((item) => String(item.id) === String(task.productId));
          if (product) return editProduct(product);
          $('products-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        showAdminView('customers',false); $('orders-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
    }
    async function loadDashboard() {
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
      try {
        const response = await fetch('/api/admin/dashboard', { headers: headers(false), cache: 'no-store', signal:controller.signal });
        const data = await response.json();
        if (!response.ok || !data.success || !data.dashboard) throw new Error(data.message || 'Không tải được trung tâm điều hành');
        renderDashboard(data.dashboard);
        return true;
      } catch (error) {
        $('cc-generated').textContent = 'Không tải được dữ liệu';
        $('cc-tasks').innerHTML = '<div class="empty">' + safe(kblMediaError(error)) + '</div>';
        $('cc-sync').innerHTML = '<div class="empty">Tổng quan chưa tải được. Kho sản phẩm được tải độc lập; có thể kiểm tra ở POS & Sản phẩm.</div>';
        return false;
      }finally{clearTimeout(timer);}
    }
    function setPreview(source, label) {
      $('image-preview').innerHTML = source
        ? '<img src="' + safe(source) + '" alt="Ảnh sản phẩm"><span>' + safe(label || 'Đã chọn ảnh') + '</span>'
        : '<span>' + safe(label || 'Chưa chọn ảnh') + '</span>';
    }
    function setTryOnPreview(source, label) {
      $('tryon-image-preview').innerHTML = source
        ? '<img src="' + safe(source) + '" alt="Ảnh thử sản phẩm"><span>' + safe(label || 'Ảnh thử đã sẵn sàng') + '</span>'
        : '<span>' + safe(label || 'Chưa có ảnh thử chuẩn') + '</span>';
    }
    function renderEditorAiNameSuggestions(product,statusText='',statusKind='') {
      const box=$('editor-ai-name-box');if(!box)return;
      const active=productState.source==='pos'&&product&&String(product.id)===String(productState.editingId||'');
      if(!active){box.hidden=true;box.innerHTML='';return;}
      const names=Array.isArray(product.aiNameSuggestions)?product.aiNameSuggestions.slice(0,5):[],displayName=String(product.displayName||'').trim(),summary=String(product.aiNameVisualSummary||'').trim();
      box.hidden=false;
      box.innerHTML='<b>🧠 AI NHÌN ẢNH → GỢI Ý TÊN TRƯNG BÀY</b>'+
        '<div class="ai-name-summary">'+safe(summary||'Tải ảnh thật của đúng SKU. AI chỉ mô tả kiểu dáng nhìn thấy; tên POS, SKU, tuổi vàng, trọng lượng và giá không bị thay đổi.')+'</div>'+
        (names.length?'<div class="ai-name-options">'+names.map(n=>'<button class="ai-name-choice '+(displayName===n?'selected':'')+'" type="button" data-editor-ai-name-choice="'+encodeURIComponent(n)+'">'+(displayName===n?'✓ ':'')+safe(n)+'</button>').join('')+'</div>':'<div class="ai-name-note">Chưa có 5 tên. Khi tải ảnh cho hàng POS, AI sẽ tự quét và trả tên ngay tại đây.</div>')+
        '<div class="ai-name-note" data-editor-ai-name-status style="'+(statusKind==='bad'?'color:#b42332':statusKind==='good'?'color:#08734d':'')+'">'+safe(statusText||'')+'</div>';
      box.querySelectorAll('[data-editor-ai-name-choice]').forEach(button=>button.addEventListener('click',()=>applyProductDisplayName(product.id,decodeURIComponent(button.dataset.editorAiNameChoice||''),{openStudio:false})));
    }
    function setEditorAiNameStatus(text,kind=''){
      const box=$('editor-ai-name-box');if(!box||box.hidden)return;let status=box.querySelector('[data-editor-ai-name-status]');
      if(!status){status=document.createElement('div');status.className='ai-name-note';status.dataset.editorAiNameStatus='1';box.appendChild(status)}
      status.textContent=text||'';status.style.color=kind==='bad'?'#b42332':kind==='good'?'#08734d':'';
    }
    function resetForm() {
      kblResetEditorMedia(null);
      $('form').reset();
      $('edit-id').value = '';
      $('sku').value = '';
      $('category').value = 'Trang sức';
      syncDisplayShelfOptions('');
      $('gold').value = '9999';
      syncGoldShelfOptions('9999');
      $('kind').value = 'reference';
      $('kind').disabled = false;
      $('image-file').value = '';
      $('tryon-image-file').value = '';
      productState.image = '';
      productState.tryOnImage = '';
      productState.editingId = '';
      productState.source = 'manual';
      productState.publicationStatus = 'published';
      setPosManagedFields(false);
      $('save-product').textContent = 'THÊM HÀNG THAM KHẢO';
      $('cancel-edit').hidden = true;
      setPreview('', 'Chưa chọn ảnh');
      setTryOnPreview('', 'Chưa có ảnh thử chuẩn');
      renderEditorAiNameSuggestions(null);
    }
    function editProduct(product) {
      if(!product)return;
      showAdminView('products',false);
      if($('product-editor-details'))$('product-editor-details').open=true;
      kblResetEditorMedia(product);
      productState.editingId = product.id;
      productState.image = product.image || '';
      productState.tryOnImage = product.tryOnImage || '';
      productState.source = product.source === 'pos' ? 'pos' : 'manual';
      productState.publicationStatus = product.publicationStatus || (product.image ? 'published' : 'draft');
      $('edit-id').value = product.id;
      $('sku').value = product.sku || '';
      $('sku').readOnly = productState.source === 'pos';
      $('name').value = product.name || '';
      $('category').value = product.displayCategory || product.category || 'Trang sức';
      syncDisplayShelfOptions(product.displayShelf || '');
      $('gold').value = product.goldCode || '9999';
      syncGoldShelfOptions(product.displayGoldShelf !== undefined ? product.displayGoldShelf : (['9999','980'].includes(String(product.goldCode || '')) ? String(product.goldCode) : 'none'));
      $('weight').value = product.weightChi || 0;
      $('work').value = product.workmanship || 0;
      Object.entries(productFieldMap).forEach(([id, key]) => { $(id).value = product[key] ?? ''; });
      setPosManagedFields(productState.source === 'pos');
      $('kind').value = product.kind === 'current' ? 'current' : 'reference';
      $('kind').disabled = productState.source === 'pos';
      $('image-file').value = '';
      $('tryon-image-file').value = '';
      $('save-product').textContent = productState.source === 'pos' && productState.publicationStatus !== 'published'
        ? 'LƯU ẢNH & ĐƯA LÊN TRƯNG BÀY'
        : 'LƯU THAY ĐỔI';
      $('cancel-edit').hidden = false;
      document.querySelector('.legal-details').open = true;
      setPreview(productState.image, productState.image ? 'Ảnh hiện tại · chọn ảnh mới nếu muốn thay' : 'Chưa có ảnh · hãy tải ảnh rồi duyệt đăng');
      setTryOnPreview(productState.tryOnImage, productState.tryOnImage ? 'Ảnh PNG thử hiện tại · chọn ảnh mới nếu muốn thay' : 'Chưa có ảnh thử chuẩn · nút thử sẽ được khóa an toàn');
      renderEditorAiNameSuggestions(product);
      window.scrollTo({ top: $('form').getBoundingClientRect().top + window.scrollY - 24, behavior: 'smooth' });
    }
    function compressImage(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
        reader.onload = () => {
          const image = new Image();
          image.onerror = () => reject(new Error('Ảnh không hợp lệ.'));
          image.onload = () => {
            const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.84));
          };
          image.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }
    function prepareTryOnImage(file) {
      return new Promise((resolve, reject) => {
        if (!file || file.type !== 'image/png') return reject(new Error('Ảnh thử bắt buộc là file PNG nền trong suốt.'));
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Không đọc được ảnh thử.'));
        reader.onload = () => {
          const image = new Image();
          image.onerror = () => reject(new Error('Ảnh thử không hợp lệ.'));
          image.onload = () => {
            const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let transparent = 0;
            let visible = 0;
            for (let index = 3; index < pixels.length; index += 4) {
              if (pixels[index] < 245) transparent += 1;
              if (pixels[index] > 20) visible += 1;
            }
            const total = Math.max(1, pixels.length / 4);
            if (transparent / total < 0.08) return reject(new Error('PNG này chưa có nền trong suốt. Hãy tách nền và chỉ giữ món trang sức.'));
            if (visible / total < 0.002) return reject(new Error('Ảnh thử gần như trống.'));
            const result = canvas.toDataURL('image/png');
            if (result.length > 1800000) return reject(new Error('Ảnh PNG thử còn quá nặng. Hãy thu nhỏ ảnh rồi tải lại.'));
            resolve(result);
          };
          image.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }
    function isCurrent(product) { return ['current', 'available', 'in-stock', 'stock', 'shop'].includes(String(product.kind || '').toLowerCase()); }
    function isPublished(product) { return String(product.publicationStatus || '').toLowerCase() === 'published'; }
    function productBadge(product) {
      if (product.status === 'sold') return '<span class="kind-badge sold">Đã bán</span>';
      if (product.status === 'unavailable') return '<span class="kind-badge hidden">Không còn trong POS</span>';
      if (isPublished(product)) return '<span class="kind-badge">Đang trưng bày</span>';
      if (product.publicationStatus === 'hidden') return '<span class="kind-badge hidden">Đã ẩn</span>';
      return product.image ? '<span class="kind-badge pending">Chờ duyệt</span>' : '<span class="kind-badge pending">Chờ ảnh</span>';
    }
    function labelBadge(product) {
      const required = ['productSymbol', 'producerName', 'producerAddress', 'origin', 'applicableStandard'];
      const complete = required.every((key) => String(product[key] || '').trim());
      const tryOn = '<span class="tryon-state' + (product.tryOnImage ? ' ready' : '') + '">' + (product.tryOnImage ? 'Ảnh thử: sẵn sàng' : 'Ảnh thử: chưa có') + '</span>';
      return '<span class="label-state' + (complete ? ' ready' : '') + '">' + (complete ? 'Tem nhãn cơ bản: đã nhập' : 'Tem nhãn: còn thiếu') + '</span>' + tryOn;
    }
    function productManifest(product){return product&&product.contentManifest&&typeof product.contentManifest==='object'?product.contentManifest:{version:'1.0',workflow:{stage:isPublished(product)?'published':'awaiting-media'},media:{sourceImage:product&&product.originalStudioImage||'',sourceVideo:product&&product.originalStudioVideo||'',displayCandidateImage:product&&product.displayCandidateImage||'',displayImage:product&&product.displayImage||''}}}
    function manifestPill(label,ok,type=''){return '<span class="manifest-pill '+(ok?'ok':(type||'warn'))+'">'+(ok?'✓ ':'○ ')+safe(label)+'</span>'}
    function renderPendingProductCards(list){
      const target=$('products-pending');if(!target)return;
      if(!list.length){target.innerHTML='<div class="empty">✅ Không có sản phẩm POS nào đang chờ xử lý.</div>';return}
      target.innerHTML='<div class="pending-stack">'+list.map(product=>{
        const m=productManifest(product),media=m.media||{},workflow=m.workflow||{};
        const sourceImage=media.sourceImage||product.originalStudioImage||product.image||'';
        const sourceVideo=media.sourceVideo||product.originalStudioVideo||'';
        const candidate=media.displayCandidateImage||product.displayCandidateImage||'';
        const display=media.displayImage||product.displayImage||'';
        const imageBox=sourceImage?'<img src="'+safe(sourceImage)+'" alt="Ảnh gốc '+safe(product.sku||'')+'">':'<span>CHƯA CÓ<br>ẢNH GỐC</span>';
        const videoBox=sourceVideo?'<video class="pending-video-mini" src="'+safe(sourceVideo)+'" controls preload="metadata" playsinline></video>':'';
        const stage=workflow.label||workflow.stageLabel||(!sourceImage?'Chờ ảnh gốc':candidate?'Chờ duyệt ảnh AI':'Sẵn sàng vào Studio');
        const shelf=displayShelfLabel(product.displayShelf)||'Chưa chọn ô trưng bày';
        const goldShelf = product.displayGoldShelf !== undefined
          ? displayGoldShelfLabel(product.displayGoldShelf)
          : (['9999','980'].includes(String(product.goldCode || '')) ? 'Kệ vàng '+String(product.goldCode) : 'Không vào kệ vàng');
        const steps=[['POS',true],['Nguồn',Boolean(sourceImage)],['Ảnh AI',Boolean(candidate||display)],['Trưng bày',isPublished(product)],['Video',Boolean(media.approvedVideo||product.approvedStudioVideo)]].map(([name,done],idx)=>'<span class="'+(done?'done':(!done&&((idx===1&&!sourceImage)||(idx===2&&sourceImage&&!candidate)||(idx===3&&candidate&&!isPublished(product)))?'current':''))+'">'+safe(name)+'</span>').join('');
        const displayName=String(product.displayName||'').trim(),nameSuggestions=Array.isArray(product.aiNameSuggestions)?product.aiNameSuggestions:[],visualSummary=String(product.aiNameVisualSummary||'').trim();
        const nameBox=sourceImage?'<div class="ai-name-box" id="ai-name-box-'+safe(product.id)+'"><b>🧠 AI NHÌN ẢNH → GỢI Ý 5 TÊN TRƯNG BÀY</b><div class="ai-name-summary">'+safe(visualSummary||'AI chỉ mô tả kiểu dáng nhìn thấy và đọc dữ liệu POS. Không đổi tên POS, không bịa chất liệu/đá quý.')+'</div>'+(nameSuggestions.length?'<div class="ai-name-options">'+nameSuggestions.slice(0,5).map(n=>'<button class="ai-name-choice '+(displayName===n?'selected':'')+'" type="button" data-ai-name-choice="'+safe(product.id)+'" data-ai-name-value="'+encodeURIComponent(n)+'">'+(displayName===n?'✓ ':'')+safe(n)+'</button>').join('')+'</div>':'<div class="ai-name-note">Chưa có 5 tên. Bấm AI GỢI Ý hoặc tải/đổi ảnh gốc để quét tự động.</div>')+'<div class="pending-actions" style="margin-top:8px"><button class="btn-soft" type="button" data-ai-name-suggest="'+safe(product.id)+'">🧠 '+(nameSuggestions.length?'GỢI Ý LẠI 5 TÊN':'AI GỢI Ý 5 TÊN')+'</button></div></div>':'';
        return '<article class="pending-card" data-pending-card="'+safe(product.id)+'">'+
          '<div class="pending-media"><div class="pending-thumb">'+(sourceImage?'<img src="'+safe(sourceImage)+'" alt="">':'CHƯA CÓ<br>ẢNH GỐC')+'</div>'+(sourceVideo?'<video class="pending-video-mini" src="'+safe(sourceVideo)+'" controls preload="metadata"></video>':'')+'</div>'+ 
          '<div class="pending-identity"><span class="sku">'+safe(product.sku||'')+'</span><h3>'+safe(displayName||product.name||'Sản phẩm POS')+'</h3>'+(displayName?'<div class="customer-meta"><b>Tên POS giữ nguyên:</b> '+safe(product.name||'')+'</div>':'')+'<div class="pending-meta"><span class="manifest-pill info">'+safe(product.goldCode||'—')+'</span><span class="manifest-pill">'+safe(goldWeight(product.weightChi))+' chỉ</span><span class="manifest-pill '+(sourceImage?'ok':'warn')+'">'+(sourceImage?'ẢNH GỐC ✓':'THIẾU ẢNH')+'</span><span class="manifest-pill '+(displayName?'ok':'warn')+'">'+(displayName?'TÊN TRƯNG BÀY ✓':'CHƯA CHỌN TÊN')+'</span><span class="manifest-pill '+(display?'ok':candidate?'warn':'')+'">'+(display?'ẢNH DUYỆT ✓':candidate?'AI CHỜ DUYỆT':'CHƯA CÓ ẢNH AI')+'</span></div><div class="pending-price">Giá tham khảo: <b>'+money(product.referencePrice)+'</b></div><div class="workflow-mini"><span class="'+(sourceImage?'done':'current')+'">1 ẢNH GỐC</span><span class="'+(displayName?'done':sourceImage?'current':'')+'">2 CHỌN TÊN</span><span class="'+(candidate||display?'done':displayName?'current':'')+'">3 AI NỘI DUNG/ẢNH</span><span class="'+(display?'done':candidate?'current':'')+'">4 DUYỆT ẢNH</span><span class="'+(isPublished(product)?'done':display?'current':'')+'">5 TRƯNG BÀY</span></div></div>'+ 
          '<div class="pending-workflow"><div class="pending-actions"><label class="btn-file-like">'+(sourceImage?'ĐỔI ẢNH GỐC':'TẢI ẢNH GỐC')+'<input type="file" hidden accept="image/png,image/jpeg,image/webp" data-source-image-file="'+safe(product.id)+'"></label><label class="btn-file-like">'+(sourceVideo?'ĐỔI VIDEO GỐC':'TẢI VIDEO GỐC')+'<input type="file" hidden accept="video/mp4,video/webm,video/quicktime" data-source-video-file="'+safe(product.id)+'"></label><button class="studio" type="button" data-content-product="'+safe(product.id)+'">✦ MỞ CONTENT STUDIO</button><button class="btn-soft" type="button" data-edit="'+safe(product.id)+'">SỬA KỆ / THÔNG TIN</button><button class="btn-danger" type="button" data-delete="'+safe(product.id)+'">XÓA</button></div><div class="pending-upload-status" id="pending-upload-'+safe(product.id)+'">'+safe(stage)+' · '+safe(shelf)+' · '+safe(goldShelf)+'</div>'+nameBox+'<details class="manifest-details"><summary>PRODUCT MANIFEST · xem hồ sơ SKU</summary><div class="manifest-grid"><div><b>Nguồn dữ liệu</b>POS · '+safe(product.sku||'')+'</div><div><b>Tên POS</b>'+safe(product.name||'')+'</div><div><b>Tên trưng bày</b>'+safe(displayName||'Chưa chọn')+'</div><div><b>Trạng thái web</b>'+safe(isPublished(product)?'Đang trưng bày':'Chưa trưng bày')+'</div><div><b>Ảnh nguồn</b>'+safe(sourceImage?'Đã lưu trên server':'Chưa có')+'</div><div><b>Video nguồn</b>'+safe(sourceVideo?'Đã lưu trên server':'Chưa có')+'</div><div><b>Ảnh AI</b>'+safe(candidate?'Chờ duyệt':display?'Đã duyệt':'Chưa tạo')+'</div><div><b>Workflow</b>'+safe(stage)+'</div></div></details></div>'+ 
        '</article>';
      }).join('')+'</div>';
    }
    function setPendingUploadStatus(productId,text,kind=''){const el=$('pending-upload-'+productId);if(!el)return;el.textContent=text;el.className='pending-upload-status '+kind}
    async function requestProductNameSuggestions(productId,imageDataUrl=''){
      const product=productState.products.find(p=>String(p.id)===String(productId));if(!product)return null;
      const editingThis=productState.source==='pos'&&String(productState.editingId||'')===String(productId);
      let payloadImage=imageDataUrl;
      if(!payloadImage){
        setPendingUploadStatus(productId,'🧠 Đang đọc lại ảnh gốc để gợi ý 5 tên…');if(editingThis)setEditorAiNameStatus('🧠 Đang đọc lại ảnh gốc…');
        const source=product.originalStudioImage||product.image||'';if(!source){setPendingUploadStatus(productId,'❌ SKU chưa có ảnh gốc để AI quét.','bad');if(editingThis)setEditorAiNameStatus('❌ SKU chưa có ảnh gốc để AI quét.','bad');return null}
        try{const r=await fetch(source,{cache:'no-store'}),blob=await r.blob(),file=new File([blob],'kbl-source-image',{type:blob.type||'image/jpeg'});payloadImage=await compressImage(file)}catch(e){setPendingUploadStatus(productId,'❌ Không đọc lại được ảnh gốc: '+e.message,'bad');if(editingThis)setEditorAiNameStatus('❌ Không đọc lại được ảnh gốc: '+e.message,'bad');return null}
      }
      setPendingUploadStatus(productId,'🧠 Gemini đang nhìn ảnh + đọc dữ liệu POS để tạo đúng 5 tên…');if(editingThis)setEditorAiNameStatus('🧠 Gemini đang nhìn ảnh + đọc dữ liệu POS để tạo đúng 5 tên…');
      try{
        const response=await fetch('/api/admin/content/name-suggestions',{method:'POST',headers:headers(true),body:JSON.stringify({productId,imageDataUrl:payloadImage})}),data=await response.json();
        if(!response.ok||!data.success)throw new Error(data.message||'Không tạo được 5 tên');
        if(data.product)Object.assign(product,data.product);
        if(Array.isArray(data.names))product.aiNameSuggestions=data.names.slice(0,5);
        if(data.visualSummary!==undefined)product.aiNameVisualSummary=data.visualSummary||'';
        if(data.categorySuggestion!==undefined)product.aiNameCategorySuggestion=data.categorySuggestion||'';
        if(data.model!==undefined)product.aiNameSuggestionModel=data.model||'';
        setPendingUploadStatus(productId,'✓ AI đã gợi ý 5 tên. Chọn 1 tên; tên POS vẫn giữ nguyên.','good');
        renderAdminProducts();if(editingThis){renderEditorAiNameSuggestions(product,'✓ AI đã trả đủ 5 tên. Chọn tên ngay bên trên.','good')}
        return data;
      }catch(error){
        const text='❌ '+(error&&error.message||'AI chưa trả được tên');setPendingUploadStatus(productId,text,'bad');if(editingThis){renderEditorAiNameSuggestions(product,text,'bad')}return null;
      }
    }
    async function applyProductDisplayName(productId,name,options={}){
      const product=productState.products.find(p=>String(p.id)===String(productId));if(!product)return;const openStudioAfter=options.openStudio!==false;setPendingUploadStatus(productId,'Đang lưu tên trưng bày; không sửa tên POS…');
      try{
        const response=await fetch('/api/admin/content/display-name',{method:'POST',headers:headers(true),body:JSON.stringify({productId,name})}),data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Không lưu được tên trưng bày');if(data.product)Object.assign(product,data.product);
        setPendingUploadStatus(productId,'✓ Đã chọn “'+name+'”.'+(openStudioAfter?' Đang mở đúng SKU và tạo bộ nội dung trưng bày…':''),'good');renderAdminProducts();
        if(productState.source==='pos'&&String(productState.editingId||'')===String(productId))renderEditorAiNameSuggestions(product,'✓ Đã chọn tên trưng bày “'+name+'”. Tên POS giữ nguyên.','good');
        if(openStudioAfter){openContentStudio(productId);await generateContent()}else{msg('✓ Đã lưu tên trưng bày. Tên POS không đổi.')}
      }catch(error){setPendingUploadStatus(productId,'❌ '+error.message,'bad');if(productState.source==='pos'&&String(productState.editingId||'')===String(productId))setEditorAiNameStatus('❌ '+error.message,'bad')}
    }
    async function uploadProductSourceImage(productId,file){
      if(!file)return;setPendingUploadStatus(productId,'Đang xử lý và lưu ảnh gốc…');
      try{const imageDataUrl=await compressImage(file);const response=await fetch('/api/admin/content/source-image',{method:'POST',headers:headers(true),body:JSON.stringify({productId,imageDataUrl})}),data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Không lưu được ảnh gốc');const product=productState.products.find(p=>String(p.id)===String(productId));if(product&&data.product)Object.assign(product,data.product);setPendingUploadStatus(productId,'✓ Đã lưu ảnh gốc. AI đang gợi ý 5 tên…','good');renderAdminProducts();await requestProductNameSuggestions(productId,imageDataUrl)}catch(error){setPendingUploadStatus(productId,'❌ '+error.message,'bad')}
    }
    async function uploadProductSourceVideo(productId,file){
      if(!file)return;if(file.size>80*1024*1024){setPendingUploadStatus(productId,'❌ Video gốc tối đa 80MB trong V2.','bad');return}setPendingUploadStatus(productId,'Đang tải video gốc lên server…');
      try{const uploadHeaders=headers(false);uploadHeaders['Content-Type']=file.type||'application/octet-stream';const response=await fetch('/api/admin/content/source-video/'+encodeURIComponent(productId),{method:'POST',headers:uploadHeaders,body:file}),data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Không lưu được video gốc');const product=productState.products.find(p=>String(p.id)===String(productId));if(product&&data.product)Object.assign(product,data.product);setPendingUploadStatus(productId,'✓ Đã gắn video gốc vào Product Manifest.','good');renderAdminProducts()}catch(error){setPendingUploadStatus(productId,'❌ '+error.message,'bad')}
    }
    function renderProductLane(containerId, list, emptyText) {
      const target = $(containerId);
      if (!list.length) { target.innerHTML = '<div class="empty">' + safe(emptyText) + '</div>'; return; }
      target.innerHTML = '<table class="product-table"><thead><tr><th>Ảnh</th><th>Mã SP / Tên</th><th>Vàng</th><th>Giá tham khảo</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>' + list.map((product, rowIndex) => {
        const image = product.image ? '<img class="product-thumb" loading="lazy" decoding="async" src="' + safe(product.image) + '" alt="' + safe(product.name) + '">' : '<span class="product-thumb"></span>';
        const sourcePos = product.source === 'pos';
        const editButton = '<button class="btn-soft" type="button" data-edit="' + safe(product.id) + '">SỬA</button>';
        const addImageButton = sourcePos && !product.image
          ? '<button type="button" data-edit="' + safe(product.id) + '">THÊM ẢNH / DUYỆT</button>'
          : '';
        const visibility = isPublished(product)
          ? '<button class="btn-hide" type="button" data-visibility="hidden" data-product="' + safe(product.id) + '">ẨN</button>'
          : (product.image && product.status === 'available' ? '<button type="button" data-visibility="published" data-product="' + safe(product.id) + '">DUYỆT ĐĂNG</button>' : '');
        const canFeature = isPublished(product) && product.status === 'available' && Boolean(product.image);
        const displaySort = containerId === 'products-published' && canFeature
          ? '<span class="display-order-control"><span class="display-order-rank">TRƯNG BÀY #' + Number(product.displayOrder || (rowIndex + 1)) + '</span><button class="btn-soft" type="button" data-display-move="top" data-product="' + safe(product.id) + '" title="Đưa lên đầu danh sách">⇧ ĐẦU</button><button class="btn-soft" type="button" data-display-move="up" data-product="' + safe(product.id) + '" title="Đưa lên một vị trí">↑</button><button class="btn-soft" type="button" data-display-move="down" data-product="' + safe(product.id) + '" title="Đưa xuống một vị trí">↓</button></span>'
          : '';
        const featured = canFeature
          ? (product.featured
            ? '<button class="gold" type="button" data-featured="off" data-product="' + safe(product.id) + '">★ NỔI BẬT #' + Number(product.featuredOrder || 0) + '</button><button class="btn-soft" type="button" data-featured-move="up" data-product="' + safe(product.id) + '" title="Đưa lên trước">↑</button><button class="btn-soft" type="button" data-featured-move="down" data-product="' + safe(product.id) + '" title="Đưa xuống sau">↓</button>'
            : '<button class="btn-soft" type="button" data-featured="on" data-product="' + safe(product.id) + '">☆ ĐƯA LÊN NỔI BẬT</button>')
          : '';
        const sold = !sourcePos && isCurrent(product) && product.status === 'available'
          ? '<button type="button" data-sold="' + safe(product.id) + '">ĐÃ BÁN</button>'
          : '';
        const remove = (sourcePos && product.status !== 'available') ? '' : '<button class="btn-danger" type="button" data-delete="' + safe(product.id) + '">XÓA</button>';
        const sku = product.sku ? '<span class="sku">' + safe(product.sku) + '</span><br>' : '';
        const sizeText = product.sizeLabel ? ' · ' + safe(product.sizeLabel) : '';
        const shelfText = displayShelfLabel(product.displayShelf);
        return '<tr><td>' + image + '</td><td>' + sku + '<b>' + safe(product.name) + '</b><br><small>' + safe(product.displayCategory || product.category || 'Trang sức') + (shelfText ? ' · ' + safe(shelfText) : '') + ' · ' + safe(goldWeight(product.weightChi)) + ' chỉ' + sizeText + '</small><br>' + labelBadge(product) + '</td><td>' + safe(product.goldCode) + '</td><td>' + money(product.referencePrice) + '<br><small>Tiền công ' + money(product.workmanship) + '</small></td><td>' + productBadge(product) + '</td><td><div class="product-actions">' + editButton + addImageButton + (isCurrent(product) && isPublished(product) && product.status === 'available' && product.image ? '<button class="content-product-action" type="button" data-content-product="' + safe(product.id) + '">AI NỘI DUNG</button>' : '') + displaySort + featured + visibility + sold + remove + '</div></td></tr>';
      }).join('') + '</tbody></table>';
    }
    const contentState={product:null,content:null,engine:'',assets:{},uploadedImage:'',displayUploadImage:'',flow:{displayImagePrompt:'',videoPrompt:''},flowUrl:'https://flow.google/',videoFile:null};

    const veoRuntime={configured:false,enabled:false,pollMs:10000,status:null,timer:null};
    function clearVeoPoll(){if(veoRuntime.timer){clearTimeout(veoRuntime.timer);veoRuntime.timer=null}}
    const publisherRuntime={platforms:{},appConfig:{},productId:'',recentRuns:[],videoJobs:[],videoJobId:'',sourceType:'video',longVideoFile:null,longVideoDuration:0,longVideoJob:null};
    const growthRuntime={data:null,platforms:{}};
    const liveRuntime={queue:[],index:0};
    const localAiRuntime={timer:null,jobId:'',status:null,pollMs:2500,deadline:0};

    function contentEligibleProducts(){return productState.products.filter(p=>isCurrent(p)&&p.status==='available'&&p.sku)}
    function refreshContentProducts(){const select=$('content-product');if(!select)return;const current=select.value,eligible=contentEligibleProducts();select.innerHTML='<option value="">— Chọn Mã SP —</option>'+eligible.map(p=>'<option value="'+safe(p.id)+'">'+safe(p.sku)+' · '+safe(p.displayName||p.name)+'</option>').join('');if(eligible.some(p=>String(p.id)===String(current)))select.value=current;else if(contentState.product&&eligible.some(p=>String(p.id)===String(contentState.product.id)))select.value=contentState.product.id;renderContentProductPreview();updateContentAssetPreviews()}
    function selectedContentProduct(){return productState.products.find(p=>String(p.id)===String($('content-product')?.value||''))||null}
    function contentActiveProduct(){const selected=selectedContentProduct();return selected&&String(contentState.product?.id)===String(selected.id)?contentState.product:selected;}
    function setContentImagePreview(id,src,noteId,note){const img=$(id),label=$(noteId);if(!img||!label)return;if(src){img.src=src;img.style.visibility='visible';label.textContent=note||'Đã sẵn sàng.'}else{img.removeAttribute('src');img.style.visibility='hidden';label.textContent=note||'Chưa có ảnh.'}}
    function updateContentAssetPreviews(){const selected=selectedContentProduct();const source=contentState.uploadedImage||contentState.assets.sourceImage||(selected&&selected.originalStudioImage)||(selected&&selected.image)||'';const display=contentState.displayUploadImage||contentState.assets.displayCandidateImage||(selected&&selected.displayCandidateImage)||contentState.assets.displayImage||(selected&&selected.displayImage)||'';setContentImagePreview('content-source-preview',source,'content-source-note',source?'Ảnh sản phẩm thật dùng làm reference cho Google Flow.':'Chưa có ảnh nguồn.');setContentImagePreview('content-display-preview',display,'content-display-note',display?'Ảnh trưng bày đang chờ/đã duyệt. Chỉ bấm DÙNG ẢNH TRƯNG BÀY khi ông thấy đạt.':'Tạo ảnh bên Google Flow rồi tải kết quả vào đây.')}
    function clearContentOutputs(){['content-facebook','content-youtube-caption','content-video','content-youtube','content-tiktok','content-cover-copy','content-display-prompt','content-flow-prompt'].forEach(id=>{if($(id))$(id).value=''});contentState.content=null;contentState.engine='';contentState.flow={displayImagePrompt:'',videoPrompt:''};$('content-engine').textContent='Chưa tạo'}
    function renderContentProductPreview(){const target=$('content-product-preview');if(!target)return;const p=selectedContentProduct();if(!p){target.classList.add('no-image');target.innerHTML='<div class="muted">Chọn một SKU POS đang còn hàng. Có thể là món đang chờ duyệt; chỉ cần đã tải ảnh gốc là tạo prompt được.</div>';updateContentAssetPreviews();return}const source=(p.originalStudioImage||p.image||'');target.classList.toggle('no-image',!source);target.innerHTML=(source?'<img src="'+safe(source)+'" alt="'+safe(p.displayName||p.name)+'">':'')+'<div><span class="sku">Mã SP '+safe(p.sku)+'</span><h3 style="margin:5px 0">'+safe(p.displayName||p.name)+'</h3>'+(p.displayName?'<div class="customer-meta">Tên POS: '+safe(p.name)+'</div>':'')+'<div class="muted">Vàng '+safe(p.goldCode)+' · '+safe(goldWeight(p.weightChi))+' chỉ'+(p.sizeLabel?' · '+safe(p.sizeLabel):'')+'<br>Giá tham khảo hiện tại: <b>'+money(p.referencePrice)+'</b> · '+(isPublished(p)?'<b style="color:#08734d">Đang trưng bày</b>':'<b style="color:#9a6b00">POS chờ duyệt</b>')+'</div></div>';updateContentAssetPreviews()}
    function openContentStudio(productId){kblResetContentMedia();clearLocalAiPoll();clearVeoPoll();showAdminView('studio',false);contentState.product=null;contentState.content=null;contentState.assets={};contentState.uploadedImage='';contentState.displayUploadImage='';contentState.videoFile=null;if($('content-upload-file'))$('content-upload-file').value='';if($('content-display-file'))$('content-display-file').value='';if($('content-video-file'))$('content-video-file').value='';if($('content-video-preview')){$('content-video-preview').removeAttribute('src');$('content-video-preview').style.display='none'}if($('content-product'))$('content-product').value=productId||'';clearContentOutputs();renderContentProductPreview();renderVeoVideo(selectedContentProduct());loadLocalAiStatus();drawContentCover();$('content-studio')?.scrollIntoView({behavior:'smooth',block:'start'})}
    function copyTextValue(value){const valueText=String(value||'').trim();if(!valueText)return Promise.reject(new Error('Chưa có nội dung để copy.'));if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(valueText);const field=document.createElement('textarea');field.value=valueText;field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();document.execCommand('copy');field.remove();return Promise.resolve()}
    function copyTextFrom(id){const field=$(id);if(!field||!field.value)return;$('content-status').textContent='Đang sao chép…';copyTextValue(field.value).then(()=>{$('content-status').textContent='✅ Đã sao chép.'}).catch(error=>{$('content-status').textContent='❌ '+error.message})}
    function wrapCanvasText(ctx,text,maxWidth){const words=String(text||'').split(/\s+/).filter(Boolean),lines=[];let line='';words.forEach(word=>{const test=line?line+' '+word:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test});if(line)lines.push(line);return lines}
    function loadCanvasImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src})}
    function applyContentResult(data){if(!data.product||String(data.product.id)!==String(selectedContentProduct()?.id))return false;contentState.product={...(contentState.product||selectedContentProduct()||{}),...(data.product||{})};contentState.content=data.content||contentState.content;contentState.engine=data.engine||'';contentState.assets={...(contentState.assets||{}),...(data.assets||{})};contentState.flow={...(contentState.flow||{}),...(data.flow||{})};contentState.flowUrl=data.flowUrl||contentState.flowUrl||'https://flow.google/';const selected=selectedContentProduct();if(selected&&contentState.product)Object.assign(selected,{...selected,...contentState.product});$('content-engine').textContent=data.engine==='gemini-content'?`Gemini Content · Google Flow`:data.engine==='openai-content'?'OpenAI Content · Google Flow':'Google Flow Bridge';if(data.content){$('content-facebook').value=[data.content.facebookPost,(data.content.hashtags||[]).join(' ')].filter(Boolean).join('\n\n');$('content-youtube-caption').value=[data.content.zaloPost,(data.content.hashtags||[]).join(' ')].filter(Boolean).join('\n\n');$('content-video').value=[data.content.videoTitle,data.content.videoScript].filter(Boolean).join('\n\n');$('content-youtube').value=[data.content.videoTitle,data.content.youtubeShortsScript].filter(Boolean).join('\n\n');$('content-tiktok').value=[data.content.tiktokCaption,(data.content.hashtags||[]).join(' ')].filter(Boolean).join('\n\n');$('content-cover-copy').value=[data.content.coverHeadline,data.content.coverSubheadline,data.content.cta].filter(Boolean).join('\n')}if($('content-display-prompt'))$('content-display-prompt').value=contentState.flow.displayImagePrompt||'';if($('content-flow-prompt'))$('content-flow-prompt').value=contentState.flow.videoPrompt||'';updateContentAssetPreviews()}
    async function drawContentCover(){const canvas=$('content-cover');if(!canvas)return;const context=kblContentContext(),drawId=++kblMediaUi.serial;canvas.dataset.mediaDraw=String(drawId);const ctx=canvas.getContext('2d'),p=contentActiveProduct(),c=contentState.content||{};const displaySrc=contentState.displayUploadImage||contentState.assets.displayCandidateImage||contentState.assets.displayImage||(p&&p.displayCandidateImage)||(p&&p.displayImage)||(p&&p.image)||'';ctx.clearRect(0,0,canvas.width,canvas.height);const grad=ctx.createLinearGradient(0,0,canvas.width,canvas.height);grad.addColorStop(0,'#06172c');grad.addColorStop(1,'#0b3158');ctx.fillStyle=grad;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='rgba(217,165,29,.16)';ctx.beginPath();ctx.arc(1060,90,220,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f2c54a';ctx.font='700 24px Arial';ctx.fillText('KIM BẢO LÂM · VÀNG CHUẨN · GIÁ MINH BẠCH',70,72);if(!p){ctx.fillStyle='#fff';ctx.font='700 50px Arial';ctx.fillText('KBL CONTENT STUDIO',70,170);return}try{const img=await loadCanvasImage(displaySrc);if(!kblContentCurrent(context)||canvas.dataset.mediaDraw!==String(drawId))return;const boxX=710,boxY=90,boxW=420,boxH=440;ctx.fillStyle='rgba(255,255,255,.96)';ctx.fillRect(boxX,boxY,boxW,boxH);const scale=Math.min((boxW-50)/img.width,(boxH-50)/img.height),w=img.width*scale,hh=img.height*scale;ctx.drawImage(img,boxX+(boxW-w)/2,boxY+(boxH-hh)/2,w,hh)}catch(_){}if(!kblContentCurrent(context)||canvas.dataset.mediaDraw!==String(drawId))return;const headline=c.coverHeadline||p.name||'SẢN PHẨM KIM BẢO LÂM',sub=c.coverSubheadline||('Mã SP '+(p.sku||'')+' · '+money(p.referencePrice));ctx.fillStyle='#fff';ctx.font='800 54px Arial';const lines=wrapCanvasText(ctx,headline,570).slice(0,3);lines.forEach((line,i)=>ctx.fillText(line,70,165+i*66));const subY=165+lines.length*66+18;ctx.fillStyle='#f6d575';ctx.font='700 27px Arial';wrapCanvasText(ctx,sub,570).slice(0,3).forEach((line,i)=>ctx.fillText(line,70,subY+i*38));ctx.fillStyle='#fff';ctx.font='700 22px Arial';ctx.fillText(c.cta||'Gửi Mã SP để kiểm tra mẫu',70,535)}
    async function buildFlowKit(){const context=kblContentContext(),productId=context.id;if(kblMediaNotReady(['source'])){kblMediaStatus(context,'❌ Ảnh nguồn chưa sẵn sàng. Hãy chờ ảnh đọc xong.');return null;}if(!productId){$('content-status').textContent='❌ Hãy chọn một Mã SP trước.';return null}const button=$('content-build-kit');if(button){button.disabled=true;button.textContent='ĐANG TẠO…'}$('content-status').textContent='Đang tạo prompt ảnh trưng bày…';try{const body={productId,campaign:$('content-campaign')?.value||'',displayStyle:$('content-display-style')?.value||'marble-satin'};if(contentState.uploadedImage)body.sourceImage=contentState.uploadedImage;const response=await fetch('/api/admin/content/display-prompt',{method:'POST',headers:headers(true),body:JSON.stringify(body)}),data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Không tạo được prompt');if(!kblContentCurrent(context))return null;applyContentResult(data);$('content-status').textContent=`✅ Đã tạo prompt · ${data.flow?.displayStyleLabel||'Phong cách đã chọn'}.`;return data}catch(error){kblMediaStatus(context,'❌ '+kblMediaError(error));return null}finally{if(button){button.disabled=false;button.textContent='TẠO PROMPT'}}}
    async function generateContent(){const context=kblContentContext(),productId=context.id;if(kblMediaNotReady(['source'])){kblMediaStatus(context,'❌ Ảnh nguồn chưa sẵn sàng. Hãy chờ ảnh đọc xong.');return null;}if(!productId)return $('content-status').textContent='❌ Hãy chọn sản phẩm trước.';const button=$('content-generate');if(button){button.disabled=true;button.textContent='ĐANG VIẾT…'}$('content-status').textContent='Gemini đang viết kịch bản và nội dung…';try{const response=await fetch('/api/admin/content/studio-run',{method:'POST',headers:headers(true),body:JSON.stringify({productId,tone:$('content-tone')?.value||'sang-trong',campaign:$('content-campaign')?.value||'',displayStyle:$('content-display-style')?.value||'marble-satin'})}),data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Không tạo được kịch bản');if(!kblContentCurrent(context))return null;applyContentResult(data);$('content-status').textContent='✅ Đã tạo kịch bản, caption và prompt video.';await drawContentCover();return data}catch(error){kblMediaStatus(context,'❌ '+kblMediaError(error));return null}finally{if(button){button.disabled=false;button.textContent='TẠO KỊCH BẢN'}}}
    async function copyPromptAndOpen(promptId){let field=$(promptId);if(!field||!field.value){const data=promptId==='content-flow-prompt'?await generateContent():await buildFlowKit();if(!data)return;field=$(promptId)}if(!field||!field.value)return $('content-status').textContent='❌ Chưa tạo được prompt.';try{await copyTextValue(field.value);window.open(contentState.flowUrl||'https://flow.google/','_blank','noopener');$('content-status').textContent='✅ Đã copy prompt và mở Google Flow.'}catch(error){$('content-status').textContent='❌ '+error.message}}
    async function saveDisplayImage(){return kblDisplayAction(async context=>{const data=await kblSaveDisplayFor(context);kblMediaStatus(context,'✅ Đã lưu ảnh chờ duyệt cho '+(data.product.sku||context.id)+'. Ảnh web chưa đổi.');return data;});}
    async function approveDisplayImage(){return kblDisplayAction(async context=>{const data=await kblApproveDisplayFor(context);kblMediaStatus(context,'✅ Đã duyệt ảnh cho '+(data.product.sku||context.id)+'.');return data;});}
    async function approveAndPublishDisplayImage(){return kblDisplayAction(async context=>{
      const data=await kblApproveDisplayFor(context);const product=data.product;
      if(!kblContentCurrent(context))return data;
      if(shelfSelectionRequired(product.displayCategory||product.category)&&!product.displayShelf){showAdminView('products',false);editProduct(product);msg('ℹ️ Ảnh đã duyệt cho '+(product.sku||product.id)+'. Chọn Ô trưng bày chi tiết rồi lưu.',true);return data;}
      const result=await kblMediaJson(await fetch('/api/admin/products/'+encodeURIComponent(context.id)+'/visibility',{method:'POST',headers:headers(true),body:JSON.stringify({publicationStatus:'published'})}));
      kblMergeProduct(result.product,context.id);renderAdminProducts();kblMediaStatus(context,'✅ ĐÃ TRƯNG BÀY '+(product.sku||context.id)+' trên website.');
      const loaded=await load();if(!loaded)msg('✅ Đã duyệt ảnh và trưng bày '+(product.sku||context.id)+'. ⚠️ Chưa tải lại được kho; không cần bấm duyệt lại.',false);
      return result;
    });}
    function renderLocalAiState(state){
      localAiRuntime.status=state||localAiRuntime.status||{};
      const el=$('local-ai-state');if(!el)return;
      const s=localAiRuntime.status||{};
      if(!s.configured){el.textContent='LOCAL: CHƯA CẤU HÌNH';el.className='local-ai-state bad';return}
      if(s.online){el.textContent='LOCAL: ONLINE'+(Number(s.running)>0?' · ĐANG TẠO':'');el.className='local-ai-state ok';return}
      el.textContent='LOCAL: OFFLINE';el.className='local-ai-state bad';
    }
    async function loadLocalAiStatus(){
      try{
        const r=await fetch('/api/admin/local-ai/status',{headers:headers(false),cache:'no-store'}),d=await r.json();
        if(!r.ok||!d.success)throw new Error(d.message||'Không đọc được Local AI');
        renderLocalAiState(d.localAi||{});
        return d.localAi||{};
      }catch(error){renderLocalAiState({configured:true,online:false});return null}
    }
    function clearLocalAiPoll(){
      if(localAiRuntime.timer){clearTimeout(localAiRuntime.timer);localAiRuntime.timer=null}
      localAiRuntime.jobId='';localAiRuntime.deadline=0;
    }
    async function pollLocalAiJob(jobId){
      if(!jobId)return;
      const context=kblContentContext();
      localAiRuntime.jobId=String(jobId);
      if(!localAiRuntime.deadline)localAiRuntime.deadline=Date.now()+20*60*1000;
      if(Date.now()>localAiRuntime.deadline){clearLocalAiPoll();$('content-status').textContent='❌ Local AI quá thời gian chờ. Kiểm tra cửa sổ Worker/ComfyUI.';return}
      try{
        const r=await fetch('/api/admin/local-ai/job/'+encodeURIComponent(jobId),{headers:headers(false),cache:'no-store'}),d=await r.json();
        if(!kblContentCurrent(context)||localAiRuntime.jobId!==String(jobId))return;
        if(!r.ok||!d.success)throw new Error(d.message||'Không đọc được job Local AI');
        if(d.product&&String(d.product.id)!==context.id)throw new Error('Ảnh Local AI trả về sai mã sản phẩm.');
        renderLocalAiState(d.localAi||{});
        const job=d.job||{};
        if(job.status==='done'){
          clearLocalAiPoll();
          if(d.product){const p=productState.products.find(x=>String(x.id)===String(d.product.id));if(p)Object.assign(p,d.product);contentState.product={...(contentState.product||{}),...d.product}}
          if(d.image){contentState.assets.displayCandidateImage=d.image;contentState.displayUploadImage=''}
          $('content-engine').textContent='LOCAL AI · CHỜ DUYỆT';
          $('content-status').textContent='✅ ẢNH LOCAL ĐÃ XONG. So với ảnh gốc; đạt thì bấm TRƯNG BÀY SẢN PHẨM, chưa đạt thì bấm TẠO 1 ẢNH AI LOCAL lại.';
          updateContentAssetPreviews();renderAdminProducts();await drawContentCover();return;
        }
        if(job.status==='failed'){
          clearLocalAiPoll();$('content-status').textContent='❌ Local AI: '+(job.message||'Tạo ảnh thất bại.');return;
        }
        $('content-status').textContent=job.status==='running'?'⏳ Máy Local AI đang tạo đúng 1 ảnh cho SKU này…':'⏳ Job đang chờ máy Local AI nhận…';
        localAiRuntime.timer=setTimeout(()=>pollLocalAiJob(jobId),localAiRuntime.pollMs);
      }catch(error){
        if(!kblContentCurrent(context)||localAiRuntime.jobId!==String(jobId))return;
        $('content-status').textContent='⚠️ Đang chờ Local AI: '+error.message;
        localAiRuntime.timer=setTimeout(()=>pollLocalAiJob(jobId),Math.max(5000,localAiRuntime.pollMs));
      }
    }
    async function generateLocalDisplayImage(){
      const context=kblContentContext(),productId=context.id;if(!productId)return $('content-status').textContent='❌ Hãy chọn Mã SP trước.';
      const button=$('content-local-generate');if(button)button.disabled=true;
      clearLocalAiPoll();
      try{
        // buildFlowKit đồng thời lưu ảnh upload mới vào đúng SKU và sinh prompt chung Local/Flow.
        const kit=await buildFlowKit();if(!kit||String($('content-product')?.value)!==String(productId))return;
        $('content-status').textContent='Đang gửi 1 job sang máy Local AI…';
        const r=await fetch('/api/admin/local-ai/generate',{method:'POST',headers:headers(true),body:JSON.stringify({productId,displayStyle:$('content-display-style')?.value||'marble-satin',campaign:$('content-campaign')?.value||''})}),d=await r.json();
        if(!kblContentCurrent(context))return;
        if(!r.ok||!d.success){
          if(d.job&&['pending','running'].includes(d.job.status)){renderLocalAiState(d.localAi||{});localAiRuntime.deadline=Date.now()+20*60*1000;pollLocalAiJob(d.job.id);return}
          throw new Error(d.message||'Không tạo được job Local AI');
        }
        renderLocalAiState(d.localAi||{});localAiRuntime.deadline=Date.now()+20*60*1000;
        $('content-engine').textContent='LOCAL AI';
        $('content-status').textContent=d.message||'✅ Đã gửi Local AI.';
        pollLocalAiJob(d.job&&d.job.id);
      }catch(error){if(kblContentCurrent(context)){kblMediaStatus(context,'❌ '+kblMediaError(error));await loadLocalAiStatus()}}finally{if(button)button.disabled=false}
    }

    async function createOrRedoDisplayImage(){const data=await buildFlowKit();if(!data)return;try{await copyTextValue($('content-display-prompt')?.value||'');window.open(data.flowUrl||contentState.flowUrl||'https://flow.google/','_blank','noopener');$('content-status').textContent='✅ Đã copy prompt và mở Google Flow. Tạo ảnh xong tải kết quả về ô bên phải.'}catch(error){$('content-status').textContent='❌ '+error.message}}
    async function prepareVideoFromSelectedImage(){
      const p=selectedContentProduct();if(!p)return $('content-status').textContent='❌ Hãy chọn sản phẩm trước.';if(!videoProductImage(p))return $('content-status').textContent='❌ Hãy DUYỆT / TRƯNG BÀY ảnh sản phẩm trước rồi mới chuyển sang Video Studio.';showAdminView('video');if($('video-template'))$('video-template').value='product-spotlight';updateVideoTemplateNote();refreshVideoProductOptions();if($('video-product'))$('video-product').value=String(p.id||'');videoStudioState.multiSelectedIds=[];videoStudioState.directorPlan={template:'product-spotlight',productIds:[String(p.id||'')],title:(p.displayName||p.name||''),directorStyle:'sang-trong',directorNote:'Đi từ Content Studio. Dùng Gemini/Veo trên web thủ công; không gọi Veo API trả phí.'};renderVideoMasterPack(videoStudioState.directorPlan);if($('video-director-style'))$('video-director-style').value='sang-trong';if($('video-title'))$('video-title').value=p.displayName||p.name||'';$('video-status').textContent='✅ Đã chuyển SKU sang Video Studio. Tạo lời thoại + prompt → COPY sang Gemini/Veo web → tải RAW về KBL.';await checkVideoDuplicate();
    }

    function selectedVeoProduct(){return selectedContentProduct()||contentState.product||null}
    function setVeoLog(text,state=''){
      if($('veo-job-log'))$('veo-job-log').textContent=text||'';
      if($('veo-progress'))$('veo-progress').classList.toggle('running',state==='processing');
      if($('veo-job-title'))$('veo-job-title').textContent=state==='ready'?'Video đã tạo':state==='failed'?'Veo báo lỗi':state==='processing'?'Veo đang dựng video':'Veo API';
    }
    function renderVeoVideo(product){
      const box=$('veo-video-box'),approve=$('veo-approve');if(!box)return;
      const manifest=product&&product.contentManifest||{},media=manifest.media||{};
      const candidate=media.veoCandidateVideo||product?.veoVideoCandidate||'',approved=media.approvedVideo||product?.approvedStudioVideo||'';
      const video=candidate||approved;
      if(video){box.innerHTML='<video src="'+safe(video)+'" controls playsinline preload="metadata"></video>';if(approve)approve.disabled=!candidate}
      else{box.innerHTML='<span>Chưa có video Veo cho SKU đang chọn.</span>';if(approve)approve.disabled=true}
      const job=(manifest.veo&&manifest.veo.job)||product?.veoJob||null;
      if(job&&job.status==='processing')setVeoLog('Job đã gửi lúc '+dateTime(job.startedAt)+'. Có thể mất từ vài chục giây đến vài phút.','processing');
      else if(job&&job.status==='failed')setVeoLog(job.error||'Veo tạo video thất bại.','failed');
      else if(candidate)setVeoLog('Video Veo đã tải về server và đang chờ ông duyệt.','ready');
      else if(approved)setVeoLog('Video này đã được duyệt và sẵn sàng cho Publisher / Live Center.','ready');
      else setVeoLog('Chọn sản phẩm, chuẩn bị ảnh và prompt rồi bấm tạo video.','');
    }
    async function loadVeoStatus(){
      try{
        const r=await fetch('/api/admin/content/veo/status',{headers:headers(false),cache:'no-store'}),d=await r.json();
        if(!r.ok||!d.success)throw new Error(d.message||'Không đọc được Veo');
        veoRuntime.status=d.veo||{};veoRuntime.configured=Boolean(d.veo&&d.veo.configured);veoRuntime.enabled=Boolean(d.veo&&d.veo.enabled);veoRuntime.pollMs=Number(d.veo&&d.veo.pollMs)||10000;
        const badge=$('veo-api-state');if(badge){badge.textContent=veoRuntime.configured?'API SẴN SÀNG':'CHƯA CÓ API KEY';badge.className='veo-state '+(veoRuntime.configured?'ok':'bad')}
        if($('veo-model')&&d.veo?.defaultModel)$('veo-model').value=d.veo.defaultModel;
      }catch(error){veoRuntime.configured=false;const badge=$('veo-api-state');if(badge){badge.textContent='CHƯA KIỂM TRA';badge.className='veo-state bad'}}
      renderVeoVideo(selectedVeoProduct());
    }
    async function startVeoVideo(){
      const product=selectedVeoProduct(),productId=product&&product.id;if(!productId)return $('content-status').textContent='❌ Hãy chọn sản phẩm trước.';
      const manifest=product&&product.contentManifest||{},media=manifest.media||{},approvedImage=media.displayImage||product.displayImage||(isPublished(product)?product.image:'');if(!approvedImage)return $('content-status').textContent='❌ Hãy DUYỆT / TRƯNG BÀY ảnh sản phẩm trước khi gọi Veo API.';
      clearVeoPoll();if(!veoRuntime.configured){await loadVeoStatus();if(!veoRuntime.configured)return $('content-status').textContent='❌ Server chưa có Gemini API key cho Veo.'}
      let promptText=$('content-flow-prompt')?.value||'';if(!promptText){const data=await generateContent();if(!data)return;promptText=$('content-flow-prompt')?.value||''}
      if(!window.confirm('Tạo 1 video Veo cho '+(product.sku||product.name)+'? Google có thể tính phí theo thời lượng/model.'))return;
      const button=$('veo-generate')||$('content-use-image-video');if(button)button.disabled=true;
      setVeoLog('Đang gửi ảnh + prompt + dữ liệu SKU sang Veo 3.1…','processing');$('content-status').textContent='Veo đang nhận job video…';
      try{
        const response=await fetch('/api/admin/content/veo/start',{method:'POST',headers:headers(true),body:JSON.stringify({productId,prompt:promptText,model:$('veo-model')?.value||'',durationSeconds:$('veo-duration')?.value||8,resolution:$('veo-resolution')?.value||'720p',campaign:$('content-campaign')?.value||'',tone:$('content-tone')?.value||'sang-trong'})}),data=await response.json();
        if(!response.ok||!data.success)throw new Error(data.message||'Không gửi được job Veo');
        if(data.product){const p=productState.products.find(x=>String(x.id)===String(productId));if(p)Object.assign(p,data.product);contentState.product={...(contentState.product||{}),...data.product}}
        $('content-status').textContent='✅ Veo đã nhận job. Trang sẽ tự kiểm tra đến khi xong.';setVeoLog('Job đã nhận. Đang dựng video 9:16…','processing');scheduleVeoPoll(productId,1500);
      }catch(error){$('content-status').textContent='❌ '+error.message;setVeoLog(error.message,'failed')}finally{if(button)button.disabled=false}
    }
    function scheduleVeoPoll(productId,delay){
      clearVeoPoll();
      veoRuntime.timer=setTimeout(()=>{veoRuntime.timer=null;checkVeoJob(productId,true)},Math.max(800,Number(delay)||veoRuntime.pollMs));
    }
    async function checkVeoJob(productId,auto=false){
      const id=productId||selectedVeoProduct()?.id;if(!id)return;
      const button=$('veo-check');if(button&&!auto)button.disabled=true;
      try{
        const response=await fetch('/api/admin/content/veo/job/'+encodeURIComponent(id),{headers:headers(false),cache:'no-store'}),data=await response.json();
        if(!response.ok||!data.success)throw new Error(data.message||'Không kiểm tra được Veo');
        const p=productState.products.find(x=>String(x.id)===String(id));if(p&&data.product)Object.assign(p,data.product);const currentId=String(selectedVeoProduct()?.id||'');if(currentId!==String(id)){clearVeoPoll();return}if(data.product)contentState.product={...(contentState.product||{}),...data.product};
        renderVeoVideo(data.product||p);
        if(!data.done){setVeoLog('Veo đang xử lý. Hệ thống sẽ kiểm tra lại tự động…','processing');scheduleVeoPoll(id,veoRuntime.pollMs)}
        else if(data.status==='ready'){$('content-status').textContent='✅ VIDEO VEO ĐÃ XONG. Xem video rồi bấm DUYỆT VIDEO.';refreshPublisherProducts();refreshLiveProductOptions()}
        else if(data.status==='approved'){$('content-status').textContent='✅ Video Veo đã được duyệt. Có thể sang Xuất bản hoặc Live Center.';refreshPublisherProducts();refreshLiveProductOptions()}
        else if(data.status==='failed')$('content-status').textContent='❌ '+(data.job?.error||'Veo tạo video thất bại.');
      }catch(error){setVeoLog(error.message,'failed');if(auto&&String(selectedVeoProduct()?.id||'')===String(id))scheduleVeoPoll(id,Math.max(15000,veoRuntime.pollMs))}finally{if(button)button.disabled=false}
    }
    async function approveVeoVideo(){
      const p=selectedVeoProduct();if(!p)return;clearVeoPoll();
      const response=await fetch('/api/admin/content/veo/approve/'+encodeURIComponent(p.id),{method:'POST',headers:headers(true),body:'{}'}),data=await response.json();
      if(!response.ok||!data.success)return $('content-status').textContent='❌ '+(data.message||'Không duyệt được video');
      const local=productState.products.find(x=>String(x.id)===String(p.id));if(local&&data.product)Object.assign(local,data.product);contentState.product={...(contentState.product||{}),...(data.product||{})};renderVeoVideo(data.product||local);refreshPublisherProducts();refreshLiveProductOptions();$('content-status').textContent='✅ Đã duyệt video. Có thể sang Xuất bản hoặc Live Center.';
    }
    async function resetVeoVideo(){
      const p=selectedVeoProduct();if(!p)return;if(!window.confirm('Xóa video Veo đang chờ và tạo lại cho SKU này? Video đã DUYỆT trước đó vẫn được giữ.'))return;clearVeoPoll();
      const r=await fetch('/api/admin/content/veo/reset/'+encodeURIComponent(p.id),{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(r.ok&&d.success){const local=productState.products.find(x=>String(x.id)===String(p.id));if(local&&d.product)Object.assign(local,d.product);if(d.product)contentState.product={...(contentState.product||{}),...d.product};renderVeoVideo(d.product||local);$('content-status').textContent='✅ Đã xóa bản Veo chờ. Bấm TẠO VIDEO VEO để làm bản mới.'}
    }

    const publisherLinks={facebook:'https://www.facebook.com/',instagram:'https://www.instagram.com/',threads:'https://www.threads.net/',tiktok:'https://www.tiktok.com/upload',youtube:'https://studio.youtube.com/',zalo:'https://oa.zalo.me/',telegram:'https://web.telegram.org/'};
    // KBL VIDEO STUDIO V5 · Veo RAW -> FFmpeg price overlay only.
    const videoStudioState={jobs:[],activeJobId:'',poll:null,queue:null,draft:null,sourceVideo:'',sourceFile:null,sourceObjectUrl:'',sourceDuration:0,multiSelectedIds:[],contentHistory:{},pickerMode:'multi',pickerDraft:[],directorPlan:null};
    function videoTemplateNeedsProduct(){return String($('video-template')?.value||'')==='product-spotlight'}
    function videoTemplateNeedsMultipleProducts(){return String($('video-template')?.value||'')==='product-multi'}
    function selectedVideoMultiIds(){return (videoStudioState.multiSelectedIds||[]).map(String).filter(Boolean).slice(0,3)}
    function videoSceneCountClient(){const d=Math.max(1,Number($('video-duration')?.value||20));return Math.max(1,Math.ceil(d/10))}
    function videoSceneRolesClient(count,style){const n=Math.max(1,Math.min(6,Number(count)||1));if(String(style)==='hai-cham-biem'){const m={1:['SETUP + PUNCHLINE + FACT'],2:['SETUP','PUNCHLINE + FACT / CTA'],3:['SETUP','REACTION / PUNCHLINE','FACT / CTA'],4:['SETUP','PHÁT TRIỂN','PUNCHLINE','FACT / CTA'],5:['SETUP','PHÁT TRIỂN','TĂNG NHỊP','PUNCHLINE','FACT / CTA'],6:['SETUP','BỐI CẢNH','PHÁT TRIỂN','REACTION','FACT','KẾT / CTA']};return m[n]||m[1]}if(String(style)==='kien-thuc'){const m={1:['HOOK + GIẢI THÍCH + KẾT'],2:['HOOK / CÂU HỎI','GIẢI THÍCH + KẾT'],3:['HOOK','DỮ LIỆU / GIẢI THÍCH','TÓM TẮT / CTA'],4:['HOOK','DỮ LIỆU 1','DỮ LIỆU 2 / CAO TRÀO','TÓM TẮT / CTA'],5:['HOOK','BỐI CẢNH','DỮ LIỆU 1','DỮ LIỆU 2','TÓM TẮT / CTA'],6:['HOOK','BỐI CẢNH','DỮ LIỆU 1','DỮ LIỆU 2','KẾT LUẬN','CTA']};return m[n]||m[1]}const m={1:['HOOK + NỘI DUNG + KẾT'],2:['HOOK','PHÁT TRIỂN + KẾT'],3:['HOOK','PHÁT TRIỂN','KẾT / CTA'],4:['HOOK','PHÁT TRIỂN','CAO TRÀO / SẢN PHẨM','KẾT / CTA'],5:['HOOK','BỐI CẢNH','PHÁT TRIỂN','CAO TRÀO','KẾT / CTA'],6:['HOOK','BỐI CẢNH','PHÁT TRIỂN 1','PHÁT TRIỂN 2','CAO TRÀO','KẾT / CTA']};return m[n]||m[1]}
    function videoScenePreviewTimes(duration,count){const total=Math.max(1,Number(duration)||20),n=Math.max(1,Number(count)||1),base=Math.floor(total/n),extra=total-base*n,out=[];let start=0;for(let i=0;i<n;i++){const d=base+(i<extra?1:0);out.push({start,end:start+d,duration:d});start+=d}return out}
    function renderVideoSceneChain(){const box=$('video-scene-chain'),plan=$('video-scene-plan'),title=$('video-scene-plan-title');if(!box||!plan)return;const duration=Math.max(1,Number($('video-duration')?.value||20)),count=videoSceneCountClient(),style=String($('video-director-style')?.value||'viral'),draftScenes=Array.isArray(videoStudioState.draft?.scenes)?videoStudioState.draft.scenes:[],times=videoScenePreviewTimes(duration,count),roles=videoSceneRolesClient(count,style),scenes=draftScenes.length?draftScenes:times.map((t,i)=>({index:i+1,count,start:t.start,end:t.end,duration:t.duration,role:roles[i]||('SCENE '+(i+1)),script:'',prompt:'',startBridge:'',endBridge:''}));if(title)title.textContent='🎬 VIDEO PLAN · '+duration+' GIÂY · '+count+' SCENE';plan.innerHTML=scenes.map(s=>'<span class="video-scene-chip">Scene '+safe(s.index)+' · '+safe(s.start)+'–'+safe(s.end)+'s · '+safe(s.role||'')+'</span>').join('');const ready=draftScenes.length>0;box.innerHTML=scenes.map(s=>{const warning=Boolean(s.timingWarning),bridge=ready?(Number(s.index)===1?'Bắt đầu liền trong showroom.':('Nối từ Scene '+(Number(s.index)-1)+': '+String(s.startBridge||'tiếp tục đúng pose/động tác cuối scene trước.')))+(Number(s.index)<count?'<br>Kết để nối Scene '+(Number(s.index)+1)+': '+safe(s.endBridge||'giữ động tác đang diễn ra.'):'<br>Đây là scene cuối: kết tự nhiên, không tạo end-card bằng Veo.'):'Scene sau sẽ được khóa cùng người dẫn, vest, showroom, ánh sáng, camera và nối đúng động tác cuối scene trước.';return '<div class="video-scene-card '+(ready?(warning?'warning':'ready'):'')+'"><div class="video-scene-card-head"><b>SCENE '+safe(s.index)+' · '+safe(s.start)+'–'+safe(s.end)+'s · '+safe(s.role||'')+'</b><span>'+(ready?('Lời thoại ~'+Number(s.estimateSeconds||0).toFixed(1)+'s'):'CHỜ TẠO')+'</span></div><div class="video-scene-script">'+(ready?safe(s.script||''):'Lời thoại scene sẽ xuất hiện sau khi bấm TẠO LỜI THOẠI + PROMPT VEO.')+'</div><div class="video-scene-bridge">🔗 '+bridge+'</div><textarea id="video-scene-prompt-'+safe(s.index)+'" data-video-scene-prompt="'+safe(s.index)+'" '+(ready?'':'disabled')+' placeholder="Prompt Scene '+safe(s.index)+' sẽ xuất hiện ở đây.">'+(ready?safe(s.prompt||''):'')+'</textarea><div class="video-v5-actions"><button class="gold" type="button" data-copy-video-scene="'+safe(s.index)+'" '+(ready?'':'disabled')+'>COPY PROMPT '+safe(s.index)+'</button></div>'+(warning?'<div class="video-v5-warning">⚠ '+safe(s.timingWarning)+'</div>':'')+'</div>'}).join('');box.querySelectorAll('[data-copy-video-scene]').forEach(b=>b.addEventListener('click',()=>copyVideoScenePrompt(Number(b.dataset.copyVideoScene))));const uploadHelp=$('video-veo-upload-help'),uploadNote=$('video-scene-upload-note');if(uploadHelp)uploadHelp.textContent='Sau khi tạo '+count+' clip theo đúng thứ tự Scene 1 → Scene '+count+', nối chúng thành 1 MP4 RAW hoàn chỉnh khoảng '+duration+' giây rồi upload tại đây. KBL giữ nguyên audio/khẩu hình/cử chỉ và gắn card theo timeline Scene Chain.';if(uploadNote)uploadNote.textContent='AUTO CUE dùng vị trí câu trong từng scene để ước lượng mốc card. Sau khi upload video đã nối, ông vẫn có thể phát đúng thời điểm và bấm LẤY MỐC để chỉnh từng card chính xác.'}
    async function copyVideoScenePrompt(index){const el=$('video-scene-prompt-'+Number(index));const value=String(el?.value||'').trim();if(!value)return $('video-status').textContent='❌ Scene '+index+' chưa có prompt.';try{await copyTextValue(value);$('video-status').textContent='✅ Đã copy Prompt Scene '+index+'. Tạo clip này trên Gemini/Veo rồi làm tiếp Scene '+(Number(index)+1)+'.'}catch(e){$('video-status').textContent='❌ '+e.message}}
    function clearVideoDraftForTiming(){videoStudioState.draft=null;if($('video-veo-prompt'))$('video-veo-prompt').value='';if($('video-script'))$('video-script').value='';if($('video-caption'))$('video-caption').value='';if($('video-draft-meta'))$('video-draft-meta').textContent='Chưa tạo nội dung cho thời lượng mới.';renderVideoPriceSnapshot();renderVideoCueRows();renderVideoSceneChain()}
    function goldWeight(v){const n=Number(v||0);return Number.isFinite(n)&&n>0?n.toLocaleString('vi-VN',{minimumFractionDigits:0,maximumFractionDigits:3}):'—'}
    function videoProductImage(p){const m=p&&p.contentManifest||{},media=m.media||{};return media.displayImage||p.displayImage||(isPublished(p)?p.image:'')||''}
    function contentHistoryFor(p){return videoStudioState.contentHistory&&videoStudioState.contentHistory[String(p&&p.id||'')]||{videoCount:0,publishedCount:0,lastVideoAt:'',history:[],pairedSkus:[]}}
    function contentStateText(h){if(!Number(h.videoCount||0))return ['🟢 CHƯA LÀM VIDEO',''];const days=h.lastVideoAt?Math.floor((Date.now()-Date.parse(h.lastVideoAt))/86400000):999;if(days>=30)return ['🟡 '+days+' NGÀY CHƯA ĐẨY','stale'];return ['🔵 VIDEO: '+Number(h.videoCount||0)+' · ĐÃ ĐĂNG: '+Number(h.publishedCount||0),'used']}
    function renderVideoSelectedProducts(){const box=$('video-product-picker');if(!box)return;const ids=selectedVideoMultiIds(),rows=contentEligibleProducts().filter(p=>ids.includes(String(p.id)));box.innerHTML=rows.length?rows.map(p=>{const img=videoProductImage(p),h=contentHistoryFor(p);return '<div class="video-selected-card">'+(img?'<img src="'+safe(img)+'" alt="">':'<div></div>')+'<div><b>'+safe(p.sku)+' · '+safe(p.displayName||p.name)+'</b><small>Vàng '+safe(p.goldCode||'—')+' · '+safe(goldWeight(p.weightChi))+' chỉ</small><small>Video '+Number(h.videoCount||0)+' · gần nhất '+safe(h.lastVideoAt?dateTime(h.lastVideoAt):'chưa có')+'</small></div></div>'}).join(''):'<div class="empty">Chưa chọn sản phẩm. Bấm + CHỌN SẢN PHẨM.</div>'}
    function refreshVideoProductOptions(){
      const select=$('video-product');if(!select)return;const current=select.value,rows=contentEligibleProducts().filter(p=>videoProductImage(p));select.innerHTML='<option value="">— Chọn SKU có ảnh —</option>'+rows.map(p=>'<option value="'+safe(p.id)+'">'+safe((p.sku||'')+' · '+(p.name||''))+'</option>').join('');if(rows.some(p=>String(p.id)===String(current)))select.value=current;
      const singleWrap=$('video-product-single-wrap'),multiWrap=$('video-product-multi-wrap'),multi=videoTemplateNeedsMultipleProducts();if(singleWrap)singleWrap.hidden=multi||!videoTemplateNeedsProduct();if(multiWrap)multiWrap.hidden=!multi;select.disabled=!videoTemplateNeedsProduct();renderVideoSelectedProducts();
    }
    async function loadContentHistory(){try{const r=await fetch('/api/admin/content-history',{headers:headers(false),cache:'no-store'}),d=await r.json();if(r.ok&&d.success)videoStudioState.contentHistory=d.stats||{};refreshVideoProductOptions()}catch(_){}}
    function openVideoProductPicker(mode){videoStudioState.pickerMode=mode==='single'?'single':'multi';videoStudioState.pickerDraft=videoStudioState.pickerMode==='single'?[$('video-product')?.value].filter(Boolean):selectedVideoMultiIds();const cats=[...new Set(contentEligibleProducts().map(p=>String(p.category||'')).filter(Boolean))].sort();if($('video-picker-category'))$('video-picker-category').innerHTML='<option value="">Tất cả danh mục</option>'+cats.map(x=>'<option>'+safe(x)+'</option>').join('');if($('video-picker-search'))$('video-picker-search').value='';if($('video-picker-filter'))$('video-picker-filter').value='recommended';renderVideoProductPicker();if($('video-product-modal'))$('video-product-modal').hidden=false}
    function closeVideoProductPicker(){if($('video-product-modal'))$('video-product-modal').hidden=true}
    function renderVideoProductPicker(){const box=$('video-picker-grid');if(!box)return;const q=String($('video-picker-search')?.value||'').trim().toLowerCase(),filter=String($('video-picker-filter')?.value||'recommended'),cat=String($('video-picker-category')?.value||''),now=Date.now();let rows=contentEligibleProducts().filter(p=>videoProductImage(p)).filter(p=>!q||String((p.sku||'')+' '+(p.name||'')).toLowerCase().includes(q)).filter(p=>!cat||String(p.category||'')===cat);rows=rows.filter(p=>{const h=contentHistoryFor(p),days=h.lastVideoAt?Math.floor((now-Date.parse(h.lastVideoAt))/86400000):9999;if(filter==='never')return !Number(h.videoCount||0);if(filter==='stale')return days>=30;if(filter==='published')return Number(h.publishedCount||0)>0;return true});if(filter==='recommended')rows.sort((a,b)=>{const ha=contentHistoryFor(a),hb=contentHistoryFor(b);return Number(ha.videoCount||0)-Number(hb.videoCount||0)||Date.parse(ha.lastVideoAt||0)-Date.parse(hb.lastVideoAt||0)});box.innerHTML=rows.slice(0,160).map(p=>{const h=contentHistoryFor(p),[label,cls]=contentStateText(h),sel=videoStudioState.pickerDraft.includes(String(p.id)),img=videoProductImage(p),platforms=(h.publishedPlatforms||[]).slice(0,5).map(x=>String(x).toUpperCase()).join(' · '),history=(h.history||[]).slice(0,3).map(x=>safe(dateTime(x.at))+' · '+safe(x.title||x.template)+(x.platforms&&x.platforms.length?' · '+safe(x.platforms.join('/')):'')).join('<br>'),last=h.lastVideoAt?dateTime(h.lastVideoAt):'—';return '<div class="video-picker-card '+(sel?'selected':'')+'" data-video-product-card="'+safe(p.id)+'">'+(img?'<img src="'+safe(img)+'" alt="">':'<div class="empty">Chưa ảnh</div>')+'<h4>'+safe(p.sku)+' · '+safe(p.displayName||p.name)+'</h4><p>Vàng '+safe(p.goldCode||'—')+' · '+safe(goldWeight(p.weightChi))+' chỉ<br>'+safe(money(p.referencePrice||p.price||0))+'</p><span class="content-state-badge '+safe(cls)+'">'+safe(label)+'</span><div class="video-history-mini"><b>Lần gần nhất:</b> '+safe(last)+'<br><b>Nền tảng:</b> '+safe(platforms||'chưa ghi nhận')+'<br>'+(history||'Chưa có lịch sử content.')+'</div></div>'}).join('')||'<div class="empty">Không có sản phẩm phù hợp bộ lọc.</div>';box.querySelectorAll('[data-video-product-card]').forEach(card=>card.onclick=()=>{const id=String(card.dataset.videoProductCard);if(videoStudioState.pickerMode==='single')videoStudioState.pickerDraft=[id];else{const pos=videoStudioState.pickerDraft.indexOf(id);if(pos>=0)videoStudioState.pickerDraft.splice(pos,1);else if(videoStudioState.pickerDraft.length<3)videoStudioState.pickerDraft.push(id);else return $('video-status').textContent='❌ Tối đa 3 sản phẩm.'}renderVideoProductPicker()});if($('video-picker-selected'))$('video-picker-selected').textContent='Đã chọn: '+videoStudioState.pickerDraft.length+(videoStudioState.pickerMode==='multi'?' / 3':' / 1')}
    async function confirmVideoProductPicker(){if(videoStudioState.pickerMode==='single'){if($('video-product'))$('video-product').value=videoStudioState.pickerDraft[0]||''}else videoStudioState.multiSelectedIds=videoStudioState.pickerDraft.slice(0,3);closeVideoProductPicker();refreshVideoProductOptions();await checkVideoDuplicate()}
    async function checkVideoDuplicate(){const t=String($('video-template')?.value||''),ids=t==='product-spotlight'?[$('video-product')?.value].filter(Boolean):t==='product-multi'?selectedVideoMultiIds():[],box=$('video-duplicate-warning');if(!box)return;if(!ids.length){box.hidden=true;return}try{const r=await fetch('/api/admin/content-history/duplicate',{method:'POST',headers:headers(true),body:JSON.stringify({template:t,productIds:ids})}),d=await r.json(),w=d.warning||{};if(r.ok&&d.success&&w.duplicate){box.hidden=false;box.innerHTML='⚠️ <b>CẢNH BÁO TRÙNG:</b> '+safe(w.message||'Đã làm gần đây.')+'<br>'+safe(w.at?dateTime(w.at):'')+' · '+safe(w.title||w.template||'')}else box.hidden=true}catch(_){box.hidden=true}}
    function updateVideoTemplateNote(){const t=String($('video-template')?.value||'gold-price');refreshVideoProductOptions();const notes={'gold-price':'Scene Chain: KBL chia nội dung theo từng clip tối đa 10 giây. Card 9999 → 980 → 610 được canh theo chính scene/câu đang nói sau khi ông nối RAW.','product-spotlight':'Scene Chain 1 món: hook → dữ liệu thật → CTA; KBL Product Hero dùng ảnh thật/SKU thật, không để Veo tự vẽ lại món.','product-multi':'Scene Chain nhiều món: hook → từng sản phẩm → so sánh/CTA. Mỗi scene có continuity lock để ghép thành một video liền mạch.','website-features':'Scene Chain giới thiệu tính năng thật theo từng đoạn; không yêu cầu Veo vẽ chữ hoặc screenshot website.'};if($('video-template-note'))$('video-template-note').textContent=notes[t]||'';videoStudioState.draft=null;if($('video-script'))$('video-script').value='';if($('video-veo-prompt'))$('video-veo-prompt').value='';if($('video-caption'))$('video-caption').value='';if($('video-caption-kind'))$('video-caption-kind').textContent='Chưa có chủ đề.';renderVideoPriceSnapshot();renderVideoCueRows();renderVideoSceneChain();checkVideoDuplicate();}
    function videoStatusLabel(status){return ({review:'CHỜ CHỈNH MỐC',pending:'CHỜ WORKER',running:'ĐANG HẬU KỲ',done:'CHỜ DUYỆT',approved:'ĐÃ DUYỆT',failed:'LỖI',canceled:'ĐÃ HỦY'})[String(status||'')]||String(status||'—').toUpperCase()}
    function renderVideoQueue(queue={}){videoStudioState.queue=queue;const state=$('video-worker-state');if(state){state.className='video-worker-state '+(queue.online?'ok':queue.configured?'':'bad');state.textContent=queue.online?'WORKER V5: ONLINE':queue.configured?'WORKER V5: OFFLINE':'WORKER V5: CHƯA CẤU HÌNH'}if($('video-q-pending'))$('video-q-pending').textContent='Chờ: '+Number(queue.pending||0);if($('video-q-running'))$('video-q-running').textContent='Đang hậu kỳ: '+Number(queue.running||0);if($('video-q-done'))$('video-q-done').textContent='Đã xong: '+Number(queue.completed||0);if($('video-q-approved'))$('video-q-approved').textContent='Đã duyệt: '+Number(queue.approved||0)}
    function renderVideoPriceSnapshot(){const box=$('video-price-snapshot'),d=videoStudioState.draft;if(!box)return;if(!d){box.innerHTML='';return}if(String(d.template)==='gold-price'&&Array.isArray(d.priceRows)){box.innerHTML=d.priceRows.map(r=>'<div class="video-price-pill"><b>VÀNG '+safe(r.code)+'</b><small>Mua '+money(r.buy)+'<br>Bán '+money(r.sell)+'</small></div>').join('');return}if(['product-spotlight','product-multi'].includes(String(d.template))&&Array.isArray(d.products)){box.innerHTML='<div class="video-product-snapshot">'+d.products.map(p=>'<div class="video-product-pill"><b>'+safe(p.name||'Sản phẩm')+'</b><small>Mã sản phẩm: '+safe(p.sku||'—')+'<br>Loại vàng: '+safe(p.goldCode||'—')+' · Trọng lượng vàng: '+safe(Number(p.weightChi||0).toLocaleString('vi-VN',{maximumFractionDigits:3}))+' chỉ<br>Thành tiền tham khảo: '+safe(money(p.price||0))+'</small></div>').join('')+'</div>';return}box.innerHTML=''}
    function renderVideoCueRows(){const box=$('video-cues'),d=videoStudioState.draft;if(!box)return;const hints=Array.isArray(d?.cueHints)?d.cueHints:[];if(!hints.length){box.innerHTML='<div class="empty">Chủ đề này không cần card canh theo giọng.</div>';return}box.innerHTML=hints.map((h,i)=>'<div class="video-cue-row"><b>'+safe(h.label||(String(d.template)==='gold-price'?'VÀNG '+h.code:'MÓN '+(i+1)))+'</b><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><label style="font-size:9.5px">Bắt đầu (s)<input id="video-cue-start-'+safe(h.code)+'" data-video-cue-key="'+safe(h.code)+'" type="number" min="0" step="0.05" placeholder="0.00"></label><label style="font-size:9.5px">Kết thúc (s)<input id="video-cue-end-'+safe(h.code)+'" type="number" min="0" step="0.05" placeholder="3.20"></label></div><div style="display:flex;gap:4px"><button type="button" data-video-mark-cue="'+safe(h.code)+'" data-video-mark-side="start">LẤY BĐ</button><button type="button" data-video-mark-cue="'+safe(h.code)+'" data-video-mark-side="end">LẤY KT</button></div></div>').join('');box.querySelectorAll('[data-video-mark-cue]').forEach(b=>b.addEventListener('click',()=>markVideoCue(b.dataset.videoMarkCue,b.dataset.videoMarkSide||'start')));}
    function renderVideoHistory(){const box=$('video-history');if(!box)return;const rows=videoStudioState.jobs||[];box.innerHTML=rows.length?'<table><thead><tr><th>Job</th><th>Chủ đề</th><th>Trạng thái</th><th>Tạo lúc</th><th></th></tr></thead><tbody>'+rows.map(j=>'<tr><td><span class="sku">'+safe(j.id)+'</span></td><td>'+safe(j.templateLabel||j.template)+'</td><td><b>'+safe(videoStatusLabel(j.status))+'</b></td><td>'+safe(dateTime(j.createdAt))+'</td><td><button class="btn-soft" type="button" data-video-select="'+safe(j.id)+'">XEM</button> '+(!['approved','pending'].includes(String(j.status))?'<button class="btn-soft" type="button" data-video-retry="'+safe(j.id)+'">CHẠY LẠI</button>':'')+(['review','pending','running'].includes(String(j.status))?' <button class="btn-soft" type="button" data-video-cancel="'+safe(j.id)+'">HỦY JOB</button>':'')+'</td></tr>').join('')+'</tbody></table>':'<div class="empty">Chưa có video hậu kỳ.</div>';box.querySelectorAll('[data-video-select]').forEach(b=>b.addEventListener('click',()=>selectVideoJob(b.dataset.videoSelect)));box.querySelectorAll('[data-video-retry]').forEach(b=>b.addEventListener('click',()=>retryVideoJob(b.dataset.videoRetry)));box.querySelectorAll('[data-video-cancel]').forEach(b=>b.addEventListener('click',()=>cancelVideoJob(b.dataset.videoCancel)))}
    function renderVideoJob(job){if(!job)return;videoStudioState.activeJobId=String(job.id||'');if($('video-job-title'))$('video-job-title').textContent=(job.templateLabel||job.template||'Video')+(job.sku?' · '+job.sku:'');if($('video-job-meta'))$('video-job-meta').innerHTML='<div><b>Trạng thái:</b> '+safe(videoStatusLabel(job.status))+'</div><div><b>Video RAW:</b> '+safe(job.sourceVideo?'Đã nhận':'—')+'</div><div><b>Thời lượng:</b> '+safe(String(job.durationSeconds||'—'))+'s · 1080 × 1920</div><div><b>Canh card:</b> '+safe(job.cueOrigin==='owner-manual'?'Mốc thủ công chính xác':job.cueMode==='manual'?'Mốc thủ công':job.cueMode==='ai-video-scan'?'AI quét trực tiếp video':'Auto theo khoảng nghỉ')+'</div><div><b>Caption:</b> '+safe(job.caption?'Đã lưu theo job':'—')+'</div><div><b>Thẻ KBL:</b> '+safe(Number(job.cardProductCount||0)>0?(String(job.cardProductCount)+' SKU · '+((job.cardSkus||[]).join(', ')||'đã khóa snapshot')):'Không cần card sản phẩm / chưa có snapshot')+'</div><div><b>Visual Director:</b> '+safe(Number(job.visualCardCount||0)>0?(String(job.visualCardCount)+' card · '+((job.visualCardTypes||[]).join(', ')||'đã khóa plan')+(job.visualAssetPreparing?' · đang chuẩn bị ảnh minh họa':'')):'Không có visual card bổ sung')+'</div><div><b>Thông báo:</b> '+safe(job.message||'—')+'</div>';const preview=$('video-preview'),empty=$('video-preview-empty'),src=job.resultVideo||'';if(preview&&src){preview.src=src+'?v='+encodeURIComponent(job.completedAt||Date.now());preview.style.display='block';if(empty)empty.style.display='none'}else if(preview){preview.pause();preview.removeAttribute('src');preview.load();preview.style.display='none';if(empty)empty.style.display='grid'}if($('video-approve'))$('video-approve').disabled=!(src&&String(job.status)==='done');if($('video-go-publisher'))$('video-go-publisher').disabled=!(src&&String(job.status)==='approved');if($('video-retry-job')){$('video-retry-job').disabled=!['review','failed','running','done','canceled'].includes(String(job.status));$('video-retry-job').textContent=String(job.status)==='review'?'▶ DÙNG MỐC AI & DỰNG':'🔄 CHẠY LẠI JOB'}if($('video-cancel-job')){$('video-cancel-job').disabled=!['review','pending','running'].includes(String(job.status));$('video-cancel-job').textContent=String(job.status)==='running'?'⛔ HỦY WORKER ĐANG CHẠY':'⛔ HỦY JOB'}if($('video-open'))$('video-open').disabled=!src;if($('video-download'))$('video-download').disabled=!src;if($('video-status'))$('video-status').textContent=(job.status==='running'?'🎞️ ':job.status==='done'?'✅ ':job.status==='approved'?'✓ ':job.status==='failed'?'❌ ':job.status==='canceled'?'⛔ ':'⏳ ')+(job.message||videoStatusLabel(job.status));if(!renderVisualDirectorTimingEditor(job))renderAutoCardJobEditor(job)}
    function selectVideoJob(id){const job=(videoStudioState.jobs||[]).find(j=>String(j.id)===String(id));if(job)renderVideoJob(job)}
    function clearVideoPoll(){if(videoStudioState.poll){clearInterval(videoStudioState.poll);videoStudioState.poll=null}}
    function clearActiveVideoJobSelection(message='Sẵn sàng cho video mới.'){
      clearVideoPoll();videoStudioState.activeJobId='';
      if($('video-job-title'))$('video-job-title').textContent='Chưa có job đang chạy.';
      if($('video-job-meta'))$('video-job-meta').innerHTML='<div>'+safe(message)+'</div>';
      ['video-approve','video-go-publisher','video-retry-job','video-cancel-job','video-open','video-download'].forEach(id=>{if($(id))$(id).disabled=true});
      const preview=$('video-preview'),empty=$('video-preview-empty');if(preview){preview.pause();preview.removeAttribute('src');preview.load();preview.style.display='none'}if(empty)empty.style.display='grid';
      renderVideoCueRows();
    }
    function detachCanceledJobSource(job){
      if(!job||videoStudioState.sourceFile)return;const oldSource=String(job.sourceVideo||''),current=String(videoStudioState.sourceVideo||'');if(!oldSource||current!==oldSource)return;
      videoStudioState.sourceVideo='';videoStudioState.sourceDuration=0;const v=$('video-source-preview');if(v){v.pause();v.removeAttribute('src');v.load();v.style.display='none'}if($('video-source-empty'))$('video-source-empty').style.display='block';if($('video-veo-upload-status'))$('video-veo-upload-status').textContent='Job cũ đã hủy · hãy chọn/upload VIDEO RAW mới.';
    }
    let kblVideoPollBusy=false;
    async function kblVideoPollTick(id){
      if(kblVideoPollBusy||document.visibilityState!=='visible'||!$('token')?.value.trim()||String(videoStudioState.activeJobId)!==String(id))return;
      kblVideoPollBusy=true;try{await checkVideoJob(id);}finally{kblVideoPollBusy=false;}
    }
    function startVideoPoll(id){clearVideoPoll();videoStudioState.activeJobId=String(id||'');videoStudioState.poll=setInterval(()=>kblVideoPollTick(id),2500)}
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&videoStudioState.poll)kblVideoPollTick(videoStudioState.activeJobId);});
    async function checkVideoJob(id){if(!id)return;try{const r=await fetch('/api/admin/video-studio/job/'+encodeURIComponent(id),{headers:headers(false),cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không kiểm tra được job video');renderVideoQueue(d.queue||{});const idx=videoStudioState.jobs.findIndex(x=>String(x.id)===String(d.job.id));if(idx>=0)videoStudioState.jobs[idx]=d.job;else videoStudioState.jobs.unshift(d.job);renderVideoHistory();renderVideoJob(d.job);if(['review','done','approved','failed'].includes(String(d.job.status)))clearVideoPoll()}catch(e){if($('video-status'))$('video-status').textContent='❌ '+e.message}}
    async function loadVideoStudioStatus(){try{await loadContentHistory();refreshVideoProductOptions();const r=await fetch('/api/admin/video-studio/status',{headers:headers(false),cache:'no-store'}),d=await r.json();if(!r.ok||!d.success||!d.videoStudio)throw new Error(d.message||'Không tải được Video Studio');videoStudioState.jobs=Array.isArray(d.videoStudio.jobs)?d.videoStudio.jobs:[];renderVideoQueue(d.videoStudio.queue||{});renderVideoHistory();const current=videoStudioState.activeJobId?videoStudioState.jobs.find(j=>String(j.id)===String(videoStudioState.activeJobId)):null,preparingNewRaw=Boolean(videoStudioState.sourceFile),active=videoStudioState.jobs.find(j=>['review','pending','running'].includes(String(j.status))),selected=current||(!preparingNewRaw?active:null);if(selected){renderVideoJob(selected);if(['pending','running'].includes(String(selected.status)))startVideoPoll(selected.id)}else{clearActiveVideoJobSelection(preparingNewRaw?'Đang chuẩn bị VIDEO RAW mới · job cũ chỉ còn trong Lịch sử hậu kỳ.':'Không có job đang chạy. Chọn/upload VIDEO RAW mới để tạo job tiếp theo.');if($('video-status'))$('video-status').textContent=preparingNewRaw?'📥 VIDEO RAW mới đang được ưu tiên. Upload xong rồi bấm AI QUÉT VIDEO.':'V6.0.3 sẵn sàng · chọn thời lượng → Scene Chain tự xổ 1–6 prompt nối cảnh → Gemini/Veo web → nối RAW → upload → KBL gắn Product Hero.'}}catch(e){if($('video-status'))$('video-status').textContent='❌ '+e.message}}
    function videoDirectorHintText(style){return ({
      viral:['Viral / Hook nhanh','Mở mạnh ngay 0–2 giây · nhịp nhanh hơn · micro push-in + 1 pattern-interrupt · kết bằng tò mò/câu hỏi.'],
      'sang-trong':['Sang trọng','Nhịp chậm tinh tế · ánh nhìn điềm tĩnh · chuyển động máy gần như vô hình · giữ hình lâu để cảm giác cao cấp.'],
      'tu-van':['Tư vấn','Nói như đang trả lời 1 khách thật tại quầy · ấm, gần, không thúc mua · camera ngang tầm mắt và cử chỉ mở.'],
      'kien-thuc':['Kiến thức','Ưu tiên sự rõ ràng · ngắt nhịp quanh con số · cử chỉ đếm/giải thích chính xác · không hype, không dự đoán.'],
      'hai-cham-biem':['Hài châm biếm','Deadpan sang: setup → dừng 0,4–0,7s → phản ứng nhỏ → chốt số thật. Không slapstick, không chế khách, không dự đoán giá.']
    })[String(style||'viral')]||['Sang trọng','Nhịp điềm tĩnh, cao cấp, an toàn.']}
    function renderVideoDirectorHint(){const style=String($('video-director-style')?.value||'viral'),box=$('video-director-hint'),row=videoDirectorHintText(style);if(!box)return;box.className='video-director-hint '+style;box.innerHTML='<b>'+safe(row[0])+':</b> '+safe(row[1])}
    function videoDraftPayload(useCurrentScript=false,forceCaption=false){const template=String($('video-template')?.value||'gold-price'),productId=String($('video-product')?.value||''),productIds=selectedVideoMultiIds(),directorStyle=String($('video-director-style')?.value||videoStudioState.directorPlan?.directorStyle||'sang-trong'),plan=videoStudioState.directorPlan||null,planStyle=String(plan?.directorStyle||'');const planScript=!useCurrentScript&&plan&&planStyle===directorStyle?String(plan.script||'').trim():'';return {template,productId,productIds,durationSeconds:Number($('video-duration')?.value||20),title:String($('video-title')?.value||'').trim(),script:useCurrentScript?String($('video-script')?.value||'').trim():planScript,caption:(!forceCaption&&useCurrentScript)?String($('video-caption')?.value||'').trim():'',priceRows:useCurrentScript&&videoStudioState.draft?videoStudioState.draft.priceRows:undefined,directorStyle,directorNote:String(plan?.directorNote||''),masterCreative:Boolean(plan?.masterCreative),productionPack:plan?.productionPack||null}}
    async function generateVideoDraft(useCurrentScript=false){const payload=videoDraftPayload(useCurrentScript);if(payload.template==='product-spotlight'&&!payload.productId){$('video-status').textContent='❌ Hãy chọn SKU trước.';return}if(payload.template==='product-multi'&&payload.productIds.length<2){$('video-status').textContent='❌ Hãy chọn 2–3 SKU cho video nhiều món.';return}const btn=useCurrentScript?$('video-prompt-refresh'):$('video-draft');if(btn)btn.disabled=true;$('video-status').textContent=useCurrentScript?'Đang chia lại lời thoại và dựng Scene Chain nối cảnh…':'Đang lấy dữ liệu thật và dựng Scene Chain '+videoSceneCountClient()+' prompt…';try{const r=await fetch('/api/admin/video-studio/draft',{method:'POST',headers:headers(true),body:JSON.stringify(payload)}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tạo được Scene Chain');videoStudioState.draft=d.draft;if($('video-script'))$('video-script').value=d.draft.script||'';if($('video-veo-prompt'))$('video-veo-prompt').value=d.draft.prompt||'';if($('video-caption')){const current=String($('video-caption').value||'').trim();if(!useCurrentScript||!current)$('video-caption').value=d.draft.caption||''}if($('video-caption-kind'))$('video-caption-kind').textContent='Chủ đề: '+String(d.draft.templateLabel||d.draft.template||'Video');renderVideoPriceSnapshot();renderVideoCueRows();renderVideoSceneChain();if($('video-draft-meta'))$('video-draft-meta').textContent='Director: '+String(d.draft.directorStyleLabel||d.draft.directorStyle||'—')+' · Scene Chain '+Number(d.draft.sceneCount||d.draft.scenes?.length||1)+' clip · tổng lời thoại ~'+Number(d.draft.scriptEstimateSeconds||0).toFixed(1)+'s / mục tiêu '+Number(d.draft.durationSeconds||0)+'s · snapshot '+dateTime(d.draft.priceSnapshotAt)+(d.draft.timingWarning?' · ⚠ '+d.draft.timingWarning:'');$('video-status').textContent=d.draft.timingWarning?'⚠️ Scene Chain đã tạo nhưng có scene lời thoại hơi dài. Xem cảnh có cảnh báo đỏ và rút gọn trước khi copy.':'✅ Đã tạo '+Number(d.draft.sceneCount||1)+' PROMPT RIÊNG có continuity. Tạo từng scene trên Gemini/Veo, nối thành 1 RAW rồi upload lại KBL.';if(videoStudioState.sourceDuration)autoVideoCues()}catch(e){$('video-status').textContent='❌ '+e.message}finally{if(btn)btn.disabled=false}}
    async function copyVideoCaption(){const value=String($('video-caption')?.value||'').trim();if(!value)return $('video-status').textContent='❌ Chưa có caption.';try{await copyTextValue(value);$('video-status').textContent='✅ Đã copy caption theo chủ đề video.'}catch(e){$('video-status').textContent='❌ '+e.message}}
    async function resetVideoCaption(){const payload=videoDraftPayload(true,true);const btn=$('video-caption-reset');if(btn)btn.disabled=true;try{const r=await fetch('/api/admin/video-studio/draft',{method:'POST',headers:headers(true),body:JSON.stringify(payload)}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tạo lại được caption');if($('video-caption'))$('video-caption').value=d.draft.caption||'';if(videoStudioState.draft)videoStudioState.draft.caption=d.draft.caption||'';$('video-status').textContent='✅ Đã lấy lại caption gợi ý theo đúng chủ đề hiện tại.'}catch(e){$('video-status').textContent='❌ '+e.message}finally{if(btn)btn.disabled=false}}
    async function copyVideoPrompt(){const value=String($('video-veo-prompt')?.value||'').trim();if(!value)return $('video-status').textContent='❌ Chưa có Scene Chain.';try{await copyTextValue(value);$('video-status').textContent='✅ Đã copy TẤT CẢ prompt Scene Chain. Khi dùng Gemini/Veo nên copy từng scene riêng để dễ tạo đúng thứ tự.'}catch(e){$('video-status').textContent='❌ '+e.message}}
    // E7.3.4 · Chunk/resume uploader: avoids Tenten/nginx 413 without changing Worker or AI modules.
    async function kblReadApiJson(response){const text=await response.text();if(!text)return {};try{return JSON.parse(text)}catch(_){const e=new Error(response.status===413?'Hosting chặn request vì quá lớn (HTTP 413). Hệ thống sẽ tự giảm kích thước chunk.':('Server trả dữ liệu không phải JSON (HTTP '+response.status+').'));e.httpStatus=response.status;e.raw=text.slice(0,180);throw e}}
    function kblUploadResumeKey(kind,file){return 'kbl_video_upload_v1:'+kind+':'+String(file?.name||'')+':'+Number(file?.size||0)+':'+Number(file?.lastModified||0)}
    function kblUploadStorageGet(key){try{return localStorage.getItem(key)||''}catch(_){return''}}
    function kblUploadStorageSet(key,value){try{if(value)localStorage.setItem(key,value);else localStorage.removeItem(key)}catch(_){}}
    async function kblBlobSha256(blob){if(!(window.crypto&&crypto.subtle))return '';const buf=await blob.arrayBuffer(),dig=await crypto.subtle.digest('SHA-256',buf);return Array.from(new Uint8Array(dig)).map(x=>x.toString(16).padStart(2,'0')).join('')}
    async function kblChunkVideoUpload(file,{kind,title='',duration=0,onProgress=()=>{}}={}){if(!file)throw new Error('Chưa chọn video.');const resumeKey=kblUploadResumeKey(kind,file),storedId=kblUploadStorageGet(resumeKey),initHeaders={...headers(false),'x-kbl-upload-kind':kind,'x-kbl-file-name':encodeURIComponent(file.name||'video'),'x-kbl-file-size':String(file.size||0),'x-kbl-file-type':file.type||'application/octet-stream','x-kbl-file-last-modified':String(file.lastModified||0),'x-kbl-video-title':encodeURIComponent(title||file.name||'Video'),'x-kbl-video-duration':String(duration||0),'x-kbl-upload-key':encodeURIComponent(resumeKey)};if(storedId)initHeaders['x-kbl-upload-id']=storedId;const initRes=await fetch('/api/admin/video-upload/init',{method:'POST',headers:initHeaders,body:null}),init=await kblReadApiJson(initRes);if(!initRes.ok||!init.success)throw new Error(init.message||'Không mở được phiên upload chia nhỏ.');if(init.finalized&&init.result){kblUploadStorageSet(resumeKey,'');onProgress(1,'Đã hoàn tất trước đó');return init.result}const uploadId=String(init.uploadId||'');if(!uploadId)throw new Error('Server không trả uploadId.');kblUploadStorageSet(resumeKey,uploadId);let offset=Math.max(0,Number(init.receivedBytes||0)),chunkSize=8*1024*1024;const minChunk=256*1024,maxChunk=8*1024*1024;while(offset<file.size){const end=Math.min(file.size,offset+chunkSize),blob=file.slice(offset,end),sha=await kblBlobSha256(blob);let response;try{response=await fetch('/api/admin/video-upload/chunk/'+encodeURIComponent(uploadId),{method:'POST',headers:{...headers(false),'Content-Type':'application/octet-stream','x-kbl-upload-offset':String(offset),'x-kbl-chunk-sha256':sha},body:blob})}catch(error){onProgress(file.size?offset/file.size:0,'Mạng gián đoạn · giữ phiên để resume');throw error}if(response.status===413){if(chunkSize<=minChunk){const d=await kblReadApiJson(response).catch(()=>({}));throw new Error(d.message||'Hosting vẫn chặn chunk 256KB. Cần Tenten tăng giới hạn tối thiểu.')}chunkSize=Math.max(minChunk,Math.floor(chunkSize/2));onProgress(file.size?offset/file.size:0,'Hosting giới hạn request · tự giảm chunk còn '+(chunkSize/1024/1024).toFixed(chunkSize>=1024*1024?1:2)+'MB');continue}const d=await kblReadApiJson(response);if(response.status===409&&Number.isFinite(Number(d.receivedBytes))){offset=Math.max(0,Number(d.receivedBytes));continue}if(!response.ok||!d.success)throw new Error(d.message||'Không tải được chunk video.');offset=Math.max(offset,Number(d.receivedBytes||end));onProgress(file.size?Math.min(1,offset/file.size):0,'Đang upload '+Math.round((offset/file.size)*100)+'% · chunk '+Math.round(chunkSize/1024)+'KB');if(chunkSize<maxChunk&&response.ok)chunkSize=Math.min(maxChunk,chunkSize*2)}const finalRes=await fetch('/api/admin/video-upload/finalize/'+encodeURIComponent(uploadId),{method:'POST',headers:headers(false),body:null}),finalData=await kblReadApiJson(finalRes);if(!finalRes.ok||!finalData.success)throw new Error(finalData.message||'Không ghép được video master.');kblUploadStorageSet(resumeKey,'');onProgress(1,'Hoàn tất · master giữ nguyên');return finalData}
    function clearVideoSource(){const v=$('video-source-preview');if(videoStudioState.sourceObjectUrl)URL.revokeObjectURL(videoStudioState.sourceObjectUrl);videoStudioState.sourceObjectUrl='';videoStudioState.sourceFile=null;videoStudioState.sourceVideo='';videoStudioState.sourceDuration=0;if($('video-veo-file'))$('video-veo-file').value='';if(v){v.pause();v.removeAttribute('src');v.load();v.style.display='none'}if($('video-source-empty'))$('video-source-empty').style.display='block';if($('video-veo-upload-status'))$('video-veo-upload-status').textContent='Chưa chọn video.'}
    function onVideoVeoFile(event){const file=event.target.files&&event.target.files[0];if(!file){clearVideoSource();return}if(file.size>600*1024*1024){event.target.value='';return $('video-veo-upload-status').textContent='❌ Video tối đa 600MB.'}clearActiveVideoJobSelection('Đã tách khỏi job cũ · VIDEO RAW mới đang được chuẩn bị.');videoStudioState.sourceFile=file;videoStudioState.sourceVideo='';const v=$('video-source-preview');if(videoStudioState.sourceObjectUrl)URL.revokeObjectURL(videoStudioState.sourceObjectUrl);videoStudioState.sourceObjectUrl=URL.createObjectURL(file);v.src=videoStudioState.sourceObjectUrl;v.style.display='block';if($('video-source-empty'))$('video-source-empty').style.display='none';v.onloadedmetadata=()=>{videoStudioState.sourceDuration=Number(v.duration||0);$('video-veo-upload-status').textContent='✅ '+file.name+' · '+(file.size/1024/1024).toFixed(1)+'MB · '+videoStudioState.sourceDuration.toFixed(2)+'s · bấm UPLOAD VIDEO RAW HOÀN CHỈNH.';autoVideoCues()}}
    async function uploadVideoVeoRaw(){const input=$('video-veo-file'),file=videoStudioState.sourceFile||(input&&input.files&&input.files[0])||null;if(file&&!videoStudioState.sourceFile)videoStudioState.sourceFile=file;if(!file)return $('video-veo-upload-status').textContent='❌ Hãy chọn MP4/MOV/WebM trước.';const btn=$('video-veo-upload');btn.disabled=true;$('video-veo-upload-status').textContent='Đang mở upload chunk/resume…';try{const d=await kblChunkVideoUpload(file,{kind:'veo',title:file.name||'KBL Veo RAW',duration:videoStudioState.sourceDuration,onProgress:(p,msg)=>{$('video-veo-upload-status').textContent=(p>=1?'✅ ':'⬆ ')+msg+' · '+Math.round(p*100)+'%'}});videoStudioState.sourceVideo=d.source||'';$('video-veo-upload-status').textContent='✅ Đã upload RAW bằng chunk/resume · '+videoStudioState.sourceDuration.toFixed(2)+'s · master không re-encode.';$('video-status').textContent='✅ Video RAW đã lên server. Kiểm tra mốc card rồi bấm TẠO BẢN HOÀN CHỈNH.'}catch(e){$('video-veo-upload-status').textContent='❌ '+e.message}finally{btn.disabled=false}}
    function autoVideoCues(){const d=videoStudioState.draft,dur=Math.max(1,Number(videoStudioState.sourceDuration||d?.durationSeconds||20));if(!d||!Array.isArray(d.cueHints)||!d.cueHints.length)return;const starts=d.cueHints.map((h,i)=>Math.max(.15,Math.min(dur-.4,dur*Number(h.ratio||(.22+i*.23)))));d.cueHints.forEach((h,i)=>{const st=$('video-cue-start-'+h.code),en=$('video-cue-end-'+h.code),next=i<starts.length-1?Math.max(starts[i]+.45,starts[i+1]-.08):Math.min(dur,starts[i]+3.2);if(st)st.value=starts[i].toFixed(2);if(en)en.value=Math.max(starts[i]+.4,Math.min(dur,next)).toFixed(2)});if($('video-cue-mode'))$('video-cue-mode').value='auto-pause'}
    function markVideoCue(code,side='start'){const v=$('video-source-preview'),el=$('video-cue-'+side+'-'+code);if(!v||!el||!Number.isFinite(v.currentTime))return;el.value=Number(v.currentTime).toFixed(2);if($('video-cue-mode'))$('video-cue-mode').value='manual';$('video-status').textContent='✓ Đã đặt '+(side==='end'?'KẾT THÚC':'BẮT ĐẦU')+' '+code+' tại '+Number(v.currentTime).toFixed(2)+'s.'}
    function collectVideoCues(){const d=videoStudioState.draft,hints=Array.isArray(d?.cueHints)?d.cueHints:[],dur=Math.max(1,Number(videoStudioState.sourceDuration||d?.durationSeconds||20));return hints.map((h,i)=>{const fallback=Math.max(0,Math.min(dur-.4,dur*(.2+i*.23))),start=Math.max(0,Math.min(dur-.1,Number($('video-cue-start-'+h.code)?.value||fallback))),end=Math.max(start+.4,Math.min(dur,Number($('video-cue-end-'+h.code)?.value||Math.min(dur,start+3.2))));return {code:String(h.code||''),start:Number(start.toFixed(3)),end:Number(end.toFixed(3))}})}
    function activeVideoJob(){return (videoStudioState.jobs||[]).find(j=>String(j.id)===String(videoStudioState.activeJobId||''))||null}
    function ensureRawVideoFromJob(job){if(!job||!job.sourceVideo)return;const v=$('video-source-preview');if(!v)return;/* E7.3.5D: owner-selected local RAW wins over background job polling. Do not clear sourceFile while a new file is waiting to upload. */if(videoStudioState.sourceFile)return;if(String(videoStudioState.sourceVideo||'')!==String(job.sourceVideo)){if(videoStudioState.sourceObjectUrl){try{URL.revokeObjectURL(videoStudioState.sourceObjectUrl)}catch(_){ }videoStudioState.sourceObjectUrl=''}videoStudioState.sourceFile=null;videoStudioState.sourceVideo=job.sourceVideo;videoStudioState.sourceDuration=Number(job.durationSeconds||0);v.src=job.sourceVideo;v.style.display='block';if($('video-source-empty'))$('video-source-empty').style.display='none';if($('video-veo-upload-status'))$('video-veo-upload-status').textContent='✓ Đang dùng RAW đã lưu trên server · '+Number(job.durationSeconds||0).toFixed(2)+'s.'}}
    function markJobCue(code,side){const v=$('video-source-preview'),el=$('video-job-cue-'+side+'-'+code);if(!v||!el||!Number.isFinite(v.currentTime))return;el.value=Number(v.currentTime).toFixed(2);if($('video-cue-mode'))$('video-cue-mode').value='manual';$('video-status').textContent='✓ '+code+' · '+(side==='start'?'BẮT ĐẦU':'KẾT THÚC')+' '+Number(v.currentTime).toFixed(2)+'s.'}
    async function saveActiveVideoJobCues(){const job=activeVideoJob();if(!job)return;const rows=Array.isArray(job.cardProducts)?job.cardProducts:[],cues=rows.map(p=>{const code=String(p.sku||'');return {code,start:Number($('video-job-cue-start-'+code)?.value),end:Number($('video-job-cue-end-'+code)?.value)}});if(cues.some(c=>!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.end<=c.start+.35))return $('video-status').textContent='❌ Hãy nhập đủ BẮT ĐẦU / KẾT THÚC cho từng card.';try{const r=await fetch('/api/admin/video-studio/job/'+encodeURIComponent(job.id)+'/cues',{method:'POST',headers:headers(true),body:JSON.stringify({cues})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không lưu được mốc card');const idx=videoStudioState.jobs.findIndex(x=>String(x.id)===String(d.job.id));if(idx>=0)videoStudioState.jobs[idx]=d.job;renderVideoQueue(d.queue||{});renderVideoHistory();renderVideoJob(d.job);$('video-status').textContent='✅ Đã khóa mốc card theo thời gian ông cài và xếp Worker dựng lại.';startVideoPoll(d.job.id)}catch(e){$('video-status').textContent='❌ '+e.message}}
    async function saveActiveVideoJobPrices(){const job=activeVideoJob();if(!job)return;const rows=Array.isArray(job.cardProducts)?job.cardProducts:[],prices=rows.map(p=>{const sku=String(p.sku||''),mode=String($('video-job-price-mode-'+sku)?.value||'video'),customPriceVnd=Number($('video-job-custom-price-'+sku)?.value||0);return {sku,mode,customPriceVnd}});const bad=prices.find(x=>x.mode==='custom'&&!(x.customPriceVnd>0));if(bad)return $('video-status').textContent='❌ '+bad.sku+': hãy nhập GIÁ TỰ NHẬP lớn hơn 0.';try{const r=await fetch('/api/admin/video-studio/job/'+encodeURIComponent(job.id)+'/prices',{method:'POST',headers:headers(true),body:JSON.stringify({prices})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không lưu được nguồn giá card');const idx=videoStudioState.jobs.findIndex(x=>String(x.id)===String(d.job.id));if(idx>=0)videoStudioState.jobs[idx]=d.job;renderVideoQueue(d.queue||{});renderVideoHistory();renderVideoJob(d.job);if(String(d.job.status)==='review'){$('video-status').textContent='✅ Đã lưu nguồn giá. Job vẫn CHỜ CHỈNH MỐC; Worker chưa render.'}else{$('video-status').textContent='✅ Đã khóa nguồn giá từng SKU. POS không bị sửa; Worker đang dựng lại đúng snapshot đã chọn.';startVideoPoll(d.job.id)}}catch(e){$('video-status').textContent='❌ '+e.message}}

    function manualCardProductOptions(){return '<option value="">— Chọn SKU —</option>'+contentEligibleProducts().map(p=>'<option value="'+safe(p.id)+'">'+safe((p.sku||'')+' · '+(p.displayName||p.name||''))+'</option>').join('')}
    function markManualCardTime(index,side){const v=$('video-source-preview'),el=$('video-manual-card-'+side+'-'+index);if(!v||!el||!Number.isFinite(v.currentTime))return;el.value=Number(v.currentTime).toFixed(2);$('video-status').textContent='✓ Card '+index+' · '+(side==='start'?'BẮT ĐẦU':'KẾT THÚC')+' '+Number(v.currentTime).toFixed(2)+'s.'}
    async function createManualVideoCardJob(){if(!videoStudioState.sourceVideo)return $('video-status').textContent='❌ Chưa có video RAW để đặt card.';const items=[];for(let i=1;i<=3;i++){const productId=String($('video-manual-card-product-'+i)?.value||''),start=Number($('video-manual-card-start-'+i)?.value),end=Number($('video-manual-card-end-'+i)?.value),priceVnd=Number($('video-manual-card-price-'+i)?.value||0),goldSellVndPerChi=Number($('video-manual-card-gold-'+i)?.value||0);if(!productId)continue;if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start+.35)return $('video-status').textContent='❌ Card '+i+' chưa có mốc BẮT ĐẦU / KẾT THÚC hợp lệ.';items.push({productId,start,end,priceVnd,goldSellVndPerChi})}if(!items.length)return $('video-status').textContent='❌ Chọn ít nhất 1 SKU để gắn card.';try{const payload={sourceVideo:videoStudioState.sourceVideo,sourceDuration:videoStudioState.sourceDuration||Number(activeVideoJob()?.durationSeconds||20),title:String($('video-title')?.value||activeVideoJob()?.title||'Video đặt card thủ công').trim(),items},r=await fetch('/api/admin/video-studio/manual-card',{method:'POST',headers:headers(true),body:JSON.stringify(payload)}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tạo được job card thủ công');videoStudioState.jobs.unshift(d.job);videoStudioState.jobs=videoStudioState.jobs.filter((j,i,a)=>a.findIndex(v=>String(v.id)===String(j.id))===i).slice(0,20);renderVideoQueue(d.queue||{});renderVideoHistory();renderVideoJob(d.job);$('video-status').textContent='✅ Đã khóa SKU + mốc start/end + giá món/giá vàng của video. Worker chỉ dựng theo snapshot này.';startVideoPoll(d.job.id)}catch(e){$('video-status').textContent='❌ '+e.message}}
    function renderAutoCardJobEditor(job){const box=$('video-cues');if(!box||!job||!job.autoCardFromVideo)return;ensureRawVideoFromJob(job);const cards=Array.isArray(job.cardProducts)?job.cardProducts:[],cues=Array.isArray(job.cues)?job.cues:[];if(cards.length&&cues.length){box.innerHTML='<div class="video-card-editor"><div class="video-card-editor-note"><b>GIÁ CARD ĐÃ TÁCH KHỎI POS.</b> Mặc định AI dùng <b>GIÁ VIDEO</b> nếu nghe chắc. Ông có thể đổi riêng từng SKU sang <b>GIÁ POS HIỆN TẠI</b> hoặc <b>GIÁ TỰ NHẬP</b>. Đổi giá chỉ sửa snapshot của video, <b>không sửa POS</b>. Mốc BẮT ĐẦU / KẾT THÚC vẫn chỉnh độc lập như cũ.</div><div class="video-card-editor-list">'+cards.map(p=>{const code=String(p.sku||''),c=cues.find(x=>String(x.code)===code)||{},match=Array.isArray(job.scanAnalysis?.matches)?job.scanAnalysis.matches.find(x=>String(x.sku||'')===code)||{}:{},source=String(p.priceSource||match.cardPriceSource||''),videoPrice=Number(p.videoPriceVnd||p.spokenPriceVnd||match.spokenPriceVnd||((source.includes('video')&&!source.includes('custom'))?p.price:0)||0),posPrice=Number(p.posPriceAtScan||match.posPriceVnd||0),mode=String(p.priceMode||'')||((source.includes('custom'))?'custom':(source.includes('pos')&&!source.includes('spoken'))?'pos':videoPrice>0?'video':'pos'),customValue=Number(p.customPriceVnd||((mode==='custom')?p.price:0)||0);return '<div class="video-card-editor-item"><div class="video-card-editor-head"><div class="video-card-locked"><strong>'+safe(code)+'</strong>'+safe(p.name||'')+'</div><span class="video-card-price-chip">🔒 CARD '+money(p.price||0)+'</span></div><div class="video-card-job-fields"><label class="video-card-field"><span>Bắt đầu (giây)</span><input id="video-job-cue-start-'+safe(code)+'" type="number" min="0" step="0.05" value="'+safe(Number(c.start||0).toFixed(2))+'" '+(timingOpen?'':'disabled')+'></label><label class="video-card-field"><span>Kết thúc (giây)</span><input id="video-job-cue-end-'+safe(code)+'" type="number" min="0" step="0.05" value="'+safe(Number(c.end||0).toFixed(2))+'" '+(timingOpen?'':'disabled')+'></label><label class="video-card-field video-card-price"><span>Nguồn giá card</span><select id="video-job-price-mode-'+safe(code)+'"><option value="video" '+(mode==='video'?'selected':'')+' '+(videoPrice>0?'':'disabled')+'>GIÁ VIDEO'+(videoPrice>0?' · '+safe(money(videoPrice)):' · AI chưa đọc chắc')+'</option><option value="pos" '+(mode==='pos'?'selected':'')+'>GIÁ POS HIỆN TẠI'+(posPrice>0?' · '+safe(money(posPrice)):'')+'</option><option value="custom" '+(mode==='custom'?'selected':'')+'>GIÁ TỰ NHẬP</option></select></label><label class="video-card-field video-card-price"><span>Giá tự nhập</span><input id="video-job-custom-price-'+safe(code)+'" type="number" min="0" step="1000" value="'+safe(customValue||'')+'" placeholder="Chỉ dùng khi chọn GIÁ TỰ NHẬP"></label></div><div class="video-card-editor-help">Video: <b>'+safe(videoPrice>0?money(videoPrice):'AI chưa đọc chắc')+'</b> · POS: <b>'+safe(posPrice>0?money(posPrice):'—')+'</b> · Card đang khóa: <b>'+safe(money(p.price||0))+'</b></div><div class="video-card-time-actions"><button class="btn-soft" type="button" data-job-cue-start="'+safe(code)+'">⏱ LẤY MỐC BẮT ĐẦU</button><button class="btn-soft" type="button" data-job-cue-end="'+safe(code)+'">⏱ LẤY MỐC KẾT THÚC</button></div></div>'}).join('')+'</div><div class="video-card-editor-footer"><button class="gold" id="video-save-job-prices" type="button">💰 LƯU GIÁ & DỰNG LẠI</button><button class="btn-soft" id="video-save-job-cues" type="button">💾 LƯU MỐC & DỰNG LẠI</button><span class="video-card-editor-help">GIÁ VIDEO là snapshot lời nói trong clip; POS chỉ dùng khi ông chủ động chọn.</span></div></div>';box.querySelectorAll('[data-job-cue-start]').forEach(b=>b.onclick=()=>markJobCue(b.dataset.jobCueStart,'start'));box.querySelectorAll('[data-job-cue-end]').forEach(b=>b.onclick=()=>markJobCue(b.dataset.jobCueEnd,'end'));$('video-save-job-cues')?.addEventListener('click',saveActiveVideoJobCues);$('video-save-job-prices')?.addEventListener('click',saveActiveVideoJobPrices);return}
      if(['running','pending'].includes(String(job.status))&&!cards.length){box.innerHTML='<div class="video-card-scan-wait"><b>🧠 AI đang quét video nền.</b><br>AI đang nhận SKU + nghe giá trong clip + tính start/end. <b>Quét xong, mỗi SKU sẽ hiện 3 lựa chọn: GIÁ VIDEO | GIÁ POS HIỆN TẠI | GIÁ TỰ NHẬP</b> trước khi ông duyệt video. Nếu AI không đủ chắc SKU, khung chọn SKU thủ công vẫn hiện như cũ.</div>';return}
      if(String(job.status)==='failed'||!cards.length){const opts=manualCardProductOptions();box.innerHTML='<div class="video-card-editor"><div class="video-card-editor-note"><b>AI chưa chốt chắc SKU.</b> Luồng thủ công cũ vẫn giữ nguyên: chọn SKU → phát RAW → lấy mốc start/end. Nhập <b>Giá món trong video</b> hoặc <b>Giá vàng bán/chỉ</b>; để trống thì dùng POS hiện tại. Sau khi job được tạo, bảng <b>GIÁ VIDEO | GIÁ POS HIỆN TẠI | GIÁ TỰ NHẬP</b> sẽ hiện để đổi nguồn giá nếu cần. Không sửa POS.</div><div class="video-card-editor-list">'+[1,2,3].map(i=>'<div class="video-card-editor-item"><div class="video-card-editor-head"><b>THẺ SẢN PHẨM '+i+'</b><span class="video-card-editor-badge">TÙY CHỌN</span></div><label class="video-card-editor-sku">SKU KBL<select id="video-manual-card-product-'+i+'">'+opts+'</select></label><div class="video-card-editor-fields"><label class="video-card-field"><span>Bắt đầu (giây)</span><input id="video-manual-card-start-'+i+'" type="number" min="0" step="0.05" placeholder="0.00"></label><label class="video-card-field"><span>Kết thúc (giây)</span><input id="video-manual-card-end-'+i+'" type="number" min="0" step="0.05" placeholder="3.20"></label><label class="video-card-field video-card-price"><span>Giá món trong video</span><input id="video-manual-card-price-'+i+'" type="number" min="0" step="1000" placeholder="Ưu tiên nếu video đọc tổng giá món"></label><label class="video-card-field video-card-price"><span>Giá vàng bán / chỉ</span><input id="video-manual-card-gold-'+i+'" type="number" min="0" step="1000" placeholder="Ví dụ 8.640.000"></label></div><div class="video-card-time-actions"><button class="btn-soft" type="button" data-manual-card-start="'+i+'">⏱ LẤY MỐC BẮT ĐẦU</button><button class="btn-soft" type="button" data-manual-card-end="'+i+'">⏱ LẤY MỐC KẾT THÚC</button></div></div>').join('')+'</div><div class="video-card-editor-footer"><button class="gold" id="video-create-manual-card" type="button">🎯 TẠO CARD THEO CÁC MỐC</button><span class="video-card-editor-help">Luồng cũ giữ nguyên. Giá/giá vàng chỉ khóa cho video, không sửa POS.</span></div></div>';box.querySelectorAll('[data-manual-card-start]').forEach(b=>b.onclick=()=>markManualCardTime(Number(b.dataset.manualCardStart),'start'));box.querySelectorAll('[data-manual-card-end]').forEach(b=>b.onclick=()=>markManualCardTime(Number(b.dataset.manualCardEnd),'end'));$('video-create-manual-card')?.addEventListener('click',createManualVideoCardJob)}
    }
    // E7.3.5B ADD-ONLY · Timing editor cho mọi card do AI Visual Director tạo.
    // Product-only job vẫn đi qua renderAutoCardJobEditor cũ; không xóa/đổi rule cũ.
    function visualCardTypeLabel(type){return ({PRODUCT_CARD:'SẢN PHẨM',GOLD_PRICE_CARD:'GIÁ VÀNG',MARKET_CHART_CARD:'BIỂU ĐỒ GIÁ',NEWS_IMAGE_CARD:'TIN + HÌNH MINH HỌA',HEADLINE_CARD:'TIN / HEADLINE',FACT_CARD:'SỐ LIỆU / FACT',VIETNAM_IMPACT_CARD:'TÁC ĐỘNG VIỆT NAM',SCENARIO_CARD:'KỊCH BẢN / THEO DÕI'})[String(type||'').toUpperCase()]||String(type||'CARD')}
    function visualCardDomKey(id,index=0){return String(id||('VC-'+(index+1))).replace(/[^A-Za-z0-9_-]/g,'_')}
    function markVisualCardTime(id,index,side){const v=$('video-source-preview'),key=visualCardDomKey(id,index),el=$('video-visual-card-'+side+'-'+key);if(!v||!el||!Number.isFinite(v.currentTime))return;el.value=Number(v.currentTime).toFixed(2);$('video-status').textContent='✓ '+visualCardTypeLabel(activeVideoJob()?.visualCards?.[index]?.type)+' · '+(side==='start'?'BẮT ĐẦU':'KẾT THÚC')+' '+Number(v.currentTime).toFixed(2)+'s.'}
    async function saveActiveVisualCardTimes(){const job=activeVideoJob();if(!job)return;const rows=Array.isArray(job.visualCards)?job.visualCards:[];if(!rows.length)return $('video-status').textContent='❌ Job này chưa có Visual Card.';const cards=rows.map((c,i)=>{const id=String(c.id||('VC-'+(i+1))),key=visualCardDomKey(id,i);return{id,start:Number($('video-visual-card-start-'+key)?.value),end:Number($('video-visual-card-end-'+key)?.value)}});if(cards.some(c=>!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.end<=c.start+.35))return $('video-status').textContent='❌ Hãy nhập đủ BẮT ĐẦU / KẾT THÚC cho từng Visual Card.';const r=await fetch('/api/admin/video-studio/job/'+encodeURIComponent(job.id)+'/visual-card-times',{method:'POST',headers:headers(true),body:JSON.stringify({cards})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không lưu được mốc Visual Card');const idx=videoStudioState.jobs.findIndex(x=>String(x.id)===String(d.job.id));if(idx>=0)videoStudioState.jobs[idx]=d.job;renderVideoQueue(d.queue||{});renderVideoHistory();renderVideoJob(d.job);return d.job}
    async function openActiveTimingReview(){const job=activeVideoJob();if(!job)return;try{const r=await fetch('/api/admin/video-studio/job/'+encodeURIComponent(job.id)+'/open-timing-review',{method:'POST',headers:headers(true),body:JSON.stringify({fromStatus:String(job.status||'')})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không mở được block thời gian');clearVideoPoll();const idx=videoStudioState.jobs.findIndex(x=>String(x.id)===String(d.job.id));if(idx>=0)videoStudioState.jobs[idx]=d.job;else videoStudioState.jobs.unshift(d.job);renderVideoQueue(d.queue||{});renderVideoHistory();renderVideoJob(d.job);$('video-status').textContent='✅ BLOCK THỜI GIAN ĐÃ MỞ. Ông chỉnh trực tiếp BẮT ĐẦU/KẾT THÚC hoặc phát RAW rồi LẤY MỐC; Worker đang chờ.'}catch(e){$('video-status').textContent='❌ '+e.message}}
    async function saveAllActiveCardTimes(){const job=activeVideoJob();if(!job)return;try{const products=Array.isArray(job.cardProducts)?job.cardProducts:[],visuals=Array.isArray(job.visualCards)?job.visualCards:[],cues=products.map(p=>{const code=String(p.sku||'');return{code,start:Number($('video-job-cue-start-'+code)?.value),end:Number($('video-job-cue-end-'+code)?.value)}}),visualCards=visuals.map((c,i)=>{const id=String(c.id||('VC-'+(i+1))),key=visualCardDomKey(id,i);return{id,start:Number($('video-visual-card-start-'+key)?.value),end:Number($('video-visual-card-end-'+key)?.value)}});if(cues.some(c=>!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.end<=c.start+.35))return $('video-status').textContent='❌ Hãy nhập đủ mốc cho từng Product Card.';if(visualCards.some(c=>!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.end<=c.start+.35))return $('video-status').textContent='❌ Hãy nhập đủ mốc cho từng Visual Card.';const r=await fetch('/api/admin/video-studio/job/'+encodeURIComponent(job.id)+'/all-card-times',{method:'POST',headers:headers(true),body:JSON.stringify({cues,visualCards})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không lưu được toàn bộ mốc card');const idx=videoStudioState.jobs.findIndex(x=>String(x.id)===String(d.job.id));if(idx>=0)videoStudioState.jobs[idx]=d.job;renderVideoQueue(d.queue||{});renderVideoHistory();renderVideoJob(d.job);$('video-status').textContent='✅ Đã lưu toàn bộ timecode. Fact Lock chỉ giữ nội dung/nguồn; Worker bắt đầu dựng theo mốc ông chọn.';startVideoPoll(d.job.id)}catch(e){$('video-status').textContent='❌ '+e.message}}
    function renderVisualDirectorTimingEditor(job){const box=$('video-cues'),visuals=Array.isArray(job?.visualCards)?job.visualCards:[];if(!box||!job||!job.autoCardFromVideo||!visuals.length)return false;ensureRawVideoFromJob(job);const timingOpen=String(job.status)==='review',timingRunning=String(job.status)==='running'&&Boolean(job.claimedAt),products=Array.isArray(job.cardProducts)?job.cardProducts:[],cues=Array.isArray(job.cues)?job.cues:[];const productHtml=products.map(p=>{const code=String(p.sku||''),c=cues.find(x=>String(x.code)===code)||{},match=Array.isArray(job.scanAnalysis?.matches)?job.scanAnalysis.matches.find(x=>String(x.sku||'')===code)||{}:{},source=String(p.priceSource||match.cardPriceSource||''),videoPrice=Number(p.videoPriceVnd||p.spokenPriceVnd||match.spokenPriceVnd||((source.includes('video')&&!source.includes('custom'))?p.price:0)||0),posPrice=Number(p.posPriceAtScan||match.posPriceVnd||0),mode=String(p.priceMode||'')||((source.includes('custom'))?'custom':(source.includes('pos')&&!source.includes('spoken'))?'pos':videoPrice>0?'video':'pos'),customValue=Number(p.customPriceVnd||((mode==='custom')?p.price:0)||0);return '<div class="video-card-editor-item"><div class="video-card-editor-head"><div class="video-card-locked"><strong>🛍 '+safe(code)+'</strong>'+safe(p.name||'')+'</div><span class="video-card-price-chip">PRODUCT · 🔒 '+money(p.price||0)+'</span></div><div class="video-card-job-fields"><label class="video-card-field"><span>Bắt đầu (giây)</span><input id="video-job-cue-start-'+safe(code)+'" type="number" min="0" step="0.05" value="'+safe(Number(c.start||0).toFixed(2))+'"></label><label class="video-card-field"><span>Kết thúc (giây)</span><input id="video-job-cue-end-'+safe(code)+'" type="number" min="0" step="0.05" value="'+safe(Number(c.end||0).toFixed(2))+'"></label><label class="video-card-field video-card-price"><span>Nguồn giá card</span><select id="video-job-price-mode-'+safe(code)+'"><option value="video" '+(mode==='video'?'selected':'')+' '+(videoPrice>0?'':'disabled')+'>GIÁ VIDEO'+(videoPrice>0?' · '+safe(money(videoPrice)):' · AI chưa đọc chắc')+'</option><option value="pos" '+(mode==='pos'?'selected':'')+'>GIÁ POS HIỆN TẠI'+(posPrice>0?' · '+safe(money(posPrice)):'')+'</option><option value="custom" '+(mode==='custom'?'selected':'')+'>GIÁ TỰ NHẬP</option></select></label><label class="video-card-field video-card-price"><span>Giá tự nhập</span><input id="video-job-custom-price-'+safe(code)+'" type="number" min="0" step="1000" value="'+safe(customValue||'')+'" placeholder="Chỉ dùng khi chọn GIÁ TỰ NHẬP"></label></div><div class="video-card-time-actions"><button class="btn-soft" type="button" data-job-cue-start="'+safe(code)+'" '+(timingOpen?'':'disabled')+'>⏱ LẤY BĐ</button><button class="btn-soft" type="button" data-job-cue-end="'+safe(code)+'" '+(timingOpen?'':'disabled')+'>⏱ LẤY KT</button></div></div>'}).join('');const visualHtml=visuals.map((c,i)=>{const id=String(c.id||('VC-'+(i+1))),key=visualCardDomKey(id,i),type=visualCardTypeLabel(c.type),start=Number(c.start||c.startSeconds||0),end=Number(c.end||c.endSeconds||Math.min(Number(job.durationSeconds||20),start+4));return '<div class="video-card-editor-item"><div class="video-card-editor-head"><div class="video-card-locked"><strong>🎬 '+safe(type)+'</strong>'+safe(c.title||c.body||id)+'</div><span class="video-card-editor-badge">'+safe(c.label||c.type||'VISUAL')+'</span></div><div class="video-card-job-fields" style="grid-template-columns:1fr 1fr"><label class="video-card-field"><span>Bắt đầu (giây)</span><input id="video-visual-card-start-'+key+'" type="number" min="0" step="0.05" value="'+safe(start.toFixed(2))+'" '+(timingOpen?'':'disabled')+'></label><label class="video-card-field"><span>Kết thúc (giây)</span><input id="video-visual-card-end-'+key+'" type="number" min="0" step="0.05" value="'+safe(end.toFixed(2))+'" '+(timingOpen?'':'disabled')+'></label></div><div class="video-card-editor-help">'+safe(c.sourceLabel||'')+(c.factLocked?' · 🔒 FACT LOCK NỘI DUNG · ⏱ MỐC ĐƯỢC CHỈNH':'')+'</div><div class="video-card-time-actions"><button class="btn-soft" type="button" data-visual-card-index="'+i+'" data-visual-card-id="'+safe(id)+'" data-visual-card-side="start" '+(timingOpen?'':'disabled')+'>⏱ LẤY MỐC BẮT ĐẦU</button><button class="btn-soft" type="button" data-visual-card-index="'+i+'" data-visual-card-id="'+safe(id)+'" data-visual-card-side="end" '+(timingOpen?'':'disabled')+'>⏱ LẤY MỐC KẾT THÚC</button></div></div>'}).join('');box.innerHTML='<div class="video-card-editor"><div class="video-card-editor-note"><b>CANH MỐC CHO TỪNG CARD.</b> Phát RAW tới đúng câu muốn card xuất hiện → bấm <b>LẤY BĐ</b>; phát tới lúc muốn card biến mất → bấm <b>LẤY KT</b>. Áp dụng cho <b>card sản phẩm, card giá vàng, biểu đồ, tin tức, hình minh họa, fact, tác động Việt Nam, scenario</b>. AI tự đề xuất timecode trước; Worker PHẢI chờ ông kiểm tra/chỉnh mốc rồi mới được render.</div><div class="video-card-editor-list">'+productHtml+visualHtml+'</div><div class="video-card-editor-footer">'+(timingOpen?'<button class="gold" id="video-save-all-card-times" type="button">💾 LƯU TẤT CẢ MỐC & DỰNG LẠI</button>':'<button class="gold" id="video-open-timing-review" type="button" '+(timingRunning?'disabled':'')+'>✏️ MỞ BLOCK THỜI GIAN</button>')+(products.length?'<button class="btn-soft" id="video-save-job-prices" type="button">'+(String(job.status)==='review'?'💰 LƯU GIÁ (CHƯA DỰNG)':'💰 LƯU GIÁ & DỰNG LẠI')+'</button>':'')+'<span class="video-card-editor-help">FACT LOCK chỉ khóa nội dung/nguồn đã kiểm chứng, KHÔNG khóa thời gian. Mốc chỉnh tay không sửa POS hay dữ kiện card.</span></div></div>';box.querySelectorAll('[data-job-cue-start]').forEach(b=>b.onclick=()=>markJobCue(b.dataset.jobCueStart,'start'));box.querySelectorAll('[data-job-cue-end]').forEach(b=>b.onclick=()=>markJobCue(b.dataset.jobCueEnd,'end'));box.querySelectorAll('[data-visual-card-side]').forEach(b=>b.onclick=()=>markVisualCardTime(b.dataset.visualCardId,Number(b.dataset.visualCardIndex),b.dataset.visualCardSide));$('video-save-all-card-times')?.addEventListener('click',saveAllActiveCardTimes);$('video-open-timing-review')?.addEventListener('click',openActiveTimingReview);$('video-save-job-prices')?.addEventListener('click',saveActiveVideoJobPrices);return true}
    async function startVideoAutoScanRender(){
      if(!videoStudioState.sourceVideo)return $('video-status').textContent='❌ Hãy upload video đã chỉnh sửa trước.';const btn=$('video-auto-scan-render');if(btn)btn.disabled=true;$('video-status').textContent='🧠 AI đang xem/nghe TOÀN BỘ video, đối chiếu tên/SKU với kho POS thật…';
      try{const payload={sourceVideo:videoStudioState.sourceVideo,sourceDuration:videoStudioState.sourceDuration||Number($('video-duration')?.value||20),title:String($('video-title')?.value||videoStudioState.sourceFile?.name||'Video đã chỉnh sửa').trim()},r=await fetch('/api/admin/video-studio/auto-card',{method:'POST',headers:headers(true),body:JSON.stringify(payload)}),text=await r.text();let d={};try{d=text?JSON.parse(text):{}}catch(_){throw new Error('Server trả dữ liệu auto-card không hợp lệ (HTTP '+r.status+').')}if(!r.ok)throw new Error(d.message||'AI chưa tạo được thẻ tự động');renderVideoQueue(d.queue||{});if(d.background&&d.job){videoStudioState.jobs.unshift(d.job);videoStudioState.jobs=videoStudioState.jobs.filter((j,i,a)=>a.findIndex(v=>String(v.id)===String(j.id))===i).slice(0,20);renderVideoHistory();renderVideoJob(d.job);$('video-status').textContent='🧠 '+(d.message||'AI đang quét video nền; xong sẽ hiện SKU + mốc start/end.');startVideoPoll(d.job.id);return}if(d.busy&&d.job){videoStudioState.jobs.unshift(d.job);videoStudioState.jobs=videoStudioState.jobs.filter((j,i,a)=>a.findIndex(v=>String(v.id)===String(j.id))===i).slice(0,20);renderVideoHistory();renderVideoJob(d.job);$('video-status').textContent=(d.reused?'🟡 ':'⏳ ')+(d.message||'Đang có job hậu kỳ.');startVideoPoll(d.job.id);return}if(d.softFail){$('video-status').textContent='🟡 '+(d.message||'AI chưa đủ chắc chắn để gắn card. Không tạo card sai.');return}if(!d.success||!d.job)throw new Error(d.message||'AI chưa tạo được thẻ tự động');videoStudioState.jobs.unshift(d.job);videoStudioState.jobs=videoStudioState.jobs.filter((j,i,a)=>a.findIndex(v=>String(v.id)===String(j.id))===i).slice(0,20);renderVideoHistory();renderVideoJob(d.job);const skus=Array.isArray(d.job?.cardSkus)?d.job.cardSkus.join(', '):'';$('video-status').textContent='✅ AI đã quét video thật và chốt thẻ KBL: '+(skus||'đang xử lý')+' · Local Worker đang render bản hoàn chỉnh.';startVideoPoll(d.job.id)}catch(e){$('video-status').textContent='❌ '+(e&&e.message||'Lỗi auto-card')}finally{if(btn)btn.disabled=false}
    }
    async function startVideoRender(){const d=videoStudioState.draft,script=String($('video-script')?.value||'').trim();if(!d)return $('video-status').textContent='❌ Hãy tạo lời thoại + prompt trước.';if(!script)return $('video-status').textContent='❌ Lời thoại đang trống.';if(!videoStudioState.sourceVideo)return $('video-status').textContent='❌ Hãy upload video Veo RAW trước.';const payload={template:d.template,productId:d.product?.id||'',productIds:Array.isArray(d.products)?d.products.map(p=>p.id):[],durationSeconds:d.durationSeconds,sourceDuration:videoStudioState.sourceDuration||d.durationSeconds,title:d.title,script,caption:String($('video-caption')?.value||d.caption||'').trim(),priceRows:d.priceRows,priceSnapshotAt:d.priceSnapshotAt,sourceVideo:videoStudioState.sourceVideo,cueMode:String($('video-cue-mode')?.value||'auto-pause'),cues:collectVideoCues(),directorStyle:d.directorStyle||String($('video-director-style')?.value||''),directorNote:d.directorNote||'',masterCreative:Boolean(d.masterCreative),productionPack:d.masterCreative?(d.productionPack||null):null};const btn=$('video-render');btn.disabled=true;$('video-status').textContent='Đang tạo job hậu kỳ nhẹ…';try{const r=await fetch('/api/admin/video-studio/render',{method:'POST',headers:headers(true),body:JSON.stringify(payload)}),x=await r.json();if(!r.ok||!x.success)throw new Error(x.message||'Không tạo được job');renderVideoQueue(x.queue||{});videoStudioState.jobs.unshift(x.job);videoStudioState.jobs=videoStudioState.jobs.filter((j,i,a)=>a.findIndex(v=>String(v.id)===String(j.id))===i).slice(0,20);renderVideoHistory();renderVideoJob(x.job);if(['product-spotlight','product-multi'].includes(String(x.job.template||''))&&Number(x.job.cardProductCount||0)<1){throw new Error('Job chưa mang snapshot thẻ sản phẩm KBL; không gửi worker. Hãy chọn lại SKU và tạo lời thoại/prompt.')}startVideoPoll(x.job.id)}catch(e){$('video-status').textContent='❌ '+e.message}finally{btn.disabled=false}}
    async function retryVideoJob(id){id=String(id||videoStudioState.activeJobId||'');if(!id)return;try{const r=await fetch('/api/admin/video-studio/retry/'+encodeURIComponent(id),{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không chạy lại được');const idx=videoStudioState.jobs.findIndex(x=>String(x.id)===String(d.job.id));if(idx>=0)videoStudioState.jobs[idx]=d.job;renderVideoQueue(d.queue||{});renderVideoHistory();renderVideoJob(d.job);startVideoPoll(d.job.id)}catch(e){$('video-status').textContent='❌ '+e.message}}
    async function cancelVideoJob(id){id=String(id||videoStudioState.activeJobId||'');if(!id)return;const job=(videoStudioState.jobs||[]).find(x=>String(x.id)===id);if(!window.confirm((job&&String(job.status)==='running'?'HỦY Worker đang hậu kỳ job này ngay? FFmpeg hiện tại sẽ được dừng; RAW/card snapshot vẫn giữ.':'Hủy job này để nhường hàng cho video mới?')+'\n\nKhông xóa video RAW gốc.'))return;const b=$('video-cancel-job');if(b)b.disabled=true;try{const r=await fetch('/api/admin/video-studio/cancel/'+encodeURIComponent(id),{method:'POST',headers:headers(true),body:JSON.stringify({reason:'Chủ tiệm hủy từ Video Studio để chạy job mới.'})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không hủy được job');const idx=videoStudioState.jobs.findIndex(x=>String(x.id)===String(d.job.id));if(idx>=0)videoStudioState.jobs[idx]=d.job;else videoStudioState.jobs.unshift(d.job);renderVideoQueue(d.queue||{});renderVideoHistory();detachCanceledJobSource(d.job);clearActiveVideoJobSelection('Job '+String(d.job.id||'')+' đã hủy · không còn giữ ô Job đang chọn. RAW/card snapshot vẫn nằm trong Lịch sử hậu kỳ.');$('video-status').textContent='⛔ '+(d.message||'Đã hủy job.')+' Chọn/upload VIDEO RAW mới để chạy job mới.';setTimeout(loadVideoStudioStatus,1200)}catch(e){$('video-status').textContent='❌ '+e.message}finally{if(b)b.disabled=false}}
    async function approveVideoJob(){const id=videoStudioState.activeJobId;if(!id)return;const r=await fetch('/api/admin/video-studio/approve/'+encodeURIComponent(id),{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success){if($('video-status'))$('video-status').textContent='❌ '+(d.message||'Không duyệt được video');return}const idx=videoStudioState.jobs.findIndex(x=>String(x.id)===String(d.job.id));if(idx>=0)videoStudioState.jobs[idx]=d.job;renderVideoQueue(d.queue||{});renderVideoHistory();renderVideoJob(d.job);if(d.job&&d.job.autoCardFromVideo){showAdminView('publisher');publisherRuntime.sourceType='video';publisherRuntime.videoJobId=d.job.id;if($('publisher-source-type'))$('publisher-source-type').value='video';await Promise.all([loadPublisherStatus(),loadPublisherVideoJobs()]);if($('publisher-video-job'))$('publisher-video-job').value=d.job.id;renderPublisherSource();if($('publisher-status'))$('publisher-status').textContent='✅ Video AI quét + gắn card đã DUYỆT và được đẩy thẳng sang Publisher. Caption từng nền tảng đã được chuẩn bị; kiểm tra rồi ĐĂNG TẤT CẢ.'}}
    function publisherSelectedVideoJob(){return (publisherRuntime.videoJobs||[]).find(j=>String(j.id)===String($('publisher-video-job')?.value||publisherRuntime.videoJobId||''))||null}
    async function loadPublisherVideoJobs(){try{const r=await fetch('/api/admin/publisher/video-jobs',{headers:headers(false),cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tải được video đã duyệt');publisherRuntime.videoJobs=Array.isArray(d.jobs)?d.jobs:[];const s=$('publisher-video-job'),cur=publisherRuntime.videoJobId||s?.value||'';if(s){s.innerHTML='<option value="">— Chọn video —</option>'+publisherRuntime.videoJobs.map(j=>'<option value="'+safe(j.id)+'">'+safe(j.title||j.templateLabel||j.template)+' · '+safe(dateTime(j.completedAt))+'</option>').join('');if(publisherRuntime.videoJobs.some(j=>String(j.id)===String(cur)))s.value=cur}renderPublisherSource()}catch(e){if($('publisher-status'))$('publisher-status').textContent='❌ '+e.message}}
    function renderPublisherSource(){const type=String($('publisher-source-type')?.value||publisherRuntime.sourceType||'video');publisherRuntime.sourceType=type;if($('publisher-video-job-wrap'))$('publisher-video-job-wrap').hidden=type!=='video';if($('publisher-product-wrap'))$('publisher-product-wrap').hidden=type!=='product';if($('publisher-build'))$('publisher-build').disabled=false;if(type==='product'){renderPublisherProduct();return}const j=publisherSelectedVideoJob(),box=$('publisher-media');if(!box)return;if(!j){box.innerHTML='<div></div><div><h3>Video đã duyệt</h3><p class="muted">Chọn video đã qua cổng duyệt để tạo caption/xuất bản.</p></div>';return}publisherRuntime.videoJobId=j.id;box.innerHTML='<video src="'+safe(j.resultVideo||'')+'" controls playsinline preload="metadata"></video><div><h3>'+safe(j.title||j.templateLabel||j.template)+'</h3><p class="muted">'+safe(j.sku?('SKU '+j.sku):'Video nội dung')+' · '+safe(videoStatusLabel(j.status))+'</p><small>✓ Video đã duyệt · caption từng nền tảng có thể chỉnh và LƯU trước khi đăng</small></div>';const drafts=j.publisherDrafts||{};['facebook','instagram','threads','tiktok','youtube','zalo','telegram'].forEach(k=>{if($('publisher-'+k))$('publisher-'+k).value=drafts[k]||''});const st=j.publisherStatus||{};$('publisher-status').textContent=Object.keys(st).length?'Lịch sử video: '+Object.entries(st).map(([k,v])=>k+' '+(v.status||'')).join(' · '):'✅ Video đã duyệt · liên kết tài khoản thật rồi bấm ĐĂNG TẤT CẢ.'}
    function publisherEligibleProducts(){return productState.products.filter(p=>isCurrent(p)&&String(p.status||'available')==='available'&&isPublished(p)&&(p.approvedStudioVideo||p.displayImage||p.image))}
    function refreshPublisherProducts(){
      const select=$('publisher-product');if(!select)return;const current=select.value||publisherRuntime.productId,rows=publisherEligibleProducts();select.innerHTML='<option value="">— Chọn SKU —</option>'+rows.map(p=>'<option value="'+safe(p.id)+'">'+safe(p.sku)+' · '+safe(p.displayName||p.name)+'</option>').join('');if(rows.some(p=>String(p.id)===String(current)))select.value=current;renderPublisherProduct();
    }
    function publisherSelectedProduct(){return productState.products.find(p=>String(p.id)===String($('publisher-product')?.value||publisherRuntime.productId))||null}
    function publisherDraftValues(){const out={};['facebook','instagram','threads','tiktok','youtube','zalo','telegram'].forEach(k=>out[k]=$('publisher-'+k)?.value||'');return out}
    function renderPublisherProduct(){
      const p=publisherSelectedProduct(),box=$('publisher-media');if(!box)return;if(!p){box.innerHTML='<div></div><div><h3>Media đã duyệt</h3><p class="muted">Chọn SKU để xem video/ảnh và caption.</p></div>';return}
      publisherRuntime.productId=String(p.id);const manifest=p.contentManifest||{},media=manifest.media||{},video=media.approvedVideo||p.approvedStudioVideo||'',image=media.displayImage||p.displayImage||(isPublished(p)?p.image:'')||'';
      const mediaHtml=video?'<video src="'+safe(video)+'" controls playsinline preload="metadata"></video>':image?'<img src="'+safe(image)+'" alt="">':'<div></div>';
      box.innerHTML=mediaHtml+'<div><h3>'+safe(p.sku)+' · '+safe(p.displayName||p.name)+'</h3><p class="muted">'+safe(p.goldCode)+' · '+safe(goldWeight(p.weightChi))+' chỉ · '+money(p.referencePrice)+'</p><small>'+(video?'✓ Video đã duyệt':'Đang dùng ảnh đã duyệt')+'</small></div>';
      const drafts=p.publisherDrafts||(manifest.social&&manifest.social.drafts)||{};['facebook','instagram','threads','tiktok','youtube','zalo','telegram'].forEach(k=>{if($('publisher-'+k))$('publisher-'+k).value=drafts[k]||''});
      const statuses=p.publisherStatus||(manifest.social&&manifest.social.status)||{};$('publisher-status').textContent=Object.keys(statuses).length?'Đã có lịch sử: '+Object.entries(statuses).map(([k,v])=>k+' '+(v.status||'')).join(' · '):'Chưa xuất bản SKU này.';renderPublisherPlatformModes();renderPublisherRuns();
    }
    async function loadPublisherStatus(){
      try{const r=await fetch('/api/admin/publisher/status',{headers:headers(false),cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error();publisherRuntime.platforms={...(d.platforms||{})};publisherRuntime.appConfig=d.appConfig&&typeof d.appConfig==='object'?d.appConfig:{};publisherRuntime.recentRuns=Array.isArray(d.recentRuns)?d.recentRuns:[];renderPublisherPlatformModes();renderPublisherConnectorGrid();renderPublisherRuns();schedulePublisherRunRefresh()}catch(_){}
    }
    function publisherModeText(platform){const item=publisherRuntime.platforms&&publisherRuntime.platforms[platform]||{};return item.statusLabel||((item.automationReady)?'ĐÃ LIÊN KẾT':'CHƯA LIÊN KẾT')}
    function publisherStatusTarget(text,ok){const a=$('publisher-connect-status'),b=$('publisher-status');if(a){a.textContent=text;a.style.color=ok===true?'#08734d':ok===false?'#a61b2b':'#64748b'}if(b&&publisherRuntime.sourceType!=='product'){b.textContent=text}}
    function renderPublisherPlatformModes(){['facebook','instagram','threads','tiktok','youtube','zalo','telegram'].forEach((platform)=>{const item=publisherRuntime.platforms&&publisherRuntime.platforms[platform]||{},badge=document.querySelector('[data-publisher-mode="'+platform+'"]'),card=document.querySelector('[data-platform-card="'+platform+'"]');if(badge){badge.textContent=publisherModeText(platform);badge.className='platform-mode '+String(item.mode||'not-connected').replace(/_/g,'-')}if(card)card.classList.toggle('auto-ready',Boolean(item.automationReady))})}
    function publisherPlatformLabel(platform){return ({facebook:'FACEBOOK PAGE',instagram:'INSTAGRAM',threads:'THREADS',tiktok:'TIKTOK',youtube:'YOUTUBE',zalo:'ZALO OA',telegram:'TELEGRAM'})[platform]||String(platform||'').toUpperCase()}
    function publisherApiRow(provider){const row=publisherRuntime.appConfig&&publisherRuntime.appConfig[provider];return row&&typeof row==='object'?row:{}}
    function publisherApiSourceText(row){return row.source==='server-env'?'Đang ưu tiên biến môi trường trên server.':'Lưu mã hóa trong KBL server.'}
    function publisherApiInput(label,attr,value,placeholder,disabled){return '<label><span>'+safe(label)+'</span><input '+attr+' value="'+safe(value||'')+'" placeholder="'+safe(placeholder||'')+'" autocomplete="off" spellcheck="false"'+(disabled?' disabled':'')+'></label>'}
    function publisherApiSecretInput(label,attr,row,disabled){return '<label><span>'+safe(label)+'</span><input type="password" '+attr+' value="" placeholder="'+safe(row.hasSecret?'Đã lưu •••••••• · để trống nếu giữ nguyên':'Nhập secret/token')+'" autocomplete="new-password" spellcheck="false"'+(disabled?' disabled':'')+'></label>'}
    function publisherCredentialFields(platform){
      if(platform==='facebook'){const row=publisherApiRow('meta'),locked=row.source==='server-env';return '<div class="publisher-api-fields"><h4>META APP · DÙNG CHUNG FACEBOOK + INSTAGRAM</h4>'+publisherApiInput('Meta App ID','data-api-meta-app-id',row.appId||'','App ID',locked)+publisherApiSecretInput('Meta App Secret','data-api-meta-app-secret',row,locked)+'<div class="publisher-api-help"><b>'+safe(publisherApiSourceText(row))+'</b> Instagram dùng chung Meta App này.</div></div>'}
      if(platform==='instagram'){const row=publisherApiRow('meta');return '<div class="publisher-api-fields"><h4>INSTAGRAM PROFESSIONAL</h4><div class="publisher-api-help">Dùng chung Meta App đã nhập ở thẻ FACEBOOK PAGE. Sau khi Meta App sẵn sàng, bấm LIÊN KẾT INSTAGRAM để cấp quyền publish.</div><div class="publisher-api-help">Meta App: '+safe(row.appId||'chưa nhập')+' · Secret: '+safe(row.hasSecret?'đã lưu':'chưa lưu')+'</div></div>'}
      if(platform==='threads'){const row=publisherApiRow('threads'),locked=row.source==='server-env';return '<div class="publisher-api-fields"><h4>THREADS APP</h4>'+publisherApiInput('Threads App ID','data-api-threads-app-id',row.appId||'','App ID',locked)+publisherApiSecretInput('Threads App Secret','data-api-threads-app-secret',row,locked)+'<div class="publisher-api-help">'+safe(publisherApiSourceText(row))+'</div></div>'}
      if(platform==='tiktok'){const row=publisherApiRow('tiktok'),locked=row.source==='server-env';return '<div class="publisher-api-fields"><h4>TIKTOK DEVELOPER APP</h4>'+publisherApiInput('Client Key','data-api-tiktok-client-key',row.clientKey||'','TikTok Client Key',locked)+publisherApiSecretInput('Client Secret','data-api-tiktok-client-secret',row,locked)+'<div class="publisher-api-help">'+safe(publisherApiSourceText(row))+' Direct Post vẫn phụ thuộc quyền video.publish / audit của TikTok.</div></div>'}
      if(platform==='youtube'){const row=publisherApiRow('youtube'),locked=row.source==='server-env';return '<div class="publisher-api-fields"><h4>GOOGLE CLOUD · YOUTUBE DATA API</h4>'+publisherApiInput('OAuth Client ID','data-api-youtube-client-id',row.clientId||'','...apps.googleusercontent.com',locked)+publisherApiSecretInput('Client Secret','data-api-youtube-client-secret',row,locked)+'<div class="publisher-api-help">'+safe(publisherApiSourceText(row))+'</div></div>'}
      if(platform==='telegram'){const row=publisherApiRow('telegram'),locked=row.source==='server-env';return '<div class="publisher-api-fields"><h4>TELEGRAM BOT API</h4>'+publisherApiSecretInput('Bot Token','data-api-telegram-bot-token',row,locked)+publisherApiInput('Chat / Channel ID','data-api-telegram-chat-id',row.chatId||'','Ví dụ: -1001234567890 hoặc @channel',locked)+'<div class="publisher-api-help">'+safe(publisherApiSourceText(row))+'</div></div>'}
      if(platform==='zalo')return '<div class="publisher-api-fields"><h4>ZALO OA OPENAPI</h4><div class="publisher-api-help">Chưa giả lập endpoint. Khi OA/App được cấp đúng nhóm quyền tạo & xuất bản nội dung, connector Zalo sẽ cắm theo thông số chính thức.</div></div>';
      return '';
    }
    function publisherCollectAppConfig(){
      const out={};const add=(provider,values)=>{out[provider]=values};
      const metaId=document.querySelector('[data-api-meta-app-id]'),metaSecret=document.querySelector('[data-api-meta-app-secret]');if(metaId||metaSecret){const row=publisherApiRow('meta'),id=String(metaId?.value||'').trim(),secret=String(metaSecret?.value||'').trim();if(id!==String(row.appId||'')||secret)add('meta',{appId:id,appSecret:secret})}
      const thId=document.querySelector('[data-api-threads-app-id]'),thSecret=document.querySelector('[data-api-threads-app-secret]');if(thId||thSecret){const row=publisherApiRow('threads'),id=String(thId?.value||'').trim(),secret=String(thSecret?.value||'').trim();if(id!==String(row.appId||'')||secret)add('threads',{appId:id,appSecret:secret})}
      const ttKey=document.querySelector('[data-api-tiktok-client-key]'),ttSecret=document.querySelector('[data-api-tiktok-client-secret]');if(ttKey||ttSecret){const row=publisherApiRow('tiktok'),key=String(ttKey?.value||'').trim(),secret=String(ttSecret?.value||'').trim();if(key!==String(row.clientKey||'')||secret)add('tiktok',{clientKey:key,clientSecret:secret})}
      const ytId=document.querySelector('[data-api-youtube-client-id]'),ytSecret=document.querySelector('[data-api-youtube-client-secret]');if(ytId||ytSecret){const row=publisherApiRow('youtube'),id=String(ytId?.value||'').trim(),secret=String(ytSecret?.value||'').trim();if(id!==String(row.clientId||'')||secret)add('youtube',{clientId:id,clientSecret:secret})}
      const tgToken=document.querySelector('[data-api-telegram-bot-token]'),tgChat=document.querySelector('[data-api-telegram-chat-id]');if(tgToken||tgChat){const row=publisherApiRow('telegram'),chatId=String(tgChat?.value||'').trim(),token=String(tgToken?.value||'').trim();if(chatId!==String(row.chatId||'')||token)add('telegram',{botToken:token,chatId})}
      return out;
    }
    function publisherConnectorChoices(platform,row){const choices=Array.isArray(row.accountChoices)?row.accountChoices:[];if(!choices.length)return '';const opts=choices.map(x=>'<option value="'+safe(x.id)+'"'+(String(x.id)===String(row.selectedAccountId)?' selected':'')+'>'+safe((platform==='instagram'?(x.igUsername||x.name):(x.name||x.username||x.id)))+'</option>').join('');return '<label><span>'+(platform==='instagram'?'Page / Instagram Professional':'Tài khoản / Page')+'</span><select data-connector-account="'+platform+'">'+opts+'</select></label>'}
    function publisherConnectorPrivacy(platform,row){if(platform==='tiktok'){const opts=Array.isArray(row.tiktokPrivacyOptions)&&row.tiktokPrivacyOptions.length?row.tiktokPrivacyOptions:['SELF_ONLY'];return '<label><span>Quyền riêng tư TikTok</span><select data-connector-tiktok-privacy="tiktok">'+opts.map(x=>'<option value="'+safe(x)+'"'+(String(x)===String(row.tiktokPrivacyLevel)?' selected':'')+'>'+safe(x)+'</option>').join('')+'</select></label>'}if(platform==='youtube'){return '<label><span>Trạng thái YouTube</span><select data-connector-youtube-privacy="youtube"><option value="private"'+(row.youtubePrivacyStatus==='private'?' selected':'')+'>Private</option><option value="unlisted"'+(row.youtubePrivacyStatus==='unlisted'?' selected':'')+'>Unlisted</option><option value="public"'+(row.youtubePrivacyStatus==='public'?' selected':'')+'>Public</option></select></label>'}return ''}
    function renderPublisherConnectorGrid(){const box=$('publisher-connect-grid');if(!box)return;const keys=['facebook','instagram','threads','tiktok','youtube','zalo','telegram'];box.innerHTML=keys.map((platform)=>{const row=publisherRuntime.platforms&&publisherRuntime.platforms[platform]||{},ready=Boolean(row.automationReady),mode=String(row.mode||'not-connected').replace(/_/g,'-'),account=row.accountName||row.username||row.accountId||'',canOauth=Boolean(row.oauthSupported&&row.appConfigured&&row.securityReady&&row.callbackUrl),appState=row.appConfigured?'APP/API ✓':'THIẾU APP/API',oauthState=row.connected?'OAUTH ✓':'CHƯA OAUTH',scopeState=row.scopeReady?'QUYỀN ĐĂNG ✓':(row.connected&&row.scopeVerified===false?'QUYỀN CHƯA XÁC MINH':'CHƯA ĐỦ QUYỀN ĐĂNG'),analyticsState=row.analyticsReady?'ANALYTICS ✓':(Array.isArray(row.analyticsScopes)&&row.analyticsScopes.length?'ANALYTICS CHƯA CẤP':'ANALYTICS —');let actions='';if(row.oauthSupported){const analyticsButton=Array.isArray(row.analyticsScopes)&&row.analyticsScopes.length?'<button class="btn-soft" type="button" data-connector-analytics="'+platform+'"'+(canOauth?'':' disabled')+'>'+(row.analyticsReady?'CẤP LẠI ANALYTICS':'CẤP QUYỀN ANALYTICS')+'</button>':'';actions='<button class="gold" type="button" data-connector-connect="'+platform+'"'+(canOauth?'':' disabled')+'>'+(row.connected?(row.reconnectRecommended?'LIÊN KẾT LẠI + QUYỀN':'LIÊN KẾT LẠI'):'LIÊN KẾT '+publisherPlatformLabel(platform))+'</button>'+analyticsButton+(row.connected?'<button type="button" data-connector-test="'+platform+'">'+(platform==='threads'?'KIỂM TRA TOKEN/QUYỀN':'KIỂM TRA KẾT NỐI')+'</button><button class="btn-danger" type="button" data-connector-disconnect="'+platform+'">NGẮT</button>':'')}else if(platform==='telegram'){actions='<button type="button" data-connector-test="telegram"'+(row.appConfigured?'':' disabled')+'>KIỂM TRA BOT API</button>'}else if(platform==='zalo'){actions='<button class="gold" type="button" data-connector-open-settings="zalo">MỞ ZALO OA</button>'}const callback=row.callbackUrl?'<span class="publisher-connector-code">Callback: '+safe(row.callbackUrl)+'</span>':'',required=Array.isArray(row.requiredScopes)&&row.requiredScopes.length?'<div class="publisher-connector-note">Quyền cần: '+safe(row.requiredScopes.join(' · '))+'</div>':'';const analyticsRequired=Array.isArray(row.analyticsScopes)&&row.analyticsScopes.length?'<div class="publisher-connector-note">Quyền analytics (không bắt buộc để đăng): '+safe(row.analyticsScopes.join(' · '))+'</div>':'',missing=[...(row.missingRequiredScopes||[]),...(row.missingAnalyticsScopes||[])];const missingNote=missing.length?'<div class="publisher-connector-note"><b>Thiếu quyền:</b> '+safe([...new Set(missing)].join(' · '))+' · bấm LIÊN KẾT LẠI để cấp lại.</div>':'',scopeNote=String(row.scopeSource||'').startsWith('oauth-requested')?'<div class="publisher-connector-note"><b>Threads:</b> OAuth đã yêu cầu quyền nhưng token chưa được debugger xác nhận. Bấm KIỂM TRA TOKEN/QUYỀN; nếu vẫn vàng thì LIÊN KẾT LẠI + QUYỀN.</div>':'';return '<div class="publisher-connector-card '+(ready?'ready':'warn')+'"><div class="publisher-connector-top"><b>'+safe(publisherPlatformLabel(platform))+'</b><span class="platform-mode '+safe(mode)+'">'+safe(publisherModeText(platform))+'</span></div><div class="publisher-connector-meta">'+safe(row.help||'')+'</div>'+(account?'<div class="publisher-connector-account">Tài khoản: '+safe(account)+'</div>':'')+'<div class="publisher-status-grid"><span class="'+(row.appConfigured?'ok':'bad')+'">'+safe(appState)+'</span><span class="'+(row.connected?'ok':'bad')+'">'+safe(oauthState)+'</span><span class="'+(row.scopeReady?'ok':'bad')+'">'+safe(scopeState)+'</span><span class="'+(row.securityReady?'ok':'bad')+'">MÃ HÓA '+(row.securityReady?'✓':'✕')+'</span><span class="'+(row.analyticsReady?'ok':'bad')+'">'+safe(analyticsState)+'</span></div>'+publisherCredentialFields(platform)+'<div class="publisher-connector-fields"><label><span>Bật / tắt trong ĐĂNG TẤT CẢ</span><select data-connector-enabled="'+platform+'"><option value="1"'+(row.enabled!==false?' selected':'')+'>Bật</option><option value="0"'+(row.enabled===false?' selected':'')+'>Tắt</option></select></label>'+publisherConnectorChoices(platform,row)+publisherConnectorPrivacy(platform,row)+'</div>'+callback+required+analyticsRequired+missingNote+scopeNote+'<div class="publisher-connector-actions">'+actions+'</div>'+(row.lastError?'<div class="publisher-connector-note">Lỗi gần nhất: '+safe(row.lastError)+'</div>':'')+'</div>'}).join('');
      box.querySelectorAll('[data-connector-connect]').forEach(b=>b.onclick=()=>startPublisherOauth(b.dataset.connectorConnect,['instagram','threads'].includes(String(b.dataset.connectorConnect||''))));box.querySelectorAll('[data-connector-analytics]').forEach(b=>b.onclick=()=>startPublisherOauth(b.dataset.connectorAnalytics,true));box.querySelectorAll('[data-connector-test]').forEach(b=>b.onclick=()=>testPublisherConnector(b.dataset.connectorTest));box.querySelectorAll('[data-connector-disconnect]').forEach(b=>b.onclick=()=>disconnectPublisherConnector(b.dataset.connectorDisconnect));box.querySelectorAll('[data-connector-open-settings]').forEach(b=>b.onclick=()=>window.open((publisherRuntime.platforms[b.dataset.connectorOpenSettings]||{}).openUrl||publisherLinks[b.dataset.connectorOpenSettings]||'about:blank','_blank','noopener'));
    }
    function publisherHistoryState(platform,item){
      if(platform==='youtube'&&item&&item.status==='published'&&!item.uploadStatus&&!item.processingStatus)return 'unverified_upload';
      return String(item&&item.status||'manual');
    }
    function publisherHistoryLabel(status){return ({published:'ĐÃ ĐĂNG',processing:'ĐANG XỬ LÝ',queued:'ĐANG CHỜ',failed:'LỖI',needs_attention:'CẦN KIỂM TRA',unverified_upload:'ĐÃ CÓ VIDEO ID · CHƯA KIỂM TRA',not_connected:'CHƯA LIÊN KẾT',setup_required:'CHƯA ĐỦ THIẾT LẬP',disabled:'ĐANG TẮT',manual_confirmed:'ĐÃ XÁC NHẬN ĐĂNG TAY'})[status]||status}
    function publisherHistoryUrl(platform,item){
      let url=String(item&&item.url||'');
      const id=String(item&&item.externalId||'');
      if(!url&&id&&platform==='youtube')url='https://www.youtube.com/watch?v='+encodeURIComponent(id);
      if(!url&&id&&platform==='facebook')url='https://www.facebook.com/'+encodeURIComponent(id);
      try{const parsed=new URL(url);return parsed.protocol==='https:'?parsed.href:''}catch(_){return ''}
    }
    async function inspectPublisherHistory(runId,button){
      if(button)button.disabled=true;
      try{
        const response=await fetch('/api/admin/publisher/run/'+encodeURIComponent(runId)+'/refresh',{method:'POST',headers:headers(true),body:JSON.stringify({inspect:true})});
        const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Không kiểm tra được bài.');
        publisherRuntime.recentRuns=(publisherRuntime.recentRuns||[]).map(run=>run.id===runId?data.run:run);
        renderPublisherRuns();publisherStatusTarget('Đã kiểm tra các ID hiện có; xem trạng thái và liên kết trong lịch sử.');
      }catch(error){publisherStatusTarget('❌ '+error.message,false)}finally{if(button)button.disabled=false}
    }
    async function checkPublisherSelectedMedia(){
      const button=$('publisher-check-media'),box=$('publisher-media-check-result');
      if(button)button.disabled=true;if(box){box.hidden=false;box.textContent='Đang kiểm tra URL và file media đã duyệt…'}
      try{
        const sourceType=String($('publisher-source-type')?.value||publisherRuntime.sourceType||'video');
        const selected=sourceType==='product'?publisherSelectedProduct():publisherSelectedVideoJob();
        if(!selected)throw new Error('Hãy chọn video hoặc sản phẩm đã duyệt.');
        const request=sourceType==='product'?{sourceType:'product',productId:selected.id}:{sourceType:'video',videoJobId:selected.id};
        const response=await fetch('/api/admin/publisher/media-check',{method:'POST',headers:headers(true),body:JSON.stringify(request)});
        const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Không kiểm tra được media.');
        if(box)box.innerHTML=Object.entries(data.reports||{}).map(([platform,report])=>{
          const details=report.message||[...(report.issues||[]),...(report.warnings||[])].join(' ')||'URL và định dạng cơ bản đạt.';
          const encoding=report.encoding&&report.encoding.available?(' · '+report.encoding.videoCodec+' / '+(report.encoding.audioCodec||'không audio')+' · '+report.encoding.width+'×'+report.encoding.height+' · '+Number(report.encoding.duration||0).toFixed(1)+' giây'):'';
          return '<div class="publisher-media-result '+(report.ok?'ok':'warn')+'"><b>'+safe(platform.toUpperCase())+' · '+(report.ok?'KIỂM TRA CƠ BẢN ĐẠT':'CẦN XỬ LÝ')+'</b><div>'+safe(details)+'</div>'+(report.httpStatus?'<small>HTTP '+safe(report.httpStatus)+' · '+safe(report.contentType||'chưa rõ MIME')+safe(encoding)+'</small>':'')+'</div>';
        }).join('')+'<p>Kiểm tra từ hosting KBL; chưa chứng minh máy chủ nền tảng cũng tải được file. Thao tác này không đăng bài.</p>';
      }catch(error){if(box)box.textContent='❌ '+error.message}finally{if(button)button.disabled=false}
    }

    function renderPublisherRuns(){
      const box=$('publisher-runs');if(!box)return;
      const open=new Set(Array.from(box.querySelectorAll('details[open]')).map(el=>el.dataset.runId));
      const runs=Array.isArray(publisherRuntime.recentRuns)?publisherRuntime.recentRuns:[];
      if(!runs.length){box.innerHTML='Chưa có lịch sử.';return}
      box.innerHTML=runs.slice(0,12).map(run=>{
        const entries=Object.entries(run.items||{});
        const badges=entries.map(([platform,item])=>{const state=publisherHistoryState(platform,item),visibility=item&&item.visibility?' · '+item.visibility:'';
          return '<span class="'+safe(state)+'" title="'+safe(item&&item.message||'')+'">'+safe(platform)+' · '+safe(publisherHistoryLabel(state))+safe(visibility)+'</span>'}).join('');
        const details=entries.map(([platform,item])=>{
          if(!item)return '';const url=publisherHistoryUrl(platform,item),state=publisherHistoryState(platform,item);
          const message=state==='unverified_upload'?'Bản cũ chỉ ghi nhận Video ID. Bấm KIỂM TRA BÀI để lấy trạng thái xử lý và quyền xem thực tế.':item.message||'';
          const ref=item.externalId?'ID '+item.externalId:item.containerId?'Container '+item.containerId:'';
          return '<div class="publisher-run-detail"><b>'+safe(platform.toUpperCase())+':</b> '+safe(message)+(ref?'<small> '+safe(ref)+'</small>':'')+(url?' <a href="'+safe(url)+'" target="_blank" rel="noopener noreferrer">MỞ BÀI</a>':'')+'</div>';
        }).join('');
        return '<details class="publisher-run" data-run-id="'+safe(run.id)+'"'+(open.has(run.id)?' open':'')+'><summary class="publisher-run-head"><b>'+safe(run.sku||run.name||run.id)+'</b><small>'+safe((run.createdAt||'').replace('T',' ').slice(0,16))+'</small></summary><div class="publisher-run-items">'+badges+'</div>'+details+'<button type="button" class="publisher-inspect-run" data-pub-inspect-run="'+safe(run.id)+'">KIỂM TRA BÀI</button></details>';
      }).join('');
    }
    function publisherRunHasProcessing(run){return Object.values(run&&run.items||{}).some(v=>v&&['queued','processing'].includes(String(v.status||'')))}
    async function refreshPublisherRun(runId){try{const r=await fetch('/api/admin/publisher/run/'+encodeURIComponent(runId)+'/refresh',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(r.ok&&d.success)return d.run}catch(_){}return null}
    function schedulePublisherRunRefresh(){
      if(publisherRuntime.refreshTimer){clearTimeout(publisherRuntime.refreshTimer);publisherRuntime.refreshTimer=null}
      const pending=(publisherRuntime.recentRuns||[]).filter(publisherRunHasProcessing).slice(0,2);
      if(!pending.length){publisherRuntime.refreshRounds=0;return}
      publisherRuntime.refreshRounds=Number(publisherRuntime.refreshRounds||0);if(publisherRuntime.refreshRounds>=90)return;
      publisherRuntime.refreshTimer=setTimeout(async()=>{publisherRuntime.refreshRounds++;for(const run of pending)await refreshPublisherRun(run.id);await loadPublisherRuns();await loadPublisherVideoJobs()},20000);
    }
    async function loadPublisherConnectors(){try{const r=await fetch('/api/admin/publisher/connectors',{headers:headers(false),cache:'no-store'}),d=await r.json();if(r.ok&&d.success){publisherRuntime.platforms={...(publisherRuntime.platforms||{}),...(d.platforms||{})};if(d.appConfig&&typeof d.appConfig==='object')publisherRuntime.appConfig=d.appConfig;renderPublisherPlatformModes();renderPublisherConnectorGrid()}}catch(_){} }
    async function loadPublisherRuns(){try{const r=await fetch('/api/admin/publisher/runs',{headers:headers(false),cache:'no-store'}),d=await r.json();if(r.ok&&d.success){publisherRuntime.recentRuns=Array.isArray(d.runs)?d.runs:[];renderPublisherRuns();schedulePublisherRunRefresh()}}catch(_){} }
    async function startPublisherOauth(platform,analytics=false){const popup=window.open('about:blank','kbl-oauth-'+platform,'width=680,height=800');publisherStatusTarget(analytics?'Đang liên kết lại + xin đủ quyền publish/analytics '+publisherPlatformLabel(platform)+'…':'Đang tạo liên kết đăng nhập '+publisherPlatformLabel(platform)+'…');try{const r=await fetch('/api/admin/publisher/oauth/start/'+encodeURIComponent(platform),{method:'POST',headers:headers(true),body:JSON.stringify({analytics:Boolean(analytics)})}),text=await r.text();let d={};try{d=text?JSON.parse(text):{}}catch(_){throw new Error('Server trả dữ liệu OAuth không hợp lệ (HTTP '+r.status+').')}if(!r.ok||!d.success||!d.url)throw new Error(d.message||'Không bắt đầu OAuth được.');if(popup&&!popup.closed){popup.location.href=d.url;try{popup.focus()}catch(_){}}else{const fallback=window.open(d.url,'_blank');if(!fallback)throw new Error('Trình duyệt đang chặn cửa sổ đăng nhập. Hãy cho phép popup cho trang KBL rồi bấm LIÊN KẾT lại.')}publisherStatusTarget(analytics?'Hãy cấp quyền analytics trong cửa sổ '+publisherPlatformLabel(platform)+'. Quyền này không bắt buộc để đăng bài.':'Hãy đăng nhập và cấp quyền đăng bài trong cửa sổ '+publisherPlatformLabel(platform)+'.',null)}catch(e){try{if(popup&&!popup.closed)popup.close()}catch(_){}publisherStatusTarget('❌ '+e.message,false)}}
    async function testPublisherConnector(platform){publisherStatusTarget('Đang kiểm tra API '+publisherPlatformLabel(platform)+'…');try{const r=await fetch('/api/admin/publisher/test/'+encodeURIComponent(platform),{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(d.platform)publisherRuntime.platforms[platform]=d.platform;renderPublisherPlatformModes();renderPublisherConnectorGrid();if(!r.ok||!d.success)throw new Error(d.message||'Kiểm tra thất bại.');publisherStatusTarget('✅ '+d.message,true)}catch(e){publisherStatusTarget('❌ '+e.message,false)}}
    async function disconnectPublisherConnector(platform){if(!window.confirm('Ngắt liên kết '+publisherPlatformLabel(platform)+'? Token lưu trên KBL sẽ bị xóa.'))return;try{const r=await fetch('/api/admin/publisher/disconnect/'+encodeURIComponent(platform),{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không ngắt được.');await loadPublisherConnectors();publisherStatusTarget('✅ Đã ngắt '+publisherPlatformLabel(platform)+'.',true)}catch(e){publisherStatusTarget('❌ '+e.message,false)}}

    // KBL V6.0.1 HOTFIX: restore publisher functions that were accidentally dropped during V6 merge.
    async function savePublisherConnectors(){const btn=$('publisher-connectors-save'),oldText=btn?btn.textContent:'';if(btn){btn.disabled=true;btn.textContent='ĐANG LƯU…'}publisherStatusTarget('Đang lưu API + tùy chọn…');const payload={};['facebook','instagram','threads','tiktok','youtube','zalo','telegram'].forEach((platform)=>{const row={enabled:String(document.querySelector('[data-connector-enabled="'+platform+'"]')?.value||'1')!=='0'},account=document.querySelector('[data-connector-account="'+platform+'"]');if(account)row.selectedAccountId=account.value;if(platform==='tiktok')row.tiktokPrivacyLevel=String(document.querySelector('[data-connector-tiktok-privacy="tiktok"]')?.value||'');if(platform==='youtube')row.youtubePrivacyStatus=String(document.querySelector('[data-connector-youtube-privacy="youtube"]')?.value||'private');payload[platform]=row});try{const appPayload=publisherCollectAppConfig();if(Object.keys(appPayload).length){publisherStatusTarget('Đang mã hóa và lưu App ID / Secret trên server…');const ar=await fetch('/api/admin/publisher/app-config',{method:'POST',headers:headers(true),body:JSON.stringify(appPayload)}),at=await ar.text();let ad={};try{ad=at?JSON.parse(at):{}}catch(_){throw new Error('Server trả dữ liệu lưu API không hợp lệ (HTTP '+ar.status+').')}if(!ar.ok||!ad.success)throw new Error(ad.message||'Không lưu được API credentials');publisherRuntime.appConfig=ad.appConfig||publisherRuntime.appConfig;publisherRuntime.platforms={...(publisherRuntime.platforms||{}),...(ad.platforms||{})}}const r=await fetch('/api/admin/publisher/connectors',{method:'POST',headers:headers(true),body:JSON.stringify(payload)}),rt=await r.text();let d={};try{d=rt?JSON.parse(rt):{}}catch(_){throw new Error('Server trả dữ liệu lưu tùy chọn không hợp lệ (HTTP '+r.status+').')}if(!r.ok||!d.success)throw new Error(d.message||'Không lưu được tùy chọn');publisherRuntime.platforms={...(d.platforms||{})};if(d.appConfig)publisherRuntime.appConfig=d.appConfig;renderPublisherPlatformModes();renderPublisherConnectorGrid();publisherStatusTarget('✅ Đã lưu API + tùy chọn. Secret/Token được mã hóa server-side và không hiển thị lại.',true)}catch(e){publisherStatusTarget('❌ '+e.message,false)}finally{if(btn){btn.disabled=false;btn.textContent=oldText||'LƯU API & TÙY CHỌN'}}}
    function publisherRunSummary(run){const states=Object.entries(run&&run.items||{}).map(([platform,item])=>publisherHistoryState(platform,item)),count=status=>states.filter(s=>s===status).length;return 'đã đăng '+count('published')+' · đang chờ '+count('queued')+' · đang xử lý '+count('processing')+' · cần kiểm tra '+(count('needs_attention')+count('unverified_upload'))+' · chưa liên kết '+(count('not_connected')+count('setup_required'))+' · lỗi '+count('failed')}
    async function publishAllPlatforms(){const type=String($('publisher-source-type')?.value||publisherRuntime.sourceType||'video'),b=$('publisher-publish-all');if(b)b.disabled=true;publisherRuntime.refreshRounds=0;try{if(type==='video'){const j=publisherSelectedVideoJob();if(!j)throw new Error('Hãy chọn video đã duyệt.');await savePublisherPack();$('publisher-status').textContent='Đang xếp hàng Publisher; server sẽ trả ngay, từng kênh xử lý nền…';const r=await fetch('/api/admin/publisher/video-job/'+encodeURIComponent(j.id)+'/publish-all',{method:'POST',headers:headers(true),body:JSON.stringify({platforms:['facebook','instagram','threads','tiktok','youtube','zalo','telegram']})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không đăng được video');j.publisherStatus=d.job?.publisherStatus||j.publisherStatus;publisherRuntime.recentRuns=[d.run,...(publisherRuntime.recentRuns||[])].filter(Boolean).slice(0,20);renderPublisherRuns();renderPublisherSource();$('publisher-status').textContent='✅ Đã xếp hàng: '+publisherRunSummary(d.run)+'. KBL tự cập nhật queued/processing/published; không chờ HTTP lâu nên tránh 504 do proxy timeout.';schedulePublisherRunRefresh();return}const p=publisherSelectedProduct();if(!p)throw new Error('Hãy chọn SKU.');await savePublisherPack();$('publisher-status').textContent='Đang xếp hàng Publisher; server sẽ trả ngay, từng kênh xử lý nền…';const r=await fetch('/api/admin/publisher/publish-all/'+encodeURIComponent(p.id),{method:'POST',headers:headers(true),body:JSON.stringify({platforms:['facebook','instagram','threads','tiktok','youtube','zalo','telegram']})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không đăng được');Object.assign(p,d.product||{});publisherRuntime.recentRuns=[d.run,...(publisherRuntime.recentRuns||[])].filter(Boolean).slice(0,20);renderPublisherRuns();renderPublisherProduct();$('publisher-status').textContent='✅ Đã xếp hàng: '+publisherRunSummary(d.run)+'. KBL tự cập nhật queued/processing/published; không chờ HTTP lâu nên tránh 504 do proxy timeout.';schedulePublisherRunRefresh()}catch(e){$('publisher-status').textContent='❌ '+e.message}finally{if(b)b.disabled=false}}
    async function retryPublisherPlatform(platform){const type=String($('publisher-source-type')?.value||publisherRuntime.sourceType||'video');try{if(type==='video'){const j=publisherSelectedVideoJob();if(!j)throw new Error('Hãy chọn video đã duyệt.');await savePublisherPack();const r=await fetch('/api/admin/publisher/video-job/'+encodeURIComponent(j.id)+'/publish-all',{method:'POST',headers:headers(true),body:JSON.stringify({platforms:[platform]})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không đăng lại được');publisherRuntime.recentRuns=[d.run,...(publisherRuntime.recentRuns||[])].filter(Boolean).slice(0,20);renderPublisherRuns();$('publisher-status').textContent='✅ Đã gọi lại API '+platform+': '+publisherRunSummary(d.run);schedulePublisherRunRefresh();return}const p=publisherSelectedProduct();if(!p)throw new Error('Hãy chọn SKU.');const r=await fetch('/api/admin/publisher/retry/'+encodeURIComponent(p.id),{method:'POST',headers:headers(true),body:JSON.stringify({platform})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không đăng lại được');Object.assign(p,d.product||{});await loadPublisherRuns();renderPublisherProduct();$('publisher-status').textContent='✅ Đã gọi lại API '+platform+'.'}catch(e){$('publisher-status').textContent='❌ '+e.message}}
    function renderLongVideoAnalysis(job){const box=$('publisher-long-analysis'),a=job&&job.analysis;if(!box)return;if(!a){box.hidden=true;box.innerHTML='';return}box.hidden=false;const clips=Array.isArray(a.viralClips)?a.viralClips:[],high=Array.isArray(a.highlights)?a.highlights:[];box.innerHTML='<h4>AI đã xem/nghe video</h4><b>Chủ đề:</b> '+safe(a.topic||'—')+'<br><b>Tone:</b> '+safe(a.tone||'—')+'<br><b>Hook:</b> '+safe(a.hook||'—')+'<br><b>CTA:</b> '+safe(a.cta||'—')+'<p>'+safe(a.summary||'')+'</p>'+(high.length?'<b>Đoạn đáng chú ý</b><div class="long-video-viral">'+high.slice(0,5).map(x=>'<div class="long-video-clip"><span class="long-video-time">'+safe(x.start)+' → '+safe(x.end)+'</span><b>'+safe(x.title)+'</b><small>'+safe(x.reason)+'</small></div>').join('')+'</div>':'')+(clips.length?'<b style="display:block;margin-top:9px">🔥 AI TÌM ĐOẠN VIRAL</b><div class="long-video-viral">'+clips.slice(0,3).map(x=>'<div class="long-video-clip"><span class="long-video-time">'+safe(x.start)+' → '+safe(x.end)+'</span><b>'+safe(x.title)+'</b><small>Hook: '+safe(x.hook)+'<br>'+safe(x.reason)+'</small></div>').join('')+'</div>':'')+(a.transcriptText?'<details style="margin-top:9px"><summary><b>Xem transcript</b></summary><div style="white-space:pre-wrap;margin-top:7px">'+safe(a.transcriptText)+'</div></details>':'')}
    function longVideoSelectedJob(){return publisherRuntime.longVideoJob||null}
    async function uploadPublisherLongVideo(){const file=$('publisher-long-file')?.files?.[0];if(!file)return $('publisher-long-status').textContent='❌ Hãy chọn video trước.';publisherRuntime.longVideoFile=file;publisherRuntime.longVideoJob=null;const btn=$('publisher-long-upload'),bar=$('publisher-long-progress');if(btn)btn.disabled=true;if($('publisher-long-analyze'))$('publisher-long-analyze').disabled=true;if($('publisher-long-approve'))$('publisher-long-approve').disabled=true;if(bar)bar.style.width='3%';$('publisher-long-status').textContent='Đang mở upload chunk/resume · CHƯA DUYỆT…';try{const duration=await new Promise(resolve=>{const v=document.createElement('video'),url=URL.createObjectURL(file);v.preload='metadata';v.onloadedmetadata=()=>{const d=Number(v.duration||0);URL.revokeObjectURL(url);resolve(d)};v.onerror=()=>{URL.revokeObjectURL(url);resolve(0)};v.src=url}),title=String($('publisher-long-title')?.value||file.name||'Video ngoài').trim();publisherRuntime.longVideoDuration=duration;const d=await kblChunkVideoUpload(file,{kind:'publisher-long',title,duration,onProgress:(p,msg)=>{if(bar)bar.style.width=Math.max(3,Math.round(p*45))+'%';$('publisher-long-status').textContent='⬆ '+msg+' · CHƯA DUYỆT'}});if(bar)bar.style.width='45%';publisherRuntime.longVideoJob=d.job;renderLongVideoAnalysis(d.job);if($('publisher-long-analyze'))$('publisher-long-analyze').disabled=false;$('publisher-long-status').textContent='✅ Đã tải video '+(duration?duration.toFixed(1)+'s':'')+' bằng chunk/resume · MASTER GIỮ NGUYÊN · CHƯA DUYỆT. Bấm AI QUÉT VIDEO.'}catch(e){$('publisher-long-status').textContent='❌ '+e.message;if(bar)bar.style.width='0'}finally{if(btn)btn.disabled=false}}
    async function pollPublisherLongVideoAnalysis(jobId){const started=Date.now(),timeoutMs=15*60*1000;while(Date.now()-started<timeoutMs){await new Promise(r=>setTimeout(r,1600));const r=await fetch('/api/admin/publisher/long-video/'+encodeURIComponent(jobId)+'/analyze-status',{headers:headers(false),cache:'no-store'}),d=await kblReadApiJson(r);if(!r.ok||!d.success)throw new Error(d.message||'Không đọc được trạng thái AI.');const status=String(d.state?.status||'');if(status==='done'&&d.analysis)return d;if(status==='error')throw new Error(d.state?.message||'AI quét video bị lỗi.');const elapsed=Math.max(1,Math.round((Date.now()-started)/1000));$('publisher-long-status').textContent='🧠 AI đang xem/nghe video trong nền · '+elapsed+'s · có thể giữ trang mở, không còn chờ HTTP 504.'}throw new Error('AI vẫn đang xử lý quá 15 phút. Job vẫn ở server; bấm AI QUÉT VIDEO để kiểm tra/tiếp tục.')}
    async function analyzePublisherLongVideo(){const job=longVideoSelectedJob();if(!job)return $('publisher-long-status').textContent='❌ Chưa có video đã upload.';const b=$('publisher-long-analyze');if(b)b.disabled=true;if($('publisher-long-approve'))$('publisher-long-approve').disabled=true;$('publisher-long-status').textContent='🧠 Đang xếp Gemini quét video chạy nền…';try{const r=await fetch('/api/admin/publisher/long-video/'+encodeURIComponent(job.id)+'/analyze',{method:'POST',headers:headers(true),body:'{}'}),d=await kblReadApiJson(r);if(!r.ok||!d.success)throw new Error(d.message||'Không phân tích được video');const done=d.analysis?d:await pollPublisherLongVideoAnalysis(job.id);publisherRuntime.longVideoJob={...job,...(done.job||{}),analysis:done.analysis};renderLongVideoAnalysis(publisherRuntime.longVideoJob);const bar=$('publisher-long-progress');if(bar)bar.style.width='75%';if($('publisher-long-approve'))$('publisher-long-approve').disabled=false;$('publisher-long-status').textContent='✅ AI quét xong trong job nền. Hãy xem kết quả rồi bấm DUYỆT VIDEO → CAPTION V2.'}catch(e){$('publisher-long-status').textContent='❌ '+e.message}finally{if(b)b.disabled=false}}
    async function approvePublisherLongVideo(){const job=longVideoSelectedJob();if(!job)return $('publisher-long-status').textContent='❌ Chưa có video để duyệt.';const b=$('publisher-long-approve');if(b)b.disabled=true;$('publisher-long-status').textContent='Đang ghi nhận duyệt của chủ tiệm…';try{const r=await fetch('/api/admin/publisher/long-video/'+encodeURIComponent(job.id)+'/approve',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không duyệt được video');publisherRuntime.longVideoJob={...job,...(d.job||{}),analysis:job.analysis};const bar=$('publisher-long-progress');if(bar)bar.style.width='100%';await loadPublisherVideoJobs();publisherRuntime.sourceType='video';publisherRuntime.videoJobId=d.job.id;if($('publisher-source-type'))$('publisher-source-type').value='video';if($('publisher-video-job'))$('publisher-video-job').value=d.job.id;renderPublisherSource();$('publisher-long-status').textContent='✅ ĐÃ DUYỆT. Video đã mở khóa cho Caption Engine V2 phía dưới; chưa có nền tảng nào được đăng tự động.'}catch(e){$('publisher-long-status').textContent='❌ '+e.message;if(b)b.disabled=false}}
    async function buildPublisherPack(){const type=String($('publisher-source-type')?.value||publisherRuntime.sourceType||'video'),style=String($('publisher-caption-style')?.value||'viral'),b=$('publisher-build');if(b)b.disabled=true;$('publisher-status').textContent='Caption Engine V2 đang tạo giọng riêng cho từng nền tảng…';try{if(type==='video'){const j=publisherSelectedVideoJob();if(!j)throw new Error('Hãy chọn video đã duyệt.');const r=await fetch('/api/admin/publisher/video-job/'+encodeURIComponent(j.id)+'/captions',{method:'POST',headers:headers(true),body:JSON.stringify({style})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tạo được Caption V2');j.publisherDrafts=d.drafts||{};['facebook','instagram','threads','tiktok','youtube','zalo','telegram'].forEach(k=>{if($('publisher-'+k))$('publisher-'+k).value=d.drafts?.[k]||''});$('publisher-status').textContent='✅ Caption V2: '+safe(d.engine||'')+' · 7 nền tảng đã được viết riêng.';return}const p=publisherSelectedProduct();if(!p)throw new Error('Hãy chọn SKU.');const r=await fetch('/api/admin/publisher/build',{method:'POST',headers:headers(true),body:JSON.stringify({productId:p.id,campaign:$('publisher-campaign')?.value||'',tone:style})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tạo được Content Pack');Object.assign(p,d.product||{});['facebook','instagram','threads','tiktok','youtube','zalo','telegram'].forEach(k=>{if($('publisher-'+k))$('publisher-'+k).value=d.drafts?.[k]||''});$('publisher-status').textContent='✅ Content Pack V2 đã tạo và lưu theo SKU.'}catch(e){$('publisher-status').textContent='❌ '+e.message}finally{if(b)b.disabled=false}}
    async function regeneratePublisherCaption(platform){const type=String($('publisher-source-type')?.value||publisherRuntime.sourceType||'video'),style=String($('publisher-caption-style')?.value||'viral');if(type!=='video'&&type!=='long-video')return buildPublisherPack();const j=publisherSelectedVideoJob();if(!j)return $('publisher-status').textContent='❌ Hãy chọn video đã duyệt.';const btn=document.querySelector('[data-pub-regenerate="'+platform+'"]');if(btn)btn.disabled=true;$('publisher-status').textContent='Đang tạo lại riêng '+platform+'…';try{const r=await fetch('/api/admin/publisher/video-job/'+encodeURIComponent(j.id)+'/captions',{method:'POST',headers:headers(true),body:JSON.stringify({style,platform})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tạo lại được');j.publisherDrafts=d.drafts||j.publisherDrafts||{};if($('publisher-'+platform))$('publisher-'+platform).value=d.drafts?.[platform]||'';$('publisher-status').textContent='✅ Đã tạo lại riêng '+platform+'; các caption khác được giữ nguyên.'}catch(e){$('publisher-status').textContent='❌ '+e.message}finally{if(btn)btn.disabled=false}}

    async function savePublisherPack(){const type=String($('publisher-source-type')?.value||publisherRuntime.sourceType||'video');if(type==='video'){const j=publisherSelectedVideoJob();if(!j)return;const r=await fetch('/api/admin/publisher/video-job/'+encodeURIComponent(j.id)+'/save',{method:'POST',headers:headers(true),body:JSON.stringify({drafts:publisherDraftValues()})}),d=await r.json();if(r.ok&&d.success){j.publisherDrafts=d.drafts||publisherDraftValues();$('publisher-status').textContent='✅ Đã lưu caption riêng cho video theo từng nền tảng.'}else $('publisher-status').textContent='❌ '+(d.message||'Không lưu được caption video');return}const p=publisherSelectedProduct();if(!p)return;const r=await fetch('/api/admin/publisher/save/'+encodeURIComponent(p.id),{method:'POST',headers:headers(true),body:JSON.stringify({drafts:publisherDraftValues()})}),d=await r.json();if(r.ok&&d.success){Object.assign(p,d.product||{});$('publisher-status').textContent='✅ Đã lưu caption vào Product Manifest.'}else $('publisher-status').textContent='❌ '+(d.message||'Không lưu được')}
    async function markPublisherPlatform(platform){if(!window.confirm('Chỉ dùng khi ông đã tự đăng tay bên ngoài KBL. Trạng thái sẽ ghi MANUAL_CONFIRMED, không phải API xác nhận. Tiếp tục?'))return;const type=String($('publisher-source-type')?.value||publisherRuntime.sourceType||'video');try{if(type==='video'){const j=publisherSelectedVideoJob();if(!j)throw new Error('Hãy chọn video.');const r=await fetch('/api/admin/publisher/video-job/'+encodeURIComponent(j.id)+'/mark',{method:'POST',headers:headers(true),body:JSON.stringify({platform})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không xác nhận được');j.publisherStatus=j.publisherStatus||{};j.publisherStatus[platform]=d.status;renderPublisherSource()}else{const p=publisherSelectedProduct();if(!p)throw new Error('Hãy chọn SKU.');const r=await fetch('/api/admin/publisher/mark/'+encodeURIComponent(p.id),{method:'POST',headers:headers(true),body:JSON.stringify({platform})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không xác nhận được');Object.assign(p,d.product||{});renderPublisherProduct()}$('publisher-status').textContent='✅ Đã ghi '+platform+' = manual_confirmed (đăng tay), không tính là API tự đăng.'}catch(e){$('publisher-status').textContent='❌ '+e.message}}
    async function sendPublisherTelegram(){await retryPublisherPlatform('telegram')}
    function refreshLiveProductOptions(){
      const select=$('live-product-select');if(!select)return;const current=select.value;const ids=new Set(liveRuntime.queue.map(p=>String(p.id)));const rows=publisherEligibleProducts().filter(p=>!ids.has(String(p.id)));select.innerHTML='<option value="">— Chọn SKU —</option>'+rows.map(p=>'<option value="'+safe(p.id)+'">'+safe(p.sku)+' · '+safe(p.displayName||p.name)+'</option>').join('');if(rows.some(p=>String(p.id)===String(current)))select.value=current;
    }
    function growthStatusText(text,ok=true){const el=$('growth-status');if(el){el.textContent=(ok?'✅ ':'❌ ')+text;el.style.color=ok?'':'#a61b2b'}}
    function renderGrowthRevenueLoop(g){
      const f=g&&g.funnel||{},t=f.totals||{},metrics=$('growth-funnel-metrics'),learn=$('growth-learning'),top=$('growth-top-posts');
      if(metrics){const cards=[['ĐĂNG',Number(t.posts||0),'bài đã publish'],['KHÁCH',Number(t.visitors||0),'khách web có dấu vết'],['LEAD',Number(t.leads||0),'hỏi / giữ / đặt'],['ĐƠN',Number(t.orders||0),'hold / booking / order'],['ĐÃ THU',Number(t.paidOrders||0),'đơn paid / hoàn tất'],['TIỀN',money(Number(t.revenue||0)),'doanh thu đã ghi nhận']];metrics.innerHTML=cards.map(x=>'<div class="platform-card" style="padding:10px"><b>'+safe(x[0])+'</b><div style="font-size:18px;font-weight:800;margin-top:2px">'+safe(String(x[1]))+'</div><small>'+safe(x[2])+'</small></div>').join('')+'<div class="platform-card" style="padding:10px"><b>CHUYỂN ĐỔI</b><div>'+safe(Number(t.leadRate||0).toFixed(2))+'% khách → lead</div><small>'+safe(Number(t.orderRate||0).toFixed(2))+'% lead → đơn · '+safe(Number(t.paidRate||0).toFixed(2))+'% đơn → paid</small></div>'}
      if(learn){const rows=f.learning&&Array.isArray(f.learning.topTypes)?f.learning.topTypes:[];learn.innerHTML=rows.length?rows.slice(0,6).map(x=>'<div class="analytics-row"><b>'+safe(String(x.key||'').replaceAll('-',' ').toUpperCase())+' · boost '+safe((Number(x.boost||0)>=0?'+':'')+Number(x.boost||0).toFixed(2))+'</b><small>'+safe(Number(x.visitors||0).toFixed(0))+' khách · '+safe(Number(x.leads||0).toFixed(0))+' lead · '+safe(Number(x.orders||0).toFixed(0))+' đơn · '+safe(money(Number(x.revenue||0)))+' · confidence '+safe(Math.round(Number(x.confidence||0)*100))+'%</small></div>').join(''):'<div class="empty">Chưa đủ dữ liệu có attribution để AI đổi trọng số. Hệ thống giữ nguyên chiến lược hiện tại.</div>'}
      if(top){const rows=Array.isArray(f.topPosts)?f.topPosts:[];top.innerHTML=rows.length?rows.slice(0,6).map(x=>'<div class="analytics-row"><b>'+safe(String(x.platform||'').toUpperCase())+' · '+safe((x.skus||[]).join(' · '))+'</b><small>'+safe(Number(x.visitors||0))+' khách · '+safe(Number(x.leads||0))+' lead · '+safe(Number(x.orders||0))+' đơn · '+safe(money(Number(x.revenue||0)))+(x.url?' · <a href="'+safe(x.url)+'" target="_blank" rel="noopener">mở bài</a>':'')+'</small></div>').join(''):'<div class="empty">Chưa có bài Growth V1.2 tạo traffic/lead được gắn dấu vết.</div>'}
    }
    function renderGrowthPreparedPosts(g){
      const box=$('growth-prepared-posts'),count=$('growth-prepared-count'),stats=$('growth-overview-counters');
      const rows=Array.isArray(g&&g.preparedPosts)?g.preparedPosts:[];
      const ready=rows.filter(x=>x&&x.ready).length;
      if(count)count.textContent=rows.length?'· '+rows.length:'';
      if(stats){const fallback=rows.filter(x=>x&&x.mode==='clean-fallback').length,review=Array.isArray(g&&g.reviewQueue)?g.reviewQueue.length:0,next=(g&&g.watchdog&&g.watchdog.nextDue)||null;stats.innerHTML=[['READY',ready,'bộ đã duyệt'],['ĐANG CHUẨN BỊ',Math.max(0,rows.length-ready),'bộ chưa ready'],['SAFE FALLBACK',fallback,'bộ ảnh thật'],['REVIEW',review,'cần kiểm tra'],['BÀI KẾ',next?String(next.platform||'').toUpperCase():'—',next?dateTime(next.dueAt):'chưa có lịch']].map(x=>'<div class="platform-card" style="padding:10px"><b>'+safe(String(x[0]))+'</b><div style="font-size:17px;font-weight:800;margin-top:2px">'+safe(String(x[1]))+'</div><small>'+safe(String(x[2]))+'</small></div>').join('')}
      if(!box)return;
      if(!rows.length){box.innerHTML='<div class="empty">Chưa có bộ ảnh chuẩn bị. Khi Master Agent lên bài, bộ 3 ảnh sẽ xuất hiện ở đây trước giờ đăng.</div>';return}
      box.innerHTML=rows.slice(0,12).map(row=>{const prep=row.prepared||{},images=Array.isArray(prep.posterUrls)&&prep.posterUrls.length===3?prep.posterUrls:Array.isArray(prep.cleanUrls)?prep.cleanUrls:[],skus=Array.isArray(row.skus)?row.skus:[],design=prep.designQa||{},fact=prep.factQa||{},media=prep.mediaQa||{},qr=prep.qrQa||{},mode=prep.mode||'',ready=Boolean(row.ready),schedule=Array.isArray(row.schedules)?row.schedules:[];const pill=(label,ok,warn=false)=>'<span class="growth-qa-pill '+(ok?'ok':warn?'warn':'bad')+'">'+safe(label)+' '+(ok?'✓':warn?'△':'✕')+'</span>';return '<div class="growth-ready-card"><div class="growth-ready-head"><div><b>'+safe(skus.join(' · ')||row.campaignId||'Bộ 3 SKU')+'</b><div class="muted" style="margin-top:3px">'+safe(schedule.map(s=>String(s.platform||'').toUpperCase()+' '+dateTime(s.dueAt)).join(' · '))+'</div></div><span class="content-badge">'+safe(ready?(mode==='clean-fallback'?'SAFE FALLBACK · READY':'READY TO POST'):(row.status||'PREPARING').toUpperCase())+'</span></div><div class="growth-ready-images">'+[0,1,2].map(i=>images[i]?'<a class="growth-ready-image" href="'+safe(images[i])+'" target="_blank" rel="noopener"><img src="'+safe(images[i])+'" alt="'+safe(skus[i]||('Ảnh '+(i+1)))+'"><span>'+safe(skus[i]||('ẢNH '+(i+1)))+'</span></a>':'<div class="growth-ready-image"><small>Ảnh '+(i+1)+' đang chuẩn bị</small></div>').join('')+'</div><div class="growth-qa-line">'+pill('Design AI',Boolean(design.approved),mode==='clean-fallback')+pill('Facts',Boolean(fact.approved))+pill('QR',Boolean(qr.approved),mode==='clean-fallback')+pill('HTTPS 3/3',Boolean(media.approved))+pill('3 ảnh',images.length===3)+'</div>'+(prep.message?'<div class="muted" style="margin-top:7px">'+safe(prep.message)+'</div>':'')+'</div>'}).join('');
      const pipeReady=$('growth-pipe-ready'),pipeCreate=$('growth-pipe-create'),pipeReview=$('growth-pipe-review');if(pipeReady)pipeReady.style.background=ready?'#eaf7ef':'#fff';if(pipeCreate)pipeCreate.style.background=rows.length?'#eef6ff':'#fff';if(pipeReview)pipeReview.style.background=rows.some(x=>x&&x.prepared&&x.prepared.designQa)?'#f4efff':'#fff';
    }
    function salesImageStageIndex(code){const order=['OPPORTUNITY','IDEA_REVIEW','GENERATING_3_IMAGES','DESIGN_REVIEW','FACT_QR_MEDIA_QA','READY_TO_POST','PUBLISHING','PUBLISHED'];return Math.max(0,order.indexOf(String(code||'OPPORTUNITY')))}
    function salesImageSetStagebar(code,published=false,failed=false){const order=['OPPORTUNITY','IDEA_REVIEW','GENERATING_3_IMAGES','DESIGN_REVIEW','FACT_QR_MEDIA_QA','READY_TO_POST','PUBLISHING','PUBLISHED'],idx=published?7:salesImageStageIndex(code);document.querySelectorAll('[data-sales-stage]').forEach((el)=>{const i=order.indexOf(el.dataset.salesStage);el.classList.toggle('done',i<idx||(published&&i<=7));el.classList.toggle('active',!published&&i===idx);el.classList.toggle('bad',Boolean(failed&&i===idx))})}
    function salesImageThumbSources(row){const prep=row&&row.prepared||{},candidates=Array.isArray(prep.posterUrls)&&prep.posterUrls.length===3?prep.posterUrls:Array.isArray(prep.posterResults)&&prep.posterResults.length===3?prep.posterResults.map(x=>x&&x.posterUrl||x&&x.posterImage||''):Array.isArray(prep.cleanUrls)&&prep.cleanUrls.length===3?prep.cleanUrls:(Array.isArray(row&&row.products)?row.products.map(x=>x&&x.image||''):[]);return candidates.slice(0,3)}
    function salesImageQaPills(row){const prep=row&&row.prepared||{},idea=row&&row.ideaReview||{},design=prep.designQa||{},fact=prep.factQa||{},qr=prep.qrQa||{},media=prep.mediaQa||{},ready=Boolean(row&&row.ready),fallback=Boolean(row&&row.progress&&row.progress.fallback);return '<div class="sales-image-pills"><span class="sales-image-pill '+(idea.approved?'ok':'warn')+'">Ý tưởng '+(idea.approved?'✓ '+Math.round(Number(idea.score||0))+'/100':'đang duyệt')+'</span><span class="sales-image-pill '+(design.approved?'ok':fallback?'warn':'')+'">Art Director '+(design.approved?'✓ '+Math.round(Number(design.score||0))+'/100':fallback?'fallback':'chờ')+'</span><span class="sales-image-pill '+(fact.approved?'ok':'warn')+'">Facts '+(fact.approved?'✓':'—')+'</span><span class="sales-image-pill '+(qr.approved?'ok':'warn')+'">QR '+(qr.approved?'✓':'—')+'</span><span class="sales-image-pill '+(media.approved?'ok':'warn')+'">HTTPS '+(media.approved?'✓ '+Number(media.count||0)+'/3':'—')+'</span><span class="sales-image-pill '+(ready?'ok':'')+'">'+(ready?(fallback?'SAFE FALLBACK':'READY TO POST'):'CHƯA READY')+'</span></div>'}
    function salesImageRenderCard(row){const prep=row&&row.prepared||{},progress=row&&row.progress||{},sources=salesImageThumbSources(row),reviews=Array.isArray(prep.designQa&&prep.designQa.rows)?prep.designQa.rows:[],skus=Array.isArray(row&&row.skus)?row.skus:[],idea=row&&row.ideaSnapshot||{},schedules=Array.isArray(row&&row.schedules)?row.schedules:[],cls=row&&row.ready?(progress.fallback?'warn':'ready'):'',thumbs=[0,1,2].map(i=>{const src=sources[i]||'',review=reviews[i]||{},score=Number(review.score||0),tag=skus[i]||('Ảnh '+(i+1));return '<div><div class="sales-image-thumb">'+(src?'<img src="'+safe(src)+'" alt="'+safe(tag)+'" loading="lazy">':'<div class="empty">Chưa có ảnh</div>')+'<span class="tag">'+safe(tag)+'</span></div><div class="sales-image-review">'+(score?('AI ảnh '+Math.round(score)+'/100'):(progress.fallback?'Ảnh thật SAFE FALLBACK':'Chờ AI duyệt'))+'</div></div>'}).join(''),scheduleHtml=schedules.map(x=>'<span class="sales-image-schedule">'+safe(String(x.platform||'').toUpperCase())+' · '+safe(dateTime(x.dueAt))+'</span>').join('');return '<article class="sales-image-card '+cls+'"><div class="sales-image-card-head"><div><h4>'+safe(skus.join(' · ')||row.campaignId||'Campaign')+'</h4><div class="sales-image-card-meta">'+safe(idea.title||row.campaign||'Bài 3 sản phẩm')+'</div></div><span class="sales-image-pill '+(row.ready?'ok':'warn')+'">'+safe(progress.label||row.status||'Đang xử lý')+'</span></div><div class="sales-image-progress"><span style="width:'+Math.max(4,Math.min(100,Number(progress.progress||10)))+'%"></span></div>'+salesImageQaPills(row)+'<div class="sales-image-thumbs">'+thumbs+'</div>'+(scheduleHtml?'<div class="sales-image-schedules">'+scheduleHtml+'</div>':'')+(row.message?'<div class="sales-image-card-meta" style="margin-top:8px">'+safe(row.message)+'</div>':'')+'</article>'}
    function renderSalesStudioImagePipeline(g){if(!g)return;const rows=Array.isArray(g.preparedPosts)?g.preparedPosts:[],ready=rows.filter(x=>x&&x.ready),wd=g.watchdog||{},badge=$('sales-image-auto-badge'),metrics=$('sales-image-metrics'),live=$('sales-image-live-list'),current=$('sales-image-current'),count=$('sales-image-ready-count'),recent=$('sales-image-recent-list'),s=g.settings||{},active=Boolean(s.enabled&&s.autoPublishPosts),busy=Boolean(g.busy);if(badge){badge.className='sales-image-live-badge '+(active&&wd.serverSchedulerHealthy?'ok':active?'warn':'bad');badge.textContent=!active?'AUTO OFF':busy?'AI ĐANG LÀM VIỆC':wd.serverSchedulerHealthy?'FULL AUTO · LIVE':'AUTO · CẦN KIỂM TRA'}if(metrics){metrics.innerHTML='<div class="sales-image-metric"><b>'+rows.length+'</b><span>Campaign đang theo dõi</span></div><div class="sales-image-metric"><b>'+ready.length+'</b><span>READY TO POST</span></div><div class="sales-image-metric"><b>'+Number(wd.readyCount||0)+'</b><span>Kênh API-ready</span></div><div class="sales-image-metric"><b>'+(wd.serverSchedulerHealthy?'LIVE':'—')+'</b><span>Scheduler '+(wd.tickAgeSeconds!=null?Number(wd.tickAgeSeconds)+'s':'chưa heartbeat')+'</span></div>'}if(count)count.textContent=ready.length+' READY';const first=rows[0]||null;if(first){const p=first.progress||{},idea=first.ideaReview||{};salesImageSetStagebar(p.current,false,false);current.innerHTML='<div class="sales-image-progress-card"><div class="sales-image-progress-head"><div><h4>'+safe(p.label||'Đang xử lý')+'</h4><div class="sales-image-card-meta">'+safe((first.skus||[]).join(' · '))+' · '+safe(first.ideaSnapshot?.title||first.campaign||'')+'</div></div><span class="sales-image-pill '+(first.ready?'ok':'warn')+'">'+Math.round(Number(p.progress||0))+'%</span></div><div class="sales-image-progress"><span style="width:'+Math.max(4,Math.min(100,Number(p.progress||10)))+'%"></span></div>'+salesImageQaPills(first)+(idea.reason?'<div class="sales-image-card-meta" style="margin-top:8px"><b>AI Idea Reviewer:</b> '+safe(idea.reason)+'</div>':'')+'</div>'}else if(busy){const phase=String(g.activityPhase||'OPPORTUNITY'),stage=phase==='IDEA_REVIEW'?'IDEA_REVIEW':phase==='GENERATING_3_IMAGES'?'GENERATING_3_IMAGES':'OPPORTUNITY',label=phase==='IDEA_REVIEW'?'AI Idea Reviewer đang duyệt ý tưởng':phase==='CONTENT_QA'?'AI đang kiểm caption / fact trước khi tạo ảnh':phase==='GENERATING_3_IMAGES'?'Đang chuyển sang Image Creator':'AI đang quét cơ hội / ghép 3 SKU',pct=phase==='IDEA_REVIEW'?22:phase==='CONTENT_QA'?30:phase==='GENERATING_3_IMAGES'?38:14;salesImageSetStagebar(stage);current.innerHTML='<div class="sales-image-progress-card"><div class="sales-image-progress-head"><div><h4>'+safe(label)+'</h4><div class="sales-image-card-meta">Dây chuyền đang chạy nền; campaign record sẽ xuất hiện ngay khi qua gate ý tưởng.</div></div><span class="sales-image-pill warn">ĐANG CHẠY</span></div><div class="sales-image-progress"><span style="width:'+pct+'%"></span></div></div>'}else{salesImageSetStagebar('OPPORTUNITY');current.innerHTML='<div class="empty">Chưa có campaign đang chạy. Full Auto sẽ tự tạo khi tới chu kỳ kế tiếp.</div>'}if(live)live.innerHTML=rows.length?rows.slice(0,8).map(salesImageRenderCard).join(''):'<div class="empty">Chưa có bài đang chuẩn bị/READY.</div>';if(recent){const history=Array.isArray(g.history)?g.history:[],reviews=Array.isArray(g.reviewQueue)?g.reviewQueue:[],items=[...history.slice(0,8).map(x=>({kind:'history',x})),...reviews.slice(0,6).map(x=>({kind:'review',x}))].sort((a,b)=>new Date(b.x.publishedAt||b.x.at||b.x.dueAt||0)-new Date(a.x.publishedAt||a.x.at||a.x.dueAt||0)).slice(0,12);recent.innerHTML=items.length?items.map(({kind,x})=>{const isPub=String(x.status||'')==='published',bad=kind==='review'||['failed','needs_attention','stock-review','media-review','prep-review','content-review','idea-review'].includes(String(x.status||''));return '<div class="sales-image-recent-row"><b>'+safe(String(x.platform||'AUTO').toUpperCase())+' · '+safe(Array.isArray(x.skus)&&x.skus.length?x.skus.join(' · '):(x.sku||x.name||''))+'</b><small>'+safe(dateTime(x.publishedAt||x.at||x.dueAt))+' · '+safe(isPub?'PUBLISHED':bad?'REVIEW':x.status||'')+(x.externalId?'<br>Post/Media ID: '+safe(x.externalId):'')+(x.message?'<br>'+safe(x.message):'')+'</small></div>'}).join(''):'<div class="empty">Chưa có lịch sử Auto Publish.</div>'}}

    function renderGrowthAutopilot(){const g=growthRuntime.data;if(!g)return;const s=g.settings||{};$('growth-enabled').checked=Boolean(s.enabled);$('growth-auto-market').checked=Boolean(s.autoMarket);$('growth-auto-images').checked=Boolean(s.autoImages);const pubOn=Boolean(s.enabled&&s.autoPublishPosts),pubBadge=$('growth-auto-publish-badge'),pubOnBtn=$('growth-auto-publish-on'),pubOffBtn=$('growth-auto-publish-off');if(pubBadge)pubBadge.textContent=pubOn?'ĐANG BẬT':(s.autoPublishPosts?'TẠM DỪNG · AUTOPILOT TỔNG TẮT':'ĐANG TẮT');if(pubOnBtn)pubOnBtn.disabled=pubOn;if(pubOffBtn)pubOffBtn.disabled=!Boolean(s.autoPublishPosts);$('growth-auto-comments').checked=Boolean(s.autoReplyComments);$('growth-auto-inbox').checked=Boolean(s.autoReplyInbox);$('growth-max-posts').value=Number(s.maxPostsPerDay||3);$('growth-min-gap').value=Number(s.minGapMinutes||90);$('growth-sku-cooldown').value=Number(s.recentSkuCooldownDays||7);const badge=$('growth-master-badge');if(badge)badge.textContent=s.enabled?'AUTO ĐANG BẬT':'AUTO ĐANG TẮT';const cg=g.costGuard||{},cgBox=$('growth-cost-guard');if(cgBox){const pf=g.postFormat||{};cgBox.textContent='Format · '+Number(pf.productsPerPost||3)+' SP/bài · tạo ảnh trước + kiểm giá trước publish · Cost Guard: AI reply '+Number(cg.replyToday||0)+'/'+Number(cg.replyDailyLimit||0)+' · ảnh poster '+Number(cg.imageToday||0)+'/'+Number(cg.imageDailyLimit||0)+'/ngày · ảnh lỗi chờ '+Number(cg.imageRetryHours||0)+'h.';}const scores=g.platformScores||{},care=g.care||{},scoreBox=$('growth-platform-scores');if(scoreBox){const keys=['facebook','instagram','threads','tiktok','youtube','zalo','telegram'];scoreBox.innerHTML=keys.map(k=>{const x=scores[k]||{},c=care[k]||{},ready=x.ready?'API READY':'CHƯA READY',hour=Number.isFinite(Number(x.bestHour))?' · giờ mạnh '+String(Math.round(Number(x.bestHour))).padStart(2,'0')+'h':'',careTxt=c.careReady?' · CSKH ✓':'';return '<div class="platform-card" style="padding:10px"><b>'+safe(k.toUpperCase())+'</b><div>'+safe(ready)+' · '+safe(Number(x.score||0).toFixed(0))+'/100'+safe(hour)+'</div><small>'+safe(careTxt||((['facebook','instagram','youtube'].includes(k)&&!c.careReady)?'CSKH cần cấp quyền':'') )+'</small></div>'}).join('')}renderGrowthRevenueLoop(g);renderGrowthPreparedPosts(g);
      const wd=g.watchdog||{},wdBadge=$('growth-watchdog-badge'),wdSummary=$('growth-watchdog-summary');if(wdBadge){const healthy=Boolean(wd.serverSchedulerHealthy&&wd.enabled&&wd.autoPublishPosts&&Number(wd.readyCount||0)>0);wdBadge.textContent=healthy?'AUTO READY':(!wd.enabled||!wd.autoPublishPosts?'AUTO TẮT':wd.overdueCount?'OVERDUE':'CẦN KIỂM TRA');wdBadge.style.color=healthy?'':'#a61b2b'}if(wdSummary){const tick=wd.lastTickAt?('Timer '+dateTime(wd.lastTickAt)+(wd.tickAgeSeconds!==null?' · '+Number(wd.tickAgeSeconds||0)+'s trước':'')):'Timer chưa heartbeat',next=wd.nextDue?(' · bài kế '+String(wd.nextDue.platform||'').toUpperCase()+' '+dateTime(wd.nextDue.dueAt)):' · chưa có lịch',last=wd.lastPublishStatus?(' · publish '+wd.lastPublishStatus+(wd.lastPublishMessage?' — '+wd.lastPublishMessage:'')):'';wdSummary.textContent=tick+' · API-ready '+Number(wd.readyCount||0)+next+last+(wd.overdueCount?' · QUÁ GIỜ '+Number(wd.overdueCount):'')}const review=$('growth-review-queue');if(review){const rows=Array.isArray(g.reviewQueue)?g.reviewQueue:[];review.innerHTML=rows.length?rows.slice(0,10).map(x=>'<div class="analytics-row"><b>'+safe(String(x.platform||'').toUpperCase())+' · '+safe(Array.isArray(x.skus)&&x.skus.length?x.skus.join(' · '):(x.sku||x.name||''))+'</b><small>'+safe(dateTime(x.at||x.dueAt))+' · '+safe(x.status||'review')+'<br>'+safe(x.message||x.qa?.reason||'Chưa rõ lý do')+'</small></div>').join(''):'<div class="empty">Không có bài bị chặn/Review.</div>'}const hist=$('growth-auto-history');if(hist){const rows=Array.isArray(g.history)?g.history:[];hist.innerHTML=rows.length?rows.slice(0,10).map(x=>'<div class="analytics-row"><b>'+safe(String(x.platform||'').toUpperCase())+' · '+safe(Array.isArray(x.skus)&&x.skus.length?x.skus.join(' · '):(x.sku||x.name||''))+'</b><small>'+safe(dateTime(x.publishedAt||x.at||x.dueAt))+' · '+safe(x.status||'')+(x.externalId?'<br>ID '+safe(x.externalId):'')+(x.message?'<br>'+safe(x.message):'')+'</small></div>').join(''):'<div class="empty">Chưa có lần dispatch Auto Publish.</div>'}
      const q=$('growth-queue');if(q){const rows=Array.isArray(g.queue)?g.queue:[];q.innerHTML=rows.length?rows.slice(0,10).map(x=>'<div class="analytics-row"><b>'+safe(String(x.platform||'').toUpperCase())+' · '+safe(Array.isArray(x.skus)&&x.skus.length?x.skus.join(' · '):(x.sku||x.name||''))+(x.testMode==='near-now'?' · TEST +3P':'')+'</b><small>'+safe(dateTime(x.dueAt))+' · '+safe(x.status||'scheduled')+(x.message?'<br>'+safe(x.message):'')+'</small></div>').join(''):'<div class="empty">Chưa có lịch. Bấm CHẠY 1 VÒNG hoặc bật Autopilot.</div>'}
      const h=$('growth-handoffs');if(h){const rows=Array.isArray(g.handoffs)?g.handoffs:[];h.innerHTML=rows.length?rows.slice(0,10).map(x=>'<div class="analytics-row"><b>'+safe(String(x.platform||'').toUpperCase())+' · '+safe(x.meta?.author||'Khách')+'</b><small>'+safe(x.message||'')+'<br>⚠ '+safe(x.reason||'')+'</small><button class="btn-soft" type="button" data-growth-resolve="'+safe(x.id)+'">ĐÃ XỬ LÝ</button></div>').join(''):'<div class="empty">Không có hội thoại cần bàn giao.</div>';h.querySelectorAll('[data-growth-resolve]').forEach(b=>b.onclick=()=>resolveGrowthHandoff(b.dataset.growthResolve))}
      const last=[g.lastPlanAt?'Plan '+dateTime(g.lastPlanAt):'',g.lastAnalyticsAt?'Analytics '+dateTime(g.lastAnalyticsAt):'',g.lastReplyAt?'CSKH '+dateTime(g.lastReplyAt):''].filter(Boolean).join(' · ');growthStatusText((s.enabled?'Autopilot hoạt động · Sales Studio Image Pipeline đang theo dõi CƠ HỘI→IDEA REVIEW→3 ẢNH→ART REVIEW→QA→READY→PUBLISHER→POST ID. ':'Autopilot đang OFF để tránh tự đăng trước khi ông bật. ')+(last||'Chưa chạy vòng nào.')+(g.lastError?' · Lỗi gần nhất: '+g.lastError:''),!g.lastError);renderSalesStudioImagePipeline(g)}
    let kblGrowthStatusLoadPromise=null;
    async function loadGrowthAutopilot(){
      if(kblGrowthStatusLoadPromise)return kblGrowthStatusLoadPromise;
      const badge=$('sales-image-auto-badge'),current=$('sales-image-current');
      if(badge){badge.className='sales-image-live-badge';badge.textContent='ĐANG ĐỒNG BỘ'}
      kblGrowthStatusLoadPromise=(async()=>{
        let r,d;
        try{
          const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
          try{r=await fetch('/api/admin/growth-autopilot/status',{headers:headers(false),cache:'no-store',signal:controller.signal});d=await r.json()}finally{clearTimeout(timer)}
          if(!r.ok||!d.success)throw new Error(d.message||('HTTP '+r.status+' · Không tải được Growth Autopilot'));
        }catch(e){
          const message=e&&e.name==='AbortError'?'API Growth Autopilot phản hồi quá 18 giây. Kiểm tra Primary Node/Plesk.':(e.message||'Không tải được Growth Autopilot');
          growthStatusText(message,false);
          if(badge){badge.className='sales-image-live-badge bad';badge.textContent='LỖI API'}
          if(current)current.innerHTML='<div class="sales-image-progress-card"><div class="sales-image-progress-head"><div><h4>Không đọc được backend Growth Autopilot</h4><div class="sales-image-card-meta">'+safe(message)+'</div></div><span class="sales-image-pill bad">LỖI API</span></div></div>';
          return null;
        }
        try{
          growthRuntime.data=d.growth||{};growthRuntime.platforms=d.platforms||{};renderGrowthAutopilot();return d.growth;
        }catch(e){
          const message=e&&e.message||'Lỗi render Sales Studio Image Pipeline';
          if(badge){badge.className='sales-image-live-badge bad';badge.textContent='LỖI GIAO DIỆN'}
          if(current)current.innerHTML='<div class="sales-image-progress-card"><div class="sales-image-progress-head"><div><h4>Dữ liệu backend đã về nhưng giao diện render lỗi</h4><div class="sales-image-card-meta">'+safe(message)+'</div></div><span class="sales-image-pill bad">UI ERROR</span></div></div>';
          try{console.error('[KBL Sales Studio Image Pipeline render]',e)}catch(_){}
          return d.growth||null;
        }
      })().finally(()=>{kblGrowthStatusLoadPromise=null});
      return kblGrowthStatusLoadPromise;
    }
    async function saveGrowthAutopilot(){const payload={enabled:$('growth-enabled').checked,autoMarket:$('growth-auto-market').checked,autoImages:$('growth-auto-images').checked,autoReplyComments:$('growth-auto-comments').checked,autoReplyInbox:$('growth-auto-inbox').checked,maxPostsPerDay:Number($('growth-max-posts').value||3),minGapMinutes:Number($('growth-min-gap').value||90),recentSkuCooldownDays:Number($('growth-sku-cooldown').value||7)};growthStatusText('Đang lưu cấu hình…');try{const r=await fetch('/api/admin/growth-autopilot/settings',{method:'POST',headers:headers(true),body:JSON.stringify(payload)}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không lưu được');growthRuntime.data=d.growth;renderGrowthAutopilot()}catch(e){growthStatusText(e.message,false)}}
    async function setGrowthAutoPublish(enabled){const on=Boolean(enabled),onBtn=$('growth-auto-publish-on'),offBtn=$('growth-auto-publish-off');if(onBtn)onBtn.disabled=true;if(offBtn)offBtn.disabled=true;growthStatusText(on?'Đang bật tự động đăng bài + ảnh…':'Đang tắt tự động đăng bài…');try{const r=await fetch('/api/admin/growth-autopilot/auto-publish',{method:'POST',headers:headers(true),body:JSON.stringify({enabled:on})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không đổi được chế độ Auto Publish');growthRuntime.data=d.growth||{};renderGrowthAutopilot();growthStatusText(d.message||'Đã cập nhật Auto Publish.')}catch(e){growthStatusText(e.message,false);await loadGrowthAutopilot()}finally{const s=growthRuntime.data&&growthRuntime.data.settings||{},active=Boolean(s.enabled&&s.autoPublishPosts);if(onBtn)onBtn.disabled=active;if(offBtn)offBtn.disabled=!Boolean(s.autoPublishPosts)}}
    async function runGrowthNow(){const b=$('growth-run-now');if(b)b.disabled=true;growthStatusText('Sales Studio đang quét cơ hội → chọn 3 SKU → AI duyệt ý tưởng → viết nội dung → tạo trước 3 ảnh → AI Art Director duyệt → READY TO POST…');try{const r=await fetch('/api/admin/growth-autopilot/run-now',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không chạy được');growthStatusText(d.message||'Đã chạy nền.');setTimeout(loadGrowthAutopilot,6000);setTimeout(loadGrowthAutopilot,18000)}catch(e){growthStatusText(e.message,false)}finally{if(b)b.disabled=false}}
    async function checkGrowthAuto(){const b=$('growth-auto-check');if(b)b.disabled=true;growthStatusText('Đang probe API thật từng kênh + heartbeat + materialize đúng 3 ảnh thành file static HTTPS public/uploads/studio; thao tác này KHÔNG đăng bài…');try{const r=await fetch('/api/admin/growth-autopilot/auto-check',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();const details=Array.isArray(d.reports)?d.reports.map(x=>String(x.platform||'').toUpperCase()+': '+(x.ok?'OK':'BLOCK')+' '+(x.message||'')).join(' · '):'',media=Array.isArray(d.mediaReports)?d.mediaReports.map(x=>(x.sku||'SKU')+': '+(x.ok?'STATIC OK':'STATIC BLOCK')+' '+(x.message||'')).join(' · '):'';if(!r.ok||!d.success)throw new Error((d.message||'Auto chưa ready')+(details?' · '+details:'')+(media?' · '+media:''));growthStatusText((d.message||'AUTO READY E2E')+(details?' · '+details:'')+(media?' · '+media:''));await loadGrowthAutopilot()}catch(e){growthStatusText(e.message,false);await loadGrowthAutopilot()}finally{if(b)b.disabled=false}}
    async function testGrowthBanana(){const b=$('growth-banana-test');if(b)b.disabled=true;growthStatusText('Đang gọi Gemini/Nano Banana bằng 1 SKU thật, tạo poster nhung đỏ 4:5 rồi lưu thành URL static HTTPS. Test này CÓ dùng 1 lượt tạo ảnh AI…');try{const r=await fetch('/api/admin/growth-autopilot/banana-test',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error((d.message||'Nano Banana test thất bại')+(Array.isArray(d.errors)&&d.errors.length?' · '+d.errors.join(' | '):''));growthStatusText('🍌 NANO BANANA OK · '+(d.sku||'')+' · '+(d.model||'')+' · '+(d.api||'')+' · STATIC HTTPS OK: '+(d.url||''));if(d.url)window.open(d.url,'_blank','noopener');await loadGrowthAutopilot()}catch(e){growthStatusText(e.message,false);await loadGrowthAutopilot()}finally{if(b)b.disabled=false}}
    async function testGrowthMediaUpload(){const b=$('growth-media-upload-test');if(b)b.disabled=true;growthStatusText('Đang test upload thật nhưng KHÔNG public: materialize ảnh → Facebook /photos published=false → nhận Photo ID → xóa ảnh nháp…');try{const r=await fetch('/api/admin/growth-autopilot/test-media-upload',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Test tải ảnh Meta thất bại');growthStatusText('📤 UPLOAD ROUTE OK · '+(d.message||'Facebook đã lấy được ảnh static HTTPS.'))}catch(e){growthStatusText(e.message,false)}finally{if(b)b.disabled=false}}
    async function publishGrowthTestNow(){const b=$('growth-test-now');if(b)b.disabled=true;growthStatusText('Đang ĐĂNG TEST THẬT NGAY bằng 3 ảnh sản phẩm sạch để chứng minh Router → Publisher → API → Post ID. Đây là bài thật trên mạng xã hội…');try{const r=await fetch('/api/admin/growth-autopilot/test-publish-now',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không dispatch được bài test thật');growthRuntime.data=d.growth||growthRuntime.data;renderGrowthAutopilot();growthStatusText(d.message||'Đã dispatch bài test thật.');[5000,15000,30000,60000,120000].forEach(ms=>setTimeout(loadGrowthAutopilot,ms))}catch(e){growthStatusText(e.message,false);await loadGrowthAutopilot()}finally{if(b)b.disabled=false}}
    async function scheduleGrowthNearTest(){const b=$('growth-test-near');if(b)b.disabled=true;growthStatusText('Đang kéo đúng 1 bài API-ready gần nhất về +3 phút để test pipeline thật…');try{const r=await fetch('/api/admin/growth-autopilot/test-schedule',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không lên lịch test được');growthStatusText((d.message||'Đã lên lịch test.')+' Mốc mới: '+dateTime(d.newDueAt));growthRuntime.data=d.growth||growthRuntime.data;renderGrowthAutopilot();[30000,90000,180000,240000,330000].forEach(ms=>setTimeout(loadGrowthAutopilot,ms))}catch(e){growthStatusText(e.message,false);await loadGrowthAutopilot()}finally{if(b)b.disabled=false}}
    async function syncGrowthAnalytics(){growthStatusText('Đang đồng bộ số liệu nền tảng…');try{const r=await fetch('/api/admin/growth-autopilot/analytics',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không đồng bộ được');growthStatusText(d.message||'Đang chạy nền.');setTimeout(loadGrowthAutopilot,7000)}catch(e){growthStatusText(e.message,false)}}
    async function connectGrowthCare(platform){try{const r=await fetch('/api/admin/growth-autopilot/care-connect/'+encodeURIComponent(platform),{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không mở được quyền CSKH');window.open(d.url,'kbl-growth-care-'+platform,'width=760,height=850')}catch(e){growthStatusText(e.message,false)}}
    async function resolveGrowthHandoff(id){try{const r=await fetch('/api/admin/growth-autopilot/handoff/'+encodeURIComponent(id)+'/resolve',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không cập nhật được');growthRuntime.data=d.growth;renderGrowthAutopilot()}catch(e){growthStatusText(e.message,false)}}

    async function loadLiveQueue(){
      try{const r=await fetch('/api/admin/live/queue',{headers:headers(false),cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error();liveRuntime.queue=d.queue||[];liveRuntime.index=Math.min(liveRuntime.index,Math.max(0,liveRuntime.queue.length-1));renderLiveQueue();refreshLiveProductOptions()}catch(_){renderLiveQueue()}
    }
    function renderLiveQueue(){
      const box=$('live-queue');if(!box)return;const q=liveRuntime.queue;if(!q.length){box.innerHTML='<div class="empty">Chưa có sản phẩm trong Live.</div>';renderLiveStage();return}
      box.innerHTML=q.map((p,i)=>{const m=p.contentManifest||{},media=m.media||{},img=media.displayImage||p.displayImage||(isPublished(p)?p.image:'')||'';return '<div class="live-row" data-live-index="'+i+'">'+(img?'<img src="'+safe(img)+'" alt="">':'<div></div>')+'<div><b>'+(i+1)+'. '+safe(p.sku)+' · '+safe(p.displayName||p.name)+'</b><small>'+safe(p.goldCode)+' · '+safe(goldWeight(p.weightChi))+' chỉ · '+money(p.referencePrice)+'</small></div><div class="live-row-actions"><button data-live-open="'+i+'">XEM</button><button class="btn-soft" data-live-up="'+i+'">↑</button><button class="btn-soft" data-live-down="'+i+'">↓</button><button class="btn-danger" data-live-remove="'+safe(p.id)+'">×</button></div></div>'}).join('');
      box.querySelectorAll('[data-live-open]').forEach(b=>b.onclick=()=>{liveRuntime.index=Number(b.dataset.liveOpen)||0;renderLiveStage()});
      box.querySelectorAll('[data-live-up]').forEach(b=>b.onclick=()=>moveLiveItem(Number(b.dataset.liveUp),-1));
      box.querySelectorAll('[data-live-down]').forEach(b=>b.onclick=()=>moveLiveItem(Number(b.dataset.liveDown),1));
      box.querySelectorAll('[data-live-remove]').forEach(b=>b.onclick=()=>removeLiveProduct(b.dataset.liveRemove));
      renderLiveStage();
    }
    function renderLiveStage(){
      const q=liveRuntime.queue,p=q[liveRuntime.index]||null;if($('live-position'))$('live-position').textContent=p?(liveRuntime.index+1)+' / '+q.length:'0 / '+q.length;
      if(!p){$('live-product-hero').innerHTML='<div></div><div class="muted">Chưa chọn sản phẩm.</div>';$('live-teleprompter').textContent='Chưa có nội dung live.';$('live-stage-meta').textContent='Chọn một món trong danh sách.';return}
      const m=p.contentManifest||{},media=m.media||{},video=media.approvedVideo||p.approvedStudioVideo||'',img=media.displayImage||p.displayImage||(isPublished(p)?p.image:'')||'',visual=video?'<video src="'+safe(video)+'" controls playsinline muted loop></video>':img?'<img src="'+safe(img)+'" alt="">':'<div></div>';
      $('live-product-hero').innerHTML=visual+'<div><h3>'+safe(p.sku)+' · '+safe(p.displayName||p.name)+'</h3><p class="muted">'+safe(p.goldCode)+' · '+safe(goldWeight(p.weightChi))+' chỉ'+(p.sizeLabel?' · '+safe(p.sizeLabel):'')+'</p><b>'+money(p.referencePrice)+'</b></div>';$('live-stage-meta').textContent='Món '+(liveRuntime.index+1)+' trong '+q.length+' · dữ liệu theo Product Manifest';$('live-teleprompter').textContent=(m.live&&m.live.script)||'Giới thiệu '+p.name+' · Mã '+p.sku+'.';
    }
    async function addLiveProduct(){
      const id=$('live-product-select')?.value;if(!id)return;const r=await fetch('/api/admin/live/toggle/'+encodeURIComponent(id),{method:'POST',headers:headers(true),body:JSON.stringify({selected:true})}),d=await r.json();if(r.ok&&d.success)await loadLiveQueue();
    }
    async function removeLiveProduct(id){const r=await fetch('/api/admin/live/toggle/'+encodeURIComponent(id),{method:'POST',headers:headers(true),body:JSON.stringify({selected:false})});if(r.ok)await loadLiveQueue()}
    async function persistLiveOrder(){const ids=liveRuntime.queue.map(p=>String(p.id));const r=await fetch('/api/admin/live/reorder',{method:'POST',headers:headers(true),body:JSON.stringify({ids})}),d=await r.json();if(r.ok&&d.success){liveRuntime.queue=d.queue||liveRuntime.queue;renderLiveQueue();refreshLiveProductOptions()}}
    async function moveLiveItem(index,delta){const next=index+delta;if(index<0||next<0||index>=liveRuntime.queue.length||next>=liveRuntime.queue.length)return;[liveRuntime.queue[index],liveRuntime.queue[next]]=[liveRuntime.queue[next],liveRuntime.queue[index]];liveRuntime.index=next;await persistLiveOrder()}
    function stepLive(delta){if(!liveRuntime.queue.length)return;liveRuntime.index=Math.max(0,Math.min(liveRuntime.queue.length-1,liveRuntime.index+delta));renderLiveStage()}

    const directorRuntime={data:null,analytics:null,master:null};
    function renderLeadRevenueBrain(lead){const d=lead&&typeof lead==='object'?lead:{};if($('lead-total'))$('lead-total').textContent=Number(d.totalLeads||0).toLocaleString('vi-VN');if($('lead-pending'))$('lead-pending').textContent=Number(d.pendingLeads||0).toLocaleString('vi-VN');if($('lead-won'))$('lead-won').textContent=Number(d.wonLeads||0).toLocaleString('vi-VN');if($('lead-rate'))$('lead-rate').textContent=(Number(d.leadRate||0)).toLocaleString('vi-VN')+'%';if($('lead-last'))$('lead-last').textContent=d.lastLeadAt?'Lead gần nhất: '+dateTime(d.lastLeadAt):'Chưa có lead';if($('lead-pipeline'))$('lead-pipeline').textContent='Pipeline '+money(Number(d.pipelineRevenue||0));if($('lead-won-revenue'))$('lead-won-revenue').textContent='Doanh thu '+money(Number(d.wonRevenue||0));if($('lead-won-rate'))$('lead-won-rate').textContent='Win rate '+(Number(d.wonRate||0)).toLocaleString('vi-VN')+'%';if($('lead-brain-score'))$('lead-brain-score').textContent=Number(d.wonRevenue||0)>0?'ĐANG MANG TIỀN VỀ':Number(d.pendingLeads||0)>0?'CÓ LEAD CHỜ CHỐT':'CẦN TĂNG CHUYỂN ĐỔI';const sources=$('lead-sources'),rows=Array.isArray(d.sources)?d.sources:[];if(sources)sources.innerHTML=rows.length?rows.map(r=>'<div class="lead-source-row"><b>'+safe(r.source||'Website')+'</b><small>30 ngày: '+Number(r.leads30||0).toLocaleString('vi-VN')+' lead · '+Number(r.won30||0).toLocaleString('vi-VN')+' đã chốt</small><small>Tổng: '+Number(r.leads||0).toLocaleString('vi-VN')+' lead · chờ '+Number(r.pending||0).toLocaleString('vi-VN')+' · pipeline '+money(Number(r.pipelineRevenue||0))+' · doanh thu ước tính '+money(Number(r.wonRevenue||0))+'</small></div>').join(''):'<div class="empty">Chưa có nguồn lead.</div>';const sug=$('lead-suggestions'),tips=Array.isArray(d.suggestions)?d.suggestions:[];if(sug)sug.innerHTML=tips.length?tips.map(t=>'<div class="lead-suggestion-row"><b>'+safe(t.title||'Gợi ý')+'</b><small>'+safe(t.detail||'')+'</small></div>').join(''):'<div class="empty">Chưa có gợi ý.</div>'}
    function renderAiDirector(){const d=directorRuntime.data;if(!d)return;if($('director-mode'))$('director-mode').textContent=d.mode||'RULE ENGINE';const cfg=d.goldWatch||{};if($('gold-watch-warning'))$('gold-watch-warning').value=Number(cfg.warningThreshold||50000);if($('gold-watch-strong'))$('gold-watch-strong').value=Number(cfg.strongThreshold||150000);if($('gold-watch-cooldown'))$('gold-watch-cooldown').value=Number(cfg.cooldownMinutes||45);if($('gold-watch-telegram'))$('gold-watch-telegram').value=cfg.telegram===false?'0':'1';const box=$('director-recommendations'),recs=Array.isArray(d.recommendations)?d.recommendations:[];if(box)box.innerHTML=recs.length?recs.map(r=>'<div class="director-recommendation"><div><b>'+safe(r.title||'Đề xuất')+'</b><small>'+safe(r.reason||'')+'</small><span class="director-tag">'+(r.type==='ai-market'?'🤖 AI MARKET · '+Number(r.marketScore||0)+'/100 · ':'')+safe((r.template||'').toUpperCase())+' · '+safe(r.directorStyle||'')+'</span></div><button class="gold" type="button" data-director-use="'+safe(r.id)+'">DÙNG TRONG VIDEO</button></div>').join(''):'<div class="empty">Chưa có đề xuất nổi bật.</div>';box?.querySelectorAll('[data-director-use]').forEach(b=>b.onclick=()=>useDirectorRecommendation(b.dataset.directorUse));const gold=$('director-gold-events'),events=Array.isArray(d.recentGoldEvents)?d.recentGoldEvents:[];if(gold)gold.innerHTML=events.length?events.slice(0,6).map(e=>'<div class="gold-event '+safe(e.severity||'')+'"><div class="gold-event-head"><div><b>'+safe(e.name)+' '+(Number(e.deltaSell)>=0?'↑ ':'↓ ')+safe(Math.abs(Number(e.deltaSell||0)).toLocaleString('vi-VN'))+'đ/chỉ</b><small>'+safe(dateTime(e.at))+' · '+safe(e.source||'KBL')+'</small></div></div><div class="gold-event-actions"><button class="gold" type="button" data-gold-event-use="'+safe(e.id)+'">LẤY LÀM CONTENT</button></div></div>').join(''):'<div class="empty">Chưa có biến động vượt ngưỡng.</div>';gold?.querySelectorAll('[data-gold-event-use]').forEach(b=>b.onclick=()=>useDirectorRecommendation('gold-event:'+b.dataset.goldEventUse));renderLeadRevenueBrain(d.leadRevenue||{})}
    async function loadAiDirector(){try{const r=await fetch('/api/admin/ai-director/status',{headers:headers(false),cache:'no-store'}),d=await r.json();if(r.ok&&d.success){directorRuntime.data=d.director;renderAiDirector()}}catch(_){}}
    function masterSourceHtml(rows){return (Array.isArray(rows)?rows:[]).slice(0,3).map(x=>'<a href="'+safe(x.url||'#')+'" target="_blank" rel="noopener">'+safe(x.title||'Nguồn')+'</a>').join(' · ')}
    function renderAiMaster(){
      const m=directorRuntime.master;if(!m)return;const stats=m.lastRunStats||{},diag=Array.isArray(m.lastDiagnostics)?m.lastDiagnostics:[],progress=m.progress||{},ideas=Array.isArray(m.ideas)?m.ideas:[],watch=[...(Array.isArray(m.watchlist)?m.watchlist:[]),...(Array.isArray(m.globalRadar)?m.globalRadar:[])].filter((x,i,a)=>Number(x&&x.score||0)>=60&&a.findIndex(y=>String(y.id)===String(x.id))===i).sort((a,b)=>Number(b.score||0)-Number(a.score||0)).slice(0,8),sourceCount=Number(stats.sourceCount||0),watchCount=Number(stats.watchCount||watch.length||0);
      if($('master-status')){const label=m.busy?'AI MARKET · ĐANG QUÉT':m.scoutMode==='active'?'AI MARKET · '+sourceCount+' nguồn · '+ideas.length+' Top · '+watchCount+' Watch':m.scoutMode==='last-good'?'AI GẦN NHẤT · '+sourceCount+' nguồn · '+ideas.length+' Top · '+watchCount+' Watch':m.configured?'RULE ENGINE ONLY · CHƯA CÓ AI MARKET':'CHƯA CẤU HÌNH';$('master-status').textContent=label;$('master-status').style.background=m.busy?'#eef6ff':m.scoutMode==='active'?'#edf8f3':m.scoutMode==='last-good'?'#fff8e6':m.configured?'#fff8e6':'#fff2f2';$('master-status').style.color=m.scoutMode==='active'?'#08734d':m.busy?'#12355a':m.scoutMode==='last-good'?'#8a5a00':'#9f1d1d'}
      if($('master-last-quick'))$('master-last-quick').textContent=m.lastQuickAt?dateTime(m.lastQuickAt):'Chưa có vòng thành công';if($('master-last-deep'))$('master-last-deep').textContent=m.lastDeepAt?dateTime(m.lastDeepAt):'Chưa có vòng thành công';if($('master-idea-count'))$('master-idea-count').textContent=String(ideas.length);
      if($('master-model-status')){const a=m.geminiAuto||{},fallbacks=Array.isArray(a.fallbacks)?a.fallbacks:[],verified=a.verifiedGrounding?'✅ grounding verified':'⏳ chưa verified',when=a.lastVerifiedAt?dateTime(a.lastVerifiedAt):(a.lastCheckAt?dateTime(a.lastCheckAt):'chưa kiểm tra'),status=String(a.status||'waiting').toUpperCase();$('master-model-status').textContent='🤖 GEMINI AUTO MODEL · '+status+' · đang dùng '+safe(a.primary||'—')+' · '+verified+' · kiểm tra '+when+(fallbacks.length?' · fallback: '+fallbacks.slice(0,3).join(' → '):'')+(a.lastError?' · lỗi gần nhất: '+a.lastError:'');}
      if($('master-run-summary')){if(m.busy){$('master-run-summary').textContent='⏳ '+safe(progress.message||'AI đang nghiên cứu thị trường…')+' · '+Number(progress.percent||0)+'%';}else{const bits=[];if(stats.finishedAt)bits.push('Vòng '+String(stats.kind||'quick').toUpperCase()+' '+dateTime(stats.finishedAt));if(sourceCount||Number(stats.evidenceCount||0))bits.push(sourceCount+' nguồn thật');if(Number(stats.signalCount||0))bits.push(Number(stats.signalCount||0)+' tín hiệu');bits.push(ideas.length+' Top');bits.push(watchCount+' Watch');if(Number(stats.ideaCount||0))bits.push(Number(stats.ideaCount||0)+' idea mới');$('master-run-summary').textContent=bits.length?bits.join(' · '):(m.lastAttemptAt?'Vòng gần nhất chưa có nguồn/tín hiệu đủ điều kiện.':'Chưa chạy Market Scout.')}}
      const headlines=Array.isArray(m.headlinePool)?m.headlinePool:[],unused=Number(m.newsroom?.unusedHeadlines||0),bundleSize=Number(m.settings?.marketIntelligence?.headlineBundleSize||4);if($('master-headline-summary'))$('master-headline-summary').textContent='POOL '+unused+'/'+bundleSize+' · '+headlines.length+' tin';const hb=$('master-headlines');if(hb){hb.innerHTML=headlines.length?headlines.slice(0,12).map(h=>'<div class="master-idea" style="margin-bottom:8px"><div class="master-idea-head"><div><b>'+(h.breaking?'🔥 ':'📰 ')+safe(h.headline||'Tin thị trường')+'</b><small>'+safe(h.teaser||h.summary||'')+'</small></div><span class="master-idea-score">'+Number(h.usefulness||0)+'/100</span></div><div class="master-idea-tags"><span>Intel '+Math.round(Number(h.intelligencePriority||0))+'</span><span>Content '+Math.round(Number(h.contentPriority||0))+'</span><span>Gold '+Math.round(Number(h.goldImpact||0))+'</span><span>VN '+Math.round(Number(h.vietnamImpact||0))+'</span><span>'+(h.breaking?'BREAKING':h.factLockRequired?'RESEARCH · FACT LOCK':'FACT LOCKED')+'</span></div>'+(h.summary?'<small><b>Vì sao đáng chú ý:</b> '+safe(h.summary)+'</small>':'')+(h.sources?.length?'<div class="master-sources">Nguồn: '+masterSourceHtml(h.sources)+'</div>':'<small>⚠ Chưa ghép được nguồn trực tiếp; không cho Publish claim chắc chắn.</small>')+'<div class="master-idea-actions"><button class="gold" type="button" data-master-headline-use="'+safe(h.id)+'">🎬 LÀM VIDEO TIN NÀY</button></div></div>').join(''):'<div class="empty">Chưa có headline hữu ích. AI Market sẽ hiện ngay từ ngưỡng '+Number(m.settings?.marketIntelligence?.headlineRelevance||30)+'/100, không cần chờ Top Idea.</div>';hb.querySelectorAll('[data-master-headline-use]').forEach(b=>b.onclick=()=>useAiMarketHeadline(b.dataset.masterHeadlineUse));}
      const box=$('master-ideas');if(box)box.innerHTML=ideas.length?ideas.map(i=>'<div class="master-idea"><div class="master-idea-head"><div><b>'+safe(i.title||'Ý tưởng')+'</b><small>'+safe(i.hook||'')+'</small></div><span class="master-idea-score">'+Number(i.score||0)+'/100</span></div><small><b>Vì sao:</b> '+safe(i.whyItCanWork||i.objective||'')+'</small><small><b>Concept:</b> '+safe(i.concept||'')+'</small><div class="master-idea-tags"><span>'+safe(i.market||'VIỆT NAM')+'</span><span>'+safe(i.pattern||'creative')+'</span><span>'+safe(i.directorStyle||'viral')+'</span><span>'+Number(i.durationSeconds||20)+'s</span></div>'+(i.sources?.length?'<div class="master-sources">Nguồn: '+masterSourceHtml(i.sources)+'</div>':'')+'<div class="master-idea-actions"><button type="button" data-master-dismiss="'+safe(i.id)+'">BỎ</button><button class="gold" type="button" data-master-use="'+safe(i.id)+'">LẤY Ý TƯỞNG → PRODUCTION PACK</button></div></div>').join(''):'<div class="empty">Chưa có Top Idea đạt '+Number(m.settings?.minIdeaScore||70)+'/100. Tin hữu ích vẫn nằm ở Headline Pool phía trên để làm video ngay.</div>';box?.querySelectorAll('[data-master-use]').forEach(b=>b.onclick=()=>useAiMasterIdea(b.dataset.masterUse));box?.querySelectorAll('[data-master-dismiss]').forEach(b=>b.onclick=()=>dismissAiMasterIdea(b.dataset.masterDismiss));
      const drafts=Array.isArray(m.marketDrafts)?m.marketDrafts:[],db=$('master-drafts');if(db){db.innerHTML=drafts.length?drafts.map(d=>'<div class="master-idea"><div class="master-idea-head"><div><b>'+safe(d.title||'Bản nháp')+'</b><small>'+safe(d.hook||'')+'</small></div><span class="master-idea-score">'+Number(d.score||0)+'/100</span></div><small><b>Concept:</b> '+safe(d.concept||'')+'</small><small><b>Trạng thái:</b> '+(d.guardStatus==='ready'?'ĐÃ ĐỦ TRUTH GUARD':'RESEARCH DRAFT · FACT LOCK REQUIRED · Top '+Number(m.settings?.minIdeaScore||70))+'</small>'+(d.blockers?.length?'<small><b>Còn thiếu:</b> '+safe(d.blockers.join(' · '))+'</small>':'')+(d.sources?.length?'<div class="master-sources">Nguồn: '+masterSourceHtml(d.sources)+'</div>':'')+'<div class="master-idea-actions"><button class="gold" type="button" data-master-draft-use="'+safe(d.id)+'">LẤY DRAFT → PRODUCTION PACK</button></div></div>').join(''):'<div class="empty">Chưa tạo bản nháp. Bấm “TẠO Ý TƯỞNG TỪ KẾT QUẢ QUÉT” sau khi Scout có Candidate Pool.</div>';db.querySelectorAll('[data-master-draft-use]').forEach(b=>b.onclick=()=>useAiMasterIdea(b.dataset.masterDraftUse));}if($('master-draft-status'))$('master-draft-status').textContent=m.draftBusy?'⏳ '+safe(m.draftStatus||'Đang tạo draft…'):(m.draftStatus|| (m.lastDraftAt?'Draft gần nhất: '+dateTime(m.lastDraftAt):'Draft Watchlist không được tính là Top Idea cho tới khi đủ Truth Guard.'));
      if($('master-watch-title'))$('master-watch-title').textContent=ideas.length?'🛰 Watchlist / Radar phụ':'🛰 3 tín hiệu tốt nhất hiện tại · chưa đủ Truth Guard';const wb=$('master-watchlist');if(wb){if(watch.length)wb.innerHTML=watch.slice(0,ideas.length?8:3).map(x=>'<div class="master-watch"><b>'+safe(x.market||'WATCH')+' · '+Number(x.score||0)+'/100 · '+safe(x.title||'Tín hiệu')+'</b><small>'+safe(x.reason||x.summary||'')+'</small>'+(x.blockers?.length?'<small><b>Còn thiếu:</b> '+safe(x.blockers.join(' · '))+'</small>':'')+(Number(x.thresholdGap||0)>0?'<small>Cách Top Idea: '+Number(x.thresholdGap||0)+' điểm.</small>':'')+(x.sources?.length?'<div class="master-sources">'+masterSourceHtml(x.sources)+'</div>':'')+'</div>').join('');else{const ev=Array.isArray(m.evidence)?m.evidence.filter(x=>x&&x.available).slice(0,3):[];wb.innerHTML=ev.length?ev.map(x=>'<div class="master-watch"><b>'+safe(String(x.scope||'vi').toUpperCase())+' · bằng chứng đã đọc</b><small>'+safe(x.summary||'Scout có nguồn nhưng Vietnam Brain chưa tạo signal từ vòng này.')+'</small>'+(x.sources?.length?'<div class="master-sources">'+masterSourceHtml(x.sources)+'</div>':'')+'</div>').join(''):'<div class="empty">Chưa có tín hiệu thị trường từ 60/100 trở lên.</div>'}}
      if($('master-error')){const lastDiag=diag.length?diag[diag.length-1]:null;$('master-error').textContent=m.busy?'⏳ '+(progress.message||'AI đang nghiên cứu…'):m.lastError?'❌ '+m.lastError+(m.lastSuccessAt?' · Kết quả tốt gần nhất vẫn được giữ.':''):(lastDiag&&lastDiag.status==='error'?'❌ '+lastDiag.stage+': '+lastDiag.detail:'')}
    }
    async function loadAiMaster(){try{const r=await fetch('/api/admin/ai-master/status',{headers:headers(false),cache:'no-store'}),d=await r.json();if(r.ok&&d.success){directorRuntime.master=d.master;renderAiMaster();return d.master}throw new Error(d.message||'Không đọc được AI Master')}catch(e){if($('master-error'))$('master-error').textContent='❌ Không tải được AI Master: '+e.message;return null}}
    async function refreshDirectorAll(){const b=$('director-refresh'),old=b?.textContent;if(b){b.disabled=true;b.textContent='↻ ĐANG LÀM MỚI…'}try{const r=await fetch('/api/admin/ai-director/refresh',{method:'POST',headers:headers(true),body:'{}',cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tính lại được AI Director');directorRuntime.data=d.director;directorRuntime.master=d.master;renderAiDirector();renderAiMaster();await loadContentAnalytics();if(b)b.textContent='✓ ĐÃ LÀM MỚI '+new Date().toLocaleTimeString('vi-VN')}catch(e){if(b)b.textContent='❌ LỖI LÀM MỚI';if($('master-error'))$('master-error').textContent='❌ '+e.message}finally{setTimeout(()=>{if(b){b.disabled=false;b.textContent=old||'↻ LÀM MỚI NỘI BỘ'}},1400)}}
    async function refreshGeminiAutoModel(){const b=$('master-model-refresh'),old=b?.textContent;if(b){b.disabled=true;b.textContent='🤖 ĐANG HỎI GOOGLE…'}if($('master-model-status'))$('master-model-status').textContent='⏳ Đang lấy danh sách model từ Gemini Models API và probe Google Search grounding…';try{const r=await fetch('/api/admin/ai-master/model-refresh',{method:'POST',headers:headers(true),body:'{}',cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không kiểm tra được model Gemini');directorRuntime.master=d.state;renderAiMaster();if($('master-error'))$('master-error').textContent=d.model?.verifiedGrounding?'✅ Gemini Auto Model đã xác minh '+safe(d.model.primary||'')+' bằng Google Search grounding.':'⚠️ Chưa xác minh được model mới; vẫn giữ model an toàn gần nhất.';}catch(e){if($('master-error'))$('master-error').textContent='❌ Gemini Auto Model: '+e.message;await loadAiMaster()}finally{if(b){b.disabled=false;b.textContent=old||'🤖 KIỂM TRA MODEL'}}}
    async function waitAiMasterIdle(maxMs=12*60*1000){const started=Date.now();while(Date.now()-started<maxMs){await new Promise(resolve=>setTimeout(resolve,3000));const m=await loadAiMaster();if(m&&!m.busy)return m}return directorRuntime.master}
    async function useAiMarketHeadline(id){try{const r=await fetch('/api/admin/ai-master/headline/'+encodeURIComponent(id)+'/solo-draft',{method:'POST',headers:headers(true),body:'{}',cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tạo được video từ headline');directorRuntime.master=d.state;renderAiMaster();if(!d.draft?.id)throw new Error('Solo Draft không hợp lệ.');return useAiMasterIdea(d.draft.id)}catch(e){alert('AI Market Headline: '+e.message)}}
    let masterHeadlineReconciled=false;async function reconcileAiMarketHeadlinesOnce(){if(masterHeadlineReconciled)return;const tokenField=$('token');if(!tokenField||!tokenField.value.trim())return;masterHeadlineReconciled=true;try{const r=await fetch('/api/admin/ai-master/headlines/reconcile',{method:'POST',headers:headers(true),body:'{}',cache:'no-store'}),d=await r.json();if(r.ok&&d.success){directorRuntime.master=d.state;renderAiMaster()}}catch(_){}}
    async function generateAiMasterDrafts(){const buttons=[$('master-generate-drafts'),$('master-generate-drafts-top')].filter(Boolean),olds=buttons.map(b=>b.textContent);buttons.forEach(b=>{b.disabled=true;b.textContent='💡 ĐANG TẠO Ý TƯỞNG…'});if($('master-draft-status'))$('master-draft-status').textContent='⏳ Market Action Brain đang dùng Candidate Pool + nguồn quét thật…';try{const r=await fetch('/api/admin/ai-master/generate-drafts',{method:'POST',headers:headers(true),body:'{}',cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không xếp được Market Action Brain');directorRuntime.master=d.state;renderAiMaster();const started=Date.now();while(Date.now()-started<8*60*1000){await new Promise(resolve=>setTimeout(resolve,3000));const m=await loadAiMaster();if(m&&!m.draftBusy){if($('master-draft-status'))$('master-draft-status').textContent=m.draftStatus||'Đã xong.';return}}if($('master-draft-status'))$('master-draft-status').textContent='⏳ Draft job vẫn đang chạy nền; có thể rời tab và quay lại sau.'}catch(e){if($('master-draft-status'))$('master-draft-status').textContent='❌ '+e.message}finally{buttons.forEach((b,i)=>{b.disabled=false;b.textContent=olds[i]||'💡 TẠO Ý TƯỞNG TỪ KẾT QUẢ QUÉT'})}}
    async function runAiMasterScout(kind='quick'){
      const b=kind==='deep'?$('master-scout-deep'):$('master-scout-now'),old=b?.textContent;if(b){b.disabled=true;b.textContent=kind==='deep'?'🌍 ĐÃ XẾP QUÉT SÂU…':'🌐 ĐÃ XẾP QUÉT VIỆT NAM…'}if($('master-status'))$('master-status').textContent='AI ĐANG NGHIÊN CỨU';if($('master-error'))$('master-error').textContent='⏳ Research job chạy nền; có thể mất vài phút.';
      try{const r=await fetch('/api/admin/ai-master/scout',{method:'POST',headers:headers(true),body:JSON.stringify({kind})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Scout chưa chạy được');directorRuntime.master=d.state;renderAiMaster();const done=await waitAiMasterIdle(kind==='deep'?18*60*1000:12*60*1000);if(!done)throw new Error('Không đọc được trạng thái Scout sau khi xếp job.');if(done.busy){if($('master-error'))$('master-error').textContent='⏳ Scout vẫn đang chạy nền. Có thể rời tab; kết quả sẽ được lưu khi xong.';return}await loadAiDirector();renderAiMaster();const st=done.lastRunStats||{};if(done.lastError)throw new Error(done.lastError);if($('master-error'))$('master-error').textContent=Number(st.ideaCount||0)>0?'✅ Scout hoàn tất: '+Number(st.ideaCount||0)+' ý tưởng mới từ '+Number(st.sourceCount||0)+' nguồn đã qua Truth Guard.':Number(st.watchCount||0)>0?'ℹ️ Scout hoàn tất: '+Number(st.sourceCount||0)+' nguồn · '+Number(st.watchCount||0)+' tín hiệu ở Watchlist, chưa đủ điểm thành ý tưởng.':'ℹ️ Scout đã đọc '+Number(st.sourceCount||0)+' nguồn nhưng chưa thấy cơ hội đủ điều kiện; không sinh ý tưởng rác.'}
      catch(e){if($('master-error'))$('master-error').textContent='❌ '+e.message;await loadAiMaster()}finally{if(b){b.disabled=false;b.textContent=old|| (kind==='deep'?'🌍 QUÉT SÂU + QUỐC TẾ':'🌐 QUÉT VIỆT NAM NGAY')}}
    }
    function renderVideoMasterPack(plan){const box=$('video-master-pack'),p=plan&&plan.productionPack;if(!box)return;if(!plan?.masterCreative||!p){box.hidden=true;box.innerHTML='';return}const chars=Array.isArray(p.characters)?p.characters:[],assets=Array.isArray(p.assets)?p.assets:[],scenes=Array.isArray(p.scenes)?p.scenes:[];box.hidden=false;box.innerHTML='<h4>🧠 AI MASTER PRODUCTION PACK · '+safe(p.title||plan.title||'')+'</h4><small>Đã khóa: Veo không tự render giá/SKU/chữ kinh doanh. Product card KBL lấy snapshot thật hậu kỳ; Visual Card Director chỉ thêm headline/fact/chart/minh họa có nhãn và fallback an toàn.</small><div class="video-master-pack-grid"><div><b>Nhân vật</b><ul>'+chars.map(x=>'<li>'+safe(x.role||x.id)+' · '+safe(x.appearance||'')+'</li>').join('')+'</ul></div><div><b>Asset / ảnh nên dùng</b><ul>'+assets.map(x=>'<li>'+safe(x.purpose||x.type||'asset')+(x.sourceSku?' · '+safe(x.sourceSku):'')+(x.sourceImage?' · <span class="asset-link">'+safe(x.sourceImage)+'</span>':'')+'</li>').join('')+'</ul></div></div><small>'+scenes.length+' scene · tổng '+Number(p.totalDurationSeconds||plan.durationSeconds||0)+'s · Production engine '+safe(p.engine||'AI Master')+'. Bấm TẠO LỜI THOẠI + PROMPT VEO để đưa nguyên scene pack vào Studio.</small>'}
    async function waitMasterProductionJob(jobId){for(let i=0;i<70;i++){await new Promise(resolve=>setTimeout(resolve,3000));const r=await fetch('/api/admin/ai-master/production/'+encodeURIComponent(jobId),{headers:headers(false),cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không đọc được Production Job');if(d.job?.status==='done')return d.job;if(d.job?.status==='failed')throw new Error(d.job.error||'Production Master lỗi');if($('video-status'))$('video-status').textContent='🧠 Production Master đang viết scene / nhân vật / asset / camera / effect…'}throw new Error('Production Master chưa xong sau thời gian chờ. Job vẫn chạy nền; mở lại AI Master để kiểm tra.') }
    async function useAiMasterIdea(id){try{showAdminView('video');if($('video-status'))$('video-status').textContent='🧠 Đang xếp Production Master chạy nền…';const r=await fetch('/api/admin/ai-master/idea/'+encodeURIComponent(id)+'/production-pack',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tạo được Production Pack');const job=d.job;if(!job?.id)throw new Error('Production Job không hợp lệ.');const done=job.status==='done'?job:await waitMasterProductionJob(job.id),p=done.plan||{};videoStudioState.directorPlan=p;renderVideoMasterPack(p);if($('video-template'))$('video-template').value=p.template||'product-spotlight';updateVideoTemplateNote();if(p.template==='product-spotlight'&&p.productIds?.[0])$('video-product').value=String(p.productIds[0]);if(p.template==='product-multi')videoStudioState.multiSelectedIds=(p.productIds||[]).map(String).slice(0,3);if($('video-duration'))$('video-duration').value=String([10,20,30,40,50,60].reduce((best,x)=>Math.abs(x-Number(p.durationSeconds||20))<Math.abs(best-Number(p.durationSeconds||20))?x:best,20));if($('video-title'))$('video-title').value=p.title||p.hook||'';if($('video-director-style'))$('video-director-style').value=p.directorStyle||'viral';refreshVideoProductOptions();renderVideoMasterPack(p);$('video-status').textContent='✅ AI Master đã đưa Production Pack vào Studio. Xem nhân vật/asset ở khung vàng rồi bấm TẠO LỜI THOẠI + PROMPT VEO. Mỗi scene đã có camera, ánh sáng, edit, SFX và Truth Guard.';await checkVideoDuplicate();await loadAiMaster()}catch(e){alert('AI Master: '+e.message)}}
    async function dismissAiMasterIdea(id){try{const r=await fetch('/api/admin/ai-master/idea/'+encodeURIComponent(id)+'/dismiss',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không bỏ được');directorRuntime.master=d.master;renderAiMaster()}catch(e){alert('AI Master: '+e.message)}}
    async function saveGoldWatch(){const b=$('gold-watch-save');if(b)b.disabled=true;if($('gold-watch-status'))$('gold-watch-status').textContent='Đang lưu…';try{const payload={enabled:true,telegram:$('gold-watch-telegram')?.value!=='0',warningThreshold:Number($('gold-watch-warning')?.value||50000),strongThreshold:Number($('gold-watch-strong')?.value||150000),cooldownMinutes:Number($('gold-watch-cooldown')?.value||45)},r=await fetch('/api/admin/ai-director/settings',{method:'POST',headers:headers(true),body:JSON.stringify(payload)}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không lưu được');directorRuntime.data=d.director;renderAiDirector();$('gold-watch-status').textContent='✅ Gold Watch đã lưu. Giá vượt ngưỡng sẽ gom cảnh báo + Telegram theo cooldown.'}catch(e){$('gold-watch-status').textContent='❌ '+e.message}finally{if(b)b.disabled=false}}
    async function useDirectorRecommendation(id){if(String(id||'').startsWith('market:'))return useAiMasterIdea(String(id).slice('market:'.length));try{const r=await fetch('/api/admin/ai-director/plan',{method:'POST',headers:headers(true),body:JSON.stringify({id})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tạo được plan');const p=d.plan||{};videoStudioState.directorPlan=p;renderVideoMasterPack(p);showAdminView('video');if($('video-template'))$('video-template').value=p.template||'product-spotlight';updateVideoTemplateNote();refreshVideoProductOptions();if(p.template==='product-spotlight'&&p.productIds?.[0])$('video-product').value=String(p.productIds[0]);if(p.template==='product-multi')videoStudioState.multiSelectedIds=(p.productIds||[]).map(String).slice(0,3);if($('video-title'))$('video-title').value=p.title||p.hook||'';if($('video-director-style'))$('video-director-style').value=p.directorStyle||'viral';refreshVideoProductOptions();$('video-status').textContent='✅ AI Director đã điền Video Plan. Bấm TẠO LỜI THOẠI + PROMPT VEO để ông duyệt trước khi copy sang Gemini web.';await checkVideoDuplicate()}catch(e){alert('AI Director: '+e.message)}}
    function renderContentIntelligence(){const a=directorRuntime.analytics||{},platforms=a.platforms||{},grid=$('analytics-platform-grid');if($('analytics-last'))$('analytics-last').textContent=a.updatedAt?dateTime(a.updatedAt):'Chưa đồng bộ';if(grid){const keys=['facebook','instagram','threads','tiktok','youtube','zalo','telegram'];grid.innerHTML=keys.map(k=>{const row=platforms[k]||{},items=Array.isArray(row.items)?row.items:[],views=items.reduce((s,x)=>s+Number(x.metrics?.views||x.metrics?.analyticsViews||x.metrics?.total_video_views||0),0);return '<div class="analytics-platform '+safe(row.status||'')+'"><b>'+safe(k.toUpperCase())+'</b><span>'+safe(row.status||'chưa đồng bộ')+'</span><span>'+items.length+' bài/video · '+views.toLocaleString('vi-VN')+' view đã đọc</span>'+(row.message?'<span>'+safe(row.message)+'</span>':'')+'</div>'}).join('')}const s=a.summary||{},wins=$('analytics-wins'),issues=$('analytics-issues');if(wins)wins.innerHTML=(s.wins||[]).length?s.wins.map(x=>'<div class="analytics-row"><b>'+safe(String(x.platform||'').toUpperCase())+' · '+safe(x.title||'')+'</b><small>'+safe(x.detail||'')+'</small></div>').join(''):'<div class="empty">Chưa đủ dữ liệu.</div>';if(issues)issues.innerHTML=(s.issues||[]).length?s.issues.map(x=>'<div class="analytics-row"><b>'+safe(String(x.platform||'').toUpperCase())+' · '+safe(x.title||'')+'</b><small>'+safe(x.detail||'')+'<br><b>Đề xuất:</b> '+safe(x.recommendation||'')+'</small></div>').join(''):'<div class="empty">Chưa thấy tín hiệu cần cảnh báo.</div>'}
    async function loadContentAnalytics(){try{const r=await fetch('/api/admin/content-analytics',{headers:headers(false),cache:'no-store'}),d=await r.json();if(r.ok&&d.success){directorRuntime.analytics=d.analytics||{};renderContentIntelligence()}}catch(_){}}
    async function syncContentAnalytics(){const b=$('analytics-sync');if(b)b.disabled=true;if($('analytics-last'))$('analytics-last').textContent='Đang gọi API nền tảng…';try{const r=await fetch('/api/admin/content-analytics/sync',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không đồng bộ được');directorRuntime.analytics=d.analytics||{};renderContentIntelligence();await loadAiDirector()}catch(e){if($('analytics-last'))$('analytics-last').textContent='❌ '+e.message}finally{if(b)b.disabled=false}}

    async function restoreOriginalImage(){return kblDisplayAction(async context=>{
      if(!context.id)throw new Error('Hãy chọn sản phẩm trước.');
      const data=await kblMediaJson(await fetch('/api/admin/content/restore-original-image',{method:'POST',headers:headers(true),body:JSON.stringify({productId:context.id})}));
      kblMergeProduct(data.product,context.id);
      if(kblContentCurrent(context)){contentState.product={...data.product};contentState.assets.displayImage='';contentState.assets.displayCandidateImage=data.product.displayCandidateImage||'';contentState.displayUploadImage='';renderContentProductPreview();renderAdminProducts();await drawContentCover();kblMediaStatus(context,'✅ Đã khôi phục ảnh gốc cho '+(data.product.sku||context.id));}
      return data;
    });}
    function copyAllContent(){const bundle=[['Prompt ảnh trưng bày',$('content-display-prompt')?.value],['Kịch bản TikTok/Reel',$('content-video')?.value],['Kịch bản YouTube Shorts',$('content-youtube')?.value],['Prompt Flow 9:16',$('content-flow-prompt')?.value],['Facebook caption',$('content-facebook')?.value],['TikTok/Reel caption',$('content-tiktok')?.value],['YouTube caption',$('content-youtube-caption')?.value]].map(item=>item[1]?`=== ${item[0].toUpperCase()} ===\n${item[1]}`:'').filter(Boolean).join('\n\n');if(!bundle)return $('content-status').textContent='❌ Chưa có nội dung để sao chép.';copyTextValue(bundle).then(()=>{$('content-status').textContent='✅ Đã sao chép toàn bộ.'}).catch(error=>{$('content-status').textContent='❌ '+error.message})}
    function exportAllContent(){const p=contentActiveProduct();const bundle=[`KIM BẢO LÂM · CONTENT STUDIO V2.8.1`,p?`Sản phẩm: ${p.sku||''} · ${p.name||''}`:'','', '=== PROMPT ẢNH TRƯNG BÀY ===',$('content-display-prompt')?.value||'','', '=== KỊCH BẢN TIKTOK / REEL ===',$('content-video')?.value||'','', '=== KỊCH BẢN YOUTUBE SHORTS ===',$('content-youtube')?.value||'','', '=== PROMPT GOOGLE FLOW 9:16 ===',$('content-flow-prompt')?.value||'','', '=== FACEBOOK CAPTION ===',$('content-facebook')?.value||'','', '=== TIKTOK / REEL CAPTION ===',$('content-tiktok')?.value||'','', '=== YOUTUBE CAPTION ===',$('content-youtube-caption')?.value||''].join('\n');const blob=new Blob([bundle],{type:'text/plain;charset=utf-8'}),link=document.createElement('a'),sku=(p?.sku||'studio').replace(/[^A-Za-z0-9_-]+/g,'-');link.download='KBL-'+sku+'-ai-studio-v2.8.1.txt';link.href=URL.createObjectURL(blob);link.click();setTimeout(()=>URL.revokeObjectURL(link.href),500);$('content-status').textContent='✅ Đã export TXT.'}
    function waitEvent(target,event){return new Promise((resolve,reject)=>{const ok=()=>{cleanup();resolve()},bad=()=>{cleanup();reject(new Error('Không đọc được video.'))},cleanup=()=>{target.removeEventListener(event,ok);target.removeEventListener('error',bad)};target.addEventListener(event,ok,{once:true});target.addEventListener('error',bad,{once:true})})}
    async function extractVideoFrames(file){const url=URL.createObjectURL(file),video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='metadata';video.src=url;try{await waitEvent(video,'loadedmetadata');const duration=Math.max(.2,Number(video.duration)||1),times=[.15,.5,.85].map(r=>Math.min(duration-.05,Math.max(0,duration*r))),frames=[];for(const time of times){video.currentTime=time;await waitEvent(video,'seeked');const maxW=640,scale=Math.min(1,maxW/(video.videoWidth||maxW)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round((video.videoWidth||640)*scale));canvas.height=Math.max(1,Math.round((video.videoHeight||360)*scale));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);frames.push(canvas.toDataURL('image/jpeg',.68))}return frames}finally{URL.revokeObjectURL(url);video.removeAttribute('src')}}
    async function generateVideoCaptions(){const productId=$('content-product')?.value;if(!productId)return $('content-status').textContent='❌ Hãy chọn sản phẩm trước.';if(!contentState.videoFile)return $('content-status').textContent='❌ Hãy tải video từ Google Flow vào bước ⑤.';if(!contentState.content){const data=await buildFlowKit();if(!data)return}$('content-status').textContent='Đang trích 3 frame và nhờ Gemini viết caption…';const button=$('content-video-caption');if(button)button.disabled=true;try{const frames=await extractVideoFrames(contentState.videoFile);const response=await fetch('/api/admin/content/video-caption',{method:'POST',headers:headers(true),body:JSON.stringify({productId,tone:$('content-tone').value,campaign:$('content-campaign').value,script:$('content-video').value,frames})}),data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Không viết được caption');$('content-facebook').value=data.captions.facebookCaption||'';$('content-tiktok').value=data.captions.tiktokCaption||data.captions.reelCaption||'';$('content-youtube-caption').value=data.captions.youtubeCaption||'';$('content-engine').textContent=data.engine==='gemini-video-caption'?`Gemini Video Caption · ${data.model||''}`:'Caption local';$('content-status').textContent='✅ Đã đọc frame video và viết caption Facebook / TikTok / YouTube.'}catch(error){$('content-status').textContent='❌ '+error.message}finally{if(button)button.disabled=false}}


    async function setOrderStatus(id,status){
      const response=await fetch('/api/admin/orders/'+encodeURIComponent(id)+'/status',{method:'POST',headers:headers(true),body:JSON.stringify({status})});
      const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Không đổi được trạng thái');
    }
    async function loadOrders() {
      try {
        const response = await fetch('/api/admin/orders', { headers: headers(false), cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Không tải được yêu cầu');
        if (!data.orders.length) { $('orders').innerHTML = '<div class="empty">Chưa có yêu cầu đặt hàng, giữ mẫu, đặt lịch hoặc tin nhắn tư vấn.</div>'; return; }
        const statuses=['Chờ xác nhận','Đã xác nhận','Hoàn tất','Đã hủy','Mới','Đã liên hệ'];
        $('orders').innerHTML = '<table><thead><tr><th>Mã</th><th>Phân loại</th><th>Nguồn</th><th>Khách</th><th>SĐT</th><th>Sản phẩm / nhu cầu</th><th>Hẹn đến tiệm</th><th>Giá tạm tính</th><th>Trạng thái</th></tr></thead><tbody>' + data.orders.map((order) => {
          const isV5Checkout=order.type==='checkout'||order.source==='website-checkout-v5';
          const type = order.type === 'consultation' ? 'Tư vấn' : order.type === 'booking' ? 'Đặt lịch' : order.type === 'hold' ? 'GIỮ MẪU' : isV5Checkout ? 'CHECKOUT V5' : 'Sản phẩm';
          const product = [order.productSku, order.productName].filter(Boolean).join(' · ');
          const content = [product, order.need, order.note, order.escalationReason].filter(Boolean).join(' · ') || '—';
          const appointment=[order.date,order.time].filter(Boolean).join(' · ')||'—';
          const shippingFee = order.shippingWaived ? '<span class="shipping-badge">MIỄN SHIP</span>' : Number(order.shippingFee)>0 ? '<span class="shipping-badge">Ship '+money(order.shippingFee)+'</span>' : '';
          const quote = Number(order.quotedPrice) > 0 ? money(order.quotedPrice)+shippingFee+'<span class="profit-private">Lãi tạm tính nội bộ: '+money(order.internalEstimatedProfit||0)+' · '+safe(order.internalMarginPct||0)+'%</span>' : '—';
          const stage = order.customerStage || (order.type==='hold'?'Quan tâm':'Đang xem');
          const attr=order.attribution&&typeof order.attribution==='object'?order.attribution:{},acquisition=attr.source||(attr.lastTouch&&attr.lastTouch.source)||order.source||'Website',campaign=attr.campaign||(attr.lastTouch&&attr.lastTouch.campaign)||'';
          const opts=statuses.map(x=>'<option '+(x===order.status?'selected':'')+'>'+safe(x)+'</option>').join('');
          const statusControl=isV5Checkout?'<b>'+safe(order.status)+'</b><br><small class="customer-meta">Quản lý tại KBL V5 phía dưới</small>':'<select data-order-status="'+safe(order.id)+'" style="min-width:130px;padding:8px;border-radius:8px">'+opts+'</select>';
          return '<tr class="' + (['Mới','Chờ xác nhận'].includes(order.status) ? 'order-new' : '') + '"><td>' + safe(order.id) + '<br><small>' + safe(type) + '</small></td><td><span class="order-type">' + safe(stage) + '</span></td><td><b>'+safe(acquisition)+'</b>'+(campaign?'<br><small class="customer-meta">'+safe(campaign)+'</small>':'')+'</td><td>' + safe(order.name) + '</td><td>' + safe(order.phone) + '</td><td class="order-note">' + safe(content) + '</td><td><b>'+safe(appointment)+'</b></td><td>' + quote + '</td><td>'+statusControl+'</td></tr>';
        }).join('') + '</tbody></table>';
        $('orders').querySelectorAll('[data-order-status]').forEach(select=>select.addEventListener('change',async()=>{select.disabled=true;try{await setOrderStatus(select.dataset.orderStatus,select.value);msg('✅ Đã cập nhật trạng thái '+select.value,true);await Promise.all([loadOrders(),loadCustomers(),loadDashboard()])}catch(error){msg('❌ '+error.message,false)}finally{select.disabled=false}}));
      } catch (_) { $('orders').innerHTML = '<div class="empty">Nhập mã quản trị rồi bấm TẢI DỮ LIỆU để xem yêu cầu.</div>'; }
    }
    async function loadProductInterest(){
      try{const response=await fetch('/api/admin/product-metrics',{headers:headers(false),cache:'no-store'}),data=await response.json();if(!response.ok||!data.success)throw new Error();const rows=data.metrics||[];$('product-interest').innerHTML=rows.length?'<table><thead><tr><th>Mẫu</th><th>Lượt xem</th><th>Yêu thích</th><th>Giữ mẫu</th><th>Share hợp lệ</th><th>Lần quan tâm gần nhất</th></tr></thead><tbody>'+rows.slice(0,50).map(m=>'<tr><td><b>'+safe(m.sku||'')+'</b><br>'+safe(m.name||'')+'</td><td>'+Number(m.views||0)+'</td><td>'+Number(m.favorites||0)+'</td><td><b>'+Number(m.holds||0)+'</b></td><td>'+Number(m.shares||0)+'</td><td>'+safe(m.lastAt?dateTime(m.lastAt):'—')+'</td></tr>').join('')+'</tbody></table>':'<div class="empty">Chưa có lượt quan tâm sản phẩm từ R9.</div>'}catch(_){$('product-interest').innerHTML='<div class="empty">Không tải được số liệu quan tâm.</div>'}
    }
    async function saveCustomerCare(id,row){
      const tier=row.querySelector('[data-customer-tier]')?.value||'Mới',careNote=row.querySelector('[data-customer-note]')?.value||'';
      const response=await fetch('/api/admin/customers/'+encodeURIComponent(id)+'/care',{method:'POST',headers:headers(true),body:JSON.stringify({customerTier:tier,careNote})});const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Không lưu được ghi chú');return data;
    }
    async function loadCustomers() {
      try {
        const response = await fetch('/api/admin/customers', { headers: headers(false), cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Không tải được khách hàng');
        if (!data.customers.length) { $('customers').innerHTML = '<div class="empty">Chưa có hồ sơ khách hàng từ website.</div>'; await loadProductInterest(); return; }
        $('customers').innerHTML = '<table><thead><tr><th>Khách</th><th>Loại khách</th><th>Điểm / lãi POS</th><th>Quan tâm</th><th>Lịch sử</th><th>Giá trị hoàn tất</th><th>Ghi chú chăm sóc</th></tr></thead><tbody>' + data.customers.map((c)=>{
          const recent=(c.recentViews||[]).slice(0,3).map(p=>[p.sku,p.name].filter(Boolean).join(' · ')).join('<br>')||'—';
          const history=(c.recentProducts||[]).slice(0,3).map(p=>[p.sku,p.name,p.status].filter(Boolean).join(' · ')).join('<br>')||'—';
          const tier=c.customerTier||((c.completedOrders||0)>0?'Cũ':'Mới');
          const opts=['Mới','Cũ','VIP'].map(x=>'<option '+(x===tier?'selected':'')+'>'+x+'</option>').join('');
          const l=c.loyalty||{};return '<tr data-customer-row="'+safe(c.id)+'"><td><b>'+safe(c.name||'Khách hàng')+'</b><br>'+safe(c.phone||'')+'<br><span class="customer-meta">'+safe(c.id||'')+'</span></td><td><select data-customer-tier style="padding:8px;border-radius:8px" '+(l.vip?'disabled':'')+'>'+opts+'</select><br><span class="customer-meta">'+Number(c.favoriteCount||0)+' ❤️ · '+Number(c.interestCount||0)+' mẫu xem · '+Number((c.tryOnProducts||[]).length)+' AI</span></td><td><b>'+Number(l.points||0)+' điểm'+(l.vip?' · 👑 VIP':'')+'</b><br><span class="profit-private">Lãi POS năm: '+money(l.yearProfit||0)+' · Cộng dồn: '+money(l.lifetimeProfit||0)+'</span><span class="customer-meta">'+Number(l.yearInvoiceCount||0)+' bill năm · dư chờ điểm '+money(l.profitRemainder||0)+'</span></td><td>'+recent+'<br><span class="customer-meta">Giữ gần nhất: '+safe(c.lastHoldAt?dateTime(c.lastHoldAt):'—')+'</span></td><td>'+history+'<br><span class="customer-meta">'+Number(c.orderCount||0)+' yêu cầu · '+Number(c.completedOrders||0)+' hoàn tất</span></td><td>'+money(c.totalCompletedValue||0)+'</td><td><textarea data-customer-note rows="3" maxlength="1000" style="min-width:220px;width:100%;padding:8px;border-radius:8px">'+safe(c.careNote||'')+'</textarea><button type="button" data-customer-save="'+safe(c.id)+'" style="margin-top:6px">LƯU CHĂM SÓC</button></td></tr>';
        }).join('')+'</tbody></table>';
        $('customers').querySelectorAll('[data-customer-save]').forEach(button=>button.addEventListener('click',async()=>{const row=button.closest('[data-customer-row]');button.disabled=true;try{await saveCustomerCare(button.dataset.customerSave,row);msg('✅ Đã lưu phân loại và ghi chú khách hàng.',true)}catch(error){msg('❌ '+error.message,false)}finally{button.disabled=false}}));
        await loadProductInterest();
      } catch (_) { $('customers').innerHTML = '<div class="empty">Nhập mã quản trị rồi bấm TẢI DỮ LIỆU để xem CRM.</div>'; }
    }

    async function loadTryonAccounts(){
      try{
        const response=await fetch('/api/admin/tryon/accounts',{headers:headers(false),cache:'no-store'}),data=await response.json();
        if(!response.ok||!data.success)throw new Error(data.message||'Không tải được tài khoản Try-on');
        if(!data.accounts.length){$('tryon-accounts').innerHTML='<div class="empty">Chưa có tài khoản khách hàng.</div>';return}
        $('tryon-accounts').innerHTML='<table><thead><tr><th>Khách</th><th>Trạng thái</th><th>Premium Try-on</th><th>Lượt Share/Admin</th><th>Lần thử gần nhất</th><th>Cấp lượt</th></tr></thead><tbody>'+data.accounts.map(row=>{const u=row.user||{},c=row.customer||{},q=row.quota||{};const quotaText=q.unlimited?'👑 KHÔNG GIỚI HẠN':('Còn '+Number(q.baseRemaining||0)+' miễn phí');return '<tr><td><b>'+safe(u.name||c.name||'Khách hàng')+'</b><br><span class="customer-meta">'+safe(u.phone||c.phone||'')+'</span></td><td>'+safe(u.customerStatus||c.customerStatus||'Khách đăng ký')+(q.vip?'<br><span class="shipping-badge">VIP 25+ ĐIỂM</span>':'')+'</td><td><b>'+safe(quotaText)+'</b><br><span class="customer-meta">Đã dùng '+Number(q.freeUsed||0)+' / '+Number(q.initialFree||6)+' lượt đầu'+(q.cooldownSeconds?' · chờ '+q.cooldownSeconds+'s':'')+'</span></td><td>'+Number(q.bonusRemaining||0)+'</td><td>'+safe(c.lastTryOnAt||'—')+'</td><td><div class="product-actions"><button type="button" data-tryon-grant="1" data-user="'+safe(u.id)+'">+1</button><button type="button" data-tryon-grant="5" data-user="'+safe(u.id)+'">+5</button></div></td></tr>'}).join('')+'</tbody></table>';
        $('tryon-accounts').querySelectorAll('[data-tryon-grant]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{const response=await fetch('/api/admin/tryon/grant',{method:'POST',headers:headers(true),body:JSON.stringify({userId:button.dataset.user,add:Number(button.dataset.tryonGrant)})}),result=await response.json();if(!response.ok||!result.success)throw new Error(result.message||'Không cấp được lượt');msg('✅ '+result.message,true);await loadTryonAccounts()}catch(error){msg('❌ '+error.message,false)}finally{button.disabled=false}}));
      }catch(_){$('tryon-accounts').innerHTML='<div class="empty">Nhập mã quản trị rồi bấm TẢI DỮ LIỆU để xem lượt Premium Try-on.</div>'}
    }


    function giftPolicyFromForm(){return [
      {min:25,max:null,label:'Khách hàng VIP',gift:$('gift-25').value.trim(),benefit:'AI Try-on không giới hạn'},
      {min:15,max:24,label:'Khách hàng thân thiết',gift:$('gift-15').value.trim(),benefit:'Voucher dùng 1 lần, chỉ giảm tiền công'},
      {min:5,max:14,label:'Khách hàng đồng hành',gift:$('gift-5').value.trim(),benefit:''},
      {min:0,max:4,label:'Khách hàng mới',gift:'Chưa đạt mốc quà',benefit:''}
    ]}
    async function loadN10Settings(){const r=await fetch('/api/admin/n10/settings',{headers:headers(false),cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tải được N10 settings');const st=d.settings||{},gp=st.giftPolicy||[];$('share-reward').value=Number(st.shareRewardTryOn||3);$('share-max-day').value=Number(st.shareRewardMaxPerDay||2);$('gift-period').value=st.giftPeriodMode||'calendar-year';$('gift-25').value=(gp.find(x=>Number(x.min)===25)||{}).gift||'';$('gift-15').value=(gp.find(x=>Number(x.min)===15)||{}).gift||'';$('gift-5').value=(gp.find(x=>Number(x.min)===5)||{}).gift||''}
    async function saveN10Settings(){const r=await fetch('/api/admin/n10/settings',{method:'POST',headers:headers(true),body:JSON.stringify({shareRewardTryOn:Number($('share-reward').value||3),shareRewardMaxPerDay:Number($('share-max-day').value||2),giftPeriodMode:$('gift-period').value,giftPolicy:giftPolicyFromForm()})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không lưu được N10 settings');msg('✅ Đã lưu chính sách Share/Tri ân N10. Công thức 200.000đ lãi = 1 điểm và VIP 25 điểm vẫn khóa cố định.',true)}
    async function markGift(customerId,year){if(!window.confirm('Chỉ xác nhận sau khi nhân viên đã đối chiếu POS và thực tế trao quà. Tiếp tục?'))return;const r=await fetch('/api/admin/loyalty/gift',{method:'POST',headers:headers(true),body:JSON.stringify({customerId,year,posExportConfirmed:false})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không ghi nhận được quà');msg('✅ '+d.message,true);await loadLoyaltyReport()}
    async function loadLoyaltyReport(){try{const year=Math.max(2020,Math.min(2100,Number($('loyalty-year').value||new Date().getFullYear())));$('loyalty-year').value=year;const r=await fetch('/api/admin/loyalty/report?year='+encodeURIComponent(year),{headers:headers(false),cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tải được báo cáo điểm');const rows=d.rows||[];$('loyalty-report').innerHTML=rows.length?'<table><thead><tr><th>Khách</th><th>Điểm</th><th>Năm '+year+'</th><th>Lợi nhuận POS nội bộ</th><th>Mốc tri ân</th><th>Trạng thái quà</th></tr></thead><tbody>'+rows.map(x=>'<tr><td><b>'+safe(x.name||'Khách hàng')+'</b><br>'+safe(x.phone||'')+'</td><td><b>'+Number(x.points||0)+'</b>'+(x.vip?'<br><span class="shipping-badge">VIP · AI ∞</span>':'')+'</td><td>'+Number(x.yearPoints||0)+' điểm · '+Number(x.yearInvoiceCount||0)+' bill<br><span class="customer-meta">Doanh số '+money(x.yearSales||0)+'</span></td><td><span class="profit-private">Năm '+money(x.yearProfit||0)+'<br>Cộng dồn '+money(x.lifetimeProfit||0)+'<br>Dư chờ '+money(x.profitRemainder||0)+'</span></td><td><b>'+safe(x.giftTier?.label||'')+'</b><br><span class="customer-meta">'+safe(x.giftTier?.gift||'')+'</span></td><td>'+(x.giftRedemption?'<span class="shipping-badge">ĐÃ TRAO '+safe(dateTime(x.giftRedemption.confirmedAt))+'</span>':(Number(x.giftBasisPoints||0)>=5?'<button type="button" data-gift-customer="'+safe(x.customerId)+'">XÁC NHẬN TRAO QUÀ</button>':'Chưa đạt mốc'))+'</td></tr>').join('')+'</tbody></table>':'<div class="empty">Chưa có khách phát sinh điểm từ POS trong năm này.</div>';$('loyalty-report').querySelectorAll('[data-gift-customer]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await markGift(b.dataset.giftCustomer,year)}catch(e){msg('❌ '+e.message,false)}finally{b.disabled=false}})}catch(e){$('loyalty-report').innerHTML='<div class="empty">'+safe(e.message||'Không tải được báo cáo điểm.')+'</div>'}}

    function renderAdminProducts() {
      const query = $('product-search').value.trim().toLocaleLowerCase('vi-VN');
      const list = productState.products.filter((product) => {
        const haystack = [product.sku, product.name, product.category, product.displayCategory, displayShelfLabel(product.displayShelf), displayGoldShelfLabel(product.displayGoldShelf), product.goldCode, product.sizeLabel].filter(Boolean).join(' ').toLocaleLowerCase('vi-VN');
        return !query || haystack.includes(query);
      });
      const current = list.filter(isCurrent);
      const pending = current.filter((product) => product.status === 'available' && !isPublished(product));
      const published = current.filter((product) => isPublished(product) && product.status === 'available').slice().sort((a,b) => Number(a.displayOrder || 999999) - Number(b.displayOrder || 999999));
      const soldHistory = current.filter((product) => product.status === 'sold');
      const unavailableHistory = current.filter((product) => product.status !== 'available' && product.status !== 'sold');
      const reference = list.filter((product) => !isCurrent(product));
      $('count-pending').textContent = pending.length;
      $('count-published').textContent = published.length;
      if($('count-sold'))$('count-sold').textContent = soldHistory.length;
      if($('count-unavailable'))$('count-unavailable').textContent = unavailableHistory.length;
      $('count-reference').textContent = reference.length;
      renderPendingProductCards(pending);
      renderProductLane('products-published', published, 'Chưa có sản phẩm có sẵn nào được duyệt trưng bày.');
      renderProductLane('products-sold', soldHistory, 'Chưa có SKU nào đã bán.');
      renderProductLane('products-unavailable', unavailableHistory, 'Không có SKU nào đang chờ xử lý / không còn.');
      renderProductLane('products-reference', reference, 'Chưa có sản phẩm tham khảo / đặt hàng.');
      document.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => editProduct(productState.products.find((product) => String(product.id) === String(button.dataset.edit)))));
      document.querySelectorAll('[data-content-product]').forEach((button) => button.addEventListener('click', () => openContentStudio(button.dataset.contentProduct)));
      document.querySelectorAll('[data-source-image-file]').forEach(input=>input.addEventListener('change',()=>{const file=input.files&&input.files[0];if(file)uploadProductSourceImage(input.dataset.sourceImageFile,file)}));document.querySelectorAll('[data-ai-name-suggest]').forEach(button=>button.addEventListener('click',()=>requestProductNameSuggestions(button.dataset.aiNameSuggest)));document.querySelectorAll('[data-ai-name-choice]').forEach(button=>button.addEventListener('click',()=>applyProductDisplayName(button.dataset.aiNameChoice,decodeURIComponent(button.dataset.aiNameValue||''))));
      document.querySelectorAll('[data-source-video-file]').forEach(input=>input.addEventListener('change',()=>{const file=input.files&&input.files[0];if(file)uploadProductSourceVideo(input.dataset.sourceVideoFile,file)}));
      refreshContentProducts();
      refreshPublisherProducts();
      refreshLiveProductOptions();
      document.querySelectorAll('[data-visibility]').forEach((button) => button.addEventListener('click', async () => {
        const product = productState.products.find((item) => String(item.id) === String(button.dataset.product));
        const action = button.dataset.visibility;
        if (!product) return;
        if (action === 'published' && shelfSelectionRequired(product.displayCategory || product.category) && !product.displayShelf) {
          editProduct(product);
          msg('ℹ️ Chọn đúng Ô trưng bày chi tiết rồi bấm LƯU ẢNH & ĐƯA LÊN TRƯNG BÀY.', true);
          return;
        }
        if (action === 'published' && !window.confirm('Đưa sản phẩm [' + (product.sku || product.name) + '] lên trang trưng bày?')) return;
        if(button.disabled)return;button.disabled=true;
        try{
          const result=await kblMediaJson(await fetch('/api/admin/products/'+encodeURIComponent(product.id)+'/visibility',{method:'POST',headers:headers(true),body:JSON.stringify({publicationStatus:action})}));
          kblMergeProduct(result.product,product.id);renderAdminProducts();
          const saved=action==='published'?'Đã trưng bày ':'Đã ẩn ';msg('✅ '+saved+(product.sku||product.id),true);
          const loaded=await load();if(!loaded)msg('✅ '+saved+(product.sku||product.id)+'. ⚠️ Chưa tải lại được kho; không cần thực hiện lại.',false);
        }catch(error){msg('❌ '+kblMediaError(error),false);}finally{button.disabled=false;}
      }));
      document.querySelectorAll('[data-display-move]').forEach((button) => button.addEventListener('click', async () => {
        const product = productState.products.find((item) => String(item.id) === String(button.dataset.product));
        if (!product || button.disabled) return;
        button.disabled = true;
        try {
          const response = await fetch('/api/admin/products/' + encodeURIComponent(product.id) + '/display-order', { method:'POST', headers:headers(true), body:JSON.stringify({ move:button.dataset.displayMove }) });
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.message || 'Không đổi được thứ tự trưng bày.');
          const displayMap = new Map((result.display || []).map((row) => [String(row.id), Number(row.displayOrder || 0)]));
          productState.products.forEach((item) => { if (displayMap.has(String(item.id))) item.displayOrder = displayMap.get(String(item.id)); });
          if (result.product) kblMergeProduct(result.product, product.id);
          renderAdminProducts();
          msg('✅ Đã đổi thứ tự trưng bày ngoài website.', true);
        } catch (error) { msg('❌ ' + (error.message || 'Không đổi được thứ tự trưng bày.'), false); }
        finally { button.disabled = false; }
      }));

      document.querySelectorAll('[data-featured],[data-featured-move]').forEach((button) => button.addEventListener('click', async () => {
        const product = productState.products.find((item) => String(item.id) === String(button.dataset.product));
        if (!product) return;
        button.disabled = true;
        try {
          const payload = button.dataset.featuredMove
            ? { move: button.dataset.featuredMove }
            : { featured: button.dataset.featured === 'on' };
          const response = await fetch('/api/admin/products/' + encodeURIComponent(product.id) + '/featured', { method: 'POST', headers: headers(true), body: JSON.stringify(payload) });
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.message || 'Không cập nhật được sản phẩm nổi bật');
          const featuredMap = new Map((result.featured || []).map((row) => [String(row.id), Number(row.featuredOrder || 0)]));
          productState.products.forEach((item) => {
            const order = featuredMap.get(String(item.id)) || 0;
            item.featured = order > 0;
            item.featuredOrder = order;
          });
          msg(payload.move ? '✅ Đã đổi thứ tự sản phẩm nổi bật.' : (payload.featured ? '✅ Đã đưa sản phẩm lên khu nổi bật.' : '✅ Đã bỏ sản phẩm khỏi khu nổi bật.'), true);
          renderAdminProducts();
        } catch (error) {
          msg('❌ ' + error.message, false);
        } finally { button.disabled = false; }
      }));
      document.querySelectorAll('[data-sold]').forEach((button) => button.addEventListener('click', async () => {
        await fetch('/api/admin/products/' + encodeURIComponent(button.dataset.sold) + '/sold', { method: 'POST', headers: headers(true), body: '{}' });
        load();
      }));
      document.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
        const product = productState.products.find((item) => String(item.id) === String(button.dataset.delete));
        if (!product) return;
        const sourcePos = product.source === 'pos';
        const label = product.sku || product.name || product.id;
        const warning = sourcePos
          ? 'Xóa [' + label + '] khỏi Admin / website?\n\nDữ liệu gốc trong POS KHÔNG bị xóa. Nếu Mã SP này vẫn còn trong kho POS, lần đồng bộ kho tiếp theo có thể đưa sản phẩm trở lại Admin.'
          : 'Xóa sản phẩm tham khảo "' + product.name + '" khỏi website?';
        if (!window.confirm(warning)) return;
        button.disabled = true;
        try {
          const response = await fetch('/api/admin/products/' + encodeURIComponent(product.id), { method: 'DELETE', headers: headers(false) });
          const result = await response.json();
          if (!response.ok || !result.success) return msg('❌ ' + (result.message || 'Không xóa được sản phẩm'), false);
          if (productState.editingId === product.id) resetForm();
          msg(sourcePos ? '✅ Đã xóa bản sản phẩm này khỏi Admin / website. POS không bị thay đổi.' : '✅ Đã xóa sản phẩm tham khảo', true);
          await load();
        } finally {
          button.disabled = false;
        }
      }));
    }




    async function loadInternationalSettings(){
      try{const r=await fetch('/api/admin/international/settings',{headers:headers(false),cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tải được cấu hình quốc tế');const s=d.settings||{},c=d.credentials||{};$('intl-quote-countries').value=(s.quoteCountries||[]).join(',');$('intl-auto-pay-countries').value=(s.autoPayCountries||[]).join(',');$('intl-max-value').value=Number(s.autoMaxValueVnd||0);$('intl-duties-mode').value=s.dutiesMode||'receiver';$('intl-payment-enabled').value=s.autoPaymentEnabled?'1':'0';$('intl-origin-country').value=s.originCountry||'VN';$('intl-origin-postal').value=s.originPostal||'';$('intl-origin-city').value=s.originCity||'';$('intl-manufacture-country').value=s.defaultManufactureCountry||'VN';const fs=$('intl-fedex-status'),ps=$('intl-paypal-status'),ws=$('intl-webhook-status'),ms=$('intl-mode-status');fs.textContent='FedEx: '+(c.fedexConfigured?'ĐÃ CẤU HÌNH':'CHƯA CÓ KEY')+(c.fedexSandbox?' · SANDBOX':' · LIVE');fs.classList.toggle('ok',!!c.fedexConfigured);ps.textContent='PayPal: '+(c.paypalConfigured?'ĐÃ CẤU HÌNH':'CHƯA CÓ KEY')+(c.paypalSandbox?' · SANDBOX':' · LIVE');ps.classList.toggle('ok',!!c.paypalConfigured);ws.textContent='Webhook: '+(c.paypalWebhookConfigured?'ĐÃ CẤU HÌNH':'CHƯA CÓ ID');ws.classList.toggle('ok',!!c.paypalWebhookConfigured);ms.textContent=(c.paypalSandboxReady?'PayPal Sandbox: SẴN SÀNG · ':'')+'Auto pay: '+(s.autoPaymentEnabled?'BẬT':'TẮT')+' · '+((s.autoPayCountries||[]).length)+' quốc gia'}catch(e){if($('intl-mode-status'))$('intl-mode-status').textContent='❌ '+e.message}}
    async function saveInternationalSettings(){const payload={quoteCountries:$('intl-quote-countries').value,autoPayCountries:$('intl-auto-pay-countries').value,autoMaxValueVnd:$('intl-max-value').value,dutiesMode:$('intl-duties-mode').value,autoPaymentEnabled:$('intl-payment-enabled').value==='1',originCountry:$('intl-origin-country').value,originPostal:$('intl-origin-postal').value,originCity:$('intl-origin-city').value,defaultManufactureCountry:$('intl-manufacture-country').value};const r=await fetch('/api/admin/international/settings',{method:'POST',headers:headers(true),body:JSON.stringify(payload)}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không lưu được cấu hình quốc tế');msg('✅ Đã lưu phân luồng quốc tế. Tên/Mô tả EN vẫn tự động từ VI.',true);await loadInternationalSettings()}
    async function testInternational(kind){const endpoint=kind==='fedex'?'/api/admin/international/test-fedex':kind==='paypal'?'/api/admin/international/test-paypal':'/api/admin/international/test-fx';const r=await fetch(endpoint,{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Test thất bại');msg('✅ '+(d.message||((kind==='fx'?'VCB USD BÁN RA: '+Number(d.rate||0).toLocaleString('vi-VN')+' VND/USD':'Kết nối OK'))),true);await loadInternationalSettings()}
    async function createPayPalSandboxTest(){let popup=null;try{popup=window.open('about:blank','_blank');const r=await fetch('/api/admin/international/paypal-sandbox-test-order',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tạo được đơn PayPal Sandbox');msg('✅ '+(d.message||'Đã tạo PayPal Sandbox $1.00'),true);if(popup)popup.location.href=d.approvalUrl;else window.location.href=d.approvalUrl;await loadInternationalOrders()}catch(e){try{if(popup)popup.close()}catch(_){}throw e}}
    async function reconcileInternationalPayPal(id){const r=await fetch('/api/admin/international/orders/'+encodeURIComponent(id)+'/reconcile-paypal',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không đối chiếu được PayPal');msg('✅ '+(d.message||'Đã đối chiếu PayPal.'),true);await loadInternationalOrders()}
    async function updateInternationalOrder(id){const status=prompt('Trạng thái đơn quốc tế (giữ nguyên nếu để trống):','')||'',carrier=prompt('Hãng vận chuyển:','FedEx')||'',trackingNumber=prompt('Mã tracking:','')||'',trackingUrl=prompt('Link tracking HTTPS (nếu có):','')||'',shippingStatus=prompt('Trạng thái giao hàng:','')||'';const r=await fetch('/api/admin/international/orders/'+encodeURIComponent(id),{method:'POST',headers:headers(true),body:JSON.stringify({status,carrier,trackingNumber,trackingUrl,shippingStatus})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không cập nhật được đơn quốc tế');msg('✅ Đã cập nhật đơn quốc tế.',true);await Promise.all([loadInternationalOrders(),loadOrders(),loadDashboard()])}
    async function loadInternationalOrders(){try{const r=await fetch('/api/admin/international/orders',{headers:headers(false),cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tải được đơn quốc tế');const rows=d.orders||[];if(!rows.length){$('international-orders').innerHTML='<div class="empty">Chưa có đơn quốc tế.</div>';return}$('international-orders').innerHTML='<table><thead><tr><th>Đơn</th><th>Khách / Nơi nhận</th><th>Sản phẩm</th><th>Delivered total</th><th>Thanh toán</th><th>Tracking</th><th></th></tr></thead><tbody>'+rows.map(o=>{const q=o.internationalQuote||{},p=o.payment||{},t=o.tracking||{},items=(o.items||[]).map(x=>x.sku).join(', ')||o.productSku||'—',total=Number(q.deliveredTotalVnd||0)>0?money(q.deliveredTotalVnd):'—',pay=Number(q.payNowVnd||0)>0?money(q.payNowVnd):'—';return '<tr><td><b>'+safe(o.id)+'</b>'+(o.sandboxTest?' <span class="content-badge">SANDBOX</span>':'')+'<br><span class="kbl-intl-order-detail">'+safe(o.status||'')+'</span></td><td>'+safe(o.name||'')+'<br><span class="kbl-intl-order-detail">'+safe((o.shippingAddress&&[o.shippingAddress.city,o.shippingAddress.state,o.shippingAddress.country].filter(Boolean).join(', '))||o.location||'')+'</span></td><td>'+safe(items)+'</td><td><b>'+safe(total)+'</b><br><span class="kbl-intl-order-detail">Ship '+safe(Number(q.shippingVnd||0)>0?money(q.shippingVnd):'—')+' · Duties '+safe(Number(q.dutiesTaxesVnd||0)>0?money(q.dutiesTaxesVnd):'ước tính/chưa có')+'<br>Pay now '+safe(pay)+'</span></td><td><b>'+safe(p.provider||'PayPal')+' · '+safe(p.status||'not_started')+'</b><br><span class="kbl-intl-order-detail">'+safe(p.paypalOrderId||'')+'</span></td><td>'+safe(t.carrier||'—')+'<br><span class="kbl-intl-order-detail">'+safe(t.trackingNumber||'')+'</span></td><td><button class="btn-soft" data-intl-reconcile="'+safe(o.id)+'">ĐỐI CHIẾU PAYPAL</button> <button class="btn-soft" data-intl-order="'+safe(o.id)+'">CẬP NHẬT</button></td></tr>'}).join('')+'</tbody></table>';$('international-orders').querySelectorAll('[data-intl-order]').forEach(b=>b.onclick=()=>updateInternationalOrder(b.dataset.intlOrder).catch(e=>msg('❌ '+e.message,false)));$('international-orders').querySelectorAll('[data-intl-reconcile]').forEach(b=>b.onclick=()=>reconcileInternationalPayPal(b.dataset.intlReconcile).catch(e=>msg('❌ '+e.message,false)))}catch(e){$('international-orders').innerHTML='<div class="empty">'+safe(e.message)+'</div>'}}

    function renderPromax(p){const x=p||{},health=x.health||{},claims=(x.evidence&&x.evidence.claims)||{},policy=(x.policy&&x.policy.current)||{},att=x.attribution||{},tests=x.recommendationTests||{},cards=[['Health Monitor',Number(health.score||0)+'%',(health.warnings||[]).slice(0,2).join(' · ')||'Không có cảnh báo dữ liệu'],['Claim Expiry Guard',(claims.summary&&claims.summary.stale||0)+' stale',(claims.summary&&claims.summary.unknown||0)+' unknown · '+(claims.summary&&claims.summary.total||0)+' claim'],['Policy Version',policy.version||'—','History '+Number(x.policy&&x.policy.historyCount||0)+' version · không xóa lịch sử'],['Real AI Tests',Number(tests.counts&&tests.counts.total||0)+' test','Đúng '+Number(tests.counts&&tests.counts.foundCorrect||0)+' · Cited '+Number(tests.counts&&tests.counts.cited||0)+' · Not found '+Number(tests.counts&&tests.counts.notFound||0)],['Voice Intent',Number(x.evidence&&x.evidence.voiceIntents&&x.evidence.voiceIntents.count||0)+' câu','Near-me không tự nhận là gần nếu chưa có vị trí người dùng'],['Entity Shield','ACTIVE','Domain + phone + GEO + tax ID mạnh hơn tên gần giống'],['AI Attribution',Number(att.summary&&att.summary.leads||0)+' lead','30 ngày · chốt '+Number(att.summary&&att.summary.won||0)+' · '+money(Number(att.summary&&att.summary.wonRevenue||0))],['Evidence Hub','READY','Public machine-readable evidence + claim freshness']];const box=$('promax-health-grid');if(box)box.innerHTML=cards.map(c=>'<div class="promax-card"><b>'+safe(c[0])+' · '+safe(c[1])+'</b><small>'+safe(c[2])+'</small></div>').join('');const rows=Array.isArray(att.sources)?att.sources:[],ab=$('promax-attribution');if(ab)ab.innerHTML='<h4 style="margin:0 0 7px">AI/Search Attribution 30 ngày</h4><table><thead><tr><th>Nguồn</th><th>Views</th><th>Lead</th><th>Chốt</th><th>View→Lead</th><th>Lead→Chốt</th><th>Doanh thu</th></tr></thead><tbody>'+rows.map(r=>'<tr><td><b>'+safe(r.source)+'</b></td><td>'+Number(r.pageViews30||0).toLocaleString('vi-VN')+'</td><td>'+Number(r.leads30||0).toLocaleString('vi-VN')+'</td><td>'+Number(r.won30||0).toLocaleString('vi-VN')+'</td><td>'+Number(r.viewToLeadPct||0).toLocaleString('vi-VN')+'%</td><td>'+Number(r.leadToWonPct||0).toLocaleString('vi-VN')+'%</td><td>'+money(Number(r.wonRevenue30||0))+'</td></tr>').join('')+'</tbody></table>';const queries=Array.isArray(x.evidence&&x.evidence.voiceIntents&&x.evidence.voiceIntents.rows)?x.evidence.voiceIntents.rows:[],sel=$('promax-test-query');if(sel){const current=sel.value;sel.innerHTML='<option value="">— Chọn câu test ngắn —</option>'+queries.map(q=>'<option value="'+safe(q.id)+'">'+safe(q.query)+'</option>').join('');if(current&&queries.some(q=>q.id===current))sel.value=current}const tr=Array.isArray(tests.recent)?tests.recent:[],tb=$('promax-test-summary');if(tb)tb.innerHTML='<h4 style="margin:12px 0 7px">Kết quả test thật gần nhất</h4><table><thead><tr><th>Nền tảng</th><th>Câu hỏi</th><th>Kết quả</th><th>Thời gian</th></tr></thead><tbody>'+tr.slice(0,12).map(r=>'<tr><td><b>'+safe(r.platform)+'</b></td><td>'+safe(r.query)+'</td><td>'+safe(r.outcome)+'</td><td>'+safe(dateTime(r.testedAt))+'</td></tr>').join('')+'</tbody></table>';if($('promax-note'))$('promax-note').textContent='PROMAX '+Number(health.score||0)+'% · Policy '+safe(policy.version||'—')+' · Claim stale '+Number(claims.summary&&claims.summary.stale||0)+' · Không biến readiness/probe thành external recommendation.'}
    async function savePromaxRecommendationTest(){const qid=$('promax-test-query')?.value||'',query=$('promax-test-query')?.selectedOptions?.[0]?.textContent||'';if(!qid||!query||query.startsWith('—'))return msg('⚠️ Chọn một câu test ngắn trước.',false);const body={platform:$('promax-test-platform')?.value||'ChatGPT',queryId:qid,query,outcome:$('promax-test-outcome')?.value||'not_found',note:$('promax-test-note')?.value||''};try{const r=await fetch('/api/admin/ai-recommendation/test-result',{method:'POST',headers:headers(true),body:JSON.stringify(body)}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không ghi được kết quả');msg('✅ '+d.message,true);if($('promax-test-note'))$('promax-test-note').value='';await loadGlobalAi()}catch(e){msg('❌ '+e.message,false)}}
    async function loadGlobalAi(){
      try{
        const r=await fetch('/api/admin/global-ai/status',{headers:headers(false),cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tải được AI Global');
        const rd=d.readiness||{},score=Number(rd.score||0),counts=rd.counts||{},checks=rd.checks||{};$('global-ai-score').textContent=score+'%';$('global-ai-score-ring').style.setProperty('--global-score',Math.max(0,Math.min(100,score))+'%');$('global-ai-score-title').textContent=score>=90?'PROMAX · hạ tầng public đã rất đầy đủ':score>=70?'Đã tốt · còn vài tín hiệu cần hoàn thiện':'Còn dữ liệu công khai cần bổ sung';$('global-ai-score-note').textContent='Published '+Number(counts.published||0)+' · Feed-ready '+Number(counts.feedReady||0)+' · thiếu ảnh public '+Number(counts.missingPublicImage||0)+' · đã bridge ảnh inline '+Number(counts.bridgedInlineImages||0)+'. Điểm này đo readiness trên website, không phải thứ hạng Google/AI.';const imageAudit=rd.imageAudit||{},missingRows=Array.isArray(imageAudit.sampleMissing)?imageAudit.sampleMissing:[];if($('global-ai-image-note'))$('global-ai-image-note').textContent=Number(imageAudit.missing||0)>0?'⚠ Còn '+Number(imageAudit.missing||0)+' ảnh chưa chuẩn. Ví dụ: '+missingRows.slice(0,6).map(x=>(x.sku||'SKU')+' — '+(x.reason||'thiếu ảnh')).join(' · '):'✅ Ảnh sản phẩm đã có URL public dùng cho Product Schema / Merchant / AI feed.';
        const ea=d.entityAuthority||{},eac=ea.checks||{},eid=ea.identity||{},ex=ea.exchange&&ea.exchange.outsideExchange&&ea.exchange.outsideExchange.currentPublicAdjustments||{},nap=ea.napAudit||{},si=ea.shortIntents||{},rr=ea.recommendation||{},eaLabels={exactBrand:'Tên + canonical domain',nap:'NAP pháp lý: tên + địa chỉ + điện thoại',geoVerified:'GEO xác nhận: 10.960511, 106.749739',mapAliasLinked:'Map alias Google 33C/1 ↔ cùng GEO',aliases:'Alias Kim Bảo Lâm/Kim Bao Lam/KBL',sameAs:'SameAs mạng xã hội',geo:'Tọa độ cửa hàng',entityPage:'Entity Hub public',exchangeAeoPage:'AEO Đổi Ngang / Đổi Bù',serviceSchema:'Service + FAQ schema',knowledgeEntity:'Knowledge Hub có entity',llmsEntity:'llms có entity',sitemapEntity:'Sitemap có entity/AEO',exchangeFromPos:'Đổi bù lấy cấu hình POS động',shortIntentCount:'Short-intent ≥ 30 câu',intentEndpoint:'API public short-intent',intentPage:'Trang Hỏi nhanh public',recommendationEvidence:'Bộ bằng chứng gợi ý AI nội bộ sẵn sàng'};if($('entity-authority-signals'))$('entity-authority-signals').innerHTML=Object.entries(eaLabels).map(([k,label])=>'<div class="discovery-signal '+(eac[k]?'ok':'warn')+'"><b>'+(eac[k]?'✓ ':'⏳ ')+safe(label)+'</b><small>'+safe(k==='nap'?(eid.address||'')+' · '+(eid.phone||''):(k==='mapAliasLinked'?(eid.mapAddressAlias||'33C/1 Nguyễn Thị Tươi')+' · '+(eid.geo?Number(eid.geo.latitude).toFixed(6)+', '+Number(eid.geo.longitude).toFixed(6):'GEO chưa có'):(k==='shortIntentCount'?String(si.count||0)+' câu · '+Object.entries(si.groups||{}).map(([g,c])=>g+':'+c).join(' · '):(k==='exchangeFromPos'?(ex.source||'Chưa có nguồn'):(k==='recommendationEvidence'?(rr.externalRecommendationGuaranteed?'External confirmed':'Internal ready · external platform tự quyết định'):'')))))+'</small></div>').join('');if($('entity-authority-note'))$('entity-authority-note').textContent='Entity Authority '+Number(ea.score||0)+'% · '+safe(eid.displayName||'Kim Bảo Lâm')+' · GEO '+(nap.checks&&nap.checks.geo?'ĐÚNG':'CẦN KIỂM TRA')+' · NAP pháp lý '+(nap.allMatch?'ĐỒNG NHẤT':'CẦN KIỂM TRA')+' · Map alias '+safe(eid.mapAddressAlias||'chưa có')+' · Short-intent '+Number(si.count||0)+' câu'+(rr.internalReady?' · Recommendation evidence: READY':' · Recommendation evidence: chưa đủ')+(ex.source?' · Đổi bù động theo POS · cập nhật '+safe(ex.updatedAt||'chưa rõ'):'')+' · Không cam kết Claude/Perplexity sẽ đề xuất; nền tảng ngoài tự xếp hạng.';
        const labels={identity:'Tên/địa chỉ/điện thoại',geo:'Tọa độ cửa hàng',publishedProducts:'Sản phẩm đã duyệt',publicFeedProducts:'Sản phẩm đủ feed',productImages:'Ảnh public đầy đủ',sitemap:'Sitemap',robots:'Robots',knowledgeHub:'Knowledge Hub',llms:'llms.txt',productSchema:'Product Schema',geoAeoPages:'GEO/AEO pages',entityAuthority:'Entity Authority',exchangeAeo:'Exchange AEO',googleMerchantFeed:'Google Merchant feed',openAiCompatibleFeed:'OpenAI-compatible feed',englishMirror:'English mirror'};$('global-ai-checks').innerHTML=Object.entries(labels).map(([k,label])=>'<div class="global-ai-check '+(checks[k]?'ok':'warn')+'"><b>'+(checks[k]?'✓ ':'⚠ ')+safe(label)+'</b></div>').join('');
        renderPromax(d.promax||{});
        const fx=d.fx||{};$('global-ai-fx').textContent=fx.rate?'FX khách/web/PayPal: VCB SELL '+Number(fx.publicSellRate||fx.rate||0).toLocaleString('vi-VN')+' VND/USD · Lợi nhuận nội bộ: VCB BUY '+Number(fx.privateProfitBuyRate||0).toLocaleString('vi-VN')+' VND/USD · cập nhật '+safe(fx.updatedAt||''):'FX khách/web/PayPal: chưa lấy được Vietcombank SELL.';
        await loadGlobalDiscovery();
      }catch(e){if($('global-ai-score-note'))$('global-ai-score-note').textContent='❌ '+e.message}
    }
    async function refreshGlobalAiEnglish(){const b=$('global-ai-refresh-en');if(b)b.disabled=true;try{const r=await fetch('/api/admin/global-ai/refresh-english',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không đưa cache English vào hàng đợi');msg('✅ '+d.message,true);setTimeout(loadGlobalAi,1200)}catch(e){msg('❌ '+e.message,false)}finally{if(b)b.disabled=false}}
    async function repairGlobalAiImages(){const b=$('global-ai-repair-images');if(b)b.disabled=true;try{msg('Đang chuẩn hóa ảnh inline thành URL public ổn định cho feed…',true);const r=await fetch('/api/admin/global-ai/repair-images',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không chuẩn hóa được ảnh feed');msg('✅ '+d.message,true);await loadGlobalAi()}catch(e){msg('❌ '+e.message,false)}finally{if(b)b.disabled=false}}
    function discoveryTime(v){return v?dateTime(v):'chưa thấy'}
    function renderGlobalDiscovery(d){const x=d||{},idx=x.indexNow||{},ca=x.crawlerAccess||{},obs=ca.actualObserved||{},probes=ca.probes||{},oaiProbe=probes.oai||ca.probe||{},claudeProbe=probes.claude||{},perplexityProbe=probes.perplexity||{},baseline=ca.observationBaselineAt||'',notSeen='Chưa thấy request ngoài thật'+(baseline?' từ '+discoveryTime(baseline):''),probeText=p=>p.at?(p.pass?'PASS '+discoveryTime(p.at)+' · self-probe không tính observed':'Chưa PASS '+discoveryTime(p.at)):'Chưa chạy probe',signals=[{name:'OAI robots',ok:Boolean(ca.robotsExplicitOai),text:ca.robotsExplicitOai?'Cho phép OAI-SearchBot trên public':'Cần kiểm tra robots'},{name:'OAI SAFE PROBE',ok:Boolean(oaiProbe.pass),text:probeText(oaiProbe)},{name:'OAI-SearchBot observed',ok:Boolean(obs.oaiSearchBot&&obs.oaiSearchBot.lastSeenAt),text:obs.oaiSearchBot?'Thấy ngoài thật '+discoveryTime(obs.oaiSearchBot.lastSeenAt)+' · '+Number(obs.oaiSearchBot.hits||0)+' hit':notSeen},{name:'Claude Search robots',ok:Boolean(ca.robotsExplicitClaudeSearch&&ca.robotsExplicitClaudeUser),text:ca.robotsExplicitClaudeSearch?'Cho phép Claude-SearchBot + Claude-User trên public':'Cần kiểm tra robots Claude'},{name:'Claude SAFE PROBE',ok:Boolean(claudeProbe.pass),text:probeText(claudeProbe)},{name:'Claude-SearchBot observed',ok:Boolean(obs.claudeSearchBot&&obs.claudeSearchBot.lastSeenAt),text:obs.claudeSearchBot?'Thấy ngoài thật '+discoveryTime(obs.claudeSearchBot.lastSeenAt)+' · '+Number(obs.claudeSearchBot.hits||0)+' hit':notSeen},{name:'Claude-User observed',ok:Boolean(obs.claudeUser&&obs.claudeUser.lastSeenAt),text:obs.claudeUser?'User fetch ngoài thật '+discoveryTime(obs.claudeUser.lastSeenAt):notSeen},{name:'ClaudeBot (training)',ok:Boolean(obs.claudeBot&&obs.claudeBot.lastSeenAt),text:obs.claudeBot?'Thấy crawler model-dev '+discoveryTime(obs.claudeBot.lastSeenAt)+' · không đồng nghĩa Claude Search':notSeen},{name:'Perplexity robots',ok:Boolean(ca.robotsExplicitPerplexity),text:ca.robotsExplicitPerplexity?'Cho phép PerplexityBot trên public':'Cần kiểm tra robots Perplexity'},{name:'Perplexity SAFE PROBE',ok:Boolean(perplexityProbe.pass),text:probeText(perplexityProbe)},{name:'PerplexityBot observed',ok:Boolean(obs.perplexityBot&&obs.perplexityBot.lastSeenAt),text:obs.perplexityBot?'Thấy ngoài thật '+discoveryTime(obs.perplexityBot.lastSeenAt)+' · '+Number(obs.perplexityBot.hits||0)+' hit':notSeen},{name:'Perplexity-User observed',ok:Boolean(obs.perplexityUser&&obs.perplexityUser.lastSeenAt),text:obs.perplexityUser?'User fetch ngoài thật '+discoveryTime(obs.perplexityUser.lastSeenAt):notSeen},{name:'Bingbot observed',ok:Boolean(obs.bingbot&&obs.bingbot.lastSeenAt),text:obs.bingbot?'Thấy ngoài thật '+discoveryTime(obs.bingbot.lastSeenAt):notSeen},{name:'Googlebot observed',ok:Boolean(obs.googlebot&&obs.googlebot.lastSeenAt),text:obs.googlebot?'Thấy ngoài thật '+discoveryTime(obs.googlebot.lastSeenAt):notSeen},{name:'IndexNow',ok:Boolean(idx.lastSuccessAt),text:idx.lastSuccessAt?'Accepted '+discoveryTime(idx.lastSuccessAt)+' · '+Number(idx.lastCount||0)+' URL':(idx.lastAttemptAt?('Chưa accepted · HTTP '+Number(idx.lastStatus||0)+(idx.lastError?' · '+idx.lastError:'')+' · '+discoveryTime(idx.lastAttemptAt)):'Chưa gửi · server tự bootstrap sau khoảng 8 giây')},{name:'IndexNow key',ok:Boolean(idx.configured),text:idx.configured?'Key location public đã sẵn sàng':'Chưa có key'}];const box=$('discovery-signals');if(box)box.innerHTML=signals.map(s=>'<div class="discovery-signal '+(s.ok?'ok':'warn')+'"><b>'+(s.ok?'✓ ':'⏳ ')+safe(s.name)+'</b><small>'+safe(s.text)+'</small></div>').join('');const rows=Array.isArray(x.referrals)?x.referrals:[],ref=$('discovery-referrals');if(ref)ref.innerHTML='<h4 style="margin:0 0 7px">AI/Search referral 30 ngày → lead → doanh thu</h4><table><thead><tr><th>Nguồn</th><th>Page views</th><th>Lead</th><th>Đã chốt</th><th>View→Lead</th><th>Lead→Chốt</th><th>Doanh thu</th></tr></thead><tbody>'+rows.map(r=>'<tr><td><b>'+safe(r.source)+'</b></td><td>'+Number(r.pageViews30||0).toLocaleString('vi-VN')+'</td><td>'+Number(r.leads30||0).toLocaleString('vi-VN')+'</td><td>'+Number(r.won30||0).toLocaleString('vi-VN')+'</td><td>'+Number(r.viewToLeadPct||0).toLocaleString('vi-VN')+'%</td><td>'+Number(r.leadToWonPct||0).toLocaleString('vi-VN')+'%</td><td>'+money(Number(r.wonRevenue30||0))+'</td></tr>').join('')+'</tbody></table>';const s=x.setup||{},pairs=[['setup-bing-webmaster','bingWebmasterVerified'],['setup-bing-sitemap','bingSitemapSubmitted'],['setup-bing-places','bingPlacesVerified'],['setup-google-search','googleSearchConsoleVerified'],['setup-google-business','googleBusinessVerified'],['setup-google-merchant','googleMerchantRegistered'],['setup-openai-merchant','openAiMerchantRegistered']];pairs.forEach(([id,key])=>{if($(id))$(id).checked=Boolean(s[key])});if($('discovery-note'))$('discovery-note').textContent='Website readiness '+Number(x.websiteReadiness&&x.websiteReadiness.score||0)+'% · Entity Authority '+Number(x.entityAuthority&&x.entityAuthority.score||0)+'%. Claude: SearchBot + User được tách khỏi ClaudeBot training. Perplexity: Bot + User được theo dõi riêng. SAFE PROBE bị loại khỏi observed. Baseline: '+(baseline?discoveryTime(baseline):'chưa có')+'.'}

    let promptAiAdminState=null;
    function promptMoney(v){return Math.max(0,Number(v||0)).toLocaleString('vi-VN')+'đ'}
    function renderPromptAi(data){
      promptAiAdminState=data||{};const c=data.config||{},s=data.settings||{},sum=data.summary||{},orders=Array.isArray(data.orders)?data.orders:[],accounts=Array.isArray(data.accounts)?data.accounts:[];
      if($('prompt-ai-health')){$('prompt-ai-health').textContent=(c.geminiConfigured&&c.deepseekConfigured)?'SẴN SÀNG':'THIẾU API';$('prompt-ai-health').classList.toggle('bad',!(c.geminiConfigured&&c.deepseekConfigured))}
      $('prompt-ai-revenue').textContent=promptMoney(sum.revenueVnd);$('prompt-ai-pending').textContent=sum.pendingOrders||0;$('prompt-ai-final-count').textContent=sum.finalPrompts||0;$('prompt-ai-consult-count').textContent=sum.consultCalls||0;$('prompt-ai-customer-count').textContent=accounts.length;
      const dsa=c.deepseekAutoState||{};$('prompt-ai-model-status').innerHTML=`Gemini Consultant: <b>${safe(c.geminiSelected||'—')}</b> · auto strongest: <b>${c.geminiAuto?'BẬT':'OVERRIDE'}</b> · DeepSeek Final: <b>${safe(c.deepseekModel||'—')}</b> · DeepSeek auto Flash: <b>${c.deepseekAuto?'BẬT':'TẮT'}</b> · Gemini key: <b>${c.geminiConfigured?'OK':'THIẾU'}</b> · DeepSeek key: <b>${c.deepseekConfigured?'OK':'THIẾU'}</b><br><small>Ứng viên Gemini: ${safe((c.geminiCandidates||[]).join(' → ')||'—')}<br>DeepSeek verified: ${safe((c.deepseekCandidates||[]).join(' → ')||'—')} · trạng thái: ${safe(dsa.status||'—')}${dsa.lastVerifiedAt?` · verify: ${safe(dsa.lastVerifiedAt)}`:''}${dsa.lastError?` · lỗi gần nhất: ${safe(dsa.lastError)}`:''}<br>Tư vấn miễn phí tối đa ${Number(c.consultDailyMax||0)} lần/ngày/tài khoản · Tặng mới: ${Number(c.welcomeFreeCredits||0)} Prompt/tài khoản.</small>`;
      const ps=Array.isArray(s.packages)?s.packages:[];$('prompt-bank-id').value=s.bankId||'';$('prompt-account-no').value=s.accountNo||'';$('prompt-account-name').value=s.accountName||'';
      [0,1,2].forEach((i)=>{const p=ps[i]||{};const n=i+1;$('prompt-p'+n+'-credits').value=p.credits||'';$('prompt-p'+n+'-price').value=p.priceVnd||'';$('prompt-p'+n+'-enabled').value=p.enabled===false?'0':'1'});
      $('prompt-ai-orders').innerHTML=orders.length?`<table><thead><tr><th>Khách</th><th>Gói</th><th>Thanh toán</th><th>Thông tin hóa đơn</th><th>Trạng thái</th><th>Xử lý</th></tr></thead><tbody>${orders.map(o=>{const b=o.buyer||{},inv=o.invoiceRequested?`<b>Yêu cầu hóa đơn</b><br>${safe(b.buyerType==='business'?(b.businessName||'Doanh nghiệp'):(b.fullName||''))}<br>${b.buyerType==='business'?`MST: ${safe(b.taxId||'—')}`:`CCCD: ${safe(b.personalIdMasked||'—')}${b.personalIdMasked?` <button class="btn-soft" data-prompt-id-view="${safe(o.id)}">XEM</button>`:''}`}<br>${safe(b.invoiceAddress||b.address||'')}${b.email?`<br>${safe(b.email)}`:''}`:'Không yêu cầu';const actions=o.status==='pending'?`<button class="gold" data-prompt-order="${safe(o.id)}" data-action="approve">ĐÃ NHẬN TIỀN</button> <button class="btn-danger" data-prompt-order="${safe(o.id)}" data-action="reject">CHƯA NHẬN / HỦY</button>`:(o.invoiceRequested&&o.status==='paid'?`<button class="btn-soft" data-prompt-order="${safe(o.id)}" data-action="${o.invoiceStatus==='issued'?'invoice-waiting':'invoice-issued'}">${o.invoiceStatus==='issued'?'ĐƯA LẠI CHỜ HĐ':'ĐÃ XUẤT HĐ'}</button>`:'');return `<tr><td><b>${safe(b.fullName||'—')}</b><br>${safe(b.phone||'')}<br><small>${safe(b.address||'')}</small></td><td>${Number(o.credits||0).toLocaleString('vi-VN')} lượt<br><b>${promptMoney(o.priceVnd)}</b></td><td>Nội dung cố định:<br><b>${safe(o.transferContent||'')}</b><br><small>${safe(o.createdAt||'')}</small></td><td>${inv}</td><td><b>${safe(o.status||'')}</b><br>HĐ: ${safe(o.invoiceStatus||'none')}</td><td>${actions}</td></tr>`}).join('')}</tbody></table>`:'<div class="empty">Chưa có đơn Prompt AI.</div>';
      $('prompt-ai-orders').querySelectorAll('[data-prompt-order]').forEach(b=>b.onclick=()=>promptAiOrderAction(b.dataset.promptOrder,b.dataset.action));
      $('prompt-ai-orders').querySelectorAll('[data-prompt-id-view]').forEach(b=>b.onclick=()=>promptAiRevealPersonalId(b.dataset.promptIdView,b));
      $('prompt-ai-accounts').innerHTML=accounts.length?`<table><thead><tr><th>Khách</th><th>Hồ sơ</th><th>Lượt</th><th>Tặng ban đầu</th><th>Đã chốt</th><th>Cộng / trừ</th></tr></thead><tbody>${accounts.map(a=>`<tr><td><b>${safe(a.name||'—')}</b><br>${safe(a.phone||'')}</td><td>${safe(a.industry||'chưa cài')}<br><small>${safe(a.brand||'')}</small></td><td><b>${Number(a.credits||0).toLocaleString('vi-VN')}</b></td><td>${Number(a.welcomeFreeGranted||0).toLocaleString('vi-VN')}</td><td>${Number(a.totalFinalized||0).toLocaleString('vi-VN')}</td><td><button class="btn-soft" data-prompt-credit="${safe(a.userId)}" data-delta="100">+100</button> <button class="btn-soft" data-prompt-credit="${safe(a.userId)}" data-delta="-100">-100</button></td></tr>`).join('')}</tbody></table>`:'<div class="empty">Chưa có khách Prompt AI.</div>';
      $('prompt-ai-accounts').querySelectorAll('[data-prompt-credit]').forEach(b=>b.onclick=()=>promptAiCredit(b.dataset.promptCredit,Number(b.dataset.delta||0)));
      const ds=sum.deepseek||{},gm=sum.gemini||{};$('prompt-ai-usage').innerHTML=`<div class="v5-status-grid"><div><b>${Number(ds.inputTokens||0).toLocaleString('vi-VN')}</b><span>DeepSeek input token</span></div><div><b>${Number(ds.outputTokens||0).toLocaleString('vi-VN')}</b><span>DeepSeek output token</span></div><div><b>${Number(gm.inputTokens||0).toLocaleString('vi-VN')}</b><span>Gemini input token</span></div><div><b>${Number(gm.outputTokens||0).toLocaleString('vi-VN')}</b><span>Gemini output token</span></div></div><p class="muted">Chi phí tiền API không suy đoán cứng trong Admin vì Gemini/DeepSeek có thể đổi giá, peak/off-peak và cache. Token thật được lưu để đối chiếu hóa đơn provider.</p>`;
    }
    async function loadPromptAi(){try{const r=await fetch('/api/admin/prompt-ai/overview',{headers:headers(false),cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tải được Prompt AI');renderPromptAi(d)}catch(e){if($('prompt-ai-model-status'))$('prompt-ai-model-status').textContent='❌ '+e.message}}
    async function savePromptAiSettings(){const old=promptAiAdminState&&promptAiAdminState.settings||{},oldPackages=Array.isArray(old.packages)?old.packages:[];const packages=[1,2,3].map((n,i)=>({id:oldPackages[i]?.id||`p${n}`,credits:Number($('prompt-p'+n+'-credits').value||0),priceVnd:Number($('prompt-p'+n+'-price').value||0),enabled:$('prompt-p'+n+'-enabled').value==='1'}));try{const r=await fetch('/api/admin/prompt-ai/settings',{method:'POST',headers:headers(true),body:JSON.stringify({bankId:$('prompt-bank-id').value,accountNo:$('prompt-account-no').value,accountName:$('prompt-account-name').value,packages})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không lưu được Prompt AI');msg('✅ '+d.message,true);await loadPromptAi()}catch(e){msg('❌ '+e.message,false)}}
    async function promptAiOrderAction(id,action){try{const r=await fetch('/api/admin/prompt-ai/orders/'+encodeURIComponent(id)+'/action',{method:'POST',headers:headers(true),body:JSON.stringify({action})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không xử lý được đơn');msg('✅ '+d.message,true);await loadPromptAi()}catch(e){msg('❌ '+e.message,false)}}
    async function promptAiCredit(userId,delta){if(!delta)return;try{const r=await fetch('/api/admin/prompt-ai/accounts/'+encodeURIComponent(userId)+'/credits',{method:'POST',headers:headers(true),body:JSON.stringify({delta})}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không cập nhật được lượt');msg('✅ '+d.message,true);await loadPromptAi()}catch(e){msg('❌ '+e.message,false)}}
    async function promptAiRevealPersonalId(orderId,button){if(!orderId)return;const original=button&&button.textContent;if(button){button.disabled=true;button.textContent='...'}try{const r=await fetch('/api/admin/prompt-ai/orders/'+encodeURIComponent(orderId)+'/personal-id',{headers:headers(false),cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không xem được CCCD');if(button){button.textContent=d.personalId;button.disabled=false}else msg('CCCD: '+d.personalId,true)}catch(e){if(button){button.disabled=false;button.textContent=original||'XEM'}msg('❌ '+e.message,false)}}
    async function refreshPromptGemini(){const b=$('prompt-ai-model-refresh');if(b)b.disabled=true;try{const r=await fetch('/api/admin/prompt-ai/gemini-refresh',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không quét được model');msg('✅ '+d.message,true);await loadPromptAi()}catch(e){msg('❌ '+e.message,false)}finally{if(b)b.disabled=false}}
    async function refreshPromptDeepSeek(){const b=$('prompt-ai-deepseek-refresh');if(b)b.disabled=true;try{const r=await fetch('/api/admin/prompt-ai/deepseek-refresh',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không quét được DeepSeek model');msg('✅ '+d.message,true);await loadPromptAi()}catch(e){msg('❌ '+e.message,false)}finally{if(b)b.disabled=false}}

    async function loadGlobalDiscovery(){try{const r=await fetch('/api/admin/global-discovery/status',{headers:headers(false),cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tải được External Discovery');renderGlobalDiscovery(d.discovery||{})}catch(e){if($('discovery-note'))$('discovery-note').textContent='❌ '+e.message}}
    async function runDiscoveryProbe(){return runDiscoveryProviderProbe('oai','discovery-probe','OAI-SearchBot')}
    async function runDiscoveryProviderProbe(provider,buttonId,label){const b=$(buttonId);if(b)b.disabled=true;try{msg('Đang SAFE PROBE '+label+' qua domain public…',true);const url=provider==='oai'?'/api/admin/global-discovery/probe':'/api/admin/global-discovery/probe/'+encodeURIComponent(provider),r=await fetch(url,{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok&&!d.probe)throw new Error(d.message||'Probe lỗi');msg((d.success?'✅ ':'⚠️ ')+(d.message||'Đã probe'),Boolean(d.success));await loadGlobalDiscovery()}catch(e){msg('❌ '+e.message,false)}finally{if(b)b.disabled=false}}
    async function pushDiscoveryIndexNow(){const b=$('discovery-indexnow');if(b)b.disabled=true;try{msg('Đang gửi sitemap + entity + toàn bộ URL sản phẩm live sang IndexNow…',true);const r=await fetch('/api/admin/global-discovery/indexnow',{method:'POST',headers:headers(true),body:'{}'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'IndexNow chưa nhận');msg('✅ '+d.message,true);await loadGlobalDiscovery()}catch(e){msg('❌ '+e.message,false);await loadGlobalDiscovery()}finally{if(b)b.disabled=false}}
    async function saveDiscoverySetup(){const body={bingWebmasterVerified:Boolean($('setup-bing-webmaster')?.checked),bingSitemapSubmitted:Boolean($('setup-bing-sitemap')?.checked),bingPlacesVerified:Boolean($('setup-bing-places')?.checked),googleSearchConsoleVerified:Boolean($('setup-google-search')?.checked),googleBusinessVerified:Boolean($('setup-google-business')?.checked),googleMerchantRegistered:Boolean($('setup-google-merchant')?.checked),openAiMerchantRegistered:Boolean($('setup-openai-merchant')?.checked)};try{const r=await fetch('/api/admin/global-discovery/setup',{method:'POST',headers:headers(true),body:JSON.stringify(body)}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không lưu được checklist');msg('✅ '+d.message,true);await loadGlobalDiscovery()}catch(e){msg('❌ '+e.message,false)}}


    let kblAdminLoadPromise = null, kblAdminBackgroundPromise = null;
    function kblLoadOtherGroups(){
      // Keep every original loader; ancillary groups must not hold the core load button.
      if(kblAdminBackgroundPromise)return kblAdminBackgroundPromise;
      const tasks=[loadOrders,loadInternationalOrders,loadCustomers,loadTryonAccounts,loadShop,loadV5,loadInternationalSettings,loadN10Settings,loadLoyaltyReport,loadAiSchool,loadVeoStatus,loadPublisherStatus,loadPublisherVideoJobs,loadLiveQueue,loadLocalAiStatus,loadVideoStudioStatus,loadAiDirector,loadAiMaster,loadContentAnalytics,loadGrowthAutopilot,loadGlobalAi,loadPromptAi];
      let next=0;const results=[];
      async function worker(){while(next<tasks.length){const i=next++;try{results[i]={status:'fulfilled',value:await tasks[i]()};}catch(reason){results[i]={status:'rejected',reason};}await new Promise(resolve=>setTimeout(resolve,0));}}
      kblAdminBackgroundPromise=Promise.all([worker(),worker()]).then(()=>results).finally(()=>{kblAdminBackgroundPromise=null;});
      return kblAdminBackgroundPromise;
    }
    function load() {
      if(kblAdminLoadPromise)return kblAdminLoadPromise;
      const button=$('load'),oldText=button.textContent;
      button.disabled=true;button.textContent='ĐANG TẢI…';button.setAttribute('aria-busy','true');
      msg('Đang tải Tổng quan và kho độc lập. Chưa thay danh sách kho cho đến khi nhận đủ dữ liệu.',true);
      // A real abort cancels the pending request/body; it does not merely hide a spinner.
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
      kblAdminLoadPromise=Promise.resolve().then(async()=>{
        const inventory=(async()=>{
          try{
            const rows=await kblReadProductPages(controller.signal,(count,total)=>msg('Đang tải kho: '+count+(Number.isFinite(total)?' / '+total:'')+' sản phẩm. Tổng quan tải riêng.',true));
            if(controller.signal.aborted)throw new DOMException('Inventory timed out','AbortError');
            productState.products=rows;renderAdminProducts();return {ok:true};
          }catch(error){return {ok:false,error};}
          finally{clearTimeout(timer);}
        })();
        // Start the overview immediately, even when the first inventory page is stalled.
        const overview=Promise.resolve().then(()=>loadDashboard()).catch(()=>false);
        const [stock,dashboard]=await Promise.all([inventory,overview]);
        if(stock.ok){
          msg(dashboard?'✅ Đã tải kho và Tổng quan. Các nhóm khác tiếp tục tải riêng.':'Đã tải kho. Tổng quan chưa tải được; xem lỗi tại mục Tổng quan.',Boolean(dashboard));
        }else{
          msg((dashboard?'Đã tải Tổng quan. ':'')+'❌ Kho chưa tải xong: '+kblMediaError(stock.error)+' Danh sách đang có được giữ nguyên.',false);
        }
        // Start optional groups only after core work; do not duplicate a running batch.
        if(stock.ok||dashboard){
          kblLoadOtherGroups();
          const salesSection=$('sales-studio-section'),imagePanel=document.querySelector('[data-sales-studio-panel="image"]');
          if(salesSection&&!salesSection.hidden&&imagePanel&&imagePanel.classList.contains('active'))loadGrowthAutopilot();
        }
        return stock.ok;
      }).catch(error=>{msg('❌ '+kblMediaError(error),false);return false;}).finally(()=>{
        clearTimeout(timer);button.disabled=false;button.textContent=oldText;button.removeAttribute('aria-busy');kblAdminLoadPromise=null;
      });
      return kblAdminLoadPromise;
    }
    async function loadV5(){
      try{const r=await fetch('/api/admin/v5/overview',{headers:headers(false),cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không tải được V5');const s=d.settings||{},rs=d.reservations||[],cs=d.checkouts||[],ws=d.warranties||[];$('v5-count-res').textContent=rs.length;$('v5-count-checkout').textContent=cs.length;$('v5-count-warranty').textContent=ws.length;$('v5-vietqr').textContent=(s.bankId&&s.accountNo)?'SẴN SÀNG':'CHƯA CẤU HÌNH';$('v5-res-min').value=s.reservationMinutes||60;$('v5-checkout-min').value=s.checkoutReservationMinutes||25;$('v5-warranty-months').value=s.warrantyMonths||12;if($('v5-w-months-manual')&&!$('v5-w-months-manual').value)$('v5-w-months-manual').value=s.warrantyMonths||12;$('v5-bank-id').value=s.bankId||'';$('v5-account-no').value=s.accountNo||'';$('v5-account-name').value=s.accountName||'';$('v5-insurance').value=s.insuranceDefault?'1':'0';
      $('v5-reservations').innerHTML=rs.length?'<table class="v5-mini-table"><thead><tr><th>SKU</th><th>Mục đích</th><th>Hết hạn</th><th>Thao tác</th></tr></thead><tbody>'+rs.map(x=>`<tr><td>${safe(x.sku||x.productId)}</td><td>${safe(x.purpose||'hold')}</td><td>${safe(dateTime(x.expiresAt))}</td><td><button data-v5-res-extend="${safe(x.id)}">+60p</button> <button class="btn-danger" data-v5-res-release="${safe(x.id)}">Giải phóng</button></td></tr>`).join('')+'</tbody></table>':'<div class="empty">Không có món nào đang bị giữ.</div>';
      $('v5-checkouts').innerHTML=cs.length?'<table class="v5-mini-table"><thead><tr><th>Mã</th><th>Khách</th><th>Tiền</th><th>Trạng thái</th><th>Giao vận</th></tr></thead><tbody>'+cs.slice(0,80).map(x=>`<tr><td><b>${safe(x.id)}</b><br><span class="customer-meta">${safe((x.items||[]).map(i=>i.sku).join(', '))}</span></td><td>${safe(x.customerName)}</td><td>${money(x.totalAmount)}</td><td>${safe(x.status)}<br><select data-v5-checkout-status="${safe(x.id)}"><option>Chờ thanh toán</option><option>Chờ xác minh</option><option>Đã thanh toán</option><option>Đã xác nhận</option><option>Đã hủy</option><option>Hết hạn</option></select></td><td><button data-v5-shipment="${safe(x.id)}">CẬP NHẬT TRACKING</button></td></tr>`).join('')+'</tbody></table>':'<div class="empty">Chưa có checkout.</div>';
      $('v5-warranties').innerHTML=ws.length?'<table class="v5-mini-table"><thead><tr><th>Phiếu</th><th>SKU</th><th>Hóa đơn</th><th>Khách / điểm</th><th>Trạng thái</th></tr></thead><tbody>'+ws.slice(0,80).map(x=>`<tr><td>${safe(x.id)}${x.url?`<br><a href="${safe(x.url)}" target="_blank" rel="noopener">MỞ QR / PHIẾU</a>`:''}</td><td>${safe(x.sku)}</td><td>${safe(x.invoiceId)}</td><td>${safe(x.customerName)}<br><b>${Number(x.loyalty?.points||0)} điểm${x.loyalty?.vip?' · VIP':''}</b></td><td>${safe(x.status)}</td></tr>`).join('')+'</tbody></table>':'<div class="empty">Chưa có phiếu bảo hành.</div>';
      $('v5-reservations').querySelectorAll('[data-v5-res-extend]').forEach(b=>b.onclick=async()=>{await fetch('/api/admin/v5/reservations/'+encodeURIComponent(b.dataset.v5ResExtend)+'/extend',{method:'POST',headers:headers(true),body:JSON.stringify({minutes:60})});loadV5()});$('v5-reservations').querySelectorAll('[data-v5-res-release]').forEach(b=>b.onclick=async()=>{await fetch('/api/admin/v5/reservations/'+encodeURIComponent(b.dataset.v5ResRelease)+'/release',{method:'POST',headers:headers(true),body:'{}'});loadV5()});$('v5-checkouts').querySelectorAll('[data-v5-checkout-status]').forEach(sel=>{const row=cs.find(x=>x.id===sel.dataset.v5CheckoutStatus);if(row)sel.value=row.status;sel.onchange=async()=>{const r=await fetch('/api/admin/v5/checkouts/'+encodeURIComponent(sel.dataset.v5CheckoutStatus)+'/status',{method:'POST',headers:headers(true),body:JSON.stringify({status:sel.value})}),d=await r.json();msg(d.success?'✅ Đã cập nhật checkout':'❌ '+(d.message||'Lỗi'),d.success);loadV5()}});$('v5-checkouts').querySelectorAll('[data-v5-shipment]').forEach(b=>b.onclick=async()=>{const carrier=prompt('Hãng vận chuyển (VD: GHN, Viettel Post):','')||'',slug=prompt('Mã hãng cho AfterShip nếu có (VD: ghn, viettel-post):','')||'',trackingNumber=prompt('Mã tracking:','')||'',status=prompt('Trạng thái giao hàng:','Chờ bàn giao')||'',expectedDelivery=prompt('Dự kiến giao (VD: 28/08/2026 15:00):','')||'',insuranceStatus=prompt('Bảo hiểm (chỉ ghi Đã mua khi đã xác nhận):','Chưa xác nhận')||'',insuranceAmount=Number(prompt('Số tiền bảo hiểm (VNĐ, 0 nếu chưa có):','0')||0),proofUrl=prompt('Link HTTPS bằng chứng bàn giao (nếu có):','')||'';if(!carrier&&!trackingNumber)return;const r=await fetch('/api/admin/v5/checkouts/'+encodeURIComponent(b.dataset.v5Shipment)+'/shipment',{method:'POST',headers:headers(true),body:JSON.stringify({carrier,slug,trackingNumber,status,expectedDelivery,insuranceStatus,insuranceAmount,proofUrl})}),d=await r.json();msg(d.success?'✅ Đã lưu tracking':'❌ '+(d.message||'Lỗi'),d.success);loadV5()});
      }catch(e){$('v5-reservations').innerHTML='<div class="empty">'+safe(e.message)+'</div>';}
    }
    async function saveV5Settings(){const r=await fetch('/api/admin/v5/settings',{method:'POST',headers:headers(true),body:JSON.stringify({reservationMinutes:$('v5-res-min').value,checkoutReservationMinutes:$('v5-checkout-min').value,warrantyMonths:$('v5-warranty-months').value,bankId:$('v5-bank-id').value,accountNo:$('v5-account-no').value,accountName:$('v5-account-name').value,insuranceDefault:$('v5-insurance').value==='1'})}),d=await r.json();msg(d.success?'✅ Đã lưu cấu hình V5':'❌ '+(d.message||'Lỗi'),d.success);if(d.success)loadV5()}

    async function createV5Warranty(){
      const sku=String($('v5-w-sku')?.value||'').trim();if(!sku)return msg('❌ Cần nhập Mã SP để tạo bảo hành.',false);
      const weightRaw=String($('v5-w-weight')?.value||'').trim();const payload={orderId:$('v5-w-order')?.value||'',invoiceId:$('v5-w-invoice')?.value||'',productSku:sku,customerPhone:$('v5-w-phone')?.value||'',soldAt:$('v5-w-sold')?.value||'',warrantyMonths:$('v5-w-months-manual')?.value||''};if(weightRaw!=='')payload.soldWeightChi=Number(weightRaw);
      const r=await fetch('/api/admin/v5/warranty/create',{method:'POST',headers:headers(true),body:JSON.stringify(payload)}),d=await r.json();
      if(!r.ok||!d.success){$('v5-warranty-result').textContent='❌ '+(d.message||'Không tạo được phiếu');return msg('❌ '+(d.message||'Không tạo được phiếu'),false);}
      $('v5-warranty-result').innerHTML=`✅ ${d.reused?'Đã có phiếu':'Đã tạo phiếu'} <b>${safe(d.warranty?.id||'')}</b> · ${d.url?`<a href="${safe(d.url)}" target="_blank" rel="noopener">MỞ QR / PHIẾU</a>`:'Không có link công khai'}`;msg('✅ Phiếu bảo hành QR đã sẵn sàng',true);loadV5();
    }

    async function loadShop() {
      try {
        const response = await fetch('/api/admin/shop', { headers: headers(false), cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data.success || !data.shop) return;
        $('shop-name').value = data.shop.name || '';
        $('tax-id').value = data.shop.taxId || '';
        $('address').value = data.shop.address || '';
        $('phone').value = data.shop.phone || '';
        $('hours').value = data.shop.hours || '07:00 – 21:00 · Tất cả các ngày';
        $('shop-email').value = data.shop.email || '';
        if($('shop-facebook-url')) $('shop-facebook-url').value = data.shop.facebookUrl || '';
        if($('shop-zalo-url')) $('shop-zalo-url').value = data.shop.zaloUrl || (data.shop.zalo ? ('https://zalo.me/' + String(data.shop.zalo).replace(/\D/g,'')) : '');
        if($('shop-tiktok-url')) $('shop-tiktok-url').value = data.shop.tiktokUrl || '';
        $('map').value = data.shop.mapUrl || '';
        $('shop-latitude').value = data.shop.latitude || '';
        $('shop-longitude').value = data.shop.longitude || '';
        $('shipping-base-fee').value = data.shop.shippingBaseFee || 30000;
        $('shipping-per-km').value = data.shop.shippingPerKm || 5000;
        $('shipping-free-order').value = data.shop.shippingFreeOrderThreshold || 100000000;
        $('shipping-high-profit').value = data.shop.shippingHighProfitThreshold || 2000000;
        $('shipping-auto-max').value = data.shop.shippingAutoMaxKm || 40;
        $('shipping-distance-factor').value = data.shop.shippingDistanceFactor || 1.22;
      } catch (_) {}
    }
    // KBL V6.0.1: core navigation must bind before optional Publisher/Studio modules.
    initAdminNavigation();
    $('image-file').addEventListener('change',async(event)=>{
      
      const state=kblBeginImageRead('image','editor'),file=event.target.files?.[0];
      if(!file){state.status='done';return;}
      try{
        const value=await compressImage(file);if(!kblImageReadCurrent('image',state))return;state.status='done';productState.image=value;kblMediaUi.imageDirty=true;setPreview(value,file.name+' · đã thu gọn');
        if(productState.source==='pos'&&productState.editingId){
          const productId=String(productState.editingId),product=productState.products.find(p=>String(p.id)===productId);
          if(product){
            renderEditorAiNameSuggestions(product,'⏳ Đang lưu ảnh gốc vào Product Manifest…');
            try{
              const response=await fetch('/api/admin/content/source-image',{method:'POST',headers:headers(true),body:JSON.stringify({productId,imageDataUrl:value})}),data=await response.json();
              if(!response.ok||!data.success)throw new Error(data.message||'Không lưu được ảnh gốc');
              if(data.product)Object.assign(product,data.product);renderAdminProducts();renderEditorAiNameSuggestions(product,'✓ Đã nhận ảnh. AI đang gợi ý 5 tên…','good');
              await requestProductNameSuggestions(productId,value);
            }catch(aiError){renderEditorAiNameSuggestions(product,'❌ '+(aiError&&aiError.message||'Không lưu/đọc được ảnh cho AI.'),'bad')}
          }
        }
      }
      catch(error){if(!kblImageReadCurrent('image',state))return;state.status='error';event.target.value='';msg('❌ Ảnh sản phẩm: '+kblMediaError(error));}
    });
    $('tryon-image-file').addEventListener('change',async(event)=>{
      
      const state=kblBeginImageRead('tryon','editor'),file=event.target.files?.[0];
      if(!file){state.status='done';return;}
      try{const value=await prepareTryOnImage(file);if(!kblImageReadCurrent('tryon',state))return;state.status='done';productState.tryOnImage=value;kblMediaUi.tryOnDirty=true;setTryOnPreview(value,file.name+' · PNG nền trong suốt đã đạt');}
      catch(error){if(!kblImageReadCurrent('tryon',state))return;state.status='error';event.target.value='';msg('❌ Ảnh thử: '+kblMediaError(error));}
    });
    $('cancel-edit').addEventListener('click', resetForm);
    $('load').addEventListener('click', load);
    $('v5-reload')?.addEventListener('click',loadV5);
    $('v5-save-settings')?.addEventListener('click',saveV5Settings);
    $('v5-create-warranty')?.addEventListener('click',createV5Warranty);
    $('ai-school-reload')?.addEventListener('click',loadAiSchool);
    $('ai-school-reload-files')?.addEventListener('click',reloadAiSchoolFiles);
    $('product-search').addEventListener('input', renderAdminProducts);
    $('clear-product-search').addEventListener('click', () => { $('product-search').value = ''; renderAdminProducts(); });
    $('category').addEventListener('change', () => syncDisplayShelfOptions());
    $('display-shelf').addEventListener('change', updateDisplayShelfFeedback);
    $('gold')?.addEventListener('input', () => syncGoldShelfOptions());
    syncDisplayShelfOptions('');
    syncGoldShelfOptions('9999');
    $('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      if(kblMediaUi.editorSaving)return;
      if(kblMediaNotReady(['image','tryon']))return msg('❌ Ảnh chưa đọc xong hoặc bị lỗi. Hãy chờ ảnh xem trước hợp lệ rồi lưu.',false);
      const editorEpoch=kblMediaUi.editorEpoch,source=productState.source;
      if (!productState.image) return msg('❌ Phải chọn hình ảnh trước khi đưa sản phẩm lên trang trưng bày.', false);
      if (!displayShelfSelectionValid()) {
        $('display-shelf').setAttribute('aria-invalid', 'true');
        $('display-shelf').focus();
        return msg('❌ Hãy chọn đúng Ô trưng bày chi tiết trước khi đưa sản phẩm lên website.', false, 'display-shelf');
      }
      const payload = {
        id: $('edit-id').value,
        sku: $('sku').value,
        name: $('name').value,
        category: $('category').value,
        displayCategory: $('category').value,
        displayShelf: $('display-shelf').value,
        displayGoldShelf: $('gold-shelf').value,
        goldCode: $('gold').value,
        weightChi: $('weight').value,
        workmanship: $('work').value,
        kind: $('kind').value,
        publicationStatus: 'published',
        image: productState.image,
        tryOnImage: productState.tryOnImage
      };
      Object.entries(productFieldMap).forEach(([id, key]) => { payload[key] = $(id).value; });
      if(payload.id&&!kblMediaUi.imageDirty)delete payload.image;
      else if(payload.id)payload.expectedImage=kblMediaUi.baseImage;
      if(payload.id&&!kblMediaUi.tryOnDirty)delete payload.tryOnImage;
      else if(payload.id)payload.expectedTryOnImage=kblMediaUi.baseTryOnImage;
      kblMediaUi.editorSaving=true;const button=$('save-product');button.disabled=true;
      try{
        const data=await kblMediaJson(await fetch('/api/admin/products',{method:'POST',headers:headers(true),body:JSON.stringify(payload)}));
        if(payload.id)kblMergeProduct(data.product,payload.id);else productState.products.push(data.product);
        const label=data.product.sku||data.product.id;
        if(editorEpoch===kblMediaUi.editorEpoch)resetForm();
        renderAdminProducts();msg('✅ Đã lưu và trưng bày '+label,true);
        const loaded=await load();if(!loaded)msg('✅ Đã lưu '+label+'. ⚠️ Chưa tải lại được kho; không cần bấm lưu lại.',false);
      }catch(error){msg('❌ '+kblMediaError(error),false);}
      finally{kblMediaUi.editorSaving=false;button.disabled=false;}
    });
    $('sync-price').addEventListener('click', async () => {
      const response = await fetch('/api/prices', { cache: 'no-store' });
      const data = await response.json();
      msg(data.success ? '✅ Giá hiện tại đã được dùng để tính lại giá sản phẩm.' : '❌ Không đọc được giá', data.success);
      load();
    });
    $('shop-use-location')?.addEventListener('click',()=>{if(!navigator.geolocation){$('shop-location-status').textContent='Trình duyệt không hỗ trợ vị trí.';return}$('shop-location-status').textContent='Đang lấy vị trí…';navigator.geolocation.getCurrentPosition((pos)=>{$('shop-latitude').value=Number(pos.coords.latitude).toFixed(7);$('shop-longitude').value=Number(pos.coords.longitude).toFixed(7);$('shop-location-status').textContent='✓ Đã lấy vị trí. Bấm LƯU để dùng cho tính ship.';},()=>{$('shop-location-status').textContent='Không lấy được vị trí. Hãy cho phép quyền vị trí.';},{enableHighAccuracy:true,timeout:12000,maximumAge:0})});
    $('save-shop').addEventListener('click', async () => {
      const response = await fetch('/api/admin/shop', { method: 'POST', headers: headers(true), body: JSON.stringify({ name: $('shop-name').value, taxId: $('tax-id').value, address: $('address').value, phone: $('phone').value, hours: $('hours').value, email: $('shop-email').value, facebookUrl: $('shop-facebook-url')?.value || '', zaloUrl: $('shop-zalo-url')?.value || '', tiktokUrl: $('shop-tiktok-url')?.value || '', mapUrl: $('map').value, latitude: $('shop-latitude').value, longitude: $('shop-longitude').value, shippingBaseFee: $('shipping-base-fee').value, shippingPerKm: $('shipping-per-km').value, shippingFreeOrderThreshold: $('shipping-free-order').value, shippingHighProfitThreshold: $('shipping-high-profit').value, shippingAutoMaxKm: $('shipping-auto-max').value, shippingDistanceFactor: $('shipping-distance-factor').value }) });
      const data = await response.json();
      msg(data.success ? '✅ Đã lưu thông tin tiệm và bản đồ' : '❌ ' + data.message, data.success);
    });
    $('content-product')?.addEventListener('change',()=>{kblResetContentMedia();clearLocalAiPoll();clearVeoPoll();contentState.product=null;contentState.content=null;contentState.assets={};contentState.uploadedImage='';contentState.displayUploadImage='';contentState.videoFile=null;if($('content-upload-file'))$('content-upload-file').value='';if($('content-display-file'))$('content-display-file').value='';if($('content-video-file'))$('content-video-file').value='';if($('content-video-preview')){$('content-video-preview').removeAttribute('src');$('content-video-preview').style.display='none'}clearContentOutputs();renderContentProductPreview();renderVeoVideo(selectedContentProduct());drawContentCover()});
    $('content-upload-file').addEventListener('change',async(event)=>{
      const context=kblContentContext();if(!context.id){event.target.value='';$('content-status').textContent='❌ Hãy chọn sản phẩm trước khi tải ảnh.';return;}
      const state=kblBeginImageRead('source','content'),file=event.target.files?.[0];
      if(!file){state.status='done';return;}
      try{const value=await compressImage(file);if(!kblImageReadCurrent('source',state))return;state.status='done';contentState.uploadedImage=value;updateContentAssetPreviews();$('content-status').textContent='✅ Đã nhận ảnh gốc cho '+context.id;}
      catch(error){if(!kblImageReadCurrent('source',state))return;state.status='error';event.target.value='';kblMediaStatus(context,'❌ Ảnh gốc: '+kblMediaError(error));}
    });
    $('content-display-file').addEventListener('change',async(event)=>{
      const context=kblContentContext();if(!context.id){event.target.value='';$('content-status').textContent='❌ Hãy chọn sản phẩm trước khi tải ảnh.';return;}
      const state=kblBeginImageRead('display','content'),file=event.target.files?.[0];
      if(!file){state.status='done';return;}
      try{const value=await compressImage(file);if(!kblImageReadCurrent('display',state))return;state.status='done';contentState.displayUploadImage=value;updateContentAssetPreviews();await drawContentCover();if(kblContentCurrent(context))$('content-status').textContent='✅ Đã nhận ảnh trưng bày cho '+context.id+' · kiểm tra ảnh trước khi duyệt.';}
      catch(error){if(!kblImageReadCurrent('display',state))return;state.status='error';event.target.value='';kblMediaStatus(context,'❌ Ảnh trưng bày: '+kblMediaError(error));}
    });
    $('content-display-style')?.addEventListener('change',()=>{if($('content-product')?.value)buildFlowKit()});
    $('content-video-file')?.addEventListener('change',(event)=>{const file=event.target.files&&event.target.files[0];contentState.videoFile=file||null;const preview=$('content-video-preview');if(preview&&file){if(preview.dataset.objectUrl)URL.revokeObjectURL(preview.dataset.objectUrl);const url=URL.createObjectURL(file);preview.dataset.objectUrl=url;preview.src=url;preview.style.display='block';$('content-status').textContent='✅ Đã nhận video Flow. Bấm AI VIẾT CAPTION TỪ VIDEO.'}else if(preview){preview.style.display='none';preview.removeAttribute('src')}});
    $('content-build-kit')?.addEventListener('click',()=>buildFlowKit());
    $('content-generate')?.addEventListener('click',generateContent);
    $('content-local-generate')?.addEventListener('click',generateLocalDisplayImage);
    $('content-display-flow')?.addEventListener('click',createOrRedoDisplayImage);
    $('content-display-save')?.addEventListener('click',saveDisplayImage);
    $('content-display-approve')?.addEventListener('click',approveAndPublishDisplayImage);
    $('content-use-image-video')?.addEventListener('click',prepareVideoFromSelectedImage);

    $('veo-generate')?.addEventListener('click',startVeoVideo);
    $('veo-check')?.addEventListener('click',()=>checkVeoJob());
    $('veo-approve')?.addEventListener('click',approveVeoVideo);
    $('veo-reset')?.addEventListener('click',resetVeoVideo);
    $('veo-go-publisher')?.addEventListener('click',()=>{const p=selectedVeoProduct();showAdminView('publisher');refreshPublisherProducts();if(p&&$('publisher-product')){$('publisher-product').value=p.id;renderPublisherProduct()}});
    $('director-refresh')?.addEventListener('click',refreshDirectorAll);
    $('master-scout-now')?.addEventListener('click',()=>runAiMasterScout('quick'));
    $('master-generate-drafts')?.addEventListener('click',generateAiMasterDrafts);$('master-generate-drafts-top')?.addEventListener('click',generateAiMasterDrafts);setTimeout(reconcileAiMarketHeadlinesOnce,1200);
    $('master-scout-deep')?.addEventListener('click',()=>runAiMasterScout('deep'));
    $('master-model-refresh')?.addEventListener('click',refreshGeminiAutoModel);
    $('video-template')?.addEventListener('change',updateVideoTemplateNote);
    $('video-draft')?.addEventListener('click',()=>generateVideoDraft(false));
    $('video-prompt-refresh')?.addEventListener('click',()=>generateVideoDraft(true));
    $('video-script-copy')?.addEventListener('click',()=>copyTextValue($('video-script')?.value||'').then(()=>{$('video-status').textContent='✅ Đã copy lời thoại.'}));
    $('video-caption-copy')?.addEventListener('click',copyVideoCaption);
    $('video-caption-reset')?.addEventListener('click',resetVideoCaption);
    $('video-copy-prompt')?.addEventListener('click',copyVideoPrompt);
    $('video-open-veo')?.addEventListener('click',()=>window.open('https://gemini.google.com/','_blank','noopener'));
    $('video-veo-file')?.addEventListener('change',onVideoVeoFile);
    $('video-veo-upload')?.addEventListener('click',uploadVideoVeoRaw);
    $('video-source-clear')?.addEventListener('click',clearVideoSource);
    $('video-auto-cues')?.addEventListener('click',()=>{autoVideoCues();$('video-status').textContent='✓ Đã ước lượng mốc theo vị trí câu trong kịch bản. AUTO sẽ tinh chỉnh thêm theo khoảng nghỉ khi Worker chạy.'});
    $('video-auto-scan-render')?.addEventListener('click',startVideoAutoScanRender);
    $('video-render')?.addEventListener('click',startVideoRender);
    $('video-reload')?.addEventListener('click',loadVideoStudioStatus);
    $('video-approve')?.addEventListener('click',approveVideoJob);
    $('video-go-publisher')?.addEventListener('click',async()=>{const j=(videoStudioState.jobs||[]).find(x=>String(x.id)===String(videoStudioState.activeJobId));if(!j||String(j.status)!=='approved')return;showAdminView('publisher');publisherRuntime.sourceType='video';publisherRuntime.videoJobId=j.id;if($('publisher-source-type'))$('publisher-source-type').value='video';await Promise.all([loadPublisherStatus(),loadPublisherVideoJobs()]);if($('publisher-video-job'))$('publisher-video-job').value=j.id;renderPublisherSource()});
    $('video-retry-job')?.addEventListener('click',()=>retryVideoJob());
    $('video-cancel-job')?.addEventListener('click',()=>cancelVideoJob());
    $('video-open')?.addEventListener('click',()=>{const j=(videoStudioState.jobs||[]).find(x=>String(x.id)===String(videoStudioState.activeJobId));if(j&&j.resultVideo)window.open(j.resultVideo,'_blank','noopener')});
    $('video-download')?.addEventListener('click',()=>{const j=(videoStudioState.jobs||[]).find(x=>String(x.id)===String(videoStudioState.activeJobId));if(!j||!j.resultVideo)return;const a=document.createElement('a');a.href=j.resultVideo;a.download='KBL-'+String(j.template||'video')+'-'+String(j.sku||j.id||'mp4')+'.mp4';document.body.appendChild(a);a.click();a.remove()});

    $('veo-resolution')?.addEventListener('change',()=>{if($('veo-resolution').value==='1080p')$('veo-duration').value='8'});
    
    $('publisher-source-type')?.addEventListener('change',renderPublisherSource);
    $('publisher-video-job')?.addEventListener('change',()=>{publisherRuntime.videoJobId=$('publisher-video-job')?.value||'';renderPublisherSource()});
    $('publisher-product')?.addEventListener('change',renderPublisherProduct);
    $('publisher-long-upload')?.addEventListener('click',uploadPublisherLongVideo);
    $('publisher-long-analyze')?.addEventListener('click',analyzePublisherLongVideo);
    $('publisher-long-approve')?.addEventListener('click',approvePublisherLongVideo);
    $('publisher-build')?.addEventListener('click',buildPublisherPack);
    $('publisher-save')?.addEventListener('click',savePublisherPack);
    $('publisher-check-media')?.addEventListener('click',checkPublisherSelectedMedia);
    $('publisher-runs')?.addEventListener('click',event=>{const button=event.target.closest('[data-pub-inspect-run]');if(button)inspectPublisherHistory(button.dataset.pubInspectRun,button)});

    $('publisher-publish-all')?.addEventListener('click',publishAllPlatforms);
    $('publisher-connectors-save')?.addEventListener('click',savePublisherConnectors);
    $('publisher-telegram-send')?.addEventListener('click',sendPublisherTelegram);
    $('growth-save')?.addEventListener('click',saveGrowthAutopilot);
    $('growth-auto-publish-on')?.addEventListener('click',()=>setGrowthAutoPublish(true));
    $('growth-auto-publish-off')?.addEventListener('click',()=>setGrowthAutoPublish(false));
    $('growth-run-now')?.addEventListener('click',runGrowthNow);
    $('growth-auto-check')?.addEventListener('click',checkGrowthAuto);
    $('growth-banana-test')?.addEventListener('click',testGrowthBanana);
    $('growth-media-upload-test')?.addEventListener('click',testGrowthMediaUpload);
    $('growth-test-now')?.addEventListener('click',publishGrowthTestNow);
    $('growth-test-near')?.addEventListener('click',scheduleGrowthNearTest);
    $('growth-sync-analytics')?.addEventListener('click',syncGrowthAnalytics);
    document.querySelectorAll('[data-growth-care]').forEach(b=>b.addEventListener('click',()=>connectGrowthCare(b.dataset.growthCare)));
    window.addEventListener('message',async(event)=>{if(event.origin!==location.origin||!event.data||event.data.type!=='kbl-publisher-oauth')return;await Promise.all([loadPublisherStatus(),loadPublisherConnectors(),loadGrowthAutopilot()]);publisherStatusTarget((event.data.ok?'✅ ':'❌ ')+(event.data.message||('OAuth '+event.data.platform)),Boolean(event.data.ok))});
    document.querySelectorAll('[data-pub-copy]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.pubCopy,field=$('publisher-'+k);if(field)copyTextValue(field.value||'').then(()=>{$('publisher-status').textContent='✅ Đã copy caption '+k+'.'})}));
    document.querySelectorAll('[data-pub-open]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.pubOpen,field=$('publisher-'+k);if(field&&field.value)copyTextValue(field.value).catch(()=>{});const cfg=publisherRuntime.platforms&&publisherRuntime.platforms[k]||{};window.open(cfg.openUrl||publisherLinks[k]||'about:blank','_blank','noopener')}));
    document.querySelectorAll('[data-pub-mark]').forEach(b=>b.addEventListener('click',()=>markPublisherPlatform(b.dataset.pubMark)));
    document.querySelectorAll('[data-pub-publish]').forEach(b=>b.addEventListener('click',()=>retryPublisherPlatform(b.dataset.pubPublish)));
    $('live-add-product')?.addEventListener('click',addLiveProduct);
    $('live-prev')?.addEventListener('click',()=>stepLive(-1));
    $('live-next')?.addEventListener('click',()=>stepLive(1));
    $('live-copy-script')?.addEventListener('click',()=>copyTextValue($('live-teleprompter')?.textContent||''));

    $('content-display-restore')?.addEventListener('click',restoreOriginalImage);
    $('content-open-flow')?.addEventListener('click',()=>copyPromptAndOpen('content-flow-prompt'));
    $('content-video-caption')?.addEventListener('click',generateVideoCaptions);
    $('content-copy-all')?.addEventListener('click',copyAllContent);
    $('content-export-all')?.addEventListener('click',exportAllContent);
    $('save-intl-settings')?.addEventListener('click',()=>saveInternationalSettings().catch(e=>msg('❌ '+e.message,false)));
    $('intl-test-fedex')?.addEventListener('click',()=>testInternational('fedex').catch(e=>msg('❌ '+e.message,false)));
    $('intl-test-paypal')?.addEventListener('click',()=>testInternational('paypal').catch(e=>msg('❌ '+e.message,false)));
    $('intl-paypal-sandbox-order')?.addEventListener('click',()=>createPayPalSandboxTest().catch(e=>msg('❌ '+e.message,false)));
    $('intl-test-fx')?.addEventListener('click',()=>testInternational('fx').catch(e=>msg('❌ '+e.message,false)));
    $('intl-orders-reload')?.addEventListener('click',()=>loadInternationalOrders());
    $('prompt-ai-reload')?.addEventListener('click',()=>loadPromptAi());
    $('prompt-ai-save-settings')?.addEventListener('click',()=>savePromptAiSettings());
    $('prompt-ai-model-refresh')?.addEventListener('click',()=>refreshPromptGemini());
    $('prompt-ai-deepseek-refresh')?.addEventListener('click',()=>refreshPromptDeepSeek());
    $('save-n10-settings')?.addEventListener('click',async()=>{try{await saveN10Settings();await Promise.all([loadLoyaltyReport(),loadTryonAccounts(),loadCustomers()])}catch(e){msg('❌ '+e.message,false)}});
    $('reload-loyalty')?.addEventListener('click',loadLoyaltyReport);
    $('loyalty-year')?.addEventListener('change',async()=>{await Promise.all([loadLoyaltyReport(),loadCustomers()])});
    $('content-cover-redraw')?.addEventListener('click',drawContentCover);
    $('content-cover-download')?.addEventListener('click',async()=>{await drawContentCover();const canvas=$('content-cover'),link=document.createElement('a'),sku=(contentState.product?.sku||selectedContentProduct()?.sku||'san-pham').replace(/[^A-Za-z0-9_-]+/g,'-');link.download='KBL-'+sku+'-facebook-cover.png';link.href=canvas.toDataURL('image/png');link.click()});
    document.querySelectorAll('[data-copy-content]').forEach(button=>button.addEventListener('click',()=>copyTextFrom(button.dataset.copyContent)));
    updateVideoTemplateNote();
    renderVideoDirectorHint();
    renderVideoSceneChain();
    $('gold-watch-save')?.addEventListener('click',saveGoldWatch);
    $('analytics-sync')?.addEventListener('click',syncContentAnalytics);
    $('video-product-pick-single')?.addEventListener('click',()=>openVideoProductPicker('single'));
    $('video-product-pick-multi')?.addEventListener('click',()=>openVideoProductPicker('multi'));
    document.querySelectorAll('[data-video-picker-close]').forEach(b=>b.addEventListener('click',closeVideoProductPicker));
    $('video-picker-confirm')?.addEventListener('click',confirmVideoProductPicker);
    $('video-picker-search')?.addEventListener('input',renderVideoProductPicker);
    $('video-picker-filter')?.addEventListener('change',renderVideoProductPicker);
    $('video-picker-category')?.addEventListener('change',renderVideoProductPicker);
    $('video-product')?.addEventListener('change',checkVideoDuplicate);
    $('video-director-style')?.addEventListener('change',()=>{videoStudioState.draft=null;if($('video-veo-prompt'))$('video-veo-prompt').value='';renderVideoDirectorHint();renderVideoSceneChain();if($('video-status'))$('video-status').textContent='🎬 Đã đổi Director style. Bấm TẠO LỜI THOẠI + PROMPT VEO để tạo lại TOÀN BỘ Scene Chain theo phong cách mới.'});
    $('video-duration')?.addEventListener('change',()=>{clearVideoDraftForTiming();if($('video-status'))$('video-status').textContent='🎬 Đã đổi thời lượng: '+String($('video-duration')?.value||20)+' giây → '+videoSceneCountClient()+' scene/prompt. Bấm TẠO LỜI THOẠI + PROMPT VEO.'});
    document.querySelectorAll('[data-pub-regenerate]').forEach(b=>b.addEventListener('click',()=>regeneratePublisherCaption(b.dataset.pubRegenerate)));
    $('global-ai-reload')?.addEventListener('click',loadGlobalAi);
    $('global-ai-refresh-en')?.addEventListener('click',refreshGlobalAiEnglish);
    $('global-ai-repair-images')?.addEventListener('click',repairGlobalAiImages);
    $('discovery-probe')?.addEventListener('click',runDiscoveryProbe);
    $('discovery-probe-claude')?.addEventListener('click',()=>runDiscoveryProviderProbe('claude','discovery-probe-claude','Claude-SearchBot'));
    $('discovery-probe-perplexity')?.addEventListener('click',()=>runDiscoveryProviderProbe('perplexity','discovery-probe-perplexity','PerplexityBot'));
    $('discovery-indexnow')?.addEventListener('click',pushDiscoveryIndexNow);
    $('discovery-save-setup')?.addEventListener('click',saveDiscoverySetup);
    $('promax-test-save')?.addEventListener('click',savePromaxRecommendationTest);
    drawContentCover();
    resetForm();
    // V6.5.3: không gọi endpoint Admin trước khi có token; tránh 401 giả lúc vừa mở trang.
    if ($('token')?.value.trim()) { loadShop(); loadV5(); }
    $('sales-image-refresh')?.addEventListener('click',()=>loadGrowthAutopilot());
    let kblSalesImagePollBusy=false;
    const kblSalesImagePanelVisible=()=>{const section=$('sales-studio-section'),panel=document.querySelector('[data-sales-studio-panel="image"]');return Boolean(document.visibilityState==='visible'&&section&&!section.hidden&&panel&&panel.classList.contains('active')&&$('token')?.value.trim())};
    const kblSalesImageLivePoll=window.setInterval(async()=>{if(!kblSalesImagePanelVisible()||kblSalesImagePollBusy)return;kblSalesImagePollBusy=true;try{await loadGrowthAutopilot()}finally{kblSalesImagePollBusy=false}},10000);
    $('token')?.addEventListener('change',()=>{if(kblSalesImagePanelVisible())loadGrowthAutopilot()});
    $('token')?.addEventListener('input',()=>{if(kblSalesImagePanelVisible())window.clearTimeout(window.__kblSalesImageTokenTimer),window.__kblSalesImageTokenTimer=window.setTimeout(()=>loadGrowthAutopilot(),350)});
    window.addEventListener('focus',()=>{if(kblSalesImagePanelVisible())loadGrowthAutopilot()});
    document.addEventListener('visibilitychange',()=>{if(kblSalesImagePanelVisible())loadGrowthAutopilot()});
    window.setTimeout(()=>{if(kblSalesImagePanelVisible())loadGrowthAutopilot()},600);
    // V6.7.0E4: AI Market chạy nền; Admin chỉ poll nhẹ để ý tưởng đã qua Truth Guard tự xuất hiện trong Đề xuất ưu tiên.
    const kblSilentMarketUiPoll=window.setInterval(()=>{if(document.visibilityState==='visible'&&$('token')?.value.trim()){loadAiDirector();loadAiMaster();}},60000);
// KBL COMPACT UI 20260914. No API calls; original controls are moved, never cloned.
(function(){
'use strict';
const byId=id=>document.getElementById(id), panes=new Map();
const viewCopy={dashboard:['Tổng quan','Hộp việc, thị trường, hiệu quả nội dung và lượt truy cập.'],products:['POS & Sản phẩm','Chọn nhóm sản phẩm cần xử lý; thông tin và quy trình duyệt giữ nguyên.'],studio:['Ảnh & nội dung','Tạo ảnh trưng bày; nội dung phụ trợ và Veo API nằm ở mục riêng.'],autonomous:['Sales Studio','Quy trình đầy đủ từ cơ hội đến video, hình ảnh và xuất bản.'],video:['Video & gắn card','Chuẩn bị → nhận RAW → gắn card → duyệt kết quả.'],publisher:['Đăng bài','Chọn media đã duyệt, soạn nội dung từng kênh và xuất bản.'],live:['Livestream','Sản phẩm thật, lời dẫn và media đã duyệt.'],globalai:['Hiện diện trên AI','Thông tin thương hiệu, tín hiệu bên ngoài và dữ liệu cung cấp cho AI.'],promptai:['Khách dùng Prompt AI','Quản lý tài khoản, lượt sử dụng và yêu cầu thanh toán.'],customers:['Khách & Đơn','Đơn trong nước, quốc tế, CRM, tri ân và lượt thử AI.'],operations:['Vận hành','Bảo hành, giữ hàng và kiến thức tư vấn.'],settings:['Cài đặt','Kết nối mạng xã hội, thông tin tiệm và cấu hình quốc tế.']};
function button(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',fn);return b;}
function hint(text){const n=document.createElement('p');n.className='kbl-ui-hint';n.textContent=text;return n;}
function navGroup(label,views){const d=document.createElement('details');d.className='kbl-nav-group';const s=document.createElement('summary');s.textContent=label;d.append(s);for(const v of views){const b=document.querySelector('#admin-nav [data-admin-view="'+v+'"]');if(b)d.append(b);}return d;}
const nav=byId('admin-nav');
const groups=[navGroup('CỬA HÀNG',['dashboard','products','customers']),navGroup('NỘI DUNG & VIDEO',['autonomous','studio','video','publisher','live']),navGroup('AI & KHÁCH ONLINE',['globalai','promptai']),navGroup('VẬN HÀNH & CÀI ĐẶT',['operations','settings'])];
groups.forEach(g=>nav.append(g));groups[0].open=true;groups[1].open=true;
for(const b of nav.querySelectorAll('[data-admin-view]')){
 const icon=b.querySelector('.nav-ico'),label=viewCopy[b.dataset.adminView]?.[0];if(label){b.replaceChildren();if(icon)b.append(icon);b.append(document.createTextNode(label));}
}
const brand=document.querySelector('.admin-brand h2'),oldBrand=brand.textContent;brand.textContent='KBL Control Center';
document.querySelector('.admin-brand p').textContent='Quản trị cửa hàng Kim Bảo Lâm';
const note=document.querySelector('.admin-side-note'),version=document.createElement('details'),summary=document.createElement('summary');version.className='admin-side-note';summary.textContent='Thông tin hệ thống';version.append(summary);const versionText=document.createElement('p');versionText.className='kbl-version';versionText.textContent=oldBrand;version.append(versionText);while(note.firstChild)version.append(note.firstChild);note.replaceWith(version);
const title=document.querySelector('.admin-main>.head h1'),titleWrap=document.createElement('div');titleWrap.className='kbl-view-head';title.replaceWith(titleWrap);titleWrap.append(title);const subtitle=document.createElement('p');subtitle.className='kbl-view-note';titleWrap.append(subtitle);
// Reuse the original section navigation: only add categories, never new backend workflows.
ADMIN_SUBTABS.dashboard=[['work','Cần xử lý'],['market','Thị trường & ý tưởng'],['content','Hiệu quả nội dung'],['traffic','Lượt truy cập']];
for(const[id,tab]of [['control-center','work'],['ai-director-section','market'],['content-intelligence-section','content'],['traffic-section','traffic']])byId(id).dataset.adminSubtab=tab;
ADMIN_SUBTABS.customers=[['orders','Đơn trong nước'],['international','Đơn quốc tế'],['crm','CRM'],['vip','VIP & Tri ân'],['tryon','AI Try-on']];byId('international-orders-section').dataset.adminSubtab='international';
ADMIN_SUBTABS.settings=[['social','Mạng xã hội'],['shop','Thông tin tiệm'],['international','Quốc tế']];byId('international-settings-section').dataset.adminSubtab='international';
const quick=document.createElement('div');quick.className='kbl-quick-links';
quick.append(button('Mở thị trường & ý tưởng',()=>selectAdminSubtab('dashboard','market')),button('Xử lý sản phẩm',()=>showAdminView('products')),button('Xem đơn hàng',()=>showAdminView('customers')));byId('control-center').append(quick);
// Confirmed duplicate: both original buttons call generateAiMasterDrafts.
byId('master-generate-drafts').classList.add('kbl-ui-duplicate');byId('master-generate-drafts').setAttribute('aria-hidden','true');
function makePanes(id,definitions,options={}){
 const root=byId(id);if(!root)return;
 // Resolve all original nodes before creating wrappers. Never consume newly-added nodes.
 const resolved=definitions.map(def=>({...def,nodes:def.selectors.flatMap(sel=>[...root.querySelectorAll(sel)]).filter((n,i,a)=>a.indexOf(n)===i)}));
 const bar=document.createElement('div');bar.className='kbl-pane-nav';bar.setAttribute('aria-label',options.label||'Các bước');
 const anchor=options.before?root.querySelector(options.before):resolved.flatMap(d=>d.nodes)[0];
 if(anchor)anchor.before(bar);else root.append(bar);
 const state={active:definitions[0].key,root,bar,entries:[],choose:null};
 for(const def of resolved){
  const wrap=document.createElement('div');wrap.className='kbl-pane';wrap.dataset.kblPane=def.key;wrap.id='kbl-pane-'+id+'-'+def.key;
  const first=def.nodes[0];if(first)first.before(wrap);else root.append(wrap);
  def.nodes.forEach(n=>wrap.append(n));
  const b=button(def.label,()=>choose(def.key));b.setAttribute('aria-controls',wrap.id);b.dataset.kblPaneButton=def.key;bar.append(b);
  state.entries.push({def,wrap,b});
 }
 const all=button('Xem tất cả',()=>choose('all'));all.dataset.kblAll='true';bar.append(all);
 const footer=document.createElement('div');footer.className='kbl-pane-footer';const prev=button('← Mục trước',()=>step(-1)),next=button('Mục tiếp →',()=>step(1));footer.append(prev,next);root.append(footer);
 function choose(key){
  state.active=key;for(const entry of state.entries){const visible=key==='all'||entry.def.key===key;entry.wrap.dataset.kblInactive=String(!visible);entry.b.setAttribute('aria-pressed',String(entry.def.key===key));
   if(visible&&key!=='all'&&entry.def.openDetails)entry.wrap.querySelectorAll(':scope>details').forEach(d=>d.open=true);
  }
  all.setAttribute('aria-pressed',String(key==='all'));const i=state.entries.findIndex(e=>e.def.key===key);prev.disabled=i<=0;next.disabled=i<0||i===state.entries.length-1;footer.hidden=key==='all';
 }
 function step(delta){const i=state.entries.findIndex(e=>e.def.key===state.active);if(state.entries[i+delta]){choose(state.entries[i+delta].def.key);bar.scrollIntoView({block:'nearest',behavior:'smooth'});}}
 state.choose=choose;panes.set(id,state);choose(state.active);return state;
}
makePanes('content-studio',[
 {key:'image',label:'1 · Ảnh trưng bày',selectors:[':scope>.content-upload-box',':scope>.simple-studio-grid',':scope>.studio-prompt',':scope>.studio-main-actions']},
 {key:'copy',label:'2 · Nội dung phụ trợ',selectors:[':scope>.advanced-studio:not(.veo-api-details)'],openDetails:true},
 {key:'api',label:'Veo API · nâng cao',selectors:[':scope>.veo-api-details'],openDetails:true}
],{before:'.content-upload-box',label:'Ảnh và nội dung'});
makePanes('video-studio-section',[
 {key:'plan',label:'1 · Kịch bản & prompt',selectors:[':scope>.video-studio-controls',':scope>#video-director-hint',':scope>#video-template-note',':scope>#video-master-pack',':scope>#video-duplicate-warning',':scope>.video-v5-grid']},
 {key:'raw',label:'2 · Upload RAW',selectors:[':scope>.video-v5-source']},
 {key:'cards',label:'3 · Card & xử lý',selectors:[':scope>.video-v5-cue-caption',':scope>.video-v5-renderbar']},
 {key:'review',label:'4 · Kết quả & duyệt',selectors:[':scope>.video-v5-final']},
 {key:'history',label:'Lịch sử',selectors:[':scope>.video-history']}
],{before:'.video-v5-flow',label:'Các bước làm video'});
const videoStatus=byId('video-status');const videoBar=panes.get('video-studio-section').bar;videoBar.after(videoStatus);
makePanes('publisher-section',[
 {key:'compose',label:'1 · Nội dung đăng',selectors:[':scope>.publisher-top',':scope>.publisher-platforms']},
 {key:'ingest',label:'Video ngoài → duyệt',selectors:[':scope>#publisher-long-video-wrap']},
 {key:'history',label:'Lịch sử đăng',selectors:[':scope>.publisher-history']}
],{before:'#publisher-long-video-wrap',label:'Xuất bản'});
// Publisher stays the single publishing destination; connection setup remains in Settings.
const publishPane=panes.get('publisher-section').entries[0].wrap;
// Publishing status remains visible when returning from ingestion or reading history.
panes.get('publisher-section').bar.after(byId('publisher-status'));
// The second direct kicker introduces caption controls, not the ingest/history screens.
const directKickers=[...byId('publisher-section').querySelectorAll(':scope>.cc-kicker')];
if(directKickers[1])publishPane.prepend(directKickers[1]);
const publishHint=hint('Đăng tất cả dùng nội dung của đủ các kênh đang bật, kể cả kênh đang thu gọn. Muốn đổi tài khoản hoặc quyền đăng, mở Cài đặt mạng xã hội.');
publishHint.append(button('Cài đặt mạng xã hội',()=>{showAdminView('settings');selectAdminSubtab('settings','social');}));publishPane.prepend(publishHint);
function channelTabs(container,selector,identity,mode){
 const bar=document.createElement('div');bar.className='kbl-channel-nav';bar.setAttribute('aria-label','Chọn kênh '+mode);container.before(bar);container.classList.add('kbl-one-channel');let selected='facebook';
 const names={facebook:'Facebook',instagram:'Instagram',threads:'Threads',tiktok:'TikTok',youtube:'YouTube',zalo:'Zalo OA',telegram:'Telegram'};const buttons={};
 for(const [key,name]of Object.entries(names)){
  const b=button(name,()=>{selected=key;update();});const st=document.createElement('span');st.className='kbl-channel-state';b.append(st);buttons[key]={b,st};bar.append(b);
 }
 const all=button('Tất cả kênh',()=>{selected='all';update();});bar.append(all);
 function update(){
  const cards=[...container.querySelectorAll(selector)];
  for(const [key,x]of Object.entries(buttons)){x.b.setAttribute('aria-pressed',String(selected===key));const card=cards.find(c=>identity(c)===key);x.st.textContent=card?.querySelector('.platform-mode')?.textContent||'Chưa tải';}
  all.setAttribute('aria-pressed',String(selected==='all'));
  for(const card of cards){card.classList.add('kbl-filtered');card.dataset.kblInactive=String(selected!=='all'&&identity(card)!==selected);}
 }
 update();new MutationObserver(update).observe(container,{childList:true,subtree:true,characterData:true});
}
channelTabs(byId('publisher-section').querySelector('.publisher-platforms'),':scope>.platform-card',c=>c.dataset.platformCard,'soạn nội dung');
channelTabs(byId('publisher-connect-grid'),':scope>.publisher-connector-card',c=>c.querySelector('[data-connector-enabled]')?.dataset.connectorEnabled,'kết nối');
// Split a long technical details panel into readable categories, retaining its original disclosure.
const tech=byId('global-ai-section').querySelector('.global-ai-tech-details');tech.id='kbl-global-details';
makePanes('kbl-global-details',[
 {key:'health',label:'Tình trạng',selectors:[':scope>.global-ai-owner-actions',':scope>.global-ai-grid',':scope>#global-ai-checks']},
 {key:'brand',label:'Nhận diện thương hiệu',selectors:[':scope>#entity-authority-panel']},
 {key:'results',label:'Hiệu quả & kiểm chứng',selectors:[':scope>#promax-presence-panel']},
 {key:'discovery',label:'Crawler & kết nối',selectors:[':scope>#global-discovery-panel']},
 {key:'feeds',label:'Feed dữ liệu',selectors:[':scope>h3',':scope>.global-ai-links',':scope>#global-ai-fx']}
],{before:'.global-ai-owner-actions',label:'Chi tiết hiện diện AI'});
// Inventory groups: business search/render stays intact. Searching reveals all groups.
const productRoot=byId('products-section'),laneNodes=[...productRoot.querySelectorAll('.product-lane')],productBar=document.createElement('div');productBar.className='kbl-pane-nav';productBar.setAttribute('aria-label','Nhóm sản phẩm');productRoot.querySelector('.product-split').before(productBar);
const laneLabels={'pending-products-details':'Chờ duyệt','published-products-details':'Đang trưng bày','sold-products-details':'Đã bán','unavailable-products-details':'Không còn hàng'};let lane='pending-products-details';const laneButtons=[];
for(const node of laneNodes){if(!node.id)node.id='kbl-reference-products';const label=laneLabels[node.id]||'Hàng tham khảo';const b=button(label,()=>chooseLane(node.id));productBar.append(b);laneButtons.push({node,b,label});const count=node.querySelector('.stock-count');if(count)new MutationObserver(()=>{b.textContent=label+' · '+count.textContent;}).observe(count,{childList:true,subtree:true,characterData:true});}
const allLanes=button('Tất cả',()=>chooseLane('all'));productBar.append(allLanes);
function chooseLane(id){lane=id;for(const {node,b}of laneButtons){node.classList.add('kbl-filtered');node.dataset.kblInactive=String(id!=='all'&&id!==node.id);b.setAttribute('aria-pressed',String(id===node.id));if(id==='all'||id===node.id)if(node.tagName==='DETAILS')node.open=true;}allLanes.setAttribute('aria-pressed',String(id==='all'));}
byId('product-search').addEventListener('input',()=>{if(byId('product-search').value.trim())chooseLane('all');});chooseLane(lane);
// Remove the literal escaped newline left between original section tags.
for(const n of document.querySelector('.admin-main').childNodes){if(n.nodeType===Node.TEXT_NODE&&n.textContent.trim()==='\\n')n.textContent='';}
function onView(view){
 if(view==='customers')selectAdminSubtab('customers','orders');
 const paneRoot={studio:'content-studio',video:'video-studio-section',publisher:'publisher-section'}[view];if(paneRoot){const p=panes.get(paneRoot);p.choose(p.entries[0].def.key);}
 if(view==='products')chooseLane(byId('product-search').value.trim()?'all':'pending-products-details');
 document.body.dataset.kblView=view;title.textContent=viewCopy[view]?.[0]||'KBL Control Center';subtitle.textContent=viewCopy[view]?.[1]||'';
 const active=document.querySelector('#admin-nav [data-admin-view="'+view+'"]');if(active?.parentElement.tagName==='DETAILS')active.parentElement.open=true;
}
window.KBLCompactAdmin={onView,panes};
let current=document.querySelector('#admin-nav [data-admin-view].active')?.dataset.adminView||'dashboard';showAdminView(current,false);
})();

  