'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'../views/admin.html'),'utf8');
function body(name,next){const start=html.indexOf('function '+name+'('),end=html.indexOf(next,start);assert(start>=0&&end>start);return html.slice(start,end)}
const nodes={},ctx={
 $:id=>(nodes[id]||(nodes[id]={innerHTML:'',textContent:'',querySelectorAll:()=>[]})),
 safe:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),dateTime:String,
 retryGrowthPreparation:()=>{},Array,String,Boolean,Number,Math
};
vm.createContext(ctx);
vm.runInContext(body('growthImageReviewText','async function retryGrowthPreparation'),ctx);
ctx.renderGrowthPreparedPosts({preparedPosts:[{campaignId:'x',skus:['A','B','C'],status:'retry-wait',ready:false,message:'Lỗi <script>không được chạy</script>',nextPreparationAt:'2026-09-20',prepared:{posterResults:[{posterImage:'/images/a.png'}]},schedules:[]}]});
const out=nodes['growth-prepared-posts'].innerHTML;
assert(out.includes('CHỜ THỬ LẠI'));assert(out.includes('Ảnh 1/3'));assert(out.includes('Design AI · chờ'));assert(out.includes('data-growth-retry="x"'));assert(out.includes('Thử lại lúc'));
assert(!out.includes('<script>'));assert(out.includes('&lt;script&gt;'));
ctx.renderGrowthPreparedPosts({preparedPosts:[{campaignId:'ready',skus:['A','B','C'],status:'ready',ready:true,prepared:{posterUrls:['/a','/b','/c'],designQa:{approved:true},factQa:{approved:true},qrQa:{approved:true},mediaQa:{approved:true}},schedules:[]}]});
assert(nodes['growth-prepared-posts'].innerHTML.includes('READY TO POST'));assert(!nodes['growth-prepared-posts'].innerHTML.includes('data-growth-retry'));
ctx.renderGrowthPreparedPosts({preparedPosts:[{campaignId:'review',skus:['A','B','C'],status:'retry-wait',ready:false,prepared:{posterResults:[{posterImage:'/a'}],designQa:{rows:[{approved:false,model:'review',reason:'Cropped <img onerror=bad>'}]}},drafts:{facebook:'Caption <script>bad</script>'},schedules:[{platform:'facebook',dueAt:'now'}]}]});
assert(nodes['growth-prepared-posts'].innerHTML.includes('Cần sửa ảnh: Cropped &lt;img'));
assert(nodes['growth-prepared-posts'].innerHTML.includes('Nội dung đã chuẩn bị theo kênh'));
assert(nodes['growth-prepared-posts'].innerHTML.includes('Caption &lt;script&gt;'));
assert(!nodes['growth-prepared-posts'].innerHTML.includes('<script>'));
assert(html.includes('id="growth-image-limit"'));assert(html.includes('id="growth-image-retry-hours"'));
// The retry control sends a JSON body, using the existing admin-auth header helper.
assert(html.includes("fetch('/api/admin/growth-autopilot/prepare',{method:'POST',headers:headers(true),"));
console.log('GROWTH_PREPARED_UI_RUNTIME_OK partial-preview + waiting-vs-failed + escaping + retry-action');
