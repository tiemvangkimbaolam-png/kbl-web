const providers = new Set(['facebook','instagram','threads','youtube','tiktok','zalo']);
const hosts = {facebook:['www.facebook.com'],instagram:['www.facebook.com'],threads:['threads.net','www.threads.net','threads.com','www.threads.com'],youtube:['accounts.google.com'],tiktok:['www.tiktok.com'],zalo:['oauth.zaloapp.com']};
function validPlatform(value){if(!providers.has(value))throw Error('Nền tảng cấp quyền không hợp lệ.');return value;}
export function oauthIntent(href){
 const url=new URL(href),value=url.searchParams.get('connect');
 if(!value)return null;
 const platform=validPlatform(value),enableInbox=url.searchParams.get('inbox')==='1';
 url.searchParams.delete('connect');url.searchParams.delete('inbox');
 return {platform,enableInbox,cleanUrl:url.pathname+url.search+url.hash};
}
// Navigate through the callback origin before creating the owner-bound state.
// No credential, authorization code or token is passed between Admin hosts.
export async function beginOAuth({platform,baseUrl,currentUrl,enableInbox=false},{start,navigate,ready=(_url)=>{}}){
 validPlatform(platform);const base=new URL(baseUrl),current=new URL(currentUrl);
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('Địa chỉ OAuth máy chủ chưa hợp lệ.');
 if(current.origin!==base.origin){
  const handoff=new URL('/admin/ket-noi',base);handoff.searchParams.set('connect',platform);handoff.searchParams.set('inbox',enableInbox?'1':'0');
  navigate(handoff.href);return {handoff:true};
 }
 const value=await start(platform,{enableInbox}),url=new URL(value.authorizeUrl||'',base);
 if(!value.authorizeUrl||url.protocol!=='https:'||url.username||url.password||!hosts[platform].includes(url.hostname))throw Error('Máy chủ chưa trả đúng trang cấp quyền của nền tảng.');
 ready(url.href);navigate(url.href);return {handoff:false};
}
