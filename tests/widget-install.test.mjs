import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readInstallSource} from '../public/tien-ich/widget-kbl/install-flow.mjs';
const root=new URL('../public/tien-ich/widget-kbl/',import.meta.url), manifest=JSON.parse(fs.readFileSync(new URL('install-manifest.json',root),'utf8')),code=fs.readFileSync(new URL(manifest.file,root),'utf8');
function fetcher({data=code,meta=manifest,ok=true}={}){const calls=[];const fn=async(url,options)=>{calls.push({url,options});return {ok,text:async()=>url.endsWith('.json')?JSON.stringify(meta):data};};fn.calls=calls;return fn;}
test('install copy path returns the exact generated native JavaScript after SHA-256 check',async()=>{const get=fetcher();const result=await readInstallSource(get,webcrypto.subtle);assert.equal(result.code,code);assert.equal(result.name,'KBL Gia Vang Dong');assert.equal(get.calls.length,2);assert.ok(get.calls.every(c=>c.options.redirect==='error'));assert.deepEqual(get.calls.map(c=>c.url),['./install-manifest.json','./KBL_Gia_Vang_Dong.js']);assert.equal(fs.readFileSync(new URL('KBL_Gia_Vang_Dong.txt',root),'utf8'),result.code);});
test('wrong/partial code, HTML and same-size tampering are not offered to clipboard',async()=>{for(const bad of ['<html>login</html>',code.slice(0,-2),code.replace('1.1.0.','1.1.9.')])await assert.rejects(readInstallSource(fetcher({data:bad}),webcrypto.subtle));});
test('invalid metadata cannot direct the install loader to another URL or file',async()=>{for(const file of ['https://evil.test/code.js','../file.js','other.js']){const get=fetcher({meta:{...manifest,file}});await assert.rejects(readInstallSource(get,webcrypto.subtle));assert.equal(get.calls.length,1);}});
test('failed source and unavailable secure hashing remain unavailable, without false copy success',async()=>{await assert.rejects(readInstallSource(fetcher({ok:false}),webcrypto.subtle));await assert.rejects(readInstallSource(fetcher(),null));});
async function rescue({cloud=true,status=200,data=code,existing=[]}={}){
 const files=new Map(existing.map(name=>['/scripts/'+name+'.js','CUSTOM'])),alerts=[],opened=[],requests=[];
 const fm={documentsDirectory:()=>'/scripts',joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p),writeString:(p,c)=>files.set(p,c)};
 const context={config:{runsInWidget:false},Request:class{constructor(url){this.url=url;requests.push(this);}async loadString(){this.response={statusCode:status,url:this.url};return data;}},FileManager:{iCloud:()=>{if(!cloud)throw Error('iCloud disabled');return fm;},local:()=>fm},Alert:class{addAction(){}async presentAlert(){alerts.push({title:this.title,message:this.message});}},Safari:{open:async u=>opened.push(u)},Script:{complete(){}}};
 vm.createContext(context);const source=fs.readFileSync(new URL('../scripts/scriptable-rescue.js',import.meta.url),'utf8');await vm.runInContext('(async()=>{'+source+'})()',context,{timeout:1000});return {files,alerts,opened,requests};
}
test('rescue saves pinned code and opens editor without running downloaded code',async()=>{for(const cloud of [true,false]){const r=await rescue({cloud});assert.equal(r.files.get('/scripts/KBL Gia Vang Dong.js'),code);assert.match(r.opened[0],/^scriptable:\/\/\/open\//);assert.match(r.requests[0].url,/\/734be73afde2e9b532aa03bc6121474b9a417a9e\//);assert.equal(r.requests[0].onRedirect({url:'https://evil.test'}),null);assert.equal(r.requests[0].allowInsecureRequest,false);assert.equal(r.alerts[0].title,'Đã lưu widget KBL');}});
test('rescue preserves existing custom scripts and reports the new selectable name',async()=>{const r=await rescue({existing:['KBL Gia Vang Dong']});assert.equal(r.files.get('/scripts/KBL Gia Vang Dong.js'),'CUSTOM');assert.equal(r.files.get('/scripts/KBL Gia Vang Dong (2).js'),code);assert.match(r.alerts[0].message,/KBL Gia Vang Dong \(2\)/);});
test('rescue does not save failed or incomplete downloads',async()=>{for(const params of [{status:404},{data:'<html>error</html>'},{data:code.slice(1)}]){const r=await rescue(params);assert.equal(r.files.size,0);assert.equal(r.opened.length,0);assert.equal(r.alerts[0].title,'Chưa cài xong');}});
test('install guide uses copy/paste and a visible manual fallback rather than unsupported file sharing',()=>{const page=fs.readFileSync(new URL('index.html',root),'utf8'),js=fs.readFileSync(new URL('page.js',root),'utf8');assert.match(page,/id="copy-widget"/);assert.match(page,/scriptable:\/\/\/add/);assert.match(page,/id="install-code" readonly/);assert.doesNotMatch(page,/Chia sẻ → Scriptable|id="share-widget"/);assert.doesNotMatch(js,/navigator\.share|preloadShare/);assert.match(js,/navigator\.clipboard\.writeText\(installSource\)/);assert.match(js,/showManualCopy/);});

test('real page click copies the preloaded verified source and exposes the editor link',async()=>{
 const source=fs.readFileSync(new URL('page.js',root),'utf8');
 for(const failure of [false,true]){
  const elements=new Map(),copied=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,disabled:false,value:'',dataset:{},replaceChildren(){},append(){},addEventListener(event,fn){this[event]=fn;},focus(){this.focused=true;},select(){this.selected=true;},setSelectionRange(start,end){this.range=[start,end];}});return elements.get(id);};
  const context={document:{getElementById:element,querySelectorAll:()=>[],createElement:()=>element(Symbol()),hidden:false},window:{addEventListener(){}},location:{reload(){}},AbortController,Date,Promise,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},navigator:{clipboard:{writeText:value=>{copied.push(value);return failure?Promise.reject(Error('denied')):Promise.resolve();}}},readInstallSource:()=>readInstallSource(fetcher(),webcrypto.subtle),widgetSnapshot(){},widgetState:()=>({rows:[]}),widgetMoney(){},widgetClock(){},KBL_WIDGET_FEATURED:[],fetch:async()=>{throw Error('offline');}};
  vm.createContext(context);vm.runInContext(source.replace(/^import .*;\n/gm,''),context);await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(element('copy-widget').disabled,false);assert.equal(element('install-code').value,code);
  element('copy-widget').click();assert.deepEqual(copied,[code]);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(element('add-widget').hidden,false);
  if(failure){assert.equal(element('manual-copy').open,true);assert.equal(element('install-code').selected,true);assert.equal(element('install-code').range[1],code.length);}else assert.match(element('download-status').textContent,/Đã sao chép mã/);
 }
});
