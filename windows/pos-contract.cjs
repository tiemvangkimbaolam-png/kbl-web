'use strict';
// Shared, deliberately small POS projection. Never serialize the original record.
const GOLD = ['9999', '980', '750', '610', '585', '416'];
function bad(message) { throw Object.assign(Error(message), { status: 422 }); }
function str(v, max = 150, required = false) { const s = String(v ?? '').trim(); if (s.length > max || required && !s || /[\u0000-\u001f]/.test(s)) bad('Trường POS không hợp lệ.'); return s; }
function num(v, max = 1e12) { const n = Number(v ?? 0); if (!Number.isFinite(n) || n < 0 || n > max) bad('Số POS không hợp lệ.'); return n; }
function rows(v, max) { if (!Array.isArray(v) || v.length > max) bad('Bản chụp POS vượt hạn mức hoặc thiếu danh sách.'); return v; }
function unique(v, key) { if (new Set(v.map(key)).size !== v.length) bad('Bản chụp POS trùng mã.'); return v; }
const token = v => { const s = str(v, 128); if (s && !/^[a-z0-9_-]{20,128}$/i.test(s)) bad('Mã QR POS không hợp lệ.'); return s; };
function prices(input) {
  const p = input?.prices; if (!p || typeof p !== 'object' || Array.isArray(p)) bad('Thiếu bảng giá POS.');
  const values = {}, result = [];
  for (const code of GOLD) {
    if (p['price_buy_' + code] === undefined && p['price_sell_' + code] === undefined) continue;
    const buy = num(p['price_buy_' + code]), sell = num(p['price_sell_' + code]);
    if (!buy || !sell || sell < buy) bad('Bảng giá POS chưa đầy đủ cho tuổi vàng ' + code + '.');
    values['price_buy_' + code] = buy; values['price_sell_' + code] = sell;
    result.push({ code, label: 'Vàng ' + (code === '9999' ? '999.9' : code), buy, sell, unit: 'đồng/chỉ' });
  }
  if (!result.length) bad('Không có giá POS hợp lệ.'); return { values, rows: result };
}
function inventory(input, priceValues = {}) {
  if (input?.mode !== 'snapshot') bad('Chỉ nhận bản chụp kho đầy đủ.');
  return unique(rows(input.inventory, 500).filter(p => p && p.webSyncReady !== false).map(p => {
    const sku = str(p.code, 60, true), name = str(p.name, 150, true), purity = str(p.type, 20, true);
    const netLy = num(p.weightLy ?? 0, 1e7), rate = num(parseFloat(p.priceSell) || priceValues['price_sell_' + purity] || 0), wage = num(parseFloat(p.sellWage) || parseFloat(p.wage) || 0);
    // Exact POS sale-preview convention, before customer-specific discount:
    // renderer.js inventorySellPrice/inventorySellWage + Math.round(netLy / 100 * rate + wage).
    const price = rate ? Math.round(netLy / 100 * rate + wage) : null;
    const category = /bông|hoa tai/i.test(name) ? 'bong-tai' : /nhẫn/i.test(name) ? 'nhan' : /dây|chuyền/i.test(name) ? 'day-chuyen' : /lắc|vòng/i.test(name) ? 'lac-vong' : 'khac';
    return { sku, name, category, purity: purity === '9999' ? '999.9' : purity, weight: netLy / 100 * 3.75, price, available: str(p.status, 60) === 'Đang bán', published: true, imageIds: [], description: '', posGoldRate: rate || null, posWorkmanship: wage };
  }), p => p.sku);
}
function pawn(input) {
  if (!input || !['snapshot', 'delta'].includes(input.mode || 'delta')) bad('Kiểu đồng bộ phiếu không hợp lệ.');
  const result = rows(input.records, 500).map(p => {
    if (p.displaySchemaVersion !== 2 || p.displayInterestFeeSeparate !== true) bad('Phiếu chưa có số tiền POS tính sẵn.');
    const r = { id: str(p.id, 100, true), publicToken: token(p.publicToken), displaySchemaVersion: 2, displayInterestFeeSeparate: true };
    for (const k of ['name', 'phone', 'asset', 'status', 'dateStart', 'dateEnd', 'dateStartRaw', 'dateEndRaw', 'originalDateStartRaw', 'accrualStartRaw', 'lastInterestPaidThroughRaw']) r[k] = str(p[k], k === 'asset' ? 500 : 150);
    for (const k of ['money', 'interestRate', 'feeRate', 'tienLai', 'tienPhi', 'paidInterestTotal', 'paidFeeTotal', 'days', 'currentInterest', 'currentFee', 'interestDue', 'feeDue', 'totalDue']) { if (p[k] === undefined) bad('Thiếu số tiền POS: ' + k); r[k] = num(p[k]); }
    return r;
  });
  return { mode: input.mode || 'delta', records: unique(result, r => r.id) };
}
function warranty(input) {
  if (!input || !['sale', 'return'].includes(input.eventType || 'sale')) bad('Loại phiếu bán không hợp lệ.');
  const items = unique(rows(input.items, 100).map(p => ({ productSku: str(p.productSku, 60, true), soldWeightChi: num(p.soldWeightChi, 1e5), soldWorkmanship: num(p.soldWorkmanship), soldGoldCode: str(p.soldGoldCode, 20, true), publicToken: token(p.publicToken) })), p => p.productSku);
  if (!items.length) bad('Phiếu bán không có sản phẩm.');
  return { invoiceId: str(input.invoiceId, 100, true), phone: str(input.phone, 30), customerName: str(input.customerName, 100), soldAt: str(input.soldAt, 60, true), eventType: input.eventType || 'sale', items };
}
function transaction(input) {
  const eventType = str(input?.eventType, 30, true);
  // Only explicit POS events can change stock; unknown semantics must not be acknowledged.
  if (!['sale', 'return', 'delete'].includes(eventType)) bad('Chưa hỗ trợ sự kiện POS này: ' + eventType);
  const skus = unique(rows(input.skus || input.invCodes, 100).map(s => str(s, 60, true)), s => s);
  if (!skus.length) bad('Giao dịch thiếu SKU.');
  return { invoiceId: str(input.invoiceId, 100, true), originalTransactionId: str(input.originalTransactionId, 100), eventType, soldAt: str(input.soldAt, 60), skus };
}
module.exports = { GOLD, prices, inventory, pawn, warranty, transaction, token };
