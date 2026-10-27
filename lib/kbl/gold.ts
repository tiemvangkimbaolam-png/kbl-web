import { publicationPlan } from './publication-plan';
import { sql, get, list, settings, sha, id } from './store';
import { goldSlot } from './domain.mjs';

const CODES = ['9999', '980', '750', '610', '585', '416'];
const PRICE_URL = 'https://tiemvangkimbaolam.id.vn/bang-gia';
const FRESH_MS = 5 * 60000;
const recent = (value: any, at: number) => Number.isSafeInteger(value) && value > 0 && value <= at + 60000 && at - value <= FRESH_MS;

// A price record's updated_at is deliberately not a price observation. Only the
// timestamp supplied by the read-only POS import and its matching sync count/hash
// can form an edition. Partial pushes must not mix in prices from an older push.
async function currentSnapshot(at: number) {
    const binding = await get('pos-binding', 'main'), sync = await get('pos-sync', 'price');
    if (!binding?.workerId || sync?.workerId !== binding.workerId || !recent(sync.receivedAt, at) || !Number.isSafeInteger(sync.revision) || sync.revision < 1 || !/^[a-f0-9]{64}$/.test(sync.digest || '')) return null;
    const prices = (await list('price', 200)).filter((p: any) => p.source === 'POS Kim Bảo Lâm');
    const observedAt = Math.max(0, ...prices.map((p: any) => Number(p.capturedAt) || 0));
    if (!recent(observedAt, at)) return null;
    const rows = prices.filter((p: any) => p.capturedAt === observedAt).sort((a: any, b: any) => CODES.indexOf(a.code) - CODES.indexOf(b.code));
    if (!rows.length || rows.length > CODES.length || rows.length !== sync.count || new Set(rows.map((p: any) => p.code)).size !== rows.length) return null;
    for (const row of rows) {
        if (!CODES.includes(row.code) || row.id !== 'pos-' + row.code || row.timestampKind !== 'received-from-pos' || row.unit !== 'đồng/chỉ' || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 80 || ![row.buy, row.sell].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 1e12) || row.sell < row.buy) return null;
    }
    const incoming = rows.map((p: any) => ({ id: p.id, data: { code: p.code, label: p.label, buy: p.buy, sell: p.sell, unit: p.unit, source: p.source, capturedAt: p.capturedAt, timestampKind: p.timestampKind } }));
    if (await sha(JSON.stringify({ complete: false, rows: incoming })) !== sync.digest) return null;
    return { source: 'POS Kim Bảo Lâm', unit: 'đồng/chỉ', capturedAt: at, observedAt, syncedAt: sync.receivedAt, revision: sync.revision, digest: sync.digest, workerId: sync.workerId, rows: rows.map(({ code, label, buy, sell, unit }: any) => ({ code, label, buy, sell, unit })) };
}

