import { list, settings } from '@/lib/kbl/store';
import { locked } from '@/lib/kbl/pos';
import { Brand } from '@/app/components/ui';
export const dynamic='force-dynamic';
export default async function ProductQR({params}:{params:Promise<{sku:string}>}){
 const {sku}=await params, cfg=await settings(), bound=await locked();
 const p=(await list('product',500)).find((v:any)=>v.sku===sku&&v.published&&v.available&&(!bound||v.source==='pos'));
 return <><header className="masthead"><div className="wrap"><Brand/><a href="/" className="button quiet">Xem cửa hàng</a></div></header><main className="article-page">{p?<><p className="eyebrow">SẢN PHẨM TỪ KHO POS</p><h1>{p.name}</h1><p>Mã: {p.sku}</p>{p.imageIds?.map((id:string)=><img key={id} src={'/api/media/'+id} alt={p.name} style={{maxWidth:'100%',borderRadius:16}}/>)}<p>Tuổi vàng: {p.purity} · Trọng lượng: {p.weight} g</p><h2>{typeof p.price==='number'?new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(p.price):'Liên hệ báo giá'}</h2><p>Giá theo dữ liệu POS đã đồng bộ, cửa hàng xác nhận lại tại thời điểm giao dịch.</p></>:<><h1>Sản phẩm hiện chưa trưng bày</h1><p>Hàng có thể đã bán hoặc đang chờ đồng bộ. Vui lòng liên hệ cửa hàng để kiểm tra.</p></>}{cfg.phone&&<a className="button" href={'tel:'+cfg.phone.replace(/[^+0-9]/g,'')}>Liên hệ cửa hàng</a>}</main></>;
}
