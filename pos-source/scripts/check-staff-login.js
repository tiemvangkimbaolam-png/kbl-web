'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {createAccess}=require('../commercial-access');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'staff-check-'));
try{
 const store=createAccess(dir);assert(!store.ownerReady());store.setupOwner('owner001','Owner-Strong-123');assert(store.ownerReady());
 assert.throws(()=>store.setupOwner('other','Owner-Strong-123'),/chủ tiệm/);
 store.upsertUser('owner001',{username:'nv01',password:'Employee-123456',role:'VIEWER'});
 const token=store.login('nv01','Employee-123456','local-test'),me=store.session(token);
 assert(me&&me.role==='VIEWER'&&me.permissions.includes('prices.read')&&!me.permissions.includes('prices.write'));
 assert(!store.valid({headers:{cookie:'kbl_access='+token}},'prices.write'));
 assert(store.valid({headers:{cookie:'kbl_access='+token}},'prices.read'));
 store.changePassword(token,'Employee-123456','Employee-NEW-123456');assert(!store.session(token));
 assert.throws(()=>store.login('nv01','Employee-123456','local-test'),/Sai tài khoản/);
 const token2=store.login('nv01','Employee-NEW-123456','local-test');
 store.upsertUser('owner001',{username:'nv01',role:'VIEWER',disabled:true});assert(!store.session(token2));
 console.log('[PASS] Employee login, least privilege, password rotation and revocation.');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
assert(source.includes('nodeIntegration:false,contextIsolation:true,sandbox:true'));
assert(source.includes("/staff-desktop"));
const pkg=require('../package.json');assert(pkg.build.files.includes('commercial-employee-terminal.html'));
console.log('[PASS] Staff restricted browser and packaging.');
