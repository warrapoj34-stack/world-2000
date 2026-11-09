import { drawProvinceEvent,chooseProvinceEvent,provinceEventCost } from '../events/province-events.js';
import { formatMoney } from './stats.js';
export function createTerritoryEvents({catalog,balance,getState,onChange,onRefresh,onFocus}) {
  const dialog=document.querySelector('#territory-event-dialog'),body=document.querySelector('#territory-event-content');
  function position(){const rect=document.querySelector('#world-map').getBoundingClientRect(),top=Math.max(12,rect.top+8);dialog.style.top=top+'px';dialog.style.maxHeight=Math.max(200,Math.min(rect.height-16,innerHeight-top-12))+'px';}
  window.addEventListener('resize',()=>{if(dialog.open)position();});
  function open(){
    const state=getState(),pending=state?.provinceEvents?.pending;
    if(!pending)return false;
    const event=catalog.provinceEvents.events.find(e=>e.id===pending.eventId),p=catalog.territoryById.get(pending.provinceId);
    if(!event||!p)return false;
    body.replaceChildren();document.querySelector('#territory-event-title').textContent=`${event.icon} ${p.nameTh} • ${event.title}`;
    const story=document.createElement('p');story.textContent=event.story.replace('{claimant}',catalog.byId.get(pending.claimant)?.nameTh??'ประเทศเพื่อนบ้าน');body.append(story);
    for(const option of event.options){
      const b=document.createElement('button');b.type='button';b.className='territory-choice';b.dataset.choice=option.id;
      const cost=provinceEventCost(state,option),e=option.effects;
      const effect=[cost?`💰 −${formatMoney(cost)}`:'ไม่เสียเงิน',e.happiness?`😊 ${e.happiness>0?'+':''}${e.happiness}`:'',e.resource?`⛏️ +${e.resource}`:'',e.production?`ผลผลิตพื้นที่ −${Math.round((1-e.production)*100)}% ${e.durationMonths} เดือน`:'',e.cede?'🚩 โอนดินแดนให้เพื่อนบ้าน':'',e.unrest?'⚠️ เสี่ยงแยกตัวถ้าทิ้งไว้หลายเดือน':''].filter(Boolean).join(' • ');
      const label=document.createElement('strong');label.textContent=option.text;const detail=document.createElement('span');detail.textContent=effect;b.append(label,detail);
      b.disabled=state.countries[state.playerCountryId].treasury+1e-9<cost;
      if(b.disabled)detail.textContent+=' • เงินไม่พอ';
      b.onclick=()=>{if(chooseProvinceEvent(state,catalog,balance,option.id)){onChange();onRefresh();dialog.close();}};body.append(b);
    }
    if(event.disabledChoice){const disabled=document.createElement('p');disabled.className='territory-disabled';disabled.setAttribute('aria-disabled','true');disabled.textContent=event.disabledChoice;body.append(disabled);}
    onFocus(p.id);position();if(!dialog.open)dialog.show();return true;
  }
  dialog.addEventListener('cancel',event=>event.preventDefault());
  document.addEventListener('open-territory-event',event=>{onFocus(event.detail);if(getState()?.provinceEvents?.pending?.provinceId===event.detail)open();});
  return {resume:open,monthly(){const selected=drawProvinceEvent(getState(),catalog);onChange();onRefresh();if(selected)open();return Boolean(getState().provinceEvents?.pending);}};
}
