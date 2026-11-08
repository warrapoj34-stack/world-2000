import { startingOutlook } from '../data/starting.js';
import { formatMoney } from './stats.js';
export function createCountryCards(catalog,balance,onSelect){
  const root=document.querySelector('#country-choices'),buttons=new Map();
  for(const [region,ids] of Object.entries(catalog.newGameRegions)){
    const section=document.createElement('section'),heading=document.createElement('h3'),grid=document.createElement('div');
    heading.textContent=region;grid.className='country-choice-grid';section.append(heading,grid);root.append(section);
    for(const id of ids){
      const country=catalog.byId.get(id),outlook=startingOutlook(country,catalog,balance),traits=catalog.traits[id];
      const button=document.createElement('button');button.type='button';button.className='country-choice';button.dataset.country=id;button.setAttribute('aria-pressed','false');
      const name=document.createElement('strong');name.textContent=country.nameTh+(id==='YUG'?' (เซอร์เบีย)':'');
      const badge=document.createElement('span');badge.className='difficulty';badge.textContent=`ระดับความยาก: ${outlook.difficulty}`;badge.title='ประเมินจากเงินเริ่มต้น กำลังทหารจริง และขนาดผลเสียของจุดอ่อน';
      const cash=document.createElement('span');cash.textContent=`เงิน ${formatMoney(outlook.treasury)} • รับสุทธิ +${formatMoney(outlook.fiscal.net)}/เดือน`;
      const details=document.createElement('span');details.className='choice-traits';
      for(const [key,label] of [['strength','เด่น'],['weakness','อ่อน']]){const text=document.createElement('span');text.className=key;text.textContent=`${traits[key].icon} ${label}: ${traits[key].nameTh}`;details.append(text);}
      button.append(name,badge,cash,details);button.onclick=()=>onSelect(id);grid.append(button);buttons.set(id,button);
    }
  }
  return {select(id){for(const [key,button] of buttons)button.setAttribute('aria-pressed',String(key===id));},setBusy(value){for(const button of buttons.values())button.disabled=value;}};
}
