import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {estimatePawn,ringSize,perChi} from '../app/components/reference-home/tools.mjs';

test('reference ring converter retains the actual Ni table and accepts Vietnamese decimal notation',()=>{
  assert.deepEqual(ringSize('15,6 mm'),{ni:9,diameter:15.6,standard:15.6});
  assert.equal(ringSize('1.56 cm').ni,9);
  assert.throws(()=>ringSize('15.6.0'));
  assert.throws(()=>ringSize('0'));
});
test('website-only estimate retains original inclusive days and tier thresholds without changing POS',()=>{
  assert.equal(estimatePawn('49.999.999','2026-10-26','2026-10-26').monthly,3);
  const at50=estimatePawn('50.000.000','2026-10-26','2026-10-26');
  assert.equal(at50.monthly,2.5);assert.equal(at50.days,1);assert.equal(at50.interest,41667);
  assert.equal(estimatePawn(200e6,'2026-10-26','2026-11-24').monthly,2.2);
  assert.equal(estimatePawn(200e6,'2026-10-26','2026-11-24').days,30);
  assert.throws(()=>estimatePawn(100e6,'2026-10-26','2026-10-25'));
  assert.throws(()=>estimatePawn(100e6,'2026-02-30','2026-03-01'));
});
test('price unit presentation converts only explicit supported units; copied presentation has no old API controller or live values',()=>{
  assert.equal(perChi(129920000,'đồng/lượng'),12992000);
  assert.equal(perChi(12992000,'đồng/chỉ'),12992000);
  assert.equal(perChi(4000,'USD/oz'),null);
  const source=readFileSync(new URL('../app/components/reference-home/template.ts',import.meta.url),'utf8');
  const html=JSON.parse(source.split('const template = ')[1].split(';\nexport default')[0]);
  assert.doesNotMatch(html,/<script|\son(?:click|input|keydown)\s*=|javascript:|data-cfemail|12\.692\.000|09:31 hôm nay|\/cdn-cgi\//i);
  assert.match(html,/id="prices"/);assert.match(html,/id="products"/);assert.match(html,/id="pawn-form"/);assert.match(html,/id="contact"/);
  for(const file of readdirSync(new URL('../public/fonts/',import.meta.url))){const bytes=readFileSync(new URL('../public/fonts/'+file,import.meta.url));assert.ok(['00010000','4f54544f','774f4646','774f4632'].includes(bytes.subarray(0,4).toString('hex')),file+' is a real font');}
});
