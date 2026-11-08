export const UNIT_KEYS = ['tanks', 'ships', 'aircraft'];
export function validUnits(units) {
  return Boolean(units && UNIT_KEYS.every(key => Number.isSafeInteger(units[key]) && units[key] >= 0)
    && ['warheads','cargoShips'].every(key=>units[key]===undefined || Number.isSafeInteger(units[key]) && units[key]>=0));
}
export function attachMilitary(catalog, rows, rules) {
  if (!rows || Object.values(rows).some(row=>!validUnits(row)) || catalog.newGameCountries.some(c => !validUnits(rows[c.id]))
    || UNIT_KEYS.some(key => !Number.isFinite(rules.weights[key]) || rules.weights[key] <= 0)
    || !Array.isArray(rules.landlocked)) throw new Error('ข้อมูลกองทัพไม่ถูกต้อง');
  catalog.militaryRules = rules;
  catalog.militaryInitial = new Map(catalog.countries.map(country => {
    const size = Math.sqrt(country.gdp) * Math.pow(country.population, .25) * country.military / 100;
    const estimate = country.playable ? { tanks: Math.round(size * 8), ships: Math.round(size / 20), aircraft: Math.round(size * 2) }
      : { tanks: 0, ships: 0, aircraft: 0 };
    const units = { ...(rows[country.id] ?? estimate) };
    if (rules.landlocked.includes(country.id)) units.ships = 0;
    return [country.id, units];
  }));
}
export async function loadMilitary(catalog) {
  const data = await Promise.all(['military2000', 'military_rules'].map(async file => {
    const response = await fetch(new URL(`../../data/${file}.json`, import.meta.url));
    if (!response.ok) throw new Error('โหลดข้อมูลกองทัพไม่สำเร็จ');
    return response.json();
  }));
  attachMilitary(catalog, ...data);
}
export function ensureMilitary(state, catalog) {
  for (const [id, stats] of Object.entries(state.countries)) {
    if (stats.units === undefined) stats.units = { ...catalog.militaryInitial.get(id) };
  }
}
export function militaryValue(units, weights) {
  return UNIT_KEYS.reduce((sum, key) => sum + (units?.[key] ?? 0) * weights[key], 0);
}
export function militaryScore(state, catalog, id = state.playerCountryId) {
  const weights = catalog.militaryRules.weights;
  const largest = Math.max(0, ...catalog.playable.map(c => militaryValue(state.countries[c.id].units, weights)));
  return largest ? Math.round(militaryValue(state.countries[id].units, weights) / largest * 100) : 0;
}
export function militaryRank(state, catalog, key, id = state.playerCountryId) {
  const count = state.countries[id].units[key];
  return 1 + catalog.playable.filter(c => state.countries[c.id].units[key] > count).length;
}
