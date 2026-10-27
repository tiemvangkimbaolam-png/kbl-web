import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{create,cloudPriceConfig,settingsCloudPriceConfig}=require('../windows/pos-relay.cjs');
const GOLD=['9999','980','750','610','585','416'];
const ledger=()=>{const m=new Map();return {get:k=>m.has(k)?structuredClone(m.get(k)):null,set:(k,v)=>m.set(k,structuredClone(v))};};
const config={id:'worker-a',token:'a'.repeat(64),serverUrl:'https://kbl.example'};
const active={enabled:true,symbol:'BK',markupVnd:12345,relayUrl:'https://script.google.com/macros/s/owned/exec',relayToken:'configured-private-relay-token',pollMs:60000,spreads:Object.fromEntries(GOLD.map((c,i)=>[c,100+i]))};
const inventory={mode:'snapshot',inventory:[{code:'SKU-1',name:'Nhẫn',type:'9999',weightLy:100,status:'Đang bán'}]};
test('cloud price config projects only explicit validated settings and exact spreads, without guessed prices or secrets in results',()=>{
 const clean=cloudPriceConfig({config:{...active,customer:{cccd:'NEVER-SEND'},gemini_api_key:'NEVER-SEND'}});
 assert.deepEqual(clean,active);assert.equal(JSON.stringify(clean).includes('NEVER-SEND'),false);
 assert.deepEqual(cloudPriceConfig({config:{enabled:false,relayToken:'discard'}}),{enabled:false,symbol:'BK'});
 for(const patch of [{enabled:undefined},{symbol:'SJC'},{markupVnd:undefined},{relayToken:''},{relayUrl:'https://evil.example/'},{relayUrl:'https://script.google.com/?token=secret'},{spreads:{9999:100}}])assert.throws(()=>cloudPriceConfig({config:{...active,...patch}}));
 const settings={google_price_auto_enabled:true,google_price_markup_vnd:12345,google_price_relay_url:active.relayUrl,google_price_relay_token:active.relayToken};
 const prices=Object.fromEntries(GOLD.flatMap((c,i)=>[['price_buy_'+c,1000000],['price_sell_'+c,1000100+i]]));
 assert.deepEqual(settingsCloudPriceConfig(settings,prices).spreads,active.spreads);
 assert.throws(()=>settingsCloudPriceConfig(settings,{}));
});
test('503 encryption/config error remains durable, other POS jobs finish, restart replays and fresh backend receives config',async()=>{
 const l=ledger(),calls=[];let fails=true;
 const bridge={async request(route,method,data){calls.push({route,data});if(route.endsWith('/pos-cloud-price-config')&&fails)throw Error('PRIVATE '+active.relayToken);return {success:true};}};
 let relay=create({ledger:l,config,bridge,now:()=>1000});
 const result=await relay.accept('cloud-price-config',{config:active});assert.equal(result.status,503);
 assert.equal(JSON.stringify(result).includes(active.relayToken),false);assert.equal(JSON.stringify(relay.view()).includes(active.relayToken),false);
 await relay.accept('inventory',inventory);assert.equal(relay.view().pending,1);assert.equal(relay.view().cloudPriceConfigPending,true);
 assert.match(relay.view().cloudPriceHandoff.lastError,/khóa mã hóa/);assert.equal(relay.view().cloudPriceHandoff.lastSuccess,0);
 fails=false;relay=create({ledger:l,config,bridge,now:()=>1001});await relay.flush();assert.equal(relay.view().pending,0);assert.equal(relay.view().cloudPriceHandoff.lastSuccess,1001);assert.equal(relay.view().cloudPriceHandoff.lastError,'');
 relay=create({ledger:l,config:{...config,id:'worker-b',token:'b'.repeat(64)},bridge,now:()=>1002});assert.equal(relay.view().pending,2);await relay.flush();
 assert.deepEqual(calls.filter(c=>c.route.endsWith('/pos-cloud-price-config')).at(-1).data.config,active);
});
test('explicit POS folder handoff reads settings once, excludes customer/API material, and honors disabled auto-pricing',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kbl-cloud-price-'));
 try{
  const settings={google_price_auto_enabled:true,google_price_markup_vnd:active.markupVnd,google_price_relay_url:active.relayUrl,google_price_relay_token:active.relayToken,gemini_api_key:'NEVER-SEND',customer:{cccd:'NEVER-SEND'}};
  for(const [i,c]of GOLD.entries()){settings['price_buy_'+c]=1000000;settings['price_sell_'+c]=1000100+i;}
  fs.writeFileSync(path.join(root,'settings.json'),JSON.stringify(settings));fs.writeFileSync(path.join(root,'inventory_db.json'),JSON.stringify(inventory.inventory));
  const l=ledger(),calls=[],bridge={async request(route,method,data){calls.push({route,data});return {success:true};}};
  let relay=create({ledger:l,config,bridge,now:()=>1000});relay.setDataDir(root);await relay.flush();
  assert.equal(calls.length,3);assert.equal(JSON.stringify(calls).includes('NEVER-SEND'),false);
  assert.deepEqual(calls.find(c=>c.route.endsWith('/pos-cloud-price-config')).data.config,active);
  settings.google_price_auto_enabled=false;delete settings.google_price_relay_token;fs.writeFileSync(path.join(root,'settings.json'),JSON.stringify(settings));
  relay=create({ledger:l,config,bridge,now:()=>2000});relay.syncLocalSnapshot();await relay.flush();
  assert.deepEqual(calls.filter(c=>c.route.endsWith('/pos-cloud-price-config')).at(-1).data.config,{enabled:false,symbol:'BK'});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('cloud config handoff is independent of inventory errors and explicit disable works even if current prices are invalid',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kbl-cloud-isolation-'));
 try{
  const settings={google_price_auto_enabled:false,price_buy_9999:0,price_sell_9999:0};
  fs.writeFileSync(path.join(root,'settings.json'),JSON.stringify(settings));fs.writeFileSync(path.join(root,'inventory_db.json'),'not json');
  const l=ledger(),calls=[];l.set('pos-relay-active',true);l.set('pos-data-dir',root);
  const relay=create({ledger:l,config,now:()=>1000,bridge:{async request(route,method,data){calls.push({route,data});return {success:true};}}});
  relay.syncLocalSnapshot();await relay.flush();
  assert.equal(calls.length,1);assert.deepEqual(calls[0].data.config,{enabled:false,symbol:'BK'});
  assert.match(relay.view().cloudPriceHandoff.lastError,/^$/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('legacy POS POST without spreads accepts 12-second polling only after deriving six spreads from actual cached prices',async()=>{
 const l=ledger(),calls=[];
 l.set('pos-prices',Object.fromEntries(GOLD.flatMap((c,i)=>[['price_buy_'+c,1000000],['price_sell_'+c,1000100+i]])));
 const relay=create({ledger:l,config:{...config,posDataDir:path.join(os.tmpdir(),'missing-pos-'+Date.now())},now:()=>1000,bridge:{async request(route,method,data){calls.push({route,data});return {success:true};}}});
 const {spreads,...legacy}=active;
 const result=await relay.accept('cloud-price-config',{config:{...legacy,pollMs:12000}});
 assert.equal(result.status,200);assert.deepEqual(calls[0].data.config.spreads,active.spreads);assert.equal(calls[0].data.config.pollMs,12000);
 assert.equal(JSON.stringify(relay.view()).includes(active.relayToken),false);
 const empty=create({ledger:ledger(),config:{...config,posDataDir:path.join(os.tmpdir(),'missing-pos-'+Date.now())},bridge:{request(){throw Error('must not send');}}});
 await assert.rejects(()=>empty.accept('cloud-price-config',{config:{...legacy,pollMs:12000}}),/chênh lệch/);
});
