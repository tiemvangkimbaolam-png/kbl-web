// Verify the exact generated JavaScript before offering it to the clipboard.
export async function readInstallSource(fetcher = fetch, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw Error('Hãy mở trang bằng Safari qua HTTPS để sao chép mã đã kiểm tra.');
  const options = { cache: 'no-store', redirect: 'error' };
  const manifestResponse = await fetcher('./install-manifest.json', options);
  if (!manifestResponse.ok) throw Error('Chưa tải được thông tin cài đặt. Hãy thử tải lại trang.');
  const manifestText = await manifestResponse.text();
  if (manifestText.length > 4096) throw Error('Thông tin cài đặt không hợp lệ.');
  const manifest = JSON.parse(manifestText);
  if (manifest.version !== 1 || manifest.file !== 'KBL_Gia_Vang_Dong.js' || manifest.name !== 'KBL Gia Vang Dong' || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1000 || manifest.bytes > 150000) throw Error('Thông tin cài đặt không hợp lệ.');
  const response = await fetcher('./' + manifest.file, options);
  if (!response.ok) throw Error('Chưa tải được mã widget. Hãy thử tải lại trang.');
  const code = await response.text();
  const bytes = new TextEncoder().encode(code);
  if (bytes.length !== manifest.bytes || !code.startsWith('// KIM BAO LAM — public gold price widget, version ')) throw Error('Mã widget chưa đầy đủ. Hãy tải lại trang rồi thử lại.');
  const digest = await subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== manifest.sha256) throw Error('Mã widget chưa khớp phiên bản. Hãy tải lại trang rồi thử lại.');
  return { code, name: manifest.name };
}
