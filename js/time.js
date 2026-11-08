export function ensureClock(state) {
  state.date.day ??= 1;
  state.clock ??= { progress: (state.date.day-1)/daysInMonth(state.date), speed: 4, userPaused: false };
  return state.clock;
}
export function daysInMonth(date) { return new Date(Date.UTC(date.year, date.month, 0)).getUTCDate(); }
export function advanceClock(state, elapsedSeconds, secondsPerGameMonth, onMonth) {
  const clock = ensureClock(state);
  clock.progress += elapsedSeconds * clock.speed / secondsPerGameMonth;
  while (clock.progress >= 1-1e-9) {
    clock.progress = Math.max(0,clock.progress-1);
    const keepGoing = onMonth();
    if (keepGoing === false || state.economy.gameOver || state.victory?.finished || state.events?.pending) {
      clock.progress = 0;
      break;
    }
  }
  state.date.day = Math.min(daysInMonth(state.date), 1 + Math.floor(clock.progress * daysInMonth(state.date)));
}
