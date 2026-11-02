import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ledgerModule = require('../windows/ledger.cjs');
const { create } = require('../windows/bridge.cjs');
const { createHub } = require('../windows/runtime/browser-hub.cjs');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kbl-worker-recovery-'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('SQLite ledgers remain isolated by worker directory', () => {
    const first = ledgerModule.open(temp()), second = ledgerModule.open(temp());
    first.set('claims', { one: true }); second.set('claims', { two: true });
    assert.deepEqual(first.get('claims'), { one: true });
    assert.deepEqual(second.get('claims'), { two: true });
});

test('native two-image job survives scene restart, renews original lease and reconciles lost ACK without another claim', async () => {
    const dir = temp(), ledger = ledgerModule.open(dir), oldFetch = globalThis.fetch;
    const accounts = [{ id: 'image-account', label: 'Fixture image', provider: 'gemini', roles: ['image'], enabled: true }, { id: 'review-account', label: 'Fixture review', provider: 'claude', roles: ['image-review'], enabled: true }];
    ledger.set('accounts', accounts);
    const schema = { type: 'object', properties: { rows: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'object', properties: { assetId: { type: 'string', maxLength: 64 }, caption: { type: 'string', maxLength: 500 } }, required: ['assetId', 'caption'], additionalProperties: false } } }, required: ['rows'], additionalProperties: false };
    const job = { id: 'KBL-fixture-image', story_id: 'fixture', stage: 'image', attempt: 0, status: 'queued', owner: null, created_at: Date.now(), lease_until: 1 };
    let claims = 0, completions = 0, uploads = 0, accepted, loseAck = true;
    globalThis.fetch = async (url, options = {}) => {
        const route = new URL(url).pathname, body = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : null;
        const reply = value => Response.json(value);
        if (route === '/api/worker/queue') return reply({ jobs: [{ ...job }], settings: { teamEnabled: true } });
        if (route.startsWith('/api/worker/job-details/')) return reply({ job: { ...job } });
        if (route === '/api/worker/claim') {
            claims++; assert.equal(body.accountId, accounts[0].id); assert.equal(job.status, 'queued');
            job.status = 'leased'; job.owner = accounts[0].id; job.attempt++;
            return reply({ job: { ...job, context: { story: { title: 'Fixture only', topic: 'Internal image flow' }, outputs: { write: { headline: 'Internal fixture', summary: 'Not a published news item' } } }, schema, prompt: 'Create images\n\nHỒ SƠ DỮ LIỆU:\n{}' }, lease: 'original-lease', leaseUntil: 1 });
        }
        if (route === '/api/worker/assets') { uploads++; return reply({ id: hash(options.body), assetId: hash(options.body) }); }
        if (route.endsWith('/complete')) {
            completions++; assert.equal(body.lease, 'original-lease');
            require('../windows/runtime/schema.cjs').validate(body.result, schema);
            if (accepted) assert.deepEqual(body.result, accepted);
            accepted = body.result; job.status = 'complete'; job.result = JSON.stringify(accepted);
            if (loseAck) { loseAck = false; throw new TypeError('Fixture: connection dropped after server stored result'); }
            return reply({ stored: true });
        }
        throw Error('Unexpected route ' + route);
    };
    try {
        const config = { id: 'worker-fixture', serverUrl: 'https://fixture.invalid', token: 'a'.repeat(64) };
        let bridge = create({ config, ledger }), hub = createHub({ bridge, dataDir: dir });
        hub.reconcile(accounts); await bridge.sync(); await hub.enabled(true, true);
        const paired = hub.pairing().find(x => x.id === accounts[0].id), extensionId = 'a'.repeat(32);
        let account = hub.auth(paired.token, extensionId);
        const first = (await hub.poll(account, { ready: true, acceptWork: true, continuity: 'extension-52r1' })).task;
        assert.ok(first); assert.equal(first.kind, 'images');
        const image = n => Buffer.from([137,80,78,71,13,10,26,10,n]);
        const firstBody = { runId: first.runId, nonce: first.nonce, base64: image(1).toString('base64'), mime: 'image/png', transcript: 'Fixture scene one', attachments: [] };
        const second = (await hub.result(account, firstBody)).nextTask;
        assert.ok(second); assert.notEqual(second.nonce, first.nonce);
        const originalPrompt = (await bridge.getJob(job.id)).prompt;
        job.lease_until = Date.now() + 30 * 60000;
        bridge = create({ config, ledger }); await bridge.sync();
        assert.equal((await bridge.getJob(job.id)).prompt, originalPrompt);
        assert.equal(bridge.view().claims[job.id].until, job.lease_until);
        hub = createHub({ bridge, dataDir: dir }); account = hub.auth(paired.token, extensionId);
        const replay = await hub.result(account, firstBody);
        assert.equal(replay.nextTask.nonce, second.nonce); assert.equal(uploads, 1);
        ledger.set('claims', { ...ledger.get('claims'), [job.id]: { ...ledger.get('claims')[job.id], until: 1 } });
        bridge = create({ config, ledger }); hub = createHub({ bridge, dataDir: dir }); account = hub.auth(paired.token, extensionId);
        const final = await hub.result(account, { runId: second.runId, nonce: second.nonce, base64: image(2).toString('base64'), mime: 'image/png', transcript: 'Fixture scene two', attachments: [] });
        assert.equal(final.status, 'awaiting-receipt'); assert.equal(claims, 1); assert.equal(uploads, 2);
        assert.ok(accepted.rows.every(row => Object.keys(row).sort().join(',') === 'assetId,caption'));
        bridge = create({ config, ledger }); await bridge.sync(); hub = createHub({ bridge, dataDir: dir }); await hub.tick();
        assert.equal(hub.view().runs.find(r => r.id === first.runId).status, 'confirmed');
        assert.equal(claims, 1); assert.equal(completions, 2);
        assert.equal(bridge.view().outbox.at(-1).status, 'confirmed');
        assert.equal(JSON.stringify(bridge.view()).includes('original-lease'), false);
    } finally { globalThis.fetch = oldFetch; }
});

