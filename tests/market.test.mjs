import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketReader,parseVcbUsd,parseWorldGold,marketNumber} from '../lib/kbl/market.mjs';
const gold='<p>Giá vàng quốc tế (XAU) hôm nay là 4,000.66 USD. Giá vàng thế giới nhìn chung có tăng 0.17% trong 24 giờ qua, tương ứng với tăng 6.99 USD/Ounce. Cập nhật lúc 07:00:00 26/10/2026.</p>';
const fx='<ExrateList><DateTime>10/26/2026 6:21:55 AM</DateTime><Exrate CurrencyCode="USD" Buy="25,500" Transfer="25,700" Sell="26,020.00"/></ExrateList>';
test('original market conventions retain USD sell conversion and require explicit change direction',()=>{
  assert.equal(marketNumber('4,000'),4000);assert.equal(marketNumber('4,000.66'),4000.66);assert.equal(marketNumber('4.000,66'),4000.66);assert.equal(marketNumber('26,020.00'),26020);
  const value=parseWorldGold(gold);assert.equal(value.xauUsd,4000.66);assert.equal(value.changeUsd,6.99);assert.equal(value.changePercent,.17);
  assert.equal(parseVcbUsd(fx).usdSell,26020);
  assert.equal(parseWorldGold('<p>Giá vàng quốc tế (XAU) hôm nay là 4,000.66 USD. 6.99 USD (0.17%)</p>').changeAvailable,false);
  assert.throws(()=>parseWorldGold('<title>Just a moment</title>'));
  assert.throws(()=>parseVcbUsd('<html>blocked</html>'));
});
test('one shared fetch per refresh, bounded stale cache, outage backoff and no fabricated zero quote',async()=>{
  let now=0,calls=0,broken=false;
  const read=createMarketReader({clock:()=>now,fetcher:async url=>{calls++;if(broken)throw Error('offline');return new Response(url.includes('giavang')?gold:fx);}});
  const values=await Promise.all(Array.from({length:5},()=>read()));assert.equal(calls,2);assert.ok(values.every(v=>v.xauUsd===4000.66));
  assert.equal(values[0].conversion.chi24kVnd,Math.round(4000.66*26020*3.75/31.1034768));
  now=61000;broken=true;const stale=await read();assert.equal(stale.stale,true);assert.equal(stale.fetchedAt,values[0].fetchedAt);
  await read();assert.equal(calls,4);
  now=7*3600000;const unavailable=await read();assert.equal(unavailable.available,false);assert.equal(unavailable.xauUsd,null);assert.equal(unavailable.conversion,null);
});
test('public reference fetch refuses unexpected redirects and overlarge responses',async()=>{
  let calls=0;
  const redirect=createMarketReader({fetcher:async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}});}});
  assert.equal((await redirect()).available,false);assert.equal(calls,2);
  const large=createMarketReader({fetcher:async()=>new Response('x'.repeat(650001))});
  assert.equal((await large()).available,false);
});

test('independent bank refresh never fetches gold, uses USD SELL, marks stale failures and expires cached bank data',async()=>{
 const {createVcbReader,convertWorldGold}=await import('../lib/kbl/market.mjs');let now=0,calls=0,fail=false;const read=createVcbReader({clock:()=>now,fetcher:async url=>{assert(url.includes('vietcombank.com.vn'));calls++;if(fail)throw Error('bank unavailable');return new Response(fx);}});const first=await read();assert.equal(first.usdSell,26020);assert.equal(first.stale,false);await read();assert.equal(calls,1);now=61000;fail=true;const stale=await read();assert.equal(stale.stale,true);assert.equal(stale.fetchedAt,first.fetchedAt);now=7*3600000;assert.equal((await read()).available,false);assert.equal(convertWorldGold(null,26020),null);assert.equal(convertWorldGold(4000,0),null);assert.deepEqual(convertWorldGold(4000,26020),{luong24kVnd:Math.round(4000*26020*37.5/31.1034768),chi24kVnd:Math.round(4000*26020*3.75/31.1034768)});
});
test('world view uses official TradingView widgets and bank refresh, never labels external gold samples as TradingView quotes',()=>{
 const fs=createRequire(import.meta.url)('node:fs');const view=fs.readFileSync('app/components/price-history.tsx','utf8'),widget=fs.readFileSync('app/components/tradingview-market.tsx','utf8');assert(view.includes('<TradingViewMarket/>'));assert(view.includes("api('public/fx')"));assert(!view.includes('history?.world'));assert(!view.includes('giavang.org'));assert(widget.includes('OANDA:XAUUSD'));assert(widget.includes('s3.tradingview.com'));assert(view.includes('không phải luồng quy đổi tự động'));
});
