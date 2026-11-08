// Only explicitly public, account-independent JSON belongs here.
const ORIGIN='https://tiemvangkimbaolam.id.vn';
const allowed=new Map([['prices',5],['prices-tv',5],['catalog',30],['server-catalog',30],['tv-design',60]]);
export function createPublicReader({getCache=()=>typeof caches!=='undefined'?caches.default:null,clock=Date.now}={}){
 const flights=new Map();
 /** @template T
  * @param {string} key
  * @param {() => Promise<T>} load
  * @returns {Promise<T>}
  */
 async function publicRead(key,load){
  const ttl=allowed.get(key);if(!ttl)throw Error('Public cache key is not allowed.');
  const cache=getCache();if(!cache)return load();
  if(flights.has(key))return flights.get(key);
  const flight=(async()=>{
   const request=new Request(ORIGIN+'/__kbl_public_cache__/v2/'+key);
   try{const hit=await cache.match(request);if(hit){const v=await hit.json();if(Number.isFinite(v.expiresAt)&&v.expiresAt>clock())return v.data;}}catch{}
   const data=await load(); // Failure never extends an old quote's life.
   try{await cache.put(request,Response.json({data,expiresAt:clock()+ttl*1000},{headers:{'Cache-Control':'public,max-age='+ttl}}));}catch{}
   return data;
  })();
  flights.set(key,flight);
  try{return await flight;}finally{flights.delete(key);}
 }
 return publicRead;
}
export const publicRead=createPublicReader();
