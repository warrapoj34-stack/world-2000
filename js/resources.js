export const RESOURCE_IDS = ['oil','gas','coal','iron','rare_earths','gold','forest','freshwater','food','fish','biodiversity','copper'];
export const RESOURCE_COLORS = ['#dce9ec','#c3dfc5','#9cc99c','#70ae75','#44894f','#216138'];
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
export function validResourceStock(stock) {
  return stock === undefined || Boolean(stock && RESOURCE_IDS.every(id => Number.isFinite(stock[id]) && stock[id] >= 0));
}
export function ensureResources(state) {
  for (const stats of Object.values(state.countries)) {
    if (!stats.resourceStock) stats.resourceStock = Object.fromEntries(RESOURCE_IDS.map(id=>[id,0]));
  }
}
export function resourceProduction(stats, levels, balance) {
  const b = balance.resources;
  const scale = stats.gdp <= 0 || stats.population <= 0 ? 0 : clamp(Math.sqrt(stats.population / b.populationDivisor),b.minScale,b.maxScale);
  return Object.fromEntries(RESOURCE_IDS.map(id => [id, levels[id] * b.unitsPerStar * scale * (b.baseEfficiency + stats.tech / 100)]));
}
export function resourceEffects(stats, levels, definitions, balance, random = Math.random) {
  const b = balance.resources, production = resourceProduction(stats,levels,balance);
  const drought = random() < b.droughtChance;
  const protection = clamp(levels.freshwater * b.waterProtectionPerStar,0,1);
  const damage = drought ? 1 - protection : 0;
  production.food *= 1 - damage * b.droughtFoodLoss;
  const gross = definitions.reduce((sum,r)=>sum+production[r.id]*r.basePrice*(b.exportShares[r.id] ?? 0),0);
  const revenue = Math.min(gross,stats.gdp*b.maxExportGDPShare);
  const sold = Object.fromEntries(RESOURCE_IDS.map(id=>[id,production[id]*(b.exportShares[id]??0)*(gross>0?revenue/gross:0)]));
  const stock = Object.fromEntries(RESOURCE_IDS.map(id=>[id,Math.min(b.maxStock,(stats.resourceStock?.[id]??0)+production[id]-sold[id])]));
  return {production,stock,revenue,drought,protection,
    energyGrowth:(levels.oil+levels.gas+levels.coal)*b.energyGrowthPerStar,
    droughtGrowthLoss:damage*b.droughtGrowthLoss,
    happiness:(levels.food*(1-damage*b.droughtFoodLoss)+levels.fish*b.fishFoodWeight)*b.foodHappinessPerStar-damage*b.droughtHappinessLoss,
    tech:levels.rare_earths*b.techPerStar,
    reputation:levels.biodiversity*b.reputationPerStar};
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
