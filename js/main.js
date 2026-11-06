import { ensurePolicyCards } from './policies.js';
import { loadResources } from './data/resources.js';
import { ensureResources } from './resources.js';
import { createResourceScreen } from './ui/resource-screen.js';
import { VERSION } from './version.js';
import { showVersion, showOfflineStatus } from './ui/menu.js';
import { registerServiceWorker } from './pwa.js';
import { loadCatalog } from './data/countries.js';
import { createDraft, createGame } from './state.js';
import { readSave, writeSave, removeDraft } from './save/storage.js';
import { createStartScreen } from './ui/start-screen.js';
import { ensureEconomy } from './economy.js';
import { createGuidance } from './ui/guidance.js';
import { createEconomyScreen } from './ui/economy-screen.js';

showVersion(VERSION);
registerServiceWorker(showOfflineStatus);

const menu = document.querySelector('#menu-screen');
const header = document.querySelector('#menu-header');
const mapScreen = document.querySelector('#map-screen');
const startScreen = document.querySelector('#start-screen');
const loading = document.querySelector('#map-loading');
const retry = document.querySelector('#retry-map');
const newButton = document.querySelector('#new-game');
const continueButton = document.querySelector('#continue-game');
const feedback = document.querySelector('#menu-feedback');
let catalog, startUI, activeGame, activeDraft;
let balance, economyUI;
let map = null, pendingMap = null, saveTimer = 0;

function showScreen(target) {
  menu.hidden = target !== 'menu';
  header.hidden = target !== 'menu';
  startScreen.hidden = target !== 'start';
  mapScreen.hidden = target !== 'map';
  document.body.classList.toggle('map-mode', target === 'map');
}

function reportSave(result) {
  const label = document.querySelector('#save-status');
  label.textContent = result.ok ? 'บันทึกอัตโนมัติแล้ว' : 'บันทึกไม่ได้ • พื้นที่จัดเก็บเต็มหรือถูกปิด';
  label.classList.toggle('save-error', !result.ok);
}

function persistGame() {
  clearTimeout(saveTimer);
  if (!activeGame || !catalog) return;
  reportSave(writeSave('game', activeGame, catalog));
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistGame, 200);
}
function persistDraft(draft) {
  activeDraft = draft;
  reportSave(writeSave('draft', draft, catalog));
}

function refreshMenu() {
  const game = readSave('game', catalog);
  const draft = readSave('draft', catalog);
  continueButton.disabled = !(activeGame || game.status === 'valid' || activeDraft || draft.status === 'valid');
  const bad = [game.status, draft.status];
  feedback.textContent = bad.includes('unavailable') ? 'ไม่สามารถใช้พื้นที่จัดเก็บได้ เกมจะอยู่เฉพาะในหน้านี้'
    : bad.includes('incompatible') ? 'พบเซฟจากรูปแบบที่ยังไม่รองรับ เก็บไฟล์เดิมไว้แล้ว'
      : bad.includes('corrupt') ? 'พบข้อมูลเซฟที่อ่านไม่ได้ เริ่มเกมใหม่ได้โดยเซฟเดิมยังไม่ถูกลบ'
        : (game.status === 'valid' || activeGame) ? 'มีเกมที่บันทึกไว้แล้ว • กดเล่นต่อเพื่อรับหน้าที่เดิม'
          : (draft.status === 'valid' || activeDraft) ? 'มีประเทศที่สุ่มค้างไว้ • กดเล่นต่อเพื่อรับตำแหน่ง'
            : 'สุ่มรับบทประเทศจริงในปี ค.ศ. 2000';
}

function goMenu() {
  persistGame();
  showScreen('menu');
  refreshMenu();
  newButton.focus({ preventScroll: true });
}

