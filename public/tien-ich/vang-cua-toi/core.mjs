// Customer-entered ledger only; never reads or changes POS financial formulas.
export const HOLDING_CODES = ['9999','980','750','610','585','416'];
const fail = message => { throw Object.assign(Error(message),{status:400}); };
const round = (a,b) => (a+b/2n)/b;
export function quantityUnits(value){
 if(typeof value!=='string'||!/^\d{1,5}(?:[.,]\d{1,3})?$/.test(value.trim()))fail('Số chỉ cần lớn hơn 0, tối đa 3 số lẻ.');
 const [a,b='']=value.trim().replace(',','.').split('.'),n=Number(a)*1000+Number(b.padEnd(3,'0'));
 if(!Number.isSafeInteger(n)||n<1||n>10000000)fail('Mỗi giao dịch từ 0,001 đến 10.000 chỉ.');return n;
}
export function holdingEntry(v,today=new Date(Date.now()+7*3600000).toISOString().slice(0,10)){
 if(!v||typeof v!=='object'||typeof v.id!=='string'||!/^[a-f0-9-]{16,64}$/i.test(v.id||'')||!['buy','sell'].includes(v.kind)||!HOLDING_CODES.includes(v.code))fail('Giao dịch hoặc loại vàng chưa hợp lệ.');
 if(typeof v.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||v.date<'1970-01-01'||v.date>today||!Number.isFinite(Date.parse(v.date+'T00:00:00Z'))||new Date(v.date+'T00:00:00Z').toISOString().slice(0,10)!==v.date)fail('Chọn ngày giao dịch hợp lệ, không ở tương lai.');
 if(!Number.isSafeInteger(v.totalVnd)||v.totalVnd<1||v.totalVnd>1e12)fail('Tổng tiền thực trả/nhận cần là số nguyên từ 1 đến 1.000 tỷ đồng.');
 if(v.note!==undefined&&(typeof v.note!=='string'||v.note.length>160))fail('Ghi chú tối đa 160 ký tự.');
 return {id:v.id,kind:v.kind,code:v.code,date:v.date,units:quantityUnits(v.quantityChi),totalVnd:v.totalVnd,note:(v.note||'').trim()};
}
export function ledgerPositions(entries){
 if(!Array.isArray(entries)||entries.length>500)fail('Sổ hỗ trợ tối đa 500 giao dịch.');
 const positions=new Map(),ids=new Set();let totalPaid=0n,totalReceived=0n,realized=0n;
 const ordered=entries.map((e,index)=>({...e,index})).sort((a,b)=>a.date.localeCompare(b.date)||a.index-b.index);
 for(const e of ordered){
  if(ids.has(e.id)||!HOLDING_CODES.includes(e.code)||!['buy','sell'].includes(e.kind)||!Number.isSafeInteger(e.units)||e.units<1||e.units>10000000||!Number.isSafeInteger(e.totalVnd)||e.totalVnd<1||e.totalVnd>1e12)fail('Dữ liệu giao dịch chưa hợp lệ.');ids.add(e.id);
  const p=positions.get(e.code)||{code:e.code,units:0,cost:0n},amount=BigInt(e.totalVnd);
  if(e.kind==='buy'){p.units+=e.units;p.cost+=amount;totalPaid+=amount;}
  else{if(e.units>p.units)fail('Không thể bán nhiều hơn số vàng đang có tại ngày '+e.date+'.');const basis=round(p.cost*BigInt(e.units),BigInt(p.units));p.units-=e.units;p.cost-=basis;totalReceived+=amount;realized+=amount-basis;}
  positions.set(e.code,p);
 }
 return {positions:[...positions.values()].filter(p=>p.units).map(p=>({code:p.code,units:p.units,costVnd:Number(p.cost),averageVndPerChi:Number(round(p.cost*1000n,BigInt(p.units)))})),totalPaidVnd:Number(totalPaid),totalReceivedVnd:Number(totalReceived),realizedVnd:Number(realized)};
}
export function holdingPrices(rows,now=Date.now()){
 const map=new Map();
 for(const r of Array.isArray(rows)?rows:[]){
  const identity=String(r.code||r.purity||r.label||r.id||'').replace(/999\.9/g,'9999'),code=HOLDING_CODES.find(c=>new RegExp('(?:^|[^0-9])'+c+'(?:[^0-9]|$)').test(identity));
  const divide=r.unit==='đồng/chỉ'?1:r.unit==='đồng/lượng'||!r.unit?10:0,buy=r.buy/divide;
  if(!code||!divide||!Number.isSafeInteger(buy)||buy<=0||buy>=1e9||typeof r.capturedAt!=='number'||!Number.isFinite(r.capturedAt)||r.capturedAt<1e12||r.capturedAt>now+90000||now-r.capturedAt>=86400000)continue;
  const row={code,buy,capturedAt:r.capturedAt,stale:r.stale===true||now-r.capturedAt>1800000};
  if(!map.has(code)||map.get(code).capturedAt<row.capturedAt)map.set(code,row);
 }return map;
}
export function holdingSummary(entries,rows,now=Date.now()){
 const ledger=ledgerPositions(entries),prices=holdingPrices(rows,now),missingCodes=[];
 const positions=ledger.positions.map(p=>{const q=prices.get(p.code);if(!q)missingCodes.push(p.code);return {...p,buyVndPerChi:q?.buy??null,valueVnd:q?Number(round(BigInt(q.buy)*BigInt(p.units),1000n)):null};});
 const costVnd=positions.reduce((n,p)=>n+p.costVnd,0),valueVnd=missingCodes.length?null:positions.reduce((n,p)=>n+p.valueVnd,0),gainVnd=valueVnd===null?null:valueVnd-costVnd;
 const observed=positions.flatMap(p=>prices.has(p.code)?[prices.get(p.code)]:[]);
 return {...ledger,positions,totalUnits:positions.reduce((n,p)=>n+p.units,0),costVnd,valueVnd,gainVnd,gainPct:gainVnd===null||!costVnd?null:gainVnd/costVnd*100,missingCodes,stale:observed.some(p=>p.stale),sourceAt:observed.length?Math.min(...observed.map(p=>p.capturedAt)):null};
}
export function holdingSeries(entries,history,rows,now=Date.now()){
 const points=[];
 for(const h of (history||[]).slice(-30).sort((a,b)=>a.at-b.at)){
  if(!Number.isFinite(h.at)||h.at>now||h.at<now-31*86400000)continue;
  const date=new Date(h.at+7*3600000).toISOString().slice(0,10),asOf=entries.filter(e=>e.date<date); // Exact intra-day trade time unknown: start plotting the following day.
  const priced=(h.rows||[]).map(r=>({...r,capturedAt:r.observedAt??h.at})),s=holdingSummary(asOf,priced,h.at);
  if(s.costVnd&&s.gainPct!==null&&!s.stale)points.push({at:h.at,value:s.gainPct});
 }
 const current=holdingSummary(entries,rows,now);
 if(current.costVnd&&current.gainPct!==null&&current.sourceAt&&!current.stale&&(!points.length||current.sourceAt>points[points.length-1].at))points.push({at:current.sourceAt,value:current.gainPct});
 return points;
}
export function holdingChart(points,width=600,height=160){
 const rows=(points||[]).filter(p=>Number.isFinite(p.at)&&Number.isFinite(p.value));if(rows.length<2)return '';
 const min=Math.min(...rows.map(p=>p.value)),max=Math.max(...rows.map(p=>p.value)),span=max-min||1,start=rows[0].at,duration=rows[rows.length-1].at-start||1;
 return rows.map(p=>`${(12+(p.at-start)*(width-24)/duration).toFixed(2)},${(height-12-(p.value-min)*(height-24)/span).toFixed(2)}`).join(' ');
}
