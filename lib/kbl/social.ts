import {socialEnvironment,saveSocialApplication} from './social-config';
import * as S from './store';
import { SOCIAL_PROVIDERS, random, digest, seal, unseal, authorization, exchange, configFor, publicBase, targetList, publicConnection, safeTargets, providerJSON } from './social-core.mjs';
const registry:any=SOCIAL_PROVIDERS;
const reply=(value:any,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message:string,status=400)=>{throw Object.assign(Error(message),{status});};
const platformOf=(value:string)=>{if(!Object.hasOwn(SOCIAL_PROVIDERS,value))fail('Nền tảng không hợp lệ.');return value;};
const validId=(value:any)=>{if(typeof value!=='string'||!/^[a-f0-9]{32}$/.test(value))fail('Mã kết nối không hợp lệ.');return value;};
const aad=(id:string,platform:string)=>'kbl-social:1:'+platform+':'+id;
async function input(req:Request){if(!req.headers.get('content-type')?.includes('application/json'))fail('Cần JSON.',415);const text=await req.text();if(text.length>12000)fail('Dữ liệu quá lớn.',413);try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))fail('Cần đối tượng JSON.');return value;}catch{fail('JSON không hợp lệ.');}}
const label=(value:any,fallback:string)=>typeof value==='string'&&value.trim()?value.trim().slice(0,100):fallback;
async function secret(row:any){return unseal(row.vault,(await socialEnvironment()).KBL_SOCIAL_ENCRYPTION_KEY,aad(row.id,row.platform));}
async function saveSecret(row:any,value:any,version?:number){return S.put('social-connection',row.id,{...row,vault:await seal(value,(await socialEnvironment()).KBL_SOCIAL_ENCRYPTION_KEY,aad(row.id,row.platform))},version);}
async function connection(id:string){const row=await S.get('social-connection',validId(id));if(!row||row.status==='disconnected')fail('Kết nối không còn hoạt động.',404);return row;}
export async function socialStatus(){return(await S.list('social-connection',100)).map(publicConnection);}
async function refreshConnection(row:any){
 const at=Date.now(),locked=await S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) VALUES('social-lock',?, ?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at WHERE CAST(records.data AS INTEGER)<? RETURNING id").bind(row.id,String(at+60000),at,at,at).first();
 if(!locked)fail('Kết nối đang được làm mới ở yêu cầu khác.',409);
 try{
  row=await connection(row.id);if(row.status==='reconnect-required')fail('Cần kết nối OAuth lại trước khi sử dụng token.',409);
  const value=await secret(row);
  if(!value.tokens?.refreshToken){await S.put('social-connection',row.id,{...row,status:'reconnect-required',lastError:'Cần cấp lại quyền OAuth; nền tảng không cấp refresh token.'},row.version);fail('Nền tảng này cần kết nối OAuth lại; không có refresh token.',409);}
  try{const tokens=await exchange((await socialEnvironment()),row.platform,{refreshToken:value.tokens.refreshToken});const saved=await saveSecret({...row,status:row.targetId?'connected':'choose-target',expiresAt:tokens.expiresAt,scope:tokens.scope||row.scope,lastError:null},{...value,tokens:{...value.tokens,...tokens}},row.version);return publicConnection(saved);}
  catch(error){await S.put('social-connection',row.id,{...row,status:'reconnect-required',lastError:'Làm mới chưa được xác nhận. Kết nối lại để tránh dùng refresh token đã xoay.'},row.version);throw error;}
 }finally{await S.sql().prepare("DELETE FROM records WHERE kind='social-lock' AND id=? AND data=?").bind(row.id,String(at+60000)).run();}
}
// Called exclusively after authenticated owner checks in api.ts. Every write is
// same-origin JSON; callback is GET with a single-use state bound to owner UID.
export async function handleSocialAdmin(req:Request,path:string[],actor:{uid:string,email:string}):Promise<Response>{
 const config=await socialEnvironment(),u=new URL(req.url),method=req.method;
 if(method==='POST'&&path[0]==='applications'&&path[1])return reply(await saveSocialApplication(platformOf(path[1]),await input(req)));
 if(method==='GET'&&(!path.length||path[0]==='status'))return reply({connections:await socialStatus()});
 if(method==='GET'&&path[0]==='providers'){
  const base=publicBase(config),keyReady=/^[a-f0-9]{64}$/.test(config.KBL_SOCIAL_ENCRYPTION_KEY||'');
  return reply({baseUrl:base,encryptionReady:keyReady,providers:Object.entries(SOCIAL_PROVIDERS).map(([id,p]:any)=>{let configured=id==='telegram'?keyReady:false;if(id!=='telegram')try{configFor(config,id);configured=keyReady;}catch{}const required=id==='telegram'?['KBL_SOCIAL_ENCRYPTION_KEY']:[p.client,p.secret,'KBL_SOCIAL_ENCRYPTION_KEY',...(['facebook','instagram'].includes(id)?['KBL_META_GRAPH_VERSION']:[])];const missing=required.filter((name:string)=>name==='KBL_SOCIAL_ENCRYPTION_KEY'?!keyReady:!config[name]);return{id,label:p.label,configured,required,missing,application:id==='telegram'?null:{clientId:config[p.client]||'',hasSecret:!!config[p.secret],graphVersion:['facebook','instagram'].includes(id)?config.KBL_META_GRAPH_VERSION||'':null,sharedWith:['facebook','instagram'].includes(id)?'Facebook và Instagram dùng chung ứng dụng Meta.':null},scopes:p.scopes,callback:id==='telegram'?null:base+'/api/admin/social/oauth/'+id+'/callback',mode:id==='telegram'?'bot-token':'oauth',limitations:id==='tiktok'?'Cần preview, quyền, privacy và đồng ý trước mỗi lần đăng; audit riêng.':id==='zalo'?'OA và tin theo mẫu có quyền/gói/phí riêng.':id==='youtube'?'OAuth không thay kiểm toán upload/public.':null};})});
 }
 if(path[0]==='oauth'&&path[1]){
  const platform=platformOf(path[1]);if(platform==='telegram')fail('Telegram sử dụng bot token, không dùng OAuth.');
  if(method==='POST'&&path[2]==='start'){
   if(u.origin!==publicBase(config))fail('Mở Admin đúng địa chỉ KBL_PUBLISHER_PUBLIC_BASE_URL trước khi kết nối OAuth.',409);
   const body=await input(req),id=body.connectionId?validId(body.connectionId):S.id(),old=await S.get('social-connection',id);
   if(old&&old.platform!==platform)fail('Kết nối thuộc nền tảng khác.',409);
   if(!old&&(await S.list('social-connection',101)).length>=100)fail('Đã đủ 100 kết nối; ngắt kết nối cũ trước.',507);
   const state=random(),verifier=random(),stateId=await digest(state),authorizeUrl=await authorization(config,platform,state,verifier,{inbox:body.enableInbox===true});
   const pending={platform,id,owner:actor.uid,expiresAt:Date.now()+600000,origin:u.origin,label:label(body.label,old?.label||registry[platform].label),inboxRequested:body.enableInbox===true,appHash:await digest(JSON.stringify([config[registry[platform].client],config[registry[platform].secret],config.KBL_META_GRAPH_VERSION||''])),verifier};
   await S.sql().prepare("DELETE FROM records WHERE kind='social-state' AND updated_at<?").bind(Date.now()-600000).run();
   await S.put('social-state',stateId,{expiresAt:pending.expiresAt,vault:await seal(pending,config.KBL_SOCIAL_ENCRYPTION_KEY,'kbl-social-state:'+stateId)});
   return reply({authorizeUrl,connectionId:id,expiresAt:pending.expiresAt});
  }
  if(method==='GET'&&path[2]==='callback'){
   const state=u.searchParams.get('state')||'';if(!/^[a-f0-9]{64}$/.test(state))fail('Mã trạng thái OAuth không hợp lệ.');
   const stateId=await digest(state),record=await S.get('social-state',stateId);if(!record)fail('Yêu cầu OAuth hết hạn hoặc đã dùng.',409);
   const pending=await unseal(record.vault,config.KBL_SOCIAL_ENCRYPTION_KEY,'kbl-social-state:'+stateId);
   if(pending.owner!==actor.uid||pending.platform!==platform||pending.origin!==u.origin||pending.expiresAt<Date.now())fail('Phiên OAuth không khớp tài khoản/địa chỉ hoặc hết hạn.',403);
   if(pending.appHash&&pending.appHash!==await digest(JSON.stringify([config[registry[platform].client],config[registry[platform].secret],config.KBL_META_GRAPH_VERSION||''])))fail('Cấu hình ứng dụng đã đổi; bắt đầu OAuth lại.',409);
   const taken=await S.sql().prepare("DELETE FROM records WHERE kind='social-state' AND id=? RETURNING id").bind(stateId).first();if(!taken)fail('Callback này đã được xử lý.',409);
   if(u.searchParams.has('error'))return Response.redirect(u.origin+'/admin?social=cancelled',303);
   const code=u.searchParams.get('code');if(!code||code.length>4096)fail('Chưa nhận được mã OAuth hợp lệ.');
   try{
    const tokens=await exchange(config,platform,{code,verifier:pending.verifier}),targets=await targetList(config,platform,tokens);
    const old=await S.get('social-connection',pending.id),target=targets.length===1?targets[0]:null;
    await saveSecret({id:pending.id,platform,label:pending.label,inboxRequested:pending.inboxRequested===true,status:target?'connected':'choose-target',targetId:target?.id||null,targetLabel:target?.label||null,expiresAt:tokens.expiresAt,scope:tokens.scope,connectedAt:Date.now(),lastError:null},{tokens,targets,selected:target},old?.version);
    return Response.redirect(u.origin+'/admin?social=connected&connection='+pending.id,303);
   }catch(error){return Response.redirect(u.origin+'/admin?social=failed',303);}
  }
 }
 if(path[0]==='targets'&&path[1]){
  const row=await connection(path[1]),value=await secret(row);
  if(method==='GET')return reply({connection:publicConnection(row),targets:safeTargets(value.targets||[])});
  if(method==='POST'){
   const body=await input(req),target=(value.targets||[]).find((x:any)=>x.id===body.targetId);if(!target)fail('Đích chưa được cấp quyền; kết nối lại để đọc danh sách mới.',409);
   const saved=await saveSecret({...row,status:'connected',targetId:target.id,targetLabel:target.label,lastError:null},{...value,selected:target},row.version);return reply({connection:publicConnection(saved)});
  }
 }
 if(path[0]==='connections'&&path[1]){
  const row=await connection(path[1]);
  if(method==='POST'&&path[2]==='refresh')return reply({connection:await refreshConnection(row)});
  if(method==='DELETE'){
   await S.sql().prepare("DELETE FROM records WHERE kind='social-connection' AND id=? AND version=?").bind(row.id,row.version).run();
   return reply({success:true,localCredentialsRemoved:true,providerRevocationRequired:true,message:'Đã xóa khóa tại website. Gỡ quyền ứng dụng tại nền tảng nếu muốn thu hồi phía nhà cung cấp.'});
  }
 }
 if(method==='POST'&&path[0]==='telegram'){
  if((await S.list('social-connection',101)).length>=100)fail('Đã đủ 100 kết nối; ngắt kết nối cũ trước.',507);
  const body=await input(req);if(typeof body.token!=='string'||!/^\d{5,16}:[A-Za-z0-9_-]{25,100}$/.test(body.token)||typeof body.chatId!=='string'||!/^(@[A-Za-z0-9_]{5,64}|-?\d{3,24})$/.test(body.chatId))fail('Bot token hoặc Chat ID không đúng định dạng.');
  const token=body.token,chatId=body.chatId,call=(route:string,data:any)=>providerJSON('https://api.telegram.org/bot'+token+'/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const me=await call('getMe',{}),chat=await call('getChat',{chat_id:chatId}),member=await call('getChatMember',{chat_id:chatId,user_id:me.result.id});
  if(['left','kicked'].includes(member.result.status)||member.result.status==='restricted'&&member.result.can_send_messages!==true)fail('Bot không có quyền gửi vào đích này.',403);
  if(chat.result.type==='channel'&&!(member.result.status==='creator'||member.result.status==='administrator'&&member.result.can_post_messages))fail('Bot chưa có quyền đăng bài trong channel.',403);
  const id=S.id(),target={id:String(chat.result.id),label:chat.result.title||chat.result.username||'Telegram'};
  const saved=await saveSecret({id,platform:'telegram',label:label(body.label,target.label),status:'connected',targetId:target.id,targetLabel:target.label,connectedAt:Date.now(),scope:['bot-verified'],expiresAt:null,lastError:null},{tokens:{accessToken:token},targets:[target],selected:target});
  return reply({connection:publicConnection(saved)});
 }
 return reply({message:'Không có chức năng kết nối này.'},404);
}
// Publisher adapters receive credentials only server-side. Never include this
// helper's return value in admin state, export, browser or worker responses.
export async function socialCredentials(id:string){const row=await connection(id);if(row.status!=='connected')fail('Chọn đúng tài khoản đích và kết nối lại khi cần.',409);if(row.expiresAt&&row.expiresAt<Date.now()+120000){await refreshConnection(row);return socialCredentials(id);}return{connection:publicConnection(row),...await secret(row)};}
