// KIM BAO LAM — public gold price widget, version 1.3.0.
// HTTPS GET to KBL prices; an optional private goal uses the existing paired account.
// No remote code, tracking or POS writes.
// Permissions: local public-price cache; optional existing Scriptable Keychain pairing.
// Goal data stays in memory, never in the public price cache. No contacts, photos or location.
const KBL_ORIGIN = 'https://tiemvangkimbaolam.id.vn';
const KBL_API = KBL_ORIGIN + '/api/public/prices';
const KBL_THEME = '__KBL_THEME__';
const KBL_ADDRESS = '59/1 Nguyễn Thị Tươi, Phường Tân Đông Hiệp, Tp. Hồ Chí Minh';
const KBL_LOGO_BASE64 = '__KBL_LOGO__';
const KBL_BACKGROUND_BASE64 = '__KBL_BACKGROUND__';
/* KBL_CORE_START */
__KBL_CORE__
/* KBL_CORE_END */

// This is a Keychain item NAME, not a token. The token is supplied on the customer's device.
async function kblPrivateGoal() {
  try {
    if (typeof args !== 'undefined' && /^(ẩn|an|hide)$/i.test(String(args.widgetParameter || '').trim())) return null;
    const item = 'kbl-holdings-token-v1';
    if (typeof Keychain === 'undefined' || !Keychain.contains(item)) return null;
    const token = Keychain.get(item);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const endpoint = KBL_ORIGIN + '/api/public/holdings/goal-widget';
    const req = new Request(endpoint); req.method = 'GET'; req.timeoutInterval = 5; req.allowInsecureRequest = false;
    req.headers = { Accept: 'application/json', Authorization: 'Bearer ' + token, 'Cache-Control': 'no-store' };
    req.onRedirect = () => null;
    const raw = await req.loadString();
    if (req.response?.statusCode !== 200 || req.response.url !== endpoint || raw.length > 6000) return null;
    const result = JSON.parse(raw), g = result.goal;
    if (!Number.isFinite(result.generatedAt) || Math.abs(Date.now()-result.generatedAt)>90000 || !g?.showOnPriceWidget || !['9999','980','750','610','585','416'].includes(g.code) || !Number.isSafeInteger(g.targetUnits) || g.targetUnits<1 || !Number.isSafeInteger(g.currentUnits) || g.currentUnits<0) return null;
    const ratio=Math.min(1,g.currentUnits/g.targetUnits);
    return { code:g.code, title:String(g.title||'Mục tiêu tích lũy').slice(0,40), current:g.currentUnits, target:g.targetUnits, ratio, percent:ratio>=1?100:Math.floor(ratio*1000)/10 };
  } catch (_) { return null; } // A private goal failure must never hide public shop prices.
}

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
  const goal = await kblPrivateGoal();
  const family = config.widgetFamily || 'medium';
  const small = family === 'small', large = family === 'large' || family === 'extraLarge';
  // Concept 06: light peach surfaces, navy ink, readable copper sell prices.
  const colors = { bg: 'FFFEFD', ink: '102C43', muted: '65717D', gold: '9B4D2D', line: 'EAD1BF' };
  const w = new ListWidget();
  w.backgroundColor = new Color(colors.bg);
  try { w.backgroundImage = Image.fromData(Data.fromBase64String(KBL_BACKGROUND_BASE64)); } catch (_) {}
  w.setPadding(1, 1, 1, 1);
  w.url = KBL_ORIGIN + '/#prices';
  w.refreshAfterDate = new Date(Date.now() + 5 * 60000);
  const frame = w.addStack(); frame.layoutVertically();
  frame.cornerRadius = 23; frame.borderWidth = 1; frame.borderColor = new Color('CC946E');
  frame.setPadding(small ? 9 : large ? 16 : 8, small ? 10 : 12, small ? 8 : 7, small ? 10 : 12);
  function text(parent, content, size, color, bold = false, serif = false) {
    const t = parent.addText(String(content));
    try { t.font = serif ? new Font(bold ? 'Georgia-Bold' : 'Georgia', size) : bold ? Font.boldSystemFont(size) : Font.systemFont(size); }
    catch (_) { t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size); }
    t.textColor = new Color(color); t.lineLimit = 1; t.minimumScaleFactor = 0.8; return t;
  }
  const header = frame.addStack(); header.centerAlignContent();
  try {
    const logo = header.addImage(Image.fromData(Data.fromBase64String(KBL_LOGO_BASE64)));
    logo.imageSize = new Size(small ? 23 : large ? 39 : 27, small ? 23 : large ? 36 : 24); logo.applyFittingContentMode();
  } catch (_) { text(header, 'KBL', small ? 11 : 14, colors.gold, true, true); }
  header.addSpacer(small ? 5 : 8);
  const brand = header.addStack(); brand.layoutVertically();
  text(brand, 'KIM BẢO LÂM', small ? 11 : large ? 18 : 15, colors.gold, true, true);
  if (!small) text(brand, 'BẢNG GIÁ VÀNG', large ? 8 : 6, colors.ink);
  header.addSpacer();
  if (!small) text(header, 'đ/chỉ', 8, colors.muted);
  frame.addSpacer(small ? 7 : large ? 18 : 4);
  if (!state.rows.length) {
    text(frame, 'Chưa có giá mới', small ? 14 : 17, colors.ink, true);
    frame.addSpacer(5);
    const message = text(frame, 'Chạm để xem bảng giá tại website KBL.', 11, colors.muted);
    message.lineLimit = 3; frame.addSpacer();
  } else if (small) {
    const row = state.rows[0];
    text(frame, 'Vàng 999.9', 18, colors.gold, true, true); frame.addSpacer(6);
    for (const [label,value,color] of [['Mua',row.buy,colors.ink],['Bán',row.sell,colors.gold]]) {
      const line=frame.addStack();line.centerAlignContent();text(line,label,9,colors.muted);line.addSpacer();text(line,widgetMoney(value),14,color,true,true);frame.addSpacer(3);
    }
    frame.addSpacer();
  } else {
    const rows = KBL_WIDGET_FEATURED.flatMap(code => state.rows.filter(row => row.code === code));
    const table = frame.addStack(); table.layoutVertically();
    const labelWidth = 44, valueWidth = 104;
    function column(parent, content, size, color, bold, width, right = false, serif = false) {
      const box = parent.addStack(); box.size = new Size(width, 0); if (right) box.addSpacer();
      text(box, content, size, color, bold, serif);
    }
    const columns = table.addStack();
    column(columns, 'Vàng', large ? 11 : 9, colors.muted, false, labelWidth); columns.addSpacer();
    column(columns, 'Mua vào', large ? 11 : 9, colors.muted, false, valueWidth, true); columns.addSpacer(9);
    column(columns, 'Bán ra', large ? 11 : 9, colors.gold, false, valueWidth, true);
    table.addSpacer(large ? 10 : 3);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], line = table.addStack(); line.centerAlignContent();
      line.setPadding(large ? 9 : 0, 0, large ? 9 : 0, 0);
      line.cornerRadius = 7;
      if (i === 0) line.backgroundColor = new Color('FFF2E9', 0.82);
      column(line, row.code === '9999' ? '999.9' : row.code, large ? 17 : 14, colors.ink, true, labelWidth, false, true);
      line.addSpacer(); column(line, widgetMoney(row.buy), large ? 18 : 15, colors.ink, true, valueWidth, true, true);
      line.addSpacer(9); column(line, widgetMoney(row.sell), large ? 18 : 15, colors.gold, true, valueWidth, true, true);
      if (i < rows.length - 1) table.addSpacer(large ? 8 : 3);
    }
    frame.addSpacer();
  }
  if (goal) {
    frame.addSpacer(large ? 12 : 2);
    const qty=n=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:3}).format(n/1000);
    const purity=goal.code==='9999'?'999.9':goal.code;
    const line=frame.addStack();line.centerAlignContent();
    if (!small) { text(line,large?goal.title:'Mục tiêu '+purity,large?12:8,colors.gold,true);line.addSpacer(); }
    text(line,(small?purity+' · ':'')+qty(goal.current)+'/'+qty(goal.target)+' chỉ · '+goal.percent.toLocaleString('vi-VN')+'%',large?13:8,colors.ink,true);
    // Explicit segment widths keep the bar aligned with the table without remote images.
    if (!small) {
      frame.addSpacer(2);
      const bar=frame.addStack();bar.size=new Size(240,large?5:3);bar.cornerRadius=3;bar.backgroundColor=new Color('EAD1BF');
      if(goal.ratio>0){const fill=bar.addStack();fill.size=new Size(Math.max(1,240*goal.ratio),large?5:3);fill.backgroundColor=new Color(colors.gold);fill.cornerRadius=3;}
      bar.addSpacer();
    }
    frame.addSpacer(large?7:2);
  }
  text(frame, (offline?'Chưa kết nối · ':'')+(state.sourceAt ? widgetClock(state.sourceAt) : 'Chạm để mở website'), small ? 6 : 8, colors.muted);
  const address=text(frame,KBL_ADDRESS,small?6:large?9:7,colors.gold);address.lineLimit=small?3:2;

  Script.setWidget(w);
  if (!config.runsInWidget) {
    if (small) await w.presentSmall(); else if (large) await w.presentLarge(); else await w.presentMedium();
  }
  Script.complete();
  return { state, widget: w };
}
await runKblWidget();
