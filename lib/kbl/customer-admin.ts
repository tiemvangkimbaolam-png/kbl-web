import * as S from './store';
import {customerJSON,customerBody,safeCustomer} from './customer';
export async function handleCustomerAdmin(req:Request,path:string[]){
 if(req.method==='GET')return customerJSON({aiHealth:await S.list('ai-provider-health',5),customers:(await S.list('customer',5000)).map(safeCustomer),feedback:await S.list('feedback',100),tryon:(await S.list('customer-tryon',100)).filter((j:any)=>j.status==='unknown').map((j:any)=>({id:j.id,customerId:j.customerId,status:j.status,createdAt:j.createdAt}))});
 const v=await customerBody(req),c=await S.get('customer',path[0]);if(!c)throw Object.assign(Error('Không thấy khách hàng.'),{status:404});
 if(req.method==='POST'&&path[1]==='grant'){
  if(v.verifiedPurchase!==true||typeof v.purchaseReference!=='string'||v.purchaseReference.trim().length<3||v.purchaseReference.length>200||!Number.isInteger(v.extra)||v.extra<1||v.extra>100||!/^[a-f0-9-]{16,64}$/i.test(v.requestId||''))throw Object.assign(Error('Xác minh đã mua, nhập mã giao dịch và số lượt từ 1 đến 100.'),{status:400});
  const grantId=await S.sha(c.id+':'+v.requestId),nonce=S.randomToken(),at=Date.now();
  const result=await S.sql().batch([
   S.sql().prepare("INSERT OR IGNORE INTO records(kind,id,data,created_at,updated_at) VALUES('customer-grant',?,?,?,?)").bind(grantId,JSON.stringify({customerId:c.id,extra:v.extra,purchaseReference:v.purchaseReference,nonce}),at,at),
   S.sql().prepare("UPDATE records SET data=json_set(data,'$.quota',COALESCE(json_extract(data,'$.quota'),5)+?,'$.purchased',json('true')),version=version+1,updated_at=? WHERE kind='customer' AND id=? AND EXISTS(SELECT 1 FROM records WHERE kind='customer-grant' AND id=? AND json_extract(data,'$.nonce')=?)").bind(v.extra,at,c.id,grantId,nonce)
  ]);return customerJSON({ok:true,duplicate:result[0].meta.changes===0});
 }
 if(req.method==='POST'&&path[1]==='refund-tryon'){
  const j=await S.get('customer-tryon',String(v.jobId||''));if(!j||j.customerId!==c.id)throw Object.assign(Error('Không có lượt ảnh này.'),{status:404});
  if(j.status==='failed-reviewed')return customerJSON({ok:true,duplicate:true});
  if(j.status!=='unknown'||v.confirmedNoImage!==true||typeof v.reason!=='string'||v.reason.trim().length<10||v.reason.length>300)throw Object.assign(Error('Chỉ hoàn lượt chưa rõ trạng thái sau khi đã xác nhận không có ảnh và ghi lý do.'),{status:400});
  const nonce=S.randomToken();await S.sql().batch([
   S.sql().prepare("UPDATE records SET data=json_set(data,'$.status','failed-reviewed','$.refundNonce',?,'$.refundReason',?),updated_at=? WHERE kind='customer-tryon' AND id=? AND json_extract(data,'$.status')='unknown'").bind(nonce,v.reason,Date.now(),j.id),
   S.sql().prepare("UPDATE records SET data=json_set(data,'$.used',MAX(0,COALESCE(json_extract(data,'$.used'),0)-1)),version=version+1 WHERE kind='customer' AND id=? AND EXISTS(SELECT 1 FROM records WHERE kind='customer-tryon' AND id=? AND json_extract(data,'$.refundNonce')=?)").bind(c.id,j.id,nonce)
  ]);return customerJSON({ok:true});
 }
 if(req.method==='POST'&&path[1]==='reset-code'){
  if(v.identityVerified!==true)throw Object.assign(Error('Cần xác minh chủ số điện thoại trước khi cấp mã.'),{status:400});const code=String(10000000+(crypto.getRandomValues(new Uint32Array(1))[0]%90000000)),expiresAt=Date.now()+600000;await S.put('customer-reset',c.id,{hash:await S.sha(c.id+':'+code),expiresAt});return customerJSON({code,expiresAt,message:'Chỉ giao mã cho chủ số điện thoại đã được xác minh; mã dùng một lần.'});
 }
 return customerJSON({message:'Không có chức năng này.'},404);
}
