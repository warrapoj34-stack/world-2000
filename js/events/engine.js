const clamp = (value, max = 100) => Math.max(0, Math.min(max, value));

export function ensureEvents(state) {
  if (!state.events) state.events = { pending: null, ready: null, history: [] };
  return state.events;
}

export function eligibleEvents(state, catalog) {
  const events = ensureEvents(state);
  const stats = state.countries[state.playerCountryId];
  const levels = catalog.resourceLevels.get(state.playerCountryId);
  const months = state.economy.months ?? state.economy.turns * 3;
  return catalog.events.filter(event => {
    const rule = event.when;
    if (events.history.some(item => item.id === event.id && months - (item.monthIndex ?? item.turn * 3) < 36)) return false;
    return (!rule.resource || levels[rule.resource] >= rule.minLevel)
      && (rule.happinessBelow == null || stats.happiness < rule.happinessBelow)
      && (rule.treasuryBelow == null || stats.treasury < stats.gdp * rule.treasuryBelow)
      && (rule.stabilityBelow == null || stats.stability < rule.stabilityBelow);
  });
}

export function drawEvent(state, catalog, random = Math.random) {
  const events = ensureEvents(state);
  if (events.pending || events.ready || random() >= .4) return null;
  const pool = eligibleEvents(state, catalog);
  if (!pool.length) return null;
  const selected = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  events.pending = selected.id;
  return selected;
}

export function chooseEvent(state, catalog, optionId) {
  const events = ensureEvents(state);
  const event = catalog.events.find(item => item.id === events.pending);
  const option = event?.options.find(item => item.id === optionId);
  if (!option) throw new Error('ไม่มีตัวเลือกเหตุการณ์นี้');
  const stats = state.countries[state.playerCountryId];
  const before = { ...stats };
  const cost = Math.max(0, option.cost * stats.gdp);
  const treasuryDelta = (option.effects.treasury ?? 0) * stats.gdp - cost;
  stats.treasury = Math.max(0, stats.treasury + treasuryDelta);
  if (stats.gdp > 0 && stats.treasury === 0 && before.treasury + treasuryDelta < 0) {
    stats.debt += -(before.treasury + treasuryDelta) / stats.gdp * 100;
  }
  for (const key of ['happiness', 'stability', 'military']) {
    stats[key] = clamp(stats[key] + (option.effects[key] ?? 0));
  }
  if (option.effects.resource) {
    const { id, amount } = option.effects.resource;
    stats.resourceStock[id] = Math.max(0, (stats.resourceStock[id] ?? 0) + amount);
  }
  const entry = { id: event.id, title: event.title, icon: event.icon, option: option.text,
    turn: state.economy.turns, monthIndex: state.economy.months ?? state.economy.turns * 3,
    date: { ...state.date }, changes: { ...option.effects, treasury: treasuryDelta } };
  events.history.push(entry);
  events.pending = null;
  events.ready = entry.id;
  return entry;
}
