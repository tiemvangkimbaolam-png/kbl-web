(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let ipc = null;
  try { ipc = require('electron').ipcRenderer; } catch (_) {}

  function safeClickTab(id) {
    try { if (typeof window.switchTab === 'function') return window.switchTab(id); } catch (_) {}
    const btn = document.querySelector(`.tab-btn[onclick*="${id}"]`);
    if (btn) btn.click();
  }

  function addQuickBar() {
    if ($('kbl-quick-bar') || !document.querySelector('.app-header')) return;
    const bar = document.createElement('div');
    bar.id = 'kbl-quick-bar';
    bar.innerHTML = `
      <span class="kbl-q-label">Thao tác nhanh</span>
      <button data-tab="tab-banhang">🧾 Bán hàng</button>
      <button data-tab="tab-kho">🏷️ Kho & tem</button>
      <button data-tab="tab-camdo">💰 Cầm đồ</button>
      <button data-tab="tab-thumua">🪙 Thu mua</button>
      <button data-tab="tab-baocao">📊 Báo cáo</button>
      <button class="kbl-device-btn" type="button">⚙️ Tự cài thiết bị</button>`;
    bar.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => safeClickTab(btn.dataset.tab)));
    bar.querySelector('.kbl-device-btn').addEventListener('click', openDeviceAssistant);
    document.querySelector('.app-header').insertAdjacentElement('afterend', bar);
  }

  function ensureDeviceModal() {
    if ($('kbl-device-modal')) return $('kbl-device-modal');
    const modal = document.createElement('div');
    modal.id = 'kbl-device-modal';
    modal.innerHTML = `<div class="kbl-device-card">
      <div class="kbl-device-head"><div><h2>⚙️ Tự cài thiết bị</h2><div style="color:#64748b;margin-top:4px">Khách chỉ cần bấm một nút. POS tự chọn thiết bị đã được Windows nhận.</div></div><button id="kbl-device-close" type="button">✕</button></div>
      <div class="kbl-device-grid">
        <div class="kbl-device-row"><strong>🖨️ Máy in giấy</strong><small id="kbl-paper-detail">Đang kiểm tra…</small><div id="kbl-paper-state" class="kbl-device-state">…</div></div>
        <div class="kbl-device-row"><strong>🏷️ Máy in tem</strong><small id="kbl-label-detail">Đang kiểm tra…</small><div id="kbl-label-state" class="kbl-device-state">…</div></div>
        <div class="kbl-device-row"><strong>⚖️ Cân điện tử</strong><small id="kbl-scale-detail">Đang kiểm tra…</small><div id="kbl-scale-state" class="kbl-device-state">…</div></div>
        <div class="kbl-device-row"><strong>📷 Camera / CCCD</strong><small id="kbl-camera-detail">Đang kiểm tra…</small><div id="kbl-camera-state" class="kbl-device-state">…</div></div>
        <div class="kbl-device-row"><strong>🔎 Máy quét mã</strong><small>Loại USB giả lập bàn phím dùng trực tiếp, không cần cấu hình trong POS.</small><div class="kbl-device-state ok">SẴN SÀNG</div></div>
        <div class="kbl-device-row"><strong>💾 Dữ liệu</strong><small id="kbl-data-detail">Dữ liệu nghiệp vụ được lưu ngoài thư mục cài đặt.</small><div class="kbl-device-state ok">BẢO TOÀN KHI NÂNG CẤP</div></div>
      </div>
      <div class="kbl-device-actions"><button id="kbl-device-auto" class="btn btn-primary" type="button">✨ TỰ CÀI TẤT CẢ</button><button id="kbl-device-refresh" class="btn btn-gray" type="button">↻ Kiểm tra lại</button><button id="kbl-data-backup" class="btn btn-gray" type="button">💾 Sao lưu ngay</button><button id="kbl-data-restore" class="btn btn-gray" type="button">♻️ Khôi phục</button><button id="kbl-data-open" class="btn btn-gray" type="button">📂 Mở dữ liệu</button></div>
      <div class="kbl-device-note">POS sẽ tự chọn máy in hợp lý và nhớ lựa chọn. Với cân mới, đặt một món lên cân hoặc bấm PRINT trên cân trong lúc POS dò chuẩn truyền dữ liệu. Thiết bị vẫn phải được Windows nhận/driver của hãng cài đúng.</div>
    </div>`;
    document.body.appendChild(modal);
    $('kbl-device-close').onclick = () => modal.classList.remove('kbl-open');
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('kbl-open'); });
    $('kbl-device-refresh').onclick = refreshDeviceStatus;
    $('kbl-device-auto').onclick = autoSetupDevices;
    $('kbl-data-backup').onclick = backupNow;
    $('kbl-data-restore').onclick = restoreData;
    $('kbl-data-open').onclick = openDataFolder;
    return modal;
  }

  function state(id, status, text) {
    const el = $(id); if (!el) return;
    el.className = 'kbl-device-state ' + (status || ''); el.textContent = text;
  }
  function looksLabel(name) { return /(snbc|xprinter|godex|zebra|tsc|barcode|label|tem|bple|btp|thermal)/i.test(String(name||'')); }
  function looksPaper(name) { return !looksLabel(name) && !/(pdf|onenote|fax|xps)/i.test(String(name||'')); }

  async function getPrinters() {
    if (!ipc) return [];
    try { return (await ipc.invoke('get-printers')) || []; } catch (_) { return []; }
  }

  async function refreshDataInfo(){
    if(!ipc)return;
    try{const info=await ipc.invoke('kbl:data-info');if($('kbl-data-detail')&&info?.dataDir)$('kbl-data-detail').textContent='Dữ liệu lưu tại: '+info.dataDir+' · tự backup hằng ngày.';}catch(_){}
  }
  async function backupNow(){
    if(!ipc)return alert('Không kết nối được bộ lưu dữ liệu.');
    const r=await ipc.invoke('kbl:data-backup-now');
    if(r?.success) alert('✅ Đã sao lưu an toàn.\n\n'+r.path); else alert('⚠️ Chưa sao lưu được: '+(r?.message||''));
  }
  async function restoreData(){
    if(!ipc)return alert('Không kết nối được bộ khôi phục dữ liệu.');
    if(!confirm('Khôi phục sẽ thay dữ liệu hiện tại bằng bản backup đã chọn. POS sẽ tự tạo một bản sao lưu an toàn trước khi khôi phục. Tiếp tục?'))return;
    const r=await ipc.invoke('kbl:data-restore');
    if(r?.canceled)return;
    if(!r?.success)alert('⚠️ Chưa khôi phục được: '+(r?.message||''));
    else alert('✅ Đã khôi phục dữ liệu. POS sẽ tự mở lại.');
  }
  async function openDataFolder(){if(!ipc)return;const r=await ipc.invoke('kbl:data-open-folder');if(r&&!r.success)alert('Không mở được thư mục dữ liệu: '+(r.message||''));}

  async function refreshDeviceStatus() {
    refreshDataInfo();
    const printers = await getPrinters();
    const names = printers.map(p => p.name).filter(Boolean);
    const labels = names.filter(looksLabel), papers = names.filter(looksPaper);
    $('kbl-paper-detail').textContent = papers.length ? papers.join(' · ') : (names.length ? `Windows có ${names.length} máy in; chưa phân loại máy giấy.` : 'Windows chưa trả về máy in nào.');
    $('kbl-label-detail').textContent = labels.length ? labels.join(' · ') : (names.length ? 'Chưa nhận diện tên máy tem; vẫn có thể chọn từ danh sách Windows.' : 'Windows chưa trả về máy in tem.');
    state('kbl-paper-state', papers.length ? 'ok' : names.length ? 'warn' : 'bad', papers.length ? 'ĐÃ NHẬN' : names.length ? 'CẦN CHỌN' : 'CHƯA NHẬN');
    state('kbl-label-state', labels.length ? 'ok' : names.length ? 'warn' : 'bad', labels.length ? 'ĐÃ NHẬN' : names.length ? 'CẦN CHỌN' : 'CHƯA NHẬN');

    const scale = window.__kblSharedScale?.getStatus?.();
    $('kbl-scale-detail').textContent = scale?.connected ? `Đã nối cân ${scale.targetComPort || ''}${scale.profileLabel ? ` · ${scale.profileLabel}` : ''}` : ('serial' in navigator ? 'POS có thể tự dò cổng và chuẩn cân đã hỗ trợ.' : 'Máy này chưa hỗ trợ Web Serial.');
    state('kbl-scale-state', scale?.connected ? 'ok' : ('serial' in navigator ? 'warn' : 'bad'), scale?.connected ? 'ĐÃ NỐI' : ('serial' in navigator ? 'SẴN SÀNG DÒ' : 'CHƯA HỖ TRỢ'));

    let cams = [];
    try { cams = (await navigator.mediaDevices?.enumerateDevices?.() || []).filter(d => d.kind === 'videoinput'); } catch (_) {}
    $('kbl-camera-detail').textContent = cams.length ? `${cams.length} camera đã được Windows/Chromium nhận.` : 'Chưa thấy camera hoặc chưa cấp quyền camera.';
    state('kbl-camera-state', cams.length ? 'ok' : 'warn', cams.length ? 'ĐÃ NHẬN' : 'CHỜ CẤP QUYỀN');
  }

  function setPrinterSelect(id, value) {
    const sel = $(id); if (!sel || !value) return false;
    const found = Array.from(sel.options || []).some(o => o.value === value);
    if (!found) return false;
    sel.value = value;
    sel.dispatchEvent(new Event('change', {bubbles:true}));
    return true;
  }

  async function autoSetupDevices() {
    const btn = $('kbl-device-auto'); if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang tự cài…'; }
    try {
      if (typeof window.loadPrinters === 'function') await window.loadPrinters();
      const printers = await getPrinters();
      const names = printers.map(p => p.name).filter(Boolean);
      const label = names.find(looksLabel) || '';
      const paper = names.find(looksPaper) || names[0] || '';
      if (label) { setPrinterSelect('label-printer', label); try { localStorage.setItem('kbl_label_printer', label); } catch (_) {} }
      if (paper) { setPrinterSelect('invoice-printer', paper); try { localStorage.setItem('kbl_invoice_printer', paper); } catch (_) {} }

      try {
        if (navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({video:true, audio:false});
          stream.getTracks().forEach(t => t.stop());
        }
      } catch (_) {}

      try { if (window.__kblSharedScale?.autoConnect) await window.__kblSharedScale.autoConnect(); } catch (_) {}
      await refreshDeviceStatus();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✨ TỰ CÀI TẤT CẢ'; }
    }
  }

  function openDeviceAssistant() { ensureDeviceModal().classList.add('kbl-open'); refreshDeviceStatus(); }
  window.KBLDeviceAssistant = { open:openDeviceAssistant, refresh:refreshDeviceStatus, autoSetup:autoSetupDevices };

  document.addEventListener('DOMContentLoaded', () => { addQuickBar(); ensureDeviceModal(); try { if (!localStorage.getItem('kbl_device_setup_seen_v241')) { setTimeout(() => { openDeviceAssistant(); localStorage.setItem('kbl_device_setup_seen_v241','1'); }, 900); } } catch (_) {} });
})();
