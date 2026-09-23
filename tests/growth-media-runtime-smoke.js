'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');

// Regression for production incident 2026-09-19:
// never reference KBL_PUBLIC_BASE_URL as a bare JS variable; it is an env name.
if(app.includes('||KBL_PUBLIC_BASE_URL||')||app.includes('|| KBL_PUBLIC_BASE_URL ||'))throw new Error('Known bad bare KBL_PUBLIC_BASE_URL reference remains in app.js');
if(!app.includes('function kblGrowthPublicBaseUrl()'))throw new Error('Growth public base URL helper missing');

function extractFunction(source,name){
  const prefix='function '+name+'(';
  const line=source.split(/\r?\n/).find(x=>x.startsWith(prefix));
  if(line&&line.trim().endsWith('}'))return line;
  throw new Error('Missing one-line function '+name);
}
const ctx={
  KBL_PUBLISHER_PUBLIC_BASE_URL:'',
  process:{env:{KBL_PUBLIC_BASE_URL:'https://tiemvangkimbaolam.id.vn/'}},
  safeImageSource(v){const s=String(v||'').trim();return s.startsWith('/')||s.startsWith('https://')||s.startsWith('data:image/png;base64,')?s:'';},
  safeHttpsUrl(v){try{const u=new URL(String(v||''));return u.protocol==='https:'?u.toString():'';}catch(_){return'';}},
  persistInlineImageToPublic(){return '/uploads/studio/runtime-test.png';},
  URL,
  crypto,
  publisherMediaForProduct(p){return {image:p.image||''};},
  kblCatalogMedia:{imageFor(p){return p.image||'';}},
  cleanInventoryCode(v){return String(v||'');},
  kblGrowthState:{assets:{}},
  kblGrowthSave(){},
  publisherLocalPublicPath(){return '';},
  async kblGrowthLoadImageBytes(source){return source.startsWith('data:image/png;base64,')?{mimeType:'image/png',data:source.split(',')[1],bytes:3}:null;},
  async kblGrowthProbeImageUrl(){return {ok:true,status:200,contentType:'image/png'};}
};
vm.createContext(ctx);
vm.runInContext(extractFunction(app,'kblGrowthPublicBaseUrl')+'\n'+extractFunction(app,'kblGrowthAbsolute')+'\n'+extractFunction(app,'kblGrowthPublicImageInfo')+'\n'+app.slice(app.indexOf('async function kblGrowthMaterializeProductImage('),app.indexOf('async function kblGrowthPreparePublishImages(',app.indexOf('async function kblGrowthMaterializeProductImage('))),ctx);
assert.strictEqual(ctx.kblGrowthPublicBaseUrl(),'https://tiemvangkimbaolam.id.vn');
assert.strictEqual(ctx.kblGrowthAbsolute('/api/catalog-media/abc/image/'+'a'.repeat(64)),'https://tiemvangkimbaolam.id.vn/api/catalog-media/abc/image/'+'a'.repeat(64));
assert.strictEqual(ctx.kblGrowthAbsolute('/images/kbl-growth/kbl-logo-production.png'),'https://tiemvangkimbaolam.id.vn/images/kbl-growth/kbl-logo-production.png');
assert.strictEqual(ctx.kblGrowthAbsolute('https://cdn.example.com/a.jpg'),'https://cdn.example.com/a.jpg');
ctx.KBL_PUBLISHER_PUBLIC_BASE_URL='https://publisher.example.com';
assert.strictEqual(ctx.kblGrowthPublicBaseUrl(),'https://publisher.example.com');

(async()=>{
  const inline='data:image/png;base64,YWJj',product={id:'7',sku:'KBL-K0007',image:inline,updatedAt:'2026-09-23'};
  assert.strictEqual(ctx.kblGrowthPublicImageInfo(product,false).kind,'inline');
  const materialized=await ctx.kblGrowthMaterializeProductImage(product);
  assert.strictEqual(materialized.ok,true);
  assert.strictEqual(materialized.url,'https://publisher.example.com/uploads/studio/runtime-test.png');
  assert.ok(!JSON.stringify(ctx.kblGrowthState.assets).includes(inline),'Do not persist inline product bytes in Growth state');
  const catalog=require(path.join(root,'modules/kbl-catalog-media')).create({getProducts:()=>[large],publicationStatusFor:()=> 'published',safeImageSource:v=>String(v).length>2800000?'':String(v)});
  const large={id:'large-photo',image:'data:image/png;base64,'+Buffer.alloc(2200000,83).toString('base64')};
  const compact=catalog.imageFor(large,'image',true);
  assert(compact.startsWith('/api/catalog-media/'),'Photos larger than the legacy 2MB inline cap must use an image route');
  const sharp=require(path.join(root,'vendor','sharp'));
  if(!sharp||!sharp.versions||!sharp.versions.sharp)throw new Error('Vendored Sharp unavailable');
  const probe=await sharp({create:{width:24,height:30,channels:4,background:{r:255,g:255,b:255,alpha:1}}}).png().toBuffer();
  const meta=await sharp(probe).metadata();
  assert.strictEqual(meta.width,24);assert.strictEqual(meta.height,30);
  for(const rel of ['public/images/kbl-growth/kbl-logo-production.png','public/images/kbl-growth/kbl-website-qr.png']){
    const p=path.join(root,rel);if(!fs.existsSync(p))throw new Error('Missing '+rel);
    const m=await sharp(p).metadata();if(!(m.width>0&&m.height>0))throw new Error('Unreadable '+rel);
  }
  console.log('GROWTH_MEDIA_RUNTIME_SMOKE_OK base-url + catalog-media + sharp='+sharp.versions.sharp);
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
