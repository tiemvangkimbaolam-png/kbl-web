import * as S from './store';
import {socialCredentials} from './social';
import {providerJSON} from './social-core.mjs';
import {customerBody,customerJSON,customerRate} from './customer';
export async function submitFeedback(req:Request){await customerRate(req,'feedback',8);const v=await customerBody(req),message=String(v.message||'').trim(),contact=String(v.contact||'').trim();if(message.length<5||message.length>2000||contact.length>200)throw Object.assign(Error('Góp ý cần từ 5 đến 2.000 ký tự; liên hệ tối đa 200 ký tự.'),{status:400});const id=S.id();await S.put('feedback',id,{message,contact,status:'queued'});await deliverFeedback().catch(()=>{});const saved=await S.get('feedback',id);return customerJSON({id,status:saved.status,message:'Hòm thư đã nhận góp ý. Cảm ơn ông/bà đã góp ý cho Kim Bảo Lâm.'},201);}
export async function deliverFeedback(){
 const cfg=await S.settings() as any,connectionId=cfg.feedbackConnectionId;if(!connectionId)return;
 const auth=await socialCredentials(connectionId);if(auth.connection.platform!=='telegram'||auth.connection.status!=='connected')return;
 const row=await S.sql().prepare("UPDATE records SET data=json_set(data,'$.status','sending'),updated_at=? WHERE kind='feedback' AND id=(SELECT id FROM records WHERE kind='feedback' AND json_extract(data,'$.status')='queued' ORDER BY created_at LIMIT 1) RETURNING id,data").bind(Date.now()).first<any>();if(!row)return;
 const f=JSON.parse(row.data);
 try{const result=await providerJSON('https://api.telegram.org/bot'+auth.tokens.accessToken+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:auth.connection.targetId,text:'HÒM THƯ GÓP Ý KIM BẢO LÂM\nMã: '+row.id+'\n'+f.message+(f.contact?'\nLiên hệ tự nguyện: '+f.contact:''),link_preview_options:{is_disabled:true}})});if(!result.result?.message_id)throw Error();await S.put('feedback',row.id,{...f,status:'delivered',telegramMessageId:String(result.result.message_id),connectionId,sentAt:Date.now()});}
 catch{await S.put('feedback',row.id,{...f,status:'unknown',messageStatus:'Chưa xác nhận gửi Telegram; xem tại Admin trước khi gửi lại.'});}
}
