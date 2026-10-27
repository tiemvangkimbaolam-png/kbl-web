// Standalone commercial LAN access store. Never imports legacy POS files.
'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const ROLES={OWNER:['prices.read','prices.write','pawn.read','pawn.write','identity.upload','staff.manage'],MANAGER:['prices.read','pawn.read','identity.upload'],CASHIER:['prices.read','pawn.read','identity.upload'],VIEWER:['prices.read']};
function createAccess(dir){
 const file=path.join(dir,'commercial-access.json');
 const sessions=new Map();
 const failures=new Map();
 const secret=crypto.randomBytes(32);
 const hash=(password,salt)=>crypto.pbkdf2Sync(String(password),salt,180000,32,'sha256').toString('hex');
 function read(){try{const obj=JSON.parse(fs.readFileSync(file,'utf8'));return obj&&Array.isArray(obj.users)?obj:{users:[],audit:[]}}catch(_){return {users:[],audit:[]}}}
 function save(state){fs.mkdirSync(dir,{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,file)}
 function audit(state,actor,action,subject=''){state.audit.push({at:new Date().toISOString(),actor,action,subject});if(state.audit.length>2000)state.audit=state.audit.slice(-2000)}
 function auditEvent(actor,action,subject=''){const state=read();audit(state,String(actor||'unknown'),String(action||'event'),String(subject||'').slice(0,800));save(state)}
 function auditRows(){return read().audit.slice(-80).reverse()}
 function ownerReady(){return read().users.some(u=>u.role==='OWNER'&&!u.disabled)}
 function validateName(name){const x=String(name||'').trim().toLowerCase();if(!/^[a-z0-9._-]{3,32}$/.test(x))throw Error('Tên đăng nhập 3–32 ký tự, a-z, 0-9, dấu ._-');return x}
 function validatePassword(value){const x=String(value||'');if(x.length<10||x.length>128)throw Error('Mật khẩu phải có 10–128 ký tự.');return x}
 function setupOwner(name,password){const state=read();if(state.users.some(u=>u.role==='OWNER'))throw Error('Đã thiết lập tài khoản chủ tiệm.');const username=validateName(name), pass=validatePassword(password),salt=crypto.randomBytes(16).toString('hex');state.users.push({username,role:'OWNER',salt,hash:hash(pass,salt),disabled:false,permissions:ROLES.OWNER});audit(state,username,'OWNER_SETUP');save(state);return {username}}
 function listUsers(){return read().users.map(({username,role,disabled,permissions})=>({username,role,disabled,permissions}))}
 function upsertUser(actor,entry){const state=read();const username=validateName(entry.username);const role=String(entry.role||'').toUpperCase();if(role==='OWNER'||!ROLES[role])throw Error('Chỉ thêm/sửa tài khoản nhân viên tại đây.');let user=state.users.find(x=>x.username===username);if(user?.role==='OWNER')throw Error('Không thay đổi chủ tiệm.');const permissions=(Array.isArray(entry.permissions)?entry.permissions:ROLES[role]).filter(x=>ROLES.OWNER.includes(x)&&x!=='staff.manage');if(!user){const pw=validatePassword(entry.password);const salt=crypto.randomBytes(16).toString('hex');user={username,role,salt,hash:hash(pw,salt),disabled:false,permissions};state.users.push(user)}else{user.role=role;user.permissions=permissions;user.disabled=Boolean(entry.disabled);if(entry.password){const pw=validatePassword(entry.password);user.salt=crypto.randomBytes(16).toString('hex');user.hash=hash(pw,user.salt)}}audit(state,actor,'STAFF_UPSERT',username);save(state);for(const [key,s] of sessions)if(s.username===username)sessions.delete(key);return listUsers()}
 function login(username,password,ip){const key=String(ip||'unknown'),now=Date.now(),bad=failures.get(key)||{count:0,until:0};if(bad.until>now)throw Error('Thử lại sau 5 phút.');const state=read();const user=state.users.find(u=>u.username===String(username||'').trim().toLowerCase()&&!u.disabled);const fakeSalt='00000000000000000000000000000000';const computed=hash(String(password||''),user?.salt||fakeSalt);const a=Buffer.from(computed,'hex'),b=Buffer.from(user?.hash||'0'.repeat(64),'hex');if(!user||a.length!==b.length||!crypto.timingSafeEqual(a,b)){bad.count++;if(bad.count>=5){bad.until=now+300000;bad.count=0}failures.set(key,bad);throw Error('Sai tài khoản hoặc mật khẩu.')}failures.delete(key);const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{username:user.username,expires:now+8*3600000});audit(state,user.username,'REMOTE_LOGIN');save(state);return token}
 function session(token){const s=sessions.get(String(token||''));if(!s)return null;if(s.expires<Date.now()){sessions.delete(token);return null}const u=read().users.find(u=>u.username===s.username&&!u.disabled);if(!u){sessions.delete(token);return null}return {username:u.username,role:u.role,permissions:u.permissions||ROLES[u.role]||[]}}
 function logout(token){sessions.delete(String(token||''))}
 function changePassword(token,current,next){
  const actor=session(token);if(!actor)throw Error('Phiên đăng nhập hết hạn.');
  const state=read();const user=state.users.find(u=>u.username===actor.username&&!u.disabled);
  if(!user)throw Error('Tài khoản không tồn tại.');
  const computed=hash(current,user.salt);
  if(!crypto.timingSafeEqual(Buffer.from(computed,'hex'),Buffer.from(user.hash,'hex')))throw Error('Mật khẩu hiện tại không đúng.');
  const pass=validatePassword(next);if(pass===String(current))throw Error('Mật khẩu mới phải khác mật khẩu cũ.');
  user.salt=crypto.randomBytes(16).toString('hex');user.hash=hash(pass,user.salt);
  audit(state,user.username,'PASSWORD_CHANGE');save(state);
  for(const [key,entry] of sessions)if(entry.username===user.username)sessions.delete(key);
  return {success:true};
 }

 function verifyLocalOwner(username,password){const state=read(),u=state.users.find(x=>x.username===String(username||'').trim().toLowerCase()&&x.role==='OWNER'&&!x.disabled);if(!u)return false;const v=hash(String(password||''),u.salt);return crypto.timingSafeEqual(Buffer.from(v,'hex'),Buffer.from(u.hash,'hex'))}
 function cookie(req){const raw=String(req.headers.cookie||'');const m=raw.match(/(?:^|;\s*)kbl_access=([a-f0-9]{64})(?:;|$)/);return m?m[1]:''}
 function valid(req,permission){const client=session(cookie(req));return client&&client.permissions.includes(permission)?client:null}
 return {ownerReady,setupOwner,listUsers,upsertUser,login,session,logout,changePassword,verifyLocalOwner,cookie,valid,auditEvent,auditRows};
}
module.exports={createAccess,ROLES};
