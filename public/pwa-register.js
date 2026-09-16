(() => {
  'use strict';

  const isStandalone = () => (
    window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone === true
  );

  function ensureReloadButton() {
    if (!isStandalone() || document.getElementById('kbl-pwa-reload')) return;
    const style = document.createElement('style');
    style.id = 'kbl-pwa-reload-style';
    style.textContent = `
      #kbl-pwa-reload{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(14px,calc(env(safe-area-inset-bottom) + 10px));z-index:2147482500;width:48px;height:48px;border:1px solid rgba(217,165,29,.72);border-radius:50%;display:grid;place-items:center;background:rgba(7,29,56,.96);color:#f2c54a;box-shadow:0 10px 28px rgba(0,0,0,.28);font:900 25px/1 Arial,sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent}
      #kbl-pwa-reload:active{transform:scale(.94)}
      #kbl-pwa-reload.kbl-loading{animation:kblReloadSpin .75s linear infinite}
      body.qr-scanning #kbl-pwa-reload{display:none!important}
      @keyframes kblReloadSpin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(style);
    const button = document.createElement('button');
    button.id = 'kbl-pwa-reload';
    button.type = 'button';
    button.textContent = '↻';
    button.title = 'Tải lại trang';
    button.setAttribute('aria-label', 'Tải lại trang');
    button.addEventListener('click', () => {
      button.classList.add('kbl-loading');
      button.disabled = true;
      location.reload();
    });
    document.body.appendChild(button);
  }

  function showUpdateBanner(registration) {
    if (document.getElementById('kbl-pwa-update')) return;
    const box = document.createElement('div');
    box.id = 'kbl-pwa-update';
    box.setAttribute('role','status');
    box.innerHTML = '<span><strong>Kim Bảo Lâm có phiên bản mới.</strong><small>Bấm cập nhật để tải bản mới, app sẽ tự mở lại.</small></span><button type="button" class="update">CẬP NHẬT</button><button type="button" class="close" aria-label="Đóng">×</button>';
    const style = document.createElement('style');
    style.textContent = '#kbl-pwa-update{position:fixed;left:50%;bottom:max(18px,calc(env(safe-area-inset-bottom) + 8px));transform:translateX(-50%);z-index:2147483000;width:min(560px,calc(100% - 28px));display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid rgba(217,165,29,.55);border-radius:16px;background:#071d38;color:#fff;box-shadow:0 18px 50px rgba(0,0,0,.3);font-family:Arial,sans-serif}#kbl-pwa-update span{display:grid;gap:2px;flex:1}#kbl-pwa-update strong{font-size:13px}#kbl-pwa-update small{font-size:11px;color:#d7e1ec;line-height:1.35}#kbl-pwa-update button{border:0;border-radius:10px;padding:9px 12px;background:#d9a51d;color:#06182f;font-size:11px;font-weight:900;cursor:pointer}#kbl-pwa-update .close{width:32px;height:32px;padding:0;border-radius:50%;background:rgba(255,255,255,.1);color:#fff;font-size:19px}';
    document.head.appendChild(style);
    document.body.appendChild(box);
    box.querySelector('.update').addEventListener('click', () => {
      window.__kblUpdateAccepted = true;
      const waiting = registration.waiting;
      if (waiting) waiting.postMessage({type:'SKIP_WAITING'});
      else location.reload();
    });
    box.querySelector('.close').addEventListener('click', () => box.remove());
  }

  window.addEventListener('DOMContentLoaded', ensureReloadButton, { once: true });
  window.addEventListener('pageshow', ensureReloadButton);

  if (!('serviceWorker' in navigator)) return;

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

      let reloadingForUpdate = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!window.__kblUpdateAccepted || reloadingForUpdate) return;
        reloadingForUpdate = true;
        location.reload();
      });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          ensureReloadButton();
          registration.update().catch(() => {});
        }
      });
      setInterval(() => registration.update().catch(() => {}), 10 * 60 * 1000);
    } catch (error) {
      console.warn('KBL PWA registration failed', error);
    }
  });
})();
