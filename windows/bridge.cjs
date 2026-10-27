'use strict';
const crypto = require('node:crypto');
const sha = v => crypto.createHash('sha256').update(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v)).digest('hex');
const protocol = 'gemini-browser-news-v1';
function create({ config, ledger }) {
    let remote = { jobs: [], settings: {} }, online = false, lastError = '', cache = new Map(), hub;
    const claims = ledger.get('claims') || {}, outbox = ledger.get('outbox') || [];
    for (const [id, claim] of Object.entries(claims)) if (claim.job) cache.set(id, claim.job);
    const save = () => { ledger.set('claims', claims); ledger.set('outbox', outbox); };
    async function request(route, method = 'GET', data, headers = {}) { if (!route.startsWith('/api/'))
        throw Error('Endpoint ngoài giao thức.'); const r = await fetch(config.serverUrl + route, { method, redirect: 'error', signal: AbortSignal.timeout(25000), headers: { 'x-kbl-worker-token': config.token, ...(config.serviceAccessBearer ? { 'OAI-Sites-Authorization': 'Bearer ' + config.serviceAccessBearer } : {}), ...(data !== undefined && !Buffer.isBuffer(data) ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(data !== undefined ? { body: Buffer.isBuffer(data) ? data : JSON.stringify(data) } : {}) }); if (!r.ok) {
        const v = await r.json().catch(() => ({ error: 'HTTP ' + r.status }));
        throw Object.assign(Error(v.error || 'HTTP ' + r.status), { status: r.status });
    } if (headers._binary)
        return { bytes: Buffer.from(await r.arrayBuffer()), mime: r.headers.get('content-type') }; return r.json(); }
    function mapJob(j) { const role = j.stage === 'consult' ? 'write' : j.stage, kind = j.stage === 'consult' ? 'write' : role === 'image' ? 'images' : role; return { ...j, id: j.id, kind, role, status: ({ queued: 'waiting', leased: 'working', running: 'working', attention: 'working', blocked: 'working' })[j.status] || j.status, expiresAt: Date.now() + 365 * 86400000, createdAt: j.created_at, routedAccount: j.owner || undefined, assignedAccount: j.owner || undefined, forbiddenAccount: j.exclude_account || undefined, leaseUntil: j.lease_until || 0, parentId: role === 'image-review' ? j.id.replace(/image-review$/, 'image') : undefined, result: j.result ? { data: JSON.parse(j.result) } : undefined }; }
    async function sync() { try {
        const r = await request('/api/worker/queue');
        remote = r;
        for (const j of r.jobs) {
            const c = claims[j.id];
            if (c && j.owner === c.accountId && ['leased', 'running', 'attention'].includes(j.status) && Number(j.lease_until) > Number(c.until || 0)) c.until = Number(j.lease_until);
            if (c && j.exclude_account === c.accountId && j.status === 'queued') {
                const affected = outbox.filter(p => p.jobId === j.id && p.body);
                ledger.set('retired-outbox:' + j.id + ':' + Date.now(), affected);
                for (const p of affected) {
                    p.status = 'discarded';
                    delete p.body;
                }
                delete claims[j.id];
                save();
            }
        }
        cache = new Map(r.jobs.map(j => [j.id, { ...cache.get(j.id), ...mapJob(j) }]));
        for (const [id, claim] of Object.entries(claims)) if (cache.has(id)) claim.job = cache.get(id);
        save();
        online = true;
        lastError = '';
        await flush();
    }
    catch (e) {
        online = false;
        lastError = e.message;
    } return view(); }
    function view() { return { connected: online, lastError, paidFallback: false, health: { browserProtocol: protocol }, server: { mode: remote.settings.teamEnabled ? 'active' : 'paused', accounts: ledger.get('accounts') || [], jobs: [...cache.values()] }, claims: Object.fromEntries(Object.entries(claims).map(([id, c]) => [id, { accountId: c.accountId, until: c.until }])), outbox: outbox.map(({ body, ...r }) => r) }; }
    async function getJob(id) { if (!cache.has(id)) {
        const r = await request('/api/worker/job-details/' + encodeURIComponent(id));
        cache.set(id, { ...claims[id]?.job, ...mapJob(r.job) });
    } const j = cache.get(id); if (!j)
        throw Error('Không có công việc.'); return j; }
    async function claim(id, accountId) { const r = await request('/api/worker/claim', 'POST', { accountId, jobId: id }); if (!r.job || r.job.id !== id)
        throw Error('Hàng đợi vừa thay đổi; chưa gửi prompt.'); const context = r.job.context, src = context.outputs?.research?.sourceEvidence?.[0], doc = { ...context, source: src ? { url: src.url } : undefined, sourceEvidence: src ? { ...src, protocol: 'kbl-source-snapshot-v1', status: 'retrieved', requestedUrl: src.url } : undefined, news: context.outputs?.write || { headline: context.story?.title, summary: context.story?.topic }, suggestedConcepts: ['Minh họa bối cảnh kinh tế và vàng, bố cục tổng thể.', 'Minh họa chi tiết liên quan bản tin với bố cục khác.'] }; const prompt = r.job.prompt.split('\n\nHỒ SƠ DỮ LIỆU:')[0] + '\n\nHỒ SƠ DỮ LIỆU:\n' + JSON.stringify(doc) + '\n\nSCHEMA JSON:\n' + JSON.stringify(r.job.schema); const job = { ...(await getJob(id)), schema: r.job.schema, prompt }; cache.set(id, job); claims[id] = { token: r.lease, until: r.leaseUntil, accountId, job }; save(); return job; }
    async function dispatch(id) { const c = claims[id]; if (c)
        await request('/api/worker/jobs/' + id + '/dispatch', 'POST', { lease: c.token }); }
    async function submit(id, body) { if (!outbox.some(p => p.jobId === id && p.body)) {
        outbox.push({ jobId: id, id: sha({ id, body }), body, status: 'pending', createdAt: Date.now() });
        save();
    } await flush(); return view(); }
    let flushing = false;
    async function flush() { if (flushing)
        return; flushing = true; try {
        for (const p of outbox.filter(p => p.status === 'pending').slice(0, 1)) {
            try {
                const c = claims[p.jobId];
                if (!c)
                    throw Error('Chưa có mã lượt đã lưu.');
                const r = await request('/api/worker/jobs/' + p.jobId + '/complete', 'POST', { lease: c.token, result: JSON.parse(p.body.result), browserExecution: p.body.browserExecution });
                if (!r.stored)
                    throw Error('Chưa có biên nhận.');
                p.status = 'confirmed';
                p.message = 'Server mới đã lưu kết quả và tiếp tục bước sau.';
                delete p.body;
                delete claims[p.jobId];
                save();
            }
            catch (e) {
                p.message = e.message;
                if ([409, 422].includes(e.status)) {
                    p.status = 'attention';
                    await request('/api/worker/jobs/' + p.jobId + '/failure', 'POST', { lease: claims[p.jobId]?.token, message: e.message, notSent: false }).catch(() => { });
                }
                save();
            }
        }
        if (outbox.length > 100) {
            const keep = outbox.filter(x => x.body).concat(outbox.filter(x => !x.body).slice(-60));
            outbox.splice(0, outbox.length, ...keep);
            save();
        }
    }
    finally {
        flushing = false;
    } }
    async function image(id, { base64, mime }) { const c = claims[id], j = await getJob(id); return request('/api/worker/assets?storyId=' + j.story_id + '&purpose=news-image', 'POST', Buffer.from(base64, 'base64'), { 'Content-Type': mime, 'x-kbl-job-id': id, 'x-kbl-job-lease': c.token }); }
    async function asset(id, aid) { const c = claims[id]; return request('/api/worker/assets/' + aid + '?jobId=' + encodeURIComponent(id), 'GET', undefined, { 'x-kbl-job-lease': c.token, _binary: true }); }
    return { sync, view, getJob, claim, dispatch, submit, image, asset, request, attachHub: h => { hub = h; }, setAccounts: a => ledger.set('accounts', a), accounts: async () => ({}), mode: async () => ({}), control: async () => ({}) };
}
module.exports = { create };
