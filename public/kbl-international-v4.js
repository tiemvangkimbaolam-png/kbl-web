(()=>{
'use strict';
const K={lang:'kbl_lang_v4',currency:'kbl_currency_v4',fx:'kbl_fx_vcb_sell_v4_19'};
const state={lang:'vi',currency:'VND',vndPerUsd:0,fxDate:'',fxRateType:'USD_SELL',catalog:new Map(),shipping:null,config:null,ssrEnglish:false,nativeFetch:window.fetch.bind(window),catalogPending:0};
const KBL_TRANSLATE_CLIENT_CACHE='kbl_translate_client_v1';
let kblClientTranslations={};
try{kblClientTranslations=JSON.parse(sessionStorage.getItem(KBL_TRANSLATE_CLIENT_CACHE)||'{}')||{}}catch(_){kblClientTranslations={}}
const kblTranslateInflight=new Map();
let kblStaticTranslatePromise=null,kblHydrationTimer=null,kblHydrationBusy=false,kblLastHydrationAt=0;
const idle=(fn,timeout=1200)=>{if('requestIdleCallback'in window)return requestIdleCallback(fn,{timeout});return setTimeout(fn,Math.min(timeout,250))};
function saveClientTranslations(){try{const rows=Object.entries(kblClientTranslations);if(rows.length>900)kblClientTranslations=Object.fromEntries(rows.slice(-700));sessionStorage.setItem(KBL_TRANSLATE_CLIENT_CACHE,JSON.stringify(kblClientTranslations))}catch(_){}}
function clientTranslationKey(source,target,scope,text){return [source,target,scope,String(text||'')].join('\u001f')}
function prefetchLang(lang){if(!['vi','en'].includes(lang)||lang===state.lang)return;const url=localizedPath(lang)+(location.search||'')+(location.hash||'');state.nativeFetch(url,{method:'GET',credentials:'same-origin',cache:'no-store',headers:{'X-KBL-Prefetch':'1'}}).catch(()=>{})}
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const num=v=>Number(v)||0;
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const countries=[['US','United States'],['AU','Australia'],['CA','Canada'],['GB','United Kingdom'],['DE','Germany'],['FR','France'],['SG','Singapore'],['JP','Japan'],['KR','South Korea'],['TH','Thailand'],['MY','Malaysia'],['NZ','New Zealand']];
const countryName=code=>(countries.find(x=>x[0]===code)||[code,code])[1];
function regionName(code){try{return new Intl.DisplayNames(['en'],{type:'region'}).of(String(code||'').toUpperCase())||countryName(code)}catch(_){return countryName(code)}}
function configuredCountryCodes(){const rows=state.config?.settings?.quoteCountries;return Array.isArray(rows)&&rows.length?rows.map(x=>String(x||'').toUpperCase()).filter(Boolean):countries.map(x=>x[0])}
function countryOptionsHtml(){return configuredCountryCodes().map(code=>`<option value="${esc(code)}">${esc(regionName(code))}</option>`).join('')}
function explicitLang(){const x=String(window.__KBL_INITIAL_LOCALE__||'').toLowerCase();if(x==='en'||x==='vi')return x;if(location.pathname==='/en'||location.pathname.startsWith('/en/'))return'en';if(location.pathname==='/vi'||location.pathname.startsWith('/vi/'))return'vi';return''}
function detectLang(){const explicit=explicitLang();if(explicit)return explicit;try{const x=localStorage.getItem(K.lang);if(x==='vi'||x==='en')return x}catch(_){}const nav=(navigator.languages&&navigator.languages[0])||navigator.language||'vi';return /^vi\b/i.test(nav)?'vi':'en'}
function detectCurrency(lang){try{const x=localStorage.getItem(K.currency);if(x==='VND'||x==='USD')return x}catch(_){}return lang==='en'?'USD':'VND'}
function save(){try{localStorage.setItem(K.lang,state.lang);localStorage.setItem(K.currency,state.currency)}catch(_){}}
function localizedPath(lang){let p=location.pathname||'/';if(/^\/(?:en|vi)(?:\/|$)/.test(p))p=p.replace(/^\/(?:en|vi)(?=\/|$)/,'');if(!p||p==='/')return lang==='en'?'/en':'/vi';return `/${lang}${p.startsWith('/')?p:'/'+p}`}
function switchLang(lang){if(!['vi','en'].includes(lang)||lang===state.lang)return;try{localStorage.setItem(K.lang,lang);localStorage.setItem(K.currency,lang==='en'?'USD':'VND')}catch(_){}document.documentElement.classList.add('kbl-lang-switching');location.href=localizedPath(lang)+(location.search||'')+(location.hash||'')}
function usd(v){return state.vndPerUsd>0?num(v)/state.vndPerUsd:0}
function money(v){if(state.currency==='USD'&&state.vndPerUsd>0)return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(usd(v));return new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(num(v))}
function gramsFromChi(v){return num(v)*3.75}
function localeCountry(){const l=((navigator.languages&&navigator.languages[0])||navigator.language||'').toUpperCase();const m=l.match(/-([A-Z]{2})$/),c=m&&m[1],allowed=configuredCountryCodes();return c&&allowed.includes(c)?c:(allowed.includes('US')?'US':(allowed[0]||'US'))}
const quick={'Khám phá':'Explore','Sản phẩm':'Jewelry','Bảng giá vàng':'Gold Prices','Thử trang sức':'Virtual Try-On','Liên hệ':'Support','Hồ sơ khách':'My Account','Đặt lịch':'Book Visit','Đăng nhập / Tạo TK':'Sign in / Register','Giỏ hàng':'Cart','Xem chi tiết':'View details','Thử sản phẩm':'Try on','Yêu thích':'Favorite','So sánh':'Compare','Chia sẻ':'Share','Còn hàng':'In stock','Mã SP':'SKU','Loại vàng':'Gold purity','Trọng lượng':'Weight','Công bán':'Workmanship','Giá tham khảo':'Estimated price','Tình trạng':'Availability','Còn hàng tại tiệm':'In stock at store','GIỮ MẪU':'RESERVE ITEM','Thêm giỏ':'Add to cart','Mua / VietQR':'Buy / Checkout','Hỏi AI mẫu này':'Ask AI','Gọi ngay':'Call','Đóng':'Close','Tổng giá tham khảo':'Estimated subtotal','Xóa giỏ':'Clear cart','Thanh toán / giữ hàng tự động':'Checkout / reserve item','Họ và tên':'Full name','Số điện thoại':'Phone number','Nhận hàng':'Delivery','Địa chỉ nhận hàng':'Shipping address','Tới tiệm giao dịch':'Visit store','Nhận hàng online':'Delivery','Hướng dẫn đo size nhẫn tại nhà':'Ring size guide','Bảo hành & làm sạch':'Warranty & cleaning','Thu đổi minh bạch':'Transparent exchange policy','Thanh toán & nhận hàng':'Payment & delivery','Câu hỏi thường gặp':'Frequently asked questions','Địa chỉ':'Address','Điện thoại':'Phone','Giờ mở cửa':'Opening hours','Dịch vụ khách hàng':'Customer service','Chính sách':'Policies','Kết nối với chúng tôi':'Connect with us','Phương thức thanh toán':'Payment methods','Tiền mặt':'Cash','Chuyển khoản':'Bank transfer'};
async function loadConfig(){try{const r=await state.nativeFetch('/api/international/config',{cache:'no-store'}),d=await r.json();if(r.ok&&d.success)state.config=d}catch(_){}return state.config}
function controls(){let host=$('.header-utilities')||$('.header-inner')||$('.site-header .container');if($('.kbl-intl-controls'))return;const d=document.createElement('div');d.className='kbl-intl-controls'+(host?'':' kbl-intl-floating');d.innerHTML=`<div class="kbl-intl-lang" aria-label="Language"><button type="button" data-lang="vi">VI</button><button type="button" data-lang="en">EN</button></div><select class="kbl-intl-select" id="kbl-currency" aria-label="Currency"><option value="VND">VND</option><option value="USD">USD</option></select>`;(host||document.body).appendChild(d);$$('[data-lang]',d).forEach(b=>{b.onclick=()=>switchLang(b.dataset.lang);b.addEventListener('pointerenter',()=>prefetchLang(b.dataset.lang),{passive:true});b.addEventListener('touchstart',()=>prefetchLang(b.dataset.lang),{passive:true,once:true})});$('#kbl-currency').onchange=e=>{state.currency=e.target.value;save();restoreMoney();updateControls();if(state.currency==='USD')loadFx().then(()=>convertVisibleMoney()).catch(()=>{})};updateControls()}
function updateControls(){$$('[data-lang]').forEach(b=>b.classList.toggle('active',b.dataset.lang===state.lang));const c=$('#kbl-currency');if(c)c.value=state.currency}
async function loadFx(){if(state.vndPerUsd>0)return;try{const cached=JSON.parse(sessionStorage.getItem(K.fx)||'null');if(cached&&cached.rate>0&&Date.now()-cached.at<5*60e3){state.vndPerUsd=cached.rate;state.fxDate=cached.date||'';return}}catch(_){}try{const r=await state.nativeFetch('/api/international/fx?base=USD&quote=VND',{cache:'no-store'}),d=await r.json();if(r.ok&&d.success&&num(d.rate)>0){state.vndPerUsd=num(d.rate);state.fxDate=d.date||'';state.fxRateType=d.rateType||'USD_SELL';try{sessionStorage.setItem(K.fx,JSON.stringify({rate:state.vndPerUsd,date:state.fxDate,at:Date.now()}))}catch(_){}}}catch(_){}}
function restoreMoney(){$$('[data-kbl-vnd]').forEach(el=>{el.textContent=new Intl.NumberFormat('vi-VN').format(Number(el.dataset.kblVnd))+' đ';delete el.dataset.kblVnd})}
function convertVisibleMoney(){if(state.currency!=='USD'||!state.vndPerUsd)return;$$('strong,.product-price,.cart-row-price,.ai-adviser-price,td').forEach(el=>{if(el.closest('.kbl-intl-result,.kbl-intl-checkout-quote')||el.dataset.kblVnd)return;const s=el.textContent.trim();if(!/(?:₫|đ|VND|VNĐ)/i.test(s))return;const digits=s.replace(/[^0-9]/g,'');if(!digits)return;const v=Number(digits);if(v<10000)return;el.dataset.kblVnd=String(v);el.textContent='≈ '+money(v)})}
async function translateBatch(texts,source='vi',target='en',scope='ui'){const items=[...new Set(texts.map(x=>String(x||'').trim()).filter(Boolean))].slice(0,80);if(!items.length)return{};const out={},misses=[];items.forEach(text=>{const hit=kblClientTranslations[clientTranslationKey(source,target,scope,text)];if(hit)out[text]=hit;else misses.push(text)});if(!misses.length)return out;const requestKey=[source,target,scope,...misses].join('\u001e');let pending=kblTranslateInflight.get(requestKey);if(!pending){pending=(async()=>{try{const r=await state.nativeFetch('/api/international/translate-batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:misses,source,target,scope})}),d=await r.json();if(r.ok&&d.success&&Array.isArray(d.items)){d.items.forEach(x=>{const text=x.text||x.source;out[x.source]=text;kblClientTranslations[clientTranslationKey(source,target,scope,x.source)]=text});saveClientTranslations()}}catch(_){}return out})().finally(()=>kblTranslateInflight.delete(requestKey));kblTranslateInflight.set(requestKey,pending)}else{const shared=await pending;Object.assign(out,shared)}await pending;return out}
const translatedNodes=new WeakSet(),translatedAttrs=new WeakSet();
function looksVietnameseText(t){return /[À-ỹĐđ]/u.test(String(t||''))||/\b(?:vàng|nhẫn|bông tai|lắc tay|mặt dây|sản phẩm|mua vào|bán ra|đơn vị|hôm nay|hôm qua|cập nhật|thử ngay|giá tham khảo|còn hàng|xem chi tiết|yêu thích|so sánh|chia sẻ|thêm giỏ)\b/i.test(String(t||''))}
function nodeCandidate(n){const p=n.parentElement;if(!p||translatedNodes.has(n)||['SCRIPT','STYLE','NOSCRIPT','CODE','PRE'].includes(p.tagName))return false;if(p.closest('.kbl-intl-controls,.kbl-intl-shipping,.kbl-intl-banner,.kbl-intl-payment-banner,.product-card,.ai-adviser-card,.compare-card,.kbl-intl-glass,.kbl-intl-product-note'))return false;const t=n.nodeValue.trim();if(t.length<2||t.length>420||!looksVietnameseText(t))return false;if(/^(?:KIM BẢO LÂM|Kim Bảo Lâm|KBL|Zalo|Facebook|VietQR|TikTok|YouTube|WhatsApp|PayPal|FedEx)$/i.test(t))return false;if(/^[\d\s.,:+\-/()%]+$/.test(t))return false;return true}
async function translateAttributes(){if(state.lang!=='en')return;const nodes=$$('[placeholder],[title],[aria-label]');const pending=[];nodes.forEach(el=>{if(translatedAttrs.has(el))return;['placeholder','title','aria-label'].forEach(a=>{const v=el.getAttribute(a);if(v&&/[À-ỹĐđ]/.test(v))pending.push({el,a,v})});translatedAttrs.add(el)});for(let i=0;i<pending.length;i+=60){const part=pending.slice(i,i+60),map=await translateBatch(part.map(x=>x.v),'vi','en','attributes');part.forEach(x=>{if(map[x.v])x.el.setAttribute(x.a,map[x.v])})}}
async function translateStaticPage(){if(state.lang!=='en')return;if(kblStaticTranslatePromise)return kblStaticTranslatePromise;kblStaticTranslatePromise=(async()=>{for(let round=0;round<2;round++){const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),nodes=[];while(w.nextNode())if(nodeCandidate(w.currentNode))nodes.push(w.currentNode);nodes.forEach(n=>{const t=n.nodeValue.trim();if(quick[t]){n.nodeValue=n.nodeValue.replace(t,quick[t]);translatedNodes.add(n)}});const pending=nodes.filter(n=>!translatedNodes.has(n)).slice(0,60);if(!pending.length)break;const map=await translateBatch(pending.map(n=>n.nodeValue.trim()),'vi','en','page-ui');pending.forEach(n=>{const raw=n.nodeValue,trim=raw.trim(),x=map[trim];if(x&&x!==trim)n.nodeValue=raw.replace(trim,x);translatedNodes.add(n)})}await translateAttributes()})().finally(()=>{kblStaticTranslatePromise=null});return kblStaticTranslatePromise}
async function loadEnglishCatalog(retry=true){if(state.lang!=='en')return;try{const r=await state.nativeFetch('/api/international/catalog?fast=1',{cache:'default'}),d=await r.json();if(!r.ok||!d.success||!Array.isArray(d.products))return;state.catalogPending=num(d.pending);state.catalog=new Map(d.products.map(x=>[String(x.id),x]));if(typeof products!=='undefined'&&Array.isArray(products)){let changed=false;products=products.map(p=>{const t=state.catalog.get(String(p.id));if(!t)return p;changed=true;return{...p,name:t.name||p.name,category:t.category||p.category,description:t.description||p.description,detail:t.detail||p.detail,warnings:t.warnings||p.warnings,sizeLabel:t.sizeLabel||p.sizeLabel,goldContentLabel:t.goldPurityLabel||p.goldContentLabel,__kblAutoEnglish:true}});if(changed&&typeof renderProducts==='function')renderProducts();if(changed&&typeof renderCart==='function')renderCart()}if(retry&&state.catalogPending>0)setTimeout(()=>loadEnglishCatalog(false).then(()=>scheduleEnglishHydration(100)).catch(()=>{}),4500)}catch(_){}}
function convertUnits(root=document){if(state.lang!=='en')return;$$('.product-card,#product-modal,.ai-adviser-card,.compare-card,#cart-modal',root).forEach(box=>{const w=document.createTreeWalker(box,NodeFilter.SHOW_TEXT),ns=[];while(w.nextNode())ns.push(w.currentNode);ns.forEach(n=>{n.nodeValue=n.nodeValue.replace(/([0-9]+(?:[.,][0-9]+)?)\s*chỉ/gi,(_,v)=>`${gramsFromChi(String(v).replace(',','.')).toLocaleString('en-US',{maximumFractionDigits:3})} g`)})})}
function enhanceProductCards(){if(state.lang!=='en')return;$$('.product-card,.ai-adviser-card,.compare-card').forEach(card=>{const body=card.querySelector('.product-body,.ai-adviser-card-body')||card;if(!body.querySelector('.kbl-intl-glass'))body.insertAdjacentHTML('beforeend','<div class="kbl-intl-glass">◇ Decorative stones, if present: ordinary glass</div>');if(card.classList.contains('product-card')&&!body.querySelector('.kbl-intl-ship-card')){const id=card.dataset.productId||card.querySelector('[data-product-id]')?.dataset.productId||card.querySelector('[data-open-product]')?.dataset.openProduct||'';if(id)body.insertAdjacentHTML('beforeend',`<button type="button" class="kbl-intl-ship-card" data-kbl-ship-product="${esc(id)}">CALCULATE SHIPPING →</button>`)}});$$('[data-kbl-ship-product]').forEach(b=>{if(b.dataset.bound)return;b.dataset.bound='1';b.onclick=()=>{const s=$('#kbl-intl-product');if(s)s.value=b.dataset.kblShipProduct;$('#international-shipping')?.scrollIntoView({behavior:'smooth',block:'start'})}})}
function whatsapp(){const old=$('.floating-zalo');if(!old||state.lang!=='en')return;const a=old.cloneNode(true);a.classList.remove('floating-zalo');a.classList.add('kbl-whatsapp');a.href='https://wa.me/84899979797';a.setAttribute('aria-label','WhatsApp Kim Bao Lam');const spans=a.querySelectorAll('span');if(spans[0])spans[0].textContent='W';if(spans[1])spans[1].textContent='WhatsApp';old.replaceWith(a)}

function setText(selector,text){const el=$(selector);if(el&&text!=null)el.textContent=text;return el}

function setAllText(selector,values){$$(selector).forEach((el,i)=>{const v=Array.isArray(values)?values[i]:values;if(v!=null&&el.textContent!==v)el.textContent=v})}
function replaceExactText(root,map){if(!root)return;const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(w.nextNode())nodes.push(w.currentNode);nodes.forEach(n=>{const raw=n.nodeValue,trim=raw.trim(),v=map[trim];if(v&&v!==trim)n.nodeValue=raw.replace(trim,v)})}
function localizeKnownEnglishUI(){
  if(state.lang!=='en')return;

  const exact={
    'Mua vào':'Buy','Bán ra':'Sell','Loại vàng':'Gold type','Tuổi / hàm lượng':'Purity','Đơn vị':'Unit','Biến động':'Change',
    'Hôm nay':'Today','Hôm qua':'Yesterday','7 ngày gần nhất':'Last 7 days','Ngày xem':'View date',
    'Đang đồng bộ từ POS':'Syncing from POS','↻ Làm mới':'↻ Refresh','Đang tải lịch sử từ POS…':'Loading history from POS…',
    'BỘ SƯU TẬP KIM BẢO LÂM':'KIM BAO LAM COLLECTION','Nổi bật':'Featured','Nhẫn':'Rings','Dây':'Chains','Mặt dây':'Pendants',
    'Bông tai':'Earrings','Lắc tay':'Bracelets','Vòng':'Bangles','Sản phẩm 9999 / 980':'9999 / 980 jewelry',
    'Xem tất cả sản phẩm':'View all jewelry','Sản phẩm có sẵn tại tiệm':'Available in store',
    'Mẫu đang có trong kho để ông xem trước và liên hệ giữ hàng.':'Current in-store jewelry available to view and reserve.',
    'Sản phẩm tham khảo & đặt hàng':'Reference & special-order jewelry',
    'Mẫu để tham khảo; tiệm sẽ xác nhận mẫu, giá và thời gian có hàng.':'Reference designs; KBL will confirm design, price and availability.',
    'Chưa có sản phẩm phù hợp trong nhóm hàng có sẵn.':'No matching in-stock jewelry.',
    'Chưa có sản phẩm tham khảo phù hợp.':'No matching reference jewelry.',
    'TRẢI NGHIỆM MỚI':'NEW EXPERIENCE','Thử trang sức bằng camera':'Virtual jewelry try-on',
    'Chọn món bạn thích và xem thử trên tay, cổ tay, cổ hoặc tai ngay trên điện thoại.':'Choose a piece and preview it on your hand, wrist, neck or ear on your phone.',
    '✋ Tay':'✋ Hand','◯ Cổ':'◯ Neck','◌ Tai':'◌ Ear','Thử ngay':'Try it now',
    'Bản thử nghiệm trực quan, size thực tế sẽ được xác nhận tại tiệm.':'Visual preview only; actual size will be confirmed before purchase.',
    'TIỆN ÍCH 01 · ĐO SIZE':'UTILITY 01 · SIZE GUIDE','Đo size tay trước khi chọn nhẫn':'Measure your finger before choosing a ring',
    'Xem hướng dẫn đo tại nhà, đối chiếu kích thước và chuẩn bị size trước khi đến tiệm. Kết quả online là bước tham khảo để chọn mẫu nhanh hơn.':'Follow the at-home measuring guide and compare dimensions before choosing a ring. Online sizing is an estimate and should be confirmed before purchase.',
    'Xem cách đo size':'View size guide','Thử bằng camera':'Try with camera','SIZE NHẪN · 12.6 mm':'RING SIZE · 12.6 mm',
    'TIỆN ÍCH 02 · AI TRY-ON':'UTILITY 02 · AI TRY-ON','Thử trang sức online ngay trên ảnh hoặc camera':'Try jewelry online using a photo or camera',
    'Chọn mẫu đang có trên website rồi thử trực quan trước khi giữ mẫu. AI hỗ trợ trải nghiệm hình ảnh; thông tin size, vàng và giá vẫn được đối chiếu từ dữ liệu thật của tiệm.':'Choose a live KBL item and preview it before reserving. AI is visual only; size, gold purity and price still come from verified KBL data.',
    'Thử trang sức ngay':'Try jewelry now','Chọn sản phẩm':'Choose jewelry','Thử trước khi đến tiệm':'Preview before visiting',
    'Nhìn nhanh kiểu dáng trên tay · cổ · tai.':'Preview the look on hand · neck · ear.',
    'TIỆN ÍCH 03 · TÍNH LÃI CẦM':'UTILITY 03 · PAWN ESTIMATE','Tính thử tiền lãi cầm theo đúng số ngày':'Estimate pawn interest by exact number of days',
    'Nhập số tiền, ngày cầm và ngày dự kiến chuộc. Website tự chọn mức lãi đang cài và cho kết quả tham khảo trước khi giao dịch.':'Enter the principal and dates to see an estimate based on the configured KBL rate.',
    'Tính thử ngay':'Estimate now','Tra cứu phiếu cầm':'Pawn lookup','TIỀN LÃI DỰ KIẾN':'ESTIMATED INTEREST',
    'Ví dụ minh họa · hệ thống sẽ tính từ dữ liệu ông nhập':'Example only · calculated from entered data','TÍNH':'CALCULATE',
    'TIỆN ÍCH 04 · GIÁ VÀNG LIVE':'UTILITY 04 · LIVE GOLD PRICES','Xem giá vàng cập nhật liên tục trên website':'View continuously updated gold prices',
    'Theo dõi giá mua – bán, nhiều loại vàng và lịch sử gần đây ngay trên trang. Khi tính sản phẩm hoặc tư vấn AI, hệ thống ưu tiên dữ liệu giá hiện tại của Kim Bảo Lâm.':'Track buy/sell prices, multiple gold purities and recent history. Product pricing and AI advice use current KBL data.',
    'Xem bảng giá':'View gold prices','Hỏi AI Kim Bảo Lâm':'Ask KBL AI','ĐANG CẬP NHẬT':'LIVE UPDATE','Giá hiện tại':'Current price','Mua · Bán':'Buy · Sell',
    'Còn hàng tại tiệm':'In stock','Tham khảo / đặt hàng':'Reference / order','Giá tham khảo':'Estimated price',
    'Xem chi tiết →':'View details →','✨ Thử sản phẩm':'✨ Try on','✨ Thử bằng AI':'✨ Try with AI','♡ Yêu thích':'♡ Favorite','♥ Đã thích':'♥ Favorited',
    '⇄ So sánh':'⇄ Compare','⇄ Đã chọn':'⇄ Selected','↗ Chia sẻ':'↗ Share','🛒 Thêm giỏ':'🛒 Add to cart','🛒 Đã thêm':'🛒 Added',
    'Chưa có ảnh thử':'Try-on image unavailable','🔗 Chọn dây để phối':'🔗 Choose a chain',
    'Vàng 9999':'Gold 9999','Vàng 980':'Gold 980','Vàng 750':'Gold 750','Vàng 610':'Gold 610','Vàng 585':'Gold 585','Vàng 416':'Gold 416'
  };
  replaceExactText(document.body,exact);
  // KBL V4.4.19 · VCB SELL CUSTOMER FX
// KBL V4.4.18 · FAST LANGUAGE / EN CACHE PERFORMANCE
  // KBL V4.4.17 · EN FINAL CLEANUP
  const finalExact={
    'KIM BẢO LÂM LẮNG NGHE':'KIM BAO LAM LISTENS',
    'Lời nhắn từ Kim Bảo Lâm':'A message from Kim Bao Lam',
    'Tham khảo thị trường':'Market reference',
    'Nguyên liệu':'Raw materials',
    'Giá vàng hôm nay':'Gold prices today',
    'Bảng giá vàng hôm nay':'Gold prices today',
    'Lịch sử vàng 9999 · 7 ngày':'Gold 9999 · 7-day history',
    'Xem ngày':'View date',
    'Tìm sản phẩm…':'Search jewelry…',
    'Tìm sản phẩm...':'Search jewelry…',
    'Đang cập nhật':'Updating',
    'Đang tải':'Loading',
    'Đang tải…':'Loading…',
    'Xem thêm':'View more',
    'Thu gọn':'Show less'
  };
  replaceExactText(document.body,finalExact);
  setText('.market-tab[data-market="shop"]','Kim Bao Lam');
  setText('.market-tab[data-market="reference"]','Market reference');
  setText('.market-tab[data-market="raw"]','Raw materials');

  // Price table / cards, including dynamic rows.
  const th=['Gold type','Buy','Sell','Purity','Unit','Change'];
  setAllText('.price-table thead th',th);
  setText('.price-board-head .eyebrow','PRICE CHART DETAILS');
  setText('.price-board-head h3','KBL prices · market reference · 7-day history');
  setText('.price-history-row strong','Gold 9999 · 7-day history');
  const dateLabel=$('.date-filter');if(dateLabel&&dateLabel.childNodes[0])dateLabel.childNodes[0].nodeValue='View date ';
  const opts=$$('#price-date option');if(opts[0])opts[0].textContent='Today';if(opts[1])opts[1].textContent='Yesterday';if(opts[2])opts[2].textContent='Last 7 days';
  $$('.price-card h3,.price-table tbody td:first-child').forEach(el=>{el.textContent=el.textContent.replace(/^Vàng\b/i,'Gold')});
  $$('.price-card .price-value span').forEach(el=>{if(/Mua vào/i.test(el.textContent))el.textContent='Buy';else if(/Bán ra/i.test(el.textContent))el.textContent='Sell'});
  $$('.price-table tbody td').forEach(el=>{
    if(/VNĐ\/chỉ/i.test(el.textContent))el.textContent=state.currency==='USD'?'USD / chi':'VND / chi';
    if(/Vàng\s+/i.test(el.textContent))el.textContent=el.textContent.replace(/^Vàng\b/i,'Gold');
  });
  $$('.price-card small,.price-card .price-change,.price-change').forEach(el=>{
    el.textContent=el.textContent
      .replace(/so với lần cập nhật trước/gi,'vs previous update')
      .replace(/hôm nay/gi,'today');
  });
  const cap=$('#history-caption');if(cap){
    cap.textContent=cap.textContent
      .replace(/ngày có dữ liệu/gi,'days with data')
      .replace(/cập nhật tự động từ POS/gi,'auto-synced from POS')
      .replace(/Đang tải lịch sử từ POS/gi,'Loading history from POS');
  }

  // Featured catalog and lanes.
  setText('#products .section-heading .eyebrow','KIM BAO LAM COLLECTION');
  setText('#products .section-heading h2','Featured jewelry');
  const sub=$('#products .section-subtitle');if(sub)sub.textContent='Current jewelry selected from live KBL inventory. Product names and descriptions in English are generated from verified Vietnamese source data.';
  const allLink=$('#products .section-heading .text-link');if(allLink)allLink.innerHTML='View all jewelry <span>→</span>';
  setAllText('.filter-tabs .filter-tab',['Featured','Rings','Chains','Pendants','Earrings','Bracelets','Bangles','9999 / 980 jewelry']);
  const search=$('#product-search');if(search)search.placeholder='Search jewelry…';
  setText('#available-products-title','Available in store');
  const avp=$('#available-products-title')?.parentElement?.querySelector('p');if(avp)avp.textContent='Current in-store jewelry available to view and reserve.';
  setText('#reference-products-title','Reference & special-order jewelry');
  const rfp=$('#reference-products-title')?.parentElement?.querySelector('p');if(rfp)rfp.textContent='Reference designs; KBL will confirm design, price and availability.';
  setText('#product-empty-available','No matching in-stock jewelry.');
  setText('#product-empty-reference','No matching reference jewelry.');

  // Product cards generated dynamically by the Vietnamese master renderer.
  $$('.product-card').forEach(card=>{
    const stock=card.querySelector('.stock-chip');if(stock){
      if(/Tham khảo/i.test(stock.textContent))stock.textContent='Reference / order';
      else stock.textContent='In stock';
    }
    const gold=card.querySelector('.gold-chip');if(gold)gold.textContent=gold.textContent.replace(/^Vàng\b/i,'Gold');
    const meta=card.querySelector('.product-meta');if(meta)replaceExactText(meta,{'Nhẫn':'Ring','Dây':'Chain','Mặt dây':'Pendant','Bông tai':'Earrings','Lắc tay':'Bracelet','Vòng':'Bangle'});
    const priceNote=card.querySelector('.product-price small');if(priceNote)priceNote.textContent='Estimated price';
    const open=card.querySelector('[data-product-open]');if(open)open.textContent='View details →';
    const tryBtn=card.querySelector('.product-try-button');if(tryBtn){
      if(tryBtn.hasAttribute('data-pendant-compose'))tryBtn.textContent='🔗 Choose a chain';
      else if(tryBtn.classList.contains('unavailable'))tryBtn.textContent='Try-on image unavailable';
      else tryBtn.textContent='✨ Try with AI';
    }
    const fav=card.querySelector('.product-fav');if(fav)fav.textContent=fav.classList.contains('active')?'♥ Favorited':'♡ Favorite';
    const cmp=card.querySelector('.product-compare');if(cmp)cmp.textContent=cmp.classList.contains('active')?'⇄ Selected':'⇄ Compare';
    const share=card.querySelector('.product-share');if(share)share.textContent='↗ Share';
    const cart=card.querySelector('.product-cart');if(cart)cart.textContent=cart.classList.contains('active')?'🛒 Added':'🛒 Add to cart';
  });

  // Main try-on card.
  const tryCard=$('#try-on .tryon-card');
  if(tryCard){
    setText('#try-on .tryon-card .eyebrow','NEW EXPERIENCE');
    setText('#try-on .tryon-card h2','Virtual jewelry try-on');
    const p=tryCard.querySelector('.feature-content > p:not(.eyebrow)');if(p)p.textContent='Choose a piece and preview it on your hand, wrist, neck or ear on your phone.';
    setAllText('#try-on .tryon-types span',['✋ Hand','◯ Neck','◌ Ear']);
    const b=tryCard.querySelector('[data-open-tryon]');if(b)b.innerHTML='Try it now <span>→</span>';
    const sm=tryCard.querySelector('.feature-disclaimer');if(sm)sm.textContent='Visual preview only; actual size will be confirmed before purchase.';
  }

  // Utility slider.
  const slides=$$('.kbl-slide');
  const slider=[
    ['UTILITY 01 · SIZE GUIDE','Measure your finger before choosing a ring','Follow the at-home measuring guide and compare dimensions before choosing a ring. Online sizing is an estimate and should be confirmed before purchase.','View size guide','Try with camera'],
    ['UTILITY 02 · AI TRY-ON','Try jewelry online using a photo or camera','Choose a live KBL item and preview it before reserving. AI is visual only; size, gold purity and price still come from verified KBL data.','Try jewelry now','Choose jewelry'],
    ['UTILITY 03 · PAWN ESTIMATE','Estimate pawn interest by exact number of days','Enter the principal and dates to see an estimate based on the configured KBL rate.','Estimate now','Pawn lookup'],
    ['UTILITY 04 · LIVE GOLD PRICES','View continuously updated gold prices','Track buy/sell prices, multiple gold purities and recent history. Product pricing and AI advice use current KBL data.','View gold prices','Ask KBL AI']
  ];
  slides.forEach((s,i)=>{const x=slider[i];if(!x)return;setText('.kbl-slide[data-kbl-slide="'+i+'"] .kbl-slide-kicker',x[0]);setText('.kbl-slide[data-kbl-slide="'+i+'"] .kbl-slide-copy h2',x[1]);const p=s.querySelector('.kbl-slide-copy>p:not(.kbl-slide-kicker)');if(p)p.textContent=x[2];const a=s.querySelectorAll('.kbl-slide-actions>*');if(a[0])a[0].innerHTML=x[3]+' <span>→</span>';if(a[1])a[1].textContent=x[4]});
  setText('.kbl-size-chip','RING SIZE · 12.6 mm');

  // Modal/detail buttons that are regenerated after clicks.
  const modalMap={
    '♡ Yêu thích':'♡ Favorite','♥ Đã yêu thích':'♥ Favorited','⇄ So sánh':'⇄ Compare','✓ Đang so sánh':'✓ Comparing',
    '↗ Chia sẻ':'↗ Share','🛒 Thêm giỏ':'🛒 Add to cart','🛒 Đã thêm giỏ':'🛒 Added','💳 Mua / VietQR':'💳 Buy / Checkout',
    '💬 Hỏi AI mẫu này':'💬 Ask AI','✨ Thử AI':'✨ Try with AI','☎ Gọi ngay':'☎ Call now'
  };
  replaceExactText($('#product-modal'),modalMap);
}
async function localizeProductNamesFallback(){
  if(state.lang!=='en')return;
  const nodes=$$('.product-card .product-title-row h3,.ai-adviser-card h4').filter(el=>looksVietnameseText(el.textContent));
  const names=[...new Set(nodes.map(el=>el.textContent.trim()).filter(Boolean))].slice(0,60);
  if(!names.length)return;
  const map=await translateBatch(names,'vi','en','product-name-ui');
  nodes.forEach(el=>{const raw=el.textContent.trim(),v=map[raw];if(v&&v!==raw)el.textContent=v});
}
function internationalStorefront(){
  if(state.lang!=='en'||document.body.classList.contains('kbl-international-storefront'))return;
  document.body.classList.add('kbl-international-storefront');
  const brand=$('.brand');if(brand){brand.setAttribute('href','/en');brand.setAttribute('aria-label','Kim Bao Lam Jewelry - International home')}
  setText('.brand-copy strong','KIM BAO LAM JEWELRY');setText('.brand-copy small','Vietnamese Gold Jewelry · Ho Chi Minh City');
  const nav=$('#main-nav');if(nav){nav.setAttribute('aria-label','International navigation');nav.innerHTML='<a class="active" href="#home">Home</a><a href="#products">Jewelry</a><a href="#prices">Gold Market</a><a href="#try-on">Virtual Try-On</a><a href="#guide">Size Guide</a><a href="#international-shipping">Shipping</a><a href="#contact">Support</a><a href="/en/khach-hang">My Account</a>'}
  const account=$('#header-account-link');if(account){account.href='/en/dang-nhap?return=%2Fen';account.setAttribute('aria-label','Sign in or create account')}
  setText('#header-account-text','Sign in / Register');const cart=$('#header-cart-button');if(cart)cart.setAttribute('aria-label','Open shopping cart');setText('.header-cart .cart-label','Cart');
  const booking=$('.header-action');if(booking){booking.innerHTML='<span class="user-icon" aria-hidden="true">◉</span> Book visit'}
  setText('.hero .light-eyebrow','KIM BAO LAM JEWELRY · HO CHI MINH CITY, VIETNAM');
  const title=$('.hero-title-luxury');if(title)title.innerHTML='<span>VIETNAMESE GOLD JEWELRY</span><span><em>PRICED WITH TRANSPARENCY</em></span>';
  const lead=$('.hero-lead');if(lead)lead.innerHTML='Verified KBL/POS product data and transparent gold pricing.<br>USD uses the Vietcombank USD buying rate · International checkout with secure server-side validation.';
  const heroBtns=$$('.hero-actions .btn');if(heroBtns[0]){heroBtns[0].href='#products';heroBtns[0].innerHTML='SHOP JEWELRY <span>→</span>'}if(heroBtns[1]){heroBtns[1].href='#international-shipping';heroBtns[1].innerHTML='SHIPPING & DUTIES <span>→</span>'}
  setText('.hero-quick-form-copy strong','INTERNATIONAL TOOLS');setText('.hero-quick-form-copy small','Shop, size and shipping');
  const tool=$('#hero-tool-select');if(tool)tool.innerHTML='<option value="#prices">Gold market & Vietcombank USD</option><option value="#guide">International ring size guide</option><option value="tryon">Virtual jewelry try-on</option><option value="#international-shipping">International shipping quote</option>';
  const toolGo=$('.hero-tool-go');if(toolGo)toolGo.innerHTML='OPEN <span aria-hidden="true">→</span>';
  const benefits=$$('.hero-benefit-row--master .hero-benefit');const b=[['◎','Ships from Vietnam','Ho Chi Minh City'],['$','USD via Vietcombank','USD buying rate'],['P','Secure PayPal checkout','Server-verified amount'],['✦','International support','WhatsApp +84 899 979 797']];benefits.forEach((el,i)=>{if(!b[i])return;const icon=el.querySelector('.benefit-icon'),strong=el.querySelector('strong'),small=el.querySelector('small');if(icon)icon.textContent=b[i][0];if(strong)strong.textContent=b[i][1];if(small)small.textContent=b[i][2]});
  setText('.price-heading h2','Gold prices today');setText('.price-board-head h3','KBL prices · market reference · 7-day history');
  const tabs=$$('.market-tab');if(tabs[0])tabs[0].textContent='Kim Bao Lam';if(tabs[1])tabs[1].textContent='Market reference';if(tabs[2])tabs[2].textContent='Raw materials';
  const prodHead=$('#products .section-heading h2,#products h2');if(prodHead)prodHead.textContent='Featured jewelry';
  const prodIntro=$('#products .section-heading p:not(.eyebrow)');if(prodIntro)prodIntro.textContent='Current jewelry selected from live KBL inventory. Product names and descriptions in English are generated from the verified Vietnamese source data.';
  const contact=$('#contact h2');if(contact)contact.textContent='International customer support';
  destinationBar();
}
function destinationBar(){
  if(state.lang!=='en'||$('.kbl-intl-destination-bar'))return;
  const header=$('#site-header');if(!header)return;
  const d=document.createElement('div');d.className='kbl-intl-destination-bar';d.innerHTML=`<div class="kbl-intl-destination-inner"><div class="kbl-intl-worldmark"><span>✦</span><b>KBL INTERNATIONAL</b><small>Vietnam → Worldwide</small></div><label>Ship to <select id="kbl-intl-destination">${countryOptionsHtml()}</select></label><span class="kbl-intl-fx-note">USD = Vietcombank <b>BUY</b> rate</span><span class="kbl-intl-pay-note">PayPal checkout · FedEx quote when available</span><a href="https://wa.me/84899979797" target="_blank" rel="noopener">WhatsApp</a></div>`;
  header.insertAdjacentElement('afterend',d);
  const sel=$('#kbl-intl-destination');if(sel){sel.value=localeCountry();sel.addEventListener('change',()=>{const c=$('#kbl-intl-country');if(c)c.value=sel.value;try{sessionStorage.setItem('kbl_intl_destination',sel.value)}catch(_){}});try{const saved=sessionStorage.getItem('kbl_intl_destination');if(saved&&Array.from(sel.options).some(o=>o.value===saved))sel.value=saved}catch(_){}}
}

function banner(){if(state.lang!=='en'||$('.kbl-intl-banner'))return;const main=$('main')||document.body,d=document.createElement('div');d.className='kbl-intl-banner';d.innerHTML='<div><b>International visitors</b> · English copy is generated from the current Vietnamese KBL/POS data. USD uses the Vietcombank USD buying rate (Mua vào); checkout recalculates and locks the current rate on the server.</div><button type="button">International shipping</button>';main.insertAdjacentElement('beforebegin',d);d.querySelector('button').onclick=()=>$('#international-shipping')?.scrollIntoView({behavior:'smooth'})}
function paymentResultBanner(){const q=new URLSearchParams(location.search),st=q.get('intl_payment');if(!st)return;const d=document.createElement('div');d.className='kbl-intl-payment-banner'+(st==='success'?'':' error');const id=q.get('order')||'';d.innerHTML=`<button type="button" aria-label="Close">×</button>${st==='success'?`✓ Payment completed${id?' for order <b>'+esc(id)+'</b>':''}. KBL will prepare the shipment and update tracking after carrier handoff.`:`Payment was not completed${id?' for order <b>'+esc(id)+'</b>':''}. Your item has not been marked as paid.`}`;($('main')||document.body).insertAdjacentElement('beforebegin',d);d.querySelector('button').onclick=()=>d.remove()}
function rewriteLocalizedLinks(){const lang=state.lang;$$('a[href^="/"]').forEach(a=>{const h=a.getAttribute('href')||'';if(/^\/(?:api|uploads|pwa)(?:\/|$)/.test(h)||/^\/(?:en|vi)(?:\/|$)/.test(h)||['/','/home','/index.html','/admin','/tv','/remote'].includes(h))return;if(/^(?:\/chinh-sach|\/dieu-kien|\/huong-dan|\/bo-chinh-sach|\/thong-tin-doanh-nghiep|\/quy-trinh|\/hinh-thuc)/.test(h))a.setAttribute('href',`/${lang}${h}`)})}
function shippingProductIds(){const v=$('#kbl-intl-product')?.value||'';if(v==='__cart__'&&typeof cartProducts==='function')return cartProducts().map(p=>String(p.id));return v?[v]:[]}
function shippingSection(){if(state.lang!=='en'||$('#international-shipping'))return;const productsSec=$('#products')||$('.products-section');if(!productsSec)return;const s=document.createElement('section');s.id='international-shipping';s.className='kbl-intl-shipping';s.innerHTML=`<h2>International shipping & delivered total</h2><p>Choose the item or current cart and destination. KBL keeps Vietnamese POS prices as the source of truth. FedEx rates are live only when the KBL carrier account is configured; country eligibility and high-value orders can still require manual confirmation.</p><div class="kbl-intl-grid"><form class="kbl-intl-form" id="kbl-intl-form"><label class="kbl-intl-wide">Jewelry item / cart<select name="productId" id="kbl-intl-product" required><option value="">Select an item</option></select></label><label>Country<select name="country" id="kbl-intl-country" required>${countryOptionsHtml()}</select></label><label>Postal / ZIP code<input name="postalCode" autocomplete="postal-code" required></label><label>State / Province<input name="state"></label><label>City<input name="city" required></label><label class="kbl-intl-wide">Full address<input name="address" autocomplete="street-address"></label><button class="kbl-intl-calc" type="submit">CALCULATE DELIVERED TOTAL →</button></form><div class="kbl-intl-result" id="kbl-intl-result"><b>Estimated delivered total</b><p>Choose your destination to calculate shipping. Duties/taxes remain estimates unless KBL explicitly confirms a duties-paid service.</p></div></div>`;productsSec.insertAdjacentElement('afterend',s);$('#kbl-intl-country').value=localeCountry();$('#kbl-intl-form').addEventListener('submit',estimateInternational);populateShippingProducts()}
function populateShippingProducts(){const sel=$('#kbl-intl-product');if(!sel)return;let list=[];if(typeof products!=='undefined'&&Array.isArray(products))list=products;const current=sel.value,cart=(typeof cartProducts==='function'?cartProducts():[]);sel.innerHTML='<option value="">Select an item</option>'+(cart.length?`<option value="__cart__">Current cart · ${cart.length} item${cart.length>1?'s':''}</option>`:'')+list.map(p=>`<option value="${esc(p.id)}">${esc(p.name||p.sku||p.id)} · ${esc(p.sku||'')}</option>`).join('');if(current&&Array.from(sel.options).some(o=>o.value===current))sel.value=current}
function quoteHtml(q){
  const itemVnd=num(q.itemValueVnd),shipVnd=num(q.shippingVnd),dutiesVnd=num(q.dutiesTaxesVnd);
  const carrierQuoted=Boolean(q.carrierQuoted);
  const totalVnd=carrierQuoted?num(q.deliveredTotalVnd):0;
  const payVnd=carrierQuoted?num(q.payNowVnd):0;
  const shippingText=carrierQuoted
    ? (shipVnd?('≈ '+money(shipVnd)):'≈ '+money(0))
    : 'Pending FedEx / KBL confirmation';
  const dutiesText=carrierQuoted
    ? (dutiesVnd?('≈ '+money(dutiesVnd)):(q.dutiesMode==='receiver'?'Not charged now · destination assessment':'Estimated 0 · subject to customs'))
    : 'Pending carrier / customs assessment';
  const totalText=carrierQuoted&&totalVnd
    ? ('≈ '+money(totalVnd))
    : 'NOT YET CALCULATED';
  return `<b class="${q.requiresConfirmation?'warn':'ok'}">${q.requiresConfirmation?'Confirmation required':'Estimated quote available'}</b>
  <div class="row"><span>Items · POS base</span><strong>${itemVnd?('≈ '+money(itemVnd)):'—'}</strong></div>
  ${Number(q.internationalAdjustmentVnd||0)>0?`<div class="row"><span>International processing</span><strong>≈ ${money(Number(q.internationalAdjustmentVnd||0))}</strong></div>`:''}
  <div class="row"><span>Shipping${q.serviceName?' · '+esc(q.serviceName):''}</span><strong>${shippingText}</strong></div>
  <div class="row"><span>Duties & taxes</span><strong>${dutiesText}</strong></div>
  <div class="row total"><span>${carrierQuoted?'Estimated delivered total':'Delivered total'}</span><strong>${totalText}</strong></div>
  ${payVnd&&q.paymentEligible?`<div class="paynow">Pay-now amount: ≈ ${money(payVnd)} ${q.dutiesMode==='receiver'?'· duties/taxes, if any, are not charged now':''}</div>`:''}
  ${q.profitProtected?'<span class="note"><b>KBL margin protection:</b> international processing is calculated server-side from the POS base price, live carrier cost and cross-border payment costs. Private cost data is never exposed.</span>':''}
  <span class="note">${esc(q.message||'Rates and duties are estimates until carrier/customs confirmation. A carrier rate does not by itself confirm customs or precious-jewelry eligibility.')} ${q.transitDays?`Estimated transit: ${esc(q.transitDays)}.`:''}</span>
  <span class="kbl-intl-provider">${esc(q.provider||'FedEx')} · ${q.paymentProviderConfigured?'PayPal checkout configured':'international payment pending setup'}</span>`;
}
async function estimateInternational(e){e.preventDefault();const f=e.currentTarget,o=Object.fromEntries(new FormData(f).entries()),ids=shippingProductIds(),box=$('#kbl-intl-result');if(!ids.length){box.innerHTML='<b class="error">Select an item or current cart.</b>';return}delete o.productId;o.productIds=ids;box.innerHTML='<p>Checking destination, eligibility and carrier rates…</p>';try{const r=await state.nativeFetch('/api/shipping/international/estimate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Quote unavailable');state.shipping=d.quote||null;box.innerHTML=quoteHtml(d.quote||{})}catch(err){box.innerHTML=`<b class="error">Quote unavailable</b><p>${esc(err.message)}</p><p><a href="https://wa.me/84899979797" target="_blank" rel="noopener">Contact KBL on WhatsApp: +84 899 979 797</a></p>`}}
function patchRingCalculator(){if(state.lang!=='en')return;const input=$('#guide-ring-diameter'),result=$('#guide-ring-size-result'),btn=$('#guide-ring-size-button');if(!input||!result||input.dataset.kblIntl==='1')return;input.dataset.kblIntl='1';const table=[[13,1,'C'],[13.8,2.5,'E'],[14.4,3.5,'G'],[14.8,4,'H'],[15.3,4.5,'I½'],[15.6,5,'J½'],[15.9,5.5,'K½'],[16.5,6,'M'],[16.9,6.5,'N'],[17.2,7,'O'],[17.8,7.5,'Q'],[18.2,8,'Q½'],[18.5,8.5,'R½'],[18.8,9,'S½'],[19.2,9.5,'T½'],[19.5,10,'U'],[19.8,10.5,'V'],[20.2,11,'W'],[20.5,11.5,'W½'],[20.8,12,'X½'],[21.2,12.5,'Y'],[21.5,13,'Z'],[22.2,14,'Z+2']];const run=()=>{const d=Number(String(input.value||'').replace(',','.'));if(!d||d<10||d>30){result.innerHTML='<strong>Enter the inner diameter in millimeters.</strong>';return}const row=table.reduce((a,b)=>Math.abs(b[0]-d)<Math.abs(a[0]-d)?b:a,table[0]),eu=Math.round(Math.PI*d);result.innerHTML=`<strong>Approx. US ${row[1]} · UK ${row[2]} · EU ${eu}</strong><span style="display:block;margin-top:4px">Inner diameter ${d.toFixed(1)} mm. Size conversion is approximate; confirm before ordering.</span>`};btn?.addEventListener('click',ev=>{ev.preventDefault();ev.stopImmediatePropagation();run()},true);input.addEventListener('input',run)}
function patchCheckout(){const form=$('#v5-checkout-form');if(!form||form.dataset.kblIntlV3)return;form.dataset.kblIntlV3='1';const rows=form.querySelectorAll('.v5-checkout-row'),row=rows[1]||rows[0];if(row&&!form.elements.country){const wrap=document.createElement('div');wrap.className='v5-checkout-row kbl-intl-checkout-address';wrap.innerHTML=`<label>Country<select name="country"><option value="VN">Vietnam</option>${countryOptionsHtml()}</select></label><label>Postal / ZIP<input name="postalCode" autocomplete="postal-code"></label><label>State / Province<input name="state"></label><label>City<input name="city"></label>`;row.insertAdjacentElement('afterend',wrap);const q=document.createElement('div');q.id='kbl-intl-checkout-quote';q.className='kbl-intl-checkout-quote';q.innerHTML='<strong>International checkout</strong><br>Shipping and payment eligibility are recalculated securely by the server when you submit.';wrap.insertAdjacentElement('afterend',q)}
const refresh=()=>{const c=form.elements.country?.value||'VN',btn=form.querySelector('button[type=submit]');$$('.kbl-intl-checkout-address label:not(:first-child)').forEach(x=>x.style.display=c==='VN'?'none':'grid');if(btn&&state.lang==='en')btn.innerHTML=c==='VN'?'CREATE ORDER / VIETQR →':'CHECK SHIPPING & CONTINUE →';const q=$('#kbl-intl-checkout-quote');if(q)q.style.display=c==='VN'?'none':'block'};form.elements.country&&(form.elements.country.value=state.lang==='en'?localeCountry():'VN');form.addEventListener('change',refresh);refresh();form.addEventListener('submit',async ev=>{const c=form.elements.country?.value||'VN';if(c==='VN')return;ev.preventDefault();ev.stopImmediatePropagation();const button=form.querySelector('button[type=submit]'),box=$('#v5-checkout-result'),qbox=$('#kbl-intl-checkout-quote');if(button)button.disabled=true;if(qbox)qbox.innerHTML='<strong>Checking live shipping and payment…</strong>';try{const payload=Object.fromEntries(new FormData(form).entries()),ids=JSON.parse(form.dataset.productIds||'[]');payload.productIds=ids;const r=await state.nativeFetch('/api/international/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Unable to create international checkout');if(qbox&&d.quote)qbox.innerHTML=quoteHtml(d.quote);if(d.paymentReady&&d.approvalUrl){if(box){box.innerHTML=`✅ International order <b>${esc(d.order.id)}</b> created.<br>Redirecting to secure PayPal checkout…`;box.classList.remove('hidden')}setTimeout(()=>{location.href=d.approvalUrl},500);return}if(box){box.innerHTML=`✅ International request <b>${esc(d.order.id)}</b> created.<br>${esc(d.message||'KBL will confirm shipping/payment before charging.')}<br><a class="kbl-paypal-link" href="${esc(d.whatsapp||'https://wa.me/84899979797')}" target="_blank" rel="noopener">CONTINUE ON WHATSAPP →</a>`;box.classList.remove('hidden')}}catch(err){if(box){box.textContent='❌ '+err.message;box.classList.remove('hidden')}if(qbox)qbox.innerHTML='<strong>Unable to continue:</strong> '+esc(err.message)}finally{if(button)button.disabled=false}},true)}
function patchAiFetch(){if(state.lang!=='en'||window.fetch.__kblIntlV3)return;const native=state.nativeFetch;const wrapped=async(input,init={})=>{const url=typeof input==='string'?input:(input&&input.url)||'';if(!/\/api\/adviser\/(?:recommend|image|select)/.test(url)||!init||!init.body)return native(input,init);let body;try{body=JSON.parse(init.body)}catch(_){return native(input,init)}try{const fields=[body.message||'',...(Array.isArray(body.context)?body.context:[])].filter(Boolean);if(fields.length){const map=await translateBatch(fields,'en','vi','ai-input');if(body.message&&map[body.message])body.message=map[body.message];if(Array.isArray(body.context))body.context=body.context.map(x=>map[x]||x)}body.preferredLanguage='en';const resp=await native(input,{...init,body:JSON.stringify(body)}),payload=await resp.clone().json().catch(()=>null);if(!payload||!resp.ok)return resp;const outs=[payload.reply,payload.summary,payload.message].filter(x=>typeof x==='string'&&x.trim());if(outs.length){const map=await translateBatch(outs,'vi','en','ai-output');if(payload.reply)payload.reply=map[payload.reply]||payload.reply;if(payload.summary)payload.summary=map[payload.summary]||payload.summary;if(payload.message)payload.message=map[payload.message]||payload.message}return new Response(JSON.stringify(payload),{status:resp.status,statusText:resp.statusText,headers:{'Content-Type':'application/json'}})}catch(_){return native(input,init)}};wrapped.__kblIntlV4=true;window.fetch=wrapped}
function markInitialTranslated(){if(!state.ssrEnglish)return;const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(w.nextNode()){const n=w.currentNode;if(!looksVietnameseText(n.nodeValue))translatedNodes.add(n)}$$('[placeholder],[title],[aria-label]').forEach(el=>{const vals=['placeholder','title','aria-label'].map(a=>el.getAttribute(a)||'').join(' ');if(!looksVietnameseText(vals))translatedAttrs.add(el)})}
async function enableEnglishCustomerMessageSubtitles(){if(state.lang!=='en')return;const video=$('.customer-message-video');if(!video||video.dataset.kblEnglishSubs==='1')return;const source=video.querySelector('source');if(!source||!/\/video\/kbl-gop-y-20260828\.mp4(?:$|\?)/.test(String(source.getAttribute('src')||'')))return;video.dataset.kblEnglishSubs='1';const attach=src=>{let track=video.querySelector('track[data-kbl-en-message]');if(!track){track=document.createElement('track');track.kind='subtitles';track.srclang='en';track.label='English';track.default=true;track.dataset.kblEnMessage='1';video.appendChild(track)}if(src&&track.getAttribute('src')!==src)track.src=src;const show=()=>{try{const t=[...video.textTracks].find(x=>String(x.language||'').toLowerCase()==='en'||x.label==='English');if(t)t.mode='showing'}catch(_){}};track.addEventListener('load',show,{once:true});video.addEventListener('loadedmetadata',show,{once:true});setTimeout(show,400)};try{const probe=await state.nativeFetch('/api/international/customer-message-subtitles.vtt',{cache:'force-cache'});if(probe.ok){attach('/api/international/customer-message-subtitles.vtt');return}}catch(_){}idle(async()=>{try{const r=await state.nativeFetch('/api/international/customer-message-subtitles/ensure',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),d=await r.json().catch(()=>({}));if(r.ok&&d.success)attach('/api/international/customer-message-subtitles.vtt?v='+encodeURIComponent(d.generatedAt||Date.now()));else video.dataset.kblEnglishSubs=''}catch(_){video.dataset.kblEnglishSubs=''}},2500)}

function englishResidualReport(){
  if(state.lang!=='en')return{count:0,items:[]};
  const found=[];
  const seen=new Set();
  const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while(w.nextNode()){
    const n=w.currentNode,p=n.parentElement,t=String(n.nodeValue||'').replace(/\s+/g,' ').trim();
    if(!p||!t||['SCRIPT','STYLE','NOSCRIPT','CODE','PRE'].includes(p.tagName))continue;
    if(p.closest('.kbl-intl-controls'))continue;
    if(!looksVietnameseText(t))continue;
    if(/^(?:KIM BẢO LÂM|Kim Bảo Lâm|KBL)$/i.test(t))continue;
    if(!seen.has(t)){seen.add(t);found.push(t.slice(0,180))}
    if(found.length>=80)break;
  }
  const report={count:found.length,items:found};
  state.enResidualCount=report.count;
  if(report.count)console.warn('[KBL /en QA] Residual Vietnamese UI:',report.count);
  else console.info('[KBL /en QA] PASS · no Vietnamese UI text detected by residual scanner.');
  return report;
}

function scheduleEnglishHydration(delay=700){if(state.lang!=='en')return;clearTimeout(kblHydrationTimer);kblHydrationTimer=setTimeout(()=>idle(async()=>{if(kblHydrationBusy||Date.now()-kblLastHydrationAt<900)return;kblHydrationBusy=true;kblLastHydrationAt=Date.now();try{await localizeProductNamesFallback();await translateStaticPage();if(state.currency==='USD')convertVisibleMoney()}finally{kblHydrationBusy=false}},1600),delay)}
function observe(){let timer;const mo=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{if(state.lang==='en'){convertUnits();enhanceProductCards();populateShippingProducts();rewriteLocalizedLinks();localizeKnownEnglishUI();patchCheckout();if(state.currency==='USD')convertVisibleMoney();scheduleEnglishHydration(900)}},140)});mo.observe(document.body,{subtree:true,childList:true})}
async function init(){state.lang=detectLang();state.currency=detectCurrency(state.lang);state.ssrEnglish=document.documentElement.dataset.kblSsrLang==='en';save();if(location.pathname==='/'&&!explicitLang()){location.replace((state.lang==='en'?'/en':'/vi')+(location.search||'')+(location.hash||''));return}document.documentElement.lang=state.lang;document.documentElement.classList.toggle('kbl-en',state.lang==='en');const configPromise=loadConfig();controls();paymentResultBanner();whatsapp();rewriteLocalizedLinks();if(state.lang==='en'){markInitialTranslated();internationalStorefront();banner();patchAiFetch();localizeKnownEnglishUI();convertUnits();enhanceProductCards();patchRingCalculator();patchCheckout();const fxPromise=state.currency==='USD'?loadFx():Promise.resolve();await configPromise;shippingSection();populateShippingProducts();Promise.all([fxPromise,loadEnglishCatalog()]).then(()=>{populateShippingProducts();localizeKnownEnglishUI();convertUnits();enhanceProductCards();if(state.currency==='USD')convertVisibleMoney();scheduleEnglishHydration(80)}).catch(()=>{});enableEnglishCustomerMessageSubtitles();scheduleEnglishHydration(120)}else{await configPromise}observe();idle(()=>prefetchLang(state.lang==='en'?'vi':'en'),1800);window.KBLInternational={state,money,gramsFromChi,switchLang,estimateInternational,qaEnglish:englishResidualReport}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