test('mixed Chrome window hide does not create windows or move tabs', async () => {
    const source = fs.readFileSync(new URL('../windows/EXTENSION/background.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function quietWindow(windowId)'), end = source.indexOf('\nfunction geminiTab', start);
    const mutations = [];
    const sandbox = { quieting: false, SITES: { gemini: 'https://gemini.google.com/app' }, ownedURL: value => String(value).startsWith('https://gemini.google.com/'), status: async () => {}, chrome: { tabs: { query: async () => [{ id: 1, url: 'https://gemini.google.com/app' }, { id: 2, url: 'https://example.org/' }], move: async () => mutations.push('move') }, runtime: { getURL: value => 'chrome-extension://fixture/' + value }, windows: { create: async () => mutations.push('create') } } };
    vm.createContext(sandbox); vm.runInContext(source.slice(start, end), sandbox);
    await assert.rejects(sandbox.quietWindow(42), /giữ nguyên tab/);
    assert.deepEqual(mutations, []);
});

test('Windows CommonJS boundary can load the real voice/render modules inside the ESM website source', () => {
    assert.equal(require('../windows/package.json').type, 'commonjs');
    assert.equal(typeof require('../windows/render.cjs').render, 'function');
    assert.equal(require('../windows/runtime/kbl-bulletin-voice.js').VOICE, 'vi-VN-HoaiMyNeural');
});

for (const stage of ['write', 'image']) test(`native ${stage} repair claims a fresh attempt without treating the old completion ACK as the new result`, async () => {
    const dir = temp(), ledger = ledgerModule.open(dir), oldFetch = globalThis.fetch;
    const accounts = [{ id: 'creator', label: 'Fixture creator', provider: 'gemini', roles: [stage], enabled: true }];
    ledger.set('accounts', accounts);
    const schema = stage === 'write' ? { type: 'object', required: ['text'], additionalProperties: false, properties: { text: { type: 'string' } } } : { type: 'object', required: ['rows'], additionalProperties: false, properties: { rows: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'object', required: ['assetId', 'caption'], additionalProperties: false, properties: { assetId: { type: 'string' }, caption: { type: 'string' } } } } } };
    const job = { id: `fixture-repair-${stage}`, story_id: 'fixture', stage, status: 'queued', attempt: 0, created_at: Date.now() };
    const receipts = new Map(); let claims = 0, uploads = 0, dropNewAck = true, originalBody;
    globalThis.fetch = async (url, options = {}) => {
        const route = new URL(url).pathname, body = typeof options.body === 'string' ? JSON.parse(options.body) : null;
        if (route === '/api/worker/queue') return Response.json({ jobs: [{ ...job }], settings: { teamEnabled: true } });
        if (route === '/api/worker/claim') {
            assert.equal(job.status, 'queued'); claims++; job.attempt++; job.status = 'leased'; job.owner = 'creator'; job.lease_until = Date.now() + 1800000;
            return Response.json({ lease: `lease-${job.attempt}`, leaseUntil: job.lease_until, job: { ...job, nonce: hash(`${job.id}:${job.attempt}`), context: { story: { title: 'Fixture', topic: 'Not for publication' }, outputs: {} }, schema, prompt: 'Fixture\n\nHỒ SƠ DỮ LIỆU:\n{}' } });
        }
        if (route === '/api/worker/assets') { uploads++; assert.equal(options.headers['x-kbl-job-lease'], `lease-${job.attempt}`); return Response.json({ id: hash(options.body) }); }
        if (route.endsWith('/complete')) {
            const prior = receipts.get(body.lease);
            if (prior) { assert.deepEqual(body, prior); return Response.json({ stored: true }); }
            assert.equal(body.lease, `lease-${job.attempt}`);
            require('../windows/runtime/schema.cjs').validate(body.result, schema);
            receipts.set(body.lease, structuredClone(body)); job.status = 'complete'; job.result = JSON.stringify(body.result);
            if (job.attempt === 1) originalBody = structuredClone(body);
            if (job.attempt === 2 && dropNewAck) { dropNewAck = false; throw Error('Fixture lost ACK for repair'); }
            return Response.json({ stored: true });
        }
        throw Error('Unexpected route ' + route);
    };
    try {
        const config = { id: 'fixture', serverUrl: 'https://fixture.invalid', token: 'f'.repeat(64) };
        let bridge = create({ config, ledger }), hub = createHub({ bridge, dataDir: dir }); hub.reconcile(accounts); await hub.enabled(true, true);
        const paired = hub.pairing()[0], ext = 'a'.repeat(32); let account = hub.auth(paired.token, ext);
        const finish = async task => {
            if (stage === 'write') return hub.result(account, { runId: task.runId, nonce: task.nonce, result: { text: `Attempt ${job.attempt}` }, transcript: 'Fixture writer reply', attachments: [] });
            const result = async (t, n) => hub.result(account, { runId: t.runId, nonce: t.nonce, base64: Buffer.from(`fixture-image-${job.attempt}-${n}`).toString('base64'), mime: 'image/png', transcript: 'Fixture image reply', attachments: [] });
            const first = await result(task, 1); return result(first.nextTask, 2);
        };
        const oldTask = (await hub.poll(account, { ready: true })).task;
        job.status = 'queued'; job.owner = null; // Unknown in-flight state is never permission to abandon/resend.
        assert.equal((await hub.poll(account, { ready: true, currentRunId: oldTask.runId })).task.nonce, oldTask.nonce);
        assert.equal(claims, 1); job.status = 'leased'; job.owner = 'creator';
        assert.equal((await finish(oldTask)).status, 'confirmed');
        const oldRun = hub.view().runs.find(r => r.id === oldTask.runId);
        if (stage === 'write') { // Upgrade from the previous worker's confirmed history without attempt metadata.
            const saved = ledger.get('browser'); delete saved.runs[oldTask.runId].attempt; delete saved.runs[oldTask.runId].leaseHash; ledger.set('browser', saved);
            hub = createHub({ bridge, dataDir: dir }); account = hub.auth(paired.token, ext);
        }
        job.status = 'queued'; job.owner = null; job.lease_until = null; // Explicit server repair invalidates the completed lease, retaining attempt=1.
        const task = (await hub.poll(account, { ready: true })).task;
        assert.ok(task, 'completed attempt must not block the server repair queue'); assert.notEqual(task.runId, oldTask.runId); assert.notEqual(task.nonce, oldTask.nonce);
        let run = hub.view().runs.find(r => r.id === task.runId);
        assert.equal(run.attempt, 2); assert.notEqual(run.serverNonce, oldRun.serverNonce);
        // A delayed exact ACK is still valid, but may only settle the original lease/run.
        const oldEntry = { jobId: job.id, runId: oldTask.runId, attempt: 1, leaseHash: hash('lease-1'), lease: 'lease-1', id: 'delayed-old-ack', status: 'pending', body: { result: JSON.stringify(originalBody.result), browserExecution: originalBody.browserExecution } };
        ledger.set('outbox', [...ledger.get('outbox'), oldEntry]);
        bridge = create({ config, ledger }); hub = createHub({ bridge, dataDir: dir }); account = hub.auth(paired.token, ext); await hub.tick();
        assert.equal(hub.view().runs.find(r => r.id === task.runId).status, 'dispatched');
        assert.equal(bridge.view().claims[job.id].attempt, 2, 'old ACK must not remove the repaired lease');
        assert.equal((await finish(task)).status, 'awaiting-receipt', 'old confirmed outbox must not acknowledge the new result');
        await hub.tick();
        assert.equal(hub.view().runs.find(r => r.id === task.runId).status, 'confirmed');
        assert.equal(hub.view().runs.find(r => r.id === oldTask.runId).status, 'confirmed');
        assert.equal(claims, 2); assert.equal(receipts.size, 2); assert.equal(uploads, stage === 'image' ? 4 : 0);
        assert.equal(JSON.stringify(bridge.view()).includes('lease-1'), false); assert.equal(JSON.stringify(bridge.view()).includes('lease-2'), false);
    } finally { globalThis.fetch = oldFetch; }
});

