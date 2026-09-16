(()=>{
  'use strict';
  if(window.__KBL_MARKET_WORLD_V52__)return;window.__KBL_MARKET_WORLD_V52__=true;
  const $all=(s,r=document)=>[...r.querySelectorAll(s)];
  const txt=(el)=>String(el?.textContent||'').replace(/\s+/g,' ').trim();
  const exact=(label)=>$all('button,a,[role="tab"],label,span,div').find(el=>txt(el)===label);
  const money=(n)=>Number(n||0)>0?Math.round(Number(n)).toLocaleString('vi-VN')+' đ':'—';
  const num=(n,d=2)=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
  const css=`
  .kbl-market-v52{display:none;margin:16px 0 6px;border:1px solid #ead39a;border-radius:18px;background:linear-gradient(180deg,#fffdf8 0%,#fff 100%);overflow:hidden;box-shadow:0 10px 28px rgba(8,36,67,.06)}
  .kbl-market-v52.on{display:block}.kbl-market-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:18px 20px;border-bottom:1px solid #eee5d4}.kbl-market-kicker{font-size:11px;font-weight:900;letter-spacing:.12em;color:#b36e00}.kbl-market-head h3{margin:5px 0 4px;color:#082443;font-family:Georgia,'Times New Roman',serif;font-size:25px}.kbl-market-head p{margin:0;color:#64748b;font-size:12px;line-height:1.5}.kbl-market-live{display:flex;align-items:center;gap:7px;white-space:nowrap;color:#526577;font-size:11px}.kbl-market-live i{width:8px;height:8px;border-radius:50%;background:#53d2b2;box-shadow:0 0 0 4px #e9fbf6}
  .kbl-market-metrics{display:grid;grid-template-columns:1.15fr .85fr 1fr;gap:10px;padding:14px 20px}.kbl-market-metric{border:1px solid #e8edf2;border-radius:13px;padding:13px;background:#fff}.kbl-market-metric small{display:block;color:#64748b;font-weight:700;margin-bottom:5px}.kbl-market-metric strong{display:block;color:#082443;font-size:23px;line-height:1.2}.kbl-market-metric .sub{margin-top:5px;color:#64748b;font-size:11px;line-height:1.45}.kbl-market-change.up{color:#0d9f78}.kbl-market-change.down{color:#c24a42}
  .kbl-market-convert{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:7px}.kbl-market-convert span{display:block;padding:7px 8px;border-radius:9px;background:#fff9e8;color:#815b00;font-weight:800;font-size:12px}.kbl-market-chart{height:510px;margin:0 20px 16px;border:1px solid #e6e9ed;border-radius:14px;overflow:hidden;background:#fff}.kbl-market-note{margin:0 20px 18px;padding:11px 13px;border-radius:11px;background:#f5f8fb;color:#526577;font-size:11px;line-height:1.55}.kbl-market-note b{color:#082443}.kbl-market-source{display:flex;gap:12px;flex-wrap:wrap;margin-top:5px}.kbl-market-source a{color:#956300;text-decoration:none;font-weight:800}.kbl-market-source a:hover{text-decoration:underline}
  @media(max-width:820px){.kbl-market-head{display:block}.kbl-market-live{margin-top:10px}.kbl-market-metrics{grid-template-columns:1fr}.kbl-market-chart{height:440px;margin-left:10px;margin-right:10px}.kbl-market-note{margin-left:10px;margin-right:10px}.kbl-market-head,.kbl-market-metrics{padding-left:12px;padding-right:12px}}
  `;
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);

  let panel=null, timer=null, chartLoaded=false, marketTab=null, otherTabs=[], tableEl=null, historyBlock=null;
  function findSection(tab){
    let p=tab;for(let i=0;i<9&&p;i++,p=p.parentElement){const t=txt(p);if(t.includes('Kim Bảo Lâm')&&t.includes('Tham khảo thị trường')&&t.includes('Nguyên liệu')&&(t.includes('Giá theo loại vàng')||p.querySelector('table')))return p}
    return tab.closest('section,article,.card')||tab.parentElement;
  }
  function findTabRow(tab){
    let p=tab.parentElement;for(let i=0;i<6&&p;i++,p=p.parentElement){const labels=$all('button,a,[role="tab"]',p).map(txt);if(labels.some(x=>x==='Kim Bảo Lâm')&&labels.some(x=>x==='Tham khảo thị trường')&&labels.some(x=>x==='Nguyên liệu'))return p}
    return tab.parentElement;
  }
  function findHistory(section){
    const el=$all('div,p,h3,h4,strong,b,span',section).find(x=>/^Lịch sử vàng/i.test(txt(x)));if(!el)return null;
    let p=el;for(let i=0;i<3&&p?.parentElement;i++,p=p.parentElement){if(p.parentElement.children.length>1)return p}
    return el;
  }
  function buildPanel(section,row){
    panel=document.createElement('div');panel.className='kbl-market-v52';panel.id='kbl-market-world-v52';panel.innerHTML=`
      <div class="kbl-market-head"><div><div class="kbl-market-kicker">THAM KHẢO THỊ TRƯỜNG · XAU/USD</div><h3>Giá vàng thế giới & quy đổi tham khảo</h3><p>Biểu đồ TradingView · quy đổi 24K theo tỷ giá USD MUA VÀO của Vietcombank.</p></div><div class="kbl-market-live"><i></i><span id="kbl-mkt-updated">Đang lấy dữ liệu…</span></div></div>
      <div class="kbl-market-metrics">
        <div class="kbl-market-metric"><small>GIÁ VÀNG THẾ GIỚI · XAU/USD</small><strong id="kbl-mkt-xau">—</strong><div id="kbl-mkt-change" class="sub">Đang cập nhật tham khảo…</div></div>
        <div class="kbl-market-metric"><small>TỶ GIÁ VIETCOMBANK · USD MUA VÀO</small><strong id="kbl-mkt-fx">—</strong><div class="sub" id="kbl-mkt-fx-time">Nguồn Vietcombank</div></div>
        <div class="kbl-market-metric"><small>GIÁ QUY ĐỔI THAM KHẢO THEO TỶ GIÁ VIETCOMBANK</small><div class="kbl-market-convert"><span>1 lượng 24K<br><b id="kbl-mkt-luong">—</b></span><span>1 chỉ 24K<br><b id="kbl-mkt-chi">—</b></span></div><div class="sub">Không phải giá mua/bán của Kim Bảo Lâm.</div></div>
      </div>
      <div class="kbl-market-chart" id="kbl-market-chart"></div>
      <div class="kbl-market-note"><b>Lưu ý:</b> Giá quy đổi chỉ mang tính tham khảo theo XAU/USD và tỷ giá MUA VÀO USD của Vietcombank, không dùng để tính hay công bố biên lợi nhuận của tiệm. Giá thực tế tại Kim Bảo Lâm phụ thuộc bảng giá POS hiện tại, hàm lượng vàng, sản phẩm và các yếu tố giao dịch thực tế.<div class="kbl-market-source"><a href="https://giavang.org/the-gioi/" target="_blank" rel="noopener noreferrer">Nguồn XAU tham khảo: giavang.org</a><a href="https://www.vietcombank.com.vn/KHCN/Cong-cu-tien-ich/Ty-gia?devicechannel=default" target="_blank" rel="noopener noreferrer">Nguồn tỷ giá: Vietcombank</a><a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">Biểu đồ: TradingView</a></div></div>`;
    row.insertAdjacentElement('afterend',panel);
    tableEl=section.querySelector('table');historyBlock=findHistory(section);
  }
  function loadChart(){
    if(chartLoaded||!panel)return;chartLoaded=true;const host=panel.querySelector('#kbl-market-chart');if(!host)return;
    host.innerHTML='<div class="tradingview-widget-container" style="height:100%;width:100%"><div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div></div>';
    const script=document.createElement('script');script.type='text/javascript';script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';script.async=true;script.text=JSON.stringify({autosize:true,symbol:'OANDA:XAUUSD',interval:'5',timezone:'Asia/Ho_Chi_Minh',theme:'light',style:'1',locale:'vi',withdateranges:true,hide_side_toolbar:true,allow_symbol_change:false,save_image:false,calendar:false,support_host:'https://www.tradingview.com'});host.firstElementChild.appendChild(script);
  }
  async function refresh(){
    if(!panel)return;try{const r=await fetch('/api/market/world-gold',{cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Không lấy được dữ liệu');const m=d.market||{};
      panel.querySelector('#kbl-mkt-xau').textContent=m.xauUsd?num(m.xauUsd,2)+' USD':'—';
      const ch=panel.querySelector('#kbl-mkt-change'),pct=Number(m.changePercent||0),delta=Number(m.changeUsd||0);ch.className='sub kbl-market-change '+(pct>=0?'up':'down');ch.textContent=(pct>=0?'▲ ':'▼ ')+num(Math.abs(delta),2)+' USD · '+(pct>=0?'+':'−')+num(Math.abs(pct),2)+'% / 24h';
      panel.querySelector('#kbl-mkt-fx').textContent=m.vcb?.usdBuy?Math.round(m.vcb.usdBuy).toLocaleString('vi-VN')+' VND':'—';
      panel.querySelector('#kbl-mkt-fx-time').textContent=m.vcb?.updatedAt?'VCB '+(m.vcb.stale?'dữ liệu gần nhất: ':'cập nhật: ')+m.vcb.updatedAt:'Nguồn Vietcombank';
      panel.querySelector('#kbl-mkt-luong').textContent=money(m.conversion?.luong24kVnd);panel.querySelector('#kbl-mkt-chi').textContent=money(m.conversion?.chi24kVnd);
      const stamp=m.goldUpdatedAt?m.goldUpdatedAt:new Date(m.fetchedAt||Date.now()).toLocaleString('vi-VN');panel.querySelector('#kbl-mkt-updated').textContent=(m.stale?'Dữ liệu gần nhất · ':'Cập nhật · ')+stamp;
    }catch(e){panel.querySelector('#kbl-mkt-updated').textContent='Nguồn quy đổi tạm chưa phản hồi · biểu đồ TradingView vẫn hoạt động';}
  }
  function showMarket(){if(!panel)return;const section=findSection(marketTab);if(section){tableEl=section.querySelector('table')||tableEl;historyBlock=findHistory(section)||historyBlock}panel.classList.add('on');if(tableEl)tableEl.dataset.kblOldDisplay=tableEl.style.display||'',tableEl.style.display='none';if(historyBlock&&historyBlock!==panel&&!panel.contains(historyBlock))historyBlock.dataset.kblOldDisplay=historyBlock.style.display||'',historyBlock.style.display='none';loadChart();refresh();clearInterval(timer);timer=setInterval(refresh,60000)}
  function hideMarket(){if(!panel)return;panel.classList.remove('on');if(tableEl)tableEl.style.display=tableEl.dataset.kblOldDisplay||'';if(historyBlock)historyBlock.style.display=historyBlock.dataset.kblOldDisplay||'';clearInterval(timer);timer=null}
  function install(){
    marketTab=exact('Tham khảo thị trường');if(!marketTab)return false;const section=findSection(marketTab),row=findTabRow(marketTab);if(!section||!row)return false;if(!panel)buildPanel(section,row);
    const tabs=$all('button,a,[role="tab"]',row).filter(el=>['Kim Bảo Lâm','Tham khảo thị trường','Nguyên liệu'].includes(txt(el)));otherTabs=tabs.filter(x=>x!==marketTab);
    if(!marketTab.dataset.kblMarketBound){marketTab.dataset.kblMarketBound='1';marketTab.addEventListener('click',()=>setTimeout(showMarket,30));otherTabs.forEach(t=>t.addEventListener('click',()=>setTimeout(hideMarket,10)))}
    return true;
  }
  if(!install()){const obs=new MutationObserver(()=>{if(install())obs.disconnect()});obs.observe(document.documentElement,{subtree:true,childList:true});setTimeout(()=>obs.disconnect(),20000)}
})();
