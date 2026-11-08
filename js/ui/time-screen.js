import { advanceClock, ensureClock } from '../time.js';
import { renderHUD } from './stats.js';

export function createTimeScreen({ catalog, balance, getState, onMonth, onChange }) {
  const buttons = [...document.querySelectorAll('[data-time-speed]')];
  const clockLabel = document.querySelector('#time-status');
  let previous = performance.now(), frame = 0, lastSave = 0, lastUI = 0;
  function blocked() {
    return document.hidden || document.querySelector('#map-screen').hidden || Boolean(document.querySelector('dialog[open]'));
  }
  function refresh() {
    const state = getState(); if (!state) return;
    const clock = ensureClock(state);
    const paused = clock.userPaused || blocked() || state.economy.gameOver || state.victory?.finished;
    const label=paused ? 'หยุด' : `ความเร็ว ×${clock.speed}`;
    if(clockLabel.textContent!==label)clockLabel.textContent=label;
    for (const button of buttons) { const pressed=String(button.dataset.timeSpeed === (clock.userPaused ? 'pause' : String(clock.speed))); if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed); }
  }
  function tick(now) {
    if(now-lastUI<250){frame=requestAnimationFrame(tick);return;}
    lastUI=now;
    const elapsed = Math.max(0, (now - previous) / 1000); previous = now;
    const state = getState();
    if (state && !blocked() && !ensureClock(state).userPaused && !state.economy.gameOver && !state.victory?.finished) {
      const before = state.date.day, beforeMonth=state.date.month;
      advanceClock(state, elapsed, balance.secondsPerGameYear, onMonth);
      if (state.date.day !== before) {
        if(state.date.month===beforeMonth)renderHUD(state, catalog);
        if (now - lastSave >= 1000) { lastSave = now; onChange(); }
      }
    }
    refresh(); frame = requestAnimationFrame(tick);
  }
  buttons.forEach(button => button.addEventListener('click', () => {
    const state = getState(); if (!state) return;
    const clock = ensureClock(state), choice = button.dataset.timeSpeed;
    if (choice === 'pause') clock.userPaused = true;
    else { clock.speed = Number(choice); clock.userPaused = false; }
    previous = performance.now(); onChange(); refresh();
  }));
  document.addEventListener('keydown', event => {
    if (event.code !== 'Space' || event.repeat || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '') || document.querySelector('dialog[open]')) return;
    event.preventDefault(); const state = getState(); if (!state || document.querySelector('#map-screen').hidden) return;
    const clock = ensureClock(state); clock.userPaused = !clock.userPaused; previous = performance.now(); onChange(); refresh();
  });
  document.addEventListener('visibilitychange', () => { previous = performance.now(); refresh(); });
  frame = requestAnimationFrame(tick);
  return { refresh, destroy: () => cancelAnimationFrame(frame) };
}
