import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { seal, unseal, authorization, exchange, targetList, safeTargets, publicConnection, providerJSON } from '../lib/kbl/social-core.mjs';
const env={KBL_SOCIAL_ENCRYPTION_KEY:'a'.repeat(64),KBL_PUBLISHER_PUBLIC_BASE_URL:'https://kbl.test',KBL_META_GRAPH_VERSION:'v25.0',KBL_META_APP_ID:'meta-id',KBL_META_APP_SECRET:'META-PRIVATE',KBL_THREADS_APP_ID:'threads-id',KBL_THREADS_APP_SECRET:'THREADS-PRIVATE',KBL_GOOGLE_CLIENT_ID:'google-id',KBL_GOOGLE_CLIENT_SECRET:'GOOGLE-PRIVATE',KBL_TIKTOK_CLIENT_KEY:'tt-id',KBL_TIKTOK_CLIENT_SECRET:'TT-PRIVATE',KBL_ZALO_APP_ID:'zalo-id',KBL_ZALO_APP_SECRET:'ZALO-PRIVATE'};
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
test('AES-GCM token vault authenticates connection identity and never stores token plaintext',async()=>{
 const value={accessToken:'PRIVATE-ACCESS',refreshToken:'PRIVATE-REFRESH'},vault=await seal(value,env.KBL_SOCIAL_ENCRYPTION_KEY,'connection:1');
 assert.equal(JSON.stringify(vault).includes('PRIVATE'),false);assert.deepEqual(await unseal(vault,env.KBL_SOCIAL_ENCRYPTION_KEY,'connection:1'),value);
 await assert.rejects(()=>unseal(vault,env.KBL_SOCIAL_ENCRYPTION_KEY,'connection:2'));
 await assert.rejects(()=>seal(value,'bad','connection:1'));
});
test('authorization URLs use provider-specific web protocol and never expose application secrets',async()=>{
 for(const platform of ['facebook','instagram','threads','youtube','tiktok','zalo']){
  const u=new URL(await authorization(env,platform,'state-fixture','verifier-fixture'));
  assert.equal(u.searchParams.get('state'),'state-fixture');assert.equal(u.searchParams.get('redirect_uri'),'https://kbl.test/api/admin/social/oauth/'+platform+'/callback');
  assert.equal(u.href.includes('PRIVATE'),false);
  if(['youtube','zalo'].includes(platform))assert.ok(u.searchParams.get('code_challenge'));
  if(platform==='tiktok'){assert.equal(u.searchParams.get('client_key'),'tt-id');assert.equal(u.searchParams.has('code_challenge'),false);}
  if(platform==='youtube')assert.equal(u.searchParams.get('access_type'),'offline');
  if(platform==='instagram'){assert.ok(u.searchParams.get('scope').includes('instagram_content_publish'));assert.ok(!u.searchParams.get('scope').includes('instagram_business_'));}
 }
});
test('token exchange keeps Zalo PKCE secret in headers, TikTok web excludes verifier, and refresh rotates secrets',async()=>{
 const calls=[],fetcher=async(url,init)=>{calls.push({url,params:new URLSearchParams(init.body),headers:init.headers});return json({access_token:'access-'+calls.length,refresh_token:'refresh-'+calls.length,expires_in:3600});};
 await exchange(env,'zalo',{code:'CODE',verifier:'VERIFIER'},fetcher);
 assert.equal(calls[0].params.get('code_verifier'),'VERIFIER');assert.equal(calls[0].headers.secret_key,'ZALO-PRIVATE');assert.equal(calls[0].params.has('client_secret'),false);
 await exchange(env,'tiktok',{code:'CODE',verifier:'VERIFIER'},fetcher);assert.equal(calls[1].params.has('code_verifier'),false);assert.equal(calls[1].params.get('client_key'),'tt-id');
 const result=await exchange(env,'youtube',{refreshToken:'old-refresh'},fetcher);assert.equal(result.refreshToken,'refresh-3');assert.equal(calls[2].params.get('refresh_token'),'old-refresh');
});
test('provider errors and target projections cannot leak tokens, API bodies or page access credentials',async()=>{
 await assert.rejects(()=>providerJSON('https://provider.test',{fetcher:async()=>new Response(JSON.stringify({error:{message:'SECRET-ACCESS'}}),{status:400})}),error=>!error.message.includes('SECRET'));
 assert.deepEqual(await providerJSON('https://provider.test',{fetcher:async()=>json({error:{code:'ok'},data:{}})}),{error:{code:'ok'},data:{}});
 const targets=await targetList(env,'instagram',{accessToken:'USER-TOKEN'},async()=>json({data:[{id:'page1',name:'Shop',access_token:'PAGE-TOKEN',instagram_business_account:{id:'ig1',username:'shop'}}]}));
 assert.equal(targets[0].accessToken,'PAGE-TOKEN');assert.equal(JSON.stringify(safeTargets(targets)).includes('TOKEN'),false);
 const row=publicConnection({id:'1',platform:'instagram',vault:{cipher:'SECRET'},targetId:'ig1',label:'Shop',status:'connected'});assert.equal(JSON.stringify(row).includes('SECRET'),false);
});
const db=new DatabaseSync(':memory:');
function prepare(query){let params=[];const stmt={bind(...p){params=p;return stmt;},async first(){return db.prepare(query).get(...params)||null;},async all(){return{results:db.prepare(query).all(...params)};},async run(){const r=db.prepare(query).run(...params);return{meta:{changes:Number(r.changes)}};}};return stmt;}
let handle,oldFetch,fetchCalls=[];
const actor={uid:'owner-fixture',email:'owner@example.test'};
async function call(route,body,owner=actor){return handle(new Request('https://kbl.test/api/admin/social/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),route.split('?')[0].split('/'),owner);}
before(async()=>{
 for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8').replaceAll('--> statement-breakpoint',''));
 globalThis.__KBL_SOCIAL_TEST_ENV={...env,DB:{prepare}};
 const{build}=createRequire(fs.realpathSync('node_modules/wrangler/package.json'))('esbuild');
 await build({entryPoints:['lib/kbl/social.ts'],bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/social-fixture.mjs',plugins:[{name:'social-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env = globalThis.__KBL_SOCIAL_TEST_ENV;',loader:'js'}));}}]});
 handle=(await import(path.resolve('.sites-runtime/social-fixture.mjs'))).handleSocialAdmin;
});
test('OAuth callback is one-time, bound to owner/platform/origin and secrets stay encrypted through target selection',async()=>{
 const first=await(await call('oauth/youtube/start',{label:'Channel fixture'})).json(),state=new URL(first.authorizeUrl).searchParams.get('state');
 await assert.rejects(()=>call('oauth/youtube/callback?state='+state+'&code=CODE',undefined,{uid:'other',email:'other@test'}),/khớp/);
 await assert.rejects(()=>call('oauth/threads/callback?state='+state+'&code=CODE'),/khớp/);
 oldFetch=globalThis.fetch;fetchCalls=[];globalThis.fetch=async(url,init)=>{fetchCalls.push({url,init});return String(url).includes('oauth2.googleapis.com')?json({access_token:'YT-PRIVATE',refresh_token:'YT-REFRESH',expires_in:3600,scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'}):json({items:[{id:'channel1',snippet:{title:'Store 1'}},{id:'channel2',snippet:{title:'Store 2'}}]});};
 try{
  const callback=await call('oauth/youtube/callback?state='+state+'&code=CODE');assert.equal(callback.status,303);assert.equal(new URL(callback.headers.get('location')).pathname,'/admin/ket-noi');
  await assert.rejects(()=>call('oauth/youtube/callback?state='+state+'&code=CODE'),/đã dùng/);assert.equal(fetchCalls.length,2);
  const status=await(await call('status')).json();assert.equal(status.connections[0].status,'choose-target');assert.equal(JSON.stringify(status).includes('YT-PRIVATE'),false);
  const choice=await(await call('targets/'+first.connectionId,{targetId:'channel2'})).json();assert.equal(choice.connection.targetId,'channel2');assert.equal(choice.connection.status,'connected');
  assert.equal(db.prepare("SELECT data FROM records WHERE kind='social-connection'").get().data.includes('YT-PRIVATE'),false);
 }finally{globalThis.fetch=oldFetch;}
});

test('refresh lock protects single-use rotating tokens and uncertain refresh requires reconnect',async()=>{
 const id='b'.repeat(32),tokens={accessToken:'ZALO-OLD',refreshToken:'ZALO-REFRESH',expiresAt:Date.now()+60000},vault=await seal({tokens,targets:[{id:'oa1',label:'OA'}],selected:{id:'oa1',label:'OA'}},env.KBL_SOCIAL_ENCRYPTION_KEY,'kbl-social:1:zalo:'+id);
 db.prepare("INSERT INTO records(kind,id,data,created_at,updated_at) VALUES('social-connection',?,?,?,?)").run(id,JSON.stringify({id,platform:'zalo',label:'OA',status:'connected',targetId:'oa1',expiresAt:tokens.expiresAt,vault}),Date.now(),Date.now());
 let finish,started,network=0;const ready=new Promise(r=>{started=r;});const original=globalThis.fetch;
 globalThis.fetch=async()=>{network++;started();return new Promise(resolve=>{finish=resolve;});};
 try{
  const first=call('connections/'+id+'/refresh',{});await ready;
  await assert.rejects(()=>call('connections/'+id+'/refresh',{}),/yêu cầu khác/);assert.equal(network,1);
  finish(json({access_token:'ZALO-NEW',refresh_token:'ZALO-REFRESH-NEW',expires_in:90000}));assert.equal((await first).status,200);
  let row=JSON.parse(db.prepare("SELECT data FROM records WHERE kind='social-connection' AND id=?").get(id).data);
  assert.equal((await unseal(row.vault,env.KBL_SOCIAL_ENCRYPTION_KEY,'kbl-social:1:zalo:'+id)).tokens.refreshToken,'ZALO-REFRESH-NEW');
  globalThis.fetch=async()=>{throw Error('network transport may echo ZALO-REFRESH-NEW');};
  await assert.rejects(()=>call('connections/'+id+'/refresh',{}),error=>!error.message.includes('ZALO-REFRESH-NEW'));
  row=JSON.parse(db.prepare("SELECT data FROM records WHERE kind='social-connection' AND id=?").get(id).data);assert.equal(row.status,'reconnect-required');
  await assert.rejects(()=>call('connections/'+id+'/refresh',{}),/kết nối OAuth lại/);
 }finally{globalThis.fetch=original;}
});

test('customer reply permissions are opt-in and cannot be mistaken for granted scopes',async()=>{
 const ordinary=new URL(await authorization(env,'facebook','state','verifier'));
 const inbox=new URL(await authorization(env,'facebook','state','verifier',{inbox:true}));
 assert.equal(ordinary.searchParams.get('scope').includes('pages_messaging'),false);
 assert.equal(inbox.searchParams.get('scope').includes('pages_messaging'),true);
 const row=publicConnection({id:'test',platform:'facebook',label:'Test',status:'connected',inboxRequested:true,scope:null});
 assert.equal(row.inboxRequested,true);assert.equal(row.scopeVerified,false);
});

test('OAuth start stays on the callback origin and wrong-host Admin must hand off before state is created',async()=>{const count=db.prepare("SELECT COUNT(*) n FROM records WHERE kind='social-state'").get().n;await assert.rejects(()=>handle(new Request('https://alias.test/api/admin/social/oauth/threads/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),['oauth','threads','start'],actor),/đúng địa chỉ/);assert.equal(db.prepare("SELECT COUNT(*) n FROM records WHERE kind='social-state'").get().n,count);});
test('cancelled provider authorization returns to the connections screen without exchanging a token',async()=>{const first=await(await call('oauth/threads/start',{})).json(),state=new URL(first.authorizeUrl).searchParams.get('state');const cancelled=await call('oauth/threads/callback?state='+state+'&error=access_denied');assert.equal(cancelled.status,303);const url=new URL(cancelled.headers.get('location'));assert.equal(url.pathname,'/admin/ket-noi');assert.equal(url.searchParams.get('social'),'cancelled');await assert.rejects(()=>call('oauth/threads/callback?state='+state+'&code=fixture'),/đã dùng/);});
