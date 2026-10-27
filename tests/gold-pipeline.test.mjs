import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto, createHash } from 'node:crypto';
const { build } = createRequire(fs.realpathSync('node_modules/wrangler/package.json'))('esbuild');
let G, P, POS, db;
const env = {}, realFetch = globalThis.fetch, realNow = Date.now;
const at = Date.parse('2026-10-27T00:02:00Z'); // 07:02 in Vietnam; fixtures only.
const value = { price_buy_9999: 10000001, price_sell_9999: 10200003, price_buy_750: 7500001, price_sell_750: 7800003 };
function record(kind, id, data) { db.prepare('INSERT INTO records(kind,id,data,created_at,updated_at) VALUES(?,?,?,?,?)').run(kind, id, JSON.stringify(data), at, at); }
function stored(kind, id) { const r = db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind, id); return r ? JSON.parse(r.data) : null; }
function row(stage, story) { return db.prepare('SELECT * FROM jobs WHERE story_id=? AND stage=?').get(story, stage); }
function edition(slot = '2026-10-27-7') { const r = db.prepare('SELECT * FROM editions WHERE id=?').get(slot); return r ? { ...r, data: JSON.parse(r.data) } : null; }
async function price(values = value, observedAt = at - 30000, revision = 1) { return POS.prices('win', { prices: values, observedAt, revision }); }
async function claim(story, stage, account) { return P.claim('win', account || null, account ? [] : ['render'], `KBL-${story}-${stage}`); }
before(async () => {
    globalThis.crypto ||= webcrypto;
    globalThis.__KBL_GOLD_TEST_ENV = env;
    fs.mkdirSync('.sites-runtime', { recursive: true });
    await build({ stdin: { contents: "export * as G from './lib/kbl/gold'; export * as P from './lib/kbl/pipeline'; export * as POS from './lib/kbl/pos';", resolveDir: process.cwd(), loader: 'ts' }, outfile: '.sites-runtime/gold-pipeline.mjs', bundle: true, format: 'esm', platform: 'node', plugins: [{ name: 'test-env', setup(b) {
        b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'test-env' }));
        b.onLoad({ filter: /.*/, namespace: 'test-env' }, () => ({ contents: 'export const env=globalThis.__KBL_GOLD_TEST_ENV;', loader: 'js' }));
    } }] });
    ({ G, P, POS } = await import(path.resolve('.sites-runtime/gold-pipeline.mjs') + '?v=' + realNow()));
});
beforeEach(() => {
    Date.now = () => at;
    db = new DatabaseSync(':memory:');
    for (const name of fs.readdirSync('drizzle').filter(n => n.endsWith('.sql')).sort()) db.exec(fs.readFileSync('drizzle/' + name, 'utf8').replaceAll('--> statement-breakpoint', ''));
    let lock = Promise.resolve();
    env.DB = {
        prepare(query) {
            let params = [];
            const stmt = { bind(...args) { params = args; return stmt; }, async first() { return db.prepare(query).get(...params) || null; }, async all() { return { results: db.prepare(query).all(...params) }; }, async run() { return { meta: { changes: Number(db.prepare(query).run(...params).changes) } }; } };
            return stmt;
        },
        batch(statements) { const result = lock.then(async () => { db.exec('BEGIN'); try { const results = []; for (const s of statements) results.push(await s.run()); db.exec('COMMIT'); return results; } catch (e) { db.exec('ROLLBACK'); throw e; } }); lock = result.catch(() => {}); return result; }
    };
    env.BUCKET = { async delete() {} };
    record('settings', 'main', { teamEnabled: true, autoResearch: false, autoConsult: false, publicationEnabled: false });
    for (const [id, provider, roles] of [['writer', 'chatgpt', ['write', 'image']], ['reviewer', 'claude', ['review', 'image-review']]]) record('account', id, { workerId: 'win', enabled: true, provider, roles });
    globalThis.fetch = async () => { throw Error('Gold POS snapshot must not fabricate an HTTP source retrieval'); };
});
afterEach(() => { db.close(); Date.now = realNow; globalThis.fetch = realFetch; });

