import {env} from 'cloudflare:workers';
let cache:{at:number;key:string;models:any[]}|null=null;
const major=(name:string)=>Number(String(name).match(/^models\/gemini-(\d+)/)?.[1]||0);
export function rankGemini(models:any[],image=false){
 // Gemini 2.5 is legacy here: chat must move to the live 3.x family. Image
 // models may still be 2.5 on older keys, so only chat is restricted.
 return models.filter(m=>m.supportedGenerationMethods?.includes('generateContent')&&/^models\/gemini-[a-zA-Z0-9._-]+$/.test(m.name)&&(/image|nano-banana/.test(m.name)===image)&&!/(live|audio|robotics|embedding)/.test(m.name)&&(image||major(m.name)>=3)).sort((a,b)=>{
 const score=(m:any)=>{const v=m.name.match(/gemini-(\d+)(?:\.(\d+))?/);return Number(v?.[1]||0)*10000+Number(v?.[2]||0)*1000+(/pro/.test(m.name)?300:/flash/.test(m.name)?200:100)-(/lite/.test(m.name)?100:0)-(/preview|exp/.test(m.name)?50:0);};return score(b)-score(a)||a.name.localeCompare(b.name);
 }).map(m=>m.name.replace('models/',''));
}
const FALLBACK_CHAT=['gemini-3-flash-preview','gemini-3-pro-preview'];
export async function geminiModels(image=false,fetcher:typeof fetch=fetch){
 const e=env as any,key=e.GEMINI_API_KEY;if(!key)return [];
 if(!cache||cache.key!==key||Date.now()-cache.at>3600000){
  const all:any[]=[];let token='';
  try{for(let i=0;i<4;i++){const u='https://generativelanguage.googleapis.com/v1beta/models?pageSize=100'+(token?'&pageToken='+encodeURIComponent(token):'');const r=await fetcher(u,{redirect:'error',headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(5000)});if(!r.ok)break;const v=await r.json() as any;all.push(...(v.models||[]));token=v.nextPageToken||'';if(!token)break;}if(all.length)cache={at:Date.now(),key,models:all};}catch{}
 }
 const preferred=image?e.GEMINI_IMAGE_MODEL:e.GEMINI_CHAT_MODEL,ranked=rankGemini(cache?.key===key?(cache?.models||[]):[],image);
 const usable=preferred&&/^[a-zA-Z0-9._-]+$/.test(preferred)&&(image?ranked.includes(preferred):major('models/'+preferred)>=3)?[preferred]:[];
 return [...new Set([...usable,...ranked,...(image?[]:FALLBACK_CHAT)])].slice(0,4);
}
export function invalidateGeminiModels(){cache=null;}
