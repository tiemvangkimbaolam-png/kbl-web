'use client';
import {inProductSection} from '@/lib/kbl/product-placement.mjs';
import { displayGoldPrices } from '@/lib/kbl/display-prices.mjs';
import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import template from './template';
import { estimatePawn, ringSize, perChi } from './tools.mjs';
import { cash, date } from '../ui';

const CATEGORIES: Record<string,string[]>={ring:['nhan'],necklace:['day-chuyen'],pendant:['mat-day'],earring:['bong-tai'],bracelet:['lac-vong'],bangle:['lac-vong'], 'gold-group':[]};
type Props={data:any;error:string;onReload:()=>void;onProduct:(p:any)=>void;onCart:()=>void;onAsk:(question?:string)=>void;onTry:(p?:any)=>void;cartCount:number;};

const StaticMarkup=memo(function StaticMarkup({nodeRef}:{nodeRef:React.RefObject<HTMLDivElement|null>}) {return <div ref={nodeRef} dangerouslySetInnerHTML={{__html:template}}/>;});
export default function ReferenceHome(props:Props) {
  const root=useRef<HTMLDivElement>(null), current=useRef(props);
  current.current=props;
  const [hosts,setHosts]=useState<Record<string,HTMLElement>>({}),[filter,setFilter]=useState('featured'),[search,setSearch]=useState(''),[favorite,setFavorite]=useState<string[]>([]),[compared,setCompared]=useState<string[]>([]),[notice,setNotice]=useState(''),[market,setMarket]=useState<any>(null);
  const prices=(props.data?.prices||[]).filter((p:any)=>perChi(p.buy,p.unit)!==null).sort((a:any,b:any)=>b.capturedAt-a.capturedAt).filter((p:any,i:number,a:any[])=>a.findIndex(x=>x.label===p.label)===i);
  const products=(props.data?.products||[]).filter((p:any)=>inProductSection(p,filter)&&(!search||[p.name,p.sku,p.purity].join(' ').toLowerCase().includes(search.toLowerCase())));
  useEffect(()=>{
    const r=root.current!;
    document.body.classList.add('kbl-home-57109','kbl-ui-polish-v53','kbl-reference-home');
    const q=(id:string)=>r.querySelector<HTMLElement>('#'+id);
    const detailBoard=q('price-board'),toolbar=detailBoard?.querySelector('.price-board-toolbar');
    if(detailBoard&&!q('reference-world-data')){const slot=document.createElement('div');slot.id='reference-world-data';slot.className='reference-market-grid';detailBoard.insertBefore(slot,toolbar?.nextSibling||null);}
    const mapping:Record<string,HTMLElement>={};
    ['price-grid','product-grid-available','price-table-body','reference-world-data'].forEach(id=>{const n=q(id);if(n){n.replaceChildren();mapping[id]=n;}});
    setHosts(mapping);
    try{setFavorite(JSON.parse(localStorage.getItem('kbl-favorites-v2')||'[]'));}catch{}
    const utilities=r.querySelector('.header-utilities');
    if(utilities&&!q('kbl-cart-link')){const cart=document.createElement('a');cart.id='kbl-cart-link';cart.href='#gio-hang';cart.setAttribute('aria-label','Giỏ hàng · 0 sản phẩm');cart.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 3h3l3 13h11l3-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>';utilities.appendChild(cart);}
    const searchInput=q('product-search') as HTMLInputElement|null;
    if(searchInput)searchInput.setAttribute('aria-label','Tìm sản phẩm');
    const intro=q('kbl-n10-1-intro');
    const dismissIntro=()=>{intro?.classList.remove('show');intro?.setAttribute('aria-hidden','true');document.body.classList.remove('kbl-intro-running');};
    let introTimer:ReturnType<typeof setTimeout>|undefined;
    if(!sessionStorage.getItem('kbl-reference-intro-seen')&&!matchMedia('(prefers-reduced-motion: reduce)').matches){intro?.classList.add('show');intro?.setAttribute('aria-hidden','false');sessionStorage.setItem('kbl-reference-intro-seen','1');introTimer=setTimeout(dismissIntro,3500);}
    const layout=document.createElement('script'); layout.src='/reference-home/layout.js'; document.body.appendChild(layout);
    const track=q('kbl-slider-track'); const slideButtons=[...r.querySelectorAll<HTMLElement>('[data-kbl-dot]')]; let slide=0;
    // The original carousel is manual, so customers control the reading pace.
    function moveSlide(n:number){slide=(n+4)%4;if(track)track.style.transform=`translateX(-${slide*100}%)`;slideButtons.forEach((b,i)=>{b.classList.toggle('active',i===slide);b.setAttribute('aria-selected',String(i===slide));});}
    // Normalize old data attributes to one delegated owner.
    r.querySelectorAll('.kbl-slider-dot').forEach((el,i)=>el.setAttribute('data-reference-slide',String(i)));
    const starts=q('pawn-estimator-start') as HTMLInputElement|null,ends=q('pawn-estimator-end') as HTMLInputElement|null;
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if(starts)starts.value=today;
    if(ends){const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+30);ends.value=d.toISOString().slice(0,10);}
    function convertRing(){const input=q('guide-ring-diameter') as HTMLInputElement|null,result=q('guide-ring-size-result');if(!input||!result)return;try{const v=ringSize(input.value);result.textContent=`Ni tay số ${v.ni} · ${v.diameter.toFixed(1).replace('.',',')} mm. Đường kính chuẩn ${v.standard.toFixed(1).replace('.',',')} mm. Nên thử lại bằng vòng mẫu tại tiệm.`;}catch(e:any){result.textContent=input.value?e.message:'';}}
    function showMarket(kind:string){
      const board=q('price-board');if(!board)return;
      let chart=q('reference-world-chart');
      if(!chart){chart=document.createElement('div');chart.id='reference-world-chart';chart.className='reference-world-chart';chart.hidden=true;board.appendChild(chart);}
      const table=board.querySelector<HTMLElement>('.price-table-wrap'),history=board.querySelector<HTMLElement>('.price-history-row');
      if(table)table.hidden=true;if(history)history.hidden=true;
      chart.hidden=kind!=='reference';
      let note=q('reference-market-message');if(!note){note=document.createElement('p');note.id='reference-market-message';note.className='reference-source-note';board.appendChild(note);}
      note.textContent=kind==='reference'?'Biểu đồ XAU/USD tham khảo từ TradingView, không phải giá giao dịch tại tiệm. Chưa có nguồn tỷ giá quy đổi trên hệ thống mới.':'Chưa có bảng nguyên liệu từ POS. Cần ghép nguồn chỉ đọc của cửa hàng.';
      if(kind==='reference'&&!chart.dataset.loaded){chart.dataset.loaded='1';const wrap=document.createElement('div');wrap.className='tradingview-widget-container';wrap.style.height='100%';const widget=document.createElement('div');widget.className='tradingview-widget-container__widget';widget.style.height='100%';wrap.appendChild(widget);const script=document.createElement('script');script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';script.async=true;script.text=JSON.stringify({autosize:true,symbol:'OANDA:XAUUSD',interval:'5',timezone:'Asia/Ho_Chi_Minh',theme:'light',style:'1',locale:'vi',withdateranges:true,hide_side_toolbar:true,allow_symbol_change:false,save_image:false,calendar:false,support_host:'https://www.tradingview.com'});script.onerror=()=>{chart!.textContent='Chưa tải được biểu đồ. Có thể xem nguồn tại TradingView.';};wrap.appendChild(script);chart.appendChild(wrap);}
    }
    function click(e:MouseEvent){const el=(e.target as Element).closest<HTMLElement>('a,button');if(!el)return;
      if(el.closest('#kbl-n10-1-intro')){dismissIntro();return;}
      if(el.matches('[data-reference-cart]')||el.getAttribute('href')==='#gio-hang'){e.preventDefault();current.current.onCart();return;}
      if(el.matches('[data-open-message],[data-open-booking],[data-open-feedback]')){e.preventDefault();current.current.onAsk(el.matches('[data-open-booking]')?'Tôi muốn đặt lịch đến tiệm. ':el.matches('[data-open-feedback]')?'Tôi muốn góp ý: ':'');return;}
      if(el.matches('[data-open-tryon]')){e.preventDefault();current.current.onTry();return;}
      if(el.id==='kbl-ai-launcher'||el.id==='floating-contact-toggle'){const dock=q('floating-contact-menu');dock?.classList.toggle('show');q('floating-contact')?.classList.toggle('open');el.setAttribute('aria-expanded',String(dock?.classList.contains('show')));return;}
      if(el.id==='menu-toggle'){const nav=q('main-nav');nav?.classList.toggle('open');el.setAttribute('aria-expanded',String(nav?.classList.contains('open')));return;}
      if(el.matches('.main-nav a')){q('main-nav')?.classList.remove('open');q('menu-toggle')?.setAttribute('aria-expanded','false');}
      if(el.matches('.filter-tab')){e.preventDefault();const f=el.dataset.filter||'all';setFilter(f);r.querySelectorAll('.filter-tab').forEach(b=>{b.classList.toggle('active',b===el);b.setAttribute('role','tab');b.setAttribute('aria-selected',String(b===el));});return;}
      if(el.id==='catalog-show-all'){setFilter('all');r.querySelectorAll('.filter-tab').forEach(b=>{const active=(b as HTMLElement).dataset.filter==='all';b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});}
      if(el.id==='refresh-prices'){current.current.onReload();return;}
      if(el.id==='guide-ring-size-button'){convertRing();return;}
      if(el.matches('[data-reference-slide]')){moveSlide(Number(el.dataset.referenceSlide));return;}
      if(el.id==='kbl-slider-prev'){moveSlide(slide-1);return;}
      if(el.id==='kbl-slider-next'){moveSlide(slide+1);return;}
      if(el.matches('.market-tab')){r.querySelectorAll('.market-tab').forEach(b=>b.classList.toggle('active',b===el));showMarket(el.dataset.market||'reference');}
      if(el.matches('[data-open-world-gold]'))showMarket('reference');
    }
    function input(e:Event){const target=e.target as HTMLInputElement;if(target.id==='product-search')setSearch(target.value);if(target.id==='guide-ring-diameter')convertRing();}
    function submit(e:SubmitEvent){const form=e.target as HTMLFormElement;
      if(form.id==='pawn-form'){e.preventDefault();const result=q('pawn-result');if(result){result.classList.remove('hidden');result.textContent='Tra cứu cần kết nối nguồn POS chỉ đọc của cửa hàng. Bản mới chưa ghép POS; không suy đoán dữ liệu từ mã phiếu.';}}
      if(form.id==='pawn-estimator-form'){e.preventDefault();const output=q('pawn-estimator-result'),rate=q('pawn-estimator-rate');try{const p=(q('pawn-estimator-principal') as HTMLInputElement)?.value;const v=estimatePawn(p,starts?.value||'',ends?.value||'');if(rate)rate.textContent=`${v.monthly.toLocaleString('vi-VN')}% / tháng`;if(output){output.replaceChildren();const strong=document.createElement('strong');strong.textContent='Lãi dự kiến: '+cash(v.interest);const detail=document.createElement('p');detail.textContent=`${v.days} ngày (tính cả ngày cầm) · Tổng gốc và lãi: ${cash(v.total)}. Kết quả tham khảo theo mức trên website cũ; phiếu thực tế là căn cứ xác nhận.`;output.appendChild(strong);output.appendChild(detail);}}catch(err:any){if(output)output.textContent=err.message;}}
    }
    r.addEventListener('click',click); r.addEventListener('input',input);r.addEventListener('submit',submit);
    q('product-empty-available')?.classList.add('hidden');
    const refLane=r.querySelector<HTMLElement>('.product-lane--reference');if(refLane)refLane.hidden=true;
    const board=q('price-board'); if(board){const note=document.createElement('p');note.className='reference-source-note';note.textContent='Bảng giá mới chưa có lịch sử POS. Bấm Làm mới để đọc lại dữ liệu cửa hàng đã công bố.';board.appendChild(note);}
    const map=q('shop-map');if(map){map.replaceChildren();const a=document.createElement('a');a.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('Tiệm vàng Kim Bảo Lâm 59/1 Nguyễn Thị Tươi Tân Đông Hiệp');a.target='_blank';a.rel='noopener noreferrer';a.textContent='⌖ Mở bản đồ chỉ đường';map.appendChild(a);}
    return()=>{r.removeEventListener('click',click);r.removeEventListener('input',input);r.removeEventListener('submit',submit);clearTimeout(introTimer);dismissIntro();layout.remove();document.body.classList.remove('kbl-home-57109','kbl-ui-polish-v53','kbl-reference-home');};
  },[]);
  useEffect(()=>{if(!root.current)return;const n=root.current.querySelector('#price-updated');if(n)n.textContent=prices.length?date(prices[0].capturedAt):props.error?'Không đọc được bảng giá':'Chưa có giá được công bố';},[props.data,props.error]);
  useEffect(()=>{const controller=new AbortController();let active=true;async function load(){try{const r=await fetch('/api/public/market',{cache:'no-store',signal:controller.signal});if(r.ok&&active)setMarket(await r.json());}catch{if(active)setMarket({available:false,error:'Chưa đọc được nguồn tham khảo.'});}}void load();const timer=setInterval(()=>{if(!document.hidden)void load();},60000);return()=>{active=false;controller.abort();clearInterval(timer);};},[]);
  useEffect(()=>{if(!root.current||!market)return;const q=(id:string)=>root.current!.querySelector<HTMLElement>('#'+id),price=q('kbl-home-xau-price'),change=q('kbl-home-xau-change'),meta=q('kbl-home-xau-meta');if(price)price.textContent=market.available?'XAU/USD · $'+Number(market.xauUsd).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' / oz':'XAU/USD · —';if(change)change.textContent=market.changeAvailable?`${market.changeUsd>=0?'+':''}${market.changeUsd.toFixed(2)}$ · ${market.changePercent>=0?'+':''}${market.changePercent.toFixed(2)}%`:'';if(meta)meta.textContent=market.available?`${market.stale?'Bản lưu tạm · ':''}Nguồn hiển thị: ${market.goldUpdatedAt||'không ghi thời gian'}. Lấy lúc ${date(market.fetchedAt)} · Giá tham khảo.`:market.error||'Chưa có dữ liệu giá vàng thế giới.';},[market]);
  useEffect(()=>{try{localStorage.setItem('kbl-favorites-v2',JSON.stringify(favorite));}catch{}},[favorite]);
  useEffect(()=>{const n=document.getElementById('kbl-cart-link');if(n)n.setAttribute('aria-label',`Giỏ hàng · ${props.cartCount} sản phẩm`);},[props.cartCount]);
  return <>
    <link rel="stylesheet" href="/reference-home/original.css"/><link rel="stylesheet" href="/reference-home/patch.css"/>
    <StaticMarkup nodeRef={root}/>
    {hosts['price-grid']&&createPortal(prices.length?displayGoldPrices(prices).map((p:any)=><article className="price-card" key={p.id}><div className="price-card-head"><h3>{p.label.replace('9999','999.9')}</h3><span className="gold-badge">◆</span></div><div className="price-card-values"><div className="price-value"><span>Mua vào</span><strong>{cash(perChi(p.buy,p.unit))}</strong></div><div className="price-value"><span>Bán ra</span><strong>{cash(perChi(p.sell,p.unit))}</strong></div></div>{p.stale && <div className="price-card-foot">Giá lưu — cần xác nhận tại tiệm</div>}</article>):<div className="reference-price-empty">{props.error||'Chưa có giá được công bố. Bảng giá sẽ xuất hiện khi cửa hàng chốt dữ liệu thật.'}<button className="btn btn-soft" onClick={props.onReload}>Làm mới</button></div>,hosts['price-grid'])}
    {hosts['price-table-body']&&createPortal(prices.map((p:any)=><tr key={p.id}><td>{p.label}</td><td>{cash(perChi(p.buy,p.unit))}</td><td>{cash(perChi(p.sell,p.unit))}</td><td>{p.label}</td><td>đồng/chỉ</td><td>{date(p.capturedAt)}</td></tr>),hosts['price-table-body'])}
    {hosts['reference-world-data']&&createPortal(<><article><small>GIÁ VÀNG THẾ GIỚI · XAU/USD</small><strong>{market?.available?Number(market.xauUsd).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' USD':'—'}</strong><span>{market?.goldUpdatedAt||market?.error||'Đang đọc nguồn tham khảo…'}</span><a href="https://giavang.org/the-gioi/" target="_blank" rel="noopener noreferrer">Nguồn giavang.org ↗</a></article><article><small>TỶ GIÁ VIETCOMBANK · USD BÁN RA</small><strong>{market?.vcb?.available?cash(market.vcb.usdSell):'—'}</strong><span>{market?.vcb?.updatedAt||'Chưa đọc được tỷ giá nguồn.'}</span><a href="https://www.vietcombank.com.vn/KHCN/Cong-cu-tien-ich/Ty-gia?devicechannel=default" target="_blank" rel="noopener noreferrer">Nguồn Vietcombank ↗</a></article><article><small>QUY ĐỔI THAM KHẢO · 24K</small><strong>{market?.conversion?cash(market.conversion.luong24kVnd):'—'} / lượng</strong><span>{market?.conversion?cash(market.conversion.chi24kVnd):'—'} / chỉ</span><span>Không phải giá mua/bán của Kim Bảo Lâm.</span>{market?.stale&&<span>Bản lưu tạm · chờ làm mới nguồn.</span>}</article></>,hosts['reference-world-data'])}
    {hosts['product-grid-available']&&createPortal(products.length?products.map((p:any)=><article className="product-card" key={p.id}><button className={'product-image '+(!p.imageIds?.length?'empty':'')} onClick={()=>props.onProduct(p)} aria-label={'Xem '+p.name}>{p.imageIds?.[0]?<img className="product-image-media" src={'/api/media/'+p.imageIds[0]} alt={p.name} loading="lazy"/>:<span>Ảnh sản phẩm đang cập nhật</span>}<span className="stock-chip">Còn hàng tại tiệm</span><span className="gold-chip">Vàng {p.purity}</span></button><div className="product-body"><div className="product-title-row"><h3>{p.name}</h3></div><div className="product-meta"><span>{p.sku}</span><span>·</span><span>{p.weight?`${(p.weight/3.75).toLocaleString('vi-VN')} chỉ`:'Xác nhận trọng lượng tại tiệm'}</span></div><div className="product-price"><strong>{cash(p.price)}</strong><small>Giá tham khảo</small></div><div className="product-card-actions"><button className="product-button" onClick={()=>props.onProduct(p)}>Xem chi tiết →</button><button className="product-try-button" onClick={()=>props.onTry(p)}>✦ Thử trang sức</button></div><div className="product-card-utility"><button className="product-utility-btn" aria-pressed={favorite.includes(p.id)} onClick={()=>setFavorite(v=>v.includes(p.id)?v.filter(x=>x!==p.id):[...v,p.id])}>{favorite.includes(p.id)?'♥ Đã lưu':'♡ Yêu thích'}</button><button className="product-utility-btn" aria-pressed={compared.includes(p.id)} onClick={()=>setCompared(v=>v.includes(p.id)?v.filter(x=>x!==p.id):v.length<4?[...v,p.id]:v)}>⇄ So sánh</button><button className="product-utility-btn" onClick={async()=>{const url=new URL('/?san-pham='+encodeURIComponent(p.id),location.origin).href;try{if(navigator.share)await navigator.share({title:p.name,url});else {await navigator.clipboard.writeText(url);setNotice('Đã sao chép liên kết sản phẩm.');}}catch{setNotice('Chưa chia sẻ được. Có thể dùng đường dẫn trên thanh địa chỉ.');}}}>↗ Chia sẻ</button></div></div></article>):<div className="product-lane-empty">{props.error||'Chưa có sản phẩm trưng bày trong mục này. Vui lòng xem danh mục khác hoặc liên hệ tiệm.'}</div>,hosts['product-grid-available'])}
    {compared.length>0&&<aside className="reference-compare" aria-label="So sánh sản phẩm"><strong>So sánh sản phẩm</strong><div>{compared.map(id=>{const p=props.data?.products.find((x:any)=>x.id===id);return p?<article key={id}>{p.imageIds?.[0]&&<img src={'/api/media/'+p.imageIds[0]} alt={p.name}/>}<strong>{p.name}</strong><span>{p.purity} · {p.weight} g</span><span>{cash(p.price)}</span><button onClick={()=>setCompared(v=>v.filter(x=>x!==id))}>Bỏ mẫu</button></article>:null;})}</div><button className="btn btn-soft" onClick={()=>setCompared([])}>Đóng so sánh</button></aside>}
    {notice&&<div className="reference-notice" role="status">{notice}<button aria-label="Đóng thông báo" onClick={()=>setNotice('')}>×</button></div>}
  </>;
}
