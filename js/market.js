import { RESOURCE_IDS } from './data/resource-ids.js';
import { marketEffectMultiplier, marketDay } from './market-effects.js';
const index = state => state.date.year*12+state.date.month-1;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function ensureMarket(state,balance) {
  if(!state.market) {
    state.market={lastMonth:index(state),prices:Object.fromEntries(RESOURCE_IDS.map(id=>[id,1])),history:{},exports:{},lastExports:null};
    for(const id of RESOURCE_IDS)state.market.history[id]=[{month:index(state),priceMillions:marketPriceMillions(state,id,balance)}];
  }
  for(const id of RESOURCE_IDS)state.market.exports[id]??={enabled:false,share:0};
  return state.market;
}
export function marketPriceMillions(state,id,balance) {
  const base=balance.resources.salePricesMillions[id],rule=balance.market;
  const ratio=(state.market?.prices[id]??1)*marketEffectMultiplier(state,id);
  return base*clamp(ratio,rule?.minMultiplier??.5,rule?.maxMultiplier??2);
}
export function marketHistory(state,id,balance) {
  const market=ensureMarket(state,balance),history=market.history[id].map(point=>({...point}));
  if(history.length)history[history.length-1].priceMillions=marketPriceMillions(state,id,balance);
  return history;
}
export function setExportSetting(state,id,setting,balance) {
  if(!RESOURCE_IDS.includes(id)||typeof setting.enabled!=='boolean'||![0,.25,.5,1].includes(setting.share))return false;
  ensureMarket(state,balance).exports[id]={enabled:setting.enabled,share:setting.share};return true;
}
export function exportCapacity(state,catalog,balance) {
  const rail=catalog.militaryRules?.landlocked.includes(state.playerCountryId);
  return rail?{units:balance.market.railCapacity,mode:'rail'}
    :{units:(state.countries[state.playerCountryId].units?.cargoShips??0)*balance.market.cargoUnitsPerShip,mode:'sea'};
}
export function advanceMarketMonth(state,balance,random=Math.random) {
  const market=ensureMarket(state,balance),target=index(state)+1,rule=balance.market;
  while(market.lastMonth<target) {
    market.lastMonth++;
    const quoteState={...state,date:{year:Math.floor(market.lastMonth/12),month:market.lastMonth%12+1,day:1}};
    for(const id of RESOURCE_IDS) {
      const roll=clamp(random(),0,1)*2-1;
      market.prices[id]=clamp(market.prices[id]*(1+roll*rule.monthlyVolatility),rule.minMultiplier,rule.maxMultiplier);
      market.history[id].push({month:market.lastMonth,priceMillions:marketPriceMillions(quoteState,id,balance)});
      market.history[id]=market.history[id].slice(-rule.historyMonths);
    }
    if(state.marketEffects)state.marketEffects=state.marketEffects.filter(e=>e.endDay>marketDay(quoteState));
  }
  return market;
}
export function validMarket(value) {
  if(value===undefined)return true;
  return Boolean(value && Number.isSafeInteger(value.lastMonth) && value.prices && value.history && value.exports
    && RESOURCE_IDS.every(id=>Number.isFinite(value.prices[id])&&value.prices[id]>=.5&&value.prices[id]<=2
      && Array.isArray(value.history[id])&&value.history[id].length>0&&value.history[id].length<=12
      && value.history[id].every(p=>Number.isSafeInteger(p.month)&&Number.isFinite(p.priceMillions)&&p.priceMillions>=0)
      && typeof value.exports[id]?.enabled==='boolean'&&[0,.25,.5,1].includes(value.exports[id]?.share))
    && (value.lastExports==null || validExportSummary(value.lastExports)));
}
function validExportSummary(summary) {
  if(!Number.isSafeInteger(summary.month)||!Number.isSafeInteger(summary.units)||summary.units<0
    ||!Number.isSafeInteger(summary.capacity)||summary.capacity<summary.units||!['sea','rail'].includes(summary.mode)
    ||!Number.isFinite(summary.income)||summary.income<0||!Array.isArray(summary.items))return false;
  const ids=new Set();let units=0,income=0;
  for(const item of summary.items){
    if(!RESOURCE_IDS.includes(item.resourceId)||ids.has(item.resourceId)||!Number.isSafeInteger(item.units)||item.units<=0
      ||!Number.isFinite(item.value)||item.value<0)return false;
    ids.add(item.resourceId);units+=item.units;income+=item.value;
  }
  return units===summary.units&&Math.abs(income-summary.income)<=1e-9*Math.max(1,income);
}
