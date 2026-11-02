import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../windows/EXTENSION/content.js',import.meta.url),'utf8');
function browser(meta=null){
 const storage=new Map(meta?[['kbl-browser-owned-run-v1',JSON.stringify(meta)]]:[]);let listener;
 class Textarea{constructor(){this._value='';this.tagName='TEXTAREA';this.disabled=false;this.readOnly=false;}get value(){return this._value;}set value(v){this._value=v;}getClientRects(){return[{}];}getAttribute(){return null;}closest(){return null;}contains(e){return e===this;}focus(){}dispatchEvent(){}}
 const composer=new Textarea(),ctx=vm.createContext({console,location:{hostname:'gemini.google.com'},NodeFilter:{SHOW_TEXT:4},document:{body:{innerText:''},querySelector:()=>null,createTreeWalker:()=>({nextNode:()=>null}),querySelectorAll:q=>q==='model-response'||q.includes('button')?[]:q.includes('textarea')||q.includes('contenteditable')?[composer]:[]},getComputedStyle:()=>({visibility:'visible'}),HTMLTextAreaElement:Textarea,Event:class{},InputEvent:class{},setTimeout:()=>1,clearTimeout:()=>{},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},chrome:{runtime:{id:'fixture',onMessage:{addListener:f=>listener=f,removeListener:()=>{}},sendMessage:async()=>({})}}});
 const load=()=>vm.runInContext(source,ctx);load();return{storage,composer,load,call(m){let reply;listener(m,{id:'fixture'},r=>reply=r);return reply;}};
}
const task={runId:'c'.repeat(36),nonce:'b'.repeat(36),provider:'gemini',kind:'images',scene:1,prompt:'Fixture scene two. Generate a different image.',attachmentHashes:[],ownerConfirmedUnsentImage:true,acceptedSceneNonces:['a'.repeat(36)]};
test('content adapter explicitly refuses a second dispatch while still executing instead of acknowledging work it will drop',()=>{
 const b=browser();assert.equal(b.call({type:'EXECUTE',task:{...task,kind:'research',ownerConfirmedUnsentImage:false}}).accepted,true);
 assert.equal(b.call({type:'EXECUTE',task}).accepted,false);assert.equal(b.call({type:'EXECUTE',task}).busy,true);
});
test('owner-confirmed image continuation preserves acknowledged scene metadata, binds only current scene and cannot be sent twice after adapter reload',()=>{
 const old={runId:task.runId,nonce:'a'.repeat(36),status:'sent',before:1,attachments:[]},b=browser(old);
 const accepted=b.call({type:'CONTINUE_UNSENT_IMAGE',task});assert.equal(accepted.accepted,true,JSON.stringify(accepted));assert.equal(b.composer.value,task.prompt);
 assert.deepEqual(JSON.parse(b.storage.get('kbl-browser-owned-run-v1-before-owner-continuation')),old);
 assert.equal(JSON.parse(b.storage.get('kbl-browser-owned-run-v1')).nonce,task.nonce);
 b.load();const again=b.call({type:'CONTINUE_UNSENT_IMAGE',task});assert.equal(again.accepted,false);assert.match(again.error,/đã nhận lệnh/);
});
test('continuation refuses unrelated metadata, an unrelated draft or missing owner confirmation without clearing existing evidence',()=>{
 for(const kind of ['metadata','draft','unconfirmed']){
  const old={runId:kind==='metadata'?'d'.repeat(36):task.runId,nonce:'a'.repeat(36),status:'sent'},b=browser(old);if(kind==='draft')b.composer.value='Owner unfinished text';
  const r=b.call({type:'CONTINUE_UNSENT_IMAGE',task:{...task,ownerConfirmedUnsentImage:kind!=='unconfirmed'}});assert.equal(r.accepted,false);assert.equal(b.storage.get('kbl-browser-owned-run-v1'),JSON.stringify(old));
 }
});
