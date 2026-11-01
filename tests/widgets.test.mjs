import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { widgetSnapshot, widgetRows, widgetState, widgetMoney, widgetClock } from '../lib/kbl/widget-core.mjs';
import { perChi } from '../app/components/reference-home/tools.mjs';
const now = Date.parse('2026-10-31T13:00:00Z');
const codes = ['9999','980','750','610','585','416'];
const fixture = () => ({ prices: codes.map((code,i) => ({code,label:'Vàng '+code,buy:12480000-i*1000000,sell:12780000-i*1000000,unit:'đồng/chỉ',capturedAt:now-30000,stale:false})), products:[{privateUnrelated:'not for cache'}] });
test('widget reads published buy/sell without adding any POS markup', () => {
 const result = widgetSnapshot(fixture(),now);
 assert.equal(result.rows[0].buy,12480000);assert.equal(result.rows[0].sell,12780000);
 assert.equal(result.products,undefined);
 assert.equal(widgetState(result,now).stale,false);
});
test('per-luong conversion exactly matches existing website display convention',()=>{
 const data=fixture();data.prices.forEach(r=>{r.unit='đồng/lượng';r.buy*=10;r.sell*=10;});
 const rows=widgetRows(data,now);
 data.prices.forEach((row,i)=>{assert.equal(rows[i].buy,perChi(row.buy,row.unit));assert.equal(rows[i].sell,perChi(row.sell,row.unit));});
});
test('deduplicate by newest capture time without depending on row order',()=>{
 const data=fixture();data.prices.push({...data.prices[0],sell:12800000,capturedAt:now});data.prices.reverse();
 assert.equal(widgetRows(data,now).length,6);assert.equal(widgetRows(data,now)[0].sell,12800000);
});
for(const change of [r=>r.buy=-1,r=>r.sell=0,r=>r.buy='12480000',r=>r.buy=Infinity,r=>r.sell=NaN,r=>r.sell=1e12,r=>r.buy=r.sell+1,r=>r.unit='USD/oz',r=>r.unit='đồng/gram',r=>r.capturedAt='2026-10-31',r=>r.capturedAt=123,r=>r.capturedAt=now+91000]){
 test('reject malformed or inconsistent source row',()=>{const data=fixture();change(data.prices[0]);assert.throws(()=>widgetRows(data,now));});
}
test('no fabricated 9999 when source is missing',()=>{const data=fixture();data.prices.shift();assert.throws(()=>widgetRows(data,now));});
test('cache is marked stale on network loss or old source; expires after 24h',()=>{
 const data=widgetSnapshot(fixture(),now);
 assert.equal(widgetState(data,now,true).stale,true);
 assert.equal(widgetState(data,now+31*60000).stale,true);
 assert.equal(widgetState(data,now+25*3600000).rows.length,0);
 assert.equal(widgetState({...data,fetchedAt:now+1e6},now).rows.length,0);
 assert.equal(widgetState({version:1,fetchedAt:now,rows:[{sell:'bad'}]},now).expired,true);
});
test('Vietnam money/time formatting is independent from browser timezone',()=>{
 assert.equal(widgetMoney(12780000),'12.780.000');assert.equal(widgetClock(now),'20:00 31/10');
});
async function runScript({theme='Dong',family='medium',status=200,responseURL='https://tiemvangkimbaolam.id.vn/api/public/prices',data=fixture(),cache=null,fail=false}={}) {
 const requests=[],allText=[],files=new Map();if(cache)files.set('/local/kbl-public-prices-v1.json',JSON.stringify(cache));
 class Element { constructor(){this.elements=[];} addText(text){allText.push(String(text));const item={text:String(text)};this.elements.push(item);return item;} addStack(){const item=new Element();this.elements.push(item);return item;} addImage(){return {applyFittingContentMode(){}};}addSpacer(){} layoutVertically(){} centerAlignContent(){}setPadding(){} }
 class Widget extends Element { async presentSmall(){}async presentMedium(){}async presentLarge(){} }
 class FixedDate extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;} }
 const context={Date:FixedDate,FileManager:{local:()=>({joinPath:(a,b)=>a+'/'+b,documentsDirectory:()=>'/local',fileExists:p=>files.has(p),readString:p=>files.get(p),writeString:(p,s)=>files.set(p,s)})},
  Request:class {constructor(url){this.url=url;requests.push(this);}async loadString(){if(fail)throw Error('network down');this.response={statusCode:status,url:responseURL};return typeof data==='string'?data:JSON.stringify(data);}},
  Data:{fromBase64String:value=>value},Image:{fromData:value=>value},ListWidget:Widget,LinearGradient:class {},Color:class {constructor(...args){this.value=args;}},Size:class {},Font:class {constructor(name,size){this.name=name;this.size=size;}static boldSystemFont(n){return n;}static systemFont(n){return n;}},config:{widgetFamily:family,runsInWidget:true},Script:{setWidget:w=>{context.widget=w;},complete:()=>{context.complete=true;}}};
 vm.createContext(context);const script=fs.readFileSync(new URL('../public/tien-ich/widget-kbl/KBL_Gia_Vang_'+theme+'.js',import.meta.url),'utf8');
 await vm.runInContext('(async()=>{'+script+'})()',context,{timeout:1000});
 return {requests,allText,files,context};
}
for(const theme of ['Dong'])for(const family of ['small','medium','large'])test(`actual generated ${theme}/${family} script executes and contains expected public prices`,async()=>{
 const result=await runScript({theme,family});assert.equal(result.context.complete,true);
 assert.ok(result.allText.some(t=>t.includes('12.780.000')));assert.equal(result.requests.length,1);
 assert.equal(result.requests[0].method,'GET');assert.equal(result.requests[0].allowInsecureRequest,false);
 assert.equal(result.requests[0].onRedirect({url:'https://evil.test/'}),null);
 assert.equal(result.requests[0].onRedirect({url:'https://tiemvangkimbaolam.id.vn.evil.test/'}),null);
 assert.ok(result.requests[0].onRedirect({url:'https://tiemvangkimbaolam.id.vn/api/public/prices'}));
 assert.equal(result.context.widget.url,'https://tiemvangkimbaolam.id.vn/#prices');
 const saved=JSON.parse(result.files.get('/local/kbl-public-prices-v1.json'));assert.equal(saved.products,undefined);assert.equal(saved.rows.length,6);
 if(family==='medium') {assert.ok(result.allText.includes('980'));assert.ok(result.allText.includes('610'));assert.ok(!result.allText.includes('750'));}
 if(family==='large') {assert.ok(result.allText.includes('980'));assert.ok(!result.allText.includes('750'));}
});
for(const scenario of [{fail:true},{status:401},{status:500},{data:'<html>error</html>'},{responseURL:'https://evil.test/data'}])test('generated script shows cache timestamp and disconnection without the removed banner on unavailable source',async()=>{
 const result=await runScript({...scenario,cache:widgetSnapshot(fixture(),now)});
 assert.ok(result.allText.some(t=>t.includes('Chưa kết nối · 19:59 31/10')));assert.ok(!result.allText.join(' ').includes('BẢN LƯU · CHƯA CÓ GIÁ MỚI'));assert.ok(result.allText.includes('12.780.000'));
});
test('expired cache and failed source do not expose stale numbers as live quotes',async()=>{
 const snapshot=widgetSnapshot(fixture(),now);snapshot.fetchedAt=now-25*3600000;snapshot.rows.forEach(r=>r.capturedAt=now-25*3600000);
 const result=await runScript({cache:snapshot,fail:true});assert.ok(result.allText.includes('Chưa có giá mới'));assert.ok(!result.allText.includes('12.780.000'));
});
test('scriptable packages import self-contained source and never request unrelated permissions or execute fetched code',()=>{
 for(const suffix of ['Dong']){
  const root=new URL('../public/tien-ich/widget-kbl/',import.meta.url),bundle=JSON.parse(fs.readFileSync(new URL('KBL_Gia_Vang_'+suffix+'.scriptable',root),'utf8'));
  assert.equal(bundle.always_run_in_app,false);assert.deepEqual(bundle.share_sheet_inputs,[]);
  assert.equal(bundle.script,fs.readFileSync(new URL('KBL_Gia_Vang_'+suffix+'.js',root),'utf8'));
  assert.doesNotMatch(bundle.script,/\b(?:eval|importModule|Function|Location|ContactsContainer|Photos|Calendar|Keychain)\s*\(/);
  assert.doesNotMatch(bundle.script,/x-kbl|relay_token|api\/admin|POST|allowInsecureRequest\s*=\s*true/);
 }
});
test('homepage install entry and public route preserve inert markup',()=>{
 const source=fs.readFileSync(new URL('../app/components/reference-home/template.ts',import.meta.url),'utf8');
 const html=JSON.parse(source.split('const template = ')[1].split(/;\r?\nexport default/)[0]);
 assert.match(html,/href="\/widget"/);assert.match(html,/Cài widget miễn phí/);
 assert.doesNotMatch(html,/<script|\son(?:click|input|keydown)\s*=|javascript:/i);
 assert.match(fs.readFileSync(new URL('../app/widget/page.tsx',import.meta.url),'utf8'),/redirect\('\/tien-ich\/widget-kbl\/index.html'\)/);
});

test('approved light widget uses copper sell prices and navy buy prices in actual native elements',async()=>{
 for(const family of ['small','medium','large']){
  const {context}=await runScript({family});
  assert.equal(context.widget.backgroundColor.value[0],'FFFEFD');
  const texts=[];function walk(el){if(el.text)texts.push(el);for(const child of el.elements||[])walk(child);}walk(context.widget);
  assert.ok(texts.some(t=>t.text==='12.780.000'&&t.textColor.value[0]==='9B4D2D'));
  assert.ok(texts.some(t=>t.text==='12.480.000'&&t.textColor.value[0]==='102C43'));
  assert.ok(context.widget.backgroundImage.length>1000);
 }
});
test('updated native board uses larger quote text, full purity labels and confirmed shop address',async()=>{const r=await runScript({family:'medium'}),texts=[];function walk(e){if(e.text)texts.push(e);for(const c of e.elements||[])walk(c);}walk(r.context.widget);assert.ok(texts.some(t=>t.text==='999.9'));assert.ok(!texts.some(t=>t.text==='Vàng 99...'));assert.ok(texts.some(t=>t.text==='12.780.000'&&t.font.size===15));assert.ok(texts.some(t=>t.text==='59/1 Nguyễn Thị Tươi, Phường Tân Đông Hiệp, Tp. Hồ Chí Minh'));assert.ok(!texts.some(t=>t.text.includes('BẢN LƯU')));assert.ok(r.requests[0].url.endsWith('/api/public/prices'));});
