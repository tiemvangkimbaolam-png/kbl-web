import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),{createAdapter}=require('../pos-source/kbl-address-converter.cjs'),data=require('../pos-source/kbl-address-data.cjs');
const address='Số 9, Phường An Bình, Thành phố Dĩ An, Tỉnh Bình Dương',expected='Số 9, Phường Dĩ An, Thành phố Hồ Chí Minh';
function source(name,html=false){const text=fs.readFileSync(html?'pos-source/pawn.html':'pos-source/renderer.js','utf8');const scripts=html?[...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]):[text];for(const script of scripts){const file=ts.createSourceFile('pos.js',script,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let found;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n.getText(file);ts.forEachChild(n,visit);}visit(file);if(found)return found;}throw new Error('Missing handler '+name);}
function context(name,html=false){const elements=new Map();let refreshes=0,requests=0;const get=id=>{if(!elements.has(id))elements.set(id,{value:'',innerText:'',className:'',style:{}});return elements.get(id);};const client=createAdapter(data,{now:()=>Date.parse('2026-11-03')});
 const transport=async(key,parts,options)=>{requests++;assert.equal(key,'fixture-key');const prompt=parts.filter(p=>p.text).map(p=>p.text).join('\n');assert(prompt.includes('Không lấy quê quán'));assert(prompt.includes('Không thấy nơi cư trú thì để diaChi rỗng'));assert.equal(parts.filter(p=>p.inlineData).length,1);assert(options.field);const result={success:true,usedModel:'fixture-model',data:{candidates:[{content:{parts:[{text:JSON.stringify({hoTen:'KHÁCH THỬ',soCCCD:'TEST_ONLY',dateIssue:'2020-01-01',diaChi:address})}]}}]}};return client.enrich(result);};
 const refresh=()=>refreshes++;const sandbox={GEMINI_API_KEY:'fixture-key',getPawnGeminiApiKey:()=> 'fixture-key',getEl:get,document:{getElementById:get},kblRememberSaleCccdImage(){},syncBuyUI:refresh,calcSellMath:refresh,syncAllData:refresh,alert(){throw Error('Unexpected alert');},console,window:{kblCallCccdOCR:transport}};
 sandbox.window.parent={getKblGeminiApiKey:()=> 'fixture-key',kblCallCccdOCR:transport};vm.createContext(sandbox);vm.runInContext(source(name,html),sandbox);return{sandbox,get,stats:()=>({refreshes,requests})};
}
test('actual purchase OCR handler sends residence-only prompt and uses converted address without changing name, CCCD or issue-date filling',async()=>{
 const c=context('processBuyOCRBase64');await c.sandbox.processBuyOCRBase64('front','data:image/jpeg;base64,TEST');assert.equal(c.get('buy-address').value,expected);assert.equal(c.get('buy-name').value,'KHÁCH THỬ');assert.equal(c.get('buy-cccd').value,'TEST_ONLY');await c.sandbox.processBuyOCRBase64('back','data:image/jpeg;base64,TEST');assert.equal(c.get('buy-date-issue').value,'2020-01-01');assert.deepEqual(c.stats(),{refreshes:2,requests:2});
});
test('actual sale OCR handler uses the same bounded OCR adapter and existing form refresh',async()=>{
 const c=context('processSaleOCRBase64');for(const side of ['front','back'])await c.sandbox.processSaleOCRBase64(side,'data:image/jpeg;base64,TEST');assert.equal(c.get('s-cus-address').value,expected);assert.equal(c.get('s-cus-name').value,'KHÁCH THỬ');assert.equal(c.get('s-cus-cccd').value,'TEST_ONLY');assert.deepEqual(c.stats(),{refreshes:2,requests:2});
});
test('actual embedded pawn OCR forwards its own address control to the parent and returns mapped residence data',async()=>{
 const c=context('callAiOcrAPI',true);const out=await c.sandbox.callAiOcrAPI('data:image/jpeg;base64,TEST','front');assert.equal(out.diaChi,expected);assert.equal(out.soCCCD,'TEST_ONLY');assert.equal(c.stats().requests,1);
});
