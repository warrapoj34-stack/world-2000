export function ensureClock(state) {
  state.date.day ??= 1;
  state.clock ??= { progress: 0, speed: 4, userPaused: false };
  return state.clock;
}
export function daysInMonth(date) { return new Date(Date.UTC(date.year, date.month, 0)).getUTCDate(); }
export function advanceClock(state, elapsedSeconds, secondsPerGameYear, onMonth) {
  const clock = ensureClock(state);
  clock.progress += elapsedSeconds * clock.speed * 12 / secondsPerGameYear;
  while (clock.progress >= 1) {
    clock.progress -= 1;
    const keepGoing = onMonth();
    if (keepGoing === false || state.economy.gameOver || state.victory?.finished || state.events?.pending) {
      clock.progress = 0;
      break;
    }
  }
  state.date.day = Math.min(daysInMonth(state.date), 1 + Math.floor(clock.progress * daysInMonth(state.date)));
}
