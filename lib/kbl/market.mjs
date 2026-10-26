// Adapted from the user's kbl-web app.js, commit 6f68320ad2af03893509497011fc9dbcc2e18ad6.
// Public reference only. No KBL/POS price comparison, spread or private profitability.
export const MARKET_SOURCES={gold:'https://giavang.org/the-gioi/',fx:'https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx'};
const HOSTS=new Set(['giavang.org','www.giavang.org','portal.vietcombank.com.vn']);
export function marketNumber(value){
  let s=String(value??'').trim().replace(/\s+/g,'');
  if(!/^[+-]?\d[\d.,]*$/.test(s))return 0;
  if(s.includes(',')&&s.includes('.')){
    s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  }else if(/^[+-]?\d{1,3}(?:[,\.]\d{3})+$/.test(s))s=s.replace(/[,\.]/g,'');
  else s=s.replace(',','.');
  const n=Number(s);return Number.isFinite(n)?n:0;
}
const plain=(html)=>String(html).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
export function parseWorldGold(html){
  const s=plain(html);
  const priceMatch=s.match(/Giá vàng quốc tế\s*\(XAU\)\s*hôm nay là\s*([0-9.,]+)\s*USD/i)||s.match(/Giá vàng thế giới\s*-?\s*XAU\/USD[^0-9]*([0-9.,]+)\s*USD/i);
  const xauUsd=marketNumber(priceMatch?.[1]);
  if(xauUsd<100||xauUsd>1e7)throw Error('Nguồn vàng chưa có số XAU/USD được nhận diện.');
  const movement=s.match(/Giá vàng thế giới nhìn chung có\s*(tăng|giảm)\s*([0-9.,]+)%\s*trong\s*24\s*giờ(?:\s*qua)?\s*,?\s*tương ứng với\s*(?:tăng|giảm)\s*([0-9.,]+)\s*USD\/Ounce/i);
  const update=s.match(/cập nhật lúc\s*([0-9:]+\s+[0-9/]+)/i);
  const sign=movement?.[1]?.toLowerCase()==='giảm'?-1:1;
  return {available:true,xauUsd,changeAvailable:!!movement,changeUsd:movement?marketNumber(movement[3])*sign:null,changePercent:movement?marketNumber(movement[2])*sign:null,goldUpdatedAt:update?.[1]?.slice(0,48)||'',source:MARKET_SOURCES.gold};
}
export function parseVcbUsd(xml){
  const row=String(xml).match(/<Exrate\b[^>]*\bCurrencyCode=["']USD["'][^>]*>/i)?.[0]||'';
  const sell=marketNumber(row.match(/\bSell=["']([^"']+)["']/i)?.[1]);
  if(sell<100||sell>1e7)throw Error('Nguồn Vietcombank chưa có tỷ giá USD bán ra.');
  return {available:true,usdSell:sell,selectedRateType:'USD_SELL',updatedAt:String(xml).match(/<DateTime>([^<]+)<\/DateTime>/i)?.[1]?.slice(0,64)||'',source:MARKET_SOURCES.fx};
}
async function boundedText(url,fetcher){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7500);
  try{
    for(let i=0;i<4;i++){
      const u=new URL(url);
      if(u.protocol!=='https:'||u.username||u.password||u.port||!HOSTS.has(u.hostname))throw Error('Nguồn tham khảo chuyển đến địa chỉ không được phép.');
      const response=await fetcher(u.href,{signal:controller.signal,redirect:'manual',headers:{Accept:'text/html,application/xml,text/xml;q=0.9', 'User-Agent':'KBL-Market-Reference/2.0'}});
      if([301,302,303,307,308].includes(response.status)){const next=response.headers.get('location');await response.body?.cancel();if(!next)throw Error('Nguồn chuyển hướng không hợp lệ.');url=new URL(next,u).href;continue;}
      if(!response.ok||!response.body)throw Error('Nguồn tham khảo chưa phản hồi.');
      const reader=response.body.getReader();const chunks=[];let bytes=0;
      try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>650000)throw Error('Nguồn tham khảo vượt kích thước cho phép.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
      const out=new Uint8Array(bytes);let at=0;for(const b of chunks){out.set(b,at);at+=b.length;}
      return new TextDecoder().decode(out);
    }
    throw Error('Nguồn chuyển hướng quá nhiều lần.');
  }finally{clearTimeout(timer);}
}
export function createMarketReader({fetcher=(...args)=>fetch(...args),clock=()=>Date.now()}={}){
  let cache=null,at=0,flight=null,failedAt=-Infinity,unavailable=null;
  return async function read(){
    const now=clock();if(cache&&now-at<60000)return cache;if(unavailable&&now-failedAt<30000)return unavailable;if(flight)return flight;
    flight=(async()=>{
      const [goldResult,fxResult]=await Promise.allSettled([boundedText(MARKET_SOURCES.gold,fetcher).then(parseWorldGold),boundedText(MARKET_SOURCES.fx,fetcher).then(parseVcbUsd)]);
      const gold=goldResult.status==='fulfilled'?goldResult.value:null,fx=fxResult.status==='fulfilled'?fxResult.value:null;
      if(!gold){
        failedAt=now;
        if(cache&&now-at<6*3600000){unavailable={...cache,stale:true,error:'Chưa làm mới được nguồn vàng. Đang hiển thị bản lưu có thời điểm.'};return unavailable;}
        unavailable={available:false,stale:false,xauUsd:null,vcb:fx,conversion:null,fetchedAt:null,error:'Chưa đọc được giá vàng thế giới từ nguồn gốc.',sources:MARKET_SOURCES};return unavailable;
      }
      const vndPerOunce=fx?gold.xauUsd*fx.usdSell:0;
      const snapshot={...gold,vcb:fx,conversion:fx?{luong24kVnd:Math.round(vndPerOunce*37.5/31.1034768),chi24kVnd:Math.round(vndPerOunce*3.75/31.1034768)}:null,fetchedAt:new Date(now).toISOString(),stale:false,sources:MARKET_SOURCES,disclaimer:'Quy đổi tham khảo theo tỷ giá USD bán ra Vietcombank; không phải giá mua/bán của Kim Bảo Lâm.'};
      cache=snapshot;at=now;unavailable=null;failedAt=-Infinity;return snapshot;
    })();
    try{return await flight;}finally{flight=null;}
  };
}
export const readWorldMarket=createMarketReader();
