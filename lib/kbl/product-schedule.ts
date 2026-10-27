import {sql,get,list,settings,sha} from './store';
import {publicationPlan} from './publication-plan';
// POS snapshots and original photo hashes are frozen; no AI redraw of real goods.
export async function captureProductSlot(at=Date.now()){
 const cfg=await settings() as any;if(!cfg.teamEnabled||!cfg.autoProducts)return {waiting:true};
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)),v=(k:string)=>parts.find(x=>x.type===k)?.value;
 const hour=Number(v('hour'));if(!(cfg.productHours||[10,16]).includes(hour))return {waiting:true};
 const slot=`${v('year')}-${v('month')}-${v('day')}-${hour}`,sid=(await sha('KBL-PRODUCT:'+slot)).slice(0,32);
 if(await get('story',sid))return {duplicate:true,storyId:sid};
 const sync=await get('pos-sync','product');if(!sync||at-sync.receivedAt>300000||sync.receivedAt>at+60000)return {waiting:true,reason:'Chờ kho POS mới trong 5 phút.'};
 const candidates=(await list('product',500)).filter((p:any)=>p.source==='pos'&&p.published&&p.available&&!p.posMissing&&p.price>0&&p.imageIds?.length>=2);
 const history=await list('product-edition',500),used=new Set(history.map((r:any)=>r.productId));
 const p=candidates.find((r:any)=>!used.has(r.id))||candidates[0];if(!p)return {waiting:true,reason:'Chờ sản phẩm còn hàng và ít nhất hai góc ảnh thật.'};
 const photos=p.imageIds.slice(0,2);for(const aid of photos){const asset=await sql().prepare("SELECT id FROM assets WHERE id=? AND purpose='product' AND deleted_at IS NULL AND mime LIKE 'image/%'").bind(aid).first();if(!asset)return {waiting:true,reason:'Ảnh POS chưa đủ biên nhận.'};}
 const url='https://tiemvangkimbaolam.id.vn/vi/san-pham/'+encodeURIComponent(p.sku),snapshot={id:p.id,sku:p.sku,name:p.name,purity:p.purity,weight:p.weight,price:p.price,imageIds:photos,capturedAt:at};
 const story={title:'Sản phẩm tại tiệm: '+p.name,topic:'Giới thiệu sản phẩm POS theo dữ liệu chốt. Không bịa xuất xứ, ưu đãi hoặc chứng nhận. Giữ nguyên mẫu và ảnh thật; giá có thời điểm.',sourceUrl:url,...await publicationPlan(),status:'working',kind:'product',editionAt:at,productSnapshot:snapshot};
 const result={items:[{title:story.title,url,excerpt:JSON.stringify(snapshot),publishedAt:new Date(at).toISOString()}],evidenceKind:'pos-product-snapshot',capturedAt:at};
 await sql().batch([
  sql().prepare("INSERT OR IGNORE INTO records(kind,id,data,created_at,updated_at) VALUES('story',?,?,?,?)").bind(sid,JSON.stringify(story),at,at),
  sql().prepare("INSERT OR IGNORE INTO records(kind,id,data,created_at,updated_at) VALUES('product-edition',?,?,?,?)").bind(sid,JSON.stringify({productId:p.id,slot}),at,at),
  sql().prepare("INSERT OR IGNORE INTO jobs(id,story_id,stage,status,owner,result,result_hash,created_at,updated_at) VALUES(?,?,'research','complete','pos-product',?,?,?,?)").bind(`KBL-${sid}-research`,sid,JSON.stringify(result),await sha(JSON.stringify(result)),at,at)
 ]);return {captured:true,storyId:sid};
}
export async function productImages(story:any,at=Date.now()){
 const rows=story.productSnapshot.imageIds.map((assetId:string)=>({assetId,caption:'Ảnh gốc sản phẩm '+story.productSnapshot.sku})),result={rows};
 await sql().prepare("INSERT OR IGNORE INTO jobs(id,story_id,stage,status,owner,result,result_hash,created_at,updated_at) VALUES(?,?,'image','complete','pos-original-photos',?,?,?,?)").bind(`KBL-${story.id}-image`,story.id,JSON.stringify(result),await sha(JSON.stringify(result)),at,at).run();
}
