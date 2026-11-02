import * as S from './store';
import { fail, productInput } from './domain.mjs';
import C from '../../windows/pos-contract.cjs';
import { publicProductDetails } from './product-view.mjs';

export async function bind(workerId: string) {
    const at = Date.now();
    await S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) VALUES('pos-binding','main',?,?,?) ON CONFLICT(kind,id) DO NOTHING").bind(JSON.stringify({ workerId }), at, at).run();
    if ((await S.get('pos-binding', 'main'))?.workerId !== workerId)
        fail('POS đã ghép với Windows khác. Chủ cần kiểm tra nguồn trước khi đổi.', 409);
}
export async function locked() { return !!await S.get('pos-binding', 'main'); }
type Row = { id: string; data: any };
// Inventory and transaction events share the relay's monotonic sequence.
// The legacy per-product marker participates so upgrading cannot admit an old event.
const stockGuard = "NOT EXISTS(SELECT 1 FROM records WHERE ((kind='pos-stock' AND id='main') OR (kind='pos-sync' AND id='product')) AND ((? IS NOT NULL AND COALESCE(json_extract(data,'$.revision'),0)>=?) OR (? IS NULL AND COALESCE(json_extract(data,'$.revision'),0)>0)))";
const revisionOf = (input: any) => { const r = input.revision; if (r !== undefined && (!Number.isSafeInteger(r) || r < 1)) fail('Thiếu số thứ tự bản chụp POS.'); return r as number | undefined; };
async function existingRows(kind: string, ids: string[]) {
    const found = await S.sql().prepare('SELECT id,data FROM records WHERE kind=? AND id IN(SELECT value FROM json_each(?))').bind(kind, JSON.stringify(ids)).all<any>();
    return new Map(found.results.map(r => [r.id, JSON.parse(r.data)]));
}
async function apply(workerId: string, kind: string, rows: Row[], complete: boolean, revision?: number) {
    if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 1)) fail('Thiếu số thứ tự bản chụp POS.');
    const digest = await S.sha(JSON.stringify({ complete, rows }));
    await bind(workerId);
    const before = await S.get('pos-sync', kind);
    if (revision !== undefined && before?.revision >= revision) {
        if (before.revision === revision && before.digest === digest) return { success: true, count: rows.length, duplicate: true, wroteToPOS: false };
        fail('Bản chụp POS cũ hoặc khác nội dung cùng số thứ tự; không ghi đè.', 409);
    }
    // Windows gửi lại bản chụp y hệt mỗi phút. Khi nội dung không đổi và không có
    // sự kiện kho nào sau bản chụp trước, chỉ cần tăng số thứ tự để giữ thứ tự
    // sự kiện; ghi lại toàn bộ dòng sẽ vượt hạn mức D1 mà không thêm thông tin.
    if (revision !== undefined && before && before.digest === digest) {
        const stock = kind === 'product' ? await S.get('pos-stock', 'main') : null;
        if ((stock?.revision || 0) <= (before.revision || 0)) {
            const at = Date.now();
            const statements = [S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) VALUES('pos-sync',?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,version=records.version+1,updated_at=excluded.updated_at WHERE COALESCE(json_extract(records.data,'$.revision'),0)<=?").bind(kind, JSON.stringify({ revision, digest, count: rows.length, receivedAt: at, workerId }), at, at, revision)];
            if (kind === 'product') statements.push(S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) VALUES('pos-stock','main',?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,version=records.version+1,updated_at=excluded.updated_at WHERE COALESCE(json_extract(records.data,'$.revision'),0)<=?").bind(JSON.stringify({ revision, digest, workerId, operation: 'snapshot' }), at, at, revision));
            await S.sql().batch(statements);
            return { success: true, count: rows.length, duplicate: true, wroteToPOS: false };
        }
    }
    const at = Date.now(), marker = S.id(), incoming = JSON.stringify(rows), ids = JSON.stringify(rows.map(r => r.id)), cap = kind === 'product' ? 500 : 20000;
    // Each D1 batch is a transaction. The marker guards all writes, including a
    // concurrent newer revision or quota failure. No partial snapshot hides stock.
    const conditions = "(SELECT COUNT(*) FROM records WHERE kind=?)+(SELECT COUNT(*) FROM json_each(?) p WHERE NOT EXISTS(SELECT 1 FROM records r WHERE r.kind=? AND r.id=json_extract(p.value,'$.id')))<=? AND (? IS NULL OR NOT EXISTS(SELECT 1 FROM records WHERE kind='pos-sync' AND id=? AND json_extract(data,'$.revision')>=?))" + (kind === 'product' ? ' AND ' + stockGuard : '');
    const statements = [
        S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) SELECT 'pos-import',?,'{}',?,? WHERE " + conditions).bind(marker, at, at, kind, incoming, kind, cap, revision ?? null, kind, revision ?? null, ...(kind === 'product' ? [revision ?? null, revision ?? null, revision ?? null] : [])),
        S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) SELECT ?,json_extract(p.value,'$.id'),json_extract(p.value,'$.data'),?,? FROM json_each(?) p WHERE EXISTS(SELECT 1 FROM records WHERE kind='pos-import' AND id=?) ON CONFLICT(kind,id) DO UPDATE SET data=" + (kind === 'product' ? "json_set(excluded.data,'$.imageIds',json(COALESCE(json_extract(records.data,'$.imageIds'),'[]')),'$.published',json(CASE WHEN COALESCE(json_extract(records.data,'$.websitePublished'),json_extract(excluded.data,'$.published')) THEN 'true' ELSE 'false' END),'$.websitePublished',json(CASE json_extract(records.data,'$.websitePublished') WHEN 1 THEN 'true' WHEN 0 THEN 'false' ELSE 'null' END),'$.displaySections',json(COALESCE(json_extract(records.data,'$.displaySections'),'[]')))" : 'excluded.data') + ",version=records.version+1,updated_at=excluded.updated_at").bind(kind, at, at, incoming, marker)
    ];
    if (complete) statements.push(S.sql().prepare("UPDATE records SET data=json_set(data,'$.posMissing',json('true')" + (kind === 'product' ? ",'$.available',json('false')" : '') + "),version=version+1,updated_at=? WHERE kind=? AND json_extract(data,'$.source')='pos' AND id NOT IN(SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM records WHERE kind='pos-import' AND id=?)").bind(at, kind, ids, marker));
    statements.push(S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) SELECT 'pos-sync',?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE kind='pos-import' AND id=?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,version=records.version+1,updated_at=excluded.updated_at").bind(kind, JSON.stringify({ revision: revision ?? 0, digest, count: rows.length, receivedAt: at, workerId }), at, at, marker));
    if (kind === 'product') statements.push(S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) SELECT 'pos-stock','main',?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE kind='pos-import' AND id=?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,version=records.version+1,updated_at=excluded.updated_at").bind(JSON.stringify({ revision: revision ?? 0, digest, workerId, operation: 'snapshot' }), at, at, marker));
    statements.push(S.sql().prepare("DELETE FROM records WHERE kind='pos-import' AND id=?").bind(marker));
    let result;
    try { result = await S.sql().batch(statements); }
    catch (e: any) { if (/UNIQUE constraint failed.*pos_receipt_token|UNIQUE constraint failed.*index.*pos_receipt_token/i.test(String(e.message))) fail('Mã QR đã thuộc phiếu khác. Không thay đổi bản chụp.', 409); throw e; }
    if (result[0].meta.changes !== 1) {
        const live = await S.get('pos-sync', kind);
        if (revision !== undefined && live?.revision >= revision) fail('Bản chụp mới hơn vừa được nhận. Không đổi dữ liệu.', 409);
        if (kind === 'product') {
            const stock = await S.get('pos-stock', 'main');
            if ((stock?.revision > 0 && (revision === undefined || stock.revision >= revision)) || (live?.revision > 0 && revision === undefined)) fail('Kho POS đã có sự kiện mới hơn; cần bản chụp có số thứ tự mới.', 409);
        }
        fail('Bản chụp vượt hạn mức. Không đổi dữ liệu.', 507);
    }
    return { success: true, count: rows.length, wroteToPOS: false };
}
export async function products(workerId: string, input: any) {
    if (input.complete !== true || !Array.isArray(input.products) || input.products.length > 500) fail('Cần bản chụp POS đầy đủ, tối đa 500 dòng.');
    const rows: Row[] = [];
    for (const p of input.products) {
        const value = productInput({ ...p, published: p.published !== false });
        rows.push({ id: 'pos-' + await S.sha(value.sku), data: { ...value, ...publicProductDetails(p), imageIds: [], source: 'pos', posMissing: false } });
    }
    if (new Set(rows.map(p => p.id)).size !== rows.length) fail('Bản chụp có SKU bị trùng.');
    const result = await apply(workerId, 'product', rows, true, input.revision);
    if (result.duplicate !== true) await refreshPhotoVisibility();
    return { ...result, ok: true };
}
export async function prices(workerId: string, input: any) {
    // Validate again on the server; the Windows projection is not a trust boundary.
    const p = C.prices(input);
    const rows = p.rows.map((r: any) => ({ id: 'pos-' + r.code, data: { ...r, source: 'POS Kim Bảo Lâm', capturedAt: input.observedAt, timestampKind: 'received-from-pos' } }));
    if (!Number.isSafeInteger(input.observedAt) || input.observedAt < 1 || input.observedAt > Date.now() + 60000) fail('Thời điểm nhận giá POS không hợp lệ.');
    return apply(workerId, 'price', rows, false, input.revision);
}
export async function pawns(workerId: string, input: any) {
    const p = C.pawn(input), rows: Row[] = [];
    const ids = await Promise.all(p.records.map((r: any) => S.sha(r.id))), existing = await existingRows('pos-pawn', ids);
    for (const [i, record] of p.records.entries()) {
        const id = ids[i], old = existing.get(id), { publicToken, ...safe } = record;
        rows.push({ id, data: { ...safe, receiptCode: safe.id, source: 'pos', posMissing: false, tokenHash: publicToken ? await S.sha(publicToken) : old?.tokenHash || null } });
    }
    return apply(workerId, 'pos-pawn', rows, p.mode === 'snapshot', input.revision);
}
export async function warranties(workerId: string, input: any, base: string) {
    const p = C.warranty(input);
    if (p.eventType === 'return') return { success: true, skipped: true, warranties: [] };
    const rows: Row[] = [];
    const ids = await Promise.all(p.items.map((item: any) => S.sha(p.invoiceId + '\n' + item.productSku))), existing = await existingRows('pos-warranty', ids);
    for (const [i, item] of p.items.entries()) {
        const id = ids[i], old = existing.get(id);
        const { publicToken: requested, ...line } = item;
        const details = { invoiceId: p.invoiceId, phone: p.phone, customerName: p.customerName, soldAt: p.soldAt, ...line }, fingerprint = await S.sha(JSON.stringify(details));
        if (old && old.fingerprint !== fingerprint) fail('Phiếu bán đã cấp bảo hành với nội dung khác; giữ phiếu đã lưu.', 409);
        if (old && requested && requested !== old.publicToken) fail('QR bảo hành cũ khác QR đã ghép; cần đối chiếu trước khi đổi.', 409);
        const publicToken = old?.publicToken || requested || S.randomToken();
        rows.push({ id, data: { ...details, fingerprint, source: 'pos', publicToken, requestedToken: requested, tokenHash: await S.sha(publicToken) } });
    }
    // Concurrent retries must retain the first committed token. Use the existing
    // row instead of an upsert that could invalidate an already printed QR.
    await bind(workerId);
    const at = Date.now();
    const marker = S.id(), incoming = JSON.stringify(rows);
    try {
        const batch = [S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) SELECT 'pos-import',?,'{}',?,? WHERE (SELECT COUNT(*) FROM records WHERE kind='pos-warranty')+(SELECT COUNT(*) FROM json_each(?) p WHERE NOT EXISTS(SELECT 1 FROM records r WHERE r.kind='pos-warranty' AND r.id=json_extract(p.value,'$.id')))<=20000 AND NOT EXISTS(SELECT 1 FROM json_each(?) p JOIN records r ON r.kind='pos-warranty' AND r.id=json_extract(p.value,'$.id') WHERE json_extract(r.data,'$.fingerprint')<>json_extract(p.value,'$.data.fingerprint') OR (json_extract(p.value,'$.data.requestedToken')<>'' AND json_extract(r.data,'$.publicToken')<>json_extract(p.value,'$.data.requestedToken')))").bind(marker, at, at, incoming, incoming)];
        batch.push(S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) SELECT 'pos-warranty',json_extract(p.value,'$.id'),json_extract(p.value,'$.data'),?,? FROM json_each(?) p WHERE EXISTS(SELECT 1 FROM records WHERE kind='pos-import' AND id=?) ON CONFLICT(kind,id) DO NOTHING").bind(at, at, incoming, marker));
        batch.push(S.sql().prepare("DELETE FROM records WHERE kind='pos-import' AND id=?").bind(marker));
        const result = await S.sql().batch(batch);
        if (result[0].meta.changes !== 1) fail('Kho bảo hành đầy hoặc phiếu đã có nội dung khác. Không cấp QR một phần.', 409);
    } catch { fail('Không lưu được bộ phiếu bảo hành; kiểm tra trùng QR hoặc hạn mức.', 409); }
    const result = [];
    const savedRows = await existingRows('pos-warranty', rows.map(r => r.id));
    for (const row of rows) {
        const saved = savedRows.get(row.id);
        if (!saved) fail('Kho bảo hành đã đầy; chưa xác nhận thành công.', 507);
        if (saved.fingerprint !== row.data.fingerprint) fail('Phiếu bán đã được nhận với nội dung khác.', 409);
        result.push({ id: row.id, sku: saved.productSku, url: base + '/bao-hanh/' + encodeURIComponent(saved.publicToken) });
    }
    return { success: true, invoiceId: p.invoiceId, warranties: result, wroteToPOS: false };
}
export async function lookup(token: string) {
    if (!/^[a-z0-9_-]{20,128}$/i.test(token)) fail('Cần mã QR hợp lệ do POS cấp.', 404);
    const row = await S.sql().prepare("SELECT kind,data,updated_at FROM records WHERE kind IN ('pos-pawn','pos-warranty') AND json_extract(data,'$.tokenHash')=?").bind(await S.sha(token)).first<any>();
    if (!row) fail('Chưa có phiếu theo mã QR này trên website.', 404);
    const { tokenHash, publicToken, requestedToken, fingerprint, source, ...safe } = JSON.parse(row.data);
    if (safe.posMissing) fail('Phiếu đã vắng trong bản chụp POS mới. Liên hệ cửa hàng để đối chiếu.', 404);
    return { kind: row.kind === 'pos-pawn' ? 'pawn' : 'warranty', record: safe, syncedAt: row.updated_at, stale: Date.now() - row.updated_at > 1800000, calculationSource: 'pos' };
}
export async function refreshPhotoVisibility() {
    // Chỉ chạm đúng ảnh có cờ public thay đổi; chạy lặp mỗi phút sẽ tính là ghi
    // toàn bộ bảng ảnh vào hạn mức D1.
    const wanted = "CASE WHEN EXISTS(SELECT 1 FROM records r,json_each(json_extract(r.data,'$.imageIds')) im WHERE r.kind='product' AND json_extract(r.data,'$.published')=1 AND im.value=assets.id) OR EXISTS(SELECT 1 FROM records r,json_each(json_extract(r.data,'$.images')) im WHERE r.kind='article' AND json_extract(im.value,'$.assetId')=assets.id) THEN 1 ELSE 0 END";
    await S.sql().prepare("UPDATE assets SET public=" + wanted + " WHERE purpose='product' AND deleted_at IS NULL AND public<>" + wanted).run();
}
export async function attachPhoto(workerId: string, sku: string, assetId: string) {
    await bind(workerId);
    const pid = 'pos-' + await S.sha(sku), product = await S.get('product', pid);
    if (!product || product.source !== 'pos') fail('SKU chưa được nhận từ POS.', 404);
    await S.sql().prepare("UPDATE records SET data=json_set(data,'$.imageIds',json(?)),version=version+1,updated_at=? WHERE kind='product' AND id=?").bind(JSON.stringify([assetId]), Date.now(), pid).run();
    await refreshPhotoVisibility();
    return { success: true, assetId, sku };
}
export async function transaction(workerId: string, input: any) {
    const p = C.transaction(input), revision = revisionOf(input);
    // Hide affected stock conservatively. A later full POS snapshot alone can
    // make a returned item available again; do not infer stock from financials.
    await bind(workerId);
    const ids = await Promise.all(p.skus.map(async (s: string) => 'pos-' + await S.sha(s)));
    const at = Date.now(), marker = S.id(), digest = await S.sha(JSON.stringify(p)), old = await S.get('pos-stock', 'main'), oldSnapshot = await S.get('pos-sync', 'product');
    if (revision === undefined && Math.max(old?.revision || 0, oldSnapshot?.revision || 0) > 0) fail('Sự kiện POS cần số thứ tự để không ghi đè kho mới hơn.', 409);
    if (revision !== undefined && old?.revision === revision && old.digest !== digest) fail('Cùng số thứ tự POS nhưng khác nội dung; cần đối chiếu.', 409);
    const statements = [
        S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) SELECT 'pos-import',?,'{}',?,? WHERE " + stockGuard).bind(marker, at, at, revision ?? null, revision ?? null, revision ?? null),
        S.sql().prepare("UPDATE records SET data=json_set(data,'$.available',json('false')),version=version+1,updated_at=? WHERE kind='product' AND id IN(SELECT value FROM json_each(?)) AND json_extract(data,'$.source')='pos' AND EXISTS(SELECT 1 FROM records WHERE kind='pos-import' AND id=?)").bind(at, JSON.stringify(ids), marker),
        S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) SELECT 'pos-stock','main',?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE kind='pos-import' AND id=?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,version=records.version+1,updated_at=excluded.updated_at").bind(JSON.stringify({ revision: revision ?? 0, digest, workerId, operation: 'transaction' }), at, at, marker)
    ];
    // A historical return may still annotate its receipt, but cannot hide stock
    // from a newer complete inventory snapshot or reverse a later receipt event.
    if (p.eventType !== 'sale') statements.push(S.sql().prepare("UPDATE records SET data=json_set(data,'$.posStatus',?,'$.posEventRevision',?),version=version+1,updated_at=? WHERE kind='pos-warranty' AND json_extract(data,'$.invoiceId')=? AND json_extract(data,'$.productSku') IN(SELECT value FROM json_each(?)) AND ((? IS NOT NULL AND COALESCE(json_extract(data,'$.posEventRevision'),0)<?) OR (? IS NULL AND COALESCE(json_extract(data,'$.posEventRevision'),0)=0))").bind(p.eventType === 'return' ? 'returned' : 'canceled', revision ?? 0, at, p.originalTransactionId || p.invoiceId, JSON.stringify(p.skus), revision ?? null, revision ?? null, revision ?? null));
    statements.push(S.sql().prepare("DELETE FROM records WHERE kind='pos-import' AND id=?").bind(marker));
    const result = await S.sql().batch(statements);
    return { success: true, count: ids.length, stockSkipped: result[0].meta.changes !== 1, wroteToPOS: false };
}
// Anonymous sale cancellation only. POS still owns deletion, money, and stock.
// Loyalty-bearing/return/exchange invoices require the original ledger and are
// deliberately rejected by the connection projection instead of fake-ACKed.
export async function voidSale(workerId: string, input: any) {
    const V = (await import('../../windows/pos-void.cjs')).default;
    const p = V.validate(input), revision = revisionOf(input);
    if (revision === undefined) fail('Hoàn tác cần số thứ tự của worker.', 409);
    await bind(workerId);
    const id = await S.sha('anonymous-void:' + p.invoiceId), fingerprint = await S.sha(JSON.stringify(p));
    const before = await S.get('pos-void', id);
    if (before) {
        if (before.fingerprint !== fingerprint) fail('Hóa đơn đã có nội dung hoàn tác khác; cần đối soát.', 409);
        return { success: true, duplicate: true, invoiceId: p.invoiceId, wroteToPOS: false };
    }
    const at = Date.now(), marker = S.id(), ids = await Promise.all(p.skus.map(async (sku: string) => 'pos-' + await S.sha(sku)));
    const marked = "EXISTS(SELECT 1 FROM records WHERE kind='pos-import' AND id=?)";
    const results = await S.sql().batch([
        S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) SELECT 'pos-import',?,'{}',?,? WHERE NOT EXISTS(SELECT 1 FROM records WHERE kind='pos-void' AND id=?) AND (SELECT COUNT(*) FROM records WHERE kind='pos-void')<20000 AND NOT EXISTS(SELECT 1 FROM records WHERE kind='pos-warranty' AND json_extract(data,'$.invoiceId')=? AND COALESCE(json_extract(data,'$.phone'),'')<>'')").bind(marker, at, at, id, p.invoiceId),
        S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) SELECT 'pos-void',?,?,?,? WHERE " + marked).bind(id, JSON.stringify({ ...p, workerId, revision, fingerprint, at }), at, at, marker),
        S.sql().prepare("UPDATE records SET data=json_set(data,'$.available',json('false')),version=version+1,updated_at=? WHERE kind='product' AND json_extract(data,'$.source')='pos' AND id IN(SELECT value FROM json_each(?)) AND " + marked + ' AND ' + stockGuard).bind(at, JSON.stringify(ids), marker, revision, revision, revision),
        S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) SELECT 'pos-stock','main',?,?,? WHERE " + marked + ' AND ' + stockGuard + " ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,version=records.version+1,updated_at=excluded.updated_at").bind(JSON.stringify({ revision, digest: fingerprint, workerId, operation: 'void' }), at, at, marker, revision, revision, revision),
        S.sql().prepare("UPDATE records SET data=json_set(data,'$.posStatus','canceled','$.posEventRevision',?),version=version+1,updated_at=? WHERE kind='pos-warranty' AND json_extract(data,'$.invoiceId')=? AND json_extract(data,'$.productSku') IN(SELECT value FROM json_each(?)) AND COALESCE(json_extract(data,'$.posEventRevision'),0)<? AND " + marked).bind(revision, at, p.invoiceId, JSON.stringify(p.skus), revision, marker),
        S.sql().prepare("DELETE FROM records WHERE kind='pos-import' AND id=?").bind(marker)
    ]);
    if (results[0].meta.changes !== 1) {
        if ((await S.get('pos-void', id))?.fingerprint === fingerprint) return { success: true, duplicate: true, invoiceId: p.invoiceId, wroteToPOS: false };
        fail('Chưa lưu được biên nhận hoàn tác; giữ nguyên POS.', 507);
    }
    return { success: true, invoiceId: p.invoiceId, warrantiesCanceled: results[4].meta.changes, loyalty: { skipped: true, reason: 'anonymous-pos-sale' }, wroteToPOS: false };
}
