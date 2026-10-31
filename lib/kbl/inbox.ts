import {socialEnvironment} from './social-config';
import * as S from './store';
import { socialCredentials } from './social';
import {publicBase,telegramJSON} from './social-core.mjs';
import { verifyMeta,extractMessages,sendReplyOnce,telegramWebhookSecret } from './inbox-core.mjs';
const reply=(v:any,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const valid=(v:string)=>/^[a-f0-9]{32}$/.test(v);
// KBL_INBOX_WEBHOOK_SECRET is optional: the social encryption key already
// protects the same connection, so inbox can be enabled without a second secret.
const telegramSecret=async(id:string)=>{const env=await socialEnvironment(),master=env.KBL_INBOX_WEBHOOK_SECRET||env.KBL_SOCIAL_ENCRYPTION_KEY;if(typeof master!=='string'||master.length<32)throw Object.assign(Error('Chưa có khóa tạo webhook Telegram: thêm KBL_SOCIAL_ENCRYPTION_KEY hoặc KBL_INBOX_WEBHOOK_SECRET (tối thiểu 32 ký tự) trong Cloudflare.'),{status:503});return telegramWebhookSecret(master,id);};
export async function handleInboxAdmin(req:Request,path:string[]){
 if(req.method==='GET')return reply({bindings:(await S.list('inbox-binding',100)).map(({id,enabled,platform,updatedAt}:any)=>({id,enabled,platform,updatedAt})),outbox:(await S.list('inbox-message',100)).map(({id,platform,status,reason,sentAt,receivedAt}:any)=>({id,platform,status,reason,sentAt,receivedAt})),supported:['facebook','instagram','telegram']});
 if(req.method!=='POST'||!valid(path[0]||''))return reply({message:'Không có chức năng này.'},404);
 const data:any=await req.json();if(typeof data.enabled!=='boolean'||data.enabled&&data.confirmMessagingPermission!==true)return reply({message:'Xác nhận quyền tin nhắn và trạng thái bật/tắt.'},400);
 const auth=await socialCredentials(path[0]),platform=auth.connection.platform;
 if(!['facebook','instagram','telegram'].includes(platform))return reply({message:'Chưa có bộ nhận/trả lời tin nhắn cho nền tảng này.'},409);
 const cfg=await socialEnvironment(),base=publicBase(cfg);
 let callback='',secret='',message='';
 if(platform==='telegram'){
  secret=await telegramSecret(path[0]);
  callback=base+'/api/social-inbox/telegram/'+path[0];
  if(data.enabled)await telegramJSON(auth.tokens.accessToken,'setWebhook',{url:callback,secret_token:secret,allowed_updates:['message']});
  else await telegramJSON(auth.tokens.accessToken,'deleteWebhook',{drop_pending_updates:false});
  message=data.enabled?'Đã bật tự trả lời và đăng ký webhook Telegram. Tin nhắn riêng gửi tới bot sẽ vào hàng đợi tư vấn.':'Đã tắt tự trả lời và gỡ webhook Telegram.';
 }else{
  if(data.enabled&&(!cfg.KBL_META_WEBHOOK_VERIFY_TOKEN||!cfg.KBL_META_APP_SECRET))return reply({message:'Cần cấu hình Meta webhook verify token và App Secret trước khi bật.'},503);
  secret=cfg.KBL_META_WEBHOOK_VERIFY_TOKEN||'';
  callback=base+'/api/social-inbox/'+platform+'/'+path[0];
  message='Cần đăng ký webhook và quyền nhắn tin trên ứng dụng nền tảng; lưu tại đây chưa đăng ký webhook.';
 }
 await S.put('inbox-binding',path[0],{enabled:data.enabled,platform,targetId:auth.connection.targetId});
 return reply({success:true,enabled:data.enabled,registered:platform==='telegram',callback,verifyToken:secret,message});
}
export async function handleInboxWebhook(req:Request,platform:string,connectionId:string){
 if(!valid(connectionId)||!['facebook','instagram','telegram'].includes(platform))return reply({message:'Not found'},404);
 const binding=await S.get('inbox-binding',connectionId);if(!binding?.enabled||binding.platform!==platform)return reply({message:'Not found'},404);
 if(req.method==='GET'&&platform!=='telegram'){
  const u=new URL(req.url),token=(await socialEnvironment()).KBL_META_WEBHOOK_VERIFY_TOKEN;
  return token&&u.searchParams.get('hub.mode')==='subscribe'&&u.searchParams.get('hub.verify_token')===token?new Response(u.searchParams.get('hub.challenge')||'',{headers:{'Cache-Control':'no-store'}}):reply({message:'Forbidden'},403);
 }
 if(req.method!=='POST')return reply({message:'Method not allowed'},405);
 if(Number(req.headers.get('content-length')||0)>131072)return reply({message:'Payload too large'},413);
 const raw=await req.text();if(raw.length>131072)return reply({message:'Payload too large'},413);
 if(platform==='telegram'){
  if(req.headers.get('x-telegram-bot-api-secret-token')!==await telegramSecret(connectionId))return reply({message:'Forbidden'},403);
 }else if(!await verifyMeta(raw,req.headers.get('x-hub-signature-256'),(await socialEnvironment()).KBL_META_APP_SECRET))return reply({message:'Forbidden'},403);
 let data;try{data=JSON.parse(raw);}catch{return reply({message:'Invalid JSON'},400);}
 const total=await S.sql().prepare("SELECT COUNT(*) n FROM records WHERE kind='inbox-message'").first<any>();
 if(Number(total?.n)>=5000)return reply({message:'Hàng đợi tin nhắn đầy; chủ cần lưu trữ trước khi nhận thêm.'},507);
 let count=0;
 for(const m of extractMessages(platform,data,binding.targetId)){
  const id=(await S.sha(platform+':'+connectionId+':'+m.eventId)).slice(0,32),at=Date.now();
  const outbox={platform,connectionId,recipient:m.recipient,receivedAt:m.timestamp,status:'awaiting-reply',replyTo:m.replyTo};
  const consultation={question:m.question,reply:null,status:'awaiting-reply',source:'social-inbox',tokenHash:await S.sha(S.randomToken())};
  await S.sql().batch([
   S.sql().prepare("INSERT OR IGNORE INTO records(kind,id,data,created_at,updated_at) VALUES('inbox-message',?,?,?,?)").bind(id,JSON.stringify(outbox),at,at),
   S.sql().prepare("INSERT OR IGNORE INTO records(kind,id,data,created_at,updated_at) VALUES('consultation',?,?,?,?)").bind(id,JSON.stringify(consultation),at,at)
  ]);count++;
 }
 return reply({received:true,count});
}
export async function processInboxReplies(){
 const cfg=await S.settings();if(!cfg.autoConsult)return;
 const rows=(await S.sql().prepare("SELECT id,data FROM records WHERE kind='inbox-message' AND json_extract(data,'$.status')='awaiting-reply' ORDER BY created_at LIMIT 5").all<any>()).results;
 for(const raw of rows){
  const row={...JSON.parse(raw.data),id:raw.id},binding=await S.get('inbox-binding',row.connectionId);if(!binding?.enabled)continue;
  const consult=await S.get('consultation',row.id);if(consult?.status!=='answered'||!consult.reply)continue;
  const lock=await S.sql().prepare("UPDATE records SET data=json_set(data,'$.status','sending'),updated_at=? WHERE kind='inbox-message' AND id=? AND json_extract(data,'$.status')='awaiting-reply' RETURNING id").bind(Date.now(),row.id).first();if(!lock)continue;
  try{
   const auth=await socialCredentials(row.connectionId),token=auth.selected?.accessToken||auth.tokens.accessToken;
   await sendReplyOnce(row,consult.reply,{checkpoint:async(next:any)=>{await S.put('inbox-message',row.id,next);},request:async(text:string)=>{
    const version=(await socialEnvironment()).KBL_META_GRAPH_VERSION;if(row.platform!=='telegram'&&!/^v\d+\.\d+$/.test(version||''))throw Error('Graph version missing');
    const url=row.platform==='telegram'?'https://api.telegram.org/bot'+token+'/sendMessage':'https://graph.facebook.com/'+version+'/'+encodeURIComponent(binding.targetId)+'/messages';
    const body=row.platform==='telegram'?{chat_id:row.recipient,text,reply_parameters:{message_id:row.replyTo}}:{recipient:{id:row.recipient},message:{text},...(row.platform==='facebook'?{messaging_type:'RESPONSE'}:{})};
    const res=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',...(row.platform==='telegram'?{}:{Authorization:'Bearer '+token})},body:JSON.stringify(body)});
    const value:any=await res.json();if(!res.ok||value.error||value.ok===false)throw Error('Provider refused');return{externalId:row.platform==='telegram'?value.result?.message_id:value.message_id};
   }});
  }catch{await S.put('inbox-message',row.id,{...row,status:'failed',reason:'Chưa có quyền/kết nối gửi tin; cần đối chiếu trước khi thử lại.'});}
 }
}
