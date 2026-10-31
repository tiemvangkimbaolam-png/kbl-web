// Public display helpers. Never recalculate a POS sale price or expose purchase costs.
export function optionalNumber(v, max = 1e12) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}
export function publicProductDetails(p) {
    const input = p?.posDetails || {}, result = {};
    for (const key of ['grossWeightChi', 'stoneWeightChi', 'netWeightChi']) {
        const n = optionalNumber(input[key], 100000);
        if (n !== null) result[key] = n;
    }
    const rate = optionalNumber(p?.posGoldRate), wage = optionalNumber(p?.posWorkmanship);
    return { ...(rate !== null ? { posGoldRate: rate } : {}), ...(wage !== null ? { posWorkmanship: wage } : {}),
        ...(Object.keys(result).length ? { posDetails: result } : {}) };
}
export function productFacts(p) {
    const details = publicProductDetails(p), net = details.posDetails?.netWeightChi ?? (p?.source === 'pos' && optionalNumber(p?.weight) !== null ? Number(p.weight) / 3.75 : null);
    return { ...details, netWeightChi: net, grossWeightChi: details.posDetails?.grossWeightChi ?? null,
        stoneWeightChi: details.posDetails?.stoneWeightChi ?? null,
        imageIds: [...new Set(Array.isArray(p?.imageIds) ? p.imageIds.filter(x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x)) : [])].slice(0, 8) };
}
export function productInquiry(p) { return `Tôi muốn hỏi về ${String(p?.name || 'sản phẩm').slice(0,150)} (Mã SP: ${String(p?.sku || '').slice(0,60)}).`; }
export function findPublicProduct(products, key) { return (products || []).find(p => (p.id === key || p.sku === key) && p.published && p.available) || null; }
