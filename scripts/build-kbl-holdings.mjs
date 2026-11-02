import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'public/tien-ich/vang-cua-toi');
fs.mkdirSync(dir,{recursive:true});
const core=fs.readFileSync(path.join(root,'lib/kbl/holdings-core.mjs'),'utf8');fs.writeFileSync(path.join(dir,'core.mjs'),core);
const script=fs.readFileSync(path.join(root,'scripts/scriptable-holdings.template.js'),'utf8').replace('__KBL_LOGO__',fs.readFileSync(path.join(root,'public/tien-ich/widget-kbl/assets/kbl-logo.png')).toString('base64'));
for(const ext of ['js','txt'])fs.writeFileSync(path.join(dir,'KBL_Vang_Cua_Toi.'+ext),script);
fs.writeFileSync(path.join(dir,'install-manifest.json'),JSON.stringify({version:1,file:'KBL_Vang_Cua_Toi.js',bytes:Buffer.byteLength(script),sha256:createHash('sha256').update(script).digest('hex')},null,2));
console.log('Generated private holdings widget, verified install manifest and browser ledger core.');
