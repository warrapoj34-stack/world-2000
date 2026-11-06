import { allocateBudget, advanceQuarter, ensureEconomy, fiscalForecast, worldRanking, BUDGET_KEYS, defeatReason } from '../economy.js';
import { formatNumber, shortMoney, monthName, governmentName } from './stats.js';

const labels = { military: 'ทหาร', education: 'การศึกษา', health: 'โรงพยาบาล', infrastructure: 'ถนนและสิ่งก่อสร้าง', welfare: 'ช่วยค่าครองชีพ' };
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
    paragraph(`งบรวม 100% เมื่อเลื่อนหมวดหนึ่ง หมวดอื่นปรับตามสัดส่วน • งบพื้นฐาน ${balance.spendingRate * 100}% ของ ขนาดเศรษฐกิจ ต่อปี ทหารมีต้นทุนตามระบอบ`);
    paragraph('ภาษีต่ำช่วยความสุขแต่เงินเข้าน้อย • การศึกษาและถนนและสิ่งก่อสร้างช่วย ขนาดเศรษฐกิจ • โรงพยาบาลและช่วยค่าครองชีพช่วยความสุข • งบทหารรักษากำลังรบ');
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
        refresh(); onChange(); document.dispatchEvent(new Event('policy-change'));
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
      forecast.textContent = `ประมาณการ3 เดือนหน้า: รายได้ ${money(f.revenue)} · รายจ่าย ${money(f.spending)} · ดอกเบี้ย ${money(f.interest)} · คงเหลือ ${money(f.net)} · ต้องกู้ ${money(Math.max(0, -state.countries[state.playerCountryId].treasury - f.net))}`;
      total.textContent = `งบรวม ${BUDGET_KEYS.reduce((sum, key) => sum + economy.policy.budget[key], 0)}%`;
    }
    refresh();
  }
  function ranking() {
    const state = getState(), rows = worldRanking(state, catalog);
    open('ranking', 'อันดับโลกตาม ขนาดเศรษฐกิจ');
    paragraph(`ประเทศของคุณอยู่อันดับ ${rows.findIndex(row => row.id === state.playerCountryId) + 1} จาก ${rows.length} ประเทศ • ${monthName(state.date)}`);
    paragraph('ขนาดเศรษฐกิจต่อปี หน่วยพันล้านดอลลาร์ • ไม่รวมดินแดนที่สุ่มเล่นไม่ได้');
    rows.forEach((country, index) => row(`${index + 1}. ${country.nameTh}${country.id === state.playerCountryId ? ' ★ คุณ' : ''}`, money(country.gdp), country.id === state.playerCountryId ? 'player-rank' : ''));
  }
  function report(detailed = false) {
    const r = getState().economy.lastReport;
    if (!r) return;
    open('report', `สรุป 3 เดือนที่ผ่านมา • ${monthName(r.period)}`);
    if (!detailed) {
      const summary = document.createElement('div'); summary.className = 'report-summary'; content.append(summary);
      const delta = r.after.treasury - r.before.treasury;
      const lines = [
        [delta > 0 ? 'good' : delta < 0 ? 'bad' : '', delta === 0 ? 'เงินที่มีเท่าเดิม' : `เงิน${delta > 0 ? 'เพิ่ม' : 'ลด'} ${shortMoney(Math.abs(delta))}ดอลลาร์`],
        ['', r.fiscal.net >= 0 ? 'ภาษีที่เก็บได้พอจ่ายค่าใช้จ่าย' : 'ค่าใช้จ่ายมากกว่าภาษีที่เก็บได้'],
        [r.fiscal.borrowed > 0 ? 'bad' : '', r.fiscal.borrowed > 0 ? 'เงินไม่พอ จึงต้องกู้เพิ่ม' : r.fiscal.interest > 0 ? 'จ่ายดอกเบี้ยแล้ว ไม่ต้องกู้เพิ่ม' : 'ไม่มีดอกเบี้ย และไม่ต้องกู้เพิ่ม'],
      ];
      for (const [style, value] of lines) { const p = document.createElement('p'); p.className = style; p.textContent = value; summary.append(p); }
      const more = document.createElement('button'); more.type = 'button'; more.className = 'map-button'; more.id = 'report-details'; more.textContent = 'ดูรายละเอียด'; more.addEventListener('click', () => report(true)); content.append(more);
      return;
    }
    paragraph(`เข้าสู่ ${monthName(getState().date)} • ผลจากนโยบายของคุณ`);
    for (const [key, label] of Object.entries({gdp: 'ขนาดเศรษฐกิจ', treasury: 'เงินที่มี', debt: 'หนี้ / ขนาดเศรษฐกิจ', happiness: 'ความสุข', stability: 'ความมั่นคง', military: 'ทหาร', tech: 'เทคโนโลยี'})) {
      const delta = r.after[key] - r.before[key];
      const unit = key === 'debt' ? '%' : ['gdp', 'treasury'].includes(key) ? ' พันล้าน $' : '/100';
      row(label, `${formatNumber(r.after[key])}${unit} (${delta > 0 ? '+' : ''}${formatNumber(delta)})`, delta === 0 ? '' : (key === 'debt' ? delta < 0 : delta > 0) ? 'good' : 'bad');
    }
    paragraph(`รายได้ ${money(r.fiscal.revenue)} · รายจ่าย ${money(r.fiscal.spending)} · ดอกเบี้ย ${money(r.fiscal.interest)} · กู้เพิ่ม ${money(r.fiscal.borrowed)}`);
  }
  function gameOver() {
    const state = getState(), economy = state.economy, stats = state.countries[state.playerCountryId];
    open('over', 'สิ้นสุดการบริหารประเทศ • จบเกม');
    paragraph(economy.gameOver === 'bankruptcy' ? `ประเทศล้มละลาย: หนี้เกิน ${balance.bankruptcyDebt}% ของ ขนาดเศรษฐกิจ` : 'รัฐบาลล่มสลาย: ความมั่นคงเหลือ 0', 'bad');
    paragraph(`${catalog.byId.get(state.playerCountryId).nameTh} • บริหาร ${economy.turns} รอบ • ${monthName(state.date)}`);
    row('ขนาดเศรษฐกิจ', money(stats.gdp)); row('หนี้ / ขนาดเศรษฐกิจ', `${formatNumber(stats.debt)}%`);
    row('ความสุข', `${formatNumber(stats.happiness)}/100`); row('ความมั่นคง', `${formatNumber(stats.stability)}/100`);
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
  end.addEventListener('click', () => {
    if (busy || dialog.open || getState().economy.gameOver) return;
    busy = true; end.disabled = true;
    try { advanceQuarter(getState(), catalog, balance); onChange(); onRefresh(); if (getState().economy.gameOver) gameOver(); else report(); }
    finally { busy = false; end.disabled = Boolean(getState().economy.gameOver); }
  });
  return { refresh, ranking };
}
