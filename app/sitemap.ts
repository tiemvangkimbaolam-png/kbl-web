import type {MetadataRoute} from 'next';
import {list} from '@/lib/kbl/store';
import {locked} from '@/lib/kbl/pos';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 const base='https://tiemvangkimbaolam.id.vn';
 const posBound=await locked();
 const [products,articles]=await Promise.all([list('product',500),list('article',1000)]);
 return [{url:base+'/'},...products.filter((p:any)=>p.published&&p.available&&(!posBound||p.source==='pos')).map((p:any)=>({url:base+'/vi/san-pham/'+encodeURIComponent(p.sku),lastModified:new Date(p.updatedAt)})),...articles.map((a:any)=>({url:base+'/tin-tuc/'+a.id,lastModified:new Date(a.updatedAt)}))];
}
