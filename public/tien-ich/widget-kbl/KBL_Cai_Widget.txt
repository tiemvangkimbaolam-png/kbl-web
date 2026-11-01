// KBL: chỉ cài mã từ bản GitHub cố định đã kiểm tra; không chạy mã tải về.
try {
  if (config.runsInWidget) throw Error('Chạy bộ cài này trong ứng dụng Scriptable.');
  const sha = '7a00d8fafb3966a727ba13eafaf9341e41f31dbd';
  const url = 'https://api.github.com/repos/tiemvangkimbaolam-png/kbl-web/git/blobs/' + sha;
  const r = new Request(url); r.timeoutInterval = 15; r.allowInsecureRequest = false; r.onRedirect = () => null;
  r.headers={Accept:'application/vnd.github+json','User-Agent':'KBL-Widget-Installer'};
  const raw = await r.loadString();
  if (r.response.statusCode !== 200 || r.response.url !== url || raw.length>300000) throw Error('Chưa tải được bản KBL. Chưa ghi đè file nào.');
  const blob=JSON.parse(raw);
  if(blob.sha!==sha||blob.encoding!=='base64'||blob.size!==66295||typeof blob.content!=='string')throw Error('Chưa nhận đúng bản KBL cố định.');
  const code=Data.fromBase64String(blob.content.replace(/\s/g,'')).toRawString();
  if (code.length !== 66109 || !code.startsWith('// KIM BAO LAM — public gold price widget, version 1.2.0.')) throw Error('Mã KBL chưa đầy đủ. Chưa ghi đè file nào.');
  let fm; try { fm = FileManager.iCloud(); fm.documentsDirectory(); } catch (_) { fm = FileManager.local(); }
  let name = 'KBL Gia Vang Dong', file = fm.joinPath(fm.documentsDirectory(), name + '.js');
  for (let n = 2; fm.fileExists(file) && n <= 100; n++) { name = 'KBL Gia Vang Dong (' + n + ')'; file = fm.joinPath(fm.documentsDirectory(), name + '.js'); }
  if (fm.fileExists(file)) throw Error('Đã có nhiều bản KBL. Chưa ghi đè file nào.');
  fm.writeString(file, code);
  const a = new Alert(); a.title = 'Đã lưu widget KBL'; a.message = 'Tên script: ' + name + '\nBấm ▶ để xem thử. Sau đó thêm widget Scriptable ra màn hình và chọn đúng tên này.'; a.addAction('Mở script'); await a.presentAlert();
  await Safari.open('scriptable:///open/' + encodeURIComponent(name));
} catch (e) { const a = new Alert(); a.title = 'Chưa cài xong'; a.message = String(e.message || e); a.addAction('OK'); await a.presentAlert(); }
Script.complete();
