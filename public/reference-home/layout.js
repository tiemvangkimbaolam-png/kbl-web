/* KBL 5.7.10.9 — homepage controls; preserve live price/product nodes and POS data. */
(() => {
  'use strict';
  const body = document.body;
  const prices = document.getElementById('prices');
  const products = document.getElementById('products');
  const main = prices && prices.parentElement;
  if (!body || !body.classList.contains('kbl-home-57109') || !prices || !products || !main || products.parentElement !== main || body.dataset.kblHomeReady) return;
  body.dataset.kblHomeReady = '57126';
  // Move the existing elements, retaining all listeners, live data and world-gold IDs.
  main.insertBefore(prices, main.firstElementChild);
  prices.after(products);
  const hero = document.getElementById('home');
  if (hero && hero.parentElement === main) products.after(hero);
  // One layout owner. Keep the existing detailed price/history panel and handlers.
  const board = document.getElementById('price-board');
  const services = document.getElementById('try-on');
  if (board && services && !document.getElementById('market-reference')) {
    const market = document.createElement('section'); market.id = 'market-reference'; market.className = 'kbl-market-placement';
    const wrap = document.createElement('div'); wrap.className = 'container'; market.append(wrap); wrap.append(board); services.after(market);
  }
  const en = !window.__KBL_WORLD_I18N__ && (document.documentElement.lang.startsWith('en') || /^\/en(?:\/|$)/.test(location.pathname));
  const copy = en ? {prices:'Gold prices', products:'Jewelry', tools:'Services', cart:'Cart', search:'Find jewelry', unit:'Prices per chỉ (3.75 g)', nav:'Quick navigation'} : {prices:'Giá vàng', products:'Trang sức', tools:'Tiện ích', cart:'Giỏ hàng', search:'Tìm trang sức', unit:'Giá theo chỉ · 1 chỉ = 3,75 g', nav:'Điều hướng nhanh'};
  const paths = {
    prices:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M8 14h2m4 0h2"/>',
    products:'<path d="m3 8 4-4h10l4 4-9 12L3 8Z M3 8h18M7 4l5 16 5-16"/>',
    tools:'<path d="M5 6h14M5 12h14M5 18h14"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
    cart:'<path d="M2 3h3l3 13h11l3-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>'
  };
  const icon = key => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[key]+'</svg>';
  const label = document.createElement('p');
  label.className = 'kbl-price-unit';
  label.textContent = copy.unit;
  const grid = document.getElementById('price-grid');
  if (grid) grid.before(label);
  // Approved sample 06: reflow existing live nodes; never copy demonstration prices.
  body.classList.add('kbl-home-57117');
  const world = document.getElementById('kbl-home-world-gold');
  if (grid && world && !grid.closest('.kbl-price-columns')) {
    const columns = document.createElement('div'); columns.className = 'kbl-price-columns';
    const rates = document.createElement('div'); rates.className = 'kbl-rate-wrap';
    const heading = document.createElement('div'); heading.className = 'kbl-rate-header';
    heading.innerHTML = '<span>Loại vàng</span><span>Mua vào</span><span>Bán ra</span>';
    grid.before(columns); rates.append(heading,grid); columns.append(rates,world);
    const install = document.getElementById('kbl-widget-install');
    if (install) rates.append(install);
  }
  // Home links now return to the first price section; service links remain intact.
  document.querySelectorAll('a[href="#home"]:not(.floating-top)').forEach(a => a.setAttribute('href','#prices'));
  const utilities = document.querySelector('.header-utilities');
  if (utilities) {
    const search = document.createElement('a');
    search.id = 'kbl-header-search';
    search.href = '#products';
    search.setAttribute('aria-label', copy.search);
    search.innerHTML = icon('search')+'<span>'+copy.search+'</span>';
    search.addEventListener('click', ev => {
      const input = document.getElementById('product-search');
      if (!input) return;
      ev.preventDefault();
      input.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
      input.focus({preventScroll:true});
    });
    utilities.prepend(search);
  }
  // Reuse the cart managed by the existing shop script; do not create a second cart state.
  function placeCart() {
    const cart = document.getElementById('kbl-cart-link');
    if (!cart || !utilities) return false;
    if (cart.parentElement !== utilities) utilities.append(cart);
    return true;
  }
  if (!placeCart() && utilities) {
    const observer = new MutationObserver(() => { if (placeCart()) observer.disconnect(); });
    observer.observe(body,{childList:true});
    setTimeout(() => observer.disconnect(),10000);
  }
  const nav = document.createElement('nav');
  nav.id = 'kbl-mobile-nav';
  nav.setAttribute('aria-label',copy.nav);
  nav.innerHTML = [['prices','#prices'],['products','#products'],['tools',hero?'#home':'#contact'],['cart','#gio-hang']].map(([key,href])=>'<a href="'+href+'" data-kbl-section="'+key+'">'+icon(key)+'<span>'+copy[key]+'</span></a>').join('');
  // The services anchor retains the relocated hero; do not rewrite this new link.
  body.append(nav);
  const links = Array.from(nav.querySelectorAll('a[data-kbl-section]'));
  const setActive = key => links.forEach(a => { if (a.dataset.kblSection === key) a.setAttribute('aria-current','location'); else a.removeAttribute('aria-current'); });
  setActive('prices');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id === 'prices'?'prices':entry.target.id === 'products'?'products':'tools');
    },{rootMargin:'-15% 0px -65% 0px',threshold:0});
    [prices,products,hero].filter(Boolean).forEach(node => observer.observe(node));
  }
  function setupHeader() {
    const header = document.getElementById('site-header');
    const inner = header && header.querySelector('.header-inner');
    const tabs = products.querySelector('.filter-tabs');
    if (!header || !inner || !tabs) return;
    const homePosition = document.createElement('div');
    homePosition.className = 'kbl-category-placeholder';
    homePosition.hidden = true;
    homePosition.style.flex = '0 0 auto';
    homePosition.style.overflowAnchor = 'none';
    tabs.before(homePosition);
    const dock = document.createElement('div');
    dock.id = 'kbl-header-categories';
    dock.setAttribute('aria-label', en ? 'Jewelry categories' : 'Danh mục trang sức');
    dock.hidden = true;
    inner.append(dock);
    let compact = false, docked = false, scheduled = false;
    let originalWidth = '', originalHeight = '';
    const height = () => {
      const pixels = Math.ceil(header.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--kbl-sticky-height', pixels+'px');
      document.documentElement.style.setProperty('--catalog-header-height', pixels+'px');
    };
    const moveTabs = next => {
      if (next === docked) return;
      const focus = tabs.contains(document.activeElement) ? document.activeElement : null;
      const scrollLeft = tabs.scrollLeft;
      if (next) {
        const rect = tabs.getBoundingClientRect();
        originalWidth = homePosition.style.width;
        originalHeight = homePosition.style.height;
        homePosition.style.width = Math.ceil(rect.width)+'px';
        homePosition.style.height = Math.ceil(rect.height)+'px';
        homePosition.hidden = false;
        dock.hidden = false;
        dock.append(tabs);
      } else {
        homePosition.before(tabs);
        homePosition.hidden = true;
        homePosition.style.width = originalWidth;
        homePosition.style.height = originalHeight;
        dock.hidden = true;
      }
      docked = next;
      tabs.scrollLeft = scrollLeft;
      if (focus) focus.focus({preventScroll:true});
    };
    const update = () => {
      scheduled = false;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const nextCompact = compact ? y > 20 : y > 160;
      if (nextCompact !== compact) {
        compact = nextCompact;
        body.classList.toggle('kbl-header-compact', compact);
        const toggle = document.getElementById('menu-toggle');
        const menu = document.getElementById('main-nav');
        if (compact && menu) menu.classList.remove('open');
        if (compact && toggle) toggle.setAttribute('aria-expanded','false');
      }
      // Use the utility row, not the whole header: the category dock adds
      // its own height and must not change its activation threshold.
      const utilityRow = header.querySelector('.header-utilities');
      const utilityBottom = utilityRow
        ? utilityRow.getBoundingClientRect().bottom + 4
        : header.getBoundingClientRect().top + 48;
      const origin = docked ? homePosition : tabs;
      const originTop = origin.getBoundingClientRect().top;
      const categoryHeight = Math.max(36, tabs.getBoundingClientRect().height);
      const productBottom = products.getBoundingClientRect().bottom;
      moveTabs(compact && originTop <= utilityBottom && productBottom > utilityBottom + categoryHeight + 8);
      height();
    };
    const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', schedule, {passive:true});
    window.addEventListener('resize', () => {
      // Re-measure the original layout at the new width before docking again.
      if (docked) moveTabs(false);
      schedule();
    }, {passive:true});
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(schedule);
      observer.observe(header);
      observer.observe(products);
    }
    tabs.addEventListener('click', event => {
      if (!docked || !event.target.closest('.filter-tab')) return;
      products.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
      schedule();
    });
    update();
  }
  function setupTopAndGreeting() {
    // Capture before the original smooth-anchor handler. #prices is below the header.
    document.addEventListener('click', event => {
      const control = event.target.closest('.floating-top,#kbl-pwa-reload');
      if (!control) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (control.id === 'kbl-pwa-reload') { window.location.reload(); return; }
      window.scrollTo({top:0,left:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
      const mainHeading = document.querySelector('.brand');
      if (mainHeading) mainHeading.focus({preventScroll:true});
    },true);
    const launcher = document.getElementById('kbl-ai-launcher');
    const greeting = document.getElementById('kbl-ai-greeting');
    const text = document.getElementById('kbl-ai-greeting-text');
    if (!launcher || !greeting || !text) return;
    let closed = false;
    const hide = () => { closed = true; greeting.classList.remove('show'); };
    document.getElementById('kbl-ai-greeting-close')?.addEventListener('click',hide);
    launcher.addEventListener('click',hide);
    setTimeout(() => {
      if (closed || body.classList.contains('modal-open') || document.hidden) return;
      if (typeof showKblAiProactiveGreeting === 'function') showKblAiProactiveGreeting({force:true});
      else greeting.classList.add('show');
      text.textContent = en ? 'Hello 👋 How can I help you today?' : 'Em chào anh/chị 👋 Anh/chị cần em giúp gì không ạ?';
      const wave = launcher.querySelector('.kbl-ai-wave');
      if (wave) wave.classList.add('kbl-ai-wave--hello');
      setTimeout(() => { greeting.classList.remove('show'); if (wave) wave.classList.remove('kbl-ai-wave--hello'); },12000);
    },1800);
  }
  function setupReloadUnderAI() {
    // Reuse an existing PWA control, or create the missing public reload control.
    const place = () => {
      let reload = document.getElementById('kbl-pwa-reload');
      const launcher = document.getElementById('kbl-ai-launcher') || document.querySelector('.kbl-ai-launcher');
      const dock = launcher && launcher.closest('.floating-contact');
      if (!dock) return false;
      if (!reload) {
        reload = document.createElement('button'); reload.id = 'kbl-pwa-reload'; reload.type = 'button';
        reload.title = 'Làm mới website'; reload.setAttribute('aria-label', 'Làm mới website');
        reload.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 12M4 12l2.3 6A7 7 0 0 0 18 17"/></svg>';
      }
      let anchor = launcher.closest('.kbl-ai-proactive') || launcher;
      while (anchor.parentElement && anchor.parentElement !== dock) anchor = anchor.parentElement;
      if (anchor.parentElement !== dock) return false;
      if (anchor.nextElementSibling !== reload) anchor.after(reload);
      reload.classList.add('kbl-reload-under-ai');
      return true;
    };
    if (place()) return;
    const observer = new MutationObserver(() => { if (place()) observer.disconnect(); });
    observer.observe(body,{childList:true,subtree:true});
  }
  const setup = () => { setupHeader(); setupTopAndGreeting(); setupReloadUnderAI(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();

})();

// Personal holdings entry uses the existing customer login, separate from POS.
{const cta=document.getElementById("kbl-widget-install");if(cta&&!document.getElementById("kbl-holdings-link")){const link=document.createElement("a");link.id="kbl-holdings-link";link.href="/vang-cua-toi";link.textContent="Vàng của tôi · Theo dõi tích lũy ↗";link.style.cssText="display:block;text-align:center;padding:14px 12px;color:#93462d;font-size:16px;text-underline-offset:5px";cta.after(link);}}
