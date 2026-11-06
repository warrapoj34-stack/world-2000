import { GOVERNMENTS } from '../data/countries.js';

const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const smallNumber = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 3 });
export const formatNumber = value => (value !== 0 && Math.abs(value) < 1 ? smallNumber : number).format(value);
export const shortMoney = value => value >= 1000 ? `${formatNumber(value / 1000)} ล้านล้าน` : value >= 1 ? `${formatNumber(value)} พันล้าน` : `${formatNumber(value * 1000)} ล้าน`;
export const formatPopulation = value => value > 0 && value < 0.01
  ? `${formatNumber(Math.round(value * 1000000))} คน` : `${formatNumber(value)} ล้านคน`;
export const governmentName = country => country.governmentLabelTh ?? GOVERNMENTS[country.government];
export const monthName = date => `${['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][date.month - 1]} ${date.year}`;

export function renderStats(container, stats, compact = false) {
  const rows = [
    ['เงินที่มี', `${formatNumber(stats.treasury)} พันล้าน $`], ['ขนาดเศรษฐกิจ', `${formatNumber(stats.gdp)} พันล้าน $`],
    ['ประชากร', formatPopulation(stats.population)], ['หนี้เทียบกับเศรษฐกิจ', `${formatNumber(stats.debt)}%`],
    ['ทหาร', `${formatNumber(stats.military)}/100`], ['ความมั่นคง', `${formatNumber(stats.stability)}/100`],
    ['ความสุข', `${formatNumber(stats.happiness)}/100`], ['เทคโนโลยี', `${formatNumber(stats.tech)}/100`],
    ['ชื่อเสียง', `${stats.reputation}/100`], ['น้ำมัน', `${stats.resources.oil}/100`],
    ['อาหาร', `${stats.resources.food}/100`], ['แร่ธาตุ', `${stats.resources.minerals}/100`],
  ];
  container.replaceChildren(...rows.map(([label, value]) => {
    const cell = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    cell.append(term, description);
    return cell;
  }));
  container.classList.toggle('compact-stats', compact);
}

export function renderHUD(state, catalog) {
  const country = catalog.byId.get(state.playerCountryId);
  const stats = state.countries[country.id];
  document.querySelector('#player-name').textContent = country.nameTh;
  document.querySelector('#game-date').textContent = monthName(state.date);
  for (const key of ['treasury', 'gdp', 'happiness', 'stability', 'military']) {
    const node = document.querySelector(`#hud-${key}`);
    node.textContent = key === 'treasury' || key === 'gdp' ? shortMoney(stats[key]) : `${Math.round(stats[key])}/100`;
  }
}
