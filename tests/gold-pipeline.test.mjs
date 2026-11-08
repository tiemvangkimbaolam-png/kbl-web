import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto, createHash } from 'node:crypto';
import {seal} from '../lib/kbl/social-core.mjs';
const { build } = createRequire(fs.realpathSync('node_modules/wrangler/package.json'))('esbuild');
let G, P, POS, PLAN, db;
const env = {}, realFetch = globalThis.fetch, realNow = Date.now;
const at = Date.parse('2026-10-27T01:02:00Z'); // 08:02 in Vietnam; fixtures only.
const value = { price_buy_9999: 10000001, price_sell_9999: 10200003,price_buy_980:9900001,price_sell_980:10100003,price_buy_610:6100001,price_sell_610:6500003, price_buy_750: 7500001, price_sell_750: 7800003 };
function record(kind, id, data) { db.prepare('INSERT INTO records(kind,id,data,created_at,updated_at) VALUES(?,?,?,?,?)').run(kind, id, JSON.stringify(data), at, at); }
function stored(kind, id) { const r = db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind, id); return r ? JSON.parse(r.data) : null; }
function row(stage, story) { return db.prepare('SELECT * FROM jobs WHERE story_id=? AND stage=?').get(story, stage); }
function edition(slot = '2026-10-27-8') { const r = db.prepare('SELECT * FROM editions WHERE id=?').get(slot); return r ? { ...r, data: JSON.parse(r.data) } : null; }
async function price(values = value, observedAt = at - 30000, revision = 1) { return POS.prices('win', { prices: values, observedAt, revision }); }
async function claim(story, stage, account) { if(stage==='image')account=null;return P.claim('win', account || null, account ? [] : [stage==='image'?'image':'render'], `KBL-${story}-${stage}`); }
before(async () => {
    globalThis.crypto ||= webcrypto;
    globalThis.__KBL_GOLD_TEST_ENV = env;
    fs.mkdirSync('.sites-runtime', { recursive: true });
    await build({ stdin: { contents: "export * as G from './lib/kbl/gold'; export * as P from './lib/kbl/pipeline'; export * as POS from './lib/kbl/pos'; export * as PLAN from './lib/kbl/publication-plan';", resolveDir: process.cwd(), loader: 'ts' }, outfile: '.sites-runtime/gold-pipeline.mjs', bundle: true, format: 'esm', platform: 'node', plugins: [{ name: 'test-env', setup(b) {
        b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'test-env' }));
        b.onLoad({ filter: /.*/, namespace: 'test-env' }, () => ({ contents: 'export const env=globalThis.__KBL_GOLD_TEST_ENV;', loader: 'js' }));
    } }] });
    ({ G, P, POS, PLAN } = await import(pathToFileURL(path.resolve('.sites-runtime/gold-pipeline.mjs')).href + '?v=' + realNow()));
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
    assert.equal((await claim(result.storyId, 'write', 'writer')).wait,true,'Gold must not enter Chrome writing');
    await P.tick({housekeeping:false});
    assert.equal(row('write',result.storyId).owner,'local-data-template');
    assert.equal(row('review',result.storyId).owner,'local-data-validator');
    assert.match(JSON.parse(row('write',result.storyId).result).summary,/10\.000\.001/);
    for (const offset of [5, 11]) {
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
    const sid = createHash('sha256').update('KBL-GOLD:2026-10-27-8').digest('hex').slice(0, 32);
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

test('gold story completes local data checks, cards and video without Chrome, retaining a frozen quote and held news lease', async () => {
    record('story','held-news',{kind:'news',status:'working'});
    db.prepare("UPDATE records SET created_at=? WHERE id='held-news'").run(at-1000);
    await P.ensureJob('held-news','image');
    db.prepare("UPDATE jobs SET status='running',owner='news-creator',lease_hash='unchanged-news-lease' WHERE story_id='held-news'").run();
    await price();
    const { storyId } = await G.captureGoldSlot(at), original = stored('story', storyId).priceSnapshot;
    await P.tick({housekeeping:false});
    assert.equal((await claim(storyId,'write','writer')).wait,true);
    assert.equal((await claim(storyId,'review','reviewer')).wait,true);
    assert.equal(row('review',storyId).owner,'local-data-validator');
    const images = ['a'.repeat(64), 'b'.repeat(64)];
    const asset = (id, mime, purpose) => db.prepare('INSERT INTO assets(id,story_id,mime,bytes,purpose,created_at) VALUES(?,?,?,?,?,?)').run(id, storyId, mime, 100, purpose, at);
    images.forEach(id => asset(id, 'image/png', 'news-image'));
    let task = await claim(storyId, 'image', 'writer');
    await P.complete('win', task.job.id, task.lease, { rows: images.map(assetId => ({ assetId, caption: 'Ảnh fixture' })) });
    assert.equal((await claim(storyId,'image-review','reviewer')).wait,true);
    assert.equal(row('image-review',storyId).owner,'local-file-validator');
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
    assert.equal(db.prepare("SELECT COUNT(*) n FROM assets WHERE mime='image/png' AND deleted_at IS NULL AND public=1").get().n, 1);
    assert.equal(row('image','held-news').status,'running');assert.equal(row('image','held-news').lease_hash,'unchanged-news-lease');
});

test('gold changes wait for their own receipts but a held editorial image cannot block a new frozen gold edition',async()=>{
 db.prepare("UPDATE records SET data=json_set(data,'$.publicationEnabled',json('true')) WHERE kind='settings'").run();
 await price();const first=await G.captureGoldSlot(at);await P.ensureJob(first.storyId,'publish');finishGoldFixture(first.storyId);
 record('story','editorial-held',{kind:'news',status:'working'});await P.ensureJob('editorial-held','image');
 db.prepare("UPDATE jobs SET status='attention',owner='news-creator',lease_hash='keep-editorial' WHERE story_id='editorial-held'").run();
 const later=at+120000;Date.now=()=>later;await price({...value,price_sell_9999:10900003},later,2);
 const next=await G.captureGoldFollowup(later);assert.equal(next.captured,true);
 assert.equal(stored('story',next.storyId).priceSnapshot.rows[0].sell,10900003);
 assert.equal(row('image','editorial-held').lease_hash,'keep-editorial');
 assert.equal((await G.captureGoldFollowup(later+1)).reason,'awaiting-publication-receipts');
 const task=await P.promptFor({...row('write',next.storyId),stage:'image-review'});
 assert.match(task.prompt,/hai thẻ bảng giá do Windows dựng/);assert.doesNotMatch(task.prompt,/Tạo hai ảnh minh họa gốc/);
});

test('new gold editions freeze selected publication connection without changing earlier captured stories', async () => {
    const cfg=stored('settings','main');
    const connection='a'.repeat(32);
    db.prepare("UPDATE records SET data=? WHERE kind='settings' AND id='main'").run(JSON.stringify({...cfg,publicationConnections:{telegram:connection}}));
    await price();const result=await G.captureGoldSlot(at);
    assert.deepEqual(stored('story',result.storyId).platforms,['website','telegram']);
    assert.equal(stored('story',result.storyId).publicationConnections.telegram,connection);
    db.prepare("UPDATE records SET data=? WHERE kind='settings' AND id='main'").run(JSON.stringify({...cfg,publicationConnections:{}}));
    const again=await G.captureGoldSlot(at);
    assert.equal(again.storyId,result.storyId);
    assert.equal(stored('story',result.storyId).publicationConnections.telegram,connection);
});

test('a website receipt does not unlock the next story while selected-channel publication is still pending',async()=>{
 record('story','first',{kind:'gold',status:'published',platforms:['website','telegram'],priceSnapshot:{rows:[{sell:10200003}]}});
 await P.ensureJob('first','publish');
 db.prepare("INSERT INTO receipts(id,story_id,platform,variant,external_id,url,at) VALUES('first:website','first','website','website','first','/tin-tuc/first',?)").run(at);
 record('story','second',{kind:'gold',status:'working',editionAt:at+1});
 db.prepare("UPDATE records SET created_at=? WHERE kind='story' AND id='second'").run(at+1);
 await P.ensureJob('second','image');
 assert.equal((await claim('second','image')).wait,true);
 assert.equal((await P.publishWebsite('second')).waiting,true);
 assert.equal(row('image','second').attempt,0);
 db.prepare("INSERT INTO receipts(id,story_id,platform,variant,external_id,url,at) VALUES('first:telegram','first','telegram','video','fixture-receipt','https://t.me/fixture/1',?)").run(at);
 db.prepare("UPDATE jobs SET status='complete' WHERE story_id='first' AND stage='publish'").run();
 assert.equal((await claim('second','image')).job.storyId,'second');
 assert.equal(stored('story','first').priceSnapshot.rows[0].sell,10200003);
});

test('connected image browsers can cover news even with a Gemini API key, with no parallel API dispatch',async()=>{
 env.GEMINI_API_KEY='FIXTURE-NOT-A-KEY';
 try{
 record('story','news-browser',{kind:'news',status:'working',title:'Fixture only'});
 db.prepare("UPDATE records SET data=json_set(data,'$.paired',json('true'),'$.status','ready','$.lastSeen',?) WHERE kind='account' AND id='writer'").run(at);
 await P.ensureJob('news-browser','image');
 await P.tick({housekeeping:false}); // fake fetch throws if any provider is called
 assert.equal(row('image','news-browser').status,'queued');
 assert.equal((await P.claim('win','writer',[],row('image','news-browser').id)).job.stage,'image');
 }finally{delete env.GEMINI_API_KEY;}
});

test('a busy creator does not reserve the next compatible task; another provider can cover without resending the held job',async()=>{
 record('story','shared',{kind:'news',status:'working',title:'Fixture only'});
 record('account','cover',{workerId:'win',enabled:true,provider:'gemini',roles:['write','image'],paired:true,status:'ready',lastSeen:at});
 await P.ensureJob('shared','write');await P.ensureJob('shared','image');
 db.prepare("UPDATE jobs SET status='running',owner='writer',lease_hash='held-fixture',lease_until=? WHERE story_id='shared' AND stage='write'").run(at+60000);
 assert.equal((await P.claim('win','writer',[],row('image','shared').id)).wait,true);
 assert.equal((await P.claim('win','cover',[],row('image','shared').id)).job.stage,'image');
 assert.equal(row('write','shared').lease_hash,'held-fixture');
 assert.equal(row('write','shared').status,'running');
});

test('scheduled outlook is retained behind a backlog, deduped and grounded in events affecting gold',async()=>{
 for(let i=0;i<5;i++)record('story','backlog-'+i,{kind:'news',status:'working'});
 Date.now=()=>Date.parse('2026-10-27T11:31:00Z'); // 18:31 Vietnam
 await P.tick({housekeeping:false});await P.tick({housekeeping:false});
 const rows=db.prepare("SELECT id,data FROM records WHERE kind='story' AND json_extract(data,'$.kind')='outlook'").all();
 assert.equal(rows.length,1);
 const story=JSON.parse(rows[0].data);assert.match(story.topic,/Fed, CPI, việc làm, USD/);
 const prompt=await P.promptFor(row('research',rows[0].id));
 assert.match(prompt.prompt,/sự kiện kinh tế sắp công bố/);
 assert.equal((await P.claim('win','writer',[],row('research',rows[0].id).id)).wait,true);
});

function finishGoldFixture(storyId){
 db.prepare("UPDATE records SET data=json_set(data,'$.status','published') WHERE kind='story' AND id=?").run(storyId);
 db.prepare("UPDATE jobs SET status='complete' WHERE story_id=?").run(storyId);
 db.prepare("INSERT INTO receipts(id,story_id,platform,variant,external_id,url,at) VALUES(?,?,'website','website',?,?,?)").run(storyId+':website',storyId,storyId,'/tin-tuc/'+storyId,Date.now());
}

test('new gold plans route only YouTube/TikTok to video and all other selected channels to images, preserving legacy plans',async()=>{
 const selected=Object.fromEntries(['facebook','instagram','threads','telegram','youtube','tiktok'].map((p,i)=>[p,String(i+1).repeat(32)]));
 db.prepare("UPDATE records SET data=json_set(data,'$.publicationConnections',json(?)) WHERE kind='settings'").run(JSON.stringify(selected));
 const plan=await PLAN.publicationPlan('gold');
 assert.equal(plan.publicationPolicy,'gold-platform-v1');
 assert.deepEqual(plan.platforms,['website',...Object.keys(selected)]);
 for(const p of Object.keys(selected))assert.deepEqual(PLAN.publicationVariants(plan,p),['youtube','tiktok'].includes(p)?['video']:['images']);
 const legacy=await PLAN.publicationPlan();
 assert.deepEqual(PLAN.publicationVariants(legacy,'facebook'),['images','video']);
 assert.deepEqual(PLAN.publicationVariants({publicationFormats:{facebook:['video']}},'facebook'),['video']);
 await price();const {storyId}=await G.captureGoldSlot(at);
 assert.deepEqual(stored('story',storyId).publicationFormats,plan.publicationFormats);
});

test('a validated gold photo publishes with frozen caption/hashtags while narrated video is pending, without resending after render',async()=>{
 const connection='a'.repeat(32),key='1'.repeat(64);
 env.KBL_SOCIAL_ENCRYPTION_KEY=key;
 const vault=await seal({tokens:{accessToken:'FIXTURE-NOT-REAL'}},key,'kbl-social:1:telegram:'+connection);
 record('social-connection',connection,{platform:'telegram',status:'connected',targetId:'-100123',vault});
 db.prepare("UPDATE records SET data=json_set(data,'$.publicationEnabled',json('true'),'$.publicationConnections',json(?)) WHERE kind='settings'").run(JSON.stringify({telegram:connection}));
 await price();const {storyId}=await G.captureGoldSlot(at),snapshot=stored('story',storyId).priceSnapshot;
 await P.tick({housekeeping:false});
 const ids=['a'.repeat(64),'b'.repeat(64)];
 for(const id of ids)db.prepare('INSERT INTO assets(id,story_id,mime,bytes,purpose,created_at) VALUES(?,?,?,?,?,?)').run(id,storyId,'image/jpeg',100,'news-image',at);
 let task=await claim(storyId,'image');
 await P.complete('win',task.job.id,task.lease,{rows:ids.map(assetId=>({assetId,caption:'Fixture card'}))});
 assert.equal(row('publish',storyId).status,'queued');
 task=await claim(storyId,'render');
 let calls=0;
 globalThis.fetch=async(url,opts)=>{
  calls++;assert.match(String(url),/\/sendPhoto$/);const body=opts.body;
  assert.match(body.get('caption'),/10\.000\.001/);assert.match(body.get('caption'),/#GiaVang/);
  assert.match(body.get('caption'),/08:02/);assert.match(body.get('caption'),/utm_source=telegram/);
  assert.ok(body.get('photo'));assert.equal(body.get('video'),null);
  return Response.json({ok:true,result:{message_id:42,chat:{username:'fixture'}}});
 };
 try{
  const early=await P.publishWebsite(storyId);
  assert.equal(early.waiting,true);assert.equal(calls,1);
  assert.equal(row('render',storyId).status,'leased');
  assert.deepEqual(stored('article',storyId).images.map(r=>r.assetId),[ids[0]]);
  await P.publishWebsite(storyId);assert.equal(calls,1);
  const videoId='c'.repeat(64),audioId='d'.repeat(64),captionsId='e'.repeat(64);
  for(const [id,mime,purpose] of [[videoId,'video/mp4','video-temp'],[audioId,'audio/mpeg','audio'],[captionsId,'text/plain','captions']])db.prepare('INSERT INTO assets(id,story_id,mime,bytes,purpose,created_at) VALUES(?,?,?,?,?,?)').run(id,storyId,mime,100,purpose,at);
  assert.equal((await P.cleanup()).deleted,0,'Early photo receipts must not delete unacknowledged render uploads');
  await P.complete('win',task.job.id,task.lease,{posterIds:[ids[0]],videoId,audioId,captionsId,duration:45,width:1080,height:1920});
  await P.tick({housekeeping:false});
  assert.equal(row('publish',storyId).status,'complete');assert.equal(calls,1);
  assert.deepEqual(stored('story',storyId).priceSnapshot,snapshot);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM receipts WHERE platform='telegram' AND variant='video'").get().n,0);
 }finally{delete env.KBL_SOCIAL_ENCRYPTION_KEY;}
});

test('missing video on a selected YouTube/TikTok channel stays pending rather than dropping the required variant',async()=>{
 db.prepare("UPDATE records SET data=json_set(data,'$.publicationEnabled',json('true'),'$.publicationConnections',json(?)) WHERE kind='settings'").run(JSON.stringify({youtube:'a'.repeat(32),tiktok:'b'.repeat(32)}));
 await price();const {storyId}=await G.captureGoldSlot(at);await P.tick({housekeeping:false});
 const ids=['a'.repeat(64),'b'.repeat(64)];for(const id of ids)db.prepare('INSERT INTO assets(id,story_id,mime,bytes,purpose,created_at) VALUES(?,?,?,?,?,?)').run(id,storyId,'image/jpeg',100,'news-image',at);
 const task=await claim(storyId,'image');await P.complete('win',task.job.id,task.lease,{rows:ids.map(assetId=>({assetId,caption:'Fixture card'}))});
 const outcome=await P.publishWebsite(storyId);assert.equal(outcome.completed,false);assert.match(outcome.reason,/youtube: chờ video/);assert.match(outcome.reason,/tiktok: chờ video/);
 assert.equal(row('publish',storyId).status,'queued');
});

test('an unfinished Facebook photo upload keeps its fingerprint when the gold video completes',async()=>{
 const connection='a'.repeat(32),key='1'.repeat(64);
 env.KBL_SOCIAL_ENCRYPTION_KEY=key;env.KBL_META_GRAPH_VERSION='v25.0';
 record('social-connection',connection,{platform:'facebook',status:'connected',targetId:'fixture-page',vault:await seal({tokens:{accessToken:'FIXTURE'}},key,'kbl-social:1:facebook:'+connection)});
 db.prepare("UPDATE records SET data=json_set(data,'$.publicationEnabled',json('true'),'$.publicationConnections',json(?)) WHERE kind='settings'").run(JSON.stringify({facebook:connection}));
 await price();const {storyId}=await G.captureGoldSlot(at);await P.tick({housekeeping:false});
 const ids=['a'.repeat(64),'b'.repeat(64)];for(const id of ids)db.prepare('INSERT INTO assets(id,story_id,mime,bytes,purpose,created_at) VALUES(?,?,?,?,?,?)').run(id,storyId,'image/jpeg',100,'news-image',at);
 let task=await claim(storyId,'image');await P.complete('win',task.job.id,task.lease,{rows:ids.map(assetId=>({assetId,caption:'Fixture card'}))});
 const calls=[];
 globalThis.fetch=async(url,opts)=>{calls.push(String(url));if(String(url).endsWith('/photos'))return Response.json({id:'photo'});if(String(url).endsWith('/feed')){assert.match(opts.body.get('message'),/#GiaVang/);return Response.json({id:'post'});}return Response.json({id:'post',permalink_url:'https://facebook.com/fixture-post'});};
 try{
  await P.publishWebsite(storyId);
  assert.match(calls[0],/\/photos$/);
  const before=db.prepare("SELECT data FROM records WHERE kind='publishing-outbox'").get();
  task=await claim(storyId,'render');
  const videoId='c'.repeat(64),audioId='d'.repeat(64),captionsId='e'.repeat(64);
  for(const [id,mime,purpose] of [[videoId,'video/mp4','video-temp'],[audioId,'audio/mpeg','audio'],[captionsId,'text/plain','captions']])db.prepare('INSERT INTO assets(id,story_id,mime,bytes,purpose,created_at) VALUES(?,?,?,?,?,?)').run(id,storyId,mime,100,purpose,at);
  await P.complete('win',task.job.id,task.lease,{posterIds:[ids[0]],videoId,audioId,captionsId,duration:45,width:1080,height:1920});
  await P.publishWebsite(storyId);await P.publishWebsite(storyId);await P.publishWebsite(storyId);
  const after=db.prepare("SELECT data FROM records WHERE kind='publishing-outbox'").get();
  assert.equal(JSON.parse(before.data).fingerprint,JSON.parse(after.data).fingerprint);
  assert.equal(calls.filter(u=>u.endsWith('/photos')).length,1);assert.equal(calls.filter(u=>u.endsWith('/feed')).length,1);
  assert.equal(JSON.parse(after.data).state.phase,'published');assert.equal(calls.some(u=>u.endsWith('/videos')),false);
 }finally{delete env.KBL_SOCIAL_ENCRYPTION_KEY;delete env.KBL_META_GRAPH_VERSION;}
});
test('changed quotes are coalesced only after all prior receipts; the old running quote stays immutable',async()=>{
 db.prepare("UPDATE records SET data=json_set(data,'$.publicationEnabled',json('true')) WHERE kind='settings'").run();
 await price();const first=await G.captureGoldSlot(at),original=stored('story',first.storyId).priceSnapshot;
 const later=at+120000;Date.now=()=>later;
 await price({...value,price_sell_9999:10300003},later,2);
 assert.equal((await G.captureGoldFollowup(later)).waiting,true);
 assert.deepEqual(stored('story',first.storyId).priceSnapshot,original);
 await P.ensureJob(first.storyId,'publish');finishGoldFixture(first.storyId);
 const changes=await Promise.all([G.captureGoldFollowup(later),G.captureGoldFollowup(later)]);
 assert.equal(changes.every(x=>x.captured),true);
 assert.equal(changes[0].storyId,changes[1].storyId);
 const second=stored('story',changes[0].storyId);assert.equal(second.followupOf,first.storyId);
 assert.equal(second.priceSnapshot.rows[0].sell,10300003);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM records WHERE kind='story'").get().n,2);
 assert.deepEqual(stored('story',first.storyId).priceSnapshot,original);
 await price({...value,price_sell_9999:10400003},later+1,3);
 assert.equal((await G.captureGoldFollowup(later+1)).waiting,true);
 assert.equal(stored('story',second.id||changes[0].storyId).priceSnapshot.rows[0].sell,10300003);
});

test('unchanged observations and stale prices cannot create follow-up news',async()=>{
 db.prepare("UPDATE records SET data=json_set(data,'$.publicationEnabled',json('true')) WHERE kind='settings'").run();
 await price();const first=await G.captureGoldSlot(at);await P.ensureJob(first.storyId,'publish');finishGoldFixture(first.storyId);
 const later=at+3600000;Date.now=()=>later;
 await price(value,later,2);
 assert.equal((await G.captureGoldFollowup(later)).reason,'quote-unchanged');
 await price({...value,price_sell_9999:10500003},later-360000,3);
 assert.equal((await G.captureGoldFollowup(later)).reason,'awaiting-fresh-pos-price');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM records WHERE kind='story'").get().n,1);
});

test('a newly selected channel gets one fresh unchanged quote without retrofitting history or changing the schedule',async()=>{
 db.prepare("UPDATE records SET data=json_set(data,'$.publicationEnabled',json('true')) WHERE kind='settings'").run();
 await price();const first=await G.captureGoldSlot(at),frozen=stored('story',first.storyId);await P.ensureJob(first.storyId,'publish');finishGoldFixture(first.storyId);
 const later=at+120000;Date.now=()=>later;await price(value,later,2);
 db.prepare("UPDATE records SET data=json_set(data,'$.publicationConnections',json(?)) WHERE kind='settings'").run(JSON.stringify({facebook:'a'.repeat(32)}));
 const [a,b]=await Promise.all([G.captureGoldFollowup(later),G.captureGoldFollowup(later)]);
 assert.equal(a.captured,true);assert.equal(a.storyId,b.storyId);assert.match(a.slot,/^channel:/);
 const next=stored('story',a.storyId);assert.deepEqual(next.platforms,['website','facebook']);assert.deepEqual(next.publicationFormats.facebook,['images']);
 assert.deepEqual(stored('story',first.storyId).priceSnapshot,frozen.priceSnapshot);assert.deepEqual(stored('story',first.storyId).platforms,['website']);
 assert.equal((await G.captureGoldFollowup(later+1)).reason,'awaiting-publication-receipts');
 await P.ensureJob(a.storyId,'publish');finishGoldFixture(a.storyId);
 db.prepare("INSERT INTO receipts(id,story_id,platform,variant,external_id,url,at) VALUES(?,?,'facebook','images','fixture-post','https://facebook.com/fixture-post',?)").run(a.storyId+':facebook:images',a.storyId,later);
 assert.equal((await G.captureGoldFollowup(later+2)).reason,'quote-unchanged');
 assert.equal(stored('settings','main').goldSchedule,undefined,'Default schedule was not rewritten');
 db.prepare("UPDATE records SET data=json_set(data,'$.publicationConnections',json('{}')) WHERE kind='settings'").run();
 assert.equal((await G.captureGoldFollowup(later+3)).reason,'quote-unchanged');
});

test('follow-up capture rechecks prior publication receipts atomically before creating any job',async()=>{
 db.prepare("UPDATE records SET data=json_set(data,'$.publicationEnabled',json('true')) WHERE kind='settings'").run();
 await price();const first=await G.captureGoldSlot(at);await P.ensureJob(first.storyId,'publish');finishGoldFixture(first.storyId);
 const later=at+120000;Date.now=()=>later;await price({...value,price_sell_9999:10600003},later,2);
 const batch=env.DB.batch;env.DB.batch=statements=>{env.DB.batch=batch;db.prepare("UPDATE jobs SET status='queued' WHERE story_id=? AND stage='publish'").run(first.storyId);return batch(statements);};
 assert.equal((await G.captureGoldFollowup(later)).waiting,true);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM records WHERE kind='story'").get().n,1);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM jobs WHERE story_id<>?").get(first.storyId).n,0);
});

test('published POS product set fills local copy, verifies original images and renders without any Chrome assignment',async()=>{
 db.prepare("UPDATE records SET data=json_set(data,'$.autoProducts',json('true'),'$.publicationEnabled',json('true')) WHERE kind='settings'").run();
 record('pos-sync','product',{receivedAt:at});
 const originals=['1','2','3'].map(x=>x.repeat(64));
 for(let i=0;i<3;i++){
  record('product','fixture-product-'+i,{source:'pos',sku:'FIXTURE-'+i,name:'Món fixture '+i,purity:'610',weight:3.75+i,price:1000000+i,imageIds:[originals[i]],published:true,available:true});
  db.prepare("INSERT INTO assets(id,mime,bytes,purpose,created_at) VALUES(?,'image/jpeg',100,'product',?)").run(originals[i],at);
 }
 await P.tick({housekeeping:false});
 const s=db.prepare("SELECT id,data FROM records WHERE kind='story' AND json_extract(data,'$.kind')='product'").get();assert.ok(s);
 assert.equal(row('write',s.id).owner,'local-data-template');assert.equal(row('review',s.id).owner,'local-data-validator');assert.equal(row('image-review',s.id).owner,'local-file-validator');
 assert.deepEqual(JSON.parse(row('image',s.id).result).rows.map(r=>r.assetId),originals);
 assert.equal((await claim(s.id,'write','writer')).wait,true);assert.equal((await claim(s.id,'image-review','reviewer')).wait,true);
 const task=await claim(s.id,'render');assert.equal(task.job.stage,'render');
 const ids=['4','5','6','7','8','9'].map(x=>x.repeat(64));
 for(let i=0;i<ids.length;i++)db.prepare('INSERT INTO assets(id,story_id,mime,bytes,purpose,created_at) VALUES(?,?,?,?,?,?)').run(ids[i],s.id,i===0?'video/mp4':i===1?'audio/mpeg':i===2?'text/plain':'image/jpeg',100,i===0?'video-temp':i===1?'audio':i===2?'captions':'news-image',at);
 await P.complete('win',task.job.id,task.lease,{videoId:ids[0],audioId:ids[1],captionsId:ids[2],posterIds:ids.slice(3),duration:45,width:1080,height:1920});
 await P.tick({housekeeping:false});
 assert.equal(stored('story',s.id).status,'published');assert.deepEqual(stored('article',s.id).images.map(i=>i.assetId),ids.slice(3));
 assert.equal(db.prepare('SELECT public FROM assets WHERE id=?').get(ids[3]).public,1);assert.equal(db.prepare('SELECT deleted_at FROM assets WHERE id=?').get(originals[0]).deleted_at,null);
});

test('local fill refuses altered snapshot and never replaces an already leased Chrome result',async()=>{
 await price();const s=await G.captureGoldSlot(at);
 db.prepare("UPDATE jobs SET status='running',owner='held-owner',lease_hash='keep-lease' WHERE story_id=? AND stage='write'").run(s.storyId);
 await P.tick({housekeeping:false});assert.equal(row('write',s.storyId).owner,'held-owner');assert.equal(row('write',s.storyId).lease_hash,'keep-lease');assert.equal(row('review',s.storyId),undefined);
 db.prepare("UPDATE jobs SET status='queued',owner=NULL,lease_hash=NULL WHERE story_id=? AND stage='write'").run(s.storyId);
 db.prepare("UPDATE records SET data=json_set(data,'$.priceSnapshot.rows[0].sell',77777777) WHERE kind='story' AND id=?").run(s.storyId);
 await P.tick({housekeeping:false});assert.equal(row('write',s.storyId).status,'queued');assert.equal(row('review',s.storyId),undefined);
});
