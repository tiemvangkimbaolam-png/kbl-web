import * as S from './store';
import {publicCloudPrices} from './cloud-price';
import {readWorldMarket} from './market.mjs';
import {displayGoldPrices} from './display-prices.mjs';
export async function capturePriceHistory(at=Date.now()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)),v=(key:string)=>parts.find(p=>p.type===key)?.value,date=v('year')+'-'+v('month')+'-'+v('day');
 if(Number(v('minute'))%5===0){const market=await readWorldMarket();const observed=Date.parse(market?.fetchedAt||'');if(market.available&&!market.stale&&Math.abs(at-observed)<300000){const id=String(Math.floor(at/300000));await S.sql().prepare("INSERT OR IGNORE INTO records(kind,id,data,created_at,updated_at) VALUES('history-world',?,?,?,?)").bind(id,JSON.stringify({at:observed,xauUsd:market.xauUsd,source:market.source}),at,at).run();}}
 if(v('hour')==='13'&&Number(v('minute'))<5){const cloud=await publicCloudPrices(),rows=displayGoldPrices(cloud.active&&cloud.fresh?cloud.prices:(await S.list('price',40)).filter((p:any)=>p.source==='POS Kim Bảo Lâm'&&at-p.capturedAt<300000&&p.capturedAt<=at+60000));if(rows.length===3&&rows.every((r:any)=>r.buy>0&&r.sell>=r.buy)){await S.sql().prepare("INSERT OR IGNORE INTO records(kind,id,data,created_at,updated_at) VALUES('history-vn',?,?,?,?)").bind(date,JSON.stringify({date,at,rows:rows.map((r:any)=>({code:r.code||r.id.replace(/^(pos|cloud)-/,''),label:r.label,buy:r.buy,sell:r.sell,unit:r.unit,observedAt:r.capturedAt})),anchor:'13:00 Asia/Ho_Chi_Minh'}),at,at).run();}}
 await S.sql().prepare("DELETE FROM records WHERE kind='customer-rate' AND created_at<?").bind(at-86400000).run();
 // Keep world points bounded; VN daily history is compact.
 await S.sql().prepare("DELETE FROM records WHERE kind='history-world' AND created_at<?").bind(at-30*86400000).run();
}
export async function readPriceHistory(days=7){const cutoff=Date.now()-Math.min(30,Math.max(1,Number.isFinite(days)?days:7))*86400000;const rows=await S.sql().prepare("SELECT kind,id,data FROM records WHERE kind IN ('history-vn','history-world') AND created_at>=? ORDER BY created_at LIMIT 10000").bind(cutoff).all<any>();return{vietnam:rows.results.filter(x=>x.kind==='history-vn').map(x=>JSON.parse(x.data)),world:rows.results.filter(x=>x.kind==='history-world').map(x=>JSON.parse(x.data)),anchor:'13:00 Asia/Ho_Chi_Minh'};}
