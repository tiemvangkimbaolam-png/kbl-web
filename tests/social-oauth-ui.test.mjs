import {test} from 'node:test';import assert from 'node:assert/strict';
import {beginOAuth,oauthIntent} from '../app/components/social-oauth.mjs';
test('an Admin alias navigates to the callback domain without starting OAuth or transferring any credential',async()=>{
 const urls=[];let calls=0;
 await beginOAuth({platform:'threads',baseUrl:'https://kbl.test',currentUrl:'https://worker.test/admin/ket-noi?unrelated=private',enableInbox:true},{start:async()=>{calls++;},navigate:u=>urls.push(u)});
 assert.equal(calls,0);assert.equal(urls.length,1);const target=new URL(urls[0]);assert.equal(target.origin,'https://kbl.test');assert.equal(target.pathname,'/admin/ket-noi');assert.deepEqual([...target.searchParams],[['connect','threads'],['inbox','1']]);
 assert.deepEqual(oauthIntent(target.href),{platform:'threads',enableInbox:true,cleanUrl:'/admin/ket-noi'});
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
