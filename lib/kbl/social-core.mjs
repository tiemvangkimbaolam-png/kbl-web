// Provider protocol and secret vault. No browser cookies or AI account sessions.
export const SOCIAL_PROVIDERS = Object.freeze({
 facebook: { label:'Facebook Page', client:'KBL_META_APP_ID', secret:'KBL_META_APP_SECRET', auth:'https://www.facebook.com/{version}/dialog/oauth', token:'https://graph.facebook.com/{version}/oauth/access_token', scopes:['pages_show_list','pages_read_engagement','pages_manage_posts'] },
 instagram: { label:'Instagram Professional', client:'KBL_META_APP_ID', secret:'KBL_META_APP_SECRET', auth:'https://www.facebook.com/{version}/dialog/oauth', token:'https://graph.facebook.com/{version}/oauth/access_token', scopes:['pages_show_list','pages_read_engagement','instagram_basic','instagram_content_publish'] },
 threads: { label:'Threads', client:'KBL_THREADS_APP_ID', secret:'KBL_THREADS_APP_SECRET', auth:'https://threads.net/oauth/authorize', token:'https://graph.threads.net/oauth/access_token', scopes:['threads_basic','threads_content_publish'] },
 youtube: { label:'YouTube', client:'KBL_GOOGLE_CLIENT_ID', secret:'KBL_GOOGLE_CLIENT_SECRET', auth:'https://accounts.google.com/o/oauth2/v2/auth', token:'https://oauth2.googleapis.com/token', scopes:['https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly'], pkce:true },
 tiktok: { label:'TikTok', client:'KBL_TIKTOK_CLIENT_KEY', secret:'KBL_TIKTOK_CLIENT_SECRET', auth:'https://www.tiktok.com/v2/auth/authorize/', token:'https://open.tiktokapis.com/v2/oauth/token/', scopes:['user.info.basic','video.publish','video.upload'] },
 zalo: { label:'Zalo OA', client:'KBL_ZALO_APP_ID', secret:'KBL_ZALO_APP_SECRET', auth:'https://oauth.zaloapp.com/v4/oa/permission', token:'https://oauth.zaloapp.com/v4/oa/access_token', scopes:[], pkce:true },
 telegram: { label:'Telegram bot', scopes:[] }
});
export const random = () => [...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');
export const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = text => Uint8Array.from(atob(text), c=>c.charCodeAt(0));
const url64 = bytes => b64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const err = (message,status=400) => Object.assign(Error(message),{status});
export async function seal(value,keyHex,aad) {
 if (!/^[a-f0-9]{64}$/.test(keyHex||'')) throw err('Cần secret KBL_SOCIAL_ENCRYPTION_KEY gồm 64 ký tự hex.',503);
 const key=await crypto.subtle.importKey('raw',Uint8Array.from(keyHex.match(/../g),x=>parseInt(x,16)),{name:'AES-GCM'},false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(aad)},key,new TextEncoder().encode(JSON.stringify(value)));
 return {v:1,iv:b64(iv),cipher:b64(new Uint8Array(cipher))};
}
export async function unseal(value,keyHex,aad) {
 if (value?.v!==1||!/^[a-f0-9]{64}$/.test(keyHex||'')) throw err('Kho khóa mạng xã hội chưa được cấu hình.',503);
 const key=await crypto.subtle.importKey('raw',Uint8Array.from(keyHex.match(/../g),x=>parseInt(x,16)),{name:'AES-GCM'},false,['decrypt']);
 try {const result=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(value.iv),additionalData:new TextEncoder().encode(aad)},key,unb64(value.cipher));return JSON.parse(new TextDecoder().decode(result));}
 catch {throw err('Không mở được kho khóa mạng xã hội; cần kiểm tra khóa mã hóa.',503);}
}
export function publicBase(env) {
 const u=new URL(env.KBL_PUBLISHER_PUBLIC_BASE_URL||'https://tiemvangkimbaolam.id.vn');
 if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash) throw err('KBL_PUBLISHER_PUBLIC_BASE_URL phải là HTTPS gốc.',503);
 return u.origin;
}
export function configFor(env,platform) {
 const p=SOCIAL_PROVIDERS[platform];if(!p||platform==='telegram')throw err('Nền tảng OAuth không hợp lệ.');
 if(!env[p.client]||!env[p.secret])throw err('Chưa khai báo '+p.client+' và '+p.secret+'.',503);
 const version=env.KBL_META_GRAPH_VERSION;
 if(['facebook','instagram'].includes(platform)&&!/^v\d{2}\.0$/.test(version||''))throw err('Cần KBL_META_GRAPH_VERSION theo phiên bản app Meta đang dùng.',503);
 return {...p,clientId:env[p.client],clientSecret:env[p.secret],auth:p.auth.replace('{version}',version),token:p.token.replace('{version}',version),redirectUri:publicBase(env)+'/api/admin/social/oauth/'+platform+'/callback',graph:'https://graph.facebook.com/'+version};
}
export async function authorization(env,platform,state,verifier,{inbox=false}={}) {
 const p=configFor(env,platform),u=new URL(p.auth);
 const inboxScopes={facebook:['pages_read_user_content','pages_manage_engagement','pages_messaging','pages_manage_metadata'],instagram:['instagram_manage_comments','instagram_manage_messages','pages_manage_metadata'],threads:['threads_read_replies','threads_manage_replies'],youtube:['https://www.googleapis.com/auth/youtube.force-ssl']};
 p.scopes=[...p.scopes,...(inbox?inboxScopes[platform]||[]:[])];
 const params={response_type:'code',redirect_uri:p.redirectUri,state};
 params[platform==='tiktok'?'client_key':platform==='zalo'?'app_id':'client_id']=p.clientId;
 if(p.scopes.length)params.scope=p.scopes.join(platform==='youtube'?' ':',');
 if(p.pkce){params.code_challenge=url64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));if(platform!=='zalo')params.code_challenge_method='S256';}
 if(platform==='youtube')Object.assign(params,{access_type:'offline',prompt:'consent',include_granted_scopes:'true'});
 if(['facebook','instagram'].includes(platform))params.auth_type='rerequest';
 for(const [key,value]of Object.entries(params))u.searchParams.set(key,value);
 return u.href;
}
// Never forward provider response/error text: many APIs echo tokens or request URLs.
/** @param {string} url @param {any} options */
export async function providerJSON(url,options={}) {
 const {fetcher=fetch,...init}=options;
 let response;try{response=await fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw err('Không nhận được phản hồi mạng xã hội. Trạng thái chưa xác định; kiểm tra kết nối trước khi thử lại.',502);}
 let data;try{const text=await response.text();if(text.length>1024*1024)throw Error();data=JSON.parse(text);}catch{throw err('Nền tảng trả dữ liệu không hợp lệ.',502);}
 const providerError=data.error && !(typeof data.error==='object' && data.error.code==='ok');
 if(!response.ok||providerError||data.ok===false||data.error_code)throw err('Nền tảng từ chối yêu cầu. Kiểm tra quyền ứng dụng, tài khoản và thời hạn token.',502);
 return data;
}
const form=(params,headers={})=>({method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(params)});
/** @param {any} env @param {string} platform @param {any} grant @param {any} fetcher */
export async function exchange(env,platform,grant,fetcher=fetch) {
 const {code,verifier,refreshToken}=grant;
 const p=configFor(env,platform),refresh=!!refreshToken;
 let params={grant_type:refresh?'refresh_token':'authorization_code',...(refresh?{refresh_token:refreshToken}:{code,redirect_uri:p.redirectUri})},headers={};
 if(platform==='zalo'){params.app_id=p.clientId;headers.secret_key=p.clientSecret;if(!refresh)params.code_verifier=verifier;}
 else{params[platform==='tiktok'?'client_key':'client_id']=p.clientId;params.client_secret=p.clientSecret;if(p.pkce&&!refresh)params.code_verifier=verifier;}
 let data;
 if(refresh&&platform==='threads')data=await providerJSON('https://graph.threads.net/refresh_access_token?'+new URLSearchParams({grant_type:'th_refresh_token',access_token:refreshToken}),{fetcher});
 else if(refresh&&['facebook','instagram'].includes(platform))throw err('Meta cần kết nối lại khi hết quyền; không gửi lại token hết hạn.',409);
 else data=await providerJSON(p.token,{...form(params,headers),fetcher});
 if(!data.access_token)throw err('Nền tảng chưa cấp access token.',502);
 if(!refresh&&['facebook','instagram'].includes(platform))data=await providerJSON(p.token+'?'+new URLSearchParams({grant_type:'fb_exchange_token',client_id:p.clientId,client_secret:p.clientSecret,fb_exchange_token:data.access_token}),{fetcher});
 if(!refresh&&platform==='threads')data=await providerJSON('https://graph.threads.net/access_token?'+new URLSearchParams({grant_type:'th_exchange_token',client_secret:p.clientSecret,access_token:data.access_token}),{fetcher});
 return {accessToken:data.access_token,refreshToken:platform==='threads'?data.access_token:data.refresh_token||refreshToken||null,expiresAt:Number(data.expires_in)>0?Date.now()+Number(data.expires_in)*1000:null,scope:typeof data.scope==='string'?data.scope.split(/[ ,]+/).filter(Boolean):null,openId:data.open_id||null};
}
export async function targetList(env,platform,tokens,fetcher=fetch) {
 const access=tokens.accessToken,auth={Authorization:'Bearer '+access};
 if(['facebook','instagram'].includes(platform)){
  const p=configFor(env,platform),data=await providerJSON(p.graph+'/me/accounts?fields=id,name,access_token,tasks,instagram_business_account{id,username}&limit=100',{headers:auth,fetcher});
  return (data.data||[]).filter(x=>platform==='facebook'||x.instagram_business_account?.id).map(x=>({id:platform==='facebook'?String(x.id):String(x.instagram_business_account.id),label:platform==='facebook'?x.name:x.instagram_business_account.username||x.name,pageId:String(x.id),accessToken:x.access_token,tasks:x.tasks||[]}));
 }
 if(platform==='youtube'){const data=await providerJSON('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true',{headers:auth,fetcher});return(data.items||[]).map(x=>({id:x.id,label:x.snippet?.title||x.id}));}
 if(platform==='threads'){const data=await providerJSON('https://graph.threads.net/v1.0/me?fields=id,username',{headers:auth,fetcher});return[{id:String(data.id),label:data.username||'Threads'}];}
 if(platform==='tiktok'){const data=await providerJSON('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',{headers:auth,fetcher});if(data.error?.code&&data.error.code!=='ok')throw err('Không đọc được tài khoản TikTok.',502);return[{id:data.data.user.open_id,label:data.data.user.display_name||'TikTok'}];}
 if(platform==='zalo'){const data=await providerJSON('https://openapi.zalo.me/v2.0/oa/getoa',{headers:{access_token:access},fetcher});if(!data.data?.oa_id)throw err('Chưa nhận được định danh Zalo OA.',502);return[{id:String(data.data.oa_id),label:data.data.name||'Zalo OA'}];}
 throw err('Nền tảng không hỗ trợ.');
}
export function publicConnection(row) {return {id:row.id,platform:row.platform,label:row.label,status:row.status,inboxRequested:row.inboxRequested===true,targetId:row.targetId||null,targetLabel:row.targetLabel||null,expiresAt:row.expiresAt||null,scope:row.scope||null,scopeVerified:Array.isArray(row.scope),connectedAt:row.connectedAt||null,updatedAt:row.updatedAt||null,lastError:row.lastError||null};}
export const safeTargets=targets=>targets.map(x=>({id:x.id,label:x.label,pageId:x.pageId||null}));
