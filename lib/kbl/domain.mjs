export const STAGES = ['research', 'write', 'review', 'image', 'image-review', 'render', 'publish'];
export const LABELS = { research: 'Tìm & xác minh nguồn', write: 'Biên tập', review: 'Duyệt nội dung', image: 'Tạo ảnh', 'image-review': 'Duyệt ảnh', render: 'Dựng video', publish: 'Xuất bản', consult: 'Tư vấn khách' };
export const CAPABILITIES = { gemini: ['research', 'write', 'review', 'image', 'image-review'], chatgpt: ['research', 'write', 'review', 'image', 'image-review'], claude: ['write', 'review', 'image-review'], deepseek: ['research', 'write', 'review'], grok: ['research', 'write', 'review'] };
export const PROVIDER_URLS = { gemini: 'https://gemini.google.com/app', chatgpt: 'https://chatgpt.com/', claude: 'https://claude.ai/', deepseek: 'https://chat.deepseek.com/', grok: 'https://grok.com/' };
/** @returns {never} */
export function fail(message, status = 422) { throw Object.assign(new Error(message), { status }); }
export function text(v, max = 200, min = 1) { if (typeof v !== 'string' || v.trim().length < min || v.length > max)
    fail('Nội dung cần từ ' + min + ' đến ' + max + ' ký tự.'); return v.trim(); }
export function money(v) { if (!Number.isSafeInteger(v) || v < 0 || v > 1e13)
    fail('Số tiền phải là số nguyên VNĐ hợp lệ.'); return v; }
export function httpsURL(v) { let u; try {
    u = new URL(v);
}
catch {
    fail('URL nguồn không hợp lệ.');
} if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.hostname === 'localhost' || /^\d+\./.test(u.hostname) || u.hostname.includes(':'))
    fail('Cần URL HTTPS công khai.'); return u.href; }
export const SOURCE_HOSTS = ['sbv.gov.vn', 'chinhphu.vn', 'baochinhphu.vn', 'moj.gov.vn', 'vietnamnet.vn', 'vnexpress.net', 'tuoitre.vn', 'thanhnien.vn', 'reuters.com', 'apnews.com'];
export function sourceURL(v) { const u = new URL(httpsURL(v)); if (!SOURCE_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h)))
    fail('Nguồn chưa nằm trong danh sách cho phép.'); return u.href; }
export function accountInput(v) { const provider = text(v.provider, 20); if (!CAPABILITIES[provider])
    fail('Nhà cung cấp chưa hỗ trợ.'); const roles = Array.isArray(v.roles) ? [...new Set(v.roles)] : CAPABILITIES[provider]; if (!roles.length || roles.some(r => !CAPABILITIES[provider].includes(r)))
    fail('Vai trò không được nhà cung cấp hỗ trợ.'); return { label: text(v.label, 80), provider, roles, enabled: v.enabled !== false }; }
export function productInput(v) { const purity = text(v.purity || '999.9', 20), weight = Number(v.weight || 0); if (!Number.isFinite(weight) || weight < 0 || weight > 100000)
    fail('Trọng lượng không hợp lệ.'); if (!['nhan', 'bong-tai', 'day-chuyen', 'lac-vong', 'da-quy', 'khac'].includes(v.category))
    fail('Danh mục không hợp lệ.'); return { sku: text(v.sku, 60), name: text(v.name, 150), description: text(v.description || '', 4000, 0), category: v.category, purity, weight, price: v.price === null || v.price === '' ? null : money(Number(v.price)), available: v.available !== false, imageIds: Array.isArray(v.imageIds) ? v.imageIds.slice(0, 8) : [], source: 'website', published: v.published === true }; }
export function validateResult(stage, v, context = {}) {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        fail('Kết quả cần là JSON object.');
    if (stage === 'consult')
        text(v.reply, 3000, 3);
    if (stage === 'research') {
        if (!Array.isArray(v.items) || !v.items.length || v.items.length > 5)
            fail('Cần 1–5 nguồn.');
        if (new Set(v.items.map(x => sourceURL(x.url))).size !== v.items.length)
            fail('Các bài nguồn phải có URL khác nhau.');
        for (const x of v.items) {
            text(x.title, 250);
            sourceURL(x.url);
            text(x.excerpt, 2000, 30);
            if (!Number.isFinite(Date.parse(x.publishedAt)))
                fail('Thiếu thời điểm xuất bản nguồn.');
        }
    }
    if (stage === 'write') {
        text(v.headline, 180);
        text(v.summary, 3500, 80);
        text(v.script, 3000, 80);
        if (!Array.isArray(v.sourceUrls) || !v.sourceUrls.length)
            v.sourceUrls = context.sourceUrls || [];
        if (!v.sourceUrls.length) fail('Bản viết cần nguồn đã xác minh.');
        const verified = Array.isArray(context.sourceUrls) ? new Set(context.sourceUrls.map(sourceURL)) : null;
        for (const u of v.sourceUrls) {
            const normalized = sourceURL(u);
            if (verified && !verified.has(normalized)) fail('Bản viết có URL chưa được bước tìm tin xác minh.');
        }
    }
    if (stage === 'review' || stage === 'image-review') {
        if (typeof v.approved !== 'boolean')
            fail('Thiếu kết luận approved.');
        text(v.reason, 2000, 10);
        if (context.creator && context.actor === context.creator)
            fail('Cần một tài khoản khác duyệt độc lập.', 409);
        if (stage === 'image-review' && v.approved) {
            if (!Array.isArray(v.inspectedAssetHashes) || !context.assets?.length || JSON.stringify([...v.inspectedAssetHashes].sort()) !== JSON.stringify([...context.assets].sort()))
                fail('Chưa chứng minh đã xem đúng toàn bộ ảnh.');
        }
    }
    if (stage === 'image') {
        if (!Array.isArray(v.rows) || v.rows.length !== 2 || new Set(v.rows.map(x => x.assetId)).size !== 2)
            fail('Cần hai ảnh khác nhau.');
        for (const row of v.rows)
            if (!/^[a-f0-9]{64}$/.test(row.assetId))
                fail('Thiếu hash ảnh thật.');
    }
    if (stage === 'render') {
        for (const k of ['videoId', 'audioId', 'captionsId'])
            if (!/^[a-f0-9]{64}$/.test(v[k] || ''))
                fail('Cần video, giọng đọc và phụ đề thật.');
        if (!Number.isFinite(v.duration) || v.duration < 10 || v.duration > 150 || v.width !== 1080 || v.height !== 1920)
            fail('Video cần 1080×1920, thời lượng 10–150 giây.');
    }
    return v;
}
export function mayDelete(asset, allReceipts, required) { return ['video-temp','audio','captions'].includes(asset.purpose) && !!asset.storyId && required.length > 0 && required.every(p => allReceipts.some(r => r.story_id === asset.storyId && r.platform === p && r.external_id && r.url)); }
export function goldSlot(now = new Date()) { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now); const get = k => p.find(x => x.type === k)?.value; const hour = Number(get('hour')); return [7, 12, 19].includes(hour) ? `${get('year')}-${get('month')}-${get('day')}-${hour}` : null; }
export function nextStage(stage) { return STAGES[STAGES.indexOf(stage) + 1] || null; }
export function stripMarkup(s) { return String(s).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
