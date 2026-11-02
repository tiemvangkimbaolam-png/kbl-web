import {test,before,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const db=new DatabaseSync(':memory:');
const calls=[];let handle;
const at=Date.now();
const seed=(kind,id,data,created=at)=>db.prepare('INSERT INTO records(kind,id,data,created_at,updated_at) VALUES(?,?,?,?,?)').run(kind,id,JSON.stringify(data),created,created);
before(async()=>{
 for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8').replaceAll('--> statement-breakpoint',''));
 const DB={prepare(sql){let args=[];const stmt={bind(...v){args=v;return stmt;},async first(){const row=db.prepare(sql).get(...args)||null;calls.push({sql,args,rows:row?1:0});return row;},async all(){const results=db.prepare(sql).all(...args);calls.push({sql,args,rows:results.length});return{results};},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};return stmt;}};
 globalThis.__BUDGET_ENV={DB};
 const {build}=createRequire(fs.realpathSync('node_modules/wrangler/package.json'))('esbuild');
 await build({stdin:{contents:"export {handle} from './lib/kbl/api';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',external:['web-push'],outfile:'.sites-runtime/d1-budget-tests.mjs',plugins:[{name:'env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env=globalThis.__BUDGET_ENV;'}));}}]});
 ({handle}=await import(pathToFileURL(path.resolve('.sites-runtime/d1-budget-tests.mjs'))+'?'+Date.now()));
});
beforeEach(()=>{db.exec('DELETE FROM records');calls.length=0;});
const get=async route=>{const response=await handle(new Request('https://kbl.test/api/public/'+route));return{status:response.status,data:await response.json(),headers:response.headers};};
test('VN history API reads only daily shop points, preserving the legacy all-series contract',async()=>{
 db.exec('BEGIN');
 for(let i=0;i<8640;i++)seed('history-world',String(i),{at:at-i*300000,xauUsd:3000},at-i*300000);
 for(let i=0;i<30;i++)seed('history-vn',String(i),{date:String(i),at:at-i*86400000,rows:[]},at-i*86400000);
 db.exec('COMMIT');
 const r=await get('price-history?days=7&series=vn');assert.equal(r.status,200);assert.ok(r.data.vietnam.length>=6&&r.data.vietnam.length<=8);assert.deepEqual(r.data.world,[]);assert.equal(calls.length,1);assert.ok(calls[0].rows<=8);assert.equal(calls[0].args[0],'history-vn');assert.match(r.headers.get('Cache-Control'),/no-store/);
 const legacy=await get('price-history?days=7');assert.equal(legacy.status,200);assert.ok(legacy.data.world.length>1900);assert.deepEqual(legacy.data.vietnam,r.data.vietnam);
 const world=await get('price-history?days=1&series=world');assert.equal(world.status,200);assert.deepEqual(world.data.vietnam,[]);assert.ok(world.data.world.length<=289);
 const count=calls.length;assert.equal((await get('price-history?series=customer')).status,400);assert.equal(calls.length,count);
});
test('price-only API never loads products or private goals and reflects the latest stored shop quote',async()=>{
 for(let i=0;i<500;i++)seed('product',String(i),{published:true,available:true});
 seed('customer-gold-goal','synthetic-only',{title:'Private fixture'});
 seed('price','pos-9999',{code:'9999',buy:12000000,sell:12300000,unit:'đồng/chỉ',capturedAt:Date.now()});
 const r=await get('prices');assert.equal(r.status,200);assert.equal(r.data.prices[0].sell,12300000);assert.ok(!JSON.stringify(r.data).includes('Private fixture'));assert.ok(!calls.some(c=>c.args.includes('product')||c.args.includes('customer-gold-goal')));
 db.prepare("UPDATE records SET data=json_set(data,'$.sell',12400000) WHERE kind='price'").run();
 const next=await get('prices');assert.equal(next.data.prices[0].sell,12400000);assert.notEqual(next.data.priceSnapshot,r.data.priceSnapshot);
 seed('settings','main',{companyName:'Cửa hàng thử',phone:'hotline thử',privateField:'fixture-never-public'});
 calls.length=0;const tv=await get('prices?view=tv');assert.equal(tv.data.company.name,'Cửa hàng thử');assert.equal(tv.data.company.phone,'hotline thử');assert.equal(tv.data.company.address,tv.data.address);assert.ok(!JSON.stringify(tv.data).includes('fixture-never-public'));assert.ok(!calls.some(c=>c.args.includes('product')));
});
test('additive indexes give range searches for history/cleanup and exact paired-token lookup',()=>{
 const explain=(sql,...args)=>db.prepare('EXPLAIN QUERY PLAN '+sql).all(...args).map(r=>r.detail).join('\n');
 for(const sql of ["SELECT kind,id,data FROM records WHERE kind=? AND created_at>=? ORDER BY created_at LIMIT 10000","DELETE FROM records WHERE kind=? AND created_at<?"]){const plan=explain(sql,'history-world',at);assert.match(plan,/SEARCH records USING (?:COVERING )?INDEX records_kind_created/);assert.doesNotMatch(plan,/SCAN records/);}
 const plan=explain("SELECT id,data FROM records WHERE kind=? AND json_extract(data,'$.tokenHash')=?",'holdings-widget','fixture-not-a-token');assert.match(plan,/SEARCH records USING INDEX holdings_widget_token/);
 seed('customer-holdings','synthetic-only',{entries:[]});const old=db.prepare('SELECT * FROM records').all();db.exec(fs.readFileSync('drizzle/0003_read_budget_indexes.sql','utf8'));assert.deepEqual(db.prepare('SELECT * FROM records').all(),old);
});
