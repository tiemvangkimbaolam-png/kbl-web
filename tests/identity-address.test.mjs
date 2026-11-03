import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),data=require('../pos-source/kbl-address-data.cjs');
const {createResolver,createAdapter,fold}=require('../pos-source/kbl-address-converter.cjs');
const now=()=>Date.parse('2026-11-03T10:00:00+07:00'),r=createResolver(data,{now});
const raw='Số 9/2, Đường Thử, KP 3, Phường An Bình, Thành phố Dĩ An, Tỉnh Bình Dương, Việt Nam';
test('official old/new and current catalogs retain source hashes, all destination codes and explicit inconsistent source markers',()=>{
 assert.equal(data.newWards.length,3321);assert.equal(data.oldProvinces.length,63);assert.equal(data.newProvinces.length,34);
 assert.equal(new Set(data.newWards.map(w=>w.c)).size,3321);
 assert.equal(data.oldWards.reduce((n,w)=>n+w.t.length,0)+data.specials.length,data.meta.counts.sourceRelations);
 assert(data.meta.sources.every(s=>/^[a-f0-9]{64}$/.test(s.sha256)&&s.url.startsWith('https://danhmuchanhchinh.nso.gov.vn/')));
 assert.deepEqual(data.meta.conflictingOldCodes,['00553','01615','02485']);
 const codes=new Set(data.newWards.map(w=>w.c));for(const w of data.oldWards)for(const t of w.t)assert(codes.has(t[0]));
});
test('whole-unit conversion preserves house, street, neighborhood and country while using verified current province and ward',()=>{
 const out=r.resolve(raw);assert.equal(out.status,'converted');assert.equal(out.address,'Số 9/2, Đường Thử, KP 3, Phường Dĩ An, Thành phố Hồ Chí Minh, Việt Nam');assert.equal(out.original,raw);
 assert.equal(r.resolve('P. Trúc Bạch, Q. Ba Đình, TP. Hà Nội').address,'Phường Ba Đình, Thành phố Hà Nội');
 assert.equal(r.resolve('Thị trấn Mường Lát, Huyện Mường Lát, Thanh Hóa').address,'Xã Mường Lát, Tỉnh Thanh Hóa');
});
test('split Tân Đông Hiệp retains original and both candidates without automatically selecting the similar name',()=>{
 const input='Số 9, Phường Tân Đông Hiệp, Thành phố Dĩ An, Bình Dương',out=r.resolve(input);
 assert.equal(out.status,'review');assert.equal(out.reason,'partial_or_split');assert.equal(out.address,input);assert.equal(out.candidates.length,2);
 assert.deepEqual(new Set(out.candidates.map(c=>c.code)),new Set(['25942','25945']));
});
test('old province/district hierarchy is required; OCR typos, wrong ward kind, missing units and unknown addresses never auto convert',()=>{
 for(const input of ['Phường An Bình, Bình Dương','Phường An Bình, Quận Ba Đình, Bình Dương','Phường An Bỉnh, Thành phố Dĩ An, Bình Dương','Xã An Bình, Thành phố Dĩ An, Bình Dương','Nhà gần chợ',''])assert.notEqual(r.resolve(input).status,'converted',input);
 const old='Xã Cổ Bi, Huyện Gia Lâm, Thành phố Hà Nội';assert.equal(r.resolve(old).reason,'source_conflict');assert.equal(r.resolve(old).address,old);
});
test('existing current two-tier address is returned exactly and is not converted a second time',()=>{
 const input='Số 9, Phường Dĩ An, TP. HCM';const out=r.resolve(input);assert.equal(out.status,'unchanged');assert.equal(out.address,input);assert.equal(r.resolve(r.resolve(raw).address).status,'unchanged');
});
test('stale or future-dated catalog fails closed without network or guessing',()=>{
 for(const date of ['2027-05-01','2025-01-01']){const client=createResolver(data,{now:()=>Date.parse(date)});const out=client.resolve(raw);assert.equal(out.status,'stale');assert.equal(out.address,raw);}
});
test('every auto conversion across the entire old catalog is unique, whole-unit and free of recorded source conflicts',()=>{
 const district=new Map(data.districts.map(d=>[d.id,d])),province=new Map(data.oldProvinces.map(p=>[p.c,p]));const whole=new Set(['nhap toan bo','giu nguyen','doi loai hinh','doi ten']);let converted=0,review=0;
 for(const w of data.oldWards){const input=[w.n,district.get(w.d).n,province.get(w.p).n].join(', '),out=r.resolve(input);
  if(out.status==='converted'){converted++;assert(!w.conflict,input);assert.equal(new Set(w.t.map(t=>t[0])).size,1,input);assert(w.t.every(t=>whole.has(fold(data.notes[t[1]]))),input);assert.equal(out.candidates.length,1,input);}
  if(out.status==='review')review++;
 }
 assert(converted>8000);assert(review>0);
});
test('OCR enrichment changes only a uniquely mapped address and retains original response, name, identity number and issue date',()=>{
 const client=createAdapter(data,{now}),identity={hoTen:'KHÁCH THỬ',soCCCD:'TEST_ONLY',dateIssue:'2020-01-01',diaChi:raw};
 const result={success:true,usedModel:'fixture',data:{candidates:[{content:{parts:[{text:JSON.stringify(identity)}]}}]}};const before=JSON.stringify(result),out=client.enrich(result);
 assert.equal(JSON.stringify(result),before);const parsed=JSON.parse(out.data.candidates[0].content.parts[0].text);assert.equal(parsed.hoTen,identity.hoTen);assert.equal(parsed.soCCCD,identity.soCCCD);assert.equal(parsed.dateIssue,identity.dateIssue);assert.notEqual(parsed.diaChi,raw);assert.equal(out.addressResolution.original,raw);
 identity.diaChi='P. Tân Đông Hiệp, TP. Dĩ An, Bình Dương';result.data.candidates[0].content.parts[0].text=JSON.stringify(identity);assert.equal(JSON.parse(client.enrich(result).data.candidates[0].content.parts[0].text).diaChi,identity.diaChi);
});
