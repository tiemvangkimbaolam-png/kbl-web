import {env} from 'cloudflare:workers';
let cache:{at:number;key:string;models:any[]}|null=null;
export function rankGemini(models:any[],image=false){
 return models.filter(m=>m.supportedGenerationMethods?.includes('generateContent')&&/^models\/gemini-[a-zA-Z0-9._-]+$/.test(m.name)&&(/image|nano-banana/.test(m.name)===image)&&!/(live|audio|robotics|embedding)/.test(m.name)).sort((a,b)=>{
 const score=(m:any)=>{const v=m.name.match(/gemini-(\d+)(?:\.(\d+))?/);return Number(v?.[1]||0)*10000+Number(v?.[2]||0)*1000+(/pro/.test(m.name)?300:/flash/.test(m.name)?200:100)-(/lite/.test(m.name)?100:0)-(/preview|exp/.test(m.name)?50:0);};return score(b)-score(a)||a.name.localeCompare(b.name);
 }).map(m=>m.name.replace('models/',''));
}
export async function geminiModels(image=false,fetcher:typeof fetch=fetch){
 const e=env as any,key=e.GEMINI_API_KEY;if(!key)return [];
 if(!cache||cache.key!==key||Date.now()-cache.at>3600000){
  const all:any[]=[];let token='';
  try{for(let i=0;i<4;i++){const u='https://generativelanguage.googleapis.com/v1beta/models?pageSize=100'+(token?'&pageToken='+encodeURIComponent(token):'');const r=await fetcher(u,{redirect:'error',headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(5000)});if(!r.ok)break;const v=await r.json() as any;all.push(...(v.models||[]));token=v.nextPageToken||'';if(!token)break;}if(all.length)cache={at:Date.now(),key,models:all};}catch{}
 }
 const preferred=image?e.GEMINI_IMAGE_MODEL:e.GEMINI_CHAT_MODEL;
 return [...new Set([...(preferred&&/^[a-zA-Z0-9._-]+$/.test(preferred)&&(!image||rankGemini(cache?.key===key?(cache?.models||[]):[],true).includes(preferred))?[preferred]:[]),...rankGemini(cache?.key===key?(cache?.models||[]):[],image),...(!image?['gemini-2.5-flash']:[])])].slice(0,4);
}
export function invalidateGeminiModels(){cache=null;}
