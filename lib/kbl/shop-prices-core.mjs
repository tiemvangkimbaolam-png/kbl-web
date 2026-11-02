// Select one whole shop snapshot for all public views and holdings. Never reprice POS.
const codes=['9999','980','750','610','585','416'];
export const SHOP_ADDRESS='59/1 Nguyễn Thị Tươi, Phường Tân Đông Hiệp, Tp. Hồ Chí Minh';
function normalized(rows,now){const map=new Map();for(const r of Array.isArray(rows)?rows:[]){
 const identity=String(r.code||r.purity||r.label||r.id||'').replace(/999\.9/g,'9999'),code=codes.find(c=>new RegExp('(?:^|[^0-9])'+c+'(?:[^0-9]|$)').test(identity));
 const unit=r.unit||'đồng/lượng',divide=unit==='đồng/chỉ'?1:unit==='đồng/lượng'?10:0;
 const at=r.observedAt??r.capturedAt;
 if(!code||!divide||typeof r.buy!=='number'||typeof r.sell!=='number'||!Number.isSafeInteger(r.buy/divide)||!Number.isSafeInteger(r.sell/divide)||r.buy<=0||r.sell<r.buy||r.sell/divide>=1e9||!Number.isFinite(at)||at<1e12||at>now+90000)continue;
 const next={...r,code,capturedAt:at,stale:r.stale===true||now-at>300000};if(!map.has(code)||map.get(code).capturedAt<at)map.set(code,next);
 }return codes.flatMap(c=>map.has(c)?[map.get(c)]:[]);}
/** @param {{prices?: any[], cloudPrice?: any, bound?: boolean, now?: number}} options */
export function selectShopPrices({prices=[],cloudPrice={},bound=false,now=Date.now()}={}){
 const pos=prices.filter(p=>String(p.id||'').startsWith('pos-')),local=normalized(pos.length?pos:bound?[]:prices,now),cloud=cloudPrice.active?normalized(cloudPrice.prices,now):[];
 const groups=[{source:pos.length?'pos':'shop',rows:local},{source:'cloud-shop',rows:cloud}].filter(g=>g.rows.some(r=>r.code==='9999'));
 for(const g of groups){g.at=Math.min(...g.rows.map(r=>r.capturedAt));g.stale=g.rows.some(r=>r.stale);}
 const rank=g=>g.stale?2:g.source==='pos'?0:1;
 groups.sort((a,b)=>rank(a)-rank(b)||b.at-a.at||(a.source==='pos'?-1:1));
 const chosen=groups[0];return {prices:chosen?.rows||[],source:chosen?.source||null,sourceAt:chosen?.at||null,stale:chosen?.stale??true};
}
