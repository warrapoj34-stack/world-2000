export const PATHS = {
  conquest: { name: 'สายจักรวรรดิ', detail: 'ครอง 40% ของโลกหรือเมืองหลวงสำคัญ • รอระบบสงคราม' },
  economic: { name: 'สายเศรษฐีมหาอำนาจ', detail: 'เงินคลังและเศรษฐกิจอันดับ 1 ติดต่อกัน 4 เทิร์น' },
  military: { name: 'สายมหาอำนาจทางทหาร', detail: 'กองทัพทุกเหล่าใหญ่ที่สุดและไม่เคยแพ้ • รอระบบสงคราม' },
  survival: { name: 'สายผู้รอดปลอดภัย', detail: 'อยู่ถึงปี 2050 โดยความสุขไม่ต่ำกว่า 50' },
};
export const END_YEAR = 2050;
export function ensureVictory(state) {
  if (!state.victory || !PATHS[state.victory.path]) state.victory = { path: 'survival', economicStreak: 0,
    happinessHeld: state.countries[state.playerCountryId].happiness >= 50, won: false, continued: false, finished: false };
  if (state.date.year >= END_YEAR) state.victory.finished = true;
  return state.victory;
}
export function selectVictoryPath(state, path) {
  if (!PATHS[path]) return false;
  const victory = ensureVictory(state);
  victory.path = path; victory.economicStreak = 0; victory.won = false; victory.continued = false;
  return true;
}
export function victoryProgress(state, catalog) {
  const v = ensureVictory(state), stats = state.countries[state.playerCountryId];
  if (v.path === 'economic') return { percent: Math.min(100, v.economicStreak * 25), detail: `อันดับ 1 ต่อเนื่อง ${v.economicStreak}/4 เทิร์น` };
  if (v.path === 'survival') return { percent: v.happinessHeld ? Math.min(100, state.economy.turns / 200 * 100) : 0,
    detail: v.happinessHeld ? `${state.economy.turns}/200 เทิร์น • ความสุข ${Math.round(stats.happiness)}` : 'ความสุขเคยต่ำกว่า 50 • เป้าหมายนี้ไม่สำเร็จ' };
  return { percent: 0, detail: 'รอระบบสงครามและกองทัพทุกเหล่า' };
}
export function updateVictory(state, catalog) {
  const v = ensureVictory(state), stats = state.countries[state.playerCountryId];
  if (stats.happiness < 50) v.happinessHeld = false;
  if (v.path === 'economic' && !v.won && (state.economy.months ?? state.economy.turns * 3) % 3 === 0) {
    const bestGDP = Math.max(...catalog.playable.map(c => state.countries[c.id].gdp));
    const bestMoney = Math.max(...catalog.playable.map(c => state.countries[c.id].treasury));
    v.economicStreak = stats.gdp >= bestGDP && stats.treasury >= bestMoney ? v.economicStreak + 1 : 0;
    if (v.economicStreak >= 4) v.won = true;
  }
  if (state.date.year >= END_YEAR) {
    v.finished = true;
    if (v.path === 'survival' && v.happinessHeld) v.won = true;
  }
  return v;
}
