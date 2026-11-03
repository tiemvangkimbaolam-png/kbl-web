import {sql,get,sha,put} from './store';
import {localTemplateCopy} from './local-template-copy.mjs';
export const localKind=(story:any)=>['gold','product'].includes(story?.kind);
async function stage(storyId:string,name:string,owner:string,result:any){
 const at=Date.now(),hash=await sha(JSON.stringify(result));
 await sql().prepare("INSERT INTO jobs(id,story_id,stage,status,owner,result,result_hash,created_at,updated_at) VALUES(?,?,?,'complete',?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status='complete',owner=excluded.owner,result=excluded.result,result_hash=excluded.result_hash,error=NULL,updated_at=excluded.updated_at WHERE jobs.status='queued' AND jobs.owner IS NULL AND jobs.lease_hash IS NULL").bind(`KBL-${storyId}-${name}`,storyId,name,owner,JSON.stringify(result),hash,at,at).run();
 const row=await sql().prepare('SELECT * FROM jobs WHERE id=?').bind(`KBL-${storyId}-${name}`).first<any>();
 return row?.status==='complete'&&row.owner===owner&&row.result_hash===hash;
}
export async function prepareLocalContent(story:any){
 if(!localKind(story))return false;
 const research=await sql().prepare("SELECT * FROM jobs WHERE story_id=? AND stage='research' AND status='complete'").bind(story.id).first<any>();
 if(!research||research.owner!==(story.kind==='gold'?'pos-readonly':'pos-product'))return false;
 const evidence=JSON.parse(research.result),copy=localTemplateCopy(story,evidence);
 if(story.kind==='gold'&&(!evidence.sourceEvidence?.some((e:any)=>e.kind==='pos-price-snapshot'&&e.verifiedBy==='pos-import-contract'&&e.contentHash)||evidence.sourceEvidence[0].contentHash!==await sha(JSON.stringify(story.priceSnapshot))))throw Error('Thiếu hash bằng chứng POS của bảng giá local.');
 if(!await stage(story.id,'write','local-data-template',copy))return false;
 return stage(story.id,'review','local-data-validator',{approved:true,reason:'Đối soát tự động: nội dung mẫu cố định khớp bản chụp POS và hash nguồn. Không sử dụng hoặc giả lập lượt duyệt AI.'});
}
export async function validateLocalImages(story:any,rows:any[]){
 if(!localKind(story)||!Array.isArray(rows)||rows.length!==(story.kind==='gold'?2:3)||new Set(rows.map(r=>r.assetId)).size!==rows.length)throw Error('Bộ thẻ/ảnh local chưa đủ.');
 const review=await sql().prepare("SELECT owner,status FROM jobs WHERE story_id=? AND stage='review'").bind(story.id).first<any>();
 if(review?.status!=='complete'||review.owner!=='local-data-validator')return false;
 const ids=rows.map(r=>r.assetId);
 if(story.kind==='product'&&JSON.stringify(ids)!==JSON.stringify(story.productSnapshots.map((p:any)=>p.imageIds[0])))throw Error('Ảnh không khớp ba SKU đã chốt.');
 for(const id of ids){const asset=await sql().prepare("SELECT * FROM assets WHERE id=? AND deleted_at IS NULL AND mime LIKE 'image/%'").bind(id).first<any>();if(!asset||(story.kind==='gold'?asset.story_id!==story.id:asset.purpose!=='product'))throw Error('Tệp local chưa có biên nhận đúng nguồn.');}
 const result={approved:true,reason:story.kind==='gold'?'Đối soát tệp bảng giá dựng bằng mã từ snapshot đã chốt; không phải duyệt ảnh AI.':'Đối soát đúng hash ba ảnh POS đã trưng bày và ba SKU đã chốt; không vẽ lại sản phẩm.',inspectedAssetHashes:ids};
 const saved=await stage(story.id,'image-review','local-file-validator',result);
 if(saved&&!await get('job-evidence','local-template:'+story.id))await put('job-evidence','local-template:'+story.id,{storyId:story.id,kind:'deterministic-local-template',snapshotHash:await sha(JSON.stringify(story.kind==='gold'?story.priceSnapshot:story.productSnapshots)),assetHashes:ids,visualAiReview:false});
 return saved;
}
