import {notFound} from 'next/navigation';import {publicCatalog} from '@/lib/kbl/public-catalog';import {pageSEO} from '@/lib/kbl/seo';
import { list, settings } from '@/lib/kbl/store';
import { locked } from '@/lib/kbl/pos';
import { Brand } from '@/app/components/ui';
import ProductDetails from '@/app/components/product-details';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:any){const {sku}=await params,data=await publicCatalog(),p=data.products.find(p=>p.sku===sku);if(!p)return {title:'Sản phẩm chưa trưng bày',robots:{index:false,follow:false}};return pageSEO(p.name+' · Vàng '+p.purity+' | Kim Bảo Lâm',(p.description||('Mã '+p.sku+'. Xem ảnh, tuổi vàng, trọng lượng và giá tham khảo; tiệm xác nhận trước giao dịch.')).slice(0,170),'/vi/san-pham/'+encodeURIComponent(p.sku),p.imageIds[0]?'/api/media/'+p.imageIds[0]:'/kbl-logo.png');}

export default async function ProductQR({params}:{params:Promise<{sku:string}>}){
 const {sku}=await params, data=await publicCatalog(),cfg=data.company;const p=data.products.find(v=>v.sku===sku);if(!p)notFound();
 return <><header className="masthead"><div className="wrap"><Brand/><a href="/" className="button quiet">Xem cửa hàng</a></div></header><main className="article-page">{p?<><p className="eyebrow">SẢN PHẨM TỪ KHO POS</p><h1>{p.name}</h1><p>Mã: {p.sku}</p><ProductDetails product={p}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({'@context':'https://schema.org','@type':'Product',name:p.name,sku:p.sku,url:'https://tiemvangkimbaolam.id.vn/vi/san-pham/'+encodeURIComponent(p.sku),image:(p.imageIds||[]).map((id:string)=>'https://tiemvangkimbaolam.id.vn/api/media/'+id),description:p.description||p.name,offers:p.price>0?{'@type':'Offer',priceCurrency:'VND',price:p.price,availability:'https://schema.org/InStock',url:'https://tiemvangkimbaolam.id.vn/vi/san-pham/'+encodeURIComponent(p.sku)}:undefined}).replace(/</g,'\\u003c')}}/></>:<><h1>Sản phẩm hiện chưa trưng bày</h1><p>Hàng có thể đã bán hoặc đang chờ đồng bộ. Vui lòng liên hệ cửa hàng để kiểm tra.</p></>}{cfg.phone&&<a className="button" href={'tel:'+cfg.phone.replace(/[^+0-9]/g,'')}>Liên hệ cửa hàng</a>}</main></>;
}
