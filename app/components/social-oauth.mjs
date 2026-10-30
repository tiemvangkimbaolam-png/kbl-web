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
// Start on the admin host that holds the Access session. The provider returns
// to the public callback host, and the worker forwards that result back to the
// Access-protected admin host; no credential or token is passed in between.
export async function beginOAuth({platform,baseUrl,enableInbox=false},{start,navigate,ready=(_url)=>{}}){
 validPlatform(platform);const base=new URL(baseUrl);
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('Địa chỉ OAuth máy chủ chưa hợp lệ.');
 const value=await start(platform,{enableInbox}),url=new URL(value.authorizeUrl||'',base);
 if(!value.authorizeUrl||url.protocol!=='https:'||url.username||url.password||!hosts[platform].includes(url.hostname))throw Error('Máy chủ chưa trả đúng trang cấp quyền của nền tảng.');
 ready(url.href);navigate(url.href);return {handoff:false};
}
