import { formatMoney, formatNumber } from './stats.js';
import { chooseEvent, drawEvent, ensureEvents } from '../events/engine.js';

const icons = { treasury: '💰', happiness: '😊', stability: '🛡️', military: '⚔️', resource: '📦' };
const names = { treasury: 'เงิน', happiness: 'ความสุข', stability: 'ความมั่นคง', military: 'ทหาร', resource: 'ทรัพยากร' };

export function createEventScreen({ catalog, getState, onChange, onContinue, onRefresh }) {
  const dialog = document.querySelector('#event-dialog');
  const icon = document.querySelector('#event-icon');
  const title = document.querySelector('#event-title');
  const story = document.querySelector('#event-story');
  const options = document.querySelector('#event-options');
  const summary = document.querySelector('#event-summary');
  const next = document.querySelector('#event-next');
  function showResult(entry) {
    const event = catalog.events.find(item => item.id === entry.id);
    icon.textContent = event.icon; title.textContent = event.title; story.textContent = event.story;
    options.replaceChildren();
    summary.textContent = `${event.icon} ${entry.option} • ${Object.entries(entry.changes).filter(([key]) => key !== 'resource' && key !== 'stability').map(([key, value]) => key === 'treasury' ? `💰 ${value >= 0 ? '+' : ''}${formatMoney(value)}` : `${icons[key]} ${value >= 0 ? '+' : ''}${formatNumber(value)}`).join(' · ')}`;
    summary.hidden = false; next.hidden = false;
    if (!dialog.open) dialog.showModal();
  }

  function effectText(key, value, gdp) {
    const amount = key === 'treasury' ? formatMoney(Math.abs(value * gdp)) : Math.abs(value);
    return `${icons[key]}${value >= 0 ? '▲' : '▼'} ${names[key]} ${amount}`;
  }
  function show(event) {
    icon.textContent = event.icon; title.textContent = event.title; story.textContent = event.story;
    options.replaceChildren(); summary.hidden = true; next.hidden = true;
    const state = getState(), gdp = state.countries[state.playerCountryId].gdp;
    for (const option of event.options) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'event-choice';
      const heading = document.createElement('strong'); heading.textContent = option.text;
      const effects = document.createElement('span'); effects.className = 'event-effects';
      const changes = { ...option.effects, treasury: (option.effects.treasury ?? 0) - option.cost };
      effects.textContent = Object.entries(changes).filter(([key]) => key !== 'stability').map(([key, value]) => key === 'resource'
        ? `📦${value.amount >= 0 ? '▲' : '▼'} ${Math.abs(value.amount)}`
        : effectText(key, value, gdp)).join('  ·  ');
      button.append(heading, effects);
      button.addEventListener('click', () => {
        const entry = chooseEvent(state, catalog, option.id);
        onChange(); onRefresh();
        showResult(entry);
        for (const key of ['treasury', 'happiness', 'military']) {
          const value = entry.changes[key]; if (!value) continue;
          const hud = document.querySelector(`#hud-${key}`); if (!hud) continue;
          const float = document.createElement('span'); float.className = `event-float ${value < 0 ? 'negative' : ''}`;
          float.textContent = `${value > 0 ? '+' : ''}${key === 'treasury' ? formatMoney(value) : value}`;
          hud.parentElement.append(float); setTimeout(() => float.remove(), 1800);
        }
      });
      options.append(button);
    }
    if (!dialog.open) dialog.showModal();
  }
  next.addEventListener('click', () => {
    ensureEvents(getState()).ready = null;
    onChange(); dialog.close(); onContinue();
  });
  dialog.addEventListener('cancel', event => event.preventDefault());
  function beforeTurn() {
    const state = getState();
    const existing = ensureEvents(state).pending;
    if (ensureEvents(state).ready) {
      showResult(ensureEvents(state).history.at(-1)); return true;
    }
    const event = existing ? catalog.events.find(item => item.id === existing) : drawEvent(state, catalog);
    if (!event) return false;
    onChange(); show(event); return true;
  }
  function resume() {
    const events = ensureEvents(getState());
    if (events.ready) { showResult(events.history.at(-1)); return; }
    const id = events.pending;
    if (id) show(catalog.events.find(item => item.id === id));
  }
  return { beforeTurn, resume, monthly: beforeTurn };
}
