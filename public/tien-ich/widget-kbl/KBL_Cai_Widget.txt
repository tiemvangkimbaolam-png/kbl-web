// KBL: chỉ cài mã từ bản GitHub cố định đã kiểm tra; không chạy mã tải về.
try {
  if (config.runsInWidget) throw Error('Chạy bộ cài này trong ứng dụng Scriptable.');
  const url = 'https://raw.githubusercontent.com/tiemvangkimbaolam-png/kbl-web/734be73afde2e9b532aa03bc6121474b9a417a9e/public/tien-ich/widget-kbl/KBL_Gia_Vang_Dong.js';
  const r = new Request(url); r.timeoutInterval = 15; r.allowInsecureRequest = false; r.onRedirect = () => null;
  const code = await r.loadString();
  if (r.response.statusCode !== 200 || r.response.url !== url || code.length !== 66276 || !code.startsWith('// KIM BAO LAM — public gold price widget, version 1.1.0.')) throw Error('Chưa tải được bản KBL đầy đủ. Chưa cài hay ghi đè file nào.');
  let fm; try { fm = FileManager.iCloud(); fm.documentsDirectory(); } catch (_) { fm = FileManager.local(); }
  let name = 'KBL Gia Vang Dong', file = fm.joinPath(fm.documentsDirectory(), name + '.js');
  for (let n = 2; fm.fileExists(file) && n <= 100; n++) { name = 'KBL Gia Vang Dong (' + n + ')'; file = fm.joinPath(fm.documentsDirectory(), name + '.js'); }
  if (fm.fileExists(file)) throw Error('Đã có nhiều bản KBL. Chưa ghi đè file nào.');
  fm.writeString(file, code);
  const a = new Alert(); a.title = 'Đã lưu widget KBL'; a.message = 'Tên script: ' + name + '\nBấm ▶ để xem thử. Sau đó thêm widget Scriptable ra màn hình và chọn đúng tên này.'; a.addAction('Mở script'); await a.presentAlert();
  await Safari.open('scriptable:///open/' + encodeURIComponent(name));
} catch (e) { const a = new Alert(); a.title = 'Chưa cài xong'; a.message = String(e.message || e); a.addAction('OK'); await a.presentAlert(); }
Script.complete();
