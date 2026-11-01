import {test,before,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createECDH,randomBytes,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {goldGoal,goalProgress,priceAlert,alertHit,pushSubscription} from '../lib/kbl/customer-plans-core.mjs';
const db=new DatabaseSync(':memory:');let handle,processPriceNotifications;
const sha=s=>createHash('sha256').update(s).digest('hex');
const seed=(kind,id,data)=>db.prepare('INSERT OR REPLACE INTO records(kind,id,data,created_at,updated_at) VALUES(?,?,?,?,?)').run(kind,id,JSON.stringify(data),Date.now(),Date.now());
const get=(kind,id)=>{const r=db.prepare('SELECT * FROM records WHERE kind=? AND id=?').get(kind,id);return r?{...JSON.parse(r.data),id:r.id,version:r.version}:null;};
const records=kind=>db.prepare('SELECT * FROM records WHERE kind=?').all(kind).map(r=>({...JSON.parse(r.data),id:r.id,version:r.version}));
function auth(n=1){const token=String(n).repeat(64);seed('customer','fixture-'+n,{authVersion:1});seed('customer-session',sha(token),{customerId:'fixture-'+n,authVersion:1,expiresAt:Date.now()+100000});return {Cookie:'__Host-kbl_customer='+token};}
async function call(route='',body,headers={}){const response=await handle(new Request('https://kbl.test/api/public/'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}));return {status:response.status,data:await response.json(),headers:response.headers};}
const goal=()=>({version:0,code:'9999',targetChi:'8',title:'Mục tiêu thử',showOnPriceWidget:true});
const entry=(code='9999')=>({id:'12345678-1234-4123-8123-123456789012',kind:'buy',code,quantityChi:'2',date:'2026-10-01',priceMode:'per-chi',amountVnd:10000000});
const quote=(at=Date.now())=>({code:'9999',buy:110000000,sell:120000000,unit:'đồng/lượng',capturedAt:at});
function subscription(suffix='device-1'){const ec=createECDH('prime256v1');return {endpoint:'https://web.push.apple.com/fixture-only-'+suffix,keys:{p256dh:ec.generateKeys().toString('base64url'),auth:randomBytes(16).toString('base64url')}};}
const alert=(i=1)=>({requestId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'+i,code:'9999',side:'sell',direction:'above',targetVnd:12000000});
const register=async(headers,sub=subscription())=>{const r=await call('customer-plans/subscribe',{consent:true,subscription:sub},headers);assert.equal(r.status,200,JSON.stringify(r.data));return r.data.id;};
const armed=async(headers)=>{await register(headers);const r=await call('customer-plans/alert',alert(),headers);assert.equal(r.status,200,JSON.stringify(r.data));};
before(async()=>{
 for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8').replaceAll('--> statement-breakpoint',''));
 const DB={prepare(sql){let args=[];const stmt={bind(...v){args=v;return stmt;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};return stmt;},async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
 globalThis.__PLANS_ENV={DB,KBL_CUSTOMER_AUTH_PEPPER:randomBytes(32).toString('hex')};
 const {build}=createRequire(fs.realpathSync('node_modules/wrangler/package.json'))('esbuild');
 await build({stdin:{contents:"export {handle} from './lib/kbl/api'; export {processPriceNotifications} from './lib/kbl/customer-plans';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',external:['web-push'],outfile:'.sites-runtime/plans-tests.mjs',plugins:[{name:'env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env=globalThis.__PLANS_ENV;'}));}}]});
 ({handle,processPriceNotifications}=await import(pathToFileURL(path.resolve('.sites-runtime/plans-tests.mjs'))+'?'+Date.now()));
});
beforeEach(()=>{db.exec('DELETE FROM records');seed('price','pos-9999',quote());});
test('goals keep integer chi units, select one purity and never round incomplete targets to 100%',()=>{
 const g=goldGoal(goal()),p=goalProgress(g,[{code:'9999',units:2000},{code:'610',units:50000}]);assert.equal(p.currentUnits,2000);assert.equal(p.percent,25);assert.equal(p.remainingUnits,6000);assert.equal(goalProgress({...g,targetUnits:1000000},[{code:'9999',units:999999}]).percent,99.9);assert.equal(goalProgress(g,[{code:'9999',units:9000}]).percent,100);assert.equal(goalProgress(null,[]),null);
 for(const patch of [{targetChi:'0'},{targetChi:'-1'},{targetChi:'1e2'},{code:'XAU'},{title:'x'.repeat(41)},{showOnPriceWidget:'true'}])assert.throws(()=>goldGoal({...goal(),...patch}));
});
test('goal writes require session/CSRF protection, compare versions, keep ledgers and isolate customers',async()=>{
 assert.equal((await call('customer-plans')).status,401);const a=auth(),b=auth(2);await call('holdings',{action:'add',version:0,requestId:'bbbbbbbbbbbbbbbb',entry:entry()},a);const before=get('customer-holdings','fixture-1');
 assert.equal((await call('customer-plans/goal',goal(),{...a,Origin:'https://evil.test'})).status,403);assert.equal((await call('customer-plans/goal',{...goal(),customerId:'fixture-2'},a)).status,200);
 assert.equal((await call('customer-plans',undefined,a)).data.goal.percent,25);assert.equal((await call('customer-plans',undefined,b)).data.goal,null);assert.equal((await call('customer-plans/goal',goal(),a)).status,409);
 const parallel=await Promise.all([1,2].map(n=>call('customer-plans/goal',{...goal(),version:1,title:'goal-'+n},a)));assert.deepEqual(parallel.map(r=>r.status).sort(),[200,409]);
 assert.deepEqual(get('customer-holdings','fixture-1'),before);assert.match((await call('customer-plans',undefined,a)).headers.get('cache-control'),/no-store/);
 assert.equal((await call('customer-plans/goal',{version:2,clear:true},a)).status,200);assert.equal((await call('customer-plans',undefined,a)).data.goal,null);assert.deepEqual(get('customer-holdings','fixture-1'),before);
});
test('goal widget requires the paired bearer, returns only opted-in goal, never contaminates public prices',async()=>{
 const a=auth();await call('holdings',{action:'add',version:0,requestId:'bbbbbbbbbbbbbbbb',entry:entry()},a);await call('customer-plans/goal',goal(),a);const p=await call('holdings/pair',{},a),r=await call('holdings/redeem',{code:p.data.code}),headers={Authorization:'Bearer '+r.data.token};
 const widget=await call('holdings/goal-widget',undefined,headers);assert.equal(widget.data.goal.percent,25);assert.deepEqual(Object.keys(widget.data).sort(),['generatedAt','goal']);assert.equal((await call('holdings/goal-widget',undefined,a)).status,401);
 const pub=await call('prices',undefined,a);assert.equal(pub.status,200);assert.ok(!JSON.stringify(pub.data).includes('Mục tiêu thử'));assert.equal(pub.data.goal,undefined);
 assert.equal((await call('customer-plans/goal',goal(),headers)).status,401);
 await call('customer-plans/goal',{...goal(),version:1,showOnPriceWidget:false},a);assert.equal((await call('holdings/goal-widget',undefined,headers)).data.goal,null);
 await call('holdings/revoke',{},a);assert.equal((await call('holdings/goal-widget',undefined,headers)).status,401);
});
test('thresholds use inclusive buy/sell with correct per-luong conversion and only fresh quotes',()=>{
 const a=priceAlert(alert()),now=Date.now();assert.equal(alertHit(a,[quote(now)],now).value,12000000);assert.equal(alertHit({...a,side:'buy'},[quote(now)],now),null);assert.equal(alertHit({...a,direction:'below',targetVnd:12000000},[quote(now)],now).value,12000000);
 for(const patch of [{capturedAt:now-300001},{capturedAt:now+90001},{unit:'USD/oz'},{stale:true},{code:'610'},{sell:'120000000'}])assert.equal(alertHit(a,[{...quote(now),...patch}],now),null);
 for(const patch of [{targetVnd:NaN},{targetVnd:0},{side:'bad'},{direction:'bad'}])assert.throws(()=>priceAlert({...alert(),...patch}));
});
test('subscription validates HTTPS, provider, no credentials/redirect tricks, keys and explicit consent',async()=>{
 const a=auth(),s=subscription();assert.equal((await call('customer-plans/subscribe',{subscription:s},a)).status,400);
 for(const endpoint of ['http://web.push.apple.com/fixture','https://localhost/','https://web.push.apple.com.evil.test/','https://user:pass@web.push.apple.com/','https://web.push.apple.com:4439/','https://web.push.apple.com/fixture#fragment'])assert.throws(()=>pushSubscription({...s,endpoint}));
 assert.throws(()=>pushSubscription({...s,keys:{...s.keys,auth:'bad'}}));assert.throws(()=>pushSubscription({...s,keys:{...s.keys,p256dh:'bad'}}));assert.equal(pushSubscription(s).endpoint,s.endpoint);
});
test('subscription and VAPID private key are encrypted at rest; public responses contain neither endpoint nor keys',async()=>{
 const a=auth(),s=subscription(),id=await register(a,s),row=get('customer-push-sub',id),cfg=get('customer-push-config','main');assert.ok(row.encrypted.cipher);assert.ok(cfg.encrypted.cipher);assert.ok(cfg.publicKey);assert.ok(!JSON.stringify(row).includes(s.endpoint));assert.ok(!JSON.stringify(row).includes(s.keys.auth));assert.equal(cfg.privateKey,undefined);
 const response=await call('customer-plans',undefined,a);assert.deepEqual(response.data.devices.map(d=>d.id),[id]);assert.ok(!JSON.stringify(response.data).includes(s.endpoint));assert.ok(!JSON.stringify(response.data).includes('encrypted'));
 const b=auth(2);assert.equal((await call('customer-plans/unsubscribe',{id},b)).status,404);assert.equal((await call('customer-plans/subscribe',{consent:true,subscription:s},b)).status,409);
});
test('limits devices to five, rules to three; duplicate request ID is idempotent and conflicting retry rejected',async()=>{
 const a=auth();for(let i=0;i<5;i++)await register(a,subscription('device-'+i));assert.equal((await call('customer-plans/subscribe',{consent:true,subscription:subscription('sixth')},a)).status,409);
 for(let i=1;i<=3;i++)assert.equal((await call('customer-plans/alert',alert(i),a)).status,200);assert.equal((await call('customer-plans/alert',alert(4),a)).status,409);assert.equal((await call('customer-plans/alert',alert(1),a)).data.duplicate,true);assert.equal((await call('customer-plans/alert',{...alert(1),targetVnd:13000000},a)).status,409);
});
test('real web-push encryption creates encrypted POST; cron queues once and does not resend accepted delivery',async()=>{
 const a=auth();await armed(a);let sends=0;const fetcher=async(url,opts)=>{sends++;assert.match(url,/^https:\/\/web.push.apple.com\//);assert.equal(opts.method,'POST');assert.equal(opts.redirect,'error');assert.ok(opts.headers.Authorization||opts.headers.authorization);assert.ok(opts.body instanceof ArrayBuffer);assert.ok(!Buffer.from(opts.body).includes(Buffer.from('Kim Bảo Lâm')));assert.ok(!Buffer.from(opts.body).includes(Buffer.from('fixture-1')));return new Response('',{status:201});};
 const r=await processPriceNotifications({fetcher});assert.equal(r.accepted,1);assert.equal(sends,1);assert.equal(records('customer-push-job')[0].status,'accepted');await processPriceNotifications({fetcher});assert.equal(sends,1);
});
test('concurrent cron claims one job; revoked auth, deleted rule and unsubscribed devices cancel pending jobs',async()=>{
 const a=auth();await armed(a);let sends=0;const fetcher=async()=>{sends++;return new Response('',{status:201});};await Promise.all([processPriceNotifications({fetcher}),processPriceNotifications({fetcher})]);assert.equal(sends,1);
 const sub=records('customer-push-sub')[0];seed('customer-push-job','pending-auth',{customerId:'fixture-1',authVersion:1,subId:sub.id,status:'pending',expiresAt:Date.now()+60000,payload:{title:'fixture'}});seed('customer','fixture-1',{authVersion:2});await processPriceNotifications({fetcher});assert.equal(get('customer-push-job','pending-auth').status,'cancelled');assert.equal(sends,1);
 seed('customer','fixture-1',{authVersion:1});seed('customer-push-job','pending-rule',{customerId:'fixture-1',authVersion:1,subId:sub.id,ruleId:'removed',ruleVersion:1,status:'pending',expiresAt:Date.now()+60000,payload:{title:'fixture'}});await processPriceNotifications({fetcher});assert.equal(get('customer-push-job','pending-rule').status,'cancelled');
 seed('customer-push-job','pending-sub',{customerId:'fixture-1',authVersion:1,subId:sub.id,status:'pending',expiresAt:Date.now()+60000,payload:{title:'fixture'}});await call('customer-plans/unsubscribe',{id:sub.id},a);await processPriceNotifications({fetcher});assert.equal(get('customer-push-job','pending-sub').status,'cancelled');assert.equal(sends,1);
});
test('stale quotes, unsupported/missing purity, expired devices and expired jobs never notify',async()=>{
 const a=auth();await armed(a);let sends=0;const fetcher=async()=>{sends++;return new Response('',{status:201});};seed('price','pos-9999',quote(Date.now()-3600000));await processPriceNotifications({fetcher});assert.equal(sends,0);assert.equal(records('customer-price-alert')[0].status,'armed');
 seed('price','pos-9999',{...quote(),code:'980'});await processPriceNotifications({fetcher});assert.equal(sends,0);
 seed('price','pos-9999',quote());const sub=records('customer-push-sub')[0];seed('customer-push-sub',sub.id,{...sub,expiresAt:Date.now()-1});await processPriceNotifications({fetcher});assert.equal(sends,0);
 seed('customer-push-sub',sub.id,{...sub,expiresAt:Date.now()+60000});seed('customer-push-job','expired',{customerId:'fixture-1',authVersion:1,subId:sub.id,status:'pending',expiresAt:Date.now()-1,payload:{title:'fixture'}});await call('customer-plans/remove-alert',{id:records('customer-price-alert')[0].id},a);await processPriceNotifications({fetcher});assert.equal(get('customer-push-job','expired').status,'cancelled');assert.equal(sends,0);
});
for(const scenario of ['410','500','network'])test('push '+scenario+' records a terminal outcome without blind retries',async()=>{
 const a=auth();await armed(a);let sends=0;const fetcher=async()=>{sends++;if(scenario==='network')throw Error('fixture-only timeout');return new Response('',{status:Number(scenario)});};await processPriceNotifications({fetcher});await processPriceNotifications({fetcher});assert.equal(sends,1);assert.equal(records('customer-push-job')[0].status,scenario==='410'?'rejected':'unknown');if(scenario==='410'){assert.equal(records('customer-push-sub')[0].encrypted,null);assert.equal(records('customer-push-sub')[0].enabled,false);}
});
test('test notification requires customer action, is rate limited and says queued rather than delivered',async()=>{
 const a=auth();assert.equal((await call('customer-plans/test',{},a)).status,409);await register(a);const r=await call('customer-plans/test',{},a);assert.equal(r.status,200);assert.match(r.data.message,/chưa xác nhận đã hiển thị/);assert.equal(records('customer-push-job')[0].status,'pending');await call('customer-plans/test',{},a);assert.equal((await call('customer-plans/test',{},a)).status,429);
});
test('service worker displays safe notification content and ignores remote navigation payloads; it never caches private pages',async()=>{
 const handlers={},notifications=[],opened=[];const self={location:{origin:'https://kbl.test'},addEventListener:(t,f)=>handlers[t]=f,registration:{showNotification:async(t,o)=>notifications.push({t,o})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};vm.runInNewContext(fs.readFileSync('public/kbl-sw.js','utf8'),{self,URL});let pending;
 handlers.push({data:{json:()=>({title:'fixture',body:'fixture price',url:'https://evil.test/'})},waitUntil:p=>pending=p});await pending;assert.equal(notifications.length,1);assert.equal(notifications[0].o.data.url,'/vang-cua-toi');handlers.notificationclick({notification:{close(){},data:{url:'https://evil.test/'}},waitUntil:p=>pending=p});await pending;assert.equal(opened.length,1);assert.match(opened[0],/^(https:\/\/kbl.test)?\/vang-cua-toi$/);assert.equal(handlers.fetch,undefined);
});

test('an interrupted sending lease becomes unknown and is never retried automatically',async()=>{const a=auth();const subId=await register(a);seed('customer-push-job','interrupted',{customerId:'fixture-1',authVersion:1,subId,status:'sending',lease:'fixture-lease',expiresAt:Date.now()+60000,payload:{title:'fixture'}});db.prepare("UPDATE records SET updated_at=? WHERE kind='customer-push-job' AND id='interrupted'").run(Date.now()-180000);let sends=0;const fetcher=async()=>{sends++;return new Response('',{status:201});};await processPriceNotifications({fetcher});await processPriceNotifications({fetcher});assert.equal(get('customer-push-job','interrupted').status,'unknown');assert.equal(sends,0);});
