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
