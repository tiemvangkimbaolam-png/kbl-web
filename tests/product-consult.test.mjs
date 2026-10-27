import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { assistantState } from '../lib/kbl/assistant-state.mjs';
import { productFacts, publicProductDetails, findPublicProduct } from '../lib/kbl/product-view.mjs';
const require = createRequire(import.meta.url), C = require('../windows/pos-contract.cjs');
const { build } = createRequire(fs.realpathSync('node_modules/wrangler/package.json'))('esbuild');
const owner = { 'Content-Type': 'application/json', 'oai-authenticated-user-id': 'fixture', 'oai-authenticated-user-email': 'vlam1881997@gmail.com' };
const db = new DatabaseSync(':memory:'); let handle, wid, wh, account, productId;
const price = { price_buy_9999: 13700000, price_sell_9999: 14000000 };
const inventory = { mode: 'snapshot', inventory: [{ code: 'DETAIL-001', name: 'Nhẫn kiểm thử', type: '9999', weightLy: 125, grossLy: 130, gemLy: 5, priceSell: 14000000, sellWage: 300000, status: 'Đang bán', sourceCost: 1234567, originalWage: 23456, customerPhone: 'PRIVATE-PHONE', note: 'PRIVATE-NOTE' }] };
async function call(route, method = 'GET', data, headers = owner) {
    const r = await handle(new Request('https://kbl.test/api/' + route, { method, headers, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }));
    return { status: r.status, data: await r.json() };
}
before(async () => {
    for (const file of fs.readdirSync('drizzle').filter(x => x.endsWith('.sql')).sort()) db.exec(fs.readFileSync('drizzle/' + file, 'utf8').replaceAll('--> statement-breakpoint', ''));
    const DB = { prepare(query) { let params = []; const stmt = { bind(...p) { params = p; return stmt; }, async first() { return db.prepare(query).get(...params) || null; }, async all() { return { results: db.prepare(query).all(...params) }; }, async run() { const r = db.prepare(query).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; } }; return stmt; }, async batch(stmts) { db.exec('BEGIN'); try { const result = []; for (const stmt of stmts) result.push(await stmt.run()); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
    globalThis.__KBL_DETAIL_ENV = { DB, KBL_PRICE_ENCRYPTION_KEY: 'd'.repeat(64) };
    await build({ entryPoints: ['lib/kbl/api.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.sites-runtime/test-product-consult.mjs', plugins: [{ name: 'env', setup(b) { b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const env=globalThis.__KBL_DETAIL_ENV;' })); } }] });
    handle = (await import(path.resolve('.sites-runtime/test-product-consult.mjs') + '?' + Date.now())).handle;
    const w = (await call('admin/workers', 'POST', { label: 'PRIVATE-WORKER-LABEL' })).data; wid = w.id; wh = { 'Content-Type': 'application/json', 'x-kbl-worker-token': w.token };
    account = (await call('admin/accounts', 'POST', { label: 'PRIVATE-AI-LABEL', provider: 'chatgpt', workerId: wid })).data.id;
    await call('admin/settings', 'POST', { teamEnabled: true, autoResearch: false, autoConsult: true, phone: '0900000000', address: 'Địa chỉ cửa hàng fixture', hours: '08:00–18:00' });
});
test('POS mapper retains public weights and unchanged sale formula, excludes private purchase/customer fields', () => {
    const p = C.inventory(inventory, price)[0];
    assert.equal(p.price, Math.round(1.25 * 14000000 + 300000));
    assert.equal(p.weight, 4.6875);
    assert.deepEqual(p.posDetails, { netWeightChi: 1.25, grossWeightChi: 1.3, stoneWeightChi: 0.05 });
    assert.equal(JSON.stringify(p).includes('PRIVATE'), false); assert.equal(p.sourceCost, undefined); assert.equal(p.originalWage, undefined);
    const old = C.inventory({ mode: 'snapshot', inventory: [{ ...inventory.inventory[0], grossLy: undefined, gemLy: undefined }] }, price)[0];
    assert.equal(productFacts({ ...old, source: 'pos' }).grossWeightChi, null);
    assert.equal(productFacts({ ...old, source: 'pos' }).stoneWeightChi, null);
    assert.deepEqual(publicProductDetails({ posGoldRate: Infinity, posWorkmanship: -2, posDetails: { netWeightChi: 'bad', secret: 'PRIVATE' } }), {});
});
test('legacy POS clients still retain rate and workmanship when detailed weights are missing', () => {
    const p = { source: 'pos', weight: 3.75, posGoldRate: 14000000, posWorkmanship: 0 };
    assert.equal(productFacts(p).netWeightChi, 1); assert.equal(productFacts(p).posWorkmanship, 0);
    assert.equal(productFacts(p).grossWeightChi, null);
    assert.equal(findPublicProduct([{ id: 'id', sku: 'SKU', published: true, available: true }], 'SKU').id, 'id');
    assert.equal(findPublicProduct([{ id: 'id', sku: 'SKU', published: true, available: false }], 'SKU'), null);
});
test('POS import and public catalog retain product facts without publishing private fields', async () => {
    assert.equal((await call('worker/pos-prices', 'POST', { prices: price, observedAt: Date.now() - 3600000, revision: 1 }, wh)).status, 200);
    const p = C.inventory(inventory, price)[0];
    const r = await call('worker/pos-snapshot', 'POST', { products: [{ ...p, privateCustomer: 'PRIVATE-CUSTOMER', sourceCost: 999999, posDetails: { ...p.posDetails, secret: 'PRIVATE-DETAIL' } }], complete: true, revision: 2 }, wh);
    assert.equal(r.status, 200);
    const catalog = (await call('public/catalog', 'GET', undefined, {})).data; productId = catalog.products[0].id;
    assert.equal(catalog.products[0].posGoldRate, 14000000); assert.equal(catalog.products[0].posWorkmanship, 300000);
    assert.equal(catalog.products[0].posDetails.grossWeightChi, 1.3);
    assert.equal(JSON.stringify(catalog).includes('PRIVATE'), false);
    assert.equal(catalog.assistant.state, 'offline'); assert.equal(catalog.assistant.available, false);
});
test('AI availability requires a fresh connected worker and a ready writer; labels and IDs remain private', () => {
    const at = Date.now(), settings = { teamEnabled: true, autoConsult: true }, worker = { id: 'secret-worker', lastSeen: at };
    const ac = { enabled: true, lastSeen: at, workerId: worker.id, provider: 'chatgpt', roles: ['write'], status: 'ready' };
    assert.equal(assistantState(settings, [ac], [worker], at).available, true);
    assert.equal(assistantState(settings, [{ ...ac, status: 'working' }], [worker], at).state, 'busy');
    assert.equal(assistantState(settings, [ac], [{ ...worker, lastSeen: at - 61000 }], at).state, 'offline');
    assert.equal(assistantState(settings, [{ ...ac, roles: ['image'] }], [worker], at).state, 'offline');
    assert.equal(assistantState({ ...settings, teamEnabled: false }, [ac], [worker], at).state, 'disabled');
    assert.equal(JSON.stringify(assistantState(settings, [ac], [worker], at)).includes('secret-worker'), false);
});
test('consultation queues immediately, uses current cloud price and selected POS product, and returns the actual AI completion', async () => {
    assert.equal((await call('worker/heartbeat', 'POST', { capabilities: [], accounts: [{ id: account, status: 'ready' }] }, wh)).status, 200);
    const config = { enabled: true, symbol: 'BK', markupVnd: 100000, relayUrl: 'https://script.google.com/macros/s/FIXTURE_PRICE/exec', relayToken: 'PRIVATE-RELAY-TOKEN', spreads: Object.fromEntries(['9999', '980', '750', '610', '585', '416'].map(x => [x, 300000])) };
    assert.equal((await call('worker/pos-cloud-price-config', 'POST', { config, revision: 3 }, wh)).status, 200);
    const previousFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () => Response.json({ status: 'success', symbol: 'BK', ask: '142000', bid: '141000' });
        const cloud = await call('admin/cloud-price/poll', 'POST', {}); assert.equal(cloud.data.finalSell9999, 14300000);
    } finally { globalThis.fetch = previousFetch; }
    const c = await call('public/consult', 'POST', { question: 'Xin thông tin mẫu nhẫn đang chọn.', productId }, {});
    // Public API requires JSON, not an Admin identity.
    assert.equal(c.status, 415);
    const question = await call('public/consult', 'POST', { question: 'Xin thông tin mẫu nhẫn đang chọn.', productId }, { 'Content-Type': 'application/json' });
    assert.equal(question.status, 201); assert.equal(question.data.queued, true); assert.equal(question.data.assistant.state, 'ready');
    const jobId = 'KBL-' + question.data.id + '-consult';
    assert.equal(db.prepare('SELECT status FROM jobs WHERE id=?').get(jobId).status, 'queued', 'job is present before Cron runs');
    const claimed = await call('worker/claim', 'POST', { accountId: account, jobId }, wh);
    assert.equal(claimed.status, 200);
    const job = claimed.data.job;
    assert.equal(job.context.selectedProductSku, 'DETAIL-001'); assert.equal(job.context.products[0].posWorkmanship, 300000);
    assert.equal(job.context.prices.find(x => x.code === '9999').sell, 14300000);
    assert.equal(job.context.priceStatus.source, 'cloud-bk-ask'); assert.equal(job.context.priceStatus.fresh, true);
    assert.equal(job.context.company.phone, '0900000000'); assert.equal(JSON.stringify(job.context).includes('PRIVATE'), false);
    assert.equal((await call('public/consult/' + question.data.id, 'GET', undefined, {})).status, 404);
    const answer = 'Mẫu nhẫn DETAIL-001 có 1,25 chỉ vàng ròng. Cửa hàng xác nhận lại giá trước giao dịch.';
    const completed = await call('worker/jobs/' + jobId + '/complete', 'POST', { lease: claimed.data.lease, result: { reply: answer } }, wh);
    assert.equal(completed.status, 200);
    const read = await call('public/consult/' + question.data.id, 'GET', undefined, { 'x-kbl-chat-token': question.data.token });
    assert.equal(read.data.reply, answer); assert.equal(read.data.status, 'answered');
});
test('hidden or unbound products cannot be smuggled into customer consultation', async () => {
    const at = Date.now(); db.prepare('INSERT INTO records(kind,id,data,created_at,updated_at) VALUES(?,?,?,?,?)').run('product', 'hidden', JSON.stringify({ sku: 'PRIVATE-PRODUCT', published: false, available: true }), at, at);
    const r = await call('public/consult', 'POST', { question: 'Hỏi về mẫu ẩn.', productId: 'hidden' }, { 'Content-Type': 'application/json' });
    assert.equal(r.status, 409);
});
test('disabled AI still accepts a private question without claiming an AI answer or creating a job', async () => {
    await call('admin/settings', 'POST', { autoConsult: false });
    const q = await call('public/consult', 'POST', { question: 'Cửa hàng có thể hỗ trợ tôi không?' }, { 'Content-Type': 'application/json' });
    assert.equal(q.status, 201); assert.equal(q.data.queued, false); assert.equal(q.data.assistant.state, 'disabled');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM jobs WHERE story_id=?').get(q.data.id).n, 0);
    const read = await call('public/consult/' + q.data.id, 'GET', undefined, { 'x-kbl-chat-token': q.data.token }); assert.equal(read.data.reply, null);
});
test('actual React product detail renders safe facts and original photo links without recalculating the saved price', async () => {
    await build({ entryPoints: ['app/components/product-details.tsx'], bundle: true, platform: 'node', format: 'esm', outfile: '.sites-runtime/product-detail-ssr.mjs', external: ['react', 'react-dom', 'react-dom/server', 'lucide-react'] });
    const { default: ProductDetails } = await import(path.resolve('.sites-runtime/product-detail-ssr.mjs') + '?' + Date.now());
    const { createElement } = await import('react'), { renderToStaticMarkup } = await import('react-dom/server');
    const id = 'a'.repeat(64), p = { ...C.inventory(inventory, price)[0], id: 'fixture', source: 'pos', imageIds: [id], updatedAt: Date.now(), price: 12345678, description: '<script>privateAttack()</script>' };
    const html = renderToStaticMarkup(createElement(ProductDetails, { product: p }));
    assert.ok(html.includes('Trọng lượng vàng ròng')); assert.ok(html.includes('Tiền công bán'));
    assert.ok(html.includes('12.345.678')); assert.ok(!html.includes('17.800.000'));
    assert.ok(html.includes('/api/media/' + id)); assert.ok(html.includes('tu-van=DETAIL-001'));
    assert.ok(!html.includes('<script>privateAttack()')); assert.ok(html.includes('&lt;script&gt;'));
    const safe = { ...p, description: 'MÔ PHỎNG KIỂM TRA GIAO DIỆN — KHÔNG PHẢI HÀNG ĐANG BÁN', imageIds: [] };
    fs.writeFileSync('.sites-runtime/qa-product-detail.html', '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kiểm thử giao diện sản phẩm KBL</title><style>' + fs.readFileSync('app/globals.css','utf8').replace(/@import[^;]+;/g,'') + '</style><body><main style="max-width:720px;padding:20px;margin:30px auto"><h1>Chi tiết sản phẩm — bản kiểm thử</h1>' + renderToStaticMarkup(createElement(ProductDetails, { product: safe })) + '</main></body></html>');
});

test('website display toggle persists over POS resync and cannot invent stock or edit prices', async()=>{
 const original=(await call('admin/state')).data.products.find(p=>p.id===productId);
 const hidden=await call('admin/products/'+productId+'/display','PATCH',{published:false});assert.equal(hidden.status,200);assert.equal(hidden.data.wroteToPOS,false);
 const p=C.inventory(inventory,price)[0];const synced=await call('worker/pos-snapshot','POST',{products:[p],complete:true,revision:10},wh);assert.equal(synced.status,200);
 let state=(await call('admin/state')).data, saved=state.products.find(p=>p.id===productId);assert.equal(saved.published,false);assert.equal(saved.price,original.price);assert.equal((await call('public/catalog')).data.products.some(p=>p.id===productId),false);
 assert.equal((await call('admin/products/'+productId+'/display','PATCH',{published:true,price:1})).status,422);
 assert.equal((await call('admin/products/'+productId+'/display','PATCH',{published:true})).status,200);
 await call('worker/pos-snapshot','POST',{products:[],complete:true,revision:11},wh);
 assert.equal((await call('admin/products/'+productId+'/display','PATCH',{published:true})).status,409);
});

test('OAuth setup diagnostics show exact missing variable names and callbacks, never secrets',async()=>{
 const r=await call('admin/social/providers');assert.equal(r.status,200);
 const facebook=r.data.providers.find(p=>p.id==='facebook');assert.ok(facebook.missing.includes('KBL_META_APP_ID'));assert.ok(facebook.missing.includes('KBL_SOCIAL_ENCRYPTION_KEY'));assert.equal(facebook.callback,'https://tiemvangkimbaolam.id.vn/api/admin/social/oauth/facebook/callback');assert.equal(facebook.configured,false);
});