async function openMap() {
  ensureEconomy(activeGame, balance);
  ensureResources(activeGame);
  ensurePolicyCards(activeGame,catalog.policies);
  showScreen('map');
  economyUI.refresh();
  document.querySelector('#back-to-menu').focus({ preventScroll: true });
  if (map) { map.setSession(activeGame); return; }
  if (pendingMap) return;
  loading.hidden = false;
  retry.hidden = true;
  document.querySelector('#map-load-message').textContent = 'กำลังเตรียมแผนที่โลก…';
  try {
    pendingMap = import('./ui/map-screen.js').then(module => module.initializeMapScreen({
      catalog, getState: () => activeGame, onChange: scheduleSave,
    }));
    map = await pendingMap;
    loading.hidden = true;
    if (!mapScreen.hidden) map.setSession(activeGame);
  } catch (error) {
    document.querySelector('#map-load-message').textContent = 'โหลดแผนที่ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง';
    retry.hidden = false;
    console.error('โหลดแผนที่ไม่สำเร็จ', error);
  } finally { pendingMap = null; }
}

function acceptCountry(id) {
  startUI.cancel();
  activeGame = createGame(id, catalog);
  const saved = writeSave('game', activeGame, catalog);
  reportSave(saved);
  if (saved.ok) removeDraft();
  activeDraft = null;
  openMap();
}

function openDraft(draft, spin) {
  showScreen('start');
  startUI.show(draft, { spin, replacesSave: Boolean(activeGame || readSave('game', catalog).status === 'valid') });
}

async function boot() {
  newButton.disabled = continueButton.disabled = true;
  feedback.textContent = 'กำลังเตรียมข้อมูลประเทศ…';
  try {
    catalog = await loadCatalog();
    await loadResources(catalog);
    const policiesResponse=await fetch(new URL('../data/policies.json',import.meta.url));
    if(!policiesResponse.ok)throw Error('โหลดนโยบายไม่สำเร็จ');
    catalog.policies=await policiesResponse.json();
    const response = await fetch(new URL('../data/balance.json', import.meta.url));
    if (!response.ok) throw new Error('โหลดค่าระบบเศรษฐกิจไม่สำเร็จ');
    balance = await response.json();
    economyUI = createEconomyScreen({ catalog, balance, getState: () => activeGame,
      onChange: persistGame, onRefresh: () => map?.setSession(activeGame), onMenu: goMenu });
    const resourceUI = createResourceScreen({ catalog, balance, getState: () => activeGame, onChange: persistGame, onRefresh: () => map?.setSession(activeGame) });
    createGuidance({ catalog, getState: () => activeGame, onRanking: economyUI.ranking, onResources: resourceUI.open });
    startUI = createStartScreen({ catalog, onDraft: persistDraft, onAccept: acceptCountry, onBack: goMenu });
    refreshMenu();
  } catch {
    catalog = null;
    feedback.textContent = 'โหลดข้อมูลไม่สำเร็จ กดเริ่มเกมใหม่เพื่อลองอีกครั้ง';
  } finally { newButton.disabled = false; }
}

newButton.addEventListener('click', async () => {
  if (!catalog) { await boot(); if (!catalog) return; }
  persistGame();
  const stored = readSave('draft', catalog);
  const previous = activeDraft || (stored.status === 'valid' ? stored.state : null);
  const draft = previous || createDraft(catalog);
  persistDraft(draft);
  openDraft(draft, !previous);
});
continueButton.addEventListener('click', () => {
  const saved = readSave('game', catalog);
  if (saved.status === 'valid' || activeGame) {
    activeGame = activeGame || saved.state;
    openMap();
  } else {
    const draft = readSave('draft', catalog);
    if (activeDraft || draft.status === 'valid') {
      activeDraft = activeDraft || draft.state;
      openDraft(activeDraft, false);
    } else refreshMenu();
  }
});
retry.addEventListener('click', openMap);
document.querySelector('#back-to-menu').addEventListener('click', goMenu);
window.addEventListener('pagehide', persistGame);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistGame();
});
boot();
