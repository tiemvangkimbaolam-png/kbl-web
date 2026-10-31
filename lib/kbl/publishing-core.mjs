// Provider state machine: any potentially accepted mutation is checkpointed first.
// A lost response is held for reconciliation, never silently repeated.
export function publicationContent(saved,input,modernFingerprint,legacyFingerprint){
 if(saved&&(saved.formatVersion===1||(!saved.formatVersion&&saved.fingerprint===legacyFingerprint))){
  if(saved.fingerprint!==legacyFingerprint)throw Error('Nội dung xuất bản cũ đã đổi; cần đối chiếu.');
  return{input:{...input,caption:input.legacyCaption??input.caption,imageIds:[],mediaType:'video'},fingerprint:legacyFingerprint,formatVersion:1};
 }
 if(saved&&saved.fingerprint!==modernFingerprint)throw Error('Nội dung xuất bản đã đổi; giữ lượt cũ để đối chiếu, không đăng trùng.');
 return{input,fingerprint:modernFingerprint,formatVersion:2};
}
export async function advancePublication(state, input, io) {
 const save=async patch=>{Object.assign(state,patch);await io.checkpoint({...state});};
 const get=(url,headers={})=>io.request(url,{headers});
 const post=async(url,body,headers={})=>{await save({phase:'sending',sendingAt:io.now()});try{return await io.request(url,{method:'POST',headers,body});}catch{await save({phase:'attention',reason:'Chưa rõ nền tảng đã nhận. Không tự gửi lại.'});return null;}};
 const form=value=>new URLSearchParams(Object.fromEntries(Object.entries(value).map(([k,v])=>[k,String(v)])));
 const bearer={Authorization:'Bearer '+input.token}, target=encodeURIComponent(input.targetId||'');
 const meta='https://graph.facebook.com/'+input.graphVersion, threads='https://graph.threads.net/v1.0';
 const done=async(id,url,extra={})=>{if(!id||!url)throw Error('Thiếu biên nhận nền tảng.');await save({phase:'published',externalId:String(id),url,...extra});return state;};
 if(['published','attention','manual'].includes(state.phase))return state;
 if(state.phase==='sending'){await save({phase:'attention',reason:'Yêu cầu trước bị ngắt sau khi gửi; cần đối chiếu, không tự đăng trùng.'});return state;}
 if(input.platform==='zalo'){await save({phase:'manual',reason:'Zalo OA cần quyền nội dung/gói OA và loại bài được duyệt. Không coi OAuth là quyền phát hành.'});return state;}
 if(input.platform==='tiktok'){
  const api='https://open.tiktokapis.com/v2',auth={Authorization:'Bearer '+input.token};
  if(state.phase==='uploaded'){
   const r=await io.request(api+'/post/publish/status/fetch/',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({publish_id:state.publishId})}),status=r?.data?.status;
   if(status==='FAILED'){await save({phase:'attention',reason:'TikTok từ chối video: '+String(r.data.fail_reason||'không rõ lý do').slice(0,200)});return state;}
   if(status!=='PUBLISH_COMPLETE')return state;
   const postId=(r.data.publicaly_available_post_id||[])[0];if(!postId){await save({phase:'attention',reason:'TikTok đã đăng nhưng chưa trả mã bài để đối chiếu.'});return state;}
   const user=await io.request(api+'/user/info/?fields=username',{headers:auth}),username=user?.data?.user?.username;
   if(username)return done(postId,'https://www.tiktok.com/@'+encodeURIComponent(username)+'/video/'+encodeURIComponent(postId));
   await save({phase:'attention',remoteId:String(postId),reason:'Đã có bài TikTok nhưng chưa đọc được tên tài khoản để tạo liên kết.'});return state;
  }
  if(state.phase==='session'){
   const bytes=await io.readVideo();await save({phase:'sending',sendingAt:io.now()});
   try{const r=await io.upload(state.uploadUrl,bytes,{...auth,'Content-Type':'video/mp4','Content-Range':'bytes 0-'+(bytes.byteLength-1)+'/'+bytes.byteLength});if(r?.status>=200&&r.status<300)await save({phase:'uploaded'});else await save({phase:'attention',reason:'TikTok chưa nhận file ('+r?.status+').'});}
   catch{await save({phase:'attention',reason:'Upload TikTok chưa rõ kết quả; cần đối chiếu, không tự tải lại.'});}return state;
  }
  const bytes=await io.readVideo();
  const r=await post(api+'/post/publish/video/init/',JSON.stringify({post_info:{title:String(input.headline||input.caption||'').slice(0,2200),privacy_level:'PUBLIC_TO_EVERYONE',disable_duet:false,disable_comment:false,disable_stitch:false},source_info:{source:'FILE_UPLOAD',video_size:bytes.byteLength,chunk_size:bytes.byteLength,total_chunk_count:1}}),{...auth,'Content-Type':'application/json'});
  if(r?.data?.publish_id&&r.data.upload_url)await save({phase:'session',publishId:r.data.publish_id,uploadUrl:r.data.upload_url});
  else if(r)await save({phase:'attention',reason:'TikTok chưa trả phiên tải lên.'});return state;
 }
 if(input.mediaType==='images'&&input.platform==='telegram'){
  const urls=input.imageUrls||[];if(!urls.length||urls.length>10)throw Error('Cần 1–10 ảnh đã duyệt cho Telegram.');
  const body=new FormData();body.set('chat_id',input.targetId);body.set('caption',String(input.caption||'').slice(0,1024));
  let r;
  if(urls.length===1){body.set('photo',urls[0]);r=await post('https://api.telegram.org/bot'+input.token+'/sendPhoto',body);}
  else{body.delete('caption');body.set('media',JSON.stringify(urls.map((url,i)=>({type:'photo',media:url,...(i===0?{caption:String(input.caption||'').slice(0,1024)}:{})}))));r=await post('https://api.telegram.org/bot'+input.token+'/sendMediaGroup',body);}
  const first=Array.isArray(r?.result)?r.result[0]:r?.result;
  if(r?.ok&&first?.message_id){const chat=first.chat||{},url=chat.username?'https://t.me/'+chat.username+'/'+first.message_id:chat.id&&String(chat.id).startsWith('-100')?'https://t.me/c/'+String(chat.id).slice(4)+'/'+first.message_id:null;if(url)return done(first.message_id,url,{visibility:chat.username?'public-link':'members-only'});await save({phase:'attention',remoteId:String(first.message_id),reason:'Đã có message_id nhưng chưa có link kênh để đối chiếu.'});}return state;
 }
 if(input.mediaType==='images'&&['facebook','instagram','threads'].includes(input.platform)){
  const urls=input.imageUrls||[];if(!urls.length||urls.length>3)throw Error('Cần 1–3 ảnh đã duyệt.');
  if(state.phase==='permalink'){const r=await get((input.platform==='threads'?threads:meta)+'/'+encodeURIComponent(state.publishedId)+'?fields=id,'+(input.platform==='facebook'?'permalink_url':'permalink'),bearer);const url=r.permalink_url||r.permalink;if(r.id&&url)return done(r.id,url);return state;}
  if(input.platform==='facebook'){
   const ids=state.photoIds||[];
   if(ids.length<urls.length){const r=await post(meta+'/'+target+'/photos',form({url:urls[ids.length],published:false}),bearer);if(r?.id)await save({phase:'photos',photoIds:[...ids,r.id]});else if(r)await save({phase:'attention',reason:'Thiếu mã ảnh Facebook.'});return state;}
   const r=await post(meta+'/'+target+'/feed',form({message:input.caption,attached_media:JSON.stringify(ids.map(id=>({media_fbid:id})))}),bearer);if(r?.id)await save({phase:'permalink',publishedId:r.id});return state;
  }
  const base=input.platform==='instagram'?meta:threads,endpoint=input.platform==='instagram'?'/media':'/threads',field=input.platform==='instagram'?'status_code':'status';
  if(state.phase==='container'){const r=await get(base+'/'+encodeURIComponent(state.remoteId)+'?fields='+field,bearer);if(['ERROR','EXPIRED'].includes(r[field])){await save({phase:'attention',reason:'Container ảnh lỗi/hết hạn.'});return state;}if(r[field]!=='FINISHED')return state;const r2=await post(base+'/'+target+(input.platform==='instagram'?'/media_publish':'/threads_publish'),form({creation_id:state.remoteId}),bearer);if(r2?.id)await save({phase:'permalink',publishedId:r2.id});return state;}
  if(urls.length===1){const r=await post(base+'/'+target+endpoint,form(input.platform==='instagram'?{image_url:urls[0],caption:input.caption}:{media_type:'IMAGE',image_url:urls[0],text:input.caption}),bearer);if(r?.id)await save({phase:'container',remoteId:r.id});return state;}
  const children=state.children||[];
  if(state.childPending){const r=await get(base+'/'+encodeURIComponent(state.childPending)+'?fields='+field,bearer);if(['ERROR','EXPIRED'].includes(r[field])){await save({phase:'attention',reason:'Ảnh con bị từ chối.'});return state;}if(r[field]!=='FINISHED')return state;await save({phase:'children',children:[...children,state.childPending],childPending:null});return state;}
  if(children.length<urls.length){const r=await post(base+'/'+target+endpoint,form({image_url:urls[children.length],is_carousel_item:true,...(input.platform==='threads'?{media_type:'IMAGE'}:{})}),bearer);if(r?.id)await save({phase:'children',childPending:r.id});return state;}
  const r=await post(base+'/'+target+endpoint,form({media_type:'CAROUSEL',children:children.join(','),...(input.platform==='instagram'?{caption:input.caption}:{text:input.caption})}),bearer);if(r?.id)await save({phase:'container',remoteId:r.id});return state;
 }
 if(input.platform==='facebook'){
  if(state.phase==='remote'){
   const p=await get(meta+'/'+encodeURIComponent(state.remoteId)+'?fields=status,permalink_url',bearer);
   if(p.status?.video_status==='ready'&&p.permalink_url)return done(state.remoteId,p.permalink_url);
   return state;
  }
  const r=await post(meta+'/'+target+'/videos',form({file_url:input.mediaUrl,description:input.caption,title:input.headline,published:true}),bearer);
  if(r?.id)await save({phase:'remote',remoteId:r.id});else if(r)await save({phase:'attention',reason:'Nền tảng chưa trả mã video.'});return state;
 }
 if(['instagram','threads'].includes(input.platform)){
  const base=input.platform==='instagram'?meta:threads;
  if(state.phase==='container'){
   const field=input.platform==='instagram'?'status_code':'status';
   const r=await get(base+'/'+encodeURIComponent(state.remoteId)+'?fields='+field,bearer),status=r[field];
   if(['ERROR','EXPIRED'].includes(status)){await save({phase:'attention',reason:'Container nền tảng lỗi/hết hạn.'});return state;}
   if(status!=='FINISHED')return state;
   const endpoint=input.platform==='instagram'?'media_publish':'threads_publish';
   const result=await post(base+'/'+target+'/'+endpoint,form({creation_id:state.remoteId}),bearer);
   if(result?.id)await save({phase:'permalink',publishedId:result.id});return state;
  }
  if(state.phase==='permalink'){
   const r=await get(base+'/'+encodeURIComponent(state.publishedId)+'?fields=id,permalink',bearer);
   if(r.id&&r.permalink)return done(r.id,r.permalink);return state;
  }
  const body=input.platform==='instagram'?{media_type:'REELS',video_url:input.mediaUrl,caption:input.caption}:{media_type:'VIDEO',video_url:input.mediaUrl,text:input.caption};
  const r=await post(base+'/'+target+(input.platform==='instagram'?'/media':'/threads'),form(body),bearer);
  if(r?.id)await save({phase:'container',remoteId:r.id});return state;
 }
 if(input.platform==='youtube'){
  if(state.phase==='uploaded'){
   const r=await get('https://www.googleapis.com/youtube/v3/videos?part=status&id='+encodeURIComponent(state.remoteId),bearer),v=r.items?.[0];
   if(v?.status?.uploadStatus==='processed'&&v.status.privacyStatus==='public')return done(v.id,'https://www.youtube.com/watch?v='+encodeURIComponent(v.id));
   if(v?.status?.uploadStatus==='rejected')await save({phase:'attention',reason:'YouTube từ chối video.'});return state;
  }
  if(state.phase==='session'){
   const bytes=await io.readVideo();
   await save({phase:'sending',sendingAt:io.now()});
   try{const r=await io.request(state.sessionUrl,{method:'PUT',headers:{...bearer,'Content-Type':'video/mp4','Content-Length':String(bytes.byteLength)},body:bytes});if(r.id)await save({phase:'uploaded',remoteId:r.id});else await save({phase:'attention',reason:'YouTube chưa trả mã video.'});}
   catch{await save({phase:'attention',reason:'Upload YouTube chưa rõ kết quả; giữ session để đối chiếu.',sessionUrl:state.sessionUrl});}return state;
  }
  const caption=String(input.caption||''),description=(/#shorts\b/i.test(caption)?caption:caption+'\n\n#Shorts').slice(0,5000);
  const r=await post('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',JSON.stringify({snippet:{title:String(input.headline||'').slice(0,100),description},status:{privacyStatus:'public',selfDeclaredMadeForKids:false}}),{...bearer,'Content-Type':'application/json','X-Upload-Content-Type':'video/mp4'});
  if(r?.location&&/^https:\/\/www\.googleapis\.com\/upload\//.test(r.location))await save({phase:'session',sessionUrl:r.location});return state;
 }
 if(input.platform==='telegram'){
  const bytes=await io.readVideo(),body=new FormData();body.set('chat_id',input.targetId);body.set('caption',input.caption.slice(0,1024));body.set('video',new Blob([bytes],{type:'video/mp4'}),'kbl-video.mp4');body.set('supports_streaming','true');
  const r=await post('https://api.telegram.org/bot'+input.token+'/sendVideo',body);
  if(r?.ok&&r.result?.message_id){const chat=r.result.chat||{},url=chat.username?'https://t.me/'+chat.username+'/'+r.result.message_id:chat.id&&String(chat.id).startsWith('-100')?'https://t.me/c/'+String(chat.id).slice(4)+'/'+r.result.message_id:null;if(url)return done(r.result.message_id,url,{visibility:chat.username?'public-link':'members-only'});await save({phase:'attention',remoteId:String(r.result.message_id),reason:'Đã có message_id nhưng chưa có link kênh để đối chiếu.'});}return state;
 }
 throw Error('Chưa hỗ trợ nền tảng xuất bản.');
}
export async function providerRequest(url, options={}, fetcher=fetch) {
 const r=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw Error('Nền tảng chưa xác nhận yêu cầu ('+r.status+').');
 const location=r.headers.get('location');if(location&&r.status>=200&&r.status<300)return{location};
 try{return await r.json();}catch{throw Error('Nền tảng trả dữ liệu không hợp lệ.');}
}
