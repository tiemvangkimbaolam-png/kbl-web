import * as S from './store';
import {readShopPrices,SHOP_ADDRESS} from './shop-prices';
import {publicRead} from './public-cache.mjs';
// Shared by the server-rendered price page and public JSON; no catalog or account data.
export async function publicPrices(tv=false){return publicRead(tv?'prices-tv':'prices',async()=>{
 const shop=await readShopPrices(),cfg=tv?await S.settings():null;
 return{prices:shop.prices,priceSnapshot:shop.snapshotId,priceSource:shop.source,sourceAt:shop.sourceAt,stale:shop.stale,address:SHOP_ADDRESS,...(cfg?{company:{name:cfg.companyName,phone:cfg.phone,address:SHOP_ADDRESS,hours:cfg.hours}}:{})};
});}
