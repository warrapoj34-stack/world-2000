import { ensureMarket, marketPriceMillions, marketHistory, exportCapacity, setExportSetting } from '../market.js';
import { ensureResources, countryResourceProduction, resourceSalePrice } from '../resources.js';
import { formatMoney, formatNumber } from './stats.js';

const SVG = 'http://www.w3.org/2000/svg';
const shares = [[0, 'ไม่ขาย'], [.25, '25%'], [.5, '50%'], [1, 'ทั้งหมด']];
const transportNames = { sea: 'เรือสินค้า', cargo: 'เรือสินค้า', rail: 'รถไฟผ่านแดน', air: 'เครื่องบินขนส่ง', land: 'ขนส่งผ่านแดน' };

function sparkline(history, name, trend) {
  const graph = document.createElementNS(SVG, 'svg');
  graph.classList.add('market-sparkline');
  graph.setAttribute('viewBox', '0 0 180 54');
  graph.setAttribute('role', 'img');
  graph.setAttribute('aria-label', `ราคาตลาด${name}ย้อนหลัง ${history.length} เดือน`);
  const title = document.createElementNS(SVG, 'title');
  title.textContent = history.length ? history.map(sample => {
    const year = Math.floor(sample.month / 12), month = sample.month % 12 + 1;
    return `${month}/${year}: ${formatMoney(sample.priceMillions / 1000)}`;
  }).join(' • ') : 'ยังไม่มีประวัติราคา';
  graph.append(title);
  const guide = document.createElementNS(SVG, 'line');
  guide.setAttribute('x1', '6'); guide.setAttribute('x2', '174');
  guide.setAttribute('y1', '44'); guide.setAttribute('y2', '44');
  guide.classList.add('market-graph-guide'); graph.append(guide);
  if (!history.length) return graph;
  const values = history.map(sample => sample.priceMillions);
  const low = Math.min(...values), high = Math.max(...values);
  const span = Math.max(high - low, Math.max(high, 1) * .05);
  const points = values.map((value, i) => [values.length > 1 ? 6 + i * 168 / (values.length - 1) : 90, 44 - (value - low + (span - (high - low)) / 2) / span * 34]);
  const line = document.createElementNS(SVG, 'polyline');
  line.setAttribute('points', points.map(point => point.join(',')).join(' '));
  line.classList.add('market-graph-line', trend);
  graph.append(line);
  const dot = document.createElementNS(SVG, 'circle');
  dot.setAttribute('cx', points.at(-1)[0]); dot.setAttribute('cy', points.at(-1)[1]); dot.setAttribute('r', '3');
  dot.classList.add('market-graph-dot', trend); graph.append(dot);
  return graph;
}