test('fresh real POS import atomically seeds immutable gold story, internal evidence and writing at all three slots', async () => {
    await price();
    const result = await G.captureGoldSlot(at);
    assert.equal(result.captured, true);
    const story = stored('story', result.storyId), research = JSON.parse(row('research', result.storyId).result);
    assert.equal(story.priceSnapshot.rows[0].buy, value.price_buy_9999, 'Do not convert or round the POS quote');
    assert.equal(story.priceSnapshot.unit, 'đồng/chỉ');
    assert.equal(story.priceSnapshot.observedAt, at - 30000);
    assert.equal(research.sourceEvidence[0].kind, 'pos-price-snapshot');
    assert.equal(research.sourceEvidence[0].retrievalOnly, undefined);
    assert.equal(row('research', result.storyId).owner, 'pos-readonly');
    assert.equal(row('write', result.storyId).status, 'queued');
    assert.equal(edition().captured_at, at);
    const task = await claim(result.storyId, 'write', 'writer');
    assert.equal(task.job.attempt, 1);
    assert.match(task.job.prompt, /không phải bản tải HTTP/);
    for (const offset of [5, 12]) {
        const later = at + offset * 3600000;
        Date.now = () => later;
        await price(value, later - 10000, offset);
        const next = await G.captureGoldSlot(later);
        assert.equal(next.captured, true);
        assert.notEqual(next.storyId, result.storyId);
    }
    assert.equal(db.prepare("SELECT COUNT(*) n FROM records WHERE kind='story'").get().n, 3);
});

test('concurrent capture and subsequent POS changes never refresh an edition or create duplicate jobs', async () => {
    await price();
    const [a, b] = await Promise.all([G.captureGoldSlot(at), G.captureGoldSlot(at + 1)]);
    assert.equal(a.storyId, b.storyId);
    const frozen = stored('story', a.storyId), before = edition();
    await price({ price_buy_9999: 12000000, price_sell_9999: 13000000 }, at + 1000, 2);
    const again = await G.captureGoldSlot(at + 2000);
    assert.equal(again.duplicate, true);
    assert.deepEqual(stored('story', a.storyId), frozen);
    assert.deepEqual(edition(), before);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM jobs').get().n, 2);
});

test('fresh database writes cannot disguise stale POS observation; missing prices never become zero', async () => {
    assert.equal((await G.captureGoldSlot(at)).waiting, true);
    await price(value, at - 5 * 60000 - 1);
    db.prepare("UPDATE records SET updated_at=? WHERE kind='price'").run(at + 1000);
    assert.equal((await G.captureGoldSlot(at)).waiting, true);
    assert.equal(edition().data.status, 'awaiting-price');
    assert.equal(edition().captured_at, null);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM jobs').get().n, 0);
});

test('partial latest POS push excludes older rows and mismatched digest/worker/unit cannot create a story', async () => {
    await price();
    await price({ price_buy_750: 8000000, price_sell_750: 8500000 }, at - 10000, 2);
    const result = await G.captureGoldSlot(at);
    assert.deepEqual(stored('story', result.storyId).priceSnapshot.rows.map(r => r.code), ['750']);
    // A later slot must not accept altered rows even when its record timestamp is fresh.
    const noon = at + 5 * 3600000;
    Date.now = () => noon;
    await price(value, noon - 1000, 3);
    db.prepare("UPDATE records SET data=json_set(data,'$.unit','đồng/lượng') WHERE kind='price' AND id='pos-9999'").run();
    assert.equal((await G.captureGoldSlot(noon)).waiting, true);
    await price(value, noon, 4);
    db.prepare("UPDATE records SET data=json_set(data,'$.workerId','other') WHERE kind='pos-sync' AND id='price'").run();
    assert.equal((await G.captureGoldSlot(noon)).waiting, true);
    await price(value, noon + 1, 5);
    db.prepare("UPDATE records SET data=json_set(data,'$.buy',100) WHERE kind='price' AND id='pos-9999'").run();
    assert.equal((await G.captureGoldSlot(noon + 1)).waiting, true);
});

test('uncaptured edition expires outside its hour and never backfills, while next current slot can capture', async () => {
    await G.captureGoldSlot(at);
    Date.now = () => at + 3600000;
    await price(value, at + 3600000, 1);
    const outside = await G.captureGoldSlot(at + 3600000);
    assert.equal(outside.waiting, true);
    assert.equal(edition().data.status, 'missed');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM jobs').get().n, 0);
    const noon = at + 5 * 3600000;
    Date.now = () => noon;
    await price(value, noon - 1000, 2);
    assert.equal((await G.captureGoldSlot(noon)).captured, true);
    assert.equal(edition().data.status, 'missed');
});

test('conflicting job rolls back capture and full story quota leaves no partial story/evidence', async () => {
    await price();
    const sid = createHash('sha256').update('KBL-GOLD:2026-10-27-7').digest('hex').slice(0, 32);
    db.prepare("INSERT INTO jobs(id,story_id,stage,status,created_at,updated_at) VALUES(?,?,'write','queued',?,?)").run(`KBL-${sid}-write`, sid, at, at);
    await assert.rejects(G.captureGoldSlot(at), /UNIQUE constraint/);
    assert.equal(edition().captured_at, null);
    assert.equal(stored('story', sid), null);
    assert.equal(row('research', sid), undefined);
    db.prepare('DELETE FROM jobs').run();
    for (let i = 0; i < 1000; i++) record('story', 'quota-' + i, { status: 'published' });
    assert.equal((await G.captureGoldSlot(at)).reason, 'snapshot-changed-or-quota');
    assert.equal(edition().captured_at, null);
    assert.equal(row('research', sid), undefined);
});

