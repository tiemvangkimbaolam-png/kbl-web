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
    const job = { id: 'KBL-fixture-image', story_id: 'fixture', stage: 'image', status: 'queued', owner: null, created_at: Date.now(), lease_until: 1 };
    let claims = 0, completions = 0, uploads = 0, accepted, loseAck = true;
    globalThis.fetch = async (url, options = {}) => {
        const route = new URL(url).pathname, body = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : null;
        const reply = value => Response.json(value);
        if (route === '/api/worker/queue') return reply({ jobs: [{ ...job }], settings: { teamEnabled: true } });
        if (route.startsWith('/api/worker/job-details/')) return reply({ job: { ...job } });
        if (route === '/api/worker/claim') {
            claims++; assert.equal(body.accountId, accounts[0].id); assert.equal(job.status, 'queued');
            job.status = 'leased'; job.owner = accounts[0].id;
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
