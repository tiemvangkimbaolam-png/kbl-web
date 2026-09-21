'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const mustFiles=[
  'app.js','package.json','package-lock.json','views/admin.html',
  'modules/kbl-catalog-media.js','modules/kbl-commerce-v5.js','modules/kbl-publisher-media-v1.js',
  'modules/kbl-sales-studio.js','modules/kbl-studio-ai.js','modules/kbl-studio-core.js','modules/kbl-studio-video-format.js',
  'modules/studio-ui.js','modules/studio-ui.css',
  'public/images/kbl-growth/kbl-logo-production.png','public/images/kbl-growth/kbl-website-qr.png',
  'vendor/sharp/package.json','modules/kbl-growth-poster.js','vendor/jsqr/jsQR.js','vendor/jsqr/LICENSE',
  'modules/kbl-poster-portable.js','vendor/resvg-wasm/index.js','vendor/resvg-wasm/index_bg.wasm','vendor/resvg-wasm/LICENSE',
  'vendor/pngjs/package.json','vendor/poster-fonts/DejaVuSans.ttf','vendor/poster-fonts/DejaVuSans-Bold.ttf','vendor/poster-fonts/LICENSE'
];
for(const rel of mustFiles)if(!fs.existsSync(path.join(root,rel)))throw new Error('Missing release file: '+rel);
if(fs.existsSync(path.join(root,'public','app.js')))throw new Error('Security regression: public/app.js exposes server source');
if(fs.existsSync(path.join(root,'data')))throw new Error('Release must not package runtime data/');
if(fs.existsSync(path.join(root,'public','uploads')))throw new Error('Release must not package runtime public/uploads/');
const pkg=require(path.join(root,'package.json')),lock=require(path.join(root,'package-lock.json'));
const a=JSON.stringify(pkg.dependencies||{}),b=JSON.stringify(lock.packages?.['']?.dependencies||{});
if(a!==b)throw new Error('package.json/package-lock dependency mismatch');
const sharp=require(path.join(root,'vendor','sharp'));
if(!sharp||!sharp.versions?.sharp)throw new Error('Vendored Sharp did not load');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8'),admin=fs.readFileSync(path.join(root,'views','admin.html'),'utf8');
for(const token of [
  "KBL_GROWTH_PREP_FIRST_VERSION='1.3.9-sales-studio-recovery'",
  "path.join(__dirname,'vendor','sharp')",
  '/api/admin/growth-autopilot/status','/api/admin/growth-autopilot/run-now',
  '/api/admin/growth-autopilot/settings','/api/admin/growth-autopilot/auto-publish',
  'kblGrowthIdeaReview','kblGrowthDesignReviewBundle','kblGrowthPrepareCampaign','kblGrowthPublishDue'
]) if(!app.includes(token))throw new Error('Missing release contract: '+token);
for(const token of ['V1.3.9 · SALES STUDIO · PHỤC HỒI TỪNG ẢNH','sales-studio-image-workflow-mount','sales-image-auto-badge','sales-image-metrics'])if(!admin.includes(token))throw new Error('Missing Sales Studio UI contract: '+token);
const serverFiles=['app.js',...fs.readdirSync(path.join(root,'modules')).filter(x=>x.endsWith('.js')).map(x=>'modules/'+x),...fs.readdirSync(path.join(root,'scripts')).filter(x=>x.endsWith('.js')).map(x=>'scripts/'+x)];
const missing=[];
for(const rel of serverFiles){const f=path.join(root,rel),s=fs.readFileSync(f,'utf8');for(const m of s.matchAll(/require\(['"](\.\.?\/[^'"]+)['"]\)/g)){if(m[1]==='./vendor/sharp')continue;const base=path.resolve(path.dirname(f),m[1]),c=[base,base+'.js',base+'.json',path.join(base,'index.js')];if(!c.some(fs.existsSync))missing.push(rel+' -> '+m[1]);}}
if(missing.length)throw new Error('Missing local require(s): '+missing.join('; '));
console.log('RELEASE_SMOKE_OK sharp='+sharp.versions.sharp+' serverFiles='+serverFiles.length);
