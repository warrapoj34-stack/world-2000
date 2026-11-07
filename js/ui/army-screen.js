import { militaryScore, militaryRank } from '../war/military.js';
import { ensureProduction, updateProduction, enqueueProduction, productionMissing, productionProgress, gameDay } from '../war/production.js';
import { formatNumber, formatMoney } from './stats.js';

export function renderArmy(body, state, catalog, onChange, onRefresh) {
  updateProduction(state); const production = ensureProduction(state), units = state.countries[state.playerCountryId].units;
  body.replaceChildren();
  const text = (value,parent=body) => { const p=document.createElement('p');p.textContent=value;parent.append(p);return p; };
  text(`⚔️ กำลังทหาร ${militaryScore(state,catalog)} / 100`);
  text('ผลิตเรียงตามคิว • ปิดหน้านี้เพื่อให้เวลาและการผลิตเดินต่อ');
  for (const recipe of catalog.recipes) {
    const card=document.createElement('section'); card.className='army-unit-row';card.dataset.recipe=recipe.id;
    text(`${recipe.icon} ${recipe.branchTh} • ${recipe.nameTh} ${formatNumber(units[recipe.unit]??0)} ${recipe.countUnitTh}`,card);
    if (['tanks','ships','aircraft'].includes(recipe.unit)) text(`อันดับโลก ${militaryRank(state,catalog,recipe.unit)} / ${catalog.playable.length}`,card);
    else text(recipe.unit==='warheads'?'จำนวนที่ผลิตสะสม':'กำลังส่งออกจะเพิ่มในรอบถัดไป',card);
    text(Object.entries(recipe.resources).map(([id,amount])=>`${catalog.resourceDefinitions.find(r=>r.id===id).nameTh} ${amount}`).concat(recipe.moneyMillions?[`เงิน ${formatMoney(recipe.moneyMillions/1000)}`]:[]).join(' + '),card);
    text(`ใช้เวลา ${recipe.days} วันในเกม`,card);
    const missing=productionMissing(state,catalog,recipe);
    const button=document.createElement('button');button.type='button';button.className='map-button produce-button';button.dataset.recipe=recipe.id;button.textContent='ผลิต';button.disabled=missing.length>0;
    button.onclick=()=>{if(enqueueProduction(state,catalog,recipe.id)){onChange();onRefresh();renderArmy(body,state,catalog,onChange,onRefresh);}};
    card.append(button);if(missing.length)text(missing.join(' • '),card);body.append(card);
  }
  const h=document.createElement('h3');h.textContent='คิวผลิต';body.append(h);
  if(!production.queue.length)text('ยังไม่มีงานผลิต');
  for(const job of production.queue){
    const row=document.createElement('div');row.className='production-job';row.dataset.job=job.id;
    const percent=productionProgress(state,job);text(`${job.icon} ${job.nameTh} • ${percent}% • เหลือ ${Math.max(0,job.endDay-gameDay(state))} วัน${gameDay(state)<job.startDay?' • รอคิว':''}`,row);
    const progress=document.createElement('progress');progress.max=100;progress.value=percent;progress.setAttribute('aria-label',`ความคืบหน้า${job.nameTh}`);row.append(progress);body.append(row);
  }
}
