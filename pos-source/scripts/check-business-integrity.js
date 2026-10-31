const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),m=require('../formula-original-hashes.json');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
if(sha(fs.readFileSync(path.join(root,'shared-scale.js')))!==m.base_shared_scale_sha256)throw Error('Gold weight calculation core modified');
if(sha(fs.readFileSync(path.join(root,'renderer.js')))!==m.commercial_renderer_sha256)throw Error('Commercial renderer code differs from reviewed sealed baseline');
console.log('[PASS] Shared gold math unchanged. Commercial renderer sealed SHA-256. Run check-business-golden.js for transaction mathematics.');
