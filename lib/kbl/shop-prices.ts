import * as S from './store';
import * as POS from './pos';
import {publicCloudPrices} from './cloud-price';
import {selectShopPrices,SHOP_ADDRESS} from './shop-prices-core.mjs';
export {SHOP_ADDRESS};
export async function readShopPrices(){
 const [prices,cloudPrice,bound]=await Promise.all([S.list('price',40),publicCloudPrices(),POS.locked()]);
 const selected=selectShopPrices({prices,cloudPrice,bound});
 return {...selected,snapshotId:await S.sha(JSON.stringify(selected.prices)),cloudPrice,bound};
}
