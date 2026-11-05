import { VERSION } from './js/version.js';

const CACHE_PREFIX = `world-2000:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const APP_SHELL = [
  './', './index.html', './css/main.css', './js/main.js',
  './js/version.js', './js/ui/menu.js', './js/pwa.js',
  './manifest.json', './data/game.json', './icons/icon.svg',
  './icons/icon-192.png', './icons/icon-512.png',
  './css/map.css', './js/ui/map-screen.js', './js/data/world.js',
  './js/map/renderer.js', './js/map/controls.js',
  './lib/d3-7.9.0.js', './lib/topojson-client-3.1.0.js',
  './data/countries-50m.json', './data/country-names-th.json', './data/world-2000.json',
];
const APP_URLS = new Set(APP_SHELL.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([...APP_URLS].map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  url.search = '';
  // เก็บเฉพาะไฟล์ของเกม ไม่ดักทรัพยากรอื่นบนโดเมนเดียวกัน
  if (request.method !== 'GET' || !APP_URLS.has(url.href)) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  const network = fetch(request, { cache: 'no-store', signal: controller.signal })
    .then(response => {
      if (!response.ok) throw new Error('เครือข่ายตอบกลับไม่สำเร็จ');
      return response;
    }).finally(() => clearTimeout(timeout));

  event.waitUntil(network.then(async response => {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(url.href, response.clone());
  }).catch(() => {}));

  event.respondWith(network.then(response => response.clone()).catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url.href);
    if (cached) return cached;
    return new Response('ไม่พบไฟล์ออฟไลน์ กรุณาเชื่อมต่ออินเทอร์เน็ตอีกครั้ง', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }));
});
