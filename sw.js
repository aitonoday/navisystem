const CACHE_NAME = 'lively-navi-v4';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          return caches.delete(key); // 古いキャッシュをすべて破棄
        })
      );
    })
  );
  self.clients.claim();
});

// 地図タイル等の外部リソースは一切妨害せずスルー
self.addEventListener('fetch', (event) => {
  // 同一ドメインのリクエストのみネットワーク優先で処理
  if (event.request.method === 'GET' && event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
  }
});
