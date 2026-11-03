import {env} from 'cloudflare:workers';
import * as S from './store';
const E=()=>env as any,fail=(m:string,s=400)=>{throw Object.assign(Error(m),{status:s});};
export const customerJSON=(v:any,status=200,headers:any={})=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
export function normalizePhone(value:any){const s=String(value||'').replace(/[\s()-]/g,'').replace(/^\+84/,'0');if(!/^0\d{9}$/.test(s))fail('Nhập số điện thoại Việt Nam gồm 10 số.');return s;}
const master=()=>{const e=E(),key=e.KBL_CUSTOMER_AUTH_PEPPER||e.KBL_SOCIAL_ENCRYPTION_KEY||e.KBL_PRICE_ENCRYPTION_KEY;if(!key||key.length<32)fail('Cửa hàng chưa cấu hình khóa bảo vệ tài khoản khách.',503);return key;};
async function passwordHash(password:string,salt:string){const encoder=new TextEncoder(),pepper=await crypto.subtle.importKey('raw',encoder.encode(master()),{name:'HMAC',hash:'SHA-256'},false,['sign']);const secret=await crypto.subtle.sign('HMAC',pepper,encoder.encode('KBL-CUSTOMER-PASSWORD\0'+password));const key=await crypto.subtle.importKey('raw',secret,'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256);return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('');}
const equal=(a:string,b:string)=>{let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return n===0;};
const password=(v:any)=>{if(typeof v!=='string'||v.length<12||v.length>128)fail('Mật khẩu cần từ 12 đến 128 ký tự.');return v;};
export async function customer(req:Request,required=true){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)__Host-kbl_customer=([a-f0-9]{64})(?:;|$)/)?.[1];const session=token?await S.get('customer-session',await S.sha(token)):null;const c=session?await S.get('customer',session.customerId):null;if(!c||session.expiresAt<Date.now()||session.authVersion!==c.authVersion){if(required)fail('Đăng nhập tài khoản khách để tiếp tục.',401);return null;}return c;}
export function safeCustomer(c:any){return c?{id:c.id,name:c.name,phone:c.phone,phoneVerified:c.phoneVerified===true,quota:c.quota||5,used:c.used||0,remaining:Math.max(0,(c.quota||5)-(c.used||0)),purchased:c.purchased===true}:null;}
export async function customerRate(req:Request,kind:string,max=15,identity=''){const slot=Math.floor(Date.now()/3600000),id=await S.sha((identity||req.headers.get('cf-connecting-ip')||'unknown')+':'+kind+':'+slot);const r=await S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) VALUES('customer-rate',?,'1',?,?) ON CONFLICT(kind,id) DO UPDATE SET data=CAST(CAST(records.data AS INTEGER)+1 AS TEXT) RETURNING data").bind(id,Date.now(),Date.now()).first<any>();if(Number(r.data)>max)fail('Đã thử nhiều lần; vui lòng chờ rồi thử lại.',429);}
export async function customerBody(req:Request,max=20000){if(!req.headers.get('content-type')?.includes('application/json'))fail('Cần JSON.',415);const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)fail('Nguồn yêu cầu không hợp lệ.',403);const str=await req.text();if(str.length>max)fail('Dữ liệu quá lớn.',413);return JSON.parse(str);}
async function loginCookie(c:any){const token=S.randomToken();await S.put('customer-session',await S.sha(token),{customerId:c.id,authVersion:c.authVersion,expiresAt:Date.now()+30*86400000});return '__Host-kbl_customer='+token+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000';}
const smsReady=()=>!!(E().TWILIO_ACCOUNT_SID&&E().TWILIO_AUTH_TOKEN&&E().TWILIO_VERIFY_SERVICE_SID);
async function sms(route:string,fields:any){const e=E();if(!smsReady())fail('Chưa có dịch vụ SMS. Liên hệ cửa hàng để xác minh và nhận mã khôi phục.',503);const r=await fetch('https://verify.twilio.com/v2/Services/'+encodeURIComponent(e.TWILIO_VERIFY_SERVICE_SID)+'/'+route,{redirect:'error',method:'POST',headers:{Authorization:'Basic '+btoa(e.TWILIO_ACCOUNT_SID+':'+e.TWILIO_AUTH_TOKEN),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields),signal:AbortSignal.timeout(10000)});if(!r.ok)fail('Chưa xác minh được SMS; kiểm tra mã hoặc liên hệ cửa hàng.',502);return await r.json() as any;}
export async function handleCustomer(req:Request,path:string[]){
 if(req.method==='GET'&&(!path[0]||path[0]==='me'))return customerJSON({customer:safeCustomer(await customer(req,false)),smsReady:smsReady()});
 if(req.method!=='POST')return customerJSON({message:'Không có chức năng này.'},404);
 const v=await customerBody(req);await customerRate(req,path[0],path[0]==='register'?3:15);
 if(path[0]==='logout'){const token=req.headers.get('cookie')?.match(/__Host-kbl_customer=([a-f0-9]{64})/)?.[1];if(token)await S.sql().prepare("DELETE FROM records WHERE kind='customer-session' AND id=?").bind(await S.sha(token)).run();return customerJSON({ok:true},200,{'Set-Cookie':'__Host-kbl_customer=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'});}
 const phone=normalizePhone(v.phone),id=await S.sha('KBL-CUSTOMER:'+phone);await customerRate(req,'phone-'+path[0],5,id);const c=await S.get('customer',id);
 if(path[0]==='register'){
  const pass=password(v.password),name=String(v.name||'').trim().slice(0,100);if(name.length<2)fail('Nhập tên khách hàng.');if(v.consent!==true)fail('Cần đồng ý điều khoản tài khoản.');const salt=S.randomToken(),at=Date.now(),data={name,phone,salt,passwordHash:await passwordHash(pass,salt),authVersion:1,quota:5,used:0,phoneVerified:false};
  const r=await S.sql().prepare("INSERT OR IGNORE INTO records(kind,id,data,created_at,updated_at) SELECT 'customer',?,?,?,? WHERE (SELECT COUNT(*) FROM records WHERE kind='customer')<5000").bind(id,JSON.stringify(data),at,at).run();if(r.meta.changes!==1)fail('Số điện thoại đã có tài khoản hoặc cửa hàng đang tạm ngừng đăng ký.',409);return customerJSON({customer:safeCustomer({id,...data})},201,{'Set-Cookie':await loginCookie({id,...data})});
 }
 if(path[0]==='login'){
  if(typeof v.password!=='string'||v.password.length>128)fail('Thông tin đăng nhập không đúng.',401);const hash=await passwordHash(v.password,c?.salt||'missing-account-salt');if(!c||!equal(hash,c.passwordHash))fail('Số điện thoại hoặc mật khẩu không đúng.',401);return customerJSON({customer:safeCustomer(c)},200,{'Set-Cookie':await loginCookie(c)});
 }
 if(path[0]==='reset-start'){if(!smsReady())fail('Chưa có SMS tự động. Liên hệ cửa hàng để xác minh và nhận mã khôi phục.',503);if(c)await sms('Verifications',{To:'+84'+phone.slice(1),Channel:'sms'});return customerJSON({message:'Nếu số điện thoại có tài khoản, mã xác minh sẽ được gửi qua SMS.'});}
 if(path[0]==='reset-finish'){
  const pass=password(v.password);if(!/^\d{6,8}$/.test(String(v.code||'')))fail('Nhập mã xác minh hợp lệ.');const local=await S.get('customer-reset',id);let approved=false;
  if(local&&local.expiresAt>Date.now()&&local.hash===await S.sha(id+':'+v.code)){
   const used=await S.sql().prepare("DELETE FROM records WHERE kind='customer-reset' AND id=? AND version=? AND json_extract(data,'$.hash')=? RETURNING id").bind(id,local.version,local.hash).first<any>();approved=!!used;
  } else if(smsReady()){const checked=await sms('VerificationCheck',{To:'+84'+phone.slice(1),Code:String(v.code)});approved=checked.status==='approved';}
  if(!approved||!c)fail('Mã không đúng hoặc đã hết hạn.',400);const salt=S.randomToken();await S.put('customer',id,{...c,salt,passwordHash:await passwordHash(pass,salt),authVersion:c.authVersion+1,phoneVerified:true},c.version);return customerJSON({message:'Đã đặt mật khẩu mới. Hãy đăng nhập lại.'});
 }
 return customerJSON({message:'Không có chức năng này.'},404);
}
