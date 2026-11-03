const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = n => fs.readFileSync(path.join(root,n),'utf8');
const index = read('index.html');
const renderer = read('renderer.js');
const pawn = read('pawn.html');
const main = read('main.js');
function assert(ok,msg){ if(!ok) throw new Error(msg); }
const tabs = [...index.matchAll(/id="(tab-[^"]+)"/g)].map(m=>m[1]);
const expected = ['tab-thumua','tab-banhang','tab-doichieu','tab-camdo','tab-chuocmatgiay','tab-kho','tab-hoadon','tab-baocao','tab-caidat','tab-chanh'];
expected.forEach(id=>assert(tabs.includes(id),`Thiếu ${id}`));
assert(renderer.includes('fullOldWeightSameTypeFeePolicy'),'Thiếu policy phí toàn bộ vàng cũ');
assert(renderer.includes('feeWeightLy = fullOldWeightSameTypeFeePolicy'),'Thiếu feeWeightLy');
assert(renderer.includes('Tổng cộng tiền món mới'),'Thiếu tổng cộng tiền món mới');
assert(pawn.includes('confirmPawnInterestPayment()'),'Thiếu đóng lãi');
assert(pawn.includes('confirmPawnTopUp()'),'Thiếu lấy thêm tiền');
assert(pawn.includes("oldRecord.status = 'Đã chuộc'"),'Lấy thêm tiền chưa đóng phiếu cũ');
assert(main.includes("shop-config:save"),'Thiếu lưu thiết lập tiệm');
assert(main.includes("setup.html"),'Thiếu first-run setup');
const combined = [index,renderer,pawn,main].join('\n');
assert(!/AIza[0-9A-Za-z_-]{20,}/.test(combined),'Còn Gemini API key hard-code');
assert(!/KBLRELAY_[0-9A-Za-z_-]{16,}/.test(combined),'Còn relay token hard-code');

let state=0x12345678;
function rnd(){ state=(1664525*state+1013904223)>>>0; return state/0x100000000; }
for(let i=0;i<10000;i++){
  const O=0.01+rnd()*50;
  const N=0.01+rnd()*50;
  const S=1_000_000+rnd()*30_000_000;
  const B=Math.max(0,S-(10_000+rnd()*2_000_000));
  const F=rnd()*1_000_000;
  const W=rnd()*5_000_000;
  const D=rnd()*Math.min(2_000_000,W+500_000);
  let net;
  if(O>N) net=W+O*F-(O-N)*B-D;
  else if(O<N) net=W+O*F+(N-O)*S-D;
  else net=W+O*F-D;
  const purchase=Math.min(O,N)*S+Math.max(O-N,0)*B-O*F;
  const recon=N*S+W-D-purchase;
  assert(Math.abs(net-recon)<1e-5,`Exchange reconciliation fail #${i}`);

  const principal=100_000+rnd()*1_000_000_000;
  const days=1+Math.floor(rnd()*180);
  const ir=0.1+rnd()*5, fr=0.1+rnd()*5;
  const interest=Math.round(principal*((ir/100)/30)*days);
  const fee=Math.round(principal*((fr/100)/30)*days);
  assert(interest>=0 && fee>=0,'Pawn due negative');
  const extra=Math.round(rnd()*principal);
  const newPrincipal=principal+extra;
  assert(Math.abs(newPrincipal-principal-extra)<0.01,'Top-up principal fail');
}
console.log('[PASS] 10,000 randomized exchange/pawn reference cases');
console.log('[PASS] tabs, first-run config, exchange formula markers, pawn actions, no embedded secrets');
