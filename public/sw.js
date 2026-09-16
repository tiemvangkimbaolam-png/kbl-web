'use strict';

const KBL_SW_VERSION = 'kbl-pwa-hotfix-20260825-01';
const SHELL_CACHE = `${KBL_SW_VERSION}-shell`;
const RUNTIME_CACHE = `${KBL_SW_VERSION}-runtime`;

const CORE = [
  '/offline.html',
  '/pwa/kbl-app-r8-1-180.png',
  '/pwa/kbl-app-r8-1-192.png',
  '/pwa/kbl-app-r8-1-512.png',
  '/pwa/kbl-app-r8-1-maskable-512.png',
  '/kbl-header-mark.png',
  '/kbl-logo-season.png',
  '/policy.css',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
  '/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);

    // Không để chỉ 1 file lỗi làm hỏng toàn bộ Service Worker.
    await Promise.allSettled(
      CORE.map(async (url) => {
        try {
          const response = await fetch(url, { cache: 'reload' });
          if (response && response.ok) {
            await cache.put(url, response.clone());
          } else {
            console.warn('[KBL SW] Không cache được:', url, response && response.status);
          }
        } catch (error) {
          console.warn('[KBL SW] Bỏ qua file cache lỗi:', url);
        }
      })
    );

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('kbl-pwa-') && ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

function isApi(url) {
  return url.pathname.startsWith('/api/');
}

function isSensitiveRoute(url) {
  return ['/dang-nhap','/account','/tai-khoan','/khach-hang','/customer','/admin','/remote','/tra-cuu','/lookup']
    .some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix + '/'));
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok && request.method === 'GET') {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return caches.match('/offline.html');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    network.catch(() => {});
    return cached;
  }

  const response = await network;
  return response || caches.match('/offline.html');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isApi(url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (isSensitiveRoute(url)) {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  const destination = request.destination;
  if (['style','script','image','font'].includes(destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'KBL_SW_VERSION', version: KBL_SW_VERSION });
  }
});
