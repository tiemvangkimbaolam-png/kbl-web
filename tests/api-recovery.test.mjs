import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { bindingHealth } from '../lib/kbl/health.mjs';
import { runMaintenance } from '../lib/kbl/scheduled.mjs';
const { build } = createRequire(fs.realpathSync('node_modules/wrangler/package.json'))('esbuild');
const db = new DatabaseSync(':memory:');
const owner = { 'oai-authenticated-user-id': 'owner-fixture', 'oai-authenticated-user-email': 'vlam1881997@gmail.com', 'Content-Type': 'application/json' };
let handle;
function prepare(query) {
    let params = [];
    const stmt = { bind(...values) { params = values; return stmt; }, async first() { return db.prepare(query).get(...params) || null; }, async all() { return { results: db.prepare(query).all(...params) }; }, async run() { const result = db.prepare(query).run(...params); return { success: true, meta: { changes: Number(result.changes) } }; } };
    return stmt;
}
async function call(route, value, headers = owner) {
    const res = await handle(new Request('https://kbl.test/api/' + route, { method: value === undefined ? 'GET' : 'POST', headers, ...(value === undefined ? {} : { body: Buffer.isBuffer(value) ? value : JSON.stringify(value) }) }));
    return { status: res.status, data: await res.json() };
}
before(async () => {
    for (const file of fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) db.exec(fs.readFileSync('drizzle/' + file, 'utf8').replaceAll('--> statement-breakpoint', ''));
    const blobs = new Map();
    globalThis.__KBL_RECOVERY_ENV = { DB: { prepare, async batch(stmts) { db.exec('BEGIN'); try { const result = []; for (const stmt of stmts) result.push(await stmt.run()); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } } }, BUCKET: { async head(id) { return blobs.has(id) ? { size: blobs.get(id).byteLength } : null; }, async put(id, data) { blobs.set(id, data); }, async get(id) { return blobs.has(id) ? { body: blobs.get(id), size: blobs.get(id).byteLength } : null; }, async delete(id) { blobs.delete(id); } } };
    await build({ entryPoints: ['lib/kbl/api.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.sites-runtime/api-recovery.mjs', plugins: [{ name: 'recovery-env', setup(b) { b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const env = globalThis.__KBL_RECOVERY_ENV;', loader: 'js' })); } }] });
    handle = (await import(path.resolve('.sites-runtime/api-recovery.mjs'))).handle;
    await call('admin/settings', { autoResearch: false, autoConsult: false });
});
test('health proves migrations and storage permissions rather than binding existence', async () => {
    assert.equal((await call('health')).status, 200);
    const state = await bindingHealth({ DB: { prepare() { throw Error('table missing'); } }, BUCKET: { async head() { throw Error('denied'); } } });
    assert.equal(state.ok, false);
    assert.equal(state.checks.database, 'schema-or-access-required');
    assert.equal(state.checks.files, 'access-required');
});
test('late original lease can recover image upload and dispatch; wrong or completed lease cannot', async () => {
    const worker = (await call('admin/workers', { label: 'Recovery Windows fixture' })).data;
    const account = (await call('admin/accounts', { provider: 'gemini', label: 'Recovery account fixture', workerId: worker.id })).data;
    const story = (await call('admin/stories', { title: 'Late result fixture', topic: 'Only fixture' })).data;
    const lease = '1'.repeat(64), hash = createHash('sha256').update(lease).digest('hex'), jobId = 'late-image-fixture';
    db.prepare('INSERT INTO jobs(id,story_id,stage,status,owner,lease_hash,lease_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(jobId, story.id, 'image', 'attention', account.id, hash, Date.now() - 1000, Date.now(), Date.now());
    const headers = { 'x-kbl-worker-token': worker.token, 'x-kbl-job-id': jobId, 'x-kbl-job-lease': lease, 'Content-Type': 'image/png' };
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 77]);
    assert.equal((await call('worker/assets?storyId=' + story.id, bytes, { ...headers, 'x-kbl-job-lease': '2'.repeat(64) })).status, 409);
    assert.equal((await call('worker/assets?storyId=' + story.id, bytes, headers)).status, 200);
    assert.equal((await call('worker/jobs/' + jobId + '/dispatch', { lease }, { 'x-kbl-worker-token': worker.token, 'Content-Type': 'application/json' })).status, 200);
    const active = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
    assert.equal(active.status, 'running');
    assert.ok(active.lease_until > Date.now());
    db.prepare("UPDATE jobs SET status='complete' WHERE id=?").run(jobId);
    assert.equal((await call('worker/assets?storyId=' + story.id, bytes, headers)).status, 409);
});
test('confirmed retry reopens story and preserves the previous blocker in private audit', async () => {
    const story = (await call('admin/stories', { title: 'Manual retry fixture', topic: 'Only fixture' })).data;
    const job = db.prepare('SELECT * FROM jobs WHERE story_id=?').get(story.id);
    db.prepare("UPDATE jobs SET status='blocked',error='Original blocker fixture' WHERE id=?").run(job.id);
    const row = db.prepare("SELECT data FROM records WHERE kind='story' AND id=?").get(story.id);
    db.prepare("UPDATE records SET data=? WHERE kind='story' AND id=?").run(JSON.stringify({ ...JSON.parse(row.data), status: 'blocked' }), story.id);
    assert.equal((await call('admin/jobs/' + job.id, {})).status, 422);
    assert.equal((await call('admin/jobs/' + job.id, { confirmOriginalStopped: true })).status, 200);
    assert.equal(JSON.parse(db.prepare("SELECT data FROM records WHERE kind='story' AND id=?").get(story.id).data).status, 'working');
    assert.match(db.prepare("SELECT message FROM events WHERE type='job-requeued' AND story_id=?").get(story.id).message, /Original blocker fixture/);
});
test('cron cleanup remains independent if tick fails and reports failure without dropping jobs', async () => {
    let cleaned = false;
    const events = [];
    await assert.rejects(runMaintenance({ async tick() { throw Error('fixture'); }, async cleanup() { cleaned = true; }, async event(type) { events.push(type); } }), /incomplete/);
    assert.equal(cleaned, true);
    assert.deepEqual(events, ['scheduler-error']);
});