test('a concurrent POS revision or paused team cannot capture a snapshot read before that change', async () => {
    await price();
    const batch = env.DB.batch;
    env.DB.batch = statements => {
        db.prepare("UPDATE records SET data=json_set(data,'$.revision',2) WHERE kind='pos-sync' AND id='price'").run();
        env.DB.batch = batch;
        return batch(statements);
    };
    assert.equal((await G.captureGoldSlot(at)).reason, 'snapshot-changed-or-quota');
    assert.equal(edition().captured_at, null);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM jobs').get().n, 0);
    db.prepare("UPDATE records SET data=json_set(data,'$.teamEnabled',json('false')) WHERE kind='settings'").run();
    assert.equal((await G.captureGoldSlot(at)).reason, 'outside-slot-or-paused');
    assert.equal(edition().captured_at, null);
});

test('gold story completes normal independent review, images and render after the hour with frozen quote, then cleans only temporary media', async () => {
    await price();
    const { storyId } = await G.captureGoldSlot(at), original = stored('story', storyId).priceSnapshot;
    const writing = { headline: 'Bản tin giá fixture chỉ kiểm thử', summary: 'Bản tin thử nghiệm chỉ kiểm tra luồng, không phải giá thật của cửa hàng hay nội dung xuất bản thực tế. '.repeat(2), script: 'Nội dung fixture cho kiểm thử giá chốt, không phải dữ liệu giao dịch hoặc khuyến nghị mua bán. '.repeat(3), sourceUrls: ['https://tiemvangkimbaolam.id.vn/bang-gia'] };
    let task = await claim(storyId, 'write', 'writer');
    await P.complete('win', task.job.id, task.lease, writing);
    assert.equal((await claim(storyId, 'review', 'writer')).wait, true, 'Creator cannot self-review');
    task = await claim(storyId, 'review', 'reviewer');
    await P.complete('win', task.job.id, task.lease, { approved: true, reason: 'Fixture đã đối chiếu số liệu POS, đơn vị và thời điểm.' });
    const images = ['a'.repeat(64), 'b'.repeat(64)];
    const asset = (id, mime, purpose) => db.prepare('INSERT INTO assets(id,story_id,mime,bytes,purpose,created_at) VALUES(?,?,?,?,?,?)').run(id, storyId, mime, 100, purpose, at);
    images.forEach(id => asset(id, 'image/png', 'news-image'));
    task = await claim(storyId, 'image', 'writer');
    await P.complete('win', task.job.id, task.lease, { rows: images.map(assetId => ({ assetId, caption: 'Ảnh fixture' })) });
    task = await claim(storyId, 'image-review', 'reviewer');
    await P.complete('win', task.job.id, task.lease, { approved: true, reason: 'Fixture: đã xem đúng hai ảnh minh họa.', inspectedAssetHashes: images });
    const later = at + 2 * 3600000;
    Date.now = () => later;
    await price({ price_buy_9999: 14000000, price_sell_9999: 15000000 }, later - 1000, 2);
    await G.captureGoldSlot(later);
    task = await claim(storyId, 'render');
    assert.deepEqual(task.job.context.story.priceSnapshot, original);
    const videoId = 'c'.repeat(64), audioId = 'd'.repeat(64), captionsId = 'e'.repeat(64);
    asset(videoId, 'video/mp4', 'video-temp'); asset(audioId, 'audio/mpeg', 'audio'); asset(captionsId, 'text/plain', 'captions');
    await P.complete('win', task.job.id, task.lease, { videoId, audioId, captionsId, duration: 45, width: 1080, height: 1920 });
    assert.equal(row('publish', storyId).status, 'queued');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM receipts').get().n, 0, 'Publication permission remains required');
    db.prepare("UPDATE records SET data=json_set(data,'$.publicationEnabled',json('true')) WHERE kind='settings'").run();
    await P.tick();
    assert.equal(stored('story', storyId).status, 'published');
    assert.deepEqual(stored('story', storyId).priceSnapshot, original);
    assert.equal(stored('article', storyId).editionAt, at);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM assets WHERE purpose IN('video-temp','audio','captions') AND deleted_at IS NOT NULL").get().n, 3);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM assets WHERE mime='image/png' AND deleted_at IS NULL AND public=1").get().n, 2);
});
