const month=state=>state.date.year*12+state.date.month-1;
export function occupationFactor(state,provinceId,owner){
  const occupation=state.warfare?.occupations?.[provinceId];
  if(!occupation||occupation.owner!==owner||occupation.untilMonth<=month(state))return 1;
  return occupation.factor*(occupation.blockedUntil>month(state)?occupation.resistanceFactor:1);
}
