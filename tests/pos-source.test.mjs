import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
const require=createRequire(import.meta.url),connection=require('../pos-source/kbl-connection.cjs');
test('POS connection supports exact loopback relay and HTTPS, rejects insecure hosts or path/credential injection',()=>{
 assert.equal(connection.validateUrl('http://127.0.0.1:39878/'),'http://127.0.0.1:39878');
 assert.equal(connection.validateUrl('https://kbl.example/'),'https://kbl.example');
 assert.equal(connection.publicBase(), 'https://tiemvangkimbaolam.id.vn');
 assert.throws(()=>connection.publicBase('http://127.0.0.1:39878')); 
 for(const u of ['http://localhost:39878','http://127.0.0.1:39877','http://evil.example','https://x.example/admin','https://user:pass@x.example','https://x.example/?token=x'])assert.throws(()=>connection.validateUrl(u));
});
test('POS connection survives process reload separately from formula/settings files and does not leak token through save receipt',()=>{
 const old=process.env.LOCALAPPDATA,root=fs.mkdtempSync(path.join(os.tmpdir(),'kbl-pos-connect-'));process.env.LOCALAPPDATA=root;
 try{
  assert.equal(connection.read(),null);
  const receipt=connection.save({url:'http://127.0.0.1:39878',token:'private-local-token'});
  assert.equal(JSON.stringify(receipt).includes('private-local-token'),false);
  delete require.cache[require.resolve('../pos-source/kbl-connection.cjs')];
  assert.deepEqual(require('../pos-source/kbl-connection.cjs').read(),{url:'http://127.0.0.1:39878',token:'private-local-token'});
  assert.throws(()=>connection.save({url:'http://evil.example',token:'bad'}));
  assert.equal(connection.read().url,'http://127.0.0.1:39878');
  assert.deepEqual(fs.readdirSync(root),['KBL-New']);
 }finally{if(old===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=old;fs.rmSync(root,{recursive:true,force:true});}
});
test('latest POS files match recorded source provenance, with byte-identical photo module and package originals',()=>{
 const root=path.resolve('pos-source'),proof=JSON.parse(fs.readFileSync(path.join(root,'LATEST_SOURCE_PROVENANCE.json')));
 for(const [name,expected]of Object.entries(proof.patched))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex'),expected,name);
 for(const name of ['kbl-product-photos.cjs','package.json'])assert.equal(proof.patched[name],proof.originals[name]);
});
