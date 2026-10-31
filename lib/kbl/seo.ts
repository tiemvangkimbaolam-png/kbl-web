import type {Metadata} from 'next';
export const BASE='https://tiemvangkimbaolam.id.vn';
export const CATEGORIES=[['tat-ca','Sản phẩm đang trưng bày','all'],['nhan','Nhẫn','ring'],['day-chuyen','Dây chuyền','necklace'],['mat-day','Mặt dây','pendant'],['bong-tai','Bông tai','earring'],['lac-tay','Lắc tay','bracelet'],['vong','Vòng','bangle'],['vang-9999-980','Trang sức vàng 999.9 / 980','gold-group']] as const;
export function pageSEO(title:string,description:string,path:string,image='/kbl-logo.png'):Metadata{return {title,description,alternates:{canonical:BASE+path},openGraph:{type:'website',locale:'vi_VN',siteName:'Tiệm Vàng Kim Bảo Lâm',title,description,url:BASE+path,images:[{url:BASE+image}]},twitter:{card:'summary_large_image',title,description,images:[BASE+image]}};}
export const productURL=(p:any)=>'/vi/san-pham/'+encodeURIComponent(p.sku);
export const jsonLD=(v:any)=>JSON.stringify(v).replace(/</g,'\\u003c');
export function storeLD(company:any){return {'@context':'https://schema.org','@type':'JewelryStore','@id':BASE+'/#tiem',name:company.name||'Tiệm Vàng Kim Bảo Lâm',url:BASE+'/',logo:BASE+'/kbl-logo.png',...(company.address?{address:company.address}:{}),...(company.phone?{telephone:company.phone}:{})};}