export async function captureGoldSlot(at = Date.now()) {
    // Expire only unstarted editions. A captured story keeps running beyond its
    // hour with the same immutable observation; it is never silently refreshed.
    await sql().prepare("UPDATE editions SET data=json_set(data,'$.status','missed','$.message','Không có giá POS đủ mới trong giờ phát; không dựng bù giá lịch sử.') WHERE kind='gold' AND captured_at IS NULL AND json_extract(data,'$.status')='awaiting-price' AND created_at<?").bind(Math.floor(at / 3600000) * 3600000).run();
    const slot = goldSlot(new Date(at));
    if (!slot || !(await settings()).teamEnabled) return { waiting: true, reason: 'outside-slot-or-paused' };
    await sql().prepare("INSERT OR IGNORE INTO editions(id,kind,data,created_at) VALUES(?,'gold',?,?)").bind(slot, JSON.stringify({ status: 'awaiting-price', slot, message: 'Chờ giá thật POS được quan sát trong 5 phút; không điền giá lịch sử.' }), at).run();
    const existing = await sql().prepare('SELECT * FROM editions WHERE id=?').bind(slot).first<any>();
    if (existing.captured_at !== null) return { captured: true, duplicate: true, storyId: JSON.parse(existing.data).storyId, slot };
    const snapshot = await currentSnapshot(at);
    if (!snapshot) return { waiting: true, reason: 'awaiting-fresh-pos-price', slot };
    const storyId = (await sha('KBL-GOLD:' + slot)).slice(0, 32), marker = id();
    const label = new Date(at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
    const title = 'Bản tin giá vàng · ' + label;
    const story = { title, topic: 'Bản tin giá vàng cửa hàng từ bản chụp POS chỉ đọc. Nêu đúng giá mua/bán đồng/chỉ, tuổi vàng, thời điểm quan sát. Không bịa lịch sử, nguyên nhân hoặc dự báo đầu tư. Giá đã chốt phải được giữ nguyên cho đến khi hoàn thành.', sourceUrl: PRICE_URL, ...await publicationPlan(), status: 'working', kind: 'gold', editionSlot: slot, editionAt: at, priceSnapshot: snapshot };
    const excerpt = 'Bản chụp giá chỉ đọc do POS Kim Bảo Lâm đồng bộ, đơn vị đồng/chỉ. Quan sát lúc ' + new Date(snapshot.observedAt).toISOString() + '. ' + snapshot.rows.map((r: any) => `${r.label}: mua ${r.buy}, bán ${r.sell} ${r.unit}`).join('; ') + '. Không có dữ liệu so sánh lịch sử hoặc dự báo.';
    const research = { items: [{ title, url: PRICE_URL, excerpt, publishedAt: new Date(snapshot.observedAt).toISOString() }], evidenceKind: 'pos-price-snapshot', sourceEvidence: [{ kind: 'pos-price-snapshot', verifiedBy: 'pos-import-contract', url: PRICE_URL, contentHash: await sha(JSON.stringify(snapshot)), ...snapshot }], priceSnapshot: snapshot, capturedAt: at };
    const edition = { status: 'captured', slot, storyId, captureMarker: marker, priceSnapshot: snapshot };
    const guard = "EXISTS(SELECT 1 FROM editions WHERE id=? AND json_extract(data,'$.captureMarker')=?)";
    const saved = await sql().batch([
        sql().prepare("UPDATE editions SET captured_at=?,data=? WHERE id=? AND kind='gold' AND captured_at IS NULL AND NOT EXISTS(SELECT 1 FROM records WHERE kind='story' AND id=?) AND (SELECT COUNT(*) FROM records WHERE kind='story')<1000 AND EXISTS(SELECT 1 FROM records WHERE kind='pos-sync' AND id='price' AND json_extract(data,'$.revision')=? AND json_extract(data,'$.digest')=? AND json_extract(data,'$.receivedAt')=? AND json_extract(data,'$.workerId')=?) AND EXISTS(SELECT 1 FROM records WHERE kind='pos-binding' AND id='main' AND json_extract(data,'$.workerId')=?) AND EXISTS(SELECT 1 FROM records WHERE kind='settings' AND id='main' AND json_extract(data,'$.teamEnabled')=1)").bind(at, JSON.stringify(edition), slot, storyId, snapshot.revision, snapshot.digest, snapshot.syncedAt, snapshot.workerId, snapshot.workerId),
        sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) SELECT 'story',?,?,?,? WHERE " + guard).bind(storyId, JSON.stringify(story), at, at, slot, marker),
        sql().prepare("INSERT INTO jobs(id,story_id,stage,status,owner,result,result_hash,created_at,updated_at) SELECT ?,?,'research','complete','pos-readonly',?,?,?,? WHERE " + guard).bind(`KBL-${storyId}-research`, storyId, JSON.stringify(research), await sha(JSON.stringify(research)), at, at, slot, marker),
        sql().prepare("INSERT INTO jobs(id,story_id,stage,status,created_at,updated_at) SELECT ?,?,'write','queued',?,? WHERE " + guard).bind(`KBL-${storyId}-write`, storyId, at, at, slot, marker)
    ]);
    if (saved[0].meta.changes !== 1) {
        const live = await sql().prepare('SELECT captured_at,data FROM editions WHERE id=?').bind(slot).first<any>();
        return live?.captured_at != null ? { captured: true, duplicate: true, storyId: JSON.parse(live.data).storyId, slot } : { waiting: true, reason: 'snapshot-changed-or-quota', slot };
    }
    return { captured: true, storyId, slot };
}
