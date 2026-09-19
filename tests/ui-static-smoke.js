'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),file=path.join(root,'views','admin.html'),html=fs.readFileSync(file,'utf8');
const required=['sales-studio-section','sales-studio-root','sales-studio-image-workflow-mount','sales-image-auto-badge','sales-image-metrics','sales-image-current','sales-image-live-list','sales-image-ready-count','growth-autopilot-card','growth-prepared-posts'];
for(const id of required)if(!html.includes(`id="${id}"`))throw new Error('Missing admin id: '+id);
const markup=html.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi,'');
const ids=[...markup.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]),seen=new Set(),dupes=[];
for(const id of ids){if(seen.has(id))dupes.push(id);seen.add(id)}
if(dupes.length)throw new Error('Duplicate markup IDs: '+[...new Set(dupes)].join(', '));
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(x=>x.trim());
scripts.forEach((code,i)=>{try{new vm.Script(code,{filename:`admin-inline-${i+1}.js`})}catch(e){throw new Error(`Inline script ${i+1}: ${e.message}`)}});
for(const name of ['renderGrowthPreparedPosts','renderSalesStudioImagePipeline','renderGrowthAutopilot','loadGrowthAutopilot'])if(!html.includes(`function ${name}`)&&!html.includes(`async function ${name}`))throw new Error('Missing UI function '+name);
if(/ready\s+is\s+not\s+defined/i.test(html))throw new Error('Known ready scope error text leaked into source');
console.log(`UI_STATIC_SMOKE_OK ids=${ids.length} scripts=${scripts.length}`);
