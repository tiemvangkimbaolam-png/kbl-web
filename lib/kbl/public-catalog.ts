import {cache} from 'react';
import * as S from './store';
import {readShopPrices,SHOP_ADDRESS} from './shop-prices';
import {publicProductDetails,productFacts} from './product-view.mjs';
import {publicRead} from './public-cache.mjs';
export const publicCatalog=cache(async function publicCatalog(){return publicRead('server-catalog',async()=>{const [cfg,shop,products,articles]=await Promise.all([S.settings(),readShopPrices(),S.list('product',500),S.list('article',1000)]);const {bound,cloudPrice}=shop;
 return {company:{name:cfg.companyName,phone:cfg.phone,address:SHOP_ADDRESS,hours:cfg.hours},products:products.filter((p:any)=>p.published&&p.available&&(!bound||p.source==='pos')).map((p:any)=>({id:p.id,sku:p.sku,name:p.name,description:p.description||'',purity:p.purity,weight:p.weight,price:p.price,category:p.category,source:p.source,published:true,available:true,displaySections:p.displaySections||[],imageIds:productFacts(p).imageIds,updatedAt:p.updatedAt,...publicProductDetails(p)})),prices:shop.prices,priceSnapshot:shop.snapshotId,priceSource:shop.source,cloudPrice,articles:articles.map((a:any)=>({id:a.id,headline:a.headline,summary:a.summary,conceptIllustration:a.conceptIllustration,images:a.images,publishedAt:a.publishedAt,updatedAt:a.updatedAt})),connected:true};});});
