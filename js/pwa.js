import { VERSION } from './version.js';

export async function registerServiceWorker(showStatus) {
  if (!('serviceWorker' in navigator)) {
    showStatus('เบราว์เซอร์นี้ไม่รองรับโหมดออฟไลน์');
    return;
  }

  let refreshing = false;
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !refreshing) {
      refreshing = true;
      window.location.reload();
    }
    hadController = true;
  });

  try {
    const registration = await navigator.serviceWorker.register(
      new URL(`../sw.js?v=${VERSION}`, import.meta.url),
      { type: 'module', updateViaCache: 'none' },
    );
    await navigator.serviceWorker.ready;
    const updateStatus = () => showStatus(navigator.onLine
      ? 'พร้อมใช้งานแบบออฟไลน์'
      : 'โหมดออฟไลน์');
    updateStatus();
    window.addEventListener('offline', updateStatus);
    window.addEventListener('online', () => {
      updateStatus();
      registration.update().catch(() => {});
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        registration.update().catch(() => {});
      }
    });
  } catch {
    showStatus('ยังไม่พร้อมใช้งานออฟไลน์ • ลองเปิดใหม่เมื่อมีอินเทอร์เน็ต');
  }
}
