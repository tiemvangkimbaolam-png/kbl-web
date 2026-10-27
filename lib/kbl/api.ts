import { handleInboxWebhook, handleInboxAdmin } from './inbox';
import { servePublishingMedia, publishingStatus } from './publishing';
import { handleSocialAdmin } from './social';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import * as S from './store';
import * as P from './pipeline';
import * as POS from './pos';
import { admin, worker } from './auth';
import { readWorldMarket } from './market.mjs';
import { bindingHealth } from './health.mjs';
import { accountInput, productInput, text, money, fail, httpsURL, PROVIDER_URLS } from './domain.mjs';
const response = (v: any, status = 200, headers: Record<string, string> = {}) => Response.json(v, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
async function body(req: Request, max = 100000) { if (!req.headers.get('content-type')?.includes('application/json'))
    fail('Cần nội dung JSON.', 415); if (Number(req.headers.get('content-length') || 0) > max)
    fail('Dữ liệu quá lớn.', 413); const v = await req.text(); if (v.length > max)
    fail('Dữ liệu quá lớn.', 413); return JSON.parse(v); }
async function rate(req: Request, scope: string, max = 12) { const key = await S.sha((req.headers.get('cf-connecting-ip') || 'unknown') + ':' + scope + ':' + Math.floor(Date.now() / 3600000)); const r = await S.sql().prepare('INSERT INTO records(kind,id,data,created_at,updated_at) VALUES(\'rate\',?,\'1\',?,?) ON CONFLICT(kind,id) DO UPDATE SET data=CAST(CAST(records.data AS INTEGER)+1 AS TEXT) RETURNING data').bind(key, Date.now(), Date.now()).first<any>(); if (Number(r.data) > max)
    fail('Đã nhận nhiều yêu cầu; thử lại sau.', 429); }
async function assetResponse(req: Request, aid: string) { const a = await S.sql().prepare('SELECT * FROM assets WHERE id=? AND deleted_at IS NULL').bind(aid).first<any>(); if (!a)
    fail('File không còn trên máy chủ.', 404); if (!a.public)
    await admin(req); const data = await env.BUCKET?.get(aid); if (!data)
    fail('Không tìm thấy file.', 404); return new Response(data.body as any, { headers: { 'Content-Type': a.mime, 'Content-Length': String(data.size), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': a.public ? 'public,max-age=86400' : 'private,no-store' } }); }
async function upload(req: Request, storyId: string | null, purpose: string) {
    if (!env.BUCKET)
        fail('Kho file chưa kết nối.', 503);
    const mime = (req.headers.get('content-type') || '').split(';')[0];
    if (!['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'audio/mpeg', 'audio/wav', 'text/plain', 'application/x-subrip'].includes(mime))
        fail('Định dạng file chưa hỗ trợ.', 415);
    const limit = mime.startsWith('video/') ? 20 * 1024 * 1024 : 12 * 1024 * 1024;
    if (Number(req.headers.get('content-length') || 0) > limit)
        fail('File quá lớn.', 413);
    const data = await req.arrayBuffer();
    if (data.byteLength > limit || !data.byteLength)
        fail('File rỗng hoặc vượt giới hạn.', 413);
    const b = new Uint8Array(data);
    if (mime === 'image/png' && !(b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) || mime === 'image/jpeg' && !(b[0] === 255 && b[1] === 216) || mime === 'image/webp' && !(String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') || mime === 'video/mp4' && String.fromCharCode(...b.slice(4, 8)) !== 'ftyp')
        fail('Nội dung file không khớp định dạng.', 415);
    const cfg = await S.settings(), hash = await S.sha(data), existing = await S.sql().prepare('SELECT * FROM assets WHERE id=?').bind(hash).first<any>();
    if (existing && !existing.deleted_at) {
        if (existing.story_id !== storyId)
            fail('File đã thuộc hồ sơ khác; dùng ảnh riêng cho bản tin.', 409);
        if (await env.BUCKET.head(hash))
            return { id: hash, assetId: hash, bytes: existing.bytes };
    }
    if (!existing || existing.deleted_at) {
        const reserved = await S.sql().prepare('INSERT INTO assets(id,story_id,mime,bytes,purpose,public,created_at) SELECT ?,?,?,?,?,0,? WHERE (SELECT COALESCE(SUM(bytes),0) FROM assets WHERE deleted_at IS NULL)+?<=? ON CONFLICT(id) DO UPDATE SET deleted_at=NULL,story_id=excluded.story_id,purpose=excluded.purpose,mime=excluded.mime,bytes=excluded.bytes RETURNING id').bind(hash, storyId, mime, data.byteLength, purpose, Date.now(), data.byteLength, cfg.storageLimitMB * 1024 * 1024).first();
        if (!reserved)
            fail('Đã chạm giới hạn kho file. Giữ file gốc ở Windows; dọn bản tạm trước khi tải tiếp.', 507);
    }
    try {
        await env.BUCKET.put(hash, data, { httpMetadata: { contentType: mime } });
    }
    catch (e) {
        await S.sql().prepare('UPDATE assets SET deleted_at=? WHERE id=? AND public=0').bind(Date.now(), hash).run();
        throw e;
    }
    return { id: hash, assetId: hash, bytes: data.byteLength };
}
export async function handle(req: Request): Promise<Response> {
    try {
        const u = new URL(req.url), path = u.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean), method = req.method;
        if(path[0] === 'social-inbox' && path[1] && path[2]) return handleInboxWebhook(req,path[1],path[2]);
        if(path[0] === 'publishing-media' && path[1] && method === 'GET') return servePublishingMedia(path[1]);
        if (path[0] === 'health') {
            const health = await bindingHealth(env);
            return response({ ...health, version: '2.1.1', paidAIFallback: false }, health.ok ? 200 : 503);
        }
        if (path[0] === 'media' && path[1] && method === 'GET')
            return await assetResponse(req, path[1]);
        if (method === 'GET' && (path[0] === 'lookup' || path[0] === 'public' && path[1] === 'pos-receipt')) {
            await rate(req, 'pos-receipt', 120);
            return response(await POS.lookup(req.headers.get('x-kbl-receipt-token') || u.searchParams.get('token') || ''), 200, { 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
        }
        if (path[0] === 'public') {
            if (method === 'GET' && path[1] === 'market')
                return response(await readWorldMarket());
            if (method === 'GET' && path[1] === 'catalog') {
                const cfg = await S.settings();
                const posBound = await POS.locked();
                return response({ products: (await S.list('product', 500)).filter((p: any) => p.published && p.available && (!posBound || p.source === 'pos')), articles: await S.list('article', 30), prices: (await S.list('price', 40)).filter((p: any) => !posBound || p.id.startsWith('pos-')), company: { name: cfg.companyName, phone: cfg.phone, address: cfg.address, hours: cfg.hours }, posBound, connected: true });
            }
            if (method === 'GET' && path[1] === 'article') {
                const a = await S.get('article', path[2]);
                if (!a)
                    fail('Bản tin chưa xuất bản.', 404);
                return response(a);
            }
            if (method === 'POST' && path[1] === 'orders') {
                await rate(req, 'order', 8);
                const v = await body(req), customer = z.object({ name: z.string().trim().min(2).max(100), phone: z.string().regex(/^(?:\+84|0)[0-9]{9,10}$/), note: z.string().max(1000).optional(), consent: z.literal(true) }).parse(v.customer);
                if (!Array.isArray(v.items) || !v.items.length || v.items.length > 20)
                    fail('Giỏ hàng chưa hợp lệ.');
                const products = await S.list('product', 500), items = [], posBound = await POS.locked();
                let total = 0;
                for (const row of v.items) {
                    const p = products.find((x: any) => x.id === row.id && x.published && x.available && (!posBound || x.source === 'pos'));
                    if (!p || p.price === null)
                        fail('Sản phẩm vừa thay đổi hoặc cần báo giá. Làm mới giỏ hàng.', 409);
                    const quantity = z.number().int().min(1).max(10).parse(row.quantity);
                    items.push({ id: p.id, sku: p.sku, name: p.name, quantity, unitPrice: p.price });
                    total += p.price * quantity;
                }
                const oid = S.id();
                await S.put('order', oid, { customer, items, total, status: 'new', currency: 'VND', priceCapturedAt: Date.now() });
                await S.event('order-created', 'Có yêu cầu giữ mẫu mới.');
                return response({ id: oid, total, status: 'new', message: 'Đã lưu yêu cầu giữ mẫu. Cửa hàng sẽ xác nhận giá, tồn kho và thanh toán.' }, 201);
            }
            if (method === 'POST' && path[1] === 'consult') {
                await rate(req, 'consult', 15);
                const v = await body(req), question = text(v.question, 2000, 3), threadId = S.id(), token = S.randomToken();
                await S.put('consultation', threadId, { question, reply: null, tokenHash: await S.sha(token), status: 'awaiting-reply' });
                return response({ id: threadId, token, message: 'Đã nhận câu hỏi. Tư vấn viên sẽ trả lời tại cuộc trò chuyện này.' }, 201);
            }
            if (method === 'GET' && path[1] === 'consult' && path[2]) {
                const c = await S.get('consultation', path[2]);
                if (!c || await S.sha(req.headers.get('x-kbl-chat-token') || '') !== c.tokenHash)
                    fail('Không tìm thấy cuộc trò chuyện.', 404);
                return response({ question: c.question, reply: c.reply, status: c.status });
            }
        }
        if (path[0] === 'admin') {
            const actor = await admin(req);
            if(path[1] === 'inbox') return handleInboxAdmin(req,path.slice(2));
            if(path[1] === 'social') return handleSocialAdmin(req, path.slice(2), actor);
            if(path[1] === 'publication-config') {
                if(method === 'GET') return response({connections:(await S.settings()).publicationConnections||{},outbox:await publishingStatus()});
                if(method === 'POST') {
                    const input=z.record(z.enum(['facebook','instagram','threads','youtube','tiktok','telegram','zalo']),z.string().regex(/^[a-f0-9]{32}$/)).parse((await body(req)).connections);
                    for(const [platform,id] of Object.entries(input)){const row=await S.get('social-connection',id);if(row?.platform!==platform||row?.status!=='connected'||!row?.targetId)fail('Kết nối chưa sẵn sàng hoặc chưa chọn đích.');}
                    await S.put('settings','main',{...await S.settings(),publicationConnections:input});return response({ok:true});
                }
            }
            if (method === 'GET' && path[1] === 'state') {
                const [cfg, accounts, workers, products, stories, prices, orders, consultations, channels, commands, jobs, events, receipts, storage, editions] = await Promise.all([S.settings(), S.list('account', 20), S.list('worker', 20), S.list('product', 500), S.list('story', 80), S.list('price', 40), S.list('order', 100), S.list('consultation', 100), S.list('channel', 20), S.list('command', 30), S.sql().prepare('SELECT id,story_id,stage,status,owner,exclude_account,lease_until,attempt,error,created_at,updated_at FROM jobs ORDER BY created_at DESC LIMIT 250').all(), S.sql().prepare('SELECT * FROM events ORDER BY id DESC LIMIT 80').all(), S.sql().prepare('SELECT * FROM receipts ORDER BY at DESC LIMIT 100').all(), S.sql().prepare('SELECT COALESCE(SUM(bytes),0) bytes,COUNT(*) files FROM assets WHERE deleted_at IS NULL').first(), S.sql().prepare('SELECT * FROM editions ORDER BY created_at DESC LIMIT 12').all()]);
                return response({ settings: cfg, accounts, workers, products, stories, prices, orders, consultations: consultations.map(({ tokenHash, ...v }: any) => v), channels, commands, jobs: jobs.results, events: events.results, receipts: receipts.results, storage, editions: editions.results, posBound: await POS.locked(), posSync: await S.list('pos-sync', 10), serverTime: Date.now() });
            }
            if (method === 'POST' && path[1] === 'settings') {
                const v = await body(req), old = await S.settings();
                const allowed = z.object({ teamEnabled: z.boolean().optional(), autoResearch: z.boolean().optional(), autoConsult: z.boolean().optional(), publicationEnabled: z.boolean().optional(), storageLimitMB: z.number().int().min(32).max(2048).optional(), companyName: z.string().min(3).max(150).optional(), phone: z.string().max(30).optional(), address: z.string().max(300).optional(), hours: z.string().max(100).optional() }).strict().parse(v);
                if (allowed.teamEnabled === true) {
                    const ac = await S.list('account', 20);
                    if (!ac.length)
                        fail('Thêm ít nhất một tài khoản AI trước khi bắt đầu.');
                }
                await S.put('settings', 'main', { ...old, ...allowed });
                await S.event('settings-updated', 'Đã lưu cấu hình vận hành.');
                return response({ ok: true });
            }
            if (method === 'POST' && path[1] === 'accounts') {
                const v = await body(req), ac = await S.list('account', 20);
                if (ac.length >= 20)
                    fail('Đội đã có 20 tài khoản.');
                const value = accountInput(v), aid = value.provider + '-' + S.id().slice(0, 8);
                await S.put('account', aid, { ...value, workerId: v.workerId || null, status: 'offline', lastSeen: 0 });
                await S.event('account-added', 'Đã thêm ' + value.label + '. Chờ Windows kết nối.');
                return response({ id: aid }, 201);
            }
            if (method === 'PATCH' && path[1] === 'accounts' && path[2]) {
                const old = await S.get('account', path[2]);
                if (!old)
                    fail('Không tìm thấy tài khoản.', 404);
                const v = await body(req);
                if (v.provider && v.provider !== old.provider)
                    fail('Thêm hồ sơ mới khi đổi nhà cung cấp; giữ phiên Chrome hiện tại.');
                await S.put('account', old.id, { ...old, ...accountInput({ ...old, ...v }) }, old.version);
                return response({ ok: true });
            }
            if (method === 'POST' && path[1] === 'commands') {
                const v = await body(req);
                if (!['open-login', 'check-session', 'hide-window', 'resume'].includes(v.operation))
                    fail('Lệnh chưa được hỗ trợ.');
                const a = await S.get('account', v.accountId);
                if (!a?.workerId)
                    fail('Tài khoản chưa ghép Windows. Tải bộ Windows và kết nối trước.');
                const cid = S.id();
                await S.put('command', cid, { accountId: a.id, workerId: a.workerId, operation: v.operation, status: 'pending', expiresAt: Date.now() + 600000 });
                return response({ id: cid });
            }
            if (method === 'POST' && path[1] === 'workers') {
                const v = await body(req), label = text(v.label || 'Windows tại cửa hàng', 100), wid = S.id(), token = S.randomToken();
                await S.put('worker', wid, { label, status: 'offline', lastSeen: 0, capabilities: [] });
                await S.put('worker-auth', await S.sha(token), { workerId: wid, enabled: true });
                return response({ id: wid, token, serverUrl: u.origin, protocol: 'kbl-worker-v2', serviceAccessBearer: (env as any).SITES_SERVICE_TOKEN || undefined }, 201);
            }
            if (method === 'POST' && path[1] === 'products') {
                if (await POS.locked()) fail('Danh mục do POS quản lý. Sửa tại POS rồi đồng bộ lại.', 403);
                const v = await body(req), data = productInput(v), pid = v.id || S.id();
                if (data.imageIds.length) {
                    for (const aid of data.imageIds) {
                        if (!/^[a-f0-9]{64}$/.test(aid))
                            fail('Mã ảnh không hợp lệ.');
                        const a = await S.sql().prepare('SELECT id FROM assets WHERE id=? AND purpose=\'product\' AND deleted_at IS NULL').bind(aid).first();
                        if (!a)
                            fail('Ảnh sản phẩm không tồn tại.');
                    }
                }
                const previous = await S.get('product', pid);
                await S.put('product', pid, data, v.version);
                for (const aid of [...new Set([...(previous?.imageIds || []), ...data.imageIds])])
                    await S.sql().prepare("UPDATE assets SET public=CASE WHEN EXISTS(SELECT 1 FROM records r,json_each(json_extract(r.data,'$.imageIds')) im WHERE r.kind='product' AND json_extract(r.data,'$.published')=1 AND im.value=assets.id) OR EXISTS(SELECT 1 FROM records r,json_each(json_extract(r.data,'$.images')) im WHERE r.kind='article' AND json_extract(im.value,'$.assetId')=assets.id) THEN 1 ELSE 0 END WHERE id=?").bind(aid).run();
                return response({ id: pid });
            }
            if (method === 'POST' && path[1] === 'upload')
                { if (await POS.locked()) fail('Ảnh sản phẩm do POS quản lý.', 403); return response(await upload(req, null, 'product')); }
            if (method === 'POST' && path[1] === 'stories') {
                const v = await body(req);
                return response({ id: await P.createStory(v) }, 201);
            }
            if (method === 'POST' && path[1] === 'prices') {
                if (await POS.locked()) fail('Bảng giá do POS quản lý. Chốt giá ở POS.', 403);
                const v = await body(req), buy = money(Number(v.buy)), sell = money(Number(v.sell));
                if (sell < buy)
                    fail('Giá bán phải lớn hơn hoặc bằng giá mua.');
                const capturedAt = Date.parse(v.capturedAt);
                if (!Number.isFinite(capturedAt) || capturedAt > Date.now() + 60000 || capturedAt < Date.now() - 86400000)
                    fail('Chọn thời điểm chốt giá trong 24 giờ gần nhất.');
                await S.put('price', v.id || S.id(), { label: text(v.label, 100), buy, sell, unit: 'đồng/lượng', source: text(v.source, 200), capturedAt });
                return response({ ok: true });
            }
            if (method === 'POST' && path[1] === 'orders' && path[2]) {
                const old = await S.get('order', path[2]), v = await body(req);
                if (!old)
                    fail('Không tìm thấy đơn.', 404);
                if (!['new', 'confirmed', 'completed', 'canceled'].includes(v.status))
                    fail('Trạng thái không hợp lệ.');
                await S.put('order', old.id, { ...old, status: v.status }, old.version);
                return response({ ok: true });
            }
            if (method === 'POST' && path[1] === 'consultations' && path[2]) {
                const c = await S.get('consultation', path[2]), v = await body(req);
                if (!c)
                    fail('Không tìm thấy cuộc tư vấn.', 404);
                await S.put('consultation', c.id, { ...c, reply: text(v.reply, 4000), status: 'answered' }, c.version);
                return response({ ok: true });
            }
            if (method === 'POST' && path[1] === 'jobs' && path[2]) {
                const job = await S.sql().prepare('SELECT * FROM jobs WHERE id=?').bind(path[2]).first<any>();
                if (!job)
                    fail('Không tìm thấy công việc.', 404);
                if (!['blocked', 'attention'].includes(job.status))
                    fail('Chỉ tiếp tục việc đang cần xử lý.');
                const v = await body(req);
                if (v.confirmOriginalStopped !== true)
                    fail('Xác nhận đã kiểm tra và dừng lượt cũ trước khi giao lại.');
                const resumed = await S.sql().prepare('UPDATE jobs SET status=\'queued\',exclude_account=owner,owner=NULL,lease_hash=NULL,lease_until=NULL,error=NULL,updated_at=? WHERE id=? AND status IN (\'blocked\',\'attention\') AND updated_at=? RETURNING id').bind(Date.now(), job.id, job.updated_at).first();
                if (!resumed) fail('Lượt vừa thay đổi; tải lại trước khi tiếp tục.', 409);
                const story = await S.get('story', job.story_id);
                if (story && story.status !== 'published') await S.put('story', story.id, { ...story, status: 'working', message: 'Đã kiểm tra lượt cũ; chờ tài khoản khác nhận tiếp.' }, story.version);
                await S.event('job-requeued', `Chủ đã kiểm tra lượt cũ; giao lại cho tài khoản khác. ${job.stage}: ${String(job.error || job.status).slice(0, 500)}`, job.story_id);
                return response({ ok: true });
            }
            if (method === 'GET' && path[1] === 'export') {
                const kinds = ['settings', 'product', 'price', 'story', 'article', 'account', 'order', 'consultation', 'channel'];
                const data: any = { version: 2, exportedAt: new Date().toISOString() };
                for (const k of kinds)
                    data[k] = await S.list(k, 1000);
                data.consultation = data.consultation.map(({ tokenHash, ...v }: any) => v);
                return response(data, 200, { 'Content-Disposition': 'attachment; filename="KBL-DU-LIEU.json"' });
            }
            if (method === 'POST' && path[1] === 'cleanup')
                return response(await P.cleanup());
            if (method === 'POST' && path[1] === 'tick') {
                await P.tick();
                return response({ ok: true });
            }
        }
        if (path[0] === 'worker') {
            const wid = await worker(req);
            if (method === 'POST' && path[1] === 'pos-prices') return response(await POS.prices(wid, await body(req)));
            if (method === 'POST' && path[1] === 'pos-pawn') return response(await POS.pawns(wid, await body(req, 3000000)));
            if (method === 'POST' && path[1] === 'pos-warranty') return response(await POS.warranties(wid, await body(req), u.origin));
            if (method === 'POST' && path[1] === 'pos-transaction') return response(await POS.transaction(wid, await body(req)));
            if (method === 'POST' && path[1] === 'pos-photo') {
                await POS.bind(wid);
                const sku = text(u.searchParams.get('sku'), 60), product = await S.get('product', 'pos-' + await S.sha(sku));
                if (!product || product.source !== 'pos') fail('SKU chưa được nhận từ POS.', 404);
                if (!['image/png', 'image/jpeg', 'image/webp'].includes((req.headers.get('content-type') || '').split(';')[0])) fail('Chỉ nhận ảnh sản phẩm.', 415);
                const asset = await upload(req, null, 'product');
                return response(await POS.attachPhoto(wid, sku, asset.assetId));
            }
            if (method === 'POST' && path[1] === 'heartbeat') {
                const v = await body(req), old = await S.get('worker', wid);
                const posStatus = v.posStatus && typeof v.posStatus === 'object' ? { pending: Math.max(0, Math.min(100, Number(v.posStatus.pending) || 0)), photoPending: Math.max(0, Math.min(500, Number(v.posStatus.photoPending) || 0)), lastSuccess: Number(v.posStatus.lastSuccess) || 0, lastError: String(v.posStatus.lastError || '').slice(0, 250) } : undefined;
                await S.put('worker', wid, { ...old, status: 'online', lastSeen: Date.now(), capabilities: Array.isArray(v.capabilities) ? v.capabilities.filter((x: any) => ['render', 'publish', 'browser', 'pos-readonly'].includes(x)) : [], version: String(v.version || '').slice(0, 50), renderStatus: String(v.renderStatus || '').slice(0, 400), posStatus });
                const reports = Array.isArray(v.accounts) ? v.accounts.slice(0, 20).map((a: any) => ({ id: String(a.id), status: ['ready', 'working', 'quota', 'challenge', 'attention', 'offline'].includes(a.status) ? a.status : 'offline', message: String(a.message || '').slice(0, 300) })) : [];
                const encoded = JSON.stringify(reports);
                await S.sql().prepare("UPDATE records SET data=json_set(data,'$.workerId',?,'$.lastSeen',?,'$.status',(SELECT json_extract(j.value,'$.status') FROM json_each(?) j WHERE json_extract(j.value,'$.id')=records.id),'$.message',(SELECT json_extract(j.value,'$.message') FROM json_each(?) j WHERE json_extract(j.value,'$.id')=records.id)),version=version+1,updated_at=? WHERE kind='account' AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND (json_extract(data,'$.workerId') IS NULL OR json_extract(data,'$.workerId')=?)").bind(wid, Date.now(), encoded, encoded, Date.now(), encoded, wid).run();
                const activeIds = JSON.stringify(Array.isArray(v.activeJobIds) ? v.activeJobIds.slice(0, 40) : []);
                await S.sql().prepare("UPDATE jobs SET lease_until=? WHERE status IN ('leased','running','attention') AND id IN (SELECT value FROM json_each(?)) AND (owner=? OR owner IN (SELECT id FROM records WHERE kind='account' AND json_extract(data,'$.workerId')=?))").bind(Date.now() + 30 * 60000, activeIds, wid, wid).run();
                await P.tick();
                const commands = (await S.list('command', 50)).filter((c: any) => c.workerId === wid && c.status === 'pending' && c.expiresAt > Date.now());
                return response({ ok: true, workerId: wid, accounts: (await S.list('account', 20)).filter((a: any) => !a.workerId || a.workerId === wid), commands, settings: await S.settings() });
            }
            if (method === 'POST' && path[1] === 'commands' && path[2]) {
                const c = await S.get('command', path[2]), v = await body(req);
                if (!c || c.workerId !== wid)
                    fail('Lệnh không thuộc máy này.', 403);
                await S.put('command', c.id, { ...c, status: v.ok === true ? 'done' : 'failed', message: String(v.message || '').slice(0, 400) });
                return response({ ok: true });
            }
            if (method === 'GET' && path[1] === 'queue') {
                const rows = (await S.sql().prepare("SELECT id,story_id,stage,status,owner,exclude_account,lease_until,attempt,result,result_hash,error,created_at,updated_at FROM jobs ORDER BY CASE WHEN status IN ('complete','canceled') THEN 1 ELSE 0 END,created_at ASC LIMIT 300").all<any>()).results;
                return response({ jobs: rows, settings: await S.settings() });
            }
            if (method === 'GET' && path[1] === 'job-details' && path[2]) {
                const j = await S.sql().prepare('SELECT id,story_id,stage,status,owner,exclude_account,lease_until,attempt,result,result_hash,error,created_at,updated_at FROM jobs WHERE id=?').bind(path[2]).first();
                if (!j)
                    fail('Không có công việc.', 404);
                return response({ job: j });
            }
            if (method === 'POST' && path[1] === 'claim') {
                const v = await body(req);
                return response(await P.claim(wid, v.accountId || null, Array.isArray(v.capabilities) ? v.capabilities.filter((x: any) => ['render'].includes(x)) : [], v.jobId));
            }
            if (path[1] === 'jobs' && path[2]) {
                const v = method === 'GET' ? null : await body(req), lease = req.headers.get('x-kbl-job-lease') || v?.lease || '', job = await P.ownedJob(wid, path[2], lease);
                if (method === 'GET')
                    return response({ id: job.id, status: job.status, resultHash: job.result_hash, hasResult: !!job.result });
                if (method === 'POST' && path[3] === 'dispatch') {
                    if (!['leased', 'running', 'attention'].includes(job.status))
                        fail('Lượt đã bị dừng; không gửi prompt.', 409);
                    await S.sql().prepare('UPDATE jobs SET status=\'running\',lease_until=?,updated_at=? WHERE id=? AND status IN (\'leased\',\'attention\') AND lease_hash=?').bind(Date.now() + 30 * 60000, Date.now(), job.id, job.lease_hash).run();
                    return response({ ok: true });
                }
                if (method === 'POST' && path[3] === 'complete')
                    return response(await P.complete(wid, job.id, lease, v.result));
                if (method === 'POST' && path[3] === 'failure') {
                    const safe = v.notSent === true;
                    if (!['leased', 'running'].includes(job.status))
                        return response({ ok: true });
                    if (safe) {
                        await S.sql().prepare('UPDATE jobs SET status=\'queued\',exclude_account=owner,owner=NULL,lease_hash=NULL,lease_until=NULL,error=?,updated_at=? WHERE id=?').bind(String(v.message || 'Chưa gửi prompt; chuyển tài khoản khác.').slice(0, 600), Date.now(), job.id).run();
                    }
                    else
                        await S.sql().prepare('UPDATE jobs SET status=\'attention\',error=?,updated_at=? WHERE id=?').bind(String(v.message || 'Cần kiểm tra lượt đang giữ.').slice(0, 600), Date.now(), job.id).run();
                    return response({ ok: true });
                }
            }
            if (method === 'POST' && path[1] === 'assets') {
                const storyId = u.searchParams.get('storyId'), purpose = u.searchParams.get('purpose') || 'news-image', jid = req.headers.get('x-kbl-job-id') || '', lease = req.headers.get('x-kbl-job-lease') || '', job = await P.ownedJob(wid, jid, lease);
                if (job.story_id !== storyId || !['leased', 'running', 'attention'].includes(job.status))
                    fail('File không thuộc lượt đang giữ.', 409);
                const allowed = job.stage === 'image' ? ['news-image'] : job.stage === 'render' ? ['video-temp', 'audio', 'captions'] : [];
                if (!allowed.includes(purpose))
                    fail('File không đúng bước đang thực hiện.');
                return response(await upload(req, storyId, purpose));
            }
            if (method === 'GET' && path[1] === 'assets' && path[2]) {
                const job = await P.ownedJob(wid, u.searchParams.get('jobId') || '', req.headers.get('x-kbl-job-lease') || ''), a = await S.sql().prepare('SELECT * FROM assets WHERE id=? AND story_id=? AND deleted_at IS NULL').bind(path[2], job.story_id).first<any>();
                if (!a)
                    fail('Ảnh không thuộc bản tin.', 404);
                const f = await env.BUCKET?.get(a.id);
                if (!f)
                    fail('File không tồn tại.', 404);
                return new Response(f.body as any, { headers: { 'Content-Type': a.mime, 'X-KBL-Asset-Hash': a.id, 'Cache-Control': 'private,no-store' } });
            }
            if (method === 'POST' && path[1] === 'pos-snapshot') return response(await POS.products(wid, await body(req, 3000000)));
        }
        return response({ error: 'Không tìm thấy chức năng.' }, 404);
    }
    catch (e: any) {
        const status = e.status || (e instanceof z.ZodError || e instanceof SyntaxError ? 422 : 500);
        return response({ error: status === 500 ? 'Chưa xử lý được yêu cầu. Dữ liệu đã lưu được giữ nguyên.' : e.message }, status);
    }
}
