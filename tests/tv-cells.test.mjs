import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
let tv;
before(async()=>{const {build}=createRequire(fs.realpathSync('node_modules/wrangler/package.json'))('esbuild');await build({entryPoints:['lib/kbl/tv-design.ts'],bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/tv-cells.mjs'});tv=await import(pathToFileURL(path.resolve('.sites-runtime/tv-cells.mjs')).href);});
test('legacy template separates each header and live price without losing saved geometry, branding or values',()=>{
 const old=tv.defaultTVDesign();delete old.cells;delete old.cellStyles;old.titleText='Tên tiệm đã lưu';old.boxes.table={x:20,y:250,w:1500,h:540,visible:true};
 const before=structuredClone(old),d=tv.separateTVCells(tv.tvDesignSchema.parse(old));
 assert.deepEqual(old,before);assert.equal(Object.keys(d.cells).length,12);assert.equal(d.titleText,old.titleText);
 assert.deepEqual(d.cells['buy-980'],{x:520,y:520,w:500,h:135,visible:true});assert.deepEqual(d.boxes,old.boxes);
});
test('moving, resizing and styling one price leaves its sibling prices, headers and source data unchanged',()=>{
 const d=tv.defaultTVDesign(),before=structuredClone(d);tv.setTVBox(d,'cell:buy-9999',{x:480,y:444,w:480,h:125});tv.editableTVStyle(d,'cell:buy-9999').size=108;
 assert.equal(tv.tvBox(d,'cell:buy-9999').x,480);assert.equal(tv.tvStyle(d,'cell:buy-9999').size,108);
 for(const key of Object.keys(d.cells).filter(k=>k!=='buy-9999'))assert.deepEqual(d.cells[key],before.cells[key]);
 assert.deepEqual(d.styles,before.styles);assert.deepEqual(d.boxes,before.boxes);assert.equal(tv.tvStyle(d,'cell:sell-9999').size,70);
 tv.tvBox(d,'cell:buy-9999').locked=true;tv.setTVBox(d,'cell:buy-9999',{x:0});assert.equal(d.cells['buy-9999'].x,480);
});
test('moving/resizing the whole table scales its independent cells while all cells remain on canvas',()=>{
 const d=tv.defaultTVDesign(),old={...d.cells['sell-610']};tv.setTVBox(d,'table',{x:0,y:200,w:1200,h:600});
 assert.equal(d.cells['sell-610'].w,old.w*1200/1500);assert.ok(d.cells['sell-610'].x<old.x);
 for(const b of Object.values(d.cells)){assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=1600&&b.y+b.h<=900);}
 assert.ok(tv.tvDesignSchema.safeParse(d).success);
});
test('readable TV action enlarges prices and creates a real column gap, retaining brand, layers and live-price-only inputs',()=>{
 const d=tv.defaultTVDesign();d.titleText='Tên riêng';d.styles.buy.color='#123456';d.layers=[];const before=structuredClone(d),next=tv.readableTVPrices(d);
 assert.deepEqual(d,before);assert.equal(next.titleText,d.titleText);assert.deepEqual(next.layers,d.layers);assert.equal(next.styles.buy.color,'#123456');
 assert.equal(tv.tvStyle(next,'cell:buy-9999').size,94);assert.equal(tv.tvStyle(next,'cell:labels-9999').size,84);
 assert.ok(next.cells['sell-9999'].x-next.cells['buy-9999'].x-next.cells['buy-9999'].w>=50);assert.equal(next.compactPrices,true);
 assert.ok(tv.tvDesignSchema.safeParse(next).success);assert.deepEqual(tv.readableTVPrices(next),next);
});
test('cell schema rejects unknown keys, overflow, arbitrary styles and client-supplied gold prices',()=>{
 for(const mutate of [d=>d.cells['fake-price']={...d.boxes.table},d=>d.cells['buy-9999'].x=1599,d=>d.cellStyles['buy-9999']={...d.styles.buy,background:'url(secret)'},d=>d.prices=[{buy:1}]]){const d=tv.defaultTVDesign();mutate(d);assert.equal(tv.tvDesignSchema.safeParse(d).success,false);}
});