export function createMarketScreen({ catalog, balance, getState, onChange, onRefresh }) {
  const dialog = document.querySelector('#market-dialog');
  const title = document.querySelector('#market-title');
  const content = document.querySelector('#market-content');
  document.querySelector('#close-market').addEventListener('click', () => dialog.close());

  function open() {
    const state = getState(); if (!state) return;
    ensureResources(state);
    const market = ensureMarket(state, balance), stats = state.countries[state.playerCountryId];
    const production = countryResourceProduction(state,catalog,balance);
    const capacity = exportCapacity(state, catalog, balance);
    const ended = Boolean(state.economy?.gameOver || state.victory?.finished);
    title.textContent = 'ตลาดโลกและการส่งออก';
    content.replaceChildren();
    const summary = document.createElement('section'); summary.className = 'market-summary';
    const capacityLine = document.createElement('strong'); capacityLine.id = 'market-capacity';
    capacityLine.textContent = `${transportNames[capacity.mode] ?? 'การขนส่ง'} • ส่งออกได้ ${formatNumber(capacity.units)} หน่วย / เดือน`;
    const explanation = document.createElement('p');
    explanation.textContent = 'ขายเฉพาะสัดส่วนของผลผลิตใหม่แต่ละเดือน แบ่งกำลังส่งออกทีละหน่วยระหว่างสินค้าที่เปิดไว้ ส่วนเกินยังเก็บในคลัง';
    summary.append(capacityLine, explanation);
    if (capacity.units === 0) {
      const none = document.createElement('p'); none.className = 'market-no-capacity';
      none.textContent = capacity.mode === 'sea' ? 'ยังไม่มีเรือสินค้า • ผลิตเรือสินค้าที่หน้ากองทัพ ผลผลิตที่ส่งไม่ได้จะเก็บในคลัง' : 'กำลังขนส่งผ่านแดนยังไม่พอ ผลผลิตที่ส่งไม่ได้จะเก็บในคลัง'; summary.append(none);
    }
    if (market.lastExports) {
      const last = document.createElement('p'); last.id = 'market-last-exports';
      last.textContent = `เดือนล่าสุด ส่งออก ${formatNumber(market.lastExports.units ?? 0)} หน่วย • ได้เงิน ${formatMoney(market.lastExports.income ?? 0)}`;
      summary.append(last);
    }
    const help = document.createElement('p'); help.className = 'market-price-note';
    help.textContent = 'ราคาแสดงต่อหน่วยและปัดเป็นจำนวนเต็ม • กราฟย้อนหลังสูงสุด 12 เดือนใช้ราคาตลาด • ราคาขายของเรารวมโบนัสประเทศแล้ว';
    content.append(summary, help);
    const grid = document.createElement('div'); grid.className = 'market-grid'; content.append(grid);
    for (const resource of catalog.resourceDefinitions) {
      const card = document.createElement('article'); card.className = 'market-card'; card.dataset.resource = resource.id;
      const heading = document.createElement('h3'); heading.textContent = `${resource.icon} ${resource.nameTh}`;
      const price = marketPriceMillions(state, resource.id, balance);
      const history = marketHistory(state, resource.id, balance).filter(sample => Number.isFinite(sample.priceMillions)).slice(-12);
      const previous = history.at(-2)?.priceMillions ?? history.at(-1)?.priceMillions ?? price;
      const trend = price > previous ? 'up' : price < previous ? 'down' : 'flat';
      const quote = document.createElement('p'); quote.className = `market-current-price ${trend}`;
      const amount = document.createElement('strong'); amount.textContent = `ตลาด ${formatMoney(price / 1000)}`;
      const arrow = document.createElement('span'); arrow.className = 'market-direction';
      arrow.textContent = trend === 'up' ? '▲ ขึ้น' : trend === 'down' ? '▼ ลง' : '→ เท่าเดิม';
      quote.append(amount, arrow);
      const ownPrice = document.createElement('p'); ownPrice.className = 'market-own-price';
      ownPrice.textContent = `ราคาขายของเรา ${formatMoney(resourceSalePrice(state, resource.id, balance, catalog) / 1000)} / หน่วย`;
      const inventory = document.createElement('p'); inventory.className = 'market-inventory';
      inventory.textContent = `คลัง ${formatNumber(stats.resourceStock[resource.id])} • ผลผลิต +${formatNumber(production[resource.id])} / เดือน`;
      const controls = document.createElement('div'); controls.className = 'market-export-controls';
      const setting = market.exports[resource.id];
      const label = document.createElement('label'); label.className = 'market-export-toggle';
      const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.className = 'market-export-enabled';
      toggle.dataset.resource = resource.id; toggle.setAttribute('role', 'switch');
      toggle.setAttribute('aria-label', `ส่งออก${resource.nameTh}`); toggle.checked = Boolean(setting.enabled); toggle.disabled = ended;
      label.append(toggle, document.createTextNode('ส่งออก'));
      const select = document.createElement('select'); select.className = 'market-export-share'; select.dataset.resource = resource.id;
      select.setAttribute('aria-label', `สัดส่วนส่งออก${resource.nameTh}`); select.disabled = ended;
      select.append(...shares.map(([value, text]) => new Option(text, String(value)))); select.value = String(setting.share);
      function update(enabled, share) {
        setExportSetting(state, resource.id, { enabled, share }, balance);
        const current = ensureMarket(state, balance).exports[resource.id];
        toggle.checked = current.enabled; select.value = String(current.share);
        onChange(); onRefresh();
      }
      toggle.addEventListener('change', () => update(toggle.checked, toggle.checked ? (Number(select.value) || .25) : Number(select.value)));
      select.addEventListener('change', () => update(Number(select.value) > 0, Number(select.value)));
      controls.append(label, select);
      card.append(heading, quote, ownPrice, sparkline(history, resource.nameTh, trend), inventory, controls); grid.append(card);
    }
    if (!dialog.open) dialog.showModal();
  }
  return { open };
}