for (const tamper of [false, true]) test(`native gold prompt preserves authenticated POS evidence and ${tamper ? 'rejects altered snapshot hash' : 'uses the frozen internal snapshot'}`, async () => {
    const dir = temp(), ledger = ledgerModule.open(dir), oldFetch = globalThis.fetch;
    const accounts = [{ id: 'gold-writer', label: 'Fixture', provider: 'gemini', roles: ['write'], enabled: true }]; ledger.set('accounts', accounts);
    const at = Date.now() - 3 * 86400000; // A captured edition may finish later, using its original observation.
    const snapshot = { source: 'POS Kim Bảo Lâm', unit: 'đồng/chỉ', capturedAt: at, observedAt: at - 2000, syncedAt: at - 1000, revision: 7, digest: 'd'.repeat(64), workerId: 'fixture-worker', rows: [{ code: '9999', label: 'Vàng 999.9', buy: 14000000, sell: 14200000, unit: 'đồng/chỉ' }] };
    const evidence = { kind: 'pos-price-snapshot', verifiedBy: 'pos-import-contract', url: 'https://tiemvangkimbaolam.id.vn/bang-gia', contentHash: hash(JSON.stringify(snapshot)), ...structuredClone(snapshot) };
    if (tamper) evidence.rows[0].sell++;
    const job = { id: 'fixture-gold-write', stage: 'write', story_id: 'fixture-gold', attempt: 0, status: 'queued', created_at: Date.now() };
    globalThis.fetch = async (url, options = {}) => {
        const route = new URL(url).pathname;
        if (route === '/api/worker/queue') return Response.json({ jobs: [{ ...job }], settings: { teamEnabled: true } });
        if (route === '/api/worker/claim') { job.attempt++; job.status = 'leased'; return Response.json({ lease: 'gold-lease', leaseUntil: Date.now() + 1800000, job: { ...job, nonce: hash('gold-nonce'), prompt: 'Gold fixture\n\nHỒ SƠ DỮ LIỆU:\n{}', schema: { type: 'object' }, context: { story: { title: 'Fixture gold edition' }, outputs: { research: { evidenceKind: 'pos-price-snapshot', sourceEvidence: [evidence], priceSnapshot: snapshot } } } } }); }
        throw Error('Unexpected route ' + route);
    };
    try {
        const bridge = create({ config: { serverUrl: 'https://fixture.invalid', token: 'f'.repeat(64) }, ledger }), hub = createHub({ bridge, dataDir: dir });
        hub.reconcile(accounts); await hub.enabled(true, true); const a = hub.auth(hub.pairing()[0].token, 'a'.repeat(32));
        let task;
        if (tamper) await assert.rejects(hub.poll(a, { ready: true }), /Bản chụp giá POS sai cấu trúc hoặc hash/);
        else { task = (await hub.poll(a, { ready: true })).task; assert.ok(task); }
        const cached = await bridge.getJob(job.id), doc = JSON.parse(cached.prompt.split('HỒ SƠ DỮ LIỆU:\n')[1].split('\n\nSCHEMA JSON:')[0]);
        assert.deepEqual(doc.sourceEvidence, evidence);
        assert.equal(doc.sourceEvidence.protocol, undefined); assert.equal(doc.sourceEvidence.status, undefined); assert.equal(doc.sourceEvidence.requestedUrl, undefined);
        if (tamper) { assert.equal(hub.view().runs.at(-1).status, 'attention'); assert.equal(task, undefined); }
        else { assert.match(task.prompt, /đã đối chiếu hash với priceSnapshot/); assert.match(task.prompt, /Dùng đúng rows, đơn vị đồng\/chỉ và observedAt/); assert.doesNotMatch(task.prompt, /Mở\/đọc nguồn trước khi duyệt/); assert.doesNotMatch(task.prompt, /sourceEvidence do hệ thống lấy thật từ URL bài gốc/); }
    } finally { globalThis.fetch = oldFetch; }
});

test('idle queue polling backs off, retains held jobs for ACK and automatically retries after network recovery',async()=>{
    const ledger=ledgerModule.open(temp()),oldFetch=globalThis.fetch;let at=1000,online=true,gets=0;
    ledger.set('claims',{'held-job':{token:'held-lease',attempt:1,accountId:'owner',job:{id:'held-job',stage:'write'}}});
    globalThis.fetch=async(url)=>{const u=new URL(url);assert.equal(u.searchParams.get('active'),'1');assert.deepEqual(JSON.parse(u.searchParams.get('held')),['held-job']);gets++;if(!online)throw Error('offline');return Response.json({jobs:[],settings:{teamEnabled:true}});};
    try{const bridge=create({config:{serverUrl:'https://fixture.invalid',token:'f'.repeat(64)},ledger,now:()=>at});assert.equal((await bridge.sync()).connected,true);await bridge.sync();assert.equal(gets,1);at+=60000;online=false;assert.equal((await bridge.sync()).connected,false);await bridge.sync();assert.equal(gets,2);at+=60000;online=true;assert.equal((await bridge.sync()).connected,true);assert.equal(gets,3);assert.ok(bridge.view().claims['held-job']);}finally{globalThis.fetch=oldFetch;}
});
