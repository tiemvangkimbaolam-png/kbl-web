// KIM BAO LAM — public gold price widget, version 1.1.0.
// Only HTTPS GET to the KBL public price API; no login, tracking, remote code or POS writes.
// Permissions used: its own local price cache. No contacts, photos, location or calendar.
const KBL_ORIGIN = 'https://tiemvangkimbaolam.id.vn';
const KBL_API = KBL_ORIGIN + '/api/public/catalog';
const KBL_THEME = '__KBL_THEME__';
const KBL_LOGO_BASE64 = '__KBL_LOGO__';
const KBL_BACKGROUND_BASE64 = '__KBL_BACKGROUND__';
/* KBL_CORE_START */
__KBL_CORE__
/* KBL_CORE_END */

async function runKblWidget() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), 'kbl-public-prices-v1.json');
  let snapshot = null, offline = false;
  try { if (fm.fileExists(cachePath)) snapshot = JSON.parse(fm.readString(cachePath)); } catch (_) {}
  try {
    const req = new Request(KBL_API);
    req.method = 'GET'; req.timeoutInterval = 12; req.allowInsecureRequest = false;
    req.headers = { Accept: 'application/json', 'Cache-Control': 'no-cache' };
    req.onRedirect = next => next.url.indexOf(KBL_ORIGIN + '/') === 0 ? next : null;
    const text = await req.loadString();
    if (!req.response || req.response.statusCode !== 200 || text.length > 2000000 || req.response.url.indexOf(KBL_ORIGIN + '/') !== 0) throw Error('Nguồn chưa sẵn sàng.');
    const next = widgetSnapshot(JSON.parse(text));
    if (widgetState(next).expired) throw Error('Bảng giá đã quá cũ.');
    snapshot = next;
    try { fm.writeString(cachePath, JSON.stringify(next)); } catch (_) {}
  } catch (_) { offline = true; }
  const state = widgetState(snapshot, Date.now(), offline);
  const family = config.widgetFamily || 'medium';
  const small = family === 'small', large = family === 'large' || family === 'extraLarge';
  // Concept 06: light peach surfaces, navy ink, readable copper sell prices.
  const colors = { bg: 'FFFEFD', ink: '102C43', muted: '65717D', gold: '9B4D2D', line: 'EAD1BF' };
  const w = new ListWidget();
  w.backgroundColor = new Color(colors.bg);
  try { w.backgroundImage = Image.fromData(Data.fromBase64String(KBL_BACKGROUND_BASE64)); } catch (_) {}
  w.setPadding(1, 1, 1, 1);
  w.url = KBL_ORIGIN + '/#prices';
  w.refreshAfterDate = new Date(Date.now() + 15 * 60000);
  const frame = w.addStack(); frame.layoutVertically();
  frame.cornerRadius = 23; frame.borderWidth = 1; frame.borderColor = new Color('CC946E');
  frame.setPadding(small ? 11 : large ? 18 : 10, small ? 11 : 14, small ? 9 : 10, small ? 11 : 14);
  function text(parent, content, size, color, bold = false, serif = false) {
    const t = parent.addText(String(content));
    try { t.font = serif ? new Font(bold ? 'Georgia-Bold' : 'Georgia', size) : bold ? Font.boldSystemFont(size) : Font.systemFont(size); }
    catch (_) { t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size); }
    t.textColor = new Color(color); t.lineLimit = 1; t.minimumScaleFactor = 0.75; return t;
  }
  const header = frame.addStack(); header.centerAlignContent();
  try {
    const logo = header.addImage(Image.fromData(Data.fromBase64String(KBL_LOGO_BASE64)));
    logo.imageSize = new Size(small ? 25 : large ? 43 : 29, small ? 25 : large ? 39 : 26); logo.applyFittingContentMode();
  } catch (_) { text(header, 'KBL', small ? 11 : 14, colors.gold, true, true); }
  header.addSpacer(small ? 5 : 8);
  const brand = header.addStack(); brand.layoutVertically();
  text(brand, 'KIM BẢO LÂM', small ? 10 : large ? 17 : 12, colors.gold, true, true);
  if (!small) text(brand, 'BẢNG GIÁ VÀNG', large ? 8 : 6, colors.ink);
  header.addSpacer();
  if (!small) text(header, 'đ/chỉ', 8, colors.muted);
  frame.addSpacer(small ? 11 : large ? 24 : 6);
  if (!state.rows.length) {
    text(frame, 'Chưa có giá mới', small ? 14 : 17, colors.ink, true);
    frame.addSpacer(5);
    const message = text(frame, 'Chạm để xem bảng giá tại website KBL.', 11, colors.muted);
    message.lineLimit = 3; frame.addSpacer();
  } else if (small) {
    const row = state.rows[0];
    text(frame, 'Vàng 999.9', 17, colors.gold, true, true); frame.addSpacer(10);
    const prices = frame.addStack();
    const buy = prices.addStack(); buy.layoutVertically();
    text(buy, 'Mua vào', 9, colors.muted); buy.addSpacer(4);
    text(buy, widgetMoney(row.buy), 12, colors.ink, true, true);
    prices.addSpacer(8);
    const sell = prices.addStack(); sell.layoutVertically();
    text(sell, 'Bán ra', 9, colors.gold); sell.addSpacer(4);
    text(sell, widgetMoney(row.sell), 12, colors.gold, true, true);
    frame.addSpacer();
  } else {
    const rows = KBL_WIDGET_FEATURED.flatMap(code => state.rows.filter(row => row.code === code));
    const table = frame.addStack(); table.layoutVertically();
    const labelWidth = large ? 70 : 59, valueWidth = large ? 95 : 87;
    function column(parent, content, size, color, bold, width, right = false, serif = false) {
      const box = parent.addStack(); box.size = new Size(width, 0); if (right) box.addSpacer();
      text(box, content, size, color, bold, serif);
    }
    const columns = table.addStack();
    column(columns, 'Loại vàng', large ? 10 : 8, colors.muted, false, labelWidth); columns.addSpacer();
    column(columns, 'Mua vào', large ? 10 : 8, colors.muted, false, valueWidth, true); columns.addSpacer(9);
    column(columns, 'Bán ra', large ? 10 : 8, colors.gold, false, valueWidth, true);
    table.addSpacer(large ? 12 : 4);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], line = table.addStack(); line.centerAlignContent();
      line.setPadding(large ? 11 : 2, 0, large ? 11 : 2, 0);
      line.cornerRadius = 7;
      if (i === 0) line.backgroundColor = new Color('FFF2E9', 0.82);
      column(line, 'Vàng ' + (row.code === '9999' ? '999.9' : row.code), large ? 16 : 11, colors.ink, true, labelWidth, false, true);
      line.addSpacer(); column(line, widgetMoney(row.buy), large ? 18 : 13, colors.ink, true, valueWidth, true, true);
      line.addSpacer(9); column(line, widgetMoney(row.sell), large ? 18 : 13, colors.gold, true, valueWidth, true, true);
      if (i < rows.length - 1) table.addSpacer(large ? 9 : 3);
    }
    frame.addSpacer();
  }
  if (state.rows.length && state.stale) {
    text(frame, 'BẢN LƯU · CHƯA CÓ GIÁ MỚI', 7, colors.gold, true); frame.addSpacer(2);
  }
  text(frame, state.sourceAt ? widgetClock(state.sourceAt) + (small ? ' · đ/chỉ' : ' · Giờ bảng giá') : 'Chạm để mở website', small ? 7 : 8, colors.muted);
  Script.setWidget(w);
  if (!config.runsInWidget) {
    if (small) await w.presentSmall(); else if (large) await w.presentLarge(); else await w.presentMedium();
  }
  Script.complete();
  return { state, widget: w };
}
await runKblWidget();
