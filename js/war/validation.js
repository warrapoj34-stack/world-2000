export function validWarfare(value,state,catalog){
  if(value===undefined)return true;
  const integer=n=>Number.isSafeInteger(n)&&n>=0,month=n=>n===null||integer(n),progress=n=>Number.isFinite(n)&&n>=0&&n<=100;
  const country=id=>catalog.byId.has(id),province=id=>typeof id==='string'&&(!catalog.territoryById||catalog.territoryById.has(id)),target=id=>id===null||province(id);
  if(!value||value.version!==1||!integer(value.revision)||!integer(value.nextId)||value.nextId<1||!month(value.lastMonth)||!month(value.lastProtestMonth)||!Array.isArray(value.wars)||value.wars.length>catalog.countries.length)return false;
  if(value.wars.some(w=>!w||typeof w!=='object')||new Set(value.wars.map(w=>w.id)).size!==value.wars.length||new Set(value.wars.map(w=>w.enemy)).size!==value.wars.length)return false;
  if(!value.wars.every(w=>integer(w.id)&&w.id>0&&w.id<value.nextId&&country(w.enemy)&&w.enemy!==state.playerCountryId&&['land','sea'].includes(w.mode)&&integer(w.months)&&['attack','defend'].includes(w.stance)&&target(w.target)&&progress(w.progress)
    &&w.counter&&target(w.counter.target)&&progress(w.counter.progress)&&w.baseline&&Object.entries(w.baseline).every(([id,owner])=>province(id)&&[w.enemy,state.playerCountryId].includes(owner))
    &&w.alerts&&Object.entries(w.alerts).every(([id,reason])=>[w.enemy,state.playerCountryId].includes(id)&&['capital','territory'].includes(reason))
    &&(w.lastBattle===null||w.lastBattle&&integer(w.lastBattle.month)&&['player','enemy'].every(side=>['tanks','aircraft','ships'].every(key=>integer(w.lastBattle.losses?.[side]?.[key]))))))return false;
  return Boolean((value.activeId===null||value.wars.some(w=>w.id===value.activeId))
    &&value.occupations&&Object.entries(value.occupations).every(([id,o])=>province(id)&&country(o.owner)&&country(o.previousOwner)&&integer(o.untilMonth)&&integer(o.blockedUntil)&&Number.isFinite(o.factor)&&o.factor>=0&&o.factor<=1&&Number.isFinite(o.resistanceFactor)&&o.resistanceFactor>=0&&o.resistanceFactor<=1)
    &&value.relations&&Object.entries(value.relations).every(([pair,delta])=>{const ids=pair.split(':');return ids.length===2&&ids[0]!==ids[1]&&ids.every(country)&&Number.isInteger(delta)&&delta>=-200&&delta<=200;})
    &&Array.isArray(value.notices)&&value.notices.length<=20&&value.notices.every(n=>typeof n.id==='string'&&typeof n.text==='string'&&integer(n.month)&&value.wars.some(w=>w.id===n.warId))
    &&(value.protest===null||value.protest&&integer(value.protest.month)));
}
