import { addNews } from './events/news.js';
import { RESOURCE_IDS } from './data/resource-ids.js';
import { ensureMarket, marketPriceMillions, exportCapacity } from './market.js';
import { recordExport } from './map/trade-data.js';
export { RESOURCE_IDS } from './data/resource-ids.js';
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
export function resourceProduction(stats, levels, balance, modifiers = {}) {
  return Object.fromEntries(RESOURCE_IDS.map(id => [id, Math.round((levels[id] ?? 0) * balance.resources.unitsPerStarPerMonth * (modifiers.resourceOutput?.[id] ?? 1))]));
}
export function resourceEffects(stats, levels, definitions, balance, random = Math.random, months = 3, modifiers = {}) {
  const b = balance.resources, production = resourceProduction(stats,levels,balance,modifiers);
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
export function resourceSalePrice(state, id, balance, catalog) {
  return marketPriceMillions(state,id,balance) * (traitModifiers(state,catalog).salePrice[id] ?? 1);
}
function settleSale(state,id,units,balance,catalog,stats,quoteState=state) {
  const price=resourceSalePrice(quoteState,id,balance,catalog);
  if(!Number.isSafeInteger(units)||units<=0||!Number.isFinite(price)||price<0||stats.resourceStock[id]<units)return null;
  const income=units*price/1000;
  stats.resourceStock[id]-=units;stats.treasury+=income;
  recordExport(state,id,units,income);
  return income;
}
export function sellResource(state, id, balance, catalog) {
  if (!RESOURCE_IDS.includes(id) || state.economy?.gameOver || state.victory?.finished) return null;
  ensureResources(state);
  const stats = state.countries[state.playerCountryId], batch = balance.resources.saleBatchSize;
  return settleSale(state,id,batch,balance,catalog,stats);
}
export function processAutoExports(state,catalog,balance,production,stock) {
  const market=ensureMarket(state,balance),source=state.countries[state.playerCountryId];
  const stats={...source,resourceStock:{...stock}},capacity=exportCapacity(state,catalog,balance);
  if(market.lastExports?.month===market.lastMonth)return {stats,income:0};
  const wanted=Object.fromEntries(RESOURCE_IDS.map(id=>[id,market.exports[id].enabled?Math.min(stats.resourceStock[id],Math.floor((production[id]??0)*market.exports[id].share)):0]));
  const allocated=Object.fromEntries(RESOURCE_IDS.map(id=>[id,0]));let available=capacity.units,changed=true;
  // แบ่งพื้นที่ทีละหน่วยและสลับผู้เริ่มทุกเดือน
  while(available>0&&changed){changed=false;for(let i=0;i<RESOURCE_IDS.length&&available>0;i++){
    const id=RESOURCE_IDS[(i+market.lastMonth%RESOURCE_IDS.length)%RESOURCE_IDS.length];
    if(allocated[id]<wanted[id]){allocated[id]++;available--;changed=true;}
  }}
  const quoteState={...state,date:{year:Math.floor(market.lastMonth/12),month:market.lastMonth%12+1,day:1}},items=[];
  let income=0;
  for(const id of RESOURCE_IDS)if(allocated[id]){
    const value=settleSale(state,id,allocated[id],balance,catalog,stats,quoteState);
    if(value!==null){income+=value;items.push({resourceId:id,units:allocated[id],value});}
  }
  market.lastExports={month:market.lastMonth,units:capacity.units-available,income,capacity:capacity.units,mode:capacity.mode,items};
  if(income>0)addNews(state,{id:`export:${market.lastMonth}`,icon:'🚢',text:`ส่งออกสำเร็จ ${capacity.units-available} หน่วย ได้เงิน ${Math.round(income*1000)} ล้าน`});
  return {stats,income};
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
import { traitModifiers } from './traits.js';
