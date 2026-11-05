import { VERSION } from './version.js';
import { showVersion, showOfflineStatus } from './ui/menu.js';
import { registerServiceWorker } from './pwa.js';

showVersion(VERSION);
registerServiceWorker(showOfflineStatus);

const menu = document.querySelector('#menu-screen');
const header = document.querySelector('#menu-header');
const screen = document.querySelector('#map-screen');
const loading = document.querySelector('#map-loading');
const retry = document.querySelector('#retry-map');
let map = null;
let pending = null;

async function openMap() {
  menu.hidden = true;
  header.hidden = true;
  screen.hidden = false;
  document.body.classList.add('map-mode');
  document.querySelector('#back-to-menu').focus({ preventScroll: true });
  if (map) { map.resize(); return; }
  if (pending) return;
  loading.hidden = false;
  retry.hidden = true;
  document.querySelector('#map-load-message').textContent = 'กำลังเตรียมแผนที่โลก…';
  try {
    pending = import('./ui/map-screen.js').then(module => module.initializeMapScreen());
    map = await pending;
    loading.hidden = true;
  } catch (error) {
    document.querySelector('#map-load-message').textContent = 'โหลดแผนที่ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง';
    retry.hidden = false;
    console.error('โหลดแผนที่ไม่สำเร็จ', error);
  } finally {
    pending = null;
  }
}

document.querySelector('#new-game').addEventListener('click', openMap);
retry.addEventListener('click', openMap);
document.querySelector('#back-to-menu').addEventListener('click', () => {
  screen.hidden = true;
  menu.hidden = false;
  header.hidden = false;
  document.body.classList.remove('map-mode');
  document.querySelector('#new-game').focus({ preventScroll: true });
});
