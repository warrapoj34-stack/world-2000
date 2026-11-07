import { renderPolicyCards } from './policy-cards.js';
import { resourceEffects } from '../resources.js';
import { allocateBudget, advanceMonth, ensureEconomy, fiscalForecast, worldRanking, BUDGET_KEYS, defeatReason } from '../economy.js';
import { formatMoney, formatNumber, shortMoney, monthName, governmentName } from './stats.js';
import { PATHS, ensureVictory, selectVictoryPath, updateVictory, victoryProgress } from '../victory.js';

const labels = { military: 'ทหาร', education: 'การศึกษา', health: 'โรงพยาบาล', infrastructure: 'ถนนและสิ่งก่อสร้าง', welfare: 'ช่วยค่าครองชีพ' };
const money = value => formatMoney(value);
export function createEconomyScreen({ catalog, balance, getState, onChange, onRefresh, onMenu }) {
  const dialog = document.querySelector('#economy-dialog');
  const title = document.querySelector('#economy-title');
  const content = document.querySelector('#economy-content');
  const close = document.querySelector('#close-economy');
  let screen = '', busy = false;
  function open(name, heading) {
    screen = name;
    title.textContent = heading;
    content.replaceChildren();
    close.textContent = name === 'over' || (name === 'victory' && getState().victory.finished) ? 'กลับเมนู'
      : name === 'victory' ? 'เล่นต่อแบบ Sandbox' : 'กลับแผนที่';
    if (!dialog.open) dialog.showModal();
  }
  function paragraph(text, className = '') {
    const p = document.createElement('p'); p.textContent = text; p.className = className; content.append(p); return p;
  }
  function row(label, value, className = '') {
    const div = document.createElement('div'); div.className = `economy-row ${className}`;
    const name = document.createElement('span'); name.textContent = label;
    const result = document.createElement('strong'); result.textContent = value;
    div.append(name, result); content.append(div);
  }
  function policies() {
    open('policy','นโยบายภายในประเทศ');
    renderPolicyCards(content,getState(),catalog,balance,()=>{onChange();document.dispatchEvent(new Event('policy-change'));});
    const heading = document.createElement('label'); heading.textContent = 'ทางเลือกชัยชนะ'; heading.htmlFor = 'policy-victory-path'; content.append(heading);
    const picker = document.createElement('select'); picker.id = 'policy-victory-path'; picker.className = 'victory-select';
    picker.append(...Object.entries(PATHS).map(([id, path]) => new Option(path.name, id)));
    picker.value = ensureVictory(getState()).path;
    const note = paragraph(PATHS[picker.value].detail.replaceAll('เศรษฐกิจ','ประเทศ'), 'victory-detail');
    picker.addEventListener('change', () => { selectVictoryPath(getState(), picker.value); note.textContent = PATHS[picker.value].detail.replaceAll('เศรษฐกิจ','ประเทศ'); onChange(); onRefresh(); });
    content.append(picker);
  }
  function victorySummary() {
    const state = getState(), victory = ensureVictory(state), stats = state.countries[state.playerCountryId];
    open('victory', victory.finished ? 'สรุปประเทศ • ปี 2050' : 'คุณทำภารกิจสำเร็จ!');
    paragraph(`${catalog.byId.get(state.playerCountryId).nameTh} • ${PATHS[victory.path].name}`);
    paragraph(victory.finished ? `เดินทางมา ${state.economy.turns} เทิร์น • ${victory.won ? 'ทำเป้าหมายสำเร็จ' : 'สิ้นสุดการเดินทาง'}` : 'เป้าหมายสำเร็จก่อนปี 2050');
    row('เงินคลัง', money(stats.treasury));
    row('ความสุข', `${formatNumber(stats.happiness)}/100`);
    const rank = worldRanking(state, catalog).findIndex(item => item.id === state.playerCountryId) + 1;
    const score = Math.round((stats.happiness + stats.stability + stats.military + (1 - (rank - 1) / catalog.playable.length) * 100) / 4);
    row('คะแนนรวม', `${score}/100`); row('อันดับประเทศ', `${rank}/${catalog.playable.length}`);
    row('ความคืบหน้า', `${Math.floor(victoryProgress(state, catalog).percent)}%`);
    const history = state.events?.history ?? [];
    paragraph(`เหตุการณ์ที่ตัดสินใจ ${history.length} ครั้ง`);
    for (const item of history.slice(-8)) paragraph(`${item.icon} ${item.title} • ${item.option} (${item.date.month}/${item.date.year})`);
    if (!victory.finished) {
      const keep = document.createElement('button'); keep.type = 'button'; keep.className = 'map-button';
      keep.textContent = 'เล่นต่อแบบ Sandbox'; keep.addEventListener('click', () => { victory.continued = true; onChange(); dialog.close(); }); content.append(keep);
    }
  }
  function ranking() {
    const state = getState(), rows = catalog.playable.map(c=>({...c,treasury:state.countries[c.id].treasury})).sort((a,b)=>b.treasury-a.treasury);
    open('ranking', 'อันดับเงินคลัง');
    paragraph(`ประเทศของคุณอยู่อันดับ ${rows.findIndex(row => row.id === state.playerCountryId) + 1} จาก ${rows.length} ประเทศ • ${monthName(state.date)}`);
    paragraph('เงินคลังของประเทศ • ไม่รวมดินแดนที่สุ่มเล่นไม่ได้');
    rows.forEach((country, index) => row(`${index + 1}. ${country.nameTh}${country.id === state.playerCountryId ? ' ★ คุณ' : ''}`, money(country.treasury), country.id === state.playerCountryId ? 'player-rank' : ''));
  }
  function report(detailed = false) {
    const r = getState().economy.lastReport;
    if (!r) return;
    open('report', `สรุปเดือนที่ผ่านมา • ${monthName(r.period)}`);
    if (!detailed) {
      const summary = document.createElement('div'); summary.className = 'report-summary'; content.append(summary);
      const delta = r.after.treasury - r.before.treasury;
      const lines = [
        [delta > 0 ? 'good' : delta < 0 ? 'bad' : '', delta === 0 ? 'เงินที่มีเท่าเดิม' : `เงิน${delta > 0 ? 'เพิ่ม' : 'ลด'} ${shortMoney(Math.abs(delta))}ดอลลาร์`],
        ['', r.fiscal.net >= 0 ? 'รายรับรวมพอจ่ายค่าใช้จ่าย' : 'ค่าใช้จ่ายมากกว่ารายรับรวม'],
        [r.fiscal.borrowed > 0 ? 'bad' : '', r.resourceSummary?.drought ? `ภัยแล้ง • น้ำช่วยลดผลเสีย ${Math.round(r.resourceSummary.protection*100)}%` : r.fiscal.borrowed > 0 ? 'เงินไม่พอ จึงต้องกู้เพิ่ม' : r.fiscal.interest > 0 ? 'จ่ายดอกเบี้ยแล้ว ไม่ต้องกู้เพิ่ม' : 'ไม่มีดอกเบี้ย และไม่ต้องกู้เพิ่ม'],
      ];
      for (const [style, value] of lines) { const p = document.createElement('p'); p.className = style; p.textContent = value; summary.append(p); }
      const more = document.createElement('button'); more.type = 'button'; more.className = 'map-button'; more.id = 'report-details'; more.textContent = 'ดูรายละเอียด'; more.addEventListener('click', () => report(true)); content.append(more);
      return;
    }
    paragraph(`เข้าสู่ ${monthName(getState().date)} • ผลจากนโยบายของคุณ`);
    for (const [key, label] of Object.entries({treasury: 'เงินที่มี', debt: 'หนี้ / รายได้ประเทศ', happiness: 'ความสุข', military: 'ทหาร', tech: 'เทคโนโลยี'})) {
      const delta = r.after[key] - r.before[key];
      const unit = key === 'debt' ? '%' : ['gdp', 'treasury'].includes(key) ? ' พันล้าน $' : '/100';
      row(label, `${formatNumber(r.after[key])}${unit} (${delta > 0 ? '+' : ''}${formatNumber(delta)})`, delta === 0 ? '' : (key === 'debt' ? delta < 0 : delta > 0) ? 'good' : 'bad');
    }
    if (r.resourceSummary) paragraph(`ทรัพยากรสร้างรายได้ ${money(r.resourceSummary.income)}${r.resourceSummary.drought ? ` • ภัยแล้ง: น้ำลดผลเสีย ${Math.round(r.resourceSummary.protection*100)}%` : ' • ไม่มีภัยแล้งในรอบนี้'}`);
    paragraph(`ภาษี ${money(r.fiscal.revenue)} · รายจ่าย ${money(r.fiscal.spending)} · ดอกเบี้ย ${money(r.fiscal.interest)} · ค่านโยบายพิเศษ ${money(r.fiscal.policyCost ?? 0)} · กู้เพิ่ม ${money(r.fiscal.borrowed)}`);
  }
  function gameOver() {
    const state = getState(), economy = state.economy, stats = state.countries[state.playerCountryId];
    open('over', 'สิ้นสุดการบริหารประเทศ • จบเกม');
    paragraph(economy.gameOver === 'bankruptcy' ? `ประเทศล้มละลาย: หนี้เกิน ${balance.bankruptcyDebt}% ของรายได้ประเทศ` : 'รัฐบาลล่มสลาย', 'bad');
    paragraph(`${catalog.byId.get(state.playerCountryId).nameTh} • บริหาร ${economy.turns} รอบ • ${monthName(state.date)}`);
     row('หนี้ / รายได้ประเทศ', `${formatNumber(stats.debt)}%`);
    row('ความสุข', `${formatNumber(stats.happiness)}/100`); row('ความมั่นคง', `${formatNumber(stats.stability)}/100`);
    row('อันดับโลก', `${worldRanking(state, catalog).findIndex(row => row.id === state.playerCountryId) + 1}`);
    paragraph('กลับเมนูแล้วเริ่มเกมใหม่เพื่อเลือกเส้นทางใหม่');
  }
  function refresh() {
    const state = getState(), economy = ensureEconomy(state, balance);
    economy.gameOver ||= defeatReason(state.countries[state.playerCountryId], balance);
    const victory = ensureVictory(state);
    if (economy.gameOver) gameOver();
    else if (victory.finished || (victory.won && !victory.continued)) victorySummary();
  }
  close.addEventListener('click', () => { if (screen === 'victory' && !getState().victory.finished) { getState().victory.continued = true; onChange(); }
    dialog.close(); if (screen === 'over' || (screen === 'victory' && getState().victory.finished)) onMenu(); });
  dialog.addEventListener('cancel', event => { if (screen === 'over' || (screen === 'victory' && getState().victory.finished)) { event.preventDefault(); dialog.close(); onMenu(); } });
  document.querySelector('#open-policy').addEventListener('click', policies);
  function finishMonth() {
    if (busy || dialog.open || getState().economy.gameOver || ensureVictory(getState()).finished) return;
    busy = true;
    try { const result = advanceMonth(getState(), catalog, balance); updateVictory(getState(), catalog); onChange(); onRefresh();
      if (getState().economy.gameOver) gameOver();
      else if (getState().victory.finished || (getState().victory.won && !getState().victory.continued)) victorySummary();
      else if (result) document.querySelector('#monthly-status').textContent = `เดือนล่าสุด: เงิน${result.fiscal.net >= 0 ? 'เพิ่ม' : 'ลด'} ${shortMoney(Math.abs(result.fiscal.net))}`; }
    finally { busy = false; }
  }
  return { refresh, ranking, finishMonth };
}
