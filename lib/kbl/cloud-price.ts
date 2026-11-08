import { env } from 'cloudflare:workers';
import * as S from './store';
import { seal, unseal } from './social-core.mjs';
import { CLOUD_GOLD_RULES, normalizeCloudMarkup, normalizeCloudPollMs, safeCloudSpreads, validateRelayURL, fetchCloudRelay, deriveCloudPrices, publicCloudSnapshot } from './cloud-price-core.mjs';
const E=()=>env as any;
const fail=(message:string,status=422)=>{throw Object.assign(Error(message),{status});};
const key=()=>E().KBL_PRICE_ENCRYPTION_KEY||E().KBL_SOCIAL_ENCRYPTION_KEY;
const vaultAAD='kbl-cloud-price-config:1';
async function storedConfig(){return S.get('cloud-price-config','main');}
async function effectiveConfig(){
 const stored=await storedConfig();
 if(stored?.enabled===false)return{enabled:false,configured:false,pollMs:stored.pollMs||12000,markupVnd:stored.markupVnd||0,spreads:stored.spreads||{},version:stored.version,identity:'disabled-'+stored.version};
 if(stored?.workerId&&(await S.get('pos-binding','main'))?.workerId!==stored.workerId)fail('Nguồn cấu hình giá đã đổi Windows; cần POS bàn giao lại.',409);
 const privateConfig=stored?.vault?await unseal(stored.vault,key(),vaultAAD):{};
 const relayUrl=privateConfig.relayUrl||E().KBL_GOOGLE_RELAY_URL||'',relayToken=privateConfig.relayToken||E().KBL_GOOGLE_RELAY_TOKEN||'';
 const enabled=E().KBL_GOOGLE_PRICE_AUTO==='0'?false:stored?.enabled!==false;
 let spreadsInput=stored?.spreads;
 if(!spreadsInput&&E().KBL_GOOGLE_PRICE_SPREADS_JSON){try{spreadsInput=JSON.parse(E().KBL_GOOGLE_PRICE_SPREADS_JSON);}catch{fail('Cấu hình chênh lệch giá cloud chưa hợp lệ.');}}
 const markupInput=stored?.markupVnd??E().KBL_GOOGLE_PRICE_MARKUP_VND;
 const parametersReady=spreadsInput&&CLOUD_GOLD_RULES.every(r=>Object.hasOwn(spreadsInput,r.code))&&markupInput!==undefined&&markupInput!==null&&markupInput!==''&&Number.isFinite(Number(markupInput));
 const markupVnd=parametersReady?normalizeCloudMarkup(markupInput):null,pollMs=normalizeCloudPollMs(stored?.pollMs??E().KBL_GOOGLE_PRICE_POLL_MS??12000),spreads=parametersReady?safeCloudSpreads(spreadsInput):{};
 if(relayUrl)validateRelayURL(relayUrl);
 return{enabled,configured:!!(relayUrl&&relayToken&&parametersReady),relayUrl,relayToken,markupVnd,pollMs,spreads,version:stored?.version||0,workerId:stored?.workerId||null,identity:await S.sha(JSON.stringify({version:stored?.version||0,relayUrl,relayToken,markupVnd,spreads,enabled}))};
}
export async function configureCloudPrice(workerId:string,input:any){
 if((await S.get('pos-binding','main'))?.workerId!==workerId)fail('Chỉ Windows đã ghép POS mới được bàn giao cấu hình giá.',409);
 const raw=input?.config||input;if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('Cấu hình giá không hợp lệ.');
 const old=await storedConfig(),revision=input?.revision??raw.revision??0;
 if(!Number.isSafeInteger(revision)||revision<0||revision>Number.MAX_SAFE_INTEGER)fail('Số thứ tự cấu hình giá không hợp lệ.');
 if(old?.revision>revision)fail('Cấu hình giá cũ; không ghi đè bản mới.',409);
 if(raw.enabled!==undefined&&typeof raw.enabled!=='boolean')fail('Trạng thái giá phải là true hoặc false.');
 if(!old&&typeof raw.enabled!=='boolean')fail('Lần bàn giao đầu cần trạng thái bật/tắt rõ ràng.');
 const enabled=raw.enabled??old?.enabled??false;
 if(enabled){
  const hasPrior=old?.spreads&&CLOUD_GOLD_RULES.every(r=>Object.hasOwn(old.spreads,r.code))&&Number.isFinite(old.markupVnd);
  if(!hasPrior&&(!raw.spreads||!CLOUD_GOLD_RULES.every(r=>Object.hasOwn(raw.spreads,r.code))||raw.markupVnd===undefined))fail('Lần bật đầu cần đủ sáu chênh lệch mua/bán và mức cộng do POS bàn giao; không tự đoán.');
  if(raw.markupVnd!==undefined&&(raw.markupVnd===null||raw.markupVnd===''||typeof raw.markupVnd==='boolean'||!Number.isFinite(Number(raw.markupVnd))))fail('Mức cộng giá POS không hợp lệ.');
 }
 let value:any={enabled,workerId,revision,pollMs:old?.pollMs||12000,markupVnd:old?.markupVnd??100000,spreads:old?.spreads||{}};
 if(!enabled){value.vault=old?.vault||null;}
 else{if(!/^[a-f0-9]{64}$/.test(key()||''))fail('Cần secret KBL_PRICE_ENCRYPTION_KEY hoặc KBL_SOCIAL_ENCRYPTION_KEY gồm 64 ký tự hex.',503);const prior=old?.vault?await unseal(old.vault,key(),vaultAAD):{};const relayUrl=validateRelayURL(raw.relayUrl||prior.relayUrl||E().KBL_GOOGLE_RELAY_URL),relayToken=raw.relayToken||prior.relayToken||E().KBL_GOOGLE_RELAY_TOKEN||'';if(typeof relayToken!=='string'||relayToken.length<8||relayToken.length>2048||/[\r\n\u0000]/.test(relayToken))fail('Relay token bị thiếu hoặc không đúng định dạng.');const spreads=safeCloudSpreads(raw.spreads||{},old?.spreads),markupVnd=normalizeCloudMarkup(raw.markupVnd,old?.markupVnd??100000),pollMs=normalizeCloudPollMs(raw.pollMs??old?.pollMs??12000);value={...value,spreads,markupVnd,pollMs,vault:await seal({relayUrl,relayToken},key(),vaultAAD)};}
 const digest=await S.sha(JSON.stringify({...value,vault:enabled&&value.vault?await unseal(value.vault,key(),vaultAAD):null}));
 if(old?.revision===revision&&old.digest){if(old.digest===digest)return{success:true,duplicate:true,wroteToPOS:false,cloudPrice:await cloudPriceStatus()};fail('Cấu hình khác nội dung cùng số thứ tự; giữ bản hiện tại.',409);}
 value.digest=digest;const at=Date.now();
 const changed=await S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) SELECT 'cloud-price-config','main',?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE kind='pos-binding' AND id='main' AND json_extract(data,'$.workerId')=?) AND NOT EXISTS(SELECT 1 FROM records WHERE kind='cloud-price-config' AND id='main' AND version<>?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,version=records.version+1,updated_at=excluded.updated_at RETURNING id").bind(JSON.stringify(value),at,at,workerId,old?.version??0).first();
 if(!changed)fail('Nguồn hoặc phiên bản cấu hình vừa thay đổi; giữ bản hiện tại.',409);
 return{success:true,wroteToPOS:false,cloudPrice:await cloudPriceStatus()};
}
export async function cloudPriceStatus(){
 const [stored,state,snapshot]=await Promise.all([storedConfig(),S.get('cloud-price-state','main'),S.get('cloud-price-snapshot','main')]);let config:any;try{config=await effectiveConfig();}catch{config={enabled:stored?.enabled!==false,configured:false,markupVnd:stored?.markupVnd||0,pollMs:stored?.pollMs||12000};}const view=publicCloudSnapshot(snapshot,state,config);
 return{enabled:config.enabled,configured:config.configured,encryptionReady:/^[a-f0-9]{64}$/.test(key()||''),symbol:'BK',markupVnd:config.markupVnd,pollMs:config.pollMs,revision:stored?.revision||0,lastCheckAt:state?.lastCheckAt||null,lastSuccessAt:snapshot?.fetchedAt||null,lastChangedAt:state?.lastChangedAt||null,finalSell9999:snapshot?.finalSell9999||null,sourceBaseVnd:snapshot?.sourceBaseVnd||null,observedAt:snapshot?.observedAt||null,timestampKind:view.timestampKind,fresh:view.fresh,busy:!!(state?.busyUntil>Date.now()),message:!config.enabled?'Giá cloud đang tắt; giữ bản cuối.':!config.configured?'Cần POS bàn giao cấu hình Relay và khóa mã hóa server.':state?.lastError?'Chưa áp dụng giá mới; giữ bản cloud cuối và đánh dấu cũ.':snapshot?'Đã lấy BK/ASK trên server. Thời điểm tải không mặc nhiên là thời điểm giá nguồn.':'Đã có cấu hình; chờ lấy giá.',lastError:state?.lastError||null,error:state?.lastError||null};
}
export async function pollCloudPrice(options:any={}){
 const at=options.now??Date.now();let config:any;try{config=await effectiveConfig();}catch{await S.put('cloud-price-state','main',{lastCheckAt:at,lastError:'Chưa đọc được cấu hình giá cloud; kiểm tra khóa mã hóa và nguồn đã ghép.'});return cloudPriceStatus();}if(!config.enabled||!config.configured)return cloudPriceStatus();const before=await S.get('cloud-price-state','main');if(!options.force&&before?.lastCheckAt&&at-before.lastCheckAt<config.pollMs)return cloudPriceStatus();
 const lockValue=String(at+30000),lock=await S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) VALUES('cloud-price-lock','main',?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at WHERE CAST(records.data AS INTEGER)<? RETURNING id").bind(lockValue,at,at,at).first();if(!lock)return cloudPriceStatus();const old=await S.get('cloud-price-snapshot','main'),posBase=old?null:await S.get('price','pos-9999');
 try{await S.put('cloud-price-state','main',{...before,lastCheckAt:at,busyUntil:at+30000});const source=await fetchCloudRelay(config,{fetcher:options.fetcher||fetch,now:at}),derived=deriveCloudPrices(source.askRaw,config.markupVnd,config.spreads,old?.finalSell9999||Number(posBase?.sell)||0);if((await effectiveConfig()).identity!==config.identity)fail('Cấu hình giá vừa thay đổi; không áp dụng kết quả cũ.',409);const changed=!old||JSON.stringify(old.values)!==JSON.stringify(derived.values),snapshot={...source,...derived,source:'Google BK/ASK',symbol:'BK',unit:'đồng/chỉ',configIdentity:config.identity};
 const accepted=await S.sql().prepare("INSERT INTO records(kind,id,data,created_at,updated_at) SELECT 'cloud-price-snapshot','main',?,?,? WHERE ((?=0 AND NOT EXISTS(SELECT 1 FROM records WHERE kind='cloud-price-config' AND id='main')) OR EXISTS(SELECT 1 FROM records WHERE kind='cloud-price-config' AND id='main' AND version=? AND json_extract(data,'$.enabled')=1)) AND (? IS NULL OR EXISTS(SELECT 1 FROM records WHERE kind='pos-binding' AND id='main' AND json_extract(data,'$.workerId')=?)) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,version=records.version+1,updated_at=excluded.updated_at RETURNING id").bind(JSON.stringify(snapshot),at,at,config.version,config.version,config.workerId,config.workerId).first();if(!accepted)fail('Cấu hình giá vừa thay đổi; không áp dụng kết quả cũ.',409);
 await S.put('cloud-price-state','main',{lastCheckAt:at,lastChangedAt:changed?at:before?.lastChangedAt||at,lastError:null,busyUntil:0});
 }catch(error:any){const safe=error?.status&&typeof error.message==='string'?error.message:'Không nhận được giá Relay hợp lệ; giữ bảng giá cloud cuối.';await S.put('cloud-price-state','main',{lastCheckAt:at,lastChangedAt:before?.lastChangedAt||null,lastError:safe.slice(0,220),busyUntil:0});}finally{await S.sql().prepare("DELETE FROM records WHERE kind='cloud-price-lock' AND id='main' AND data=?").bind(lockValue).run();}return cloudPriceStatus();
}
export async function publicCloudPrices(){let config:any,configError=false;try{config=await effectiveConfig();}catch{const stored=await storedConfig();config={enabled:stored?.enabled!==false,configured:false};configError=true;}const state=await S.get('cloud-price-state','main');return publicCloudSnapshot(await S.get('cloud-price-snapshot','main'),configError?{...state,lastError:'Chưa đọc được cấu hình cloud; giữ bảng cuối và đánh dấu cũ.'}:state,config);}
