'use strict';
// Connection-only projection. Never calculates an amount, changes a POS file,
// or infers a loyalty reversal without its original ledger.
const fail = message => { throw Object.assign(Error(message), { status: 409 }); };
function skuList(tx) {
    return [...new Set([tx?.invCode, ...(tx?.invCodes || []), ...(tx?.items || []).map(x => x?.invCode || x?.sku || x?.code)].map(x => String(x || '').trim()).filter(Boolean))].sort();
}
function validate(input) {
    if (input?.eventType !== 'void' || input?.mode !== 'ban' || input?.loyaltyNotApplicable !== true) fail('Hoàn tác cần bản bán hàng khách lẻ đã đối chiếu tại POS. Phiếu có điểm hoặc phiếu trả cần đối soát ledger gốc; chưa xác nhận thành công.');
    const invoiceId = String(input.invoiceId || '').trim(), skus = input.skus;
    if (!invoiceId || invoiceId.length > 100 || !Array.isArray(skus) || !skus.length || skus.length > 100 || new Set(skus).size !== skus.length || skus.some(s => typeof s !== 'string' || !s.trim() || s.length > 60)) fail('Thiếu mã hóa đơn hoặc SKU cần hoàn tác.');
    return { eventType: 'void', mode: 'ban', invoiceId, skus: [...skus].sort(), loyaltyNotApplicable: true };
}
function fromPOS(input, transactions, loyaltyState = {}) {
    const tx = transactions.find(t => String(t?.id || '') === String(input?.invoiceId || ''));
    if (!tx || tx.mode !== 'ban' || String(tx.cusPhone || '').trim() || String(input.phone || '').trim() || input.mode !== 'ban' || input.originalTransactionId || tx.originalTransactionId || loyaltyState.synced?.[tx.id]) fail('Chưa đủ bằng chứng hoàn tác an toàn. Chỉ hỗ trợ hóa đơn bán khách lẻ không tích điểm; giữ nguyên POS để đối soát phiếu có điểm/trả/đổi.');
    const skus = skuList(tx);
    if (JSON.stringify(skus) !== JSON.stringify([...new Set(input.skus || input.invCodes || [])].sort())) fail('SKU hoàn tác không khớp hóa đơn POS đang lưu.');
    return validate({ eventType: input.eventType, mode: 'ban', invoiceId: tx.id, skus, loyaltyNotApplicable: true });
}
module.exports = { validate, fromPOS };
