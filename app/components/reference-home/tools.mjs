// Public website tools, copied from the user's existing published convention.
// These functions do not access or alter POS records or formulas.
export const RING_DIAMETERS = [13,13.4,13.7,14,14.3,14.7,15,15.3,15.6,16,16.2,16.6,16.9,17.2,17.5,17.8,18.2,18.5,18.8,19,19.4,19.7,20,20.4,20.7,21,21.3,21.7,22,22.3];
export function ringSize(value) {
  let raw=String(value).trim().toLowerCase().replace(/\s+/g,'');
  let scale=1;
  if(raw.endsWith('mm')) raw=raw.slice(0,-2);
  else if(raw.endsWith('cm')) {raw=raw.slice(0,-2);scale=10;}
  if(!/^\d+(?:[.,]\d+)?$/.test(raw)) throw Error('Nhập đường kính lọt lòng từ 10 đến 30 mm.');
  const diameter=Number(raw.replace(',','.'))*scale;
  if(diameter<10||diameter>30) throw Error('Nhập đường kính lọt lòng từ 10 đến 30 mm.');
  const index=RING_DIAMETERS.reduce((best,v,i)=>Math.abs(v-diameter)<Math.abs(RING_DIAMETERS[best]-diameter)?i:best,0);
  return {ni:index+1,diameter,standard:RING_DIAMETERS[index]};
}
function day(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Chọn đầy đủ ngày cầm và ngày chuộc.');
  const n=Date.parse(value+'T00:00:00Z');
  if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value) throw Error('Ngày chưa hợp lệ.');
  return n;
}
export function estimatePawn(principal,start,end) {
  const amount=Number(String(principal).replace(/[.\s,]/g,''));
  if(!Number.isFinite(amount)||!Number.isInteger(amount)||amount<=0||amount>1e12) throw Error('Nhập số tiền cầm hợp lệ.');
  const days=(day(end)-day(start))/86400000+1;
  if(days<1||days>3650) throw Error('Ngày chuộc cần từ ngày cầm trở đi, tối đa 10 năm.');
  const monthly=amount<50e6?3:amount<200e6?2.5:2.2;
  const interest=Math.round(amount*monthly/100*days/30);
  return {amount,days,monthly,interest,total:amount+interest};
}
export function perChi(value,unit='đồng/lượng') {
  if(!Number.isFinite(value)||value<0) return null;
  return unit==='đồng/lượng'?value/10:unit==='đồng/chỉ'?value:null;
}
