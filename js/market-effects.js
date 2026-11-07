import { RESOURCE_IDS } from './data/resource-ids.js';
export const marketDay = state => Math.floor(Date.UTC(state.date.year,state.date.month-1,state.date.day??1)/86400000);
export function validMarketEffects(effects) {
  return effects===undefined || Array.isArray(effects) && effects.every(e=>RESOURCE_IDS.includes(e.resourceId)
    && Number.isFinite(e.percent) && e.percent>-100 && e.percent<=100 && Number.isSafeInteger(e.endDay) && typeof e.sourceId==='string');
}
export function addMarketEffects(state,effects,sourceId,defaultDays=90) {
  const day=marketDay(state);state.marketEffects=(state.marketEffects??[]).filter(e=>e.endDay>day);
  for(const effect of effects??[]) {
    const days=effect.durationDays??defaultDays;
    if(!RESOURCE_IDS.includes(effect.resourceId)||!Number.isFinite(effect.percent)||effect.percent<=-100||effect.percent>100||!Number.isInteger(days)||days<1)continue;
    state.marketEffects=state.marketEffects.filter(e=>!(e.sourceId===sourceId&&e.resourceId===effect.resourceId));
    state.marketEffects.push({resourceId:effect.resourceId,percent:effect.percent,endDay:day+days,sourceId});
  }
}
export function marketEffectMultiplier(state,id) {
  return (state.marketEffects??[]).filter(e=>e.resourceId===id&&e.endDay>marketDay(state)).reduce((value,e)=>value*(1+e.percent/100),1);
}
