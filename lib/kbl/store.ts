import { env } from 'cloudflare:workers';
export function sql() { if (!env.DB)
    throw Object.assign(Error('Database chưa được kết nối.'), { status: 503 }); return env.DB; }
export async function list(kind: string, limit = 100) { const r = await sql().prepare('SELECT id,data,version,created_at,updated_at FROM records WHERE kind=? ORDER BY updated_at DESC LIMIT ?').bind(kind, limit).all<any>(); return r.results.map(x => ({ ...JSON.parse(x.data), id: x.id, version: x.version, createdAt: x.created_at, updatedAt: x.updated_at })); }
export async function get(kind: string, id: string) { const x = await sql().prepare('SELECT * FROM records WHERE kind=? AND id=?').bind(kind, id).first<any>(); return x ? { ...JSON.parse(x.data), id: x.id, version: x.version, createdAt: x.created_at, updatedAt: x.updated_at } : null; }
export async function put(kind: string, id: string, data: any, version?: number) { const at = Date.now(); if (version !== undefined) {
    const r = await sql().prepare('UPDATE records SET data=?,version=version+1,updated_at=? WHERE kind=? AND id=? AND version=?').bind(JSON.stringify(data), at, kind, id, version).run();
    if (r.meta.changes !== 1)
        throw Object.assign(Error('Dữ liệu đã thay đổi ở cửa sổ khác; tải lại trước khi lưu.'), { status: 409 });
}
else {
    const limits: Record<string, number> = { product: 500, order: 5000, consultation: 5000, story: 1000, article: 1000, account: 20, worker: 20, 'worker-auth': 40, command: 200, price: 200, settings: 10, channel: 20, 'job-receipt': 20000, 'job-evidence': 6000, 'job-transition': 30000 };
    const limit = limits[kind] || 20000;
    const saved = await sql().prepare('INSERT INTO records(kind,id,data,created_at,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE kind=? AND id=?) OR (SELECT COUNT(*) FROM records WHERE kind=?)<? ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,version=records.version+1,updated_at=excluded.updated_at').bind(kind, id, JSON.stringify(data), at, at, kind, id, kind, limit).run();
    if (saved.meta.changes !== 1)
        throw Object.assign(Error('Đã chạm giới hạn bản ghi. Xuất dữ liệu để lưu trữ trước khi thêm tiếp.'), { status: 507 });
} return get(kind, id); }
export async function event(type: string, message: string, storyId: string | null = null) { if (type === 'published')
    await sql().prepare("INSERT INTO events(story_id,type,message,at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM events WHERE story_id=? AND type='published')").bind(storyId, type, message.slice(0, 1000), Date.now(), storyId).run();
else
    await sql().prepare('INSERT INTO events(story_id,type,message,at) VALUES(?,?,?,?)').bind(storyId, type, message.slice(0, 1000), Date.now()).run(); }
export async function settings() { return { id: 'main', teamEnabled: false, publicationEnabled: false, requiredPlatforms: ['website'], storageLimitMB: 256, companyName: 'TIỆM VÀNG KIM BẢO LÂM', phone: '', address: '', hours: '',  timezone: 'Asia/Ho_Chi_Minh', autoResearch: true, autoConsult: true, autoProducts: false,  ...await get('settings', 'main'), productHours:[8,13,19], goldSchedule:['08:00','13:00','19:00'] }; }
export async function sha(v: string | ArrayBuffer | Uint8Array) { const buf = typeof v === 'string' ? new TextEncoder().encode(v) : v; return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf as BufferSource))].map(n => n.toString(16).padStart(2, '0')).join(''); }
export const id = () => crypto.randomUUID().replaceAll('-', '');
export function randomToken() { return [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join(''); }
