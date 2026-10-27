import { test, before, after } from 'node:test';
import a from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { build } = createRequire(fs.realpathSync('node_modules/wrangler/package.json'))('esbuild');
const C = require('../windows/pos-contract.cjs'), { create, readPhoto } = require('../windows/pos-relay.cjs');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const owner = { 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'vlam1881997@gmail.com', 'Content-Type': 'application/json' };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kbl-pos-readonly-')), files = new Map(), db = new DatabaseSync(':memory:');
let handle, workerHeaders, workerId, queryCount = 0;
async function call(route, body, headers = workerHeaders, method = body === undefined ? 'GET' : 'POST') {
    const r = await handle(new Request('https://kbl.test/api/' + route, { method, headers, ...(body !== undefined ? { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) } : {}) }));
    return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
}
let fixtureSequence = 0;
const nextStockRevision = () => Number(db.prepare("SELECT COALESCE(MAX(CAST(json_extract(data,'$.revision') AS INTEGER)),0) n FROM records WHERE kind IN('pos-sync','pos-stock')").get().n) + 1;
const ledger = () => {
    const sql = new DatabaseSync(':memory:'); sql.exec('CREATE TABLE kv(k TEXT PRIMARY KEY,v TEXT)');
    const result = { get(k) { const r = sql.prepare('SELECT v FROM kv WHERE k=?').get(k); return r ? JSON.parse(r.v) : null; }, set(k,v) { sql.prepare('INSERT INTO kv VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k,JSON.stringify(v)); } };
    // Test relays share one server worker, so simulate the persisted sequence a
    // real worker retains rather than inventing a fresh counter for each test.
    fixtureSequence = Math.max(fixtureSequence + 100, nextStockRevision());
    result.set('pos-sequence', fixtureSequence);
    return result;
};
const price = { price_buy_9999: 13700000, price_sell_9999: 14000000 };
const product = (code='SKU-01',extra={}) => ({ code, name: 'Nhẫn kiểm thử', type: '9999', weightLy: 123.4, sellWage: 123456, status: 'Đang bán', purchaseCost: 999, profit: 888, cccd: 'NEVER-SEND', ...extra });
const pawn = (id='P-01',publicToken='pawn-fixture-token-123456789') => {
    const r = { id, publicToken, name: 'Khách kiểm thử', phone: '0900000000', asset: 'Tài sản mô phỏng', status: 'Đang cầm', dateStart:'01/10/2026', dateEnd:'01/11/2026', displaySchemaVersion:2,displayInterestFeeSeparate:true, cccd:'NEVER-SEND',imgFrontData:'NEVER-SEND' };
    for (const k of ['money','interestRate','feeRate','tienLai','tienPhi','paidInterestTotal','paidFeeTotal','days','currentInterest','currentFee','interestDue','feeDue','totalDue']) r[k] = 17;
    r.interestDue = 333; r.feeDue = 777; r.totalDue = 123456789; return r;
};
const warranty = (invoiceId='HD-01',items=[{productSku:'SKU-01',soldWeightChi:1.234,soldWorkmanship:123456,soldGoldCode:'9999'}]) => ({ invoiceId,phone:'0900000000',customerName:'Khách thử',soldAt:'2026-10-26T00:00:00Z',eventType:'sale',items,realizedProfit:888,cccd:'NEVER-SEND' });
const nativeBridge = { async request(route, method, data, headers={}) {
    const r = await call(route.replace(/^\/api\//,''),data,{ ...workerHeaders,...headers },method);
    if (r.status >= 400) throw Object.assign(Error(r.body.error),{status:r.status}); return r.body;
} };
before(async()=>{
    for (const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()) db.exec(fs.readFileSync('drizzle/'+f,'utf8').replaceAll('--> statement-breakpoint',''));
    const DB = { prepare(query) { queryCount++; let params=[]; const s={ bind(...p){params=p;return s;}, async first(){return db.prepare(query).get(...params)||null;},async all(){return {results:db.prepare(query).all(...params)};},async run(){return {meta:{changes:Number(db.prepare(query).run(...params).changes)}};} };return s; }, async batch(stmts){db.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}} };
    globalThis.__POS_ENV={DB,BUCKET:{async head(id){return files.has(id)?{size:files.get(id).length}:null;},async put(id,b){files.set(id,Buffer.from(b));},async get(id){const b=files.get(id);return b?{body:b,size:b.length}:null;},async delete(id){files.delete(id);}}};
    await build({entryPoints:['lib/kbl/api.ts'],bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/test-pos.mjs',plugins:[{name:'pos-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export const env=globalThis.__POS_ENV;',loader:'js'}));}}]});
    handle=(await import(path.resolve('.sites-runtime/test-pos.mjs')+'?v='+Date.now())).handle;
    const w=(await call('admin/workers',{label:'POS fixture'},owner)).body;workerId=w.id;workerHeaders={'Content-Type':'application/json','x-kbl-worker-token':w.token};
    fs.mkdirSync(path.join(root,'product-photos'));
});
after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});

test('actual POS shape: per-chi price and net Ly use POS sale preview convention, private fields never projected',()=>{
    const result=C.inventory({mode:'snapshot',inventory:[product(),product('HELD',{webSyncReady:false}),product('SOLD',{status:'Đã bán'}),product('RETURN',{status:'Chờ XL'})]},price);
    a.equal(result.length,3);a.equal(result[0].weight,1.234*3.75);a.equal(result[0].price,Math.round(1.234*14000000+123456));a.equal(result[1].available,false);a.equal(result[2].available,false);
    a.equal(JSON.stringify(result).includes('NEVER-SEND'),false);a.equal(JSON.stringify(result).includes('profit'),false);
    a.equal(C.inventory({mode:'snapshot',inventory:[product()]})[0].price,null);
    a.throws(()=>C.inventory({mode:'delta',inventory:[]}));a.throws(()=>C.inventory({mode:'snapshot',inventory:[product(),product()]}));
    a.equal(C.prices({prices:{...price,web_sync_token:'NEVER-SEND'}}).rows[0].unit,'đồng/chỉ');
});
test('relay -> actual API: prices/products persist, POS binding blocks manual overwrites and a second Windows',async()=>{
    const l=ledger(),relay=create({ledger:l,bridge:nativeBridge,config:{serverUrl:'https://kbl.test',posDataDir:root}});
    a.equal((await relay.accept('prices',{prices:{...price,web_sync_token:'NEVER-SEND'}})).status,200);
    a.equal((await relay.accept('inventory',{mode:'snapshot',inventory:[product()]})).status,200);
    const c=(await call('public/catalog',undefined,{})).body;a.equal(c.products[0].price,Math.round(1.234*14000000+123456));a.equal(c.prices[0].sell,14000000);a.equal(c.prices[0].unit,'đồng/chỉ');a.equal(c.posBound,true);
    a.equal((await call('admin/products',{sku:'BAD'},owner)).status,403);a.equal((await call('admin/prices',{},owner)).status,403);
    const other=(await call('admin/workers',{label:'Other Windows'},owner)).body;
    a.equal((await call('worker/pos-snapshot',{complete:true,products:[]},{'Content-Type':'application/json','x-kbl-worker-token':other.token})).status,409);
    a.equal(JSON.stringify(l.get('pos-outbox')).includes('NEVER-SEND'),false);
});
test('real photo index uses SKU and SHA, ignores original image; metadata refresh and cleanup retain the attached photo',async()=>{
    const bytes=Buffer.from([255,216,255,224,0,2,255,217]),digest=hash(bytes),index={ [hash('SKU-01')]:{code:'SKU-01',file:digest+'.jpg',originalFile:'NEVER-READ.original.png'} };
    fs.writeFileSync(path.join(root,'product-photos','index.json'),JSON.stringify(index));fs.writeFileSync(path.join(root,'product-photos',digest+'.jpg'),bytes);
    const before=hash(fs.readFileSync(path.join(root,'product-photos','index.json')));
    a.deepEqual(readPhoto(root,'SKU-01').bytes,bytes);
    const l=ledger();l.set('pos-skus',['SKU-01']);const relay=create({ledger:l,bridge:nativeBridge,config:{serverUrl:'https://kbl.test',posDataDir:root}});await relay.syncPhotos();
    let c=(await call('public/catalog',undefined,{})).body;a.deepEqual(c.products[0].imageIds,[digest]);a.equal((await call('media/'+digest,undefined,{})).status,200);
    a.equal((await call('worker/pos-snapshot',{complete:true,revision:nextStockRevision(),products:C.inventory({mode:'snapshot',inventory:[product()]},price)})).status,200);
    await call('admin/cleanup',{},owner);c=(await call('public/catalog',undefined,{})).body;a.deepEqual(c.products[0].imageIds,[digest]);a.ok(files.has(digest));
    a.equal(hash(fs.readFileSync(path.join(root,'product-photos','index.json'))),before);
    index[hash('SKU-01')].file='../outside.jpg';fs.writeFileSync(path.join(root,'product-photos','index.json'),JSON.stringify(index));a.throws(()=>readPhoto(root,'SKU-01'));
});
test('pawn QR preserves exact POS due amounts; code-only lookup fails, token collision rolls back the entire batch',async()=>{
    let r=await call('worker/pos-pawn',{records:[pawn()],mode:'snapshot',revision:20});a.equal(r.status,200,JSON.stringify(r.body));
    r=await call('public/pos-receipt',undefined,{'x-kbl-receipt-token':pawn().publicToken});a.equal(r.status,200);a.equal(r.body.record.interestDue,333);a.equal(r.body.record.feeDue,777);a.equal(r.body.record.totalDue,123456789);a.equal(JSON.stringify(r.body).includes('NEVER-SEND'),false);a.equal(r.body.record.publicToken,undefined);
    a.equal((await call('lookup?code=P-01',undefined,{})).status,404);
    r=await call('worker/pos-pawn',{records:[pawn('P-02','new-pawn-token-1234567890'),pawn('P-03',pawn().publicToken)],mode:'snapshot',revision:21});a.equal(r.status,409,JSON.stringify(r.body));
    a.equal(db.prepare("SELECT COUNT(*) n FROM records WHERE kind='pos-pawn'").get().n,1);
    a.equal((await call('worker/pos-pawn',{records:[pawn()],mode:'delta',revision:19})).status,409);
    a.equal((await call('public/pos-receipt',undefined,{'x-kbl-receipt-token':pawn().publicToken})).status,200);
});
test('warranty retries keep one QR, concurrent conflict cannot rewrite it, old saved POS QR is recovered read-only',async()=>{
    const savedToken='old-warranty-token-123456789',salesFile=path.join(root,'sales_db.json');
    fs.writeFileSync(salesFile,JSON.stringify([{id:'HD-OLD',cccd:'NEVER-SEND',profit:123,warrantySnapshot:{warranties:[{sku:'SKU-01',url:'https://tiemvangkimbaolam.id.vn/bao-hanh/'+savedToken}]}}]));const before=hash(fs.readFileSync(salesFile));
    const l=ledger(),relay=create({ledger:l,bridge:nativeBridge,config:{serverUrl:'https://kbl.test',posDataDir:root}});
    let r=await relay.accept('warranty-sale',warranty('HD-OLD'));a.equal(r.status,200,JSON.stringify(r));a.equal(r.body.warranties[0].url,'https://kbl.test/bao-hanh/'+savedToken);
    a.equal((await call('public/pos-receipt',undefined,{'x-kbl-receipt-token':savedToken})).body.kind,'warranty');a.equal(hash(fs.readFileSync(salesFile)),before);
    const responses=await Promise.all([call('worker/pos-warranty',warranty()),call('worker/pos-warranty',warranty())]);a.equal(responses[0].status,200);a.equal(responses[1].status,200);a.equal(responses[0].body.warranties[0].url,responses[1].body.warranties[0].url);
    a.equal((await call('worker/pos-warranty',{...warranty(),customerName:'Different'})).status,409);
    const collision=[{...warranty().items[0],productSku:'NEW-A'},{...warranty().items[0],productSku:'NEW-B',publicToken:savedToken}];
    a.equal((await call('worker/pos-warranty',warranty('COLLISION',collision))).status,409);
    a.equal(db.prepare("SELECT COUNT(*) n FROM records WHERE kind='pos-warranty' AND json_extract(data,'$.invoiceId')='COLLISION'").get().n,0);
    a.equal((await call('worker/pos-transaction',{eventType:'return',invoiceId:'RET-01',originalTransactionId:'HD-OLD',skus:['SKU-01'],realizedProfit:999,revision:nextStockRevision()})).status,200);
    a.equal((await call('public/pos-receipt',undefined,{'x-kbl-receipt-token':savedToken})).body.record.posStatus,'returned');
});
test('offline relay is durable and returns non-2xx; reconnect flushes without a second POS mutation',async()=>{
    const l=ledger();let offline=true;
    const bridge={request(...args){if(offline)throw Error('offline');return nativeBridge.request(...args);}};
    let relay=create({ledger:l,bridge,config:{serverUrl:'https://kbl.test',posDataDir:root},now:()=>Date.now()+120000});
    let r=await relay.accept('inventory',{mode:'snapshot',inventory:[product('OFFLINE')]});a.equal(r.status,503);a.equal(r.body.success,false);a.equal(l.get('pos-outbox').length,1);a.equal(JSON.stringify(l.get('pos-outbox')).includes('NEVER-SEND'),false);
    const secret=relay.credentials().token;
    relay=create({ledger:l,bridge,config:{serverUrl:'https://kbl.test',posDataDir:root},now:()=>Date.now()+240000});a.equal(relay.credentials().token,secret);a.equal(relay.auth('a'.repeat(64)),false);
    offline=false;await relay.flush();a.equal(relay.view().pending,0);a.ok((await call('public/catalog',undefined,{})).body.products.some(p=>p.sku==='OFFLINE'));
    a.equal((await relay.accept('loyalty-sale',{profit:999})).status,422);
});
test('an older in-flight acknowledgement never drops a newer coalesced snapshot; bad task does not block another kind',async()=>{
    const l=ledger();l.set('pos-sequence',100);let release;const gate=new Promise(r=>release=r),calls=[];
    const bridge={async request(route,method,data){calls.push(data);if(calls.length===1)await gate;return {success:true};}};
    const relay=create({ledger:l,bridge,config:{serverUrl:'https://kbl.test',posDataDir:root}});
    const first=await relay.accept('inventory',{mode:'snapshot',inventory:[product('OLDER')]},1);a.equal(first.status,503);
    await relay.accept('inventory',{mode:'snapshot',inventory:[product('NEWER')]},1);a.equal(l.get('pos-outbox').length,1);release();await new Promise(r=>setImmediate(r));
    a.equal(l.get('pos-outbox')[0].data.products[0].sku,'NEWER');await relay.flush();a.equal(l.get('pos-outbox').length,0);a.equal(calls.at(-1).products[0].sku,'NEWER');
    const l2=ledger(),bridge2={async request(route){if(route.endsWith('pos-pawn'))throw Error('QR conflict');return {success:true};}};
    const r2=create({ledger:l2,bridge:bridge2,config:{serverUrl:'https://kbl.test',posDataDir:root}});
    a.equal((await r2.accept('pawn',{mode:'snapshot',records:[pawn()]})).status,503);a.equal((await r2.accept('prices',{prices:price})).status,200);a.equal(r2.view().pending,1);
});
test('product and warranty quotas reject the whole batch, retaining existing inventory and receipts',async()=>{
    const countBefore=db.prepare("SELECT COUNT(*) n FROM records WHERE kind='product'").get().n;
    const incoming=C.inventory({mode:'snapshot',inventory:Array.from({length:500},(_,i)=>product('QUOTA-'+i))},price);
    a.equal((await call('worker/pos-snapshot',{complete:true,revision:nextStockRevision(),products:incoming})).status,507);
    a.equal(db.prepare("SELECT COUNT(*) n FROM records WHERE kind='product'").get().n,countBefore);
    const warrantyCount=db.prepare("SELECT COUNT(*) n FROM records WHERE kind='pos-warranty'").get().n;
    db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<?) INSERT INTO records(kind,id,data,created_at,updated_at) SELECT 'pos-warranty','quota-'||x,'{}',0,0 FROM n").run(19999-warrantyCount);
    const items=[{...warranty().items[0],productSku:'QUOTA-A'},{...warranty().items[0],productSku:'QUOTA-B'}];
    a.equal((await call('worker/pos-warranty',warranty('QUOTA-INVOICE',items))).status,409);
    a.equal(db.prepare("SELECT COUNT(*) n FROM records WHERE kind='pos-warranty' AND json_extract(data,'$.invoiceId')='QUOTA-INVOICE'").get().n,0);
    db.prepare("DELETE FROM records WHERE kind='pos-warranty' AND id LIKE 'quota-%'").run();
});
test('stock snapshot and sale events share one atomic revision order, while receipt annotations retain their own order',async()=>{
    const sku='STOCK-ORDER', rows=C.inventory({mode:'snapshot',inventory:[product(sku)]},price), revision=nextStockRevision();
    const snapshot=n=>call('worker/pos-snapshot',{complete:true,products:rows,revision:n});
    const event=(n,eventType='sale')=>call('worker/pos-transaction',{eventType,invoiceId:'STOCK-EVENT-'+n,originalTransactionId:'STOCK-INVOICE',skus:[sku],revision:n});
    a.equal((await snapshot(revision)).status,200);
    a.equal((await call('worker/pos-warranty',warranty('STOCK-INVOICE',[{...warranty().items[0],productSku:sku}]))).status,200);
    a.equal((await event(revision+1)).status,200);
    let state=(await call('admin/state',undefined,owner)).body;
    a.equal(state.products.find(p=>p.sku===sku).available,false);
    // Lost ACK for the old exact snapshot is harmless; it cannot resurrect stock.
    const replay=await snapshot(revision);a.equal(replay.status,200);a.equal(replay.body.duplicate,true);
    state=(await call('admin/state',undefined,owner)).body;a.equal(state.products.find(p=>p.sku===sku).available,false);
    a.equal((await snapshot(revision+4)).status,200);
    const delayed=await event(revision+2,'return');a.equal(delayed.status,200);a.equal(delayed.body.stockSkipped,true);
    state=(await call('admin/state',undefined,owner)).body;a.equal(state.products.find(p=>p.sku===sku).available,true);
    const id=hash('STOCK-INVOICE\n'+sku), row=()=>JSON.parse(db.prepare("SELECT data FROM records WHERE kind='pos-warranty' AND id=?").get(id).data);
    a.equal(row().posStatus,'returned');
    await event(revision+1,'delete');a.equal(row().posStatus,'returned');
    a.equal((await call('worker/pos-transaction',{eventType:'sale',invoiceId:'NO-REV',skus:[sku]})).status,409);
    a.equal((await call('worker/pos-snapshot',{complete:true,products:rows})).status,409);
    const stale=await call('worker/pos-snapshot',{complete:true,products:[{...rows[0],name:'stale replacement'}],revision:revision+3});a.equal(stale.status,409);
});
test('maximum receipt batches stay bounded in database queries and retain every exact POS amount',async()=>{
    const records=Array.from({length:500},(_,i)=>pawn('BULK-'+i,'bulk-pawn-token-'+String(i).padStart(16,'0')));
    queryCount=0;let r=await call('worker/pos-pawn',{records,mode:'snapshot',revision:1000});a.equal(r.status,200,JSON.stringify(r.body));a.equal(r.body.count,500);a.ok(queryCount<20,'one D1 roundtrip per row would exhaust free invocation limits');
    const items=Array.from({length:100},(_,i)=>({...warranty().items[0],productSku:'BULK-'+i}));queryCount=0;r=await call('worker/pos-warranty',warranty('HD-BULK',items));a.equal(r.status,200,JSON.stringify(r.body));a.equal(r.body.warranties.length,100);a.ok(queryCount<20);
    r=await call('public/pos-receipt',undefined,{'x-kbl-receipt-token':records[499].publicToken});a.equal(r.status,200);a.equal(r.body.record.totalDue,123456789);
});
