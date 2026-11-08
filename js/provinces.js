import { migrateProvinceSave } from './data/province-migration.js';
import { RESOURCE_IDS } from './data/resource-ids.js';
import { addNews } from './events/news.js';
export const PROVINCE_PROJECTS=['roads','services','factory','port'];
const day=state=>Math.floor(Date.UTC(state.date.year,state.date.month-1,state.date.day??1)/86400000);
const clamp=x=>Math.max(0,Math.min(100,x));
export function ensureProvinces(state,catalog){
  const definitions=catalog.provinceData?.countries[state.playerCountryId];if(!definitions)return null;
  if(!state.provinces)state.provinces={schemaVersion:2,countryId:state.playerCountryId,nextId:1,queue:[],regions:Object.fromEntries(definitions.map(p=>[p.id,{happiness:state.countries[state.playerCountryId].happiness,levels:{roads:0,services:0,factory:0,port:0},lastAlertMonth:null}]))};
  if(state.provinces.schemaVersion!==2)migrateProvinceSave(state,catalog);
  return state.provinces;
}
export function validProvinces(value,state,catalog){
  if(value===undefined)return true;
  const defs=catalog.provinceData?.countries[value?.countryId];
  return Boolean(value&&[undefined,1,2].includes(value.schemaVersion)&&value.countryId===state.playerCountryId&&Number.isSafeInteger(value.nextId)&&value.nextId>0
    &&(!catalog.provinceData?.files||catalog.provinceData.files[value.countryId])&&(!defs||value.schemaVersion!==2||Object.keys(value.regions??{}).length===defs.length)
    &&value.regions&&Object.values(value.regions).every(p=>Number.isFinite(p.happiness)&&p.happiness>=0&&p.happiness<=100
      &&p.levels&&PROVINCE_PROJECTS.every(k=>Number.isSafeInteger(p.levels[k])&&p.levels[k]>=0&&p.levels[k]<=3)
      &&(p.lastAlertMonth==null||Number.isSafeInteger(p.lastAlertMonth))&&validLegacy(p.legacy))
    &&(!defs||value.schemaVersion!==2||defs.every(p=>value.regions[p.id]))&&Array.isArray(value.queue)&&new Set(value.queue.map(j=>j.id)).size===value.queue.length
    &&value.queue.every(j=>Number.isSafeInteger(j.id)&&j.id>0&&j.id<value.nextId&&value.regions[j.provinceId]
      &&(j.legacy===undefined||typeof j.legacy==='boolean')&&PROVINCE_PROJECTS.includes(j.project)&&Number.isSafeInteger(j.startDay)&&Number.isSafeInteger(j.endDay)&&j.endDay>j.startDay)
    &&value.queue.every(j=>(j.legacy||value.regions[j.provinceId].levels[j.project]<3)&&(!defs||value.schemaVersion!==2||j.legacy||j.project!=='port'||defs.find(p=>p.id===j.provinceId)?.coastal)
      &&(!j.legacy||Number.isFinite(j.incomeFactor)&&j.incomeFactor>0&&Number.isFinite(j.populationFactor)&&j.populationFactor>0&&RESOURCE_IDS.includes(j.resourceId)))
    &&value.queue.every(j=>value.queue.filter(k=>k.provinceId===j.provinceId).length===1||j.legacy===true));
}
export function provinceMultiplier(state,catalog){
  const saved=ensureProvinces(state,catalog),defs=catalog.provinceData?.countries[state.playerCountryId];if(!saved)return 1;
  const b=catalog.provinceData.balance;
  return defs.reduce((sum,p)=>{const l=saved.regions[p.id].levels;return sum+p.incomeShare*(1+l.roads*b.roadIncomeBonus+l.factory*b.factoryIncomeBonus+l.port*b.portIncomeBonus+(saved.regions[p.id].legacy?.income??0));},0);
}
export function syncProvinceHappiness(state,catalog,decay=false){
  const saved=ensureProvinces(state,catalog);if(!saved)return;
  const defs=catalog.provinceData.countries[state.playerCountryId],stats=state.countries[state.playerCountryId],b=catalog.provinceData.balance;
  const mean=defs.reduce((sum,p)=>sum+p.populationShare*saved.regions[p.id].happiness,0),delta=stats.happiness-mean;
  let alerts=0;
  for(const p of defs){const region=saved.regions[p.id],l=region.levels;
    region.happiness=clamp(region.happiness+delta+(decay?l.services*b.servicesHappiness+(region.legacy?.happiness??0)-(Object.values(l).every(v=>v===0)&&!Object.values(region.legacy?.built??{}).some(v=>v>0)?b.neglectHappinessLoss:0):0));
    const month=state.date.year*12+state.date.month;
    if(decay&&alerts<3&&region.happiness<b.alertHappiness&&(region.lastAlertMonth==null||month-region.lastAlertMonth>=b.alertCooldownMonths)){
      addNews(state,{id:`province-problem:${p.id}:${month}`,icon:'⚠️',text:`${p.nameTh}ความสุขต่ำ ลองลงทุนดูแลประชาชน`});region.lastAlertMonth=month;alerts++;
    }
  }
  stats.happiness=defs.reduce((sum,p)=>sum+p.populationShare*saved.regions[p.id].happiness,0);
}
export function provinceOutput(state,catalog){
  const saved=ensureProvinces(state,catalog),output={};if(!saved)return output;
  for(const p of catalog.provinceData.countries[state.playerCountryId]){
    const r=saved.regions[p.id],id=p.factoryResourceId??p.resourceId;output[id]=(output[id]??0)+r.levels.factory*catalog.provinceData.balance.factoryUnits;
    for(const [id,units]of Object.entries(r.legacy?.output??{}))output[id]=(output[id]??0)+units;
  }
  for(const id of Object.keys(output))output[id]=Math.max(0,Math.round(output[id]));
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
    const region=saved.regions[job.provinceId],p=catalog.provinceData.countries[state.playerCountryId].find(p=>p.id===job.provinceId),b=catalog.provinceData.balance;
    const previous=region.levels[job.project];region.levels[job.project]=Math.min(3,previous+1);const gain=region.levels[job.project]-previous;completed++;
    if(job.legacy){
      const bonus=region.legacy;bonus.built[job.project]++;
      if(job.project==='services')bonus.happiness+=b.servicesHappiness*(job.populationFactor-gain);
      else bonus.income+=({roads:b.roadIncomeBonus,factory:b.factoryIncomeBonus,port:b.portIncomeBonus}[job.project])*(job.incomeFactor-gain);
      if(job.project==='factory'){bonus.output[job.resourceId]=(bonus.output[job.resourceId]??0)+b.factoryUnits;bonus.output[p.factoryResourceId]=(bonus.output[p.factoryResourceId]??0)-gain*b.factoryUnits;}
    }
    if(job.project==='port'){const stats=state.countries[state.playerCountryId];stats.units.cargoShips=(stats.units.cargoShips??0)+1;}
    const province=catalog.provinceData.countries[state.playerCountryId].find(p=>p.id===job.provinceId);
    addNews(state,{id:`province-built:${saved.countryId}:${job.id}`,icon:'🏗️',text:`${province.nameTh}: ${catalog.provinceData.projects[job.project].nameTh}เสร็จแล้ว`});return false;
  });return completed;
}
export const constructionProgress=(state,job)=>Math.max(0,Math.min(100,Math.floor((day(state)-job.startDay)/(job.endDay-job.startDay)*100)));
function validLegacy(value){
  return value===undefined||Boolean(value&&Number.isFinite(value.income)&&Number.isFinite(value.happiness)&&value.output&&Object.entries(value.output).every(([id,n])=>RESOURCE_IDS.includes(id)&&Number.isSafeInteger(n))&&value.built&&PROVINCE_PROJECTS.every(k=>Number.isSafeInteger(value.built[k])&&value.built[k]>=0));
}
export async function loadProvinces(catalog){
  const response=await fetch(new URL('../data/provinces/config.json',import.meta.url));if(!response.ok)throw new Error('โหลดค่าจังหวัดไม่สำเร็จ');
  const config=await response.json();catalog.provinceData={...config,countries:{}};
}
export async function loadProvinceCountry(catalog,countryId){
  const file=catalog.provinceData?.files?.[countryId];
  if(!file){catalog.provinceData.countries={};catalog.provinceFeatures=null;catalog.provinceMigration=null;return null;}
  if(catalog.provinceFeatures?.countryId===countryId)return catalog.provinceFeatures;
  const response=await fetch(new URL('../data/provinces/'+file,import.meta.url));if(!response.ok)throw new Error('โหลดแผนที่จังหวัดไม่สำเร็จ กรุณาเชื่อมต่ออินเทอร์เน็ต');
  const data=await response.json(),rows=data.features?.map(f=>f.properties);
  if(data.countryId!==countryId||rows?.length!==catalog.provinceData.counts[countryId]||new Set(rows.map(p=>p.id)).size!==rows.length||rows.some(p=>!p.nameTh||!p.capital||!Number.isSafeInteger(p.population)||p.population<=0||!Number.isInteger(p.development)||p.development<1||p.development>5||typeof p.hasPort!=='boolean'||!RESOURCE_IDS.includes(p.factoryResourceId)||p.resourceId!==null&&!RESOURCE_IDS.includes(p.resourceId))||rows.reduce((n,p)=>n+p.population,0)!==data.populationTotal)throw new Error('ข้อมูลจังหวัดไม่ถูกต้อง');
  catalog.provinceData.countries={[countryId]:rows};catalog.provinceFeatures=data;catalog.provinceMigration=data.migration;return data;
}
