import { countryResourceProduction, ensureResources, sellResource, resourceSalePrice } from '../resources.js';
import { formatNumber, formatMoney } from './stats.js';
export function createResourceScreen({ catalog, balance, getState, onChange, onRefresh }) {
  const dialog = document.querySelector('#resource-dialog'), body = document.querySelector('#resource-content');
  const title = document.querySelector('#resource-title'), defs = catalog.resourceDefinitions;
  function open(id) {
    const state = getState(); ensureResources(state);
    const stats = state.countries[state.playerCountryId], levels = catalog.resourceLevels.get(state.playerCountryId);
    const production = countryResourceProduction(state,catalog,balance), resource = defs.find(r => r.id === id);
    title.textContent = resource ? `${resource.icon} ${resource.nameTh}` : 'คลังทรัพยากรของประเทศ';
    body.replaceChildren();
    const intro = document.createElement('p'); intro.textContent = resource ? resource.descriptionTh : 'ผลผลิตเข้าคลังทุกเดือน ขายครั้งละ 10 หน่วยเพื่อรับเงินทันที'; body.append(intro);
    const feedback = document.createElement('p'); feedback.id = 'resource-feedback'; feedback.setAttribute('role', 'status'); body.append(feedback);
    const grid = document.createElement('div'); grid.className = 'resource-grid'; body.append(grid);
    for (const r of resource ? [resource] : defs) {
      const card = document.createElement('article'); card.className = 'resource-card'; card.dataset.resource = r.id;
      const name = document.createElement('button'); name.type = 'button'; name.className = 'resource-open map-button'; name.textContent = `${r.icon} ${r.nameTh}`; name.onclick = () => open(r.id);
      const stars = document.createElement('span'); stars.className = 'resource-stars'; stars.textContent = '★'.repeat(levels[r.id]) + '☆'.repeat(5-levels[r.id]); stars.setAttribute('aria-label', `${levels[r.id]} จาก 5 ดาว`);
      const stock = document.createElement('strong'); stock.className = 'stock-count'; stock.textContent = `ในคลัง ${formatNumber(stats.resourceStock[r.id])} หน่วย`;
      const output = document.createElement('span'); output.className = 'monthly-production'; output.textContent = `+${formatNumber(production[r.id])} หน่วย / เดือน`;
      const price = document.createElement('span'); price.textContent = `ขาย ${balance.resources.saleBatchSize} หน่วย ได้ประมาณ ${formatMoney(resourceSalePrice(state,r.id,balance,catalog) * balance.resources.saleBatchSize / 1000)}`;
      const sell = document.createElement('button'); sell.type = 'button'; sell.className = 'map-button sell-resource'; sell.dataset.resource = r.id; sell.textContent = `ขาย ${balance.resources.saleBatchSize} หน่วย`;
      sell.disabled = stats.resourceStock[r.id] < balance.resources.saleBatchSize || Boolean(state.economy?.gameOver || state.victory?.finished);
      sell.onclick = () => {
        const income = sellResource(state, r.id, balance, catalog); if (income === null) return;
        onChange(); onRefresh(); open(id);
        document.querySelector('#resource-feedback').textContent = `ขาย${r.nameTh}แล้ว +${formatMoney(income)}`;
      };
      card.append(name, stars, stock, output, price, sell); grid.append(card);
    }
    if (resource) {
      const back = document.createElement('button'); back.type = 'button'; back.id = 'all-resources'; back.className = 'map-button'; back.textContent = 'ดูทั้งหมด'; back.onclick = () => open(); body.append(back);
    }
    if (!dialog.open) dialog.showModal();
  }
  document.querySelector('#close-resources').addEventListener('click', () => dialog.close());
  return { open };
}
