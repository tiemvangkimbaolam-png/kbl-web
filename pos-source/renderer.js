const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { ipcRenderer } = require('electron');


// =================================================================
// KBL PERSISTENT DATA FIX V2.7.7
// =================================================================
// Không lưu dữ liệu nghiệp vụ theo process.cwd(). Bản Electron portable có thể
// chạy từ thư mục tạm; dữ liệu ghi tương đối ở đó sẽ biến mất khi đóng app.
// Từ bản này, npm start và file portable cùng dùng một thư mục dữ liệu cố định.
const KBL_DATA_FILE_NAMES = [
    'database.db',
    'inventory_db.json',
    'sales_db.json',
    'settings.json',
    'chanh_batches.json',
    'supplier_invoices.json',
    'supplier_invoice_drafts.json',
    'chanh_draft_lots.json',
    'offset_records.json',
    'pawn_lost_declarations.json'
];

function uniquePathList(values) {
    const seen = new Set();
    return values.filter((value) => {
        const normalized = value ? path.resolve(String(value)) : '';
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    }).map(value => path.resolve(String(value)));
}

function resolveKblPersistentDataDir() {
    // Cho phép chủ tiệm tự chỉ định khi cần di chuyển dữ liệu sang ổ khác.
    if (process.env.KBL_POS_DATA_DIR) return path.resolve(process.env.KBL_POS_DATA_DIR);

    const base = process.env.APPDATA || process.env.LOCALAPPDATA || process.env.USERPROFILE || process.cwd();
    return path.join(base, 'KimBaoLam_POS_TichHop', 'data');
}

const KBL_DATA_DIR = resolveKblPersistentDataDir();
try { fs.mkdirSync(KBL_DATA_DIR, { recursive: true }); } catch (error) {
    console.error('Không tạo được thư mục dữ liệu KBL:', KBL_DATA_DIR, error);
}

function kblDataPath(fileName) {
    return path.join(KBL_DATA_DIR, path.basename(String(fileName || '')));
}

function legacyDataRoots() {
    const roots = [];
    const addWithParent = (value) => {
        if (!value) return;
        try {
            const resolved = path.resolve(String(value));
            roots.push(resolved, path.dirname(resolved));
        } catch (_) {}
    };

    addWithParent(process.cwd());
    addWithParent(process.env.INIT_CWD);
    addWithParent(process.env.PORTABLE_EXECUTABLE_DIR);
    try { addWithParent(path.dirname(process.execPath)); } catch (_) {}
    try { if (typeof __dirname !== 'undefined') addWithParent(__dirname); } catch (_) {}

    return uniquePathList(roots).filter(root => path.resolve(root) !== path.resolve(KBL_DATA_DIR));
}

function migrateLegacyDataFile(fileName) {
    const target = kblDataPath(fileName);
    try {
        if (fs.existsSync(target) && fs.statSync(target).size > 0) return target;
    } catch (_) {}

    const candidates = [];
    legacyDataRoots().forEach((root) => {
        const candidate = path.join(root, fileName);
        try {
            if (!fs.existsSync(candidate)) return;
            const stat = fs.statSync(candidate);
            if (!stat.isFile() || stat.size <= 0) return;
            candidates.push({ candidate, mtimeMs: stat.mtimeMs || 0, size: stat.size || 0 });
        } catch (_) {}
    });

    // Chọn bản cũ được sửa gần nhất để ưu tiên dữ liệu test/đang dùng mới nhất.
    candidates.sort((a, b) => (b.mtimeMs - a.mtimeMs) || (b.size - a.size));
    if (!candidates.length) return target;

    try {
        fs.copyFileSync(candidates[0].candidate, target);
        console.log(`[KBL DATA] Đã chuyển ${fileName}: ${candidates[0].candidate} -> ${target}`);
    } catch (error) {
        console.warn(`[KBL DATA] Không chuyển được ${fileName}:`, error);
    }
    return target;
}

function prepareKblPersistentData() {
    KBL_DATA_FILE_NAMES.forEach(migrateLegacyDataFile);
    console.log('[KBL DATA] Thư mục dữ liệu cố định:', KBL_DATA_DIR);
}

// Cầu tương thích với main.js cũ: dữ liệu chính vẫn nằm ở AppData,
// nhưng inventory/settings được mirror sang các vị trí legacy để IPC sync cũ
// không đọc nhầm file stale sau Persistent Data Fix.
const kblLegacyMirrorTimers = new Map();

function mirrorLegacySyncFile(fileName, value) {
    if (!['inventory_db.json', 'settings.json'].includes(fileName)) return;

    // KBL 27/08/2026: mirror legacy chỉ để tương thích main.js cũ.
    // Không ghi đồng bộ nhiều file trên luồng UI nữa vì có thể làm POS đứng 30–60 giây.
    const oldTimer = kblLegacyMirrorTimers.get(fileName);
    if (oldTimer) clearTimeout(oldTimer);

    const timer = setTimeout(() => {
        kblLegacyMirrorTimers.delete(fileName);
        let payload = '';
        try {
            // Dùng JSON gọn để giảm dung lượng ghi đĩa; dữ liệu nghiệp vụ không đổi.
            payload = JSON.stringify(value);
        } catch (error) {
            console.warn(`[KBL DATA] Không serialize được ${fileName} để mirror:`, error && error.message);
            return;
        }

        for (const root of legacyDataRoots()) {
            try {
                const target = path.join(root, fileName);
                if (path.resolve(target) === path.resolve(kblDataPath(fileName))) continue;
                fs.promises.writeFile(target, payload, 'utf-8').catch(() => {});
            } catch (_) {
                // Một số vị trí như app.asar là read-only; bỏ qua an toàn.
            }
        }
    }, 120);

    kblLegacyMirrorTimers.set(fileName, timer);
}

function normalizeWebSyncBaseUrl(value) {
    const link = require('./kbl-connection.cjs');
    return link.read()?.url || link.validateUrl(value || 'https://tiemvangkimbaolam.id.vn');
}

function nodePostJson(targetUrl, body, headers = {}, timeoutMs = 12000) {
    return new Promise((resolve) => {
        let url;
        try { url = new URL(targetUrl); } catch (error) {
            resolve({ success:false, message:'URL đồng bộ website không hợp lệ.' });
            return;
        }
        const payload = Buffer.from(JSON.stringify(body), 'utf-8');
        const transport = url.protocol === 'http:' ? http : https;
        const request = transport.request({
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || undefined,
            path: `${url.pathname || '/'}${url.search || ''}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': payload.length,
                ...headers
            }
        }, (response) => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf-8');
                let data = null;
                try { data = text ? JSON.parse(text) : {}; } catch (_) {}
                if (response.statusCode >= 200 && response.statusCode < 300 && data && data.success) {
                    resolve(data);
                } else {
                    resolve({
                        success:false,
                        status:response.statusCode || 0,
                        message:(data && data.message) || `Website trả HTTP ${response.statusCode || 0}`
                    });
                }
            });
        });
        request.setTimeout(timeoutMs, () => request.destroy(new Error('Hết thời gian chờ đồng bộ website.')));
        request.on('error', error => resolve({ success:false, message:error.message || String(error) }));
        request.end(payload);
    });
}

async function syncInventoryToWebsiteRobust() {
    // Trước tiên giữ tương thích main process hiện có.
    // Hàng mới nhập từ HĐ Tab 5 được giữ LOCAL cho tới khi chủ tiệm mở Tab 3,
    // nhập/chốt công bán và bấm LƯU KHO. Hàng cũ không có cờ này vẫn sync như trước.
    mirrorLegacySyncFile('inventory_db.json', inventoryStore);
    mirrorLegacySyncFile('settings.json', settingsStore);
    const webInventory = inventoryStore.filter(item => item && item.webSyncReady !== false);
    try {
        const result = await ipcRenderer.invoke('sync-inventory-to-web', {
            inventory: webInventory,
            web_sync_url: settingsStore.web_sync_url,
            web_sync_token: settingsStore.web_sync_token
        });
        if (result && result.success) return result;
        console.warn('KBL SYNC: IPC inventory sync chưa thành công, chuyển sang direct fallback:', result && (result.message || result.reason));
    } catch (error) {
        console.warn('KBL SYNC: IPC inventory sync lỗi, chuyển sang direct fallback:', error && error.message);
    }

    const token = String(settingsStore.web_sync_token || '').trim();
    if (!token) return { success:false, message:'Chưa có KBL_SYNC_TOKEN trong Cài đặt & AI.' };
    const base = normalizeWebSyncBaseUrl(settingsStore.web_sync_url);
    return nodePostJson(`${base}/api/sync/inventory`, {
        mode: 'snapshot',
        inventory: webInventory
    }, {
        'x-kbl-sync-token': token
    });
}


// ============================================================================
// KBL V6.4 TRANSACTION SYNC CORE
// Một giao dịch POS phải lan cùng trạng thái sang Kho → Web → Loyalty → Bảo hành.
// Không xóa dữ liệu web để "sửa cho khớp"; hoàn tác được ghi thành reversal/void.
// ============================================================================
const KBL_TRANSACTION_QUEUE_FILE = 'transaction-sync-queue.json';
const KBL_VOID_AUDIT_FILE = 'sales_void_log.json';
let kblTransactionSyncBusy = false;
let kblTransactionSyncTimer = null;
let inventoryViewMode = 'active';

function kblTransactionCodes(tx) {
    const values = [];
    const push = (v) => {
        const code = String(v || '').trim();
        if (code && !values.includes(code)) values.push(code);
    };
    push(tx && tx.invCode);
    (Array.isArray(tx && tx.invCodes) ? tx.invCodes : []).forEach(push);
    (Array.isArray(tx && tx.items) ? tx.items : []).forEach(item => push(item && (item.invCode || item.sku || item.code)));
    return values.slice(0, 100);
}
function kblTransactionPayload(eventType, tx) {
    const codes = kblTransactionCodes(tx || {});
    return {
        eventType: String(eventType || '').toLowerCase(),
        invoiceId: String(tx && tx.id || '').trim(),
        originalTransactionId: String(tx && tx.originalTransactionId || '').trim(),
        mode: String(tx && tx.mode || 'ban').toLowerCase(),
        soldAt: tx && tx.dateRaw || new Date().toISOString(),
        at: new Date().toISOString(),
        skus: codes,
        invCode: codes[0] || '',
        invCodes: codes,
        items: (Array.isArray(tx && tx.items) ? tx.items : []).slice(0, 100).map(item => ({
            sku: String(item && (item.invCode || item.sku || item.code) || '').trim(),
            invCode: String(item && (item.invCode || item.sku || item.code) || '').trim(),
            itemName: String(item && (item.itemName || item.name) || '').slice(0, 160)
        })),
        phone: String(tx && tx.cusPhone || '').trim(),
        customerName: String(tx && tx.cusName || '').trim().slice(0, 100),
        saleTotal: Math.round(numberValue(tx && tx.totalPay)),
        realizedProfit: Math.round(numberValue(tx && tx.profit))
    };
}
function kblTransactionQueueRead() {
    try {
        const file = kblDataPath(KBL_TRANSACTION_QUEUE_FILE);
        if (!fs.existsSync(file)) return [];
        const rows = JSON.parse(fs.readFileSync(file, 'utf-8') || '[]');
        return Array.isArray(rows) ? rows : [];
    } catch (_) { return []; }
}
function kblTransactionQueueWrite(rows) {
    try {
        const file = kblDataPath(KBL_TRANSACTION_QUEUE_FILE), temp = file + '.tmp';
        fs.writeFileSync(temp, JSON.stringify((Array.isArray(rows) ? rows : []).slice(-5000), null, 2), 'utf-8');
        fs.renameSync(temp, file);
        return true;
    } catch (error) {
        console.warn('[KBL TX SYNC] Không lưu được queue:', error && error.message);
        return false;
    }
}
function queueKblTransactionEvent(eventType, tx) {
    const payload = kblTransactionPayload(eventType, tx);
    if (!payload.invoiceId) return false;
    const eventKey = `${payload.eventType}:${payload.invoiceId}`;
    const rows = kblTransactionQueueRead().filter(row => String(row && row.eventKey || '') !== eventKey);
    rows.push({ eventKey, payload, createdAt: new Date().toISOString(), attempts: 0 });
    return kblTransactionQueueWrite(rows);
}
function dropKblTransactionEventsForInvoice(invoiceId) {
    const id = String(invoiceId || '').trim();
    if (!id) return 0;
    const rows = kblTransactionQueueRead(), kept = rows.filter(row => String(row && row.payload && row.payload.invoiceId || '') !== id);
    if (kept.length !== rows.length) kblTransactionQueueWrite(kept);
    return rows.length - kept.length;
}
async function syncKblTransactionEventNow(eventType, tx) {
    const token = String(settingsStore && settingsStore.web_sync_token || '').trim();
    if (token.length < 32) return { success:false, skipped:true, message:'Thiếu KBL_SYNC_TOKEN để đồng bộ giao dịch.' };
    const base = normalizeWebSyncBaseUrl(settingsStore && settingsStore.web_sync_url);
    return nodePostJson(`${base}/api/sync/transaction-event`, kblTransactionPayload(eventType, tx), { 'x-kbl-sync-token': token });
}
async function flushKblTransactionEventQueue(reason = 'auto') {
    if (kblTransactionSyncBusy) return { success:false, busy:true };
    kblTransactionSyncBusy = true;
    try {
        const token = String(settingsStore && settingsStore.web_sync_token || '').trim();
        if (token.length < 32) return { success:false, skipped:true, message:'Thiếu KBL_SYNC_TOKEN' };
        const base = normalizeWebSyncBaseUrl(settingsStore && settingsStore.web_sync_url);
        let rows = kblTransactionQueueRead(), sent = 0;
        for (const row of rows.slice(0, 50)) {
            const result = await nodePostJson(`${base}/api/sync/transaction-event`, row.payload || {}, { 'x-kbl-sync-token': token });
            if (!result || !result.success) {
                row.attempts = Number(row.attempts || 0) + 1;
                row.lastError = result && (result.message || result.status) || 'Không rõ lỗi';
                row.lastAttemptAt = new Date().toISOString();
                kblTransactionQueueWrite(rows);
                return { success:false, sent, message:row.lastError };
            }
            rows = rows.filter(item => item !== row);
            kblTransactionQueueWrite(rows);
            sent++;
        }
        return { success:true, sent, remaining:rows.length, reason };
    } finally { kblTransactionSyncBusy = false; }
}
function startKblTransactionSyncAuto() {
    setTimeout(() => flushKblTransactionEventQueue('pos-start').catch(()=>{}), 1800);
    if (!kblTransactionSyncTimer) {
        kblTransactionSyncTimer = setInterval(() => flushKblTransactionEventQueue('retry').catch(()=>{}), 60000);
    }
    setTimeout(installKblTransactionSyncUi, 800);
}
function appendSalesVoidAudit(tx, reason = 'Hóa đơn sai') {
    try {
        const file = kblDataPath(KBL_VOID_AUDIT_FILE), temp = file + '.tmp';
        let rows = [];
        if (fs.existsSync(file)) { try { const parsed = JSON.parse(fs.readFileSync(file,'utf-8') || '[]'); if (Array.isArray(parsed)) rows = parsed; } catch (_) {} }
        rows.unshift({ voidedAt:new Date().toISOString(), voidReason:String(reason||'Hóa đơn sai').slice(0,160), transaction:tx });
        fs.writeFileSync(temp, JSON.stringify(rows.slice(0,5000), null, 2), 'utf-8');
        fs.renameSync(temp, file);
        return true;
    } catch (error) { console.warn('[KBL VOID AUDIT] Không ghi được log:', error && error.message); return false; }
}
function kblReconcileSnapshot() {
    return {
        sales: (Array.isArray(salesStore) ? salesStore : []).slice(0,20000).map(tx => ({
            id:String(tx && tx.id || ''), mode:String(tx && tx.mode || ''), originalTransactionId:String(tx && tx.originalTransactionId || ''),
            dateRaw:tx && tx.dateRaw || '', totalPay:numberValue(tx && tx.totalPay), profit:numberValue(tx && tx.profit),
            cusPhone:String(tx && tx.cusPhone || ''), cusName:String(tx && tx.cusName || ''), skus:kblTransactionCodes(tx)
        })),
        inventory: (Array.isArray(inventoryStore) ? inventoryStore : []).slice(0,5000).map(item => ({ code:String(item && item.code || ''), status:String(item && item.status || ''), webSyncReady:item && item.webSyncReady !== false }))
    };
}
async function reconcileKblWebsiteTransactions() {
    const token = String(settingsStore && settingsStore.web_sync_token || '').trim();
    if (token.length < 32) return alert('⚠️ Chưa có KBL_SYNC_TOKEN nên chưa thể đối soát website.');
    const base = normalizeWebSyncBaseUrl(settingsStore && settingsStore.web_sync_url), snapshot = kblReconcileSnapshot();
    const preview = await nodePostJson(`${base}/api/sync/reconcile/transactions`, { ...snapshot, apply:false }, { 'x-kbl-sync-token': token }, 20000);
    if (!preview || !preview.success) return alert(`⚠️ Chưa đối soát được website.\n${preview && preview.message || 'Không rõ lỗi'}`);
    const counts = preview.preview && preview.preview.counts || {};
    const loyaltyRows = Array.isArray(preview.preview && preview.preview.loyaltyOrphans) ? preview.preview.loyaltyOrphans : [];
    const productRows = Array.isArray(preview.preview && preview.preview.productMismatches) ? preview.preview.productMismatches : [];
    const loyaltySample = loyaltyRows.slice(0,8).map(r => `  • ${r.invoiceId} · điểm đã ghi ${Number(r.pointsAdded||0) >= 0 ? '+' : ''}${Number(r.pointsAdded||0)}`).join('\n');
    const productSample = productRows.slice(0,8).map(r => `  • ${r.sku}: POS ${r.pos || '—'} → Web ${r.website || '—'}`).join('\n');
    const msg = `ĐỐI SOÁT KBL TRANSACTION SYNC\n\n` +
        `POS hiện có: ${snapshot.inventory.length} hồ sơ SKU · ${snapshot.sales.length} giao dịch còn hiệu lực trong sales_db.json\n` +
        `Loyalty lệch do hóa đơn không còn trong POS: ${Number(counts.loyaltyOrphans||0)}${loyaltySample ? `\n${loyaltySample}` : ''}\n` +
        `Bảo hành lệch do hóa đơn không còn trong POS: ${Number(counts.warrantyOrphans||0)}\n` +
        `Trạng thái SKU POS ↔ Web lệch: ${Number(counts.productMismatches||0)}${productSample ? `\n${productSample}` : ''}\n\n` +
        `CHỈ bấm OK nếu danh sách trên đúng là các hóa đơn/SKU cần hoàn tác.\nKhông xóa lịch sử; website sẽ ghi reversal/void.`;
    if (!confirm(msg)) return preview;
    const applied = await nodePostJson(`${base}/api/sync/reconcile/transactions`, { ...snapshot, apply:true }, { 'x-kbl-sync-token': token }, 25000);
    if (!applied || !applied.success) return alert(`⚠️ Đối soát chưa áp dụng được.\n${applied && applied.message || 'Không rõ lỗi'}`);
    const a = applied.applied || {};
    alert(`✅ ĐỐI SOÁT XONG\n\nHoàn điểm/ledger: ${Number(a.loyaltyReversed||0)}\nBảo hành cập nhật: ${Number(a.warrantiesUpdated||0)}\nSKU sửa trạng thái Web: ${Number(a.productsUpdated||0)}\n\nKhông xóa lịch sử giao dịch website.`);
    await syncInventoryToWebsiteRobust().catch(()=>{});
    return applied;
}
window.reconcileKblWebsiteTransactions = reconcileKblWebsiteTransactions;
function installKblTransactionSyncUi() {
    const status = getEl('inventory-web-sync-status'); if (!status || getEl('kbl-transaction-reconcile-btn')) return;
    const btn = document.createElement('button'); btn.id='kbl-transaction-reconcile-btn'; btn.type='button'; btn.className='btn btn-blue'; btn.style.marginLeft='8px'; btn.innerText='🔄 KIỂM TRA LIÊN KẾT'; btn.onclick=()=>reconcileKblWebsiteTransactions();
    status.insertAdjacentElement('afterend', btn);
}

prepareKblPersistentData();
window.KBL_DATA_DIR = KBL_DATA_DIR;
window.getKblDataDirectory = () => KBL_DATA_DIR;

let GEMINI_API_KEY = '';

var dataStoreRecords = []; 
var inventoryStore = [];   
var salesStore = [];       
var settingsStore = { 
    gemini_api_key: "",
    price_buy_9999: 13700000, price_sell_9999: 14000000, spread_9999: 300000,
    price_buy_980: 13200000,  price_sell_980: 14000000, spread_980: 300000,
    price_buy_750: 10300000,  price_sell_750: 10800000, spread_750: 500000,
    price_buy_610: 8400000,   price_sell_610: 8820000, spread_610: 400000,
    price_buy_585: 8000000,   price_sell_585: 8500000, spread_585: 500000,
    price_buy_416: 5800000,   price_sell_416: 8000000, spread_416: 500000,
    default_exchange_fee: 400000,
    exchange_fee_980_980: 120000,
    exchange_fee_610_610: 400000,
    exchange_refund_9999_610: 30000,
    // Smart Exchange 610: KHÔNG lưu giá chành cố định.
    // Giá đổi ngang luôn lấy trực tiếp từ bảng giá POS hiện tại; trọng lượng/công/giá vốn lấy theo Mã SP + toa nhập.
    exchange_old_purity_610: 61.0,
    exchange_new_purity_610_default: 63.0,
    // Gợi ý lợi nhuận/công là NGƯỠNG MỀM, chủ tiệm được sửa bất kỳ lúc nào.
    profit_floor_base: 100000,
    profit_floor_per_chi: 75000,
    profit_round_step: 50000,
    free_ship_reserve_profit: 100000,
    // Google Sheet BK / ASK -> Apps Script Relay -> bỏ 1 số cuối -> cộng mức bán 9999.
    google_price_auto_enabled: true,
    google_price_markup_vnd: 100000,
    google_price_relay_url: 'https://script.google.com/macros/s/AKfycbxTpmcPTF6kgUbraMyeaxR-uVIh9U7ePKXYfcSLZZeRJ6l5tk5vA4aau3VHMw9iGfZm/exec',
    google_price_relay_token: '',
    nk_sequence: 0,
    nccList: ["Chành Vàng Hòa Bình", "Công Ty SJC", "Chành Vàng An Đông"]
};

var currentSellMode = 'ban'; 
var currentSelectedInvItem = null;
// KBL 15/09/2026 - chỉ phạm vi TEM: giữ lựa chọn in hàng loạt tách khỏi nghiệp vụ Kho/Bán.
const inventoryLabelSelection = new Set();
let inventoryTagQrTimer = null;
let inventoryTagQrLastValue = '';
var chanhBatches = [];
var supplierInvoices = [];
var supplierInvoiceDrafts = [];
var activeSupplierInvoiceImport = null;
var supplierInvoiceOcrBusy = false;
var chanhDraftLots = [];
var activeChanhBatchId = '';
var offsetRecords = [];
var pawnLostDeclarations = [];
var activePawnLostRecord = null;
var activeOffsetSaleId = '';
let inventoryWebSyncTimer = null;

// Mỗi phiếu có thể chứa nhiều món. Form cân chính là món đang nhập;
// các món đã bấm "+ THÊM MÓN" được chốt ở các thẻ bên dưới.
const MAX_PURCHASE_ITEMS = Number.MAX_SAFE_INTEGER;
let purchaseItemsLoading = false;
let purchaseItemsCommittedFirst = false;
let currentBuyMath = { grossLy: 0, gemLy: 0, netLy: 0, price: 0, fee: 0, totalVND: 0 };

// KBL 29/08/2026 · Sửa phiếu thu mua cũ an toàn.
// Chỉ bật khi người dùng bấm đúng nút "Sửa" ở lịch sử. Mã phiếu, ngày lập,
// rawDate/năm và mã nhập kho của phiếu cũ luôn được giữ nguyên khi cập nhật.
let activePurchaseEditId = '';
let activePurchaseLockedDate = '';

// Nội dung người dùng sửa trực tiếp trên phôi A4. Giữ riêng khỏi dữ liệu
// tính toán để các lần đồng bộ form không ghi đè phần đã sửa tay.
let a4ManualEdits = {};

// Số phiếu nhập kho tăng tuần tự, không dùng thời gian nên không bị trùng.
let currentDraftNKCode = '';

// Giỏ hàng của Tab Bán Hàng.
let salesCart = [];
// Giỏ vàng cũ dùng riêng cho chế độ đổi bù; không dùng chung với giỏ món mới.
let exchangeOldCart = [];
// Giỏ hàng trả lại. Mỗi lần xử lý trả hàng có thể chọn toàn bộ một hóa đơn
// nhiều món rồi kiểm tra lại trước khi xác nhận hoàn tiền.
let returnCart = [];
let lastSaleNetAmount = 0;

// KBL 11/09/2026 - Liên kết hồ sơ 3 tab đầu cho giao dịch đổi vàng.
// Chỉ điều phối Thu Mua -> Bán Hàng/Đổi Bù -> Đối Chiếu; không thay engine tính tiền.
let activeExchangeLinkDraft = null;
let saleCccdImageSnapshot = { front: '', back: '' };

// =================================================================
// 0. MOBILE SCANNER TÍCH HỢP
// =================================================================
let activeScannerContext = { tab: 'buy', side: 'front' };
const LIVE_PRICE_KEYS = [
    'price_buy_9999', 'price_sell_9999', 'spread_9999',
    'price_buy_980', 'price_sell_980', 'spread_980',
    'price_buy_750', 'price_sell_750', 'spread_750',
    'price_buy_610', 'price_sell_610', 'spread_610',
    'price_buy_585', 'price_sell_585', 'spread_585',
    'price_buy_416', 'price_sell_416', 'spread_416'
];

const DESKTOP_GOLD_RULES = [
    { code: '9999', effective: 9999 },
    { code: '980', effective: 9850 },
    { code: '750', effective: 7650 },
    { code: '610', effective: 6220 },
    { code: '585', effective: 6000 },
    { code: '416', effective: 4300 }
];

function normalizeDesktopSpread(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return 0;
    return number > 0 && number < 10000 ? number * 1000 : Math.round(number);
}

function roundDesktopGoldPrice(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(number / 10000) * 10000 : 0;
}

function deriveDesktopPrices(source) {
    const input = source || {};
    const baseSell = Number(input.price_sell_9999) || 0;
    const result = {};
    DESKTOP_GOLD_RULES.forEach(({ code, effective }) => {
        // 9999 giữ đúng mốc 1.000đ (ví dụ 14.605.000); các tuổi còn lại
        // giữ nguyên công thức cũ và làm tròn 10.000đ.
        const sell = code === '9999'
            ? (Number.isFinite(baseSell) && baseSell > 0 ? Math.round(baseSell / 1000) * 1000 : 0)
            : roundDesktopGoldPrice(baseSell * effective / 9999);
        const legacySpread = Number(input[`price_sell_${code}`]) - Number(input[`price_buy_${code}`]);
        const spread = input[`spread_${code}`] !== undefined
            ? normalizeDesktopSpread(input[`spread_${code}`])
            : (Number.isFinite(legacySpread) && legacySpread > 0 ? legacySpread : 0);
        result[`price_sell_${code}`] = sell;
        result[`spread_${code}`] = spread;
        result[`price_buy_${code}`] = Math.max(0, sell - spread);
    });
    return result;
}

// Lắng nghe yêu cầu mở Scanner từ iframe (Tab Cầm Đồ gọi ra ngoài)
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'open-mobile-scanner') {
        openMobileScanner(e.data.side, e.data.tab);
    }
    if (e.data && e.data.type === 'open-vneid-scanner') {
        openVneidScanner(e.data.tab || 'pawn');
    }
    if (e.data && e.data.type === 'pawn-contract-saved' && e.data.record) {
        ipcRenderer.invoke('sync-pawn-contract', e.data.record).then((result) => {
            if (!result || !result.success) {
                console.warn('⚠️ Phiếu đã lưu trong máy nhưng website chưa nhận:', result?.message || 'không rõ lỗi');
            }
        }).catch((error) => console.warn('⚠️ Không đồng bộ được phiếu cầm:', error));
    }

    // KBL 27/08/2026: nhận snapshot toàn bộ kho cầm từ pawn.html để bù các phiếu cũ
    // chưa từng được đẩy lên website. Không thay đổi/xóa dữ liệu cầm trong POS.
    if (e.data && e.data.type === 'pawn-sync-all' && Array.isArray(e.data.records)) {
        syncAllPawnContractsToWebsite(e.data.records, e.data.reason || 'snapshot')
            .catch((error) => console.warn('⚠️ Không đồng bộ được toàn bộ kho cầm:', error));
    }

    // KBL LAN Remote: nhận phản hồi nghiệp vụ trực tiếp từ iframe pawn.html
    // rồi trả về main process cho API http://<LAN>:3000/price.
    if (e.data && e.data.type === 'lan-pawn-response' && e.data.requestId) {
        ipcRenderer.send('lan-pawn-response', {
            requestId: String(e.data.requestId),
            result: e.data.result && typeof e.data.result === 'object'
                ? e.data.result
                : { success: false, message: 'Phiếu cầm trả về dữ liệu không hợp lệ.' }
        });
    }
});

let pawnFullSyncBusy = false;
let pawnFullSyncQueued = null;

function pawnSyncRecordIsActive(record) {
    const status = String(record && record.status || '').trim().toLowerCase();
    return !/(đã\s*chuộc|da\s*chuoc|đã\s*thanh\s*lý|da\s*thanh\s*ly|đã\s*thanh\s*toán|da\s*thanh\s*toan|hoàn\s*tất|hoan\s*tat|closed)/i.test(status);
}

async function syncAllPawnContractsToWebsite(records, reason = 'snapshot') {
    if (!Array.isArray(records) || !records.length) return { success: true, count: 0 };
    const localActiveRecords = records.filter(pawnSyncRecordIsActive).length;

    if (pawnFullSyncBusy) {
        pawnFullSyncQueued = { records, reason };
        return { success: false, queued: true };
    }

    pawnFullSyncBusy = true;
    let result = null;

    const notifyPawnFrame = (payload) => {
        try {
            const frame = getEl('pawn-app-frame');
            if (frame && frame.contentWindow) {
                frame.contentWindow.postMessage({ type: 'pawn-sync-result', ...payload }, '*');
            }
        } catch (_) {}
    };

    try {
        // Ưu tiên gửi một snapshot hoàn chỉnh trong MỘT request. Đây là nguồn
        // chính để bù toàn bộ phiếu cũ và tránh trường hợp mạng chập chờn làm
        // một vài phiếu bị rớt khi gửi riêng lẻ.
        try {
            result = await ipcRenderer.invoke('sync-pawn-snapshot', {
                records,
                reason,
                sentAt: new Date().toISOString()
            });
        } catch (error) {
            result = { success: false, message: error && error.message };
        }

        if (result && result.success && Number(result.count || 0) >= records.length) {
            console.log(`[KBL Pawn] Snapshot ${reason}: ${result.count}/${records.length}`);
            const serverActiveRecords = Number(result.activeRecords || 0);
            notifyPawnFrame({
                success: true,
                count: Number(result.count || records.length),
                localCount: records.length,
                localActiveRecords,
                activeRecords: serverActiveRecords,
                activeMatch: serverActiveRecords === localActiveRecords,
                message: result.message || 'Đã đồng bộ toàn bộ kho cầm lên web.'
            });
            return { ...result, localCount: records.length, localActiveRecords };
        }

        // Fallback tương thích: nếu hosting cũ chưa hiểu snapshot hoặc request
        // bị lỗi, dùng lại cơ chế gửi từng phiếu vốn đang chạy tốt.
        let synced = 0;
        let failed = 0;
        const batchSize = 4;
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);
            const results = await Promise.all(batch.map((record) =>
                ipcRenderer.invoke('sync-pawn-contract', record)
                    .catch((error) => ({ success: false, message: error && error.message }))
            ));

            results.forEach((item) => {
                if (item && item.success) synced += 1;
                else failed += 1;
            });
            await new Promise((resolve) => setTimeout(resolve, 40));
        }

        const fallbackResult = {
            success: failed === 0,
            count: synced,
            failed,
            localCount: records.length,
            localActiveRecords,
            message: failed
                ? `Web nhận ${synced}/${records.length} phiếu; còn ${failed} phiếu chưa đồng bộ.`
                : `Web đã nhận đủ ${synced}/${records.length} phiếu.`
        };
        console.log(`[KBL Pawn] Full sync fallback ${reason}: ${synced}/${records.length}, lỗi ${failed}`);
        notifyPawnFrame(fallbackResult);
        return fallbackResult;
    } finally {
        pawnFullSyncBusy = false;
        if (pawnFullSyncQueued) {
            const queued = pawnFullSyncQueued;
            pawnFullSyncQueued = null;
            setTimeout(() => syncAllPawnContractsToWebsite(queued.records, queued.reason), 300);
        }
    }
}

async function openMobileScanner(side, tab = 'buy') {
    activeScannerContext = { tab, side };
    try {
        const baseUrl = await ipcRenderer.invoke('get-scanner-url');
        if (!baseUrl || baseUrl.includes('localhost')) {
            return alert('⚠️ Máy tính chưa kết nối WiFi / Mạng LAN. Không thể tạo trạm kết nối quét ảnh!');
        }
        const url = `${baseUrl}/?side=${side}`;
        const qrBox = getEl('mobile-qr-box');
        if (qrBox) {
            qrBox.innerHTML = '';
            new QRCode(qrBox, { text: url, width: 220, height: 220, colorDark: "#0b2240", colorLight: "#ffffff" });
        }
        const modal = getEl('qr-modal');
        if (modal) {
            const title = modal.querySelector('h3');
            const note = modal.querySelector('p');
            if (title) title.textContent = '📸 Dùng điện thoại quét mã này';
            if (note) note.textContent = 'Đảm bảo điện thoại và máy tính cùng bắt 1 mạng WiFi';
            modal.style.display = 'flex';
        }
    } catch (e) {
        alert('Không thể kết nối máy chủ quét ảnh. Vui lòng kiểm tra lại!');
    }
}

function closeMobileScanner() {
    const modal = getEl('qr-modal');
    if (modal) modal.style.display = 'none';
}


// =================================================================
// KBL VNeID / QR CCCD — HỒ SƠ XÁC MINH NỘI BỘ, KHÔNG GIẢ LẬP THẺ CĂN CƯỚC
// =================================================================
const kblVneidState = {
    context: 'buy', stream: null, timer: null, raw: '', info: null, faceDataUrl: '', busy: false
};

function kblNormalizeIdentityKey(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
        .toLowerCase().replace(/[^a-z0-9]/g, '');
}

function kblNormalizeIdentityDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    let m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    m = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return '';
}

function kblPickIdentityField(obj, aliases) {
    if (!obj || typeof obj !== 'object') return '';
    const wanted = new Set(aliases.map(kblNormalizeIdentityKey));
    for (const [key, value] of Object.entries(obj)) {
        if (wanted.has(kblNormalizeIdentityKey(key)) && value !== undefined && value !== null) return String(value).trim();
    }
    return '';
}

function kblParseVneidQr(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return { ok:false, message:'QR rỗng.' };
    let source = {};

    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) source = parsed;
    } catch (_) {}

    if (!Object.keys(source).length && /^https?:\/\//i.test(raw)) {
        try {
            const url = new URL(raw);
            url.searchParams.forEach((value, key) => { source[key] = value; });
        } catch (_) {}
    }

    if (!Object.keys(source).length) {
        const kv = {};
        raw.split(/[;\n\r]+/).forEach(piece => {
            const m = piece.match(/^\s*([^:=]{2,40})\s*[:=]\s*(.+?)\s*$/);
            if (m) kv[m[1]] = m[2];
        });
        if (Object.keys(kv).length >= 2) source = kv;
    }

    let info = {
        cccd: kblPickIdentityField(source, ['cccd','soCCCD','soDinhDanh','soDinhDanhCaNhan','idNumber','citizenId','identityNumber','personalId','id']),
        oldId: kblPickIdentityField(source, ['cmnd','soCMND','oldId','oldIdentityNumber']),
        name: kblPickIdentityField(source, ['hoTen','hoVaTen','fullName','name','customerName']),
        dob: kblPickIdentityField(source, ['ngaySinh','dateOfBirth','dob','birthDate']),
        sex: kblPickIdentityField(source, ['gioiTinh','sex','gender']),
        address: kblPickIdentityField(source, ['noiThuongTru','noiCuTru','diaChi','address','residence','permanentAddress']),
        issueDate: kblPickIdentityField(source, ['ngayCap','dateIssue','issueDate','issuedDate']),
        raw
    };

    // QR trên thẻ Căn cước/CCCD phổ biến: CCCD|CMND cũ|Họ tên|Ngày sinh|Giới tính|Địa chỉ|Ngày cấp
    if ((!info.cccd || !info.name) && raw.includes('|')) {
        const p = raw.split('|').map(x => x.trim());
        if (p.length >= 3 && /^\d{9,12}$/.test(p[0] || '')) {
            info.cccd = info.cccd || p[0] || '';
            info.oldId = info.oldId || p[1] || '';
            info.name = info.name || p[2] || '';
            info.dob = info.dob || p[3] || '';
            info.sex = info.sex || p[4] || '';
            info.address = info.address || p[5] || '';
            info.issueDate = info.issueDate || p[6] || '';
        }
    }

    info.issueDate = kblNormalizeIdentityDate(info.issueDate);
    const digits = String(info.cccd || '').replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 12) info.cccd = digits;

    if (!info.cccd && !info.name && !info.address) {
        return {
            ok:false,
            tokenOnly:/^https?:\/\//i.test(raw),
            message:'QR này không chứa trực tiếp thông tin định danh mà POS có thể đọc. Nếu VNeID chỉ trả token động thì cần API/xác thực chính thức của VNeID; POS sẽ không tự đoán dữ liệu.'
        };
    }
    return { ok:true, info };
}

function kblCanvasWrap(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    let line = '', lines = [];
    for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
        else line = test;
    }
    if (line) lines.push(line);
    lines = lines.slice(0, maxLines);
    lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineHeight));
    return y + lines.length * lineHeight;
}

async function kblCreateVneidCards(info, faceDataUrl = '') {
    let faceImg = null;
    if (faceDataUrl) {
        faceImg = await new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = faceDataUrl;
        });
    }
    const make = (side) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1000; canvas.height = 620;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f7fbff'; ctx.fillRect(0,0,1000,620);
        ctx.strokeStyle = '#0b2240'; ctx.lineWidth = 8; ctx.strokeRect(12,12,976,596);
        ctx.fillStyle = '#0b2240'; ctx.fillRect(12,12,976,82);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 31px Segoe UI, Arial';
        ctx.fillText('HỒ SƠ XÁC MINH VNeID — BẢN LƯU NỘI BỘ', 38, 64);
        ctx.fillStyle = '#b42318'; ctx.font = 'bold 20px Segoe UI, Arial';
        ctx.fillText('KHÔNG PHẢI THẺ CĂN CƯỚC / KHÔNG CÓ GIÁ TRỊ THAY THẾ GIẤY TỜ GỐC', 38, 122);

        if (side === 'front') {
            ctx.strokeStyle = '#9aa8b6'; ctx.lineWidth = 3; ctx.strokeRect(42,158,260,330);
            if (faceImg) {
                const sw=faceImg.naturalWidth||faceImg.width, sh=faceImg.naturalHeight||faceImg.height, tw=260,th=330;
                let sx=0,sy=0,cw=sw,ch=sh; const source=sw/sh,target=tw/th;
                if(source>target){cw=sh*target;sx=(sw-cw)/2;} else {ch=sw/target;sy=(sh-ch)/2;}
                ctx.drawImage(faceImg,sx,sy,cw,ch,42,158,260,330);
            } else {
                ctx.fillStyle='#eef2f7'; ctx.fillRect(42,158,260,330);
                ctx.fillStyle='#64748b'; ctx.font='bold 20px Segoe UI, Arial'; ctx.fillText('CHƯA CHỤP KHUÔN MẶT',58,318);
            }
            ctx.fillStyle='#334155'; ctx.font='16px Segoe UI, Arial';
            ctx.fillText('Ảnh nếu có là ảnh chụp tại quầy,',52,520);
            ctx.fillText('không phải ảnh trích xuất từ VNeID.',52,545);

            let y=176; const x=342;
            const row=(label,value)=>{ ctx.fillStyle='#64748b';ctx.font='bold 17px Segoe UI, Arial';ctx.fillText(label,x,y); y+=28;ctx.fillStyle='#111827';ctx.font='bold 27px Segoe UI, Arial';y=kblCanvasWrap(ctx,value||'—',x,y,610,34,3)+23; };
            row('SỐ ĐỊNH DANH / CCCD', info.cccd);
            row('HỌ VÀ TÊN', info.name);
            row('NGÀY SINH / GIỚI TÍNH', [info.dob,info.sex].filter(Boolean).join(' · '));
            row('NƠI CƯ TRÚ / ĐỊA CHỈ', info.address);
        } else {
            let hash='';
            try { hash = crypto.createHash('sha256').update(String(info.raw||''),'utf8').digest('hex').slice(0,24).toUpperCase(); } catch (_) {}
            ctx.fillStyle='#111827'; ctx.font='bold 25px Segoe UI, Arial'; ctx.fillText('NGUỒN XÁC MINH: QR VNeID / QR Căn cước do khách xuất trình', 42, 180);
            ctx.fillStyle='#334155'; ctx.font='21px Segoe UI, Arial';
            let y=230;
            y=kblCanvasWrap(ctx, `Số định danh: ${info.cccd || '—'}`,42,y,910,32,2)+18;
            y=kblCanvasWrap(ctx, `Họ tên: ${info.name || '—'}`,42,y,910,32,2)+18;
            y=kblCanvasWrap(ctx, `Ngày cấp: ${info.issueDate || '—'}`,42,y,910,32,2)+18;
            y=kblCanvasWrap(ctx, `Địa chỉ: ${info.address || '—'}`,42,y,910,32,4)+18;
            ctx.fillStyle='#0b2240'; ctx.font='bold 18px Consolas, monospace'; ctx.fillText(`QR HASH: ${hash || '—'}`,42,510);
            ctx.fillStyle='#64748b'; ctx.font='17px Segoe UI, Arial';
            ctx.fillText(`Thời điểm tạo hồ sơ: ${new Date().toLocaleString('vi-VN')}`,42,550);
            ctx.fillText('POS chỉ lưu dữ liệu khách đã xuất trình; không tự suy đoán token VNeID không đọc được.',42,582);
        }
        return canvas.toDataURL('image/jpeg', 0.9);
    };
    return { front: make('front'), back: make('back') };
}

async function kblApplyVneidIdentity(context, info, faceDataUrl = '') {
    if (!info) return;
    const cards = await kblCreateVneidCards(info, faceDataUrl);
    if (context === 'buy') {
        if (getEl('buy-name') && info.name) getEl('buy-name').value = info.name;
        if (getEl('buy-cccd') && info.cccd) getEl('buy-cccd').value = info.cccd;
        if (getEl('buy-address') && info.address) getEl('buy-address').value = info.address;
        if (getEl('buy-date-issue') && info.issueDate) getEl('buy-date-issue').value = info.issueDate;
        [['view-front',cards.front],['a4-img-front',cards.front],['view-back',cards.back],['a4-img-back',cards.back]].forEach(([id,src])=>{const el=getEl(id);if(el){el.src=src;el.style.display='block';}});
        const status=getEl('buy-ocr-status'); if(status){status.innerText='✅ Đã nạp QR VNeID — hồ sơ nội bộ đã tạo';status.className='ai-status-alert ai-status-success';}
        syncBuyUI();
    } else if (context === 'sale') {
        if (getEl('s-cus-name') && info.name) getEl('s-cus-name').value = info.name;
        if (getEl('s-cus-cccd') && info.cccd) getEl('s-cus-cccd').value = info.cccd;
        if (getEl('s-cus-address') && info.address) getEl('s-cus-address').value = info.address;
        kblSetSaleCccdImages(cards.front, cards.back);
        const status=getEl('s-ocr-status'); if(status){status.innerText='✅ Đã nạp QR VNeID — hồ sơ nội bộ đã tạo';status.className='ai-status-alert ai-status-success';}
        calcSellMath();
    } else if (context === 'pawn') {
        const frame=getEl('pawn-app-frame');
        if(frame&&frame.contentWindow) frame.contentWindow.postMessage({type:'pawn-vneid-identity',info,cards},'*');
    }
}

async function kblUseVneidRawInput() {
    const input=getEl('vneid-raw-input');
    const raw=String(input&&input.value||'').trim();
    const parsed=kblParseVneidQr(raw);
    const status=getEl('vneid-status');
    if(!parsed.ok){ if(status){status.textContent='⚠️ '+parsed.message;status.style.color='#b42318';} return false; }
    kblVneidState.raw=raw; kblVneidState.info=parsed.info;
    await kblApplyVneidIdentity(kblVneidState.context, parsed.info, kblVneidState.faceDataUrl);
    if(status){status.textContent='✅ Đã đọc thông tin QR. Có thể chụp khuôn mặt khách tại quầy nếu cần.';status.style.color='#168b57';}
    return true;
}

async function kblCaptureVneidFace() {
    const video=getEl('vneid-video');
    const status=getEl('vneid-status');
    if(!video||!video.videoWidth){ if(status){status.textContent='⚠️ Camera chưa sẵn sàng. Có thể chọn ảnh khuôn mặt từ máy.';status.style.color='#b42318';} return; }
    const canvas=document.createElement('canvas'); const w=480,h=600; canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');
    const sw=video.videoWidth, sh=video.videoHeight, target=w/h, source=sw/sh;
    let sx=0,sy=0,cw=sw,ch=sh;
    if(source>target){cw=sh*target;sx=(sw-cw)/2;} else {ch=sw/target;sy=(sh-ch)/2;}
    ctx.drawImage(video,sx,sy,cw,ch,0,0,w,h);
    kblVneidState.faceDataUrl=canvas.toDataURL('image/jpeg',0.88);
    const preview=getEl('vneid-face-preview'); if(preview){preview.src=kblVneidState.faceDataUrl;preview.style.display='block';}
    if(kblVneidState.info) await kblApplyVneidIdentity(kblVneidState.context,kblVneidState.info,kblVneidState.faceDataUrl);
    if(status){status.textContent='✅ Đã chụp khuôn mặt tại quầy và cập nhật hồ sơ VNeID.';status.style.color='#168b57';}
}

function kblChooseVneidFaceFile() { const input=getEl('vneid-face-file'); if(input) input.click(); }
function kblHandleVneidFaceFile(input) {
    const file=input&&input.files&&input.files[0]; if(!file)return;
    const reader=new FileReader(); reader.onload=async()=>{kblVneidState.faceDataUrl=String(reader.result||''); const p=getEl('vneid-face-preview');if(p){p.src=kblVneidState.faceDataUrl;p.style.display='block';} if(kblVneidState.info)await kblApplyVneidIdentity(kblVneidState.context,kblVneidState.info,kblVneidState.faceDataUrl);}; reader.readAsDataURL(file);
}

function kblStopVneidCamera() {
    if(kblVneidState.timer){clearTimeout(kblVneidState.timer);kblVneidState.timer=null;}
    if(kblVneidState.stream){try{kblVneidState.stream.getTracks().forEach(t=>t.stop());}catch(_){} kblVneidState.stream=null;}
    const video=getEl('vneid-video'); if(video)video.srcObject=null;
}

async function kblScanVneidFrame() {
    const video=getEl('vneid-video'); if(!video||!kblVneidState.stream)return;
    try {
        let raw='';
        if('BarcodeDetector' in window){
            if(!kblVneidState.detector) kblVneidState.detector=new BarcodeDetector({formats:['qr_code']});
            const codes=await kblVneidState.detector.detect(video); if(codes&&codes[0])raw=String(codes[0].rawValue||'');
        } else if(typeof window.jsQR==='function'&&video.videoWidth){
            const c=document.createElement('canvas'); c.width=video.videoWidth;c.height=video.videoHeight;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0,c.width,c.height);const img=ctx.getImageData(0,0,c.width,c.height);const qr=window.jsQR(img.data,c.width,c.height,{inversionAttempts:'attemptBoth'});if(qr)raw=String(qr.data||'');
        }
        if(raw && raw!==kblVneidState.raw){const input=getEl('vneid-raw-input');if(input)input.value=raw;kblUseVneidRawInput();}
    } catch(_) {}
    kblVneidState.timer=setTimeout(kblScanVneidFrame,350);
}

function kblVneidStatusForContext(context, message, ok = true) {
    const text = String(message || '');
    if (context === 'buy') {
        const el = getEl('buy-ocr-status'); if (el) { el.innerText = text; el.className = 'ai-status-alert ' + (ok ? 'ai-status-success' : 'ai-status-error'); }
    } else if (context === 'sale') {
        const el = getEl('s-ocr-status'); if (el) { el.innerText = text; el.className = 'ai-status-alert ' + (ok ? 'ai-status-success' : 'ai-status-error'); }
    } else if (context === 'pawn') {
        const frame = getEl('pawn-app-frame');
        if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type:'pawn-vneid-status', message:text, ok:Boolean(ok) }, '*');
    }
}

async function kblDecodeQrFromImageDataUrl(dataUrl) {
    const src = String(dataUrl || '');
    if (!src.startsWith('data:image')) throw new Error('Ảnh QR gửi từ Remote không hợp lệ.');
    const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Không đọc được ảnh QR từ điện thoại.'));
        img.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently:true });
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    if ('BarcodeDetector' in window) {
        try {
            const detector = new BarcodeDetector({ formats:['qr_code'] });
            const codes = await detector.detect(canvas);
            if (codes && codes[0] && codes[0].rawValue) return String(codes[0].rawValue);
        } catch (_) {}
    }
    if (typeof window.jsQR === 'function') {
        const pixels = ctx.getImageData(0,0,canvas.width,canvas.height);
        const qr = window.jsQR(pixels.data, canvas.width, canvas.height, { inversionAttempts:'attemptBoth' });
        if (qr && qr.data) return String(qr.data);
    }
    throw new Error('Chưa nhận ra QR trong ảnh. Hãy đưa camera điện thoại gần QR hơn, tránh lóa màn hình rồi quét lại.');
}

async function kblHandleRemoteVneidPayload(side, payload) {
    const parts = String(side || '').split(':');
    const kind = parts[0] === 'vneid' && parts.length === 2 ? 'raw' : String(parts[0] === 'vneid-image' ? 'image' : parts[0] === 'vneid-face' ? 'face' : 'raw');
    const context = String(parts[parts.length - 1] || kblVneidState.context || 'buy');
    if (!['buy','sale','pawn'].includes(context)) throw new Error('Không xác định được Tab nhận dữ liệu VNeID.');
    kblVneidState.context = context;

    if (kind === 'face') {
        const face = String(payload || '');
        if (!face.startsWith('data:image')) throw new Error('Ảnh khuôn mặt từ Remote không hợp lệ.');
        kblVneidState.faceDataUrl = face;
        if (kblVneidState.info) await kblApplyVneidIdentity(context, kblVneidState.info, face);
        kblVneidStatusForContext(context, '✅ Đã nhận ảnh khuôn mặt từ điện thoại và cập nhật hồ sơ VNeID.', true);
        return true;
    }

    let raw = String(payload || '').trim();
    if (kind === 'image') raw = await kblDecodeQrFromImageDataUrl(raw);
    const parsed = kblParseVneidQr(raw);
    if (!parsed.ok) {
        kblVneidStatusForContext(context, '⚠️ ' + parsed.message, false);
        throw new Error(parsed.message);
    }
    kblVneidState.raw = raw;
    kblVneidState.info = parsed.info;
    await kblApplyVneidIdentity(context, parsed.info, kblVneidState.faceDataUrl);
    kblVneidStatusForContext(context, '✅ Điện thoại đã quét QR VNeID và nạp hồ sơ. Có thể chụp thêm khuôn mặt ngay trên Remote.', true);
    return true;
}

async function openVneidScanner(context='buy') {
    // VNeID phải quét trên ĐIỆN THOẠI REMOTE của tiệm, không dùng webcam máy tính.
    // Máy POS chỉ hiện QR để điện thoại mở đúng trang Remote trong cùng WiFi/LAN.
    kblStopVneidCamera();
    kblVneidState.context=context||'buy';kblVneidState.raw='';kblVneidState.info=null;kblVneidState.faceDataUrl='';kblVneidState.detector=null;
    try {
        const baseUrl = await ipcRenderer.invoke('get-scanner-url');
        if (!baseUrl || baseUrl.includes('localhost')) {
            return alert('⚠️ Máy POS chưa kết nối WiFi / LAN. Không thể mở KBL Remote trên điện thoại.');
        }
        const url = `${baseUrl}/?mode=vneid&target=${encodeURIComponent(kblVneidState.context)}`;
        const qrBox = getEl('mobile-qr-box');
        if (qrBox) {
            qrBox.innerHTML = '';
            new QRCode(qrBox, { text:url, width:220, height:220, colorDark:'#0b2240', colorLight:'#ffffff' });
        }
        const modal = getEl('qr-modal');
        if (modal) {
            const title = modal.querySelector('h3');
            const note = modal.querySelector('p');
            if (title) title.textContent = '🔳 MỞ QUÉT VNeID TRÊN ĐIỆN THOẠI';
            if (note) note.textContent = 'Dùng điện thoại của tiệm quét mã này → camera điện thoại sẽ quét QR VNeID trên điện thoại khách.';
            modal.style.display = 'flex';
        }
    } catch (error) {
        alert('Không mở được KBL Remote VNeID: ' + (error?.message || error));
    }
}

function closeVneidScanner(){kblStopVneidCamera();const modal=getEl('vneid-modal');if(modal)modal.style.display='none';}

ipcRenderer.on('lan-pawn-request', (_event, message) => {
    const requestId = String(message && message.requestId || '').trim();
    const pawnFrame = getEl('pawn-app-frame');
    if (!requestId) return;
    if (!pawnFrame || !pawnFrame.contentWindow) {
        ipcRenderer.send('lan-pawn-response', {
            requestId,
            result: { success: false, message: 'Không tìm thấy Tab 2 Cầm Đồ trên POS.' }
        });
        return;
    }
    pawnFrame.contentWindow.postMessage({
        type: 'lan-pawn-command',
        requestId,
        action: String(message.action || ''),
        payload: message.payload && typeof message.payload === 'object' ? message.payload : {}
    }, '*');
});

ipcRenderer.on('mobile-cccd-received', (event, payload) => {
    closeMobileScanner();
    const { side, image } = payload;
    const remoteSide = String(side || '');

    // KBL 29/09/2026: QR VNeID được quét bằng CAMERA TRÊN KBL REMOTE ĐIỆN THOẠI.
    // Main process vẫn dùng đúng route /upload cũ; chỉ phân biệt bằng trường side để
    // không phải sửa main.js hoặc làm ảnh hưởng luồng chụp CCCD đang chạy ổn định.
    if (/^vneid(?::|-(?:image|face):)/i.test(remoteSide)) {
        kblHandleRemoteVneidPayload(remoteSide, image).catch((error) => {
            console.error('[KBL VNeID Remote] Lỗi nhận dữ liệu:', error);
            alert('Không xử lý được QR VNeID từ điện thoại: ' + (error?.message || error));
        });
        return;
    }
    
    // Điều hướng hình ảnh tới ĐÚNG Tab đang mở
    if (activeScannerContext.tab === 'buy') {
        processBuyOCRBase64(side, image);
    } else if (activeScannerContext.tab === 'sale') {
        processSaleOCRBase64(side, image);
    } else if (activeScannerContext.tab === 'pawn') {
        // NẾU LÀ TAB CẦM ĐỒ: Bắn ảnh chui tọt vào bên trong iframe
        const pawnFrame = getEl('pawn-app-frame');
        if (pawnFrame && pawnFrame.contentWindow) {
            pawnFrame.contentWindow.postMessage({
                type: 'pawn-mobile-cccd',
                side: side,
                image: image
            }, '*');
        }
    } else {
        processBuyOCRBase64(side, image);
    }
});

// Nhận bảng giá được chỉnh từ điện thoại và cập nhật ngay toàn bộ app.
ipcRenderer.on('remote-prices-received', (_event, payload) => {
    const incoming = payload && payload.prices ? payload.prices : payload;
    if (!incoming || typeof incoming !== 'object') return;

    let changed = false;
    LIVE_PRICE_KEYS.forEach((key) => {
        const value = Number(incoming[key]);
        if (Number.isFinite(value) && value >= 0) {
            settingsStore[key] = value;
            changed = true;
        }
    });
    if (!changed) return;

    Object.assign(settingsStore, deriveDesktopPrices({ ...settingsStore, ...incoming }));

    saveDBFile('settings.json', settingsStore);
    applySettingsToUI();
    if (typeof syncBuyUI === 'function') syncBuyUI();
    if (typeof calcInvMath === 'function') calcInvMath();
    if (typeof calcSellMath === 'function') calcSellMath();
});

function normalizeGooglePriceMarkup(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 100000;
    return Math.max(0, Math.min(5000000, Math.round(number / 1000) * 1000));
}

function formatGooglePriceVnd(value) {
    const number = Number(value) || 0;
    return number > 0 ? `${new Intl.NumberFormat('vi-VN').format(number)}đ` : '—';
}

function renderGooglePriceStatus(status) {
    const box = getEl('google-price-status');
    if (!box) return;
    const s = status && typeof status === 'object' ? status : {};
    const enabled = s.enabled !== false;
    const bid = s.bidRaw || '—';
    const ask = s.askRaw || '—';
    const base = formatGooglePriceVnd(s.sourceBaseVnd);
    const markup = formatGooglePriceVnd(s.markupVnd);
    const finalPrice = formatGooglePriceVnd(s.finalSell9999);
    const time = s.lastSuccessAt ? new Date(s.lastSuccessAt).toLocaleTimeString('vi-VN') : '—';
    const error = s.error ? `<div style="margin-top:5px;color:#b42318;font-weight:700;">⚠️ ${String(s.error)}</div>` : '';
    const relay = s.relayConfigured === false ? '<span style="color:#b42318;font-weight:700;"> · Chưa cấu hình Relay</span>' : '<span style="color:#0f766e;"> · Relay sẵn sàng</span>';
    box.innerHTML =
        `<div style="font-weight:800;color:${enabled ? '#0f766e' : '#64748b'};">${enabled ? '● TỰ ĐỘNG ĐANG BẬT' : '○ TỰ ĐỘNG ĐANG TẮT'}${relay}</div>` +
        `<div style="margin-top:4px;line-height:1.5;">BK: BID <b>${bid}</b> · ASK <b>${ask}</b> → lấy ASK làm giá nhập chành: <b>${base}</b> → cộng: <b>${markup}</b> → 9999: <b style="color:#b7791f;">${finalPrice}</b></div>` +
        `<div style="margin-top:3px;color:#64748b;">${s.busy ? '⏳ Đang quét...' : (s.message || 'Chưa có trạng thái.')} · Lần nhận thành công: ${time}</div>` + error;
}

ipcRenderer.on('google-price-status', (_event, status) => renderGooglePriceStatus(status));

async function refreshGooglePriceNow() {
    const box = getEl('google-price-status');
    if (box) box.innerHTML = '<b>⏳ Đang quét Google Sheet BK / ASK...</b>';
    try {
        const status = await ipcRenderer.invoke('refresh-google-price-now');
        renderGooglePriceStatus(status);
        return status;
    } catch (error) {
        renderGooglePriceStatus({ enabled: true, error: error?.message || String(error), message: 'Không quét được Google Sheet.' });
        return null;
    }
}

async function loadGooglePriceStatus() {
    try {
        const status = await ipcRenderer.invoke('get-google-price-status');
        renderGooglePriceStatus(status);
    } catch (_) {}
}

async function saveGooglePriceAutoConfig(refreshNow = true) {
    const enabledEl = getEl('cfg-google-price-auto');
    const markupEl = getEl('cfg-google-price-markup');
    const relayUrlEl = getEl('cfg-google-relay-url');
    const relayTokenEl = getEl('cfg-google-relay-token');
    settingsStore.google_price_auto_enabled = enabledEl ? Boolean(enabledEl.checked) : true;
    settingsStore.google_price_markup_vnd = normalizeGooglePriceMarkup(markupEl ? markupEl.value : settingsStore.google_price_markup_vnd);
    settingsStore.google_price_relay_url = (relayUrlEl ? String(relayUrlEl.value || '').trim() : String(settingsStore.google_price_relay_url || '').trim()) || 'https://script.google.com/macros/s/AKfycbxTpmcPTF6kgUbraMyeaxR-uVIh9U7ePKXYfcSLZZeRJ6l5tk5vA4aau3VHMw9iGfZm/exec';
    settingsStore.google_price_relay_token = relayTokenEl ? String(relayTokenEl.value || '').trim() : String(settingsStore.google_price_relay_token || '').trim();
    if (markupEl) markupEl.value = settingsStore.google_price_markup_vnd;
    saveDBFile('settings.json', settingsStore);
    if (refreshNow && settingsStore.google_price_auto_enabled) return refreshGooglePriceNow();
    return loadGooglePriceStatus();
}

async function setGooglePriceMarkup(value) {
    const markupEl = getEl('cfg-google-price-markup');
    if (markupEl) markupEl.value = normalizeGooglePriceMarkup(value);
    return saveGooglePriceAutoConfig(true);
}

// =================================================================
// 1. TIỆN ÍCH CHUNG
// =================================================================
function formatVND(num) { 
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num).replace(/\s/g, ''); 
}

function getEl(id) { 
    return document.getElementById(id); 
}

function getNKNumberFromCode(value) {
    const match = String(value || '').trim().match(/^NK-(\d{5})$/i);
    return match ? Number(match[1]) : 0;
}

function getHighestNKNumber() {
    const storedNumber = Number(settingsStore && settingsStore.nk_sequence);
    const savedNumber = Array.isArray(dataStoreRecords)
        ? dataStoreRecords.reduce((max, record) => Math.max(max, getNKNumberFromCode(record && record.nkCode)), 0)
        : 0;
    // Nếu dữ liệu cũ chưa có nkCode, lấy số lượng phiếu cũ làm mốc ban đầu.
    const legacyCount = Array.isArray(dataStoreRecords) ? dataStoreRecords.length : 0;
    return Math.max(
        Number.isFinite(storedNumber) ? storedNumber : 0,
        savedNumber,
        legacyCount
    );
}

function peekNextNKCode() {
    return `NK-${String(getHighestNKNumber() + 1).padStart(5, '0')}`;
}

function setDraftNKCode(force = false) {
    const el = getEl('nk-code');
    if (!el) return '';

    if (force || !currentDraftNKCode || !getNKNumberFromCode(el.innerText)) {
        currentDraftNKCode = peekNextNKCode();
    }
    el.innerText = currentDraftNKCode;
    return currentDraftNKCode;
}

function resetDraftNKCode() {
    currentDraftNKCode = '';
    return setDraftNKCode(true);
}

function allocateNextNKCode() {
    const nextNumber = getHighestNKNumber() + 1;
    currentDraftNKCode = `NK-${String(nextNumber).padStart(5, '0')}`;
    settingsStore.nk_sequence = nextNumber;
    saveDBFile('settings.json', settingsStore);

    const el = getEl('nk-code');
    if (el) el.innerText = currentDraftNKCode;
    return currentDraftNKCode;
}

function switchTab(tabId) {
    if (tabId === 'tab-thumua' && activeExchangeLinkDraft && typeof kblMirrorExchangeSaleToBuyDraft === 'function') kblMirrorExchangeSaleToBuyDraft();
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (getEl(tabId)) getEl(tabId).classList.add('active');
    if (typeof event !== 'undefined' && event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    } else {
        const button = document.querySelector(`.tab-btn[onclick*="${tabId}"]`);
        if (button) button.classList.add('active');
    }
    if (tabId === 'tab-baocao') generateReports();
    if (tabId === 'tab-doichieu' && typeof refreshOffsetSaleOptions === 'function') refreshOffsetSaleOptions();
    if (tabId === 'tab-chuocmatgiay' && typeof renderPawnLostDocument === 'function') renderPawnLostDocument();
}

function lyToText(lyVal) {
    const [l, c, p, y] = splitWeightLyParts(lyVal);
    let str = "";
    if (l > 0) str += `${l}l `;
    if (c > 0) str += `${c}c `;
    if (p > 0) str += `${p}p `;
    if (y > 0) str += `${formatWeightLy(y)}ly `;
    return str.trim() || "0c";
}

function dichSoThanhChu(toAmount) {
    if (toAmount == 0) return "Không đồng";
    let isAm = toAmount < 0; 
    toAmount = Math.abs(toAmount);
    const cuoiText = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
    const lopText = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
    let vitriId = 0, numStr = Math.round(toAmount).toString(), chains = [];
    while (numStr.length > 0) { 
        chains.push(numStr.slice(-3).padStart(3, '0')); 
        numStr = numStr.slice(0, -3); 
    }
    let textResult = "";
    for (let i = chains.length - 1; i >= 0; i--) {
        let block = chains[i]; 
        let a = parseInt(block[0]), b = parseInt(block[1]), c = parseInt(block[2]);
        if (a == 0 && b == 0 && c == 0 && textResult != "") { vitriId++; continue; }
        let segment = "";
        if (a > 0 || textResult != "") segment += cuoiText[a] + " trăm ";
        if (b == 0) { 
            if (c > 0 && (a > 0 || textResult != "")) segment += "lẻ "; 
        } else if (b == 1) { 
            segment += "mười "; 
        } else { 
            segment += cuoiText[b] + " mươi "; 
        }
        if (c == 1 && b > 1) segment += "mốt";
        else if (c == 5 && b > 0) segment += "lăm";
        else if (c > 0) segment += cuoiText[c];
        if (segment != "") textResult += segment + " " + lopText[i] + " ";
    }
    let fin = textResult.trim().charAt(0).toUpperCase() + textResult.trim().slice(1) + " đồng chẵn";
    return isAm ? "Âm " + fin : fin;
}

// =================================================================
// 2. KHỞI ĐỘNG HỆ THỐNG
// =================================================================
document.addEventListener("DOMContentLoaded", function() {
    // Khởi tạo ngày tháng mặc định
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const fullDateStr = `${day}/${month}/${year}`;
    
    document.querySelectorAll('.lbl-real-day').forEach(el => el.innerText = day);
    document.querySelectorAll('.lbl-real-month').forEach(el => el.innerText = month);
    document.querySelectorAll('.lbl-real-year').forEach(el => el.innerText = year);
    if (getEl('a4-date')) getEl('a4-date').innerText = fullDateStr;
    if (getEl('a4-row-date')) getEl('a4-row-date').innerText = fullDateStr;
    if (getEl('gd-date')) getEl('gd-date').innerText = fullDateStr;
    if (getEl('nk-date')) getEl('nk-date').innerText = fullDateStr;
    
    if (getEl('rep-date-from')) getEl('rep-date-from').value = `${year}-${month}-01`;
    if (getEl('rep-date-to')) getEl('rep-date-to').value = `${year}-${month}-${day}`;

    // Lắng nghe sự kiện nạp ảnh CCCD mặt trước (từ máy tính)
    if (getEl('buy-file-front')) {
        getEl('buy-file-front').addEventListener('change', function(e) {
            if (this.files && this.files[0]) {
                const r = new FileReader();
                r.onload = (ev) => {
                    const dataUrl = ev.target.result;
                    const img = getEl('view-front');
                    const a4Img = getEl('a4-img-front');
                    if (img) { img.src = dataUrl; img.style.display = 'block'; }
                    if (a4Img) { a4Img.src = dataUrl; a4Img.style.display = 'block'; }
                };
                r.readAsDataURL(this.files[0]);
            }
        });
    }
    
    // Lắng nghe sự kiện nạp ảnh CCCD mặt sau (từ máy tính)
    if (getEl('buy-file-back')) {
        getEl('buy-file-back').addEventListener('change', function(e) {
            if (this.files && this.files[0]) {
                const r = new FileReader();
                r.onload = (ev) => {
                    const dataUrl = ev.target.result;
                    const img = getEl('view-back');
                    const a4Img = getEl('a4-img-back');
                    if (img) { img.src = dataUrl; img.style.display = 'block'; }
                    if (a4Img) { a4Img.src = dataUrl; a4Img.style.display = 'block'; }
                };
                r.readAsDataURL(this.files[0]);
            }
        });
    }

    // Đóng danh sách gợi ý tìm nhanh khách hàng khi click ra ngoài
    document.addEventListener('click', function(e) {
        const searchBox = getEl('buy-customer-quick-search');
        const resBox = getEl('buy-customer-search-results');
        if (resBox && searchBox && !searchBox.contains(e.target) && !resBox.contains(e.target)) {
            resBox.style.display = 'none';
        }
    });

    loadAllDatabases();
    // Báo main process sau khi AppData/settings đã load + mirror xong để tránh race lúc khởi động.
    ipcRenderer.send('renderer-price-ready');
    loadGooglePriceStatus();
    startN10LoyaltyAutoSync();
    startKblTransactionSyncAuto();
    if (getEl('inv-supplier-purity')) {
        getEl('inv-supplier-purity').addEventListener('input', () => { getEl('inv-supplier-purity').dataset.manual = '1'; });
        syncInvSupplierPurityDefault(true);
    }
    if (typeof loadPrinters === 'function') loadPrinters();
    renderSalesCart();
    bindA4Editing(document);
});

function loadAllDatabases() {
    try {
        const dbPath = (name) => kblDataPath(name);
        if (fs.existsSync(dbPath('database.db'))) dataStoreRecords = JSON.parse(fs.readFileSync(dbPath('database.db'), 'utf-8').trim() || '[]');
        if (fs.existsSync(dbPath('inventory_db.json'))) inventoryStore = JSON.parse(fs.readFileSync(dbPath('inventory_db.json'), 'utf-8').trim() || '[]');
        if (fs.existsSync(dbPath('sales_db.json'))) salesStore = JSON.parse(fs.readFileSync(dbPath('sales_db.json'), 'utf-8').trim() || '[]');
        if (fs.existsSync(dbPath('chanh_batches.json'))) chanhBatches = JSON.parse(fs.readFileSync(dbPath('chanh_batches.json'), 'utf-8').trim() || '[]');
        if (fs.existsSync(dbPath('supplier_invoices.json'))) supplierInvoices = JSON.parse(fs.readFileSync(dbPath('supplier_invoices.json'), 'utf-8').trim() || '[]');
        if (fs.existsSync(dbPath('supplier_invoice_drafts.json'))) supplierInvoiceDrafts = JSON.parse(fs.readFileSync(dbPath('supplier_invoice_drafts.json'), 'utf-8').trim() || '[]');
        if (fs.existsSync(dbPath('chanh_draft_lots.json'))) chanhDraftLots = JSON.parse(fs.readFileSync(dbPath('chanh_draft_lots.json'), 'utf-8').trim() || '[]');
        if (fs.existsSync(dbPath('offset_records.json'))) offsetRecords = JSON.parse(fs.readFileSync(dbPath('offset_records.json'), 'utf-8').trim() || '[]');
        if (fs.existsSync(dbPath('pawn_lost_declarations.json'))) pawnLostDeclarations = JSON.parse(fs.readFileSync(dbPath('pawn_lost_declarations.json'), 'utf-8').trim() || '[]');
        if (!Array.isArray(chanhBatches)) chanhBatches = [];
        if (!Array.isArray(supplierInvoices)) supplierInvoices = [];
        if (!Array.isArray(supplierInvoiceDrafts)) supplierInvoiceDrafts = [];
        if (!Array.isArray(chanhDraftLots)) chanhDraftLots = [];
        if (!Array.isArray(offsetRecords)) offsetRecords = [];
        if (!Array.isArray(pawnLostDeclarations)) pawnLostDeclarations = [];
        if (fs.existsSync(dbPath('settings.json'))) {
            let s = JSON.parse(fs.readFileSync(dbPath('settings.json'), 'utf-8').trim() || '{}');
            settingsStore = { ...settingsStore, ...s };
            const connection = require('./kbl-connection.cjs').read();
            if (connection) { settingsStore.web_sync_url = connection.url; settingsStore.web_sync_token = connection.token; }
        }
        // Khi mở lại POS, đồng bộ ngay các dòng suy ra từ giá bán 9999.
        // Nhờ vậy bảng giá trên phần mềm không giữ các giá mặc định cũ
        // trong khi điện thoại/TV đã dùng công thức mới.
        settingsStore = { ...settingsStore, ...deriveDesktopPrices(settingsStore) };
        if (settingsStore.gemini_api_key) GEMINI_API_KEY = settingsStore.gemini_api_key;
        // Làm mới cầu sync legacy ngay khi POS khởi động để main.js cũ đọc đúng file hiện tại.
        mirrorLegacySyncFile('inventory_db.json', inventoryStore);
        mirrorLegacySyncFile('settings.json', settingsStore);
        
        dataStoreRecords.sort((a,b) => new Date(b.rawDate || 0) - new Date(a.rawDate || 0));
        inventoryStore.sort((a,b) => new Date(b.dateAdd || 0) - new Date(a.dateAdd || 0));
        salesStore.sort((a,b) => new Date(b.dateRaw || 0) - new Date(a.dateRaw || 0));
        chanhBatches.sort((a,b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
        supplierInvoices.sort((a,b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
        supplierInvoiceDrafts.sort((a,b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
        offsetRecords.sort((a,b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
        pawnLostDeclarations.sort((a,b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
        activeSupplierInvoiceImport = supplierInvoiceDrafts.find(draft => draft && !draft.pushedAt && !draft.dismissedAt) || null;
        // Gắn ID ổn định cho món kho / dòng bán cũ để Mã SP hiển thị có thể được
        // đánh số liên tục sau khi xóa mà thao tác hoàn tác vẫn tìm đúng món.
        ensureInventoryStableIdentityLinks(true);
    } catch (e) { 
        console.error("Lỗi đọc dữ liệu:", e); 
    } 

    applySettingsToUI();
    restoreInvCostDefaults();
    loadNccList();  
    loadInventorySources();
    syncInvSourceUI();
    generateProductCode();
    compileBuyTable();
    if (typeof renderExchangeLinkWorkflow === 'function') renderExchangeLinkWorkflow();
    if (typeof renderInventoryTable === 'function') renderInventoryTable();
    resetDraftNKCode();
    syncBuyUI();
    if (typeof renderChanhDraftLots === 'function') renderChanhDraftLots();
    if (typeof renderChanhBatchList === 'function') renderChanhBatchList();
    if (typeof renderSupplierInvoiceTable === 'function') renderSupplierInvoiceTable();
    if (typeof renderSupplierInvoiceImportTable === 'function') renderSupplierInvoiceImportTable();
    if (typeof renderSalesInvoiceHistory === 'function') renderSalesInvoiceHistory();
    if (typeof newChanhBatch === 'function' && getEl('chanh-batch-id') && !getEl('chanh-batch-id').value) newChanhBatch();
}

// =================================================================
// KBL N10 LOYALTY AUTO-SYNC — TÍCH HỢP THẲNG TRONG POS
// Mở POS là chạy; không cần CHAY_N10_LOYALTY_BRIDGE.cmd / Node riêng.
// POS vẫn là nguồn dữ liệu gốc. Chỉ gửi giao dịch đã lưu trong sales_db.json.
// =================================================================
let n10LoyaltySyncBusy = false;
let n10LoyaltySyncDebounceTimer = null;
let n10LoyaltyRetryTimer = null;
const N10_LOYALTY_STATE_FILE = 'n10_loyalty_bridge_state.json';

function n10LoyaltyPhoneKey(value) {
    return String(value || '').replace(/\D/g, '').replace(/^84(?=\d{9,10}$)/, '0').slice(0, 12);
}

function n10LoyaltyReadState() {
    try {
        const file = kblDataPath(N10_LOYALTY_STATE_FILE);
        if (!fs.existsSync(file)) return { version: 1, synced: {} };
        const parsed = JSON.parse(fs.readFileSync(file, 'utf-8').trim() || '{}');
        return {
            version: 1,
            synced: parsed && parsed.synced && typeof parsed.synced === 'object' ? parsed.synced : {}
        };
    } catch (error) {
        console.warn('[N10 Loyalty] Không đọc được trạng thái sync:', error && error.message);
        return { version: 1, synced: {} };
    }
}

function n10LoyaltyWriteState(state) {
    try {
        const file = kblDataPath(N10_LOYALTY_STATE_FILE);
        const temp = file + '.tmp';
        fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf-8');
        fs.renameSync(temp, file);
    } catch (error) {
        console.warn('[N10 Loyalty] Không lưu được trạng thái sync:', error && error.message);
    }
}

function n10LoyaltyEligibleTransaction(tx) {
    if (!tx || !tx.id) return false;
    const phone = n10LoyaltyPhoneKey(tx.cusPhone);
    if (!/^0\d{8,11}$/.test(phone)) return false;
    const mode = String(tx.mode || '').toLowerCase();
    return ['ban', 'doi', 'doikbl', 'tra'].includes(mode) || Number.isFinite(Number(tx.profit));
}

function n10LoyaltyPayloadFor(tx) {
    const mode = String(tx.mode || '').toLowerCase();
    const profit = Number(tx.profit) || 0;
    const isReturn = mode === 'tra' || profit < 0;
    return {
        invoiceId: String(tx.id || '').slice(0, 100),
        phone: n10LoyaltyPhoneKey(tx.cusPhone),
        customerName: String(tx.cusName || '').trim().slice(0, 100),
        saleTotal: Math.round(Number(tx.totalPay) || 0),
        realizedProfit: Math.round(profit),
        soldAt: tx.dateRaw || new Date().toISOString(),
        eventType: isReturn ? 'return' : 'sale',
        publicNote: isReturn ? 'POS đã xác nhận trả hàng/điều chỉnh' : 'Hóa đơn đã được POS xác nhận'
    };
}

async function syncN10LoyaltyToWebsite(reason = 'auto') {
    if (n10LoyaltySyncBusy) return { success: false, busy: true };
    n10LoyaltySyncBusy = true;
    try {
        const token = String(settingsStore && settingsStore.web_sync_token || '').trim();
        if (token.length < 32) {
            console.warn('[N10 Loyalty] Chưa có web_sync_token đủ 32 ký tự; bỏ qua sync điểm.');
            return { success: false, skipped: true, message: 'Thiếu KBL_SYNC_TOKEN' };
        }
        const base = normalizeWebSyncBaseUrl(settingsStore && settingsStore.web_sync_url);
        const state = n10LoyaltyReadState();
        const sales = Array.isArray(salesStore) ? salesStore : [];
        // salesStore lưu mới nhất ở đầu; đảo lại để phần dư/điểm áp dụng đúng thứ tự.
        const pending = sales
            .filter(n10LoyaltyEligibleTransaction)
            .filter(tx => !state.synced[String(tx.id)])
            .slice()
            .reverse();

        let syncedCount = 0;
        for (const tx of pending) {
            const result = await nodePostJson(
                `${base}/api/sync/loyalty-sale`,
                n10LoyaltyPayloadFor(tx),
                { 'x-kbl-sync-token': token }
            );
            if (!result || !result.success) {
                console.warn(`[N10 Loyalty] ${tx.id}: chưa sync (${reason}) - ${result && (result.status || '')} ${result && (result.message || '')}`);
                return { success: false, syncedCount, message: result && result.message || 'Chưa đồng bộ được loyalty' };
            }
            state.synced[String(tx.id)] = {
                at: new Date().toISOString(),
                points: result.points,
                pointsAdded: result.pointsAdded,
                vip: Boolean(result.vip)
            };
            const keys = Object.keys(state.synced);
            if (keys.length > 20000) keys.slice(0, keys.length - 15000).forEach(key => delete state.synced[key]);
            n10LoyaltyWriteState(state);
            syncedCount += 1;
            console.log(`[N10 Loyalty] ✓ ${tx.id}: ${Number(result.pointsAdded) >= 0 ? '+' : ''}${Number(result.pointsAdded) || 0} điểm · tổng ${Number(result.points) || 0}${result.vip ? ' · VIP' : ''}`);
        }
        return { success: true, syncedCount };
    } catch (error) {
        console.warn('[N10 Loyalty] Lỗi auto-sync:', error && error.message);
        return { success: false, message: error && error.message || String(error) };
    } finally {
        n10LoyaltySyncBusy = false;
    }
}

function scheduleN10LoyaltySync(reason = 'sales-save', delayMs = 350) {
    clearTimeout(n10LoyaltySyncDebounceTimer);
    n10LoyaltySyncDebounceTimer = setTimeout(() => {
        syncN10LoyaltyToWebsite(reason).catch(error => console.warn('[N10 Loyalty] Auto-sync lỗi:', error && error.message));
    }, Math.max(50, Number(delayMs) || 350));
}

function startN10LoyaltyAutoSync() {
    // Quét một lần khi POS mở để bù các hóa đơn chưa gửi lúc mất mạng/tắt máy.
    scheduleN10LoyaltySync('pos-start', 1200);
    if (!n10LoyaltyRetryTimer) {
        // Nếu mạng/Plesk tạm lỗi, tự thử lại mỗi 60 giây khi POS đang mở.
        n10LoyaltyRetryTimer = setInterval(() => {
            syncN10LoyaltyToWebsite('retry').catch(error => console.warn('[N10 Loyalty] Retry lỗi:', error && error.message));
        }, 60000);
    }
}

// Cho phép kiểm tra thủ công từ DevTools khi cần, không cần CMD riêng.
window.syncN10LoyaltyNow = () => syncN10LoyaltyToWebsite('manual');

function saveDBFile(name, obj) {
    try {
        // File chính vẫn được ghi NGAY để không mất dữ liệu khi vừa lưu xong đã tắt POS.
        // JSON gọn + ghi temp rồi rename giúp giảm I/O và tránh file dở dang.
        const target = kblDataPath(name);
        const temp = target + '.tmp';
        const payload = JSON.stringify(obj);
        fs.writeFileSync(temp, payload, 'utf-8');
        fs.renameSync(temp, target);

        // Mirror legacy chạy nền, không khóa giao diện.
        mirrorLegacySyncFile(name, obj);
        if (name === 'sales_db.json') {
            // Hóa đơn đã được POS ghi xong: đẩy loyalty nền, tuyệt đối không chặn giao dịch/in phiếu.
            scheduleN10LoyaltySync('sales-save', 350);
            if (typeof renderSalesInvoiceHistory === 'function') renderSalesInvoiceHistory();
        }
        if (name === 'inventory_db.json') {
            // KBL 30/08/2026: Kho chỉ lưu LOCAL. Không tự đẩy Web Admin sau mỗi lần sửa.
            // Chủ tiệm bấm nút "ĐỒNG BỘ WEB ADMIN" sau khi kiểm xong để tránh món chưa có ảnh/duyệt bị đưa lên ngoài ý muốn.
            const status = getEl('inventory-web-sync-status');
            if (status) {
                status.innerText = 'Web Admin: có thay đổi chưa đồng bộ';
                status.style.color = '#b45309';
            }
        }
    } catch(e) {
        console.error('Không lưu được dữ liệu ' + name + ':', e);
    }
}

// Cho phép DevTools/nút bổ sung gọi lại sync thủ công nếu cần, không ảnh hưởng UI hiện tại.
window.syncInventoryToWebsite = async function(showAlert = true) {
    const status = getEl('inventory-web-sync-status');
    if (status) { status.innerText = 'Web Admin: đang đồng bộ...'; status.style.color = '#0f5f9b'; }
    const result = await syncInventoryToWebsiteRobust();
    if (result && result.success) {
        if (status) { const sent = result.count ?? inventoryStore.filter(item => item && item.webSyncReady !== false).length; const sold = inventoryStore.filter(item => String(item&&item.status||'').toLowerCase().includes('đã bán')).length; const active = Math.max(0, inventoryStore.length - sold); status.innerText = `Web Admin: ${active} đang quản lý · ${sold} đã bán · ${sent} hồ sơ SKU đã sync`; status.style.color = '#168b57'; }
        if (showAlert) { const sold = inventoryStore.filter(item => String(item&&item.status||'').toLowerCase().includes('đã bán')).length; const active = Math.max(0, inventoryStore.length - sold); alert(`✅ Đã đưa dữ liệu Kho lên Web Admin.\n\nĐang quản lý: ${active}\nĐã bán/lưu lịch sử: ${sold}\nTổng hồ sơ SKU gửi: ${result.count ?? inventoryStore.filter(item => item && item.webSyncReady !== false).length}\n\nWebsite tự tách hàng còn bán khỏi lịch sử đã bán.`); }
    } else {
        if (status) { status.innerText = 'Web Admin: đồng bộ lỗi'; status.style.color = '#b42318'; }
        if (showAlert) alert(`⚠️ Chưa đồng bộ được kho lên Web Admin.\n\n${result && (result.message || result.reason) || 'Không rõ nguyên nhân'}`);
    }
    return result;
};

function rememberInvCostDefaults() {
    try {
        ['inv-gold-price', 'inv-cost-base', 'inv-cost-wage', 'inv-sell-wage'].forEach(id => {
            const field = getEl(id);
            if (field) localStorage.setItem(`kbl_inv_default_${id}`, String(field.value ?? '0'));
        });
    } catch (_) {}
}

function restoreInvCostDefaults() {
    try {
        ['inv-gold-price', 'inv-cost-base', 'inv-cost-wage', 'inv-sell-wage'].forEach(id => {
            const field = getEl(id);
            const value = localStorage.getItem(`kbl_inv_default_${id}`);
            if (field && value !== null && value !== '') field.value = value;
        });
    } catch (_) {}
}

// =================================================================
// 3. KẾT NỐI CÂN SARTORIUS - GIỮ NGUYÊN CƠ CHẾ DRIVER GỐC ĐÃ CHẠY ĐƯỢC
// =================================================================
// QUAN TRỌNG:
// - renderer KHÔNG tự mở COM.
// - shared-scale.js là driver duy nhất giữ Web Serial/reader.
// - Không tự nạp lại shared-scale.js, không requestPort lần hai, không retry COM tại renderer.
async function initSerialPort() {
    if (window.__kblSharedScale) {
        return window.__kblSharedScale.connect('gold-buy', getEl('inp-com-port')?.value || 'COM3');
    }
    return null;
}

async function initSerialPortKho() {
    if (window.__kblSharedScale) {
        return window.__kblSharedScale.connect('gold-kho', getEl('inp-inv-com-port')?.value || 'COM3');
    }
    return null;
}

async function initSerialPortSaleOld() {
    if (window.__kblSharedScale) {
        return window.__kblSharedScale.connect('gold-sale-old', getEl('inp-sell-com-port')?.value || 'COM3');
    }
    return null;
}

// =================================================================
// 4. BỘ NÃO AI GEMINI AUTO-LATEST — KHÔNG GHIM MODEL CỐ ĐỊNH
// =================================================================
// KBL 29/09/2026:
// - Hỏi trực tiếp Models API bằng chính API key đang dùng.
// - Chỉ chọn model Gemini Flash/Flash-Lite có generateContent, loại image/TTS/audio/live/embedding.
// - Ưu tiên GA/stable, rồi phiên bản số cao hơn, rồi Flash trước Flash-Lite.
// - Không hard-code Gemini 2.5/3.x. Khi Google nâng đời và key nhìn thấy model mới, POS tự ưu tiên model đó.
// - Nếu Models API tạm lỗi, chỉ thử model đã chạy thành công gần nhất; không tự bịa model fallback.
let kblGeminiModelCache = { apiKeyTail: '', fetchedAt: 0, models: [] };

function kblGeminiVersionParts(modelName) {
    const match = String(modelName || '').toLowerCase().match(/^gemini-(\d+)(?:\.(\d+))?/);
    return match ? [Number(match[1]) || 0, Number(match[2]) || 0] : [0, 0];
}

function kblIsGeneralGeminiFlash(modelName) {
    const name = String(modelName || '').toLowerCase();
    const numericFlash = /^gemini-\d+(?:\.\d+)?-flash(?:-lite)?(?:$|-)/.test(name);
    const latestAlias = /^gemini-flash(?:-lite)?-latest$/.test(name);
    if (!numericFlash && !latestAlias) return false;
    if (/(image|tts|audio|live|embedding|robotics|computer-use|native-audio|imagen|veo)/.test(name)) return false;
    return true;
}

function kblGeminiModelRank(modelName) {
    const name = String(modelName || '').toLowerCase();
    const [major, minor] = kblGeminiVersionParts(name);
    const stable = !/(preview|experimental|exp)/.test(name);
    const aliasLatest = /-latest$/.test(name);
    const lite = /-flash-lite(?:$|-)/.test(name) || /flash-lite-latest$/.test(name);
    // GA/stable > preview; phiên bản số cao > thấp; Flash > Flash-Lite.
    // latest alias chỉ là dự phòng khi API không công bố model số tương ứng.
    return (stable ? 10_000_000_000 : 0)
        + (major * 100_000_000)
        + (minor * 1_000_000)
        + (lite ? 0 : 10_000)
        + (aliasLatest ? 1 : 100);
}

async function kblDiscoverGeminiModels(apiKey, force = false) {
    const key = String(apiKey || '').trim();
    if (!key) throw new Error('Chưa có Gemini API Key.');
    const apiKeyTail = key.slice(-8);
    const now = Date.now();
    if (!force && kblGeminiModelCache.apiKeyTail === apiKeyTail
        && now - kblGeminiModelCache.fetchedAt < 10 * 60 * 1000
        && kblGeminiModelCache.models.length) {
        return [...kblGeminiModelCache.models];
    }

    const collected = [];
    let pageToken = '';
    let guard = 0;
    do {
        const query = new URLSearchParams({ key, pageSize: '1000' });
        if (pageToken) query.set('pageToken', pageToken);
        const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?${query.toString()}`);
        if (!listRes.ok) {
            let body = '';
            try { body = await listRes.text(); } catch (_) {}
            throw new Error(`Không đọc được danh sách Gemini (HTTP ${listRes.status})${body ? ': ' + body.slice(0, 220) : ''}`);
        }
        const listData = await listRes.json();
        for (const model of (Array.isArray(listData.models) ? listData.models : [])) {
            const methods = Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
            const name = String(model.name || '').replace(/^models\//, '');
            if (methods.includes('generateContent') && kblIsGeneralGeminiFlash(name)) collected.push(name);
        }
        pageToken = String(listData.nextPageToken || '');
        guard += 1;
    } while (pageToken && guard < 10);

    const models = [...new Set(collected)].sort((a, b) => {
        const diff = kblGeminiModelRank(b) - kblGeminiModelRank(a);
        return diff || b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
    });
    if (!models.length) throw new Error('API key hiện tại không thấy model Gemini Flash nào hỗ trợ generateContent.');
    kblGeminiModelCache = { apiKeyTail, fetchedAt: now, models };
    return [...models];
}

async function callGeminiAIAutoModel(apiKey, parts) {
    const key = String(apiKey || '').trim();
    if (!key) throw new Error('Chưa có Gemini API Key.');

    let discovered = [];
    let discoverError = null;
    try {
        discovered = await kblDiscoverGeminiModels(key, false);
    } catch (error) {
        discoverError = error;
        console.warn('[KBL AI] Models API tạm lỗi:', error && error.message ? error.message : error);
    }

    let lastGoodModel = '';
    try { lastGoodModel = String(localStorage.getItem('kbl_gemini_last_good_model') || '').trim(); } catch (_) {}
    const candidateModels = discovered.length
        ? discovered
        : (lastGoodModel ? [lastGoodModel] : []);

    if (!candidateModels.length) {
        throw discoverError || new Error('Không tìm được Gemini Flash khả dụng cho API key hiện tại.');
    }

    let lastError = null;
    for (const model of candidateModels) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts }] })
            });
            const raw = await res.text();
            let data = null;
            try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = {}; }
            if (res.ok) {
                try { localStorage.setItem('kbl_gemini_last_good_model', model); } catch (_) {}
                return { success: true, data, usedModel: model };
            }

            const message = String(data?.error?.message || raw || `HTTP ${res.status}`);
            lastError = new Error(`Model [${model}] HTTP ${res.status}: ${message}`);
            // Sai API key / key bị chặn thì dừng ngay; lỗi model/quota thì thử model kế tiếp.
            if (/API_KEY_INVALID|API key not valid|invalid api key/i.test(message)) throw lastError;
        } catch (err) {
            lastError = err;
            if (/API_KEY_INVALID|API key not valid|invalid api key/i.test(String(err && err.message || ''))) throw err;
        }
    }

    // Cache có thể vừa cũ đúng lúc Google thay model. Ép hỏi lại Models API 1 lần rồi thử model mới chưa có ở pass đầu.
    if (discovered.length) {
        try {
            const refreshed = await kblDiscoverGeminiModels(key, true);
            const unseen = refreshed.filter(model => !candidateModels.includes(model));
            for (const model of unseen) {
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: [{ parts }] })
                    });
                    const raw = await res.text();
                    let data = null;
                    try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = {}; }
                    if (res.ok) {
                        try { localStorage.setItem('kbl_gemini_last_good_model', model); } catch (_) {}
                        return { success: true, data, usedModel: model };
                    }
                    lastError = new Error(`Model [${model}] HTTP ${res.status}: ${String(data?.error?.message || raw || '')}`);
                } catch (err) { lastError = err; }
            }
        } catch (_) {}
    }

    throw lastError || new Error('Không có Gemini Flash nào chạy được với API key hiện tại.');
}

// Cho iframe Cầm Đồ dùng chung đúng engine Auto-Latest + cùng API key của POS.
window.kblCallGeminiAIAutoModel = callGeminiAIAutoModel;
window.getKblGeminiApiKey = () => String(GEMINI_API_KEY || '').trim();

// -----------------------------------------------------------------
// THU MUA OCR (TAB 1)
// -----------------------------------------------------------------
function runOCR(side) {
    const fileInp = getEl(side === 'front' ? 'buy-file-front' : 'buy-file-back');
    if (!fileInp) return;
    
    // Ép bật cửa sổ chọn file
    if (!fileInp.files || !fileInp.files[0]) {
        fileInp.click();
        fileInp.onchange = () => runOCR(side);
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        const dataUrl = reader.result;
        processBuyOCRBase64(side, dataUrl);
        fileInp.value = ""; // dọn dẹp bộ nhớ thẻ input
    };
    reader.readAsDataURL(fileInp.files[0]);
}

async function processBuyOCRBase64(side, dataUrl) {
    if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === '') {
        alert("❌ Chưa có mã API Gemini!\n\nVui lòng qua Tab Cài đặt & AI để dán mã API vào rồi bấm LƯU CẤU HÌNH nhé.");
        return;
    }

    getEl('buy-ocr-status').innerText = "⏳ AI đang tự động phân tích ảnh...";
    getEl('buy-ocr-status').className = "ai-status-alert";

    try {
        const rawBase64 = dataUrl.split(',')[1];
        let mimeType = dataUrl.split(',')[0].split(':')[1].split(';')[0];
        if (mimeType.includes('jfif')) mimeType = 'image/jpeg';

        // Hiển thị ảnh đồng thời lên Preview cột trái & Phôi in A4 cột phải
        if (side === 'front') {
            const imgF = getEl('view-front');
            const a4ImgF = getEl('a4-img-front');
            if (imgF) { imgF.src = dataUrl; imgF.style.display = 'block'; }
            if (a4ImgF) { a4ImgF.src = dataUrl; a4ImgF.style.display = 'block'; }
        } else {
            const imgB = getEl('view-back');
            const a4ImgB = getEl('a4-img-back');
            if (imgB) { imgB.src = dataUrl; imgB.style.display = 'block'; }
            if (a4ImgB) { a4ImgB.src = dataUrl; a4ImgB.style.display = 'block'; }
        }

        let pt = side === 'front' 
            ? "Bóc tách CCCD: { \"soCCCD\": \"\", \"hoTen\": \"\", \"diaChi\": \"\" }. Trả về JSON thuần túy, không có markdown." 
            : "Mặt sau CCCD, tìm: { \"dateIssue\": \"YYYY-MM-DD\", \"diaChi\": \"\" }. Trả về JSON thuần túy, không có markdown.";

        const parts = [
            { text: pt },
            { inlineData: { mimeType: mimeType, data: rawBase64 } }
        ];

        const result = await callGeminiAIAutoModel(GEMINI_API_KEY, parts);
        const data = result.data;

        let rawText = data.candidates[0].content.parts[0].text;
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim(); 

        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("AI không tìm ra chữ trong ảnh");

        const parsed = JSON.parse(match[0]);

        if (side === 'front') {
            if (parsed.hoTen) {
                getEl('buy-name').value = parsed.hoTen;
                if (getEl('buy-bank-holder') && !getEl('buy-bank-holder').value) {
                    getEl('buy-bank-holder').value = parsed.hoTen.toUpperCase();
                }
            }
            if (parsed.soCCCD) getEl('buy-cccd').value = parsed.soCCCD;
            if (parsed.diaChi) getEl('buy-address').value = parsed.diaChi;
        } else {
            if (parsed.dateIssue) getEl('buy-date-issue').value = parsed.dateIssue;
            if (parsed.diaChi && parsed.diaChi.length > 5) getEl('buy-address').value = parsed.diaChi;
        }

        getEl('buy-ocr-status').innerText = `✨ Quét thành công! (Model: ${result.usedModel})`;
        getEl('buy-ocr-status').className = "ai-status-alert ai-status-success";
        syncBuyUI();
    } catch(e) { 
        getEl('buy-ocr-status').innerText = `❌ Lỗi: ${e.message}`; 
        getEl('buy-ocr-status').className = "ai-status-alert ai-status-error";
    }
}

// -----------------------------------------------------------------
// BÁN HÀNG OCR (TAB 3)
// -----------------------------------------------------------------
function runSaleOCR(side) {
    const fileInp = getEl(side === 'front' ? 's-file-front' : 's-file-back');
    if (!fileInp) return;
    
    // Ép bật hộp thoại chọn file nếu chưa chọn
    if (!fileInp.files || !fileInp.files[0]) {
        fileInp.click();
        fileInp.onchange = () => runSaleOCR(side);
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        const dataUrl = reader.result;
        processSaleOCRBase64(side, dataUrl);
        fileInp.value = "";
    };
    reader.readAsDataURL(fileInp.files[0]);
}

async function processSaleOCRBase64(side, dataUrl) {
    kblRememberSaleCccdImage(side, dataUrl);
    if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === '') {
        alert("❌ Chưa có mã API Gemini!\n\nVui lòng qua Tab Cài đặt & AI để lưu mã API trước.");
        return;
    }

    const status = getEl('s-ocr-status');
    if (status) {
        status.innerText = "⏳ AI đang đọc CCCD để điền thông tin hóa đơn...";
        status.className = "ai-status-alert";
    }

    try {
        const rawBase64 = dataUrl.split(',')[1];
        let mimeType = dataUrl.split(',')[0].split(':')[1].split(';')[0];
        if (mimeType.includes('jfif')) mimeType = 'image/jpeg';

        const prompt = side === 'front'
            ? 'Đây là ảnh mặt trước CCCD Việt Nam. Bóc tách chính xác và trả về duy nhất JSON thuần túy dạng {"hoTen":"","soCCCD":"","diaChi":"","soDienThoai":""}. Nếu số điện thoại không có trên ảnh thì để chuỗi rỗng. Không thêm markdown.'
            : 'Đây là ảnh mặt sau CCCD Việt Nam. Bóc tách địa chỉ thường trú/quê quán và số điện thoại nếu có. Trả về duy nhất JSON thuần túy dạng {"diaChi":"","soDienThoai":""}. Nếu không thấy thì để chuỗi rỗng. Không thêm markdown.';
        
        const result = await callGeminiAIAutoModel(GEMINI_API_KEY, [
            { text: prompt },
            { inlineData: { mimeType, data: rawBase64 } }
        ]);

        const rawText = String(result.data?.candidates?.[0]?.content?.parts?.[0]?.text || '')
            .replace(/```json/g, '').replace(/```/g, '').trim();
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('AI không tìm thấy dữ liệu CCCD.');
        const parsed = JSON.parse(match[0]);

        const name = parsed.hoTen || parsed.fullName || parsed.name || '';
        const cccd = parsed.soCCCD || parsed.cccd || parsed.idNumber || '';
        const address = parsed.diaChi || parsed.address || parsed.diaChiCuTru || '';
        const phone = parsed.soDienThoai || parsed.phone || parsed.mobile || '';
        
        if (name && getEl('s-cus-name')) getEl('s-cus-name').value = name;
        if (cccd && getEl('s-cus-cccd')) getEl('s-cus-cccd').value = cccd;
        if (address && getEl('s-cus-address')) getEl('s-cus-address').value = address;
        if (phone && getEl('s-cus-phone')) getEl('s-cus-phone').value = phone;

        if (status) {
            status.innerText = `✨ Quét CCCD thành công! (Model: ${result.usedModel})`;
            status.className = "ai-status-alert ai-status-success";
        }
        calcSellMath();
    } catch (error) {
        if (status) {
            status.innerText = `❌ Lỗi quét CCCD: ${error.message || error}`;
            status.className = "ai-status-alert ai-status-error";
        }
    }
}

// =================================================================
// 5. TAB 1: THU MUA & ĐỒNG BỘ PHÔI A4 3 LIÊN & TÌM KIẾM
// =================================================================

// 🔍 5.1. THANH TÌM NHANH KHÁCH HÀNG CŨ (BƯỚC 2)
function searchCustomerQuick() {
    const searchInp = getEl('buy-customer-quick-search');
    const resultsBox = getEl('buy-customer-search-results');
    if (!searchInp || !resultsBox) return;

    const q = searchInp.value.toLowerCase().trim();
    if (!q) {
        resultsBox.style.display = 'none';
        resultsBox.innerHTML = '';
        return;
    }

    const seen = new Set();
    const matched = [];

    for (const r of dataStoreRecords) {
        const name = (r.name || '').toLowerCase();
        const cccd = (r.cccd || '').toLowerCase();
        const phone = (r.phone || '').toLowerCase();

        if (name.includes(q) || cccd.includes(q) || phone.includes(q)) {
            const uniqueKey = r.cccd ? `cccd_${r.cccd}` : (r.phone ? `phone_${r.phone}` : `name_${r.name}`);
            if (!seen.has(uniqueKey)) {
                seen.add(uniqueKey);
                matched.push(r);
            }
        }
        if (matched.length >= 8) break;
    }

    if (matched.length === 0) {
        resultsBox.innerHTML = '<div style="padding: 8px 12px; color: #888; font-size: 13px;">Không tìm thấy thông tin khách hàng cũ phù hợp.</div>';
        resultsBox.style.display = 'block';
        return;
    }

    resultsBox.innerHTML = matched.map(c => `
        <div style="padding: 8px 12px; border-bottom: 1px solid #eee; cursor: pointer; text-align: left; background: #fff;" 
             onmouseover="this.style.background='#f0f7ff'" 
             onmouseout="this.style.background='#fff'" 
             onclick="selectCustomerQuick('${c.id}')">
            <div style="font-weight: bold; color: #0b2240; font-size: 13px;">👤 ${c.name || 'Khách hàng'}</div>
            <div style="font-size: 11px; color: #555; margin-top: 2px;">
                <span>📞 SĐT: <b>${c.phone || '---'}</b></span> &nbsp;|&nbsp; 
                <span>🆔 CCCD: <b>${c.cccd || '---'}</b></span>
            </div>
            ${c.address ? `<div style="font-size: 11px; color: #777; margin-top: 1px;">🏠 ${c.address}</div>` : ''}
        </div>
    `).join('');

    resultsBox.style.display = 'block';
}

function selectCustomerQuick(recordId) {
    reuseCustomerInfo(recordId);
    const searchInp = getEl('buy-customer-quick-search');
    const resultsBox = getEl('buy-customer-search-results');
    if (searchInp) searchInp.value = '';
    if (resultsBox) {
        resultsBox.style.display = 'none';
        resultsBox.innerHTML = '';
    }
}

// 🔍 5.2. LỌC BẢNG LỊCH SỬ THU MUA REAL-TIME
function filterBuyHistoryTable() {
    const searchInp = getEl('buy-history-search');
    const query = searchInp ? searchInp.value.toLowerCase().trim() : '';
    compileBuyTable(query);
}

function numberValue(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}

// =================================================================
// KBL WEIGHT PRECISION FIX 2026-08-26
// Cân hiện tại phát tới 4 số lẻ theo LƯỢNG => cần giữ tối thiểu 0.1 LY.
// Mọi phép cộng/trừ trọng lượng trong POS dùng 0.1 ly, chỉ tiền mới làm tròn VND.
// =================================================================
const KBL_WEIGHT_LY_SCALE = 10; // 10 đơn vị nội bộ = 1 ly => độ phân giải 0.1 ly.

function roundWeightLy(value) {
    const n = numberValue(value);
    return Math.round(n * KBL_WEIGHT_LY_SCALE) / KBL_WEIGHT_LY_SCALE;
}

function weightPartsToLy(luong, chi, phan, ly) {
    return Math.max(0, roundWeightLy(
        numberValue(luong) * 1000
        + numberValue(chi) * 100
        + numberValue(phan) * 10
        + numberValue(ly)
    ));
}

function splitWeightLyParts(lyValue) {
    // Quy về 0.1 ly trước rồi phân tách bằng số nguyên để tránh lỗi float 7.699999...
    let tenthLy = Math.max(0, Math.round(numberValue(lyValue) * 10));
    const luong = Math.floor(tenthLy / 10000);
    tenthLy -= luong * 10000;
    const chi = Math.floor(tenthLy / 1000);
    tenthLy -= chi * 1000;
    const phan = Math.floor(tenthLy / 100);
    tenthLy -= phan * 100;
    const ly = tenthLy / 10;
    return [luong, chi, phan, ly];
}

function formatWeightLy(value) {
    const n = roundWeightLy(value);
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function calculateMainBuyMath() {
    const gl = numberValue(getEl('b-w-l') ? getEl('b-w-l').value : 0);
    const gc = numberValue(getEl('b-w-c') ? getEl('b-w-c').value : 0);
    const gp = numberValue(getEl('b-w-p') ? getEl('b-w-p').value : 0);
    const gy = numberValue(getEl('b-w-y') ? getEl('b-w-y').value : 0);
    const grossLy = weightPartsToLy(gl, gc, gp, gy);

    const dl = numberValue(getEl('b-g-l') ? getEl('b-g-l').value : 0);
    const dc = numberValue(getEl('b-g-c') ? getEl('b-g-c').value : 0);
    const dp = numberValue(getEl('b-g-p') ? getEl('b-g-p').value : 0);
    const dy = numberValue(getEl('b-g-y') ? getEl('b-g-y').value : 0);
    const gemLy = weightPartsToLy(dl, dc, dp, dy);

    const netLy = Math.max(0, roundWeightLy(grossLy - gemLy));
    const price = numberValue(getEl('buy-price') ? getEl('buy-price').value : 0);
    const fee = numberValue(getEl('buy-fee') ? getEl('buy-fee').value : 0);
    const totalVND = Math.round((netLy / 100) * price) + fee;
    return { grossLy, gemLy, netLy, price, fee, totalVND };
}

function weightTextFromLy(netLy) {
    return `${(numberValue(netLy) / 100).toFixed(3)} chỉ (~ ${lyToText(numberValue(netLy))})`;
}

function setWeightInputs(prefix, lyValue) {
    const values = splitWeightLyParts(lyValue);
    ['l', 'c', 'p', 'y'].forEach((part, index) => {
        const el = getEl(`${prefix}-${part}`);
        if (el) el.value = values[index];
    });
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function a4ManualValue(key, fallback) {
    return Object.prototype.hasOwnProperty.call(a4ManualEdits, key)
        ? a4ManualEdits[key]
        : fallback;
}

function setA4ManualEdit(key, value) {
    if (!key) return;
    a4ManualEdits[key] = String(value == null ? '' : value)
        .replace(/\u00a0/g, ' ')
        .replace(/\s+\n/g, '\n')
        .trim();
}

function findA4Editable(key, root = document) {
    if (!root || !root.querySelectorAll) return null;
    return Array.from(root.querySelectorAll('[contenteditable="true"][data-a4-edit-key]'))
        .find(el => el.dataset.a4EditKey === key) || null;
}

function bindA4Editing(root = document) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[contenteditable="true"][data-a4-edit-key]').forEach(el => {
        if (el.dataset.a4Bound === '1') return;
        el.dataset.a4Bound = '1';
        const save = () => setA4ManualEdit(el.dataset.a4EditKey, el.innerText);
        el.addEventListener('input', save);
        el.addEventListener('blur', save);
    });
}

function clearA4ManualEdits() {
    a4ManualEdits = {};
}

function readExtraPurchaseItems() {
    const container = getEl('buy-extra-items');
    if (!container) return [];

    return Array.from(container.querySelectorAll('.buy-extra-item')).map((row, index) => {
        const read = (field) => row.querySelector(`[data-field="${field}"]`);
        const goods = read('goods') ? read('goods').value.trim() : '';
        const goldType = read('goldType') ? read('goldType').value : '9999';
        const grossLy = Math.max(0, roundWeightLy(numberValue(read('grossLy') ? read('grossLy').value : 0)));
        const gemLy = Math.max(0, roundWeightLy(numberValue(read('gemLy') ? read('gemLy').value : 0)));
        const netLy = Math.max(0, roundWeightLy(numberValue(read('netLy') ? read('netLy').value : 0)));
        const price = numberValue(read('price') ? read('price').value : 0);
        const fee = numberValue(read('fee') ? read('fee').value : 0);
        const hasValue = Boolean(goods || netLy || price || fee);

        return {
            goods: goods || `Món ${index + 2}`,
            goldType: goldType || '9999',
            grossLy: grossLy || netLy,
            gemLy,
            netLy,
            weightText: weightTextFromLy(netLy),
            price,
            fee,
            totalVND: Math.round((netLy / 100) * price) + fee,
            hasName: Boolean(goods),
            hasValue
        };
    });
}

function getPurchaseItems() {
    const mainMath = calculateMainBuyMath();
    const mainGoods = getEl('buy-goods') ? getEl('buy-goods').value.trim() : '';
    const mainType = getEl('buy-gold-type') ? getEl('buy-gold-type').value : '9999';
    const mainItem = {
        goods: mainGoods || 'Vàng trang sức cũ',
        goldType: mainType || '9999',
        grossLy: mainMath.grossLy,
        gemLy: mainMath.gemLy,
        netLy: mainMath.netLy,
        weightText: weightTextFromLy(mainMath.netLy),
        price: mainMath.price,
        fee: mainMath.fee,
        totalVND: mainMath.totalVND,
        hasValue: true
    };

    const extraItems = readExtraPurchaseItems().filter(item => item.hasValue);
    const mainDraftHasInput = Boolean(
        mainGoods ||
        mainMath.grossLy > 0 ||
        mainMath.gemLy > 0 ||
        mainMath.price > 0 ||
        mainMath.fee > 0
    );

    if (purchaseItemsCommittedFirst) {
        const committedItems = extraItems.concat(mainDraftHasInput ? [mainItem] : []);
        return committedItems.length ? committedItems : [mainItem];
    }

    return [mainItem].concat(extraItems);
}

function purchaseItemsSummary(items) {
    return items.map(item => item.goods).filter(Boolean).join('; ');
}

function purchaseTypesSummary(items) {
    return Array.from(new Set(items.map(item => item.goldType).filter(Boolean))).join(', ');
}

function goldTypeLabel(value) {
    const labels = {
        '9999': 'Vàng 24K (999.9)',
        '980': 'Vàng 980',
        '610': 'Vàng Tây (610)'
    };
    const key = String(value || '').trim();
    return labels[key] || key || 'Chưa xác định';
}

function purchaseTotalWeightText(items) {
    const totalLy = items.reduce((sum, item) => sum + numberValue(item.netLy), 0);
    return weightTextFromLy(totalLy);
}

function renderPurchaseItems() {
    const tbody = getEl('a4-item-rows');
    if (!tbody) return;

    if (getEl('buy-extra-items')) {
        getEl('buy-extra-items').querySelectorAll('.buy-extra-item').forEach(updateExtraItemTotal);
    }
    const extraItems = readExtraPurchaseItems().filter(item => item.hasValue);
    const items = getPurchaseItems();
    const count = Math.max(1, items.length);
    const table = tbody.closest('table');
    if (table) table.classList.toggle('a4-multi-table', count > 1);

    const editor = getEl('multi-purchase-editor');
    const countLabel = getEl('extra-item-count');
    if (editor) editor.style.display = extraItems.length ? 'block' : 'none';
    if (countLabel) countLabel.innerText = extraItems.length
        ? `${extraItems.length} món đã chốt`
        : '';

    const date = getEl('a4-date') ? getEl('a4-date').innerText : '';
    const name = getEl('buy-name') ? getEl('buy-name').value.trim().toUpperCase() : '';
    const cccd = getEl('buy-cccd') ? getEl('buy-cccd').value : '';
    const phone = getEl('buy-phone') ? getEl('buy-phone').value : '';
    const address = getEl('buy-address') ? getEl('buy-address').value : '';
    const totalMoney = items.reduce((sum, item) => sum + numberValue(item.totalVND), 0);
    const totalWeightText = purchaseTotalWeightText(items);
    const goodsSummary = purchaseItemsSummary(items);
    const typeSummary = purchaseTypesSummary(items);

    tbody.innerHTML = items.map((item, index) => {
        const firstRow = index === 0;
        const sellerName = a4ManualValue('seller.name', name);
        const sellerAddress = a4ManualValue('seller.address', address);
        const sellerCccd = a4ManualValue('seller.cccd', cccd);
        const sellerPhone = a4ManualValue('seller.phone', phone || 'khách không cung cấp');
        const goodsText = a4ManualValue(`item.${index}.goods`, `${item.goods} (${item.goldType})`);
        const weightText = a4ManualValue(`item.${index}.weight`, item.weightText);
        const priceText = a4ManualValue(`item.${index}.price`, formatVND(item.price));
        const totalText = a4ManualValue(`item.${index}.total`, formatVND(item.totalVND));
        const noteText = a4ManualValue(`item.${index}.note`, '');
        const sellerCells = firstRow ? `
            <td id="a4-name" rowspan="${count}" contenteditable="true" data-a4-edit-key="seller.name" spellcheck="false" title="Bấm vào để sửa" style="font-weight: bold; text-transform: uppercase;">${escapeHtml(sellerName)}</td>
            <td id="a4-address" rowspan="${count}" contenteditable="true" data-a4-edit-key="seller.address" spellcheck="false" title="Bấm vào để sửa" style="text-align: left; font-size: 11px;">${escapeHtml(sellerAddress)}</td>
            <td id="a4-cccd" rowspan="${count}" contenteditable="true" data-a4-edit-key="seller.cccd" spellcheck="false" title="Bấm vào để sửa">${escapeHtml(sellerCccd)}</td>
            <td id="a4-phone" rowspan="${count}" contenteditable="true" data-a4-edit-key="seller.phone" spellcheck="false" title="Bấm vào để sửa">${escapeHtml(sellerPhone)}</td>` : '';
        return `
            <tr class="a4-item-row">
                <td>${index + 1}</td>
                <td${firstRow ? ' id="a4-row-date"' : ''}>${escapeHtml(date)}</td>
                ${sellerCells}
                <td${firstRow ? ' id="a4-goods"' : ''} contenteditable="true" data-a4-edit-key="item.${index}.goods" spellcheck="false" title="Bấm vào để sửa">${escapeHtml(goodsText)}</td>
                <td${firstRow ? ' id="a4-weight"' : ''} contenteditable="true" data-a4-edit-key="item.${index}.weight" spellcheck="false" title="Bấm vào để sửa" style="font-weight: bold; color: #b78a00;">${escapeHtml(weightText)}</td>
                <td${firstRow ? ' id="a4-price"' : ''} contenteditable="true" data-a4-edit-key="item.${index}.price" spellcheck="false" title="Bấm vào để sửa">${escapeHtml(priceText)}</td>
                <td${firstRow ? ' id="a4-total"' : ''} contenteditable="true" data-a4-edit-key="item.${index}.total" spellcheck="false" title="Bấm vào để sửa" style="font-weight: bold; color: #d00;">${escapeHtml(totalText)}</td>
                <td contenteditable="true" data-a4-edit-key="item.${index}.note" spellcheck="false" title="Bấm vào để sửa">${escapeHtml(noteText)}</td>
            </tr>`;
    }).join('');

    bindA4Editing(document);

    if (getEl('a4-grand-total')) getEl('a4-grand-total').innerText = formatVND(totalMoney);
    if (getEl('buy-total-money')) getEl('buy-total-money').value = formatVND(totalMoney);

    if (getEl('gd-goods')) getEl('gd-goods').innerText = goodsSummary;
    if (getEl('gd-weight')) getEl('gd-weight').innerText = totalWeightText;
    if (getEl('gd-total')) getEl('gd-total').innerText = formatVND(totalMoney);
    if (getEl('gd-money-word')) getEl('gd-money-word').innerText = dichSoThanhChu(totalMoney);

    if (getEl('nk-goods')) getEl('nk-goods').innerText = goodsSummary;
    if (getEl('nk-type')) getEl('nk-type').innerText = typeSummary;
    if (getEl('nk-weight')) getEl('nk-weight').innerText = totalWeightText;
    if (getEl('nk-total')) getEl('nk-total').innerText = formatVND(totalMoney);

    const nkRows = getEl('nk-item-rows');
    if (nkRows) {
        nkRows.innerHTML = items.map((item, index) => {
            const firstRow = index === 0;
            return `
                <tr>
                    <td>${index + 1}</td>
                    <td${firstRow ? ' id="nk-goods"' : ''}>${escapeHtml(item.goods || 'Vàng trang sức cũ')}</td>
                    <td${firstRow ? ' id="nk-type"' : ''}>${escapeHtml(item.goldType || '9999')}</td>
                    <td${firstRow ? ' id="nk-weight"' : ''}>${escapeHtml(item.weightText || weightTextFromLy(item.netLy))}</td>
                    <td${firstRow ? ' id="nk-price"' : ''}>${escapeHtml(formatVND(item.price || 0))}</td>
                    <td${firstRow ? ' id="nk-total"' : ''} style="color: #d00;">${escapeHtml(formatVND(item.totalVND || 0))}</td>
                </tr>`;
        }).join('');
    }

    if (getEl('nk-grand-weight')) getEl('nk-grand-weight').innerText = totalWeightText;
    if (getEl('nk-grand-total')) getEl('nk-grand-total').innerText = formatVND(totalMoney);
    if (getEl('nk-total-words')) getEl('nk-total-words').innerText = dichSoThanhChu(totalMoney);
}

function addPurchaseItem(item = null) {
    const container = getEl('buy-extra-items');
    if (!container) return;
    const isSnapshotFromMainForm = !item;
    const wasCommittedFirst = purchaseItemsCommittedFirst;
    let itemData = item;

    if (isSnapshotFromMainForm) {
        const math = calculateMainBuyMath();
        const goods = getEl('buy-goods') ? getEl('buy-goods').value.trim() : '';
        const goldType = getEl('buy-gold-type') ? getEl('buy-gold-type').value : '9999';
        const price = getEl('buy-price') ? numberValue(getEl('buy-price').value) : 0;
        const fee = getEl('buy-fee') ? numberValue(getEl('buy-fee').value) : 0;
        const isDefaultEmptyItem = !goods || goods === 'Vàng trang sức cũ';

        if (math.netLy <= 0 && fee <= 0 && isDefaultEmptyItem) {
            return alert('Vui lòng nhập tên hoặc cân trọng lượng món hiện tại trước khi thêm món.');
        }

        itemData = {
            goods: goods || 'Vàng trang sức cũ',
            goldType: goldType || '9999',
            grossLy: math.grossLy,
            gemLy: math.gemLy,
            netLy: math.netLy,
            weightText: weightTextFromLy(math.netLy),
            price,
            fee,
            totalVND: math.totalVND,
            hasValue: true
        };
        purchaseItemsCommittedFirst = true;
    }

    const currentType = getEl('buy-gold-type') ? getEl('buy-gold-type').value : '9999';
    const currentPrice = getEl('buy-price') ? getEl('buy-price').value : 0;
    const hadExistingExtraItems = container.querySelectorAll('.buy-extra-item').length > 0;
    const row = document.createElement('div');
    row.className = 'buy-extra-item';
    row.innerHTML = `
        <div>
            <label>Tên món hàng</label>
            <input type="text" class="form-control" data-field="goods" value="${escapeHtml(itemData && itemData.goods ? itemData.goods : '')}" placeholder="Ví dụ: Nhẫn vàng">
        </div>
        <div>
            <label>Loại vàng</label>
            <select class="form-control" data-field="goldType">
                <option value="9999">Vàng 24K (999.9)</option>
                <option value="980">Vàng 980</option>
                <option value="610">Vàng Tây (610)</option>
            </select>
        </div>
        <div>
            <label>TL thực (ly)</label>
            <input type="number" min="0" step="0.1" class="form-control" data-field="netLy" value="${itemData ? numberValue(itemData.netLy) : 0}" placeholder="100">
        </div>
        <div>
            <label>Đơn giá/chỉ</label>
            <input type="number" min="0" step="1" class="form-control" data-field="price" value="${itemData ? numberValue(itemData.price) : escapeHtml(currentPrice)}">
        </div>
        <div>
            <label>Phí thêm</label>
            <input type="number" min="0" step="1" class="form-control" data-field="fee" value="${itemData ? numberValue(itemData.fee) : 0}">
        </div>
        <div>
            <label>Thành tiền</label>
            <input type="text" class="form-control" data-field="total" readonly value="0 ₫">
        </div>
        <input type="hidden" data-field="grossLy" value="${itemData ? numberValue(itemData.grossLy != null ? itemData.grossLy : itemData.netLy) : 0}">
        <input type="hidden" data-field="gemLy" value="${itemData ? numberValue(itemData.gemLy) : 0}">
        <button type="button" class="remove-extra-item" title="Xóa món này">× XÓA MÓN</button>`;

    const typeSelect = row.querySelector('[data-field="goldType"]');
    if (typeSelect) {
        typeSelect.value = (itemData && itemData.goldType) || currentType || '9999';
        typeSelect.addEventListener('change', () => {
            if (activeExchangeLinkDraft && !activeExchangeLinkDraft.purchaseRecordId) {
                const priceInput = row.querySelector('[data-field="price"]');
                if (priceInput) priceInput.value = numberValue(settingsStore[`price_buy_${String(typeSelect.value || '9999')}`]);
                updateExtraItemTotal(row);
            }
        });
    }
    row.querySelector('.remove-extra-item').addEventListener('click', () => {
        row.remove();
        renderPurchaseItems();
    });
    row.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', renderPurchaseItems);
        input.addEventListener('change', renderPurchaseItems);
    });
    
    if (isSnapshotFromMainForm && hadExistingExtraItems && !wasCommittedFirst) {
        container.insertBefore(row, container.firstElementChild);
    } else {
        container.appendChild(row);
    }
    updateExtraItemTotal(row);

    if (isSnapshotFromMainForm) resetMainPurchaseDraft();
    renderPurchaseItems();
}

function resetMainPurchaseDraft() {
    ['b-w-l', 'b-w-c', 'b-w-p', 'b-w-y', 'b-g-l', 'b-g-c', 'b-g-p', 'b-g-y'].forEach(id => {
        const el = getEl(id);
        if (el) el.value = 0;
    });

    if (getEl('buy-goods')) getEl('buy-goods').value = '';
    if (getEl('buy-gold-type')) getEl('buy-gold-type').value = activeExchangeLinkDraft?.mode === 'doikbl' ? '610' : '9999';
    if (getEl('buy-price')) {
        const currentType = getEl('buy-gold-type') ? getEl('buy-gold-type').value : '9999';
        getEl('buy-price').value = activeExchangeLinkDraft && !activeExchangeLinkDraft.purchaseRecordId
            ? numberValue(settingsStore[`price_buy_${currentType}`])
            : 0;
    }
    if (getEl('buy-fee')) getEl('buy-fee').value = 0;
    currentBuyMath = { grossLy: 0, gemLy: 0, netLy: 0, price: 0, fee: 0, totalVND: 0 };
    calcBuyMath();
}

function removePurchaseItem(button) {
    const row = button && button.closest ? button.closest('.buy-extra-item') : null;
    if (row) row.remove();
    renderPurchaseItems();
}

function updateExtraItemTotal(row) {
    if (!row) return;
    const read = (field) => row.querySelector(`[data-field="${field}"]`);
    const netLy = numberValue(read('netLy') ? read('netLy').value : 0);
    const price = numberValue(read('price') ? read('price').value : 0);
    const fee = numberValue(read('fee') ? read('fee').value : 0);
    const total = Math.round((netLy / 100) * price) + fee;
    if (read('total')) read('total').value = formatVND(total);
}

function resetPurchaseItems() {
    const container = getEl('buy-extra-items');
    if (container) container.innerHTML = '';
    purchaseItemsCommittedFirst = false;
    renderPurchaseItems();
}

function loadPurchaseItemsIntoEditor(items) {
    if (!Array.isArray(items) || !items.length) return;
    purchaseItemsLoading = true;
    const first = items[0];
    if (getEl('buy-goods')) getEl('buy-goods').value = first.goods || 'Vàng trang sức cũ';
    if (getEl('buy-gold-type')) getEl('buy-gold-type').value = first.goldType || '9999';
    if (getEl('buy-price')) getEl('buy-price').value = numberValue(first.price);
    if (getEl('buy-fee')) getEl('buy-fee').value = numberValue(first.fee);
    setWeightInputs('b-w', first.grossLy != null ? first.grossLy : first.netLy);
    setWeightInputs('b-g', first.gemLy || 0);

    const container = getEl('buy-extra-items');
    if (container) container.innerHTML = '';
    items.slice(1).forEach(item => addPurchaseItem(item));
    purchaseItemsLoading = false;
    syncBuyUI();
}

function normalizeStoredPurchaseItems(record) {
    if (record && Array.isArray(record.items) && record.items.length) {
        return record.items.map(item => ({
            goods: item.goods || item.name || 'Vàng trang sức cũ',
            goldType: item.goldType || item.type || '9999',
            grossLy: numberValue(item.grossLy != null ? item.grossLy : item.netLy),
            gemLy: numberValue(item.gemLy),
            netLy: numberValue(item.netLy),
            weightText: item.weightText || weightTextFromLy(item.netLy),
            price: numberValue(item.price),
            fee: numberValue(item.fee),
            totalVND: numberValue(item.totalVND != null ? item.totalVND : (item.money != null ? item.money : item.total))
        }));
    }
    return [{
        goods: (record && record.goods) || 'Vàng trang sức cũ',
        goldType: (record && record.goldType) || '9999',
        grossLy: numberValue(record && record.netLy),
        gemLy: 0,
        netLy: numberValue(record && record.netLy),
        weightText: (record && record.weightText) || weightTextFromLy(record && record.netLy),
        price: numberValue(record && record.price),
        fee: numberValue(record && record.fee),
        totalVND: numberValue(record && (record.money != null ? record.money : record.totalMoney))
    }];
}

function syncBuyUI() {
    const t = getEl('buy-gold-type') ? getEl('buy-gold-type').value : '9999';
    const name = getEl('buy-name') ? getEl('buy-name').value.trim() : '';
    const upperName = name.toUpperCase();
    const cccd = getEl('buy-cccd') ? getEl('buy-cccd').value : '';
    const phone = getEl('buy-phone') ? getEl('buy-phone').value : '';
    const address = getEl('buy-address') ? getEl('buy-address').value : '';
    const goods = getEl('buy-goods') ? getEl('buy-goods').value : 'Vàng trang sức cũ';
    const payMethod = getEl('buy-pay-method') ? getEl('buy-pay-method').value : 'tien_mat';
    const bankName = getEl('buy-bank-name') ? getEl('buy-bank-name').value.trim() : '';
    const bankAcc = getEl('buy-bank-acc') ? getEl('buy-bank-acc').value.trim() : '';
    let bankHolder = getEl('buy-bank-holder') ? getEl('buy-bank-holder').value.trim() : '';

    if (!bankHolder && upperName) {
        bankHolder = upperName;
    }

    if (getEl('buy-price')) {
        // Giá mua vào chỉ là giá gợi ý ban đầu; người dùng có thể chỉnh như phiếu Thu Mua bình thường.
        // Không khóa cứng giá khi đây là hồ sơ Đổi Ngang / Đổi Bù.
        if (!getEl('buy-price').value || getEl('buy-price').value == 0) {
            getEl('buy-price').value = settingsStore[`price_buy_${t}`] || 0;
        }
    }

    // 1. Đồng bộ vào Bảng Kê 02 (Phần 1)
    if (getEl('a4-name')) getEl('a4-name').innerText = upperName;
    if (getEl('a4-cccd')) getEl('a4-cccd').innerText = cccd;
    if (getEl('a4-phone')) getEl('a4-phone').innerText = phone;
    if (getEl('a4-address')) getEl('a4-address').innerText = address;
    if (getEl('a4-goods')) getEl('a4-goods').innerText = `${goods} (${t})`;

    // 2. Đồng bộ vào Giấy Đề Nghị Bán Vàng (Phần 2)
    if (getEl('gd-name')) getEl('gd-name').innerText = upperName;
    if (getEl('gd-address')) getEl('gd-address').innerText = address;
    if (getEl('gd-cccd')) getEl('gd-cccd').innerText = cccd;
    if (getEl('gd-phone')) getEl('gd-phone').innerText = phone ? phone : "khách không cung cấp";
    if (getEl('gd-goods')) getEl('gd-goods').innerText = goods;

    if (getEl('gd-pay-method-display')) {
        if (payMethod === 'chuyen_khoan') {
            getEl('gd-pay-method-display').innerHTML = `☐ Tiền mặt &nbsp;&nbsp;&nbsp; <b>☑ Chuyển khoản</b>`;
        } else {
            getEl('gd-pay-method-display').innerHTML = `<b>☑ Tiền mặt</b> &nbsp;&nbsp;&nbsp; ☐ Chuyển khoản`;
        }
    }

    if (getEl('gd-bank-agency')) getEl('gd-bank-agency').innerText = bankName;
    if (getEl('gd-bank-acc')) getEl('gd-bank-acc').innerText = bankAcc;
    if (getEl('gd-bank-holder')) getEl('gd-bank-holder').innerText = bankHolder.toUpperCase();

    // 3. Đồng bộ vào Phiếu Nhập Kho Nội Bộ (Phần 3)
    if (getEl('nk-name')) getEl('nk-name').innerText = upperName;
    if (getEl('nk-goods')) getEl('nk-goods').innerText = goods;
    if (getEl('nk-type')) getEl('nk-type').innerText = t;
    setDraftNKCode(false);

    calcBuyMath();
}

function calcBuyMath() {
    const math = calculateMainBuyMath();
    const { grossLy, gemLy, netLy, price, fee, totalVND } = math;
    if (getEl('lbl-buy-gross-ly')) getEl('lbl-buy-gross-ly').innerText = `${grossLy} ly`;
    if (getEl('lbl-buy-gem-ly')) getEl('lbl-buy-gem-ly').innerText = `${gemLy} ly`;
    const weightStr = weightTextFromLy(netLy);
    if (getEl('lbl-buy-net-ly')) getEl('lbl-buy-net-ly').innerText = `${netLy} ly`;
    if (getEl('buy-net-display')) getEl('buy-net-display').innerText = weightStr;

    if (getEl('a4-weight')) getEl('a4-weight').innerText = weightStr;
    if (getEl('a4-price')) getEl('a4-price').innerText = formatVND(price);
    if (getEl('a4-total')) getEl('a4-total').innerText = formatVND(totalVND);

    if (getEl('gd-weight')) getEl('gd-weight').innerText = weightStr;
    if (getEl('gd-total')) getEl('gd-total').innerText = formatVND(totalVND);
    if (getEl('gd-money-word')) getEl('gd-money-word').innerText = `${dichSoThanhChu(totalVND)}`;

    if (getEl('nk-weight')) getEl('nk-weight').innerText = weightStr;
    if (getEl('nk-total')) getEl('nk-total').innerText = formatVND(totalVND);

    currentBuyMath = math;
    renderPurchaseItems();
    return math;
}


function purchaseRecordDateParts(record) {
    const display = String(record && record.dateStr || '').trim();
    let match = display.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
        return {
            day: String(match[1]).padStart(2, '0'),
            month: String(match[2]).padStart(2, '0'),
            year: String(match[3]),
            display: `${String(match[1]).padStart(2, '0')}/${String(match[2]).padStart(2, '0')}/${match[3]}`
        };
    }
    const raw = String(record && record.rawDate || '').trim();
    const date = raw ? new Date(raw) : null;
    if (date && !Number.isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = String(date.getFullYear());
        return { day, month, year, display: `${day}/${month}/${year}` };
    }
    return null;
}

function applyPurchaseLockedDate() {
    if (!activePurchaseEditId || !activePurchaseLockedDate) return false;
    const match = activePurchaseLockedDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return false;
    const day = match[1], month = match[2], year = match[3];

    document.querySelectorAll('.lbl-real-day').forEach(el => el.innerText = day);
    document.querySelectorAll('.lbl-real-month').forEach(el => el.innerText = month);
    document.querySelectorAll('.lbl-real-year').forEach(el => el.innerText = year);
    ['a4-date', 'a4-row-date', 'gd-date', 'nk-date'].forEach(id => {
        const el = getEl(id);
        if (el) el.innerText = activePurchaseLockedDate;
    });
    return true;
}

function updatePurchaseSaveButton() {
    const button = getEl('buy-save-record-btn');
    if (!button) return;
    if (activePurchaseEditId) {
        button.textContent = `💾 CẬP NHẬT ${activePurchaseEditId} · GIỮ NGUYÊN NGÀY`;
        button.title = 'Cập nhật đúng phiếu cũ; ngày lập, mã phiếu và mã nhập kho không thay đổi.';
    } else {
        button.textContent = '💾 LƯU PHIẾU';
        button.title = '';
    }
}

function clearPurchaseEditMode() {
    activePurchaseEditId = '';
    activePurchaseLockedDate = '';
    updatePurchaseSaveButton();
}

function setPurchaseEditMode(record) {
    if (!record || !record.id) return false;
    const parts = purchaseRecordDateParts(record);
    activePurchaseEditId = String(record.id);
    activePurchaseLockedDate = parts ? parts.display : String(record.dateStr || '');
    updatePurchaseSaveButton();
    applyPurchaseLockedDate();
    return true;
}

function editPurchaseRecord(recordId) {
    const record = dataStoreRecords.find(r => String(r.id) === String(recordId));
    if (!record) return alert('Không tìm thấy phiếu cần sửa.');

    // Dùng đúng luồng nạp phiếu cũ hiện hữu, sau đó mới bật cờ cập nhật.
    viewOldPurchaseRecord(recordId);
    setPurchaseEditMode(record);
    applyPurchaseLockedDate();

    const linkedBatch = chanhBatches.find(batch => (batch.sourceLots || []).some(lot => String(lot.recordId) === String(record.id)));
    const extra = linkedBatch
        ? `\n\nLưu ý: phiếu này đã được dùng trong batch ${linkedBatch.id}. Việc sửa phiếu gốc KHÔNG tự viết lại snapshot giá vốn của batch chành đã lưu.`
        : '';
    alert(`✏️ Đang sửa phiếu [${record.id}].\nNgày lập ${activePurchaseLockedDate || record.dateStr || ''} đã khóa và sẽ được giữ nguyên khi cập nhật.${extra}`);
}

function commitCurrentTransactionToDatabase() {
    const name = getEl('buy-name').value.trim();
    if (!name) return alert("Cần nhập tên người bán!");
    if (activeExchangeLinkDraft?.purchaseRecordId && !activePurchaseEditId) {
        return alert(`Hồ sơ đổi này đã có phiếu Thu Mua ${activeExchangeLinkDraft.purchaseRecordId}. Hãy bấm “Mở phiếu Thu Mua” để sửa đúng phiếu cũ hoặc “Tiếp tục sang Bán Hàng”.`);
    }
    calcBuyMath();

    const editingIndex = activePurchaseEditId
        ? dataStoreRecords.findIndex(record => String(record.id) === String(activePurchaseEditId))
        : -1;
    const editingRecord = editingIndex >= 0 ? dataStoreRecords[editingIndex] : null;

    if (activePurchaseEditId && !editingRecord) {
        clearPurchaseEditMode();
        return alert('Phiếu đang sửa không còn tồn tại trong dữ liệu. Hệ thống đã dừng cập nhật để tránh ghi nhầm phiếu.');
    }

    const rawExtraItems = readExtraPurchaseItems();
    const incompleteItem = rawExtraItems.find(item => item.hasValue && !item.hasName);
    if (incompleteItem) return alert("Vui lòng nhập tên cho từng món thêm trước khi lưu phiếu.");

    const purchaseItemsRaw = getPurchaseItems();
    // Hồ sơ Thu Mua liên kết Đổi Ngang / Đổi Bù dùng đúng giá MUA VÀO
    // đang hiển thị trên Tab Thu Mua và tôn trọng giá người dùng đã chỉnh.
    // Không ép giá bán ra vào phiếu Thu Mua; engine tính tiền đổi nằm riêng và không bị sửa.
    const isLinkedExchangePurchase = Boolean(activeExchangeLinkDraft && (!editingRecord || String(editingRecord.id || '') === String(activeExchangeLinkDraft.purchaseRecordId || '')));
    const items = purchaseItemsRaw;
    const firstItem = items[0];
    const totalNetLy = items.reduce((sum, item) => sum + numberValue(item.netLy), 0);
    const totalFee = items.reduce((sum, item) => sum + numberValue(item.fee), 0);
    const totalMoney = items.reduce((sum, item) => sum + numberValue(item.totalVND), 0);
    const goodsSummary = purchaseItemsSummary(items);
    const typeSummary = purchaseTypesSummary(items);

    const imgFrontSrc = getEl('a4-img-front') ? getEl('a4-img-front').src : '';
    const imgBackSrc = getEl('a4-img-back') ? getEl('a4-img-back').src : '';
    const now = new Date();

    // Phiếu sửa giữ nguyên mã chứng từ, ngày lập, rawDate/năm và mã nhập kho.
    // Phiếu mới vẫn chạy đúng cơ chế cũ.
    const id = editingRecord ? String(editingRecord.id) : "MUA-" + Date.now().toString().slice(-6);
    const nkCode = editingRecord ? (editingRecord.nkCode || '') : allocateNextNKCode();
    const dateStr = editingRecord
        ? (editingRecord.dateStr || activePurchaseLockedDate || '')
        : (getEl('a4-date') ? getEl('a4-date').innerText : '');
    const rawDate = editingRecord ? (editingRecord.rawDate || '') : now.toISOString();
    const year = editingRecord
        ? (editingRecord.year || (purchaseRecordDateParts(editingRecord)?.year ? Number(purchaseRecordDateParts(editingRecord).year) : now.getFullYear()))
        : now.getFullYear();

    const record = {
        ...(editingRecord || {}),
        id,
        nkCode,
        dateStr,
        year,
        rawDate,
        updatedAt: now.toISOString(),
        name: name.toUpperCase(),
        cccd: getEl('buy-cccd').value,
        phone: getEl('buy-phone').value,
        address: getEl('buy-address').value,
        dateIssue: getEl('buy-date-issue').value,
        placeIssue: getEl('buy-place-issue').value,
        goods: goodsSummary,
        goldType: typeSummary,
        payMethod: getEl('buy-pay-method') ? getEl('buy-pay-method').value : 'tien_mat',
        bankName: getEl('buy-bank-name') ? getEl('buy-bank-name').value : '',
        bankAcc: getEl('buy-bank-acc') ? getEl('buy-bank-acc').value : '',
        bankHolder: getEl('buy-bank-holder') ? getEl('buy-bank-holder').value : name.toUpperCase(),
        netLy: totalNetLy,
        totalNetLy,
        weightText: weightTextFromLy(totalNetLy),
        price: items.length === 1 ? firstItem.price : 0,
        fee: totalFee,
        money: totalMoney,
        totalMoney,
        itemCount: items.length,
        items: items.map((item, index) => ({
            index: index + 1,
            goods: item.goods,
            goldType: item.goldType,
            grossLy: numberValue(item.grossLy),
            gemLy: numberValue(item.gemLy),
            netLy: numberValue(item.netLy),
            weightText: item.weightText || weightTextFromLy(item.netLy),
            price: numberValue(item.price),
            fee: numberValue(item.fee),
            totalVND: numberValue(item.totalVND),
            money: numberValue(item.totalVND)
        })),
        a4Edits: { ...a4ManualEdits },
        imgFront: imgFrontSrc.startsWith('data:image') ? imgFrontSrc : (editingRecord && editingRecord.imgFront || ''),
        imgBack: imgBackSrc.startsWith('data:image') ? imgBackSrc : (editingRecord && editingRecord.imgBack || ''),
        ...(activeExchangeLinkDraft && (!editingRecord || String(editingRecord.id || '') === String(activeExchangeLinkDraft.purchaseRecordId || '')) ? {
            transactionGroupId: String(activeExchangeLinkDraft.transactionGroupId || ''),
            exchangeMode: String(activeExchangeLinkDraft.mode || ''),
            exchangeLinkStatus: String((editingRecord && editingRecord.linkedSaleId) ? 'DA_HOAN_TAT' : 'CHO_PHIEU_BAN'),
            linkedSaleId: String((editingRecord && editingRecord.linkedSaleId) || activeExchangeLinkDraft.saleId || ''),
            isExchangeLinkedPurchase: true,
            exchangePurchasePolicy: 'ACTUAL_PURCHASE_RECORD',
            // Engine Đổi vẫn là engine cũ; chỉ nạp đúng INPUT giá mua thực tế đã chốt ở Tab Thu Mua.
            // Nếu người dùng chỉnh giá mua, oldItems.priceBuy của phiếu đổi đi theo đúng giá đó, không bị khóa về bảng giá.
            exchangeEngineOldItems: items.map((item, index) => {
                const prior = (Array.isArray(activeExchangeLinkDraft.engineOldItemsSnapshot) && activeExchangeLinkDraft.engineOldItemsSnapshot[index])
                    || (editingRecord && Array.isArray(editingRecord.exchangeEngineOldItems) && editingRecord.exchangeEngineOldItems[index])
                    || {};
                const type = String(item.goldType || prior.type || '9999');
                return {
                    ...prior,
                    name: String(item.goods || prior.name || ''),
                    type,
                    grossLy: numberValue(item.grossLy != null ? item.grossLy : (prior.grossLy != null ? prior.grossLy : item.netLy)),
                    gemLy: numberValue(item.gemLy != null ? item.gemLy : prior.gemLy),
                    dirtLy: numberValue(prior.dirtLy),
                    weightLy: numberValue(item.netLy),
                    priceBuy: (editingRecord && editingRecord.exchangePurchasePolicy === 'MATCHED_OFFSET_POLICY_V1' && numberValue(prior.priceBuy) > 0)
                        ? numberValue(prior.priceBuy)
                        : (numberValue(item.price) || numberValue(settingsStore[`price_buy_${type}`])),
                    sourcePurchaseId: String(id || ''),
                    sourcePurchaseItemIndex: index,
                    transactionGroupId: String(activeExchangeLinkDraft.transactionGroupId || '')
                };
            })
        } : {})
    };

    if (editingRecord) dataStoreRecords[editingIndex] = record;
    else dataStoreRecords.unshift(record);

    saveDBFile('database.db', dataStoreRecords);
    compileBuyTable();

    if (activeExchangeLinkDraft && String(record.transactionGroupId || '') === String(activeExchangeLinkDraft.transactionGroupId || '')) {
        activeExchangeLinkDraft.purchaseRecordId = String(record.id || '');
        activeExchangeLinkDraft.purchaseFingerprint = kblOldItemsFingerprint(kblPurchaseRecordOldItems(record));
        renderExchangeLinkWorkflow();
        if (editingRecord) clearPurchaseEditMode();
        alert(`✅ Đã lưu phiếu Thu Mua liên kết [${record.id}].\nVàng cũ dùng đúng giá MUA VÀO/giá thực tế đã chốt trên Tab Thu Mua.\nHệ thống chuyển sang ${kblExchangeModeTextShort(activeExchangeLinkDraft.mode)} để chọn món mới và chốt phiếu bán.`);
        loadLinkedPurchaseIntoExchange(record, true);
        return record;
    }

    if (editingRecord) {
        const lockedDate = dateStr;
        clearPurchaseEditMode();
        alert(`✅ Đã cập nhật phiếu thu mua [${record.id}].\nNgày lập ${lockedDate} được giữ nguyên.`);
    } else {
        alert(`✅ Đã lưu phiếu thu mua [${record.id}] thành công!`);
    }
    return record;
}

function compileBuyTable(filterQuery = '') {
    const tbody = getEl('history-rows-target');
    if (!tbody) return; 
    tbody.innerHTML = '';
    
    let listToRender = dataStoreRecords;
    if (filterQuery && typeof filterQuery === 'string' && filterQuery.trim() !== '') {
        const q = filterQuery.toLowerCase().trim();
        listToRender = dataStoreRecords.filter(item => {
            const idMatch = (item.id || '').toLowerCase().includes(q);
            const nameMatch = (item.name || '').toLowerCase().includes(q);
            const cccdMatch = (item.cccd || '').toLowerCase().includes(q);
            const phoneMatch = (item.phone || '').toLowerCase().includes(q);
            const goodsMatch = (item.goods || '').toLowerCase().includes(q);
            return idMatch || nameMatch || cccdMatch || phoneMatch || goodsMatch;
        });
    }

    listToRender.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: bold;">${item.id}</td>
            <td>${item.dateStr || ''}</td>
            <td style="font-weight: bold; text-transform: uppercase;">${item.name}</td>
            <td>${item.cccd || '---'}</td>
            <td>${item.goods || ''}</td>
            <td>${item.goldType || ''}</td>
            <td style="font-weight: bold; color: #b78a00;">${item.weightText || (item.netLy + ' ly')}</td>
            <td>${Array.isArray(item.items) && item.items.length > 1 ? 'Nhiều mức' : formatVND(item.price || 0)}</td>
            <td style="font-weight: bold; color: #dc3545;">${formatVND(item.money || 0)}</td>
            <td style="text-align: center; white-space: nowrap;">
                <button class="btn btn-blue" style="padding: 4px 8px; font-size: 11px; margin-right: 3px;" onclick="reuseCustomerInfo('${item.id}')" title="Lấy thông tin khách này để tạo phiếu mới">🔁 Lấy TT</button>
                <button class="btn" style="padding:4px 8px;font-size:11px;margin-right:3px;background:#087f74;color:#fff;" onclick="queuePurchaseForChanh('${item.id}')" title="Đưa một phần hoặc toàn bộ lô vàng nguồn vào batch chành">➕ Chành</button>
                <button class="btn btn-gray" style="padding: 4px 8px; font-size: 11px; margin-right: 3px;" onclick="viewOldPurchaseRecord('${item.id}')" title="Xem lại phiếu cũ">Mở</button>
                <button class="btn" style="padding:4px 8px;font-size:11px;margin-right:3px;background:#b7791f;color:#fff;" onclick="editPurchaseRecord('${item.id}')" title="Sửa phiếu cũ nhưng giữ nguyên ngày lập">✏️ Sửa</button>
                ${(item.transactionGroupId || item.manualOffsetSaleId) ? `<button class="btn" style="padding:4px 8px;font-size:11px;margin-right:3px;background:#6f42c1;color:#fff;" onclick="openLinkedExchangeDossierFromPurchase('${item.id}')" title="Mở/tiếp tục hồ sơ đổi vàng liên kết">🔗 Hồ sơ đổi</button>` : ''}
                <button class="btn btn-red" style="padding: 4px 8px; font-size: 11px;" onclick="deleteRecord('${item.id}', ${idx})" title="Xóa phiếu này">Xóa</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// =================================================================
// 5B. CLOSED-LOOP GIÁ VỐN: TAB 1 -> CHÀNH -> KHO -> BÁN / LÃI LỖ
// =================================================================
var activeChanhSourceLots = [];

function kblRoundUp(value, step) {
    const s = Math.max(1000, numberValue(step) || 50000);
    const v = Math.max(0, numberValue(value));
    return Math.ceil(v / s) * s;
}

function flexibleProfitTarget(weightChi) {
    const base = Math.max(0, numberValue(settingsStore.profit_floor_base) || 100000);
    const perChi = Math.max(0, numberValue(settingsStore.profit_floor_per_chi) || 75000);
    const step = Math.max(1000, numberValue(settingsStore.profit_round_step) || 50000);
    return kblRoundUp(base + Math.max(0, numberValue(weightChi)) * perChi, step);
}

function purchaseItemAllocatedLy(recordId, itemIndex) {
    return chanhBatches.reduce((sum, batch) => sum + (Array.isArray(batch.sourceLots) ? batch.sourceLots : [])
        .filter(lot => String(lot.recordId) === String(recordId) && Number(lot.itemIndex) === Number(itemIndex))
        .reduce((subtotal, lot) => subtotal + numberValue(lot.weightLy), 0), 0);
}

function purchaseItemDraftLy(recordId, itemIndex) {
    return chanhDraftLots.filter(lot => String(lot.recordId) === String(recordId) && Number(lot.itemIndex) === Number(itemIndex))
        .reduce((sum, lot) => sum + numberValue(lot.weightLy), 0);
}

function queuePurchaseForChanh(recordId) {
    const record = dataStoreRecords.find(r => String(r.id) === String(recordId));
    if (!record) return alert('Không tìm thấy phiếu thu mua nguồn.');
    const items = normalizeStoredPurchaseItems(record);
    let itemIndex = 0;
    if (items.length > 1) {
        const menu = items.map((item, idx) => `${idx + 1}. ${item.goods} · ${item.goldType} · ${(numberValue(item.netLy) / 100).toFixed(3)} chỉ · ${formatVND(item.totalVND)}`).join('\n');
        const choice = prompt(`Phiếu ${record.id} có ${items.length} món. Chọn số dòng muốn đưa lên chành:\n\n${menu}`, '1');
        if (choice === null) return;
        itemIndex = Math.max(0, Math.min(items.length - 1, Math.floor(numberValue(choice)) - 1));
    }
    const item = items[itemIndex];
    const usedLy = purchaseItemAllocatedLy(record.id, itemIndex) + purchaseItemDraftLy(record.id, itemIndex);
    const availableLy = Math.max(0, numberValue(item.netLy) - usedLy);
    if (availableLy <= 0) return alert('Dòng vàng nguồn này đã được phân bổ hết vào các batch chành.');
    const input = prompt(`Số lượng còn khả dụng: ${availableLy} ly (${(availableLy / 100).toFixed(3)} chỉ).\nNhập số LY thực tế mang lên chành:`, String(availableLy));
    if (input === null) return;
    const weightLy = Math.max(0, Math.min(availableLy, roundWeightLy(numberValue(input))));
    if (!weightLy) return alert('Trọng lượng đưa chành phải lớn hơn 0.');
    const sourceTotalLy = Math.max(1, numberValue(item.netLy));
    const sourceCost = Math.round(numberValue(item.totalVND) * weightLy / sourceTotalLy);
    chanhDraftLots.push({
        recordId: record.id,
        nkCode: record.nkCode || '',
        itemIndex,
        goods: item.goods || 'Vàng cũ',
        goldType: item.goldType || '610',
        weightLy,
        originalWeightLy: sourceTotalLy,
        originalPrice: numberValue(item.price),
        originalTotalCost: numberValue(item.totalVND),
        costAmount: sourceCost,
        sourceDate: record.rawDate || record.dateStr || ''
    });
    saveDBFile('chanh_draft_lots.json', chanhDraftLots);
    renderChanhDraftLots();
    switchTab('tab-chanh');
}

function renderChanhDraftLots() {
    const tbody = getEl('chanh-draft-lots');
    if (!tbody) return;
    tbody.innerHTML = chanhDraftLots.length ? chanhDraftLots.map((lot, idx) => `<tr>
        <td><b>${escapeHtml(lot.recordId || '')}</b><br><small>${escapeHtml(lot.nkCode || '')}</small></td>
        <td>${Number(lot.itemIndex) + 1}</td>
        <td>${escapeHtml(lot.goldType || '')}</td>
        <td>${numberValue(lot.weightLy)} ly<br><small>${(numberValue(lot.weightLy) / 100).toFixed(3)} chỉ</small></td>
        <td class="num">${formatVND(lot.originalPrice || 0)}</td>
        <td class="num"><b>${formatVND(lot.costAmount || 0)}</b></td>
        <td><button class="btn btn-red" style="padding:3px 6px;font-size:10px;" onclick="removeChanhDraftLot(${idx})">Xóa</button></td>
    </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:#64748b;">Chưa chọn lô vàng nguồn từ Tab 1.</td></tr>';
}

function removeChanhDraftLot(index) {
    chanhDraftLots.splice(index, 1);
    saveDBFile('chanh_draft_lots.json', chanhDraftLots);
    renderChanhDraftLots();
}
function clearChanhDraftLots() {
    chanhDraftLots = [];
    saveDBFile('chanh_draft_lots.json', chanhDraftLots);
    renderChanhDraftLots();
}

function newChanhBatch() {
    activeChanhBatchId = '';
    activeChanhSourceLots = [];
    const now = new Date();
    if (getEl('chanh-batch-id')) getEl('chanh-batch-id').value = `CHANH-${String(now.getFullYear()).slice(-2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(Date.now()).slice(-4)}`;
    if (getEl('chanh-batch-date')) getEl('chanh-batch-date').value = now.toISOString().slice(0,10);
    ['chanh-supplier','chanh-note'].forEach(id => { if (getEl(id)) getEl(id).value = ''; });
    ['chanh-settlement-cash','chanh-other-cost','chanh-ref-622','chanh-ref-985','chanh-balance-622','chanh-balance-985'].forEach(id => { if (getEl(id)) getEl(id).value = 0; });
    const body = getEl('chanh-output-rows'); if (body) body.innerHTML = '';
    const returnBody = getEl('chanh-return-rows'); if (returnBody) returnBody.innerHTML = '';
    if (getEl('chanh-ocr-status')) { getEl('chanh-ocr-status').innerText = 'Chưa đọc toa'; getEl('chanh-ocr-status').className='ai-status-alert'; }
    renderChanhDraftLots();
    recalcChanhBatch();
}

function createChanhBatchFromDraft() {
    if (!chanhDraftLots.length) return alert('Hãy chọn ít nhất một lô vàng nguồn từ Tab 1 trước.');
    newChanhBatch();
    activeChanhSourceLots = chanhDraftLots.map(lot => ({ ...lot }));
    chanhDraftLots = [];
    saveDBFile('chanh_draft_lots.json', chanhDraftLots);
    renderChanhDraftLots();
    recalcChanhBatch();
}

function chanhDefaultPurity(type) {
    const t = String(type || '610');
    if (t === '610') return smartClampPurity(settingsStore.exchange_new_purity_610_default, 63);
    if (t === '980') return 98.5;
    if (t === '9999') return 99.99;
    if (t === '750') return 76.5;
    if (t === '585') return 60.0;
    if (t === '416') return 43.0;
    return 62.2;
}
function chanhDefaultAxis(type, purity) {
    return numberValue(purity) >= 90 || ['980','9999'].includes(String(type || '')) ? '985' : '622';
}

function chanhReturnPreset(kind) {
    const k=String(kind||'custom');
    const presets={ximen:{purity:61.5,axis:'622'},bong:{purity:61.0,axis:'622'},duc:{purity:61.2,axis:'622'},tay_pho:{purity:61.0,axis:'622'},vang_980:{purity:98.5,axis:'985'},vang_24k:{purity:98.5,axis:'985'},custom:{purity:61.0,axis:'622'}};
    return presets[k]||presets.custom;
}
function addChanhReturnRow(data = {}) {
    const tbody=getEl('chanh-return-rows'); if(!tbody) return;
    const tr=document.createElement('tr');
    const kind=String(data.kind||data.returnKind||'custom');
    const preset=chanhReturnPreset(kind);
    const purity=numberValue(data.purity||data.assayPurity)||preset.purity;
    const axis=String(data.axis||preset.axis);
    tr.innerHTML=`
        <td><input data-cr="name" class="form-control" value="${escapeHtml(data.name||data.description||'Vàng/dề trả')}" style="min-width:140px"></td>
        <td><select data-cr="kind" class="form-control" style="min-width:105px"><option value="ximen">Ximen</option><option value="bong">Bọng</option><option value="duc">Đúc</option><option value="tay_pho">Tây/phổ</option><option value="vang_980">980</option><option value="vang_24k">24K</option><option value="custom">Khác</option></select></td>
        <td><input data-cr="purity" type="number" step="0.01" class="form-control" value="${purity}" style="width:82px"></td>
        <td><input data-cr="netLy" type="number" step="0.1" min="0" class="form-control" value="${formatWeightLy(data.netLy||data.weightLy)}" style="width:88px"></td>
        <td><select data-cr="axis" class="form-control" style="width:76px"><option value="622">622</option><option value="985">985</option></select></td>
        <td data-cr-out="standard">0</td>
        <td><button class="btn btn-red" style="padding:3px 6px;font-size:10px" type="button" onclick="removeChanhReturnRow(this)">×</button></td>`;
    tr.querySelector('[data-cr="kind"]').value=kind;
    tr.querySelector('[data-cr="axis"]').value=axis;
    const kindEl=tr.querySelector('[data-cr="kind"]');
    kindEl.addEventListener('change',()=>{
        const p=chanhReturnPreset(kindEl.value);
        tr.querySelector('[data-cr="purity"]').value=p.purity;
        tr.querySelector('[data-cr="axis"]').value=p.axis;
        recalcChanhBatch();
    });
    tr.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',recalcChanhBatch));
    tbody.appendChild(tr); recalcChanhBatch();
}
function removeChanhReturnRow(button){const tr=button?.closest('tr');if(tr)tr.remove();recalcChanhBatch();}
function readChanhReturnRows(){
    return [...(getEl('chanh-return-rows')?.querySelectorAll('tr')||[])].map((tr,index)=>{
        const v=key=>tr.querySelector(`[data-cr="${key}"]`)?.value;
        const item={index,row:tr,name:String(v('name')||'').trim(),kind:String(v('kind')||'custom'),purity:numberValue(v('purity')),netLy:roundWeightLy(numberValue(v('netLy'))),axis:String(v('axis')||'622')};
        const base=item.axis==='985'?98.5:62.2;
        item.standardChi=(item.netLy/100)*Math.max(0,item.purity)/base;
        const out=tr.querySelector('[data-cr-out="standard"]');if(out)out.innerHTML=`<b>${item.standardChi.toFixed(4)} chỉ ${item.axis}</b>`;
        return item;
    }).filter(item=>item.netLy>0||item.name);
}

function addChanhOutputRow(data = {}) {
    const tbody = getEl('chanh-output-rows');
    if (!tbody) return;
    const tr = document.createElement('tr');
    const type = String(data.goldType || data.type || '610');
    const purity = numberValue(data.purity || data.supplierPurity) || chanhDefaultPurity(type);
    const axis = String(data.axis || chanhDefaultAxis(type, purity));
    tr.innerHTML = `
        <td><input data-cf="name" class="form-control" value="${escapeHtml(data.name || data.goods || 'Sản phẩm mới')}" style="min-width:150px"></td>
        <td><select data-cf="type" class="form-control" style="min-width:80px"><option>610</option><option>980</option><option>9999</option><option>750</option><option>585</option><option>416</option></select></td>
        <td><input data-cf="purity" type="number" step="0.01" class="form-control" value="${purity}" style="width:82px"></td>
        <td><input data-cf="netLy" type="number" step="0.1" min="0" class="form-control" value="${formatWeightLy(data.netLy || data.weightLy)}" style="width:88px"></td>
        <td><select data-cf="axis" class="form-control" style="width:76px"><option value="622">622</option><option value="985">985</option></select></td>
        <td><input data-cf="originalWage" type="number" min="0" class="form-control" value="${Math.round(numberValue(data.originalWage || data.wage))}" style="width:100px"></td>
        <td data-cf-out="goldCost">0 ₫</td><td data-cf-out="totalCost">0 ₫</td><td data-cf-out="suggestedWage">0 ₫</td>
        <td style="white-space:nowrap"><button class="btn btn-blue" style="padding:3px 6px;font-size:10px" type="button" onclick="loadCurrentChanhRowToInventory(this)">→ Kho</button> <button class="btn btn-red" style="padding:3px 6px;font-size:10px" type="button" onclick="removeChanhOutputRow(this)">×</button></td>`;
    tr.querySelector('[data-cf="type"]').value = type;
    tr.querySelector('[data-cf="axis"]').value = axis;
    tr.querySelectorAll('input,select').forEach(el => el.addEventListener('input', recalcChanhBatch));
    tbody.appendChild(tr);
    recalcChanhBatch();
}
function removeChanhOutputRow(button) { const tr=button?.closest('tr'); if(tr) tr.remove(); recalcChanhBatch(); }

function readChanhOutputRows() {
    return [...(getEl('chanh-output-rows')?.querySelectorAll('tr') || [])].map((tr, index) => {
        const v = key => tr.querySelector(`[data-cf="${key}"]`)?.value;
        return { index, row: tr, name: String(v('name') || '').trim(), goldType: String(v('type') || '610'), purity: numberValue(v('purity')), netLy: roundWeightLy(numberValue(v('netLy'))), axis: String(v('axis') || '622'), originalWage: Math.round(numberValue(v('originalWage'))) };
    }).filter(item => item.netLy > 0 || item.name);
}

function calculateChanhCosting() {
    const rows = readChanhOutputRows();
    const returns = readChanhReturnRows();
    const sourceCost = activeChanhSourceLots.reduce((sum, lot) => sum + numberValue(lot.costAmount), 0);
    const settlementCash = numberValue(getEl('chanh-settlement-cash')?.value); // + trả, - chành hoàn
    const otherCost = Math.max(0, numberValue(getEl('chanh-other-cost')?.value));
    const economicPool = sourceCost + settlementCash + otherCost;
    const wageTotal = rows.reduce((sum, item) => sum + Math.max(0, numberValue(item.originalWage)), 0);
    const goldPool = economicPool - wageTotal;
    const ref622 = Math.max(1, numberValue(getEl('chanh-ref-622')?.value) || numberValue(settingsStore.price_sell_610) || 1);
    const ref985 = Math.max(1, numberValue(getEl('chanh-ref-985')?.value) || numberValue(settingsStore.price_sell_980) || numberValue(settingsStore.price_sell_9999) || 1);
    const bal622 = Math.max(0, numberValue(getEl('chanh-balance-622')?.value));
    const bal985 = Math.max(0, numberValue(getEl('chanh-balance-985')?.value));
    const carryWeight = bal622 * ref622 + bal985 * ref985;
    rows.forEach(item => {
        const base = item.axis === '985' ? 98.5 : 62.2;
        const stdChi = (item.netLy / 100) * Math.max(0, item.purity) / base;
        item.standardChi = stdChi;
        item.allocationWeight = stdChi * (item.axis === '985' ? ref985 : ref622);
    });
    const new622 = rows.filter(item => item.axis === '622').reduce((sum,item)=>sum+item.standardChi,0);
    const new985 = rows.filter(item => item.axis === '985').reduce((sum,item)=>sum+item.standardChi,0);
    const return622 = returns.filter(item => item.axis === '622').reduce((sum,item)=>sum+item.standardChi,0);
    const return985 = returns.filter(item => item.axis === '985').reduce((sum,item)=>sum+item.standardChi,0);
    const rawDelta622 = new622 - return622; // dương = thiếu 622, âm = dư dề 622
    const rawDelta985 = new985 - return985; // dương = thiếu 985, âm = dư dề 985
    let shortage622=Math.max(0,rawDelta622), surplus622=Math.max(0,-rawDelta622);
    let shortage985=Math.max(0,rawDelta985), surplus985=Math.max(0,-rawDelta985);
    // Quy tắc tài liệu nội bộ: chỉ dùng dư 985 để bù thiếu 622 theo 98.5/62.2.
    let cross985Used=0, cross622Covered=0;
    if(shortage622>0&&surplus985>0){
        const possible622=surplus985*98.5/62.2;
        cross622Covered=Math.min(shortage622,possible622);
        cross985Used=cross622Covered*62.2/98.5;
        shortage622-=cross622Covered;
        surplus985=Math.max(0,surplus985-cross985Used);
    }
    const reconciliation={new622,new985,return622,return985,rawDelta622,rawDelta985,shortage622,surplus622,shortage985,surplus985,cross985Used,cross622Covered};
    const outputWeight = rows.reduce((sum, item) => sum + item.allocationWeight, 0);
    const denominator = outputWeight + carryWeight;
    const allocatableGoldPool = Math.max(0, goldPool);
    rows.forEach(item => {
        item.allocatedGoldCost = denominator > 0 ? Math.round(allocatableGoldPool * item.allocationWeight / denominator) : 0;
        item.totalCost = item.allocatedGoldCost + Math.max(0, item.originalWage);
        const weightChi = item.netLy / 100;
        const liveSell = Math.max(0, numberValue(settingsStore[`price_sell_${item.goldType}`]));
        const targetProfit = flexibleProfitTarget(weightChi);
        const requiredWage = item.totalCost + targetProfit - weightChi * liveSell;
        const suggestedWage = kblRoundUp(Math.max(item.originalWage, requiredWage, 0), settingsStore.profit_round_step);
        item.liveSell = liveSell;
        item.targetProfit = targetProfit;
        item.suggestedWage = suggestedWage;
        item.projectedProfit = Math.round(weightChi * liveSell + suggestedWage - item.totalCost);
        if (item.row) {
            const goldCell=item.row.querySelector('[data-cf-out="goldCost"]'); if(goldCell) goldCell.innerHTML=`<b>${formatVND(item.allocatedGoldCost)}</b>`;
            const totalCell=item.row.querySelector('[data-cf-out="totalCost"]'); if(totalCell) totalCell.innerHTML=`<b>${formatVND(item.totalCost)}</b>`;
            const wageCell=item.row.querySelector('[data-cf-out="suggestedWage"]'); if(wageCell) wageCell.innerHTML=`<b>${formatVND(item.suggestedWage)}</b><br><small>Lãi dự kiến ${formatVND(item.projectedProfit)}</small>`;
        }
    });
    const carryCost = denominator > 0 ? Math.round(allocatableGoldPool * carryWeight / denominator) : 0;
    return { rows, returns, reconciliation, sourceCost, settlementCash, otherCost, economicPool, wageTotal, goldPool, ref622, ref985, bal622, bal985, carryCost, denominator };
}

function recalcChanhBatch() {
    const c = calculateChanhCosting();
    const box = getEl('chanh-cost-summary');
    if (box) box.innerHTML = `
        Vốn vàng nguồn từ Tab 1: <b>${formatVND(c.sourceCost)}</b> · Kết toán tiền chành: <b>${formatVND(c.settlementCash)}</b> · Chi phí khác: <b>${formatVND(c.otherCost)}</b><br>
        Tổng giá trị kinh tế cần phân bổ: <b>${formatVND(c.economicPool)}</b> · Công gốc trên các món: <b>${formatVND(c.wageTotal)}</b><br>
        Pool vốn vàng sau tách công: <b>${formatVND(c.goldPool)}</b> · Giá vốn giữ lại cho số dư vàng ở chành: <b>${formatVND(c.carryCost)}</b><br>
        <span style="color:${c.goldPool < 0 ? '#b91c1c' : '#166534'}">${c.goldPool < 0 ? '⚠️ Tổng kết toán nhỏ hơn tổng công gốc. Kiểm tra lại toa/tiền chành trước khi lưu.' : '✅ Giá vốn sản phẩm được phân bổ từ tiền thật Tab 1 + kết toán chành, không viết lại bằng giá vàng hiện tại.'}</span>`;
    const axisBox=getEl('chanh-axis-summary');
    if(axisBox){
        const r=c.reconciliation||{};
        const signed=(v)=>`${numberValue(v)>=0?'+':''}${numberValue(v).toFixed(4)}`;
        axisBox.innerHTML=`<b>ĐỐI CHIẾU 622/985 TỪ CÁC DÒNG TOA</b><br>
            Hàng mới: 622 = <b>${numberValue(r.new622).toFixed(4)}</b> chỉ chuẩn · 985 = <b>${numberValue(r.new985).toFixed(4)}</b><br>
            Dề/vàng trả: 622 = <b>${numberValue(r.return622).toFixed(4)}</b> · 985 = <b>${numberValue(r.return985).toFixed(4)}</b><br>
            Chênh trước cấn (dương = thiếu): 622 <b>${signed(r.rawDelta622)}</b> · 985 <b>${signed(r.rawDelta985)}</b><br>
            ${numberValue(r.cross985Used)>0?`Cấn chéo: dùng <b>${numberValue(r.cross985Used).toFixed(4)} chỉ 985</b> để bù <b>${numberValue(r.cross622Covered).toFixed(4)} chỉ 622</b>.<br>`:''}
            Sau cấn: thiếu 622 <b>${numberValue(r.shortage622).toFixed(4)}</b> · dư 622 <b>${numberValue(r.surplus622).toFixed(4)}</b> · thiếu 985 <b>${numberValue(r.shortage985).toFixed(4)}</b> · dư 985 <b>${numberValue(r.surplus985).toFixed(4)}</b>.<br>
            <small>Đây là đối chiếu toán học. Ô “Tiền kết toán thực với chành” vẫn lấy số thực trên toa sau khi ông kiểm tra, không bị engine tự ghi đè.</small>`;
    }
    return c;
}

function snapshotActiveChanhBatch() {
    const calc = recalcChanhBatch();
    return {
        id: getEl('chanh-batch-id')?.value.trim() || '',
        date: getEl('chanh-batch-date')?.value || new Date().toISOString().slice(0,10),
        supplier: getEl('chanh-supplier')?.value.trim() || '',
        note: getEl('chanh-note')?.value.trim() || '',
        sourceLots: activeChanhSourceLots.map(lot => ({ ...lot })),
        sourceCost: calc.sourceCost,
        settlementCash: calc.settlementCash,
        otherCost: calc.otherCost,
        refPrice622: calc.ref622,
        refPrice985: calc.ref985,
        balance622Chi: calc.bal622,
        balance985Chi: calc.bal985,
        carryCost: calc.carryCost,
        economicPool: calc.economicPool,
        outputs: calc.rows.map(item => ({ name:item.name, goldType:item.goldType, purity:item.purity, netLy:item.netLy, axis:item.axis, standardChi:item.standardChi, originalWage:item.originalWage, allocatedGoldCost:item.allocatedGoldCost, totalCost:item.totalCost, liveSellAtCalc:item.liveSell, targetProfit:item.targetProfit, suggestedWage:item.suggestedWage, projectedProfit:item.projectedProfit })),
        returns: calc.returns.map(item => ({ name:item.name, kind:item.kind, purity:item.purity, netLy:item.netLy, axis:item.axis, standardChi:item.standardChi })),
        reconciliation: { ...calc.reconciliation },
        calculatedAt: new Date().toISOString()
    };
}

function saveActiveChanhBatch() {
    const next = snapshotActiveChanhBatch();
    if (!next.id) return alert('Batch chưa có mã.');
    if (!next.sourceLots.length) return alert('Batch chưa có lô vàng nguồn từ Tab 1.');
    if (!next.outputs.length) return alert('Hãy nhập ít nhất một món hàng mới trên toa chành.');
    const idx = chanhBatches.findIndex(b => String(b.id) === String(next.id));
    const now = new Date().toISOString();
    if (idx >= 0) {
        const prior = chanhBatches[idx];
        const history = Array.isArray(prior.history) ? prior.history.slice(-49) : [];
        const priorSnapshot = { ...prior }; delete priorSnapshot.history;
        history.push({ savedAt: now, snapshot: priorSnapshot });
        chanhBatches[idx] = { ...prior, ...next, history, revision: numberValue(prior.revision) + 1, updatedAt: now, createdAt: prior.createdAt || now };
    } else {
        chanhBatches.unshift({ ...next, history: [], revision: 1, createdAt: now, updatedAt: now });
    }
    activeChanhBatchId = next.id;
    saveDBFile('chanh_batches.json', chanhBatches);
    renderChanhBatchList();
    compileBuyTable();
    alert(`✅ Đã lưu batch ${next.id}. Giá vốn nguồn và các lần chỉnh sửa được giữ lịch sử.`);
}

function renderChanhBatchList() {
    const tbody = getEl('chanh-batch-list'); if (!tbody) return;
    tbody.innerHTML = chanhBatches.length ? chanhBatches.map(batch => `<tr>
        <td><b>${escapeHtml(batch.id || '')}</b><br><small>rev ${numberValue(batch.revision) || 1}</small></td>
        <td>${escapeHtml(batch.date || '')}</td><td>${escapeHtml(batch.supplier || '')}</td>
        <td class="num">${formatVND(batch.sourceCost || 0)}</td><td class="num">${formatVND(batch.settlementCash || 0)}</td>
        <td>${Array.isArray(batch.outputs) ? batch.outputs.length : 0}</td>
        <td><button class="btn btn-gray" style="padding:3px 6px;font-size:10px" onclick="loadChanhBatch('${escapeHtml(batch.id || '')}')">Mở</button></td>
    </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:#64748b">Chưa có batch chành.</td></tr>';
}

function loadChanhBatch(id) {
    const batch = chanhBatches.find(b => String(b.id) === String(id));
    if (!batch) return alert('Không tìm thấy batch.');
    activeChanhBatchId = batch.id;
    activeChanhSourceLots = (batch.sourceLots || []).map(lot => ({ ...lot }));
    if (getEl('chanh-batch-id')) getEl('chanh-batch-id').value = batch.id || '';
    if (getEl('chanh-batch-date')) getEl('chanh-batch-date').value = batch.date || '';
    if (getEl('chanh-supplier')) getEl('chanh-supplier').value = batch.supplier || '';
    if (getEl('chanh-note')) getEl('chanh-note').value = batch.note || '';
    if (getEl('chanh-settlement-cash')) getEl('chanh-settlement-cash').value = numberValue(batch.settlementCash);
    if (getEl('chanh-other-cost')) getEl('chanh-other-cost').value = numberValue(batch.otherCost);
    if (getEl('chanh-ref-622')) getEl('chanh-ref-622').value = numberValue(batch.refPrice622);
    if (getEl('chanh-ref-985')) getEl('chanh-ref-985').value = numberValue(batch.refPrice985);
    if (getEl('chanh-balance-622')) getEl('chanh-balance-622').value = numberValue(batch.balance622Chi);
    if (getEl('chanh-balance-985')) getEl('chanh-balance-985').value = numberValue(batch.balance985Chi);
    const returnTbody=getEl('chanh-return-rows'); if(returnTbody) returnTbody.innerHTML='';
    (batch.returns || []).forEach(item=>addChanhReturnRow(item));
    const tbody = getEl('chanh-output-rows'); if (tbody) tbody.innerHTML = '';
    (batch.outputs || []).forEach(item => addChanhOutputRow(item));
    recalcChanhBatch();
    switchTab('tab-chanh');
}

function fileToDataUrl(file) { return new Promise((resolve, reject) => { const r=new FileReader(); r.onload=()=>resolve(String(r.result||'')); r.onerror=reject; r.readAsDataURL(file); }); }
async function runChanhToaOCR() {
    if (!GEMINI_API_KEY || !GEMINI_API_KEY.trim()) return alert('Chưa có Gemini API Key trong Cài đặt & AI.');
    const files = [...(getEl('chanh-toa-files')?.files || [])].slice(0, 8);
    if (!files.length) return alert('Hãy chọn ảnh toa chành trước.');
    const status=getEl('chanh-ocr-status'); if(status){status.innerText='⏳ Gemini đang đọc toa...';status.className='ai-status-alert';}
    try {
        const dataUrls = await Promise.all(files.map(fileToDataUrl));
        const prompt = `Đọc toàn bộ các ảnh toa/kết toán vàng của nhà cung cấp. Chỉ bóc dữ liệu nhìn thấy, KHÔNG tự suy đoán số không rõ. Trả về JSON thuần dạng {"supplierName":"","date":"YYYY-MM-DD","settlementCash":0,"refPrice622":0,"refPrice985":0,"balance622Chi":0,"balance985Chi":0,"returns":[{"name":"","kind":"ximen|bong|duc|tay_pho|vang_980|vang_24k|custom","purity":61.5,"netLy":0,"axis":"622"}],"items":[{"name":"","goldType":"610","purity":63,"netLy":0,"axis":"622","originalWage":0}]}. Quy ước settlementCash: số dương nếu Kim Bảo Lâm phải trả chành, số âm nếu chành trả lại. netLy là ly theo POS (1 chỉ=100 ly). goldType là loại bán/tem nếu toa có; purity là tuổi thật trên toa như 63.0/62.5/62.2/98.5; axis chỉ 622 hoặc 985. Mảng returns là vàng/dề KBL trả chành: Ximen 61.5, Bọng 61.0, Đúc 61.2 hoặc tuổi phổ nhìn thấy; tuyệt đối không tự gán nếu toa không thể hiện. Nếu một trường không chắc chắn hãy để 0 hoặc chuỗi rỗng. Không markdown.`;
        const parts=[{text:prompt}];
        dataUrls.forEach(url=>{const header=url.split(',')[0]; let mime=(header.match(/data:([^;]+)/)||[])[1]||'image/jpeg'; parts.push({inlineData:{mimeType:mime,data:url.split(',')[1]||''}});});
        const result=await callGeminiAIAutoModel(GEMINI_API_KEY,parts);
        let raw=String(result.data?.candidates?.[0]?.content?.parts?.[0]?.text||'').replace(/```json/gi,'').replace(/```/g,'').trim();
        const match=raw.match(/\{[\s\S]*\}/); if(!match) throw new Error('AI không trả về JSON toa hợp lệ.');
        const parsed=JSON.parse(match[0]);
        if(parsed.supplierName&&getEl('chanh-supplier')) getEl('chanh-supplier').value=parsed.supplierName;
        if(parsed.date&&/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)&&getEl('chanh-batch-date')) getEl('chanh-batch-date').value=parsed.date;
        [['chanh-settlement-cash','settlementCash'],['chanh-ref-622','refPrice622'],['chanh-ref-985','refPrice985'],['chanh-balance-622','balance622Chi'],['chanh-balance-985','balance985Chi']].forEach(([id,key])=>{if(numberValue(parsed[key])&&getEl(id))getEl(id).value=numberValue(parsed[key]);});
        const returnTbody=getEl('chanh-return-rows'); if(returnTbody&&Array.isArray(parsed.returns)&&parsed.returns.length){returnTbody.innerHTML='';parsed.returns.forEach(item=>addChanhReturnRow(item));}
        const tbody=getEl('chanh-output-rows'); if(tbody&&Array.isArray(parsed.items)&&parsed.items.length){tbody.innerHTML='';parsed.items.forEach(item=>addChanhOutputRow(item));}
        recalcChanhBatch();
        if(status){status.innerText=`✨ Đã đọc toa bằng ${result.usedModel}. Hãy kiểm tra lại trước khi lưu.`;status.className='ai-status-alert ai-status-success';}
    } catch(e) { if(status){status.innerText=`❌ ${e.message||e}`;status.className='ai-status-alert ai-status-error';} }
}

function chanhEditableSignature(batch) {
    const sourceLots = (batch?.sourceLots || []).map(lot => ({
        recordId: String(lot.recordId || ''), itemIndex: Number(lot.itemIndex) || 0,
        weightLy: roundWeightLy(numberValue(lot.weightLy)), costAmount: Math.round(numberValue(lot.costAmount))
    }));
    const outputs = (batch?.outputs || []).map(item => ({
        name: String(item.name || ''), goldType: String(item.goldType || '610'),
        purity: Math.round(numberValue(item.purity) * 100) / 100,
        netLy: roundWeightLy(numberValue(item.netLy)), axis: String(item.axis || '622'),
        originalWage: Math.round(numberValue(item.originalWage))
    }));
    const returns = (batch?.returns || []).map(item => ({
        name: String(item.name || ''), kind: String(item.kind || 'custom'),
        purity: Math.round(numberValue(item.purity) * 100) / 100,
        netLy: roundWeightLy(numberValue(item.netLy)), axis: String(item.axis || '622')
    }));
    return JSON.stringify({
        sourceLots,
        settlementCash: Math.round(numberValue(batch?.settlementCash)),
        otherCost: Math.round(numberValue(batch?.otherCost)),
        refPrice622: Math.round(numberValue(batch?.refPrice622)),
        refPrice985: Math.round(numberValue(batch?.refPrice985)),
        balance622Chi: Math.round(numberValue(batch?.balance622Chi) * 10000) / 10000,
        balance985Chi: Math.round(numberValue(batch?.balance985Chi) * 10000) / 10000,
        outputs, returns
    });
}

function loadCurrentChanhRowToInventory(button) {
    const tr=button?.closest('tr'); if(!tr) return;
    const rows=readChanhOutputRows();
    const idx=[...getEl('chanh-output-rows').querySelectorAll('tr')].indexOf(tr);
    const calc=recalcChanhBatch();
    const item=calc.rows.find(r=>r.index===idx) || rows[idx];
    if(!item) return alert('Không đọc được dòng sản phẩm.');
    const batchId=getEl('chanh-batch-id')?.value.trim()||activeChanhBatchId;
    if(!batchId) return alert('Hãy tạo/lưu batch trước.');
    const currentBatch = chanhBatches.find(b=>String(b.id)===String(batchId));
    if (!currentBatch) return alert('🔒 Hãy LƯU batch chành trước khi đưa sản phẩm sang Kho để giữ đúng dấu vết giá vốn.');
    const currentEditable = snapshotActiveChanhBatch();
    if (chanhEditableSignature(currentEditable) !== chanhEditableSignature(currentBatch)) {
        return alert('⚠️ Batch đang có thay đổi chưa lưu. Hãy bấm LƯU / CẬP NHẬT BATCH trước rồi mới đưa sản phẩm sang Kho.');
    }
    const supplierName=getEl('chanh-supplier')?.value.trim()||'';
    if(getEl('inv-source-type')) getEl('inv-source-type').value='supplier';
    if(getEl('inv-source-id')) getEl('inv-source-id').value=`${batchId}#${idx+1}`;
    if(getEl('inv-source-batch-id')) getEl('inv-source-batch-id').value=batchId;
    if(getEl('inv-source-lot-refs')) getEl('inv-source-lot-refs').value=JSON.stringify(activeChanhSourceLots.map(l=>({recordId:l.recordId,itemIndex:l.itemIndex,weightLy:l.weightLy,costAmount:l.costAmount})));
    if(getEl('inv-cost-audit-snapshot')) getEl('inv-cost-audit-snapshot').value=JSON.stringify({batchId,revision:numberValue(currentBatch?.revision)||1,sourceCost:calc.sourceCost,settlementCash:calc.settlementCash,allocatedGoldCost:item.allocatedGoldCost,originalWage:item.originalWage,totalCost:item.totalCost,calculatedAt:new Date().toISOString()});
    if(getEl('inv-name')) getEl('inv-name').value=item.name||'Sản phẩm mới';
    if(getEl('inv-gold-type')) getEl('inv-gold-type').value=item.goldType||'610';
    if(getEl('inv-supplier-purity')) {getEl('inv-supplier-purity').value=item.purity||chanhDefaultPurity(item.goldType);getEl('inv-supplier-purity').dataset.manual='1';}
    if(getEl('inv-ncc') && supplierName) { try { getEl('inv-ncc').value=supplierName; } catch(_){} }
    setWeightInputs('i-t',item.netLy); setWeightInputs('i-h',0); setWeightInputs('i-l',0);
    if(getEl('inv-cost-base')) getEl('inv-cost-base').value=Math.round(item.allocatedGoldCost||0);
    if(getEl('inv-gold-price')) getEl('inv-gold-price').value=item.netLy>0?Math.round((item.allocatedGoldCost||0)/(item.netLy/100)):0;
    if(getEl('inv-cost-wage')) getEl('inv-cost-wage').value=Math.round(item.originalWage||0);
    if(getEl('inv-sell-wage')) getEl('inv-sell-wage').value=Math.round(item.suggestedWage||item.originalWage||0);
    syncInvSourceUI(); calcInvMath(); switchTab('tab-kho');
    alert(`✅ Đã nạp dòng ${idx+1} của ${batchId} sang Tab 3 Kho.\nCông bán chỉ là GỢI Ý; ông được sửa trước khi lưu kho/in tem.`);
}

// =================================================================
// HÓA ĐƠN CHÀNH: LỚP KẾ TOÁN RIÊNG, KHÔNG GHI ĐÈ GIÁ VỐN QUẢN TRỊ
// =================================================================
function saleSnapshotForSku(sku, inventoryUid = '') {
    for (const sale of salesStore) {
        const items=Array.isArray(sale.items)?sale.items:[];
        const found=items.find(item => inventoryUid
            ? String(item.inventoryUid || '') === String(inventoryUid)
            : String(item.invCode || '') === String(sku || ''));
        if(found) return {saleId:sale.id,revenue:numberValue(found.totalPay),managementProfit:numberValue(found.profit),date:sale.dateRaw||''};
        if (inventoryUid && String(sale.inventoryUid || '') === String(inventoryUid)) return {saleId:sale.id,revenue:numberValue(sale.totalPay),managementProfit:numberValue(sale.profit),date:sale.dateRaw||''};
        if(!inventoryUid && String(sale.invCode||'')===String(sku||'')) return {saleId:sale.id,revenue:numberValue(sale.totalPay),managementProfit:numberValue(sale.profit),date:sale.dateRaw||''};
    }
    return null;
}
function saveSupplierInvoiceRecord() {
    const number=String(getEl('supinv-number')?.value||'').trim();
    const sku=String(getEl('supinv-sku')?.value||'').trim();
    if(!number||!sku) return alert('Cần nhập số hóa đơn và Mã SP.');
    const gold=Math.max(0,numberValue(getEl('supinv-gold')?.value));
    const wage=Math.max(0,numberValue(getEl('supinv-wage')?.value));
    const tax=Math.max(0,numberValue(getEl('supinv-tax')?.value));
    const linkedInventory = inventoryStore.find(item => String(item.code || '') === sku) || null;
    const rec={id:`SUPINV-${Date.now()}`,number,date:getEl('supinv-date')?.value||new Date().toISOString().slice(0,10),supplier:String(getEl('supinv-supplier')?.value||'').trim(),batchId:String(getEl('supinv-batch')?.value||'').trim(),sku,originalSku:sku,inventoryUid:linkedInventory?.inventoryUid||'',goldAmount:gold,wageAmount:wage,taxAmount:tax,total:gold+wage+tax,note:String(getEl('supinv-note')?.value||'').trim(),createdAt:new Date().toISOString()};
    supplierInvoices.unshift(rec); saveDBFile('supplier_invoices.json',supplierInvoices); renderSupplierInvoiceTable();
    alert('✅ Đã lưu hóa đơn kế toán. Giá vốn quản trị của Mã SP không bị thay đổi.');
}
function renderSupplierInvoiceTable() {
    const tbody=getEl('supplier-invoice-tbody'); if(!tbody) return;
    tbody.innerHTML=supplierInvoices.length?supplierInvoices.map(inv=>{const sale=saleSnapshotForSku(inv.sku, inv.inventoryUid || '');const revenue=numberValue(sale?.revenue);const invoiceSpread=sale?revenue-numberValue(inv.total):0;return `<tr><td><b>${escapeHtml(inv.number||'')}</b><br><small>${escapeHtml(inv.supplier||'')}</small></td><td>${escapeHtml(inv.date||'')}</td><td>${escapeHtml(inv.sku||'')}<br><small>${escapeHtml(inv.batchId||'')}</small></td><td class="num">${formatVND(inv.total||0)}</td><td class="num">${sale?formatVND(revenue):'Chưa bán'}</td><td class="num">${sale?formatVND(invoiceSpread):'—'}</td><td class="num">${sale?formatVND(sale.managementProfit):'—'}</td></tr>`;}).join(''):'<tr><td colspan="7" style="text-align:center;color:#64748b">Chưa có hóa đơn chành.</td></tr>';
}

// =================================================================
// TAB 5 · HÓA ĐƠN CHÀNH BẰNG ẢNH — GEMINI ĐỌC, CHỦ TIỆM DUYỆT, RỒI MỚI VÀO KHO
// Không sửa/xóa hàng cũ. Không tự đẩy web trước khi Tab 3 được chủ tiệm LƯU KHO.
// =================================================================
const KBL_SUPPLIER_INVOICE_MAX_IMAGES = 30;
const KBL_SUPPLIER_INVOICE_BATCH_SIZE = 6;
const KBL_SUPPLIER_INVOICE_BATCH_STEP = 5; // chồng 1 ảnh giữa 2 lượt để hạn chế tách nhầm trang liên tiếp.

function supplierInvoiceMoneyValue(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const text = String(value ?? '').trim();
    if (!text) return 0;
    const sign = text.startsWith('-') ? -1 : 1;
    const digits = text.replace(/[^0-9]/g, '');
    return digits ? sign * Number(digits) : 0;
}

function supplierInvoiceWeightValue(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const text = String(value ?? '').trim().replace(',', '.').replace(/[^0-9.\-]/g, '');
    const n = parseFloat(text);
    return Number.isFinite(n) ? n : 0;
}

// OCR Tab 5: chỉ bóc tách ba cân từ hóa đơn; không can thiệp engine mua/bán hay mẫu tem.
function supplierInvoiceWeightTenth(value) {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const text = String(value).replace(/\s+/g, '').replace(',', '.');
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    const n = Number(text) * 10;
    return Number.isSafeInteger(Math.round(n)) && Math.abs(n - Math.round(n)) < 1e-7 ? Math.round(n) : null;
}

function supplierInvoiceReadThreeWeights(rawItem, description, weightChi) {
    const desc = String(description || '').replace(/\u00a0/g, ' ');
    // Chẳng hạn: "1 mặt: 48.8 - 7 = 41.8" (ly). Chấp nhận cả dấu phẩy và xuống dòng sau dấu thập phân.
    const expression = desc.match(/(\d+(?:[.,]\s*\d+)?)\s*[-\u2212\u2013]\s*(\d+(?:[.,]\s*\d+)?)\s*=\s*(\d+(?:[.,]\s*\d+)?)/);
    const hasEquation = /[-\u2212\u2013]/.test(desc) && /=/.test(desc);
    const fieldKeys = ['grossLy', 'gemLy', 'netLy'];
    const aiHasAll = fieldKeys.every(key => rawItem?.[key] !== undefined && rawItem?.[key] !== null && String(rawItem[key]).trim() !== '');
    const ai = aiHasAll ? fieldKeys.map(key => supplierInvoiceWeightTenth(rawItem[key])) : null;
    const fromText = expression ? expression.slice(1, 4).map(supplierInvoiceWeightTenth) : null;
    const chosen = fromText || ai;
    const problems = [];
    if (hasEquation && !expression) problems.push('Không đọc trọn phép trừ cân trên dòng hóa đơn');
    if (aiHasAll && ai.some(n => n === null)) problems.push('Gemini đọc cân sai độ chính xác 0,1 ly');
    if (fromText && fromText.some(n => n === null)) problems.push('Số cân trong mô tả không hợp lệ');
    if (fromText && ai && ai.every(n => n !== null) && ai.some((n,i) => n !== fromText[i])) {
        problems.push('Ba số cân Gemini trả về khác phép trừ in trên hóa đơn');
    }
    if (chosen && chosen.every(n => n !== null)) {
        const [gross, gem, net] = chosen;
        if (!(gross > 0 && gem >= 0 && net > 0 && gross >= gem && gross - gem === net)) {
            problems.push('Cân tổng trừ cân hột không bằng cân vàng thực');
        }
        const columnNet = supplierInvoiceWeightTenth(Number(weightChi) * 100);
        if (columnNet === null || columnNet !== net) {
            problems.push('Cân vàng thực khác cột Số lượng (Trọng lượng)');
        }
    } else if (hasEquation || aiHasAll) {
        problems.push('Thiếu cân tổng, cân hột hoặc cân vàng thực');
    }
    const verified = Boolean(chosen && chosen.every(n => n !== null) && problems.length === 0);
    return {
        status: verified ? 'verified' : (problems.length ? 'invalid' : 'not_shown'),
        grossLy: verified ? chosen[0] / 10 : null,
        gemLy: verified ? chosen[1] / 10 : null,
        netLy: verified ? chosen[2] / 10 : null,
        errors: problems
    };
}

function supplierInvoiceSimpleName(value, description = '') {
    const direct = String(value || '').trim();
    const source = `${direct} ${description || ''}`;
    const rules = [
        [/bông\s*tai|hoa\s*tai/i, 'Bông Tai'],
        [/mặt\s*dây|mặt\s*kiểu|mặt\b/i, 'Mặt Dây'],
        [/dây\s*chuyền|dây\s*không\s*mặt|dây\s*có\s*mặt|dây\b/i, 'Dây'],
        [/lắc\b/i, 'Lắc'],
        [/vòng\b/i, 'Vòng'],
        [/nhẫn\b/i, 'Nhẫn'],
        [/kiềng\b/i, 'Kiềng'],
        [/charm\b/i, 'Charm']
    ];
    for (const [regex, name] of rules) if (regex.test(source)) return name;
    return direct || 'Trang sức';
}

function supplierInvoiceGoldContent(value, description = '') {
    const direct = String(value || '').match(/\d{3,4}/);
    if (direct) return direct[0];
    const match = String(description || '').match(/vàng[^\d]{0,30}(\d{3,4})/i);
    return match ? match[1] : '';
}

function supplierInvoiceUnit(value) {
    const text = String(value || '').trim();
    return /ch[iỉ]/i.test(text) ? 'Chỉ' : text;
}

function supplierInvoiceMathCheck(item) {
    const weightChi = supplierInvoiceWeightValue(item?.weightChi);
    const unitPrice = supplierInvoiceMoneyValue(item?.goldUnitPrice);
    const goldAmount = supplierInvoiceMoneyValue(item?.goldAmount);
    const originalWage = Math.max(0, supplierInvoiceMoneyValue(item?.originalWage));
    const expectedGold = Math.round(weightChi * unitPrice);
    const diff = Math.abs(expectedGold - goldAmount);
    const tolerance = Math.max(500, Math.round(Math.abs(goldAmount) * 0.00005));
    const errors = [];
    const warnings = [];
    if (!String(item?.name || '').trim()) errors.push('Thiếu tên món');
    if (!String(item?.goldContent || '').trim()) errors.push('Thiếu hàm lượng');
    if (supplierInvoiceUnit(item?.unit) !== 'Chỉ') errors.push('ĐVT chưa phải Chỉ');
    if (!(weightChi > 0)) errors.push('Thiếu trọng lượng');
    if (!(unitPrice > 0)) errors.push('Thiếu đơn giá vàng/chỉ');
    if (!(goldAmount > 0)) errors.push('Thiếu thành tiền vàng');
    if (weightChi > 0 && unitPrice > 0 && goldAmount > 0 && diff > tolerance) {
        errors.push(`TL × đơn giá lệch ${formatVND(diff)}`);
    }
    // Chỉ kiểm tra dữ liệu OCR ba cân mới. Công thức tiền và ngưỡng cũ giữ nguyên.
    if (item?.weightReadStatus === 'invalid') {
        errors.push(...(Array.isArray(item.weightReadErrors) && item.weightReadErrors.length
            ? item.weightReadErrors : ['Chưa xác minh được cân tổng/hột/vàng từ ảnh']));
    } else if (item?.weightReadStatus === 'verified') {
        const gross = supplierInvoiceWeightTenth(item.grossLy);
        const gem = supplierInvoiceWeightTenth(item.gemLy);
        const net = supplierInvoiceWeightTenth(item.netLy);
        const columnNet = supplierInvoiceWeightTenth(weightChi * 100);
        if (gross === null || gem === null || net === null || gross - gem !== net || net !== columnNet) {
            errors.push('Ba trọng lượng OCR không khớp với cột vàng thực đã duyệt');
        }
    } else if (item?.weightReadStatus === 'not_shown') {
        warnings.push('Hóa đơn không ghi rõ cân tổng/hột; kiểm tra ở Kho trước khi in tem');
    }
    const productLine = Number(String(item?.sourceProductLineNo || '').replace(/\D/g, '')) || 0;
    const wageLine = Number(String(item?.sourceWageLineNo || '').replace(/\D/g, '')) || 0;
    if (productLine && wageLine && wageLine !== productLine + 1) warnings.push(`Dòng công ${wageLine} không ngay sau dòng hàng ${productLine}`);
    if (!wageLine && originalWage === 0) warnings.push('Chưa thấy dòng tiền công — cần xem ảnh');
    (Array.isArray(item?.warnings) ? item.warnings : []).forEach(w => { if (w) warnings.push(String(w)); });
    return { valid: errors.length === 0, errors, warnings, expectedGold, diff, tolerance, totalCost: goldAmount + originalWage };
}

function supplierInvoiceImageMime(fileName, fallback = 'image/jpeg') {
    const ext = path.extname(String(fileName || '')).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.heic' || ext === '.heif') return 'image/heic';
    return fallback || 'image/jpeg';
}

function supplierInvoiceSafeBaseName(fileName, index) {
    const ext = path.extname(String(fileName || '')).toLowerCase() || '.jpg';
    const base = path.basename(String(fileName || `hoa-don-${index}`), ext)
        .normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70) || `hoa-don-${index}`;
    return `${base}${ext}`;
}

async function persistSupplierInvoiceImages(files) {
    const dir = path.join(KBL_DATA_DIR, 'supplier_invoice_images');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = Date.now();
    const saved = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const safe = supplierInvoiceSafeBaseName(file.name, i + 1);
        const target = path.join(dir, `${stamp}_${String(i + 1).padStart(2, '0')}_${safe}`);
        const buffer = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(target, buffer);
        saved.push({ imageIndex: i + 1, name: file.name || safe, path: target, mime: file.type || supplierInvoiceImageMime(file.name), size: buffer.length });
    }
    return saved;
}

function renderSupplierInvoiceSelectedFiles() {
    const input = getEl('supinv-image-files');
    const box = getEl('supinv-file-summary');
    if (!box) return;
    const files = [...(input?.files || [])];
    if (!files.length) {
        box.innerHTML = 'Chưa chọn ảnh hóa đơn.';
        return;
    }
    const used = Math.min(files.length, KBL_SUPPLIER_INVOICE_MAX_IMAGES);
    box.innerHTML = `<b>${used}</b> ảnh sẽ được đọc${files.length > KBL_SUPPLIER_INVOICE_MAX_IMAGES ? ` · ⚠️ chỉ lấy ${KBL_SUPPLIER_INVOICE_MAX_IMAGES}/${files.length} ảnh đầu` : ''}.`;
}


function resetSupplierInvoiceImportForNewUpload() {
    if (supplierInvoiceOcrBusy) {
        alert('Gemini đang đọc hóa đơn. Chờ đọc xong rồi bấm LÀM MỚI.');
        return;
    }
    const selectedCount = [...(getEl('supinv-image-files')?.files || [])].length;
    const itemCount = activeSupplierInvoiceImport?.items?.length || 0;
    if ((selectedCount || itemCount) && !confirm('Làm mới Tab 5 để chọn bộ ảnh hóa đơn khác?\n\nDữ liệu đang hiển thị sẽ được đóng lại. Món đã đưa sang Kho KHÔNG bị ảnh hưởng.')) return;

    // Nếu đang có dữ liệu OCR, lưu/đóng bản nháp thay vì xóa khỏi đĩa.
    // Nhờ dismissedAt, lần mở POS sau sẽ không tự nạp lại bản đã đóng này.
    if (activeSupplierInvoiceImport?.items?.length) {
        const visibleRows = readSupplierInvoiceImportRows();
        if (visibleRows.length) activeSupplierInvoiceImport.items = visibleRows;
        if (!activeSupplierInvoiceImport.id) activeSupplierInvoiceImport.id = `SUPDRAFT-${Date.now()}`;
        const now = new Date().toISOString();
        activeSupplierInvoiceImport.updatedAt = now;
        activeSupplierInvoiceImport.createdAt = activeSupplierInvoiceImport.createdAt || now;
        activeSupplierInvoiceImport.dismissedAt = now;
        const idx = supplierInvoiceDrafts.findIndex(d => String(d?.id || '') === String(activeSupplierInvoiceImport.id));
        const copy = JSON.parse(JSON.stringify(activeSupplierInvoiceImport));
        if (idx >= 0) supplierInvoiceDrafts[idx] = copy; else supplierInvoiceDrafts.unshift(copy);
        supplierInvoiceDrafts.sort((a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
        saveDBFile('supplier_invoice_drafts.json', supplierInvoiceDrafts);
    }

    activeSupplierInvoiceImport = null;
    const input = getEl('supinv-image-files');
    if (input) input.value = '';
    const fileSummary = getEl('supinv-file-summary');
    if (fileSummary) fileSummary.innerHTML = 'Chưa chọn ảnh hóa đơn.';
    const status = getEl('supinv-ai-status');
    if (status) {
        status.innerText = 'Đã làm mới. Chọn bộ ảnh hóa đơn mới rồi bấm GEMINI ĐỌC TOÀN BỘ.';
        status.style.color = '#475569';
    }
    renderSupplierInvoiceImportTable();
}

function buildSupplierInvoiceOcrPrompt(startIndex, endIndex) {
    return `Bạn đang bóc dữ liệu HÓA ĐƠN CHÀNH/NHÀ CUNG CẤP cho POS TIỆM VÀNG KIM BẢO LÂM.
Mỗi ảnh được gắn IMAGE_INDEX tuyệt đối từ ${startIndex} đến ${endIndex}. MỘT HÓA ĐƠN CÓ THỂ KÉO DÀI QUA NHIỀU ẢNH/TRANG LIÊN TIẾP. Hãy hiểu ảnh kế tiếp là phần tiếp của hóa đơn trước khi bố cục, số dòng, nội dung và thứ tự cho thấy rõ sự tiếp nối; nhưng TUYỆT ĐỐI không trộn hai hóa đơn khác nhau.

MỤC TIÊU: đọc từng dòng hàng trang sức và ghép đúng dòng "Tiền công" ngay sau nó, kể cả khi dòng hàng ở cuối ảnh trước còn dòng Tiền công nằm đầu ảnh kế tiếp.
Ví dụ mẫu:
103 | Vàng nữ trang 610 (1 Nhẫn: 27.8 - 1.2 = 26.6) | Chỉ | 0,266 | 8.800.000 | 2.340.800
104 | Tiền công | cái | 1 | 110.000 | 110.000
=> một món duy nhất: name="Nhẫn", goldContent="610", unit="Chỉ", grossLy=27.8, gemLy=1.2, netLy=26.6, weightChi=0.266, goldUnitPrice=8800000, goldAmount=2340800, originalWage=110000, sourceProductLineNo="103", sourceWageLineNo="104".

QUY TẮC KHÓA:
1) originalDescription phải chép đúng nội dung dòng HÀNG HÓA nhìn thấy. name chỉ lấy loại món ngắn như Nhẫn/Lắc/Dây/Bông Tai/Vòng/Mặt Dây/Kiềng; KHÔNG lấy nguyên câu dài.
2) Số 610/980/9999... nằm trong tên "Vàng nữ trang 610" là goldContent (HÀM LƯỢNG VÀNG), không phải tên món.
3) unit lấy Đơn vị tính của DÒNG HÀNG, với hóa đơn dạng này thường là "Chỉ".
4) weightChi lấy đúng cột Số lượng (Trọng lượng) của DÒNG HÀNG. 0,266 phải trả số JSON 0.266.
4a) Đọc thêm BA TRỌNG LƯỢNG trong ngoặc mô tả của CHÍNH DÒNG HÀNG: ví dụ "1 mặt: 48.8 - 7 = 41.8" thì grossLy=48.8 (tổng cân trước trừ), gemLy=7 (cân hột/đá), netLy=41.8 (vàng thực), đều tính bằng LY; weightChi=0.418 Chỉ từ cột số lượng. Không đổi chỗ ba số, không nhầm 610 là trọng lượng, không lấy cân của món khác.
4b) Chép nguyên biểu thức vào originalDescription. Nếu phép trừ bị che/mờ thì không đoán; để grossLy/gemLy/netLy rỗng và ghi warnings, người dùng phải xem ảnh gốc. Với hàng không có phép trừ hoặc không ghi cân hột, KHÔNG tự bịa số hột. Không tự thay weightChi để ép khớp.
5) goldUnitPrice chỉ lấy Đơn giá VÀNG của DÒNG HÀNG. KHÔNG lấy đơn giá của dòng Tiền công.
6) goldAmount chỉ lấy Thành tiền của DÒNG HÀNG. KHÔNG cộng tiền công vào goldAmount.
7) originalWage lấy đúng tiền của dòng "Tiền công" thuộc món ngay phía trên. Ghi sourceWageLineNo. Nếu không chắc dòng công thuộc món nào, để originalWage=0 và cảnh báo; không tự đoán.
8) Nếu hàng cuối một ảnh và dòng Tiền công nằm đầu ảnh kế tiếp, chỉ ghép khi cùng hóa đơn/trang tiếp nối và thật sự rõ ràng. Khi đó giữ imageIndex của ảnh có DÒNG HÀNG và ghi wageImageIndex của ảnh chứa dòng công. Nếu một dòng hàng bị cắt giữa 2 ảnh nhưng có phần chụp chồng đủ để nhận ra cùng một dòng, chỉ tạo 1 món, không tạo trùng.
9) Cùng một hóa đơn có thể có nhiều trang/ảnh. Không bắt buộc mỗi ảnh phải có lại tiêu đề/số hóa đơn. invoiceNumber, invoiceSymbol, date, supplierName chỉ bóc/giữ khi nhìn thấy rõ hoặc khi trang kế tiếp chắc chắn là phần tiếp nối trực tiếp của cùng hóa đơn; không suy đoán ký tự/số mờ.
10) Nếu số nào không chắc: để 0 hoặc chuỗi rỗng và thêm warnings. KHÔNG tự sửa cho khớp phép tính.
11) Không markdown, không giải thích ngoài JSON.

Trả JSON thuần đúng cấu trúc:
{"invoices":[{"imageIndex":${startIndex},"invoiceNumber":"","invoiceSymbol":"","date":"YYYY-MM-DD","supplierName":"","items":[{"sourceProductLineNo":"","sourceWageLineNo":"","wageImageIndex":0,"originalDescription":"","name":"Nhẫn","goldContent":"610","unit":"Chỉ","grossLy":27.8,"gemLy":1.2,"netLy":26.6,"weightChi":0.266,"goldUnitPrice":8800000,"goldAmount":2340800,"originalWage":110000,"warnings":[]}]}]}`;
}

function normalizeSupplierInvoiceAiItem(invoice, rawItem, index, imageMeta) {
    const description = String(rawItem?.originalDescription || rawItem?.description || '').trim();
    const imageIndex = Number(invoice?.imageIndex) || Number(imageMeta?.imageIndex) || 0;
    const weightChi = Math.max(0, supplierInvoiceWeightValue(rawItem?.weightChi ?? rawItem?.weight));
    const weights = supplierInvoiceReadThreeWeights(rawItem, description, weightChi);
    const goldUnitPrice = Math.max(0, Math.round(supplierInvoiceMoneyValue(rawItem?.goldUnitPrice ?? rawItem?.unitPrice)));
    const goldAmount = Math.max(0, Math.round(supplierInvoiceMoneyValue(rawItem?.goldAmount ?? rawItem?.amount)));
    const originalWage = Math.max(0, Math.round(supplierInvoiceMoneyValue(rawItem?.originalWage ?? rawItem?.wage)));
    return {
        id: `SUPITEM-${Date.now()}-${imageIndex}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        imageIndex,
        imageName: imageMeta?.name || '',
        invoiceNumber: String(invoice?.invoiceNumber || '').trim(),
        invoiceSymbol: String(invoice?.invoiceSymbol || '').trim(),
        invoiceDate: String(invoice?.date || '').trim(),
        supplierName: String(invoice?.supplierName || '').trim(),
        sourceProductLineNo: String(rawItem?.sourceProductLineNo || '').trim(),
        sourceWageLineNo: String(rawItem?.sourceWageLineNo || '').trim(),
        wageImageIndex: Number(rawItem?.wageImageIndex) || imageIndex,
        originalDescription: description,
        name: supplierInvoiceSimpleName(rawItem?.name, description),
        goldContent: supplierInvoiceGoldContent(rawItem?.goldContent, description),
        unit: supplierInvoiceUnit(rawItem?.unit || 'Chỉ'),
        weightChi,
        grossLy: weights.grossLy,
        gemLy: weights.gemLy,
        netLy: weights.netLy,
        weightReadStatus: weights.status,
        weightReadErrors: weights.errors,
        goldUnitPrice,
        goldAmount,
        originalWage,
        warnings: Array.isArray(rawItem?.warnings) ? rawItem.warnings.map(String).filter(Boolean) : [],
        pushedCode: ''
    };
}

function supplierInvoiceItemDedupeKey(item) {
    const line = String(item?.sourceProductLineNo || '').trim();
    // Chỉ tự gộp khi AI đọc được STT/dòng hàng. Nếu không có số dòng thì giữ riêng,
    // tránh vô tình làm mất 2 món giống hệt nhau trên cùng một ảnh.
    return line ? `${Number(item.imageIndex) || 0}|${line}`.toLowerCase() : `unique|${item.id || Math.random()}`;
}

function supplierInvoiceItemScore(item) {
    const check = supplierInvoiceMathCheck(item);
    return (check.valid ? 100 : 0) + (item.sourceWageLineNo ? 20 : 0) + (item.originalWage > 0 ? 10 : 0) + (item.invoiceNumber ? 5 : 0) - check.warnings.length;
}

function mergeSupplierInvoiceAiItems(items) {
    const map = new Map();
    items.forEach(item => {
        const key = supplierInvoiceItemDedupeKey(item);
        const prior = map.get(key);
        if (!prior || supplierInvoiceItemScore(item) > supplierInvoiceItemScore(prior)) map.set(key, item);
    });
    return [...map.values()].sort((a,b) => (a.imageIndex - b.imageIndex) || (Number(a.sourceProductLineNo) - Number(b.sourceProductLineNo)));
}

async function runSupplierInvoiceImageOCR() {
    if (supplierInvoiceOcrBusy) return;
    if (!GEMINI_API_KEY || !GEMINI_API_KEY.trim()) return alert('Chưa có Gemini API Key trong Cài đặt & AI.');
    const selected = [...(getEl('supinv-image-files')?.files || [])];
    if (!selected.length) return alert('Hãy chọn ảnh hóa đơn trước.');
    const files = selected.slice(0, KBL_SUPPLIER_INVOICE_MAX_IMAGES);
    if (activeSupplierInvoiceImport?.items?.length && !activeSupplierInvoiceImport?.pushedAt) {
        if (!confirm('Đang có dữ liệu HĐ chưa đưa hết sang Kho. Đọc bộ ảnh mới sẽ thay màn hình hiện tại; bản nháp đã lưu vẫn còn. Tiếp tục?')) return;
    }
    supplierInvoiceOcrBusy = true;
    const status = getEl('supinv-ai-status');
    const button = getEl('supinv-ai-read');
    if (button) button.disabled = true;
    if (status) { status.innerText = `⏳ Chuẩn bị ${files.length} ảnh...`; status.style.color = '#0f2747'; }
    try {
        const dataUrls = await Promise.all(files.map(fileToDataUrl));
        const sourceImages = await persistSupplierInvoiceImages(files);
        const allItems = [];
        const batchErrors = [];
        let usedModel = '';
        for (let start = 0; start < files.length; start += KBL_SUPPLIER_INVOICE_BATCH_STEP) {
            const endExclusive = Math.min(files.length, start + KBL_SUPPLIER_INVOICE_BATCH_SIZE);
            const parts = [{ text: buildSupplierInvoiceOcrPrompt(start + 1, endExclusive) }];
            for (let i = start; i < endExclusive; i++) {
                const url = dataUrls[i];
                const header = url.split(',')[0];
                const mime = (header.match(/data:([^;]+)/) || [])[1] || files[i].type || 'image/jpeg';
                parts.push({ text: `IMAGE_INDEX: ${i + 1} · FILE_NAME: ${files[i].name || `image-${i+1}`}` });
                parts.push({ inlineData: { mimeType: mime, data: url.split(',')[1] || '' } });
            }
            if (status) status.innerText = `⏳ Gemini đang đọc ảnh ${start + 1}–${endExclusive}/${files.length}...`;
            try {
                const result = await callGeminiAIAutoModel(GEMINI_API_KEY, parts);
                usedModel = result.usedModel || usedModel;
                let raw = String(result.data?.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
                const match = raw.match(/\{[\s\S]*\}/);
                if (!match) throw new Error('AI không trả JSON hợp lệ');
                const parsed = JSON.parse(match[0]);
                const invoices = Array.isArray(parsed?.invoices) ? parsed.invoices : [];
                invoices.forEach(inv => {
                    let imgIndex = Number(inv?.imageIndex) || 0;
                    if (!(imgIndex >= start + 1 && imgIndex <= endExclusive) && imgIndex >= 1 && imgIndex <= (endExclusive - start)) imgIndex = start + imgIndex;
                    if (!(imgIndex >= 1 && imgIndex <= files.length)) imgIndex = start + 1;
                    inv.imageIndex = imgIndex;
                    const meta = sourceImages.find(x => x.imageIndex === imgIndex) || sourceImages[imgIndex - 1];
                    (Array.isArray(inv?.items) ? inv.items : []).forEach((rawItem, idx) => {
                        allItems.push(normalizeSupplierInvoiceAiItem(inv, rawItem, idx, meta));
                    });
                });
            } catch (batchError) {
                console.error('Gemini HĐ batch lỗi:', batchError);
                batchErrors.push(`Ảnh ${start + 1}–${endExclusive}: ${batchError?.message || batchError}`);
            }
        }
        const items = mergeSupplierInvoiceAiItems(allItems);
        activeSupplierInvoiceImport = {
            id: `SUPDRAFT-${Date.now()}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sourceImages,
            items,
            usedModel,
            batchErrors,
            confirmedAt: '',
            pushedAt: ''
        };
        renderSupplierInvoiceImportTable();
        if (status) {
            status.innerText = items.length
                ? `✨ Đã bóc ${items.length} món từ ${files.length} ảnh${usedModel ? ` bằng ${usedModel}` : ''}.${batchErrors.length ? ` ⚠️ ${batchErrors.length} lượt ảnh cần đọc lại.` : ' Hãy kiểm tra bảng trước khi xác nhận.'}`
                : `❌ Chưa bóc được món nào. ${batchErrors.join(' · ') || 'Hãy kiểm tra chất lượng ảnh.'}`;
            status.style.color = items.length ? '#166534' : '#b91c1c';
        }
    } catch (error) {
        console.error('Gemini HĐ lỗi:', error);
        if (status) { status.innerText = `❌ ${error?.message || error}`; status.style.color = '#b91c1c'; }
    } finally {
        supplierInvoiceOcrBusy = false;
        if (button) button.disabled = false;
    }
}

function readSupplierInvoiceImportRows() {
    const rows = [...(getEl('supinv-import-tbody')?.querySelectorAll('tr[data-supitem-id]') || [])];
    if (!activeSupplierInvoiceImport) return [];
    const priorById = new Map((activeSupplierInvoiceImport.items || []).map(item => [String(item.id), item]));
    return rows.map(row => {
        const prior = priorById.get(String(row.dataset.supitemId || '')) || {};
        const get = field => row.querySelector(`[data-supf="${field}"]`)?.value;
        return {
            ...prior,
            invoiceNumber: String(get('invoiceNumber') ?? prior.invoiceNumber ?? '').trim(),
            name: supplierInvoiceSimpleName(get('name'), prior.originalDescription),
            goldContent: supplierInvoiceGoldContent(get('goldContent'), prior.originalDescription),
            unit: supplierInvoiceUnit(get('unit') || 'Chỉ'),
            weightChi: Math.max(0, supplierInvoiceWeightValue(get('weightChi'))),
            goldUnitPrice: Math.max(0, Math.round(supplierInvoiceMoneyValue(get('goldUnitPrice')))),
            goldAmount: Math.max(0, Math.round(supplierInvoiceMoneyValue(get('goldAmount')))),
            originalWage: Math.max(0, Math.round(supplierInvoiceMoneyValue(get('originalWage'))))
        };
    });
}

function refreshSupplierInvoiceImportFromTable() {
    if (!activeSupplierInvoiceImport) return;
    activeSupplierInvoiceImport.items = readSupplierInvoiceImportRows();
    activeSupplierInvoiceImport.confirmedAt = '';
    activeSupplierInvoiceImport.updatedAt = new Date().toISOString();
    renderSupplierInvoiceImportTable();
}

function renderSupplierInvoiceImportSummary() {
    const box = getEl('supinv-import-summary');
    if (!box) return;
    const items = activeSupplierInvoiceImport?.items || [];
    if (!items.length) {
        box.innerHTML = 'Chưa có dữ liệu AI đọc.';
        return;
    }
    let valid = 0, warnings = 0, invalid = 0, gold = 0, wage = 0, total = 0;
    items.forEach(item => {
        const check = supplierInvoiceMathCheck(item);
        if (check.valid) valid++; else invalid++;
        if (check.warnings.length) warnings++;
        gold += supplierInvoiceMoneyValue(item.goldAmount);
        wage += supplierInvoiceMoneyValue(item.originalWage);
        total += check.totalCost;
    });
    const state = activeSupplierInvoiceImport.pushedAt ? '✅ ĐÃ ĐƯA SANG KHO' : (activeSupplierInvoiceImport.confirmedAt ? '✅ ĐÃ XÁC NHẬN' : '📝 CHƯA XÁC NHẬN');
    box.innerHTML = `<b>${state}</b> · ${items.length} món · ✅ ${valid} khớp · ${invalid ? `🔴 ${invalid} lỗi` : '0 lỗi'} · ${warnings ? `⚠️ ${warnings} cảnh báo` : '0 cảnh báo'}<br>
        Vốn vàng: <b>${formatVND(gold)}</b> · Công gốc: <b>${formatVND(wage)}</b> · Tổng vốn theo HĐ: <b>${formatVND(total)}</b>`;
}

function renderSupplierInvoiceImportTable() {
    const tbody = getEl('supinv-import-tbody');
    if (!tbody) return;
    const items = activeSupplierInvoiceImport?.items || [];
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#64748b;padding:18px;">Chưa có dữ liệu. Chọn ảnh hóa đơn rồi bấm GEMINI ĐỌC TOÀN BỘ.</td></tr>';
        renderSupplierInvoiceImportSummary();
        return;
    }
    tbody.innerHTML = items.map(item => {
        const check = supplierInvoiceMathCheck(item);
        const statusColor = check.valid ? (check.warnings.length ? '#b7791f' : '#166534') : '#b91c1c';
        const statusText = check.valid
            ? (check.warnings.length ? `⚠️ ${check.warnings.join(' · ')}` : `✅ ${formatVND(check.expectedGold)} khớp`)
            : `🔴 ${check.errors.join(' · ')}`;
        const imageLabel = item.wageImageIndex && item.wageImageIndex !== item.imageIndex ? `${item.imageIndex}/${item.wageImageIndex}` : `${item.imageIndex || '?'}`;
        return `<tr data-supitem-id="${escapeHtml(item.id || '')}">
            <td style="white-space:nowrap;"><button type="button" class="btn btn-gray" style="padding:3px 6px;" onclick="showSupplierInvoiceSourceImage(${Number(item.imageIndex)||0})">Ảnh ${escapeHtml(imageLabel)}</button><br><small>${escapeHtml(item.invoiceSymbol || '')}</small></td>
            <td><input data-supf="invoiceNumber" class="form-control" value="${escapeHtml(item.invoiceNumber || '')}" style="min-width:85px" onchange="refreshSupplierInvoiceImportFromTable()"><br><small>${escapeHtml(item.sourceProductLineNo || '')}${item.sourceWageLineNo ? ` → công ${escapeHtml(item.sourceWageLineNo)}` : ''}</small></td>
            <td><input data-supf="name" class="form-control" value="${escapeHtml(item.name || '')}" style="min-width:95px" onchange="refreshSupplierInvoiceImportFromTable()"><br><small title="${escapeHtml(item.originalDescription || '')}">${escapeHtml((item.originalDescription || '').slice(0,55))}</small></td>
            <td><input data-supf="goldContent" class="form-control" value="${escapeHtml(item.goldContent || '')}" style="width:70px" onchange="refreshSupplierInvoiceImportFromTable()"></td>
            <td><input data-supf="unit" class="form-control" value="${escapeHtml(item.unit || 'Chỉ')}" style="width:62px" onchange="refreshSupplierInvoiceImportFromTable()"></td>
            <td><input data-supf="weightChi" type="number" step="0.001" min="0" class="form-control" value="${Number(item.weightChi)||0}" style="width:88px" onchange="refreshSupplierInvoiceImportFromTable()"></td>
            <td><input data-supf="goldUnitPrice" type="number" min="0" class="form-control" value="${Math.round(numberValue(item.goldUnitPrice))}" style="width:118px" onchange="refreshSupplierInvoiceImportFromTable()"></td>
            <td><input data-supf="goldAmount" type="number" min="0" class="form-control" value="${Math.round(numberValue(item.goldAmount))}" style="width:118px" onchange="refreshSupplierInvoiceImportFromTable()"></td>
            <td><input data-supf="originalWage" type="number" min="0" class="form-control" value="${Math.round(numberValue(item.originalWage))}" style="width:105px" onchange="refreshSupplierInvoiceImportFromTable()"></td>
            <td style="font-weight:800;color:#b91c1c;white-space:nowrap;">${formatVND(check.totalCost)}</td>
            <td style="min-width:190px;color:${statusColor};font-size:10px;font-weight:700;">${escapeHtml(statusText)}${item.pushedCode ? `<br><b>→ ${escapeHtml(item.pushedCode)}</b>` : ''}</td>
        </tr>`;
    }).join('');
    renderSupplierInvoiceImportSummary();
}

function saveSupplierInvoiceImportDraft(silent = false) {
    if (!activeSupplierInvoiceImport?.items?.length) {
        if (!silent) alert('Chưa có dữ liệu HĐ để lưu nháp.');
        return false;
    }
    const visibleRows = readSupplierInvoiceImportRows();
    if (visibleRows.length) activeSupplierInvoiceImport.items = visibleRows;
    if (!activeSupplierInvoiceImport.id) activeSupplierInvoiceImport.id = `SUPDRAFT-${Date.now()}`;
    activeSupplierInvoiceImport.updatedAt = new Date().toISOString();
    activeSupplierInvoiceImport.createdAt = activeSupplierInvoiceImport.createdAt || activeSupplierInvoiceImport.updatedAt;
    const idx = supplierInvoiceDrafts.findIndex(d => String(d.id) === String(activeSupplierInvoiceImport.id));
    const copy = JSON.parse(JSON.stringify(activeSupplierInvoiceImport));
    if (idx >= 0) supplierInvoiceDrafts[idx] = copy; else supplierInvoiceDrafts.unshift(copy);
    supplierInvoiceDrafts.sort((a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    saveDBFile('supplier_invoice_drafts.json', supplierInvoiceDrafts);
    renderSupplierInvoiceImportTable();
    if (!silent) alert('💾 Đã lưu nháp dữ liệu hóa đơn. Chưa có món nào được đưa sang Kho.');
    return true;
}

function confirmSupplierInvoiceImport() {
    if (!activeSupplierInvoiceImport?.items?.length) return alert('Chưa có dữ liệu HĐ để xác nhận.');
    const visibleRows = readSupplierInvoiceImportRows();
    if (visibleRows.length) activeSupplierInvoiceImport.items = visibleRows;
    const checks = activeSupplierInvoiceImport.items.map(supplierInvoiceMathCheck);
    const invalid = checks.filter(check => !check.valid);
    if (invalid.length) {
        activeSupplierInvoiceImport.confirmedAt = '';
        renderSupplierInvoiceImportTable();
        return alert(`🔴 Còn ${invalid.length} dòng sai/thiếu. Hãy xem ảnh gốc và sửa các dòng đỏ trước khi xác nhận.`);
    }
    const warningCount = checks.filter(check => check.warnings.length).length;
    const message = warningCount
        ? `Có ${warningCount} dòng cảnh báo (ví dụ chưa thấy rõ dòng công). Ông đã xem ảnh gốc và xác nhận các số đang đúng?`
        : `Xác nhận ${checks.length} món đã đối chiếu đúng với ảnh hóa đơn?`;
    if (!confirm(message)) return;
    activeSupplierInvoiceImport.confirmedAt = new Date().toISOString();
    activeSupplierInvoiceImport.updatedAt = activeSupplierInvoiceImport.confirmedAt;
    saveSupplierInvoiceImportDraft(true);
    renderSupplierInvoiceImportTable();
    alert('✅ Đã xác nhận dữ liệu HĐ. Chưa đụng Kho; chỉ khi bấm “ĐƯA MÓN ĐÃ DUYỆT SANG KHO” mới tạo món mới.');
}

function supplierInvoiceFindSupplier(name) {
    const target = String(name || '').trim().toLowerCase();
    if (!target) return null;
    const entries = typeof getSupplierEntries === 'function' ? getSupplierEntries() : [];
    return entries.find(entry => String(entry?.name || '').trim().toLowerCase() === target)
        || entries.find(entry => target.includes(String(entry?.name || '').trim().toLowerCase()) || String(entry?.name || '').trim().toLowerCase().includes(target))
        || null;
}

const KBL_PRODUCT_CODE_FIRST = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const KBL_PRODUCT_CODE_REST = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function isPermanentInventoryCode(code) {
    return /^KBL-K[A-Z][A-Z0-9]{4}$/i.test(String(code || '').trim());
}

function inventoryCodeMigrationTargets() {
    return (Array.isArray(inventoryStore) ? inventoryStore : []).filter(item => {
        if (!item || typeof item !== 'object') return false;
        const status = String(item.status || '').trim().toLowerCase();
        if (status.includes('đã bán')) return false;
        return !isPermanentInventoryCode(item.code);
    });
}

function collectReservedInventoryCodes() {
    const used = new Set();
    const add = value => {
        const code = String(value || '').trim().toUpperCase();
        if (code) used.add(code);
    };

    (Array.isArray(inventoryStore) ? inventoryStore : []).forEach(item => {
        add(item?.code);
        add(item?.originalCode);
        (Array.isArray(item?.codeHistory) ? item.codeHistory : []).forEach(add);
    });
    (Array.isArray(salesStore) ? salesStore : []).forEach(tx => {
        add(tx?.invCode);
        add(tx?.originalInvCode);
        (Array.isArray(tx?.invCodes) ? tx.invCodes : []).forEach(add);
        (Array.isArray(tx?.originalInvCodes) ? tx.originalInvCodes : []).forEach(add);
        (Array.isArray(tx?.items) ? tx.items : []).forEach(line => {
            add(line?.invCode);
            add(line?.originalInvCode);
            add(line?.sku);
            add(line?.code);
        });
    });
    (Array.isArray(supplierInvoices) ? supplierInvoices : []).forEach(row => {
        add(row?.sku);
        add(row?.originalSku);
    });
    (Array.isArray(supplierInvoiceDrafts) ? supplierInvoiceDrafts : []).forEach(draft => {
        (Array.isArray(draft?.items) ? draft.items : []).forEach(item => add(item?.pushedCode));
    });
    return used;
}

function createPermanentInventoryCode(reservedCodes) {
    const used = reservedCodes instanceof Set ? reservedCodes : collectReservedInventoryCodes();
    const pick = alphabet => {
        try {
            if (crypto && typeof crypto.randomBytes === 'function') {
                return alphabet[crypto.randomBytes(1)[0] % alphabet.length];
            }
        } catch (_) {}
        return alphabet[Math.floor(Math.random() * alphabet.length)];
    };

    for (let attempt = 0; attempt < 2000; attempt++) {
        let suffix = pick(KBL_PRODUCT_CODE_FIRST);
        for (let i = 0; i < 4; i++) suffix += pick(KBL_PRODUCT_CODE_REST);
        const code = `KBL-K${suffix}`;
        if (!used.has(code)) {
            used.add(code);
            return code;
        }
    }
    throw new Error('Không tạo được Mã SP mới không trùng.');
}

function nextInventoryCodes(count) {
    const used = collectReservedInventoryCodes();
    const codes = [];
    for (let i = 0; i < Math.max(0, Number(count) || 0); i++) codes.push(createPermanentInventoryCode(used));
    return codes;
}

function pushConfirmedSupplierInvoiceItemsToInventory() {
    if (!activeSupplierInvoiceImport?.items?.length) return alert('Chưa có dữ liệu HĐ.');
    if (!activeSupplierInvoiceImport.confirmedAt) return alert('Hãy bấm ✅ XÁC NHẬN DỮ LIỆU trước.');
    const remaining = activeSupplierInvoiceImport.items.filter(item => !item.pushedCode);
    if (!remaining.length) return alert('Các món của bản HĐ này đã được đưa sang Kho rồi.');
    const invalid = remaining.filter(item => !supplierInvoiceMathCheck(item).valid);
    if (invalid.length) return alert(`Dữ liệu đã thay đổi sau khi xác nhận hoặc còn ${invalid.length} dòng lỗi. Hãy xác nhận lại trước.`);
    if (!confirm(`Đưa ${remaining.length} món đã duyệt sang Kho?\n\nTab 5 chỉ ghi dữ liệu đầu vào. Các món vào Kho ở trạng thái chờ hoàn thiện; POS không tự đẩy Web Admin. Khi kiểm/chỉnh xong ở Kho, ông bấm ĐỒNG BỘ WEB ADMIN rồi vào Admin tải ảnh/duyệt trưng bày.`)) return;
    const codes = nextInventoryCodes(remaining.length);
    const now = new Date().toISOString();
    remaining.forEach((item, idx) => {
        const code = codes[idx];
        const check = supplierInvoiceMathCheck(item);
        const weightLy = roundWeightLy(numberValue(item.weightChi) * 100);
        // Giữ ba số Gemini đã đối chiếu để mẫu tem TKL/KLH/KLV hiện hữu tự đọc đúng.
        const grossLy = item.weightReadStatus === 'verified' ? roundWeightLy(item.grossLy) : weightLy;
        const gemLy = item.weightReadStatus === 'verified' ? roundWeightLy(item.gemLy) : 0;
        const supplier = supplierInvoiceFindSupplier(item.supplierName);
        const supplierName = supplier?.name || item.supplierName || '';
        const supplierAddress = supplier?.address || '';
        const supplierCode = supplier?.code || supplierAbbreviation(supplierName);
        const type = String(item.goldContent || '').trim() || '610';
        const supplierPurity = type === '610'
            ? smartClampPurity(settingsStore.exchange_new_purity_610_default, 63)
            : (type === '980' ? 98.5 : (type === '9999' ? 99.99 : smartClampPurity(Number(type) / 10, 99.99)));
        const audit = {
            source: 'supplier_invoice_ai',
            draftId: activeSupplierInvoiceImport.id,
            invoiceNumber: item.invoiceNumber || '',
            invoiceSymbol: item.invoiceSymbol || '',
            invoiceDate: item.invoiceDate || '',
            supplierName,
            sourceImageIndex: item.imageIndex || 0,
            sourceImageName: item.imageName || '',
            sourceProductLineNo: item.sourceProductLineNo || '',
            sourceWageLineNo: item.sourceWageLineNo || '',
            originalDescription: item.originalDescription || '',
            unit: 'Chỉ',
            weightChi: numberValue(item.weightChi),
            grossLy,
            gemLy,
            netLy: weightLy,
            weightReadStatus: item.weightReadStatus || 'legacy',
            goldUnitPrice: Math.round(numberValue(item.goldUnitPrice)),
            goldAmount: Math.round(numberValue(item.goldAmount)),
            originalWage: Math.round(numberValue(item.originalWage)),
            totalCost: Math.round(check.totalCost),
            importedAt: now
        };
        const inventoryUid = newInventoryUid();
        inventoryStore.unshift({
            code,
            inventoryUid,
            originalCode: code,
            codeHistory: [],
            sourceType: 'supplier',
            sourceId: `HĐ:${item.invoiceNumber || activeSupplierInvoiceImport.id}`,
            sourceBatchId: item.invoiceNumber || '',
            sourceLotRefs: [],
            costAuditSnapshot: audit,
            sourceNote: item.originalDescription || '',
            name: supplierInvoiceSimpleName(item.name, item.originalDescription),
            type,
            supplierPurity,
            weightLy,
            grossLy,
            gemLy,
            lossLy: 0,
            productSymbol: code,
            specialMark: '',
            origin: 'Việt Nam',
            attachedWeightChi: gemLy / 100,
            totalWeightChi: grossLy / 100,
            producerName: supplierName,
            producerCode: supplierCode,
            producerAddress: supplierAddress,
            supplierName,
            supplierAddress,
            applicableStandard: supplier?.tccs || '',
            goldCostPrice: Math.round(numberValue(item.goldUnitPrice)),
            goldCostTotal: Math.round(numberValue(item.goldAmount)),
            originalWage: Math.round(numberValue(item.originalWage)),
            processCost: 0,
            sellWage: 0,
            totalCost: Math.round(check.totalCost),
            invoiceImport: audit,
            supplier: supplier ? { ...supplier } : (supplierName ? { name: supplierName, code: supplierCode, address: supplierAddress, tccs: '' } : null),
            webLabelSchemaVersion: 1,
            webSyncReady: false,
            status: 'Chờ nhập công bán',
            dateAdd: now
        });
        item.pushedCode = code;
        item.pushedAt = now;
    });
    activeSupplierInvoiceImport.pushedAt = activeSupplierInvoiceImport.items.every(item => item.pushedCode) ? now : '';
    activeSupplierInvoiceImport.updatedAt = now;
    saveDBFile('inventory_db.json', inventoryStore);
    saveSupplierInvoiceImportDraft(true);
    renderInventoryTable();
    generateProductCode();
    renderSupplierInvoiceImportTable();
    alert(`✅ Đã đưa ${remaining.length} món sang Kho.\n\nHÀNG CŨ KHÔNG BỊ ĐỤNG.\nTab 5 chỉ ghi dữ liệu đầu vào. Ông kiểm/chỉnh món tại Kho khi cần; khi sẵn sàng mới bấm ☁️ ĐỒNG BỘ WEB ADMIN, sau đó vào Admin tải ảnh/duyệt rồi mới trưng bày.`);
}

function showSupplierInvoiceSourceImage(imageIndex) {
    const images = activeSupplierInvoiceImport?.sourceImages || [];
    const meta = images.find(item => Number(item.imageIndex) === Number(imageIndex));
    if (!meta?.path || !fs.existsSync(meta.path)) return alert('Không tìm thấy ảnh gốc đã lưu của dòng này.');
    try {
        const data = fs.readFileSync(meta.path);
        const mime = meta.mime || supplierInvoiceImageMime(meta.name);
        const src = `data:${mime};base64,${data.toString('base64')}`;
        let modal = getEl('supinv-source-image-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'supinv-source-image-modal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.82);display:none;align-items:center;justify-content:center;padding:20px;';
            modal.addEventListener('click', event => { if (event.target === modal) hideSupplierInvoiceSourceImage(); });
            document.body.appendChild(modal);
        }
        modal.innerHTML = `<div style="max-width:96vw;max-height:94vh;background:#fff;padding:10px;border-radius:8px;overflow:auto;position:relative;">
            <div style="display:flex;justify-content:space-between;gap:15px;align-items:center;margin-bottom:8px;"><b>Ảnh ${Number(meta.imageIndex)||''} · ${escapeHtml(meta.name || '')}</b><button type="button" class="btn btn-danger" onclick="hideSupplierInvoiceSourceImage()">Đóng</button></div>
            <img src="${src}" style="display:block;max-width:92vw;max-height:84vh;width:auto;height:auto;margin:auto;">
        </div>`;
        modal.style.display = 'flex';
    } catch (error) {
        alert(`Không mở được ảnh gốc: ${error?.message || error}`);
    }
}

function hideSupplierInvoiceSourceImage() {
    const modal = getEl('supinv-source-image-modal');
    if (modal) modal.style.display = 'none';
}



function reuseCustomerInfo(recordId) {
    clearPurchaseEditMode();
    const record = dataStoreRecords.find(r => r.id === recordId);
    if (!record) return alert("Không tìm thấy thông tin phiếu này!");

    if (getEl('buy-name')) getEl('buy-name').value = record.name || '';
    if (getEl('buy-cccd')) getEl('buy-cccd').value = record.cccd || '';
    if (getEl('buy-phone')) getEl('buy-phone').value = record.phone || '';
    if (getEl('buy-address')) getEl('buy-address').value = record.address || '';
    if (getEl('buy-date-issue')) getEl('buy-date-issue').value = record.dateIssue || '';
    if (getEl('buy-place-issue')) getEl('buy-place-issue').value = record.placeIssue || 'Cục CS QLHC về TTXH';
    if (getEl('buy-pay-method')) getEl('buy-pay-method').value = record.payMethod || 'tien_mat';
    if (getEl('buy-bank-name')) getEl('buy-bank-name').value = record.bankName || '';
    if (getEl('buy-bank-acc')) getEl('buy-bank-acc').value = record.bankAcc || '';
    if (getEl('buy-bank-holder')) getEl('buy-bank-holder').value = record.bankHolder || (record.name ? record.name.toUpperCase() : '');

    ['b-w-l', 'b-w-c', 'b-w-p', 'b-w-y', 'b-g-l', 'b-g-c', 'b-g-p', 'b-g-y', 'buy-fee'].forEach(id => {
        if (getEl(id)) getEl(id).value = 0;
    });
    resetPurchaseItems();
    clearA4ManualEdits();

    const d = new Date();
    document.querySelectorAll('.lbl-real-day').forEach(el => el.innerText = String(d.getDate()).padStart(2, '0'));
    document.querySelectorAll('.lbl-real-month').forEach(el => el.innerText = String(d.getMonth() + 1).padStart(2, '0'));
    document.querySelectorAll('.lbl-real-year').forEach(el => el.innerText = d.getFullYear());
    if (getEl('a4-date')) getEl('a4-date').innerText = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    resetDraftNKCode();

    const frontImg = record.imgFront || '';
    const backImg = record.imgBack || '';
    if (getEl('a4-img-front')) { getEl('a4-img-front').src = frontImg; getEl('a4-img-front').style.display = frontImg ? 'block' : 'none'; }
    if (getEl('a4-img-back')) { getEl('a4-img-back').src = backImg; getEl('a4-img-back').style.display = backImg ? 'block' : 'none'; }
    if (getEl('view-front')) { getEl('view-front').src = frontImg; getEl('view-front').style.display = frontImg ? 'block' : 'none'; }
    if (getEl('view-back')) { getEl('view-back').src = backImg; getEl('view-back').style.display = backImg ? 'block' : 'none'; }

    syncBuyUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    alert(`✅ Đã nạp thông tin khách: ${record.name}.\n\nHãy đặt vàng lên Cân để lưu thành một PHIẾU MỚI độc lập!`);
}

function viewOldPurchaseRecord(recordId) {
    clearPurchaseEditMode();
    const record = dataStoreRecords.find(r => r.id === recordId);
    if (!record) return alert("Không tìm thấy phiếu!");

    const storedItems = normalizeStoredPurchaseItems(record);
    a4ManualEdits = { ...(record.a4Edits || {}) };

    if (getEl('buy-name')) getEl('buy-name').value = record.name || '';
    if (getEl('buy-cccd')) getEl('buy-cccd').value = record.cccd || '';
    if (getEl('buy-phone')) getEl('buy-phone').value = record.phone || '';
    if (getEl('buy-address')) getEl('buy-address').value = record.address || '';
    if (getEl('buy-date-issue')) getEl('buy-date-issue').value = record.dateIssue || '';
    if (getEl('buy-place-issue')) getEl('buy-place-issue').value = record.placeIssue || 'Cục CS QLHC về TTXH';
    loadPurchaseItemsIntoEditor(storedItems);
    if (getEl('buy-pay-method')) getEl('buy-pay-method').value = record.payMethod || 'tien_mat';
    if (getEl('buy-bank-name')) getEl('buy-bank-name').value = record.bankName || '';
    if (getEl('buy-bank-acc')) getEl('buy-bank-acc').value = record.bankAcc || '';
    if (getEl('buy-bank-holder')) getEl('buy-bank-holder').value = record.bankHolder || (record.name ? record.name.toUpperCase() : '');

    if (getNKNumberFromCode(record.nkCode)) {
        currentDraftNKCode = record.nkCode;
        if (getEl('nk-code')) getEl('nk-code').innerText = record.nkCode;
    } else {
        resetDraftNKCode();
    }

    syncBuyUI();

    const oldDateParts = purchaseRecordDateParts(record);
    if (oldDateParts) {
        activePurchaseLockedDate = oldDateParts.display;
        // Chỉ khóa ngày khi đang sửa; ở chế độ Mở chỉ áp dụng một lần để
        // phôi hiển thị đúng ngày lịch sử rồi trả cờ về rỗng.
        const previousEditId = activePurchaseEditId;
        activePurchaseEditId = '__view_only__';
        applyPurchaseLockedDate();
        activePurchaseEditId = previousEditId;
        activePurchaseLockedDate = '';
    } else if (getEl('a4-date')) {
        getEl('a4-date').innerText = record.dateStr || '';
    }
    renderPurchaseItems();
    if (getEl('a4-weight')) getEl('a4-weight').innerText = storedItems[0].weightText || weightTextFromLy(storedItems[0].netLy);
    if (getEl('a4-price')) getEl('a4-price').innerText = formatVND(storedItems[0].price || 0);
    if (getEl('a4-total')) getEl('a4-total').innerText = formatVND(storedItems[0].totalVND || 0);
    if (getEl('gd-total')) getEl('gd-total').innerText = formatVND(record.money || 0);
    if (getEl('gd-weight')) getEl('gd-weight').innerText = record.weightText || (record.netLy + ' ly');
    if (getEl('nk-total')) getEl('nk-total').innerText = formatVND(record.money || 0);
    if (getEl('nk-weight')) getEl('nk-weight').innerText = record.weightText || (record.netLy + ' ly');

    const frontImg = record.imgFront || '';
    const backImg = record.imgBack || '';
    if (getEl('a4-img-front')) { getEl('a4-img-front').src = frontImg; getEl('a4-img-front').style.display = frontImg ? 'block' : 'none'; }
    if (getEl('a4-img-back')) { getEl('a4-img-back').src = backImg; getEl('a4-img-back').style.display = backImg ? 'block' : 'none'; }
    if (getEl('view-front')) { getEl('view-front').src = frontImg; getEl('view-front').style.display = frontImg ? 'block' : 'none'; }
    if (getEl('view-back')) { getEl('view-back').src = backImg; getEl('view-back').style.display = backImg ? 'block' : 'none'; }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteRecord(recordId, idx) {
    const recordForDelete = dataStoreRecords.find(record => String(record?.id || '') === String(recordId || ''));
    const linkedSale = (Array.isArray(salesStore) ? salesStore : []).find(tx =>
        String(tx?.exchangePurchaseRecordId || tx?.exchangePurchaseDocId || '') === String(recordId) ||
        (recordForDelete?.transactionGroupId && String(tx?.transactionGroupId || '') === String(recordForDelete.transactionGroupId))
    );
    if (linkedSale) {
        return alert(`🔒 Không thể xóa phiếu Thu Mua ${recordId} vì đang liên kết với phiếu đổi/bán ${linkedSale.id}. Hãy xử lý hồ sơ liên kết trước để tránh đứt chuỗi chứng từ.`);
    }
    const linkedBatch = chanhBatches.find(batch => (batch.sourceLots || []).some(lot => String(lot.recordId) === String(recordId)));
    if (linkedBatch) {
        return alert(`🔒 Không thể xóa phiếu ${recordId} vì đã được dùng làm nguồn giá vốn trong batch ${linkedBatch.id}. Hãy giữ chứng từ gốc; nếu có sai sót, sửa/cập nhật batch để hệ thống lưu phiên bản thay vì xóa dấu vết.`);
    }
    if (confirm(`Bạn có chắc chắn muốn xóa phiếu [${recordId}]? Phiếu chưa được dùng trong batch chành.`)) {
        dataStoreRecords.splice(idx, 1);
        saveDBFile('database.db', dataStoreRecords);
        compileBuyTable();
        alert(`🗑️ Đã xóa phiếu ${recordId}!`);
    }
}

function transferToInventory() {
    if (dataStoreRecords.length === 0) return alert("Chưa có phiếu mua nào để chuyển!");
    const latestBuy = dataStoreRecords[0]; 
    const purchaseItems = normalizeStoredPurchaseItems(latestBuy);

    if (purchaseItems.length > 1) {
        const alreadyTransferred = new Set(
            inventoryStore
                .filter(item => item.sourceId === latestBuy.id && item.sourceItemIndex != null)
                .map(item => Number(item.sourceItemIndex))
        );
        let addedCount = 0;

        const reservedCodes = collectReservedInventoryCodes();
        purchaseItems.forEach((item, index) => {
            if (alreadyTransferred.has(index)) return;
            const code = createPermanentInventoryCode(reservedCodes);
            const inventoryUid = newInventoryUid();
            inventoryStore.unshift({
                sourceType: 'purchase',
                code,
                inventoryUid,
                originalCode: code,
                codeHistory: [],
                sourceId: latestBuy.id,
                sourceItemIndex: index,
                name: item.goods,
                type: item.goldType || '9999',
                weightLy: numberValue(item.netLy),
                grossLy: numberValue(item.netLy),
                gemLy: 0,
                lossLy: 0,
                goldCostPrice: numberValue(item.price),
                goldCostTotal: numberValue(item.totalVND),
                originalWage: 0,
                processCost: 0,
                sellWage: 0,
                totalCost: numberValue(item.totalVND),
                status: 'Đang bán',
                dateAdd: new Date().toISOString()
            });
            addedCount++;
        });

        if (addedCount > 0) {
            saveDBFile('inventory_db.json', inventoryStore);
            latestBuy.inventoryTransferredItems = Array.from(new Set([
                ...(latestBuy.inventoryTransferredItems || []),
                ...purchaseItems.map((_, index) => index).filter(index => !alreadyTransferred.has(index))
            ]));
            saveDBFile('database.db', dataStoreRecords);
            if (typeof renderInventoryTable === 'function') renderInventoryTable();
            generateProductCode();
            alert(`✅ Đã chuyển ${addedCount} món của phiếu ${latestBuy.id} vào kho thành từng sản phẩm riêng.`);
        } else {
            alert(`ℹ️ Các món của phiếu ${latestBuy.id} đã được chuyển vào kho trước đó.`);
        }
        switchTab('tab-kho');
        return;
    }

    if (getEl('inv-source-type')) getEl('inv-source-type').value = 'purchase';
    if (getEl('inv-source-id')) getEl('inv-source-id').value = latestBuy.id; 
    if (getEl('inv-source-note')) getEl('inv-source-note').value = `Phiếu ${latestBuy.id}`;
    if (getEl('inv-name')) getEl('inv-name').value = latestBuy.goods; 
    if (getEl('inv-gold-type')) getEl('inv-gold-type').value = latestBuy.goldType || "9999"; 
    if (getEl('inv-cost-base')) getEl('inv-cost-base').value = latestBuy.money;
    
    if (getEl('i-t-l')) getEl('i-t-l').value = Math.floor((latestBuy.netLy || 0) / 1000); 
    if (getEl('i-t-c')) getEl('i-t-c').value = Math.floor(((latestBuy.netLy || 0) % 1000) / 100); 
    if (getEl('i-t-p')) getEl('i-t-p').value = Math.floor(((latestBuy.netLy || 0) % 100) / 10); 
    if (getEl('i-t-y')) getEl('i-t-y').value = (latestBuy.netLy || 0) % 10;
    
    switchTab('tab-kho'); 
    calcInvMath();
}

// =================================================================
// 6. TAB 3: KHO - NGUỒN GỐC, NCC, GIÁ VỐN VÀ CÔNG BÁN
// =================================================================
function supplierAbbreviation(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .trim()
        .split(/\s+/)
        .map(word => word.replace(/[^A-Za-z0-9]/g, '').charAt(0))
        .filter(Boolean)
        .join('')
        .toUpperCase()
        .slice(0, 16);
}

function normalizeSupplierEntry(entry) {
    if (typeof entry === 'string') return { name: entry, code: supplierAbbreviation(entry), address: '', tccs: '' };
    if (!entry || typeof entry !== 'object') return null;
    const name = String(entry.name || entry.label || entry.supplier || '').trim();
    if (!name) return null;
    return {
        name,
        code: String(entry.code || entry.shortCode || entry.maNhaSanXuat || supplierAbbreviation(name)).trim().toUpperCase().slice(0, 16),
        address: String(entry.address || entry.addr || '').trim(),
        tccs: String(entry.tccs || entry.TCCS || '').trim()
    };
}

function getSupplierEntries() {
    const raw = Array.isArray(settingsStore.nccList) ? settingsStore.nccList : [];
    const seen = new Set();
    const entries = [];
    raw.forEach(item => {
        const supplier = normalizeSupplierEntry(item);
        if (supplier && !seen.has(supplier.name)) {
            seen.add(supplier.name);
            entries.push(supplier);
        }
    });
    settingsStore.nccList = entries;
    return entries;
}

function loadNccList() {
    const select = getEl('inv-ncc');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Chọn nhà cung cấp...</option>';
    getSupplierEntries().forEach(supplier => {
        const option = document.createElement('option');
        option.value = supplier.name;
        option.textContent = supplier.name;
        select.appendChild(option);
    });
    if (current && getSupplierEntries().some(s => s.name === current)) select.value = current;
    selectInventorySupplier();
}

function selectInventorySupplier() {
    const select = getEl('inv-ncc');
    const details = getEl('selected-supplier-details');
    if (!select) return null;
    const supplier = getSupplierEntries().find(item => item.name === select.value) || null;
    if (details) {
        details.innerText = supplier
            ? [supplier.code && `Mã: ${supplier.code}`, supplier.address && `Đ/c: ${supplier.address}`, supplier.tccs && `TCCS: ${supplier.tccs}`].filter(Boolean).join(' | ')
            : '';
    }
    return supplier;
}

function syncSupplierTccs() {
    const supplier = selectInventorySupplier();
    if (getEl('inv-tccs')) getEl('inv-tccs').value = supplier?.tccs || '';
}

function openSupplierForm() {
    const form = getEl('supplier-form');
    if (!form) return;
    form.style.display = 'block';
    if (getEl('new-supplier-name')) getEl('new-supplier-name').focus();
}

function cancelSupplierForm() {
    const form = getEl('supplier-form');
    if (form) form.style.display = 'none';
    ['new-supplier-name', 'new-supplier-address', 'new-supplier-tccs'].forEach(id => {
        if (getEl(id)) getEl(id).value = '';
    });
}

function saveNewSupplier() {
    const supplier = normalizeSupplierEntry({
        name: getEl('new-supplier-name') ? getEl('new-supplier-name').value : '',
        address: getEl('new-supplier-address') ? getEl('new-supplier-address').value : '',
        tccs: getEl('new-supplier-tccs') ? getEl('new-supplier-tccs').value : ''
    });
    if (!supplier) return alert('Vui lòng nhập tên nhà cung cấp.');
    const entries = getSupplierEntries();
    const index = entries.findIndex(item => item.name.toLowerCase() === supplier.name.toLowerCase());
    if (index >= 0) entries[index] = supplier;
    else entries.push(supplier);
    settingsStore.nccList = entries;
    saveDBFile('settings.json', settingsStore);
    loadNccList();
    if (getEl('inv-ncc')) getEl('inv-ncc').value = supplier.name;
    selectInventorySupplier();
    syncSupplierTccs();
    cancelSupplierForm();
    syncInvUI();
}

function loadInventorySources() {
    const select = getEl('inv-purchase-source');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Chọn phiếu thu mua...</option>';
    dataStoreRecords.forEach(record => {
        const items = normalizeStoredPurchaseItems(record);
        items.forEach((item, index) => {
            const option = document.createElement('option');
            option.value = `${record.id || ''}::${index}`;
            option.textContent = `${record.id || 'Phiếu'} - ${item.goods || 'Món hàng'} (${numberValue(item.netLy)} ly)`;
            select.appendChild(option);
        });
    });
    if (current && Array.from(select.options).some(option => option.value === current)) select.value = current;
}

function syncInvSourceUI() {
    const type = getEl('inv-source-type') ? getEl('inv-source-type').value : 'purchase';
    if (getEl('inv-supplier-purity') && String(getEl('inv-supplier-purity').dataset.manual || '') !== '1') syncInvSupplierPurityDefault(true);
    const purchase = getEl('inv-purchase-source');
    const sourceId = getEl('inv-source-id');
    const note = getEl('inv-source-note');
    const isPurchase = type === 'purchase';
    if (purchase) purchase.style.display = isPurchase ? 'block' : 'none';
    if (sourceId) sourceId.style.display = 'none';
    if (note) note.style.display = 'none';
    if (!isPurchase && sourceId && !sourceId.value) {
        const supplier = selectInventorySupplier();
        sourceId.value = supplier ? `NCC:${supplier.name}` : 'supplier';
    }
}

function selectInventoryPurchaseSource() {
    const value = getEl('inv-purchase-source') ? getEl('inv-purchase-source').value : '';
    if (!value) return;
    const [recordId, itemIndexText] = value.split('::');
    const record = dataStoreRecords.find(item => String(item.id || '') === String(recordId));
    if (!record) return;
    const item = normalizeStoredPurchaseItems(record)[Number(itemIndexText) || 0];
    if (!item) return;
    if (getEl('inv-source-id')) getEl('inv-source-id').value = record.id || '';
    if (getEl('inv-source-note')) getEl('inv-source-note').value = `Món ${Number(itemIndexText) + 1} từ phiếu ${record.id || ''}`;
    if (getEl('inv-name')) getEl('inv-name').value = item.goods || '';
    if (getEl('inv-gold-type')) getEl('inv-gold-type').value = item.goldType || '9999';
    const netLy = numberValue(item.netLy);
    ['i-h-l', 'i-h-c', 'i-h-p', 'i-h-y', 'i-l-l', 'i-l-c', 'i-l-p', 'i-l-y'].forEach(id => { if (getEl(id)) getEl(id).value = 0; });
    setWeightInputs('i-t', netLy);
    if (getEl('inv-cost-base') && numberValue(item.totalVND || record.money) > 0) {
        getEl('inv-cost-base').value = numberValue(item.totalVND || record.money);
    }
    calcInvMath();
}

function generateProductCode(force = false) {
    const field = getEl('inv-new-code');
    if (!field || editingInventoryCode) return;
    const used = collectReservedInventoryCodes();
    const current = String(field.value || '').trim().toUpperCase();
    const draftLooksValid = isPermanentInventoryCode(current) && !used.has(current);
    if (!force && draftLooksValid) return;
    field.value = createPermanentInventoryCode(used);
}

function calcInvMath() {
    rememberInvCostDefaults();
    const value = id => parseFloat(getEl(id) ? getEl(id).value : 0) || 0;
    const grossLy = weightPartsToLy(value('i-t-l'), value('i-t-c'), value('i-t-p'), value('i-t-y'));
    const gemLy = weightPartsToLy(value('i-h-l'), value('i-h-c'), value('i-h-p'), value('i-h-y'));
    const lossLy = weightPartsToLy(value('i-l-l'), value('i-l-c'), value('i-l-p'), value('i-l-y'));
    let netLy = Math.max(0, roundWeightLy(grossLy - gemLy - lossLy));
    if (getEl('lbl-inv-gross-ly')) getEl('lbl-inv-gross-ly').innerText = `${formatWeightLy(grossLy)} ly`;
    if (getEl('lbl-inv-gem-ly')) getEl('lbl-inv-gem-ly').innerText = `${formatWeightLy(gemLy)} ly`;
    if (getEl('lbl-inv-loss-ly')) getEl('lbl-inv-loss-ly').innerText = `${formatWeightLy(lossLy)} ly`;
    if (getEl('lbl-inv-final-ly')) getEl('lbl-inv-final-ly').innerText = `${formatWeightLy(netLy)} ly`;

    const goldPrice = value('inv-gold-price');
    const manualGoldTotal = value('inv-cost-base');
    const goldCost = manualGoldTotal > 0 ? manualGoldTotal : (goldPrice > 0 ? Math.round((netLy / 100) * goldPrice) : 0);
    const processCost = 0;
    const originalWage = value('inv-cost-wage');
    const totalCost = goldCost + originalWage;
    if (getEl('lbl-inv-total-cost')) getEl('lbl-inv-total-cost').innerText = formatVND(totalCost);
    syncInvUI(grossLy, gemLy, netLy);
    return { grossLy, gemLy, lossLy, netLy, goldPrice, goldCost, processCost, originalWage, totalCost };
}

function syncInvUI(grossLy, gemLy, netLy) {
    if (typeof grossLy === 'undefined') {
        const math = calcInvMath();
        grossLy = math.grossLy; gemLy = math.gemLy; netLy = math.netLy;
    }
    const code = getEl('inv-new-code') ? getEl('inv-new-code').value : 'KBL-K0000';
    const name = getEl('inv-name') ? (getEl('inv-name').value || 'SP') : 'SP';
    const type = getEl('inv-gold-type') ? getEl('inv-gold-type').value : '9999';
    const wage = parseFloat(getEl('inv-sell-wage') ? getEl('inv-sell-wage').value : 0) || 0;
    const kh = getEl('inv-k-h') ? getEl('inv-k-h').value : '';
    const supplier = selectInventorySupplier();
    const sourceType = getEl('inv-source-type')?.value || 'purchase';
    const purchaseSource = getEl('inv-purchase-source')?.value || '';

    if (getEl('t-name')) getEl('t-name').innerText = name;
    if (getEl('t-klt')) getEl('t-klt').innerText = `${(grossLy / 100).toFixed(3)} Chỉ`;
    if (getEl('t-klh')) getEl('t-klh').innerText = `${(gemLy / 100).toFixed(3)} Chỉ`;
    if (getEl('t-kh')) getEl('t-kh').innerText = kh || '—';
    if (getEl('t-klv')) getEl('t-klv').innerText = `${(netLy / 100).toFixed(3)} Chỉ`;
    if (getEl('t-wage')) getEl('t-wage').innerText = formatVND(wage);
    if (getEl('t-hl')) getEl('t-hl').innerText = type;
    if (getEl('t-code')) getEl('t-code').innerText = code;
    if (getEl('t-ncc')) getEl('t-ncc').innerText = supplier ? `NCC: ${supplier.name}` : 'NCC: ---';
    if (getEl('t-ncc-address')) getEl('t-ncc-address').innerText = supplier?.address ? `Địa chỉ: ${supplier.address}` : 'Địa chỉ: ---';
    const applicableStandard = getEl('inv-tccs') ? getEl('inv-tccs').value.trim() : (supplier?.tccs || '');
    if (getEl('t-tccs')) getEl('t-tccs').innerText = `TCCS: ${String(applicableStandard || '---').replace(/^TCCS\s*:?\s*/i, '')}`;
    const currentItem = inventoryStore.find(item => String(item?.code || '') === String(code || ''));
    const origin = String(currentItem?.origin || 'Việt Nam').trim() || 'Việt Nam';
    if (getEl('t-origin')) getEl('t-origin').innerText = `XX: ${origin}`;
    scheduleInventoryTagQr(code);
    updateInventoryLabelMetaPreview();
    updateInventoryLabelDataPreview();
}

function inventoryLabelPublicUrl(code) {
    const sku = String(code || '').trim();
    if (!sku) return '';
    const base = require('./kbl-connection.cjs').publicBase(settingsStore && settingsStore.web_public_url);
    // Label-only V6: use the existing website product route. The old /san-pham?sku=
    // path serves the home page. Keep POS's existing scanner parser unchanged.
    const encoded = encodeURIComponent(sku);
    const canonical = `${base}/vi/san-pham/${encoded}` + (/^KBL-K\d+$/i.test(sku) ? '' : `?sku=${encoded}`);
    const template = String(settingsStore && settingsStore.web_product_url_template || '').trim();
    if (template) {
        // A fixed homepage must never be printed as if it identified a product.
        if (!/\{(?:sku|code)\}/i.test(template)) return '';
        try {
            const target = new URL(template.replace(/\{sku\}/gi, encoded).replace(/\{code\}/gi, encoded));
            if (!/^https?:$/.test(target.protocol)) return '';
            if (target.origin === new URL(base).origin && target.pathname.replace(/\/$/, '') === '/san-pham' && target.searchParams.get('sku') === sku) return canonical;
            return inventoryCodeFromScanValue(target.href).toUpperCase() === sku.toUpperCase() ? target.href : '';
        } catch (_) { return ''; }
    }
    return canonical;
}

function makeQrDataUrl(value, size = 128) {
    return new Promise((resolve) => {
        const raw = String(value || '').trim();
        if (!raw || typeof QRCode !== 'function') return resolve('');
        const holder = document.createElement('div');
        holder.style.cssText = 'position:fixed;left:-99999px;top:-99999px;width:1px;height:1px;overflow:hidden;';
        document.body.appendChild(holder);
        try {
            new QRCode(holder, { text: raw, width: size, height: size, correctLevel: QRCode.CorrectLevel.L });
            setTimeout(() => {
                let dataUrl = '';
                try {
                    const canvas = holder.querySelector('canvas');
                    const img = holder.querySelector('img');
                    if (canvas) dataUrl = canvas.toDataURL('image/png');
                    if (!dataUrl && img && img.src) dataUrl = img.src;
                } catch (_) {}
                holder.remove();
                resolve(dataUrl);
            }, 0);
        } catch (_) {
            holder.remove();
            resolve('');
        }
    });
}

function scheduleInventoryTagQr(code) {
    const img = getEl('t-qr-img');
    if (!img) return;
    const value = inventoryLabelPublicUrl(code);
    const link = getEl('label-product-url');
    if (link) link.value = value;
    const openButton = getEl('label-product-url-open');
    if (openButton) openButton.disabled = !value;
    if (!value) {
        clearTimeout(inventoryTagQrTimer);
        img.dataset.kblQrRequested = '';
        img.removeAttribute('src');
        inventoryTagQrLastValue = '';
        inventoryLabelPrintStatus('Chưa có liên kết QR hợp lệ cho Mã SP. Mẫu URL phải có {sku} hoặc {code}, không dùng riêng địa chỉ trang chủ.');
        return;
    }
    if (value === inventoryTagQrLastValue && img.src) return;
    clearTimeout(inventoryTagQrTimer);
    img.dataset.kblQrRequested = value;
    inventoryTagQrTimer = setTimeout(async () => {
        const dataUrl = await makeInventoryLabelQrDataUrl(value);
        const current = getEl('t-qr-img');
        if (current && current.dataset.kblQrRequested === value) {
            if (dataUrl) current.src = dataUrl; else current.removeAttribute('src');
            current.closest('.gold-tag-fold')?.style.setProperty('--kbl-label-qr-size', inventoryLabelQrPrintSize(dataUrl) + 'mm');
            current.title = value;
            inventoryTagQrLastValue = dataUrl ? value : '';
        }
    }, 90);
}

async function openInventoryLabelProductUrl() {
    const url = inventoryLabelPublicUrl(getEl('inv-new-code')?.value);
    if (!url) return inventoryLabelPrintStatus('Chọn một sản phẩm có Mã SP và liên kết QR hợp lệ trước.');
    try {
        await require('electron').shell.openExternal(url);
    } catch (_) { inventoryLabelPrintStatus('Chưa mở được trình duyệt. Sao chép liên kết QR bên dưới để kiểm tra.'); }
}

function smartClampPurity(value, fallback = 63) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 50 && n <= 100 ? n : fallback;
}

function syncInvSupplierPurityDefault(force = false) {
    const field = getEl('inv-supplier-purity');
    const type = getEl('inv-gold-type') ? String(getEl('inv-gold-type').value || '') : '';
    const sourceType = getEl('inv-source-type') ? String(getEl('inv-source-type').value || '') : 'supplier';
    if (!field) return;
    if (!force && String(field.dataset.manual || '') === '1') return;
    if (type === '610') field.value = sourceType === 'purchase' ? smartClampPurity(settingsStore.exchange_old_purity_610, 61) : smartClampPurity(settingsStore.exchange_new_purity_610_default, 63);
    else if (type === '980') field.value = 98.5;
    else if (type === '9999') field.value = 99.99;
}



// ============================================================================
// KBL KHO V8 - MA SP CO DINH + LIEN KET ON DINH + TIM KIEM / HOAN TAC
// Ma SP da in tem la bat bien: xoa mot mon KHONG doi ma cua bat ky mon nao khac.
// inventoryUid van la dinh danh noi bo de giu lien ket giao dich an toan.
// ============================================================================
function newInventoryUid() {
    try {
        if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        return crypto.randomBytes(16).toString('hex');
    } catch (_) {
        return `inv-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    }
}

function inventoryCodeNumber(code) {
    const match = String(code || '').match(/KBL-K(\d+)/i);
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function findInventoryBySaleLine(line) {
    if (!line) return null;
    const uid = String(line.inventoryUid || '').trim();
    if (uid) {
        // Khi Mã SP hiển thị được dồn lại, một mã cũ có thể được tái sử dụng cho món khác.
        // Nếu dòng giao dịch đã có inventoryUid thì CHỈ được khớp bằng UID; tuyệt đối
        // không rơi xuống so theo mã để tránh hoàn tác/trả nhầm món sau khi đánh lại số.
        return inventoryStore.find(item => String(item?.inventoryUid || '') === uid) || null;
    }
    const code = String(line.invCode || line.code || line.sku || '').trim();
    if (!code) return null;
    return inventoryStore.find(item => String(item?.code || '') === code) || null;
}

function saleContainsInventoryItem(sale, item) {
    if (!sale || !item) return false;
    const uid = String(item.inventoryUid || '').trim();
    const code = String(item.code || '').trim();
    const lines = Array.isArray(sale.items) && sale.items.length ? sale.items : [{
        inventoryUid: sale.inventoryUid || '',
        invCode: sale.invCode || ''
    }];
    return lines.some(line => {
        const lineUid = String(line?.inventoryUid || '').trim();
        // Nếu cả hai phía đã có UID thì UID là định danh duy nhất. Chỉ fallback về Mã SP
        // cho dữ liệu cũ chưa được migrate UID.
        if (uid && lineUid) return lineUid === uid;
        return code && String(line?.invCode || line?.code || line?.sku || '') === code;
    });
}

function ensureInventoryStableIdentityLinks(persist = false) {
    let inventoryChanged = false;
    let salesChanged = false;
    let supplierInvoiceChanged = false;
    const codeToItem = new Map();

    inventoryStore.forEach(item => {
        if (!item || typeof item !== 'object') return;
        if (!item.inventoryUid) {
            item.inventoryUid = newInventoryUid();
            inventoryChanged = true;
        }
        if (!item.originalCode && item.code) {
            item.originalCode = String(item.code);
            inventoryChanged = true;
        }
        if (!Array.isArray(item.codeHistory)) {
            item.codeHistory = [];
            inventoryChanged = true;
        }
        if (item.code) codeToItem.set(String(item.code), item);
    });

    (Array.isArray(supplierInvoices) ? supplierInvoices : []).forEach(inv => {
        if (!inv || typeof inv !== 'object') return;
        if (!inv.originalSku && inv.sku) { inv.originalSku = String(inv.sku); supplierInvoiceChanged = true; }
        if (!inv.inventoryUid && inv.sku && codeToItem.has(String(inv.sku))) {
            inv.inventoryUid = codeToItem.get(String(inv.sku)).inventoryUid;
            supplierInvoiceChanged = true;
        }
    });

    salesStore.forEach(tx => {
        if (!tx || typeof tx !== 'object') return;
        const lines = Array.isArray(tx.items) && tx.items.length ? tx.items : null;
        if (lines) {
            lines.forEach(line => {
                if (!line || typeof line !== 'object') return;
                if (!line.originalInvCode && line.invCode) {
                    line.originalInvCode = String(line.invCode);
                    salesChanged = true;
                }
                if (!line.inventoryUid && line.invCode && codeToItem.has(String(line.invCode))) {
                    line.inventoryUid = codeToItem.get(String(line.invCode)).inventoryUid;
                    salesChanged = true;
                }
            });
            const uids = lines.map(line => String(line?.inventoryUid || '')).filter(Boolean);
            if (uids.length && JSON.stringify(tx.inventoryUids || []) !== JSON.stringify(uids)) {
                tx.inventoryUids = uids;
                salesChanged = true;
            }
        } else if (tx.invCode) {
            if (!tx.originalInvCode) {
                tx.originalInvCode = String(tx.invCode);
                salesChanged = true;
            }
            if (!tx.inventoryUid && codeToItem.has(String(tx.invCode))) {
                tx.inventoryUid = codeToItem.get(String(tx.invCode)).inventoryUid;
                salesChanged = true;
            }
        }
        if (!Array.isArray(tx.originalInvCodes) && Array.isArray(tx.invCodes)) {
            tx.originalInvCodes = tx.invCodes.map(String);
            salesChanged = true;
        }
    });

    if (persist) {
        if (inventoryChanged) saveDBFile('inventory_db.json', inventoryStore);
        if (salesChanged) saveDBFile('sales_db.json', salesStore);
        if (supplierInvoiceChanged) saveDBFile('supplier_invoices.json', supplierInvoices);
    }
    return { inventoryChanged, salesChanged, supplierInvoiceChanged };
}

function remapSupplierPushedCodes(codeMap, deletedCode = '') {
    let changed = false;
    const drafts = Array.isArray(supplierInvoiceDrafts) ? supplierInvoiceDrafts : [];
    drafts.forEach(draft => {
        let draftChanged = false;
        (Array.isArray(draft?.items) ? draft.items : []).forEach(item => {
            const old = String(item?.pushedCode || '');
            if (!old) return;
            if (deletedCode && old === deletedCode) {
                item.pushedCode = '';
                item.pushedAt = '';
                changed = true;
                draftChanged = true;
                return;
            }
            const mapped = codeMap.get(old);
            if (mapped && mapped !== old) {
                item.pushedCode = mapped;
                changed = true;
                draftChanged = true;
            }
        });
        if (draftChanged && draft && draft.pushedAt && (draft.items || []).some(item => !item.pushedCode)) draft.pushedAt = '';
    });
    if (changed) {
        saveDBFile('supplier_invoice_drafts.json', supplierInvoiceDrafts);
        if (typeof renderSupplierInvoiceImportTable === 'function') renderSupplierInvoiceImportTable();
    }
    return changed;
}

function releaseDeletedPurchaseSource(item) {
    if (!item || String(item.sourceType || '') !== 'purchase' || item.sourceItemIndex == null || !item.sourceId) return false;
    const record = dataStoreRecords.find(row => String(row?.id || '') === String(item.sourceId));
    if (!record || !Array.isArray(record.inventoryTransferredItems)) return false;
    const target = Number(item.sourceItemIndex);
    const before = record.inventoryTransferredItems.length;
    record.inventoryTransferredItems = record.inventoryTransferredItems.filter(index => Number(index) !== target);
    if (record.inventoryTransferredItems.length !== before) {
        saveDBFile('database.db', dataStoreRecords);
        return true;
    }
    return false;
}

function compactInventoryCodes(options = {}) {
    // Tên hàm được giữ lại để tương thích mã cũ, nhưng từ V8 TUYỆT ĐỐI không đánh lại Mã SP.
    ensureInventoryStableIdentityLinks(false);
    const codeMap = new Map();
    const uidToNewCode = new Map();
    (Array.isArray(inventoryStore) ? inventoryStore : []).forEach(item => {
        const code = String(item?.code || '');
        const uid = String(item?.inventoryUid || '');
        if (code) codeMap.set(code, code);
        if (uid && code) uidToNewCode.set(uid, code);
    });
    if (options.persist !== false) saveDBFile('inventory_db.json', inventoryStore);
    return { codeMap, uidToNewCode, salesChanged: false, supplierInvoiceChanged: false };
}

async function migrateCurrentInventoryCodesToPermanentLabels() {
    ensureInventoryStableIdentityLinks(false);
    const targets = inventoryCodeMigrationTargets();
    if (!targets.length) {
        alert('✅ Các món đang quản lý đã dùng Mã SP cố định. Không cần đổi lại tem.');
        return;
    }

    const examples = targets.slice(0, 4).map(item => String(item.code || '')).filter(Boolean).join(', ');
    const soldHistoryCount = (Array.isArray(inventoryStore) ? inventoryStore : []).filter(item => String(item?.status || '').trim().toLowerCase().includes('đã bán')).length;
    const ok = confirm(
        `ĐỔI MÃ TEM HIỆN TẠI CHO ${targets.length} MÓN ĐANG QUẢN LÝ?\n\n` +
        `Ví dụ mã cũ: ${examples || 'KBL-Kxxxx'}\n` +
        `Sẽ đổi sang mã cố định ngẫu nhiên dạng KBL-KA7F2Q.\n\n` +
        `• Trọng lượng, tên hàng, giá vốn, công và UID của từng món GIỮ NGUYÊN.\n` +
        `• ${soldHistoryCount} món ĐÃ BÁN không bị đổi mã lịch sử.\n` +
        `• Sau khi đổi, hệ thống chọn sẵn toàn bộ món vừa đổi để ông IN TEM HÀNG LOẠT và dán lại.\n\n` +
        `Bấm OK để thực hiện.`
    );
    if (!ok) return;

    const now = new Date().toISOString();
    const used = collectReservedInventoryCodes();
    const oldToNew = new Map();
    const uidToNew = new Map();

    targets.forEach(item => {
        const oldCode = String(item.code || '').trim();
        const newCode = createPermanentInventoryCode(used);
        if (!item.inventoryUid) item.inventoryUid = newInventoryUid();
        if (!item.originalCode && oldCode) item.originalCode = oldCode;
        if (!Array.isArray(item.codeHistory)) item.codeHistory = [];
        if (oldCode && !item.codeHistory.includes(oldCode)) item.codeHistory.push(oldCode);
        item.code = newCode;
        item.productSymbol = newCode;
        item.permanentCodeMigratedAt = now;
        item.updatedAt = now;
        if (oldCode) oldToNew.set(oldCode, newCode);
        uidToNew.set(String(item.inventoryUid || ''), newCode);
    });

    let supplierInvoiceChanged = false;
    (Array.isArray(supplierInvoices) ? supplierInvoices : []).forEach(row => {
        if (!row || typeof row !== 'object') return;
        const uid = String(row.inventoryUid || '').trim();
        const oldSku = String(row.sku || '').trim();
        const mapped = (uid && uidToNew.get(uid)) || oldToNew.get(oldSku);
        if (!mapped || mapped === oldSku) return;
        if (!row.originalSku && oldSku) row.originalSku = oldSku;
        row.sku = mapped;
        row.inventoryDeleted = false;
        supplierInvoiceChanged = true;
    });

    let supplierDraftChanged = false;
    (Array.isArray(supplierInvoiceDrafts) ? supplierInvoiceDrafts : []).forEach(draft => {
        (Array.isArray(draft?.items) ? draft.items : []).forEach(line => {
            const oldCode = String(line?.pushedCode || '').trim();
            const mapped = oldToNew.get(oldCode);
            if (!mapped || mapped === oldCode) return;
            line.pushedCode = mapped;
            supplierDraftChanged = true;
        });
    });

    [salesCart, returnCart].forEach(cart => {
        (Array.isArray(cart) ? cart : []).forEach(line => {
            const uid = String(line?.inventoryUid || '').trim();
            const oldCode = String(line?.invCode || '').trim();
            const mapped = (uid && uidToNew.get(uid)) || oldToNew.get(oldCode);
            if (mapped) line.invCode = mapped;
        });
    });

    if (editingInventoryCode && oldToNew.has(editingInventoryCode)) {
        editingInventoryCode = oldToNew.get(editingInventoryCode);
        refreshInventoryEditUI();
    }

    saveDBFile('inventory_db.json', inventoryStore);
    if (supplierInvoiceChanged) saveDBFile('supplier_invoices.json', supplierInvoices);
    if (supplierDraftChanged) saveDBFile('supplier_invoice_drafts.json', supplierInvoiceDrafts);

    inventoryLabelSelection.clear();
    targets.forEach(item => inventoryLabelSelection.add(String(item.code || '')));

    renderInventoryTable();
    if (typeof renderSupplierInvoiceTable === 'function' && supplierInvoiceChanged) renderSupplierInvoiceTable();
    if (typeof renderSupplierInvoiceImportTable === 'function' && supplierDraftChanged) renderSupplierInvoiceImportTable();
    generateProductCode(true);

    let webText = 'Chưa đồng bộ website.';
    try {
        const webResult = await syncInventoryToWebsiteRobust();
        webText = webResult && webResult.success
            ? 'Website đã nhận danh sách mã mới.'
            : `Website chưa nhận được: ${(webResult && webResult.message) || 'không rõ lỗi'}`;
    } catch (error) {
        webText = `Website chưa nhận được: ${error?.message || error}`;
    }

    alert(
        `✅ ĐÃ ĐỔI XONG ${targets.length} MÃ TEM HIỆN TẠI.\n\n` +
        `Tất cả món vừa đổi đã được CHỌN SẴN trong Kho.\n` +
        `Ông chỉ cần bấm IN TEM ĐÃ CHỌN để in lại và dán tem mới.\n\n` +
        `${webText}\n\n` +
        `Từ bây giờ xóa món nào thì chỉ món đó mất; mã các món khác không đổi.`
    );
}

window.migrateCurrentInventoryCodesToPermanentLabels = migrateCurrentInventoryCodesToPermanentLabels;

function inventorySearchNormalize(value) {
    return String(value == null ? '' : value)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .replace(/,/g, '.')
        .toLowerCase().replace(/\s+/g, ' ').trim();
}

function inventorySearchText(item) {
    const ly = numberValue(item?.weightLy);
    const chi = ly / 100;
    const luong = ly / 1000;
    const values = [
        item?.code, item?.originalCode, ...(Array.isArray(item?.codeHistory) ? item.codeHistory : []),
        item?.name, item?.type, item?.status, item?.specialMark, item?.productSymbol,
        item?.sourceType, item?.sourceId, item?.sourceBatchId, item?.sourceNote,
        item?.supplierName, item?.supplierAddress, item?.producerName, item?.producerCode,
        item?.applicableStandard, item?.origin,
        ly, `${ly} ly`, chi, chi.toFixed(3), `${chi.toFixed(3)} chi`, luong, `${luong.toFixed(4)} luong`,
        item?.sellWage, formatVND(numberValue(item?.sellWage)),
        item?.goldCostPrice, formatVND(numberValue(item?.goldCostPrice)),
        item?.goldCostTotal, formatVND(numberValue(item?.goldCostTotal)),
        item?.originalWage, formatVND(numberValue(item?.originalWage)),
        item?.totalCost, formatVND(numberValue(item?.totalCost)),
        JSON.stringify(item || {})
    ];
    return inventorySearchNormalize(values.join(' | '));
}

function clearInventorySearch() {
    const field = getEl('inventory-search');
    if (field) field.value = '';
    renderInventoryTable();
    if (field) field.focus();
}

function findLatestSaleForInventoryItem(item) {
    if (!item) return null;
    return (Array.isArray(salesStore) ? salesStore : []).find(tx => {
        if (String(tx?.mode || '').toLowerCase() === 'tra') return false;
        return saleContainsInventoryItem(tx, item);
    }) || null;
}

async function undoInventorySale(code) {
    const item = inventoryStore.find(entry => String(entry?.code || '') === String(code || ''));
    if (!item) return alert('Không tìm thấy món trong Kho.');
    const sale = findLatestSaleForInventoryItem(item);
    if (!sale) return alert(`Không tìm thấy hóa đơn bán gốc của ${item.code}.`);
    return deleteSalesInvoice(String(sale.id || ''));
}

function restockReturnedInventoryItem(code) {
    const item = inventoryStore.find(entry => String(entry?.code || '') === String(code || ''));
    if (!item) return alert('Không tìm thấy món trong Kho.');
    if (inventoryRowBucket(item) !== 'return') return alert('Món này không ở trạng thái trả hàng chờ xử lý.');
    if (!confirm(`Đưa [${item.code} - ${item.name}] trở lại trạng thái ĐANG BÁN?\n\nKhông tạo mã mới; vẫn dùng đúng món và đúng Mã SP hiện tại.`)) return;
    item.status = 'Đang bán';
    item.returnRestockedAt = new Date().toISOString();
    saveDBFile('inventory_db.json', inventoryStore);
    renderInventoryTable();
    generateProductCode();
    alert(`✅ ${item.code} đã trở lại Kho để bán tiếp. Không tạo thêm món trùng.`);
}

let editingInventoryCode = '';

function inventorySaveButton() {
    return document.querySelector('button[onclick="saveToInventory()"]');
}

function refreshInventoryEditUI() {
    const button = inventorySaveButton();
    if (button) {
        button.innerHTML = editingInventoryCode
            ? `💾 CẬP NHẬT MÓN ${escapeHtml(editingInventoryCode)}`
            : '💾 LƯU KHO';
        button.classList.toggle('btn-blue', Boolean(editingInventoryCode));
        button.classList.toggle('btn-gold', !editingInventoryCode);
    }
}

function cancelInventoryEditMode() {
    editingInventoryCode = '';
    refreshInventoryEditUI();
}

function clearInvForm() {
    cancelInventoryEditMode();
    ['inv-source-id', 'inv-source-note', 'inv-name'].forEach(id => { if (getEl(id)) getEl(id).value = ''; });
    if (getEl('inv-source-type')) getEl('inv-source-type').value = 'purchase';
    if (getEl('inv-purchase-source')) getEl('inv-purchase-source').value = '';
    ['i-t-l', 'i-t-c', 'i-t-p', 'i-t-y', 'i-h-l', 'i-h-c', 'i-h-p', 'i-h-y',
     'i-l-l', 'i-l-c', 'i-l-p', 'i-l-y'].forEach(id => {
        if (getEl(id)) getEl(id).value = 0;
    });
    restoreInvCostDefaults();
    if (getEl('inv-gold-type')) getEl('inv-gold-type').value = '9999';
    if (getEl('inv-supplier-purity')) { getEl('inv-supplier-purity').dataset.manual = ''; syncInvSupplierPurityDefault(true); }
    if (getEl('inv-k-h')) getEl('inv-k-h').value = '';
    syncSupplierTccs();
    syncInvSourceUI();
    generateProductCode();
    calcInvMath();
}

function saveToInventory() {
    const name = getEl('inv-name') ? getEl('inv-name').value.trim() : '';
    if (!name) return alert('Vui lòng đặt tên SP!');

    const math = calcInvMath();
    const supplier = selectInventorySupplier();
    const sourceType = getEl('inv-source-type') ? getEl('inv-source-type').value : 'purchase';
    const editingIndex = editingInventoryCode
        ? inventoryStore.findIndex(item => String(item.code || '') === String(editingInventoryCode))
        : -1;
    const existingItem = editingIndex >= 0 ? inventoryStore[editingIndex] : null;
    const code = existingItem ? existingItem.code : getEl('inv-new-code').value;
    const specialMark = getEl('inv-k-h') ? getEl('inv-k-h').value.trim() : '';
    const supplierName = supplier?.name || existingItem?.supplierName || '';
    const supplierCode = supplier?.code || existingItem?.producerCode || supplierAbbreviation(supplierName);
    const supplierAddress = supplier?.address || existingItem?.supplierAddress || '';
    const applicableStandard = getEl('inv-tccs') ? getEl('inv-tccs').value.trim() : (supplier?.tccs || '');

    if (existingItem) {
        const sold = salesStore.some(sale => saleContainsInventoryItem(sale, existingItem));
        if (sold || String(existingItem.status || '').toLowerCase().includes('đã bán')) {
            return alert(`🔒 Mã SP ${code} đã phát sinh giao dịch nên không cho sửa dữ liệu kho gốc. Hãy lập điều chỉnh/chứng từ để giữ lịch sử.`);
        }
    }

    rememberInvCostDefaults();

    const updatedItem = {
        ...(existingItem || {}),
        code,
        inventoryUid: existingItem?.inventoryUid || newInventoryUid(),
        originalCode: existingItem?.originalCode || code,
        codeHistory: Array.isArray(existingItem?.codeHistory) ? existingItem.codeHistory : [],
        sourceType,
        sourceId: (getEl('inv-source-id') ? getEl('inv-source-id').value.trim() : '') ||
            (sourceType === 'supplier' ? `NCC:${supplier?.name || existingItem?.supplierName || 'Chành'}` : ''),
        sourceBatchId: getEl('inv-source-batch-id') ? getEl('inv-source-batch-id').value.trim() : '',
        sourceLotRefs: (() => { try { return JSON.parse(getEl('inv-source-lot-refs')?.value || '[]'); } catch (_) { return existingItem?.sourceLotRefs || []; } })(),
        costAuditSnapshot: (() => { try { return JSON.parse(getEl('inv-cost-audit-snapshot')?.value || '{}'); } catch (_) { return existingItem?.costAuditSnapshot || {}; } })(),
        sourceNote: getEl('inv-source-note') ? getEl('inv-source-note').value.trim() : (existingItem?.sourceNote || ''),
        name,
        type: getEl('inv-gold-type').value,
        supplierPurity: smartClampPurity(
            getEl('inv-supplier-purity')?.value,
            getEl('inv-gold-type').value === '610'
                ? smartClampPurity(settingsStore.exchange_new_purity_610_default, 63)
                : 99.99
        ),
        weightLy: math.netLy,
        grossLy: math.grossLy,
        gemLy: math.gemLy,
        lossLy: math.lossLy,
        productSymbol: code,
        specialMark,
        origin: existingItem?.origin || 'Việt Nam',
        attachedWeightChi: math.gemLy / 100,
        totalWeightChi: math.grossLy / 100,
        producerName: supplierName,
        producerCode: supplierCode,
        producerAddress: supplierAddress,
        supplierName,
        supplierAddress,
        applicableStandard,
        goldCostPrice: math.goldPrice,
        goldCostTotal: math.goldCost,
        originalWage: math.originalWage,
        processCost: parseFloat(getEl('inv-cost-process')?.value) || 0,
        sellWage: parseFloat(getEl('inv-sell-wage').value) || 0,
        totalCost: math.totalCost,
        supplier: supplier ? { ...supplier } : (existingItem?.supplier || null),
        webLabelSchemaVersion: existingItem?.webLabelSchemaVersion || 1,
        // Món từ HĐ Tab 5 chỉ được lên web sau khi chủ tiệm mở Sửa và bấm LƯU KHO.
        webSyncReady: true,
        status: existingItem?.webSyncReady === false ? 'Đang bán' : (existingItem?.status || 'Đang bán'),
        dateAdd: existingItem?.dateAdd || new Date().toISOString(),
        updatedAt: existingItem ? new Date().toISOString() : undefined
    };

    if (existingItem) {
        inventoryStore[editingIndex] = updatedItem;
    } else {
        inventoryStore.unshift(updatedItem);
    }

    saveDBFile('inventory_db.json', inventoryStore);
    renderInventoryTable();

    if (existingItem) {
        const savedCode = code;
        clearInvForm();
        alert(`✅ Đã cập nhật món [${savedCode}] trong Kho.\nTên, ký hiệu, hàm lượng, trọng lượng, công và thông tin tem đã được lưu lại.`);
    } else {
        generateProductCode();
        alert('✅ Đã lưu món hàng vào Kho. Không tự động in tem.');
    }
}

function applyInventoryItemToForm(item) {
    if (!item) return;
    if (getEl('inv-new-code')) getEl('inv-new-code').value = item.code || '';
    if (getEl('inv-source-type')) getEl('inv-source-type').value = item.sourceType || 'supplier';
    if (getEl('inv-source-id')) getEl('inv-source-id').value = item.sourceId || '';
    if (getEl('inv-source-batch-id')) getEl('inv-source-batch-id').value = item.sourceBatchId || '';
    if (getEl('inv-source-lot-refs')) getEl('inv-source-lot-refs').value = JSON.stringify(item.sourceLotRefs || []);
    if (getEl('inv-cost-audit-snapshot')) getEl('inv-cost-audit-snapshot').value = JSON.stringify(item.costAuditSnapshot || {});
    if (getEl('inv-source-note')) getEl('inv-source-note').value = item.sourceNote || '';
    if (getEl('inv-name')) getEl('inv-name').value = item.name || '';
    if (getEl('inv-gold-type')) getEl('inv-gold-type').value = item.type || '9999';
    if (getEl('inv-supplier-purity')) {
        getEl('inv-supplier-purity').value = smartClampPurity(item.supplierPurity, item.type === '610' ? smartClampPurity(settingsStore.exchange_new_purity_610_default, 63) : (item.type === '980' ? 98.5 : 99.99));
        getEl('inv-supplier-purity').dataset.manual = '1';
    }
    if (getEl('inv-ncc')) getEl('inv-ncc').value = item.supplier?.name || item.supplierName || '';
    if (getEl('inv-k-h')) getEl('inv-k-h').value = item.specialMark || item.productFeature || item.symbol || '';
    if (getEl('inv-tccs')) getEl('inv-tccs').value = item.applicableStandard || item.tccs || item.supplier?.tccs || '';
    setWeightInputs('i-t', item.grossLy || item.weightLy);
    setWeightInputs('i-h', item.gemLy || 0);
    setWeightInputs('i-l', item.lossLy || 0);
    if (getEl('inv-gold-price')) getEl('inv-gold-price').value = item.goldCostPrice || 0;
    if (getEl('inv-cost-base')) {
        const unit = Math.max(0, numberValue(item.goldCostPrice));
        const weightChi = Math.max(0, numberValue(item.weightLy) / 100);
        const canonicalGold = unit > 0 && weightChi > 0 ? Math.round(unit * weightChi) : numberValue(item.goldCostTotal || item.totalCost);
        getEl('inv-cost-base').value = canonicalGold;
    }
    if (getEl('inv-cost-process')) getEl('inv-cost-process').value = item.processCost || 0;
    if (getEl('inv-cost-wage')) getEl('inv-cost-wage').value = item.originalWage || 0;
    if (getEl('inv-sell-wage')) getEl('inv-sell-wage').value = item.sellWage || 0;
    syncInvSourceUI();
    selectInventorySupplier();
    calcInvMath();
}

function editInventoryItem(code) {
    const item = inventoryStore.find(entry => String(entry.code || '') === String(code));
    if (!item) return alert('Không tìm thấy món trong kho.');

    const sold = salesStore.some(sale => saleContainsInventoryItem(sale, item));
    if (sold || String(item.status || '').toLowerCase().includes('đã bán')) {
        return alert(`🔒 Mã SP ${code} đã phát sinh giao dịch nên không sửa dữ liệu kho gốc.`);
    }

    editingInventoryCode = String(code);
    applyInventoryItemToForm(item);
    refreshInventoryEditUI();
    syncInvUI();

    const tab = getEl('tab-kho');
    if (tab) tab.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function printInventoryTag(code) {
    const item = inventoryStore.find(entry => String(entry.code || '') === String(code || ''));
    if (!item) return;
    // In trực tiếp từ snapshot Kho, không nạp ngược vào form -> không giật giao diện / không làm thay đổi form đang nhập.
    // Vẫn tôn trọng ô SL như luồng in tem cũ để không đổi thói quen thao tác.
    const qty = Math.max(1, Math.min(50, parseInt(getEl('label-quantity')?.value || '1', 10) || 1));
    printInventoryItemsDirectly([item], qty);
}

async function deleteInventoryItem(code) {
    const index = inventoryStore.findIndex(item => String(item?.code || '') === String(code || ''));
    if (index < 0) return;
    ensureInventoryStableIdentityLinks(false);
    const item = inventoryStore[index];
    const saleRefs = (Array.isArray(salesStore) ? salesStore : []).filter(sale => saleContainsInventoryItem(sale, item));
    const sold = saleRefs.some(sale => String(sale?.mode || '').toLowerCase() !== 'tra');
    const message = sold
        ? `Xóa hẳn [${item.code} - ${item.name}] khỏi Kho và danh mục Website?

Mã trên tem của TẤT CẢ sản phẩm khác sẽ giữ nguyên, không dồn số, không đổi trọng lượng/hình ảnh.

Hóa đơn đã bán vẫn được giữ trong Lịch sử.`
        : `Xóa hẳn [${item.code} - ${item.name}] khỏi Kho?

Chỉ món này bị xóa. Mã trên tem của các sản phẩm khác giữ nguyên.`;
    if (!confirm(message)) return;

    const deletedCode = String(item.code || '');
    const deletedUid = String(item.inventoryUid || '');
    const deletedAt = new Date().toISOString();

    // Giữ chứng từ bán cũ nhưng đánh dấu rằng hồ sơ kho của món đã được xóa.
    let salesChanged = false;
    saleRefs.forEach(tx => {
        if (!tx || typeof tx !== 'object') return;
        if (Array.isArray(tx.items)) {
            tx.items.forEach(line => {
                const match = (deletedUid && String(line?.inventoryUid || '') === deletedUid) || String(line?.invCode || '') === deletedCode;
                if (!match) return;
                if (!line.originalInvCode && line.invCode) line.originalInvCode = String(line.invCode);
                line.inventoryDeleted = true;
                line.inventoryDeletedAt = deletedAt;
                salesChanged = true;
            });
        } else if ((deletedUid && String(tx.inventoryUid || '') === deletedUid) || String(tx.invCode || '') === deletedCode) {
            if (!tx.originalInvCode && tx.invCode) tx.originalInvCode = String(tx.invCode);
            tx.inventoryDeleted = true;
            tx.inventoryDeletedAt = deletedAt;
            salesChanged = true;
        }
    });

    // Đánh dấu liên kết hóa đơn NCC đã xóa khỏi Kho nhưng KHÔNG mở lại pushedCode,
    // tránh món đã bán/xóa bị nhập lại ngoài ý muốn.
    let supplierInvoiceChanged = false;
    (Array.isArray(supplierInvoices) ? supplierInvoices : []).forEach(row => {
        const sameUid = deletedUid && String(row?.inventoryUid || '') === deletedUid;
        const sameCode = String(row?.sku || '') === deletedCode;
        if (!sameUid && !sameCode) return;
        row.inventoryDeleted = true;
        row.inventoryDeletedAt = deletedAt;
        supplierInvoiceChanged = true;
    });

    inventoryStore.splice(index, 1);
    inventoryLabelSelection.delete(deletedCode);
    saveDBFile('inventory_db.json', inventoryStore);
    if (salesChanged) saveDBFile('sales_db.json', salesStore);
    if (supplierInvoiceChanged) saveDBFile('supplier_invoices.json', supplierInvoices);

    renderInventoryTable();
    if (typeof renderSalesInvoiceHistory === 'function') renderSalesInvoiceHistory();
    generateProductCode(true);
    if (editingInventoryCode === deletedCode) clearInvForm();

    let webMessage = 'Website chưa nhận được thay đổi.';
    try {
        const webResult = await syncInventoryToWebsiteRobust();
        webMessage = webResult && webResult.success
            ? 'Website đã nhận danh sách mới.'
            : `Website chưa đồng bộ được: ${(webResult && webResult.message) || 'không rõ lỗi'}`;
    } catch (error) {
        webMessage = `Website chưa đồng bộ được: ${error?.message || error}`;
    }

    const soldMessage = sold ? '\nHóa đơn bán cũ vẫn còn trong Lịch sử.' : '';
    alert(`✅ Đã xóa ${deletedCode}.\n\nCác Mã SP khác GIỮ NGUYÊN, tem cũ không đổi.\n${webMessage}${soldMessage}`);
}

function setInventorySupplierPurity(code) {
    const item = inventoryStore.find(entry => entry.code === code);
    if (!item) return;
    const fallback = item.type === '610'
        ? (item.sourceType === 'purchase' ? smartClampPurity(settingsStore.exchange_old_purity_610, 61) : smartClampPurity(settingsStore.exchange_new_purity_610_default, 63))
        : (item.type === '980' ? 98.5 : 99.99);
    const current = smartClampPurity(item.supplierPurity, fallback);
    const answer = prompt(`Tuổi chành nội bộ cho [${item.code} - ${item.name}] (%).\nChỉ dùng tính lãi đổi ngang, không in lên tem khách.`, String(current));
    if (answer === null) return;
    const value = Number(String(answer).replace(',', '.'));
    if (!Number.isFinite(value) || value < 50 || value > 100) return alert('Tuổi nội bộ phải nằm trong khoảng 50–100%.');
    item.supplierPurity = Math.round(value * 100) / 100;
    saveDBFile('inventory_db.json', inventoryStore);
    renderInventoryTable();
}

function inventoryRowBucket(item) {
    const status = String(item && item.status || '').trim().toLowerCase();
    if (status.includes('đã bán')) return 'sold';
    if (status.includes('đã trả') || status.includes('chờ xl')) return 'return';
    return 'active';
}
window.setInventoryViewMode = function(mode) {
    inventoryViewMode = ['active','sold','all'].includes(String(mode)) ? String(mode) : 'active';
    renderInventoryTable();
};
function renderInventoryTable() {
    const tbody = getEl('inventory-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const soldCount = inventoryStore.filter(item => inventoryRowBucket(item) === 'sold').length;
    const returnCount = inventoryStore.filter(item => inventoryRowBucket(item) === 'return').length;
    const activeCount = inventoryStore.filter(item => inventoryRowBucket(item) === 'active').length;
    const queryRaw = String(getEl('inventory-search')?.value || '').trim();
    const query = inventorySearchNormalize(queryRaw);

    const table = tbody.closest('table');
    if (table) {
        let box = getEl('kbl-inventory-summary');
        if (!box) {
            box = document.createElement('div');
            box.id = 'kbl-inventory-summary';
            box.style.cssText = 'margin:8px 0;padding:9px 10px;border:1px solid #dbe4ee;border-radius:8px;background:#f8fbff;font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap';
            table.insertAdjacentElement('beforebegin', box);
        }
        const migrationCount = inventoryCodeMigrationTargets().length;
        box.innerHTML = `<b>Kho thực tế:</b> 🟢 ${activeCount} đang quản lý · 🔴 ${soldCount} đã bán/lịch sử${returnCount ? ` · 🟠 ${returnCount} trả hàng chờ xử lý` : ''} · Tổng hồ sơ ${inventoryStore.length}` +
            `<button class="btn btn-blue" style="padding:4px 8px" onclick="setInventoryViewMode('active')">ĐANG QUẢN LÝ</button>` +
            `<button class="btn btn-gray" style="padding:4px 8px" onclick="setInventoryViewMode('sold')">LỊCH SỬ ĐÃ BÁN</button>` +
            `<button class="btn btn-gray" style="padding:4px 8px" onclick="setInventoryViewMode('all')">TẤT CẢ HỒ SƠ</button>` +
            (migrationCount ? `<button class="btn btn-gold" style="padding:4px 8px;font-weight:800" onclick="migrateCurrentInventoryCodesToPermanentLabels()">🔐 ĐỔI MÃ TEM HIỆN TẠI (${migrationCount})</button>` : '');
    }

    let rows = inventoryStore;
    // Khi đang tìm kiếm, tìm trên TOÀN BỘ kho, kể cả đã bán / trả hàng.
    // Nhờ vậy chỉ cần gõ mã, tên, 610, 222, 2.220, NCC, giá vốn... đều thấy.
    if (query) {
        const tokens = query.split(/\s+/).filter(Boolean);
        rows = inventoryStore.filter(item => {
            const hay = inventorySearchText(item);
            return tokens.every(token => hay.includes(token));
        });
    } else if (inventoryViewMode === 'active') {
        rows = inventoryStore.filter(item => inventoryRowBucket(item) !== 'sold');
    } else if (inventoryViewMode === 'sold') {
        rows = inventoryStore.filter(item => inventoryRowBucket(item) === 'sold');
    }

    const searchStatus = getEl('inventory-search-status');
    if (searchStatus) {
        searchStatus.textContent = queryRaw
            ? `Tìm thấy ${rows.length}/${inventoryStore.length} món cho “${queryRaw}”`
            : `Đang hiển thị ${rows.length}/${inventoryStore.length} món`;
        searchStatus.style.color = rows.length ? '#0f5f9b' : '#b42318';
    }

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#64748b;padding:18px;">${queryRaw ? 'Không tìm thấy món phù hợp.' : 'Không có món trong nhóm này.'}</td></tr>`;
        updateInventoryLabelSelectionUi();
        return;
    }

    rows.forEach(item => {
        const bucket = inventoryRowBucket(item);
        const statusBadge = bucket === 'sold'
            ? '<div style="margin-top:3px;color:#b42318;font-size:10px;font-weight:800">● ĐÃ BÁN · LƯU LỊCH SỬ</div>'
            : bucket === 'return'
                ? '<div style="margin-top:3px;color:#b7791f;font-size:10px;font-weight:800">● TRẢ HÀNG CHỜ XỬ LÝ</div>'
                : '';
        const undoButton = bucket === 'sold'
            ? `<button class="btn" style="margin-left:3px;background:#0f766e;color:#fff;" onclick='undoInventorySale(${JSON.stringify(item.code || '')})'>↩ Hoàn tác bán</button>`
            : bucket === 'return'
                ? `<button class="btn" style="margin-left:3px;background:#0f766e;color:#fff;" onclick='restockReturnedInventoryItem(${JSON.stringify(item.code || '')})'>♻️ Bán lại</button>`
                : '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:bold;">
                <label style="display:flex;align-items:flex-start;gap:5px;cursor:pointer;">
                    <input class="inventory-label-check" type="checkbox" data-label-code="${escapeHtml(item.code || '')}" ${inventoryLabelSelection.has(String(item.code || '')) ? 'checked' : ''} onchange='setInventoryLabelSelected(${JSON.stringify(item.code || '')}, this.checked)'>
                    <span>${escapeHtml(item.code || '')}</span>
                </label>
            </td>
            <td style="font-weight:bold;">${escapeHtml(item.name || '')}${statusBadge}</td>
            <td>${escapeHtml(item.type || '')}</td>
            <td style="color:#b78a00;font-weight:bold;">${numberValue(item.weightLy)} Ly<br><small style="color:#64748b;">${(numberValue(item.weightLy) / 100).toFixed(3)} chỉ</small></td>
            <td>${item.webSyncReady === false ? '<b style="color:#b7791f;">Chưa nhập công bán</b>' : formatVND(numberValue(item.sellWage))}</td>
            <td style="color:#dc3545;font-size:11px;font-weight:bold;">${formatVND(inventoryEffectiveBookCost(item))}</td>
            <td style="font-weight:700;color:#6b4f00;">${formatVND(numberValue(item.originalWage))}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-gold" onclick='editInventoryItem(${JSON.stringify(item.code || '')})'>✏️ Sửa</button>
                <button class="btn btn-gray" style="margin-left:3px;" onclick='printInventoryTag(${JSON.stringify(item.code || '')})'>🖨️ In Tem</button>
                <button class="btn btn-blue" style="margin-left:3px;" onclick='setInventorySupplierPurity(${JSON.stringify(item.code || '')})'>🧮 Tuổi nội bộ</button>
                ${undoButton}
                <button class="btn btn-danger" style="margin-left:3px;" onclick='deleteInventoryItem(${JSON.stringify(item.code || '')})'>🗑️ Xóa</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    updateInventoryLabelSelectionUi();
}

function setInventoryLabelSelected(code, checked) {
    const sku = String(code || '').trim();
    if (!sku) return;
    if (checked) inventoryLabelSelection.add(sku); else inventoryLabelSelection.delete(sku);
    updateInventoryLabelSelectionUi();
}

function toggleVisibleInventoryLabelSelection(checked) {
    document.querySelectorAll('#inventory-tbody .inventory-label-check').forEach(input => {
        const sku = String(input.dataset.labelCode || '').trim();
        if (!sku) return;
        input.checked = Boolean(checked);
        if (checked) inventoryLabelSelection.add(sku); else inventoryLabelSelection.delete(sku);
    });
    updateInventoryLabelSelectionUi();
}

function clearInventoryLabelSelection() {
    inventoryLabelSelection.clear();
    document.querySelectorAll('#inventory-tbody .inventory-label-check').forEach(input => { input.checked = false; });
    updateInventoryLabelSelectionUi();
}

function updateInventoryLabelSelectionUi() {
    const count = inventoryLabelSelection.size;
    if (getEl('inventory-label-selected-count')) getEl('inventory-label-selected-count').innerText = String(count);
    const btn = getEl('inventory-label-print-selected');
    if (btn) {
        btn.disabled = count === 0;
        btn.style.opacity = count === 0 ? '.55' : '1';
    }
    const visible = Array.from(document.querySelectorAll('#inventory-tbody .inventory-label-check'));
    const selectedVisible = visible.filter(input => inventoryLabelSelection.has(String(input.dataset.labelCode || ''))).length;
    const all = getEl('inventory-label-select-visible');
    if (all) {
        all.checked = visible.length > 0 && selectedVisible === visible.length;
        all.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
    }
}

async function printSelectedInventoryTags() {
    // Giữ đúng thứ tự đang có trong Kho để tem hàng loạt ra theo thứ tự ổn định,
    // không phụ thuộc thứ tự người dùng click checkbox.
    const items = inventoryStore.filter(item => inventoryLabelSelection.has(String(item.code || '')));
    if (!items.length) return alert('Hãy chọn ít nhất 1 món trong Kho để in tem hàng loạt.');
    const qty = Math.max(1, Math.min(50, parseInt(getEl('label-quantity')?.value || '1', 10) || 1));
    await printInventoryItemsDirectly(items, qty);
}

async function loadPrinters() {
    initInventoryLabelPrintConfig();
    const labelSel = getEl('label-printer');
    const invoiceSel = getEl('invoice-printer');
    if (!labelSel && !invoiceSel) return;
    let priorLabel = labelSel ? labelSel.value : '';
    try { priorLabel = localStorage.getItem('kbl_label_printer') || priorLabel; } catch (_) {}
    let priorInvoice = '';
    try { priorInvoice = localStorage.getItem('kbl_invoice_printer') || (invoiceSel ? invoiceSel.value : ''); } catch (_) { priorInvoice = invoiceSel ? invoiceSel.value : ''; }
    [labelSel, invoiceSel].filter(Boolean).forEach(sel => { sel.innerHTML = '<option value="">Máy in mặc định</option>'; });
    try {
        const prts = await ipcRenderer.invoke('get-printers');
        prts.forEach(p => {
            [labelSel, invoiceSel].filter(Boolean).forEach(sel => {
                const opt = document.createElement('option');
                opt.value = p.name;
                opt.innerText = p.name;
                sel.appendChild(opt);
            });
        });
        if (labelSel && Array.from(labelSel.options).some(o => o.value === priorLabel)) labelSel.value = priorLabel;
        if (invoiceSel && Array.from(invoiceSel.options).some(o => o.value === priorInvoice)) invoiceSel.value = priorInvoice;
        if (labelSel && labelSel.dataset.kblCalibrationPrinterBound !== '1') {
            labelSel.dataset.kblCalibrationPrinterBound = '1';
            labelSel.addEventListener('change', () => {
                try { localStorage.setItem('kbl_label_printer', labelSel.value || ''); } catch (_) {}
                loadInventoryLabelCalibrationForPrinter();
            });
        }
        if (labelSel) loadInventoryLabelCalibrationForPrinter();
    } catch(e) {
        console.warn('Không đọc được danh sách máy in:', e && e.message);
    }
}

function rememberInvoicePrinter() {
    try { localStorage.setItem('kbl_invoice_printer', getEl('invoice-printer')?.value || ''); } catch (_) {}
}

function inventoryTagSnapshotFromItem(item) {
    const row = item || {};
    const supplier = row.supplier && typeof row.supplier === 'object' ? row.supplier : {};
    const grossLy = numberValue(row.grossLy != null ? row.grossLy : (row.totalWeightChi != null ? numberValue(row.totalWeightChi) * 100 : row.weightLy));
    const gemLy = numberValue(row.gemLy != null ? row.gemLy : (row.attachedWeightChi != null ? numberValue(row.attachedWeightChi) * 100 : 0));
    const netLy = numberValue(row.weightLy != null ? row.weightLy : Math.max(0, grossLy - gemLy));
    const sourceType = String(row.sourceType || 'purchase').trim();
    const sourceId = String(row.sourceId || '').trim();
    return {
        code: String(row.code || row.productSymbol || '').trim(),
        name: String(row.name || 'SP').trim(),
        type: String(row.type || '9999').trim(),
        grossLy, gemLy, netLy,
        wage: numberValue(row.sellWage),
        specialMark: String(row.specialMark || row.productFeature || row.symbol || '').trim(),
        supplierName: String(row.supplierName || row.producerName || supplier.name || '').trim(),
        supplierAddress: String(row.supplierAddress || row.producerAddress || supplier.address || '').trim(),
        standard: String(supplier.tccs || row.applicableStandard || row.tccs || '').trim(),
        origin: String(row.origin || 'Việt Nam').trim() || 'Việt Nam'
    };
}

function inventoryTagSnapshotFromForm() {
    const math = calcInvMath();
    const supplier = selectInventorySupplier();
    const sourceType = String(getEl('inv-source-type')?.value || 'purchase');
    const purchaseSource = String(getEl('inv-purchase-source')?.value || '');
    return {
        code: String(getEl('inv-new-code')?.value || '').trim(),
        name: String(getEl('inv-name')?.value || 'SP').trim(),
        type: String(getEl('inv-gold-type')?.value || '9999').trim(),
        grossLy: math.grossLy,
        gemLy: math.gemLy,
        netLy: math.netLy,
        wage: numberValue(getEl('inv-sell-wage')?.value),
        specialMark: String(getEl('inv-k-h')?.value || '').trim(),
        supplierName: String(supplier?.name || '').trim(),
        supplierAddress: String(supplier?.address || '').trim(),
        standard: String(getEl('inv-tccs')?.value || supplier?.tccs || '').trim(),
        origin: 'Việt Nam'
    };
}

function makeInventoryBarcodeSvg(code) {
    const sku = String(code || '').trim();
    if (!sku || typeof JsBarcode === 'undefined') return '';
    try {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svg, sku, { format:'CODE128', width:1.25, height:14, displayValue:false, margin:0 });
        return svg.outerHTML;
    } catch (_) { return ''; }
}

// V3 label-only QR optimization: exact URL is preserved, while the SKU suffix
// is encoded in QR alphanumeric mode so the ordinary product code uses fewer cells.
function optimizeInventoryLabelQrMatrix(matrix, raw) {
    if (!matrix || typeof matrix.make !== 'function' || !Array.isArray(matrix.dataList)) return matrix;
    if (!/^[\x20-\x7e]+$/.test(raw)) return matrix;
    const suffix = raw.match(/[0-9A-Z $%*+\-./:]+$/)?.[0] || '';
    if (suffix.length < 4) return matrix;
    const prefix = raw.slice(0, raw.length - suffix.length);
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
    const bits = (prefix.length ? 12 + prefix.length * 8 : 0) + 13 + Math.floor(suffix.length / 2) * 11 + (suffix.length % 2) * 6;
    const capacities = [19,34,55,80,108,136,156,194,232];
    const version = capacities.findIndex(bytes => bits <= bytes * 8) + 1;
    if (!version || version >= matrix.typeNumber) return matrix;
    const segments = [];
    if (prefix) segments.push({mode:4,getLength:()=>prefix.length,write(buffer){for (let i=0;i<prefix.length;i++) buffer.put(prefix.charCodeAt(i),8);}});
    segments.push({mode:2,getLength:()=>suffix.length,write(buffer){
        for (let i=0;i<suffix.length;i+=2) {
            const first = alphabet.indexOf(suffix[i]);
            if (i+1<suffix.length) buffer.put(first*45+alphabet.indexOf(suffix[i+1]),11);
            else buffer.put(first,6);
        }
    }});
    const original = {...matrix};
    try {matrix.typeNumber=version;matrix.dataList=segments;matrix.dataCache=null;matrix.make();}
    catch (_) {Object.assign(matrix,original);}
    return matrix;
}

function inventoryLabelQrPrintSize(dataUrl) {
    try {
        if (!String(dataUrl).startsWith('data:image/svg+xml;base64,')) return 10.2;
        const svg = atob(dataUrl.split(',')[1]);
        const match = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
        return match && Number(match[1]) <= 37 && match[1] === match[2] ? (74 * 25.4 / 203) : 10.2;
    } catch (_) {return 10.2;}
}

function makeInventoryLabelQrDataUrl(value) {
    const raw = String(value || '').trim();
    if (!raw || typeof QRCode !== 'function') return Promise.resolve('');
    const holder = document.createElement('div');
    try {
        const qr = new QRCode(holder, { text: raw, width:176, height:176, correctLevel:QRCode.CorrectLevel.L });
        const matrix = optimizeInventoryLabelQrMatrix(qr._oQRCode, raw);
        if (!matrix || typeof matrix.getModuleCount !== 'function') return makeQrDataUrl(raw, 176);
        const count = matrix.getModuleCount();
        const side = count + 8; // Four white modules on every side, without changing payload.
        const cells = [];
        for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) {
            if (matrix.isDark(y, x)) cells.push(`M${x+4},${y+4}h1v1h-1z`);
        }
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges"><rect width="${side}" height="${side}" fill="white"/><path fill="black" d="${cells.join('')}"/></svg>`;
        return Promise.resolve('data:image/svg+xml;base64,' + btoa(svg));
    } catch (_) { return Promise.resolve(''); }
}
function inventoryLabelLayoutCss() {
    const css = getEl('kbl-label-layout-css')?.textContent;
    if (!css || !css.includes('KBL_LABEL_QR_V14')) throw new Error('Tem chưa đủ bộ V14. Thay cả index.html và renderer.js rồi mở lại POS.');
    return css;
}
function inventoryLabelPrintStatus(message) {
    const status = getEl('label-print-status');
    if (status) status.textContent = message;
}
function inventoryLabelCalibrationHtml(config) {
    const {x, y} = inventoryLabelFrameOrigin(config);
    const ticks = [];
    for (let n = 5; n < 56; n += 5) ticks.push(`<path d="M${n} 1v.5 M${n} 11v-.5"/>`);
    const drawing = `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:${x}mm;top:${y}mm;width:56mm;height:12mm" viewBox="0 0 56 12"><g fill="none" stroke="black" stroke-width=".16"><rect x="1" y="1" width="54" height="10"/><path d="M28 1v10 M2 8h10 M2 7v2 M12 7v2"/>${ticks.join('')}</g><g font-family="Arial" font-size="1.7" fill="black"><text x="3" y="4">TRÁI · 28 mm</text><text x="32" y="4">PHẢI · 28 mm</text><text x="3" y="6.5">10 mm</text><text x="32" y="9">ĐUÔI Ở BÊN PHẢI</text></g></svg>`;
    return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><style>${inventoryLabelPrintCss(config)}</style></head><body><section class="label-page">${drawing}<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:0;top:0;width:56mm;height:12mm" viewBox="0 0 56 12"><path d="M1 11.5H55" fill="none" stroke="black" stroke-width=".13" stroke-dasharray="1 1"/></svg></section></body></html>`;
}
async function printInventoryLabelFrameTest(requestedCopies = 1) {
    if (printInventoryItemsDirectly.busy) return inventoryLabelPrintStatus('Đang gửi lô tem. Chờ xong rồi in khung.');
    const config = rememberInventoryLabelPrintConfig();
    const deviceName = getEl('label-printer')?.value || '';
    const copies = Number(requestedCopies) === 3 ? 3 : 1;
    printInventoryItemsDirectly.busy = true;
    try {
        inventoryLabelPrintStatus(`Đang gửi ${copies} khung đo vị trí trên phôi tem…`);
        const res = await ipcRenderer.invoke('gold:print-label', { html:inventoryLabelCalibrationHtml(config), deviceName, widthMm:config.mediaWidthMm, heightMm:inventoryLabelMediaHeight(config), copies });
        if (!res || !res.success) throw new Error(res?.failureReason || 'Không nhận được kết quả máy in.');
        const origin = inventoryLabelFrameOrigin(config);
        inventoryLabelPrintStatus(`TEM V14 · Đã gửi ${copies} khung · máy ${deviceName || 'mặc định'} · trang in ${config.mediaWidthMm}×${inventoryLabelMediaHeight(config)} mm. Theo phần mềm: cạnh trên khung cách đầu trang ${(1+origin.y).toFixed(2)} mm; cạnh trái ${(1+origin.x).toFixed(2)} mm; vạch giữa ${(28+origin.x).toFixed(2)} mm từ mép trái; đoạn đo dài 10 mm. Vạch đứt dưới cùng nằm ở Y 11,5 mm của nội dung 12 mm. Nếu cả 3 khung lệch giống nhau: kiểm tra gốc in. Nếu lệch tăng dần: kiểm tra khổ giấy/khe tem/cảm biến. Đo trên phôi tem, không lấy bản in giấy thường để căn máy tem.`);
    } catch (error) { inventoryLabelPrintStatus('Lỗi in khung: ' + (error?.message || error)); }
    finally { printInventoryItemsDirectly.busy = false; }
}

function inventoryLabelCalibrationProfileKey() {
    const printer = String(getEl('label-printer')?.value || '__DEFAULT__').trim() || '__DEFAULT__';
    return printer;
}

function readInventoryLabelCalibrationProfiles() {
    try {
        const parsed = JSON.parse(localStorage.getItem('kbl_label_calibration_v14_by_printer') || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) { return {}; }
}

function inventoryLabelMediaHeight(config = {}) {
    const n = Number(config.mediaHeightMm);
    return Number.isFinite(n) && n >= 10 && n <= 60 ? n : 12;
}
function inventoryLabelIsSnbcBple() {
    return /BTP[- ]?2200E\b.*\bBPLE\b/i.test(String(getEl('label-printer')?.value || ''));
}
function applyInventoryLabelBartenderPage() {
    // Reference máy.prn: q711 / Q112,25+24 at 203dpi.
    // Gap Offset is a separate driver setting, NOT an HTML Y translation.
    if (getEl('label-media-width')) getEl('label-media-width').value = '89';
    if (getEl('label-media-height')) getEl('label-media-height').value = '14';
    rememberInventoryLabelPrintConfig();
    inventoryLabelPrintStatus('Đã chọn trang 89 × 14 mm theo mẫu BarTender; thân tem vẫn 56 × 12 mm, giữ X/Y. Cần đặt Stock → Gap Height 0.12 in và Gap Offset 0.12 in trong Printing Preferences của máy SNBC. POS không tự đặt hai mục này.');
}

function readInventoryLabelPrintConfig() {
    const numberOr = (id, fallback) => {
        const raw = getEl(id)?.value;
        if (raw == null || String(raw).trim() === '') return fallback;
        const n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
    };
    // These are absolute page coordinates: preview and print use them verbatim.
    return {
        mediaWidthMm:Math.max(56, Math.min(120, numberOr('label-media-width', 80))),
        mediaHeightMm:Math.max(10, Math.min(60, numberOr('label-media-height', 12))),
        offsetXmm:Math.max(-20, Math.min(30, numberOr('label-offset-x', -0.264583))),
        offsetYmm:Math.max(-5, Math.min(5, numberOr('label-offset-y', 0.79375))),
        bodyWidthMm:56, heightMm:12
    };
}

function inventoryLabelFrameOrigin(config = {}) {
    // V13: no hidden CSS-pixel corrections. X/Y are absolute millimetres.
    const x = Number(config.offsetXmm), y = Number(config.offsetYmm);
    return {x:Number.isFinite(x) ? x : -0.264583, y:Number.isFinite(y) ? y : 0.79375};
}

function nudgeInventoryLabelFrame(direction) {
    const config = readInventoryLabelPrintConfig();
    // Retain subpixel mm precision for repeatable 1px steps.
    const y = Math.max(-5, Math.min(5, config.offsetYmm + (direction < 0 ? -1 : 1) * 25.4 / 96));
    const input = getEl('label-offset-y');
    if (input) {input.value = String(Math.round(y * 1000000) / 1000000);input.dataset.kblTouched = '1';}
    rememberInventoryLabelPrintConfig();
}

function updateInventoryLabelCalibrationPreview() {
    const stage = getEl('label-calibration-stage');
    const tag = getEl('tag-preview-box');
    if (!stage || !tag) return;
    const config = readInventoryLabelPrintConfig();
    const origin = inventoryLabelFrameOrigin(config);
    stage.style.width = `${config.mediaWidthMm}mm`;
    stage.style.height = `${inventoryLabelMediaHeight(config)}mm`;
    tag.style.left = `${origin.x}mm`;
    tag.style.top = `${origin.y}mm`;
    if (getEl('label-calibration-media-readout')) getEl('label-calibration-media-readout').innerText = `${config.mediaWidthMm} × ${inventoryLabelMediaHeight(config)} mm`;
    if (getEl('label-calibration-x-readout')) getEl('label-calibration-x-readout').innerText = `${origin.x.toFixed(3)} mm (gốc in)`;
    if (getEl('label-calibration-y-readout')) getEl('label-calibration-y-readout').innerText = `${origin.y.toFixed(3)} mm (gốc in)`;
    const warning = getEl('label-calibration-warning');
    if (warning) {
        const cutsPage = origin.x + 3.8 < 0 || origin.x + 56 > config.mediaWidthMm || origin.y < 0 || origin.y + 11.1 > inventoryLabelMediaHeight(config);
        warning.textContent = cutsPage
            ? 'Vị trí này có thể vượt trang. Phần mềm kiểm tra nội dung trước khi gửi máy; chỉnh X/Y nếu có báo vượt khung. '
            : 'Nội dung nằm trong trang phần mềm. ';
        warning.textContent += 'TEM V14: thân nội dung giữ 56 × 12 mm; khổ trang gửi máy được đặt riêng. X/Y chỉ dịch nội dung, không thay Gap Offset của máy in. Với SNBC BTP-2200E BPLE và mẫu đã đối chiếu: trang 89 × 14 mm; Stock → Gap Height 0.12 in, Gap Offset 0.12 in, Labels With Gaps. Cần đặt trong Printing Preferences của Windows; cấu hình riêng trong BarTender không tự áp dụng sang POS. In thử 1 tem trước khi in lô; không cộng thêm 3 mm vào Y.';
    }
}

function rememberInventoryLabelPrintConfig() {
    const {mediaWidthMm,mediaHeightMm,offsetXmm,offsetYmm} = readInventoryLabelPrintConfig();
    const config = {mediaWidthMm,mediaHeightMm,offsetXmm,offsetYmm};
    for (const [id,key] of [['label-media-width','mediaWidthMm'],['label-media-height','mediaHeightMm'],['label-offset-x','offsetXmm'],['label-offset-y','offsetYmm']]) {
        const el = getEl(id);
        if (el) {el.value = String(config[key]);el.dataset.kblTouched = '1';}
    }
    try {
        const profiles = readInventoryLabelCalibrationProfiles();
        profiles[inventoryLabelCalibrationProfileKey()] = {...config,coordinateVersion:14,savedAt:new Date().toISOString()};
        // Keep all legacy settings untouched for rollback. Never remigrate a V14 profile.
        localStorage.setItem('kbl_label_calibration_v14_by_printer', JSON.stringify(profiles));
    } catch (_) {}
    updateInventoryLabelCalibrationPreview();
    return config;
}

function loadInventoryLabelCalibrationForPrinter() {
    let config = {mediaWidthMm:80, mediaHeightMm:12, offsetXmm:-0.264583, offsetYmm:0.79375};
    try {
        const key = inventoryLabelCalibrationProfileKey();
        const saved = readInventoryLabelCalibrationProfiles()[key];
        if (saved?.coordinateVersion === 14) {
            config = {...config, ...saved};
        } else {
            const v13Profiles = JSON.parse(localStorage.getItem('kbl_label_calibration_v13_by_printer') || '{}');
            const v13 = v13Profiles && typeof v13Profiles === 'object' ? v13Profiles[key] : null;
            if (v13?.coordinateVersion === 13) {
                config = {...config, ...v13};
            } else {
            const previous = JSON.parse(localStorage.getItem('kbl_label_calibration_v12_by_printer') || '{}');
            const v12 = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous[key] : null;
            if (v12?.coordinateVersion === 12) {
                config = {...config, ...v12};
                // Undo only the V12 default +2mm extension. Preserve manually
                // saved coordinates, and let the 12mm preflight reject overflow.
                if (Math.abs(Number(config.offsetYmm) - 2.79375) < 0.000001) config.offsetYmm = 0.79375;
            } else {
            const raw = JSON.parse(localStorage.getItem('kbl_label_calibration_by_printer') || '{}');
            const legacyProfiles = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
            let legacy = legacyProfiles[key];
            if (!legacy && !Object.keys(legacyProfiles).length) {
                legacy = {
                    mediaWidthMm:localStorage.getItem('kbl_label_media_width_mm') || 80,
                    offsetXmm:localStorage.getItem('kbl_label_offset_x_mm') || 0,
                    offsetYmm:localStorage.getItem('kbl_label_offset_y_mm') || 0
                };
            }
            if (legacy) {
                const oldX = Number(legacy.offsetXmm) || 0;
                const oldY = Number(legacy.offsetYmm) || 0;
                config.mediaWidthMm = Number(legacy.mediaWidthMm) || 80;
                config.offsetXmm = oldX - 25.4 / 96;
                // Convert legacy relative coordinates without adding a fictitious 2mm page extension.
                config.offsetYmm = oldY + 3 * 25.4 / 96;
            }
            }
            }
            // Migrate only this measured printer's page. Preserve X/Y and old profiles.
            // Do not add the 24-dot sensor offset to the HTML coordinates.
            if (inventoryLabelIsSnbcBple()) {
                config.mediaWidthMm = 89;
                config.mediaHeightMm = 14;
            }
        }
    } catch (_) {}
    config.mediaHeightMm = inventoryLabelMediaHeight(config);
    config.mediaWidthMm = Math.max(56, Math.min(120, Number(config.mediaWidthMm) || 80));
    config.offsetXmm = Math.max(-20, Math.min(30, Math.round(config.offsetXmm * 1000000) / 1000000));
    config.offsetYmm = Math.max(-5, Math.min(5, Math.round(config.offsetYmm * 1000000) / 1000000));
    for (const [id,key] of [['label-media-width','mediaWidthMm'],['label-media-height','mediaHeightMm'],['label-offset-x','offsetXmm'],['label-offset-y','offsetYmm']]) {
        const el = getEl(id);
        if (el) {el.value = String(config[key]);el.dataset.kblTouched = '1';}
    }
    rememberInventoryLabelPrintConfig();
}

function setInventoryLabelCalibrationPosition(xMm, yMm, save = false) {
    const x = Math.max(-20, Math.min(30, Math.round((Number(xMm) || 0) * 1000000) / 1000000));
    const y = Math.max(-5, Math.min(5, Math.round((Number(yMm) || 0) * 1000000) / 1000000));
    if (getEl('label-offset-x')) getEl('label-offset-x').value = String(x);
    if (getEl('label-offset-y')) getEl('label-offset-y').value = String(y);
    updateInventoryLabelCalibrationPreview();
    if (save) rememberInventoryLabelPrintConfig();
}

function centerInventoryLabelPreview() {
    // Restore a position inside the physical 12mm label; keep horizontal calibration.
    const config = readInventoryLabelPrintConfig();
    setInventoryLabelCalibrationPosition(config.offsetXmm, 0.79375, true);
}

function resetInventoryLabelPreview() {
    setInventoryLabelCalibrationPosition(0, 0, true);
}

function bindInventoryLabelCalibrationDrag() {
    const stage = getEl('label-calibration-stage');
    const tag = getEl('tag-preview-box');
    if (!stage || !tag || tag.dataset.kblDragBound === '1') return;
    tag.dataset.kblDragBound = '1';
    let drag = null;
    tag.addEventListener('pointerdown', (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        const rect = stage.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        drag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startOffsetX: Number(getEl('label-offset-x')?.value) || 0,
            startOffsetY: Number(getEl('label-offset-y')?.value) || 0,
            stageWidthPx: rect.width,
            stageHeightPx: rect.height,
            mediaWidthMm: Math.max(56, Math.min(120, Number(getEl('label-media-width')?.value) || 80))
        };
        try { tag.setPointerCapture(event.pointerId); } catch (_) {}
        tag.classList.add('kbl-label-dragging');
        event.preventDefault();
    });
    tag.addEventListener('pointermove', (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const dxMm = (event.clientX - drag.startX) * drag.mediaWidthMm / drag.stageWidthPx;
        const dyMm = (event.clientY - drag.startY) * 12 / drag.stageHeightPx;
        setInventoryLabelCalibrationPosition(drag.startOffsetX + dxMm, drag.startOffsetY + dyMm, false);
        event.preventDefault();
    });
    const finish = (event) => {
        if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
        try { tag.releasePointerCapture(drag.pointerId); } catch (_) {}
        drag = null;
        tag.classList.remove('kbl-label-dragging');
        rememberInventoryLabelPrintConfig();
    };
    tag.addEventListener('pointerup', finish);
    tag.addEventListener('pointercancel', finish);
}

function initInventoryLabelPrintConfig() {
    const ids = ['label-media-width','label-media-height','label-offset-x','label-offset-y'];
    ids.forEach(id => {
        const el = getEl(id);
        if (!el || el.dataset.kblPrintBound === '1') return;
        el.dataset.kblPrintBound = '1';
        el.dataset.kblTouched = '1';
        const update = () => { el.dataset.kblTouched = '1'; rememberInventoryLabelPrintConfig(); };
        el.addEventListener('change', update);
        el.addEventListener('input', () => { el.dataset.kblTouched = '1'; updateInventoryLabelCalibrationPreview(); });
    });
    loadInventoryLabelCalibrationForPrinter();
    bindInventoryLabelCalibrationDrag();
}

function inventoryLabelPrintCss(config = {}) {
    const mediaWidthMm = Math.max(56, Math.min(120, Number(config.mediaWidthMm) || 80));
    const {x:offsetXmm, y:offsetYmm} = inventoryLabelFrameOrigin(config);
    return inventoryLabelLayoutCss() + `
        @page { size:${mediaWidthMm}mm ${inventoryLabelMediaHeight(config)}mm; margin:0; }
        html,body { box-sizing:border-box; width:${mediaWidthMm}mm!important; height:${inventoryLabelMediaHeight(config)}mm!important; margin:0!important; padding:0!important; overflow:hidden!important; background:#fff!important; }
        .label-page { position:relative; width:${mediaWidthMm}mm; height:${inventoryLabelMediaHeight(config)}mm; margin:0; padding:0; overflow:visible; }
        .label-page .gold-tag-fold { position:absolute; left:${offsetXmm}mm; top:${offsetYmm}mm; }
        * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    `;
}

function inventoryLabelMetaSvg(values = {}) {
    // Draw small label text on explicit SVG baselines. HTML line boxes below
    // 6 CSS px can clip the tops of Vietnamese glyphs before reaching a printer.
    const e = escapeHtml, width = 26.6, units = 100;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const measure = (text, size) => {
        ctx.font = '700 100px Arial';
        return ctx.measureText(String(text)).width * size / 100;
    };
    const text = (value, x, y, size, maxWidth, anchor = 'start') => {
        const valueText = String(value || '---');
        const length = measure(valueText, size);
        const fit = length > maxWidth ? ` textLength="${maxWidth * units}" lengthAdjust="spacingAndGlyphs"` : '';
        return `<text x="${(x + .1) * units}" y="${y * units}" font-size="${size * units}" text-anchor="${anchor}"${fit}>${e(valueText)}</text>`;
    };
    const wrap = (value, size) => {
        const words = String(value || '---').trim().split(/\s+/);
        let first = '';
        while (words.length && (!first || measure(first + ' ' + words[0], size) <= width)) {
            first += (first ? ' ' : '') + words.shift();
        }
        // Keep every supplied word. The second line fits horizontally instead
        // of discarding data with ellipsis or hiding it outside a line box.
        return [first, words.join(' ')];
    };
    // KBL 29/09/2026: tăng chữ tem đúng khoảng +1 CSS px (≈0,265mm)
    // và nới baseline theo chiều dọc để dấu tiếng Việt không chồng lên dòng kế tiếp.
    const company = wrap(values.companyAddress, 1.365);
    const supplier = wrap(values.supplierAddress, 1.365);
    const rows = [
        text('KIM BẢO LÂM', 0, 1.45, 1.565, 15.5),
        text(values.code, width, 1.45, 1.365, 10.3, 'end'),
        text('CTy TNHH VBDQ Kim Bảo Lâm', 0, 3.00, 1.365, width),
        text(company[0], 0, 4.40, 1.365, width),
        company[1] ? text(company[1], 0, 5.80, 1.365, width) : '',
        text(values.supplierName, 0, 7.20, 1.365, width),
        text(supplier[0], 0, 8.60, 1.365, width),
        supplier[1] ? text(supplier[1], 0, 10.00, 1.365, width) : '',
        text(values.standard, 0, 11.40, 1.365, 16.5),
        text(values.origin, width, 11.40, 1.365, 9.55, 'end')
    ];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2690 1165" width="26.9mm" height="11.65mm" style="display:block;overflow:visible" role="img" aria-label="Thông tin đơn vị, mã sản phẩm, nhà cung cấp, TCCS và xuất xứ"><g fill="#000" font-family="Arial,Helvetica,sans-serif" font-weight="700">${rows.join('')}</g></svg>`;
}

function updateInventoryLabelMetaPreview() {
    const host = getEl('t-meta-svg');
    if (!host) return;
    host.innerHTML = inventoryLabelMetaSvg({
        code: getEl('t-code')?.textContent,
        companyAddress: getEl('t-company-address')?.textContent,
        supplierName: getEl('t-ncc')?.textContent,
        supplierAddress: getEl('t-ncc-address')?.textContent,
        standard: getEl('t-tccs')?.textContent,
        origin: getEl('t-origin')?.textContent
    });
}

function inventoryLabelDataSvg(values = {}) {
    const width = 12.95, units = 100;
    const ctx = document.createElement('canvas').getContext('2d');
    const text = (value, x, y, size, limit, anchor = 'start') => {
        const raw = String(value || '—');
        ctx.font = '700 100px Arial';
        const length = ctx.measureText(raw).width * size / 100;
        const fit = length > limit ? ` textLength="${limit * units}" lengthAdjust="spacingAndGlyphs"` : '';
        return `<text x="${x * units}" y="${y * units}" font-size="${size * units}" text-anchor="${anchor}"${fit}>${escapeHtml(raw)}</text>`;
    };
    // KBL 29/09/2026: +1 CSS px cho chữ dữ liệu và tăng khoảng cách baseline.
    const row = (label, value, y) => { const labelSvg = text(label, .1, y, 1.665, 3.05); const valueX = .1 + Math.min(ctx.measureText(label).width * 1.665 / 100, 3.05) + .45; return labelSvg + text(value, valueX, y, 1.765, width - valueX - .1); }; // KBL_UI_TAG_GAP_V5
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1295 1090" width="12.95mm" height="10.9mm" style="display:block;overflow:visible" role="img" aria-label="Thông tin sản phẩm"><g fill="#000" font-family="Arial,Helvetica,sans-serif" font-weight="700">${[
        text(values.name, .1, 1.55, 1.765, width - .2),
        row('TKL:', values.gross, 3.30),
        row('KLH:', values.gem, 5.05),
        row('KLV:', values.net, 6.80),
        row('Công:', values.wage, 8.55),
        (() => { const purityLabel = 'HLV: ' + String(values.type || '—').replace(/^9999$/, '999.9'); const first = text(purityLabel, .1, 10.30, 1.515, 6.2); const markX = .1 + Math.min(ctx.measureText(purityLabel).width * 1.515 / 100, 6.2) + .7; return first + text('KH: ' + String(values.mark || '—'), markX, 10.30, 1.515, width - markX - .1); })() // KBL_UI_TAG_PAIR_V5
    ].join('')}</g></svg>`;
}

function updateInventoryLabelDataPreview() {
    const host = getEl('t-data-svg');
    if (!host) return;
    host.innerHTML = inventoryLabelDataSvg({
        name: getEl('t-name')?.textContent,
        gross: getEl('t-klt')?.textContent,
        gem: getEl('t-klh')?.textContent,
        net: getEl('t-klv')?.textContent,
        wage: getEl('t-wage')?.textContent,
        type: getEl('t-hl')?.textContent,
        mark: getEl('t-kh')?.textContent
    });
}

function inventoryTagHtml(snapshot, qrDataUrl) {
    const s = snapshot || {};
    const e = escapeHtml;
    const companyAddress = '59/1 Nguyễn Thị Tươi, P. Tân Đông Hiệp, TP.HCM';
    return `<div class="gold-tag-fold" style="--kbl-label-qr-size:${inventoryLabelQrPrintSize(qrDataUrl)}mm" data-label-sku="${e(s.code || '')}">
        <div class="tag-leaf tag-leaf-left">
            <div class="tag-left-data">${inventoryLabelDataSvg({
                name: s.name || 'SP',
                gross: (numberValue(s.grossLy)/100).toFixed(3) + ' Chỉ',
                gem: (numberValue(s.gemLy)/100).toFixed(3) + ' Chỉ',
                net: (numberValue(s.netLy)/100).toFixed(3) + ' Chỉ',
                wage: formatVND(s.wage || 0),
                type: s.type || '',
                mark: s.specialMark || '—'
            })}</div>
            <div class="tag-left-qr">
                <div class="tag-qr-box">${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR ${e(s.code || '')}">` : ''}</div>
            </div>
        </div>
        <div class="tag-leaf tag-leaf-right">
            <div class="tag-right-meta">${inventoryLabelMetaSvg({
                code: s.code || '',
                companyAddress: 'Địa chỉ: ' + companyAddress,
                supplierName: 'NCC: ' + String(s.supplierName || '---'),
                supplierAddress: 'Địa chỉ: ' + String(s.supplierAddress || '---'),
                standard: 'TCCS: ' + String(s.standard || '---').replace(/^TCCS\s*:?\s*/i, ''),
                origin: 'XX: ' + String(s.origin || 'Việt Nam')
            })}</div>
        </div>
    </div>`;
}

async function validateInventoryLabelPrintHtml(html, config) {
    // Validate the exact document sent to IPC; works with the existing main.js.
    // Artwork remains 12mm tall; validate against the independently configured print page.
    const frame = document.createElement('iframe');
    frame.dataset.kblLabelMeasure = '1';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${config.mediaWidthMm}mm;height:${inventoryLabelMediaHeight(config)}mm;border:0;visibility:hidden;pointer-events:none;`;
    let timer;
    try {
        const loaded = new Promise((resolve,reject) => {
            frame.onload = resolve;
            frame.onerror = () => reject(new Error('Không dựng được trang in tem.'));
        });
        frame.srcdoc = html;
        document.body.appendChild(frame);
        const inspect = async () => {
            await loaded;
            const doc = frame.contentDocument;
            if (!doc?.querySelector('.label-page')) throw new Error('Thiếu khung in tem.');
            if (doc.fonts?.ready) await doc.fonts.ready;
            await Promise.all(Array.from(doc.images).map(img => img.decode ? img.decode() : Promise.resolve()));
            if (Array.from(doc.images).some(img => !img.complete || !img.naturalWidth)) throw new Error('QR chưa tải xong.');
            const page = doc.querySelector('.label-page').getBoundingClientRect();
            const tolerance = .12;
            const nodes = doc.querySelectorAll('.tag-left-data,.tag-left-qr,.tag-right-meta');
            for (const node of nodes) {
                const b = node.getBoundingClientRect();
                if (b.top < page.top - tolerance) throw new Error('Gốc Y đang đẩy nội dung lên ngoài trang, làm mất dòng đầu. Bấm ↓ Khung 1 px hoặc Về khung rồi in thử lại.');
                if (b.bottom > page.bottom + tolerance) throw new Error('Nội dung vượt mép dưới trang in đã chọn. Chưa gửi máy để tránh mất TCCS/xuất xứ. Kiểm tra chiều cao trang và gốc Y; thân nội dung vẫn 12 mm.');
                if (b.left < page.left - tolerance || b.right > page.right + tolerance) throw new Error('Gốc X đang đẩy nội dung ra ngoài trang. Chỉnh lại X trước khi in.');
                for (const child of node.children) {
                    const c = child.getBoundingClientRect();
                    if (c.top < b.top - tolerance || c.bottom > b.bottom + tolerance) throw new Error('Dòng tem vượt hộp nội dung. Chưa gửi máy để tránh mất chữ.');
                }
            }
            for (const node of doc.querySelectorAll('.t-row > *,.t-code-line')) {
                if (node.scrollWidth > node.clientWidth + 1) throw new Error('Dòng số hoặc mã SP vượt khung tem. Chưa gửi máy để tránh mất thông tin.');
            }
        };
        await Promise.race([inspect(),new Promise((_,reject) => {timer=setTimeout(()=>reject(new Error('Chưa kiểm tra xong trang in sau 10 giây.')),10000);})]);
    } finally {
        clearTimeout(timer);
        frame.onload = frame.onerror = null;
        frame.remove();
    }
}

async function printInventoryItemsDirectly(items, copiesPerItem = 1, itemsAreSnapshots = false) {
    if (printInventoryItemsDirectly.busy) {
        inventoryLabelPrintStatus('Đang gửi lô tem hiện tại. Hãy chờ kết quả trước khi in tiếp.');
        return;
    }
    const deviceName = getEl('label-printer')?.value || '';
    const copies = Math.max(1, Math.min(50, parseInt(copiesPerItem || 1, 10) || 1));
    const source = (Array.isArray(items) ? items : []).filter(Boolean);
    if (!source.length) return;
    // Freeze the print data before any await; never load it into or write to the inventory form.
    const snapshots = source.map(item => ({ ...(itemsAreSnapshots ? item : inventoryTagSnapshotFromItem(item)) }));
    const config = rememberInventoryLabelPrintConfig();
    const qrCache = new Map();
    let printed = 0;
    printInventoryItemsDirectly.busy = true;
    try {
        for (const snapshot of snapshots) {
            const sku = String(snapshot.code || '').trim();
            if (!sku) throw new Error('Có món thiếu Mã SP. Chưa gửi món này tới máy in.');
            inventoryLabelPrintStatus(`Đang gửi ${sku} · ${printed}/${snapshots.length * copies} tem đã gửi.`);
            const productUrl = inventoryLabelPublicUrl(sku);
            if (!productUrl) throw new Error(`Mã SP ${sku}: mẫu URL tem không nhận diện được sản phẩm. Kiểm tra mẫu {sku}/{code}; không in QR chỉ dẫn về trang chủ.`);
            if (!qrCache.has(sku)) qrCache.set(sku, await makeInventoryLabelQrDataUrl(productUrl));
            const qrDataUrl = qrCache.get(sku);
            if (!qrDataUrl) throw new Error(`Không tạo được QR cho ${sku}. Dừng in để tránh tem thiếu mã.`);
            const tag = inventoryTagHtml(snapshot, qrDataUrl);
            const fullHtml = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><style>${inventoryLabelPrintCss(config)}</style></head><body><section class="label-page">${tag}</section></body></html>`;
            await validateInventoryLabelPrintHtml(fullHtml, config);
            const res = await ipcRenderer.invoke('gold:print-label', { html:fullHtml, deviceName, widthMm:config.mediaWidthMm, heightMm:inventoryLabelMediaHeight(config), copies });
            if (!res || !res.success) throw new Error(`Mã SP ${sku}: ${(res && res.failureReason) || 'Không nhận được kết quả máy in.'}`);
            printed += copies;
        }
        const origin = inventoryLabelFrameOrigin(config);
        const message = `TEM V14 · Đã gửi ${printed} tem · trang in ${config.mediaWidthMm}×${inventoryLabelMediaHeight(config)} mm · thân 56×12 mm · gốc in X ${origin.x.toFixed(3)} mm · Y ${origin.y.toFixed(3)} mm.`;
        inventoryLabelPrintStatus(message);
        alert('✅ ' + message);
    } catch (error) {
        const message = `${error?.message || error} Đã gửi ${printed} tem trước khi dừng. Kiểm tra hàng đợi máy in trước khi in lại.`;
        inventoryLabelPrintStatus(message);
        alert('❌ ' + message);
    } finally { printInventoryItemsDirectly.busy = false; }
}

async function printInventoryLabelCalibrationTest() {
    const code = String(getEl('inv-new-code')?.value || '').trim();
    const item = inventoryStore.find(row => String(row?.code || '').trim() === code);
    if (!item) return alert('Hãy chọn hoặc mở một món đã LƯU trong Kho POS rồi bấm In thử 1 tem.');
    rememberInventoryLabelPrintConfig();
    await printInventoryItemsDirectly([item], 1, false);
}

async function printStandaloneTagDirectly() {
    const qty = Math.max(1, Math.min(50, parseInt(getEl('label-quantity')?.value || '1', 10) || 1));
    const code = String(getEl('inv-new-code')?.value || '').trim();
    const item = inventoryStore.find(row => String(row?.code || '').trim() === code);
    if (!item) return alert('Hãy LƯU món vào Kho POS trước khi in tem. Tem chỉ lấy dữ liệu từ hồ sơ Kho đã lưu để tránh lệch thông tin.');
    await printInventoryItemsDirectly([item], qty, false);
}

// =================================================================
// 7. TAB 3: BÁN HÀNG - ĐỔI BÙ - TRẢ HÀNG
// =================================================================
function saleCartTotal() {
    return salesCart.reduce((sum, item) => sum + numberValue(item.totalPay), 0);
}

function saleCartProfit() {
    return salesCart.reduce((sum, item) => sum + numberValue(item.profit), 0);
}

function inventorySellPrice(item) {
    if (!item) return 0;
    const type = String(item.type || '').trim();
    return numberValue(item.priceSell) || numberValue(settingsStore[`price_sell_${type}`]);
}

function inventorySellWage(item) {
    return numberValue(item?.sellWage) || numberValue(item?.wage);
}

function inventoryEffectiveBookCost(item) {
    if (!item) return 0;
    const weightChi = Math.max(0, numberValue(item.weightLy) / 100);
    const audit = item.invoiceImport || item.costAuditSnapshot || {};
    const goldUnitPrice = Math.max(0,
        numberValue(item.goldCostPrice)
        || numberValue(audit.goldUnitPrice)
        || numberValue(audit.goldPrice)
    );
    const storedGoldTotal = Math.max(0,
        numberValue(item.goldCostTotal)
        || numberValue(audit.goldAmount)
        || numberValue(audit.allocatedGoldCost)
    );
    const originalWage = Math.max(0, numberValue(item.originalWage) || numberValue(audit.originalWage));
    const processCost = Math.max(0, numberValue(item.processCost));
    const wageCost = originalWage + processCost;
    const storedTotal = Math.max(0, numberValue(item.totalCost) || numberValue(audit.totalCost));

    // KBL 30/08/2026 — CÔNG THỨC GIÁ VỐN DUY NHẤT.
    // goldCostPrice là ĐƠN GIÁ VÀNG NHẬP / CHỈ, không phải giá của nguyên món.
    // Vì vậy khi có đủ đơn giá + trọng lượng, luôn tính lại:
    //   giá vốn = (ly / 100 × đơn giá nhập/chỉ) + công nhập + gia công thực.
    // Cách này đồng thời sửa dữ liệu cũ từng lưu nhầm 8.800.000 vào goldCostTotal/totalCost.
    if (goldUnitPrice > 0 && weightChi > 0) {
        return Math.round(weightChi * goldUnitPrice) + wageCost;
    }

    // Dữ liệu cũ thiếu đơn giá: ưu tiên tiền vàng đã lưu + công; cuối cùng mới dùng totalCost.
    if (storedGoldTotal > 0) return Math.round(storedGoldTotal + wageCost);
    if (storedTotal > 0) return Math.round(storedTotal);
    return Math.round(wageCost);
}

function getSaleDraft() {
    if (!currentSelectedInvItem) return null;
    const priceSell = inventorySellPrice(currentSelectedInvItem);
    const wage = inventorySellWage(currentSelectedInvItem);
    const discount = numberValue(getEl('s-discount') ? getEl('s-discount').value : 0);
    const totalPay = Math.round((numberValue(currentSelectedInvItem.weightLy) / 100) * priceSell + wage - discount);
    const effectiveBookCost = inventoryEffectiveBookCost(currentSelectedInvItem);
    return {
        inventoryUid: currentSelectedInvItem.inventoryUid || '',
        originalInvCode: currentSelectedInvItem.code || '',
        invCode: currentSelectedInvItem.code,
        itemName: currentSelectedInvItem.name,
        type: currentSelectedInvItem.type,
        weightLy: numberValue(currentSelectedInvItem.weightLy),
        supplierPurity: smartExchange610NewPurity(currentSelectedInvItem),
        sourceType: currentSelectedInvItem.sourceType || '',
        sourceId: currentSelectedInvItem.sourceId || '',
        sourceItemIndex: currentSelectedInvItem.sourceItemIndex,
        goldCostPrice: numberValue(currentSelectedInvItem.goldCostPrice),
        goldCostTotal: numberValue(currentSelectedInvItem.goldCostTotal),
        originalWage: numberValue(currentSelectedInvItem.originalWage),
        processCost: numberValue(currentSelectedInvItem.processCost),
        totalCost: effectiveBookCost,
        priceSell,
        wage,
        discount,
        totalPay,
        profit: totalPay - effectiveBookCost
    };
}

function getExchangeNewItems() {
    const lines = salesCart.slice();
    const draft = getSaleDraft();
    if (draft && !lines.some(item => item.invCode === draft.invCode)) lines.push(draft);
    return lines;
}

function readWeightFields(prefix) {
    return weightPartsToLy(
        getEl(`${prefix}-l`)?.value,
        getEl(`${prefix}-c`)?.value,
        getEl(`${prefix}-p`)?.value,
        getEl(`${prefix}-y`)?.value
    );
}

function getExchangeOldDraft() {
    const grossLy = readWeightFields('ex-old-gross');
    const gemLy = readWeightFields('ex-old-gem');
    const dirtLy = readWeightFields('ex-old-dirt');
    const weightLy = Math.max(0, roundWeightLy(grossLy - gemLy - dirtLy));
    const type = getEl('ex-old-type') ? getEl('ex-old-type').value : '9999';

    if (getEl('ex-old-weight')) getEl('ex-old-weight').value = weightLy;
    if (getEl('lbl-ex-old-net-weight')) {
        getEl('lbl-ex-old-net-weight').innerText = `${formatWeightLy(weightLy)} ly (${(weightLy / 100).toFixed(3)} chỉ)`;
    }

    return {
        code: getEl('ex-old-code') ? getEl('ex-old-code').value.trim() : '',
        name: getEl('ex-old-name') ? getEl('ex-old-name').value.trim() : 'Vàng cũ của khách',
        type,
        grossLy,
        gemLy,
        dirtLy,
        weightLy,
        priceBuy: numberValue(settingsStore[`price_buy_${type}`])
    };
}

function getExchangeOldItems() {
    if (exchangeOldCart.length) return exchangeOldCart.slice();
    const draft = getExchangeOldDraft();
    return draft.weightLy > 0 ? [draft] : [];
}

function exchangeOldWeight() {
    return getExchangeOldItems().reduce((sum, item) => sum + numberValue(item.weightLy), 0);
}

function exchangeOldValue() {
    return getExchangeOldItems().reduce((sum, item) => {
        return sum + (numberValue(item.weightLy) / 100) * numberValue(item.priceBuy);
    }, 0);
}

function exchangeFeeForPair(oldType, newType) {
    if (oldType === '980' && newType === '980') {
        const value = settingsStore.exchange_fee_980_980;
        return value === undefined || value === null || value === '' ? 120000 : Math.max(0, Number(value) || 0);
    }
    if (oldType === '610' && newType === '610') {
        const value = settingsStore.exchange_fee_610_610;
        const fallback = settingsStore.default_exchange_fee;
        if (value === undefined || value === null || value === '') {
            return fallback === undefined || fallback === null || fallback === ''
                ? 400000
                : Math.max(0, Number(fallback) || 0);
        }
        return Math.max(0, Number(value) || 0);
    }
    return 0;
}

function exchangeRefundForPair(oldType, newType) {
    if (oldType === '9999' && newType === '610') {
        const value = settingsStore.exchange_refund_9999_610;
        return value === undefined || value === null || value === '' ? 30000 : Math.max(0, Number(value) || 0);
    }
    return 0;
}

function exchangeRuleText(oldType, newType) {
    const key = `${oldType}>${newType}`;
    const labels = {
        '980>980': 'Đổi ngang 980 → 980',
        '980>610': 'Giá mua 980 cũ → giá bán 610 mới',
        '980>9999': 'Giá mua 980 cũ → giá bán 9999 mới',
        '9999>980': 'Đổi ngang 9999 → 980, chỉ tính công 980',
        '9999>9999': '9999 → 9999, không thu gì khi đổi ngang',
        '9999>610': 'Giá mua 9999 cũ → giá bán 610 mới, điều chỉnh trả 30.000đ/chỉ',
        '610>610': 'Đổi bù 610 → 610 theo bảng giá POS + công tem',
        '610>980': 'Giá mua 610 cũ → giá bán 980 mới',
        '610>9999': 'Giá mua 610 cũ → giá bán 9999 mới'
    };
    return labels[key] || `Giá mua ${oldType} cũ → giá bán ${newType} mới`;
}

function smartExchange610Eligible(newItems, oldItems) {
    const n = Array.isArray(newItems) ? newItems.filter(item => numberValue(item?.weightLy) > 0) : [];
    const o = Array.isArray(oldItems) ? oldItems.filter(item => numberValue(item?.weightLy) > 0) : [];
    return n.length > 0 && o.length > 0
        && n.every(item => String(item.type || '') === '610')
        && o.every(item => String(item.type || '') === '610');
}

function smartExchange610NewPurity(item) {
    const fallback = String(item?.sourceType || '').toLowerCase() === 'purchase'
        ? smartClampPurity(settingsStore.exchange_old_purity_610, 61)
        : smartClampPurity(settingsStore.exchange_new_purity_610_default, 63);
    return smartClampPurity(item?.supplierPurity, fallback);
}

function smartExchange610Status(profit, reserveProfit, targetProfit) {
    const baseFloor = Math.max(0, numberValue(settingsStore.profit_floor_base) || 100000);
    if (profit < 0) return { code: 'loss', label: '🔴 LỖ — chủ tiệm xem lại ca đổi trước khi xác nhận' };
    if (profit < baseFloor) return { code: 'thin', label: '🟠 BIÊN MỎNG — có lời nhưng dưới ngưỡng nền đang cấu hình' };
    if (profit < targetProfit) return { code: 'ok', label: '🟢 CÓ LỜI — công/giá đang trong vùng có thể xử lý' };
    return { code: 'good', label: profit > reserveProfit ? '✅ LÃI TỐT — có thể cân nhắc miễn phí giao hàng' : '✅ LÃI TỐT' };
}

function calculateSmart610ExchangeSettlement(newItems, oldItems, discount = 0) {
    const newEntries = (Array.isArray(newItems) ? newItems : []).filter(item => numberValue(item?.weightLy) > 0);
    const oldEntries = (Array.isArray(oldItems) ? oldItems : []).filter(item => numberValue(item?.weightLy) > 0);
    const newWeightLy = newEntries.reduce((sum, item) => sum + numberValue(item.weightLy), 0);
    const oldWeightLy = oldEntries.reduce((sum, item) => sum + numberValue(item.weightLy), 0);
    const newWeightChi = newWeightLy / 100;
    const oldWeightChi = oldWeightLy / 100;
    const deltaLy = newWeightLy - oldWeightLy;
    const deltaChi = deltaLy / 100;

    // NGUỒN GIÁ: bảng giá POS hiện tại.
    // Khách: thiếu vàng dùng giá BÁN POS; dư vàng dùng giá MUA POS.
    // Chành: giá MUA = giá MUA POS + 200.000đ/chỉ; giá BÁN = giá BÁN POS.
    const retailBuy = Math.max(0, numberValue(settingsStore.price_buy_610));
    const retailSell = Math.max(0, numberValue(settingsStore.price_sell_610));
    const chanhBuy = retailBuy + 200000;
    const chanhSell = retailSell;

    // ĐỔI NGANG KBL: vàng cũ khách luôn tính 610; hàng mới 622/625/630
    // đều quy bảo thủ thành 630. Hai bên cùng quy về mốc công nợ 622 của chành.
    const oldPurity = 61;
    const averageNewPurity = 63;
    const chanhBasePurity = 62.2;

    // LẦN 1 — KHÁCH ↔ TIỆM.
    let customerGoldDifference = 0;
    let customerDifferenceRate = 0;
    let differenceKind = 'equal';
    if (deltaLy > 0) {
        differenceKind = 'shortage';
        customerDifferenceRate = retailSell;
        customerGoldDifference = deltaChi * retailSell;
    } else if (deltaLy < 0) {
        differenceKind = 'surplus';
        customerDifferenceRate = retailBuy;
        customerGoldDifference = deltaChi * retailBuy; // delta âm => tiệm trả khách.
    }

    const wageTotal = newEntries.reduce((sum, item) => sum + inventorySellWage(item), 0);
    const wageCostTotal = newEntries.reduce((sum, item) => sum + numberValue(item.originalWage) + numberValue(item.processCost), 0);
    const lockedDiscount = 0; // công niêm yết khóa cứng theo Mã SP/tem.
    const totalPay = Math.round(customerGoldDifference + wageTotal - lockedDiscount);

    // LẦN 2 — TIỆM ↔ CHÀNH.
    // Mới_622 = Wmới × 630 / 622
    // Cũ_622  = Wcũ  × 610 / 622
    const newEquivalentBaseChi = newWeightChi * 630 / 622;
    const oldEquivalentNewChi = oldWeightChi * 610 / 622;
    const chanhDifferenceChi = newEquivalentBaseChi - oldEquivalentNewChi;

    // Dòng tiền chành: tiền vào tiệm là dương, tiền tiệm trả chành là âm.
    let chanhGoldCashFlow = 0;
    let chanhDifferenceRate = 0;
    let chanhDifferenceKind = 'equal';
    if (chanhDifferenceChi > 0) {
        chanhDifferenceKind = 'shortage';
        chanhDifferenceRate = chanhSell;
        chanhGoldCashFlow = -(chanhDifferenceChi * chanhSell);
    } else if (chanhDifferenceChi < 0) {
        chanhDifferenceKind = 'surplus';
        chanhDifferenceRate = chanhBuy;
        chanhGoldCashFlow = Math.abs(chanhDifferenceChi) * chanhBuy;
    }

    // LÃI THỰC CA ĐỔI NẾU CHỐT CHÀNH NGAY:
    // Dòng tiền vàng khách + dòng tiền chành + (công bán - công vốn).
    const goldMarketMargin = customerGoldDifference + chanhGoldCashFlow;
    const wageMargin = wageTotal - wageCostTotal;
    const marketProfit = Math.round(goldMarketMargin + wageMargin - lockedDiscount);

    // GIÁ VỐN TOA/MÃ SP chỉ giữ làm số tham khảo lịch sử; KHÔNG dùng để quyết định
    // lãi/lỗ của ca Đổi ngang KBL theo công thức chành 610/630 -> 622 đã chốt.
    const itemBookCost = (item) => inventoryEffectiveBookCost(item);
    const bookCosts = newEntries.map(itemBookCost);
    const hasCompleteBookCost = bookCosts.length > 0 && bookCosts.every(value => value > 0);
    const bookTotalCost = bookCosts.reduce((sum, value) => sum + value, 0);
    const oldPurchaseValue = Math.round(oldWeightChi * retailSell);
    const bookProfit = hasCompleteBookCost
        ? Math.round(oldPurchaseValue + totalPay - bookTotalCost)
        : null;

    // Số dùng ra quyết định luôn là lãi thực theo dòng tiền Khách ↔ Tiệm ↔ Chành.
    const decisionProfit = marketProfit;
    const minProfit = Math.max(0, numberValue(settingsStore.free_ship_reserve_profit) || 100000);
    const targetProfit = flexibleProfitTarget(newWeightChi);
    const freeShipBudget = Math.max(0, Math.floor(decisionProfit - minProfit));
    const status = smartExchange610Status(decisionProfit, minProfit, targetProfit);

    // Các giá trị tham khảo để giữ nguyên cấu trúc dữ liệu/UI hiện tại.
    const oldCycleValue = oldEquivalentNewChi * chanhBuy;
    const newReplacementValue = newEquivalentBaseChi * chanhSell;

    const sourceRefs = [...new Set(newEntries.map(item => {
        const source = String(item.sourceId || '').trim();
        if (!source) return '';
        const idx = item.sourceItemIndex;
        return idx === undefined || idx === null ? source : `${source}#${Number(idx) + 1}`;
    }).filter(Boolean))];

    const customerFormula = {
        newWeightChi,
        oldWeightChi,
        differenceChi: Math.abs(deltaChi),
        signedDifferenceChi: deltaChi,
        differenceKind,
        differenceRate: customerDifferenceRate,
        goldDifferenceAmount: Math.round(customerGoldDifference),
        wageTotal: Math.round(wageTotal),
        totalPay
    };
    const internal = {
        oldPurity,
        averageNewPurity,
        chanhBasePurity,
        oldEquivalentNewChi,
        newEquivalentBaseChi,
        chanhDifferenceChi,
        chanhDifferenceKind,
        chanhDifferenceRate,
        chanhBuy,
        chanhSell,
        chanhGoldCashFlow: Math.round(chanhGoldCashFlow),
        retailBuy,
        retailSell,
        oldCycleValue: Math.round(oldCycleValue),
        oldPurchaseValue: Math.round(oldPurchaseValue),
        newReplacementValue: Math.round(newReplacementValue),
        goldMarketMargin: Math.round(goldMarketMargin),
        wageTotal: Math.round(wageTotal),
        wageCostTotal: Math.round(wageCostTotal),
        wageMargin: Math.round(wageMargin),
        hasCompleteBookCost,
        bookTotalCost: Math.round(bookTotalCost),
        bookProfit,
        marketProfit,
        profit: decisionProfit,
        minProfit,
        targetProfit,
        freeShipBudget,
        sourceRefs,
        status
    };

    return {
        smart610: true,
        totalPay,
        newWeight: newWeightLy,
        oldWeight: oldWeightLy,
        oldGoldValue: Math.round(oldPurchaseValue),
        profit: decisionProfit,
        newBookTotalCost: Math.round(bookTotalCost),
        customerFormula,
        internal
    };
}
function calculateExchangeSettlement(newItems, oldItems, discount = 0) {
    const newEntries = (Array.isArray(newItems) ? newItems : [])
        .map((item, index) => ({ item, index, type: String(item.type || ''), initialLy: numberValue(item.weightLy), remainingLy: numberValue(item.weightLy) }))
        .filter(entry => entry.initialLy > 0);
    const oldEntries = (Array.isArray(oldItems) ? oldItems : [])
        .map((item, index) => ({ item, index, type: String(item.type || ''), initialLy: numberValue(item.weightLy), remainingLy: numberValue(item.weightLy) }))
        .filter(entry => entry.initialLy > 0);

    // KBL 27/09/2026 — Đổi Bù cùng loại 610/980:
    // phí đổi tính trên TOÀN BỘ trọng lượng vàng cũ đem đổi, không chỉ phần đối ứng.
    // Phần vàng cũ dư dùng đúng giá MUA VÀO hiện hành trong Cài đặt POS.
    const sameTypeCodes = [...new Set([
        ...newEntries.map(entry => entry.type),
        ...oldEntries.map(entry => entry.type)
    ].filter(Boolean))];
    const fullOldWeightSameTypeFeePolicy = sameTypeCodes.length === 1
        && ['610', '980'].includes(sameTypeCodes[0])
        && newEntries.length > 0
        && oldEntries.length > 0;

    const segments = [];
    const addSegment = (newEntry, oldEntry, weightLy) => {
        const ly = Math.max(0, roundWeightLy(weightLy));
        if (!ly) return;
        segments.push({ newEntry, oldEntry, weightLy: ly });
        if (newEntry) newEntry.remainingLy -= ly;
        if (oldEntry) oldEntry.remainingLy -= ly;
    };

    newEntries.forEach(newEntry => {
        oldEntries.forEach(oldEntry => {
            if (newEntry.remainingLy <= 0 || oldEntry.remainingLy <= 0) return;
            if (newEntry.type !== oldEntry.type) return;
            addSegment(newEntry, oldEntry, Math.min(newEntry.remainingLy, oldEntry.remainingLy));
        });
    });
    newEntries.forEach(newEntry => {
        oldEntries.forEach(oldEntry => {
            if (newEntry.remainingLy <= 0 || oldEntry.remainingLy <= 0) return;
            addSegment(newEntry, oldEntry, Math.min(newEntry.remainingLy, oldEntry.remainingLy));
        });
    });
    newEntries.forEach(newEntry => {
        if (newEntry.remainingLy > 0) addSegment(newEntry, null, newEntry.remainingLy);
    });
    oldEntries.forEach(oldEntry => {
        if (oldEntry.remainingLy > 0) addSegment(null, oldEntry, oldEntry.remainingLy);
    });

    let totalPay = 0;
    let specialFee = 0;
    let refundAdjustment = 0;
    const wageShouldCharge = new Map();
    // Theo quy tắc chốt 27/09/2026: với Đổi Bù cùng loại 610/980,
    // phí đổi áp dụng trên TOÀN BỘ trọng lượng vàng cũ đem đổi.
    const sameTypeMatchedLy = new Map();
    const refundOldEntries = new Set();
    const adjustmentLines = [];

    const newPrice = entry => inventorySellPrice(entry?.item);
    const oldPrice = entry => {
        const liveBuy = numberValue(settingsStore[`price_buy_${entry?.type}`]);
        if (fullOldWeightSameTypeFeePolicy && liveBuy > 0) return liveBuy;
        return numberValue(entry?.item?.priceBuy) || liveBuy;
    };

    segments.forEach(segment => {
        const n = segment.newEntry;
        const o = segment.oldEntry;
        const nLy = segment.weightLy;
        const nValue = n ? (nLy / 100) * newPrice(n) : 0;
        const oValue = o ? (nLy / 100) * oldPrice(o) : 0;

        if (n && !o) {
            totalPay += nValue;
            wageShouldCharge.set(n.index, true);
            return;
        }
        if (!n && o) {
            totalPay -= oValue;
            return;
        }
        if (!n || !o) return;

        const oldType = o.type;
        const newType = n.type;
        const baseDifference = nValue - oValue;
        const sameType = oldType === newType;

        if (sameType && (oldType === '980' || oldType === '610')) {
            sameTypeMatchedLy.set(o.index, numberValue(sameTypeMatchedLy.get(o.index)) + nLy);
            totalPay += 0;
            wageShouldCharge.set(n.index, true);
            return;
        }

        if (oldType === '9999' && newType === '9999') {
            totalPay += 0;
            return;
        }

        if (oldType === '9999' && newType === '980') {
            totalPay += 0;
            wageShouldCharge.set(n.index, true);
            return;
        }

        if (oldType === '9999' && newType === '610') {
            totalPay += baseDifference;
            refundOldEntries.add(o.index);
            wageShouldCharge.set(n.index, true);
            return;
        }

        // 610 → 9999: vàng cũ tính giá mua vào, vàng mới tính giá bán ra; không cộng công.
        if (oldType === '610' && newType === '9999') {
            totalPay += baseDifference;
            return;
        }

        totalPay += baseDifference;
        wageShouldCharge.set(n.index, true);
    });

    let wageTotal = 0;
    newEntries.forEach(entry => {
        if (wageShouldCharge.get(entry.index)) {
            const wage = inventorySellWage(entry.item);
            wageTotal += wage;
            totalPay += wage;
        }
    });

    oldEntries.forEach(entry => {
        const matchedLy = Math.max(0, roundWeightLy(numberValue(sameTypeMatchedLy.get(entry.index))));
        const feeWeightLy = fullOldWeightSameTypeFeePolicy
            ? Math.max(0, roundWeightLy(entry.initialLy))
            : matchedLy;
        if (!feeWeightLy) return;
        const fee = exchangeFeeForPair(entry.type, entry.type);
        const amount = Math.round((feeWeightLy / 100) * fee);
        specialFee += amount;
        totalPay += amount;
        adjustmentLines.push({
            kind: 'fee',
            oldWeightLy: feeWeightLy,
            matchedWeightLy: matchedLy,
            sourceOldWeightLy: entry.initialLy,
            rate: fee,
            amount
        });
    });

    oldEntries.forEach(entry => {
        if (!refundOldEntries.has(entry.index)) return;
        const rate = exchangeRefundForPair('9999', '610');
        const amount = (entry.initialLy / 100) * rate;
        refundAdjustment -= amount;
        totalPay -= amount;
        adjustmentLines.push({
            kind: 'benefit',
            oldWeightLy: entry.initialLy,
            rate,
            amount: -amount
        });
    });

    const newWeight = newEntries.reduce((sum, entry) => sum + entry.initialLy, 0);
    const oldWeight = oldEntries.reduce((sum, entry) => sum + entry.initialLy, 0);
    const newGoldValue = newEntries.reduce((sum, entry) => sum + (entry.initialLy / 100) * newPrice(entry), 0);
    const oldGoldValue = oldEntries.reduce((sum, entry) => sum + (entry.initialLy / 100) * oldPrice(entry), 0);
    const finalPay = Math.round(totalPay - numberValue(discount));
    const newBookTotalCost = Math.round(newEntries.reduce((sum, entry) => sum + inventoryEffectiveBookCost(entry.item), 0));
    const transactionProfit = Math.round(oldGoldValue + finalPay - newBookTotalCost);
    const ruleLines = Array.from(new Set(segments
        .filter(segment => segment.newEntry && segment.oldEntry)
        .map(segment => exchangeRuleText(segment.oldEntry.type, segment.newEntry.type))));

    return {
        totalPay: finalPay,
        newWeight,
        oldWeight,
        newGoldValue,
        oldGoldValue,
        newBookTotalCost,
        profit: transactionProfit,
        wageTotal,
        specialFee,
        refundAdjustment,
        exchangeAdjustment: specialFee + refundAdjustment,
        adjustmentLines,
        ruleLines,
        segments
    };
}

function exchangeCompensation() {
    const result = calculateExchangeSettlement(getExchangeNewItems(), getExchangeOldItems(), 0);
    return result.exchangeAdjustment;
}

function renderExchangeOldCart() {
    const count = getEl('ex-old-count');
    const body = getEl('ex-old-items-body');
    const total = getEl('ex-old-total-weight');
    const items = getExchangeOldItems();
    if (count) count.innerText = `${items.length} món`;
    if (total) total.innerText = `${exchangeOldWeight()} ly`;
    if (!body) return;
    if (!items.length) {
        body.innerHTML = '<tr><td colspan="5" class="cart-empty">Chưa có vàng cũ (có thể nhập nhanh ở ô phía trên)</td></tr>';
        return;
    }
    body.innerHTML = items.map((item, index) => `
        <tr>
            <td>${escapeHtml(item.code || '---')}</td>
            <td>${escapeHtml(item.type || '')}</td>
            <td>${numberValue(item.weightLy)} ly</td>
            <td>${formatVND(numberValue(item.priceBuy))}/chỉ</td>
            <td>${exchangeOldCart.length ? `<button type="button" class="btn btn-danger sales-cart-remove" onclick="removeOldGoldFromExchangeCart(${index})">×</button>` : '<span style="color:#64748b;">Đang nhập</span>'}</td>
        </tr>
    `).join('');
}

function addOldGoldToExchangeCart() {
    if (!['doi','doikbl'].includes(currentSellMode)) return alert('Chỉ thêm vàng cũ trong chế độ Đổi Vàng Bù hoặc Đổi Ngang KBL.');
    const draft = getExchangeOldDraft();
    if (draft.weightLy <= 0) return alert('Vui lòng nhập khối lượng cân cũ lớn hơn phần hột/đá và dơ đất đã trừ.');
    exchangeOldCart.push(draft);
    ['ex-old-gross-l', 'ex-old-gross-c', 'ex-old-gross-p', 'ex-old-gross-y',
     'ex-old-gem-l', 'ex-old-gem-c', 'ex-old-gem-p', 'ex-old-gem-y',
     'ex-old-dirt-l', 'ex-old-dirt-c', 'ex-old-dirt-p', 'ex-old-dirt-y'].forEach(id => {
        if (getEl(id)) getEl(id).value = 0;
    });
    if (getEl('ex-old-weight')) getEl('ex-old-weight').value = 0;
    if (getEl('lbl-ex-old-net-weight')) getEl('lbl-ex-old-net-weight').innerText = '0 ly (0.000 chỉ)';
    if (getEl('ex-old-name')) getEl('ex-old-name').value = '';
    if (getEl('ex-old-code')) getEl('ex-old-code').value = '';
    renderExchangeOldCart();
    calcSellMath();
}

function removeOldGoldFromExchangeCart(index) {
    if (index < 0 || index >= exchangeOldCart.length) return;
    exchangeOldCart.splice(index, 1);
    renderExchangeOldCart();
    calcSellMath();
}

function clearOldGoldExchangeCart() {
    exchangeOldCart = [];
    renderExchangeOldCart();
    calcSellMath();
}

function renderSalesCart() {
    const panel = getEl('sales-cart-panel');
    const body = getEl('s-cart-body');
    const count = getEl('s-cart-count');
    const total = getEl('s-cart-total');
    const addButton = getEl('add-to-cart-btn');
    const isReturn = currentSellMode === 'tra';
    const cart = isReturn ? returnCart : salesCart;

    if (panel) panel.style.display = ['ban', 'doi', 'doikbl', 'tra'].includes(currentSellMode) ? 'block' : 'none';
    if (addButton) addButton.style.display = ['ban', 'doi', 'doikbl'].includes(currentSellMode) ? 'block' : 'none';
    if (getEl('s-cart-title')) getEl('s-cart-title').innerText = ['doi','doikbl'].includes(currentSellMode)
        ? '📤 GIỎ MÓN MỚI GIAO CHO KHÁCH'
        : (isReturn ? '↩️ GIỎ HÀNG KHÁCH TRẢ LẠI' : '🛒 GIỎ HÀNG KHÁCH ĐANG MUA');
    if (getEl('s-cart-total-label')) getEl('s-cart-total-label').innerText = isReturn ? 'TỔNG TIỀN HOÀN' : 'TỔNG GIỎ HÀNG';
    if (count) count.innerText = `${cart.length} món`;
    if (total) total.innerText = formatVND(isReturn
        ? returnCart.reduce((sum, item) => sum + numberValue(item.refundAmount), 0)
        : saleCartTotal());

    if (!body) return;
    if (!cart.length) {
        body.innerHTML = '<tr><td colspan="5" class="cart-empty">Chưa có món trong giỏ</td></tr>';
        return;
    }

    body.innerHTML = cart.map((item, index) => `
        <tr>
            <td>${escapeHtml(item.invCode || item.id || '')}</td>
            <td>${escapeHtml(item.itemName)}</td>
            <td>${numberValue(item.weightLy)} ly</td>
            <td style="font-weight: bold; color: #dc3545;">${formatVND(isReturn ? item.refundAmount : item.totalPay)}</td>
            <td style="text-align: center;"><button type="button" class="btn btn-danger sales-cart-remove" onclick="${isReturn ? `removeFromReturnCart(${index})` : `removeFromSalesCart(${index})`}">× XÓA</button></td>
        </tr>
    `).join('');
}

function clearSaleSelection() {
    currentSelectedInvItem = null;
    ['s-code', 's-name', 's-type', 's-weight'].forEach(id => {
        if (getEl(id)) getEl(id).value = '';
    });
    if (getEl('s-gold-price-display')) getEl('s-gold-price-display').innerText = 'Tự động theo HLV';
    if (getEl('s-wage-display')) getEl('s-wage-display').innerText = 'Lấy từ Kho';
    if (getEl('s-discount')) getEl('s-discount').value = 0;
    if (getEl('sell-search')) getEl('sell-search').value = '';
}

function addSelectedToCart() {
    if (!['ban', 'doi', 'doikbl'].includes(currentSellMode)) return alert('Giỏ món chỉ dùng trong chế độ Bán Hàng Mới / Đổi Vàng Bù / Đổi Ngang KBL.');
    if (!currentSelectedInvItem) return alert('Hãy chọn một sản phẩm từ kho trước.');
    if (salesCart.some(item => item.invCode === currentSelectedInvItem.code)) {
        return alert('Món này đã có trong giỏ hàng.');
    }

    const draft = getSaleDraft();
    if (!draft) return alert('Chưa có thông tin món để thêm vào giỏ.');
    salesCart.push(draft);
    clearSaleSelection();
    renderSalesCart();
    calcSellMath();
}

function removeFromSalesCart(index) {
    if (index < 0 || index >= salesCart.length) return;
    salesCart.splice(index, 1);
    renderSalesCart();
    calcSellMath();
}

function clearSalesCart() {
    salesCart = [];
    renderSalesCart();
    calcSellMath();
}

function removeFromReturnCart(index) {
    if (index < 0 || index >= returnCart.length) return;
    returnCart.splice(index, 1);
    renderSalesCart();
    calcSellMath();
}

function clearReturnCart() {
    returnCart = [];
    renderSalesCart();
    calcSellMath();
}

function normalizeReturnItems(sale) {
    const storedItems = Array.isArray(sale?.items) && sale.items.length
        ? sale.items
        : [{
            inventoryUid: sale?.inventoryUid || '',
            originalInvCode: sale?.originalInvCode || sale?.invCode || '',
            itemName: sale?.itemName || 'Sản phẩm trả lại',
            invCode: sale?.invCode || '',
            type: sale?.type || '',
            weightLy: numberValue(sale?.weightLy),
            priceSell: numberValue(sale?.priceSell) || numberValue(settingsStore[`price_sell_${sale?.type || ''}`]),
            wage: numberValue(sale?.wage),
            totalPay: numberValue(sale?.totalPay),
            totalCost: numberValue(sale?.totalCost),
            profit: numberValue(sale?.profit)
        }];
    const fallbackRefund = storedItems.length ? Math.abs(numberValue(sale?.totalPay)) / storedItems.length : 0;
    return storedItems.map(item => ({
        ...item,
        itemName: item.itemName || item.name || 'Sản phẩm trả lại',
        invCode: item.invCode || '',
        type: item.type || sale?.type || '',
        weightLy: numberValue(item.weightLy),
        priceSell: numberValue(item.priceSell) || numberValue(settingsStore[`price_sell_${item.type || sale?.type || ''}`]),
        wage: numberValue(item.wage),
        refundAmount: Math.abs(numberValue(item.totalPay)) || fallbackRefund,
        profit: numberValue(item.profit),
        originalTransactionId: sale?.id || ''
    }));
}

function addSaleToReturnCart(id) {
    if (currentSellMode !== 'tra') return alert('Hãy chuyển sang chế độ Khách Trả Hàng trước.');
    const sale = salesStore.find(item => item.id === id);
    if (!sale || sale.mode === 'tra') return;
    if (returnCart.length && returnCart[0].originalTransactionId !== sale.id) {
        return alert('Mỗi lần trả hàng chỉ nên xử lý một hóa đơn. Hãy xóa giỏ hiện tại trước.');
    }
    if (returnCart.length) return alert('Hóa đơn này đã có trong giỏ trả hàng.');

    const items = normalizeReturnItems(sale).filter(item => item.invCode || item.weightLy > 0);
    if (!items.length) return alert('Hóa đơn không có món hợp lệ để trả.');
    const alreadyReturned = items.some(item => {
        const inventoryItem = findInventoryBySaleLine(item);
        return inventoryItem && String(inventoryItem.status || '').startsWith('Đã trả');
    });
    if (alreadyReturned) return alert('Một hoặc nhiều món trong hóa đơn này đã được đánh dấu trả hàng.');
    items.forEach(item => returnCart.push(item));

    [['s-cus-name', sale.cusName], ['s-cus-phone', sale.cusPhone],
     ['s-cus-cccd', sale.cusCccd], ['s-cus-address', sale.cusAddress],
     ['s-cus-qr', sale.cusQr]].forEach(([fieldId, value]) => {
        const field = getEl(fieldId);
        if (field && value != null) field.value = value;
    });
    kblSetSaleCccdImages(sale.cusImgFront || sale.imgFront || '', sale.cusImgBack || sale.imgBack || '');
    if (getEl('sell-search')) getEl('sell-search').value = sale.id;
    if (getEl('sell-search-results')) getEl('sell-search-results').style.display = 'none';
    calcSellMath();
}


// ============================================================================
// KBL LINKED EXCHANGE WORKFLOW - THU MUA <-> BAN HANG/DOI BU <-> DOI CHIEU
// ============================================================================
function kblExchangeModeTextShort(mode) {
    return String(mode || '').toLowerCase() === 'doikbl' ? 'Đổi Ngang KBL' : 'Đổi Vàng Bù';
}

function makeKblExchangeDraftGroupId(mode) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const tail = String(Date.now()).slice(-8);
    return `KBL-BT-${y}${m}${d}-${String(mode || 'doi').toUpperCase()}-${tail}`;
}

function kblRenderSaleCccdImagePreviews() {
    const front = getEl('s-preview-front');
    const back = getEl('s-preview-back');
    if (front) {
        front.src = saleCccdImageSnapshot.front || '';
        front.style.display = saleCccdImageSnapshot.front ? 'block' : 'none';
    }
    if (back) {
        back.src = saleCccdImageSnapshot.back || '';
        back.style.display = saleCccdImageSnapshot.back ? 'block' : 'none';
    }
}

function kblRememberSaleCccdImage(side, dataUrl) {
    if (!dataUrl || !String(dataUrl).startsWith('data:image')) return;
    if (String(side || '').toLowerCase() === 'back') saleCccdImageSnapshot.back = String(dataUrl);
    else saleCccdImageSnapshot.front = String(dataUrl);
    kblRenderSaleCccdImagePreviews();
}

function kblSetSaleCccdImages(front, back) {
    saleCccdImageSnapshot = { front: String(front || ''), back: String(back || '') };
    kblRenderSaleCccdImagePreviews();
}

function kblClearSaleCccdImages() {
    saleCccdImageSnapshot = { front: '', back: '' };
    kblRenderSaleCccdImagePreviews();
}

function kblCurrentSaleCustomerSnapshot() {
    return {
        cusName: getEl('s-cus-name')?.value.trim() || '',
        cusPhone: getEl('s-cus-phone')?.value.trim() || '',
        cusCccd: getEl('s-cus-cccd')?.value.trim() || '',
        cusAddress: getEl('s-cus-address')?.value.trim() || '',
        imgFront: saleCccdImageSnapshot.front || '',
        imgBack: saleCccdImageSnapshot.back || ''
    };
}

function kblApplyCustomerToBuyForm(customer) {
    const c = customer || {};
    if (getEl('buy-name')) getEl('buy-name').value = c.cusName || c.name || '';
    if (getEl('buy-phone')) getEl('buy-phone').value = c.cusPhone || c.phone || '';
    if (getEl('buy-cccd')) getEl('buy-cccd').value = c.cusCccd || c.cccd || '';
    if (getEl('buy-address')) getEl('buy-address').value = c.cusAddress || c.address || '';
    if (getEl('buy-fee')) getEl('buy-fee').value = 0;
    if (getEl('buy-price')) getEl('buy-price').value = 0;
    const frontImg = c.imgFront || c.cusImgFront || '';
    const backImg = c.imgBack || c.cusImgBack || '';
    if (getEl('a4-img-front')) { getEl('a4-img-front').src = frontImg; getEl('a4-img-front').style.display = frontImg ? 'block' : 'none'; }
    if (getEl('a4-img-back')) { getEl('a4-img-back').src = backImg; getEl('a4-img-back').style.display = backImg ? 'block' : 'none'; }
    if (getEl('view-front')) { getEl('view-front').src = frontImg; getEl('view-front').style.display = frontImg ? 'block' : 'none'; }
    if (getEl('view-back')) { getEl('view-back').src = backImg; getEl('view-back').style.display = backImg ? 'block' : 'none'; }
    if (typeof syncBuyUI === 'function') syncBuyUI();
}

function kblApplyPurchaseCustomerToSale(record) {
    if (!record) return;
    if (getEl('s-cus-name')) getEl('s-cus-name').value = record.name || '';
    if (getEl('s-cus-phone')) getEl('s-cus-phone').value = record.phone || '';
    if (getEl('s-cus-cccd')) getEl('s-cus-cccd').value = record.cccd || '';
    if (getEl('s-cus-address')) getEl('s-cus-address').value = record.address || '';
    kblSetSaleCccdImages(record.imgFront || record.cusImgFront || '', record.imgBack || record.cusImgBack || '');
}

function kblPurchaseRecordOldItems(record) {
    if (!record) return [];
    const engineSnapshots = Array.isArray(record.exchangeEngineOldItems) ? record.exchangeEngineOldItems : [];
    return normalizeStoredPurchaseItems(record).map((item, index) => {
        const type = item.goldType || '9999';
        const engineItem = engineSnapshots[index] || {};
        return {
            code: `${record.id || 'MUA'}-${index + 1}`,
            name: item.goods || 'Vàng trang sức cũ',
            itemName: item.goods || 'Vàng trang sức cũ',
            type,
            grossLy: numberValue(engineItem.grossLy != null ? engineItem.grossLy : (item.grossLy != null ? item.grossLy : item.netLy)),
            gemLy: numberValue(engineItem.gemLy != null ? engineItem.gemLy : item.gemLy),
            dirtLy: numberValue(engineItem.dirtLy),
            weightLy: numberValue(engineItem.weightLy != null ? engineItem.weightLy : item.netLy),
            priceBuy: numberValue(engineItem.priceBuy) || numberValue(settingsStore[`price_buy_${type}`]),
            purchaseDocumentUnitPrice: numberValue(item.price),
            sourcePurchaseId: String(record.id || ''),
            sourcePurchaseItemIndex: index,
            transactionGroupId: String(record.transactionGroupId || '')
        };
    });
}

function kblOldItemsFingerprint(items) {
    return JSON.stringify((Array.isArray(items) ? items : []).map(item => ({
        type: String(item?.type || ''),
        weightLy: roundWeightLy(numberValue(item?.weightLy)),
        priceBuy: Math.round(numberValue(item?.priceBuy))
    })));
}

function kblFindPurchaseRecordByLink(link) {
    const purchaseId = String(link?.purchaseRecordId || link?.purchaseDocumentId || '');
    const groupId = String(link?.transactionGroupId || link?.groupId || '');
    return (Array.isArray(dataStoreRecords) ? dataStoreRecords : []).find(record =>
        (purchaseId && String(record?.id || '') === purchaseId) ||
        (groupId && String(record?.transactionGroupId || '') === groupId)
    ) || null;
}

function kblExchangePurchaseDocumentItems(oldItems) {
    return (Array.isArray(oldItems) ? oldItems : [])
        .filter(item => numberValue(item?.weightLy) > 0)
        .map((item, index) => {
            const type = String(item?.type || '9999');
            const weightLy = Math.max(0, numberValue(item?.weightLy));
            const gemLy = Math.max(0, numberValue(item?.gemLy));
            const dirtLy = Math.max(0, numberValue(item?.dirtLy));
            const grossLy = Math.max(weightLy, numberValue(item?.grossLy) || (weightLy + gemLy + dirtLy));
            const buyPrice = Math.max(0, numberValue(item?.priceBuy) || numberValue(settingsStore[`price_buy_${type}`]));
            return {
                index: index + 1,
                goods: String(item?.name || item?.itemName || 'Vàng trang sức cũ'),
                goldType: type,
                grossLy,
                gemLy: Math.max(0, grossLy - weightLy),
                dirtLy,
                netLy: weightLy,
                weightText: weightTextFromLy(weightLy),
                price: buyPrice,
                fee: 0,
                totalVND: Math.round((weightLy / 100) * buyPrice),
                money: Math.round((weightLy / 100) * buyPrice)
            };
        });
}

function kblExchangeEngineOldItemsSnapshot(oldItems) {
    return (Array.isArray(oldItems) ? oldItems : [])
        .filter(item => numberValue(item?.weightLy) > 0)
        .map(item => ({
            name: String(item?.name || item?.itemName || ''),
            type: String(item?.type || ''),
            grossLy: numberValue(item?.grossLy),
            gemLy: numberValue(item?.gemLy),
            dirtLy: numberValue(item?.dirtLy),
            weightLy: numberValue(item?.weightLy),
            priceBuy: numberValue(item?.priceBuy)
        }));
}


function kblEligibleMatchedOffsetPurchasePolicy(mode, newItems, oldItems) {
    const normalizedMode = String(mode || '').toLowerCase();
    const n = (Array.isArray(newItems) ? newItems : []).filter(item => numberValue(item?.weightLy) > 0);
    const o = (Array.isArray(oldItems) ? oldItems : []).filter(item => numberValue(item?.weightLy) > 0);
    if (!n.length || !o.length) return false;
    if (normalizedMode === 'doikbl') return smartExchange610Eligible(n, o);
    if (normalizedMode !== 'doi') return false;
    const newTypes = [...new Set(n.map(item => String(item?.type || '')))].filter(Boolean);
    const oldTypes = [...new Set(o.map(item => String(item?.type || '')))].filter(Boolean);
    return newTypes.length === 1 && oldTypes.length === 1 && newTypes[0] === oldTypes[0] && ['610', '980'].includes(newTypes[0]);
}

function kblFinalizeExchangePurchaseDocument(mode, record, calculation, newItems, oldItems, discount = 0) {
    if (!record || !kblEligibleMatchedOffsetPurchasePolicy(mode, newItems, oldItems)) return record;

    const normalizedMode = String(mode || '').toLowerCase();
    const oldList = (Array.isArray(oldItems) ? oldItems : []).filter(item => numberValue(item?.weightLy) > 0);
    if (!oldList.length) return record;

    const sourceItems = Array.isArray(record.items) ? record.items : [];
    const rows = oldList.map((item, index) => ({
        index,
        item,
        weightLy: Math.max(0, numberValue(item?.weightLy)),
        matchedLy: 0,
        surplusLy: 0,
        total: 0,
        feeAmount: 0,
        feeRate: 0
    }));

    if (normalizedMode === 'doikbl') {
        const retailSell = Math.max(0, numberValue(calculation?.internal?.retailSell) || numberValue(settingsStore.price_sell_610));
        const retailBuy = Math.max(0, numberValue(calculation?.internal?.retailBuy) || numberValue(settingsStore.price_buy_610));
        let remainingNewLy = Math.max(0, numberValue(calculation?.newWeight));
        rows.forEach(row => {
            row.matchedLy = Math.min(row.weightLy, remainingNewLy);
            remainingNewLy = Math.max(0, remainingNewLy - row.matchedLy);
            row.surplusLy = Math.max(0, row.weightLy - row.matchedLy);
            row.total = (row.matchedLy / 100) * retailSell + (row.surplusLy / 100) * retailBuy;
        });
    } else {
        const segments = Array.isArray(calculation?.segments) ? calculation.segments : [];
        segments.forEach(segment => {
            const o = segment?.oldEntry;
            if (!o) return;
            const idx = Number(o.index);
            if (!Number.isInteger(idx) || idx < 0 || idx >= rows.length) return;
            const row = rows[idx];
            const ly = Math.max(0, numberValue(segment?.weightLy));
            if (!ly) return;
            const n = segment?.newEntry;
            const oldType = String(o?.type || row.item?.type || '');
            const liveBuy = numberValue(settingsStore[`price_buy_${oldType}`]);
            const oldBuy = Math.max(0, liveBuy || numberValue(o?.item?.priceBuy) || numberValue(row.item?.priceBuy));
            if (!n) {
                row.surplusLy += ly;
                row.total += (ly / 100) * oldBuy;
                return;
            }
            const newType = String(n?.type || '');
            if (oldType === newType && ['610', '980'].includes(oldType)) {
                const sellPrice = Math.max(0, inventorySellPrice(n?.item));
                const feeRate = Math.max(0, exchangeFeeForPair(oldType, newType));
                row.matchedLy += ly;
                row.feeRate = feeRate;
                row.total += (ly / 100) * sellPrice;
                return;
            }
            // Guard rail: policy này chỉ dùng cho cùng loại 610/980. Nếu có nhánh lạ, giữ phiếu hiện tại.
            row.total = NaN;
        });
        // Phí đổi bù được trừ trên TOÀN BỘ vàng cũ để Bảng kê 02 và engine
        // cùng một công thức. Phần cũ dư vẫn định giá theo giá mua vào Cài đặt.
        rows.forEach(row => {
            if (!Number.isFinite(row.total)) return;
            const oldType = String(row.item?.type || '');
            const feeRate = Math.max(0, exchangeFeeForPair(oldType, oldType));
            row.feeRate = feeRate;
            row.feeAmount = Math.round((row.weightLy / 100) * feeRate);
            row.total -= row.feeAmount;
        });
        if (rows.some(row => !Number.isFinite(row.total))) return record;
    }

    const finalizedItems = rows.map((row, index) => {
        const oldItem = row.item || {};
        const existing = sourceItems[index] || {};
        const weightLy = row.weightLy;
        const totalVND = Math.round(row.total);
        const chi = weightLy / 100;
        const unitPrice = chi > 0 ? Math.round(totalVND / chi) : 0;
        const grossLy = Math.max(weightLy, numberValue(existing.grossLy) || numberValue(oldItem.grossLy) || weightLy);
        const gemLy = Math.max(0, numberValue(existing.gemLy) || numberValue(oldItem.gemLy));
        const dirtLy = Math.max(0, numberValue(existing.dirtLy) || numberValue(oldItem.dirtLy));
        return {
            ...existing,
            index: index + 1,
            goods: String(existing.goods || oldItem.name || oldItem.itemName || 'Vàng trang sức cũ'),
            goldType: String(existing.goldType || oldItem.type || ''),
            grossLy,
            gemLy,
            dirtLy,
            netLy: weightLy,
            weightText: weightTextFromLy(weightLy),
            price: unitPrice,
            fee: 0,
            totalVND,
            money: totalVND,
            exchangeDocMatchedLy: roundWeightLy(row.matchedLy),
            exchangeDocSurplusLy: roundWeightLy(row.surplusLy),
            exchangeDocFeeRate: Math.round(row.feeRate),
            exchangeDocFeeAmount: Math.round(row.feeAmount)
        };
    });

    // Chuẩn hóa sai số làm tròn từng dòng để bộ 3 chứng từ khớp ĐÚNG TỪNG ĐỒNG.
    // Không dùng bước này để vá công thức: nếu sai số lớn hơn ngưỡng làm tròn nhỏ, bỏ policy mới.
    const saleGoldGross = Math.round(
        numberValue(calculation?.newGoldValue) ||
        (Array.isArray(newItems) ? newItems : []).reduce((sum, item) => {
            const type = String(item?.type || '');
            const sell = normalizedMode === 'doikbl'
                ? Math.max(0, numberValue(calculation?.internal?.retailSell) || numberValue(settingsStore.price_sell_610))
                : Math.max(0, inventorySellPrice(item));
            return sum + (numberValue(item?.weightLy) / 100) * sell;
        }, 0)
    );
    const wageTotal = Math.round(
        numberValue(calculation?.smart610 ? calculation?.customerFormula?.wageTotal : calculation?.wageTotal) ||
        (Array.isArray(newItems) ? newItems : []).reduce((sum, item) => sum + inventorySellWage(item), 0)
    );
    const discountSnapshot = Math.round(Math.max(0, numberValue(discount)));
    const targetPurchaseGross = Math.round(saleGoldGross + wageTotal - discountSnapshot - numberValue(calculation?.totalPay));
    let totalMoney = finalizedItems.reduce((sum, item) => sum + Math.round(numberValue(item.totalVND)), 0);
    const roundingDiff = targetPurchaseGross - totalMoney;
    const roundingTolerance = Math.max(10, finalizedItems.length * 5);
    if (Math.abs(roundingDiff) > roundingTolerance) return record;
    if (roundingDiff && finalizedItems.length) {
        const last = finalizedItems[finalizedItems.length - 1];
        last.totalVND = Math.round(numberValue(last.totalVND) + roundingDiff);
        last.money = last.totalVND;
        const lastChi = numberValue(last.netLy) / 100;
        last.price = lastChi > 0 ? Math.round(last.totalVND / lastChi) : 0;
        totalMoney = targetPurchaseGross;
    }

    const matchedLy = rows.reduce((sum, row) => sum + numberValue(row.matchedLy), 0);
    const surplusLy = rows.reduce((sum, row) => sum + numberValue(row.surplusLy), 0);
    const feeAmount = rows.reduce((sum, row) => sum + numberValue(row.feeAmount), 0);
    const feeRates = [...new Set(rows.map(row => Math.round(numberValue(row.feeRate))).filter(value => value > 0))];

    record.items = finalizedItems;
    record.goods = finalizedItems.map(item => item.goods).join('; ');
    record.goldType = [...new Set(finalizedItems.map(item => item.goldType).filter(Boolean))].join(', ');
    record.netLy = finalizedItems.reduce((sum, item) => sum + numberValue(item.netLy), 0);
    record.totalNetLy = record.netLy;
    record.weightText = weightTextFromLy(record.netLy);
    record.itemCount = finalizedItems.length;
    record.price = finalizedItems.length === 1 ? numberValue(finalizedItems[0].price) : 0;
    record.fee = 0;
    record.money = Math.round(totalMoney);
    record.totalMoney = Math.round(totalMoney);
    record.exchangePurchasePolicy = 'MATCHED_OFFSET_POLICY_V1';
    record.exchangeDocMatchedLy = roundWeightLy(matchedLy);
    record.exchangeDocSurplusLy = roundWeightLy(surplusLy);
    record.exchangeDocFeeRate = feeRates.length === 1 ? feeRates[0] : 0;
    record.exchangeDocFeeAmount = Math.round(feeAmount);
    record.exchangeDocRoundingAdjustment = Math.round(roundingDiff);
    record.exchangeDocPolicyAppliedAt = new Date().toISOString();
    record.updatedAt = record.exchangeDocPolicyAppliedAt;
    record.a4Edits = { ...(record.a4Edits || {}) };
    finalizedItems.forEach((item, index) => {
        const key = `item.${index}.note`;
        if (String(record.a4Edits[key] || '').trim()) return;
        const matchedText = `${(numberValue(item.exchangeDocMatchedLy) / 100).toFixed(3)} chỉ`;
        const surplusText = `${(numberValue(item.exchangeDocSurplusLy) / 100).toFixed(3)} chỉ`;
        const oldWeightText = `${(numberValue(item.netLy) / 100).toFixed(3)} chỉ`;
        record.a4Edits[key] = normalizedMode === 'doi'
            ? `Đối ứng ${matchedText}: giá bán; dư ${surplusText}: giá mua vào; phí đổi tính toàn bộ ${oldWeightText} × ${formatVND(item.exchangeDocFeeRate)}/chỉ.`
            : `Đối ứng ${matchedText}: giá bán ra; dư ${surplusText}: giá mua vào.`;
    });

    // QUAN TRỌNG: không ghi giá chứng từ quy đổi ngược vào exchangeEngineOldItems.
    // Engine vẫn giữ giá mua kinh tế ban đầu để tính phần vàng cũ DƯ và tính lãi.
    saveDBFile('database.db', dataStoreRecords);
    compileBuyTable();
    return record;
}

function kblMirrorExchangeSaleToBuyDraft() {
    if (!activeExchangeLinkDraft || !['doi', 'doikbl'].includes(String(activeExchangeLinkDraft.mode || '').toLowerCase())) return;
    if (typeof clearPurchaseEditMode === 'function') clearPurchaseEditMode();
    kblApplyCustomerToBuyForm(kblCurrentSaleCustomerSnapshot());
    const oldItems = getExchangeOldItems();
    if (!oldItems.length) {
        renderExchangeLinkWorkflow();
        return;
    }
    const docItems = kblExchangePurchaseDocumentItems(oldItems);
    activeExchangeLinkDraft.engineOldItemsSnapshot = kblExchangeEngineOldItemsSnapshot(oldItems);
    if (docItems.length && typeof loadPurchaseItemsIntoEditor === 'function') loadPurchaseItemsIntoEditor(docItems);
    renderExchangeLinkWorkflow();
}

function kblEnsureLinkedExchangePurchase(mode, oldItems) {
    const normalizedMode = String(mode || '').toLowerCase() === 'doikbl' ? 'doikbl' : 'doi';
    if (!activeExchangeLinkDraft || String(activeExchangeLinkDraft.mode || '') !== normalizedMode) {
        activeExchangeLinkDraft = {
            mode: normalizedMode,
            transactionGroupId: makeKblExchangeDraftGroupId(normalizedMode),
            purchaseRecordId: '',
            saleId: '',
            startedAt: new Date().toISOString()
        };
    }

    const docItems = kblExchangePurchaseDocumentItems(oldItems);
    if (!docItems.length) return null;
    const engineOldItems = kblExchangeEngineOldItemsSnapshot(oldItems);
    const customer = kblCurrentSaleCustomerSnapshot();
    const existing = kblFindPurchaseRecordByLink(activeExchangeLinkDraft);
    // A saved linked Thu Mua record is the documentary source of truth.
    // Do not recalculate or overwrite its saved purchase price at checkout.
    if (existing) return existing;

    const now = new Date();
    const totalNetLy = docItems.reduce((sum, item) => sum + numberValue(item.netLy), 0);
    const totalMoney = docItems.reduce((sum, item) => sum + numberValue(item.totalVND), 0);
    const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    const record = {
        ...(existing || {}),
        id: existing?.id || ('MUA-' + Date.now().toString().slice(-6)),
        nkCode: existing?.nkCode || allocateNextNKCode(),
        dateStr: existing?.dateStr || dateStr,
        year: existing?.year || now.getFullYear(),
        rawDate: existing?.rawDate || now.toISOString(),
        updatedAt: now.toISOString(),
        name: String(customer.cusName || existing?.name || '').toUpperCase(),
        cccd: String(customer.cusCccd || existing?.cccd || ''),
        phone: String(customer.cusPhone || existing?.phone || ''),
        address: String(customer.cusAddress || existing?.address || ''),
        dateIssue: existing?.dateIssue || '',
        placeIssue: existing?.placeIssue || 'C\u1ee5c CS QLHC v\u1ec1 TTXH',
        goods: docItems.map(item => item.goods).join('; '),
        goldType: Array.from(new Set(docItems.map(item => item.goldType).filter(Boolean))).join(', '),
        payMethod: existing?.payMethod || 'tien_mat',
        bankName: existing?.bankName || '',
        bankAcc: existing?.bankAcc || '',
        bankHolder: existing?.bankHolder || String(customer.cusName || '').toUpperCase(),
        netLy: totalNetLy,
        totalNetLy,
        weightText: weightTextFromLy(totalNetLy),
        price: docItems.length === 1 ? numberValue(docItems[0].price) : 0,
        fee: 0,
        money: Math.round(totalMoney),
        totalMoney: Math.round(totalMoney),
        itemCount: docItems.length,
        items: docItems.map(item => ({ ...item })),
        a4Edits: existing?.a4Edits || {},
        imgFront: customer.imgFront || existing?.imgFront || '',
        imgBack: customer.imgBack || existing?.imgBack || '',
        transactionGroupId: String(activeExchangeLinkDraft.transactionGroupId || ''),
        exchangeMode: normalizedMode,
        exchangeLinkStatus: 'CHO_PHIEU_BAN',
        linkedSaleId: '',
        isExchangeLinkedPurchase: true,
        exchangePurchasePolicy: 'ACTUAL_PURCHASE_RECORD',
        exchangeEngineOldItems: engineOldItems,
        exchangeBuyPriceCapturedAt: now.toISOString()
    };

    const index = dataStoreRecords.findIndex(item => String(item?.id || '') === String(record.id || ''));
    if (index >= 0) dataStoreRecords[index] = record;
    else dataStoreRecords.unshift(record);
    saveDBFile('database.db', dataStoreRecords);
    compileBuyTable();
    activeExchangeLinkDraft.purchaseRecordId = String(record.id || '');
    activeExchangeLinkDraft.engineOldItemsSnapshot = engineOldItems;
    activeExchangeLinkDraft.purchaseFingerprint = kblOldItemsFingerprint(oldItems);
    renderExchangeLinkWorkflow();
    return record;
}

function renderExchangeLinkWorkflow() {
    const link = activeExchangeLinkDraft;
    const buyBanner = getEl('exchange-buy-link-banner');
    const buyText = getEl('exchange-buy-link-text');
    const sellBanner = getEl('exchange-sale-link-banner');
    const sellText = getEl('exchange-sale-link-text');
    const purchase = kblFindPurchaseRecordByLink(link);

    if (buyBanner) buyBanner.style.display = link ? 'block' : 'none';
    if (sellBanner) sellBanner.style.display = link ? 'block' : 'none';
    if (!link) return;

    const label = kblExchangeModeTextShort(link.mode);
    const groupId = link.transactionGroupId || link.groupId || '';
    const purchaseId = purchase?.id || link.purchaseRecordId || 'ch\u01b0a l\u01b0u';
    const status = purchase
        ? (link.saleId ? '\u0111\u00e3 \u0111\u1ee7 phi\u1ebfu Thu Mua v\u00e0 phi\u1ebfu b\u00e1n' : '\u0111\u00e3 c\u00f3 phi\u1ebfu Thu Mua, \u0111ang ch\u1edd ch\u1ed1t phi\u1ebfu b\u00e1n')
        : '\u0111ang l\u1eadp phi\u1ebfu Thu Mua cho v\u00e0ng c\u0169';
    const info = `<b>${escapeHtml(label)}</b> \u00b7 Nh\u00f3m <b>${escapeHtml(groupId)}</b> \u00b7 Phi\u1ebfu mua <b>${escapeHtml(purchaseId)}</b> \u00b7 ${escapeHtml(status)}.`;
    if (buyText) buyText.innerHTML = info + '<br><span style="font-size:10px;color:#64748b;">Khi chốt phiếu đổi: chỉ phần vàng ĐỐI ỨNG được chuẩn hóa theo chính sách Đổi Bù/Đổi Ngang; phần vàng cũ DƯ vẫn giữ giá MUA VÀO. Giá chứng từ không ghi ngược vào giá kinh tế dùng tính lãi.</span>';
    if (sellText) sellText.innerHTML = info;
}

function setSellModeStandalone(mode) {
    // Khi người dùng rời luồng hồ sơ đổi để Bán mới/Trả hàng, chỉ hủy cờ liên kết
    // đang làm dở; không xóa bất kỳ phiếu Thu Mua/Phiếu Bán nào đã lưu.
    if (activeExchangeLinkDraft) {
        activeExchangeLinkDraft = null;
        renderExchangeLinkWorkflow();
    }
    setSellMode(mode);
}

function startLinkedExchangeWorkflow(mode) {
    const normalizedMode = String(mode || '').toLowerCase() === 'doikbl' ? 'doikbl' : 'doi';
    const carriedCustomer = kblCurrentSaleCustomerSnapshot();
    setSellMode(normalizedMode);
    if (typeof clearPurchaseEditMode === 'function') clearPurchaseEditMode();
    activeExchangeLinkDraft = {
        mode: normalizedMode,
        transactionGroupId: makeKblExchangeDraftGroupId(normalizedMode),
        purchaseRecordId: '',
        saleId: '',
        startedAt: new Date().toISOString(),
        engineOldItemsSnapshot: []
    };
    if (typeof window.clearBuyForm === 'function') window.clearBuyForm();
    if (normalizedMode === 'doikbl' && getEl('buy-gold-type')) getEl('buy-gold-type').value = '610';
    kblApplyCustomerToBuyForm(carriedCustomer);
    renderExchangeLinkWorkflow();
    switchTab('tab-thumua');
    const banner = getEl('exchange-buy-link-banner');
    if (banner) banner.scrollIntoView({ behavior:'smooth', block:'start' });
}

function cancelLinkedExchangeWorkflow() {
    const had = activeExchangeLinkDraft;
    activeExchangeLinkDraft = null;
    renderExchangeLinkWorkflow();
    if (had) alert('Đã hủy liên kết hồ sơ đổi đang làm. Các phiếu đã lưu trước đó không bị xóa.');
}

function loadLinkedPurchaseIntoExchange(recordOrId, switchToSale = true) {
    const record = typeof recordOrId === 'string'
        ? dataStoreRecords.find(item => String(item?.id || '') === String(recordOrId))
        : recordOrId;
    if (!record) return alert('Không tìm thấy phiếu Thu Mua liên kết.');
    const mode = String(activeExchangeLinkDraft?.mode || record.exchangeMode || 'doi').toLowerCase() === 'doikbl' ? 'doikbl' : 'doi';
    activeExchangeLinkDraft = {
        ...(activeExchangeLinkDraft || {}),
        mode,
        transactionGroupId: String(record.transactionGroupId || activeExchangeLinkDraft?.transactionGroupId || makeKblExchangeDraftGroupId(mode)),
        purchaseRecordId: String(record.id || ''),
        saleId: String(record.linkedSaleId || activeExchangeLinkDraft?.saleId || ''),
        startedAt: activeExchangeLinkDraft?.startedAt || record.rawDate || new Date().toISOString()
    };
    setSellMode(mode);
    kblApplyPurchaseCustomerToSale(record);
    exchangeOldCart = kblPurchaseRecordOldItems(record);
    activeExchangeLinkDraft.purchaseFingerprint = kblOldItemsFingerprint(exchangeOldCart);
    renderExchangeOldCart();
    renderSalesCart();
    calcSellMath();
    renderExchangeLinkWorkflow();
    if (switchToSale) {
        switchTab('tab-banhang');
        const banner = getEl('exchange-sale-link-banner');
        if (banner) banner.scrollIntoView({ behavior:'smooth', block:'start' });
    }
}

function continueExchangeFromPurchaseRecord(recordId) {
    const record = dataStoreRecords.find(item => String(item?.id || '') === String(recordId || ''));
    if (!record) return alert('Không tìm thấy phiếu Thu Mua liên kết.');
    if (!record.transactionGroupId || !record.exchangeMode) return alert('Phiếu này không phải phiếu Thu Mua của một hồ sơ đổi vàng liên kết.');
    loadLinkedPurchaseIntoExchange(record, true);
}

function openActiveExchangePurchase() {
    const record = kblFindPurchaseRecordByLink(activeExchangeLinkDraft);
    if (!record) {
        kblMirrorExchangeSaleToBuyDraft();
        switchTab('tab-thumua');
        renderExchangeLinkWorkflow();
        return;
    }
    switchTab('tab-thumua');
    editPurchaseRecord(record.id);
    renderExchangeLinkWorkflow();
}

function reloadActiveExchangePurchase() {
    const record = kblFindPurchaseRecordByLink(activeExchangeLinkDraft);
    if (!record) {
        kblMirrorExchangeSaleToBuyDraft();
        return alert('D\u1eef li\u1ec7u v\u00e0ng c\u0169 \u0111ang \u1edf d\u1ea1ng nh\u00e1p; phi\u1ebfu Thu Mua s\u1ebd t\u1ef1 l\u01b0u khi ch\u1ed1t giao d\u1ecbch \u0111\u1ed5i.');
    }
    loadLinkedPurchaseIntoExchange(record, true);
}

function kblValidateActiveExchangeLink(mode, oldItems) {
    if (!['doi', 'doikbl'].includes(String(mode || '').toLowerCase())) return { ok:true, record:null };
    const record = kblFindPurchaseRecordByLink(activeExchangeLinkDraft);
    if (!activeExchangeLinkDraft || !record) {
        return { ok:false, message:'Giao dịch đổi phải có phiếu Thu Mua liên kết. Hãy bấm lại Đổi Vàng Bù / Đổi Ngang KBL, lập và lưu phiếu Thu Mua trước.' };
    }
    if (String(activeExchangeLinkDraft.mode || '') !== String(mode || '')) {
        return { ok:false, message:'Chế độ đổi hiện tại không trùng với hồ sơ Thu Mua đang liên kết.' };
    }
    const sourceItems = kblPurchaseRecordOldItems(record);
    if (kblOldItemsFingerprint(sourceItems) !== kblOldItemsFingerprint(oldItems)) {
        return { ok:false, message:`Vàng cũ trên màn đổi đã khác phiếu Thu Mua ${record.id}. Bấm “NẠP LẠI TỪ THU MUA” để tránh lệch hồ sơ.` };
    }
    const saleCccd = String(getEl('s-cus-cccd')?.value || '').trim();
    const purchaseCccd = String(record.cccd || '').trim();
    if (saleCccd && purchaseCccd && saleCccd !== purchaseCccd) {
        return { ok:false, message:`CCCD trên phiếu bán không trùng phiếu Thu Mua ${record.id}. Không thể chốt hai khách khác nhau trong cùng hồ sơ.` };
    }
    return { ok:true, record };
}

function openLinkedExchangeDossierFromSale(saleId) {
    const sale = (Array.isArray(salesStore) ? salesStore : []).find(tx => String(tx?.id || '') === String(saleId || ''));
    const mode = String(sale?.mode || '').toLowerCase();
    const hasDossier = ['doi', 'doikbl'].includes(mode) || (mode === 'ban' && sale?.exchangeDossier?.sourceType === 'manual_buy_sell');
    if (!sale || !hasDossier) return alert('Không tìm thấy hồ sơ đổi vàng liên kết.');
    activeOffsetSaleId = String(sale.id || '');
    switchTab('tab-doichieu');
    refreshOffsetSaleOptions();
    const select = getEl('offset-sale-select');
    if (select) select.value = activeOffsetSaleId;
    onOffsetSaleChanged();
}

function openLinkedExchangeDossierFromPurchase(recordId) {
    const record = dataStoreRecords.find(item => String(item?.id || '') === String(recordId || ''));
    if (!record) return alert('Không tìm thấy phiếu Thu Mua.');
    const sale = (Array.isArray(salesStore) ? salesStore : []).find(tx =>
        String(tx?.exchangePurchaseRecordId || tx?.exchangePurchaseDocId || tx?.manualExchangePurchaseRecordId || '') === String(record.id || '') ||
        (record.transactionGroupId && String(tx?.transactionGroupId || '') === String(record.transactionGroupId)) ||
        (record.manualOffsetSaleId && String(tx?.id || '') === String(record.manualOffsetSaleId))
    );
    if (!sale) return continueExchangeFromPurchaseRecord(record.id);
    activeOffsetSaleId = String(sale.id || '');
    switchTab('tab-doichieu');
    refreshOffsetSaleOptions();
    const select = getEl('offset-sale-select');
    if (select) select.value = activeOffsetSaleId;
    onOffsetSaleChanged();
}

function setSellMode(mode) {
    currentSellMode = mode;
    currentSelectedInvItem = null;
    kblClearSaleCccdImages();
    salesCart = [];
    exchangeOldCart = [];
    returnCart = [];
    if (getEl('sell-search')) getEl('sell-search').value = "";
    if (getEl('sell-search-results')) getEl('sell-search-results').style.display = "none";
    ['s-code', 's-name', 's-type', 's-weight', 's-discount',
     's-cus-phone', 's-cus-name', 's-cus-qr', 's-cus-cccd', 's-cus-address',
     'ex-old-weight', 'ex-old-name', 'ex-old-code', 'ex-old-price-buy', 'ex-gold-compensation',
     'ex-old-gross-l', 'ex-old-gross-c', 'ex-old-gross-p', 'ex-old-gross-y',
     'ex-old-gem-l', 'ex-old-gem-c', 'ex-old-gem-p', 'ex-old-gem-y',
     'ex-old-dirt-l', 'ex-old-dirt-c', 'ex-old-dirt-p', 'ex-old-dirt-y'].forEach(id => {
        if (getEl(id)) getEl(id).value = "";
    });
    ['ex-old-gross-l', 'ex-old-gross-c', 'ex-old-gross-p', 'ex-old-gross-y',
     'ex-old-gem-l', 'ex-old-gem-c', 'ex-old-gem-p', 'ex-old-gem-y',
     'ex-old-dirt-l', 'ex-old-dirt-c', 'ex-old-dirt-p', 'ex-old-dirt-y', 'ex-old-weight'].forEach(id => {
        if (getEl(id)) getEl(id).value = 0;
    });
    if (getEl('lbl-ex-old-net-weight')) getEl('lbl-ex-old-net-weight').innerText = '0 ly (0.000 chỉ)';
    if (getEl('s-gold-price-display')) getEl('s-gold-price-display').innerText = 'Tự động theo HLV';
    if (getEl('s-wage-display')) getEl('s-wage-display').innerText = 'Lấy từ Kho';
    const isKblExchange = mode === 'doikbl';
    const isAnyExchange = mode === 'doi' || isKblExchange;
    if (getEl('ex-fee-display')) getEl('ex-fee-display').innerText = isKblExchange
        ? 'Đổi ngang KBL 610: chênh trọng lượng × giá POS hiện tại + công tem'
        : mode === 'doi' ? 'Đổi bù vàng ngoài: dùng đúng engine và bảng giá POS đang cấu hình' : 'Tự động theo cặp hàm lượng';
    if (getEl('ex-old-type') && isKblExchange) getEl('ex-old-type').value = '610';
    if (getEl('s-discount')) {
        getEl('s-discount').value = 0;
        getEl('s-discount').disabled = isKblExchange;
        getEl('s-discount').title = isKblExchange ? 'Đổi ngang KBL dùng đúng công niêm yết của Mã SP.' : '';
    }
    if (getEl('s-discount-note')) {
        getEl('s-discount-note').style.display = isKblExchange ? 'block' : 'none';
        if (isKblExchange) getEl('s-discount-note').innerText = 'Đổi ngang KBL: trọng lượng + công bán lấy đúng Mã SP/tem; giá vàng lấy bảng POS hiện tại.';
    }
    if (getEl('exchange-owner-analysis')) getEl('exchange-owner-analysis').innerHTML = '<b>🔐 NỘI BỘ CHỦ TIỆM:</b> Chọn món mới và nhập vàng cũ để hệ thống tính lãi thật. Phần này không in trên phiếu khách.';
    lastSaleNetAmount = 0;
    if (getEl('s-total-pay')) getEl('s-total-pay').innerText = "0 ₫";

    if (mode === 'ban') {
        getEl('sell-mode-title').innerText = "🛍️ CHẾ ĐỘ: BÁN HÀNG MỚI (CHỌN HÀNG TỪ KHO)";
        getEl('exchange-zone').style.display = "none";
        getEl('sell-search').placeholder = "Quét mã vạch / QR trên tem vào đây...";
    } else if (mode === 'doi') {
        getEl('sell-mode-title').innerText = "🔄 CHẾ ĐỘ: ĐỔI VÀNG BÙ (VÀNG NGOÀI / KHÔNG ÁP DỤNG ĐỔI NGANG KBL)";
        getEl('exchange-zone').style.display = "block";
        getEl('sell-search').placeholder = "Chọn món mới trong kho để tính đổi bù...";
    } else if (mode === 'doikbl') {
        getEl('sell-mode-title').innerText = "♻️ CHẾ ĐỘ: ĐỔI NGANG VÀNG KIM BẢO LÂM";
        getEl('exchange-zone').style.display = "block";
        getEl('sell-search').placeholder = "Chọn Mã SP KBL mới để đổi ngang...";
    } else {
        getEl('sell-mode-title').innerText = "↩️ CHẾ ĐỘ: TRẢ HÀNG (TRẢ LẠI TIỀN CHO KHÁCH)";
        getEl('exchange-zone').style.display = "none";
        getEl('sell-search').placeholder = "Gõ mã Hóa Đơn (VD: HD-1712...) để tìm";
    }
    renderSalesCart();
    renderExchangeOldCart();
    if (getEl('invoice-preview')) getEl('invoice-preview').innerHTML = '<div class="invoice-paper" style="color:#64748b;text-align:center;padding-top:35mm;">Chưa có sản phẩm nào được chọn</div>';
}

function inventoryCodeFromScanValue(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return '';
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            const value = parsed.sku || parsed.code || parsed.invCode || parsed.productSku;
            if (value) return String(value).trim();
        }
    } catch (_) {}
    try {
        const url = new URL(raw);
        const value = url.searchParams.get('sku') || url.searchParams.get('code') || url.searchParams.get('productSku') || url.searchParams.get('invCode');
        if (value) return String(value).trim();
    } catch (_) {}
    const match = raw.match(/KBL-K[A-Z0-9]+/i);
    return match ? match[0].toUpperCase() : raw;
}

function searchInventoryForSale() {
    const rawSearch = getEl('sell-search') ? getEl('sell-search').value : '';
    const scanValue = currentSellMode === 'tra' ? String(rawSearch || '').trim() : inventoryCodeFromScanValue(rawSearch);
    const q = String(scanValue || '').toLowerCase().trim();
    const resBox = getEl('sell-search-results');
    if (!resBox) return;
    if (!q) { resBox.style.display = 'none'; return; }

    let results = [];
    if (currentSellMode === 'tra') {
        results = salesStore.filter(s => String(s.id || '').toLowerCase().includes(q) && s.mode !== 'tra');
        resBox.innerHTML = results.map(r => `<div style="padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;" onclick="addSaleToReturnCart('${escapeHtml(r.id)}')">＋ Thêm HĐ: <b>${escapeHtml(r.id)}</b> - Khách: ${escapeHtml(r.cusName || 'Khách lẻ')} - Dự kiến hoàn: ${formatVND(Math.abs(r.totalPay))}</div>`).join('');
    } else {
        const inCart = new Set(salesCart.map(item => item.invCode));
        const exact = inventoryStore.find(i => String(i.status || '') === 'Đang bán' && !inCart.has(i.code) && String(i.code || '').toLowerCase() === q);
        if (exact) {
            selectItemForSale(exact.code);
            return;
        }
        results = inventoryStore.filter(i => {
            const code = String(i.code || '').toLowerCase();
            const name = String(i.name || '').toLowerCase();
            const weight = String(i.weightLy || '').toLowerCase();
            return i.status === 'Đang bán' && !inCart.has(i.code) && (code.includes(q) || name.includes(q) || weight.includes(q));
        });
        resBox.innerHTML = results.map(r => `<div style="padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;" onclick="selectItemForSale('${escapeHtml(r.code)}')"><b>${escapeHtml(r.code)}</b> - ${escapeHtml(r.name)} (${numberValue(r.weightLy)} ly)</div>`).join('');
    }
    resBox.style.display = results.length > 0 ? 'block' : 'none';
}

function selectItemForSale(code) {
    currentSelectedInvItem = inventoryStore.find(i => i.code === code);
    if (!currentSelectedInvItem) return;
    if (getEl('sell-search-results')) getEl('sell-search-results').style.display = 'none'; 
    if (getEl('sell-search')) getEl('sell-search').value = code;
    getEl('s-code').value = currentSelectedInvItem.code; 
    getEl('s-name').value = currentSelectedInvItem.name;
    getEl('s-type').value = currentSelectedInvItem.type; 
    getEl('s-weight').value = currentSelectedInvItem.weightLy;
    if (getEl('s-gold-price-display')) getEl('s-gold-price-display').innerText = `${formatVND(inventorySellPrice(currentSelectedInvItem))}/chỉ`;
    if (getEl('s-wage-display')) getEl('s-wage-display').innerText = formatVND(inventorySellWage(currentSelectedInvItem));
    calcSellMath();
}

function loadSaleCustomerByQr() {
    const raw = getEl('s-cus-qr') ? getEl('s-cus-qr').value.trim() : '';
    if (!raw) return;

    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) {}

    const normalize = value => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    const query = normalize(raw);
    const candidateFields = item => [
        item.cccd, item.soCCCD, item.idNumber, item.phone, item.soDienThoai,
        item.id, item.customerId, item.qr, item.qrCode, item.rawQr
    ].map(normalize).filter(Boolean);
    const record = parsed && typeof parsed === 'object'
        ? parsed
        : dataStoreRecords.find(item => candidateFields(item).some(value => value === query || value.includes(query) || query.includes(value)));
    if (!record) return;

    const name = record.name || record.hoTen || record.fullName || record.customerName || record.customer || record.buyerName || record.buyer || '';
    const cccd = record.cccd || record.soCCCD || record.idNumber || record.idCard || '';
    const phone = record.phone || record.soDienThoai || record.mobile || '';
    const address = record.address || record.diaChi || record.diaChiCuTru || record.customerAddress || '';
    if (getEl('s-cus-name')) getEl('s-cus-name').value = name;
    if (getEl('s-cus-cccd')) getEl('s-cus-cccd').value = cccd;
    if (getEl('s-cus-phone')) getEl('s-cus-phone').value = phone;
    if (getEl('s-cus-address')) getEl('s-cus-address').value = address;
    kblSetSaleCccdImages(record.imgFront || record.cusImgFront || '', record.imgBack || record.cusImgBack || '');
    calcSellMath();
}

function exchangeCustomerFormulaHtml(calculation) {
    const f = calculation?.customerFormula;
    if (!f) return exchangeAdjustmentSummaryHtml(calculation);
    const diffText = f.differenceKind === 'equal'
        ? '<div>Chênh lệch vàng: <b>0.000 chỉ</b> — đổi ngang trọng lượng.</div>'
        : f.differenceKind === 'shortage'
            ? `<div>Vàng khách thiếu: <b>${Number(f.differenceChi).toFixed(3)} chỉ × ${formatVND(f.differenceRate)}/chỉ = ${formatVND(Math.abs(f.goldDifferenceAmount))}</b></div>`
            : `<div>Vàng khách dư: <b>${Number(f.differenceChi).toFixed(3)} chỉ × ${formatVND(f.differenceRate)}/chỉ = ${formatVND(Math.abs(f.goldDifferenceAmount))}</b></div>`;
    return `<div>Vàng mới: <b>${Number(f.newWeightChi).toFixed(3)} chỉ</b></div>
        <div>Vàng cũ thực: <b>${Number(f.oldWeightChi).toFixed(3)} chỉ</b></div>
        ${diffText}
        <div>Tiền công cố định của món mới: <b>${formatVND(f.wageTotal)}</b></div>`;
}

function exchangeOwnerAnalysisHtml(calculation) {
    const i = calculation?.internal;
    if (!calculation?.smart610 || !i) return '<b>🔐 NỘI BỘ CHỦ TIỆM:</b> Quy tắc khác 610→610 đang dùng engine đổi bù cũ.';
    const newPurities = getExchangeNewItems().map(item => smartExchange610NewPurity(item));
    const purityText = newPurities.length ? [...new Set(newPurities.map(v => Number(v).toFixed(2)))].join(', ') : Number(settingsStore.exchange_new_purity_610_default || 63).toFixed(2);
    const sourceText = i.sourceRefs?.length ? i.sourceRefs.map(escapeHtml).join(', ') : 'chưa gắn toa nguồn';
    const bookLine = i.hasCompleteBookCost
        ? `Giá vốn thực món mới: <b>${formatVND(i.bookTotalCost)}</b><br>Giá trị vàng cũ nhận vào theo giá BÁN POS: <b>${formatVND(i.oldPurchaseValue)}</b><br>Tiền khách trả/tiệm trả: <b>${formatVND(calculation.totalPay)}</b><br>Lãi ca đổi theo giá vốn: <b>${formatVND(i.bookProfit)}</b><br>`
        : `Giá vốn toa: <b>CHƯA ĐỦ</b> — chưa thể chốt lãi theo giá vốn, tạm dùng biên thị trường để cảnh báo.<br>`;
    return `<b>🔐 NỘI BỘ CHỦ TIỆM — KHÔNG IN CHO KHÁCH</b><br>
        Giá POS hiện tại: mua 610 <b>${formatVND(i.retailBuy)}/chỉ</b> · bán 610 <b>${formatVND(i.retailSell)}/chỉ</b><br>
        Tuổi cũ nội bộ: <b>${Number(i.oldPurity).toFixed(2)}%</b> · tuổi theo toa món mới: <b>${purityText}%</b><br>
        Vàng cũ sau quy tuổi: <b>${Number(i.oldEquivalentNewChi).toFixed(4)} chỉ tương đương</b> · nguồn toa: <b>${sourceText}</b><br>
        Biên vàng theo giá hiện tại: <b>${formatVND(i.goldMarketMargin)}</b><br>
        Lãi công: <b>${formatVND(i.wageMargin)}</b> (công tem ${formatVND(i.wageTotal)} − công vốn toa ${formatVND(i.wageCostTotal)})<br>
        ${bookLine}
        Biên tham khảo theo giá hiện tại: <b>${formatVND(i.marketProfit)}</b><br>
        <span style="font-size:13px;"><b>LÃI THỰC DÙNG RA QUYẾT ĐỊNH: ${formatVND(i.profit)}</b></span><br>
        ${escapeHtml(i.status?.label || '')}<br>
        Ngân sách miễn ship tối đa để vẫn giữ lãi ${formatVND(i.minProfit)}: <b>${formatVND(i.freeShipBudget)}</b>`;
}

function renderExchangeOwnerAnalysis(calculation) {
    const box = getEl('exchange-owner-analysis');
    if (!box) return;
    box.innerHTML = exchangeOwnerAnalysisHtml(calculation);
}

function calcSellMath() {
    if (currentSellMode === 'ban') {
        const draft = getSaleDraft();
        const totalPay = saleCartTotal() + (draft ? draft.totalPay : 0);
        const profit = saleCartProfit() + (draft ? draft.profit : 0);
        if (getEl('lbl-total-pay-text')) getEl('lbl-total-pay-text').innerText = "TỔNG KHÁCH PHẢI TRẢ (VNĐ):";
        lastSaleNetAmount = totalPay;
        if (getEl('s-total-pay')) getEl('s-total-pay').innerText = formatVND(totalPay);
        if (getEl('s-profit')) getEl('s-profit').value = profit;
        renderSalesCart();
        renderInvoicePreview(totalPay);
        return;
    }

    if (currentSellMode === 'doi' || currentSellMode === 'doikbl') {
        const newItems = getExchangeNewItems();
        const oldItems = getExchangeOldItems();
        const oldWeight = exchangeOldWeight();
        const discount = numberValue(getEl('s-discount') ? getEl('s-discount').value : 0);
        let calculation;
        if (currentSellMode === 'doikbl') {
            if (newItems.length && oldItems.length && !smartExchange610Eligible(newItems, oldItems)) {
                if (getEl('exchange-owner-analysis')) getEl('exchange-owner-analysis').innerHTML = '<b>⚠️ ĐỔI NGANG KBL hiện áp dụng cho 610 → 610.</b> Nếu vàng khác nguồn/loại, chuyển sang Đổi Vàng Bù.';
                calculation = calculateExchangeSettlement(newItems, oldItems, 0);
            } else calculation = calculateSmart610ExchangeSettlement(newItems, oldItems, 0);
        } else {
            calculation = calculateExchangeSettlement(newItems, oldItems, discount);
        }
        const totalPay = numberValue(calculation.totalPay);
        const oldPriceBuy = oldWeight > 0 ? numberValue(calculation.oldGoldValue) / (oldWeight / 100) : numberValue(settingsStore.price_buy_610);
        const profit = numberValue(calculation.profit ?? calculation.internal?.profit);
        lastSaleNetAmount = totalPay;
        if (getEl('ex-old-price-buy')) getEl('ex-old-price-buy').value = formatVND(oldPriceBuy) + '/chỉ';
        if (getEl('ex-gold-compensation')) {
            if (calculation.smart610 && calculation.customerFormula) {
                const amount = numberValue(calculation.customerFormula.goldDifferenceAmount);
                const label = amount > 0 ? 'Khách bù ' : amount < 0 ? 'Tiệm trả ' : 'Không chênh ';
                getEl('ex-gold-compensation').value = label + formatVND(Math.abs(amount));
            } else getEl('ex-gold-compensation').value = formatVND(Math.abs(numberValue(calculation.exchangeAdjustment)));
        }
        renderExchangeOwnerAnalysis(calculation);
        if (getEl('ex-fee-display')) {
            getEl('ex-fee-display').innerText = calculation.smart610
                ? 'Đổi ngang KBL 610: chênh trọng lượng × giá POS hiện tại + công tem'
                : (calculation.ruleLines?.length ? calculation.ruleLines.join(' · ') : 'Đổi bù theo engine POS hiện tại');
        }
        if (getEl('lbl-total-pay-text')) getEl('lbl-total-pay-text').innerText = totalPay >= 0
            ? 'TỔNG KHÁCH PHẢI TRẢ (VNĐ):'
            : 'TỔNG KHÁCH DƯ (VNĐ):';
        if (getEl('s-total-pay')) getEl('s-total-pay').innerText = formatVND(Math.abs(totalPay));
        if (getEl('s-profit')) getEl('s-profit').value = profit;
        renderExchangeOldCart();
        renderSalesCart();
        renderInvoicePreview(totalPay);
        return;
    }

    if (currentSellMode === 'tra') {
        const refund = returnCart.reduce((sum, item) => sum + numberValue(item.refundAmount), 0);
        lastSaleNetAmount = -refund;
        if (getEl('lbl-total-pay-text')) getEl('lbl-total-pay-text').innerText = 'TỔNG HOÀN KHÁCH (VNĐ):';
        if (getEl('s-total-pay')) getEl('s-total-pay').innerText = formatVND(refund);
        if (getEl('s-profit')) getEl('s-profit').value = -returnCart.reduce((sum, item) => sum + numberValue(item.profit), 0);
        renderSalesCart();
        renderReturnCartInvoicePreview();
        return;
    }

    if (!currentSelectedInvItem) {
        lastSaleNetAmount = 0;
        if (getEl('s-total-pay')) getEl('s-total-pay').innerText = "0 ₫";
        return;
    }
    const priceSell = inventorySellPrice(currentSelectedInvItem);
    const wage = inventorySellWage(currentSelectedInvItem);
    const discount = numberValue(getEl('s-discount') ? getEl('s-discount').value : 0);
    const totalPay = Math.round((numberValue(currentSelectedInvItem.weightLy) / 100) * priceSell + wage - discount);
    const profit = totalPay - inventoryEffectiveBookCost(currentSelectedInvItem);
    lastSaleNetAmount = totalPay;
    if (getEl('lbl-total-pay-text')) getEl('lbl-total-pay-text').innerText = currentSellMode === 'tra'
        ? 'TỔNG HOÀN KHÁCH (VNĐ):' : 'TỔNG KHÁCH PHẢI TRẢ (VNĐ):';
    if (getEl('s-total-pay')) getEl('s-total-pay').innerText = formatVND(totalPay);
    if (getEl('s-profit')) getEl('s-profit').value = profit;
    renderInvoicePreview(totalPay);
}

function invoiceCustomerHtml(customer) {
    const c = customer || invoiceCustomerSnapshot();
    return `<div class="invoice-customer-meta">
        <div><b>Khách hàng:</b> ${escapeHtml(c.cusName || 'Khách lẻ')}</div>
        <div><b>SĐT:</b> ${escapeHtml(c.cusPhone || '—')} &nbsp;&nbsp; <b>CCCD:</b> ${escapeHtml(c.cusCccd || '—')}</div>
        <div><b>Địa chỉ:</b> ${escapeHtml(c.cusAddress || '—')}</div>
    </div>`;
}

function exchangeAdjustmentSummaryHtml(calculation) {
    const lines = Array.isArray(calculation?.adjustmentLines) ? calculation.adjustmentLines : [];
    if (!lines.length) return '<div>Điều chỉnh theo quy tắc đổi vàng: <b>0₫</b></div>';

    return lines.map(line => {
        const label = line.kind === 'benefit'
            ? 'Điều chỉnh theo quy tắc đổi vàng (cộng lợi ích cho khách)'
            : 'Điều chỉnh theo quy tắc đổi vàng';
        return `<div>${label}: <b>${(numberValue(line.oldWeightLy) / 100).toFixed(3)} chỉ × ${formatVND(line.rate)}/chỉ = ${formatVND(Math.abs(line.amount))}</b></div>`;
    }).join('');
}

function invoiceNoticeHtml({ calculation = null, noticeType = 'sale' } = {}) {
    const isExchange = noticeType === 'exchange';
    const isReturn = noticeType === 'return';
    const checkText = isReturn
        ? 'Khách hàng vui lòng kiểm tra món hàng trả lại và số tiền hoàn trước khi ký.'
        : isExchange
            ? 'Khách hàng vui lòng kiểm tra trọng lượng vàng cũ thực tế, trọng lượng món mới, giá vàng và tiền đổi/bù trước khi ký.'
            : 'Khách hàng vui lòng kiểm tra trọng lượng, hàm lượng và giá vàng trước khi ký nhận.';
    const responsibilityText = isReturn
        ? 'Phiếu trả hàng được lập theo hiện trạng hàng hóa và số tiền hoàn đã được hai bên kiểm tra, xác nhận.'
        : 'Sau khi nhận hàng, khách hàng có trách nhiệm kiểm tra và bảo quản trong quá trình đeo/sử dụng. Cửa hàng không chịu trách nhiệm đối với hao hụt, thiếu sót hoặc hư hỏng phát sinh trong quá trình đeo/sử dụng sau thời điểm bàn giao và ký nhận.';
    const adjustmentLine = isExchange
        ? (calculation?.smart610 ? '' : exchangeAdjustmentSummaryHtml(calculation))
        : '';

    return `<div class="invoice-customer-notice">
        <div class="invoice-customer-notice-title">LƯU Ý ĐỐI VỚI KHÁCH HÀNG</div>
        <ul>
            <li>${checkText}</li>
            <li>${responsibilityText}</li>
            ${adjustmentLine ? `<li>${adjustmentLine}</li>` : ''}
        </ul>
    </div>`;
}

function invoicePaperHtml({ title, subtitle, customer, body, totalLabel, totalValue, note, noticeHtml, invoiceId = '', createdAt = '' }) {
    const d = createdAt ? new Date(createdAt) : new Date();
    const safeDate = Number.isFinite(d.getTime()) ? d : new Date();
    return `<div class="invoice-paper">
        <div class="invoice-head">
            <div>
                <div class="invoice-shop-name">KIM BẢO LÂM</div>
                <div class="invoice-shop-meta">CÔNG TY TNHH MTV VÀNG BẠC ĐÁ QUÝ KIM BẢO LÂM</div>
                <div class="invoice-shop-meta">MST: 3703496362</div>
                <div class="invoice-shop-meta">59/1 Nguyễn Thị Tươi, P. Tân Đông Hiệp, TP. Hồ Chí Minh</div>
                <div class="invoice-shop-meta">ĐT: 0985.325.806 - 0899.979797</div>
            </div>
            <div class="invoice-shop-meta" style="text-align:right;">${invoiceId ? `Số HĐ<br><b>${escapeHtml(invoiceId)}</b><br>` : ''}Ngày lập<br><b>${safeDate.toLocaleString('vi-VN')}</b></div>
        </div>
        <div class="invoice-title">${escapeHtml(title)}</div>
        <div class="invoice-subtitle">${escapeHtml(subtitle || 'Phiếu nội bộ lưu cùng hồ sơ giao dịch')}</div>
        ${invoiceCustomerHtml(customer)}
        ${body}
        <div class="invoice-total">${escapeHtml(totalLabel)}: ${formatVND(Math.abs(numberValue(totalValue)))}</div>
        ${note ? `<div class="invoice-note"><b>Ghi chú:</b> ${escapeHtml(note)}</div>` : ''}
        ${noticeHtml || invoiceNoticeHtml({ totalPay: totalValue, note: note || 'Phiếu nội bộ lưu cùng hồ sơ giao dịch.' })}
        <div class="invoice-signatures"><div>Người lập phiếu<br><small>(Ký, ghi rõ họ tên)</small></div><div>Khách hàng<br><small>(Ký, ghi rõ họ tên)</small></div></div>
    </div>`;
}

function invoiceSalesTable(lines) {
    return `<table class="invoice-table"><thead><tr>
        <th>STT</th><th>Tên hàng / Mã SP</th><th>HLV</th><th>KLV</th><th>Giá vàng</th><th>Công</th><th>Thành tiền</th>
    </tr></thead><tbody>${lines.map((item, index) => `<tr>
        <td style="text-align:center;">${index + 1}</td>
        <td><b>${escapeHtml(item.itemName || '')}</b><br><small>${escapeHtml(item.originalInvCode || item.invCode || '')}</small>${item.inventoryDeleted ? '<br><small style="color:#b42318;font-weight:700;">Đã xóa khỏi Kho</small>' : ''}</td>
        <td style="text-align:center;">${escapeHtml(item.type || '')}</td>
        <td style="text-align:right;white-space:nowrap;">${(numberValue(item.weightLy) / 100).toFixed(3)} chỉ</td>
        <td class="num">${formatVND(item.priceSell)}</td>
        <td class="num">${formatVND(item.wage)}</td>
        <td class="num"><b>${formatVND(item.totalPay)}</b></td>
    </tr>`).join('')}</tbody></table>`;
}

function invoiceOldTable(items) {
    return `<table class="invoice-table"><thead><tr>
        <th>STT</th><th>Vàng cũ nhận lại</th><th>TL cân</th><th>Hột/đá</th><th>Dơ đất</th><th>KLV thực</th><th>Giá mua</th><th>Giá trị</th>
    </tr></thead><tbody>${items.map((item, index) => `<tr>
        <td style="text-align:center;">${index + 1}</td>
        <td><b>${escapeHtml(item.name || 'Vàng cũ của khách')}</b><br><small>HLV: ${escapeHtml(item.type || '')}</small></td>
        <td class="num">${(numberValue(item.grossLy || item.weightLy) / 100).toFixed(3)}</td>
        <td class="num">${(numberValue(item.gemLy) / 100).toFixed(3)}</td>
        <td class="num">${(numberValue(item.dirtLy) / 100).toFixed(3)}</td>
        <td class="num"><b>${(numberValue(item.weightLy) / 100).toFixed(3)}</b></td>
        <td class="num">${formatVND(item.priceBuy)}</td>
        <td class="num">${formatVND((numberValue(item.weightLy) / 100) * numberValue(item.priceBuy))}</td>
    </tr>`).join('')}</tbody></table>`;
}

function n10WarrantyPayloadFor(tx) {
    const rows = (Array.isArray(tx && tx.items) ? tx.items : [])
        .map(item => ({
            productSku: String(item && item.invCode || '').trim().slice(0, 100),
            soldWeightChi: Math.max(0, numberValue(item && item.weightLy) / 100),
            soldWorkmanship: Math.max(0, numberValue(item && (item.wage ?? item.sellWage))),
            soldGoldCode: String(item && item.type || '').trim().slice(0, 20)
        }))
        .filter(item => item.productSku);
    if (!rows.length && tx && tx.invCode) {
        rows.push({
            productSku: String(tx.invCode || '').trim().slice(0, 100),
            soldWeightChi: Math.max(0, numberValue(tx.weightLy) / 100),
            soldWorkmanship: 0,
            soldGoldCode: String(tx.type || '').trim().slice(0, 20)
        });
    }
    return {
        invoiceId: String(tx && tx.id || '').slice(0, 100),
        phone: n10LoyaltyPhoneKey(tx && tx.cusPhone),
        customerName: String(tx && tx.cusName || '').trim().slice(0, 100),
        soldAt: tx && tx.dateRaw || new Date().toISOString(),
        eventType: String(tx && tx.mode || '').toLowerCase() === 'tra' ? 'return' : 'sale',
        items: rows
    };
}

async function syncN10WarrantyForTransaction(tx) {
    if (!tx || String(tx.mode || '').toLowerCase() === 'tra') return { success: true, skipped: true, warranties: [] };
    const payload = n10WarrantyPayloadFor(tx);
    if (!Array.isArray(payload.items) || !payload.items.length) return { success: false, skipped: true, message: 'Không có Mã SP để tạo bảo hành.', warranties: [] };
    const token = String(settingsStore && settingsStore.web_sync_token || '').trim();
    if (token.length < 32) return { success: false, skipped: true, message: 'Thiếu KBL_SYNC_TOKEN.', warranties: [] };
    const base = normalizeWebSyncBaseUrl(settingsStore && settingsStore.web_sync_url);
    try {
        const result = await nodePostJson(`${base}/api/sync/warranty-sale`, payload, { 'x-kbl-sync-token': token });
        if (!result || !result.success) return { success: false, message: result && result.message || 'Website chưa cấp QR bảo hành.', warranties: [] };
        return { success: true, warranties: Array.isArray(result.warranties) ? result.warranties : [] };
    } catch (error) {
        return { success: false, message: error && error.message || String(error), warranties: [] };
    }
}

function persistSalesWarrantySnapshot(tx, result) {
    if (!tx || !result || !result.success || !Array.isArray(result.warranties)) return;
    tx.warrantySnapshot = {
        success: true,
        savedAt: new Date().toISOString(),
        warranties: result.warranties.map(row => ({ sku: row?.sku || '', url: row?.url || '' })).filter(row => row.url)
    };
    // tx đã nằm trong salesStore theo cùng object reference; ghi lại để lần IN LẠI không phụ thuộc mạng.
    saveDBFile('sales_db.json', salesStore);
}

function ensureInvoiceWarrantyPendingNotice() {
    const paper = getEl('invoice-preview')?.querySelector('.invoice-paper');
    if (!paper || paper.querySelector('.invoice-warranty-zone')) return;
    const signatures = paper.querySelector('.invoice-signatures');
    const box = document.createElement('div');
    box.className = 'invoice-warranty-zone';
    box.style.cssText = 'margin-top:5mm;padding:2.5mm 3mm;border:1px dashed #94a3b8;border-radius:5px;background:#f8fafc;color:#475569;font-size:9px;line-height:1.35;';
    box.innerHTML = '<b style="color:#0f2747">▣ QR BẢO HÀNH ĐIỆN TỬ</b><br>QR chính thức được cấp tự động sau khi bấm <b>XÁC NHẬN THANH TOÁN</b> và POS đồng bộ giao dịch với website.';
    if (signatures) paper.insertBefore(box, signatures); else paper.appendChild(box);
}

async function attachWarrantyQrToInvoicePreview(result, invoiceId) {
    const paper = getEl('invoice-preview')?.querySelector('.invoice-paper');
    if (!paper) return false;
    let zone = paper.querySelector('.invoice-warranty-zone');
    if (!zone) {
        zone = document.createElement('div');
        zone.className = 'invoice-warranty-zone';
        const signatures = paper.querySelector('.invoice-signatures');
        if (signatures) paper.insertBefore(zone, signatures); else paper.appendChild(zone);
    }
    const rows = result && result.success && Array.isArray(result.warranties) ? result.warranties.filter(w => w && w.url) : [];
    zone.style.cssText = 'margin-top:5mm;padding:2.5mm 3mm;border:1px solid #c8a23b;border-radius:5px;background:#fffdf4;color:#334155;font-size:8.8px;line-height:1.3;';
    if (!rows.length) {
        zone.innerHTML = `<b style="color:#8a5a00">▣ QR BẢO HÀNH ĐIỆN TỬ</b><br>Chưa cấp được QR lúc in. Mã hóa đơn <b>${escapeHtml(invoiceId || '')}</b> vẫn được lưu trong POS; khi mạng hoạt động, dữ liệu sẽ tiếp tục đồng bộ. Có thể tạo/tra cứu bảo hành từ Admin website.`;
        return false;
    }
    zone.innerHTML = `<div style="font-weight:800;color:#8a5a00;margin-bottom:2mm">▣ PHIẾU BẢO HÀNH ĐIỆN TỬ · QUÉT QR ĐỂ XEM</div><div class="invoice-warranty-qr-grid" style="display:flex;flex-wrap:wrap;gap:3mm"></div>`;
    const grid = zone.querySelector('.invoice-warranty-qr-grid');
    for (const row of rows.slice(0, 6)) {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:2mm;min-width:42mm;padding:1.5mm;border:1px solid #e2e8f0;border-radius:4px;background:#fff;';
        const qrBox = document.createElement('div');
        qrBox.style.cssText = 'width:21mm;height:21mm;display:grid;place-items:center;flex:0 0 21mm;';
        const text = document.createElement('div');
        text.innerHTML = `<b>${escapeHtml(row.sku || 'Sản phẩm')}</b><br><span style="font-size:7.5px;color:#64748b">Mã HĐ: ${escapeHtml(invoiceId || '')}<br>Quét để xem bảo hành + điểm thành viên.</span>`;
        item.appendChild(qrBox); item.appendChild(text); grid.appendChild(item);
        if (typeof QRCode === 'function') {
            new QRCode(qrBox, { text: String(row.url), width: 96, height: 96, colorDark: '#0b2240', colorLight: '#ffffff' });
            await new Promise(resolve => setTimeout(resolve, 10));
            const canvas = qrBox.querySelector('canvas');
            const generatedImg = qrBox.querySelector('img');
            let dataUrl = '';
            try { if (canvas) dataUrl = canvas.toDataURL('image/png'); } catch (_) {}
            if (!dataUrl && generatedImg && generatedImg.src) dataUrl = generatedImg.src;
            if (dataUrl) {
                const img = document.createElement('img');
                img.src = dataUrl; img.alt = `QR bảo hành ${row.sku || ''}`;
                img.style.cssText = 'width:21mm;height:21mm;display:block;image-rendering:auto;';
                qrBox.innerHTML = ''; qrBox.appendChild(img);
            }
        }
    }
    return true;
}

function renderInvoicePreview(totalPay) {
    const preview = getEl('invoice-preview');
    if (!preview) return;
    const customer = invoiceCustomerSnapshot();

    if (currentSellMode === 'ban') {
        const lines = salesCart.slice();
        const draft = getSaleDraft();
        if (draft) lines.push(draft);
        if (!lines.length) {
            preview.innerHTML = '<div class="invoice-paper" style="color:#64748b;text-align:center;padding-top:35mm;">Chưa có sản phẩm nào được chọn</div>';
            return;
        }
        preview.innerHTML = invoicePaperHtml({
            title: 'HÓA ĐƠN BÁN LẺ',
            subtitle: 'Hàng hóa trang sức - phiếu nội bộ',
            customer,
            body: invoiceSalesTable(lines),
            totalLabel: 'TỔNG KHÁCH PHẢI TRẢ',
            totalValue: totalPay,
            noticeHtml: invoiceNoticeHtml({ noticeType: 'sale' })
        });
        ensureInvoiceWarrantyPendingNotice();
        return;
    }

    if (currentSellMode === 'doi' || currentSellMode === 'doikbl') {
        const newItems = getExchangeNewItems();
        const oldItems = getExchangeOldItems();
        if (!newItems.length && !oldItems.length) {
            preview.innerHTML = '<div class="invoice-paper" style="color:#64748b;text-align:center;padding-top:35mm;">Chưa có món mới hoặc vàng cũ</div>';
            return;
        }
        const calculation = currentSellMode === 'doikbl' && smartExchange610Eligible(newItems, oldItems)
            ? calculateSmart610ExchangeSettlement(newItems, oldItems, 0)
            : calculateExchangeSettlement(newItems, oldItems, numberValue(getEl('s-discount')?.value));
        const customerFormula = calculation.smart610
            ? exchangeCustomerFormulaHtml(calculation)
            : exchangeAdjustmentSummaryHtml(calculation);
        const ownerBox = calculation.smart610 ? `<div class="owner-only exchange-owner-box" style="margin-top:4mm;padding:3mm;border:1px dashed #168b57;background:#f0fff6;border-radius:5px;">${exchangeOwnerAnalysisHtml(calculation)}</div>` : '';
        const body = `<div class="invoice-section-title">MÓN MỚI GIAO KHÁCH</div>${newItems.length ? invoiceSalesTable(newItems) : '<p>Không có món mới.</p>'}
            <div class="invoice-section-title" style="margin-top:5mm;">VÀNG CŨ NHẬN LẠI</div>${oldItems.length ? invoiceOldTable(oldItems) : '<p>Không có vàng cũ.</p>'}
            <div class="invoice-section-title" style="margin-top:4mm;">CÁCH TÍNH ${currentSellMode === 'doikbl' ? 'ĐỔI NGANG KBL' : 'ĐỔI VÀNG BÙ'}</div>
            <div class="invoice-summary-lines">${customerFormula}</div>${ownerBox}`;
        preview.innerHTML = invoicePaperHtml({
            title: currentSellMode === 'doikbl' ? 'PHIẾU ĐỔI NGANG KBL' : 'PHIẾU ĐỔI BÙ VÀNG',
            subtitle: currentSellMode === 'doikbl' ? 'Vàng Kim Bảo Lâm đổi ngang theo trọng lượng và công niêm yết' : 'Đổi vàng bù theo bảng giá POS hiện tại',
            customer,
            body,
            totalLabel: totalPay >= 0 ? 'TỔNG KHÁCH PHẢI TRẢ' : 'TỔNG KHÁCH DƯ',
            totalValue: totalPay,
            noticeHtml: invoiceNoticeHtml({ calculation, noticeType: 'exchange' })
        });
        ensureInvoiceWarrantyPendingNotice();
        return;
    }

    if (!currentSelectedInvItem) {
        preview.innerHTML = '<div class="invoice-paper" style="color:#64748b;text-align:center;padding-top:35mm;">Quét hoặc chọn hóa đơn để xử lý trả hàng</div>';
    }
}

function invoiceCustomerSnapshot() {
    return {
        cusName: getEl('s-cus-name')?.value.trim() || 'Khách lẻ',
        cusPhone: getEl('s-cus-phone')?.value.trim() || '',
        cusCccd: getEl('s-cus-cccd')?.value.trim() || '',
        cusAddress: getEl('s-cus-address')?.value.trim() || '',
        cusQr: getEl('s-cus-qr')?.value.trim() || '',
        cusImgFront: saleCccdImageSnapshot.front || '',
        cusImgBack: saleCccdImageSnapshot.back || ''
    };
}

let currentInvoiceHistoryId = '';
let editingSalesInvoiceId = '';

function saleModeText(mode) {
    return mode === 'ban' ? 'Bán hàng' : mode === 'doikbl' ? 'Đổi ngang KBL' : mode === 'doi' ? 'Đổi bù' : mode === 'tra' ? 'Trả hàng' : (mode || 'Giao dịch');
}

function saleHistoryProductText(tx) {
    const items = Array.isArray(tx?.items) ? tx.items : [];
    if (items.length) return items.map(item => `${item.invCode || ''} ${item.originalInvCode || ''} ${item.itemName || item.name || ''}`.trim()).filter(Boolean).join('; ');
    return `${tx?.invCode || ''} ${tx?.originalInvCode || ''} ${tx?.itemName || ''}`.trim();
}

function normalizeStoredSaleLines(tx) {
    const items = Array.isArray(tx?.items) && tx.items.length ? tx.items : [{
        inventoryUid: tx?.inventoryUid || '', originalInvCode: tx?.originalInvCode || tx?.invCode || '',
        invCode: tx?.invCode || '', itemName: tx?.itemName || '', type: tx?.type || '', weightLy: tx?.weightLy || 0,
        priceSell: tx?.priceSell || 0, wage: tx?.wage || 0, totalPay: tx?.totalPay || 0
    }];
    return items.map(item => ({
        ...item,
        originalInvCode: item.originalInvCode || item.invCode || '',
        invCode: item.invCode || '', itemName: item.itemName || item.name || '', type: item.type || tx?.type || '',
        weightLy: numberValue(item.weightLy), priceSell: numberValue(item.priceSell), wage: numberValue(item.wage ?? item.sellWage), totalPay: numberValue(item.totalPay)
    }));
}

function renderStoredSalesInvoice(tx) {
    const preview = getEl('invoice-preview');
    if (!preview || !tx) return false;
    const customer = { cusName: tx.cusName || 'Khách lẻ', cusPhone: tx.cusPhone || '', cusCccd: tx.cusCccd || '', cusAddress: tx.cusAddress || '' };
    const mode = String(tx.mode || 'ban').toLowerCase();
    if (mode === 'tra') {
        const items = normalizeStoredSaleLines(tx);
        const body = `<div class="invoice-section-title">CHI TIẾT HÀNG TRẢ</div>${invoiceSalesTable(items)}
            <div class="invoice-summary-lines">Hóa đơn gốc: <b>${escapeHtml(tx.originalTransactionId || '—')}</b></div>`;
        preview.innerHTML = invoicePaperHtml({
            title:'PHIẾU TRẢ HÀNG', subtitle:'Hoàn tiền theo hóa đơn bán lẻ nội bộ', customer, body,
            totalLabel:'TỔNG HOÀN KHÁCH', totalValue:Math.abs(numberValue(tx.totalPay)), noticeHtml:invoiceNoticeHtml({ noticeType:'return' }),
            invoiceId:tx.id || '', createdAt:tx.dateRaw || '', note:tx.note || ''
        });
        return true;
    }
    if (mode === 'doi' || mode === 'doikbl') {
        const newItems = normalizeStoredSaleLines(tx);
        const oldItems = Array.isArray(tx.oldItems) ? tx.oldItems : [];
        const rules = Array.isArray(tx.exchangeRules) && tx.exchangeRules.length
            ? tx.exchangeRules.map(r => `<div>${escapeHtml(String(r))}</div>`).join('')
            : `<div>Tiền đổi/bù đã chốt: <b>${formatVND(Math.abs(numberValue(tx.totalPay)))}</b></div>`;
        const body = `<div class="invoice-section-title">MÓN MỚI GIAO KHÁCH</div>${invoiceSalesTable(newItems)}
            <div class="invoice-section-title" style="margin-top:5mm;">VÀNG CŨ NHẬN LẠI</div>${oldItems.length ? invoiceOldTable(oldItems) : '<p>Không có dữ liệu vàng cũ.</p>'}
            <div class="invoice-section-title" style="margin-top:4mm;">CÁCH TÍNH ĐÃ LƯU</div><div class="invoice-summary-lines">${rules}</div>`;
        preview.innerHTML = invoicePaperHtml({
            title:mode === 'doikbl' ? 'PHIẾU ĐỔI NGANG KBL' : 'PHIẾU ĐỔI BÙ VÀNG', subtitle:'Hóa đơn đã lưu trong POS', customer, body,
            totalLabel:numberValue(tx.totalPay) >= 0 ? 'TỔNG KHÁCH PHẢI TRẢ' : 'TỔNG KHÁCH DƯ', totalValue:tx.totalPay,
            noticeHtml:invoiceNoticeHtml({ noticeType:'exchange' }), invoiceId:tx.id || '', createdAt:tx.dateRaw || '', note:tx.note || ''
        });
        return true;
    }
    const lines = normalizeStoredSaleLines(tx);
    preview.innerHTML = invoicePaperHtml({
        title:'HÓA ĐƠN BÁN LẺ', subtitle:'Hàng hóa trang sức - phiếu nội bộ', customer, body:invoiceSalesTable(lines),
        totalLabel:'TỔNG KHÁCH PHẢI TRẢ', totalValue:tx.totalPay, noticeHtml:invoiceNoticeHtml({ noticeType:'sale' }),
        invoiceId:tx.id || '', createdAt:tx.dateRaw || '', note:tx.note || ''
    });
    return true;
}

function renderSalesInvoiceHistory() {
    const tbody = getEl('sales-invoice-history-tbody');
    if (!tbody) return;
    const q = String(getEl('sales-invoice-history-search')?.value || '').trim().toLowerCase();
    const rows = (Array.isArray(salesStore) ? salesStore : []).filter(tx => {
        if (!q) return true;
        const hay = [tx.id, tx.cusName, tx.cusPhone, tx.cusCccd, tx.itemName, saleHistoryProductText(tx), saleModeText(tx.mode)].join(' ').toLowerCase();
        return hay.includes(q);
    }).slice(0, 300);
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#64748b;padding:12px;">Không tìm thấy hóa đơn.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(tx => {
        const d = new Date(tx.dateRaw || 0);
        const dateText = Number.isFinite(d.getTime()) ? d.toLocaleString('vi-VN') : '—';
        const products = saleHistoryProductText(tx) || '—';
        return `<tr${currentInvoiceHistoryId === tx.id ? ' style="background:#fff8df"' : ''}>
            <td style="white-space:nowrap;">${escapeHtml(dateText)}</td>
            <td><b>${escapeHtml(tx.id || '')}</b></td>
            <td>${escapeHtml(saleModeText(tx.mode))}</td>
            <td><b>${escapeHtml(tx.cusName || 'Khách lẻ')}</b><br><small>${escapeHtml(tx.cusPhone || '')}</small></td>
            <td>${escapeHtml(products)}</td>
            <td class="num"><b>${formatVND(Math.abs(numberValue(tx.totalPay)))}</b></td>
            <td style="white-space:nowrap;">
                <button type="button" class="btn btn-blue" style="padding:3px 6px;font-size:10px;" onclick='viewSalesInvoice(${JSON.stringify(String(tx.id || ''))})'>👁 Xem</button>
                <button type="button" class="btn btn-primary" style="padding:3px 6px;font-size:10px;" onclick='printSalesInvoiceById(${JSON.stringify(String(tx.id || ''))})'>🖨 In lại</button>
                <button type="button" class="btn btn-gold" style="padding:3px 6px;font-size:10px;" onclick='startEditSalesInvoice(${JSON.stringify(String(tx.id || ''))})'>✏️ Sửa</button>
                ${(['doi','doikbl'].includes(String(tx.mode || '').toLowerCase()) || tx?.exchangeDossier?.sourceType === 'manual_buy_sell') ? `<button type="button" class="btn" style="padding:3px 6px;font-size:10px;background:#6f42c1;color:#fff;" onclick='openLinkedExchangeDossierFromSale(${JSON.stringify(String(tx.id || ''))})'>🔗 Hồ sơ</button>` : ''}
                <button type="button" class="btn btn-danger" style="padding:3px 6px;font-size:10px;" onclick='deleteSalesInvoice(${JSON.stringify(String(tx.id || ''))})'>🗑 Xóa</button>
            </td>
        </tr>`;
    }).join('');
}

async function deleteSalesInvoice(id) {
    const invoiceId = String(id || '').trim();
    const index = salesStore.findIndex(item => String(item.id || '') === invoiceId);
    if (index < 0) return alert('Không tìm thấy hóa đơn cần xóa trong sales_db.json.');

    const tx = salesStore[index];
    const mode = String(tx.mode || 'ban').toLowerCase();

    // Không cho xóa hóa đơn gốc khi đã có phiếu trả hàng liên quan,
    // tránh làm lệch lịch sử hàng trả. Đây chỉ là chốt an toàn cho đúng nút Xóa.
    if (mode !== 'tra') {
        const linkedReturn = salesStore.find(item =>
            String(item?.mode || '').toLowerCase() === 'tra' &&
            String(item?.originalTransactionId || '') === invoiceId
        );
        if (linkedReturn) {
            return alert(`⚠️ Hóa đơn ${invoiceId} đã có phiếu trả hàng ${linkedReturn.id || ''}.\nKhông thể xóa hóa đơn gốc trước phiếu trả hàng.`);
        }
    }

    const amountText = formatVND(Math.abs(numberValue(tx.totalPay)));
    const ok = confirm(
        `🗑 XÓA HÓA ĐƠN SAI ${invoiceId}?\n\n` +
        `Số tiền: ${amountText}\n` +
        `Hóa đơn sẽ bị xóa khỏi sales_db.json và KHÔNG còn tính vào doanh thu/báo cáo.\n` +
        (mode === 'tra'
            ? `Hàng của phiếu trả này sẽ chuyển lại về trạng thái \"Đã bán\" nếu hiện đang \"Đã trả (Chờ XL)\".\n`
            : `Mã SP của hóa đơn sẽ chuyển lại về \"Đang bán\" nếu hiện đang \"Đã bán\".\n`) +
        `\nHệ thống sẽ hoàn tác đồng bộ Web/điểm/bảo hành trước, rồi mới bỏ hóa đơn khỏi doanh thu POS.\nLịch sử hoàn tác được giữ trong sales_void_log.json.\n\nBạn chắc chắn muốn hủy hóa đơn sai?`
    );
    if (!ok) return;

    const inventoryRefs = normalizeStoredSaleLines(tx);

    // Chốt đồng bộ trước khi bỏ hóa đơn local để tránh POS/Web/CRM lệch nhau.
    const loyaltyFlush = await syncN10LoyaltyToWebsite('before-void');
    if (loyaltyFlush && loyaltyFlush.success === false && !loyaltyFlush.skipped) {
        return alert(`⚠️ Chưa thể hủy hóa đơn vì điểm/CRM chưa đồng bộ được.\n${loyaltyFlush.message || 'Không rõ lỗi'}\n\nPOS chưa xóa gì.`);
    }
    const remoteVoid = await syncKblTransactionEventNow('void', tx);
    if (!remoteVoid || !remoteVoid.success) {
        return alert(`⚠️ Chưa thể hủy hóa đơn vì Website chưa xác nhận hoàn tác.\n${remoteVoid && remoteVoid.message || 'Không rõ lỗi'}\n\nPOS chưa xóa gì; dữ liệu vẫn nguyên.`);
    }
    dropKblTransactionEventsForInvoice(invoiceId);
    appendSalesVoidAudit(tx, 'Hóa đơn sai / chủ tiệm hủy');
    salesStore.splice(index, 1);
    saveDBFile('sales_db.json', salesStore);
    if (['doi', 'doikbl'].includes(mode)) {
        const linkedPurchase = dataStoreRecords.find(record =>
            String(record?.id || '') === String(tx.exchangePurchaseRecordId || tx.exchangePurchaseDocId || '') ||
            (tx.transactionGroupId && String(record?.transactionGroupId || '') === String(tx.transactionGroupId))
        );
        if (linkedPurchase) {
            linkedPurchase.linkedSaleId = '';
            linkedPurchase.exchangeLinkStatus = 'PHIEU_BAN_DA_HUY';
            linkedPurchase.linkedUpdatedAt = new Date().toISOString();
            saveDBFile('database.db', dataStoreRecords);
            compileBuyTable();
        }
    }

    let inventoryChanged = false;
    inventoryRefs.forEach(ref => {
        const item = findInventoryBySaleLine(ref);
        if (!item) return;

        if (mode === 'tra') {
            if (item.status === 'Đã trả (Chờ XL)') {
                item.status = 'Đã bán';
                inventoryChanged = true;
            }
        } else if (item.status === 'Đã bán') {
            item.status = 'Đang bán';
            inventoryChanged = true;
        }
    });

    if (inventoryChanged) {
        saveDBFile('inventory_db.json', inventoryStore);
        if (typeof renderInventoryTable === 'function') renderInventoryTable();
    }

    if (currentInvoiceHistoryId === invoiceId) {
        currentInvoiceHistoryId = '';
        const preview = getEl('invoice-preview');
        if (preview) preview.innerHTML = '<div class="invoice-paper" style="color:#888; text-align:center; padding-top:35mm;">Hóa đơn đã được xóa</div>';
    }

    if (editingSalesInvoiceId === invoiceId) cancelSalesInvoiceEdit();

    renderSalesInvoiceHistory();
    if (typeof renderSupplierInvoiceTable === 'function') renderSupplierInvoiceTable();
    generateReports();

    alert(`✅ Đã xóa hóa đơn ${invoiceId}.\nHóa đơn không còn nằm trong doanh thu/báo cáo POS.`);
}

function viewSalesInvoice(id) {
    const tx = salesStore.find(item => String(item.id || '') === String(id || ''));
    if (!tx) return alert('Không tìm thấy hóa đơn trong sales_db.json.');
    currentInvoiceHistoryId = String(tx.id || '');
    renderStoredSalesInvoice(tx);
    renderSalesInvoiceHistory();
    const preview = getEl('invoice-preview');
    if (preview) preview.scrollIntoView({ behavior:'smooth', block:'start' });
    return tx;
}

async function printSalesInvoiceById(id) {
    const tx = viewSalesInvoice(id);
    if (!tx) return;
    if (String(tx.mode || '').toLowerCase() !== 'tra') {
        try {
            const savedWarranty = tx.warrantySnapshot && Array.isArray(tx.warrantySnapshot.warranties)
                ? { success:true, warranties:tx.warrantySnapshot.warranties }
                : null;
            const warrantyResult = savedWarranty || await syncN10WarrantyForTransaction(tx);
            await attachWarrantyQrToInvoicePreview(warrantyResult, tx.id);
            if (!savedWarranty) persistSalesWarrantySnapshot(tx, warrantyResult);
        } catch (_) {}
    }
    const result = await printInternalInvoice(tx);
    if (result?.success) alert(`✅ Đã gửi hóa đơn ${tx.id} tới máy in hóa đơn.`);
    else alert(`⚠️ Chưa in được hóa đơn ${tx.id}: ${result?.failureReason || 'Không rõ lỗi.'}`);
}

async function printCurrentSalesInvoice() {
    if (!currentInvoiceHistoryId) return alert('Hãy chọn một hóa đơn đã lưu trong LỊCH SỬ HÓA ĐƠN rồi bấm In. Hóa đơn chưa chốt không in từ nút này.');
    return printSalesInvoiceById(currentInvoiceHistoryId);
}

function invoiceDateTimeLocalValue(value) {
    const d = new Date(value || Date.now());
    if (!Number.isFinite(d.getTime())) return '';
    const pad = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startEditSalesInvoice(id) {
    const tx = salesStore.find(item => String(item.id || '') === String(id || ''));
    if (!tx) return alert('Không tìm thấy hóa đơn để sửa.');
    editingSalesInvoiceId = String(tx.id || '');
    if (getEl('sales-edit-invoice-id')) getEl('sales-edit-invoice-id').innerText = editingSalesInvoiceId;
    if (getEl('sales-edit-date')) getEl('sales-edit-date').value = invoiceDateTimeLocalValue(tx.dateRaw);
    if (getEl('sales-edit-name')) getEl('sales-edit-name').value = tx.cusName || '';
    if (getEl('sales-edit-phone')) getEl('sales-edit-phone').value = tx.cusPhone || '';
    if (getEl('sales-edit-cccd')) getEl('sales-edit-cccd').value = tx.cusCccd || '';
    if (getEl('sales-edit-address')) getEl('sales-edit-address').value = tx.cusAddress || '';
    if (getEl('sales-edit-note')) getEl('sales-edit-note').value = tx.note || '';
    const panel = getEl('sales-invoice-edit-panel');
    if (panel) { panel.style.display = 'block'; panel.scrollIntoView({ behavior:'smooth', block:'center' }); }
    viewSalesInvoice(id);
}

function cancelSalesInvoiceEdit() {
    editingSalesInvoiceId = '';
    const panel = getEl('sales-invoice-edit-panel');
    if (panel) panel.style.display = 'none';
}

function saveSalesInvoiceEdit() {
    if (!editingSalesInvoiceId) return alert('Chưa chọn hóa đơn cần sửa.');
    const index = salesStore.findIndex(item => String(item.id || '') === editingSalesInvoiceId);
    if (index < 0) return alert('Không tìm thấy hóa đơn cần sửa.');
    const prior = salesStore[index];
    const rawDate = getEl('sales-edit-date')?.value || '';
    const parsedDate = rawDate ? new Date(rawDate) : new Date(prior.dateRaw || Date.now());
    const history = Array.isArray(prior.editHistory) ? prior.editHistory.slice(-49) : [];
    history.push({
        editedAt:new Date().toISOString(),
        snapshot:{ dateRaw:prior.dateRaw || '', cusName:prior.cusName || '', cusPhone:prior.cusPhone || '', cusCccd:prior.cusCccd || '', cusAddress:prior.cusAddress || '', note:prior.note || '' }
    });
    salesStore[index] = {
        ...prior,
        dateRaw:Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : prior.dateRaw,
        cusName:getEl('sales-edit-name')?.value.trim() || 'Khách lẻ',
        cusPhone:getEl('sales-edit-phone')?.value.trim() || '',
        cusCccd:getEl('sales-edit-cccd')?.value.trim() || '',
        cusAddress:getEl('sales-edit-address')?.value.trim() || '',
        note:getEl('sales-edit-note')?.value.trim() || '',
        editHistory:history,
        lastEditedAt:new Date().toISOString()
    };
    salesStore.sort((a,b) => new Date(b.dateRaw || 0) - new Date(a.dateRaw || 0));
    saveDBFile('sales_db.json', salesStore);
    const savedId = editingSalesInvoiceId;
    cancelSalesInvoiceEdit();
    renderSalesInvoiceHistory();
    viewSalesInvoice(savedId);
    generateReports();
    alert(`✅ Đã cập nhật thông tin hóa đơn ${savedId}.\\nMã SP, thành tiền và giá vốn không bị thay đổi.`);
}

async function printInternalInvoice(tx) {
    const preview = getEl('invoice-preview');
    if (!preview || !preview.innerHTML) return { success: false, failureReason: 'Chưa có nội dung hóa đơn.' };
    const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><style>
        /* HOTFIX 30/08/2026 — KHÓA HÓA ĐƠN TRONG ĐÚNG 1 TRANG A5.
           Trang in là khung cố định 148 x 210 mm; nội dung được thu gọn nhẹ và nếu vẫn cao hơn trang,
           script bên dưới tự scale vừa khung trước khi Electron gửi lệnh in. */
        @page{margin:0}
        *{box-sizing:border-box}
        html,body{margin:0!important;padding:0!important;background:#fff;color:#111827;font-family:Arial,Helvetica,sans-serif;width:148mm!important;height:210mm!important;max-height:210mm!important;overflow:hidden!important}
        #kbl-a5-print-page{position:relative!important;width:148mm!important;height:210mm!important;max-height:210mm!important;margin:0!important;padding:0!important;overflow:hidden!important;page-break-after:avoid!important;break-after:avoid-page!important}
        #kbl-a5-print-page>.invoice-paper{position:absolute!important;left:0!important;top:0!important;width:148mm!important;max-width:148mm!important;min-height:0!important;height:auto!important;margin:0!important;padding:4.5mm 6mm 3.5mm!important;background:#fff;font-size:9.6px;line-height:1.22;transform-origin:top left!important;box-shadow:none!important}.owner-only{display:none!important}
        .invoice-head{display:flex;justify-content:space-between;gap:6mm;border-bottom:1.2px solid #0f2747;padding-bottom:2mm}
        .invoice-shop-name{font-size:13px;font-weight:800;color:#0f2747}
        .invoice-shop-meta,.invoice-customer-meta{font-size:8.2px;color:#334155;line-height:1.18}
        .invoice-title{text-align:center;font-size:14px;font-weight:800;color:#0f2747;margin:3mm 0 .6mm}
        .invoice-subtitle{text-align:center;color:#64748b;font-size:8px;margin-bottom:2.5mm}
        .invoice-table{width:100%;border-collapse:collapse;margin-top:2mm;table-layout:fixed;break-inside:avoid-page!important;page-break-inside:avoid!important}
        .invoice-table th,.invoice-table td{border:1px solid #94a3b8;padding:1.05mm .9mm;vertical-align:top;overflow-wrap:anywhere;word-break:normal;font-size:8.5px;line-height:1.16}
        .invoice-table th{background:#e8eef6;color:#0f2747;text-align:center;font-weight:700}
        .invoice-table td.num{text-align:right;white-space:nowrap;overflow-wrap:normal}
        .invoice-section-title{margin-top:2.5mm;padding:1mm 1.5mm;background:#e8eef6;color:#0f2747;font-weight:800}
        .invoice-summary-lines{margin-top:2mm;padding:1.2mm 0;border-top:1px dashed #94a3b8}
        .invoice-total{margin-top:2.5mm;padding-top:2mm;border-top:1.2px solid #0f2747;text-align:right;font-size:13px;font-weight:800;color:#0f2747;break-inside:avoid-page!important}
        .invoice-note{margin-top:3mm;padding-top:1.5mm;border-top:1px dashed #94a3b8;font-size:8px;color:#475569}
        .invoice-customer-notice{margin-top:3mm!important;padding:1.7mm 2mm!important;border:1px solid #d3a72c;background:#fffdf1;color:#374151;font-size:7.6px!important;line-height:1.2!important;break-inside:avoid-page!important;page-break-inside:avoid!important}
        .invoice-customer-notice-title{color:#8a5a00;font-weight:800;font-size:8.5px!important;margin-bottom:.7mm!important}
        .invoice-customer-notice ul{margin:.7mm 0 0!important;padding-left:3.5mm!important}
        .invoice-customer-notice li{margin:.35mm 0!important}
        .invoice-warranty-zone{margin-top:3mm!important;padding:1.6mm 2mm!important;font-size:7.6px!important;line-height:1.16!important;break-inside:avoid-page!important;page-break-inside:avoid!important}
        .invoice-warranty-zone>div:first-child{margin-bottom:1mm!important;font-size:8.3px!important}
        .invoice-warranty-qr-grid{gap:1.6mm!important}
        .invoice-warranty-qr-grid>div{gap:1.2mm!important;min-width:38mm!important;padding:.8mm!important}
        .invoice-warranty-qr-grid>div>div:first-child{width:17mm!important;height:17mm!important;flex-basis:17mm!important}
        .invoice-warranty-qr-grid img,.invoice-warranty-qr-grid canvas{width:17mm!important;height:17mm!important}
        .invoice-signatures{display:flex;justify-content:space-between;gap:8mm;margin-top:5mm!important;text-align:center;font-weight:700;font-size:8.5px;break-inside:avoid-page!important;page-break-inside:avoid!important}
        .invoice-signatures>div{flex:1;min-height:11mm!important}.invoice-signatures small{font-weight:400;font-style:italic;font-size:7.4px}
        p{margin:.6mm 0}
    </style></head><body><div id="kbl-a5-print-page">${preview.innerHTML}</div><script>
        (function(){
            function fitA5(){
                var page=document.getElementById('kbl-a5-print-page');
                var paper=page&&page.querySelector('.invoice-paper');
                if(!page||!paper)return;
                paper.style.transform='none';
                var maxH=Math.max(1,page.clientHeight-2);
                var maxW=Math.max(1,page.clientWidth-2);
                var naturalH=Math.max(1,paper.scrollHeight);
                var naturalW=Math.max(1,paper.scrollWidth);
                var scale=Math.min(1,maxH/naturalH,maxW/naturalW);
                if(scale<0.999){
                    scale=Math.max(0.60,scale*0.995);
                    paper.style.transform='scale('+scale+')';
                }
            }
            if(document.readyState==='complete')fitA5();
            else window.addEventListener('load',function(){fitA5();setTimeout(fitA5,30);},{once:true});
        })();
    <\/script></body></html>`;
    try {
        return await ipcRenderer.invoke('gold:print-document', {
            html,
            deviceName: '',
            widthMm: 148,
            heightMm: 210,
            showDialog: true,
            paperSize: 'A5'
        });
    } catch (error) {
        return { success: false, failureReason: error?.message || String(error) };
    }
}

async function processTransaction() {
    if (currentSellMode === 'ban') {
        if (!salesCart.length) return alert('Giỏ hàng đang trống. Hãy chọn món và bấm THÊM MÓN VÀO GIỎ.');
        const customer = invoiceCustomerSnapshot();
        const tx = {
            id: "HD-" + Date.now().toString().slice(-6),
            dateRaw: new Date().toISOString(),
            mode: 'ban',
            inventoryUid: salesCart[0].inventoryUid || '',
            inventoryUids: salesCart.map(item => item.inventoryUid || '').filter(Boolean),
            originalInvCode: salesCart[0].originalInvCode || salesCart[0].invCode,
            originalInvCodes: salesCart.map(item => item.originalInvCode || item.invCode),
            invCode: salesCart[0].invCode,
            invCodes: salesCart.map(item => item.invCode),
            itemName: salesCart.map(item => item.itemName).join('; '),
            type: Array.from(new Set(salesCart.map(item => item.type))).join(', '),
            weightLy: salesCart.reduce((sum, item) => sum + numberValue(item.weightLy), 0),
            itemCount: salesCart.length,
            items: salesCart.map(item => ({ ...item })),
            ...customer,
            totalPay: saleCartTotal(),
            profit: saleCartProfit()
        };

        salesStore.unshift(tx);
        saveDBFile('sales_db.json', salesStore);
        salesCart.forEach(cartItem => {
            const target = findInventoryBySaleLine(cartItem);
            if (target) target.status = "Đã bán";
        });
        saveDBFile('inventory_db.json', inventoryStore);
        renderInventoryTable();
        queueKblTransactionEvent('sale', tx);
        flushKblTransactionEventQueue('sale').catch(()=>{});
        renderInvoicePreview(tx.totalPay);
        const warrantyResult = await syncN10WarrantyForTransaction(tx);
        await attachWarrantyQrToInvoicePreview(warrantyResult, tx.id);
        persistSalesWarrantySnapshot(tx, warrantyResult);
        const printResult = await printInternalInvoice(tx);
        alert(`✅ GIAO DỊCH THÀNH CÔNG!\nĐã chốt hóa đơn: ${tx.id} (${tx.itemCount} món)${printResult?.success ? '\nĐã gửi phiếu nội bộ tới máy in.' : `\n⚠️ Chưa in được phiếu: ${printResult?.failureReason || 'Không rõ lỗi.'}`}`);
        clearSalesCart();
        setSellMode('ban');
        viewSalesInvoice(tx.id);
        generateReports();
        return;
    }

    if (currentSellMode === 'doi' || currentSellMode === 'doikbl') {
        const newItems = getExchangeNewItems();
        const oldItems = getExchangeOldItems();
        if (!newItems.length) return alert('Hãy chọn ít nhất một món mới và bấm thêm vào giỏ.');
        if (!oldItems.length) return alert('Hãy nhập ít nhất một món vàng cũ rồi bấm thêm vào giỏ vàng cũ.');
        if (currentSellMode === 'doikbl' && !smartExchange610Eligible(newItems, oldItems)) {
            return alert('Đổi Ngang KBL hiện áp dụng 610 → 610. Vàng khác loại/ngoài chính sách hãy dùng tab Đổi Vàng Bù.');
        }
        const exchangeDiscount = currentSellMode === 'doikbl' ? 0 : numberValue(getEl('s-discount')?.value);
        const calculation = currentSellMode === 'doikbl'
            ? calculateSmart610ExchangeSettlement(newItems, oldItems, 0)
            : calculateExchangeSettlement(newItems, oldItems, exchangeDiscount);
        calcSellMath();
        const customer = invoiceCustomerSnapshot();
        const linkedPurchase = kblEnsureLinkedExchangePurchase(currentSellMode, oldItems);
        const linkCheck = kblValidateActiveExchangeLink(currentSellMode, oldItems);
        if (!linkCheck.ok) return alert(`⚠️ ${linkCheck.message}`);
        const verifiedLinkedPurchase = linkCheck.record || linkedPurchase;
        const finalizedLinkedPurchase = kblFinalizeExchangePurchaseDocument(
            currentSellMode,
            verifiedLinkedPurchase,
            calculation,
            newItems,
            oldItems,
            exchangeDiscount
        ) || verifiedLinkedPurchase;
        const linkedPurchaseGross = Math.round(numberValue(finalizedLinkedPurchase?.totalMoney != null ? finalizedLinkedPurchase.totalMoney : finalizedLinkedPurchase?.money));
        const tx = {
            id: "HD-" + Date.now().toString().slice(-6),
            dateRaw: new Date().toISOString(),
            mode: currentSellMode,
            inventoryUid: newItems[0].inventoryUid || '',
            inventoryUids: newItems.map(item => item.inventoryUid || '').filter(Boolean),
            originalInvCode: newItems[0].originalInvCode || newItems[0].invCode,
            originalInvCodes: newItems.map(item => item.originalInvCode || item.invCode),
            invCode: newItems[0].invCode,
            invCodes: newItems.map(item => item.invCode),
            itemName: newItems.map(item => item.itemName).join('; '),
            type: Array.from(new Set(newItems.map(item => item.type))).join(', '),
            weightLy: newItems.reduce((sum, item) => sum + numberValue(item.weightLy), 0),
            itemCount: newItems.length,
            items: newItems.map(item => ({ ...item })),
            oldItems: oldItems.map(item => ({ ...item })),
            oldWeightLy: numberValue(calculation.oldWeight),
            oldValue: numberValue(calculation.oldGoldValue),
            exchangePurchaseGross: linkedPurchaseGross,
            transactionGroupId: String(activeExchangeLinkDraft?.transactionGroupId || finalizedLinkedPurchase?.transactionGroupId || verifiedLinkedPurchase?.transactionGroupId || ''),
            exchangePurchaseDocId: String(finalizedLinkedPurchase?.id || verifiedLinkedPurchase?.id || ''),
            exchangePurchaseRecordId: String(finalizedLinkedPurchase?.id || verifiedLinkedPurchase?.id || ''),
            exchangeFee: numberValue(calculation.specialFee),
            goldCompensation: calculation.smart610 ? numberValue(calculation.customerFormula?.goldDifferenceAmount) : numberValue(calculation.exchangeAdjustment),
            exchangeRefund: numberValue(calculation.refundAdjustment),
            exchangeRules: calculation.ruleLines || [],
            smartExchange: calculation.smart610 ? { customerFormula: calculation.customerFormula, internal: calculation.internal } : null,
            ...customer,
            totalPay: numberValue(calculation.totalPay),
            profit: numberValue(calculation.profit ?? calculation.internal?.profit)
        };
        // Chỉ gắn snapshot hồ sơ sau khi engine đã tính xong.
        // KBL 27/09/2026: phí Đổi Bù cùng loại 610/980 tính trên TOÀN BỘ vàng cũ.
        // Cũ dư × giá mua vào Cài đặt; mới thiếu × giá bán ra; các nhánh khác giữ nguyên.
        attachExchangeDossierSnapshot(
            tx,
            calculation,
            newItems,
            oldItems,
            exchangeDiscount
        );
        salesStore.unshift(tx);
        saveDBFile('sales_db.json', salesStore);
        if (verifiedLinkedPurchase) {
            const pIndex = dataStoreRecords.findIndex(record => String(record?.id || '') === String(verifiedLinkedPurchase.id || ''));
            if (pIndex >= 0) {
                dataStoreRecords[pIndex] = {
                    ...dataStoreRecords[pIndex],
                    transactionGroupId: String(tx.transactionGroupId || ''),
                    exchangeMode: String(tx.mode || ''),
                    linkedSaleId: String(tx.id || ''),
                    exchangeLinkStatus: 'DA_HOAN_TAT',
                    exchangePurchasePolicy: String(dataStoreRecords[pIndex]?.exchangePurchasePolicy || finalizedLinkedPurchase?.exchangePurchasePolicy || 'ACTUAL_PURCHASE_RECORD'),
                    linkedUpdatedAt: new Date().toISOString()
                };
                saveDBFile('database.db', dataStoreRecords);
                compileBuyTable();
            }
        }
        newItems.forEach(item => {
            const target = findInventoryBySaleLine(item);
            if (target) target.status = 'Đã bán';
        });
        saveDBFile('inventory_db.json', inventoryStore);
        renderInventoryTable();
        queueKblTransactionEvent('sale', tx);
        flushKblTransactionEventQueue('exchange-sale').catch(()=>{});
        renderSupplierInvoiceTable();
        renderInvoicePreview(tx.totalPay);
        const warrantyResult = await syncN10WarrantyForTransaction(tx);
        await attachWarrantyQrToInvoicePreview(warrantyResult, tx.id);
        persistSalesWarrantySnapshot(tx, warrantyResult);
        const printResult = await printInternalInvoice(tx);
        alert(`✅ ${currentSellMode === 'doikbl' ? 'ĐỔI NGANG KBL' : 'ĐỔI VÀNG BÙ'} THÀNH CÔNG!\n${tx.totalPay >= 0 ? 'Khách phải trả' : 'Khách được dư'}: ${formatVND(Math.abs(tx.totalPay))}${printResult?.success ? '\nĐã gửi phiếu nội bộ tới máy in.' : `\n⚠️ Chưa in được phiếu: ${printResult?.failureReason || 'Không rõ lỗi.'}`}\n\nHồ sơ Thu Mua ${verifiedLinkedPurchase?.id || ''} và phiếu bán ${tx.id} đã nối cùng mã ${tx.transactionGroupId}.`);
        const completedMode = currentSellMode;
        activeOffsetSaleId = String(tx.id || '');
        activeExchangeLinkDraft = null;
        renderExchangeLinkWorkflow();
        setSellMode(completedMode);
        generateReports();
        switchTab('tab-doichieu');
        refreshOffsetSaleOptions();
        const offsetSelect = getEl('offset-sale-select');
        if (offsetSelect) offsetSelect.value = activeOffsetSaleId;
        onOffsetSaleChanged();
        return;
    }

    if (currentSellMode === 'tra') {
        if (!returnCart.length) return alert('Hãy tìm hóa đơn và bấm THÊM vào giỏ hàng trả lại trước.');
        const refund = returnCart.reduce((sum, item) => sum + numberValue(item.refundAmount), 0);
        const customer = invoiceCustomerSnapshot();
        const codes = Array.from(new Set(returnCart.map(item => item.invCode).filter(Boolean)));
        if (!confirm(`Xác nhận hoàn ${formatVND(refund)} cho ${returnCart.length} món trong hóa đơn [${returnCart[0].originalTransactionId || '---'}]?`)) return;

        returnCart.forEach(line => {
            const target = findInventoryBySaleLine(line);
            if (target) target.status = 'Đã trả (Chờ XL)';
        });
        saveDBFile('inventory_db.json', inventoryStore);
        renderInventoryTable();

        const retTx = {
            id: 'RET-' + Date.now().toString().slice(-6),
            dateRaw: new Date().toISOString(),
            mode: 'tra',
            inventoryUid: returnCart[0].inventoryUid || '',
            inventoryUids: returnCart.map(item => item.inventoryUid || '').filter(Boolean),
            originalInvCode: returnCart[0].originalInvCode || returnCart[0].invCode,
            originalInvCodes: returnCart.map(item => item.originalInvCode || item.invCode),
            invCode: returnCart[0].invCode,
            invCodes: codes,
            itemName: returnCart.map(item => item.itemName).join('; '),
            type: Array.from(new Set(returnCart.map(item => item.type).filter(Boolean))).join(', '),
            weightLy: returnCart.reduce((sum, item) => sum + numberValue(item.weightLy), 0),
            itemCount: returnCart.length,
            totalPay: -refund,
            profit: -returnCart.reduce((sum, item) => sum + numberValue(item.profit), 0),
            ...customer,
            originalTransactionId: returnCart[0].originalTransactionId || '',
            items: returnCart.map(item => ({ ...item, totalPay: numberValue(item.totalPay) || numberValue(item.refundAmount) }))
        };
        salesStore.unshift(retTx);
        saveDBFile('sales_db.json', salesStore);
        queueKblTransactionEvent('return', retTx);
        flushKblTransactionEventQueue('return').catch(()=>{});
        renderReturnCartInvoicePreview();
        const printResult = await printInternalInvoice(retTx);
        alert(`✅ Xử lý TRẢ HÀNG hoàn tất. Đã hoàn ${formatVND(refund)} cho ${retTx.itemCount} món.${printResult?.success ? '\nĐã gửi phiếu trả hàng tới máy in.' : `\n⚠️ Chưa in được phiếu: ${printResult?.failureReason || 'Không rõ lỗi.'}`}`);
        setSellMode('tra');
        viewSalesInvoice(retTx.id);
        generateReports();
        return;
    }

    if (!currentSelectedInvItem) return alert("Chưa chọn Sản Phẩm từ kho!");
    const totalPay = lastSaleNetAmount;
    const customer = invoiceCustomerSnapshot();
    const tx = {
        id: "HD-" + Date.now().toString().slice(-6), 
        dateRaw: new Date().toISOString(), 
        mode: currentSellMode, 
        inventoryUid: currentSelectedInvItem.inventoryUid || '',
        originalInvCode: currentSelectedInvItem.code || '',
        invCode: currentSelectedInvItem.code, 
        itemName: currentSelectedInvItem.name, 
        type: currentSelectedInvItem.type, 
        weightLy: currentSelectedInvItem.weightLy, 
        ...customer,
        totalPay: totalPay, 
        profit: parseFloat(getEl('s-profit').value) || 0
    };

    salesStore.unshift(tx);
    saveDBFile('sales_db.json', salesStore);
    
    let idx = inventoryStore.findIndex(i => i.code === currentSelectedInvItem.code);
    if (idx !== -1) { 
        inventoryStore[idx].status = "Đã bán"; 
        saveDBFile('inventory_db.json', inventoryStore); 
        renderInventoryTable(); 
    }
    queueKblTransactionEvent('sale', tx);
    flushKblTransactionEventQueue('sale').catch(()=>{});

    const printResult = await printInternalInvoice(tx);
    alert(`✅ GIAO DỊCH THÀNH CÔNG!\nĐã chốt hóa đơn: ${tx.id}${printResult?.success ? '\nĐã gửi phiếu nội bộ tới máy in.' : `\n⚠️ Chưa in được phiếu: ${printResult?.failureReason || 'Không rõ lỗi.'}`}`);
    setSellMode(currentSellMode);
    viewSalesInvoice(tx.id);
    generateReports();
}

function renderReturnInvoicePreview(sale, codes, itemNames) {
    const preview = getEl('invoice-preview');
    if (!preview) return;

    const customer = {
        cusName: sale.cusName || 'Khách lẻ',
        cusPhone: sale.cusPhone || '',
        cusCccd: sale.cusCccd || '',
        cusAddress: sale.cusAddress || ''
    };
    const items = Array.isArray(sale.items) && sale.items.length
        ? sale.items
        : [{
            itemName: itemNames || 'Sản phẩm trả lại',
            invCode: sale.invCode || '',
            weightLy: sale.weightLy || 0,
            totalPay: sale.totalPay || 0,
            type: sale.type || '',
            priceSell: 0,
            wage: 0
        }];
    const refund = Math.abs(numberValue(sale.totalPay));
    const body = `<div class="invoice-section-title">CHI TIẾT HÀNG TRẢ</div>
        ${invoiceSalesTable(items)}
        <div class="invoice-summary-lines">Hóa đơn gốc: <b>${escapeHtml(sale.id || '')}</b><br>Lý do: Khách trả lại hàng theo giao dịch nội bộ.</div>`;
    preview.innerHTML = invoicePaperHtml({
        title: 'PHIẾU TRẢ HÀNG',
        subtitle: 'Hoàn tiền theo hóa đơn bán lẻ nội bộ',
        customer,
        body,
        totalLabel: 'TỔNG HOÀN KHÁCH',
        totalValue: refund,
        noticeHtml: invoiceNoticeHtml({ noticeType: 'return' })
    });
}

function renderReturnCartInvoicePreview() {
    const preview = getEl('invoice-preview');
    if (!preview) return;
    if (!returnCart.length) {
        preview.innerHTML = '<div class="invoice-paper" style="color:#64748b;text-align:center;padding-top:35mm;">Tìm hóa đơn rồi bấm thêm vào giỏ trả hàng</div>';
        return;
    }
    const saleId = returnCart[0].originalTransactionId || '';
    const refund = returnCart.reduce((sum, item) => sum + numberValue(item.refundAmount), 0);
    const body = `<div class="invoice-section-title">CHI TIẾT HÀNG TRẢ</div>
        ${invoiceSalesTable(returnCart)}
        <div class="invoice-summary-lines">Hóa đơn gốc: <b>${escapeHtml(saleId)}</b><br>Lý do: Khách trả lại hàng theo giao dịch nội bộ.</div>`;
    preview.innerHTML = invoicePaperHtml({
        title: 'PHIẾU TRẢ HÀNG',
        subtitle: 'Hoàn tiền theo hóa đơn bán lẻ nội bộ',
        customer: invoiceCustomerSnapshot(),
        body,
        totalLabel: 'TỔNG HOÀN KHÁCH',
        totalValue: refund,
        noticeHtml: invoiceNoticeHtml({ noticeType: 'return' })
    });
}

async function selectSaleForReturn(id) {
    // Tên cũ vẫn được giữ để không làm hỏng dữ liệu/đường dẫn gọi cũ.
    addSaleToReturnCart(id);
}

// =================================================================
// 8. TAB 4: BÁO CÁO & TAB 5: CÀI ĐẶT
// =================================================================
function applySettingsToUI() {
    ['9999', '980', '750', '610', '585', '416'].forEach(t => {
        if (getEl(`cfg-buy-${t}`)) getEl(`cfg-buy-${t}`).value = settingsStore[`price_buy_${t}`] || 0;
        if (getEl(`cfg-sell-${t}`)) getEl(`cfg-sell-${t}`).value = settingsStore[`price_sell_${t}`] || 0;
        if (getEl(`cfg-spread-${t}`)) {
            const raw = settingsStore[`spread_${t}`];
            const fallback = Number(settingsStore[`price_sell_${t}`]) - Number(settingsStore[`price_buy_${t}`]);
            getEl(`cfg-spread-${t}`).value = raw !== undefined ? raw : Math.max(0, fallback);
        }
    });
    if (getEl('cfg-exchange-fee-980')) getEl('cfg-exchange-fee-980').value = settingsStore.exchange_fee_980_980 ?? 120000;
    if (getEl('cfg-exchange-fee-610')) getEl('cfg-exchange-fee-610').value = settingsStore.exchange_fee_610_610 ?? settingsStore.default_exchange_fee ?? 400000;
    if (getEl('cfg-exchange-old-purity-610')) getEl('cfg-exchange-old-purity-610').value = smartClampPurity(settingsStore.exchange_old_purity_610, 61);
    if (getEl('cfg-exchange-new-purity-610')) getEl('cfg-exchange-new-purity-610').value = smartClampPurity(settingsStore.exchange_new_purity_610_default, 63);
    if (getEl('cfg-profit-floor-base')) getEl('cfg-profit-floor-base').value = settingsStore.profit_floor_base ?? 100000;
    if (getEl('cfg-profit-floor-per-chi')) getEl('cfg-profit-floor-per-chi').value = settingsStore.profit_floor_per_chi ?? 75000;
    if (getEl('cfg-profit-round-step')) getEl('cfg-profit-round-step').value = settingsStore.profit_round_step ?? 50000;
    if (getEl('cfg-free-ship-reserve')) getEl('cfg-free-ship-reserve').value = settingsStore.free_ship_reserve_profit ?? 100000;
    if (getEl('cfg-exchange-refund-9999-610')) getEl('cfg-exchange-refund-9999-610').value = settingsStore.exchange_refund_9999_610 ?? 30000;
    if (getEl('cfg-api-key')) getEl('cfg-api-key').value = settingsStore.gemini_api_key || "";
    const savedLink = require('./kbl-connection.cjs').read();
    if (savedLink) { settingsStore.web_sync_url = savedLink.url; settingsStore.web_sync_token = savedLink.token; }
    if (getEl('cfg-web-sync-url')) getEl('cfg-web-sync-url').value = settingsStore.web_sync_url || 'https://tiemvangkimbaolam.id.vn';
    if (getEl('cfg-web-sync-token')) getEl('cfg-web-sync-token').value = settingsStore.web_sync_token || "";
    if (getEl('cfg-google-price-auto')) getEl('cfg-google-price-auto').checked = settingsStore.google_price_auto_enabled !== false;
    if (getEl('cfg-google-price-markup')) getEl('cfg-google-price-markup').value = normalizeGooglePriceMarkup(
        settingsStore.google_price_markup_vnd === undefined ? 100000 : settingsStore.google_price_markup_vnd
    );
    if (getEl('cfg-google-relay-url')) getEl('cfg-google-relay-url').value = String(settingsStore.google_price_relay_url || '').trim() || 'https://script.google.com/macros/s/AKfycbxTpmcPTF6kgUbraMyeaxR-uVIh9U7ePKXYfcSLZZeRJ6l5tk5vA4aau3VHMw9iGfZm/exec';
    if (getEl('cfg-google-relay-token')) getEl('cfg-google-relay-token').value = settingsStore.google_price_relay_token || '';
}

async function syncPricesToWebsite(showAlert = true) {
    try {
        const result = await ipcRenderer.invoke('sync-prices-to-web');
        if (!result || !result.success) {
            const message = result?.message || 'Chưa đồng bộ được website.';
            if (showAlert) alert(`⚠️ Giá đã lưu trong phần mềm, nhưng website chưa nhận.\n\n${message}\n\nVào Cài đặt & AI, nhập mã KBL_SYNC_TOKEN đúng với hosting rồi bấm LƯU và thử lại.`);
            return result || { success: false, message };
        }
        if (showAlert) alert('✅ Đã đồng bộ bảng giá mới lên website.');
        return result;
    } catch (error) {
        const result = { success: false, message: error?.message || String(error) };
        if (showAlert) alert(`⚠️ Không gọi được chức năng đồng bộ website: ${result.message}`);
        return result;
    }
}

async function saveSettings() {
    try { require('./kbl-connection.cjs').save({ url: getEl('cfg-web-sync-url')?.value, token: getEl('cfg-web-sync-token')?.value || '' }); }
    catch (error) { alert('Chưa lưu kết nối: ' + error.message); return; }
    const priceInput = { price_sell_9999: parseFloat(getEl('cfg-sell-9999')?.value) || 0 };
    ['9999', '980', '750', '610', '585', '416'].forEach(t => {
        const spreadEl = getEl(`cfg-spread-${t}`);
        if (spreadEl) priceInput[`spread_${t}`] = normalizeDesktopSpread(spreadEl.value);
    });
    Object.assign(settingsStore, deriveDesktopPrices({ ...settingsStore, ...priceInput }));
    settingsStore.exchange_fee_980_980 = parseFloat(getEl('cfg-exchange-fee-980')?.value) || 0;
    // Phí đổi 610 → 610 của Đổi Vàng Bù lấy từ ô Cài đặt & AI; Smart Exchange KBL vẫn tách riêng.
    settingsStore.exchange_fee_610_610 = parseFloat(getEl('cfg-exchange-fee-610')?.value) || 0;
    settingsStore.default_exchange_fee = settingsStore.exchange_fee_610_610;
    settingsStore.exchange_old_purity_610 = smartClampPurity(getEl('cfg-exchange-old-purity-610')?.value, 61);
    settingsStore.exchange_new_purity_610_default = smartClampPurity(getEl('cfg-exchange-new-purity-610')?.value, 63);
    settingsStore.profit_floor_base = Math.max(0, parseFloat(getEl('cfg-profit-floor-base')?.value) || 0);
    settingsStore.profit_floor_per_chi = Math.max(0, parseFloat(getEl('cfg-profit-floor-per-chi')?.value) || 0);
    settingsStore.profit_round_step = Math.max(1000, parseFloat(getEl('cfg-profit-round-step')?.value) || 50000);
    settingsStore.free_ship_reserve_profit = Math.max(0, parseFloat(getEl('cfg-free-ship-reserve')?.value) || 0);
    settingsStore.exchange_refund_9999_610 = parseFloat(getEl('cfg-exchange-refund-9999-610')?.value) || 0;
    settingsStore.gemini_api_key = getEl('cfg-api-key').value.trim();
    settingsStore.web_sync_url = getEl('cfg-web-sync-url')?.value.trim() || 'https://tiemvangkimbaolam.id.vn';
    settingsStore.web_sync_token = getEl('cfg-web-sync-token')?.value.trim() || '';
    settingsStore.google_price_auto_enabled = getEl('cfg-google-price-auto') ? Boolean(getEl('cfg-google-price-auto').checked) : true;
    settingsStore.google_price_markup_vnd = normalizeGooglePriceMarkup(
        getEl('cfg-google-price-markup') ? getEl('cfg-google-price-markup').value : settingsStore.google_price_markup_vnd
    );
    settingsStore.google_price_relay_url = (getEl('cfg-google-relay-url') ? String(getEl('cfg-google-relay-url').value || '').trim() : String(settingsStore.google_price_relay_url || '').trim()) || 'https://script.google.com/macros/s/AKfycbxTpmcPTF6kgUbraMyeaxR-uVIh9U7ePKXYfcSLZZeRJ6l5tk5vA4aau3VHMw9iGfZm/exec';
    settingsStore.google_price_relay_token = getEl('cfg-google-relay-token') ? String(getEl('cfg-google-relay-token').value || '').trim() : String(settingsStore.google_price_relay_token || '').trim();
    GEMINI_API_KEY = settingsStore.gemini_api_key;
    
    saveDBFile('settings.json', settingsStore);
    // KBL V6.5.5.1 SAFE: chỉ đồng bộ mức đổi bù 610 đang cấu hình tại thời điểm hiện tại; chủ tiệm có thể thay đổi khi giá vàng/điều kiện thay đổi.
    const prices = { ...deriveDesktopPrices(settingsStore), exchange_fee_980_980: settingsStore.exchange_fee_980_980, exchange_fee_610_610: settingsStore.exchange_fee_610_610 ?? settingsStore.default_exchange_fee ?? 400000, default_exchange_fee: settingsStore.exchange_fee_610_610 ?? settingsStore.default_exchange_fee ?? 400000, exchange_refund_9999_610: settingsStore.exchange_refund_9999_610, exchange_policy_version: 4 };
    // Không chờ mạng trước khi trả giao diện: lưu máy + TV trước, website đồng bộ nền.
    const syncTask = ipcRenderer.invoke('save-prices-and-sync', {
        prices,
        web_sync_url: settingsStore.web_sync_url,
        web_sync_token: settingsStore.web_sync_token
    });
    alert("✅ Đã cập nhật giá trong phần mềm và TV. Website đang đồng bộ nền.");
    syncTask.then((syncResult) => {
        if (!syncResult || !syncResult.success) {
            alert(`⚠️ Website chưa nhận giá: ${syncResult?.message || 'chưa rõ nguyên nhân'}\n\nKiểm tra mã KBL_SYNC_TOKEN trong Cài đặt & AI.`);
        }
    }).catch((error) => {
        alert(`⚠️ Website chưa nhận giá: ${error?.message || error}`);
    });
    // Nếu bật tự động, áp nguồn BK/ASK + mức cộng vừa lưu ngay sau đó.
    if (settingsStore.google_price_auto_enabled) {
        setTimeout(() => refreshGooglePriceNow(), 250);
    } else {
        loadGooglePriceStatus();
    }
}

async function showPriceBoardLinks() {
    const box = getEl('price-board-info');
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = '⏳ Đang lấy địa chỉ kết nối...';
    try {
        const info = await ipcRenderer.invoke('get-price-board-info');
        const tvUrl = String(info.tvUrl || '');
        const priceUrl = String(info.priceUrl || '');
        const allUrls = Array.isArray(info.allBaseUrls) ? info.allBaseUrls : [];
        const otherUrls = allUrls.length > 1
            ? '<div style="margin-top:6px; color:#64748b;">Các địa chỉ mạng khác:<br>' +
              allUrls.map((url) => String(url) + '/tv').join('<br>') + '</div>'
            : '';
        box.innerHTML =
            '<div style="font-size:12px; line-height:1.55;">' +
            '<b>📺 Mở trên TV:</b><br>' +
            '<span style="word-break:break-all; color:#0d6efd;">' + tvUrl + '</span>' +
            '<div id="price-tv-qr" style="margin:8px 0; display:flex; justify-content:center;"></div>' +
            '<b>📱 Trang chỉnh giá trên điện thoại:</b><br>' +
            '<span style="word-break:break-all; color:#0d6efd;">' + priceUrl + '</span>' +
            '<div id="price-mobile-qr" style="margin:8px 0; display:flex; justify-content:center;"></div>' +
            otherUrls +
            '</div>';
        if (typeof QRCode === 'function') {
            const tvQr = getEl('price-tv-qr');
            const mobileQr = getEl('price-mobile-qr');
            if (tvQr && tvUrl) new QRCode(tvQr, { text: tvUrl, width: 150, height: 150 });
            if (mobileQr && priceUrl) new QRCode(mobileQr, { text: priceUrl, width: 150, height: 150 });
        }
    } catch (error) {
        box.textContent = '❌ Không lấy được địa chỉ kết nối: ' + (error.message || error);
    }
}

function saleTransactionCost(sale) {
    if (sale && Array.isArray(sale.items) && sale.items.length) {
        return Math.round(sale.items.reduce((sum, item) => sum + inventoryEffectiveBookCost(item), 0));
    }
    if (sale && Array.isArray(sale.inventoryUids) && sale.inventoryUids.length) {
        return Math.round(sale.inventoryUids.reduce((sum, uid) => {
            const item = inventoryStore.find(inv => String(inv.inventoryUid || '') === String(uid || ''));
            return sum + inventoryEffectiveBookCost(item);
        }, 0));
    }
    if (sale && Array.isArray(sale.invCodes) && sale.invCodes.length) {
        return Math.round(sale.invCodes.reduce((sum, code) => {
            const item = inventoryStore.find(inv => String(inv.code || '') === String(code || ''));
            return sum + inventoryEffectiveBookCost(item);
        }, 0));
    }
    const invItem = sale ? (
        (sale.inventoryUid ? inventoryStore.find(item => String(item.inventoryUid || '') === String(sale.inventoryUid || '')) : null) ||
        inventoryStore.find(item => String(item.code || '') === String(sale.invCode || ''))
    ) : null;
    if (invItem) return inventoryEffectiveBookCost(invItem);
    return Math.max(0, numberValue(sale?.totalCost));
}

function saleTransactionOldGoldValue(sale) {
    const oldItems = Array.isArray(sale?.oldItems) ? sale.oldItems : [];
    if (oldItems.length) {
        return Math.round(oldItems.reduce((sum, item) => {
            const type = String(item.type || '').trim();
            const priceBuy = Math.max(0, numberValue(item.priceBuy) || numberValue(settingsStore[`price_buy_${type}`]));
            return sum + (numberValue(item.weightLy) / 100) * priceBuy;
        }, 0));
    }
    return Math.max(0, numberValue(sale?.oldValue));
}

function saleTransactionProfit(sale) {
    const mode = String(sale?.mode || 'ban').toLowerCase();
    if (mode === 'tra') return Math.round(numberValue(sale?.profit));
    const cost = saleTransactionCost(sale);
    const cash = numberValue(sale?.totalPay);
    if (mode === 'doi' || mode === 'doikbl') {
        return Math.round(saleTransactionOldGoldValue(sale) + cash - cost);
    }
    if (cost > 0) return Math.round(cash - cost);
    return Math.round(numberValue(sale?.profit));
}

function generateReports() {
    const fDate = new Date(getEl('rep-date-from').value).setHours(0,0,0,0);
    const tDate = new Date(getEl('rep-date-to').value).setHours(23,59,59,999);
    
    let totalBuy = 0; 
    dataStoreRecords.forEach(b => { 
        let ts = new Date(b.rawDate || 0).getTime(); 
        if (ts >= fDate && ts <= tDate) totalBuy += (b.money || 0); 
    });
    
    let totalSell = 0; 
    let totalProfit = 0; 
    let totalCostSold = 0;
    const tbody = getEl('rep-transactions-tbody'); 
    if (tbody) tbody.innerHTML = "";

    salesStore.forEach(s => {
        let ts = new Date(s.dateRaw || 0).getTime();
        if (ts >= fDate && ts <= tDate) {
            totalSell += numberValue(s.totalPay);
            const transactionCost = saleTransactionCost(s);
            const transactionProfit = saleTransactionProfit(s);
            totalProfit += transactionProfit;
            totalCostSold += s.mode !== 'tra' ? transactionCost : -transactionCost;

            if (tbody) {
                const tr = document.createElement('tr');
                let color = s.mode === 'tra' ? '#dc3545' : (s.mode === 'doikbl' ? '#087f74' : (s.mode === 'doi' ? '#fd7e14' : '#28a745'));
                let modeText = s.mode === 'ban' ? 'Bán Hàng' : (s.mode === 'doikbl' ? 'Đổi Ngang KBL' : (s.mode === 'doi' ? 'Đổi Bù' : 'Khách Trả'));
                tr.innerHTML = `
                    <td>${new Date(s.dateRaw).toLocaleDateString()}</td>
                    <td style="font-weight: bold;">${s.id}</td>
                    <td style="color: ${color}; font-weight: bold;">${modeText}</td>
                    <td>${s.weightLy} Ly</td>
                    <td style="color: #0b2240; font-weight: bold; font-size: 14px;">${formatVND(s.totalPay)}</td>
                    <td style="color: ${transactionProfit < 0 ? '#dc3545' : '#28a745'}; font-weight: bold;">${formatVND(transactionProfit)}</td>
                `;
                tbody.appendChild(tr);
            }
        }
    });

    if (getEl('rep-total-buy')) getEl('rep-total-buy').innerText = formatVND(totalBuy);
    if (getEl('rep-total-sell')) getEl('rep-total-sell').innerText = formatVND(totalSell);
    if (getEl('rep-total-cost')) getEl('rep-total-cost').innerText = formatVND(totalCostSold);
    if (getEl('rep-total-profit')) getEl('rep-total-profit').innerText = formatVND(totalProfit);

    let stockActive = 0; let ly9999 = 0; let ly610 = 0; let ly980 = 0; let stockSold = 0;
    inventoryStore.forEach(i => {
        if (i.status === 'Đang bán') { 
            stockActive++; 
            if (i.type === '9999') ly9999 += (i.weightLy || 0); 
            if (i.type === '610') ly610 += (i.weightLy || 0); 
            if (i.type === '980') ly980 += (i.weightLy || 0); 
        } else if (i.status === 'Đã bán') { 
            stockSold++; 
        }
    });

    if (getEl('rep-stock-active')) getEl('rep-stock-active').innerText = `${stockActive} SP`;
    if (getEl('rep-stock-sold')) getEl('rep-stock-sold').innerText = `${stockSold} SP`;
    if (getEl('rep-stock-9999')) getEl('rep-stock-9999').innerText = `${ly9999} Ly`;
    if (getEl('rep-stock-610')) getEl('rep-stock-610').innerText = `${ly610} Ly`;
    if (getEl('rep-stock-980')) getEl('rep-stock-980').innerText = `${ly980} Ly`;
}

// =================================================================
// KBL 29/09/2026 · CHỈ THÊM XUẤT EXCEL KẾ TOÁN TAB 1–2–3
// Chỉ ĐỌC dữ liệu đã có và tạo file .xlsx. Không ghi/sửa/xóa dữ liệu nghiệp vụ,
// không thay công thức Thu Mua / Bán Hàng / Đổi Bù / Đổi Ngang / Đối Chiếu.
// Không cần thư viện ngoài, không sửa package.json/package-lock/main.js.
// =================================================================
function kblExcelXmlEscape(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function kblExcelColumnName(index) {
    let n = Math.max(1, Number(index) || 1), name = '';
    while (n > 0) {
        n -= 1;
        name = String.fromCharCode(65 + (n % 26)) + name;
        n = Math.floor(n / 26);
    }
    return name;
}

function kblExcelSheetXml(rows) {
    const safeRows = Array.isArray(rows) && rows.length ? rows : [['Không có dữ liệu trong kỳ đã chọn']];
    const columnCount = Math.max(1, ...safeRows.map(row => Array.isArray(row) ? row.length : 0));
    const widths = [];
    for (let c = 0; c < columnCount; c += 1) {
        let max = 10;
        for (let r = 0; r < Math.min(safeRows.length, 250); r += 1) {
            const value = Array.isArray(safeRows[r]) ? safeRows[r][c] : '';
            max = Math.max(max, String(value === undefined || value === null ? '' : value).length + 2);
        }
        widths[c] = Math.max(10, Math.min(42, max));
    }
    const cols = widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('');
    const rowXml = safeRows.map((row, rIndex) => {
        const cells = (Array.isArray(row) ? row : [row]).map((value, cIndex) => {
            const ref = `${kblExcelColumnName(cIndex + 1)}${rIndex + 1}`;
            if (typeof value === 'number' && Number.isFinite(value)) {
                return `<c r="${ref}" s="2"><v>${value}</v></c>`;
            }
            const text = value === undefined || value === null ? '' : String(value);
            const style = rIndex === 0 ? ' s="1"' : '';
            const preserve = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : '';
            return `<c r="${ref}" t="inlineStr"${style}><is><t${preserve}>${kblExcelXmlEscape(text)}</t></is></c>`;
        }).join('');
        return `<row r="${rIndex + 1}">${cells}</row>`;
    }).join('');
    const lastCell = `${kblExcelColumnName(columnCount)}${Math.max(1, safeRows.length)}`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
        `<cols>${cols}</cols><sheetData>${rowXml}</sheetData>` +
        `<autoFilter ref="A1:${lastCell}"/>` +
        `</worksheet>`;
}

function kblExcelCrc32(buffer) {
    if (!window.__kblExcelCrcTable) {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n += 1) {
            let c = n;
            for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            table[n] = c >>> 0;
        }
        window.__kblExcelCrcTable = table;
    }
    const table = window.__kblExcelCrcTable;
    let crc = 0xffffffff;
    for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function kblExcelDosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    const dosTime = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((Math.floor(date.getSeconds() / 2)) & 31);
    const dosDate = (((year - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
    return { dosTime, dosDate };
}

function kblExcelZipStore(entries) {
    const locals = [], centrals = [];
    let offset = 0;
    const stamp = kblExcelDosDateTime();
    for (const entry of entries) {
        const name = Buffer.from(String(entry.name || '').replace(/\\/g, '/'), 'utf8');
        const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data || ''), 'utf8');
        const crc = kblExcelCrc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(0, 8);
        local.writeUInt16LE(stamp.dosTime, 10);
        local.writeUInt16LE(stamp.dosDate, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        locals.push(local, name, data);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(0, 10);
        central.writeUInt16LE(stamp.dosTime, 12);
        central.writeUInt16LE(stamp.dosDate, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(0, 38);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, name);
        offset += local.length + name.length + data.length;
    }
    const centralBuffer = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuffer.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([...locals, centralBuffer, end]);
}

function kblExcelWorkbookBuffer(sheets) {
    const safeSheets = Array.isArray(sheets) && sheets.length ? sheets : [{ name:'Sheet1', rows:[['Không có dữ liệu']] }];
    const sheetEntries = safeSheets.map((sheet, index) => ({
        name: `xl/worksheets/sheet${index + 1}.xml`,
        data: kblExcelSheetXml(sheet.rows)
    }));
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        safeSheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        `</Types>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`;
    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${safeSheets.map((sheet, i) => `<sheet name="${kblExcelXmlEscape(String(sheet.name || `Sheet${i + 1}`).slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
        `</workbook>`;
    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        safeSheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
        `</styleSheet>`;
    return kblExcelZipStore([
        { name:'[Content_Types].xml', data:contentTypes },
        { name:'_rels/.rels', data:rootRels },
        { name:'xl/workbook.xml', data:workbook },
        { name:'xl/_rels/workbook.xml.rels', data:workbookRels },
        { name:'xl/styles.xml', data:styles },
        ...sheetEntries
    ]);
}

function kblExcelModeText(mode) {
    const value = String(mode || '').toLowerCase();
    if (value === 'ban') return 'Bán hàng';
    if (value === 'doi') return 'Đổi Bù';
    if (value === 'doikbl') return 'Đổi Ngang KBL';
    if (value === 'tra') return 'Khách trả hàng';
    return value || '—';
}

function kblExcelDateText(value) {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return String(value || '');
    return date.toLocaleDateString('vi-VN');
}

function kblExcelInRange(value, fromMs, toMs) {
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) && time >= fromMs && time <= toMs;
}

function kblExcelTab1Rows(fromMs, toMs) {
    const rows = [[
        'Ngày','Mã phiếu','Mã nhập kho','Họ tên người bán','CCCD','SĐT','Địa chỉ','Ngày cấp','Nơi cấp',
        'Hình thức nhận tiền','Ngân hàng','Số tài khoản','Chủ tài khoản','STT món','Tên hàng','Hàm lượng',
        'KLT (ly)','Trừ hột/đá (ly)','KLV thực (ly)','Đơn giá (đ/chỉ)','Phí/Thưởng','Thành tiền','Mã nhóm đổi'
    ]];
    (Array.isArray(dataStoreRecords) ? dataStoreRecords : []).forEach(record => {
        if (!kblExcelInRange(record?.rawDate, fromMs, toMs)) return;
        const items = Array.isArray(record?.items) && record.items.length ? record.items : [{
            index:1, goods:record?.goods, goldType:record?.goldType, grossLy:record?.netLy, gemLy:0,
            netLy:record?.netLy, price:record?.price, fee:record?.fee, totalVND:record?.money
        }];
        items.forEach((item, index) => rows.push([
            kblExcelDateText(record?.rawDate), String(record?.id || ''), String(record?.nkCode || ''), String(record?.name || ''),
            String(record?.cccd || ''), String(record?.phone || ''), String(record?.address || ''), String(record?.dateIssue || ''), String(record?.placeIssue || ''),
            String(record?.payMethod === 'chuyen_khoan' ? 'Chuyển khoản' : 'Tiền mặt'), String(record?.bankName || ''), String(record?.bankAcc || ''), String(record?.bankHolder || ''),
            Number(item?.index || index + 1), String(item?.goods || record?.goods || ''), String(item?.goldType || record?.goldType || ''),
            numberValue(item?.grossLy), numberValue(item?.gemLy), numberValue(item?.netLy), numberValue(item?.price), numberValue(item?.fee), numberValue(item?.totalVND != null ? item.totalVND : item?.money),
            String(record?.transactionGroupId || '')
        ]));
    });
    return rows;
}

function kblExcelTab2Rows(fromMs, toMs) {
    const rows = [[
        'Ngày','Mã hóa đơn','Loại giao dịch','Khách hàng','CCCD','SĐT','Địa chỉ','STT món','Mã SP','Tên hàng','Hàm lượng',
        'Trọng lượng (ly)','Giá bán vàng (đ/chỉ)','Tiền công','Giảm giá','Thành tiền dòng','Tổng thanh toán HĐ',
        'Giá trị vàng cũ','Phí đổi','Hoàn/điều chỉnh','Tiền bù vàng','Lợi nhuận HĐ','Mã nhóm đổi'
    ]];
    (Array.isArray(salesStore) ? salesStore : []).forEach(tx => {
        if (!kblExcelInRange(tx?.dateRaw, fromMs, toMs)) return;
        const items = Array.isArray(tx?.items) && tx.items.length ? tx.items : [{
            invCode:tx?.invCode, itemName:tx?.itemName, type:tx?.type, weightLy:tx?.weightLy,
            priceSell:0, wage:0, discount:0, totalPay:tx?.totalPay
        }];
        items.forEach((item, index) => rows.push([
            kblExcelDateText(tx?.dateRaw), String(tx?.id || ''), kblExcelModeText(tx?.mode), String(tx?.cusName || tx?.customerName || ''),
            String(tx?.cusCccd || tx?.cccd || ''), String(tx?.cusPhone || tx?.phone || ''), String(tx?.cusAddress || tx?.address || ''),
            index + 1, String(item?.invCode || item?.sku || ''), String(item?.itemName || item?.name || ''), String(item?.type || ''), numberValue(item?.weightLy),
            numberValue(item?.priceSell), numberValue(item?.wage), numberValue(item?.discount), numberValue(item?.totalPay), numberValue(tx?.totalPay),
            numberValue(tx?.exchangePurchaseGross || tx?.oldValue), numberValue(tx?.exchangeFee), numberValue(tx?.exchangeRefund), numberValue(tx?.goldCompensation),
            numberValue(saleTransactionProfit(tx)), String(tx?.transactionGroupId || '')
        ]));
    });
    return rows;
}

function kblExcelTab3Rows(fromMs, toMs) {
    const rows = [[
        'Ngày hồ sơ','Mã hồ sơ','Mã nhóm','Mã hóa đơn bán/đổi','Mã phiếu thu mua','Loại hồ sơ','Khách hàng','CCCD',
        'A - Giá trị vàng cũ','Tổng nghĩa vụ món mới','Điều chỉnh đối chiếu','Số tiền cấn trừ','Kết quả thanh toán','Bên thanh toán',
        'Số UNC','Ngày UNC','Ngân hàng','Mã tham chiếu NH','Trạng thái'
    ]];
    const seen = new Set();
    const source = [...(Array.isArray(offsetRecords) ? offsetRecords : [])].sort((a,b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0));
    source.forEach(record => {
        const key = String(record?.transactionGroupId || record?.id || record?.saleId || '').trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        const sale = (Array.isArray(salesStore) ? salesStore : []).find(tx => String(tx?.id || '') === String(record?.saleId || ''));
        const dateValue = sale?.dateRaw || record?.updatedAt || record?.createdAt;
        if (!kblExcelInRange(dateValue, fromMs, toMs)) return;
        rows.push([
            kblExcelDateText(dateValue), String(record?.id || ''), String(record?.transactionGroupId || ''), String(record?.saleId || ''),
            String(record?.linkedPurchaseRecordId || record?.purchaseDocumentId || ''), kblExcelModeText(record?.dossierMode || sale?.mode),
            String(record?.customerName || sale?.cusName || ''), String(record?.cccd || sale?.cusCccd || ''), numberValue(record?.purchaseGross),
            numberValue(record?.customerObligationGross), numberValue(record?.reconciliationAdjustment), numberValue(record?.clearingAmount),
            numberValue(record?.netSettlement), String(record?.payerText || ''), String(record?.uncNo || ''), String(record?.uncDate || ''),
            String(record?.bank || ''), String(record?.bankRef || ''), String(record?.status || '')
        ]);
    });
    return rows;
}

function kblExcelSummaryRows(fromValue, toValue, tab1, tab2, tab3) {
    const purchaseTotal = tab1.slice(1).reduce((sum,row) => sum + numberValue(row[21]), 0);
    const saleInvoices = new Map();
    tab2.slice(1).forEach(row => { if (!saleInvoices.has(String(row[1] || ''))) saleInvoices.set(String(row[1] || ''), numberValue(row[16])); });
    const salesTotal = Array.from(saleInvoices.values()).reduce((a,b) => a + b, 0);
    const shopName = String(document.querySelector('.brand-title span')?.textContent || 'TIỆM VÀNG').replace(/^\s*💎\s*/, '').trim();
    return [
        ['BÁO CÁO DỮ LIỆU KẾ TOÁN TAB 1–2–3',''],
        ['Tên đơn vị', shopName],
        ['Từ ngày', fromValue || ''],
        ['Đến ngày', toValue || ''],
        ['Thời điểm xuất', new Date().toLocaleString('vi-VN')],
        ['Số dòng Thu Mua', Math.max(0, tab1.length - 1)],
        ['Tổng tiền Thu Mua', purchaseTotal],
        ['Số hóa đơn Bán/Đổi/Trả', saleInvoices.size],
        ['Tổng dòng tiền hóa đơn', salesTotal],
        ['Số hồ sơ Đối Chiếu', Math.max(0, tab3.length - 1)],
        ['', ''],
        ['Ghi chú', 'File này chỉ tổng hợp dữ liệu đã lưu trong POS theo khoảng ngày đã chọn; không sửa dữ liệu nguồn.']
    ];
}

async function exportAccountingExcelTab123() {
    const fromValue = String(getEl('rep-date-from')?.value || '').trim();
    const toValue = String(getEl('rep-date-to')?.value || '').trim();
    if (!fromValue || !toValue) return alert('Hãy chọn Từ ngày và Đến ngày trước khi xuất Excel.');
    const fromMs = new Date(`${fromValue}T00:00:00`).getTime();
    const toMs = new Date(`${toValue}T23:59:59.999`).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) return alert('Khoảng ngày xuất Excel không hợp lệ.');

    const tab1 = kblExcelTab1Rows(fromMs, toMs);
    const tab2 = kblExcelTab2Rows(fromMs, toMs);
    const tab3 = kblExcelTab3Rows(fromMs, toMs);
    const summary = kblExcelSummaryRows(fromValue, toValue, tab1, tab2, tab3);
    const buffer = kblExcelWorkbookBuffer([
        { name:'TONG_HOP', rows:summary },
        { name:'01_THU_MUA', rows:tab1 },
        { name:'02_BAN_HANG', rows:tab2 },
        { name:'03_DOI_CHIEU', rows:tab3 }
    ]);

    const fileName = `KE_TOAN_TAB1-2-3_${fromValue.replace(/-/g,'')}_${toValue.replace(/-/g,'')}.xlsx`;
    const home = process.env.USERPROFILE || process.env.HOME || KBL_DATA_DIR || process.cwd();
    const downloadDir = path.join(home, 'Downloads');
    try { fs.mkdirSync(downloadDir, { recursive:true }); } catch (_) {}
    const target = path.join(fs.existsSync(downloadDir) ? downloadDir : KBL_DATA_DIR, fileName);
    fs.writeFileSync(target, buffer);
    alert(`✅ ĐÃ XUẤT EXCEL KẾ TOÁN TAB 1–2–3\n\n${target}\n\nGồm 4 sheet: TONG_HOP · 01_THU_MUA · 02_BAN_HANG · 03_DOI_CHIEU.`);
    return target;
}
window.exportAccountingExcelTab123 = exportAccountingExcelTab123;

function backupDatabase() {
    try {
        const backupDir = path.join(KBL_DATA_DIR, 'data_backup');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        const timestamp = Date.now();
        ['database.db', 'inventory_db.json', 'sales_db.json', 'settings.json', 'chanh_batches.json', 'supplier_invoices.json', 'chanh_draft_lots.json', 'offset_records.json', 'pawn_lost_declarations.json'].forEach(f => {
            const source = kblDataPath(f);
            if (fs.existsSync(source)) fs.copyFileSync(source, path.join(backupDir, `${timestamp}_${f}`));
        });
        alert(`💾 Đã sao lưu toàn bộ dữ liệu an toàn vào:
${backupDir}`);
    } catch(e) { 
        alert("Lỗi backup! Kiểm tra quyền truy cập ổ đĩa."); 
    }
}

// =================================================================
// 9. GẮN HÀM TOÀN CỤC (GLOBAL ATTACHMENT)
// =================================================================
window.openMobileScanner = openMobileScanner;
window.closeMobileScanner = closeMobileScanner;
window.processBuyOCRBase64 = processBuyOCRBase64;
window.processSaleOCRBase64 = processSaleOCRBase64;
window.openVneidScanner = openVneidScanner;
window.closeVneidScanner = closeVneidScanner;
window.kblUseVneidRawInput = kblUseVneidRawInput;
window.kblCaptureVneidFace = kblCaptureVneidFace;
window.kblChooseVneidFaceFile = kblChooseVneidFaceFile;
window.kblHandleVneidFaceFile = kblHandleVneidFaceFile;

window.switchTab = switchTab;
window.initSerialPort = initSerialPort;
window.initSerialPortKho = initSerialPortKho;
window.initSerialPortSaleOld = initSerialPortSaleOld;
window.runOCR = runOCR;
window.runSaleOCR = runSaleOCR;
window.syncBuyUI = syncBuyUI;
window.calcBuyMath = calcBuyMath;
window.addPurchaseItem = addPurchaseItem;
window.removePurchaseItem = removePurchaseItem;
window.resetPurchaseItems = resetPurchaseItems;
window.renderPurchaseItems = renderPurchaseItems;
window.clearA4ManualEdits = clearA4ManualEdits;
window.setDraftNKCode = setDraftNKCode;
window.resetDraftNKCode = resetDraftNKCode;
window.bindA4Editing = bindA4Editing;
window.setA4ManualEdit = setA4ManualEdit;
window.findA4Editable = findA4Editable;
window.commitCurrentTransactionToDatabase = commitCurrentTransactionToDatabase;
window.transferToInventory = transferToInventory;
window.calcInvMath = calcInvMath;
window.syncInvUI = syncInvUI;
window.clearInvForm = clearInvForm;
window.saveToInventory = saveToInventory;
window.loadNccList = loadNccList;
window.selectInventorySupplier = selectInventorySupplier;
window.openSupplierForm = openSupplierForm;
window.cancelSupplierForm = cancelSupplierForm;
window.saveNewSupplier = saveNewSupplier;
window.syncInvSourceUI = syncInvSourceUI;
window.selectInventoryPurchaseSource = selectInventoryPurchaseSource;
window.printInventoryTag = printInventoryTag;
window.deleteInventoryItem = deleteInventoryItem;
window.loadPrinters = loadPrinters;
window.printStandaloneTagDirectly = printStandaloneTagDirectly;
window.printInventoryLabelCalibrationTest = printInventoryLabelCalibrationTest;
window.printInventoryLabelFrameTest = printInventoryLabelFrameTest;
window.openInventoryLabelProductUrl = openInventoryLabelProductUrl;
window.nudgeInventoryLabelFrame = nudgeInventoryLabelFrame;
window.centerInventoryLabelPreview = centerInventoryLabelPreview;
window.resetInventoryLabelPreview = resetInventoryLabelPreview;
window.setSellMode = setSellMode;
window.setSellModeStandalone = setSellModeStandalone;
window.startLinkedExchangeWorkflow = startLinkedExchangeWorkflow;
window.cancelLinkedExchangeWorkflow = cancelLinkedExchangeWorkflow;
window.loadLinkedPurchaseIntoExchange = loadLinkedPurchaseIntoExchange;
window.continueExchangeFromPurchaseRecord = continueExchangeFromPurchaseRecord;
window.openActiveExchangePurchase = openActiveExchangePurchase;
window.reloadActiveExchangePurchase = reloadActiveExchangePurchase;
window.openLinkedExchangeDossierFromPurchase = openLinkedExchangeDossierFromPurchase;
window.openLinkedExchangeDossierFromSale = openLinkedExchangeDossierFromSale;
window.openSelectedExchangePurchase = openSelectedExchangePurchase;
window.renderExchangeLinkWorkflow = renderExchangeLinkWorkflow;
window.searchInventoryForSale = searchInventoryForSale;
window.selectItemForSale = selectItemForSale;
window.calcSellMath = calcSellMath;
window.addSelectedToCart = addSelectedToCart;
window.removeFromSalesCart = removeFromSalesCart;
window.clearSalesCart = clearSalesCart;
window.addSaleToReturnCart = addSaleToReturnCart;
window.removeFromReturnCart = removeFromReturnCart;
window.clearReturnCart = clearReturnCart;
window.renderSalesCart = renderSalesCart;
window.addOldGoldToExchangeCart = addOldGoldToExchangeCart;
window.removeOldGoldFromExchangeCart = removeOldGoldFromExchangeCart;
window.clearOldGoldExchangeCart = clearOldGoldExchangeCart;
window.loadSaleCustomerByQr = loadSaleCustomerByQr;
window.processTransaction = processTransaction;
window.rememberInvoicePrinter = rememberInvoicePrinter;
window.renderSalesInvoiceHistory = renderSalesInvoiceHistory;
window.viewSalesInvoice = viewSalesInvoice;
window.printSalesInvoiceById = printSalesInvoiceById;
window.printCurrentSalesInvoice = printCurrentSalesInvoice;
window.startEditSalesInvoice = startEditSalesInvoice;
window.cancelSalesInvoiceEdit = cancelSalesInvoiceEdit;
window.saveSalesInvoiceEdit = saveSalesInvoiceEdit;
window.selectSaleForReturn = selectSaleForReturn;
window.generateReports = generateReports;
window.saveSettings = saveSettings;
window.showPriceBoardLinks = showPriceBoardLinks;
window.refreshGooglePriceNow = refreshGooglePriceNow;
window.saveGooglePriceAutoConfig = saveGooglePriceAutoConfig;
window.setGooglePriceMarkup = setGooglePriceMarkup;
window.backupDatabase = backupDatabase;
window.reuseCustomerInfo = reuseCustomerInfo;
window.viewOldPurchaseRecord = viewOldPurchaseRecord;
window.editPurchaseRecord = editPurchaseRecord;
window.clearPurchaseEditMode = clearPurchaseEditMode;
window.applyPurchaseLockedDate = applyPurchaseLockedDate;
window.deleteRecord = deleteRecord;
window.searchCustomerQuick = searchCustomerQuick;
window.selectCustomerQuick = selectCustomerQuick;
window.filterBuyHistoryTable = filterBuyHistoryTable;

// ============================================================================
// KBL 11/09/2026 — LỚP HỒ SƠ ĐỐI CHIẾU & BÙ TRỪ + CHUỘC MẤT GIẤY
// NGUYÊN TẮC: KHÔNG sửa engine Đổi Vàng Bù / Đổi Ngang / Cầm Đồ hiện tại.
// Các hàm dưới đây chỉ chụp snapshot sau khi engine đã tính xong và dùng snapshot
// đó để lập hồ sơ, bảng kê và biên bản. Không đọc bảng giá hiện tại để viết lại
// một giao dịch đã chốt.
// ============================================================================

function kblOffsetModeText(mode) {
    const m = String(mode || '').toLowerCase();
    if (m === 'doikbl') return 'Đổi Ngang KBL — vàng KBL đổi vàng KBL';
    if (m === 'doi') return 'Đổi Vàng Bù — vàng cùng hệ thống/nguồn công ty';
    if (m === 'vangla' || m === 'manual_buy_sell') return 'Vàng lạ — Mua vào / Bán ra cấn trừ';
    return saleModeText(m);
}

function kblOffsetDossierModeText(sale, dossier) {
    return kblOffsetModeText(dossier && dossier.mode ? dossier.mode : sale && sale.mode);
}

function kblOffsetNetSettlement(sale, dossier) {
    if (dossier && Number.isFinite(Number(dossier.netSettlement))) return Math.round(numberValue(dossier.netSettlement));
    return Math.round(numberValue(sale && sale.totalPay));
}

function kblOffsetDateParts(value) {
    const d = new Date(value || Date.now());
    const safe = Number.isFinite(d.getTime()) ? d : new Date();
    return {
        y: String(safe.getFullYear()),
        m: String(safe.getMonth() + 1).padStart(2, '0'),
        d: String(safe.getDate()).padStart(2, '0'),
        display: safe.toLocaleDateString('vi-VN')
    };
}

function makeKblOffsetGroupId(tx) {
    const p = kblOffsetDateParts(tx && tx.dateRaw);
    const tail = String(tx && tx.id || Date.now()).replace(/[^A-Za-z0-9]/g, '').slice(-10) || String(Date.now()).slice(-10);
    return `KBL-BT-${p.y}${p.m}${p.d}-${tail}`;
}

function makeKblExchangePurchaseDocId(tx) {
    const p = kblOffsetDateParts(tx && tx.dateRaw);
    const tail = String(tx && tx.id || Date.now()).replace(/[^A-Za-z0-9]/g, '').slice(-8) || String(Date.now()).slice(-8);
    return `MUA-BT-${p.y}${p.m}${p.d}-${tail}`;
}

function kblSnapshotNewSaleLines(newItems) {
    return (Array.isArray(newItems) ? newItems : []).map((item, index) => {
        const weightLy = numberValue(item && item.weightLy);
        const priceSell = Math.max(0, numberValue(item && item.priceSell));
        const wage = Math.max(0, numberValue(item && (item.wage ?? item.sellWage)));
        return {
            index: index + 1,
            invCode: String(item && (item.invCode || item.code) || ''),
            itemName: String(item && (item.itemName || item.name) || 'Sản phẩm vàng'),
            type: String(item && item.type || ''),
            weightLy,
            priceSell,
            goldValue: Math.round((weightLy / 100) * priceSell),
            wage: Math.round(wage),
            discount: Math.round(Math.max(0, numberValue(item && item.discount)))
        };
    });
}


function kblPurchaseLinesAtSellPrice(oldItems) {
    return (Array.isArray(oldItems) ? oldItems : []).filter(item => numberValue(item?.weightLy) > 0).map((item, index) => {
        const weightLy = Math.max(0, numberValue(item?.weightLy));
        const type = String(item?.type || '');
        const unitPrice = Math.max(0, numberValue(settingsStore[`price_sell_${type}`]));
        return {
            index: index + 1,
            name: String(item?.name || item?.itemName || 'Vàng trang sức cũ'),
            type,
            weightLy,
            unitPrice: Math.round(unitPrice),
            total: Math.round((weightLy / 100) * unitPrice)
        };
    });
}

function kblPurchaseLinesFromActualRecord(record) {
    if (!record) return [];
    return normalizeStoredPurchaseItems(record).filter(item => numberValue(item?.netLy) > 0).map((item, index) => {
        const weightLy = Math.max(0, numberValue(item?.netLy));
        const unitPrice = Math.max(0, Math.round(numberValue(item?.price)));
        const storedTotal = numberValue(item?.totalVND);
        const fallbackTotal = Math.round((weightLy / 100) * unitPrice + numberValue(item?.fee));
        return {
            index: index + 1,
            name: String(item?.goods || 'Vàng trang sức cũ'),
            type: String(item?.goldType || ''),
            weightLy,
            unitPrice,
            fee: Math.round(numberValue(item?.fee)),
            total: Math.round(storedTotal || fallbackTotal)
        };
    });
}

function kblPurchaseLinesAtBuyPrice(oldItems) {
    return (Array.isArray(oldItems) ? oldItems : []).filter(item => numberValue(item?.weightLy) > 0).map((item, index) => {
        const weightLy = Math.max(0, numberValue(item?.weightLy));
        const type = String(item?.type || '');
        const unitPrice = Math.max(0, numberValue(item?.priceBuy) || numberValue(settingsStore[`price_buy_${type}`]));
        return {
            index: index + 1,
            name: String(item?.name || item?.itemName || 'Vàng trang sức cũ'),
            type,
            weightLy,
            unitPrice: Math.round(unitPrice),
            fee: 0,
            total: Math.round((weightLy / 100) * unitPrice)
        };
    });
}

function kblPurchaseLinesForExchangeDossier(record) {
    if (!record) return [];
    const policy = String(record.exchangePurchasePolicy || '');
    // Bản cũ từng ghi Phiếu Thu Mua liên kết theo GIÁ BÁN RA. Để sửa đúng hồ sơ
    // mà không đoán giá lịch sử, dùng priceBuy snapshot đã lưu cùng engine lúc chốt.
    // Chỉ áp dụng cho policy lỗi cũ; bản mới ACTUAL_PURCHASE_RECORD luôn đọc phiếu thật.
    if (policy === 'ALL_OLD_GOLD_AT_SELL_PRICE' && Array.isArray(record.exchangeEngineOldItems) && record.exchangeEngineOldItems.length) {
        const stored = normalizeStoredPurchaseItems(record);
        return stored.filter(item => numberValue(item?.netLy) > 0).map((item, index) => {
            const engineItem = record.exchangeEngineOldItems[index] || {};
            const weightLy = Math.max(0, numberValue(item?.netLy));
            const type = String(item?.goldType || engineItem.type || '');
            const unitPrice = Math.max(0,
                numberValue(engineItem.priceBuy) ||
                numberValue(settingsStore[`price_buy_${type}`]) ||
                numberValue(item?.price)
            );
            return {
                index: index + 1,
                name: String(item?.goods || engineItem.name || 'Vàng trang sức cũ'),
                type,
                weightLy,
                unitPrice: Math.round(unitPrice),
                fee: 0,
                total: Math.round((weightLy / 100) * unitPrice),
                migratedLegacySellPricePolicy: true
            };
        });
    }
    return kblPurchaseLinesFromActualRecord(record);
}

function kblLinkedPurchaseForTransaction(tx) {
    if (!tx) return null;
    const purchaseId = String(tx.exchangePurchaseRecordId || tx.exchangePurchaseDocId || '');
    const groupId = String(tx.transactionGroupId || '');
    return (Array.isArray(dataStoreRecords) ? dataStoreRecords : []).find(record =>
        (purchaseId && String(record?.id || '') === purchaseId) ||
        (groupId && String(record?.transactionGroupId || '') === groupId)
    ) || null;
}

function kblNormalizePurchaseLinesToGross(lines, targetGross) {
    const result = (Array.isArray(lines) ? lines : []).filter(line => numberValue(line && line.weightLy) > 0).map(line => ({ ...line }));
    const target = Math.round(numberValue(targetGross));
    if (!result.length) return result;
    let current = result.reduce((sum, line) => sum + Math.round(numberValue(line.total)), 0);
    const diff = target - current;
    if (diff) {
        const last = result[result.length - 1];
        last.total = Math.round(numberValue(last.total) + diff);
        const chi = numberValue(last.weightLy) / 100;
        last.unitPrice = chi > 0 ? Math.round(last.total / chi) : 0;
    }
    return result;
}

function kblBuildGenericPurchaseLines(calculation, oldItems, targetGross) {
    const oldList = Array.isArray(oldItems) ? oldItems : [];
    const totals = oldList.map(() => 0);
    const segments = Array.isArray(calculation && calculation.segments) ? calculation.segments : [];

    segments.forEach(segment => {
        const o = segment && segment.oldEntry;
        if (!o) return;
        const idx = Number(o.index);
        if (!Number.isInteger(idx) || idx < 0 || idx >= oldList.length) return;
        const n = segment.newEntry;
        const weightLy = Math.max(0, numberValue(segment.weightLy));
        if (!weightLy) return;

        const oldType = String(o.type || oldList[idx]?.type || '');
        const newType = String(n && n.type || '');
        const oldPrice = Math.max(0,
            numberValue(o.item && o.item.priceBuy) ||
            numberValue(oldList[idx] && oldList[idx].priceBuy) ||
            numberValue(settingsStore[`price_buy_${oldType}`])
        );
        let documentPrice = oldPrice;

        if (n) {
            const newPrice = Math.max(0,
                numberValue(n.item && n.item.priceSell) ||
                numberValue(n.item && n.item.sellPrice)
            );
            const sameType = oldType === newType;
            // Đây KHÔNG phải công thức mới. Chỉ diễn giải lại đúng các nhánh mà
            // calculateExchangeSettlement() đã dùng khi chốt phiếu.
            if ((sameType && (oldType === '980' || oldType === '610')) ||
                (oldType === '9999' && newType === '9999') ||
                (oldType === '9999' && newType === '980')) {
                documentPrice = newPrice || oldPrice;
            }
        }
        totals[idx] += (weightLy / 100) * documentPrice;
    });

    let lines = oldList.map((item, index) => {
        const weightLy = Math.max(0, numberValue(item && item.weightLy));
        const total = Math.round(totals[index] || ((weightLy / 100) * Math.max(0, numberValue(item && item.priceBuy))));
        const chi = weightLy / 100;
        return {
            index: index + 1,
            name: String(item && (item.name || item.itemName) || 'Vàng trang sức cũ'),
            type: String(item && item.type || ''),
            weightLy,
            unitPrice: chi > 0 ? Math.round(total / chi) : 0,
            total
        };
    });
    return kblNormalizePurchaseLinesToGross(lines, targetGross);
}

function kblBuildSmart610PurchaseLines(calculation, oldItems, targetGross) {
    const oldList = Array.isArray(oldItems) ? oldItems : [];
    const retailSell = Math.max(0, numberValue(calculation && calculation.internal && calculation.internal.retailSell));
    const retailBuy = Math.max(0, numberValue(calculation && calculation.internal && calculation.internal.retailBuy));
    let remainingNewLy = Math.max(0, numberValue(calculation && calculation.newWeight));

    const lines = oldList.map((item, index) => {
        const weightLy = Math.max(0, numberValue(item && item.weightLy));
        const matchedLy = Math.min(weightLy, remainingNewLy);
        remainingNewLy = Math.max(0, remainingNewLy - matchedLy);
        const surplusLy = Math.max(0, weightLy - matchedLy);
        const oldBuy = Math.max(0, numberValue(item && item.priceBuy) || retailBuy);
        const total = Math.round((matchedLy / 100) * retailSell + (surplusLy / 100) * oldBuy);
        const chi = weightLy / 100;
        return {
            index: index + 1,
            name: String(item && (item.name || item.itemName) || 'Vàng KBL cũ'),
            type: String(item && item.type || '610'),
            weightLy,
            unitPrice: chi > 0 ? Math.round(total / chi) : 0,
            total
        };
    });
    return kblNormalizePurchaseLinesToGross(lines, targetGross);
}

function kblBuildExchangeDossierSnapshot(tx, calculation, newItems, oldItems, discount) {
    const saleLines = kblSnapshotNewSaleLines(newItems);
    const saleGoldFromLines = saleLines.reduce((sum, line) => sum + numberValue(line.goldValue), 0);
    const saleGoldGross = Math.round(
        numberValue(calculation && calculation.newGoldValue) || saleGoldFromLines
    );
    const wageFromLines = saleLines.reduce((sum, line) => sum + numberValue(line.wage), 0);
    const wageTotal = Math.round(
        numberValue(calculation && calculation.smart610 && calculation.customerFormula && calculation.customerFormula.wageTotal) ||
        numberValue(calculation && calculation.wageTotal) ||
        wageFromLines
    );
    const engineExchangeAdjustment = calculation && calculation.smart610
        ? Math.round(numberValue(calculation?.customerFormula?.goldDifferenceAmount))
        : Math.round(numberValue(calculation && calculation.exchangeAdjustment));
    const discountSnapshot = Math.round(Math.max(0, numberValue(discount)));
    const netSettlement = Math.round(numberValue(calculation && calculation.totalPay));

    // Hồ sơ mua vào dùng đúng phiếu Thu Mua thật: giá MUA VÀO/giá thực tế đã chốt.
    // Giá bán món mới vẫn lấy từ phiếu bán/đổi; engine tính tiền đổi giữ nguyên calculation.totalPay.
    const linkedPurchase = kblLinkedPurchaseForTransaction(tx);
    const purchaseLines = linkedPurchase
        ? kblPurchaseLinesForExchangeDossier(linkedPurchase)
        : kblPurchaseLinesAtBuyPrice(oldItems);
    const purchaseGross = Math.round(purchaseLines.reduce((sum, line) => sum + numberValue(line.total), 0));
    const purchasePolicy = String(linkedPurchase?.exchangePurchasePolicy || 'ACTUAL_PURCHASE_RECORD');
    const matchedOffsetPolicy = purchasePolicy === 'MATCHED_OFFSET_POLICY_V1';

    // Với policy hồ sơ liên kết, tiền bù/đổi ngang đã nằm ngay trong GIÁ TRỊ PHIẾU THU:
    // Đổi Bù: đối ứng × giá bán + cũ dư × giá mua - TOÀN BỘ vàng cũ × phí đổi.
    // Đổi Ngang KBL: đối ứng × giá bán, cũ dư × giá mua.
    // Vì vậy không cộng exchangeAdjustment lần thứ hai trên Biên bản đối chiếu.
    const arithmeticExchangeAdjustment = matchedOffsetPolicy ? 0 : engineExchangeAdjustment;
    const baseSaleObligation = Math.round(saleGoldGross + wageTotal + arithmeticExchangeAdjustment - discountSnapshot);
    const reconciliationAdjustment = Math.round(netSettlement - (baseSaleObligation - purchaseGross));
    const customerObligationGross = Math.round(baseSaleObligation + reconciliationAdjustment);
    const clearingAmount = Math.max(0, Math.min(Math.max(0, purchaseGross), Math.max(0, customerObligationGross)));
    const payerText = netSettlement > 0
        ? `Khách hàng thanh toán KBL ${formatVND(netSettlement)}`
        : netSettlement < 0
            ? `KBL thanh toán khách hàng ${formatVND(Math.abs(netSettlement))}`
            : 'Không còn chênh lệch thanh toán';

    return {
        version: matchedOffsetPolicy ? 5 : 4,
        sourceType: 'exchange_engine',
        createdAt: new Date().toISOString(),
        transactionId: String(tx && tx.id || ''),
        transactionGroupId: String(tx && tx.transactionGroupId || makeKblOffsetGroupId(tx)),
        purchaseDocumentId: String(linkedPurchase?.id || tx?.exchangePurchaseRecordId || tx?.exchangePurchaseDocId || makeKblExchangePurchaseDocId(tx)),
        linkedPurchaseRecordId: String(linkedPurchase?.id || tx?.exchangePurchaseRecordId || ''),
        mode: String(tx && tx.mode || ''),
        engine: calculation && calculation.smart610 ? 'smart610-current' : 'exchange-current',
        customer: {
            name: String(linkedPurchase?.name || tx && tx.cusName || ''),
            cccd: String(linkedPurchase?.cccd || tx && tx.cusCccd || ''),
            phone: String(linkedPurchase?.phone || tx && tx.cusPhone || ''),
            address: String(linkedPurchase?.address || tx && tx.cusAddress || '')
        },
        purchaseLines,
        purchaseGross,
        saleLines,
        saleGoldGross,
        wageTotal,
        exchangeAdjustment: arithmeticExchangeAdjustment,
        exchangeReferenceAdjustment: engineExchangeAdjustment,
        exchangeMatchedWeightLy: roundWeightLy(numberValue(linkedPurchase?.exchangeDocMatchedLy)),
        exchangeSurplusOldWeightLy: roundWeightLy(numberValue(linkedPurchase?.exchangeDocSurplusLy)),
        exchangeFeeRate: Math.round(numberValue(linkedPurchase?.exchangeDocFeeRate)),
        exchangeFeeAmount: Math.round(numberValue(linkedPurchase?.exchangeDocFeeAmount)),
        reconciliationAdjustment,
        discount: discountSnapshot,
        customerObligationGross,
        clearingAmount,
        netSettlement,
        payerText,
        purchasePolicy
    };
}

function attachExchangeDossierSnapshot(tx, calculation, newItems, oldItems, discount) {
    if (!tx || !['doi', 'doikbl'].includes(String(tx.mode || '').toLowerCase())) return tx;
    tx.transactionGroupId = tx.transactionGroupId || makeKblOffsetGroupId(tx);
    tx.exchangePurchaseDocId = tx.exchangePurchaseDocId || makeKblExchangePurchaseDocId(tx);
    tx.exchangeDiscount = Math.round(Math.max(0, numberValue(discount)));
    tx.exchangeDossier = kblBuildExchangeDossierSnapshot(tx, calculation, newItems, oldItems, tx.exchangeDiscount);
    return tx;
}

function kblLegacyPurchaseLines(tx, purchaseGross) {
    const oldItems = Array.isArray(tx && tx.oldItems) ? tx.oldItems : [];
    if (!oldItems.length) return [];
    const bases = oldItems.map(item => {
        const w = Math.max(0, numberValue(item && item.weightLy));
        const p = Math.max(0, numberValue(item && item.priceBuy));
        return p > 0 ? (w / 100) * p : w;
    });
    const baseTotal = bases.reduce((sum, value) => sum + value, 0) || oldItems.reduce((sum, item) => sum + Math.max(0, numberValue(item && item.weightLy)), 0) || 1;
    let assigned = 0;
    const lines = oldItems.map((item, index) => {
        const weightLy = Math.max(0, numberValue(item && item.weightLy));
        let total = index === oldItems.length - 1
            ? Math.round(purchaseGross - assigned)
            : Math.round(purchaseGross * (bases[index] || weightLy) / baseTotal);
        assigned += total;
        const chi = weightLy / 100;
        return {
            index: index + 1,
            name: String(item && (item.name || item.itemName) || 'Vàng trang sức cũ'),
            type: String(item && item.type || ''),
            weightLy,
            unitPrice: chi > 0 ? Math.round(total / chi) : 0,
            total
        };
    });
    return kblNormalizePurchaseLinesToGross(lines, purchaseGross);
}


function kblManualIdentityKey(value) {
    return String(value || '').toUpperCase().replace(/[^0-9A-ZÀ-Ỹ]/g, '');
}

function kblManualOffsetPurchaseById(id) {
    const key = String(id || '');
    return (Array.isArray(dataStoreRecords) ? dataStoreRecords : []).find(record => String(record?.id || '') === key) || null;
}

function kblManualOffsetSaleById(id) {
    const key = String(id || '');
    return (Array.isArray(salesStore) ? salesStore : []).find(tx => String(tx?.id || '') === key) || null;
}

function kblIsNormalPurchaseForManualOffset(record) {
    if (!record || !record.id) return false;
    // Vàng lạ phải đi bằng phiếu Thu Mua bình thường, không lấy lại phiếu đã sinh cho Đổi Ngang/Đổi Bù.
    if (record.isExchangeLinkedPurchase || record.exchangeMode) return false;
    return true;
}

function kblIsNormalSaleForManualOffset(tx) {
    return Boolean(tx && tx.id && String(tx.mode || '').toLowerCase() === 'ban');
}

function kblBuildManualBuySellDossier(purchase, sale) {
    if (!purchase || !sale) return null;
    const purchaseLines = kblPurchaseLinesFromActualRecord(purchase);
    const purchaseGross = Math.round(purchaseLines.reduce((sum, line) => sum + numberValue(line.total), 0));
    const saleLines = kblSnapshotNewSaleLines(Array.isArray(sale.items) ? sale.items : []);
    const saleGoldGross = Math.round(saleLines.reduce((sum, line) => sum + numberValue(line.goldValue), 0));
    const wageTotal = Math.round(saleLines.reduce((sum, line) => sum + numberValue(line.wage), 0));
    const discount = Math.round(saleLines.reduce((sum, line) => sum + Math.max(0, numberValue(line.discount)), 0));
    const saleNetAmount = Math.round(numberValue(sale.totalPay));
    const saleFormulaAmount = Math.round(saleGoldGross + wageTotal - discount);
    // Không thêm công thức đổi cho vàng lạ. Nếu hóa đơn bán có sai số snapshot cũ, chỉ ghi nhận
    // đúng phần chênh giữa tổng hóa đơn đã chốt và các dòng giá/công/giảm giá để hồ sơ khớp nguồn.
    const reconciliationAdjustment = Math.round(saleNetAmount - saleFormulaAmount);
    const netSettlement = Math.round(saleNetAmount - purchaseGross);
    const groupId = String(sale.transactionGroupId || makeKblOffsetGroupId(sale));
    const clearingAmount = Math.max(0, Math.min(Math.max(0, purchaseGross), Math.max(0, saleNetAmount)));
    return {
        version: 4,
        createdAt: new Date().toISOString(),
        sourceType: 'manual_buy_sell',
        transactionId: String(sale.id || ''),
        transactionGroupId: groupId,
        purchaseDocumentId: String(purchase.id || ''),
        linkedPurchaseRecordId: String(purchase.id || ''),
        mode: 'vangla',
        engine: 'normal-buy-sell-offset',
        customer: {
            name: String(purchase.name || sale.cusName || ''),
            cccd: String(purchase.cccd || sale.cusCccd || ''),
            phone: String(purchase.phone || sale.cusPhone || ''),
            address: String(purchase.address || sale.cusAddress || '')
        },
        purchaseLines,
        purchaseGross,
        saleLines,
        saleGoldGross,
        wageTotal,
        exchangeAdjustment: 0,
        reconciliationAdjustment,
        discount,
        saleNetAmount,
        customerObligationGross: saleNetAmount,
        clearingAmount,
        netSettlement,
        payerText: netSettlement > 0
            ? `Khách hàng thanh toán KBL ${formatVND(netSettlement)}`
            : netSettlement < 0
                ? `KBL thanh toán khách hàng ${formatVND(Math.abs(netSettlement))}`
                : 'Không còn chênh lệch thanh toán',
        purchasePolicy: 'ACTUAL_BUY_SELL'
    };
}

function refreshManualOffsetSources() {
    const pSel = getEl('offset-manual-purchase-select');
    const sSel = getEl('offset-manual-sale-select');
    if (pSel) {
        const prev = String(pSel.value || '');
        const rows = (Array.isArray(dataStoreRecords) ? dataStoreRecords : [])
            .filter(kblIsNormalPurchaseForManualOffset)
            .slice(0, 1500);
        pSel.innerHTML = '<option value="">-- Chọn phiếu Thu Mua của vàng lạ --</option>' + rows.map(record => {
            const total = Math.round(numberValue(record.totalMoney != null ? record.totalMoney : record.money));
            const who = String(record.name || 'Khách lẻ');
            return `<option value="${escapeHtml(record.id)}">${escapeHtml(record.id)} · ${escapeHtml(who)} · ${escapeHtml(formatVND(total))}</option>`;
        }).join('');
        if (rows.some(r => String(r.id) === prev)) pSel.value = prev;
    }
    if (sSel) {
        const prev = String(sSel.value || '');
        const rows = (Array.isArray(salesStore) ? salesStore : [])
            .filter(kblIsNormalSaleForManualOffset)
            .slice(0, 1500);
        sSel.innerHTML = '<option value="">-- Chọn phiếu Bán Hàng Mới đi cùng --</option>' + rows.map(tx => {
            const linked = tx.exchangeDossier?.sourceType === 'manual_buy_sell' ? ' · ĐÃ GHÉP' : '';
            return `<option value="${escapeHtml(tx.id)}">${escapeHtml(tx.id)} · ${escapeHtml(tx.cusName || 'Khách lẻ')} · ${escapeHtml(formatVND(numberValue(tx.totalPay)))}${linked}</option>`;
        }).join('');
        if (rows.some(r => String(r.id) === prev)) sSel.value = prev;
    }
    renderManualOffsetPreview();
}

function renderManualOffsetPreview() {
    const box = getEl('offset-manual-preview');
    if (!box) return;
    const purchase = kblManualOffsetPurchaseById(getEl('offset-manual-purchase-select')?.value);
    const sale = kblManualOffsetSaleById(getEl('offset-manual-sale-select')?.value);
    if (!purchase && !sale) {
        box.innerHTML = 'Chọn một phiếu Thu Mua và một phiếu Bán Hàng Mới của cùng khách để ghép hồ sơ vàng lạ.';
        return;
    }
    const purchaseGross = purchase ? Math.round(kblPurchaseLinesFromActualRecord(purchase).reduce((sum, line) => sum + numberValue(line.total), 0)) : 0;
    const saleTotal = sale ? Math.round(numberValue(sale.totalPay)) : 0;
    const net = saleTotal - purchaseGross;
    const pIdentity = [purchase?.cccd, purchase?.phone].filter(Boolean).join(' / ') || '—';
    const sIdentity = [sale?.cusCccd, sale?.cusPhone].filter(Boolean).join(' / ') || '—';
    box.innerHTML = `<b>Mua vào:</b> ${purchase ? `${escapeHtml(purchase.id)} · ${escapeHtml(purchase.name || '')} · ${formatVND(purchaseGross)}` : 'chưa chọn'}<br>
        <b>Bán ra:</b> ${sale ? `${escapeHtml(sale.id)} · ${escapeHtml(sale.cusName || '')} · ${formatVND(saleTotal)}` : 'chưa chọn'}<br>
        <b>Đối chiếu:</b> CCCD/SĐT mua: ${escapeHtml(pIdentity)} · bán: ${escapeHtml(sIdentity)}<br>
        <b>Chênh lệch dự kiến:</b> ${net >= 0 ? `Khách trả ${formatVND(net)}` : `KBL trả khách ${formatVND(Math.abs(net))}`}`;
}

function createManualBuySellOffsetDossier() {
    const purchase = kblManualOffsetPurchaseById(getEl('offset-manual-purchase-select')?.value);
    const sale = kblManualOffsetSaleById(getEl('offset-manual-sale-select')?.value);
    if (!purchase || !sale) return alert('Hãy chọn đủ Phiếu Thu Mua và Phiếu Bán Hàng Mới của vàng lạ.');
    if (!kblIsNormalPurchaseForManualOffset(purchase)) return alert('Phiếu Thu Mua này đã thuộc hồ sơ Đổi Ngang/Đổi Bù. Vàng lạ phải dùng một phiếu Thu Mua bình thường.');
    if (!kblIsNormalSaleForManualOffset(sale)) return alert('Phiếu bán phải là Bán Hàng Mới bình thường.');

    const purchaseCccd = kblManualIdentityKey(purchase.cccd);
    const saleCccd = kblManualIdentityKey(sale.cusCccd);
    if (purchaseCccd && saleCccd && purchaseCccd !== saleCccd) {
        return alert(`CCCD của phiếu mua (${purchase.cccd}) không khớp CCCD của phiếu bán (${sale.cusCccd}). Không ghép để tránh sai hồ sơ.`);
    }
    const conflicting = (Array.isArray(salesStore) ? salesStore : []).find(tx =>
        String(tx?.id || '') !== String(sale.id || '') &&
        tx?.exchangeDossier?.sourceType === 'manual_buy_sell' &&
        String(tx.exchangeDossier.linkedPurchaseRecordId || '') === String(purchase.id || '')
    );
    if (conflicting) return alert(`Phiếu Thu Mua ${purchase.id} đã được ghép với ${conflicting.id}. Không dùng lại một phiếu mua cho hai hồ sơ.`);

    const existingManualPurchase = String(sale.exchangeDossier?.linkedPurchaseRecordId || sale.manualExchangePurchaseRecordId || '');
    if (existingManualPurchase && existingManualPurchase !== String(purchase.id || '')) {
        return alert(`Phiếu bán ${sale.id} đang ghép với ${existingManualPurchase}. Hãy mở hồ sơ cũ để kiểm tra thay vì ghép sang phiếu khác.`);
    }

    sale.transactionGroupId = sale.transactionGroupId || makeKblOffsetGroupId(sale);
    const dossier = kblBuildManualBuySellDossier(purchase, sale);
    if (!dossier) return alert('Không tạo được hồ sơ vàng lạ.');
    sale.manualExchangePurchaseRecordId = String(purchase.id || '');
    sale.exchangePurchaseRecordId = String(purchase.id || '');
    sale.exchangePurchaseDocId = String(purchase.id || '');
    sale.exchangeDossier = dossier;
    saveDBFile('sales_db.json', salesStore);

    const pIndex = dataStoreRecords.findIndex(record => String(record?.id || '') === String(purchase.id || ''));
    if (pIndex >= 0) {
        dataStoreRecords[pIndex] = {
            ...dataStoreRecords[pIndex],
            manualOffsetGroupId: String(dossier.transactionGroupId || ''),
            manualOffsetSaleId: String(sale.id || ''),
            manualOffsetStatus: 'DA_GHEP_HO_SO',
            manualOffsetLinkedAt: new Date().toISOString()
        };
        saveDBFile('database.db', dataStoreRecords);
        compileBuyTable();
    }

    const now = new Date().toISOString();
    const old = (Array.isArray(offsetRecords) ? offsetRecords : []).find(record => String(record?.saleId || '') === String(sale.id || ''));
    const record = {
        ...(old || {}),
        id: String(dossier.transactionGroupId || ''),
        saleId: String(sale.id || ''),
        purchaseDocumentId: String(purchase.id || ''),
        linkedPurchaseRecordId: String(purchase.id || ''),
        transactionGroupId: String(dossier.transactionGroupId || ''),
        sourceType: 'manual_buy_sell',
        dossierMode: 'vangla',
        customerName: String(dossier.customer?.name || ''),
        cccd: String(dossier.customer?.cccd || ''),
        purchaseGross: Math.round(numberValue(dossier.purchaseGross)),
        customerObligationGross: Math.round(numberValue(dossier.customerObligationGross)),
        clearingAmount: Math.round(numberValue(dossier.clearingAmount)),
        netSettlement: Math.round(numberValue(dossier.netSettlement)),
        payerText: String(dossier.payerText || ''),
        sourceFingerprint: kblOffsetFingerprint(sale, dossier),
        status: old?.status === 'Đã lập' ? 'Đã lập' : 'Đã ghép',
        createdAt: old?.createdAt || now,
        updatedAt: now
    };
    const rIndex = offsetRecords.findIndex(item => String(item?.saleId || '') === String(sale.id || '') || String(item?.id || '') === String(record.id || ''));
    if (rIndex >= 0) offsetRecords[rIndex] = record; else offsetRecords.unshift(record);
    saveDBFile('offset_records.json', offsetRecords);

    activeOffsetSaleId = String(sale.id || '');
    refreshOffsetSaleOptions();
    const select = getEl('offset-sale-select');
    if (select) select.value = activeOffsetSaleId;
    onOffsetSaleChanged();
    renderOffsetHistory();
    alert(`✅ Đã ghép hồ sơ VÀNG LẠ.\nMua vào: ${purchase.id}\nBán ra: ${sale.id}\nChênh lệch cấn trừ: ${dossier.netSettlement >= 0 ? 'Khách trả ' : 'KBL trả khách '}${formatVND(Math.abs(dossier.netSettlement))}.\nKhông thay đổi số tiền của hai phiếu nguồn.`);
}

function kblDossierFromStoredExchange(tx) {
    if (tx && tx.exchangeDossier && typeof tx.exchangeDossier === 'object') {
        const policy = String(tx.exchangeDossier.purchasePolicy || '');
        const version = Number(tx.exchangeDossier.version || 0);
        if (version >= 4 && ['ACTUAL_PURCHASE_RECORD','ACTUAL_BUY_SELL','MATCHED_OFFSET_POLICY_V1'].includes(policy)) {
            return tx.exchangeDossier;
        }
        // Dossier V2/V3 từng khóa phần vàng cũ theo một policy cũ. Nếu giao dịch còn
        // Phiếu Thu Mua thật đang liên kết, bỏ snapshot cũ và dựng lại phần HỒ SƠ từ
        // đúng giá mua đã chốt trên phiếu đó. Không đụng totalPay hay engine phiếu đổi.
        // Nếu dữ liệu quá cũ không còn phiếu Thu Mua nguồn thì giữ nguyên snapshot cũ,
        // tránh tự suy đoán lại lịch sử.
        const legacyLockedPolicy =
            (version >= 3 && policy === 'ALL_OLD_GOLD_AT_SELL_PRICE') ||
            (version >= 2 && policy === 'ALL_OLD_GOLD_AT_BUY_PRICE');
        if (legacyLockedPolicy && !kblLinkedPurchaseForTransaction(tx)) {
            return tx.exchangeDossier;
        }
    }
    if (!tx) return null;
    const saleLines = kblSnapshotNewSaleLines(Array.isArray(tx.items) ? tx.items : []);
    const saleGoldGross = Math.round(saleLines.reduce((sum, line) => sum + numberValue(line.goldValue), 0));
    const wageTotal = Math.round(saleLines.reduce((sum, line) => sum + numberValue(line.wage), 0));
    const mode = String(tx.mode || '').toLowerCase();
    const engineExchangeAdjustment = mode === 'doikbl'
        ? Math.round(numberValue(tx.smartExchange?.customerFormula?.goldDifferenceAmount || tx.goldCompensation))
        : Math.round(numberValue(tx.exchangeFee) + numberValue(tx.exchangeRefund));
    const discount = Math.round(Math.max(0, numberValue(tx.exchangeDiscount)));
    const netSettlement = Math.round(numberValue(tx.totalPay));
    const linkedPurchase = kblLinkedPurchaseForTransaction(tx);
    const purchaseLines = linkedPurchase
        ? kblPurchaseLinesForExchangeDossier(linkedPurchase)
        : kblPurchaseLinesAtSellPrice(Array.isArray(tx.oldItems) ? tx.oldItems : []);
    const purchaseGross = Math.round(purchaseLines.reduce((sum, line) => sum + numberValue(line.total), 0));
    const purchasePolicy = String(linkedPurchase?.exchangePurchasePolicy || 'ACTUAL_PURCHASE_RECORD');
    const matchedOffsetPolicy = purchasePolicy === 'MATCHED_OFFSET_POLICY_V1';
    const arithmeticExchangeAdjustment = matchedOffsetPolicy ? 0 : engineExchangeAdjustment;
    const baseSaleObligation = Math.round(saleGoldGross + wageTotal + arithmeticExchangeAdjustment - discount);
    const reconciliationAdjustment = Math.round(netSettlement - (baseSaleObligation - purchaseGross));
    const customerObligationGross = Math.round(baseSaleObligation + reconciliationAdjustment);
    const groupId = String(tx.transactionGroupId || linkedPurchase?.transactionGroupId || makeKblOffsetGroupId(tx));
    const purchaseDocumentId = String(linkedPurchase?.id || tx.exchangePurchaseRecordId || tx.exchangePurchaseDocId || makeKblExchangePurchaseDocId(tx));
    const clearingAmount = Math.max(0, Math.min(Math.max(0, purchaseGross), Math.max(0, customerObligationGross)));
    return {
        version: matchedOffsetPolicy ? 5 : 4,
        sourceType: 'exchange_engine',
        legacy: !linkedPurchase,
        createdAt: tx.dateRaw || '',
        transactionId: String(tx.id || ''),
        transactionGroupId: groupId,
        purchaseDocumentId,
        linkedPurchaseRecordId: String(linkedPurchase?.id || tx.exchangePurchaseRecordId || ''),
        mode,
        engine: 'stored-transaction-only',
        customer: {
            name: String(linkedPurchase?.name || tx.cusName || ''),
            cccd: String(linkedPurchase?.cccd || tx.cusCccd || ''),
            phone: String(linkedPurchase?.phone || tx.cusPhone || ''),
            address: String(linkedPurchase?.address || tx.cusAddress || '')
        },
        purchaseLines,
        purchaseGross,
        saleLines,
        saleGoldGross,
        wageTotal,
        exchangeAdjustment: arithmeticExchangeAdjustment,
        exchangeReferenceAdjustment: engineExchangeAdjustment,
        exchangeMatchedWeightLy: roundWeightLy(numberValue(linkedPurchase?.exchangeDocMatchedLy)),
        exchangeSurplusOldWeightLy: roundWeightLy(numberValue(linkedPurchase?.exchangeDocSurplusLy)),
        exchangeFeeRate: Math.round(numberValue(linkedPurchase?.exchangeDocFeeRate)),
        exchangeFeeAmount: Math.round(numberValue(linkedPurchase?.exchangeDocFeeAmount)),
        reconciliationAdjustment,
        discount,
        customerObligationGross,
        clearingAmount,
        netSettlement,
        payerText: netSettlement > 0
            ? `Khách hàng thanh toán KBL ${formatVND(netSettlement)}`
            : netSettlement < 0
                ? `KBL thanh toán khách hàng ${formatVND(Math.abs(netSettlement))}`
                : 'Không còn chênh lệch thanh toán',
        purchasePolicy
    };
}

function kblOffsetFingerprint(tx, dossier) {
    const linkedPurchase = kblLinkedPurchaseForTransaction(tx);
    const currentPurchaseGross = linkedPurchase
        ? Math.round((dossier?.sourceType === 'manual_buy_sell' ? kblPurchaseLinesFromActualRecord(linkedPurchase) : kblPurchaseLinesForExchangeDossier(linkedPurchase)).reduce((sum, line) => sum + numberValue(line.total), 0))
        : Math.round(numberValue(dossier && dossier.purchaseGross));
    return JSON.stringify({
        id: String(tx && tx.id || ''),
        dateRaw: String(tx && tx.dateRaw || ''),
        mode: String(tx && tx.mode || ''),
        dossierMode: String(dossier && dossier.mode || ''),
        sourceType: String(dossier && dossier.sourceType || ''),
        totalPay: Math.round(numberValue(tx && tx.totalPay)),
        cusName: String(tx && tx.cusName || ''),
        cusCccd: String(tx && tx.cusCccd || ''),
        cusPhone: String(tx && tx.cusPhone || ''),
        purchaseGross: Math.round(numberValue(dossier && dossier.purchaseGross)),
        currentPurchaseGross,
        purchaseUpdatedAt: String(linkedPurchase && linkedPurchase.updatedAt || linkedPurchase && linkedPurchase.rawDate || ''),
        saleGoldGross: Math.round(numberValue(dossier && dossier.saleGoldGross)),
        wageTotal: Math.round(numberValue(dossier && dossier.wageTotal)),
        exchangeAdjustment: Math.round(numberValue(dossier && dossier.exchangeAdjustment)),
        reconciliationAdjustment: Math.round(numberValue(dossier && dossier.reconciliationAdjustment)),
        purchaseDocumentId: String(dossier && dossier.purchaseDocumentId || ''),
        discount: Math.round(numberValue(dossier && dossier.discount)),
        netSettlement: Math.round(numberValue(dossier && dossier.netSettlement))
    });
}

function kblOffsetSelectedSale() {
    const id = String(getEl('offset-sale-select')?.value || activeOffsetSaleId || '');
    return (Array.isArray(salesStore) ? salesStore : []).find(tx => String(tx && tx.id || '') === id) || null;
}

function kblOffsetRecordForSale(sale) {
    if (!sale) return null;
    const groupId = String(sale.transactionGroupId || makeKblOffsetGroupId(sale));
    const rows = Array.isArray(offsetRecords) ? offsetRecords : [];
    const newest = list => [...list].sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0))[0] || null;
    // Ưu tiên đúng saleId trước; chỉ fallback theo mã nhóm nếu dữ liệu cũ chưa có saleId chuẩn.
    // Tránh một record lịch sử cũ cùng group làm nạp nhầm UNC/trạng thái của phiếu khác.
    const exactSale = rows.filter(record => String(record?.saleId || '') === String(sale.id || ''));
    if (exactSale.length) return newest(exactSale);
    return newest(rows.filter(record => String(record?.transactionGroupId || record?.id || '') === groupId));
}

function refreshOffsetSaleOptions() {
    const select = getEl('offset-sale-select');
    if (!select) return;
    const rows = (Array.isArray(salesStore) ? salesStore : [])
        .filter(tx => {
            const mode = String(tx && tx.mode || '').toLowerCase();
            if (['doi', 'doikbl'].includes(mode)) return true;
            return mode === 'ban' && tx?.exchangeDossier?.sourceType === 'manual_buy_sell';
        })
        .slice(0, 1500);
    const previous = String(select.value || activeOffsetSaleId || '');
    select.innerHTML = '<option value="">-- Chọn hồ sơ Đổi Ngang / Đổi Bù / Vàng lạ đã ghép --</option>' + rows.map(tx => {
        const dossier = kblDossierFromStoredExchange(tx);
        const net = kblOffsetNetSettlement(tx, dossier);
        const netText = net >= 0 ? `Khách trả ${formatVND(net)}` : `KBL trả ${formatVND(Math.abs(net))}`;
        return `<option value="${escapeHtml(tx.id)}">${escapeHtml(tx.id)} · ${escapeHtml(kblOffsetDossierModeText(tx, dossier))} · ${escapeHtml(tx.cusName || dossier?.customer?.name || 'Khách lẻ')} · ${escapeHtml(netText)}</option>`;
    }).join('');
    if (rows.some(tx => String(tx.id) === previous)) select.value = previous;
    else if (rows.length) select.value = String(rows[0].id || '');
    activeOffsetSaleId = String(select.value || '');
    refreshManualOffsetSources();
    kblLoadSavedOffsetInputs();
    renderOffsetDossier();
    renderOffsetHistory();
}

function onOffsetSaleChanged() {
    activeOffsetSaleId = String(getEl('offset-sale-select')?.value || '');
    kblLoadSavedOffsetInputs();
    renderOffsetDossier();
}

function kblLoadSavedOffsetInputs() {
    const sale = kblOffsetSelectedSale();
    const record = kblOffsetRecordForSale(sale);
    const values = {
        'offset-unc-no': record && record.uncNo || '',
        'offset-unc-date': record && record.uncDate || '',
        'offset-bank': record && record.bank || '',
        'offset-bank-ref': record && record.bankRef || ''
    };
    Object.entries(values).forEach(([id, value]) => {
        const el = getEl(id);
        if (el) el.value = value;
    });
}

function kblSignedVnd(value) {
    const n = Math.round(numberValue(value));
    if (n > 0) return `+ ${formatVND(n)}`;
    if (n < 0) return `- ${formatVND(Math.abs(n))}`;
    return formatVND(0);
}

function kblOffsetIntegrity(sale, dossier) {
    if (!sale || !dossier) return { ok: false, difference: 0, expected: 0, actual: 0 };

    const purchase = kblLinkedPurchaseForTransaction(sale);
    const saleLinesNow = kblSnapshotNewSaleLines(Array.isArray(sale.items) ? sale.items : []);
    const saleGoldGrossNow = Math.round(saleLinesNow.reduce((sum, line) => sum + numberValue(line.goldValue), 0));
    const wageTotalNow = Math.round(saleLinesNow.reduce((sum, line) => sum + numberValue(line.wage), 0));

    if (dossier.sourceType === 'manual_buy_sell') {
        if (!purchase) return { ok:false, difference:0, expected:0, actual:Math.round(numberValue(dossier.netSettlement)), reason:'missing-purchase' };
        const purchaseGrossNow = Math.round(kblPurchaseLinesFromActualRecord(purchase).reduce((sum, line) => sum + numberValue(line.total), 0));
        const saleTotalNow = Math.round(numberValue(sale.totalPay));
        const expected = Math.round(saleTotalNow - purchaseGrossNow);
        const actual = Math.round(numberValue(dossier.netSettlement));
        const saleDetailsMatch = saleGoldGrossNow === Math.round(numberValue(dossier.saleGoldGross)) &&
            wageTotalNow === Math.round(numberValue(dossier.wageTotal));
        const sourceAmountsMatch = purchaseGrossNow === Math.round(numberValue(dossier.purchaseGross)) &&
            saleTotalNow === Math.round(numberValue(dossier.customerObligationGross)) &&
            saleDetailsMatch;
        return {
            ok: expected === actual && sourceAmountsMatch,
            difference: expected - actual,
            expected,
            actual,
            purchaseGrossNow,
            saleTotalNow,
            saleGoldGrossNow,
            wageTotalNow,
            saleDetailsMatch,
            sourceAmountsMatch
        };
    }

    // Hồ sơ Đổi Bù / Đổi Ngang V4 trở lên phải còn đúng Phiếu Thu Mua liên kết.
    // Chỉ kiểm tra nguồn; tuyệt đối không thay đổi engine hay totalPay.
    if (Number(dossier.version || 0) >= 4 && dossier.sourceType === 'exchange_engine' && !purchase) {
        return {
            ok:false,
            difference:0,
            expected:Math.round(numberValue(sale.totalPay)),
            actual:Math.round(numberValue(sale.totalPay)),
            reason:'missing-purchase'
        };
    }

    const expected = Math.round(
        numberValue(dossier.saleGoldGross) +
        numberValue(dossier.wageTotal) +
        numberValue(dossier.exchangeAdjustment) +
        numberValue(dossier.reconciliationAdjustment) -
        numberValue(dossier.discount) -
        numberValue(dossier.purchaseGross)
    );
    const actual = Math.round(numberValue(sale.totalPay));

    let sourceAmountsMatch = true;
    let purchaseGrossNow = Math.round(numberValue(dossier.purchaseGross));
    if (purchase) {
        purchaseGrossNow = Math.round(kblPurchaseLinesForExchangeDossier(purchase).reduce((sum, line) => sum + numberValue(line.total), 0));
        sourceAmountsMatch = purchaseGrossNow === Math.round(numberValue(dossier.purchaseGross));
    }
    const saleDetailsMatch = saleGoldGrossNow === Math.round(numberValue(dossier.saleGoldGross)) &&
        wageTotalNow === Math.round(numberValue(dossier.wageTotal));
    sourceAmountsMatch = sourceAmountsMatch && saleDetailsMatch;

    return {
        ok: expected === actual && sourceAmountsMatch,
        difference: expected - actual,
        expected,
        actual,
        purchaseGrossNow,
        saleGoldGrossNow,
        wageTotalNow,
        saleDetailsMatch,
        sourceAmountsMatch
    };
}

function renderOffsetPurchaseLines(dossier) {
    const tbody = getEl('offset-purchase-lines');
    if (!tbody) return;
    const rows = Array.isArray(dossier && dossier.purchaseLines) ? dossier.purchaseLines : [];
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;">Phiếu đổi chưa có dữ liệu vàng cũ.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(line => `<tr>
        <td>${escapeHtml(line.name || 'Vàng trang sức cũ')}</td>
        <td>${escapeHtml(line.type || '')}</td>
        <td>${(numberValue(line.weightLy) / 100).toFixed(3)} chỉ</td>
        <td>${formatVND(numberValue(line.unitPrice))}/chỉ</td>
        <td><b>${formatVND(numberValue(line.total))}</b></td>
    </tr>`).join('') + `<tr><td colspan="4" style="text-align:right;font-weight:800;">TỔNG GIÁ TRỊ VÀNG CŨ:</td><td><b>${formatVND(numberValue(dossier.purchaseGross))}</b></td></tr>`;
}


function renderOffsetSaleLines(dossier) {
    const tbody = getEl('offset-sale-lines');
    if (!tbody) return;
    const rows = Array.isArray(dossier && dossier.saleLines) ? dossier.saleLines : [];
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748b;">Chưa có dữ liệu món mới bán ra.</td></tr>';
        return;
    }
    const isManual = dossier && dossier.sourceType === 'manual_buy_sell';
    const lineTotal = Math.round(rows.reduce((sum, line) => sum + numberValue(line.goldValue) + numberValue(line.wage) - numberValue(line.discount), 0));
    const matchedOffsetPolicy = dossier && dossier.purchasePolicy === 'MATCHED_OFFSET_POLICY_V1';
    const mode = String(dossier?.mode || '').toLowerCase();
    const matchedChi = numberValue(dossier?.exchangeMatchedWeightLy) / 100;
    const oldChi = (numberValue(dossier?.exchangeMatchedWeightLy) + numberValue(dossier?.exchangeSurplusOldWeightLy)) / 100;
    const exchangeRow = matchedOffsetPolicy
        ? (mode === 'doi'
            ? `<tr><td colspan="5" style="text-align:right;">Phí đổi bù toàn bộ vàng cũ: ${oldChi.toFixed(3)} chỉ × ${formatVND(dossier.exchangeFeeRate)}/chỉ <small>(đã nằm trong giá thu)</small>:</td><td><b>${formatVND(dossier.exchangeFeeAmount)}</b></td></tr>`
            : `<tr><td colspan="5" style="text-align:right;">Đổi ngang KBL: phần đối ứng ${matchedChi.toFixed(3)} chỉ theo giá bán ra:</td><td><b>${formatVND(0)}</b></td></tr>`)
        : (!isManual && numberValue(dossier.exchangeAdjustment) !== 0
            ? `<tr><td colspan="5" style="text-align:right;">Tiền bù / điều chỉnh theo phiếu đổi:</td><td><b>${kblSignedVnd(dossier.exchangeAdjustment)}</b></td></tr>` : '');
    const reconcileRow = numberValue(dossier.reconciliationAdjustment) !== 0
        ? `<tr><td colspan="5" style="text-align:right;">Điều chỉnh quy tắc/đối chiếu để khớp phiếu nguồn:</td><td><b>${kblSignedVnd(dossier.reconciliationAdjustment)}</b></td></tr>` : '';
    tbody.innerHTML = rows.map(line => `<tr>
        <td>${escapeHtml(line.itemName || 'Sản phẩm vàng')}</td>
        <td>${escapeHtml(line.type || '')}</td>
        <td>${(numberValue(line.weightLy) / 100).toFixed(3)} chỉ</td>
        <td>${formatVND(numberValue(line.priceSell))}/chỉ</td>
        <td>${formatVND(numberValue(line.wage))}</td>
        <td><b>${formatVND(numberValue(line.goldValue) + numberValue(line.wage) - numberValue(line.discount))}</b></td>
    </tr>`).join('') +
        `<tr><td colspan="5" style="text-align:right;">Tổng món mới + công − giảm giá:</td><td><b>${formatVND(lineTotal)}</b></td></tr>` +
        exchangeRow + reconcileRow +
        `<tr><td colspan="5" style="text-align:right;font-weight:800;">TỔNG NGHĨA VỤ BÁN RA SAU ĐIỀU CHỈNH:</td><td><b>${formatVND(numberValue(dossier.customerObligationGross))}</b></td></tr>`;
}

function offsetExchangeSlipHtml(sale, dossier) {
    if (!sale || !dossier) return '<div>Chưa có hồ sơ.</div>';
    const p = kblOffsetDateParts(sale.dateRaw);
    const c = dossier.customer || {};
    const net = kblOffsetNetSettlement(sale, dossier);
    const oldRows = (Array.isArray(dossier.purchaseLines) ? dossier.purchaseLines : []).map((line, index) => `<tr><td>${index+1}</td><td>${escapeHtml(line.name || '')}</td><td>${escapeHtml(line.type || '')}</td><td>${(numberValue(line.weightLy)/100).toFixed(3)} chỉ</td><td>${formatVND(line.unitPrice)}</td><td>${formatVND(line.total)}</td></tr>`).join('');
    const newRows = (Array.isArray(dossier.saleLines) ? dossier.saleLines : []).map((line, index) => `<tr><td>${index+1}</td><td>${escapeHtml(line.itemName || '')}</td><td>${escapeHtml(line.type || '')}</td><td>${(numberValue(line.weightLy)/100).toFixed(3)} chỉ</td><td>${formatVND(line.priceSell)}</td><td>${formatVND(line.wage)}</td><td>${formatVND(numberValue(line.goldValue)+numberValue(line.wage)-numberValue(line.discount))}</td></tr>`).join('');
    return `<div style="text-align:center;font-weight:bold;">CÔNG TY TNHH MTV VÀNG BẠC ĐÁ QUÝ KIM BẢO LÂM</div>
        <h1>PHIẾU ĐỔI BÙ VÀNG</h1>
        <div style="text-align:center;font-size:10.5px;">${escapeHtml(kblOffsetDossierModeText(sale,dossier))} · Ngày ${escapeHtml(p.display)} · Mã ${escapeHtml(dossier.transactionGroupId)}</div>
        <table><tr><td><b>Khách hàng</b></td><td>${escapeHtml(c.name || sale.cusName || '')}</td><td><b>CCCD</b></td><td>${escapeHtml(c.cccd || sale.cusCccd || '')}</td></tr><tr><td><b>Phiếu mua vào</b></td><td>${escapeHtml(dossier.purchaseDocumentId || '')}</td><td><b>Phiếu bán/đổi</b></td><td>${escapeHtml(sale.id || '')}</td></tr></table>
        <h2>VÀNG CŨ KBL MUA VÀO</h2><table><thead><tr><th>STT</th><th>Mô tả</th><th>Loại</th><th>TL</th><th>Giá mua</th><th>Thành tiền</th></tr></thead><tbody>${oldRows || '<tr><td colspan="6">Không có dữ liệu.</td></tr>'}</tbody></table>
        <h2>MÓN MỚI BÁN RA</h2><table><thead><tr><th>STT</th><th>Món</th><th>Loại</th><th>TL</th><th>Giá bán</th><th>Công</th><th>Thành tiền</th></tr></thead><tbody>${newRows || '<tr><td colspan="7">Không có dữ liệu.</td></tr>'}</tbody></table>
        <table>
            <tr><td><b>Tổng mua vào</b></td><td style="text-align:right">${formatVND(dossier.purchaseGross)}</td></tr>
            <tr><td>Món mới + công − giảm giá</td><td style="text-align:right">${formatVND(numberValue(dossier.saleGoldGross)+numberValue(dossier.wageTotal)-numberValue(dossier.discount))}</td></tr>
            ${dossier.sourceType === 'manual_buy_sell' ? '' : (dossier.purchasePolicy === 'MATCHED_OFFSET_POLICY_V1'
                ? (String(dossier.mode || sale.mode || '').toLowerCase() === 'doi'
                    ? `<tr><td>Phí đổi bù trên toàn bộ vàng cũ <small>(đã phản ánh trong giá thu)</small></td><td style="text-align:right">${formatVND(dossier.exchangeFeeAmount)}</td></tr>`
                    : `<tr><td>Đổi ngang KBL — phần đối ứng theo giá bán ra</td><td style="text-align:right">${formatVND(0)}</td></tr>`)
                : `<tr><td>Tiền bù / điều chỉnh phiếu đổi</td><td style="text-align:right">${kblSignedVnd(dossier.exchangeAdjustment)}</td></tr>`)}
            ${numberValue(dossier.reconciliationAdjustment) !== 0 ? `<tr><td>Điều chỉnh quy tắc/đối chiếu để khớp chứng từ nguồn</td><td style="text-align:right">${kblSignedVnd(dossier.reconciliationAdjustment)}</td></tr>` : ''}
            <tr><td><b>Tổng nghĩa vụ bán ra sau điều chỉnh</b></td><td style="text-align:right"><b>${formatVND(dossier.customerObligationGross)}</b></td></tr>
            <tr><td><b>Kết quả cuối sau cấn trừ mua vào</b></td><td style="text-align:right"><b>${net>=0 ? `Khách trả ${formatVND(net)}` : `KBL trả khách ${formatVND(Math.abs(net))}`}</b></td></tr>
        </table>
        <div style="font-size:10px;margin-top:3mm;">${dossier.sourceType === 'manual_buy_sell' ? 'Hồ sơ vàng lạ: số mua vào và bán ra lấy nguyên từ hai phiếu nguồn; không tính lại bằng engine Đổi Bù/Đổi Ngang.' : 'Kết quả tiền lấy nguyên từ phiếu đổi đã chốt; hồ sơ này không thay đổi công thức engine.'}</div>
        <div class="doc-sign"><div><b>KHÁCH HÀNG</b><br><small>Ký, ghi rõ họ tên</small></div><div><b>NGƯỜI LẬP</b><br><small>Ký, ghi rõ họ tên</small></div><div><b>NGƯỜI DUYỆT KBL</b><br><small>Ký, ghi rõ họ tên</small></div></div>`;
}

async function printOffsetExchangeSlipA4() {
    const sale = kblOffsetSelectedSale();
    const dossier = kblDossierFromStoredExchange(sale);
    if (!sale || !dossier) return alert('Hãy chọn hồ sơ đổi vàng trước khi in phiếu.');
    const integrity = kblOffsetIntegrity(sale, dossier);
    if (!integrity.ok) return alert('Nguồn mua/bán đã thay đổi hoặc số liệu không khớp. Không in để tránh sai chứng từ.');
    const result = await printKblA4Html(offsetExchangeSlipHtml(sale, dossier), 'Phiếu đổi bù vàng');
    if (!result?.success) alert(`⚠️ Chưa in được Phiếu đổi bù vàng: ${result?.failureReason || 'Không rõ lỗi'}`);
}

function kblOffsetBlankDocHtml() {
    return `<div style="text-align:center;font-weight:bold;">CÔNG TY TNHH MTV VÀNG BẠC ĐÁ QUÝ KIM BẢO LÂM</div>
        <h1>BIÊN BẢN ĐỐI CHIẾU SỐ LIỆU<br>VÀ XÁC NHẬN THANH TOÁN BÙ TRỪ</h1>
        <div style="margin-top:25mm;text-align:center;color:#666;">Chọn một hồ sơ Đổi Ngang / Đổi Bù hoặc ghép Mua vào + Bán ra của vàng lạ để xem hồ sơ.</div>`;
}

function offsetDocHtml(sale, dossier) {
    if (!sale || !dossier) return kblOffsetBlankDocHtml();
    const p = kblOffsetDateParts(sale.dateRaw);
    const customer = dossier.customer || {};
    const net = kblOffsetNetSettlement(sale, dossier);
    const payer = net > 0
        ? `Khách hàng thanh toán cho KBL: ${formatVND(net)}`
        : net < 0
            ? `KBL còn thanh toán khách hàng: ${formatVND(Math.abs(net))}`
            : 'Hai bên không còn chênh lệch thanh toán';

    const settlementAmount = Math.abs(net);
    const isPaymentSlip = net < 0;
    const isReceiptSlip = net > 0;
    const slipTitle = isPaymentSlip ? 'PHIẾU CHI' : 'PHIẾU THU';
    const slipSubtitle = isPaymentSlip
        ? 'Thanh toán phần khách hàng còn dư sau bù trừ'
        : 'Thu phần khách hàng còn thiếu sau bù trừ';
    const slipReasonLabel = isPaymentSlip ? 'Lý do chi' : 'Lý do thu';
    const slipPersonLabel = isPaymentSlip ? 'Họ tên người nhận tiền' : 'Họ tên người nộp tiền';
    const slipPersonSign = isPaymentSlip ? 'NGƯỜI NHẬN TIỀN' : 'NGƯỜI NỘP TIỀN';
    const slipReason = isPaymentSlip
        ? 'Thanh toán phần khách hàng còn dư sau bù trừ'
        : 'Thu phần khách hàng còn thiếu sau bù trừ';
    const slipHtml = (isPaymentSlip || isReceiptSlip) ? `
        <div class="kbl-offset-divider"></div>
        <section class="kbl-offset-slip">
            <div style="text-align:center;font-weight:bold;">CÔNG TY TNHH MTV VÀNG BẠC ĐÁ QUÝ KIM BẢO LÂM</div>
            <div style="text-align:center;font-size:10.5px;">MST: 3703496362 · 59/1 Nguyễn Thị Tươi, P. Tân Đông Hiệp, TP. Hồ Chí Minh</div>
            <div class="kbl-offset-slip-title">${slipTitle}</div>
            <div class="kbl-offset-slip-subtitle">${slipSubtitle}</div>
            <table class="kbl-offset-slip-table">
                <tr><td style="width:24%;"><b>Số phiếu</b></td><td>……………………</td><td style="width:12%;"><b>Ngày</b></td><td>${escapeHtml(p.display)}</td></tr>
                <tr><td><b>${slipPersonLabel}</b></td><td colspan="3">${escapeHtml(customer.name || sale.cusName || '')}</td></tr>
                <tr><td><b>${slipReasonLabel}</b></td><td colspan="3">${escapeHtml(slipReason)}</td></tr>
                <tr><td><b>Số tiền</b></td><td colspan="3"><b>${formatVND(settlementAmount)}</b></td></tr>
                <tr><td><b>Bằng chữ</b></td><td colspan="3"><i>${escapeHtml(dichSoThanhChu(settlementAmount))}</i></td></tr>
                <tr><td><b>Kèm theo</b></td><td colspan="3">Biên bản đối chiếu số liệu và xác nhận thanh toán bù trừ</td></tr>
            </table>
            <div class="kbl-offset-slip-sign">
                <div><b>NGƯỜI LẬP PHIẾU</b><br><small>Ký, ghi rõ họ tên</small></div>
                <div><b>THỦ QUỸ</b><br><small>Ký, ghi rõ họ tên</small></div>
                <div><b>${slipPersonSign}</b><br><small>Ký, ghi rõ họ tên</small></div>
            </div>
        </section>` : '';

    return `<style>
        .kbl-offset-top{height:142mm;overflow:hidden;}
        .kbl-offset-top .kbl-offset-sign{display:grid;grid-template-columns:repeat(2,1fr);gap:18mm;text-align:center;margin-top:8mm;min-height:30mm;align-items:start;}
        .kbl-offset-top .kbl-offset-sign>div{min-height:30mm;}
        .kbl-offset-divider{border-top:1px dashed #555;margin:0 0 4mm;position:relative;}
        .kbl-offset-divider:before{content:'✂';position:absolute;left:-1mm;top:-10px;background:#fff;padding-right:2mm;font-size:13px;}
        .kbl-offset-slip{min-height:118mm;padding-top:1mm;}
        .kbl-offset-slip-title{text-align:center;font-size:18px;font-weight:700;margin:4mm 0 1mm;}
        .kbl-offset-slip-subtitle{text-align:center;font-size:11px;font-weight:700;margin-bottom:3mm;}
        .kbl-offset-slip-table{font-size:10.5px;margin-top:2mm;}
        .kbl-offset-slip-sign{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;text-align:center;margin-top:10mm;min-height:36mm;align-items:start;}
        .kbl-offset-slip-sign>div{min-height:36mm;}
    </style>
    <section class="kbl-offset-top">
        <div style="text-align:center;font-weight:bold;">CÔNG TY TNHH MTV VÀNG BẠC ĐÁ QUÝ KIM BẢO LÂM</div>
        <div style="text-align:center;font-size:10.5px;">MST: 3703496362 · 59/1 Nguyễn Thị Tươi, P. Tân Đông Hiệp, TP. Hồ Chí Minh</div>
        <h1>BIÊN BẢN ĐỐI CHIẾU SỐ LIỆU<br>VÀ XÁC NHẬN THANH TOÁN BÙ TRỪ</h1>
        <div style="text-align:center;font-size:11px;">Ngày giao dịch: ${escapeHtml(p.display)}</div>
        <h2>1. THÔNG TIN KHÁCH HÀNG</h2>
        <table><tr><td><b>Họ tên</b></td><td>${escapeHtml(customer.name || sale.cusName || '')}</td><td><b>CCCD</b></td><td>${escapeHtml(customer.cccd || sale.cusCccd || '')}</td></tr>
        <tr><td><b>SĐT</b></td><td>${escapeHtml(customer.phone || sale.cusPhone || '')}</td><td><b>Địa chỉ</b></td><td>${escapeHtml(customer.address || sale.cusAddress || '')}</td></tr></table>
        <h2>2. CHỨNG TỪ LIÊN KẾT</h2>
        <table><tr><td style="width:22%;"><b>Phiếu thu mua</b></td><td colspan="3">${escapeHtml(dossier.purchaseDocumentId)}</td></tr>
        <tr><td><b>Loại hồ sơ</b></td><td colspan="3">${escapeHtml(kblOffsetDossierModeText(sale, dossier))}</td></tr></table>
        <h2>3. ĐỐI CHIẾU DÒNG TIỀN</h2>
        <table>
            <tr><td>A — Giá trị vàng cũ KBL mua vào</td><td style="text-align:right"><b>${formatVND(dossier.purchaseGross)}</b></td></tr>
            <tr><td>B — Tiền vàng món mới bán ra</td><td style="text-align:right">${formatVND(dossier.saleGoldGross)}</td></tr>
            <tr><td>Tiền công món mới</td><td style="text-align:right">${formatVND(dossier.wageTotal)}</td></tr>
            <tr><td>Giảm giá đã chốt</td><td style="text-align:right">${numberValue(dossier.discount) ? `- ${formatVND(dossier.discount)}` : formatVND(0)}</td></tr>
            <tr><td><b>Tổng cộng tiền món mới</b></td><td style="text-align:right"><b>${formatVND(numberValue(dossier.saleGoldGross) + numberValue(dossier.wageTotal) - numberValue(dossier.discount))}</b></td></tr>
            <tr><td><b>Số tiền hai bên bù trừ</b></td><td style="text-align:right"><b>${formatVND(dossier.clearingAmount)}</b></td></tr>
            <tr><td><b>Kết quả thanh toán</b></td><td style="text-align:right"><b>${escapeHtml(payer)}</b></td></tr>
        </table>
        <div class="kbl-offset-sign"><div><b>KHÁCH HÀNG</b><br><small>Ký, ghi rõ họ tên</small></div><div><b>NGƯỜI LẬP</b><br><small>Ký, ghi rõ họ tên</small></div></div>
    </section>
    ${slipHtml}`;
}

function offsetPurchaseA4Html(sale, dossier) {
    if (!sale || !dossier) return '<div>Chưa có dữ liệu.</div>';
    const p = kblOffsetDateParts(sale.dateRaw);
    const c = dossier.customer || {};
    const rows = (Array.isArray(dossier.purchaseLines) ? dossier.purchaseLines : []).map((line, index) => `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(p.display)}</td>
        <td>${escapeHtml(c.name || sale.cusName || '')}</td>
        <td style="text-align:left">${escapeHtml(c.address || sale.cusAddress || '')}</td>
        <td>${escapeHtml(c.cccd || sale.cusCccd || '')}</td>
        <td>${escapeHtml(c.phone || sale.cusPhone || '')}</td>
        <td>${escapeHtml(`${line.name || 'Vàng trang sức cũ'}${line.type ? ` ${line.type}` : ''}`)}</td>
        <td>${(numberValue(line.weightLy) / 100).toFixed(3)} chỉ</td>
        <td>${formatVND(line.unitPrice)}</td>
        <td>${formatVND(line.total)}</td>
        <td>${escapeHtml(dossier.transactionGroupId)}</td>
    </tr>`).join('');
    return `<div style="display:flex;justify-content:space-between;font-size:10px;gap:10mm;">
        <div><div>CÔNG TY TNHH MTV VÀNG BẠC ĐÁ QUÝ KIM BẢO LÂM</div><div>Mã số thuế: <b>3703496362</b></div><div>Địa chỉ: 59/1 Nguyễn Thị Tươi, P. Tân Đông Hiệp, TP. Hồ Chí Minh</div><div>Số điện thoại: 0985.325.806 - 0899.979797</div></div>
        <div style="text-align:center"><b style="font-size:14px">Mẫu số: 02/TNDN</b><br><i>(Theo mẫu đang sử dụng trong POS)</i></div>
    </div>
    <h1 style="margin-top:8mm">BẢNG KÊ THU MUA HÀNG HÓA, DỊCH VỤ<br><span style="font-size:15px">KHÔNG CÓ HÓA ĐƠN</span></h1>
    <div style="text-align:center;font-style:italic;margin-bottom:4mm;">Ngày ${escapeHtml(p.display)} · Phiếu hồ sơ: <b>${escapeHtml(dossier.purchaseDocumentId)}</b></div>
    <table style="font-size:8.5px;table-layout:fixed;"><thead><tr><th>STT</th><th>Ngày mua</th><th>Tên người bán</th><th>Địa chỉ</th><th>CCCD</th><th>SĐT</th><th>Hàng hóa</th><th>Trọng lượng</th><th>Đơn giá</th><th>Thành tiền</th><th>Ghi chú</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="11">Không có dòng vàng cũ.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="9" style="text-align:right"><b>TỔNG CỘNG</b></td><td><b>${formatVND(dossier.purchaseGross)}</b></td><td></td></tr></tfoot></table>
    <div style="font-size:10px;margin-top:4mm;">Mã nhóm giao dịch liên kết: <b>${escapeHtml(dossier.transactionGroupId)}</b>. ${dossier.purchasePolicy === 'MATCHED_OFFSET_POLICY_V1' ? (String(dossier.mode || sale.mode || '').toLowerCase() === 'doi' ? 'Phần vàng đối ứng dùng đơn giá thu đổi = giá bán ra − mức bù; phần vàng cũ dư dùng giá mua vào. Mức bù chỉ áp dụng trên trọng lượng đối ứng.' : 'Phần vàng đối ứng Đổi Ngang KBL dùng giá bán ra; phần vàng cũ dư dùng giá mua vào.') : 'Giá trị trên bảng kê lấy nguyên từ Phiếu Thu Mua theo giá mua vào/giá thực tế đã chốt; tiền công, giá bán ra và khoản điều chỉnh (nếu có) được thể hiện riêng tại hồ sơ đối chiếu.'}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20mm;text-align:center;margin-top:12mm;min-height:30mm;"><div><b>NGƯỜI BÁN</b><br><small>(Ký, ghi rõ họ tên)</small></div><div><b>NGƯỜI ĐẠI DIỆN / ĐƯỢC ỦY QUYỀN CỦA DOANH NGHIỆP</b><br><small>(Ký, họ tên, đóng dấu)</small></div></div>`;
}

function renderOffsetDossier() {
    const sale = kblOffsetSelectedSale();
    const dossier = kblDossierFromStoredExchange(sale);
    const sheet = getEl('offset-a4-sheet');
    if (sheet) sheet.innerHTML = offsetDocHtml(sale, dossier);

    const status = getEl('offset-status');
    const note = getEl('offset-check-note');
    if (!sale || !dossier) {
        if (status) status.innerText = 'Chưa chọn hồ sơ đổi';
        ['offset-group-id','offset-purchase-doc-id','offset-customer','offset-identity','offset-purchase-gross','offset-sale-gold','offset-wage','offset-adjustment','offset-reconcile-adjustment','offset-discount','offset-net','offset-clearing','offset-payer'].forEach(id => {
            const el = getEl(id); if (el) el.value = '';
        });
        renderOffsetPurchaseLines(null);
        renderOffsetSaleLines(null);
        if (note) { note.className = 'kbl-ok-note'; note.innerText = 'Chưa có dữ liệu để kiểm tra.'; }
        return;
    }

    const net = kblOffsetNetSettlement(sale, dossier);
    const integrity = kblOffsetIntegrity(sale, dossier);
    const record = kblOffsetRecordForSale(sale);
    const fingerprintChanged = Boolean(record && record.sourceFingerprint && record.sourceFingerprint !== kblOffsetFingerprint(sale, dossier));
    const isManual = dossier.sourceType === 'manual_buy_sell';
    const fields = {
        'offset-group-id': dossier.transactionGroupId || makeKblOffsetGroupId(sale),
        'offset-purchase-doc-id': dossier.purchaseDocumentId || makeKblExchangePurchaseDocId(sale),
        'offset-customer': dossier.customer?.name || sale.cusName || '',
        'offset-identity': [dossier.customer?.cccd || sale.cusCccd || '', dossier.customer?.phone || sale.cusPhone || ''].filter(Boolean).join(' · '),
        'offset-purchase-gross': formatVND(dossier.purchaseGross),
        'offset-sale-gold': formatVND(dossier.saleGoldGross),
        'offset-wage': formatVND(dossier.wageTotal),
        'offset-adjustment': isManual
            ? formatVND(0)
            : (dossier.purchasePolicy === 'MATCHED_OFFSET_POLICY_V1'
                ? (String(dossier.mode || sale.mode || '').toLowerCase() === 'doi'
                    ? `Đã nằm trong giá thu: ${formatVND(dossier.exchangeFeeAmount)}`
                    : 'Đổi ngang: 0đ tiền bù')
                : kblSignedVnd(dossier.exchangeAdjustment)),
        'offset-reconcile-adjustment': kblSignedVnd(dossier.reconciliationAdjustment),
        'offset-discount': formatVND(dossier.discount),
        'offset-net': net >= 0 ? `Khách trả ${formatVND(net)}` : `KBL trả khách ${formatVND(Math.abs(net))}`,
        'offset-clearing': formatVND(dossier.clearingAmount),
        'offset-payer': dossier.payerText || ''
    };
    Object.entries(fields).forEach(([id, value]) => { const el = getEl(id); if (el) el.value = value; });
    renderOffsetPurchaseLines(dossier);
    renderOffsetSaleLines(dossier);

    if (note) {
        if (!integrity.ok) {
            note.className = 'kbl-warn-note';
            note.innerHTML = isManual
                ? `⚠️ Phiếu mua/bán nguồn đã thay đổi hoặc số cấn trừ không còn khớp. Nguồn hiện tại cho ra <b>${integrity.expected >= 0 ? 'khách trả ' : 'KBL trả khách '}${formatVND(Math.abs(integrity.expected))}</b>; snapshot hồ sơ là <b>${integrity.actual >= 0 ? 'khách trả ' : 'KBL trả khách '}${formatVND(Math.abs(integrity.actual))}</b>. Không in/lưu lại trước khi kiểm tra.`
                : (integrity.reason === 'missing-purchase'
                    ? '⚠️ Hồ sơ Đổi Bù/Đổi Ngang không còn tìm thấy Phiếu Thu Mua liên kết. Hệ thống khóa in/lưu biên bản để tránh đoán số tiền.'
                    : `⚠️ Phiếu nguồn hoặc snapshot hồ sơ không còn khớp. Phiếu đổi hiện tại: <b>${formatVND(integrity.actual)}</b>; hồ sơ suy ra: <b>${formatVND(integrity.expected)}</b>. Không in/lưu biên bản trước khi kiểm tra.`);
        } else if (fingerprintChanged) {
            note.className = 'kbl-warn-note';
            note.innerHTML = '⚠️ Phiếu nguồn đã thay đổi sau lần lưu biên bản trước. Trạng thái hồ sơ: <b>CẦN LẬP LẠI</b>.';
        } else if (dossier.legacy) {
            note.className = 'kbl-warn-note';
            note.innerHTML = '⚠️ Đây là giao dịch cũ chưa có snapshot hồ sơ tại thời điểm chốt. Hãy kiểm tra chứng từ nguồn trước khi in.';
        } else if (isManual) {
            note.className = 'kbl-ok-note';
            note.innerHTML = `✅ Hồ sơ <b>VÀNG LẠ — MUA VÀO / BÁN RA</b> khớp hai phiếu nguồn. Mua vào ${formatVND(dossier.purchaseGross)} · Bán ra ${formatVND(dossier.customerObligationGross)} · ${net >= 0 ? 'Khách trả ' : 'KBL trả khách '}${formatVND(Math.abs(net))}. Hai phiếu gốc không bị sửa.`;
        } else {
            note.className = 'kbl-ok-note';
            note.innerHTML = `✅ Hồ sơ khớp phiếu đổi: <b>${kblOffsetDossierModeText(sale, dossier)}</b> · Kết quả cuối <b>${net >= 0 ? 'khách trả ' : 'KBL trả khách '}${formatVND(Math.abs(net))}</b>. Engine Đổi Bù/Đổi Ngang không bị tính lại.`;
        }
    }
    if (status) status.innerText = !integrity.ok ? 'Cần kiểm tra số liệu' : fingerprintChanged ? 'Cần lập lại biên bản' : record ? 'Đã có hồ sơ' : 'Sẵn sàng lập hồ sơ';
}

function openSelectedExchangePurchase() {
    const sale = kblOffsetSelectedSale();
    const dossier = kblDossierFromStoredExchange(sale);
    if (!sale || !dossier) return alert('Hãy chọn hồ sơ đổi vàng trước.');
    const purchase = kblLinkedPurchaseForTransaction(sale) || dataStoreRecords.find(record => String(record?.id || '') === String(dossier.purchaseDocumentId || ''));
    if (!purchase) return alert('Giao dịch này chưa có phiếu Thu Mua thật trong Tab 1. Đây có thể là dữ liệu cũ trước khi bật liên kết 3 tab.');
    switchTab('tab-thumua');
    viewOldPurchaseRecord(purchase.id);
}

function openSelectedExchangeInvoice() {
    const sale = kblOffsetSelectedSale();
    if (!sale) return alert('Hãy chọn hồ sơ đổi vàng trước.');
    switchTab('tab-banhang');
    setSellMode(String(sale.mode || 'doi'));
    viewSalesInvoice(sale.id);
}

async function printSelectedExchangeInvoice() {
    const sale = kblOffsetSelectedSale();
    if (!sale) return alert('Hãy chọn hồ sơ đổi vàng trước.');
    if (typeof printSalesInvoiceById !== 'function') return alert('Không tìm thấy chức năng in phiếu bán/đổi gốc.');
    return printSalesInvoiceById(String(sale.id || ''));
}

function kblPersistLegacyDossierIfNeeded(sale, dossier) {
    if (!sale || !dossier) return;
    const existingPolicy = String(sale.exchangeDossier?.purchasePolicy || '');
    const existingVersion = Number(sale.exchangeDossier?.version || 0);
    const staleLegacyPolicy =
        (existingVersion >= 3 && existingPolicy === 'ALL_OLD_GOLD_AT_SELL_PRICE') ||
        (existingVersion >= 2 && existingPolicy === 'ALL_OLD_GOLD_AT_BUY_PRICE');
    const mayMigrateLinkedHistory = staleLegacyPolicy && Boolean(kblLinkedPurchaseForTransaction(sale));
    if (sale.exchangeDossier && !mayMigrateLinkedHistory) return;

    sale.transactionGroupId = sale.transactionGroupId || dossier.transactionGroupId || makeKblOffsetGroupId(sale);
    sale.exchangePurchaseDocId = sale.exchangePurchaseDocId || dossier.purchaseDocumentId || makeKblExchangePurchaseDocId(sale);
    sale.exchangeDossier = {
        ...dossier,
        transactionGroupId: sale.transactionGroupId,
        purchaseDocumentId: sale.exchangePurchaseDocId,
        migratedFromPolicy: mayMigrateLinkedHistory ? existingPolicy : String(dossier.migratedFromPolicy || '')
    };
    saveDBFile('sales_db.json', salesStore);
}

function saveOffsetRecord() {
    const sale = kblOffsetSelectedSale();
    const dossier = kblDossierFromStoredExchange(sale);
    if (!sale || !dossier) return alert('Hãy chọn một hồ sơ Đổi Ngang / Đổi Bù / Vàng lạ trước.');
    const integrity = kblOffsetIntegrity(sale, dossier);
    if (!integrity.ok) return alert('Hồ sơ không còn khớp chứng từ nguồn. Hãy kiểm tra Phiếu Thu Mua và Phiếu Bán/Đổi trước khi lưu biên bản.');

    kblPersistLegacyDossierIfNeeded(sale, dossier);
    const finalDossier = sale.exchangeDossier || dossier;
    const groupId = String(sale.transactionGroupId || finalDossier.transactionGroupId || makeKblOffsetGroupId(sale));
    const old = kblOffsetRecordForSale(sale);
    const now = new Date().toISOString();
    const net = kblOffsetNetSettlement(sale, finalDossier);
    const record = {
        ...(old || {}),
        id: groupId,
        saleId: String(sale.id || ''),
        purchaseDocumentId: String(finalDossier.purchaseDocumentId || ''),
        transactionGroupId: groupId,
        sourceType: String(finalDossier.sourceType || 'exchange_engine'),
        dossierMode: String(finalDossier.mode || sale.mode || ''),
        customerName: String(finalDossier.customer?.name || sale.cusName || ''),
        cccd: String(finalDossier.customer?.cccd || sale.cusCccd || ''),
        purchaseGross: Math.round(numberValue(finalDossier.purchaseGross)),
        linkedPurchaseRecordId: String(finalDossier.linkedPurchaseRecordId || sale.exchangePurchaseRecordId || ''),
        reconciliationAdjustment: Math.round(numberValue(finalDossier.reconciliationAdjustment)),
        customerObligationGross: Math.round(numberValue(finalDossier.customerObligationGross)),
        clearingAmount: Math.round(numberValue(finalDossier.clearingAmount)),
        netSettlement: net,
        payerText: String(finalDossier.payerText || ''),
        uncNo: getEl('offset-unc-no')?.value.trim() || '',
        uncDate: getEl('offset-unc-date')?.value || '',
        bank: getEl('offset-bank')?.value.trim() || '',
        bankRef: getEl('offset-bank-ref')?.value.trim() || '',
        sourceFingerprint: kblOffsetFingerprint(sale, finalDossier),
        status: 'Đã lập',
        createdAt: old && old.createdAt || now,
        updatedAt: now
    };
    // Một mã nhóm/sale chỉ có một hồ sơ đối chiếu đã lưu. Dọn record trùng cũ trước khi ghi lại.
    offsetRecords = (Array.isArray(offsetRecords) ? offsetRecords : []).filter(item =>
        String(item?.id || '') !== groupId &&
        String(item?.transactionGroupId || '') !== groupId &&
        String(item?.saleId || '') !== String(sale.id || '')
    );
    offsetRecords.unshift(record);
    saveDBFile('offset_records.json', offsetRecords);
    renderOffsetDossier();
    renderOffsetHistory();
    alert(`✅ Đã lưu hồ sơ đối chiếu ${groupId}.\nLoại: ${kblOffsetDossierModeText(sale, finalDossier)}.\nCác phiếu nguồn và công thức tính tiền gốc không bị thay đổi.`);
}

function kblOffsetHistoryDedupedRecords() {
    const source = Array.isArray(offsetRecords) ? offsetRecords : [];
    const sorted = [...source].sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0));
    const seen = new Set();
    const result = [];
    sorted.forEach(record => {
        if (!record || typeof record !== 'object') return;
        const key = String(record.transactionGroupId || record.id || record.saleId || '').trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        result.push(record);
    });
    return result;
}

function renderOffsetHistory() {
    const tbody = getEl('offset-history-body');
    if (!tbody) return;
    const q = String(getEl('offset-history-search')?.value || '').trim().toLowerCase();

    // LỊCH SỬ chỉ hiển thị hồ sơ ĐỐI CHIẾU đã được lưu/ghép thật trong offset_records.json.
    // Giao dịch nguồn chưa lưu vẫn nằm ở ô "Chọn hồ sơ" phía trên để người dùng lập hồ sơ,
    // nhưng không tự sinh thêm một dòng giả trong Lịch sử. Như vậy một mã nhóm chỉ có một hồ sơ.
    const rows = kblOffsetHistoryDedupedRecords();
    const filtered = q ? rows.filter(record => {
        const sale = kblManualOffsetSaleById(record.saleId);
        const dossier = sale ? kblDossierFromStoredExchange(sale) : null;
        const modeLabel = kblOffsetModeText(record.dossierMode || dossier?.mode || sale?.mode || '');
        return [record.id, record.transactionGroupId, record.saleId, record.purchaseDocumentId, record.customerName, record.cccd, record.status, modeLabel, record.uncNo, record.bank, record.bankRef]
            .some(v => String(v || '').toLowerCase().includes(q));
    }) : rows;

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#64748b;">Chưa có hồ sơ đối chiếu đã lưu.</td></tr>';
        const count = getEl('offset-history-count'); if (count) count.innerText = '0 hồ sơ';
        return;
    }

    tbody.innerHTML = filtered.map(record => {
        const sale = kblManualOffsetSaleById(record.saleId);
        const dossier = sale ? kblDossierFromStoredExchange(sale) : null;
        const modeLabel = kblOffsetModeText(record.dossierMode || dossier?.mode || sale?.mode || '');
        const dt = kblOffsetDateParts(record.updatedAt || record.createdAt || sale?.dateRaw);
        const net = Math.round(numberValue(record.netSettlement));
        const statusText = String(record.status || '');
        const rid = String(record.id || record.transactionGroupId || '').replace(/'/g, "\\'");
        const sourceMissing = !sale;
        return `<tr>
            <td>${escapeHtml(dt.display)}</td>
            <td>${escapeHtml(record.id || record.transactionGroupId || '')}<div style="font-size:9px;color:#64748b;">${escapeHtml(statusText)}${sourceMissing ? ' · Thiếu phiếu bán/đổi nguồn' : ''}</div></td>
            <td>${escapeHtml(modeLabel)}</td>
            <td>${escapeHtml(record.purchaseDocumentId || '')}</td>
            <td>${escapeHtml(record.saleId || '')}</td>
            <td>${escapeHtml(record.customerName || '')}</td>
            <td>${formatVND(record.purchaseGross)}</td>
            <td>${formatVND(record.customerObligationGross)}</td>
            <td style="font-weight:800;color:${net >= 0 ? '#b45309' : '#047857'};">${net >= 0 ? 'KH trả ' : 'KBL trả '}${formatVND(Math.abs(net))}</td>
            <td style="white-space:nowrap;">
                <button type="button" class="btn btn-blue" style="padding:4px 7px;font-size:10px;margin:1px;" onclick="openOffsetHistoryRecord('${rid}')">Mở</button>
                <button type="button" class="btn" style="padding:4px 7px;font-size:10px;margin:1px;background:#b7791f;color:#fff;" onclick="editOffsetHistoryRecord('${rid}')">✏️ Sửa</button>
                <button type="button" class="btn btn-primary" style="padding:4px 7px;font-size:10px;margin:1px;" onclick="printOffsetHistoryRecord('${rid}')">🖨️ Biên bản</button>
                <button type="button" class="btn btn-red" style="padding:4px 7px;font-size:10px;margin:1px;" onclick="deleteOffsetHistoryRecord('${rid}')">🗑 Xóa</button>
            </td>
        </tr>`;
    }).join('');
    const count = getEl('offset-history-count'); if (count) count.innerText = `${filtered.length} hồ sơ`;
}

function kblFindOffsetHistoryRecord(recordId) {
    const key = String(recordId || '');
    return (Array.isArray(offsetRecords) ? offsetRecords : []).find(item =>
        String(item?.id || '') === key || String(item?.transactionGroupId || '') === key
    ) || null;
}

function openOffsetHistoryRecord(recordId) {
    const record = kblFindOffsetHistoryRecord(recordId);
    let sale = record ? kblManualOffsetSaleById(record.saleId) : null;
    if (!sale) {
        sale = (Array.isArray(salesStore) ? salesStore : []).find(tx => {
            const dossier = kblDossierFromStoredExchange(tx);
            return dossier && String(dossier.transactionGroupId || makeKblOffsetGroupId(tx)) === String(recordId || '');
        }) || null;
    }
    if (!sale) return alert('Không tìm thấy phiếu bán/đổi nguồn của hồ sơ này. Có thể xóa dòng lịch sử nếu đây là hồ sơ sai, nhưng hệ thống không tự sửa số tiền nguồn.');
    activeOffsetSaleId = String(sale.id || '');
    refreshOffsetSaleOptions();
    const select = getEl('offset-sale-select');
    if (select) select.value = activeOffsetSaleId;
    kblLoadSavedOffsetInputs();
    renderOffsetDossier();
    const top = getEl('offset-sale-select'); if (top?.scrollIntoView) top.scrollIntoView({ behavior:'smooth', block:'center' });
    return true;
}

function editOffsetHistoryRecord(recordId) {
    const opened = openOffsetHistoryRecord(recordId);
    if (!opened) return;
    const status = getEl('offset-status');
    if (status) status.innerText = 'Đang sửa hồ sơ đã lưu';
    const note = getEl('offset-check-note');
    if (note) {
        note.className = 'kbl-warn-note';
        note.innerHTML = '✏️ Đang sửa hồ sơ đã lưu. Có thể sửa UNC / ngày / ngân hàng / mã giao dịch rồi bấm <b>Lưu hồ sơ đối chiếu</b>. Nếu sai Phiếu Thu Mua hoặc Phiếu Bán/Đổi, hãy mở đúng phiếu nguồn để sửa hoặc xóa hồ sơ này rồi lập lại. Các số tiền nguồn và công thức vẫn khóa đọc từ chứng từ đã chốt.';
    }
    const target = getEl('offset-unc-no'); if (target?.scrollIntoView) target.scrollIntoView({ behavior:'smooth', block:'center' });
}

async function printOffsetHistoryRecord(recordId) {
    const opened = openOffsetHistoryRecord(recordId);
    if (!opened) return;
    return printOffsetA4();
}

function deleteOffsetHistoryRecord(recordId) {
    const key = String(recordId || '');
    const record = kblFindOffsetHistoryRecord(key);
    if (!record) return alert('Không tìm thấy hồ sơ đối chiếu đã lưu để xóa.');

    const isManual = String(record.sourceType || '') === 'manual_buy_sell';
    const manualNote = isManual
        ? `\n\nHồ sơ VÀNG LẠ sẽ được GỠ LIÊN KẾT mua/bán để có thể chọn lại đúng phiếu và ghép lại. Hai phiếu nguồn vẫn giữ nguyên.`
        : '';
    const message = `Xóa hồ sơ đối chiếu ${record.id || record.transactionGroupId || key}?\n\nChỉ xóa BIÊN BẢN/HỒ SƠ ĐỐI CHIẾU đã lưu khỏi lịch sử.\nKHÔNG xóa Phiếu Thu Mua Tab 1.\nKHÔNG xóa Phiếu Bán/Đổi.\nKHÔNG thay đổi công thức hay số tiền đã chốt.${manualNote}`;
    if (!window.confirm(message)) return;

    const saleId = String(record.saleId || '');
    const groupId = String(record.transactionGroupId || record.id || key);
    offsetRecords = (Array.isArray(offsetRecords) ? offsetRecords : []).filter(item => {
        const sameId = String(item?.id || '') === key;
        const sameGroup = groupId && String(item?.transactionGroupId || item?.id || '') === groupId;
        const sameSale = saleId && String(item?.saleId || '') === saleId;
        return !(sameId || sameGroup || sameSale);
    });
    saveDBFile('offset_records.json', offsetRecords);

    // Với VÀNG LẠ, xóa hồ sơ sai phải cho phép ghép lại từ đầu nhưng không xóa hai chứng từ nguồn.
    if (isManual && saleId) {
        const sale = kblManualOffsetSaleById(saleId);
        const purchaseId = String(record.linkedPurchaseRecordId || record.purchaseDocumentId || sale?.exchangeDossier?.linkedPurchaseRecordId || sale?.manualExchangePurchaseRecordId || '');
        if (sale && sale.exchangeDossier?.sourceType === 'manual_buy_sell') {
            delete sale.exchangeDossier;
            delete sale.manualExchangePurchaseRecordId;
            delete sale.exchangePurchaseRecordId;
            delete sale.exchangePurchaseDocId;
            saveDBFile('sales_db.json', salesStore);
        }
        if (purchaseId) {
            const pIndex = dataStoreRecords.findIndex(item => String(item?.id || '') === purchaseId);
            if (pIndex >= 0) {
                const prior = { ...dataStoreRecords[pIndex] };
                delete prior.manualOffsetGroupId;
                delete prior.manualOffsetSaleId;
                delete prior.manualOffsetStatus;
                delete prior.manualOffsetLinkedAt;
                dataStoreRecords[pIndex] = prior;
                saveDBFile('database.db', dataStoreRecords);
                compileBuyTable();
            }
        }
        if (activeOffsetSaleId === saleId) activeOffsetSaleId = '';
        refreshOffsetSaleOptions();
        refreshManualOffsetSources();
    } else {
        renderOffsetHistory();
        renderOffsetDossier();
    }

    alert(isManual
        ? '✅ Đã xóa hồ sơ đối chiếu và gỡ liên kết Vàng lạ. Phiếu Thu Mua + Phiếu Bán nguồn vẫn nguyên; có thể chọn lại và ghép hồ sơ mới.'
        : '✅ Đã xóa hồ sơ đối chiếu khỏi lịch sử. Phiếu Thu Mua và Phiếu Bán/Đổi nguồn vẫn giữ nguyên. Nếu cần, chọn lại giao dịch ở phía trên và lập biên bản mới.');
}

function clearOffsetForm() {
    activeOffsetSaleId = '';
    const sel = getEl('offset-sale-select'); if (sel) sel.value = '';
    ['offset-unc-no','offset-unc-date','offset-bank','offset-bank-ref'].forEach(id => { const el = getEl(id); if (el) el.value = ''; });
    renderOffsetDossier();
}

async function printKblA4Html(bodyHtml, title = 'KBL A4') {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
        @page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}.sheet{width:210mm;height:297mm;overflow:hidden;padding:9mm 10mm;box-sizing:border-box;font-family:'Times New Roman',serif;font-size:12px;line-height:1.3;color:#111}.sheet *{box-sizing:border-box;font-family:'Times New Roman',serif}.sheet h1{font-size:17px;text-align:center;margin:3px 0}.sheet h2{font-size:12.5px;margin:6px 0 3px}.sheet table{width:100%;border-collapse:collapse;margin:4px 0;font-size:10.5px}.sheet th,.sheet td{border:1px solid #222;padding:3px 4px;vertical-align:top;overflow-wrap:anywhere}.doc-sign{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;text-align:center;margin-top:8mm;min-height:25mm}.sheet small{font-size:9px}</style></head><body><div class="sheet">${bodyHtml}</div></body></html>`;
    try {
        return await ipcRenderer.invoke('gold:print-a4-document', { html });
    } catch (error) {
        return { success: false, failureReason: error?.message || String(error) };
    }
}

async function printOffsetA4() {
    const sale = kblOffsetSelectedSale();
    const dossier = kblDossierFromStoredExchange(sale);
    if (!sale || !dossier) return alert('Hãy chọn phiếu đổi trước khi in.');
    const integrity = kblOffsetIntegrity(sale, dossier);
    if (!integrity.ok) return alert('Số liệu hồ sơ không khớp phiếu đổi. Không in để tránh sai chứng từ.');
    const result = await printKblA4Html(offsetDocHtml(sale, dossier), 'Biên bản đối chiếu & bù trừ');
    if (!result?.success) alert(`⚠️ Chưa in được A4: ${result?.failureReason || 'Không rõ lỗi'}`);
}

async function printOffsetPurchaseA4() {
    const sale = kblOffsetSelectedSale();
    const dossier = kblDossierFromStoredExchange(sale);
    if (!sale || !dossier) return alert('Hãy chọn phiếu đổi trước khi in bảng kê.');
    const integrity = kblOffsetIntegrity(sale, dossier);
    if (!integrity.ok) return alert('Số liệu hồ sơ không khớp phiếu đổi. Không in để tránh sai chứng từ.');
    const result = await printKblA4Html(offsetPurchaseA4Html(sale, dossier), 'Bảng kê thu mua đổi bù');
    if (!result?.success) alert(`⚠️ Chưa in được bảng kê A4: ${result?.failureReason || 'Không rõ lỗi'}`);
}

function openPawnLostTicket(record) {
    activePawnLostRecord = record && typeof record === 'object' ? { ...record } : null;
    if (!activePawnLostRecord || !activePawnLostRecord.id) return alert('Không nhận được phiếu cầm hợp lệ từ Tab Cầm Đồ.');
    const map = {
        'lost-pawn-id': activePawnLostRecord.id,
        'lost-pawn-date': activePawnLostRecord.dateStartRaw || activePawnLostRecord.dateStart || '',
        'lost-pawn-name': activePawnLostRecord.name || '',
        'lost-pawn-cccd': activePawnLostRecord.cccd || '',
        'lost-pawn-phone': activePawnLostRecord.phone || '',
        'lost-pawn-address': activePawnLostRecord.address || '',
        'lost-pawn-asset': activePawnLostRecord.asset || '',
        'lost-pawn-money': formatVND(numberValue(activePawnLostRecord.money)),
        'lost-pawn-weight': String(activePawnLostRecord.wTotal || ''),
        'lost-pawn-redeem-total': String(activePawnLostRecord.redeemTotalText || activePawnLostRecord.tongTra || '')
    };
    Object.entries(map).forEach(([id, value]) => { const el = getEl(id); if (el) el.value = value; });
    if (getEl('lost-confirm-phone')) getEl('lost-confirm-phone').value = activePawnLostRecord.phone || '';
    if (getEl('lost-report-date')) getEl('lost-report-date').value = new Date().toISOString().slice(0, 10);
    if (getEl('lost-reason')) getEl('lost-reason').value = '';
    ['lost-check-cccd','lost-check-info','lost-check-customer'].forEach(id => { const el = getEl(id); if (el) el.checked = false; });
    switchTab('tab-chuocmatgiay');
    renderPawnLostDocument();
}

function pawnLostDocHtml() {
    const r = activePawnLostRecord || {};
    const reportDate = getEl('lost-report-date')?.value || '………………';
    const phone = getEl('lost-confirm-phone')?.value.trim() || r.phone || '……………………';
    const reason = getEl('lost-reason')?.value.trim() || 'Không ghi thêm';
    const today = new Date().toLocaleDateString('vi-VN');
    return `<div style="text-align:center;font-weight:bold;">CÔNG TY TNHH MTV VÀNG BẠC ĐÁ QUÝ KIM BẢO LÂM</div>
        <div style="text-align:center;font-size:10.5px;">MST: 3703496362 · 59/1 Nguyễn Thị Tươi, P. Tân Đông Hiệp, TP. Hồ Chí Minh</div>
        <h1>BIÊN BẢN XÁC NHẬN MẤT PHIẾU CẦM<br>VÀ ĐỀ NGHỊ NHẬN LẠI TÀI SẢN</h1>
        <div style="text-align:center;font-size:11px;">Phiếu cầm gốc: <b>${escapeHtml(r.id || '……………………')}</b> · Ngày lập: ${escapeHtml(today)}</div>
        <h2>1. THÔNG TIN KHÁCH HÀNG VÀ GIAO DỊCH CẦM CỐ</h2>
        <table><tr><td><b>Họ tên</b></td><td>${escapeHtml(r.name || '……………………')}</td><td><b>CCCD/CMND</b></td><td>${escapeHtml(r.cccd || '……………………')}</td></tr>
        <tr><td><b>SĐT</b></td><td>${escapeHtml(phone)}</td><td><b>Ngày cầm</b></td><td>${escapeHtml(r.dateStartRaw || r.dateStart || '……………………')}</td></tr>
        <tr><td><b>Địa chỉ</b></td><td colspan="3">${escapeHtml(r.address || '……………………')}</td></tr>
        <tr><td><b>Tài sản cầm cố</b></td><td colspan="3">${escapeHtml(r.asset || '……………………')}</td></tr>
        <tr><td><b>Tiền gốc</b></td><td>${formatVND(numberValue(r.money))}</td><td><b>Trọng lượng</b></td><td>${escapeHtml(String(r.wTotal || '……………………'))}</td></tr></table>
        <h2>2. XÁC NHẬN MẤT PHIẾU</h2>
        <div>Tôi xác nhận phiếu cầm bản khách hàng giữ đã bị mất/thất lạc. <b>Ngày báo mất:</b> ${escapeHtml(reportDate)}. <b>SĐT xác nhận:</b> ${escapeHtml(phone)}. <b>Lý do/hoàn cảnh:</b> ${escapeHtml(reason)}.</div>
        <h2>3. CAM KẾT CỦA KHÁCH HÀNG</h2>
        <ol style="padding-left:18px;margin:4px 0;line-height:1.4;font-size:11.5px;">
            <li>Tôi xác nhận thông tin họ tên, CCCD/CMND, số điện thoại, ngày cầm, tài sản và các thông tin tôi cung cấp là đúng sự thật.</li>
            <li>Tôi xác nhận mình là người thực hiện giao dịch cầm cố nêu trên hoặc là người có quyền hợp pháp nhận lại tài sản theo hồ sơ và giấy tờ được cơ sở kiểm tra.</li>
            <li>Phiếu cầm đã bị mất/thất lạc; tôi không sử dụng, chuyển giao hoặc cung cấp phiếu đã báo mất cho người khác nhằm yêu cầu nhận tài sản.</li>
            <li>Tôi đề nghị cơ sở kiểm tra hồ sơ và chỉ giải quyết nhận lại tài sản sau khi tôi hoàn thành đầy đủ nghĩa vụ theo phiếu/hợp đồng cầm cố và các bước xác minh cần thiết.</li>
            <li>Nếu có khai báo gian dối, giả mạo giấy tờ hoặc hành vi xâm phạm quyền, lợi ích hợp pháp của người khác, tôi chịu trách nhiệm theo quy định pháp luật đối với hành vi và thông tin do mình cung cấp.</li>
            <li>Nếu tìm lại được phiếu sau khi đã nhận lại tài sản, tôi không sử dụng phiếu đó để yêu cầu giao tài sản hoặc thực hiện giao dịch khác liên quan đến tài sản đã nhận.</li>
        </ol>
        <h2>4. XÁC MINH CỦA CƠ SỞ</h2>
        <div>☐ Đã đối chiếu CCCD/CMND bản gốc &nbsp;&nbsp; ☐ Đã đối chiếu hồ sơ phiếu cầm &nbsp;&nbsp; ☐ Khách đã đọc và tự nguyện ký.</div>
        <div style="text-align:justify;margin-top:5px;font-size:10.5px;">Biên bản này ghi nhận việc mất phiếu và nội dung xác minh/cam kết của khách hàng; không thay thế nghĩa vụ thanh toán hoặc các điều kiện của phiếu/hợp đồng cầm cố. Việc tính lãi, tính tiền chuộc và xác nhận giao tài sản vẫn thực hiện theo chức năng Cầm Đồ hiện tại.</div>
        <div class="doc-sign"><div><b>KHÁCH HÀNG</b><br><small>Ký, ghi rõ họ tên</small></div><div><b>NGƯỜI KIỂM TRA KBL</b><br><small>Ký, ghi rõ họ tên</small></div><div><b>NGƯỜI DUYỆT</b><br><small>Ký, ghi rõ họ tên</small></div></div>`;
}

function renderPawnLostDocument() {
    const sheet = getEl('pawn-lost-a4-sheet');
    if (sheet) sheet.innerHTML = activePawnLostRecord ? pawnLostDocHtml() : '<div style="text-align:center;margin-top:30mm;color:#666;">Mở một phiếu từ Tab Cầm Đồ bằng nút “Chuộc đồ mất giấy”.</div>';
    const status = getEl('pawn-lost-status');
    if (status) status.innerText = activePawnLostRecord?.id ? `Đã nạp ${activePawnLostRecord.id}` : 'Chọn phiếu từ Tab Cầm Đồ';
}

function savePawnLostDeclaration() {
    if (!activePawnLostRecord?.id) return alert('Hãy mở đúng phiếu từ Tab Cầm Đồ bằng nút Chuộc đồ mất giấy.');
    if (!getEl('lost-report-date')?.value) return alert('Cần nhập ngày khách báo mất phiếu.');
    if (!getEl('lost-check-cccd')?.checked || !getEl('lost-check-info')?.checked || !getEl('lost-check-customer')?.checked) {
        return alert('Cần hoàn tất 3 bước xác minh trước khi lưu cam kết.');
    }
    const now = new Date().toISOString();
    const id = `MAT-${activePawnLostRecord.id}`;
    const old = pawnLostDeclarations.find(item => String(item && item.id || '') === id);
    const record = {
        ...(old || {}),
        id,
        pawnId: String(activePawnLostRecord.id || ''),
        name: String(activePawnLostRecord.name || ''),
        cccd: String(activePawnLostRecord.cccd || ''),
        phone: getEl('lost-confirm-phone')?.value.trim() || String(activePawnLostRecord.phone || ''),
        reportDate: getEl('lost-report-date')?.value || '',
        reason: getEl('lost-reason')?.value.trim() || '',
        status: 'Đã lập cam kết',
        pawnSnapshot: { ...activePawnLostRecord },
        createdAt: old && old.createdAt || now,
        updatedAt: now
    };
    const idx = pawnLostDeclarations.findIndex(item => String(item && item.id || '') === id);
    if (idx >= 0) pawnLostDeclarations[idx] = record; else pawnLostDeclarations.unshift(record);
    saveDBFile('pawn_lost_declarations.json', pawnLostDeclarations);
    alert(`✅ Đã lưu cam kết mất phiếu cho ${activePawnLostRecord.id}.\nCông thức lãi và thao tác xác nhận chuộc tại Cầm Đồ vẫn giữ nguyên.`);
}

async function printPawnLostA4() {
    if (!activePawnLostRecord?.id) return alert('Chưa có phiếu cầm để in cam kết.');
    const result = await printKblA4Html(pawnLostDocHtml(), 'Cam kết chuộc mất giấy');
    if (!result?.success) alert(`⚠️ Chưa in được A4: ${result?.failureReason || 'Không rõ lỗi'}`);
}

function returnToPawnTab() {
    switchTab('tab-camdo');
}

window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'open-pawn-lost-ticket' && event.data.record) {
        openPawnLostTicket(event.data.record);
    }
});

window.refreshOffsetSaleOptions = refreshOffsetSaleOptions;
window.refreshManualOffsetSources = refreshManualOffsetSources;
window.renderManualOffsetPreview = renderManualOffsetPreview;
window.createManualBuySellOffsetDossier = createManualBuySellOffsetDossier;
window.renderOffsetHistory = renderOffsetHistory;
window.openOffsetHistoryRecord = openOffsetHistoryRecord;
window.editOffsetHistoryRecord = editOffsetHistoryRecord;
window.printOffsetHistoryRecord = printOffsetHistoryRecord;
window.deleteOffsetHistoryRecord = deleteOffsetHistoryRecord;
window.printOffsetExchangeSlipA4 = printOffsetExchangeSlipA4;
window.onOffsetSaleChanged = onOffsetSaleChanged;
window.renderOffsetDossier = renderOffsetDossier;
window.openSelectedExchangeInvoice = openSelectedExchangeInvoice;
window.printSelectedExchangeInvoice = printSelectedExchangeInvoice;
window.saveOffsetRecord = saveOffsetRecord;
window.clearOffsetForm = clearOffsetForm;
window.printOffsetA4 = printOffsetA4;
window.printOffsetPurchaseA4 = printOffsetPurchaseA4;
window.openPawnLostTicket = openPawnLostTicket;
window.renderPawnLostDocument = renderPawnLostDocument;
window.savePawnLostDeclaration = savePawnLostDeclaration;
window.printPawnLostA4 = printPawnLostA4;
window.returnToPawnTab = returnToPawnTab;

// KBL_POS_PHOTOS_V1: isolated media sidecar, no financial/data-row mutations.
(() => {
 function bootProductPhotos(){
  try {
   const photos=require('./kbl-product-photos.cjs').mount({document,window,dataDir:KBL_DATA_DIR,
    getInventory:()=>inventoryStore,
    getSelection:()=>currentSelectedInvItem,
    getCart:()=>currentSellMode==='tra'?returnCart:salesCart});
   const oldRender=renderInventoryTable;
   renderInventoryTable=function(...args){const result=oldRender.apply(this,args);photos.refreshInventory();return result;};
   const refreshAfter=fn=>function(...args){const result=fn.apply(this,args);photos.refreshSale();return result;};
   selectItemForSale=refreshAfter(selectItemForSale);
   clearSaleSelection=refreshAfter(clearSaleSelection);
   renderSalesCart=refreshAfter(renderSalesCart);
  }catch(error){console.error('[KBL ảnh sản phẩm]',error);alert('Chưa bật được ảnh sản phẩm: '+error.message+'\nPhần bán hàng hiện có vẫn giữ nguyên.');}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootProductPhotos,{once:true});else bootProductPhotos();
})();
