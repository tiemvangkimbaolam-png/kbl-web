const fs=require('fs'), path=require('path'), crypto=require('crypto');
const root=path.resolve(__dirname,'..'); const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
const isLocked=fs.existsSync(path.join(root,'integrity-manifest.json'));
for(const name of ['index.html','pawn.html','setup.html','renderer.js','shared-scale.js','kbl-jewel-ui.css','kbl-jewel-ui.js','kbl-commercial-notice.js','kbl-commercial-compat.css','kbl-pos-logo.ico']) {
 if(!fs.existsSync(path.join(root,name))) throw Error('Missing file '+name);
}
for (const html of ['index.html','pawn.html']){
 const doc=fs.readFileSync(path.join(root,html),'utf8');
 if(!doc.includes('kbl-jewel-ui.css') || !doc.includes('kbl-jewel-ui.js')) throw Error('Blue UI not installed: '+html);
}
if(!main.includes('nodeIntegrationInSubFrames:false') && !main.includes('nodeIntegrationInSubFrames: false')) throw Error('Untrusted subframes still have Node');
if(isLocked){
 const pub=main.match(/const COMMERCIAL_LICENSE_PUBLIC_KEY = `([\s\S]*?)`;/);
 if(!pub) throw Error('Missing license public key');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'integrity-manifest.json'),'utf8'));
 const bytes=Buffer.from(JSON.stringify(manifest.payload));
 const sig=Buffer.from(manifest.signature.replace(/-/g,'+').replace(/_/g,'/'),'base64');
 if(!crypto.verify(null,bytes,pub[1],sig)) throw Error('Release signature invalid');
 for(const [name,hash] of Object.entries(manifest.payload.files)) {
  const file=path.join(root,name); if(!fs.existsSync(file)) throw Error('Missing signed file '+name);
  if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==hash) throw Error('Mismatch '+name);
 }
 console.log('[PASS] Signed release manifest Ed25519, all file hashes match.');
}else{
 if(main.includes('COMMERCIAL_LICENSE_PUBLIC_KEY')) throw Error('Unlocked edition accidentally includes license lock');
 console.log('[PASS] Unlocked edition contains no commercial activation gate.');
}
if(fs.readdirSync(root).some(n=>n.includes('private')||n.includes('signing')))throw Error('PRIVATE SIGNING MATERIAL IN CUSTOMER ZIP');
console.log('[PASS] Packaging excludes private license key.');
