import { env } from 'cloudflare:workers';
import * as S from './store';
import { socialCredentials } from './social';
import { advancePublication, providerRequest } from './publishing-core.mjs';

export async function servePublishingMedia(token:string) {
 if(!/^[a-f0-9]{64}$/.test(token))return new Response('Not found',{status:404});
 const grant=await S.get('publishing-media',await S.sha(token));
 if(!grant||grant.expiresAt<Date.now())return new Response('Not found',{status:404});
 const asset=await S.sql().prepare('SELECT * FROM assets WHERE id=? AND deleted_at IS NULL').bind(grant.assetId).first<any>();
 if(!asset||asset.purpose!=='video-temp')return new Response('Not found',{status:404});
 if(!env.BUCKET)return new Response('Unavailable',{status:503});
 const object=await env.BUCKET.get(asset.id);if(!object)return new Response('Not found',{status:404});
 return new Response(object.body,{headers:{'Content-Type':'video/mp4','Content-Length':String(asset.bytes),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
export async function publishSocialStory(storyId:string,platform:string,connectionId:string,input:{origin:string,videoId:string,headline:string,caption:string}) {
 const at=Date.now(),key=await S.sha(storyId+':'+platform+':'+connectionId),base=new URL(input.origin);
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/')throw Error('Cần origin HTTPS của website.');
 const story=await S.get('story',storyId);if(!story?.platforms?.includes(platform)||!(await S.settings()).publicationEnabled)return{waiting:true,status:'disabled'};
 const receipt=await S.sql().prepare('SELECT external_id,url FROM receipts WHERE story_id=? AND platform=?').bind(storyId,platform).first<any>();if(receipt)return{published:true,status:'published',externalId:receipt.external_id,url:receipt.url};
 const asset=await S.sql().prepare("SELECT * FROM assets WHERE id=? AND story_id=? AND purpose='video-temp' AND deleted_at IS NULL").bind(input.videoId,storyId).first<any>();if(!asset)throw Error('Không có video đúng hồ sơ.');
 const lock=await S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) VALUES('publishing-lock',?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at WHERE CAST(records.data AS INTEGER)<? RETURNING id").bind(key,String(at+90000),at,at,at).first();if(!lock)return{waiting:true,status:'busy'};
 try{
  const saved=await S.get('publishing-outbox',key),state:any=saved?.state||{phase:'ready'};
  const fingerprint=await S.sha(JSON.stringify({storyId,platform,connectionId,videoId:input.videoId,headline:input.headline,caption:input.caption}));
  if(saved&&saved.fingerprint!==fingerprint)throw Error('Nội dung xuất bản đã đổi; giữ lượt cũ để đối chiếu, không đăng trùng.');
  const auth=await socialCredentials(connectionId);if(auth.connection.platform!==platform||!auth.connection.targetId)throw Error('Kết nối chưa chọn đúng tài khoản nhận.');
  let mediaUrl=saved?.mediaUrl;
  if(!mediaUrl&&['facebook','instagram','threads'].includes(platform)){
   const token=S.randomToken();mediaUrl=base.origin+'/api/publishing-media/'+token;
   await S.put('publishing-media',await S.sha(token),{assetId:asset.id,storyId,expiresAt:at+7200000});
  }
  const checkpoint=async(next:any)=>{await S.put('publishing-outbox',key,{storyId,platform,connectionId,fingerprint,mediaUrl,state:next});};
  await checkpoint(state);
  const next=await advancePublication(state,{platform,token:auth.selected?.accessToken||auth.tokens.accessToken,targetId:auth.connection.targetId,graphVersion:(env as any).KBL_META_GRAPH_VERSION,mediaUrl,...input},{checkpoint,now:Date.now,request:providerRequest,readVideo:async()=>{if(!env.BUCKET)throw Error('Kho media chưa kết nối.');const obj=await env.BUCKET.get(asset.id);if(!obj)throw Error('Không đọc được video.');return new Uint8Array(await obj.arrayBuffer());}});
  if(next.phase==='published'){
   await S.sql().prepare('INSERT OR IGNORE INTO receipts(id,story_id,platform,external_id,url,at) VALUES(?,?,?,?,?,?)').bind(storyId+':'+platform,storyId,platform,next.externalId,next.url,Date.now()).run();
   return{published:true,status:'published',externalId:next.externalId,url:next.url};
  }
  return{waiting:true,status:next.phase,reason:next.reason};
 }finally{await S.sql().prepare("DELETE FROM records WHERE kind='publishing-lock' AND id=?").bind(key).run();}
}
export async function publishingStatus(){return(await S.list('publishing-outbox',100)).map((r:any)=>({id:r.id,storyId:r.storyId,platform:r.platform,connectionId:r.connectionId,status:r.state?.phase,reason:r.state?.reason,externalId:r.state?.externalId,url:r.state?.url,updatedAt:r.updatedAt}));}
