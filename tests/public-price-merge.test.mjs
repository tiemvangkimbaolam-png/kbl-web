import test from 'node:test';
import assert from 'node:assert/strict';
import { publicPriceTime, mergePublicPrices, markFailedPriceRefresh } from '../lib/kbl/public-price-merge.mjs';
const value = (at, label, extra = {}) => ({
  prices: [{ code: '9999', buy: 1000000, sell: 1100000, capturedAt: at, stale: false }],
  priceSnapshot: label, priceSource: 'pos', sourceAt: at, stale: false, ...extra
});
test('catalog with newer POS capture is never overwritten by an older quote', () => {
  const catalog = { products: [{ id: 'sku-1' }], ...value(2000000000000, 'new') };
  const staleQuote = value(1999999000000, 'old');
  assert.deepEqual(mergePublicPrices(catalog, staleQuote), catalog);
});
test('new quote replaces price snapshot but keeps catalog, product and news', () => {
  const catalog = { products: [{ id: 'sku-1' }], articles: [{ id: 'news-1' }], ...value(2000000000000, 'old') };
  const quote = value(2000000001000, 'new');
  const merged = mergePublicPrices(catalog, quote);
  assert.equal(merged.priceSnapshot, 'new');
  assert.deepEqual(merged.products, catalog.products);
  assert.deepEqual(merged.articles, catalog.articles);
  assert.equal(publicPriceTime(merged), 2000000001000);
});
test('equal or undated quote cannot displace known catalog snapshot', () => {
  const catalog = value(2000000000000, 'catalog');
  assert.equal(mergePublicPrices(catalog, value(2000000000000, 'quote')), catalog);
  assert.equal(mergePublicPrices(catalog, { prices: [], priceSnapshot: 'unknown' }), catalog);
});
test('network outage marks aged prices stale while preserving source time and values', () => {
  const original = value(2000000000000, 'original');
  assert.equal(markFailedPriceRefresh(original, 2000000100000), original);
  const aged = markFailedPriceRefresh(original, 2000000400000);
  assert.equal(aged.stale, true);
  assert.equal(aged.prices[0].stale, true);
  assert.equal(aged.prices[0].capturedAt, original.prices[0].capturedAt);
  assert.equal(aged.prices[0].buy, original.prices[0].buy);
});
test('snapshot freshness derives from the most recent captured price row', () => {
  assert.equal(publicPriceTime({ prices: [{ capturedAt: 2000000000000 }, { capturedAt: 2000000006000 }] }), 2000000006000);
});
