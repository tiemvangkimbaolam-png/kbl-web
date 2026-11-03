import {createRequire} from 'node:module';const require=createRequire(import.meta.url);
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createClient,defaults}=require('../pos-source/kbl-cccd-ocr.cjs');
const {createSession}=require('../pos-source/kbl-identity-recovery.cjs');
const jsQR=require('../pos-source/kbl-jsqr.js'),makeQr=text=>{const matrix=require('./fixtures/identity-qr.json')[text];if(!matrix)throw new Error('Unknown fixture');return{addData(){},make(){},getModuleCount:()=>matrix.length,isDark:(r,c)=>matrix[r][c]};};
const {regions,enhance}=require('../pos-source/kbl-qr-decoder.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const response=data=>({ok:true,status:200,json:async()=>data});
const models={models:['gemini-2.5-flash-lite','gemini-2.5-flash'].map(name=>({name:'models/'+name,supportedGenerationMethods:['generateContent']}))};
const parts=[{text:'NONPERSONAL TEST'},{inlineData:{mimeType:'image/jpeg',data:'TEST'}}];
const output={candidates:[{content:{parts:[{text:'{"hoTen":"KHÁCH THỬ NGHIỆM"}'}]}}]};

test('identity wait allows slower valid responses; bounds are 60 seconds per attempt and 150 seconds per job',async()=>{
 assert.equal(defaults.requestMs,60000);assert.equal(defaults.totalMs,150000);
 const client=createClient({requestMs:90,totalMs:250,fetcher:async url=>{if(url.includes('models?'))return response(models);await sleep(35);return response(output);}});
 assert.equal((await client.generate('TEST',parts)).success,true);
});
test('cancel exits immediately even if the provider ignores AbortSignal; cannot turn into another request',async()=>{
 const controller=new AbortController();let calls=0;
 const client=createClient({fetcher:async url=>{if(url.includes('models?'))return response(models);calls++;return new Promise(()=>{});}});
 const pending=client.generate('TEST',parts,{signal:controller.signal});await sleep(5);controller.abort();
 await assert.rejects(pending,e=>e.name==='AbortError');await sleep(10);assert.equal(calls,1);
});
test('transient failure retries once, progress is visible, and permission failures never loop',async()=>{
 let count=0;const messages=[];
 const client=createClient({totalMs:250,fetcher:async url=>{if(url.includes('models?'))return response(models);return ++count===1?{ok:false,status:503}:response(output);}});
 assert.equal((await client.generate('TEST',parts,{onProgress:m=>messages.push(m)})).success,true);assert.equal(count,2);assert(messages.some(m=>m.includes('2/2')));
 let denied=0;const bad=createClient({fetcher:async url=>url.includes('models?')?response(models):(denied++,{ok:false,status:403})});
 await assert.rejects(bad.generate('TEST',parts));assert.equal(denied,1);
});
test('front and back are serialized; a failed image stays available and retry does not need another upload',async()=>{
 const session=createSession();let active=0,max=0,failed=true;const received=[];
 const worker=async(image)=>{active++;max=Math.max(max,active);received.push(image);await sleep(5);active--;if(image==='front'&&failed){failed=false;throw new Error('fixture timeout');}return image;};
 const results=await Promise.all([session.run('front','front',worker),session.run('back','back',worker)]);
 assert.equal(max,1);assert.equal(results[0].success,false);assert.equal(results[1].success,true);assert.equal(session.image('front'),'front');
 assert.equal((await session.retry('front',worker)).success,true);assert.deepEqual(received,['front','back','front']);
});
test('replacing an image invalidates a late result and still runs the newer image once',async()=>{
 const session=createSession(),applied=[];
 const worker=async(image,job)=>{await sleep(image==='old'?15:1);job.assertCurrent();applied.push(image);};
 const old=session.run('front','old',worker);await sleep(2);const latest=session.run('front','new',worker);
 assert.equal((await old).success,false);assert.equal((await latest).success,true);assert.deepEqual(applied,['new']);
});
test('clearing a form cancels waiting images and prevents stale data from applying',async()=>{
 const session=createSession(),applied=[];const worker=async(image,job)=>{await sleep(10);job.assertCurrent();applied.push(image);};
 const front=session.run('front','F',worker),back=session.run('back','B',worker);session.clear();
 await Promise.all([front,back]);assert.deepEqual(applied,[]);assert.equal(session.has('front'),false);
});
test('retries cannot apply an old image after another customer record replaced the preview',async()=>{
 let valid=true,called=0;const session=createSession({validate:()=>valid});await session.run('front','OLD',async()=>{called++;});valid=false;
 assert.equal((await session.retry('front',async()=>{called++;})).success,false);assert.equal(called,1);assert.equal(session.has('front'),false);
});
test('manual edits made while OCR waits are preserved field by field',async()=>{
 const address={value:'original'},name={value:'old name'};const session=createSession({capture:()=>{const oldAddress=address.value,oldName=name.value;return el=>el===address?address.value===oldAddress:name.value===oldName;}});
 const result=await session.run('front','TEST',async(image,job)=>{address.value='manually confirmed';return job.filter({diaChi:'OCR address',hoTen:'OCR name'},{diaChi:address,hoTen:name});});
 assert.deepEqual(result.result,{hoTen:'OCR name'});assert.equal(address.value,'manually confirmed');
});
test('manual edits made while the back image waits in the queue are preserved too',async()=>{
 const field={value:'initial'},session=createSession({capture:()=>{const before=field.value;return el=>el.value===before;}});
 const front=session.run('front','F',async()=>{await sleep(10);});
 const back=session.run('back','B',async(image,job)=>job.filter({diaChi:'OCR value'},{diaChi:field}));field.value='manual correction';
 await front;assert.deepEqual((await back).result,{});assert.equal(field.value,'manual correction');
});
function qrPixels(text,inverted=false){const qr=makeQr(text);qr.make();const side=qr.getModuleCount()+8,size=side*5,out=new Uint8ClampedArray(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const row=Math.floor(y/5)-4,col=Math.floor(x/5)-4,dark=row>=0&&col>=0&&row<qr.getModuleCount()&&col<qr.getModuleCount()&&qr.isDark(row,col),v=(dark!==inverted)?0:255,i=(y*size+x)*4;out[i]=out[i+1]=out[i+2]=v;out[i+3]=255;}return{size,out};}
test('bundled QR decoder works offline for normal and inverted QR, including Vietnamese identity-format fixture',()=>{
 const text='000000000000||KHACH THU NGHIEM|01011990|Nu|DIA CHI THU NGHIEM|01012026';
 for(const inverted of [false,true]){const {size,out}=qrPixels(text,inverted);assert.equal(jsQR(out,size,size,{inversionAttempts:'attemptBoth'}).data,text);}
 const {size,out}=qrPixels('NONPERSONAL TEST');const low=new Uint8ClampedArray(out);for(let i=0;i<low.length;i+=4)low[i]=low[i+1]=low[i+2]=low[i]===0?100:150;assert.equal(jsQR(enhance(low),size,size,{inversionAttempts:'attemptBoth'}).data,'NONPERSONAL TEST');
 const scan=regions(3000,4000);assert.equal(scan.length,7);assert(scan.every(([x,y,w,h])=>x>=0&&y>=0&&x+w<=3000&&y+h<=4000));
});
