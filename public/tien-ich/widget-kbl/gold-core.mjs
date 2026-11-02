// Public display data only. No POS calculations, authentication or write requests.
export const KBL_WIDGET_CODES = ['9999', '980', '750', '610', '585', '416'];
export const KBL_WIDGET_FEATURED = ['9999', '980', '610'];
export function widgetRows(payload, now = Date.now()) {
  if (!payload || !Array.isArray(payload.prices) || payload.prices.length > 100) throw Error('Chưa đọc được bảng giá cửa hàng.');
  const selected = new Map();
  for (const row of payload.prices) {
    const identity = String(row.code || row.purity || row.label || row.id || '').replace(/999\.9/g, '9999');
    const code = KBL_WIDGET_CODES.find(c => new RegExp('(?:^|[^0-9])' + c + '(?:[^0-9]|$)').test(identity));
    if (!code) continue;
    const unit = row.unit || 'đồng/lượng';
    if (unit !== 'đồng/chỉ' && unit !== 'đồng/lượng') throw Error('Đơn vị bảng giá chưa được hỗ trợ.');
    const divide = unit === 'đồng/lượng' ? 10 : 1;
    if (typeof row.buy !== 'number' || typeof row.sell !== 'number' || !Number.isFinite(row.buy) || !Number.isFinite(row.sell)) throw Error('Số giá chưa hợp lệ.');
    const buy = row.buy / divide, sell = row.sell / divide;
    const capturedAt = row.capturedAt;
    if (!Number.isSafeInteger(buy) || !Number.isSafeInteger(sell) || buy <= 0 || sell < buy || sell >= 1e9) throw Error('Số giá chưa hợp lệ.');
    if (typeof capturedAt !== 'number' || !Number.isFinite(capturedAt) || capturedAt < 1e12 || capturedAt > now + 90000) throw Error('Chưa xác định được thời điểm bảng giá.');
    const next = { code, label: 'Vàng ' + (code === '9999' ? '999.9' : code), buy, sell, unit: 'đồng/chỉ', capturedAt, stale: row.stale === true };
    if (!selected.has(code) || selected.get(code).capturedAt < capturedAt) selected.set(code, next);
  }
  if (!selected.has('9999')) throw Error('Chưa có giá vàng 999.9 được công bố.');
  return KBL_WIDGET_CODES.flatMap(code => selected.has(code) ? [selected.get(code)] : []);
}
export function widgetSnapshot(payload, now = Date.now()) {
  return { version: 1, fetchedAt: now, rows: widgetRows(payload, now) };
}
export function widgetState(snapshot, now = Date.now(), offline = false) {
  if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.rows) || !Number.isFinite(snapshot.fetchedAt) || snapshot.fetchedAt > now + 90000) return { rows: [], stale: true, expired: true, sourceAt: null };
  let rows;
  try { rows = widgetRows({ prices: snapshot.rows }, now); } catch { return { rows: [], stale: true, expired: true, sourceAt: null }; }
  const sourceAt = Math.min(...rows.map(row => row.capturedAt));
  const expired = now - sourceAt >= 24 * 3600000 || now - snapshot.fetchedAt >= 24 * 3600000;
  const stale = offline || rows.some(row => row.stale) || now - sourceAt > 30 * 60000 || now - snapshot.fetchedAt > 30 * 60000;
  return { rows: expired ? [] : rows, stale, expired, sourceAt };
}
export function widgetMoney(value) {
  return Number.isSafeInteger(value) && value >= 0 ? String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '—';
}
export function widgetClock(value) {
  if (!Number.isFinite(value)) return 'Chưa có dữ liệu';
  const d = new Date(value + 7 * 3600000), pad = n => String(n).padStart(2, '0');
  return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' ' + pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1);
}
