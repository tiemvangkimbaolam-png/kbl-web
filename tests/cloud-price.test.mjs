import { before,test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { parseCloudAskNumber,cloudAskToBaseVnd,deriveCloudPrices,fetchCloudRelay,safeCloudSpreads,publicCloudSnapshot } from '../lib/kbl/cloud-price-core.mjs';
const relayUrl='https://script.google.com/macros/s/FIXTURE_ABCDEFGHIJK/exec',relayToken='PRIVATE-RELAY-TOKEN';
const json=value=>new Response(JSON.stringify(value));
test('legacy BK ASK conversion, effective purities and spreads remain exact',()=>{
 assert.equal(parseCloudAskNumber(' 139,999.9 '),139999.9);assert.equal(cloudAskToBaseVnd(139999.9),13999000);
 const result=deriveCloudPrices('139,999.9',100001,{'9999':300000,'980':310000,'750':510000,'610':410000,'585':520000,'416':530000});assert.equal(result.finalSell9999,14099000);
 for(const[code,effective,spread]of[['9999',9999,300000],['980',9850,310000],['750',7650,510000],['610',6220,410000],['585',6000,520000],['416',4300,530000]]){const row=result.rows.find(r=>r.code===code),sell=code==='9999'?14099000:Math.round(14099000*effective/9999/10000)*10000;assert.equal(row.sell,sell);assert.equal(row.buy,sell-spread);assert.equal(row.unit,'đồng/chỉ');}
 assert.equal(safeCloudSpreads({'9999':300})['9999'],300000);assert.throws(()=>deriveCloudPrices('999',100000,{}));assert.throws(()=>deriveCloudPrices('200,000',100000,{},10000000),/35%/);for(const bad of ['NaN','Infinity','139.999,9x','<html>','-100'])assert.equal(parseCloudAskNumber(bad),0);
});
test('relay restricts redirects, bounds response and never invents source observation time',async()=>{
 const calls=[];const value=await fetchCloudRelay({relayUrl,relayToken},{now:1793000000000,fetcher:async(url,init)=>{calls.push({url,init});return calls.length===1?new Response(null,{status:302,headers:{Location:'https://script.googleusercontent.com/macros/echo?fixture=1'}}):json({status:'success',symbol:'BK',ask:'140,000',bid:'139,000'});}});
 assert.equal(value.observedAt,null);assert.equal(value.fetchedAt,1793000000000);assert.equal(new URL(calls[0].url).searchParams.get('token'),relayToken);assert.equal(calls[0].init.redirect,'manual');
 await assert.rejects(()=>fetchCloudRelay({relayUrl,relayToken},{fetcher:async()=>new Response(null,{status:302,headers:{Location:'https://evil.example/steal'}})}),/ngoài/);
 await assert.rejects(()=>fetchCloudRelay({relayUrl,relayToken},{fetcher:async()=>new Response('x'.repeat(65537))}),/giới hạn/);
 await assert.rejects(()=>fetchCloudRelay({relayUrl,relayToken},{fetcher:async()=>new Response('<html>Denied '+relayToken+'</html>')}),e=>!e.message.includes(relayToken));
 await assert.rejects(()=>fetchCloudRelay({relayUrl,relayToken},{fetcher:async()=>json({status:'success',symbol:'OTHER',ask:'140000'})}),/BK/);
 await assert.rejects(()=>fetchCloudRelay({relayUrl,relayToken},{fetcher:async()=>{throw Error(relayToken);}}),e=>!e.message.includes(relayToken));
});
test('stale and failed source keeps last values with original timestamps and explicit fetch labels',()=>{
 const snapshot={rows:[{code:'9999',buy:13000000,sell:14000000}],fetchedAt:1000000,observedAt:null};let value=publicCloudSnapshot(snapshot,{}, {enabled:true,configured:true},1000010);assert.equal(value.fresh,true);assert.equal(value.prices[0].timestampKind,'fetched-from-relay');assert.equal(value.prices[0].observedAt,null);
 value=publicCloudSnapshot(snapshot,{lastError:'Relay chưa sẵn sàng'},{enabled:true,configured:true},1000020);assert.equal(value.active,true);assert.equal(value.fresh,false);assert.equal(value.fetchedAt,1000000);assert.equal(value.prices[0].sell,14000000);
 assert.equal(publicCloudSnapshot(snapshot,{}, {enabled:true,configured:true},1400000).fresh,false);assert.equal(publicCloudSnapshot(snapshot,{}, {enabled:false},1000010).active,false);
});
const db=new DatabaseSync(':memory:');
function prepare(query){let params=[];const stmt={bind(...p){params=p;return stmt;},async first(){return db.prepare(query).get(...params)||null;},async all(){return{results:db.prepare(query).all(...params)};},async run(){const r=db.prepare(query).run(...params);return{meta:{changes:Number(r.changes)}};}};return stmt;}
let mod,env;
before(async()=>{for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8').replaceAll('--> statement-breakpoint',''));env=globalThis.__KBL_CLOUD_PRICE_ENV={KBL_PRICE_ENCRYPTION_KEY:'a'.repeat(64),DB:{prepare}};db.prepare("INSERT INTO records(kind,id,data,created_at,updated_at) VALUES('pos-binding','main',?,1,1)").run(JSON.stringify({workerId:'pos-owner'}));const{build}=createRequire(fs.realpathSync('node_modules/wrangler/package.json'))('esbuild');await build({entryPoints:['lib/kbl/cloud-price.ts'],bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/cloud-price-fixture.mjs',plugins:[{name:'cloud-price-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env=globalThis.__KBL_CLOUD_PRICE_ENV;',loader:'js'}));}}]});mod=await import(path.resolve('.sites-runtime/cloud-price-fixture.mjs'));});
test('only bound POS configures encrypted relay, duplicate revision is safe and stale updates cannot overwrite',async()=>{
 const config={enabled:true,relayUrl,relayToken,markupVnd:100000,pollMs:60000,spreads:{'9999':300000,'980':300000,'750':500000,'610':400000,'585':500000,'416':500000}};
 await assert.rejects(()=>mod.configureCloudPrice('other',{config,revision:1}),/đã ghép/);
 await assert.rejects(()=>mod.configureCloudPrice('pos-owner',{config:{relayUrl,relayToken},revision:1}),/trạng thái/);
 await assert.rejects(()=>mod.configureCloudPrice('pos-owner',{config:{enabled:true,relayUrl,relayToken,markupVnd:100000},revision:1}),/sáu/);
 await assert.rejects(()=>mod.configureCloudPrice('pos-owner',{config:{enabled:true,relayUrl,relayToken,spreads:config.spreads},revision:1}),/sáu/);assert.equal((await mod.configureCloudPrice('pos-owner',{config,revision:10})).success,true);
 const stored=db.prepare("SELECT data FROM records WHERE kind='cloud-price-config'").get().data;assert.equal(stored.includes(relayToken),false);assert.equal(stored.includes(relayUrl),false);
 assert.equal((await mod.configureCloudPrice('pos-owner',{config,revision:10})).duplicate,true);await assert.rejects(()=>mod.configureCloudPrice('pos-owner',{config,revision:9}),/cũ/);await assert.rejects(()=>mod.configureCloudPrice('pos-owner',{config:{...config,markupVnd:200000},revision:10}),/cùng số/);
 const status=await mod.cloudPriceStatus();assert.equal(status.configured,true);assert.equal(status.encryptionReady,true);assert.equal(JSON.stringify(status).includes(relayToken),false);
});
test('cloud polling runs without POS online, keeps safe spreads and cannot overwrite POS business prices',async()=>{
 db.prepare("INSERT INTO records(kind,id,data,created_at,updated_at) VALUES('price','pos-9999',?,1,1)").run(JSON.stringify({buy:13700000,sell:14000000,source:'POS'}));const before=db.prepare("SELECT data FROM records WHERE kind='price'").get().data,at=Date.now();
 await mod.pollCloudPrice({force:true,now:at-1,fetcher:async()=>json({status:'success',symbol:'BK',ask:'240,000'})});
 assert.equal(db.prepare("SELECT data FROM records WHERE kind='cloud-price-snapshot'").get(),undefined);
 await mod.pollCloudPrice({force:true,now:at,fetcher:async()=>json({status:'success',symbol:'BK',ask:'140,000',bid:'139,000'})});let value=await mod.publicCloudPrices();assert.equal(value.active,true);assert.equal(value.fresh,true);assert.equal(value.prices[0].sell,14100000);assert.equal(value.prices[0].buy,13800000);assert.equal(value.prices[0].observedAt,null);assert.equal(db.prepare("SELECT data FROM records WHERE kind='price'").get().data,before);
 await mod.pollCloudPrice({force:true,now:at+1,fetcher:async()=>json({status:'success',symbol:'BK',ask:'240,000'})});value=await mod.publicCloudPrices();assert.equal(value.prices[0].sell,14100000);assert.equal(value.fetchedAt,at);assert.equal(value.fresh,false);assert.match((await mod.cloudPriceStatus()).lastError,/35%/);
 await mod.pollCloudPrice({force:true,now:at+2,fetcher:async()=>new Response('invalid '+relayToken,{status:503})});assert.equal(JSON.stringify(await mod.cloudPriceStatus()).includes(relayToken),false);assert.equal((await mod.publicCloudPrices()).fetchedAt,at);
});
test('disabled legacy config succeeds without encryption key and leaves the last cloud snapshot intact',async()=>{delete env.KBL_PRICE_ENCRYPTION_KEY;
 const old=await mod.publicCloudPrices();assert.equal(old.active,true);assert.equal(old.fresh,false);assert.equal(old.prices[0].sell,14100000);
 const result=await mod.configureCloudPrice('pos-owner',{config:{enabled:false},revision:11});assert.equal(result.success,true);assert.equal(result.cloudPrice.enabled,false);assert.equal((await mod.publicCloudPrices()).active,false);assert.ok(db.prepare("SELECT data FROM records WHERE kind='cloud-price-snapshot'").get());env.KBL_PRICE_ENCRYPTION_KEY='a'.repeat(64);});

