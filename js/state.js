import { STAT_KEYS, validStats } from './data/countries.js';
import { validPolicy } from './economy.js';

export function chooseCountry(catalog, previousId, random = Math.random) {
  const pool = catalog.playable.filter(country => country.id !== previousId);
  const roll = Math.max(0, Math.min(0.999999999, random()));
  return pool[Math.floor(roll * pool.length)].id;
}

export function createDraft(catalog) {
  return { candidateId: chooseCountry(catalog), rerollsRemaining: 3, manual: false };
}

export function rerollDraft(draft, catalog, random = Math.random) {
  if (!validDraft(draft, catalog) || draft.rerollsRemaining === 0) return draft;
  return { candidateId: chooseCountry(catalog, draft.candidateId, random),
    rerollsRemaining: draft.rerollsRemaining - 1, manual: false };
}

export function validDraft(draft, catalog) {
  return Boolean(draft && catalog.byId.get(draft.candidateId)?.playable
    && Number.isInteger(draft.rerollsRemaining) && draft.rerollsRemaining >= 0 && draft.rerollsRemaining <= 3
    && typeof draft.manual === 'boolean');
}

export function createGame(countryId, catalog) {
  if (!catalog.byId.get(countryId)?.playable) throw new Error('ประเทศนี้ไม่อยู่ในชุดผู้เล่น');
  const countries = Object.fromEntries(catalog.countries.map(country => [country.id, {
    ...Object.fromEntries(STAT_KEYS.map(key => [key, country[key]])), resources: { ...country.resources },
  }]));
  return { playerCountryId: countryId, date: { year: 2000, month: 1 }, countries,
    selectedCountryId: countryId, view: null };
}

export function validGame(state, catalog) {
  return Boolean(state && catalog.byId.get(state.playerCountryId)?.playable
    && validEconomy(state.economy)
    && Number.isInteger(state.date?.year) && state.date.year >= 2000 && state.date.year <= 9999
    && Number.isInteger(state.date.month) && state.date.month >= 1 && state.date.month <= 12
    && (state.selectedCountryId === null || catalog.byId.has(state.selectedCountryId))
    && state.countries && catalog.countries.every(country => validStats(state.countries[country.id]))
    && (state.view === null || (Number.isFinite(state.view?.zoom) && state.view.zoom >= 1 && state.view.zoom <= 12
      && Array.isArray(state.view.center) && state.view.center.length === 2
      && state.view.center.every(Number.isFinite)
      && state.view.center[0] >= 0 && state.view.center[0] <= 1800
      && state.view.center[1] >= 0 && state.view.center[1] <= 900)));
}

function validEconomy(economy) {
  if (economy === undefined) return true;
  if (!economy || !validPolicy(economy.policy) || economy.policy.tax > 100
    || !Number.isInteger(economy.turns) || economy.turns < 0
    || ![null, 'bankruptcy', 'collapse'].includes(economy.gameOver)) return false;
  const r = economy.lastReport;
  return r === null || Boolean(r && validStats(r.before) && validStats(r.after)
    && Number.isInteger(r.period?.year) && Number.isInteger(r.period?.month) && r.period.month >= 1 && r.period.month <= 12
    && ['revenue', 'spending', 'interest', 'net', 'borrowed'].every(key => Number.isFinite(r.fiscal?.[key])));
}
