import { provinceMultiplier, provinceOutput, syncProvinceHappiness, updateProvinceConstruction } from './provinces.js';
import { traitModifiers } from './traits.js';
import { ensurePolicyCards, policyModifiers } from './policies.js';
import { resourceEffects, processAutoExports } from './resources.js';
import { advanceMarketMonth } from './market.js';
// สูตรเกมใช้ GDP รายปี หน่วยเงินเป็นพันล้านดอลลาร์
export const BUDGET_KEYS = ['military', 'education', 'health', 'infrastructure', 'welfare'];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const copyPolicy = policy => ({ tax: policy.tax, budget: { ...policy.budget } });
export function validPolicy(policy) {
  return Boolean(policy && Number.isInteger(policy.tax) && policy.tax >= 0 && policy.tax <= 100
    && BUDGET_KEYS.every(key => Number.isInteger(policy.budget?.[key]) && policy.budget[key] >= 0 && policy.budget[key] <= 100)
    && BUDGET_KEYS.reduce((sum, key) => sum + policy.budget[key], 0) === 100);
}
export function allocateBudget(policy, key, value) {
  const next = copyPolicy(policy);
  const others = BUDGET_KEYS.filter(item => item !== key);
  const remaining = 100 - clamp(Math.round(value), 0, 100);
  const total = others.reduce((sum, item) => sum + policy.budget[item], 0);
  next.budget[key] = 100 - remaining;
  let used = 0;
  others.forEach((item, index) => {
    const amount = index === others.length - 1 ? remaining - used
      : Math.floor(remaining * (total ? policy.budget[item] / total : 1 / others.length));
    next.budget[item] = amount;
    used += amount;
  });
  return next;
}
export function fiscalForecast(stats, government, policy, balance, months = 3) {
  const modifier = balance.governments[government];
  const revenue = stats.gdp * policy.tax / 100 * months / 12;
  const base = stats.gdp * balance.spendingRate * months / 12;
  const spending = base * (1 + policy.budget.military / 100 * (modifier.militaryCost - 1));
  const interest = stats.gdp * stats.debt / 100 * balance.interestRate * months / 12;
  return { revenue, spending, interest, net: revenue - spending - interest };
}
export function simulateCountry(stats, government, policy, balance, random = Math.random, resources = null, modifiers = {}, months = 3) {
  const b = balance, gov = b.governments[government], budget = policy.budget;
  const fiscal = fiscalForecast(stats, government, policy, b, months);
  fiscal.resourceIncome = resources?.revenue ?? 0;
  fiscal.revenue *= modifiers.revenue ?? 1;
  fiscal.policyCost = stats.gdp * (modifiers.costRate ?? 0) * months / 3;
  fiscal.net = fiscal.revenue + fiscal.resourceIncome - fiscal.spending - fiscal.interest - fiscal.policyCost;
  const borrowed = Math.max(0, -(stats.treasury + fiscal.net));
  const debtAmount = stats.gdp * stats.debt / 100 + borrowed;
  const g = b.growth;
  const annualGrowth = clamp(g.base + budget.infrastructure / 100 * g.infrastructure
    + budget.education / 100 * g.education + stats.tech * g.tech
    + (stats.stability - 50) * g.stability - policy.tax * g.tax + gov.growth
    + (clamp(random(), 0, 1) * 2 - 1) * g.random + (resources?.energyGrowth ?? 0) - (resources?.droughtGrowthLoss ?? 0), g.min, g.max);
  const gdp = stats.gdp * (1 + annualGrowth * (modifiers.growth ?? 1)) ** (months / 12);
  const happinessTarget = clamp(b.happiness.base - policy.tax * b.happiness.tax
    + budget.welfare * b.happiness.welfare + budget.health * b.happiness.health + gov.happiness, 0, 100);
  const happiness = clamp((stats.happiness + (happinessTarget - stats.happiness) * (1 - (1 - b.happiness.adjustment) ** (months / 3)) + (resources?.happiness ?? 0)) * (modifiers.happiness ?? 1) ** (months / 3), 0, 100);
  const debt = gdp > 0 ? debtAmount / gdp * 100 : 0;
  const stabilityChange = (happiness - 50) * b.stability.happiness
    - Math.max(0, debt - b.stability.debtThreshold) * b.stability.debtPenalty + gov.stability;
  const stability = clamp((stats.stability + stabilityChange * months / 3) * (modifiers.stability ?? 1) ** (months / 3), 0, 100);
  const next = { ...stats, gdp, debt, happiness, stability,
    treasury: Math.max(0, stats.treasury + fiscal.net),
    tech: clamp(stats.tech + (budget.education / 100 * b.tech.education - stats.tech * b.tech.decay) * months / 3 + (resources?.tech ?? 0), 0, 100),
    reputation: clamp(stats.reputation + (resources?.reputation ?? 0), 0, 100),
    military: clamp(stats.military + (budget.military / 100 * b.military.investment * (modifiers.military ?? 1) / gov.militaryCost - stats.military * b.military.decay) * months / 3, 0, 100) };
  if (resources) next.resourceStock = resources.stock;
  return { stats: next, fiscal: { ...fiscal, borrowed }, annualGrowth, resources };
}
export function ensureEconomy(state, balance) {
  if (!state.economy) state.economy = { policy: copyPolicy(balance.defaultPolicy), turns: 0, lastReport: null, gameOver: null };
  return state.economy;
}
export function defeatReason(stats, balance) {
  return stats.debt > balance.bankruptcyDebt ? 'bankruptcy' : stats.stability <= 0 ? 'collapse' : null;
}
export function advanceQuarter(state, catalog, balance, random = Math.random) {
  const economy = ensureEconomy(state, balance);
  if(catalog.policies)ensurePolicyCards(state,catalog.policies);
  if (economy.gameOver) return null;
  if (!validPolicy(economy.policy) || economy.policy.tax > balance.taxMax) throw new Error('นโยบายไม่ถูกต้อง');
  const before = state.countries[state.playerCountryId];
  const initialDefeat = defeatReason(before, balance);
  if (initialDefeat) { economy.gameOver = initialDefeat; return null; }
  let result;
  for (const country of catalog.countries) {
    if (state.countries[country.id].gdp <= 0) continue;
    const traits = traitModifiers(state,catalog,country.id);
    const countryModifiers = country.id===state.playerCountryId && catalog.policies ? policyModifiers(economy.cards,catalog.policies) : {};
    countryModifiers.revenue = (countryModifiers.revenue ?? 1) * traits.taxIncome;
    const effects = catalog.resourceLevels ? resourceEffects(state.countries[country.id],catalog.resourceLevels.get(country.id),catalog.resourceDefinitions,balance,random,3,traits) : null;
    const outcome = simulateCountry(state.countries[country.id], country.government,
      country.id === state.playerCountryId ? economy.policy : balance.defaultPolicy, balance, random, effects, countryModifiers);
    state.countries[country.id] = outcome.stats;
    if (country.id === state.playerCountryId) result = outcome;
  }
  const period = { ...state.date };
  state.date.month += 3;
  if (state.date.month > 12) { state.date.month -= 12; state.date.year++; }
  economy.turns++;
  economy.lastReport = { period, before: { ...before }, after: { ...result.stats }, fiscal: result.fiscal,
    resourceSummary: result.resources ? {income:result.resources.revenue,drought:result.resources.drought,protection:result.resources.protection} : null };
  economy.gameOver = defeatReason(result.stats, balance);
  return economy.lastReport;
}
export function advanceMonth(state, catalog, balance, random = Math.random) {
  const economy = ensureEconomy(state, balance);
  economy.months ??= economy.turns * 3;
  if (catalog.policies) ensurePolicyCards(state, catalog.policies);
  if (economy.gameOver) return null;
  const before = state.countries[state.playerCountryId];
  if (defeatReason(before, balance)) { economy.gameOver = defeatReason(before, balance); return null; }
  updateProvinceConstruction(state,catalog);
  advanceMarketMonth(state,balance,random);
  let result;
  let exportIncome=0;
  for (const country of catalog.countries) {
    if (state.countries[country.id].gdp <= 0) continue;
    const traits = traitModifiers(state,catalog,country.id);
    const countryModifiers = country.id===state.playerCountryId && catalog.policies ? policyModifiers(economy.cards,catalog.policies) : {};
    countryModifiers.revenue = (countryModifiers.revenue ?? 1) * traits.taxIncome;
    const effects = catalog.resourceLevels ? resourceEffects(state.countries[country.id], catalog.resourceLevels.get(country.id), catalog.resourceDefinitions, balance, random, 1, traits) : null;
    if(country.id===state.playerCountryId){
      countryModifiers.revenue*=provinceMultiplier(state,catalog);
      if(effects)for(const [id,amount]of Object.entries(provinceOutput(state,catalog))){
        const added=Math.round(amount*(traits.resourceOutput[id]??1));
        effects.production[id]+=added;effects.stock[id]=Math.min(balance.resources.maxStock,effects.stock[id]+added);
      }
    }
    let input=state.countries[country.id];
    if(country.id===state.playerCountryId&&effects){
      // รับเงินส่งออกก่อนคำนวณเงินกู้ โดยเก็บภาพก่อนเดือนเดิมไว้
      const exported=processAutoExports(state,catalog,balance,effects.production,effects.stock);
      input=exported.stats;effects.stock=input.resourceStock;exportIncome=exported.income;
    }
    const outcome = simulateCountry(input, country.government,
      country.id === state.playerCountryId ? economy.policy : balance.defaultPolicy, balance, random, effects,
      countryModifiers, 1);
    state.countries[country.id] = outcome.stats;
    if (country.id === state.playerCountryId) {
      const proposed=outcome.stats.happiness;syncProvinceHappiness(state,catalog,true);
      outcome.stats.stability=clamp(outcome.stats.stability+(outcome.stats.happiness-proposed)*balance.stability.happiness/3,0,100);
      // รวมยอดรายงานเท่านั้น เงินเข้าจากการขายแล้ว
      outcome.fiscal.net+=exportIncome;outcome.fiscal.resourceIncome=exportIncome;
      result = outcome;
    }
  }
  const period = { ...state.date };
  state.date.month++;
  if (state.date.month > 12) { state.date.month = 1; state.date.year++; }
  state.date.day = 1;
  economy.months++;
  economy.turns = Math.floor(economy.months / 3);
  economy.lastReport = { period, before: { ...before }, after: { ...result.stats }, fiscal: result.fiscal,
    resourceSummary: result.resources ? { income: exportIncome, drought: result.resources.drought, protection: result.resources.protection } : null };
  economy.gameOver = defeatReason(result.stats, balance);
  return economy.lastReport;
}
export function worldRanking(state, catalog) {
  return catalog.playable.map(country => ({ id: country.id, nameTh: country.nameTh, gdp: state.countries[country.id].gdp }))
    .sort((a, b) => b.gdp - a.gdp || a.id.localeCompare(b.id));
}
