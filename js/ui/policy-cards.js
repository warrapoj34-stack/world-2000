import {ensurePolicyCards,choosePolicy,policyModifiers} from '../policies.js';
import {simulateCountry} from '../economy.js';
import {resourceEffects} from '../resources.js';
import {formatNumber} from './stats.js';
export function renderPolicyCards(container,state,catalog,balance,onChange){
 const data=catalog.policies,c=ensurePolicyCards(state,data),government=catalog.byId.get(state.playerCountryId).government;
 container.replaceChildren();
 const text=(value,parent=container)=>{const p=document.createElement('p');p.textContent=value;parent.append(p);return p;};
 text('เลือกการ์ดเพื่อดูผลก่อนยืนยัน • แต่ละหมวดหรือช่องเปลี่ยนแล้วต้องรอ 2 เทิร์น');
 const action=(group,id,slot)=>{
  const candidate=structuredClone(state);if(!choosePolicy(candidate,data,government,group,id,slot))return;
  container.replaceChildren();container.scrollTop=0;container.parentElement.scrollTop=0;text('ตัวอย่างผลเทิร์นหน้า');
  const stats=state.countries[state.playerCountryId],resources=resourceEffects(stats,catalog.resourceLevels.get(state.playerCountryId),catalog.resourceDefinitions,balance,()=>1);
  const result=simulateCountry(stats,government,candidate.economy.policy,balance,()=>.5,resources,policyModifiers(candidate.economy.cards,data));
  text('เงินคงเหลือประมาณ '+formatNumber(result.stats.treasury)+' พันล้านดอลลาร์');
  for(const [key,label] of [['happiness','ความสุข'],['stability','ความมั่นคง']]){const delta=result.stats[key]-stats[key];const p=text(label+' '+(delta>=0?'▲ +':'▼ ')+formatNumber(delta)+' → '+formatNumber(result.stats[key]));p.className=delta>=0?'good':'bad';}
  text('ค่าประมาณใช้สูตรเกมจริง ไม่รวมความผันผวนและภัยแล้ง • ต้องกู้ '+formatNumber(result.fiscal.borrowed)+' พันล้านดอลลาร์');
  for(const [name,confirm] of [['ยืนยัน',true],['ยกเลิก',false]]){const b=document.createElement('button');b.className='map-button';b.textContent=name;b.onclick=()=>{if(confirm&&choosePolicy(state,data,government,group,id,slot))onChange();renderPolicyCards(container,state,catalog,balance,onChange);};container.append(b);}
 };
 const section=(group,title,slot=0)=>{
  const h=document.createElement('h3');h.textContent=title;container.append(h);
  const grid=document.createElement('div');grid.className='policy-cards';container.append(grid);
  const selected=group==='special'?c.special[slot]:c[group],key=group==='special'?'slot'+slot:group;
  const wait=Math.max(0,(c.locks[key]??0)-state.economy.turns);
  const list=group==='special'?[{id:null,icon:'➖',name:'เว้นช่องว่าง',description:'ไม่มีค่าใช้จ่ายหรือผลเพิ่มเติม',good:'💰',bad:'💵'},...data[group]]:data[group];
  for(const card of list){const b=document.createElement('button');b.className='policy-card';b.dataset.group=group;b.dataset.card=card.id??'empty';b.dataset.slot=slot;b.setAttribute('aria-pressed',String(selected===card.id));
   const locked=card.governments&&!card.governments.includes(government);
   b.disabled=Boolean(state.economy.gameOver)||wait>0||locked||selected===card.id||(group==='special'&&card.id&&c.special.includes(card.id));
   text(card.icon+' '+card.name,b);const effects=document.createElement('div');const good=document.createElement('span');good.className='good';good.textContent=card.good+' ▲ ';const bad=document.createElement('span');bad.className='bad';bad.textContent=card.bad+' ▼';effects.append(good,bad);b.append(effects);text(card.description,b);
   if(card.costRate!==undefined){text('ต่อเทิร์น: '+formatNumber(state.countries[state.playerCountryId].gdp*card.costRate)+' พันล้านดอลลาร์',b);text(Object.entries(card.multipliers).map(([k,v])=>({growth:'การเติบโต',revenue:'ภาษีที่เก็บได้',happiness:'ความสุข',stability:'ความมั่นคง',military:'การเสริมทหาร'}[k])+' ×'+v).join(' • '),b);}
   if(card.budget)text(Object.entries(card.budget).map(([k,v])=>({military:'ทหาร',education:'การศึกษา',health:'โรงพยาบาล',infrastructure:'ถนน',welfare:'ค่าครองชีพ'}[k])+' '+v+'%').join(' • '),b);
   if(selected===card.id)text('✓ ใช้อยู่',b);if(wait)text('รออีก '+wait+' เทิร์น',b);if(locked)text('ระบอบประเทศนี้ไม่รองรับการ์ดนี้',b);
   b.onclick=()=>action(group,card.id,slot);grid.append(b);
  }
 };
 section('tax','ภาษี');section('budget','แนวทางงบประมาณ');for(let i=0;i<3;i++)section('special','นโยบายพิเศษ ช่อง '+(i+1),i);
}
