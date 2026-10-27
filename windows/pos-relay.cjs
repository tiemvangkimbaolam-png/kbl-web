'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), os = require('node:os'), C = require('./pos-contract.cjs');
const hash = v => crypto.createHash('sha256').update(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v)).digest('hex');
const supported = new Set(['prices', 'inventory', 'pawn', 'warranty-sale', 'transaction-event', 'cloud-price-config']);
function readOnlyJSON(root, name, limit = 3 * 1024 * 1024) {
    const base = fs.realpathSync(root), filename = path.join(base, name), real = fs.realpathSync(filename);
    if (!real.startsWith(base + path.sep) || fs.lstatSync(filename).isSymbolicLink()) throw Error('Không đọc liên kết ra ngoài thư mục POS.');
    const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try { const stat = fs.fstatSync(fd); if (!stat.isFile() || stat.size > limit) throw Error('File POS quá lớn hoặc không hợp lệ.'); return JSON.parse(fs.readFileSync(fd, 'utf8')); }
    finally { fs.closeSync(fd); }
}
function readPhoto(root, sku, cachedIndex) {
    const index = cachedIndex || readOnlyJSON(root, path.join('product-photos', 'index.json')), row = index[hash(sku)];
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
function cloudPriceConfig(input) {
    const c = input?.config;
    if (!c || typeof c !== 'object' || typeof c.enabled !== 'boolean') throw Error('Cần bật hoặc tắt rõ nguồn giá tự động trong POS.');
    if (!c.enabled) return { enabled: false, symbol: 'BK' };
    if (c.symbol !== 'BK') throw Error('Nguồn giá POS chưa đúng mã BK.');
    if (typeof c.markupVnd !== 'number' || !Number.isFinite(c.markupVnd) || c.markupVnd < 0 || c.markupVnd > 1e9) throw Error('Cần mức cộng giá hợp lệ từ POS.');
    let u; try { u = new URL(c.relayUrl); } catch { throw Error('Cần URL relay giá HTTPS được cấu hình trong POS.'); }
    if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.search || !['script.google.com','script.googleusercontent.com'].includes(u.hostname)) throw Error('Chỉ nhận URL relay Google HTTPS không chứa token trong URL.');
    if (typeof c.relayToken !== 'string' || !c.relayToken.trim() || c.relayToken.length > 4096 || /[\r\n\x00]/.test(c.relayToken)) throw Error('Cần mã relay giá từ cấu hình POS; không dùng mã nhúng mặc định.');
    const spreads = {};
    for (const code of C.GOLD) {
        const n = c.spreads?.[code];
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1e9) throw Error('Cần đủ chênh lệch mua/bán sáu tuổi vàng từ POS.');
        spreads[code] = n;
    }
    const pollMs = c.pollMs === undefined ? 60000 : c.pollMs;
    if (!Number.isSafeInteger(pollMs) || pollMs < 5000 || pollMs > 3600000) throw Error('Chu kỳ giá POS không hợp lệ.');
    return { enabled: true, symbol: 'BK', markupVnd: c.markupVnd, relayUrl: u.href, relayToken: c.relayToken.trim(), pollMs, spreads };
}
function settingsCloudPriceConfig(settings, priceValues) {
    if (typeof settings.google_price_auto_enabled !== 'boolean') throw Error('Cần cấu hình bật/tắt nguồn giá Google rõ ràng trong POS.');
    if (!settings.google_price_auto_enabled) return cloudPriceConfig({ config: { enabled: false } });
    const spreads = {};
    for (const code of C.GOLD) {
        const explicit = settings['spread_' + code], buy = priceValues['price_buy_' + code], sell = priceValues['price_sell_' + code];
        spreads[code] = explicit !== undefined ? explicit : typeof buy === 'number' && typeof sell === 'number' ? sell - buy : undefined;
    }
    return cloudPriceConfig({ config: { enabled: true, symbol: 'BK', markupVnd: settings.google_price_markup_vnd, relayUrl: settings.google_price_relay_url, relayToken: settings.google_price_relay_token, spreads } });
}
function create({ ledger, bridge, config, now = Date.now }) {
    let flushing = false, photosBusy = false, nextLocalRead = 0;
    const queue = ledger.get('pos-outbox') || [], acknowledgements = ledger.get('pos-ack') || {};
    // A hostname cutover keeps the same receipts. Changing the worker or its
    // token must not make a different backend inherit old upload confirmations.
    const scope = hash({ id: config.id || null, token: config.token || null });
    const previousScope = ledger.get('pos-backend-scope');
    const changedBackend = previousScope !== scope;
    ledger.set('pos-backend-scope', scope);
    const currentBackend = () => ledger.get('pos-backend-scope') === scope;
    const relayToken = ledger.get('pos-relay-token') || crypto.randomBytes(32).toString('hex');
    ledger.set('pos-relay-token', relayToken);
    const save = () => { if (currentBackend()) { ledger.set('pos-outbox', queue); ledger.set('pos-ack', acknowledgements); } };
    for (const row of queue) row.nextAt = 0; // Restart retries durable work immediately.
    if (changedBackend) {
        for (const key of Object.keys(acknowledgements)) delete acknowledgements[key];
        ledger.set('pos-photo-sent', {});
        ledger.set('pos-last-success', 0);
    }
    function dataRoot() { return ledger.get('pos-data-dir') || config.posDataDir || process.env.KBL_POS_DATA_DIR || path.join(process.env.APPDATA || process.env.LOCALAPPDATA || process.env.USERPROFILE || os.homedir(), 'KimBaoLam_POS_TichHop', 'data'); }
    function credentials() { return { url: 'http://127.0.0.1:39878', token: relayToken, dataDir: dataRoot(), ...view() }; }
    function setDataDir(dir) {
        if (typeof dir !== 'string' || !path.isAbsolute(dir) || !fs.statSync(dir).isDirectory()) throw Error('Chọn đúng thư mục data của POS trên máy này.');
        // Explicit local selection authorizes read-only stock/price import even
        // when the old POS pins its website URL and cannot POST to this relay.
        const real = fs.realpathSync(dir);
        C.prices({ prices: readOnlyJSON(real, 'settings.json') });
        C.inventory({ inventory: readOnlyJSON(real, 'inventory_db.json'), mode: 'snapshot' }, {});
        ledger.set('pos-data-dir', real); ledger.set('pos-relay-active', true);
        nextLocalRead = 0;
        syncLocalSnapshot();
        return { success: true, readOnly: true, message: 'Đã bật đọc giá/kho/ảnh từ POS. Phiếu cầm và bảo hành vẫn cần POS gửi qua kết nối đồng bộ.' };
    }
    function auth(token) { return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(relayToken)); }
    function view() { return { pending: queue.length, photoPending: ledger.get('pos-photo-pending') || 0, lastSuccess: ledger.get('pos-last-success') || 0, lastError: ledger.get('pos-last-error') || '', cloudPriceConfigPending: queue.some(row => row.key === 'cloud-price-config'), cloudPriceConfigError: ledger.get('pos-cloud-price-config-error') || '', cloudPriceHandoff: { pending: queue.some(row => row.key === 'cloud-price-config'), lastSuccess: ledger.get('pos-cloud-price-config-success') || 0, lastError: ledger.get('pos-cloud-price-config-error') || '' } }; }
    function enqueue(key, endpoint, data) {
        if (['prices', 'inventory', 'pawn', 'cloud-price-config'].includes(key)) {
            const snapshots = ledger.get('pos-snapshots') || {};
            snapshots[key] = { endpoint, data };
            ledger.set('pos-snapshots', snapshots);
        }
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
        if (operation === 'cloud-price-config') {
            let candidate = input?.config;
            if (candidate?.enabled === true && candidate.spreads === undefined) {
                let settings = {}, prices = ledger.get('pos-prices') || {};
                try {
                    settings = readOnlyJSON(dataRoot(), 'settings.json');
                    try { prices = C.prices({ prices: settings }).values; } catch {}
                } catch {}
                const spreads = {};
                for (const code of C.GOLD) {
                    const explicit = settings['spread_' + code], buy = prices['price_buy_' + code], sell = prices['price_sell_' + code];
                    spreads[code] = explicit !== undefined ? explicit : typeof buy === 'number' && typeof sell === 'number' ? sell - buy : undefined;
                }
                candidate = { ...candidate, spreads };
            }
            const value = cloudPriceConfig({ config: candidate });
            ledger.set('pos-cloud-price-config-error', '');
            return enqueue('cloud-price-config', 'pos-cloud-price-config', { config: value });
        }
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
        if (flushing || !currentBackend()) return; flushing = true;
        try {
            for (const row of [...queue].sort((a,b) => a.seq - b.seq)) {
                if (row.nextAt > now()) continue;
                try {
                    const result = await bridge.request('/api/worker/' + row.endpoint, 'POST', row.data);
                    if (!currentBackend()) return;
                    if (result.success !== true && result.ok !== true) throw Error('Website chưa xác nhận lưu POS.');
                    const current = queue.find(x => x.key === row.key);
                    if (current?.seq === row.seq) queue.splice(queue.indexOf(current), 1);
                    acknowledgements[row.key] = { seq: row.seq, digest: row.digest, result, at: now() };
                    for (const k of Object.keys(acknowledgements).sort((a,b) => acknowledgements[b].at - acknowledgements[a].at).slice(100)) delete acknowledgements[k];
                    if (row.key === 'cloud-price-config') { ledger.set('pos-cloud-price-config-success', now()); ledger.set('pos-cloud-price-config-error', ''); }
                    ledger.set('pos-last-success', now()); ledger.set('pos-last-error', ''); save();
                } catch (e) {
                    if (!currentBackend()) return;
                    row.nextAt = now() + 60000; row.error = row.key === 'cloud-price-config' ? 'Cấu hình giá máy chủ chưa được xác nhận; giữ tại Windows và tự gửi lại. Kiểm tra khóa mã hóa và kết nối website.' : String(e.message).slice(0, 250);
                    if (row.key === 'cloud-price-config') ledger.set('pos-cloud-price-config-error', row.error);
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
        if (photosBusy || !currentBackend()) return; photosBusy = true;
        const sent = ledger.get('pos-photo-sent') || {}, skus = ledger.get('pos-skus') || [];
        let pending = 0, attempts = 0;
        try {
            if (!skus.length) return;
            // Read the index once and use its content-addressed name to skip
            // already acknowledged files without rereading every JPEG.
            const index = readOnlyJSON(dataRoot(), path.join('product-photos', 'index.json'));
            const needsUpload = sku => {
                const row = index[hash(sku)];
                return !!row && !(row.code === sku && /^[a-f0-9]{64}\.jpg$/.test(row.file) && sent[sku] === row.file.slice(0, -4));
            };
            pending = skus.filter(needsUpload).length;
            const start = (Number(ledger.get('pos-photo-cursor')) || 0) % skus.length;
            for (let offset = 0; offset < skus.length && attempts < 5; offset++) {
                const idx = (start + offset) % skus.length, sku = skus[idx];
                if (!needsUpload(sku)) continue;
                attempts++;
                ledger.set('pos-photo-cursor', (idx + 1) % skus.length);
                try {
                    const photo = readPhoto(dataRoot(), sku, index); if (!photo) continue;
                    const result = await bridge.request('/api/worker/pos-photo?sku=' + encodeURIComponent(sku), 'POST', photo.bytes, { 'Content-Type': 'image/jpeg' });
                    if (!currentBackend()) return;
                    if (result.success !== true || result.assetId !== photo.hash) throw Error('Website chưa xác nhận ảnh đúng hash.');
                    sent[sku] = photo.hash; pending--; ledger.set('pos-photo-sent', sent);
                } catch (e) {
                    if (!currentBackend()) return;
                    ledger.set('pos-last-error', 'Ảnh POS: ' + String(e.message).slice(0, 220));
                }
            }
        } catch (e) { if (currentBackend() && e.code !== 'ENOENT') ledger.set('pos-last-error', 'Ảnh POS: ' + String(e.message).slice(0, 220)); }
        finally { if (currentBackend()) ledger.set('pos-photo-pending', pending); photosBusy = false; }
    }
    function syncLocalSnapshot() {
        if (!ledger.get('pos-relay-active') || now() < nextLocalRead) return;
        nextLocalRead = now() + 60000;
        // No POS module is loaded/executed. Read only two known JSON files;
        // credentials, purchase costs and customer databases never leave Windows.
        let settings, p;
        try { settings = readOnlyJSON(dataRoot(), 'settings.json'); }
        catch { ledger.set('pos-last-error', 'Chưa đọc được settings.json của POS; kiểm tra tệp JSON và đường dẫn data.'); }
        if (settings) {
            try { p = C.prices({ prices: settings }); project('prices', { prices: p.values }); }
            catch { ledger.set('pos-last-error', 'Bảng giá POS chưa hợp lệ; giữ giá đã xác nhận trước đó.'); }
            try {
                if (settings.google_price_auto_enabled === true && !p) throw Error('Thiếu bảng giá');
                project('cloud-price-config', { config: settingsCloudPriceConfig(settings, p?.values || {}) });
            } catch { ledger.set('pos-cloud-price-config-error', 'Chưa đủ cấu hình nguồn giá POS: kiểm tra bật/tắt, mức cộng, URL/mã relay và chênh lệch sáu tuổi vàng.'); }
        }
        try { project('inventory', { mode: 'snapshot', inventory: readOnlyJSON(dataRoot(), 'inventory_db.json') }); }
        catch { ledger.set('pos-last-error', 'Chưa đọc được inventory_db.json hợp lệ của POS; giữ kho đã xác nhận trước đó.'); }
    }
    if (changedBackend) {
        const snapshots = ledger.get('pos-snapshots') || {};
        for (const key of ['prices', 'inventory', 'pawn', 'cloud-price-config']) {
            const saved = snapshots[key];
            if (saved && !queue.some(row => row.key === key)) enqueue(key, saved.endpoint, saved.data);
        }
        // Compatibility with pre-scope ledgers: replay safe cached stock and
        // pawns, but never give cached gold prices a fabricated fresh timestamp.
        if (!snapshots.inventory && !queue.some(row => row.key === 'inventory')) {
            const cached = ledger.get('pos-inventory');
            if (cached) project('inventory', { inventory: cached, mode: 'snapshot' });
        }
        if (!snapshots.pawn && !queue.some(row => row.key === 'pawn')) {
            const cached = ledger.get('pos-pawn-cache');
            if (cached?.records) enqueue('pawn', 'pos-pawn', { records: cached.records, mode: cached.full ? 'snapshot' : 'delta' });
        }
    }
    save();
    return { accept, auth, view, credentials, setDataDir, syncLocalSnapshot, flush, syncPhotos };
}
module.exports = { create, readPhoto, readOnlyJSON, cloudPriceConfig, settingsCloudPriceConfig };
