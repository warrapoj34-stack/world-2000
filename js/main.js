import { VERSION } from './version.js';
import { showVersion, showOfflineStatus } from './ui/menu.js';
import { registerServiceWorker } from './pwa.js';

showVersion(VERSION);
registerServiceWorker(showOfflineStatus);
