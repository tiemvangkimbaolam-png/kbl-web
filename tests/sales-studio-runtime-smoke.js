'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'views','admin.html'),'utf8');
function extractFunction(source,name){
  const start=source.indexOf('function '+name+'(');
  if(start<0)throw new Error('Missing function '+name);
  const brace=source.indexOf('{',start);
  let depth=0,quote='',escape=false,lineComment=false,blockComment=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(lineComment){if(c==='\n')lineComment=false;continue;}
    if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++;}continue;}
    if(quote){if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){lineComment=true;i++;continue;}
    if(c==='/'&&n==='*'){blockComment=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;
    if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error('Unclosed function '+name);
}
const nodes={};
const ctx={
  $:id=>(nodes[id]||(nodes[id]={id,className:'',textContent:'',innerHTML:'',style:{}})),
  safe:v=>String(v==null?'':v).replace(/[<>&]/g,''),
  dateTime:v=>String(v||''),
  salesImageSetStagebar:()=>{},
  salesImageQaPills:()=>'<span>qa</span>',
  salesImageRenderCard:()=>'<article>card</article>',
  console,Math,Number,Array,String,Boolean,Date
};
vm.createContext(ctx);
vm.runInContext(extractFunction(html,'renderSalesStudioImagePipeline'),ctx);
const sample={
  preparedPosts:[
    {ready:false,status:'preparing',skus:['KBL-K0010','KBL-K0013','KBL-K0015'],ideaSnapshot:{title:'Ý tưởng A'},ideaReview:{approved:true,reason:'PASS'},progress:{current:'GENERATING_3_IMAGES',progress:42,label:'Đang tạo 3 ảnh'}},
    {ready:true,status:'ready',skus:['KBL-K0001','KBL-K0002','KBL-K0003'],ideaSnapshot:{title:'Ý tưởng B'},ideaReview:{approved:true},progress:{current:'READY_TO_POST',progress:86,label:'READY TO POST'}}
  ],
  watchdog:{serverSchedulerHealthy:true,readyCount:4,tickAgeSeconds:3},
  composer:{ready:true,diagnostic:'vendor sharp 0.34.1'},
  settings:{enabled:true,autoPublishPosts:true},busy:false,history:[],reviewQueue:[]
};
ctx.renderSalesStudioImagePipeline(sample);
assert(nodes['sales-image-metrics'].innerHTML.includes('2'));
assert(nodes['sales-image-metrics'].innerHTML.includes('READY'));
assert(nodes['sales-image-current'].innerHTML.includes('Đang tạo 3 ảnh'));
ctx.renderSalesStudioImagePipeline({preparedPosts:[],watchdog:{serverSchedulerHealthy:true,readyCount:0,tickAgeSeconds:1},composer:{ready:false,diagnostic:'test'},settings:{enabled:true,autoPublishPosts:true},busy:true,activityPhase:'IDEA_REVIEW',history:[],reviewQueue:[]});
assert(nodes['sales-image-current'].innerHTML.includes('AI Idea Reviewer'));
console.log('SALES_STUDIO_RUNTIME_SMOKE_OK');
