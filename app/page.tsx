import Storefront from './components/storefront';import {publicCatalog} from '@/lib/kbl/public-catalog';import {jsonLD,storeLD,pageSEO} from '@/lib/kbl/seo';
export const dynamic='force-dynamic';
export const metadata=pageSEO('Tiệm Vàng Kim Bảo Lâm | Giá vàng & trang sức tại tiệm','Xem bảng giá vàng 999.9, 980, 610, trang sức đang trưng bày và thông tin liên hệ Tiệm Vàng Kim Bảo Lâm. Giá và tồn kho được xác nhận tại cửa hàng.','/');
export default async function Home(){const data=await publicCatalog();return <><Storefront reference initialData={data}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLD(storeLD(data.company))}}/></>;}
