import * as S from './store';
import * as POS from './pos';
import {customer,customerJSON,customerBody,customerRate} from './customer';
import {publicCloudPrices} from './cloud-price';
import {holdingEntry,ledgerPositions,holdingSummary,holdingSeries} from './holdings-core.mjs';
function fail(message:string,status=400):never{throw Object.assign(Error(message),{status});}
const kind='customer-holdings',pairKind='holdings-widget';
const privateJSON=(v:any,status=200)=>customerJSON(v,status,{'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex','Vary':'Cookie, Authorization'});
async function valuation(id:string,withEntries=false){
 const [doc,cloud,bound,local,history]=await Promise.all([S.get(kind,id),publicCloudPrices(),POS.locked(),S.list('price',40),S.list('history-vn',30)]);
 const rows=cloud.active?cloud.prices:local.filter((p:any)=>!bound||p.id.startsWith('pos-')),entries=doc?.entries||[];
 const summary=holdingSummary(entries,rows),series=holdingSeries(entries,history,rows);
 return {version:doc?.version||0,...(withEntries?{entries}:{}),summary,series,generatedAt:Date.now(),method:'moving-average',basis:'shop-buy-price'};
}
export async function handleHoldings(req:Request,path:string[]){
 const action=path[0]||'';
 if(action==='redeem'&&req.method==='POST'){
  const v=await customerBody(req,1000);await customerRate(req,'holdings-redeem',20);
  const code=typeof v.code==='string'?v.code.replace(/[-\s]/g,'').toLowerCase():'';if(!/^[a-f0-9]{32}$/.test(code))fail('Mã ghép chưa đúng.',401);
  const hash=await S.sha(code),at=Date.now(),token=S.randomToken(),tokenHash=await S.sha(token);
  const found=await S.sql().prepare("SELECT id,data,version FROM records WHERE kind=? AND json_extract(data,'$.codeHash')=?").bind(pairKind,hash).first<any>();
  if(!found)fail('Mã đã dùng, hết hạn hoặc không đúng.',401);
  const data=JSON.parse(found.data),c=await S.get('customer',found.id);
  if(!c||c.authVersion!==data.authVersion||data.codeExpiresAt<=at)fail('Mã đã dùng, hết hạn hoặc không đúng.',401);
  const used=await S.sql().prepare("UPDATE records SET data=?,version=version+1,updated_at=? WHERE kind=? AND id=? AND version=? AND json_extract(data,'$.codeHash')=?").bind(JSON.stringify({tokenHash,authVersion:c.authVersion,expiresAt:at+90*86400000}),at,pairKind,found.id,found.version,hash).run();
  if(used.meta.changes!==1)fail('Mã đã dùng. Tạo mã mới trên website.',409);
  return privateJSON({token,expiresAt:at+90*86400000});
 }
 if(action==='widget'&&req.method==='GET'){
  const token=req.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)fail('Widget cần được ghép với tài khoản.',401);
  const found=await S.sql().prepare("SELECT id,data FROM records WHERE kind=? AND json_extract(data,'$.tokenHash')=?").bind(pairKind,await S.sha(token)).first<any>();
  if(!found)fail('Quyền widget đã thu hồi. Ghép lại trên website.',401);
  const data=JSON.parse(found.data),c=await S.get('customer',found.id);if(!c||c.authVersion!==data.authVersion||data.expiresAt<=Date.now())fail('Quyền widget đã hết hạn. Ghép lại trên website.',401);
  const result=await valuation(found.id);return privateJSON(result);
 }
 const c=await customer(req); // Account always comes from the verified session, never client IDs.
 if(!action&&req.method==='GET')return privateJSON(await valuation(c.id,true));
 if(req.method!=='POST')return privateJSON({error:'Không có chức năng này.'},404);
 const v=await customerBody(req,5000);await customerRate(req,'holdings-'+action,120,c.id);
 if(action==='pair'){
  const code=S.randomToken().slice(0,32),at=Date.now();await S.put(pairKind,c.id,{codeHash:await S.sha(code),codeExpiresAt:at+600000,authVersion:c.authVersion});
  return privateJSON({code:code.match(/.{1,8}/g)!.join('-'),expiresAt:at+600000});
 }
 if(action==='revoke'){await S.put(pairKind,c.id,{});return privateJSON({ok:true});}
 if(action) return privateJSON({error:'Không có chức năng này.'},404);
 if(typeof v.requestId!=='string'||!/^[a-f0-9-]{16,64}$/i.test(v.requestId||'')||!Number.isSafeInteger(v.version)||v.version<0||!['add','update','delete'].includes(v.action))fail('Yêu cầu lưu chưa hợp lệ.');
 const entry=v.action!=='delete'?holdingEntry(v.entry):null;
 if(v.action==='delete'&&(typeof v.entryId!=='string'||!/^[a-f0-9-]{16,64}$/i.test(v.entryId||'')))fail('Mã giao dịch chưa hợp lệ.');
 const fingerprint=await S.sha(JSON.stringify({action:v.action,entry,entryId:v.action==='delete'?v.entryId:null})),old=await S.get(kind,c.id),receipts=old?.receipts||[];
 const previous=receipts.find((r:any)=>r.id===v.requestId);
 if(previous){if(previous.hash!==fingerprint)fail('Yêu cầu trùng mã nhưng khác nội dung.',409);return privateJSON({ok:true,duplicate:true});}
 if((old?.version||0)!==v.version)fail('Sổ đã thay đổi ở thiết bị khác. Tải lại trước khi lưu.',409);
 const entries=[...(old?.entries||[])];
 if(entry){const index=entries.findIndex((e:any)=>e.id===entry.id);if(v.action==='update'){if(index<0)fail('Không thấy giao dịch.',404);entries[index]=entry;}else{if(index>=0)fail('Giao dịch đã có trong sổ.',409);entries.push(entry);}}
 else{const index=entries.findIndex((e:any)=>e.id===v.entryId);if(index<0)fail('Không thấy giao dịch.',404);entries.splice(index,1);}
 ledgerPositions(entries);const data=JSON.stringify({entries,receipts:[...receipts,{id:v.requestId,hash:fingerprint}].slice(-50)}),at=Date.now();
 if(old)await S.put(kind,c.id,JSON.parse(data),old.version);
 else{const saved=await S.sql().prepare("INSERT OR IGNORE INTO records(kind,id,data,created_at,updated_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM records WHERE kind=?)<5000").bind(kind,c.id,data,at,at,kind).run();if(saved.meta.changes!==1)fail('Sổ đã thay đổi hoặc chạm giới hạn lưu trữ. Tải lại trước khi lưu.',409);}
 return privateJSON({ok:true});
}
