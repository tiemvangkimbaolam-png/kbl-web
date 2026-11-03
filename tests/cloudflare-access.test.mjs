import { test, before } from 'node:test';
import a from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { createAccessGate } from '../lib/kbl/cloudflare-access.mjs';
const env = { CF_ACCESS_TEAM_DOMAIN: 'https://kbl-fixture.cloudflareaccess.com', CF_ACCESS_AUD: 'a'.repeat(64), OWNER_EMAIL: 'vlam1881997@gmail.com' };
let privateKey, gate;
before(async()=>{ const pair=await generateKeyPair('RS256');privateKey=pair.privateKey;const jwk=await exportJWK(pair.publicKey);jwk.kid='fixture-key';gate=createAccessGate({keys:team=>{a.equal(team,env.CF_ACCESS_TEAM_DOMAIN);return createLocalJWKSet({keys:[jwk]});}}); });
const req=(path,headers={})=>new Request('https://kbl.test'+path,{headers});
const jwt=(claims={},header={})=>new SignJWT({type:'app',email:env.OWNER_EMAIL,...claims}).setProtectedHeader({alg:'RS256',kid:'fixture-key',...header}).setIssuer(env.CF_ACCESS_TEAM_DOMAIN).setAudience(env.CF_ACCESS_AUD).setSubject('verified-owner').setIssuedAt().setExpirationTime('1h').sign(privateKey);
test('direct Cloudflare entry drops forged Sites identity on every path and fails closed before Access is configured',async()=>{
 const fake={'oai-authenticated-user-id':'forged','oai-authenticated-user-email':env.OWNER_EMAIL};
 let r=await gate(req('/api/admin/state',fake),env);a.ok(r instanceof Response);a.equal(r.status,401);
 r=await gate(req('/api/public/catalog',fake),env);a.ok(r instanceof Request);a.equal(r.headers.has('oai-authenticated-user-id'),false);
 r=await gate(req('/api/media/private-fixture',fake),env);a.equal(r.headers.has('oai-authenticated-user-email'),false);
 a.equal((await gate(req('/admin'),{})).status,503);a.ok(await gate(req('/api/health'),{}) instanceof Request);
});
test('only a cryptographically verified owner application JWT grants identity; browser cookies cover same-origin private images',async()=>{
 const token=await jwt();let r=await gate(req('/admin',{'cf-access-jwt-assertion':token}),env);a.ok(r instanceof Request);a.equal(r.headers.get('oai-authenticated-user-id'),'verified-owner');a.equal(r.headers.get('oai-authenticated-user-email'),env.OWNER_EMAIL);a.equal(r.headers.has('cf-access-jwt-assertion'),false);
 r=await gate(req('/api/media/private-fixture',{cookie:'CF_Authorization='+token}),env);a.equal(r.headers.get('oai-authenticated-user-email'),env.OWNER_EMAIL);
 r=await gate(req('/api/admin/state',{cookie:'CF_Authorization='+token+'; CF_Authorization=other'}),env);a.equal(r.status,401);
});
test('wrong audience, issuer, signature, expired session, wrong owner and org token cannot open Admin',async()=>{
 const now=Math.floor(Date.now()/1000);
 const invalid=[await jwt({email:'other@example.test'}),await jwt({type:'org'}),await new SignJWT({type:'app',email:env.OWNER_EMAIL}).setProtectedHeader({alg:'RS256',kid:'fixture-key'}).setIssuer(env.CF_ACCESS_TEAM_DOMAIN).setAudience('wrong').setSubject('owner').setIssuedAt().setExpirationTime('1h').sign(privateKey),await new SignJWT({type:'app',email:env.OWNER_EMAIL}).setProtectedHeader({alg:'RS256',kid:'fixture-key'}).setIssuer('https://evil.example').setAudience(env.CF_ACCESS_AUD).setSubject('owner').setIssuedAt().setExpirationTime('1h').sign(privateKey),await new SignJWT({type:'app',email:env.OWNER_EMAIL}).setProtectedHeader({alg:'RS256',kid:'fixture-key'}).setIssuer(env.CF_ACCESS_TEAM_DOMAIN).setAudience(env.CF_ACCESS_AUD).setSubject('owner').setIssuedAt(now-200).setExpirationTime(now-100).sign(privateKey)];
 const good=await jwt(),parts=good.split('.');parts[1]=Buffer.from(JSON.stringify({email:env.OWNER_EMAIL,sub:'forged',exp:now+3600,type:'app',iss:env.CF_ACCESS_TEAM_DOMAIN,aud:[env.CF_ACCESS_AUD]})).toString('base64url');invalid.push(parts.join('.'));
 for(const token of invalid)a.equal((await gate(req('/api/admin/state',{'cf-access-jwt-assertion':token}),env)).status,401);
});
test('login redirects stay within Admin and no public/worker endpoint is placed behind an owner challenge',async()=>{
 let r=await gate(req('/signin-with-chatgpt?return_to=https://evil.example'),env);a.equal(r.status,303);a.equal(r.headers.get('location'),'https://kbl.test/admin');
 r=await gate(req('/signin-with-chatgpt?return_to='+encodeURIComponent('/admin/ket-noi')),env);a.equal(r.headers.get('location'),'https://kbl.test/admin/ket-noi');
 for(const path of ['/api/worker/heartbeat','/api/public/catalog','/tra-cuu','/bao-hanh/fixture'])a.ok(await gate(req(path),env) instanceof Request);
 a.equal((await gate(req('/signout-with-chatgpt'),env)).headers.get('location'),'https://kbl.test/cdn-cgi/access/logout');
 const bad={...env,CF_ACCESS_TEAM_DOMAIN:'https://kbl-fixture.cloudflareaccess.com.evil.test'};a.equal((await gate(req('/admin'),bad)).status,503);
});
