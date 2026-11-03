const money=n=>new Intl.NumberFormat('vi-VN').format(n)+' đồng';
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
export function localTemplateCopy(story,research){
 if(!['gold','product'].includes(story?.kind)||!Number.isFinite(story.editionAt))throw Error('Không có hồ sơ mẫu local hợp lệ.');
 const time=new Date(story.editionAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
 let headline,summary,script;
 if(story.kind==='gold'){
  const s=story.priceSnapshot,rows=s?.rows;
  if(research?.evidenceKind!=='pos-price-snapshot'||JSON.stringify(research.priceSnapshot)!==JSON.stringify(s)||!Array.isArray(rows)||!rows.length||new Set(rows.map(r=>r.code)).size!==rows.length||rows.some(r=>!['9999','980','750','610','585','416'].includes(r.code)||!r.label||r.unit!=='đồng/chỉ'||!positive(r.buy)||!positive(r.sell)||r.sell<r.buy))throw Error('Bản giá local không khớp bằng chứng POS đã chốt.');
  const selected=['9999','980','610'].map(code=>rows.find(r=>r.code===code));if(selected.some(r=>!r))throw Error('Chưa đủ ba loại vàng của mẫu đã chọn.');
  headline='Bảng giá vàng Kim Bảo Lâm · '+time;
  summary=selected.map(r=>r.label+': mua vào '+money(r.buy)+', bán ra '+money(r.sell)+' mỗi chỉ.').join('\n');
  script='Tiệm vàng Kim Bảo Lâm cập nhật bảng giá đã chốt lúc '+time+'. Đơn vị đồng trên một chỉ. '+summary.replace(/\n/g,' ')+' Giá tại thời điểm chốt bảng. Quý khách vui lòng xác nhận tại tiệm trước khi giao dịch.';
 }else{
  const products=story.productSnapshots;
  if(research?.evidenceKind!=='pos-product-snapshot'||!Array.isArray(products)||products.length!==3||new Set(products.map(p=>p.sku)).size!==3||new Set(products.map(p=>p.imageIds?.[0])).size!==3||products.some(p=>!p.sku||!p.name||!p.purity||!positive(p.price)||!positive(p.weight)||p.imageIds?.length!==1||!research.items?.some(i=>i.excerpt===JSON.stringify(p))))throw Error('Bộ sản phẩm local không khớp ba SKU/ảnh đã chốt.');
  headline='Ba mẫu trang sức tại Kim Bảo Lâm · '+time;
  summary=products.map(p=>p.name+' · '+p.sku+' · Vàng '+p.purity+' · Giá tham khảo '+money(p.price)+'.').join('\n');
  script='Tiệm vàng Kim Bảo Lâm giới thiệu ba mẫu trang sức tại mốc '+time+'. '+summary.replace(/\n/g,' ')+' Ảnh thật và giá theo dữ liệu đã chốt của cửa hàng. Quý khách xác nhận tình trạng còn hàng và giá tại tiệm trước khi giao dịch.';
 }
 return {headline:headline.slice(0,180),summary,script,sourceUrls:research.items.map(i=>i.url)};
}
