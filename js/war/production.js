import { addNews } from '../events/news.js';
export const OUTPUTS = ['tanks','ships','aircraft','warheads','cargoShips'];
export const gameDay = state => Math.floor(Date.UTC(state.date.year, state.date.month - 1, state.date.day ?? 1) / 86400000);
export function ensureProduction(state) {
  state.production ??= { nextId: 1, queue: [] };
  return state.production;
}
export function validProduction(value, catalog) {
  if (value === undefined) return true;
  return Boolean(value && Number.isSafeInteger(value.nextId) && value.nextId > 0 && Array.isArray(value.queue)
    && new Set(value.queue.map(job => job.id)).size === value.queue.length
    && value.queue.every(job => Number.isSafeInteger(job.id) && job.id > 0 && job.id < value.nextId
      && catalog.byId.has(job.countryId) && typeof job.nameTh === 'string' && typeof job.icon === 'string'
      && OUTPUTS.includes(job.unit) && Number.isSafeInteger(job.startDay) && Number.isSafeInteger(job.endDay) && job.endDay > job.startDay));
}
export async function loadRecipes(catalog) {
  const response = await fetch(new URL('../../data/recipes.json', import.meta.url));
  if (!response.ok) throw new Error('โหลดสูตรผลิตไม่สำเร็จ');
  const recipes = await response.json();
  if (!Array.isArray(recipes) || new Set(recipes.map(r=>r.id)).size !== recipes.length
    || recipes.some(r=>!r.id || !r.nameTh || !OUTPUTS.includes(r.unit) || !Number.isInteger(r.days) || r.days < 1
      || !Number.isInteger(r.moneyMillions) || r.moneyMillions < 0 || !r.resources || !r.conditions
      || Object.entries(r.resources).some(([id,amount])=>!catalog.resourceDefinitions.some(resource=>resource.id===id) || !Number.isInteger(amount) || amount < 1))) throw new Error('สูตรผลิตไม่ถูกต้อง');
  catalog.recipes = recipes;
}
export function productionMissing(state, catalog, recipe) {
  const cost=recipeCosts(state,catalog,recipe);
  const stats = state.countries[state.playerCountryId], missing = [];
  if (state.economy?.gameOver || state.victory?.finished) missing.push('เกมจบแล้ว');
  if (recipe.conditions.countries && !recipe.conditions.countries.includes(state.playerCountryId)) missing.push('ประเทศนี้ยังไม่ผ่านเงื่อนไขในสูตร');
  if (stats.tech < (recipe.conditions.minTech ?? 0)) missing.push(`ต้องมีเทคโนโลยี ${recipe.conditions.minTech}`);
  if (recipe.conditions.requiresCoast && catalog.militaryRules.landlocked.includes(state.playerCountryId)) missing.push('ต้องมีชายฝั่งทะเล');
  for (const [id, amount] of Object.entries(cost.resources)) {
    const shortage = amount - (stats.resourceStock?.[id] ?? 0);
    if (shortage > 0) missing.push(`ขาด${catalog.resourceDefinitions.find(r=>r.id===id).nameTh} ${shortage} หน่วย`);
  }
  if (stats.treasury * 1000 + 1e-8 < cost.moneyMillions) missing.push(`ขาดเงิน ${Math.ceil(cost.moneyMillions - stats.treasury*1000)} ล้าน`);
  return missing;
}
export function updateProduction(state) {
  if (!state.production) return 0;
  const day = gameDay(state), remaining = [];
  let completed = 0;
  for (const job of state.production.queue) {
    if (day >= job.endDay) {
      const units = state.countries[job.countryId].units;
      units[job.unit] = (units[job.unit] ?? 0) + 1; completed++;
      if(job.countryId===state.playerCountryId)addNews(state,{id:`production:${job.id}`,icon:job.icon,text:`ผลิต${job.nameTh}เสร็จแล้ว 1 หน่วย`});
    } else remaining.push(job);
  }
  state.production.queue = remaining;
  return completed;
}
export function enqueueProduction(state, catalog, recipeId) {
  const recipe = catalog.recipes.find(r=>r.id===recipeId);
  if (!recipe || productionMissing(state,catalog,recipe).length) return false;
  updateProduction(state);
  const production = ensureProduction(state), stats = state.countries[state.playerCountryId];
  const cost=recipeCosts(state,catalog,recipe);
  for (const [id, amount] of Object.entries(cost.resources)) stats.resourceStock[id] -= amount;
  stats.treasury = Math.max(0, stats.treasury - cost.moneyMillions / 1000);
  const startDay = Math.max(gameDay(state), ...production.queue.map(job=>job.endDay));
  production.queue.push({ id: production.nextId++, countryId: state.playerCountryId, nameTh: recipe.nameTh,
    icon: recipe.icon, unit: recipe.unit, startDay, endDay: startDay + recipe.days });
  return true;
}
export function productionProgress(state, job) {
  return Math.max(0, Math.min(100, Math.floor((gameDay(state)-job.startDay)/(job.endDay-job.startDay)*100)));
}
import { traitModifiers } from '../traits.js';
export function recipeCosts(state,catalog,recipe) {
  const modifiers=traitModifiers(state,catalog).productionCost;
  const multiplier=(modifiers.all??1)*(modifiers[recipe.id]??1);
  return { resources:Object.fromEntries(Object.entries(recipe.resources).map(([id,amount])=>[id,Math.ceil(amount*multiplier-1e-9)])), moneyMillions:Math.ceil(recipe.moneyMillions*multiplier-1e-9) };
}
