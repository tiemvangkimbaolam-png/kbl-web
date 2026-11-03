import {env} from 'cloudflare:workers';
import * as S from './store';
import {SOCIAL_PROVIDERS,seal,unseal,configFor} from './social-core.mjs';
const registry:any=SOCIAL_PROVIDERS;
const group=(p:string)=>p==='instagram'?'facebook':p;
function base(){const e=env as any;return {...e,KBL_SOCIAL_ENCRYPTION_KEY:e.KBL_SOCIAL_ENCRYPTION_KEY||e.KBL_PRICE_ENCRYPTION_KEY};}
export async function socialEnvironment(){
 const e=base();
 for(const row of await S.list('social-app',10)){
  const p=registry[row.id];if(!p||row.id==='telegram')continue;
  const v=await unseal(row.vault,e.KBL_SOCIAL_ENCRYPTION_KEY,'kbl-social-app:'+row.id);
  e[p.client]=v.clientId;e[p.secret]=v.clientSecret;
  if(row.id==='facebook')e.KBL_META_GRAPH_VERSION=v.graphVersion;
 }
 return e;
}
export async function saveSocialApplication(platform:string,value:any){
 const id=group(platform),p=registry[id];if(!p||id==='telegram')throw Object.assign(Error('Nền tảng không dùng cấu hình OAuth này.'),{status:400});
 if(!value||typeof value.clientId!=='string'||!value.clientId.trim()||value.clientId.length>512)throw Object.assign(Error('Nhập App / Client ID hợp lệ.'),{status:400});
 if(Object.keys(value).some(k=>!['clientId','clientSecret','graphVersion'].includes(k)))throw Object.assign(Error('Trường cấu hình không hợp lệ.'),{status:400});
 const e=await socialEnvironment(),clientId=value.clientId.trim(),old=await S.get('social-app',id);
 if(value.clientSecret!==undefined&&typeof value.clientSecret!=='string')throw Object.assign(Error('Secret không hợp lệ.'),{status:400});
 const secret=typeof value.clientSecret==='string'?value.clientSecret.trim():'';
 if(secret.length>4096)throw Object.assign(Error('Secret quá dài.'),{status:400});
 if(!secret&&e[p.client]!==clientId)throw Object.assign(Error('Đổi App ID cần nhập Secret tương ứng.'),{status:400});
 const cfg={clientId,clientSecret:secret||e[p.secret],...(id==='facebook'?{graphVersion:String(value.graphVersion||e.KBL_META_GRAPH_VERSION||'')}: {})};
 if(!cfg.clientSecret)throw Object.assign(Error('Cần nhập App / Client Secret.'),{status:400});
 configFor({...e,[p.client]:cfg.clientId,[p.secret]:cfg.clientSecret,...(id==='facebook'?{KBL_META_GRAPH_VERSION:cfg.graphVersion}:{})},platform);
 const vault=await seal(cfg,base().KBL_SOCIAL_ENCRYPTION_KEY,'kbl-social-app:'+id);
 await S.put('social-app',id,{vault},old?.version);
 // Never echo credentials in a response or event.
 await S.event('social-app-configured','Đã lưu cấu hình ứng dụng '+p.label+'. Cần OAuth để cấp quyền tài khoản.');
 return {saved:true};
}
