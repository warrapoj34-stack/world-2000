import { formatNumber, renderStats } from './stats.js';
import { renderArmy } from './army-screen.js';
import { renderTraits } from './traits-screen.js';

const KEY = 'world-2000:ui-preferences';
const explanations = {
  treasury: ['💰 เงินที่มี', 'เงินที่ประเทศใช้ได้ ถ้ารายจ่ายมากกว่าเงินที่มี ประเทศจะกู้เพิ่มและมีหนี้มากขึ้น'],
  gdp: ['💵 ขนาดเศรษฐกิจ', 'มูลค่าสิ่งที่ประเทศผลิตได้ในหนึ่งปี หรือ GDP ยิ่งมาก ยิ่งเก็บภาษีได้มาก ลงทุนเรื่องการศึกษาและถนนช่วยให้เติบโต'],
  happiness: ['😊 ความสุข', 'ประชาชนอยู่ดีแค่ไหน จาก 0 ถึง 100 ลดภาษีหรือเพิ่มงบดูแลประชาชนช่วยได้ คนมีความสุขช่วยให้ประเทศมั่นคง'],
  stability: ['🛡️ ความมั่นคง', 'รัฐบาลดูแลประเทศได้ดีแค่ไหน จาก 0 ถึง 100 ความสุขช่วยเพิ่มค่านี้ แต่หนี้สูงทำให้ลดลง ถ้าเหลือ 0 จะจบเกม'],
  military: ['⚔️ กำลังทหาร', 'คะแนนรวมจำนวนรถถัง เรือรบ และเครื่องบินรบ ถ่วงน้ำหนักเทียบกับประเทศอันดับ 1 = 100 เปิดกองทัพเพื่อดูจำนวนและอันดับแต่ละเหล่า'],
};
const lessons = [
  ['🗺️', 'ประเทศนี้อยู่ในมือคุณ', 'ลากแผนที่เพื่อเลื่อน กางสองนิ้วเพื่อซูม แตะประเทศเพื่อดูข้อมูล ขอบเรืองแสงคือประเทศของคุณ'],
  ['💰', 'ดูแค่ค่าหลักก่อน', 'แถบบนบอกเงิน ความสุข และทหาร แตะหรือกดค้างที่รูปเพื่ออ่านความหมาย ไม่ต้องจำทุกตัวเลข'],
  ['🎚️', 'เลือกว่าจะดูแลอะไร', 'เปิดนโยบายด้านล่าง ลดภาษีช่วยให้คนสุขขึ้น แต่เงินเข้าน้อยลง แบ่งงบให้โรงเรียน โรงพยาบาล ถนน และเรื่องที่คุณอยากพัฒนา'],
  ['📅', 'เวลาเดินเอง', 'ดูวันที่มุมขวาบน กดหยุดหรือเร่งเวลาได้ เกมคำนวณเงินทุกเดือน และหยุดเมื่อมีเหตุการณ์ให้เลือก'],
];

