import { addNews } from './events/news.js';
export const PROVINCE_PROJECTS=['roads','services','factory','port'];
const day=state=>Math.floor(Date.UTC(state.date.year,state.date.month-1,state.date.day??1)/86400000);
const clamp=x=>Math.max(0,Math.min(100,x));
export function ensureProvinces(state,catalog){
  const definitions=catalog.provinceData?.countries[state.playerCountryId];if(!definitions)return null;
  if(!state.provinces)state.provinces={countryId:state.playerCountryId,nextId:1,queue:[],regions:Object.fromEntries(definitions.map(p=>[p.id,{happiness:state.countries[state.playerCountryId].happiness,levels:{roads:0,services:0,factory:0,port:0},lastAlertMonth:null}]))};
  return state.provinces;
}
export function validProvinces(value,state,catalog){
  if(value===undefined)return true;
  const defs=catalog.provinceData?.countries[value?.countryId];
  return Boolean(value&&value.countryId===state.playerCountryId&&Number.isSafeInteger(value.nextId)&&value.nextId>0
    &&(!catalog.provinceData||defs)&&(!defs||Object.keys(value.regions??{}).length===defs.length)
    &&value.regions&&Object.values(value.regions).every(p=>Number.isFinite(p.happiness)&&p.happiness>=0&&p.happiness<=100
      &&p.levels&&PROVINCE_PROJECTS.every(k=>Number.isSafeInteger(p.levels[k])&&p.levels[k]>=0&&p.levels[k]<=3)
      &&(p.lastAlertMonth==null||Number.isSafeInteger(p.lastAlertMonth)))
    &&(!defs||defs.every(p=>value.regions[p.id]))&&Array.isArray(value.queue)&&new Set(value.queue.map(j=>j.id)).size===value.queue.length
    &&value.queue.every(j=>Number.isSafeInteger(j.id)&&j.id>0&&j.id<value.nextId&&value.regions[j.provinceId]
      &&PROVINCE_PROJECTS.includes(j.project)&&Number.isSafeInteger(j.startDay)&&Number.isSafeInteger(j.endDay)&&j.endDay>j.startDay)
    &&value.queue.every(j=>value.regions[j.provinceId].levels[j.project]<3&&(!defs||j.project!=='port'||defs.find(p=>p.id===j.provinceId)?.coastal))
    &&new Set(value.queue.map(j=>j.provinceId)).size===value.queue.length);
}
export function provinceMultiplier(state,catalog){
  const saved=ensureProvinces(state,catalog),defs=catalog.provinceData?.countries[state.playerCountryId];if(!saved)return 1;
  const b=catalog.provinceData.balance;
  return defs.reduce((sum,p)=>{const l=saved.regions[p.id].levels;return sum+p.incomeShare*(1+l.roads*b.roadIncomeBonus+l.factory*b.factoryIncomeBonus+l.port*b.portIncomeBonus);},0);
}
export function syncProvinceHappiness(state,catalog,decay=false){
  const saved=ensureProvinces(state,catalog);if(!saved)return;
  const defs=catalog.provinceData.countries[state.playerCountryId],stats=state.countries[state.playerCountryId],b=catalog.provinceData.balance;
  const mean=defs.reduce((sum,p)=>sum+p.populationShare*saved.regions[p.id].happiness,0),delta=stats.happiness-mean;
  let alerts=0;
  for(const p of defs){const region=saved.regions[p.id],l=region.levels;
    region.happiness=clamp(region.happiness+delta+(decay?l.services*b.servicesHappiness-(Object.values(l).every(v=>v===0)?b.neglectHappinessLoss:0):0));
    const month=state.date.year*12+state.date.month;
    if(decay&&alerts<3&&region.happiness<b.alertHappiness&&(region.lastAlertMonth==null||month-region.lastAlertMonth>=b.alertCooldownMonths)){
      addNews(state,{id:`province-problem:${p.id}:${month}`,icon:'⚠️',text:`${p.nameTh}ความสุขต่ำ ลองลงทุนดูแลประชาชน`});region.lastAlertMonth=month;alerts++;
    }
  }
  stats.happiness=defs.reduce((sum,p)=>sum+p.populationShare*saved.regions[p.id].happiness,0);
}
export function provinceOutput(state,catalog){
  const saved=ensureProvinces(state,catalog),output={};if(!saved)return output;
  for(const p of catalog.provinceData.countries[state.playerCountryId])output[p.resourceId]=(output[p.resourceId]??0)+saved.regions[p.id].levels.factory*catalog.provinceData.balance.factoryUnits;
  return output;
}
export function projectCost(state,catalog,provinceId,project){
  const saved=ensureProvinces(state,catalog),rule=catalog.provinceData?.projects[project];if(!saved||!rule||!saved.regions[provinceId])return null;
  const multiplier=1+saved.regions[provinceId].levels[project]*.5;
  return {money:Math.min(rule.maxMoney,Math.max(rule.minMoney,state.countries[state.playerCountryId].gdp*rule.gdpShare))*multiplier,
    resources:Object.fromEntries(Object.entries(rule.resources).map(([k,v])=>[k,Math.ceil(v*multiplier)])),days:rule.days};
}
export function projectMissing(state,catalog,provinceId,project){
  const saved=ensureProvinces(state,catalog),p=catalog.provinceData?.countries[state.playerCountryId]?.find(p=>p.id===provinceId),cost=projectCost(state,catalog,provinceId,project);
  if(!saved||!p||!cost)return ['ยังไม่รองรับจังหวัดนี้'];
  const stats=state.countries[state.playerCountryId],missing=[];
  if(state.economy?.gameOver||state.victory?.finished)missing.push('เกมจบแล้ว');
  if(saved.queue.some(j=>j.provinceId===provinceId))missing.push('จังหวัดนี้กำลังก่อสร้าง');
  if(saved.regions[provinceId].levels[project]>=3)missing.push('พัฒนาครบ 3 ระดับแล้ว');
  if(project==='port'&&!p.coastal)missing.push('จังหวัดนี้ไม่มีชายฝั่งทะเล');
  if(stats.treasury+1e-9<cost.money)missing.push('เงินไม่พอ');
  for(const [id,amount]of Object.entries(cost.resources))if((stats.resourceStock?.[id]??0)<amount)missing.push(`ขาด${catalog.resourceDefinitions?.find(r=>r.id===id)?.nameTh??id} ${amount-(stats.resourceStock?.[id]??0)} หน่วย`);
  return missing;
}
export function buildProvince(state,catalog,provinceId,project){
  updateProvinceConstruction(state,catalog);
  if(projectMissing(state,catalog,provinceId,project).length)return false;
  const saved=state.provinces,cost=projectCost(state,catalog,provinceId,project),stats=state.countries[state.playerCountryId];
  stats.treasury=Math.max(0,stats.treasury-cost.money);
  for(const [id,amount]of Object.entries(cost.resources))stats.resourceStock[id]-=amount;
  saved.queue.push({id:saved.nextId++,provinceId,project,startDay:day(state),endDay:day(state)+cost.days});return true;
}
export function updateProvinceConstruction(state,catalog){
  const saved=ensureProvinces(state,catalog);if(!saved)return 0;
  let completed=0;
  saved.queue=saved.queue.filter(job=>{
    if(day(state)<job.endDay)return true;
    saved.regions[job.provinceId].levels[job.project]++;completed++;
    if(job.project==='port'){const stats=state.countries[state.playerCountryId];stats.units.cargoShips=(stats.units.cargoShips??0)+1;}
    const province=catalog.provinceData.countries[state.playerCountryId].find(p=>p.id===job.provinceId);
    addNews(state,{id:`province-built:${saved.countryId}:${job.id}`,icon:'🏗️',text:`${province.nameTh}: ${catalog.provinceData.projects[job.project].nameTh}เสร็จแล้ว`});return false;
  });return completed;
}
export const constructionProgress=(state,job)=>Math.max(0,Math.min(100,Math.floor((day(state)-job.startDay)/(job.endDay-job.startDay)*100)));
export async function loadProvinces(catalog){
  const response=await fetch(new URL('../data/provinces_2000.json',import.meta.url));if(!response.ok)throw new Error('โหลดจังหวัดไม่สำเร็จ');
  const data=await response.json();
  if(Object.keys(data.countries).length!==5)throw new Error('ประเทศทดลองจังหวัดไม่ครบ');
  for(const [id,rows]of Object.entries(data.countries)){
    if(!catalog.byId.has(id)||!rows.length||new Set(rows.map(p=>p.id)).size!==rows.length||rows.some(p=>!p.nameTh||!Number.isFinite(p.populationShare)||p.populationShare<=0||!Number.isFinite(p.incomeShare)||p.incomeShare<=0||!Number.isInteger(p.development)||p.development<1||p.development>5||typeof p.coastal!=='boolean'||!catalog.resourceDefinitions.some(r=>r.id===p.resourceId)||!Array.isArray(p.point)||p.point.length!==2||p.point.some(v=>!Number.isFinite(v))))throw new Error('ข้อมูลจังหวัดไม่ถูกต้อง');
    for(const key of ['populationShare','incomeShare'])if(Math.abs(rows.reduce((sum,p)=>sum+p[key],0)-1)>1e-8)throw new Error('สัดส่วนจังหวัดไม่ครบ');
  }
  catalog.provinceData=data;
}
