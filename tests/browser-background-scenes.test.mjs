import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=fs.readFileSync(new URL('../windows/EXTENSION/background.js',import.meta.url),'utf8'),ast=ts.createSourceFile('background.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const stepSource=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='step').getText(ast);
const task={runId:'c'.repeat(36),nonce:'b'.repeat(36),kind:'images',scene:1,provider:'gemini',attachmentHashes:[],ownerConfirmedUnsentImage:true,acceptedSceneNonces:['a'.repeat(36)],recoverOnly:true};
function fixture({missingTab=false,wrongPrior=false,busy=false,outbox=false,requested=false,notStarted=false}={}){
 const tab={id:7,status:'complete',url:'https://gemini.google.com/app/fixture'},commands=[],messages=[];
 const state={config:{enabled:true,token:'fixture',selectors:{}},active:{runId:task.runId,nonce:outbox?'a'.repeat(36):task.nonce,task:outbox?{...task,nonce:'a'.repeat(36),scene:0}:task,sent:false,...(requested?{ownerImageContinuationRequested:true}:{}),...(!missingTab?{tabId:7,conversationUrl:tab.url}:{})},idleTab:{tabId:7,conversationUrl:tab.url,retired:{runId:task.runId,nonce:wrongPrior?'d'.repeat(36):'a'.repeat(36)}}};
 let held=outbox?{runId:task.runId,nonce:'a'.repeat(36)}:null;
 const context=vm.createContext({URL,Date,Number,JSON,busy:false,provider:'gemini',SITES:{gemini:'https://gemini.google.com/app'},pending:async action=>{if(action==='delete')held=null;return held;},local:async route=>route==='/browser/identity'?{account:{provider:'gemini'}}:route==='/browser/result'?{stored:true,nextTask:task,status:'dispatched'}:{task},adoptRestoredWindows:async()=>{},status:async m=>messages.push(m),geminiTab:t=>t?.status==='complete',conversationURL:()=>true,messageTab:async(t,m)=>{commands.push(m);if(m.type==='PROBE')return{ready:true};if(m.type==='PROBE_RUN')return{matched:true};if(m.type==='PROBE_OWNER_IMAGE_NOT_STARTED')return{notStarted};return busy?{accepted:false,busy:true}:{accepted:true};},chrome:{storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(state[k])])),set:async value=>Object.assign(state,structuredClone(value)),remove:async keys=>{for(const k of Array.isArray(keys)?keys:[keys])delete state[k];}}},tabs:{query:async()=>[tab]}}});
 vm.runInContext(stepSource,context);return{state,commands,messages,step:()=>context.step()};
}
test('acknowledged image handoff retains the exact existing conversation tab',async()=>{
 const f=fixture({outbox:true});await f.step();assert.equal(f.state.active.tabId,7);assert.equal(f.state.active.conversationUrl,'https://gemini.google.com/app/fixture');assert.equal(f.state.active.nonce,task.nonce);assert.equal(f.state.active.sent,false);assert.equal(f.commands.length,0);
});
test('legacy scene handoff can recover only an acknowledged prior scene tab and sends the owner continuation once',async()=>{
 const f=fixture({missingTab:true});await f.step();const sent=f.commands.filter(m=>m.type==='CONTINUE_UNSENT_IMAGE');assert.equal(sent.length,1,JSON.stringify(f.messages));assert.equal(sent[0].task.recoverOnly,false);assert.equal(f.state.active.tabId,7);assert.equal(f.state.active.sent,true);assert.equal(f.state.active.ownerImageContinuationRequested,true);await f.step();assert.equal(f.commands.filter(m=>m.type==='CONTINUE_UNSENT_IMAGE').length,1);
});
test('scene continuation refuses an unacknowledged prior tab and retries only an explicit busy refusal',async()=>{
 const bad=fixture({missingTab:true,wrongPrior:true});await bad.step();assert.equal(bad.commands.filter(m=>m.type==='CONTINUE_UNSENT_IMAGE').length,0);assert.equal(bad.state.active.ownerImageContinuationRequested,undefined);
 const f=fixture({busy:true});await f.step();assert.equal(f.state.active.ownerImageContinuationRequested,false);await f.step();assert.equal(f.commands.filter(m=>m.type==='CONTINUE_UNSENT_IMAGE').length,2);
});
test('already requested continuation requires explicit content proof that preparation never started',async()=>{
 const safe=fixture({requested:true,notStarted:true});await safe.step();assert.equal(safe.commands.filter(m=>m.type==='CONTINUE_UNSENT_IMAGE').length,1);
 const unknown=fixture({requested:true});await unknown.step();assert.equal(unknown.commands.filter(m=>m.type==='CONTINUE_UNSENT_IMAGE').length,0);
});
