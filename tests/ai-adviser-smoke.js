'use strict';
// Commercial release smoke for the additive Growth/Sales-Studio image pipeline.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8'),admin=fs.readFileSync(path.join(root,'views','admin.html'),'utf8');
const must=[
 'kblGrowthIdeaReview','kblGrowthDesignReviewBundle','kblGrowthPrepFactQa','kblGrowthPrepQrQa','kblGrowthPrepareCampaign','kblGrowthPublishDue','kblGrowthPipelineProgress',
 "media_type:'CAROUSEL'","attached_media:JSON.stringify(attached)",'sendMediaGroup',"media_type:'PHOTO'",'Post/Media ID'
];
for(const token of must)if(!app.includes(token)&&!admin.includes(token))throw new Error('Missing Growth/Publisher contract: '+token);
for(const p of ['facebook','instagram','threads','tiktok','telegram'])if(!app.includes(`platform==='${p}'`)&&!app.includes(`platform === '${p}'`))throw new Error('Publisher adapter dispatch missing '+p);
if(!app.includes("require('./vendor/sharp')"))throw new Error('Vendored deterministic composer fallback missing');
for(const asset of ['kbl-logo-production.png','kbl-website-qr.png'])if(!fs.existsSync(path.join(root,'public','images','kbl-growth',asset)))throw new Error('Missing production asset '+asset);
console.log('GROWTH_PIPELINE_STATIC_SMOKE_OK');
