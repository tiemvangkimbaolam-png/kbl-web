(() => {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  const hadControllerAtLoad = Boolean(navigator.serviceWorker.controller);

  function showUpdateBanner(registration) {
    if (document.getElementById('kbl-pwa-update')) return;
    const box = document.createElement('div');
    box.id = 'kbl-pwa-update';
    box.setAttribute('role','status');
    box.innerHTML = '<span><strong>Kim Bảo Lâm có phiên bản mới.</strong><small>Cập nhật để dùng giao diện và tính năng mới nhất.</small></span><button type="button">CẬP NHẬT</button><button type="button" class="close" aria-label="Đóng">×</button>';
    const style = document.createElement('style');
    style.textContent = '#kbl-pwa-update{position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;width:min(560px,calc(100% - 28px));display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid rgba(217,165,29,.55);border-radius:16px;background:#071d38;color:#fff;box-shadow:0 18px 50px rgba(0,0,0,.3);font-family:Arial,sans-serif}#kbl-pwa-update span{display:grid;gap:2px;flex:1}#kbl-pwa-update strong{font-size:13px}#kbl-pwa-update small{font-size:11px;color:#d7e1ec;line-height:1.35}#kbl-pwa-update button{border:0;border-radius:10px;padding:9px 12px;background:#d9a51d;color:#06182f;font-size:11px;font-weight:900;cursor:pointer}#kbl-pwa-update .close{width:32px;height:32px;padding:0;border-radius:50%;background:rgba(255,255,255,.1);color:#fff;font-size:19px}';
    document.head.appendChild(style);
    document.body.appendChild(box);
    box.querySelector('button:not(.close)').addEventListener('click', () => {
      const waiting = registration.waiting;
      if (waiting) waiting.postMessage({type:'SKIP_WAITING'});
      else location.reload();
    });
    box.querySelector('.close').addEventListener('click', () => box.remove());
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope:'/', updateViaCache:'none' });
      registration.update().catch(() => {});

      if (registration.waiting && navigator.serviceWorker.controller) showUpdateBanner(registration);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(registration);
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadControllerAtLoad) showUpdateBanner(registration);
      });

      // Khi PWA được mở lại sau một thời gian, chủ động kiểm tra bản mới.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
      setInterval(() => registration.update().catch(() => {}), 10 * 60 * 1000);
    } catch (error) {
      console.warn('KBL PWA registration failed', error);
    }
  });
})();
