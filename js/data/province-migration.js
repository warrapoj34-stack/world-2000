import { RESOURCE_IDS } from './resource-ids.js';
const keys=['roads','services','factory','port'];
export function migrateProvinceSave(state,catalog){
  const old=state.provinces;if(!old||old.schemaVersion===2)return old;
  const defs=catalog.provinceData.countries[state.playerCountryId],mapping=catalog.provinceMigration,b=catalog.provinceData.balance;
  const regions=Object.fromEntries(defs.map(p=>[p.id,{happiness:0,levels:Object.fromEntries(keys.map(k=>[k,0])),lastAlertMonth:null,
    legacy:{income:0,happiness:0,output:{},built:Object.fromEntries(keys.map(k=>[k,0]))},weight:0}]));
  const byId=new Map(defs.map(p=>[p.id,p]));
  for(const [id,region]of Object.entries(old.regions)){
    const link=mapping[id],target=link&&regions[link.target],p=link&&byId.get(link.target);if(!target)throw new Error(`ย้ายจังหวัดเดิมไม่ได้: ${id}`);
    target.happiness+=region.happiness*link.populationShare;target.weight+=link.populationShare;
    target.lastAlertMonth=Math.max(target.lastAlertMonth??0,region.lastAlertMonth??0)||null;
    for(const k of keys){target.levels[k]=Math.max(target.levels[k],region.levels[k]);target.legacy.built[k]+=region.levels[k];}
    target.legacy.income+=link.incomeShare/p.incomeShare*(region.levels.roads*b.roadIncomeBonus+region.levels.factory*b.factoryIncomeBonus+region.levels.port*b.portIncomeBonus);
    target.legacy.happiness+=link.populationShare/p.populationShare*region.levels.services*b.servicesHappiness;
    target.legacy.output[link.resourceId]=(target.legacy.output[link.resourceId]??0)+region.levels.factory*b.factoryUnits;
  }
  for(const p of defs){const r=regions[p.id],l=r.levels;
    r.happiness=r.weight?r.happiness/r.weight:state.countries[state.playerCountryId].happiness;delete r.weight;
    r.legacy.income-=l.roads*b.roadIncomeBonus+l.factory*b.factoryIncomeBonus+l.port*b.portIncomeBonus;
    r.legacy.happiness-=l.services*b.servicesHappiness;
    const output=p.factoryResourceId;r.legacy.output[output]=(r.legacy.output[output]??0)-l.factory*b.factoryUnits;
    for(const id of RESOURCE_IDS)if(r.legacy.output[id]===0)delete r.legacy.output[id];
  }
  const queue=old.queue.map(job=>{const link=mapping[job.provinceId],p=link&&byId.get(link.target);if(!p)throw new Error('ย้ายคิวก่อสร้างเดิมไม่ได้');
    return {...job,provinceId:p.id,legacy:true,incomeFactor:link.incomeShare/p.incomeShare,populationFactor:link.populationShare/p.populationShare,resourceId:link.resourceId};});
  const next={schemaVersion:2,countryId:old.countryId,nextId:old.nextId,regions,queue};
  state.provinces=next;return next;
}
