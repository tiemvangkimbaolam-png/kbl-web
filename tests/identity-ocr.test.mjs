import {test} from 'node:test'; import assert from 'node:assert/strict'; import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);
const {createClient,chooseModels,prepareParts,thinking}=require('../pos-source/kbl-cccd-ocr.cjs');
const parts=[{text:'Test fixture only'},{inlineData:{mimeType:'image/jpeg',data:'FIXTURE'}}];
const list={models:['gemini-3.8-flash','gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-2.5-flash'].map(name=>({name:'models/'+name,supportedGenerationMethods:['generateContent']}))};
const response=x=>({ok:true,status:200,json:async()=>x});
const output={candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({hoTen:' TEST ONLY ',soCCCD:'',diaChi:'Fixture only'})}]}}]};
test('discovers current available models, prefers stable Lite, limits fallback to two and reuses successful OCR model',async()=>{
 const calls=[];const client=createClient({fetcher:async(url,init)=>{calls.push({url,init});return response(url.includes('models?')?list:output);}});
 const result=await client.generate('PRIVATE-TEST-KEY',parts);assert.equal(result.usedModel,'gemini-3.5-flash-lite');
 assert.equal(JSON.parse(result.data.candidates[0].content.parts[0].text).hoTen,'TEST ONLY');
 assert.equal(calls.length,2);assert(!calls.some(c=>c.url.includes('PRIVATE')));
 const body=JSON.parse(calls[1].init.body);assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'minimal');assert.equal(body.generationConfig.responseMimeType,'application/json');
 await client.generate('PRIVATE-TEST-KEY',parts);assert.equal(calls.length,3);
 assert.equal(chooseModels(list.models.map(m=>m.name.slice(7))).length,2);
 assert.equal(thinking('gemini-2.5-flash').thinkingConfig.thinkingBudget,0);
});
test('never responding provider, including one ignoring AbortSignal, terminates within total budget',async()=>{
 let requests=0;const started=Date.now();const client=createClient({totalMs:60,requestMs:20,listMs:10,fetcher:async url=>{if(url.includes('models?'))return response(list);requests++;return new Promise(()=>{});}});
 await assert.rejects(client.generate('test',parts),/thời gian/);assert.equal(requests,2);assert(Date.now()-started<200);
});
test('response body also has a timeout, no unbounded JSON read',async()=>{
 const client=createClient({totalMs:60,requestMs:15,listMs:10,fetcher:async url=>url.includes('models?')?response(list):{ok:true,json:()=>new Promise(()=>{})}});
 await assert.rejects(client.generate('test',parts),/thời gian/);
});
test('permission failures stop immediately and neither provider body nor credentials are shown',async()=>{
 let calls=0;const client=createClient({fetcher:async url=>{calls++;return url.includes('models?')?response(list):{ok:false,status:403,json:async()=>({error:{message:'PRIVATE-KEY and private identity'}})};}});
 await assert.rejects(client.generate('PRIVATE-KEY',parts),e=>e.status===403&&!e.message.includes('PRIVATE'));assert.equal(calls,2);
});
test('one server failure falls back once, preserves input bytes and ignores thought text',async()=>{
 const original=JSON.stringify(parts);let generated=0;const client=createClient({fetcher:async url=>{if(url.includes('models?'))return response(list);generated++;if(generated===1)return{ok:false,status:503};return response({candidates:[{content:{parts:[{thought:true,text:'PRIVATE REASONING'},{text:'{"hoTen":"TÊN THỬ NGHIỆM","diaChi":""}'}]}}]});}});
 const result=await client.generate('test',parts);assert.equal(generated,2);assert.equal(JSON.stringify(parts),original);assert(!JSON.stringify(result).includes('PRIVATE'));assert.match(result.data.candidates[0].content.parts[0].text,/TÊN THỬ NGHIỆM/);
});
test('empty or malformed identity output cannot silently fill a form',async()=>{
 for(const text of ['{}','[]','{"hoTen":""}','not json']){
  const client=createClient({fetcher:async url=>response(url.includes('models?')?list:{candidates:[{content:{parts:[{text}]}}]})});
  await assert.rejects(client.generate('test',parts));
 }
});
test('parallel front/back share only model discovery, not identity result or image bytes',async()=>{
 let listed=0;const client=createClient({fetcher:async(url,init)=>{if(url.includes('models?')){listed++;return response(list);}const body=JSON.parse(init.body);return response({candidates:[{content:{parts:[{text:JSON.stringify({hoTen:body.contents[0].parts[1].inlineData.data})}]}}]});}});
 const [a,b]=await Promise.all([client.generate('test',parts),client.generate('test',[parts[0],{inlineData:{mimeType:'image/jpeg',data:'SECOND'}}])]);assert.equal(listed,1);assert.notEqual(a.data.candidates[0].content.parts[0].text,b.data.candidates[0].content.parts[0].text);
});
test('upload copy is resized to 2000 pixels while original image remains unchanged',async()=>{
 const previousImage=global.Image,previousDocument=global.document;let size;
 global.Image=class{constructor(){this.naturalWidth=4000;this.naturalHeight=3000;}set src(v){queueMicrotask(()=>this.onload());}};
 global.document={createElement:()=>{const c={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toDataURL(){size=[c.width,c.height];return'data:image/jpeg;base64,REDUCED';}};return c;}};
 try{const original=JSON.stringify(parts),prepared=await prepareParts(parts);assert.deepEqual(size,[2000,1500]);assert.equal(prepared[1].inlineData.data,'REDUCED');assert.equal(JSON.stringify(parts),original);}finally{global.Image=previousImage;global.document=previousDocument;}
});
