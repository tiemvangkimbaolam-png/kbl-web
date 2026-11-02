/* KBL Kim Sac v4: presentation only; four explicitly requested contract headings.
   No storage/API access. No input values, IDs, handlers, formulas or records change. */
(() => {
 'use strict';
 const headings = [
  ['com-name-1-l1','CÔNG TY TNHH MTV VÀNG BẠC ĐÁ QUÝ KIM BẢO LÂM','HỘ KINH DOANH CẦM ĐỒ NGUYỄN VĂN LÂM'],
  ['com-name-1-l2','CÔNG TY TNHH MTV VÀNG BẠC ĐÁ QUÝ KIM BẢO LÂM','HỘ KINH DOANH CẦM ĐỒ NGUYỄN VĂN LÂM'],
  ['com-name-2-l1','TIỆM VÀNG & CẦM ĐỒ','TIỆM VÀNG KIM BẢO LÂM'],
  ['com-name-2-l2','TIỆM VÀNG & CẦM ĐỒ','TIỆM VÀNG KIM BẢO LÂM']
 ];
 function correctHeadings() {
  for (const [id,oldText,newText] of headings) {
   const node=document.getElementById(id);
   if(node && node.textContent.trim()===oldText) node.textContent=newText;
  }
 }
 function arrangePawn() {
  const left=document.querySelector('.container > .left-panel');
  if(!left || left.querySelector('.kbl-pawn-work')) return;
  const children=[...left.children];
  const begin=children.findIndex(n=>n.tagName==='H2' && /BƯỚC 2:/.test(n.textContent));
  const end=children.findIndex(n=>n.tagName==='H2' && /BƯỚC 3:/.test(n.textContent));
  if(begin<0 || end<=begin) return;
  const work=document.createElement('div'); work.className='kbl-pawn-work';
  const customer=document.createElement('div'); customer.className='kbl-pawn-customer';
  for(let i=0;i<children.length;i++) (i>=begin && i<end ? customer : work).appendChild(children[i]);
  left.append(work,customer);
  left.classList.add('kbl-pawn-arranged');
 }
 const purity=/(?<![\d.])9999(?![\d.])/g;
 function formatPurity(root) {
  if(!root) return;
  const nodes=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let n;
  while((n=nodes.nextNode())) {
   if(!n.parentElement || n.parentElement.closest('script,style,textarea,input,code,pre,[contenteditable="true"]')) continue;
   if(n.parentElement.tagName==='OPTION' && !n.parentElement.hasAttribute('value')) continue;
   const changed=n.nodeValue.replace(purity,'999.9');
   if(changed!==n.nodeValue) n.nodeValue=changed;
  }
  for(const el of root.querySelectorAll('[placeholder]')) {
   const old=el.getAttribute('placeholder'),next=old.replace(purity,'999.9');
   if(old!==next) el.setAttribute('placeholder',next);
  }
 }
 function arrangeSettings() {
  const card=document.querySelector('#tab-caidat > .grid-2 > .card:nth-child(2)');
  if(!card || card.querySelector('.kbl-settings-group')) return;
  const parts=[...card.children];
  const web=parts.findIndex(n=>n.contains(document.getElementById('cfg-web-sync-url')));
  const backup=parts.findIndex(n=>n.tagName==='HR');
  if(web<1 || backup<=web) return;
  const groups=[0,1,2].map(()=>{const d=document.createElement('div');d.className='kbl-settings-group';return d;});
  for(let i=1;i<parts.length;i++) groups[i<web?0:i<backup?1:2].appendChild(parts[i]);
  card.append(...groups);card.classList.add('kbl-settings-arranged');
 }
 function arrangeOffset() {
  const layout=document.querySelector('#tab-doichieu > .grid-split');
  if(!layout || layout.classList.contains('kbl-offset-arranged')) return;
  const first=layout.firstElementChild;
  const preview=layout.children[1];
  const sale=first && [...first.children].find(n=>n.querySelector('#offset-sale-lines'));
  const save=first && [...first.children].find(n=>n.querySelector('[onclick="saveOffsetRecord()"]'));
  if(!preview || !sale || !save) return;
  const right=document.createElement('div');right.className='kbl-offset-right';
  const actions=document.createElement('div');actions.className='kbl-offset-actions';
  layout.appendChild(right);right.appendChild(preview);actions.append(sale,save);right.appendChild(actions);
  layout.classList.add('kbl-offset-arranged');
 }
 function brandLogo() {
  const text=document.querySelector('.app-header .brand-title > span');
  if(text && /^\s*💎/.test(text.textContent)) text.textContent=text.textContent.replace(/^\s*💎\s*/,'');
  if(!document.querySelector('link[data-kbl-icon]')) {
   const icon=document.createElement('link');icon.rel='icon';icon.href='kbl-pos-logo.ico';icon.setAttribute('data-kbl-icon','');document.head.appendChild(icon);
  }
 }
 function start() {
  arrangePawn();arrangeSettings();arrangeOffset();brandLogo();correctHeadings();formatPurity(document.body);
  const observer=new MutationObserver(records=>{
   correctHeadings();
   for(const r of records) {
    if(r.type==='characterData') formatPurity(r.target.parentElement);
    else for(const n of r.addedNodes) formatPurity(n.nodeType===1?n:n.parentElement);
   }
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
 }
 if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
 window.addEventListener('load',correctHeadings,{once:true});
 window.addEventListener('beforeprint',()=>{correctHeadings();formatPurity(document.body);});
})();

/* KBL compact UI 2026-11-02: DOM presentation only. No storage, network, IPC,
   input values, transaction handlers, financial calculations or records. */
(() => {
 'use strict';
 const STYLE_ID='kbl-compact-ui-style';
 const css=`
 @media screen {
  .kbl-kimsac-jumpbar,.kbl-kimsac-pawnnav,.kbl-compact-hidden,.kbl-compact-note {display:none!important;}
  .kbl-compact-top {position:fixed;right:18px;bottom:18px;z-index:900;border:1px solid #9b4d2d;border-radius:8px;padding:9px 12px;background:#9b4d2d;color:#fff;font:700 12px 'Segoe UI',Arial,sans-serif;box-shadow:0 3px 10px #713d1d22;cursor:pointer;}
  .kbl-compact-top:focus-visible {outline:3px solid #d6ab90;outline-offset:3px;}
  .kbl-compact-offset-extras {grid-column:1/-1;min-width:0;}
  .kbl-compact-offset-extras > details {margin:0!important;}
  .kbl-compact-offset-extras > details + details {margin-top:8px!important;}
  .kbl-compact-status {margin-left:auto;font-size:11px;}
  .kbl-compact-pawn-options {border:1px solid #ead1bf;border-radius:8px;padding:7px 10px;margin:0 0 10px;color:#873f26;background:#fff8f3;}
  .kbl-compact-pawn-options > summary {cursor:pointer;font-size:12px;font-weight:700;}
  .kbl-compact-pawn-options .window-menu {display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:10px 0 3px;background:none;color:#102c43;}
  .kbl-compact-pawn-options .menu-item {color:#102c43;cursor:pointer;}
  .kbl-compact-inventory-tools {display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px;margin:8px 0 10px;border:1px solid #ead1bf;border-radius:8px;background:#fff8f3;}
  .kbl-compact-inventory-tools #kbl-inventory-summary {display:contents!important;}
  .kbl-compact-inventory-counts {flex:0 0 100%;color:#586573;font-size:12px;}
  .kbl-compact-inventory-search {display:flex!important;align-items:center;gap:6px!important;flex:1 1 260px;min-width:240px;margin:0!important;padding:0!important;background:none!important;border:0!important;}
  .kbl-compact-inventory-search > span:first-child {display:none;}
  .kbl-compact-inventory-search #inventory-search {min-width:120px!important;max-width:none!important;width:160px;flex:1 1 160px;font-size:12px;}
  .kbl-compact-inventory-search #inventory-search-status {flex-basis:100%;}
  .kbl-compact-inventory-tools #inventory-label-batch-bar {flex:0 1 auto;gap:6px!important;margin:0!important;padding:0!important;border:0!important;background:none!important;}
  .kbl-compact-inventory-tools button {white-space:nowrap;}
  .kbl-compact-inventory-tools .btn {font-size:11px!important;padding:5px 8px!important;}
 }
 html body #printable-a4-sheet .a4-gd-layout {margin-top:calc(12mm + 5.5px)!important;}
 html body #a4-print-preview-modal .a4-preview-modal-sheet .a4-gd-layout {margin-top:calc(12mm + 7.5px)!important;}
 @media print {
  html body #printable-a4-sheet .a4-gd-layout {margin-top:calc(12mm + 7.5px)!important;}
  .kbl-compact-top,.kbl-compact-pawn-options {display:none!important;}
 }
 `;
 function addStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');style.id=STYLE_ID;style.textContent=css;document.head.appendChild(style);
 }
 function topButton(){
  // The parent POS owns the one floating button for its embedded pawn screen.
  if(document.getElementById('kbl-compact-top') || (window.parent!==window && document.querySelector('.container > .left-panel')))return;
  const button=document.createElement('button');button.type='button';button.id='kbl-compact-top';button.className='kbl-compact-top';button.textContent='↑ Đầu trang';button.setAttribute('aria-label','Lên đầu trang');
  button.addEventListener('click',()=>{
   const frame=document.querySelector('#tab-camdo.active #pawn-app-frame');
   try{if(frame?.contentWindow)frame.contentWindow.scrollTo({top:0,behavior:'smooth'});}catch(_){}
   window.scrollTo({top:0,behavior:'smooth'});
  });
  document.body.appendChild(button);
 }
 function compactOffset(){
  const tab=document.getElementById('tab-doichieu'),help=document.getElementById('kbl-offset-help'),merge=document.getElementById('kbl-offset-merge');
  if(!tab||!help||!merge||tab.querySelector('.kbl-compact-offset-extras'))return;
  const target=tab.querySelector('.kbl-offset-actions');
  const primary=document.getElementById('offset-sale-select')?.closest('.card');
  if(!target||!primary)return;
  const intro=help.closest('.card'),status=document.getElementById('offset-status');
  const extras=document.createElement('section');extras.className='card kbl-compact-offset-extras';
  const header=document.createElement('div');header.className='card-header';header.textContent='6️⃣ Hướng dẫn & ghép hồ sơ';extras.appendChild(header);
  extras.append(help,merge);merge.classList.remove('card','kbl-ui-fold-card');
  target.appendChild(extras);
  if(status){status.classList.add('kbl-compact-status');primary.querySelector('.card-header')?.appendChild(status);}
  if(intro)intro.classList.add('kbl-compact-hidden');
 }
 function compactLost(){
  const tab=document.getElementById('tab-chuocmatgiay');
  if(!tab)return;
  const status=document.getElementById('pawn-lost-status');
  const first=document.getElementById('lost-pawn-id')?.closest('.card');
  const intro=tab.querySelector(':scope > .card');
  if(!first||!intro||first===intro)return;
  if(status&&!first.contains(status)){status.classList.add('kbl-compact-status');first.querySelector('.card-header')?.appendChild(status);}
  intro.classList.add('kbl-compact-hidden');
 }
 function compactPawn(){
  const header=document.querySelector('body > .window-header'),right=document.querySelector('.container > .right-panel');
  if(!header||!right||document.querySelector('.kbl-compact-pawn-options'))return;
  const menu=header.querySelector('.window-menu');
  if(menu){
   const options=document.createElement('details');options.className='kbl-compact-pawn-options';
   const summary=document.createElement('summary');summary.textContent='Tùy chọn phiếu';options.append(summary,menu);right.prepend(options);
  }
  header.classList.add('kbl-compact-hidden');
 }
 function compactInventory(){
  const body=document.getElementById('inventory-tbody'),search=document.getElementById('inventory-search'),batch=document.getElementById('inventory-label-batch-bar');
  if(!body||!search||!batch)return;
  const stock=body.closest('.card'),printer=document.getElementById('label-printer')?.closest('.card');
  if(!stock)return;
  if(printer&&printer!==stock&&stock.nextElementSibling!==printer)stock.after(printer);
  let tools=stock.querySelector('.kbl-compact-inventory-tools');
  if(!tools){
   tools=document.createElement('section');tools.className='kbl-compact-inventory-tools';tools.setAttribute('aria-label','Bộ lọc kho và in tem');
   stock.querySelector('.card-header')?.after(tools);
   const searchRow=search.parentElement;searchRow.classList.add('kbl-compact-inventory-search');
   search.setAttribute('aria-label','Tìm kiếm trong kho');tools.append(searchRow,batch);
  }
  const summary=document.getElementById('kbl-inventory-summary');
  if(summary){
   if(summary.parentElement!==tools)tools.prepend(summary);
   // The original renderer replaces summary.innerHTML on every search/filter.
   // Keep all persistent inputs outside that replaceable node.
   if(!summary.querySelector('.kbl-compact-inventory-counts')){
    const count=document.createElement('span');count.className='kbl-compact-inventory-counts';
    for(const node of [...summary.childNodes])if(node.nodeType===Node.TEXT_NODE || (node.nodeType===Node.ELEMENT_NODE&&node.tagName==='B'))count.appendChild(node);
    summary.prepend(count);
   }
  }
 }
 const NOTE_PREFIXES=[
  'Khách quên thẻ:', 'Có thể chụp bằng điện thoại', 'Mở KBL Remote trên điện thoại của tiệm',
  'Hóa đơn đã chốt được lưu trong', 'Chọn tối đa 30 ảnh một lần',
  'Tab 5 chỉ dùng để lấy và đối chiếu dữ liệu đầu vào.',
  'Bản A4 tự hiển thị Phiếu Chi', 'Bộ hồ sơ đổi vàng:',
  'Số lượng ở ô SL phía trên = số bản cho mỗi tem.',
  'AI chỉ bóc dữ liệu. Chủ tiệm kiểm tra/sửa lại trước khi lưu;',
  'Hàm lượng trên tem giữ nguyên theo sản phẩm.',
  'Tự lấy mặc định theo chành;', 'Ví dụ tem bán là',
  'Thông tin chuyển khoản chỉ lưu trong dữ liệu POS',
  'Chọn tuổi vàng hoặc nhập mã như', 'Đóng lãi: thu lãi + phí',
  '(chỉ mở cam kết/xác minh;', 'Nhập tên, SĐT, CCCD hoặc địa chỉ rồi bấm'
 ];
 function compactNotes(){
  for(const e of document.querySelectorAll('div,span,p,small')){
   if(e.classList.contains('kbl-compact-note')||e.id||e.closest('#printable-a4-sheet,#a4-print-preview-modal,.kbl-doc-a4,.right-panel,.kbl-compact-offset-extras,script,style'))continue;
   if(e.querySelector('div,p,button,input,select,textarea,a,table,[role="status"],[aria-live]'))continue;
   const text=e.textContent.replace(/\s+/g,' ').trim();
   if(NOTE_PREFIXES.some(prefix=>text.startsWith(prefix)))e.classList.add('kbl-compact-note');
  }
 }
 function arrange(){addStyle();topButton();compactOffset();compactLost();compactPawn();compactInventory();compactNotes();}
 function start(){
  arrange();let queued=false;
  const observer=new MutationObserver(()=>{
   if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;arrange();});
  });
  observer.observe(document.body,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
