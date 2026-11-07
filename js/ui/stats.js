import { GOVERNMENTS } from '../data/countries.js';

const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
export const formatNumber = value => number.format(Math.round(value));
export const formatMoney = value => Math.abs(value) >= 1 ? formatNumber(value)+' พันล้าน' : formatNumber(value*1000)+' ล้าน';
export const shortMoney = formatMoney;
export const formatPopulation = value => value > 0 && value < 1
  ? `${formatNumber(Math.round(value * 1000000))} คน` : `${formatNumber(value)} ล้านคน`;
export const governmentName = country => country.governmentLabelTh ?? GOVERNMENTS[country.government];
export const monthName = date => `${['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][date.month - 1]} ${date.year}`;
export const fullDateName = date => `${Math.floor(date.day ?? 1)} ${monthName(date)}`;

export function renderStats(container, stats, compact = false) {
  const rows = [
    ['เงิน', formatMoney(stats.treasury)],
    ['ประชากร', formatPopulation(stats.population)], ['หนี้', `${formatNumber(stats.debt)}%`],
    ['ทหาร', `${formatNumber(stats.military)}/100`],
    ['ความสุข', `${formatNumber(stats.happiness)}/100`], ['เทคโนโลยี', `${formatNumber(stats.tech)}/100`],
    ['ชื่อเสียง', `${formatNumber(stats.reputation)}/100`],
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
  document.querySelector('#game-date').textContent = fullDateName(state.date);
  const net = state.economy?.lastReport?.fiscal.net ?? 0;
  const income = document.querySelector('#hud-net');
  income.textContent = (net >= 0 ? '+' : '−') + formatMoney(Math.abs(net)) + ' / เดือน';
  income.className = net >= 0 ? 'good' : 'bad';
  for (const key of ['treasury', 'happiness', 'military']) {
    const node = document.querySelector(`#hud-${key}`);
    node.textContent = key === 'treasury' || key === 'gdp' ? shortMoney(stats[key]) : `${Math.round(stats[key])}/100`;
  }
}
