import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
const { build } = createRequire(fs.realpathSync('node_modules/wrangler/package.json'))('esbuild');
let P, db, env = {}, files;
const originalFetch = globalThis.fetch;
function record(kind, id, data) {
    const at = Date.now();
    db.prepare('INSERT INTO records(kind,id,data,created_at,updated_at) VALUES(?,?,?,?,?)').run(kind, id, JSON.stringify(data), at, at);
}
function row(stage, story) { return db.prepare('SELECT * FROM jobs WHERE stage=? AND story_id=?').get(stage, story); }
function output(stage, story) { return JSON.parse(row(stage, story).result || '{}'); }
function account(id, provider, roles) { record('account', id, { provider, roles, enabled: true, workerId: 'win' }); }
function setup() {
    db = new DatabaseSync(':memory:');
    for (const file of fs.readdirSync('drizzle').filter(p => p.endsWith('.sql')).sort()) db.exec(fs.readFileSync('drizzle/' + file, 'utf8').replaceAll('--> statement-breakpoint', ''));
    let lock = Promise.resolve();
    env.DB = {
        prepare(query) {
            let params = [];
            const statement = {
                bind(...args) { params = args; return statement; },
                async first() { return db.prepare(query).get(...params) || null; },
                async all() { return { results: db.prepare(query).all(...params) }; },
                async run() { const result = db.prepare(query).run(...params); return { success: true, meta: { changes: Number(result.changes) } }; }
            };
            return statement;
        },
        batch(statements) {
            const operation = lock.then(async () => {
                db.exec('BEGIN');
                try { const result = []; for (const statement of statements) result.push(await statement.run()); db.exec('COMMIT'); return result; }
                catch (error) { db.exec('ROLLBACK'); throw error; }
            });
            lock = operation.catch(() => {});
            return operation;
        }
    };
    files = new Map();
    env.BUCKET = { async head(id) { return files.has(id) ? { size: files.get(id).length } : null; }, async get(id) { return files.has(id) ? { body: files.get(id), size: files.get(id).length } : null; }, async delete(id) { files.delete(id); } };
    record('settings', 'main', { teamEnabled: true, autoResearch: false, autoConsult: false, publicationEnabled: false });
    account('researcher', 'deepseek', ['research']);
    account('writer-a', 'chatgpt', ['write', 'image', 'image-review']);
    account('writer-c', 'chatgpt', ['write', 'image', 'image-review']);
    account('reviewer', 'claude', ['review', 'image-review']);
}
before(async () => {
    globalThis.crypto ||= webcrypto;
    globalThis.__KBL_PIPELINE_RECOVERY_ENV = env;
    fs.mkdirSync('.sites-runtime', { recursive: true });
    await build({ entryPoints: ['lib/kbl/pipeline.ts'], outfile: '.sites-runtime/pipeline-recovery.mjs', bundle: true, format: 'esm', platform: 'node', plugins: [{ name: 'test-env', setup(b) {
        b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'test-env' }));
        b.onLoad({ filter: /.*/, namespace: 'test-env' }, () => ({ contents: 'export const env=globalThis.__KBL_PIPELINE_RECOVERY_ENV;', loader: 'js' }));
    } }] });
    P = await import(pathToFileURL(path.resolve('.sites-runtime/pipeline-recovery.mjs')).href + '?v=' + Date.now());
});
beforeEach(setup);
afterEach(() => { globalThis.fetch = originalFetch; db.close(); });
const source = suffix => ({ title: 'Nguồn fixture ' + suffix, url: 'https://sbv.gov.vn/fixture-' + suffix, excerpt: 'Nguồn mô phỏng chỉ kiểm thử pipeline và không được dùng làm bản tin thật.', publishedAt: new Date().toISOString() });
const textResult = suffix => ({ headline: 'Bản viết fixture ' + suffix, summary: 'Đây là văn bản giả lập để kiểm tra cơ chế sửa và duyệt độc lập, không dùng xuất bản thật. '.repeat(2), script: 'Đây là lời đọc fixture để kiểm thử hàng đợi, không phải bản tin hay giá giao dịch thật. '.repeat(3), sourceUrls: ['https://sbv.gov.vn/fixture-good'] });
const claim = (story, stage, id) => P.claim('win', id, id ? [] : ['render'], `KBL-${story}-${stage}`);
function readableFetch() { globalThis.fetch = async () => new Response('<html>' + 'Bản chụp nguồn giả lập, không dùng xuất bản. '.repeat(35) + '</html>', { headers: { 'Content-Type': 'text/html' } }); }
async function researchedStory(label = 'fixture') {
    readableFetch();
    const story = await P.createStory({ title: label });
    const task = await claim(story, 'research', 'researcher');
    await P.complete('win', task.job.id, task.lease, { items: [source('good')] });
    return story;
}
test('blocked first source does not discard accessible later sources or label blocked items verified', async () => {
    const seen = [];
    globalThis.fetch = async url => {
        seen.push(String(url));
        return String(url).includes('blocked') ? new Response('Forbidden', { status: 403, headers: { 'Content-Type': 'text/html' } }) : new Response('<html>' + 'Nội dung nguồn mô phỏng đủ dài để kiểm tra truy xuất. '.repeat(30) + '</html>', { headers: { 'Content-Type': 'text/html' } });
    };
    const story = await P.createStory({ title: 'Nguồn nhiều lựa chọn fixture' }), task = await claim(story, 'research', 'researcher');
    const result = { items: [source('blocked'), source('good'), source('other')] };
    await P.complete('win', task.job.id, task.lease, result);
    assert.equal(seen.length, 3);
    const saved = output('research', story);
    assert.deepEqual(saved.items.map(x => x.url), result.items.slice(1).map(x => x.url));
    assert.equal(saved.sourceEvidence.length, 2);
    assert.equal(saved.sourceAttempts[0].url, result.items[0].url);
    const writer = await claim(story, 'write', 'writer-a');
    await assert.rejects(P.complete('win', writer.job.id, writer.lease, { ...textResult('bad-citation'), sourceUrls: [source('blocked').url] }), /chưa được.*xác minh/);
    await P.complete('win', writer.job.id, writer.lease, textResult('good'));
    const repeat = await P.complete('win', task.job.id, task.lease, result);
    assert.equal(repeat.idempotent, true);
    assert.equal(seen.length, 3);
});
test('image and render claims are not starved by more than100 unrelated consultation jobs', async () => {
    const story = await P.createStory({ title: 'Render fairness fixture' });
    for (let i = 0; i < 120; i++) db.prepare("INSERT INTO jobs(id,story_id,stage,status,created_at,updated_at) VALUES(?,?,'consult','queued',?,?)").run('consult-' + i, 'question-' + i, i, i);
    await P.ensureJob(story, 'render');
    const renderer = await P.claim('win', null, ['render']);
    assert.equal(renderer.job.stage, 'render');
    await P.ensureJob(story, 'image');
    const creator = await P.claim('win', 'writer-a', []);
    assert.equal(creator.job.stage, 'image');
});
test('rejected review queues a repaired creator while old lost ACKs cannot alter the new lease', async () => {
    const story = await researchedStory(), writer = await claim(story, 'write', 'writer-a'), first = textResult('first');
    await P.complete('win', writer.job.id, writer.lease, first);
    const reviewer = await claim(story, 'review', 'reviewer'), rejection = { approved: false, reason: 'Fixture: cần sửa nội dung trước khi duyệt độc lập.' };
    await P.complete('win', reviewer.job.id, reviewer.lease, rejection);
    assert.equal(row('write', story).status, 'queued');
    assert.equal(row('review', story).status, 'waiting-revision');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM records WHERE kind='job-evidence'").get().n, 1);
    assert.equal((await P.complete('win', reviewer.job.id, reviewer.lease, rejection)).idempotent, true);
    await assert.rejects(P.complete('win', reviewer.job.id, reviewer.lease, { ...rejection, approved: true }), /không khớp/);
    await assert.rejects(P.ownedJob('win', writer.job.id, writer.lease), /không khớp/);
    const repaired = await claim(story, 'write', 'writer-c');
    assert.notEqual(repaired.job.nonce, writer.job.nonce);
    assert.equal(repaired.job.context.revision.round, 1);
    const nextLease = row('write', story).lease_hash;
    assert.equal((await P.complete('win', writer.job.id, writer.lease, first)).idempotent, true);
    assert.equal(row('write', story).lease_hash, nextLease);
    assert.equal(row('write', story).status, 'leased');
    await assert.rejects(P.complete('other-worker', writer.job.id, writer.lease, first), /không khớp/);
    await P.complete('win', repaired.job.id, repaired.lease, textResult('repaired'));
    assert.equal(row('review', story).status, 'queued');
    assert.equal(row('review', story).exclude_account, 'writer-c');
    const finalReview = await claim(story, 'review', 'reviewer');
    await P.complete('win', finalReview.job.id, finalReview.lease, { approved: true, reason: 'Fixture: bản sửa đã đối chiếu đủ nguồn.' });
    assert.equal(row('image', story).status, 'queued');
    assert.equal((await P.complete('win', reviewer.job.id, reviewer.lease, rejection)).idempotent, true);
    assert.equal(output('review', story).approved, true);
});
test('repair is bounded to three rounds and keeps every rejected creator/reviewer snapshot', async () => {
    const story = await researchedStory('bounded repair');
    let last;
    for (let round = 0; round < 4; round++) {
        const writer = await claim(story, 'write', round % 2 ? 'writer-c' : 'writer-a');
        assert.ok(writer.job);
        await P.complete('win', writer.job.id, writer.lease, textResult('round-' + round));
        const reviewer = await claim(story, 'review', 'reviewer');
        last = { task: reviewer, result: { approved: false, reason: 'Fixture cần sửa ở vòng kiểm tra số ' + round } };
        await P.complete('win', reviewer.job.id, reviewer.lease, last.result);
    }
    assert.equal(row('review', story).status, 'blocked');
    assert.equal(JSON.parse(db.prepare("SELECT data FROM records WHERE kind='story' AND id=?").get(story).data).status, 'blocked');
    const evidence = db.prepare("SELECT data FROM records WHERE kind='job-evidence' ORDER BY created_at").all().map(x => JSON.parse(x.data));
    assert.equal(evidence.length, 3);
    assert.ok(evidence.every(e => e.creatorSnapshot.result && e.reviewSnapshot.result && e.creatorSnapshot.lease_hash && e.reviewSnapshot.lease_hash));
    assert.equal((await P.complete('win', last.task.job.id, last.task.lease, last.result)).idempotent, true);
});
test('concurrent duplicate rejection produces one repair and exact idempotent acknowledgements', async () => {
    const story = await researchedStory('concurrent repair'), writer = await claim(story, 'write', 'writer-a');
    await P.complete('win', writer.job.id, writer.lease, textResult('concurrent'));
    const reviewer = await claim(story, 'review', 'reviewer'), result = { approved: false, reason: 'Fixture: sửa dữ kiện trước khi tiếp tục.' };
    const replies = await Promise.all([P.complete('win', reviewer.job.id, reviewer.lease, result), P.complete('win', reviewer.job.id, reviewer.lease, result)]);
    assert.ok(replies.every(r => r.stored));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM records WHERE kind='job-evidence'").get().n, 1);
    assert.equal(row('write', story).status, 'queued');
});
test('image-review repairs images and requires independent inspection of the new exact hashes', async () => {
    const story = await researchedStory('image repair'), writer = await claim(story, 'write', 'writer-a');
    await P.complete('win', writer.job.id, writer.lease, textResult('image-news'));
    const review = await claim(story, 'review', 'reviewer');
    await P.complete('win', review.job.id, review.lease, { approved: true, reason: 'Fixture: nội dung đã kiểm tra độc lập.' });
    const addImages = symbols => symbols.map(symbol => {
        const assetId = symbol.repeat(64), raw = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, symbol.charCodeAt(0)]);
        files.set(assetId, raw);
        db.prepare('INSERT INTO assets(id,story_id,mime,bytes,purpose,public,created_at) VALUES(?,?,?,?,?,0,?)').run(assetId, story, 'image/png', raw.length, 'news-image', Date.now());
        return { assetId, caption: 'Ảnh fixture, không phải ảnh AI thật.' };
    });
    const first = { rows: addImages(['a', 'b']) }, image = await claim(story, 'image', 'writer-a');
    await P.complete('win', image.job.id, image.lease, first);
    const oldReview = await claim(story, 'image-review', 'reviewer');
    await P.complete('win', oldReview.job.id, oldReview.lease, { approved: false, reason: 'Fixture: hai ảnh chưa thể hiện đúng nội dung.', inspectedAssetHashes: first.rows.map(r => r.assetId) });
    assert.equal(row('image', story).status, 'queued');
    assert.equal(row('image-review', story).status, 'waiting-revision');
    const next = await claim(story, 'image', 'writer-c'), second = { rows: addImages(['c', 'd']) };
    assert.equal(JSON.stringify(next.job.context.revision).includes('lease_hash'), false, 'Repair prompt must not disclose stored lease evidence');
    assert.deepEqual(next.job.context.revision.previousOutput.rows, first.rows);
    await P.complete('win', next.job.id, next.lease, second);
    const independent = await claim(story, 'image-review', 'writer-a');
    assert.ok(independent.job, 'ChatGPT vision account can review another creator');
    assert.deepEqual(independent.job.attachmentHashes, second.rows.map(r => r.assetId));
    await assert.rejects(P.complete('win', independent.job.id, independent.lease, { approved: true, reason: 'Fixture: đã kiểm tra ảnh.', inspectedAssetHashes: first.rows.map(r => r.assetId) }), /đúng toàn bộ ảnh/);
    await P.complete('win', independent.job.id, independent.lease, { approved: true, reason: 'Fixture: đã xem đúng hai ảnh sửa.', inspectedAssetHashes: second.rows.map(r => r.assetId) });
    assert.equal(row('render', story).status, 'queued');
    assert.ok(first.rows.every(r => files.has(r.assetId)), 'Unpublished originals remain preserved');
});
test('tick recovers an older finished stage instead of repeatedly selecting only newest completed rows', async () => {
    const story = await researchedStory('old transition'), writer = await claim(story, 'write', 'writer-a');
    await P.complete('win', writer.job.id, writer.lease, textResult('old'));
    db.prepare("DELETE FROM jobs WHERE story_id=? AND stage='review'").run(story);
    db.prepare("DELETE FROM records WHERE kind='job-transition' AND json_extract(data,'$.jobId')=?").run(writer.job.id);
    db.prepare("UPDATE jobs SET updated_at=1,transitioned_result=NULL WHERE id=?").run(writer.job.id);
    for (let i = 0; i < 8; i++) {
        const other = await P.createStory({ title: 'Newer fixture ' + i });
        db.prepare("UPDATE jobs SET status='complete',owner='researcher',lease_hash='fixture-hash',result=?,result_hash=?,updated_at=? WHERE story_id=? AND stage='research'").run(JSON.stringify({ items: [source('good')] }), 'fixture-result-' + i, 100 + i, other);
    }
    await P.tick();
    assert.equal(row('review', story).status, 'queued');
});

test('cron repairs a missing transition marker using its receipt without advancing the job a second time',async()=>{
    const story=await researchedStory('marker recovery'),writer=await claim(story,'write','writer-a');await P.complete('win',writer.job.id,writer.lease,textResult('marker'));
    const review=row('review',story);assert.equal(review.status,'queued');
    db.prepare("UPDATE jobs SET status='attention',error='Keep this active review' WHERE id=?").run(review.id);
    db.prepare('UPDATE jobs SET transitioned_result=NULL WHERE id=?').run(writer.job.id);
    await P.tick({housekeeping:false});assert.equal(row('review',story).status,'attention');
    const completed=row('write',story);assert.equal(completed.transitioned_result,completed.attempt+':'+completed.result_hash);
    const before=JSON.stringify(row('review',story));await P.tick({housekeeping:false});assert.equal(JSON.stringify(row('review',story)),before);
});
