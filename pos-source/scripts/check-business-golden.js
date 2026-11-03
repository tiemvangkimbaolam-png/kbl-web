const fs=require('fs'),vm=require('vm'),path=require('path');
const source=fs.readFileSync(path.resolve(__dirname,'../renderer.js'),'utf8');
function extract(start,next){
  const a=source.indexOf('function '+start+'('), b=source.indexOf('function '+next+'(',a+2);
  if(a<0||b<=a) throw Error('Cannot isolate '+start);
  return source.slice(a,b);
}
const settingsStore={price_buy_610:10_000_000,price_sell_610:11_000_000,price_buy_980:16_000_000,free_ship_reserve_profit:100_000,profit_floor_base:100_000};
const mock={
 settingsStore, Math, Map, Set,
 numberValue:v=>Number(v)||0,
 roundWeightLy:v=>Math.round((Number(v)||0)*10)/10,
 inventorySellWage:item=>Number(item.wage)||0,
 inventorySellPrice:item=>Number(item.priceSell)||0,
 inventoryEffectiveBookCost:item=>Number(item.bookCost)||0,
 exchangeFeeForPair:(a,b)=>a==='610'&&a===b?400_000:a==='980'&&a===b?120_000:0,
 exchangeRefundForPair:()=>30_000,
 exchangeRuleText:(a,b)=>a+' -> '+b,
 flexibleProfitTarget:()=>150_000,
 smartExchange610Status:v=>({label:'test',value:v})
};
const code=extract('calculateSmart610ExchangeSettlement','calculateExchangeSettlement')
   +extract('calculateExchangeSettlement','exchangeCompensation');
const sandbox=vm.createContext(mock);vm.runInContext(code,sandbox);
const assert=(cond,msg)=>{if(!cond)throw Error(msg)};
const C=sandbox.calculateSmart610ExchangeSettlement;
const X=sandbox.calculateExchangeSettlement;
const n=[{type:'610',weightLy:100,wage:250_000,originalWage:100_000,processCost:50_000,bookCost:7_500_000,priceSell:11_000_000}];
const o=[{type:'610',weightLy:100,priceBuy:10_000_000}];
const a=C(n,o);
const expectedChanh=-((630-610)/622)*11_000_000;
const expectedProfit=Math.round(expectedChanh + (250_000-100_000-50_000));
assert(a.totalPay===250_000,'KBL same weight: only sell wage is charged');
assert(a.profit===expectedProfit,'KBL profit must include 610/630->622 chanh cash flow');
assert(Math.abs(a.internal.chanhDifferenceChi-20/622)<1e-10,'KBL conversion to 622');
assert(a.internal.chanhBuy===10_200_000&&a.internal.chanhSell===11_000_000,'Locked chanh rates');
const b=C(n,[{...o[0],weightLy:200}]);
assert(b.customerFormula.goldDifferenceAmount===-10_000_000,'Old surplus at POS buy price');
const c=C([{...n[0],weightLy:200}],o);
assert(c.customerFormula.goldDifferenceAmount===11_000_000,'New shortage at POS sell price');
const ex=X(n,[{type:'610',weightLy:200,priceBuy:10_000_000}]);
assert(ex.specialFee===800_000,'Same type 610 fee = ALL old 2 chi');
assert(ex.totalPay===-8_950_000,'610 surplus at buy price + wage + full old fee');
assert(ex.adjustmentLines[0].oldWeightLy===200&&ex.adjustmentLines[0].matchedWeightLy===100,'610 fee based on full old weight, not matched part');
const px=X([{...n[0],type:'980',priceSell:17_000_000}], [{type:'980',weightLy:200,priceBuy:16_000_000}]);
assert(px.specialFee===240_000,'980 fee = ALL old 2 chi');
const xgold=X([{...n[0],type:'9999',priceSell:25_000_000}],[{type:'9999',weightLy:100,priceBuy:24_000_000}]);
assert(xgold.specialFee===0&&xgold.totalPay===0,'9999 equal weight no gold/wage fee');
console.log('[PASS] Real settlement functions: 610 smart exchange, 622 chanh, 610/980 full-old fee, 9999 parity, buy/sell prices.');
