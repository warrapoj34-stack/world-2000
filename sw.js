import { VERSION, CACHE_REVISION } from './js/version.js';

const CACHE_PREFIX = `world-2000:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}:${CACHE_REVISION}`;
const APP_SHELL = [
  './data/TERRITORY_LICENSES.html', './data/provinces/index.json', './js/data/territories.js', './js/territories.js', './data/events-province.json', './js/events/province-events.js', './js/ui/territory-events.js', './css/territories.css',
  './js/data/starting.js', './js/ui/country-cards.js', './css/country-cards.css',
  './js/events/news.js', './js/ui/news-screen.js', './css/news.css',
  './js/ui/performance.js', './css/performance.css',
  './', './index.html', './css/main.css', './js/main.js',
  './js/version.js', './js/ui/menu.js', './js/pwa.js',
  './manifest.json', './data/game.json', './icons/icon.svg',
  './icons/icon-192.png', './icons/icon-512.png',
  './css/map.css', './js/ui/map-screen.js', './js/data/world.js',
  './js/map/renderer.js', './js/map/controls.js', './css/resources.css',
  './assets/world-high.jpg', './assets/world-low.jpg',
  './lib/d3-7.9.0.js', './lib/topojson-client-3.1.0.js',
  './data/countries-50m.json', './data/country-names-th.json', './data/world-2000.json',
  './css/game.css', './js/state.js', './js/data/countries.js', './js/diplomacy/relations.js',
  './js/save/storage.js', './js/ui/start-screen.js', './js/ui/stats.js',
  './data/countries_2000.json', './data/relations_2000.json',
  './data/policies.json', './js/policies.js', './js/ui/policy-cards.js',
  './js/resources.js', './js/data/resources.js', './js/ui/resource-screen.js', './css/resources.css',
  './data/resources.json', './data/country_resources_2000.json',
  './js/ui/guidance.js', './css/friendly.css',
  './data/balance.json', './js/economy.js', './js/ui/economy-screen.js', './css/economy.css',
  './data/events.json', './js/events/engine.js', './js/ui/event-screen.js', './css/events.css',
  './js/victory.js', './css/victory.css',
  './js/time.js', './js/ui/time-screen.js', './css/time.css',
  './data/playable.json', './data/playable_regions.json', './js/data/playable.js',
  './data/military2000.json', './data/military_rules.json', './js/war/military.js',
  './data/recipes.json', './js/war/production.js', './js/ui/army-screen.js',
  './data/traits.json', './js/traits.js', './js/ui/traits-screen.js',
  './js/ui/trait-map.js', './css/trait-map.css',
  './data/sea_grid.json', './data/trade_ports.json', './js/map/trade-data.js', './js/ui/trade-visuals.js', './css/trade.css',
  './js/data/resource-ids.js', './js/market.js', './js/market-effects.js', './js/ui/market-screen.js', './css/market.css',
];
const OPTIONAL_ASSETS = ['./data/provinces/th.json','./data/provinces/cn.json','./data/provinces/us.json','./data/provinces/jp.json','./data/provinces/fr.json','./data/provinces/ru.json','./data/provinces/ua.json','./data/provinces/mm.json','./data/provinces/la.json','./data/provinces/kh.json','./data/provinces/my.json'];
const SHELL_URLS = [...new Set(APP_SHELL.map(path=>new URL(path,self.registration.scope).href))];
const APP_URLS = new Set([...APP_SHELL,...OPTIONAL_ASSETS].map(path=>new URL(path,self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([...SHELL_URLS].map(url => new Request(url, { cache: 'reload' })));
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
