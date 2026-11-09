import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const renderer=read('pos-source/renderer.js');
const addon=read('pos-source/pawn-pro-addon.js');
const home=read('app/components/reference-home/index.tsx');
const extras=read('app/components/reference-home/restored-parts.tsx');
const css=read('app/components/reference-home/restored-parts.css');
const lost=renderer.split('function pawnLostDocHtml() {')[1]?.split('function renderPawnLostDocument()')[0]||'';
const standalone=addon.split('function lostHtml(){')[1]?.split('function renderLostPreview()')[0]||'';

test('both lost-ticket A4 routes use the pawn business name, not jewelry-company name or tax ID',()=>{
 for(const [name,html] of [['POS parent',lost],['standalone',standalone]]){
  assert.match(html,/HỘ KINH DOANH CẦM ĐỒ NGUYỄN VĂN LÂM/,name);
  assert.doesNotMatch(html,/CÔNG TY TNHH MTV VÀNG BẠC ĐÁ QUÝ KIM BẢO LÂM|3703496362/i,name);
  assert.match(html,/MẤT PHIẾU CẦM/,name);
 }
 assert.doesNotMatch(standalone,/data-shop-field="companyName"/,'shop profile must not overwrite pawn issuer');
 assert.match(renderer,/function printPawnLostA4\(\)/);
 assert.match(renderer,/printKblA4Html\(pawnLostDocHtml\(\)/);
 assert.match(addon,/function renderLostPreview\(\).*lostHtml\(\)/);
 assert.match(addon,/async function printLost\(\)/);
});

test('approved storefront keeps prices, catalog, real market, footer, news and customer utilities',()=>{
 for(const part of ['home-price-table','home-price-two-col','<MarketSnapshot/>','home-categories','<RestoredSections','<RestoredFooter','<FloatingControls'])
  assert.ok(home.includes(part),part);
 assert.match(extras,/public\/market/);
 assert.match(extras,/public\/fx/);
 assert.match(extras,/home-market-xau/);
 assert.match(css,/home-market-xau\{[^}]*white-space:nowrap/);
 for(const route of ['/tin-tuc','/tra-cuu','/bao-hanh','/vang-cua-toi','/huong-dan-mua-hang.html','/bo-chinh-sach.html'])
  assert.ok(extras.includes(route),'Missing restored route '+route);
 assert.match(extras,/online\.gov\.vn/);
 assert.match(extras,/window\.scrollTo/);
 assert.match(home,/onReload=\{p\.onReload\}/);
 assert.doesNotMatch(extras,/(?:12\.561\.000|3,939\.67|25\.960)/,'No hardcoded quote data from screenshots');
});
