import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { create } = require('../windows/pos-relay.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function memoryLedger() {
    const values = new Map();
    return { get(k) { return values.has(k) ? structuredClone(values.get(k)) : null; }, set(k, v) { values.set(k, structuredClone(v)); } };
}
const config = { id: 'worker-a', token: 'a'.repeat(64), serverUrl: 'https://kbl-fixture.workers.dev' };
const inventory = { mode: 'snapshot', inventory: [{ code: 'SKU-01', name: 'Nhẫn fixture', type: '9999', weightLy: 100, sellWage: 1000, status: 'Đang bán', purchaseCost: 'NEVER-SEND' }] };

test('explicit loopback cutover accepts only the selected POS existing token, leaves settings unchanged and never forwards it', async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kbl-local-cutover-'));
    try {
        const secret='fixture-old-pos-token-'.repeat(3), file=path.join(dir,'settings.json');
        fs.writeFileSync(file,JSON.stringify({web_sync_token:secret}));const before=fs.readFileSync(file);
        const ledger=memoryLedger(),calls=[],bridge={async request(route,method,data){calls.push({route,data});return{success:true};}};
        let relay=create({ledger,bridge,config:{...config,posDataDir:dir}});
        assert.equal(relay.auth(secret),false);
        relay=create({ledger,bridge,config:{...config,posDataDir:dir,acceptPosSettingsToken:true}});
        assert.equal(relay.auth(secret),true);assert.equal(relay.auth('wrong-token-'.repeat(6)),false);
        await relay.accept('prices',{prices:{price_buy_9999:13000000,price_sell_9999:14000000}});
        assert(!JSON.stringify(calls).includes(secret));assert.deepEqual(fs.readFileSync(file),before);
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('backend identity resets ACK/photo evidence and replays only safe snapshots; domain cutover keeps receipts', async () => {
    const ledger = memoryLedger(), calls = [];
    const bridge = { async request(route, method, data) { calls.push({ route, data }); return { success: true }; } };
    let relay = create({ ledger, bridge, config, now: () => 1000 });
    await relay.accept('prices', { prices: { price_buy_9999: 13000000, price_sell_9999: 14000000 } });
    await relay.accept('inventory', inventory);
    ledger.set('pos-photo-sent', { 'SKU-01': 'photo-hash' });
    const count = calls.length;
    relay = create({ ledger, bridge, config: { ...config, serverUrl: 'https://tiemvangkimbaolam.id.vn' }, now: () => 2000 });
    assert.equal(relay.view().pending, 0);
    assert.deepEqual(ledger.get('pos-photo-sent'), { 'SKU-01': 'photo-hash' });
    await relay.flush(); assert.equal(calls.length, count);
    relay = create({ ledger, bridge, config: { ...config, id: 'worker-b', token: 'b'.repeat(64) }, now: () => 3000 });
    assert.equal(relay.view().pending, 2);
    assert.deepEqual(ledger.get('pos-photo-sent'), {});
    assert.deepEqual(ledger.get('pos-ack'), {});
    assert.equal(relay.view().lastSuccess, 0);
    await relay.flush();
    assert.equal(relay.view().pending, 0);
    assert.equal(calls.length, count + 2);
    assert.equal(calls.slice(count).find(c => c.route.endsWith('pos-prices')).data.observedAt, 1000);
    assert.equal(JSON.stringify(ledger.get('pos-snapshots')).includes('NEVER-SEND'), false);
});
test('restart retries durable pending work immediately; old-backend in-flight ACK cannot overwrite the new receipt', async () => {
    const ledger = memoryLedger(); let calls = 0;
    let relay = create({ ledger, config, now: () => 1000, bridge: { async request() { calls++; throw Error('offline'); } } });
    assert.equal((await relay.accept('inventory', inventory, 1)).status, 503);
    assert.equal(ledger.get('pos-outbox')[0].nextAt, 61000);
    relay = create({ ledger, config, now: () => 1000, bridge: { async request() { calls++; return { success: true }; } } });
    await relay.flush(); assert.equal(calls, 2); assert.equal(relay.view().pending, 0);

    const shared = memoryLedger(); let release;
    const gate = new Promise(resolve => { release = resolve; });
    const old = create({ ledger: shared, config, now: () => 10, bridge: { async request() { await gate; return { success: true, backend: 'old' }; } } });
    await old.accept('inventory', inventory, 1);
    const next = create({ ledger: shared, config: { ...config, id: 'worker-b' }, now: () => 20, bridge: { async request() { return { success: true, backend: 'new' }; } } });
    await next.flush(); release(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(shared.get('pos-ack').inventory.result.backend, 'new');
    assert.equal(shared.get('pos-last-success'), 20);
    assert.equal(shared.get('pos-outbox').length, 0);
});
test('photo failures are bounded to five attempts, rotate after restart, and ACKed JPEGs are not reread', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kbl-photo-fairness-'));
    const originalOpen = fs.openSync;
    try {
        fs.mkdirSync(path.join(root, 'product-photos'));
        const skus = Array.from({ length: 8 }, (_, i) => 'PHOTO-' + i), index = {};
        for (const [i, sku] of skus.entries()) {
            const raw = Buffer.from([255, 216, 255, i, 0, 255, 217]), digest = hash(raw);
            index[hash(sku)] = { code: sku, file: digest + '.jpg' };
            fs.writeFileSync(path.join(root, 'product-photos', digest + '.jpg'), raw);
        }
        fs.writeFileSync(path.join(root, 'product-photos', 'index.json'), JSON.stringify(index));
        const ledger = memoryLedger(), calls = []; ledger.set('pos-skus', skus);
        const bridge = { async request(route, method, bytes) { const sku = new URL('https://fixture.test' + route).searchParams.get('sku'); calls.push(sku); if (Number(sku.at(-1)) < 5) throw Error('fixture upload failed'); return { success: true, assetId: hash(bytes) }; } };
        let jpegReads = 0, indexReads = 0;
        fs.openSync = function(filename, ...args) { if (typeof filename === 'string' && filename.endsWith('.jpg')) jpegReads++; if (typeof filename === 'string' && filename.endsWith('index.json')) indexReads++; return originalOpen.call(fs, filename, ...args); };
        let relay = create({ ledger, bridge, config: { ...config, posDataDir: root } });
        await relay.syncPhotos();
        assert.deepEqual(calls, skus.slice(0, 5)); assert.equal(jpegReads, 5); assert.equal(indexReads, 1);
        relay = create({ ledger, bridge, config: { ...config, posDataDir: root } });
        await relay.syncPhotos();
        assert.deepEqual(calls.slice(5), [skus[5], skus[6], skus[7], skus[0], skus[1]]);
        assert.equal(Object.keys(ledger.get('pos-photo-sent')).length, 3);
        const before = jpegReads; await relay.syncPhotos();
        assert.equal(jpegReads - before, 5); assert.equal(indexReads, 3);
        assert.equal(relay.view().photoPending, 5);
    } finally { fs.openSync = originalOpen; fs.rmSync(root, { recursive: true, force: true }); }
});

test('explicit data-directory selection starts read-only stock and price sync without an initial POS POST', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kbl-pos-select-'));
    try {
        fs.writeFileSync(path.join(root, 'settings.json'), JSON.stringify({ price_buy_9999: 13000000, price_sell_9999: 14000000 }));
        fs.writeFileSync(path.join(root, 'inventory_db.json'), JSON.stringify(inventory.inventory));
        const before = fs.readFileSync(path.join(root, 'settings.json'));
        const ledger = memoryLedger(), calls = [];
        const relay = create({ ledger, config, now: () => 1000, bridge: { async request(route, method, data) { calls.push({ route, data }); return { success: true }; } } });
        relay.syncLocalSnapshot(); assert.equal(relay.view().pending, 0);
        assert.equal(relay.setDataDir(root).readOnly, true);
        assert.equal(ledger.get('pos-relay-active'), true);
        assert.equal(relay.view().pending, 2);
        await relay.flush(); assert.equal(calls.length, 2);
        assert.deepEqual(fs.readFileSync(path.join(root, 'settings.json')), before);
        const empty = path.join(root, 'empty'); fs.mkdirSync(empty);
        assert.throws(() => relay.setDataDir(empty));
        assert.equal(ledger.get('pos-data-dir'), fs.realpathSync(root));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('unchanged stock/config stays acknowledged across time and restart while price observations keep refreshing',async()=>{
    const ledger=memoryLedger(),calls=[];let at=1000;const bridge={async request(route,method,data){calls.push({route,data});return{success:true};}};
    let relay=create({ledger,config,bridge,now:()=>at});
    await relay.accept('inventory',inventory);await relay.accept('cloud-price-config',{config:{enabled:false}});
    at+=120000;await relay.accept('inventory',inventory);await relay.accept('cloud-price-config',{config:{enabled:false}});
    relay=create({ledger,config,bridge,now:()=>at});await relay.accept('inventory',inventory);
    assert.equal(calls.filter(c=>c.route.endsWith('pos-snapshot')).length,1);assert.equal(calls.filter(c=>c.route.endsWith('pos-cloud-price-config')).length,1);
    const prices={prices:{price_buy_9999:13000000,price_sell_9999:14000000}};
    await relay.accept('prices',prices);at+=60001;await relay.accept('prices',prices);
    assert.equal(calls.filter(c=>c.route.endsWith('pos-prices')).length,2);
    const beforeStock=calls.filter(c=>c.route.endsWith('pos-snapshot')).length;
    await relay.accept('inventory',{...inventory,inventory:[{...inventory.inventory[0],sellWage:2000}]});
    assert.equal(calls.filter(c=>c.route.endsWith('pos-snapshot')).length,beforeStock+1);
});
test('saved POS folder resumes on restart without requesting another connection; no saved folder does not activate reading',async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'kbl-pos-resume-'));
    try{
        fs.writeFileSync(path.join(root,'settings.json'),JSON.stringify({price_buy_9999:13000000,price_sell_9999:14000000,google_price_auto_enabled:false}));fs.writeFileSync(path.join(root,'inventory_db.json'),JSON.stringify(inventory.inventory));
        const ledger=memoryLedger(),calls=[];ledger.set('pos-data-dir',root);
        const relay=create({ledger,config,now:()=>1000,bridge:{async request(route){calls.push(route);return{success:true};}}});
        relay.syncLocalSnapshot();await relay.flush();assert.equal(ledger.get('pos-relay-active'),true);assert.ok(calls.includes('/api/worker/pos-prices'));assert.ok(calls.includes('/api/worker/pos-snapshot'));
        const unpaired=memoryLedger();create({ledger:unpaired,config,bridge:{async request(){assert.fail('no consented folder');}}}).syncLocalSnapshot();assert.equal(unpaired.get('pos-relay-active'),null);
    }finally{fs.rmSync(root,{recursive:true,force:true});}
});
