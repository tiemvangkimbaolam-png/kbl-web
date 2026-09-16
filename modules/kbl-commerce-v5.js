const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const V5_VERSION = '5.0.1-commerce-trust-attribution';

function install(app, ctx) {
  if (!app || !ctx) throw new Error('KBL V5: thiếu app/context.');
  const DATA_DIR = ctx.dataDir;
  const WARRANTY_FILE = path.join(DATA_DIR, 'warranties-v5.json');
  const RESERVATION_FILE = path.join(DATA_DIR, 'reservations-v5.json');
  const CHECKOUT_FILE = path.join(DATA_DIR, 'checkouts-v5.json');
  const SHIPMENT_FILE = path.join(DATA_DIR, 'shipments-v5.json');
  const SETTINGS_FILE = path.join(DATA_DIR, 'commerce-v5-settings.json');

  const readJson = (file, fallback) => {
    try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return v ?? fallback; } catch (_) { return fallback; }
  };
  const writeJson = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive:true });
    const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  };
  const warrantyLoaded = readJson(WARRANTY_FILE, []);
  const reservationLoaded = readJson(RESERVATION_FILE, []);
  const checkoutLoaded = readJson(CHECKOUT_FILE, []);
  const shipmentLoaded = readJson(SHIPMENT_FILE, []);
  let warranties = Array.isArray(warrantyLoaded) ? warrantyLoaded : [];
  let reservations = Array.isArray(reservationLoaded) ? reservationLoaded : [];
  let checkouts = Array.isArray(checkoutLoaded) ? checkoutLoaded : [];
  let shipments = Array.isArray(shipmentLoaded) ? shipmentLoaded : [];
  let settings = { 
    reservationMinutes:60, checkoutReservationMinutes:25, warrantyMonths:12,
    bankId:'970416', accountNo:'50495537', accountName:'CÔNG TY TNHH VÀNG BẠC ĐÁ QUÝ KIM BẢO LÂM', vietQrTemplate:'compact2',
    insuranceDefault:false, insuranceNote:'Bảo hiểm chỉ hiển thị là đã mua sau khi Admin xác nhận với đơn vị vận chuyển.',
    ...(readJson(SETTINGS_FILE, {}) || {})
  };
  if (!String(settings.bankId || '').trim()) settings.bankId = '970416';
  if (!String(settings.accountNo || '').trim()) settings.accountNo = '50495537';
  if (!String(settings.accountName || '').trim()) settings.accountName = 'CÔNG TY TNHH VÀNG BẠC ĐÁ QUÝ KIM BẢO LÂM';

  const n = (v,d=0) => { const x=Number(v); return Number.isFinite(x)?x:d; };
  const clean = (v,max=300) => String(v===undefined||v===null?'':v).normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
  const phoneKey = (v) => String(v||'').replace(/\D/g,'').slice(0,15);
  const skuKey = (v) => clean(v,100).toUpperCase().replace(/[^A-Z0-9_-]/g,'');
  const tokenHash = (v) => crypto.createHash('sha256').update(String(v||'')).digest('hex');
  const id = (prefix, bytes=7) => prefix + '-' + crypto.randomBytes(bytes).toString('hex').toUpperCase();
  const nowIso = () => new Date().toISOString();
  const clampInt=(v,min,max,def)=>Math.min(max,Math.max(min,Math.floor(n(v,def))));
  const esc = (v) => String(v??'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const money = (v) => Math.round(Math.max(0,n(v))).toLocaleString('vi-VN')+'đ';
  const fmt = (v,d=3) => Number(n(v)).toLocaleString('vi-VN',{maximumFractionDigits:d});
  const baseUrl = (req) => {
    const configured = clean(process.env.KBL_PUBLIC_BASE_URL,500).replace(/\/$/,'');
    if (configured && /^https?:\/\//i.test(configured)) return configured;
    const proto = clean(String(req.headers['x-forwarded-proto']||'').split(',')[0],20) || req.protocol || 'https';
    return `${proto}://${clean(req.get('host'),200)}`;
  };
  const maskName=(name)=>{ const parts=clean(name,100).split(' ').filter(Boolean); if(parts.length<=1)return parts[0]||'Quý khách'; return parts.map((p,i)=>i===0?p:(p[0]||'')+'.').join(' '); };
  const publicProduct=(p)=>p?{
    id:String(p.id||''),sku:skuKey(p.sku||p.id),name:clean(p.name,160),category:clean(p.displayCategory||p.category,80),goldCode:clean(p.goldCode,20),
    weightChi:Math.max(0,n(p.weightChi)),totalWeightChi:Math.max(0,n(p.totalWeightChi)),attachedWeightChi:Math.max(0,n(p.attachedWeightChi)),workmanship:Math.max(0,n(p.workmanship)),
    image:clean(p.image,1500),origin:clean(p.origin||'Việt Nam',160),applicableStandard:clean(p.applicableStandard,240),producerName:clean(p.producerName,200),supplierName:clean(p.supplierName,200),
    referencePrice:Math.max(0,n(ctx.priceForProduct(p)))
  }:null;
  const products=()=>ctx.getProducts();
  const orders=()=>ctx.getOrders();
  const customers=()=>ctx.getCustomers();
  const loyaltyRows=()=>ctx.getLoyaltyLedger();
  const productById=(value)=>products().find(p=>String(p.id)===String(value));
  const productBySku=(value)=>products().find(p=>skuKey(p.sku||p.id)===skuKey(value));
  const isCurrentProduct=(p)=>p&&((typeof ctx.normalizeProductKind==='function'&&ctx.normalizeProductKind(p.kind)==='current')||(!ctx.normalizeProductKind&&['current','available','in-stock','stock','shop'].includes(String(p.kind||'').toLowerCase())));
  const customerById=(value)=>customers().find(c=>String(c.id)===String(value));
  const customerByPhone=(value)=>customers().find(c=>phoneKey(c.phone)===phoneKey(value));

  function saveAll() {
    writeJson(WARRANTY_FILE,warranties.slice(0,50000));
    writeJson(RESERVATION_FILE,reservations.slice(0,50000));
    writeJson(CHECKOUT_FILE,checkouts.slice(0,10000));
    writeJson(SHIPMENT_FILE,shipments.slice(0,10000));
    writeJson(SETTINGS_FILE,settings);
  }
  function cleanupReservations(productLookup = null) {
    const now=Date.now(); let dirty=false;
    reservations.forEach(r=>{
      if(!r || r.status!=='active') return;
      const p=productLookup ? productLookup.get(String(r.productId)) : productById(r.productId);
      if(!p || String(p.status||'available')!=='available' || !isCurrentProduct(p)) {
        r.status='released'; r.releaseReason='inventory-unavailable'; r.updatedAt=nowIso(); dirty=true; return;
      }
      if(Date.parse(r.expiresAt||0)<=now){r.status='expired';r.updatedAt=nowIso();dirty=true;}
    });
    if(dirty) writeJson(RESERVATION_FILE,reservations);
  }
  function activeReservation(productId) {
    cleanupReservations();
    return reservations.find(r=>r&&r.status==='active'&&String(r.productId)===String(productId)&&Date.parse(r.expiresAt||0)>Date.now())||null;
  }
  function availabilityForProduct(productId) {
    const p=productById(productId)||productBySku(productId);
    if(!p)return {status:'unavailable',reserved:false,label:'Không còn trong kho'};
    if(!isCurrentProduct(p))return {status:'reference',reserved:false,label:'Tham khảo / đặt hàng'};
    if(String(p.status||'available')!=='available'){cleanupReservations();return {status:'unavailable',reserved:false,label:'Đã bán / không còn hàng'};}
    const r=activeReservation(p.id);
    if(!r)return {status:'available',reserved:false,label:'Còn hàng tại tiệm'};
    return {status:'reserved',reserved:true,label:r.purpose==='confirmed-order'?'Đã có khách xác nhận mua':'Đang được giữ tạm',reservedUntil:r.expiresAt,reservationId:r.id,purpose:r.purpose||'hold'};
  }
  // One fresh read per catalogue request. No TTL cache for inventory/reservations.
  function availabilityForProducts(list) {
    const productLookup=new Map();
    for(const p of products()) if(p&&!productLookup.has(String(p.id))) productLookup.set(String(p.id),p);
    cleanupReservations(productLookup);
    const now=Date.now(),active=new Map(),result=new Map();
    for(const r of reservations) {
      if(r&&r.status==='active'&&Date.parse(r.expiresAt||0)>now&&!active.has(String(r.productId))) active.set(String(r.productId),r);
    }
    for(const item of list) {
      const p=productLookup.get(String(item.id)),key=String(item.id);
      if(!p){result.set(key,{status:'unavailable',reserved:false,label:'Không còn trong kho'});continue;}
      if(!isCurrentProduct(p)){result.set(key,{status:'reference',reserved:false,label:'Tham khảo / đặt hàng'});continue;}
      if(String(p.status||'available')!=='available'){result.set(key,{status:'unavailable',reserved:false,label:'Đã bán / không còn hàng'});continue;}
      const r=active.get(key);
      result.set(key,r?{status:'reserved',reserved:true,label:r.purpose==='confirmed-order'?'Đã có khách xác nhận mua':'Đang được giữ tạm',reservedUntil:r.expiresAt,reservationId:r.id,purpose:r.purpose||'hold'}:{status:'available',reserved:false,label:'Còn hàng tại tiệm'});
    }
    return result;
  }
  function reserveProduct({productId,orderId='',checkoutId='',customerId='',minutes,purpose='hold'}) {
    const p=productById(productId);
    if(!p||String(p.status||'available')!=='available'||!isCurrentProduct(p))return {success:false,code:'UNAVAILABLE',message:'Sản phẩm hiện không phải hàng có sẵn để giữ.'};
    const existing=activeReservation(productId);
    if(existing){
      if((orderId&&existing.orderId===orderId)||(checkoutId&&existing.checkoutId===checkoutId))return {success:true,reservation:existing,reused:true};
      return {success:false,code:'RESERVED',message:'Sản phẩm đang được một khách khác giữ tạm.',reservation:{id:existing.id,expiresAt:existing.expiresAt}};
    }
    const mins=clampInt(minutes,5,1440,settings.reservationMinutes||60);
    const now=new Date();
    const row={id:id('RSV',8),productId:String(p.id),sku:skuKey(p.sku||p.id),orderId:clean(orderId,120),checkoutId:clean(checkoutId,120),customerId:clean(customerId,120),purpose:clean(purpose,40),status:'active',createdAt:now.toISOString(),updatedAt:now.toISOString(),expiresAt:new Date(now.getTime()+mins*60000).toISOString()};
    reservations.unshift(row);writeJson(RESERVATION_FILE,reservations.slice(0,50000));
    return {success:true,reservation:row};
  }
  function releaseReservation({orderId='',checkoutId='',productId='',reason='released'}) {
    let changed=0; const now=nowIso();
    reservations.forEach(r=>{if(!r||r.status!=='active')return; const match=(orderId&&r.orderId===orderId)||(checkoutId&&r.checkoutId===checkoutId)||(productId&&String(r.productId)===String(productId)); if(match){r.status=reason==='expired'?'expired':'released';r.releaseReason=clean(reason,80);r.updatedAt=now;changed++;}});
    if(changed)writeJson(RESERVATION_FILE,reservations);
    return changed;
  }
  function extendReservation(reservationId, minutes=60) {
    cleanupReservations(); const r=reservations.find(x=>x&&x.id===reservationId); if(!r)return null;
    r.status='active';r.expiresAt=new Date(Date.now()+clampInt(minutes,5,1440,60)*60000).toISOString();r.updatedAt=nowIso();writeJson(RESERVATION_FILE,reservations);return r;
  }
  function confirmCheckoutReservations(checkoutId) {
    let changed=0; const now=Date.now();
    reservations.forEach(r=>{ if(!r||r.status!=='active'||r.checkoutId!==String(checkoutId))return; r.purpose='confirmed-order'; r.expiresAt=new Date(now+24*60*60000).toISOString(); r.updatedAt=nowIso(); changed++; });
    if(changed)writeJson(RESERVATION_FILE,reservations);
    return changed;
  }

  function loyaltyForCustomer(customer, invoiceId='') {
    if(!customer)return {points:0,vip:false,pointsToVip:25,invoicePoints:null,invoiceSynced:false};
    const pub=ctx.loyaltyPublicSummary(customer,null);
    const row=invoiceId?loyaltyRows().find(x=>String(x.invoiceId||'')===String(invoiceId)):null;
    return {points:Math.max(0,Math.floor(n(pub&&pub.points))),vip:Boolean(pub&&pub.vip),pointsToVip:Math.max(0,Math.floor(n(pub&&pub.pointsToVip,25))),invoicePoints:row?Math.trunc(n(row.pointsAdded)):null,invoiceSynced:Boolean(row)};
  }
  function findWarrantyByToken(token) { return warranties.find(w=>w&&(w.publicToken===String(token)||w.tokenHash===tokenHash(token)))||null; }
  function warrantyForInvoice(invoiceId, productSku='') { const inv=String(invoiceId||''),sku=skuKey(productSku); return warranties.find(w=>w&&String(w.invoiceId||'')===inv&&(!sku||skuKey(w.sku)===sku))||null; }
  function warrantyForOrder(orderId) { return warranties.find(w=>w&&String(w.orderId||'')===String(orderId))||null; }
  function createWarranty({order=null,invoiceId='',product=null,customer=null,soldAt='',warrantyMonths,source='web',status='Đang hiệu lực',soldWeightChi=null,soldTotalWeightChi=null,soldWorkmanship=null,soldGoldCode=''}) {
    if(!product && order) product=productById(order.productId)||productBySku(order.productSku);
    if(!product)return {success:false,message:'Không tìm thấy sản phẩm để tạo bảo hành.'};
    if(!customer && order) customer=customerById(order.customerId)||customerByPhone(order.phone);
    const inv=clean(invoiceId || (order&&order.invoiceId) || (order&&order.id),120);
    const productSku=skuKey(product.sku||product.id);
    if(inv){const existing=warrantyForInvoice(inv,productSku);if(existing)return {success:true,warranty:existing,reused:true,token:existing.publicToken||''};}
    const token=crypto.randomBytes(24).toString('base64url');
    const startRaw=soldAt||(order&&order.completedAt)||(order&&order.updatedAt)||(order&&order.createdAt)||nowIso(); const start=new Date(startRaw); const startDate=Number.isFinite(start.getTime())?start:new Date();
    const months=clampInt(warrantyMonths,0,120,settings.warrantyMonths||12); const expiry=new Date(startDate); expiry.setMonth(expiry.getMonth()+months);
    const soldGold=clean(soldGoldCode||product.goldCode,20);
    const weightAtSale=soldWeightChi===null||soldWeightChi===undefined?Math.max(0,n(product.weightChi)):Math.max(0,n(soldWeightChi));
    const totalWeightAtSale=soldTotalWeightChi===null||soldTotalWeightChi===undefined?Math.max(0,n(product.totalWeightChi)):Math.max(0,n(soldTotalWeightChi));
    const workmanshipAtSale=soldWorkmanship===null||soldWorkmanship===undefined?Math.max(0,n(product.workmanship)):Math.max(0,n(soldWorkmanship));
    const row={id:id('BH',8),publicToken:token,tokenHash:tokenHash(token),orderId:clean(order&&order.id,120),invoiceId:inv,invoiceLabel:(clean(invoiceId,120)||(order&&order.invoiceId))?'Mã hóa đơn':'Mã giao dịch',productId:String(product.id||''),sku:productSku,productName:clean(product.name,160),goldCode:soldGold,goldContentLabel:clean(ctx.goldContentLabel(soldGold),160),weightChi:weightAtSale,totalWeightChi:totalWeightAtSale,workmanship:workmanshipAtSale,customerId:clean(customer&&customer.id,120),customerName:clean(customer&&customer.name||order&&order.name,100),soldAt:startDate.toISOString(),warrantyMonths:months,expiresAt:months?expiry.toISOString():'',status:clean(status,80),policy:'Bảo hành kỹ thuật theo tình trạng thực tế; nội dung sửa chữa/chi phí ngoài phạm vi miễn phí được tiệm kiểm tra và xác nhận trước khi thực hiện.',source:clean(source,40),createdAt:nowIso(),updatedAt:nowIso()};
    warranties.unshift(row);writeJson(WARRANTY_FILE,warranties.slice(0,50000));
    return {success:true,warranty:row,token};
  }
  function publicWarranty(row) {
    if(!row)return null; const c=customerById(row.customerId); const loyalty=loyaltyForCustomer(c,row.invoiceId);const expired=Boolean(row.expiresAt&&Date.parse(row.expiresAt)<Date.now());const status=expired&&String(row.status||'Đang hiệu lực')==='Đang hiệu lực'?'Hết hạn':row.status;
    return {id:row.id,invoiceId:row.invoiceId,invoiceLabel:row.invoiceLabel||'Mã hóa đơn',orderId:row.orderId,sku:row.sku,productName:row.productName,goldCode:row.goldCode,goldContentLabel:row.goldContentLabel,weightChi:row.weightChi,totalWeightChi:row.totalWeightChi,workmanship:row.workmanship,soldAt:row.soldAt,warrantyMonths:row.warrantyMonths,expiresAt:row.expiresAt,status,policy:row.policy,customerName:maskName(row.customerName),loyalty};
  }
  function autoWarrantyForOrder(order, options={}) {
    if(!order)return null; const p=productById(order.productId)||productBySku(order.productSku); if(!p)return null;
    const c=customerById(order.customerId)||customerByPhone(order.phone);
    return createWarranty({order,invoiceId:options.invoiceId||order.invoiceId||order.id,product:p,customer:c,soldAt:options.soldAt||order.completedAt||nowIso(),warrantyMonths:options.warrantyMonths,source:options.source||'web-order'});
  }
  function warrantyFromPosSale(input, customer) {
    const sku=skuKey(input&& (input.productSku||input.sku||input.maSP||input.maSp)); if(!sku)return null; const p=productBySku(sku); if(!p)return null;
    const directWeight=[input&&input.soldWeightChi,input&&input.weightChi,input&&input.netWeightChi,input&&input.trongLuongChi].map(Number).find(Number.isFinite);
    const lyWeight=[input&&input.netLy,input&&input.weightLy,input&&input.trongLuongLy].map(Number).find(Number.isFinite);
    const soldWeightChi=Number.isFinite(directWeight)?directWeight:(Number.isFinite(lyWeight)?lyWeight/100:null);
    const directTotal=[input&&input.soldTotalWeightChi,input&&input.totalWeightChi,input&&input.grossWeightChi].map(Number).find(Number.isFinite);
    const work=[input&&input.soldWorkmanship,input&&input.workmanship,input&&input.sellWage].map(Number).find(Number.isFinite);
    return createWarranty({invoiceId:clean(input.invoiceId,120),product:p,customer:customer||customerByPhone(input.phone),soldAt:input.soldAt,warrantyMonths:input.warrantyMonths,source:'pos-sync',soldWeightChi,soldTotalWeightChi:Number.isFinite(directTotal)?directTotal:null,soldWorkmanship:Number.isFinite(work)?work:null,soldGoldCode:input&&input.goldCode});
  }
  function warrantiesFromPosSale(input, customer) {
    const source=input||{}; const rows=Array.isArray(source.items)?source.items.slice(0,50):[]; const results=[];
    for(const item of rows){ const w=warrantyFromPosSale({...source,...item,invoiceId:source.invoiceId,soldAt:item.soldAt||source.soldAt,phone:source.phone},customer); if(w&&w.success&&!results.some(x=>x.warranty.id===w.warranty.id))results.push(w); }
    if(!results.length){ const single=warrantyFromPosSale(source,customer); if(single&&single.success)results.push(single); }
    return {success:results.length>0,warranties:results.map(x=>x.warranty),created:results.filter(x=>!x.reused).length,reused:results.filter(x=>x.reused).length};
  }

  function setWarrantyStatusForInvoice(invoiceId, status, options={}) {
    const inv=clean(invoiceId,120); if(!inv)return {success:true,skipped:true,updated:0};
    const skuSet=new Set((Array.isArray(options.skus)?options.skus:[]).map(skuKey).filter(Boolean));
    const target=clean(status,80)||'Đang hiệu lực'; const now=nowIso(); let updated=0;
    for(const row of warranties){
      if(!row||String(row.invoiceId||'')!==inv)continue;
      if(skuSet.size&&!skuSet.has(skuKey(row.sku)))continue;
      let next=target;
      if(options.restore===true&&target==='Đang hiệu lực'&&row.expiresAt&&Date.parse(row.expiresAt)<Date.now())next='Hết hạn';
      if(String(row.status||'')===next&&clean(row.transactionSyncReason,240)===clean(options.reason,240))continue;
      row.status=next;row.transactionSyncReason=clean(options.reason,240);row.updatedAt=now;
      if(next==='Đã hủy')row.voidedAt=now;else if(next==='Đã thu hồi do trả hàng')row.returnedAt=now;else if(options.restore===true){row.voidedAt='';row.returnedAt='';}
      updated++;
    }
    if(updated)writeJson(WARRANTY_FILE,warranties.slice(0,50000));
    return {success:true,updated,status:target,invoiceId:inv};
  }
  function listPosWarrantyOrphans(activeInvoiceIds=[]) {
    const ids=new Set((Array.isArray(activeInvoiceIds)?activeInvoiceIds:[]).map(x=>clean(x,120)).filter(Boolean));
    return warranties.filter(row=>row&&String(row.source||'')==='pos-sync'&&String(row.status||'')!=='Đã hủy'&&row.invoiceId&&!ids.has(String(row.invoiceId))).map(row=>({id:row.id,invoiceId:row.invoiceId,sku:row.sku,status:row.status}));
  }
  function voidMissingPosWarranties(activeInvoiceIds=[], reason='Đối soát POS') {
    const ids=new Set((Array.isArray(activeInvoiceIds)?activeInvoiceIds:[]).map(x=>clean(x,120)).filter(Boolean)); const now=nowIso(); let updated=0;
    for(const row of warranties){if(!row||String(row.source||'')!=='pos-sync'||!row.invoiceId||ids.has(String(row.invoiceId))||String(row.status||'')==='Đã hủy')continue;row.status='Đã hủy';row.transactionSyncReason=clean(reason,240);row.voidedAt=now;row.updatedAt=now;updated++;}
    if(updated)writeJson(WARRANTY_FILE,warranties.slice(0,50000));return {success:true,updated};
  }
  function countActiveWarrantyByProductStatus(statusForSku) {
    if(typeof statusForSku!=='function')return 0;let count=0;for(const row of warranties){if(!row||String(row.status||'')!=='Đang hiệu lực')continue;if(String(statusForSku(row.sku)||'')==='sold')count++;}return count;
  }

  function trustForProduct(product, currentAvailability = null) {
    const availability=currentAvailability||availabilityForProduct(product.id); const seller=ctx.publicSellerInfo();
    return {sku:skuKey(product.sku||product.id),goldContentLabel:clean(ctx.goldContentLabel(product.goldCode),160),weightChi:Math.max(0,n(product.weightChi)),totalWeightChi:Math.max(0,n(product.totalWeightChi)),workmanship:Math.max(0,n(product.workmanship)),referencePrice:Math.max(0,n(ctx.priceForProduct(product))),priceSource:'Bảng giá Kim Bảo Lâm đồng bộ từ hệ thống POS/Cloud; giá chốt xác nhận tại thời điểm giao dịch.',availability,exchangePolicy:'Thu đổi theo chính sách và chứng từ đi kèm; giá/điều kiện được xác nhận tại thời điểm giao dịch.',warrantyPolicy:'Bảo hành kỹ thuật theo tình trạng thực tế tại tiệm.',invoicePolicy:'Giao dịch hoàn tất được lưu mã đơn/hóa đơn và có thể phát hành phiếu bảo hành điện tử.',origin:clean(product.origin||'Việt Nam',160),producerName:clean(product.producerName,200),supplierName:clean(product.supplierName,200),applicableStandard:clean(product.applicableStandard,240),seller};
  }

  function checkoutByToken(token){return checkouts.find(c=>c&&c.tokenHash===tokenHash(token))||null;}
  function checkoutById(value){return checkouts.find(c=>c&&c.id===String(value))||null;}
  function publicCheckout(row, req=null){
    if(!row)return null; const ship=shipments.find(s=>s&&s.checkoutId===row.id)||null;
    const payment=paymentInfo(row, req); return {id:row.id,status:row.status,createdAt:row.createdAt,expiresAt:row.expiresAt,customerName:maskName(row.customerName),items:row.items,totalProducts:row.totalProducts,shippingFee:row.shippingFee,totalAmount:row.totalAmount,deliveryPreference:row.deliveryPreference,address:row.address,payment,shipment:ship?{carrier:ship.carrier,slug:ship.slug,trackingNumber:ship.trackingNumber,status:ship.status,expectedDelivery:ship.expectedDelivery,insuranceStatus:ship.insuranceStatus,insuranceAmount:ship.insuranceAmount,proofUrl:ship.proofUrl,updatedAt:ship.updatedAt}:null,warrantyId:row.warrantyId||'',warrantyIds:Array.isArray(row.warrantyIds)?row.warrantyIds:[]};
  }
  function paymentInfo(row, req){
    const ready=Boolean(clean(settings.bankId,30)&&clean(settings.accountNo,40));
    if(!ready)return {ready:false,message:'VietQR chưa được cấu hình trong Admin. Tiệm sẽ xác nhận hình thức chuyển khoản.'};
    const amount=Math.max(0,Math.round(n(row.totalAmount))); const info=clean(`KBL ${row.id}`,80); const bankId=encodeURIComponent(clean(settings.bankId,30)); const accountNo=encodeURIComponent(clean(settings.accountNo,40)); const tpl=encodeURIComponent(clean(settings.vietQrTemplate||'compact2',30));
    const url=`https://img.vietqr.io/image/${bankId}-${accountNo}-${tpl}.png?amount=${amount}&addInfo=${encodeURIComponent(info)}&accountName=${encodeURIComponent(clean(settings.accountName,100))}`;
    return {ready:true,bankId:clean(settings.bankId,30),accountNo:clean(settings.accountNo,40),accountName:clean(settings.accountName,100),amount,transferContent:info,qrImage:url};
  }
  async function createCheckout(input, req, res) {
    const name=clean(input.name,100), phone=phoneKey(input.phone); if(name.length<2||!/^0[0-9]{8,11}$/.test(phone))return {status:400,body:{success:false,message:'Vui lòng nhập họ tên và số điện thoại hợp lệ.'}};
    const ids=[...new Set((Array.isArray(input.productIds)?input.productIds:[input.productId]).filter(Boolean).map(String))].slice(0,10); if(!ids.length)return {status:400,body:{success:false,message:'Giỏ hàng chưa có sản phẩm.'}};
    const rows=[]; for(const pid of ids){const p=productById(pid);if(!p||String(p.status||'available')!=='available'||!isCurrentProduct(p))return {status:409,body:{success:false,message:'Có sản phẩm không phải hàng có sẵn hoặc vừa hết hàng. Mẫu tham khảo cần liên hệ tiệm trước khi thanh toán.'}};const av=availabilityForProduct(p.id);if(av.reserved)return {status:409,body:{success:false,message:`${clean(p.name,100)} đang được khách khác giữ tạm. Vui lòng chọn mẫu khác hoặc thử lại sau.`}};rows.push(p);}
    const now=new Date(); const checkoutId='CK-'+now.toISOString().slice(0,10).replace(/-/g,'')+'-'+crypto.randomBytes(3).toString('hex').toUpperCase();
    const items=rows.map(p=>({productId:String(p.id),sku:skuKey(p.sku||p.id),name:clean(p.name,160),price:Math.max(0,Math.round(n(ctx.priceForProduct(p)))),goldCode:clean(p.goldCode,20),weightChi:Math.max(0,n(p.weightChi)),totalWeightChi:Math.max(0,n(p.totalWeightChi)),workmanship:Math.max(0,n(p.workmanship)),image:clean(p.image,1500)})); const totalProducts=items.reduce((sum,x)=>sum+x.price,0);
    const deliveryPreference=clean(input.deliveryPreference||'Tới tiệm giao dịch',80); let shippingFee=0,shippingMeta=null;
    const deliveryKey=ctx.plainVietnamese(deliveryPreference);
    const onlineDelivery=!/toi tiem|tai tiem/.test(deliveryKey) && /online|giao hang|ship|nhan hang/.test(deliveryKey);
    if(onlineDelivery){
      try{const first=rows[0]; const quote=await ctx.shippingQuote({productId:first.id,address:clean(input.address,300),latitude:input.latitude,longitude:input.longitude}); if(quote&&quote.ready&&!quote.requiresOwner){shippingFee=Math.max(0,Math.round(n(quote.fee))); if(totalProducts>=Math.max(0,n(ctx.getShop().shippingFreeOrderThreshold)))shippingFee=0;shippingMeta={distanceKm:n(quote.distanceKm),method:clean(quote.method,80),waived:shippingFee===0};}else shippingMeta={ready:false,requiresOwner:Boolean(quote&&quote.requiresOwner)};}catch(_){shippingMeta={ready:false};}
    }
    const totalAmount=totalProducts+shippingFee; const token=crypto.randomBytes(24).toString('base64url'); const expiry=new Date(now.getTime()+clampInt(settings.checkoutReservationMinutes,10,120,25)*60000);
    const reserved=[];
    for(const p of rows){const r=reserveProduct({productId:p.id,checkoutId,minutes:settings.checkoutReservationMinutes,purpose:'checkout'});if(!r.success){releaseReservation({checkoutId,reason:'checkout-rollback'});return {status:409,body:{success:false,message:r.message||'Không giữ được sản phẩm.'}};}reserved.push(r.reservation);}
    try {
      const order={id:'DH-'+now.toISOString().slice(0,10).replace(/-/g,'')+'-'+crypto.randomBytes(3).toString('hex').toUpperCase(),type:'checkout',source:'website-checkout-v5',name,phone,productId:items.length===1?items[0].productId:'',productSku:items.length===1?items[0].sku:items.map(x=>x.sku).join(', '),productName:items.length===1?items[0].name:`Giỏ hàng ${items.length} sản phẩm`,quotedPrice:totalProducts,shippingFee,checkoutTotal:totalAmount,deliveryPreference,address:clean(input.address,300),status:'Chờ thanh toán',createdAt:now.toISOString(),customerStage:'Muốn mua',note:'Checkout VietQR V5'};
      if(typeof ctx.attributionForLead==='function'){try{order.attribution=ctx.attributionForLead(req,{...input,source:'website-checkout-v5'})}catch(_){}}
      const customer=ctx.upsertCustomerProfile({name,phone,address:order.address,deliveryPreference,latitude:input.latitude,longitude:input.longitude,rememberCustomer:Boolean(input.rememberCustomer)},order,res);
      if(customer)order.customerId=customer.id; ctx.addOrder(order);
      reserved.forEach(r=>{r.customerId=clean(customer&&customer.id,120);r.updatedAt=nowIso();}); writeJson(RESERVATION_FILE,reservations);
      const checkout={id:checkoutId,tokenHash:tokenHash(token),orderId:order.id,customerId:customer&&customer.id||'',customerName:name,phoneHash:ctx.shortHash(phone),items,totalProducts,shippingFee,totalAmount,deliveryPreference,address:order.address,shippingMeta,status:'Chờ thanh toán',createdAt:now.toISOString(),updatedAt:now.toISOString(),expiresAt:expiry.toISOString(),paidClaimedAt:'',paidVerifiedAt:'',confirmedAt:'',warrantyId:'',warrantyIds:[]};
      checkouts.unshift(checkout);writeJson(CHECKOUT_FILE,checkouts.slice(0,10000));
      ctx.audit(req,'checkout.create','ok',{checkoutId:checkout.id,itemCount:items.length,totalAmount});
      return {status:201,body:{success:true,checkout:publicCheckout(checkout,req),token,url:`${baseUrl(req)}/thanh-toan/${encodeURIComponent(token)}`}};
    } catch (error) {
      releaseReservation({checkoutId,reason:'checkout-error-rollback'});
      throw error;
    }
  }
  function updateCheckoutStatus(row,status,req){
    const allowed=['Chờ thanh toán','Chờ xác minh','Đã thanh toán','Đã xác nhận','Đã hủy','Hết hạn']; if(!allowed.includes(status))return false; row.status=status;row.updatedAt=nowIso(); if(status==='Đã thanh toán')row.paidVerifiedAt=nowIso(); if(status==='Đã xác nhận'){row.confirmedAt=nowIso(); const order=orders().find(o=>o.id===row.orderId); if(order){order.status='Đã xác nhận';order.updatedAt=nowIso();ctx.saveOrders();} confirmCheckoutReservations(row.id); const c=customerById(row.customerId);row.warrantyIds=Array.isArray(row.warrantyIds)?row.warrantyIds:[];for(const item of row.items||[]){const live=productById(item.productId);const snapshot=live||{id:item.productId,sku:item.sku,name:item.name,goldCode:item.goldCode,weightChi:item.weightChi,totalWeightChi:item.totalWeightChi,workmanship:item.workmanship};const w=createWarranty({order:order||{id:row.orderId,name:row.customerName},invoiceId:order&&order.invoiceId||row.orderId,product:snapshot,customer:c,soldAt:row.confirmedAt,source:'checkout-v5',soldWeightChi:item.weightChi,soldTotalWeightChi:item.totalWeightChi,soldWorkmanship:item.workmanship,soldGoldCode:item.goldCode});if(w&&w.success&&!row.warrantyIds.includes(w.warranty.id))row.warrantyIds.push(w.warranty.id);}row.warrantyId=row.warrantyIds[0]||row.warrantyId||'';}
    if(['Đã hủy','Hết hạn'].includes(status))releaseReservation({checkoutId:row.id,reason:status}); writeJson(CHECKOUT_FILE,checkouts); ctx.audit(req,'checkout.status','ok',{checkoutId:row.id,status});return true;
  }
  function expireCheckouts(){let dirty=false;checkouts.forEach(c=>{if(c&&['Chờ thanh toán'].includes(c.status)&&Date.parse(c.expiresAt||0)<=Date.now()){c.status='Hết hạn';c.updatedAt=nowIso();releaseReservation({checkoutId:c.id,reason:'checkout-expired'});dirty=true;}});if(dirty)writeJson(CHECKOUT_FILE,checkouts);}

  function upsertShipment(checkoutId,input,req){const c=checkoutById(checkoutId);if(!c)return null;let s=shipments.find(x=>x.checkoutId===checkoutId);if(!s){s={id:id('SHIP',7),checkoutId,createdAt:nowIso()};shipments.unshift(s);}s.carrier=clean(input.carrier||s.carrier,80);s.slug=clean(input.slug||s.slug,80).toLowerCase().replace(/[^a-z0-9-]/g,'');s.trackingNumber=clean(input.trackingNumber||s.trackingNumber,160);s.status=clean(input.status||s.status||'Chờ bàn giao',100);s.expectedDelivery=clean(input.expectedDelivery||s.expectedDelivery,80);s.insuranceStatus=clean(input.insuranceStatus||s.insuranceStatus||(settings.insuranceDefault?'Chờ xác nhận bảo hiểm':'Chưa mua bảo hiểm'),100);s.insuranceAmount=Math.max(0,n(input.insuranceAmount===undefined?s.insuranceAmount:input.insuranceAmount));s.proofUrl=/^https:\/\//i.test(clean(input.proofUrl,1200))?clean(input.proofUrl,1200):clean(s.proofUrl,1200);s.updatedAt=nowIso();writeJson(SHIPMENT_FILE,shipments.slice(0,10000));ctx.audit(req,'shipment.update','ok',{checkoutId,carrier:s.carrier,status:s.status});return s;}

  function qrUrl(target){return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(target)}`;}
  function pageShell(title,body,extraHead=''){return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>${extraHead}<style>body{margin:0;background:#f6fbff;color:#12355a;font-family:Arial,sans-serif}.wrap{width:min(920px,calc(100% - 28px));margin:28px auto}.brand{font-weight:900;color:#b37a05;letter-spacing:.08em}.card{margin-top:14px;padding:22px;background:#fff;border:1px solid #dfeaf3;border-radius:18px;box-shadow:0 12px 36px #173b6210}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.box{padding:11px;border:1px solid #e5ebf0;border-radius:10px;background:#fbfdff}.box span{display:block;color:#718195;font-size:11px}.box b{display:block;margin-top:4px}.gold{color:#a86f00}.ok{color:#08734d}.warn{color:#9b5d00}.qr{width:240px;max-width:100%;border:1px solid #e7d28f;border-radius:14px}.btn{display:inline-block;margin-top:10px;padding:12px 16px;border:0;border-radius:10px;background:#12355a;color:#fff;font-weight:800;text-decoration:none;cursor:pointer}.note{font-size:12px;line-height:1.55;color:#61758a}.row{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}.row>div{flex:1;min-width:260px}@media(max-width:640px){.grid{grid-template-columns:1fr}}</style></head><body><main class="wrap"><div class="brand">KIM BẢO LÂM · V5 COMMERCE & TRUST</div>${body}</main></body></html>`;}

  app.get('/api/v5/status', (_req,res)=>res.json({success:true,version:V5_VERSION,features:{warranty:true,loyaltyOnWarranty:true,reservation:true,checkout:true,vietQr:Boolean(settings.bankId&&settings.accountNo),shipment:true,insurance:true,trustLayer:true,seo:true,merchantFeed:true}}));
  app.get('/api/v5/product/:id/trust',(req,res)=>{const p=productById(req.params.id)||productBySku(req.params.id);if(!p)return res.status(404).json({success:false,message:'Không tìm thấy sản phẩm.'});res.json({success:true,trust:trustForProduct(p)});});
  app.get('/api/v5/product/:id/availability',(req,res)=>{const p=productById(req.params.id)||productBySku(req.params.id);if(!p)return res.status(404).json({success:false,message:'Không tìm thấy sản phẩm.'});res.json({success:true,availability:availabilityForProduct(p.id)});});

  const checkoutLimiter = typeof ctx.rateLimit==='function' ? ctx.rateLimit('v5-checkout',12,10*60*1000) : (_req,_res,next)=>next();
  app.post('/api/v5/checkout', checkoutLimiter, async (req,res)=>{try{const result=await createCheckout(req.body||{},req,res);res.status(result.status).json(result.body);}catch(e){console.error('KBL V5 checkout:',e);res.status(500).json({success:false,message:'Chưa tạo được checkout. Vui lòng thử lại hoặc liên hệ tiệm.'});}});
  app.get('/api/v5/checkout/:token',async(req,res)=>{expireCheckouts();const c=checkoutByToken(req.params.token);if(!c)return res.status(404).json({success:false,message:'Không tìm thấy checkout.'});let liveTracking=null;const s=shipments.find(x=>x.checkoutId===c.id);if(s&&s.trackingNumber&&ctx.afterShip){try{liveTracking=await ctx.afterShip({slug:s.slug,trackingNumber:s.trackingNumber});if(liveTracking&&liveTracking.available){s.status=liveTracking.status||s.status;s.expectedDelivery=liveTracking.expectedDelivery||s.expectedDelivery;s.updatedAt=nowIso();writeJson(SHIPMENT_FILE,shipments);}}catch(_){} }res.json({success:true,checkout:publicCheckout(c,req),liveTracking});});
  app.post('/api/v5/checkout/:token/paid',(req,res)=>{expireCheckouts();const c=checkoutByToken(req.params.token);if(!c)return res.status(404).json({success:false,message:'Không tìm thấy checkout.'});if(c.status!=='Chờ thanh toán')return res.status(409).json({success:false,message:`Đơn đang ở trạng thái ${c.status}.`});c.status='Chờ xác minh';c.paidClaimedAt=nowIso();c.updatedAt=nowIso();writeJson(CHECKOUT_FILE,checkouts);const order=orders().find(o=>o.id===c.orderId);if(order){order.status='Chờ xác minh';order.updatedAt=nowIso();ctx.saveOrders();}void ctx.notifyLead(`Khách báo đã chuyển khoản cho ${c.id}`,{handoff:true,products:c.items.map(i=>({name:i.name,sku:i.sku,referencePrice:i.price}))});ctx.audit(req,'checkout.paid-claim','ok',{checkoutId:c.id});res.json({success:true,status:c.status,message:'Đã báo tiệm kiểm tra giao dịch. Trạng thái này chưa đồng nghĩa tiền đã vào tài khoản.'});});
  app.get('/thanh-toan/:token',(req,res)=>{expireCheckouts();const c=checkoutByToken(req.params.token);if(!c)return res.status(404).send(pageShell('Không tìm thấy đơn','<section class="card"><h1>Không tìm thấy đơn</h1><p class="note">Liên kết có thể đã hết hạn hoặc không hợp lệ.</p></section>'));const d=publicCheckout(c,req),p=d.payment;const items=d.items.map(i=>`<div class="box"><span>${esc(i.sku)}</span><b>${esc(i.name)}</b><div class="gold">${money(i.price)}</div></div>`).join('');const ship=d.shipment?`<div class="card"><h2>🚚 Giao vận / bảo hiểm</h2><div class="grid"><div class="box"><span>Hãng</span><b>${esc(d.shipment.carrier||'Chưa gán')}</b></div><div class="box"><span>Mã tracking</span><b>${esc(d.shipment.trackingNumber||'Chưa có')}</b></div><div class="box"><span>Trạng thái</span><b>${esc(d.shipment.status||'Chờ xử lý')}</b></div><div class="box"><span>Dự kiến giao</span><b>${esc(d.shipment.expectedDelivery||'Chưa có')}</b></div><div class="box"><span>Bảo hiểm</span><b>${esc(d.shipment.insuranceStatus||'Chưa xác nhận')}</b></div><div class="box"><span>Giá trị bảo hiểm</span><b>${money(d.shipment.insuranceAmount||0)}</b></div></div>${d.shipment.proofUrl?`<p><a class="btn" href="${esc(d.shipment.proofUrl)}" target="_blank" rel="noopener noreferrer">XEM BẰNG CHỨNG BÀN GIAO</a></p>`:''}</div>`:'';const pay=p.ready?`<div class="row"><div><img class="qr" src="${esc(p.qrImage)}" alt="VietQR thanh toán"><p class="note">Nội dung chuyển khoản: <b>${esc(p.transferContent)}</b></p></div><div><div class="grid"><div class="box"><span>Ngân hàng</span><b>${esc(p.bankId)}</b></div><div class="box"><span>Số tài khoản</span><b>${esc(p.accountNo)}</b></div><div class="box"><span>Chủ tài khoản</span><b>${esc(p.accountName)}</b></div><div class="box"><span>Số tiền</span><b class="gold">${money(p.amount)}</b></div></div><button class="btn" onclick="claimPaid(this)">TÔI ĐÃ CHUYỂN KHOẢN</button><p id="paid-msg" class="note">Tiệm sẽ đối chiếu giao dịch trước khi chuyển sang “Đã thanh toán”.</p></div></div>`:`<p class="warn">${esc(p.message)}</p>`;res.send(pageShell(`Thanh toán ${d.id}`,`<section class="card"><h1>Đơn ${esc(d.id)}</h1><p>Trạng thái: <b class="gold" id="status">${esc(d.status)}</b></p><div class="grid">${items}</div><div class="box" style="margin-top:10px"><span>Tổng sản phẩm / Ship / Tổng thanh toán</span><b>${money(d.totalProducts)} + ${money(d.shippingFee)} = <span class="gold">${money(d.totalAmount)}</span></b></div></section><section class="card"><h2>💳 VietQR / chuyển khoản</h2>${pay}</section>${ship}<script>async function claimPaid(b){b.disabled=true;try{const r=await fetch('/api/v5/checkout/${encodeURIComponent(req.params.token)}/paid',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const d=await r.json();document.getElementById('paid-msg').textContent=d.message||'';if(d.success)document.getElementById('status').textContent=d.status;}finally{b.disabled=false}}</script>`));});

  app.get('/api/warranty/:token',(req,res)=>{const w=findWarrantyByToken(req.params.token);if(!w)return res.status(404).json({success:false,message:'Không tìm thấy phiếu bảo hành.'});res.json({success:true,warranty:publicWarranty(w)});});
  app.get('/bao-hanh/:token',(req,res)=>{const w=findWarrantyByToken(req.params.token);if(!w)return res.status(404).send(pageShell('Phiếu bảo hành','<section class="card"><h1>Không tìm thấy phiếu bảo hành</h1></section>'));const d=publicWarranty(w);const target=`${baseUrl(req)}/bao-hanh/${encodeURIComponent(req.params.token)}`;const vip=d.loyalty.vip?'👑 VIP Kim Bảo Lâm':`Còn ${d.loyalty.pointsToVip} điểm để đạt VIP`;const ip=d.loyalty.invoiceSynced?(d.loyalty.invoicePoints>=0?`+${d.loyalty.invoicePoints}`:String(d.loyalty.invoicePoints))+' điểm':'Chưa đồng bộ điểm POS';res.send(pageShell(`Bảo hành ${d.sku}`,`<section class="card"><h1>Phiếu bảo hành điện tử</h1><div class="row"><div><div class="grid"><div class="box"><span>Mã SP</span><b>${esc(d.sku)}</b></div><div class="box"><span>${esc(d.invoiceLabel)}</span><b>${esc(d.invoiceId)}</b></div><div class="box"><span>Sản phẩm</span><b>${esc(d.productName)}</b></div><div class="box"><span>Khách hàng</span><b>${esc(d.customerName)}</b></div><div class="box"><span>Tuổi / hàm lượng</span><b>${esc(d.goldContentLabel||d.goldCode)}</b></div><div class="box"><span>Trọng lượng lúc bán</span><b>${fmt(d.weightChi)} chỉ</b></div><div class="box"><span>Ngày mua</span><b>${esc(new Date(d.soldAt).toLocaleDateString('vi-VN'))}</b></div><div class="box"><span>Hạn bảo hành</span><b>${d.expiresAt?esc(new Date(d.expiresAt).toLocaleDateString('vi-VN')):'Theo chính sách / kiểm tra thực tế'}</b></div><div class="box"><span>Trạng thái</span><b class="ok">${esc(d.status)}</b></div></div></div><div><img class="qr" src="${esc(qrUrl(target))}" alt="QR phiếu bảo hành"><p class="note">Quét lại QR để xem phiếu hiện tại.</p></div></div></section><section class="card"><h2>🎁 Điểm thành viên</h2><div class="grid"><div class="box"><span>Điểm từ hóa đơn này</span><b>${esc(ip)}</b></div><div class="box"><span>Tổng điểm hiện tại</span><b>${d.loyalty.points} điểm</b></div><div class="box"><span>Trạng thái</span><b>${esc(vip)}</b></div></div><p class="note">Điểm hiển thị là số mới nhất trong CRM/Loyalty. Website không tự cộng điểm; điểm chỉ thay đổi sau dữ liệu POS hợp lệ.</p></section><section class="card"><h2>🛡️ Chính sách</h2><p class="note">${esc(d.policy)}</p></section>`));});

  app.get('/api/admin/v5/overview',(req,res)=>{if(!ctx.requireAdmin(req,res))return;cleanupReservations();expireCheckouts();res.json({success:true,version:V5_VERSION,settings:{...settings,accountNo:settings.accountNo},reservations:reservations.filter(r=>r.status==='active').slice(0,200),checkouts:checkouts.slice(0,300).map(c=>publicCheckout(c,req)),warranties:warranties.slice(0,300).map(w=>{const pub=publicWarranty(w),token=w.publicToken||'';const url=token?`${baseUrl(req)}/bao-hanh/${encodeURIComponent(token)}`:'';return {...pub,url,qrImage:url?qrUrl(url):''};}),shipments:shipments.slice(0,300)});});
  app.post('/api/admin/v5/settings',(req,res)=>{if(!ctx.requireAdmin(req,res))return;const i=req.body||{};settings={...settings,reservationMinutes:clampInt(i.reservationMinutes,5,1440,settings.reservationMinutes),checkoutReservationMinutes:clampInt(i.checkoutReservationMinutes,10,120,settings.checkoutReservationMinutes),warrantyMonths:clampInt(i.warrantyMonths,0,120,settings.warrantyMonths),bankId:clean(i.bankId===undefined?settings.bankId:i.bankId,30),accountNo:clean(i.accountNo===undefined?settings.accountNo:i.accountNo,40).replace(/[^0-9A-Za-z]/g,''),accountName:clean(i.accountName===undefined?settings.accountName:i.accountName,100),vietQrTemplate:clean(i.vietQrTemplate===undefined?settings.vietQrTemplate:i.vietQrTemplate,30)||'compact2',insuranceDefault:Boolean(i.insuranceDefault)};writeJson(SETTINGS_FILE,settings);ctx.audit(req,'v5.settings','ok',{vietQrReady:Boolean(settings.bankId&&settings.accountNo),reservationMinutes:settings.reservationMinutes});res.json({success:true,settings});});
  app.post('/api/admin/v5/reservations/:id/extend',(req,res)=>{if(!ctx.requireAdmin(req,res))return;const r=extendReservation(req.params.id,req.body&&req.body.minutes);if(!r)return res.status(404).json({success:false,message:'Không tìm thấy giữ mẫu.'});res.json({success:true,reservation:r});});
  app.post('/api/admin/v5/reservations/:id/release',(req,res)=>{if(!ctx.requireAdmin(req,res))return;const r=reservations.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({success:false,message:'Không tìm thấy giữ mẫu.'});r.status='released';r.releaseReason='admin';r.updatedAt=nowIso();writeJson(RESERVATION_FILE,reservations);res.json({success:true});});
  app.post('/api/admin/v5/checkouts/:id/status',(req,res)=>{if(!ctx.requireAdmin(req,res))return;const c=checkoutById(req.params.id);if(!c)return res.status(404).json({success:false,message:'Không tìm thấy checkout.'});const status=clean(req.body&&req.body.status,80);if(!updateCheckoutStatus(c,status,req))return res.status(400).json({success:false,message:'Trạng thái không hợp lệ.'});res.json({success:true,checkout:publicCheckout(c,req)});});
  app.post('/api/admin/v5/checkouts/:id/shipment',(req,res)=>{if(!ctx.requireAdmin(req,res))return;const s=upsertShipment(req.params.id,req.body||{},req);if(!s)return res.status(404).json({success:false,message:'Không tìm thấy checkout.'});res.json({success:true,shipment:s});});
  app.post('/api/admin/v5/warranty/create',(req,res)=>{if(!ctx.requireAdmin(req,res))return;const i=req.body||{},order=i.orderId?orders().find(o=>o.id===String(i.orderId)):null,p=productBySku(i.productSku)||(order&&(productById(order.productId)||productBySku(order.productSku))),c=customerById(i.customerId)||customerByPhone(i.customerPhone)||(order&&customerById(order.customerId))||(order&&customerByPhone(order.phone));const w=createWarranty({order,invoiceId:i.invoiceId,product:p,customer:c,soldAt:i.soldAt,warrantyMonths:i.warrantyMonths,source:'admin',soldWeightChi:i.soldWeightChi,soldTotalWeightChi:i.soldTotalWeightChi,soldWorkmanship:i.soldWorkmanship,soldGoldCode:i.soldGoldCode});if(!w.success)return res.status(400).json(w);const token=w.token||w.warranty.publicToken||'',target=token?`${baseUrl(req)}/bao-hanh/${encodeURIComponent(token)}`:'';res.json({success:true,warranty:publicWarranty(w.warranty),token,url:target,qrImage:target?qrUrl(target):'',reused:Boolean(w.reused)});});

  app.get('/robots.txt',(req,res)=>{res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /bao-hanh/\nDisallow: /thanh-toan/\nSitemap: ${baseUrl(req)}/sitemap.xml\n`);});
  app.get('/merchant-feed.xml',(req,res)=>{const base=baseUrl(req);const rows=products().filter(p=>isCurrentProduct(p)&&String(p.status||'available')==='available'&&p.image&&ctx.publicationStatusFor(p)==='published'&&Math.round(n(ctx.priceForProduct(p)))>0).slice(0,5000);const body=rows.map(p=>{const sku=skuKey(p.sku||p.id),trust=trustForProduct(p),price=Math.max(0,Math.round(n(ctx.priceForProduct(p)))),availability=trust.availability.reserved?'out_of_stock':'in_stock',link=`${base}/san-pham/${encodeURIComponent(sku)}`,image=/^https?:\/\//i.test(String(p.image||''))?String(p.image):base+(String(p.image||'').startsWith('/')?'':'/')+String(p.image||'');return `<item><g:id>${xml(sku)}</g:id><title>${xml(clean(p.name,160))}</title><description>${xml(clean(p.description||p.detail||`Trang sức ${ctx.goldContentLabel(p.goldCode)}`,500))}</description><link>${xml(link)}</link><g:image_link>${xml(image)}</g:image_link><g:availability>${availability}</g:availability><g:condition>new</g:condition><g:price>${price} VND</g:price><g:brand>Kim Bảo Lâm</g:brand><g:product_type>${xml(clean(p.displayCategory||p.category||'Trang sức',80))}</g:product_type><g:custom_label_0>${xml(clean(p.goldCode,20))}</g:custom_label_0></item>`;}).join('');res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel><title>Kim Bảo Lâm · Sản phẩm</title><link>${xml(base)}</link><description>Feed sản phẩm đang hiển thị của Kim Bảo Lâm</description>${body}</channel></rss>`);});
  app.get('/sitemap.xml',(req,res)=>{const base=baseUrl(req),pRows=products().filter(p=>String(p.status||'available')==='available'&&p.image&&ctx.publicationStatusFor(p)==='published').slice(0,5000);const cats=[...new Set(pRows.map(p=>clean(p.displayCategory||p.category,80)).filter(Boolean))];const golds=[...new Set(pRows.map(p=>clean(p.goldCode,20)).filter(Boolean))];const urls=[base+'/',...pRows.map(p=>`${base}/san-pham/${encodeURIComponent(skuKey(p.sku||p.id))}`),...cats.map(c=>`${base}/danh-muc/${encodeURIComponent(slugify(c))}`),...golds.map(g=>`${base}/tuoi-vang/${encodeURIComponent(g)}`)];res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(u=>`<url><loc>${xml(u)}</loc></url>`).join('')+'</urlset>');});
  app.get('/san-pham/:sku',(req,res)=>{const p=productBySku(req.params.sku);if(!p||String(p.status||'available')!=='available'||ctx.publicationStatusFor(p)!=='published')return res.status(404).send(seoPage('Không tìm thấy sản phẩm','Sản phẩm không còn hiển thị.',[],req));res.send(productSeoPage(p,req));});
  app.get('/danh-muc/:slug',(req,res)=>{const items=products().filter(p=>slugify(p.displayCategory||p.category)===req.params.slug&&String(p.status||'available')==='available'&&ctx.publicationStatusFor(p)==='published');res.send(seoPage('Danh mục '+(items[0]&&clean(items[0].displayCategory||items[0].category,80)||'Trang sức'),`Các sản phẩm đang hiển thị tại Kim Bảo Lâm.`,items,req));});
  app.get('/tuoi-vang/:gold',(req,res)=>{const g=clean(req.params.gold,20);const items=products().filter(p=>clean(p.goldCode,20)===g&&String(p.status||'available')==='available'&&ctx.publicationStatusFor(p)==='published');res.send(seoPage(`Trang sức vàng ${g}`,`Sản phẩm vàng ${g} đang hiển thị tại Kim Bảo Lâm.`,items,req));});

  function slugify(v){return clean(v,100).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}
  function xml(v){return esc(v).replace(/'/g,'&apos;');}
  function seoHead(title,description,canonical,jsonLd='',image=''){return `<meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}">${image?`<meta property="og:image" content="${esc(image)}">`:''}${jsonLd?`<script type="application/ld+json">${jsonLd.replace(/<\/script/gi,'<\\/script')}</script>`:''}`;}
  function seoPage(title,desc,items,req){const base=baseUrl(req),canonical=base+req.path;const cards=items.slice(0,60).map(p=>`<a class="p" href="/san-pham/${encodeURIComponent(skuKey(p.sku||p.id))}"><img src="${esc(p.image)}" alt="${esc(p.name)}"><b>${esc(p.name)}</b><span>${esc(skuKey(p.sku||p.id))} · ${esc(ctx.goldContentLabel(p.goldCode))}</span><strong>${money(ctx.priceForProduct(p))}</strong></a>`).join('')||'<p>Chưa có sản phẩm phù hợp.</p>';return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${seoHead(title,desc,canonical)}<title>${esc(title)} | Kim Bảo Lâm</title><style>body{font-family:Arial;margin:0;color:#12355a;background:#f8fcff}.w{width:min(1180px,calc(100% - 30px));margin:30px auto}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.p{display:grid;gap:7px;padding:12px;background:#fff;border:1px solid #e4ebf1;border-radius:14px;text-decoration:none;color:inherit}.p img{width:100%;aspect-ratio:1;object-fit:contain}.p span{font-size:12px;color:#708196}.p strong{color:#a86f00}@media(max-width:800px){.g{grid-template-columns:repeat(2,1fr)}}</style></head><body><main class="w"><p><a href="/">← Kim Bảo Lâm</a></p><h1>${esc(title)}</h1><p>${esc(desc)}</p><section class="g">${cards}</section></main></body></html>`;}
  function productSeoPage(p,req){const base=baseUrl(req),canonical=`${base}/san-pham/${encodeURIComponent(skuKey(p.sku||p.id))}`,trust=trustForProduct(p),price=Math.max(0,Math.round(n(ctx.priceForProduct(p)))),availability=!isCurrentProduct(p)?'https://schema.org/PreOrder':trust.availability.reserved?'https://schema.org/LimitedAvailability':'https://schema.org/InStock',image=/^https?:\/\//i.test(String(p.image||''))?String(p.image):base+(String(p.image||'').startsWith('/')?'':'/')+String(p.image||'');const schema=JSON.stringify({'@context':'https://schema.org','@type':'Product',name:clean(p.name,160),sku:skuKey(p.sku||p.id),image:image?[image]:[],description:clean(p.description||p.detail||`Trang sức ${ctx.goldContentLabel(p.goldCode)}`,500),material:ctx.goldContentLabel(p.goldCode),brand:{'@type':'Brand',name:'Kim Bảo Lâm'},offers:{'@type':'Offer',url:canonical,priceCurrency:'VND',price:String(price),availability,itemCondition:'https://schema.org/NewCondition',seller:{'@type':'Organization',name:clean(ctx.getShop().name||'Kim Bảo Lâm',160)}}});const desc=`${clean(p.name,160)} · Mã SP ${skuKey(p.sku||p.id)} · ${ctx.goldContentLabel(p.goldCode)} · ${fmt(p.weightChi)} chỉ. Giá tham khảo ${money(price)}.`;return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${seoHead(clean(p.name,160),desc,canonical,schema,image)}<title>${esc(p.name)} | Kim Bảo Lâm</title><style>body{font-family:Arial;margin:0;background:#f8fcff;color:#12355a}.w{width:min(1000px,calc(100% - 30px));margin:28px auto}.card{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:22px;background:#fff;border:1px solid #e2eaf1;border-radius:18px}.card img{width:100%;max-height:560px;object-fit:contain}.d{display:grid;grid-template-columns:1fr 1fr;gap:8px}.d div{padding:10px;border:1px solid #e8edf2;border-radius:9px}.d span{display:block;font-size:11px;color:#74859a}.gold{color:#a86f00}@media(max-width:720px){.card{grid-template-columns:1fr}.d{grid-template-columns:1fr}}</style></head><body><main class="w"><p><a href="/">← Trang chủ</a></p><article class="card"><img src="${esc(image)}" alt="${esc(p.name)}"><div><h1>${esc(p.name)}</h1><p class="gold"><b>${money(price)}</b> · giá tham khảo hiện tại</p><div class="d"><div><span>Mã SP</span><b>${esc(skuKey(p.sku||p.id))}</b></div><div><span>Hàm lượng</span><b>${esc(ctx.goldContentLabel(p.goldCode))}</b></div><div><span>Trọng lượng</span><b>${fmt(p.weightChi)} chỉ</b></div><div><span>Tiền công tham chiếu</span><b>${money(p.workmanship)}</b></div><div><span>Tình trạng</span><b>${esc(trust.availability.label)}</b></div><div><span>Xuất xứ</span><b>${esc(p.origin||'Việt Nam')}</b></div></div><p>${esc(trust.priceSource)}</p><p>${esc(trust.warrantyPolicy)}</p><p>${esc(trust.exchangePolicy)}</p><p><a href="/?product=${encodeURIComponent(String(p.id))}">Mở trải nghiệm đầy đủ / Try-on / Giữ mẫu →</a></p></div></article></main></body></html>`;}

  const timer=setInterval(()=>{cleanupReservations();expireCheckouts();},60000); if(timer.unref)timer.unref();
  return {version:V5_VERSION,availabilityForProduct,availabilityForProducts,trustForProduct,reserveProduct,releaseReservation,autoWarrantyForOrder,warrantyFromPosSale,warrantiesFromPosSale,setWarrantyStatusForInvoice,listPosWarrantyOrphans,voidMissingPosWarranties,countActiveWarrantyByProductStatus,createWarranty,publicWarranty,checkoutById,overview:()=>({warranties:warranties.length,reservations:reservations.filter(r=>r.status==='active').length,checkouts:checkouts.length,shipments:shipments.length,vietQrReady:Boolean(settings.bankId&&settings.accountNo)})};
}

module.exports = { install, V5_VERSION, _test:{ tokenHash:(v)=>crypto.createHash('sha256').update(String(v||'')).digest('hex') } };
