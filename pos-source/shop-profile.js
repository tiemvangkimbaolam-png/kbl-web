(() => {
  const DEFAULT_PROFILE = Object.freeze({
    setupCompleted: false,
    shopName: 'TIỆM VÀNG',
    companyName: 'DOANH NGHIỆP KINH DOANH VÀNG',
    taxCode: '',
    address: '',
    phone: '',
    email: '',
    publicWebUrl: '',
    webSyncToken: '',
    geminiApiKey: ''
  });

  let profile = { ...DEFAULT_PROFILE };

  function text(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function value(key, fallback = '') {
    const current = text(profile[key]).trim();
    if (current) return current;
    const fallbackValue = text(fallback).trim();
    if (fallbackValue) return fallbackValue;
    return text(DEFAULT_PROFILE[key]).trim();
  }

  function companyName() {
    return value('companyName', value('shopName', 'TIỆM VÀNG'));
  }

  function shopName() {
    return value('shopName', 'TIỆM VÀNG');
  }

  function substituteHtml(input) { return text(input); }

  function renderFields(root = document) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-shop-field]').forEach((el) => {
      const key = el.getAttribute('data-shop-field') || '';
      const prefix = el.getAttribute('data-shop-prefix') || '';
      const suffix = el.getAttribute('data-shop-suffix') || '';
      let resolved = key === 'companyName' ? companyName() : value(key);
      el.textContent = `${prefix}${resolved}${suffix}`;
    });
    const title = document.querySelector('title');
    if (title) title.textContent = `${shopName()} - GOLD SHOP POS`;
  }

  function replaceLegacyTextNodes() {}

  function apply(root = document) {
    renderFields(root);
    replaceLegacyTextNodes(root.body || root);
  }

  async function load() {
    let next = null;
    try {
      if (typeof require === 'function') {
        const { ipcRenderer } = require('electron');
        next = await ipcRenderer.invoke('shop-config:get');
      }
    } catch (error) {
      console.warn('[SHOP PROFILE] Không đọc được cấu hình tiệm:', error && error.message ? error.message : error);
    }
    if (next && typeof next === 'object') profile = { ...DEFAULT_PROFILE, ...next };
    window.KBL_SHOP_PROFILE = profile;
    apply(document);
    window.dispatchEvent(new CustomEvent('shop-profile-ready', { detail: { ...profile } }));
    return profile;
  }

  window.KBL_SHOP_PROFILE = profile;
  window.KBLShop = {
    load,
    apply,
    value,
    shopName,
    companyName,
    substituteHtml,
    getProfile: () => ({ ...profile })
  };
  window.openShopSetup = () => { window.location.href = 'setup.html?edit=1'; };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      load();
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes || []) {
            if (node && node.nodeType === 1) apply(node);
          }
        }
      });
      if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  } else {
    load();
  }
})();
