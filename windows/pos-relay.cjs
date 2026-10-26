'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), os = require('node:os'), C = require('./pos-contract.cjs');
const hash = v => crypto.createHash('sha256').update(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v)).digest('hex');
const supported = new Set(['prices', 'inventory', 'pawn', 'warranty-sale', 'transaction-event']);
function readOnlyJSON(root, name, limit = 3 * 1024 * 1024) {
    const base = fs.realpathSync(root), filename = path.join(base, name), real = fs.realpathSync(filename);
    if (!real.startsWith(base + path.sep) || fs.lstatSync(filename).isSymbolicLink()) throw Error('Không đọc liên kết ra ngoài thư mục POS.');
    const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try { const stat = fs.fstatSync(fd); if (!stat.isFile() || stat.size > limit) throw Error('File POS quá lớn hoặc không hợp lệ.'); return JSON.parse(fs.readFileSync(fd, 'utf8')); }
    finally { fs.closeSync(fd); }
}
function readPhoto(root, sku) {
    const index = readOnlyJSON(root, path.join('product-photos', 'index.json')), row = index[hash(sku)];
    if (!row) return null;
    if (row.code !== sku || !/^[a-f0-9]{64}\.jpg$/.test(row.file)) throw Error('Chỉ mục ảnh không khớp SKU.');
    const posRoot = fs.realpathSync(root), base = fs.realpathSync(path.join(posRoot, 'product-photos')), filename = path.join(base, row.file);
    if (!base.startsWith(posRoot + path.sep)) throw Error('Không đọc thư mục ảnh bên ngoài POS.');
    if (fs.realpathSync(filename) !== filename || fs.lstatSync(filename).isSymbolicLink()) throw Error('Đường dẫn ảnh không hợp lệ.');
    const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
        const stat = fs.fstatSync(fd); if (!stat.isFile() || stat.size > 8 * 1024 * 1024 || stat.size < 4) throw Error('Ảnh POS vượt giới hạn.');
        const bytes = fs.readFileSync(fd), digest = hash(bytes);
        if (digest + '.jpg' !== row.file || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw Error('Hash hoặc định dạng ảnh POS không đúng.');
        return { bytes, hash: digest };
    } finally { fs.closeSync(fd); }
}
function create({ ledger, bridge, config, now = Date.now }) {
    let flushing = false, photosBusy = false, nextLocalRead = 0;
    const queue = ledger.get('pos-outbox') || [], acknowledgements = ledger.get('pos-ack') || {};
    const relayToken = ledger.get('pos-relay-token') || crypto.randomBytes(32).toString('hex');
    ledger.set('pos-relay-token', relayToken);
    const save = () => { ledger.set('pos-outbox', queue); ledger.set('pos-ack', acknowledgements); };
    function dataRoot() { return ledger.get('pos-data-dir') || config.posDataDir || process.env.KBL_POS_DATA_DIR || path.join(process.env.APPDATA || process.env.LOCALAPPDATA || process.env.USERPROFILE || os.homedir(), 'KimBaoLam_POS_TichHop', 'data'); }
    function credentials() { return { url: 'http://127.0.0.1:39878', token: relayToken, dataDir: dataRoot(), ...view() }; }
    function setDataDir(dir) { if (!path.isAbsolute(dir) || !fs.statSync(dir).isDirectory()) throw Error('Chọn đúng thư mục data của POS trên máy này.'); ledger.set('pos-data-dir', fs.realpathSync(dir)); return { success: true }; }
    function auth(token) { return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(relayToken)); }
    function view() { return { pending: queue.length, photoPending: ledger.get('pos-photo-pending') || 0, lastSuccess: ledger.get('pos-last-success') || 0, lastError: ledger.get('pos-last-error') || '' }; }
    function enqueue(key, endpoint, data) {
        const digest = hash(data), old = queue.find(x => x.key === key);
        if (old?.digest === digest) return old;
        const ack = acknowledgements[key];
        if (!old && ack?.digest === digest && now() - ack.at < 60000) return { ...ack, key, confirmed: true };
        const seq = (ledger.get('pos-sequence') || 0) + 1;
        const item = { key, endpoint, digest, seq, data: { ...data, revision: seq }, queuedAt: now(), nextAt: 0 };
        const next = queue.filter(x => x.key !== key).concat(item);
        if (next.length > 100 || Buffer.byteLength(JSON.stringify(next)) > 16 * 1024 * 1024) throw Object.assign(Error('Hàng đợi POS đầy; giữ dữ liệu gốc ở POS và đồng bộ lại sau.'), { status: 507 });
        ledger.set('pos-sequence', seq); queue.splice(0, queue.length, ...next); save(); return item;
    }
    function recoverWarranty(input) {
        let tx;
        try { tx = readOnlyJSON(dataRoot(), 'sales_db.json', 20 * 1024 * 1024).find(t => String(t.id) === input.invoiceId); }
        catch (e) { if (e.code !== 'ENOENT') ledger.set('pos-last-error', 'Chưa đọc được QR bảo hành đã lưu trong POS.'); return input; }
        const saved = tx?.warrantySnapshot?.warranties || [];
        return { ...input, items: input.items.map(item => {
            const row = saved.find(r => r.sku === item.productSku);
            if (!row?.url) return item;
            try { const u = new URL(row.url); if (u.protocol !== 'https:' || !['tiemvangkimbaolam.id.vn', new URL(config.serverUrl).hostname].includes(u.hostname) || u.search || u.hash) return item;
                const match = /^\/bao-hanh\/([a-z0-9_-]{20,128})$/i.exec(u.pathname); return match ? { ...item, publicToken: C.token(match[1]) } : item;
            } catch { return item; }
        }) };
    }
    function project(operation, input) {
        if (operation === 'prices') {
            const p = C.prices(input); ledger.set('pos-prices', p.values);
            return enqueue('prices', 'pos-prices', { prices: p.values, observedAt: now() });
        }
        if (operation === 'inventory') {
            const products = C.inventory(input, ledger.get('pos-prices') || {});
            // Cache only the allowlisted projection needed to reprice on the next POS price update.
            const raw = input.inventory.filter(p => p && p.webSyncReady !== false).map(p => Object.fromEntries(['code', 'name', 'type', 'weightLy', 'priceSell', 'sellWage', 'wage', 'status'].map(k => [k, p[k]])));
            ledger.set('pos-inventory', raw); ledger.set('pos-skus', products.map(p => p.sku));
            return enqueue('inventory', 'pos-snapshot', { complete: true, products });
        }
        if (operation === 'pawn') {
            const p = C.pawn(Array.isArray(input) ? { records: input, mode: 'delta' } : input.records ? input : { records: [input], mode: 'delta' });
            const old = ledger.get('pos-pawn-cache') || { full: false, records: [] };
            const merged = new Map(p.mode === 'snapshot' ? [] : old.records.map(r => [r.id, r]));
            for (const r of p.records) merged.set(r.id, r);
            if (merged.size > 500) throw Object.assign(Error('Vượt 500 phiếu trong bản chụp POS.'), { status: 507 });
            const full = old.full || p.mode === 'snapshot', records = [...merged.values()].sort((a,b) => a.id.localeCompare(b.id));
            ledger.set('pos-pawn-cache', { full, records });
            return enqueue('pawn', 'pos-pawn', { records, mode: full ? 'snapshot' : 'delta' });
        }
        if (operation === 'warranty-sale') { const p = recoverWarranty(C.warranty(input)); return enqueue('warranty:' + hash(p.invoiceId), 'pos-warranty', p); }
        const p = C.transaction(input); return enqueue('transaction:' + hash(p.invoiceId + ':' + p.eventType), 'pos-transaction', p);
    }
    async function flush() {
        if (flushing) return; flushing = true;
        try {
            for (const row of [...queue].sort((a,b) => a.seq - b.seq)) {
                if (row.nextAt > now()) continue;
                try {
                    const result = await bridge.request('/api/worker/' + row.endpoint, 'POST', row.data);
                    if (result.success !== true && result.ok !== true) throw Error('Website chưa xác nhận lưu POS.');
                    const current = queue.find(x => x.key === row.key);
                    if (current?.seq === row.seq) queue.splice(queue.indexOf(current), 1);
                    acknowledgements[row.key] = { seq: row.seq, digest: row.digest, result, at: now() };
                    for (const k of Object.keys(acknowledgements).sort((a,b) => acknowledgements[b].at - acknowledgements[a].at).slice(100)) delete acknowledgements[k];
                    ledger.set('pos-last-success', now()); ledger.set('pos-last-error', ''); save();
                } catch (e) {
                    row.nextAt = now() + 60000; row.error = String(e.message).slice(0, 250);
                    ledger.set('pos-last-error', row.error); save();
                }
            }
        } finally { flushing = false; }
    }
    async function accept(operation, input, waitMs = 4500) {
        if (!supported.has(operation)) return { status: 422, body: { success: false, message: 'Chưa ghép chức năng này vào website mới; không xác nhận thay cho POS.' } };
        const row = project(operation, input);
        ledger.set('pos-relay-active', true);
        if (operation === 'prices') {
            const cached = ledger.get('pos-inventory'); if (cached) project('inventory', { inventory: cached, mode: 'snapshot' });
        }
        if (!row.confirmed) { let timer; try { await Promise.race([flush(), new Promise(resolve => { timer = setTimeout(resolve, waitMs); })]); } finally { clearTimeout(timer); } }
        const ack = row.confirmed ? row : acknowledgements[row.key];
        if (ack?.seq === row.seq) return { status: 200, body: ack.result };
        // The supplied Electron main.js treats *every* HTTP 2xx as success.
        // Queued/offline must therefore remain non-2xx, even when persisted locally.
        return { status: 503, body: { success: false, queued: true, message: 'Đã giữ tại Windows; website chưa xác nhận. Tự gửi lại khi có kết nối.' } };
    }
    async function syncPhotos() {
        if (photosBusy) return; photosBusy = true;
        const sent = ledger.get('pos-photo-sent') || {}, skus = ledger.get('pos-skus') || []; let pending = 0, uploaded = 0;
        try {
            for (const sku of skus) {
                let counted = false;
                try {
                    const photo = readPhoto(dataRoot(), sku); if (!photo || sent[sku] === photo.hash) continue;
                    pending++; counted = true; if (uploaded >= 5) continue;
                    const result = await bridge.request('/api/worker/pos-photo?sku=' + encodeURIComponent(sku), 'POST', photo.bytes, { 'Content-Type': 'image/jpeg' });
                    if (result.success !== true || result.assetId !== photo.hash) throw Error('Website chưa xác nhận ảnh đúng hash.');
                    sent[sku] = photo.hash; pending--; uploaded++; ledger.set('pos-photo-sent', sent);
                } catch (e) {
                    if (e.code === 'ENOENT') continue; if (!counted) pending++; ledger.set('pos-last-error', 'Ảnh POS: ' + String(e.message).slice(0, 220));
                }
            }
        } finally { ledger.set('pos-photo-pending', pending); photosBusy = false; }
    }
    function syncLocalSnapshot() {
        if (!ledger.get('pos-relay-active') || now() < nextLocalRead) return;
        nextLocalRead = now() + 60000;
        // No POS module is loaded/executed. Read only two known JSON files;
        // credentials, purchase costs and customer databases never leave Windows.
        try {
            const p = C.prices({ prices: readOnlyJSON(dataRoot(), 'settings.json') });
            project('prices', { prices: p.values });
            project('inventory', { mode: 'snapshot', inventory: readOnlyJSON(dataRoot(), 'inventory_db.json') });
        } catch (e) { ledger.set('pos-last-error', 'Đọc POS: ' + String(e.message).slice(0, 220)); }
    }
    return { accept, auth, view, credentials, setDataDir, syncLocalSnapshot, flush, syncPhotos };
}
module.exports = { create, readPhoto, readOnlyJSON };
