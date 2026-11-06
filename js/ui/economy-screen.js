import { allocateBudget, advanceQuarter, ensureEconomy, fiscalForecast, worldRanking, BUDGET_KEYS, defeatReason } from '../economy.js';
import { formatNumber, monthName, governmentName } from './stats.js';

const labels = { military: 'ทหาร', education: 'การศึกษา', health: 'สาธารณสุข', infrastructure: 'โครงสร้างพื้นฐาน', welfare: 'สวัสดิการ' };
const money = value => `${formatNumber(value)} พันล้าน $`;
export function createEconomyScreen({ catalog, balance, getState, onChange, onRefresh, onMenu }) {
  const dialog = document.querySelector('#economy-dialog');
  const title = document.querySelector('#economy-title');
  const content = document.querySelector('#economy-content');
  const close = document.querySelector('#close-economy');
  const end = document.querySelector('#end-turn');
  let screen = '', busy = false;
  function open(name, heading) {
    screen = name;
    title.textContent = heading;
    content.replaceChildren();
    close.textContent = name === 'over' ? 'กลับเมนู' : 'กลับแผนที่';
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
    const state = getState(), economy = ensureEconomy(state, balance);
    open('policy', 'นโยบายภายในประเทศ');
    paragraph(`${governmentName(catalog.byId.get(state.playerCountryId))} • ปรับแล้วบันทึกทันที มีผลเมื่อจบเทิร์น`);
    paragraph(`งบรวม 100% เมื่อเลื่อนหมวดหนึ่ง หมวดอื่นปรับตามสัดส่วน • งบพื้นฐาน ${balance.spendingRate * 100}% ของ GDP ต่อปี ทหารมีต้นทุนตามระบอบ`);
    paragraph('ภาษีต่ำช่วยความสุขแต่เงินเข้าน้อย • การศึกษาและโครงสร้างพื้นฐานช่วย GDP • สาธารณสุขและสวัสดิการช่วยความสุข • งบทหารรักษากำลังรบ');
    const controls = {};
    function slider(key, label, max) {
      const wrapper = document.createElement('label'); wrapper.className = 'policy-control';
      const name = document.createElement('span'); name.textContent = label;
      const output = document.createElement('output');
      const input = document.createElement('input'); input.type = 'range'; input.min = 0; input.max = max; input.step = 1; input.id = `policy-${key}`;
      input.setAttribute('aria-label', label);
      input.disabled = Boolean(economy.gameOver);
      controls[key] = { input, output };
      wrapper.append(name, output, input); content.append(wrapper);
      input.addEventListener('input', () => {
        if (key === 'tax') economy.policy.tax = Number(input.value);
        else economy.policy = allocateBudget(economy.policy, key, Number(input.value));
        refresh(); onChange();
      });
    }
    slider('tax', 'อัตราภาษี', balance.taxMax);
    for (const key of BUDGET_KEYS) slider(key, labels[key], 100);
    const forecast = paragraph('', 'fiscal-preview'); forecast.id = 'fiscal-preview';
    const total = paragraph('งบรวม 100%', 'budget-total');
    function refresh() {
      for (const [key, control] of Object.entries(controls)) {
        const value = key === 'tax' ? economy.policy.tax : economy.policy.budget[key];
        control.input.value = value; control.output.value = `${value}%`;
      }
      const f = fiscalForecast(state.countries[state.playerCountryId], catalog.byId.get(state.playerCountryId).government, economy.policy, balance);
      forecast.textContent = `ประมาณการไตรมาสหน้า: รายได้ ${money(f.revenue)} · รายจ่าย ${money(f.spending)} · ดอกเบี้ย ${money(f.interest)} · คงเหลือ ${money(f.net)} · ต้องกู้ ${money(Math.max(0, -state.countries[state.playerCountryId].treasury - f.net))}`;
      total.textContent = `งบรวม ${BUDGET_KEYS.reduce((sum, key) => sum + economy.policy.budget[key], 0)}%`;
    }
    refresh();
  }
  function ranking() {
    const state = getState(), rows = worldRanking(state, catalog);
    open('ranking', 'อันดับโลกตาม GDP');
    paragraph(`ประเทศของคุณอยู่อันดับ ${rows.findIndex(row => row.id === state.playerCountryId) + 1} จาก ${rows.length} ประเทศ • ${monthName(state.date)}`);
    paragraph('GDP รายปี หน่วยพันล้านดอลลาร์ • ไม่รวมดินแดนที่สุ่มเล่นไม่ได้');
    rows.forEach((country, index) => row(`${index + 1}. ${country.nameTh}${country.id === state.playerCountryId ? ' ★ คุณ' : ''}`, money(country.gdp), country.id === state.playerCountryId ? 'player-rank' : ''));
  }
  function report() {
    const r = getState().economy.lastReport;
    if (!r) return;
    open('report', `รายงานประจำไตรมาส • ${monthName(r.period)}`);
    paragraph(`เข้าสู่ ${monthName(getState().date)} • ผลจากนโยบายของคุณ`);
    for (const [key, label] of Object.entries({gdp: 'GDP', treasury: 'เงินคลัง', debt: 'หนี้ / GDP', happiness: 'ความสุข', stability: 'เสถียรภาพ', military: 'ทหาร', tech: 'เทคโนโลยี'})) {
      const delta = r.after[key] - r.before[key];
      const unit = key === 'debt' ? '%' : ['gdp', 'treasury'].includes(key) ? ' พันล้าน $' : '/100';
      row(label, `${formatNumber(r.after[key])}${unit} (${delta > 0 ? '+' : ''}${formatNumber(delta)})`, delta === 0 ? '' : (key === 'debt' ? delta < 0 : delta > 0) ? 'good' : 'bad');
    }
    paragraph(`รายได้ ${money(r.fiscal.revenue)} · รายจ่าย ${money(r.fiscal.spending)} · ดอกเบี้ย ${money(r.fiscal.interest)} · กู้เพิ่ม ${money(r.fiscal.borrowed)}`);
  }
  function gameOver() {
    const state = getState(), economy = state.economy, stats = state.countries[state.playerCountryId];
    open('over', 'สิ้นสุดการบริหารประเทศ • Game Over');
    paragraph(economy.gameOver === 'bankruptcy' ? `ประเทศล้มละลาย: หนี้เกิน ${balance.bankruptcyDebt}% ของ GDP` : 'รัฐบาลล่มสลาย: เสถียรภาพเหลือ 0', 'bad');
    paragraph(`${catalog.byId.get(state.playerCountryId).nameTh} • บริหาร ${economy.turns} ไตรมาส • ${monthName(state.date)}`);
    row('GDP', money(stats.gdp)); row('หนี้ / GDP', `${formatNumber(stats.debt)}%`);
    row('ความสุข', `${formatNumber(stats.happiness)}/100`); row('เสถียรภาพ', `${formatNumber(stats.stability)}/100`);
    row('อันดับโลก', `${worldRanking(state, catalog).findIndex(row => row.id === state.playerCountryId) + 1}`);
    paragraph('กลับเมนูแล้วเริ่มเกมใหม่เพื่อเลือกเส้นทางใหม่');
  }
  function refresh() {
    const state = getState(), economy = ensureEconomy(state, balance);
    economy.gameOver ||= defeatReason(state.countries[state.playerCountryId], balance);
    end.disabled = Boolean(economy.gameOver) || busy;
    if (economy.gameOver) gameOver();
  }
  close.addEventListener('click', () => { dialog.close(); if (screen === 'over') onMenu(); });
  dialog.addEventListener('cancel', event => { if (screen === 'over') { event.preventDefault(); dialog.close(); onMenu(); } });
  document.querySelector('#open-policy').addEventListener('click', policies);
  document.querySelector('#open-ranking').addEventListener('click', ranking);
  end.addEventListener('click', () => {
    if (busy || dialog.open || getState().economy.gameOver) return;
    busy = true; end.disabled = true;
    try { advanceQuarter(getState(), catalog, balance); onChange(); onRefresh(); if (getState().economy.gameOver) gameOver(); else report(); }
    finally { busy = false; end.disabled = Boolean(getState().economy.gameOver); }
  });
  return { refresh };
}