test('environment-only relay waits for explicit POS-equivalent spreads instead of inventing a shop table',async()=>{
 const saved=db.prepare("SELECT * FROM records WHERE kind='cloud-price-config' AND id='main'").get();db.prepare("DELETE FROM records WHERE kind='cloud-price-config' AND id='main'").run();
 Object.assign(env,{KBL_GOOGLE_RELAY_URL:relayUrl,KBL_GOOGLE_RELAY_TOKEN:relayToken,KBL_GOOGLE_PRICE_MARKUP_VND:'100000'});
 try{assert.equal((await mod.cloudPriceStatus()).configured,false);let called=false;await mod.pollCloudPrice({force:true,fetcher:async()=>{called=true;return json({status:'success',ask:'140000'});}});assert.equal(called,false);
 env.KBL_GOOGLE_PRICE_SPREADS_JSON=JSON.stringify({'9999':300000,'980':300000,'750':500000,'610':400000,'585':500000,'416':500000});assert.equal((await mod.cloudPriceStatus()).configured,true);
 }finally{for(const k of ['KBL_GOOGLE_RELAY_URL','KBL_GOOGLE_RELAY_TOKEN','KBL_GOOGLE_PRICE_MARKUP_VND','KBL_GOOGLE_PRICE_SPREADS_JSON'])delete env[k];db.prepare("INSERT INTO records(kind,id,data,version,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(saved.kind,saved.id,saved.data,saved.version,saved.created_at,saved.updated_at);}
});
test('config changed while relay fetch runs cannot publish an obsolete snapshot',async()=>{
 await mod.configureCloudPrice('pos-owner',{config:{enabled:true},revision:12});const prior=db.prepare("SELECT data FROM records WHERE kind='cloud-price-snapshot' AND id='main'").get().data;
 await mod.pollCloudPrice({force:true,fetcher:async()=>{await mod.configureCloudPrice('pos-owner',{config:{enabled:false},revision:13});return json({status:'success',symbol:'BK',ask:'141000'});}});
 assert.equal(db.prepare("SELECT data FROM records WHERE kind='cloud-price-snapshot' AND id='main'").get().data,prior);assert.equal((await mod.publicCloudPrices()).active,false);
});
