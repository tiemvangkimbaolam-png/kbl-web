import test from 'node:test';
import assert from 'node:assert/strict';
import { officeSnapshot } from '../app/components/ai-office-state.mjs';
import { normalizeFleetSnapshot } from '../public/ai-office/studio/fleet-contract.mjs';
test('R40 office projects twenty positions without turning vacant seats or completed steps into working accounts', () => {
 const now=100000, accounts=[{id:'a',label:'Gemini',provider:'gemini',enabled:true,lastSeen:now,status:'ready',token:'DO-NOT-SEND'}];
 const s=officeSnapshot(accounts,[{id:'j',owner:'a',stage:'image',status:'complete',lease_hash:'SECRET'}],{now,enabled:true});
 assert.equal(s.bots.length,20);assert.equal(s.bots[0].state,'ready');assert.equal(s.bots[0].jobs.length,0);assert.equal(s.bots.filter(b=>b.kind==='vacant').length,19);
 assert.equal(JSON.stringify(s).includes('SECRET'),false);assert.equal(JSON.stringify(s).includes('DO-NOT-SEND'),false);assert.equal(normalizeFleetSnapshot(s).bots.length,20);
});
test('room activity uses owner/status and fresh actual heartbeat, pauses and errors stay distinct',()=>{
 const now=100000,a={id:'a',enabled:true,lastSeen:now,status:'working'};
 const job={id:'j',owner:'a',stage:'review',status:'running',updated_at:now};
 assert.equal(officeSnapshot([a],[job],{now,enabled:true}).bots[0].state,'reviewing');
 assert.equal(officeSnapshot([a],[job],{now,enabled:true,fresh:false}).bots[0].state,'unknown');
 assert.equal(officeSnapshot([{...a,lastSeen:now-60001}],[job],{now}).bots[0].state,'offline');
 assert.equal(officeSnapshot([{...a,status:'quota'}],[job],{now}).bots[0].state,'quota');
 assert.equal(officeSnapshot([{...a,status:'ready'}],[],{now,enabled:false}).bots[0].state,'waiting');
 assert.equal(officeSnapshot([a],[{...job,status:'attention'}],{now}).bots[0].state,'error');
});

test('restored room carries every local module and robot asset without a CDN or legacy Admin dependency', async()=>{
 const fs=await import('node:fs');const path=await import('node:path');const root=path.resolve('public/ai-office');let modules=0;
 function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory())walk(p);else if(/\.(?:mjs|js)$/.test(p)){modules++;const source=fs.readFileSync(p,'utf8');for(const m of source.matchAll(/(?:^|\n)\s*import\s+(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]/g)){if(m[1].startsWith('.'))assert.equal(fs.existsSync(path.resolve(path.dirname(p),m[1].split('?')[0])),true,`${p} => ${m[1]}`);else assert.fail('Unexpected external module '+m[1]);}}}}
 walk(root);assert.ok(modules>20);assert.equal(fs.readFileSync(path.join(root,'assets/tam19.glb')).subarray(0,4).toString(),'glTF');
 const bootstrap=fs.readFileSync(path.join(root,'office.mjs'),'utf8');assert.equal(bootstrap.includes('e.origin !== window.location.origin'),true);assert.equal(bootstrap.includes("fetch('/api/admin"),false);
});
