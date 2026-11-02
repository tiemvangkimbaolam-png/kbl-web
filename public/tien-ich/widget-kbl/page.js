import { widgetSnapshot, widgetState, widgetMoney, widgetClock, KBL_WIDGET_FEATURED } from './gold-core.mjs';
import { readInstallSource } from './install-flow.mjs';
const $ = id => document.getElementById(id);
const root = $('widget-preview');
const theme = 'copper';
let size = 'medium', snapshot = null, lastError = '', installSource = '';
let sequence = 0, pendingController = null;
const scriptName = () => 'KBL Gia Vang Dong';
const fileBase = () => 'KBL_Gia_Vang_Dong';
const labels = { small: 'nhỏ', medium: 'vừa', large: 'lớn' };
function node(tag, text, className = '') { const el = document.createElement(tag); el.textContent = text; el.className = className; return el; }
function render() {
  root.dataset.theme = theme; root.className = 'gold-widget ' + size;
  const state = widgetState(snapshot, Date.now(), Boolean(lastError));
  const body = $('widget-body'); body.replaceChildren();
  if (!state.rows.length) body.append(node('p', lastError || 'Chưa có bảng giá được công bố.', 'preview-empty'));
  else if (size === 'small') {
    const row = state.rows[0]; body.append(node('p', 'Vàng 999.9', 'small-price-label'));
    for (const [label, value] of [['Mua vào', row.buy], ['Bán ra', row.sell]]) { const line = node('div', '', 'small-price-line'); line.append(node('small', label), node('strong', widgetMoney(value))); body.append(line); }
  } else {
    const head = node('div', '', 'widget-table-head'); ['Loại vàng', 'Mua vào', 'Bán ra'].forEach(label => head.append(node('span', label))); body.append(head);
    const rows = KBL_WIDGET_FEATURED.flatMap(code => state.rows.filter(row => row.code === code));
    for (const row of rows) { const line = node('div', '', 'widget-row'); ['Vàng ' + (row.code === '9999' ? '999.9' : row.code), widgetMoney(row.buy), widgetMoney(row.sell)].forEach(value => line.append(node('span', value))); body.append(line); }
  }
  $('widget-freshness').textContent = state.rows.length ? 'Giá tại tiệm KBL' : 'Chạm widget để mở website';
  $('widget-time').textContent = state.sourceAt ? widgetClock(state.sourceAt) : '—';
  $('selection-summary').textContent = 'Hồng đào vàng đồng' + ' · Cỡ ' + labels[size] + ' đang xem trước';
  $('download-widget').href = './' + fileBase() + '.js'; $('download-widget').download = fileBase() + '.js';
  $('view-code').href = './' + fileBase() + '.js'; $('script-name').textContent = scriptName();
  $('open-widget').href = 'scriptable:///run/' + encodeURIComponent(scriptName());
}
async function prepareInstall() {
  const button = $('copy-widget'); button.disabled = true;
  try {
    const source = await readInstallSource(); installSource = source.code;
    $('install-code').value = installSource;
    button.disabled = false; button.textContent = 'Sao chép mã widget';
    $('download-status').textContent = 'Mã đã sẵn sàng. Sao chép rồi dán vào script mới trong Scriptable.';
  } catch (error) {
    button.textContent = 'Mã chưa sẵn sàng'; $('download-status').textContent = error.message;
  }
}
async function refreshPrices() {
  const current = ++sequence; pendingController?.abort(); pendingController = new AbortController();
  const timer = setTimeout(() => pendingController?.abort(), 15000);
  try {
    const response = await fetch('/api/public/prices', { headers: { Accept: 'application/json' }, cache: 'no-store', signal: pendingController.signal });
    if (!response.ok) throw Error('Chưa lấy được giá. Xem bảng giá tại website của tiệm.');
    const data = await response.text(); if (data.length > 2000000) throw Error('Bảng giá chưa sẵn sàng.');
    const next = widgetSnapshot(JSON.parse(data));
    if (current !== sequence) return; snapshot = next; lastError = '';
  } catch (error) { if (current !== sequence) return; lastError = 'Chưa lấy được giá mới. Bản cài widget vẫn có thể tải bên dưới.'; }
  finally { clearTimeout(timer); if (current === sequence) render(); }
}
document.querySelectorAll('[data-size]').forEach(button => button.addEventListener('click', () => {
  size = button.dataset.size;
  document.querySelectorAll('[data-size]').forEach(el => el.setAttribute('aria-pressed', String(el === button))); render();
}));
$('download-widget').addEventListener('click', () => {
  $('download-status').textContent = 'Tệp .js dành cho iCloud Drive → Scriptable. Nếu chia sẻ tệp báo lỗi UTI, dùng Sao chép mã widget và dán trong ứng dụng.';
});
$('copy-widget').addEventListener('click', () => {
  if (!installSource) return;
  // The source is preloaded, so Safari's clipboard call stays inside the user gesture.
  let request;
  try {
    if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable');
    request = navigator.clipboard.writeText(installSource);
  } catch (_) { showManualCopy(); return; }
  Promise.resolve(request).then(() => {
    $('add-widget').hidden = false;
    $('download-status').textContent = 'Đã sao chép mã. Mở Scriptable → dán vào trang trắng → đặt tên KBL Gia Vang Dong → bấm ▶ để xem thử.';
  }).catch(showManualCopy);
});
function showManualCopy() {
  $('manual-copy').open = true;
  const field = $('install-code'); field.focus(); field.select(); field.setSelectionRange(0, field.value.length);
  $('add-widget').hidden = false;
  $('download-status').textContent = 'Safari chưa cho sao chép tự động. Nhấn giữ vùng mã bên dưới → Chọn tất cả → Sao chép, rồi mở Scriptable để dán.';
}
render(); void refreshPrices(); void prepareInstall();
const poller = setInterval(() => { if (!document.hidden) void refreshPrices(); }, 60000);
window.addEventListener('pagehide', () => { clearInterval(poller); pendingController?.abort(); });
window.addEventListener('pageshow', event => { if (event.persisted) { location.reload(); } });
