import { widgetSnapshot, widgetState, widgetMoney, widgetClock, KBL_WIDGET_FEATURED } from './gold-core.mjs';
const $ = id => document.getElementById(id);
const root = $('widget-preview');
const theme = 'copper';
let size = 'medium', snapshot = null, lastError = '', downloadFile = null;
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
  $('widget-freshness').textContent = state.rows.length ? (state.stale ? 'Bản lưu · kiểm tra giá mới' : 'Bảng giá KBL') : 'Chạm widget để mở website';
  $('widget-time').textContent = state.sourceAt ? widgetClock(state.sourceAt) : '—';
  $('selection-summary').textContent = 'Hồng đào vàng đồng' + ' · Cỡ ' + labels[size] + ' đang xem trước';
  $('download-widget').href = './' + fileBase() + '.scriptable'; $('download-widget').download = fileBase() + '.scriptable';
  $('view-code').href = './' + fileBase() + '.js'; $('script-name').textContent = scriptName();
  $('open-widget').href = 'scriptable:///run/' + encodeURIComponent(scriptName());
}
async function preloadShare() {
  const chosen = fileBase(); downloadFile = null; $('share-widget').hidden = true;
  try {
    if (!navigator.share || !navigator.canShare || typeof File === 'undefined') return;
    const response = await fetch('./' + chosen + '.scriptable');
    if (!response.ok) return;
    const file = new File([await response.blob()], chosen + '.scriptable', { type: 'application/octet-stream' });
    if (chosen !== fileBase() || !navigator.canShare({ files: [file] })) return;
    downloadFile = file; $('share-widget').hidden = false;
  } catch (_) {}
}
async function refreshPrices() {
  const current = ++sequence; pendingController?.abort(); pendingController = new AbortController();
  const timer = setTimeout(() => pendingController?.abort(), 15000);
  try {
    const response = await fetch('/api/public/catalog', { headers: { Accept: 'application/json' }, cache: 'no-store', signal: pendingController.signal });
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
$('download-widget').addEventListener('click', () => { $('download-status').textContent = 'Sau khi tải, mở tệp → Chia sẻ → Scriptable để nhập gói. Tiếp tục làm bước 3 để đặt ra màn hình.'; });
$('share-widget').addEventListener('click', async () => {
  if (!downloadFile) return;
  try { await navigator.share({ files: [downloadFile], title: 'Widget giá vàng Kim Bảo Lâm' }); }
  catch (error) { if (error.name !== 'AbortError') $('download-status').textContent = 'Trình duyệt chưa chia sẻ được tệp. Hãy dùng nút Tải widget KBL.'; }
});
render(); void refreshPrices(); void preloadShare();
const poller = setInterval(() => { if (!document.hidden) void refreshPrices(); }, 60000);
window.addEventListener('pagehide', () => { clearInterval(poller); pendingController?.abort(); });
window.addEventListener('pageshow', event => { if (event.persisted) { location.reload(); } });
