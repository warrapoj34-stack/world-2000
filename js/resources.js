export const RESOURCE_IDS = ['oil','gas','coal','iron','rare_earths','gold','forest','freshwater','food','fish','biodiversity','copper','uranium'];
export const RESOURCE_COLORS = ['#dce9ec','#c3dfc5','#9cc99c','#70ae75','#44894f','#216138'];
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
export function validResourceStock(stock) {
  return stock === undefined || Boolean(stock && RESOURCE_IDS.every(id => id === 'uranium' && stock[id] === undefined
    || Number.isFinite(stock[id]) && stock[id] >= 0 && (stock.uranium === undefined || Number.isSafeInteger(stock[id]))));
}
export function ensureResources(state) {
  for (const stats of Object.values(state.countries)) {
    stats.resourceStock = Object.fromEntries(RESOURCE_IDS.map(id => [id, Math.floor(stats.resourceStock?.[id] ?? 0)]));
  }
}
export function resourceProduction(stats, levels, balance) {
  return Object.fromEntries(RESOURCE_IDS.map(id => [id, Math.floor((levels[id] ?? 0) * balance.resources.unitsPerStarPerMonth)]));
}
export function resourceEffects(stats, levels, definitions, balance, random = Math.random, months = 3) {
  const b = balance.resources, production = resourceProduction(stats,levels,balance);
  for (const id of RESOURCE_IDS) production[id] *= months;
  const drought = random() < b.droughtChance * months / 3;
  const protection = clamp(levels.freshwater * b.waterProtectionPerStar,0,1);
  const damage = drought ? 1 - protection : 0;
  const revenue = 0;
  const stock = Object.fromEntries(RESOURCE_IDS.map(id=>[id,Math.min(b.maxStock,Math.floor(stats.resourceStock?.[id]??0)+production[id])]));
  return {production,stock,revenue,drought,protection,
    energyGrowth:(levels.oil+levels.gas+levels.coal)*b.energyGrowthPerStar,
    droughtGrowthLoss:damage*b.droughtGrowthLoss,
    happiness:((levels.food*(1-damage*b.droughtFoodLoss)+levels.fish*b.fishFoodWeight)*b.foodHappinessPerStar-damage*b.droughtHappinessLoss)*months/3,
    tech:levels.rare_earths*b.techPerStar*months/3,
    reputation:levels.biodiversity*b.reputationPerStar*months/3};
}
export function sellResource(state, id, balance) {
  if (!RESOURCE_IDS.includes(id) || state.economy?.gameOver || state.victory?.finished) return null;
  ensureResources(state);
  const stats = state.countries[state.playerCountryId], batch = balance.resources.saleBatchSize;
  const price = balance.resources.salePricesMillions[id];
  if (!Number.isSafeInteger(batch) || batch <= 0 || !Number.isSafeInteger(price) || price < 0 || stats.resourceStock[id] < batch) return null;
  const income = batch * price / 1000;
  stats.resourceStock[id] -= batch; stats.treasury += income;
  return income;
}
export function topResources(levels, definitions) {
  return [...definitions].sort((a,b)=>levels[b.id]-levels[a.id]||RESOURCE_IDS.indexOf(a.id)-RESOURCE_IDS.indexOf(b.id)).filter(r=>levels[r.id]>0).slice(0,3);
}
export function mapResourceLevel(levels, mode) {
  if (mode === 'minerals') return Math.max(...['iron','copper','gold','rare_earths'].map(id=>levels[id]));
  return levels[mode] ?? 0;
}
export function reinforceArmy(state, balance) {
  const stats=state.countries[state.playerCountryId], b=balance.resources.reinforcement;
  if(state.economy?.gameOver || stats.stability<=0 || stats.debt>balance.bankruptcyDebt || stats.military>=100
    || (stats.resourceStock?.iron??0)<b.iron || stats.treasury<b.money) return false;
  stats.resourceStock.iron-=b.iron; stats.treasury-=b.money;
  stats.military=Math.min(100,stats.military+b.military);
  return true;
}
