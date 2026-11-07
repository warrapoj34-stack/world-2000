export const TRAIT_TYPES = ['salePrice','productionCost','taxIncome','resourceOutput'];
export const traitDay = state => Math.floor(Date.UTC(state.date.year,state.date.month-1,state.date.day??1)/86400000);
export function traitModifiers(state, catalog, id = state.playerCountryId) {
  const result = { taxIncome: 1, salePrice: {}, productionCost: {}, resourceOutput: {} };
  const data = catalog?.traits?.[id]; if (!data) return result;
  const effects = [...data.strength.effects,...data.weakness.effects];
  if ((state.traitState?.[id]?.activeUntil ?? 0) > traitDay(state)) effects.push(...data.special.effects);
  for (const effect of effects) {
    const multiplier = 1 + effect.percent / 100;
    if (effect.type === 'taxIncome') result.taxIncome *= multiplier;
    else result[effect.type][effect.target] = (result[effect.type][effect.target] ?? 1) * multiplier;
  }
  return result;
}
export function validTraitState(value, catalog) {
  return value === undefined || Boolean(value && !Array.isArray(value) && Object.entries(value).every(([id,s])=>catalog.byId.has(id)
    && Number.isSafeInteger(s?.activeUntil) && Number.isSafeInteger(s?.cooldownUntil) && s.cooldownUntil >= s.activeUntil));
}
export function activateTrait(state, catalog) {
  const id=state.playerCountryId,data=catalog.traits?.[id];
  if (!data || state.economy?.gameOver || state.victory?.finished || (state.traitState?.[id]?.cooldownUntil??0)>traitDay(state)) return false;
  state.traitState ??= {};
  const targetYear=state.date.year+data.special.cooldownYears;
  const anniversaryDay=Math.min(state.date.day??1,new Date(Date.UTC(targetYear,state.date.month,0)).getUTCDate());
  state.traitState[id]={ activeUntil:traitDay(state)+data.special.durationDays,
    cooldownUntil:Math.floor(Date.UTC(targetYear,state.date.month-1,anniversaryDay)/86400000) };
  return true;
}
export async function loadTraits(catalog) {
  const response=await fetch(new URL('../data/traits.json',import.meta.url));
  if(!response.ok)throw new Error('โหลดจุดเด่นประเทศไม่สำเร็จ');
  const data=await response.json();
  if(Object.keys(data).length!==60 || catalog.newGameCountries.some(c=>!data[c.id]))throw new Error('จุดเด่นประเทศไม่ครบ');
  for(const item of Object.values(data)) {
    for(const key of ['strength','weakness','special']) {
      const card=item[key];
      if(!card?.nameTh || !card.icon || !card.descriptionTh || !Array.isArray(card.effects) || !card.effects.length
        || card.effects.some(e=>!TRAIT_TYPES.includes(e.type) || !Number.isInteger(e.percent) || e.percent<=-100 || e.percent>100
          || (['salePrice','resourceOutput'].includes(e.type) && !catalog.resourceDefinitions.some(r=>r.id===e.target))
          || (e.type==='productionCost' && e.target!=='all' && !catalog.recipes.some(r=>r.id===e.target))))throw new Error('รูปแบบโบนัสไม่ถูกต้อง');
    }
    if(!Number.isInteger(item.special.durationDays) || item.special.durationDays<1 || item.special.cooldownYears!==2)throw new Error('ระยะเวลาความสามารถไม่ถูกต้อง');
  }
  catalog.traits=data;
}
