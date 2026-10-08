'use strict';

// Service Worker側の版はこの1箇所だけ。index.html の ?v=N と必ず同じ値にすること。
// ズレると、Service Workerだけが古いキャッシュを配り続けて更新が届かなくなる。
// 手で書き換えず `node tools/version.mjs bump` を使う（ズレは npm test で検出される）。
const ASSET_VERSION = 22;
const CACHE_NAME = `pace-converter-v${ASSET_VERSION}`;

// ?v=N 付きで読み込んでいるファイル。index.html 側の記述と対になっている。
const VERSIONED_URLS = ['./css/style.css', './js/calc.js', './js/app.js'];

const PRECACHE_URLS = [
  './',
  './index.html',
  ...VERSIONED_URLS.map((url) => `${url}?v=${ASSET_VERSION}`),
  './manifest.webmanifest',
  './favicon.svg',
  './favicon.ico',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
];

// Tailwind CDNはクロスオリジンで、fetchはno-corsのopaqueレスポンスになる
// （中身の検証はできないが、オフライン用にそのままキャッシュできる）。
const CROSS_ORIGIN_URLS = ['https://cdn.tailwindcss.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
      await Promise.all(
        CROSS_ORIGIN_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { mode: 'no-cors' });
            await cache.put(url, response);
          } catch (e) {
            // オフライン初回インストールなど、取得できなくてもインストール自体は続行する
          }
        })
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: false });

      // stale-while-revalidate: あればすぐ返しつつ、裏で最新版を取りに行ってキャッシュを更新する
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && (response.ok || response.type === 'opaque')) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      if (cached) return cached;

      const network = await networkFetch;
      if (network) return network;

      if (request.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }

      return new Response('オフラインです。電波の届く場所で一度開いてください。', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    })()
  );
});
