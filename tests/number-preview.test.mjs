import test from 'node:test';import assert from 'node:assert/strict';
import {formatNumberInput} from '../public/tien-ich/number-preview.mjs';
test('money previews separate thousands, accept existing money grouping, preserve exact digits beyond JS numeric precision',()=>{
 for(const [raw,shown] of [['10000000','10.000.000'],['18000000','18.000.000'],['12.780.000','12.780.000'],['12,780,000','12.780.000'],['00001000','1.000'],['100000000000000000001','100.000.000.000.000.000.001']])assert.equal(formatNumberInput(raw),shown);
});
test('chi quantities keep their decimal meaning instead of treating the separator as thousands',()=>{
 for(const [raw,shown] of [['10000','10.000'],['1.234','1,234'],['1,5','1,5'],['1,','1,'],['0.001','0,001'],['001.050','1,050']])assert.equal(formatNumberInput(raw,'decimal'),shown);
});
test('blank inputs clear previews and malformed input never masquerades as a different amount',()=>{
 assert.equal(formatNumberInput(''),'');assert.equal(formatNumberInput('  '),'');assert.equal(formatNumberInput('0'),'0');for(const v of ['1e7','-10000000','1.5','abc','12.34.567','1.000,5','<script>'])assert.equal(formatNumberInput(v),null);assert.equal(formatNumberInput('1.2.3','decimal'),null);
});
