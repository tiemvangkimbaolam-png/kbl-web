(()=>{
  'use strict';
  if(window.__KBL_HOME_POLISH_V531__)return;window.__KBL_HOME_POLISH_V531__=true;
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const norm=(v)=>String(v||'').trim();
  const safeUrl=(v)=>/^https:\/\//i.test(norm(v))?norm(v):'';
  const ICONS={
    facebook:`<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#1877F2"/><path d="M18.3 27V17.1h3.3l.5-3.8h-3.8v-2.4c0-1.1.3-1.9 1.9-1.9h2V5.6c-.4 0-1.6-.2-3-.2-3 0-5.1 1.8-5.1 5.2v2.7h-3.4v3.8h3.4V27h4.2z" fill="#fff"/></svg>`,
    zalo:`<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0068FF"/><path d="M6.2 9.2h12.1v3L11.4 20h7.2v3H6v-2.8l7-8H6.2v-3z" fill="#fff"/><path d="M20.2 14.2c1.1-1.2 2.5-1.8 4.1-1.8 1 0 1.9.2 2.7.7v3.3a3.3 3.3 0 0 0-2.4-1.1c-1.8 0-3 1.2-3 3s1.2 3 3 3c.9 0 1.7-.3 2.4-.9v3.3c-.8.4-1.7.6-2.8.6-1.6 0-3-.5-4-1.6-1.2-1.1-1.8-2.6-1.8-4.2 0-1.7.6-3.1 1.8-4.3z" fill="#fff" opacity=".95"/></svg>`,
    tiktok:`<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#111"/><path d="M19.1 7.1c.5 2.7 2 4.4 4.6 5v3.5a10.4 10.4 0 0 1-4.6-1.4v6.4c0 4-3.1 6.6-6.7 6.6a6.5 6.5 0 0 1-6.4-6.6c0-3.7 2.9-6.5 6.6-6.5.4 0 .8 0 1.2.1v3.7c-.4-.2-.8-.3-1.2-.3-1.7 0-3 1.3-3 3s1.3 3 3 3c2 0 3.2-1.4 3.2-3.6V7.1h3.3z" fill="#25F4EE" transform="translate(-.7,.5)"/><path d="M19.8 6.4c.5 2.7 2 4.4 4.6 5v3.5a10.4 10.4 0 0 1-4.6-1.4v6.4c0 4-3.1 6.6-6.7 6.6a6.5 6.5 0 0 1-6.4-6.6c0-3.7 2.9-6.5 6.6-6.5.4 0 .8 0 1.2.1v3.7c-.4-.2-.8-.3-1.2-.3-1.7 0-3 1.3-3 3s1.3 3 3 3c2 0 3.2-1.4 3.2-3.6V6.4h3.3z" fill="#FE2C55" transform="translate(.7,-.4)"/><path d="M19.4 6.8c.5 2.7 2 4.4 4.6 5v3.5a10.4 10.4 0 0 1-4.6-1.4v6.4c0 4-3.1 6.6-6.7 6.6a6.5 6.5 0 0 1-6.4-6.6c0-3.7 2.9-6.5 6.6-6.5.4 0 .8 0 1.2.1v3.7c-.4-.2-.8-.3-1.2-.3-1.7 0-3 1.3-3 3s1.3 3 3 3c2 0 3.2-1.4 3.2-3.6V6.8h3.3z" fill="#fff"/></svg>`
  };
  function addBodyClass(){document.body?.classList.add('kbl-ui-polish-v53')}
  function arrangeHomepage(){
    const prices=$('#prices'),products=$('#products'),services=$('#try-on'),slider=$('#tien-ich-kbl');
    if(prices&&products&&prices.nextElementSibling!==products)prices.insertAdjacentElement('afterend',products);
    if(products&&services&&products.nextElementSibling!==services)products.insertAdjacentElement('afterend',services);
    const board=$('#price-board');
    let market=$('#market-reference');
    if(board&&!board.closest('.kbl-market-placement')&&services){
      market=document.createElement('section');market.className='kbl-market-placement';market.id='market-reference';
      const wrap=document.createElement('div');wrap.className='container';market.appendChild(wrap);wrap.appendChild(board);
      services.insertAdjacentElement('afterend',market);
    }
    market=$('#market-reference');
    if(market&&slider&&market.nextElementSibling!==slider)market.insertAdjacentElement('afterend',slider);
  }
  function socialLink(kind,url,label){
    const a=document.createElement('a');a.className='kbl-social-link kbl-social-'+kind;a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label',label);a.title=label;a.innerHTML=ICONS[kind];return a;
  }
  function legacySocialUrl(host,kind){
    if(!host)return '';
    const re=kind==='facebook'?/facebook/i:kind==='zalo'?/zalo/i:/tiktok/i;
    const a=$$('a',host).find(x=>re.test((x.getAttribute('aria-label')||'')+' '+(x.getAttribute('href')||'')));
    return a?safeUrl(a.getAttribute('href')):'';
  }
  function makeUnconfigured(kind,label){
    const span=document.createElement('span');
    span.className='kbl-social-link kbl-social-'+kind+' is-unconfigured';
    span.setAttribute('role','img');span.setAttribute('aria-label',label+' · Chưa cấu hình liên kết');
    span.title=label+' · Chưa cấu hình liên kết trong Admin → Cài đặt';
    span.innerHTML=ICONS[kind];return span;
  }
  function ensureFooterSocial(shop={}){
    const host=$('.footer-social');if(!host)return;
    const legacyFb=legacySocialUrl(host,'facebook');
    const legacyZa=legacySocialUrl(host,'zalo');
    const legacyTt=legacySocialUrl(host,'tiktok');
    const fb=safeUrl(shop.facebookUrl)||legacyFb||'https://www.facebook.com/lam1881997/';
    const za=safeUrl(shop.zaloUrl)||legacyZa||(shop.zalo?`https://zalo.me/${String(shop.zalo).replace(/\D/g,'')}`:'')||'https://zalo.me/0985325806';
    const tt=safeUrl(shop.tiktokUrl)||legacyTt;
    const ai=host.querySelector('[data-open-message]');

    // V5.3.1: không xóa social cũ trước khi có dữ liệu. Chỉ thay đúng anchor Facebook/Zalo/TikTok bằng logo chuẩn.
    const oldSocial=$$('a',host).filter(a=>/facebook|zalo|tiktok/i.test((a.getAttribute('aria-label')||'')+' '+(a.getAttribute('href')||'')));
    oldSocial.forEach(a=>a.remove());
    host.querySelectorAll('.kbl-social-link').forEach(x=>x.remove());

    const items=[
      socialLink('facebook',fb,'Facebook Kim Bảo Lâm'),
      socialLink('zalo',za,'Zalo Kim Bảo Lâm'),
      tt?socialLink('tiktok',tt,'TikTok Kim Bảo Lâm'):makeUnconfigured('tiktok','TikTok Kim Bảo Lâm')
    ];
    items.forEach(el=>host.insertBefore(el,ai||null));

    const fz=$('.floating-zalo');if(fz&&za){fz.href=za;const logo=fz.querySelector('.floating-contact-logo');if(logo){logo.innerHTML=ICONS.zalo;logo.classList.add('kbl-platform-svg-wrap')}}
    const ff=$('.floating-facebook');if(ff&&fb){ff.href=fb;const logo=ff.querySelector('.floating-contact-logo');if(logo){logo.innerHTML=ICONS.facebook;logo.classList.add('kbl-platform-svg-wrap')}}
  }
  async function loadSocial(){
    // Dựng ngay từ link footer cũ để không bao giờ mất icon nếu API/config chưa có field mới.
    ensureFooterSocial({});
    try{const r=await fetch('/api/shop',{cache:'no-store'}),d=await r.json();if(r.ok&&d.success&&d.shop)ensureFooterSocial(d.shop)}catch(_){/* giữ fallback đã dựng */}
  }
  function install(){addBodyClass();arrangeHomepage();loadSocial()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  const obs=new MutationObserver(()=>{addBodyClass();arrangeHomepage()});obs.observe(document.documentElement,{subtree:true,childList:true});setTimeout(()=>obs.disconnect(),15000);
})();
