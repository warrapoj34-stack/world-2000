import { provinceOwner, territoryMonth, transferProvince } from '../territories.js';
import { addNews } from './news.js';
const clamp=n=>Math.max(0,Math.min(100,n));
const pick=(rows,random)=>rows[Math.min(rows.length-1,Math.max(0,Math.floor(random()*rows.length)))];
export const ensureProvinceEvents = state => state.provinceEvents ??= { lastMonth:null, pending:null, history:[], effects:[], unrest:{} };
export function validProvinceEvents(value,catalog) {
  if (value===undefined) return true;
  const province=id=>typeof id==='string'&&(!catalog.territoryById||catalog.territoryById.has(id));
  const month=n=>Number.isSafeInteger(n)&&n>=0;
  return Boolean(value && (value.lastMonth===null||month(value.lastMonth))
    && (value.pending===null || value.pending&&typeof value.pending.eventId==='string'&&province(value.pending.provinceId)&&month(value.pending.month)&&(value.pending.claimant===null||catalog.byId.has(value.pending.claimant)))
    && Array.isArray(value.history)&&value.history.length<=40&&value.history.every(e=>typeof e.eventId==='string'&&province(e.provinceId)&&typeof e.option==='string'&&month(e.month))
    && Array.isArray(value.effects)&&value.effects.length<=40&&value.effects.every(e=>province(e.provinceId)&&month(e.untilMonth)&&Number.isFinite(e.production)&&e.production>=0&&e.production<=1)
    && value.unrest&&Object.entries(value.unrest).every(([id,e])=>province(id)&&month(e.since)));
}
export function eligibleProvinceEvents(state,catalog) {
  const data=ensureProvinceEvents(state),month=territoryMonth(state),stats=state.countries[state.playerCountryId],pool=[];
  for (const p of catalog.territoryById?.values()??[]) {
    if(provinceOwner(state,p)!==state.playerCountryId)continue;
    for(const event of catalog.provinceEvents?.events??[]) {
      const w=event.when;
      if(w.countries&&!w.countries.includes(p.owner)||w.provinces&&!w.provinces.includes(p.id)||w.resources&&!w.resources.includes(p.resourceId)||w.months&&!w.months.includes(state.date.month)||w.border&&!p.borders.some(id=>id!==state.playerCountryId)||w.happinessBelow!=null&&stats.happiness>=w.happinessBelow)continue;
      if(data.history.some(h=>h.eventId===event.id&&h.provinceId===p.id&&month-h.month<catalog.provinceEvents.cooldownMonths))continue;
      pool.push({event,province:p});
    }
  }
  return pool;
}
export function drawProvinceEvent(state,catalog,random=Math.random) {
  const data=ensureProvinceEvents(state),month=territoryMonth(state),rules=catalog.provinceEvents;
  if(!rules||data.lastMonth===month)return null;
  data.lastMonth=month;data.effects=data.effects.filter(e=>e.untilMonth>month);
  if(data.pending||state.economy?.gameOver||state.victory?.finished)return null;
  const unresolved=[];
  for(const [id,unrest]of Object.entries(data.unrest)) {
    const p=catalog.territoryById.get(id);
    if(!p||provinceOwner(state,p)!==state.playerCountryId){delete data.unrest[id];continue;}
    if(month-unrest.since>=rules.unrestDelayMonths)unresolved.push(p);
  }
  if(unresolved.length){
    const p=unresolved[month%unresolved.length],id=p.id;
    state.countries[state.playerCountryId].happiness=clamp(state.countries[state.playerCountryId].happiness-1);
    const destination=p.owner!==state.playerCountryId?p.owner:p.borders.find(id=>id!==state.playerCountryId);
    if(destination&&random()<rules.secessionChance){transferProvince(state,catalog,id,destination);addNews(state,{id:`secession:${id}:${month}`,icon:'🚩',provinceId:id,text:`${p.nameTh}แยกตัวไปอยู่กับ${catalog.byId.get(destination).nameTh}`});}
    else{data.pending={eventId:'local-unrest',provinceId:id,claimant:null,month};addNews(state,{id:`unrest:${id}:${month}`,icon:'⚠️',provinceId:id,text:`${p.nameTh}ยังไม่สงบ ความสุขลดและเสี่ยงเสียดินแดน`});}
    return data.pending;
  }
  if(random()>=rules.chance)return null;
  const pool=eligibleProvinceEvents(state,catalog);if(!pool.length)return null;
  // เลือกประเภทก่อน เพื่อไม่ให้ประเทศที่มีเขตมากกลบเหตุการณ์ชนิดอื่น
  const ids=[...new Set(pool.map(p=>p.event.id))],eventId=pick(ids,random),selected=pick(pool.filter(p=>p.event.id===eventId),random);
  const claimant=selected.event.when.border?pick(selected.province.borders.filter(id=>id!==state.playerCountryId),random):null;
  data.pending={eventId,provinceId:selected.province.id,claimant,month};
  addNews(state,{id:`province-event:${month}`,icon:selected.event.icon,provinceId:selected.province.id,text:`${selected.province.nameTh}: ${selected.event.title}`});
  return data.pending;
}
export const provinceEventCost=(state,option)=>option.cost?Math.max(.001,state.countries[state.playerCountryId].gdp*option.cost):0;
export function chooseProvinceEvent(state,catalog,balance,optionId) {
  const data=ensureProvinceEvents(state),pending=data.pending,event=catalog.provinceEvents.events.find(e=>e.id===pending?.eventId),option=event?.options.find(o=>o.id===optionId);
  if(!option)return null;
  const p=catalog.territoryById.get(pending.provinceId),stats=state.countries[state.playerCountryId],cost=provinceEventCost(state,option);
  if(provinceOwner(state,p)!==state.playerCountryId||stats.treasury+1e-9<cost)return null;
  stats.treasury=Math.max(0,stats.treasury-cost);
  const effects=option.effects;
  for(const key of ['happiness','reputation'])stats[key]=clamp(stats[key]+(effects[key]??0));
  if(effects.resource){stats.resourceStock??={};stats.resourceStock[p.resourceId]=Math.min(balance.resources.maxStock,(stats.resourceStock[p.resourceId]??0)+effects.resource);}
  if(effects.production)data.effects.push({provinceId:p.id,production:effects.production,untilMonth:territoryMonth(state)+effects.durationMonths});
  if(effects.unrest)data.unrest[p.id]={since:territoryMonth(state)};
  if(effects.calm)delete data.unrest[p.id];
  if(effects.cede)transferProvince(state,catalog,p.id,pending.claimant);
  const entry={eventId:event.id,provinceId:p.id,month:territoryMonth(state),option:option.text};
  data.history.push(entry);data.history=data.history.slice(-40);data.pending=null;
  addNews(state,{id:`province-choice:${entry.month}:${p.id}`,icon:event.icon,provinceId:p.id,text:`${p.nameTh}: ${option.text}${cost?` • จ่าย ${Math.round(cost*1000)} ล้าน`:''}`});
  return entry;
}
