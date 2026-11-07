import { activateTrait, traitDay } from '../traits.js';
export function traitEffectText(effect, catalog) {
  const target = effect.target==='all'?'ทุกชนิด':catalog.resourceDefinitions.find(r=>r.id===effect.target)?.nameTh ?? catalog.recipes.find(r=>r.id===effect.target)?.nameTh ?? '';
  const label={salePrice:'ราคาขาย',productionCost:'ต้นทุนผลิต',taxIncome:'รายได้ภาษี',resourceOutput:'ผลผลิต'}[effect.type];
  return `${label}${effect.type==='taxIncome'?'':target} ${effect.percent>0?'+':''}${effect.percent}%`;
}
export function renderTraits(parent,state,catalog,onChange,onRefresh) {
  const data=catalog.traits?.[state.playerCountryId]; if(!data)return;
  const section=document.createElement('section');section.id='country-traits';parent.append(section);
  for(const [key,label] of [['strength','จุดเด่น'],['weakness','จุดอ่อน'],['special','ความสามารถพิเศษ']]) {
    const card=data[key],box=document.createElement('article');box.className='trait-card';box.dataset.trait=key;
    const h=document.createElement('h3');h.textContent=`${card.icon} ${label} • ${card.nameTh}`;
    const p=document.createElement('p');p.textContent=card.descriptionTh;
    const effects=document.createElement('p');effects.className='trait-effects';effects.textContent=card.effects.map(e=>traitEffectText(e,catalog)).join(' • ');
    box.append(h,p,effects);section.append(box);
    if(key==='special') {
      const entry=state.traitState?.[state.playerCountryId],day=traitDay(state);
      const wait=Math.max(0,(entry?.cooldownUntil??0)-day),active=Math.max(0,(entry?.activeUntil??0)-day);
      const note=document.createElement('p');note.textContent=`มีผล ${card.durationDays} วัน • คูลดาวน์ ${card.cooldownYears} ปี นับจากกดใช้${active?` • กำลังใช้ เหลือ ${active} วัน`:''}`;box.append(note);
      const button=document.createElement('button');button.type='button';button.className='map-button';button.id='activate-trait';button.textContent=wait?`ใช้ได้อีก ${wait} วัน`:'ใช้ความสามารถพิเศษ';
      button.disabled=wait>0 || Boolean(state.economy?.gameOver || state.victory?.finished);
      button.onclick=()=>{if(activateTrait(state,catalog)){onChange();onRefresh();section.remove();renderTraits(parent,state,catalog,onChange,onRefresh);}};box.append(button);
    }
  }
}
