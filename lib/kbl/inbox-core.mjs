const enc=new TextEncoder();
export async function telegramWebhookSecret(master,id){
 if(typeof master!=='string'||master.length<32||!/^[a-f0-9]{32}$/.test(id||''))throw Error('Cần khóa webhook tối thiểu 32 ký tự và mã kết nối hợp lệ.');
 const hash=await crypto.subtle.digest('SHA-256',enc.encode(master+':telegram:'+id));
 return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function verifyMeta(raw,signature,secret){
 if(typeof secret!=='string'||secret.length<8||!/^sha256=[a-f0-9]{64}$/.test(signature||''))return false;
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.slice(7).match(/../g),x=>parseInt(x,16)),enc.encode(raw));
}
export const cleanText=v=>typeof v==='string'?v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,2000):'';
const ident=v=>typeof v==='string'&&/^[a-zA-Z0-9_:.-]{1,200}$/.test(v);
export function extractMessages(platform,payload,target,at=Date.now()){
 const rows=[];
 if(platform==='telegram'){
  const m=payload.message;
  if(!Number.isSafeInteger(payload.update_id)||!m||!Number.isSafeInteger(m.message_id)||m.from?.is_bot||m.chat?.type!=='private')return rows;
  const question=cleanText(m.text),timestamp=Number(m.date)*1000,recipient=String(m.chat.id);
  if(question&&/^-?\d{1,30}$/.test(recipient)&&timestamp<=at+60000&&at-timestamp<86400000)rows.push({eventId:String(payload.update_id),recipient,question,timestamp,replyTo:m.message_id});
  return rows;
 }
 if(!['facebook','instagram'].includes(platform))return rows;
 for(const entry of Array.isArray(payload.entry)?payload.entry:[]){
  if(String(entry.id)!==String(target))continue;
  for(const m of Array.isArray(entry.messaging)?entry.messaging:[]){
   const question=cleanText(m.message?.text),timestamp=Number(m.timestamp);
   if(m.message?.is_echo||!ident(m.message?.mid)||!ident(m.sender?.id)||String(m.recipient?.id)!==String(target)||!question||!Number.isFinite(timestamp)||timestamp>at+60000||at-timestamp>=86400000)continue;
   rows.push({eventId:m.message.mid,recipient:m.sender.id,question,timestamp});
  }
 }
 return rows.slice(0,20);
}
export async function sendReplyOnce(row,reply,{checkpoint,request,now=Date.now}){
 if(['sent','sending','uncertain','failed','expired'].includes(row.status))return row;
 if(!cleanText(reply))return row;
 if(row.platform!=='telegram'&&now()-row.receivedAt>=86400000){const next={...row,status:'expired'};await checkpoint(next);return next;}
 const sending={...row,status:'sending',attemptedAt:now()};await checkpoint(sending);
 try{
  const receipt=await request(cleanText(reply));
  if(!receipt?.externalId)throw Error('No receipt');
  const next={...sending,status:'sent',externalId:String(receipt.externalId),sentAt:now()};await checkpoint(next);return next;
 }catch{
  const next={...sending,status:'uncertain',reason:'Không xác định kết quả gửi; không tự gửi lại để tránh trả lời trùng.'};await checkpoint(next);return next;
 }
}