export function createGuidance({ catalog, getState, onRanking, onResources, onChange, onRefresh }) {
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* ใช้ค่าชั่วคราวเมื่ออ่านไม่ได้ */ }
  if (typeof prefs !== 'object' || Array.isArray(prefs)) prefs = {};
  const dialog = document.querySelector('#help-dialog');
  const title = document.querySelector('#help-title');
  const body = document.querySelector('#help-content');
  const close = document.querySelector('#close-help');
  const missions = document.querySelector('#missions');
  let lesson = -1;
  let missionSeconds = 0, missionLast = performance.now();
  setInterval(() => {
    const now = performance.now(), state = getState();
    if (state && !document.hidden && !document.querySelector('#map-screen').hidden && !document.querySelector('dialog[open]') && !state.clock?.userPaused && !state.economy?.gameOver && !state.victory?.finished) missionSeconds += (now - missionLast) / 1000 * (state.clock?.speed ?? 1);
    missionLast = now;
    if (missionSeconds >= 10 && !prefs.missionsHidden) { prefs.missionsHidden = true; remember(); missions.hidden = true; }
  }, 200);
  document.querySelector('#victory-toggle').addEventListener('click', () => { open('เป้าหมายของประเทศ'); text(document.querySelector('#victory-name').textContent); text(document.querySelector('#victory-progress-detail').textContent); });
  function remember() {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* จำได้เฉพาะรอบนี้เมื่อพื้นที่ถูกปิด */ }
  }
  function finish() {
    if (lesson >= 0) { prefs.tutorialDone = true; remember(); lesson = -1; }
    dialog.close();
  }
  function open(heading) {
    title.textContent = heading; body.replaceChildren(); close.textContent = 'กลับแผนที่';
    if (!dialog.open) dialog.showModal();
  }
  function text(value, className = '') {
    const p = document.createElement('p'); p.textContent = value; p.className = className; body.append(p);
  }
  function button(label, action, id) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'map-button';
    b.textContent = label; if (id) b.id = id; b.addEventListener('click', action); body.append(b);
  }
  function tutorial() {
    const [icon, heading, copy] = lessons[lesson];
    open(`เริ่มเล่นง่ายๆ • ${lesson + 1}/${lessons.length}`); close.textContent = 'ข้ามบทแนะนำ';
    text(icon, 'help-emblem'); text(heading, 'help-heading'); text(copy);
    if (lesson > 0) button('ย้อนกลับ', () => { lesson--; tutorial(); }, 'tutorial-back');
    button(lesson === lessons.length - 1 ? 'เริ่มบริหารประเทศ' : 'ถัดไป →', () => {
      if (lesson === lessons.length - 1) finish(); else { lesson++; tutorial(); }
    }, 'tutorial-next');
  }
  function refresh() {
    const state = getState(); if (!state) return;
    missions.hidden = prefs.missionsHidden === true || Boolean(state.economy?.gameOver);
    const stats = state.countries[state.playerCountryId], policy = state.economy?.policy;
    const tips = [];
    if (stats.happiness < 55) tips.push(policy?.tax > 20 ? 'ลองลดภาษีให้ประชาชนสุขขึ้น' : 'ลองเพิ่มงบโรงพยาบาลหรือช่วยค่าครองชีพ');
    else if (stats.debt > 100 || stats.treasury < stats.gdp * .03) tips.push('เปิดนโยบาย ดูว่าเงินเข้าพอกับรายจ่ายไหม');
    else tips.push('ลองเลือกเรื่องที่อยากพัฒนาในหน้านโยบาย');
    tips.push('ปล่อยเวลาเดินเพื่อดูผลในเดือนถัดไป');
    document.querySelector('#mission-list').replaceChildren(...tips.map(tip => { const li = document.createElement('li'); li.textContent = tip; return li; }));
    if (!prefs.tutorialDone && !dialog.open && !document.querySelector('#economy-dialog').open && !state.economy?.gameOver) { lesson = 0; tutorial(); }
  }
  close.addEventListener('click', finish);
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
  document.querySelector('#dismiss-missions').addEventListener('click', () => { prefs.missionsHidden = true; remember(); refresh(); });
  document.querySelector('#open-country').addEventListener('click', () => {
    const state = getState(), country = catalog.byId.get(state.playerCountryId);
    open(`ประเทศของคุณ • ${country.nameTh}`);
    text('ดูภาพรวมประเทศ หรือเปิดอันดับเพื่อเทียบกับประเทศอื่น');
    const dl = document.createElement('dl'); dl.className = 'stat-grid'; renderStats(dl, state.countries[country.id]); body.append(dl);
    renderTraits(body,state,catalog,onChange,onRefresh);
    const history = state.events?.history ?? [];
    text('เหตุการณ์ที่ผ่านมา');
    if (!history.length) text('ยังไม่มีเหตุการณ์');
    for (const event of history.slice(-12).reverse()) text(`${event.icon} ${event.title} • ${event.option} • ${event.date.month}/${event.date.year}`);
    button('อันดับโลก', () => { finish(); onRanking(); }, 'open-ranking');
    button('อ่านวิธีเล่นอีกครั้ง', () => { lesson = 0; tutorial(); }, 'replay-tutorial');
    button(prefs.missionsHidden ? 'แสดงภารกิจแนะนำ' : 'ซ่อนภารกิจแนะนำ', () => { prefs.missionsHidden = !prefs.missionsHidden; remember(); finish(); refresh(); }, 'toggle-missions');
  });
  document.querySelector('#open-resources').addEventListener('click', onResources);
  for (const name of ['army', 'transport']) {
    document.querySelector(`#open-${name}`).addEventListener('click', () => {
      const stats = getState().countries[getState().playerCountryId];
      if (name === 'army') {
        open('กองทัพ'); renderArmy(body, getState(), catalog, onChange, onRefresh);
      } else {
        open(name === 'market' ? 'ตลาด' : 'คมนาคม');
        text(name === 'market' ? '⚖️' : '🚆', 'help-emblem'); text('เร็วๆ นี้', 'coming-soon');
        text(name === 'market' ? 'ตลาดซื้อขายยังไม่เปิด ระหว่างนี้ลองดูแลรายรับรายจ่ายในหน้านโยบาย' : 'ระบบสร้างเส้นทางยังไม่เปิด ตอนนี้เพิ่มงบถนนและสิ่งก่อสร้างได้ในหน้านโยบาย');
      }
    });
  }
  for (const [key, [heading, copy]] of Object.entries(explanations)) {
    const target = document.querySelector(`[data-stat="${key}"]`); if (!target) continue; let timer;
    const show = () => { open(heading); text(copy); };
    target.addEventListener('click', () => { clearTimeout(timer); if (!dialog.open) show(); });
    target.addEventListener('pointerdown', () => { timer = setTimeout(show, 500); });
    for (const event of ['pointerup', 'pointerleave', 'pointercancel']) target.addEventListener(event, () => clearTimeout(timer));
    target.addEventListener('contextmenu', event => event.preventDefault());
  }
  document.addEventListener('world-session', refresh);
  document.addEventListener('policy-change', refresh);
  return { refresh };
}
