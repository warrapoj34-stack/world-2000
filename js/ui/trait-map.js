import { activateTrait, traitDay } from '../traits.js';
import { traitEffectText } from './traits-screen.js';
export function renderTraitMap(state,catalog) {
  const button=document.querySelector('#map-special'); if(!button)return;
  const special=catalog.traits?.[state.playerCountryId]?.special;
  button.hidden=!special;if(!special)return;
  const saved=state.traitState?.[state.playerCountryId],day=traitDay(state);
  const wait=Math.max(0,(saved?.cooldownUntil??0)-day),active=Math.max(0,(saved?.activeUntil??0)-day);
  const total=saved ? saved.cooldownUntil-(saved.activeUntil-special.durationDays) : 1;
  const ended=Boolean(state.economy?.gameOver || state.victory?.finished);
  button.disabled=wait>0 || ended;
  button.classList.toggle('special-ready',!wait&&!ended);
  button.style.setProperty('--cooldown-angle',`${Math.round((1-wait/Math.max(1,total))*360)}deg`);
  document.querySelector('#map-special-days').textContent=wait?`${wait}วัน`:'✨';
  document.querySelector('#map-special-name').textContent=special.nameTh;
  document.querySelector('#map-special-status').textContent=ended?'สิ้นสุดการเล่น':wait?(active?`กำลังใช้ • เหลือ ${active} วัน`:`คูลดาวน์อีก ${wait} วัน`):'พร้อมใช้ • แตะเพื่อใช้ทันที';
  button.title=`${special.nameTh} • ${special.effects.map(e=>traitEffectText(e,catalog)).join(' • ')} • มีผล ${special.durationDays} วัน`;
}
export function createTraitMap({getState,catalog,onChange,onRefresh}) {
  const button=document.querySelector('#map-special'),viewport=document.querySelector('.map-viewport'),summary=document.querySelector('#trait-map-summary');
  let effectTimer=0,messageTimer=0;
  button.addEventListener('click',()=>{
    const state=getState();if(!state||!activateTrait(state,catalog))return;
    onChange();onRefresh();renderTraitMap(state,catalog);
    const special=catalog.traits[state.playerCountryId].special;
    summary.textContent=`✨ ${special.nameTh} • ${special.effects.map(e=>traitEffectText(e,catalog)).join(' • ')} • ${special.durationDays} วัน`;
    summary.hidden=false;viewport.classList.remove('special-burst');void viewport.offsetWidth;viewport.classList.add('special-burst');
    clearTimeout(effectTimer);clearTimeout(messageTimer);
    effectTimer=setTimeout(()=>viewport.classList.remove('special-burst'),1800);
    messageTimer=setTimeout(()=>{summary.hidden=true;},6000);
  });
}
