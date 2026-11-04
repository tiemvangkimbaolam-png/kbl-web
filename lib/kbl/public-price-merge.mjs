// A price response is a single POS/cloud snapshot: never splice rows from different moments.
const observed = value => Number.isFinite(value) && value > 0 ? value : 0;
export function publicPriceTime(value) {
  const rows = Array.isArray(value?.prices) ? value.prices : [];
  const times = rows.map(row => observed(row?.capturedAt));
  return Math.max(observed(value?.sourceAt), ...times, 0);
}
export function mergePublicPrices(base, quote) {
  if (!base || !quote) return base;
  const nextAt = publicPriceTime(quote);
  if (!nextAt || nextAt <= publicPriceTime(base)) return base;
  // Keep the entire selected price snapshot together, including its source/stale metadata.
  return { ...base, prices: quote.prices, priceSnapshot: quote.priceSnapshot,
    priceSource: quote.priceSource, sourceAt: quote.sourceAt, stale: quote.stale };
}
export function markFailedPriceRefresh(base, now = Date.now()) {
  if (!base || !Array.isArray(base.prices)) return base;
  const last = publicPriceTime(base);
  if (!last || now - last <= 300000 || (base.stale && base.prices.every(p => p.stale))) return base;
  return { ...base, stale: true, prices: base.prices.map(p => ({ ...p, stale: true })) };
}
