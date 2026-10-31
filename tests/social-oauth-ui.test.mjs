import {test} from 'node:test';import assert from 'node:assert/strict';
import {beginOAuth,oauthIntent} from '../app/components/social-oauth.mjs';
import {adminCallbackRedirect} from '../lib/kbl/social-core.mjs';
test('an Admin on the workers.dev host starts OAuth there instead of navigating to an unprotected alias',async()=>{
 const calls=[],url='https://threads.net/oauth/authorize?client_id=fixture&state=fixture-state';
 await beginOAuth({platform:'threads',baseUrl:'https://kbl.test',currentUrl:'https://worker.test/admin/ket-noi?unrelated=private',enableInbox:true},{start:async(p,v)=>{calls.push([p,v]);return{authorizeUrl:url};},ready:u=>calls.push(['ready',u]),navigate:u=>calls.push(['navigate',u])});
 assert.deepEqual(calls,[['threads',{enableInbox:true}],['ready',url],['navigate',url]]);
});
test('a public callback without an Access session is forwarded only to the admin origin',()=>{
 const env={KBL_ADMIN_ORIGIN:'https://admin.test'},state='a'.repeat(64);
 const request=(path,headers={})=>new Request('https://kbl.test'+path,{headers});
 const redirected=adminCallbackRedirect(request('/api/admin/social/oauth/instagram/callback?state='+state+'&code=CODE&extra=drop',{}),env);
 assert.equal(redirected.status,302);const target=new URL(redirected.headers.get('location'));
 assert.equal(target.origin,'https://admin.test');assert.equal(target.pathname,'/api/admin/social/oauth/instagram/callback');
 assert.deepEqual([...target.searchParams],[['state',state],['code','CODE']]);
 assert.equal(adminCallbackRedirect(request('/api/admin/social/oauth/instagram/callback?state='+state,{cookie:'CF_Authorization=token'}),env),null);
 assert.equal(adminCallbackRedirect(request('/api/admin/social/oauth/instagram/callback?state='+state,{'cf-access-jwt-assertion':'token'}),env),null);
 assert.equal(adminCallbackRedirect(request('/api/admin/social/oauth/instagram/callback?state=short'),env),null);
 assert.equal(adminCallbackRedirect(new Request('https://admin.test/api/admin/social/oauth/instagram/callback?state='+state),env),null);
 assert.equal(adminCallbackRedirect(new Request('https://kbl.test/api/admin/social/oauth/instagram/callback?state='+state,{method:'POST'}),env),null);
 assert.equal(adminCallbackRedirect(request('/api/admin/social/oauth/other/callback?state='+state),env),null);
});
test('canonical Admin starts the JSON owner route and opens the exact provider authorization URL',async()=>{
 const calls=[],url='https://threads.net/oauth/authorize?client_id=fixture&state=fixture-state&redirect_uri=https%3A%2F%2Fkbl.test%2Fapi%2Fadmin%2Fsocial%2Foauth%2Fthreads%2Fcallback';
 await beginOAuth({platform:'threads',baseUrl:'https://kbl.test',currentUrl:'https://kbl.test/admin/ket-noi',enableInbox:true},{start:async(p,v)=>{calls.push([p,v]);return{authorizeUrl:url};},ready:u=>calls.push(['ready',u]),navigate:u=>calls.push(['navigate',u])});
 assert.deepEqual(calls,[['threads',{enableInbox:true}],['ready',url],['navigate',url]]);
});
test('server/auth failures surface without navigating or silently retrying',async()=>{
 let requests=0,navigations=0;
 await assert.rejects(()=>beginOAuth({platform:'youtube',baseUrl:'https://kbl.test',currentUrl:'https://kbl.test/admin/ket-noi'},{start:async()=>{requests++;throw Error('Phiên đăng nhập cần xác nhận lại.');},navigate:()=>navigations++}),/xác nhận lại/);
 assert.equal(requests,1);assert.equal(navigations,0);
});
test('handoff intent is allowlisted, carries the explicit inbox choice and removes only its own parameters',()=>{
 assert.deepEqual(oauthIntent('https://kbl.test/admin/ket-noi?keep=1&connect=instagram&inbox=0#here'),{platform:'instagram',enableInbox:false,cleanUrl:'/admin/ket-noi?keep=1#here'});
 assert.equal(oauthIntent('https://kbl.test/admin/ket-noi'),null);assert.throws(()=>oauthIntent('https://kbl.test/admin/ket-noi?connect=unknown'));
});
test('invalid callback origins and unexpected authorization hosts cannot become a redirect',async()=>{
 for(const baseUrl of ['http://kbl.test','https://kbl.test/other','https://user:pass@kbl.test'])await assert.rejects(()=>beginOAuth({platform:'threads',baseUrl,currentUrl:'https://kbl.test'},{start:()=>assert.fail(),navigate:()=>assert.fail()}));
 for(const authorizeUrl of ['', 'javascript:alert(1)','https://unrelated.test/oauth'])await assert.rejects(()=>beginOAuth({platform:'threads',baseUrl:'https://kbl.test',currentUrl:'https://kbl.test'},{start:async()=>({authorizeUrl}),navigate:()=>assert.fail()}),/trang cấp quyền/);
});
