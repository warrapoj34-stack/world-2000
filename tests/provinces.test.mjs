import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createCatalog} from '../js/data/countries.js';import {attachPlayable} from '../js/data/playable.js';import {attachMilitary,ensureMilitary} from '../js/war/military.js';import {attachResources} from '../js/data/resources.js';
import {createGame,validGame} from '../js/state.js';import {ensureEconomy,advanceMonth} from '../js/economy.js';import {ensurePolicyCards} from '../js/policies.js';import {ensureResources,countryResourceProduction} from '../js/resources.js';
import {ensureProvinces,provinceMultiplier,syncProvinceHappiness,projectCost,projectMissing,buildProvince,updateProvinceConstruction,constructionProgress,validProvinces} from '../js/provinces.js';
import {writeSave,readSave} from '../js/save/storage.js';import {exportCapacity,setExportSetting} from '../js/market.js';
const read=async f=>JSON.parse(await readFile(new URL(`../data/${f}.json`,import.meta.url)));
const [countries,relations,ids,regions,military,rules,traits,policies,balance,defs,levels,config]=await Promise.all(['countries_2000','relations_2000','playable','playable_regions','military2000','military_rules','traits','policies','balance','resources','country_resources_2000','provinces/config'].map(read));
const maps=Object.fromEntries(await Promise.all(Object.entries(config.files).map(async([id,file])=>[id,await read('provinces/'+file.replace('.json',''))])));
const provinceData={...config,countries:Object.fromEntries(Object.entries(maps).map(([id,data])=>[id,data.features.map(f=>f.properties)]))};
function setup(id='THA'){
 const c=attachPlayable(createCatalog(countries,relations),ids,regions);attachMilitary(c,military,rules);attachResources(c,defs,levels);Object.assign(c,{traits,policies,provinceData,provinceMigration:maps[id]?.migration});
 const s=createGame(id,c);ensureEconomy(s,balance);ensurePolicyCards(s,policies);ensureMilitary(s,c);ensureResources(s);s.date.day=1;
 for(const key of Object.keys(s.countries[id].resourceStock))s.countries[id].resourceStock[key]=100;
 return {s,c,stats:s.countries[id],list:provinceData.countries[id]};
}
function addDays(s,days){const d=new Date(Date.UTC(s.date.year,s.date.month-1,s.date.day+days));s.date={year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()};}
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('5 ประเทศครบ 226 เขตตามขอบเขตปี 2000 สัดส่วนประชากรและรายได้ครบ 100%',()=>{
 for(const [id,count]of Object.entries({THA:76,USA:50,JPN:47,FRA:22,CHN:31})){
  const {s,c,stats,list}=setup(id),before=structuredClone(stats);assert.equal(list.length,count);assert.equal(new Set(list.map(p=>p.id)).size,count);
  assert(list.every(p=>p.nameTh&&p.point.every(Number.isFinite)&&p.development>=1&&p.development<=5));
  near(list.reduce((n,p)=>n+p.populationShare,0),1);near(list.reduce((n,p)=>n+p.incomeShare,0),1);
  ensureProvinces(s,c);near(provinceMultiplier(s,c),1);assert.deepEqual(stats,before);assert(validGame(s,c));
 }
 assert(!provinceData.countries.THA.some(p=>p.id==='TH-38'));assert(!provinceData.countries.USA.some(p=>p.id==='US-DC'));
});
test('ถนนหักเงินจริงและทรัพยากรครั้งเดียว งานเดินตามวันที่ และเพิ่มรายได้เฉพาะเมื่อเสร็จ',()=>{
 for(const id of ['THA','USA']){
  const {s,c,stats,list}=setup(id),p=list[0],before=structuredClone(stats),cost=projectCost(s,c,p.id,'roads');
  assert(buildProvince(s,c,p.id,'roads'));near(stats.treasury,before.treasury-cost.money);for(const [key,n]of Object.entries(cost.resources))assert.equal(stats.resourceStock[key],before.resourceStock[key]-n);
  const cash=stats.treasury;assert(!buildProvince(s,c,p.id,'roads'));assert.equal(stats.treasury,cash);near(provinceMultiplier(s,c),1);
  assert.equal(updateProvinceConstruction(s,c),0);addDays(s,15);assert.equal(constructionProgress(s,s.provinces.queue[0]),50);assert.equal(updateProvinceConstruction(s,c),0);
  addDays(s,15);assert.equal(updateProvinceConstruction(s,c),1);assert.equal(updateProvinceConstruction(s,c),0);near(provinceMultiplier(s,c),1+p.incomeShare*.08);
  assert.equal(stats.treasury,cash);assert(validGame(s,c));
 }
});
test('ไม่มีเงิน/ของไม่พอ/จังหวัดไม่มีทะเล สั่งแล้วไม่หักของ และท่าเรือเพิ่มเรือสินค้าจริงครั้งเดียว',()=>{
 const {s,c,stats,list}=setup(),inland=list.find(p=>!p.coastal),coast=list.find(p=>p.coastal),initial=structuredClone(stats);
 assert(!buildProvince(s,c,inland.id,'port'));assert.deepEqual(stats,initial);
 stats.resourceStock.iron=0;assert(projectMissing(s,c,coast.id,'roads').some(x=>x.includes('ขาด')));assert(!buildProvince(s,c,coast.id,'roads'));stats.resourceStock.iron=100;
 const savedMoney=stats.treasury;stats.treasury=0;assert(!buildProvince(s,c,coast.id,'roads'));assert.equal(stats.resourceStock.iron,100);stats.treasury=savedMoney;
 const ships=stats.units.cargoShips??0;assert(buildProvince(s,c,coast.id,'port'));addDays(s,90);assert.equal(updateProvinceConstruction(s,c),1);assert.equal(stats.units.cargoShips,ships+1);assert.equal(exportCapacity(s,c,balance).units,(ships+1)*20);
 updateProvinceConstruction(s,c);assert.equal(stats.units.cargoShips,ships+1);
 s.provinces.regions[coast.id].levels.roads=3;assert(!buildProvince(s,c,coast.id,'roads'));
});
test('รายได้ประเทศรวมจังหวัดจริงโดยไม่บวกซ้ำ โรงงานเข้าคลัง และความสุขรวมแบบถ่วงประชากร',()=>{
 for(const id of ['THA','USA']){
  const {s,c,list}=setup(id);ensureProvinces(s,c);const baseline=structuredClone(s),p=list[0];
  s.provinces.regions[p.id].levels.roads=1;s.provinces.regions[p.id].levels.factory=1;s.provinces.regions[p.id].levels.services=1;
  const before=s.countries[id].treasury,stock={...s.countries[id].resourceStock},output=countryResourceProduction(s,c,balance);
  const report=advanceMonth(s,c,balance,()=>.5),normal=advanceMonth(baseline,c,balance,()=>.5);
  near(report.fiscal.revenue,normal.fiscal.revenue*(1+p.incomeShare*.12));near(report.after.treasury-before,report.fiscal.net+report.fiscal.borrowed);
  for(const key of Object.keys(stock))assert.equal(s.countries[id].resourceStock[key],stock[key]+output[key]);
  near(s.countries[id].happiness,list.reduce((sum,p)=>sum+p.populationShare*s.provinces.regions[p.id].happiness,0));
  assert(s.provinces.regions[p.id].happiness>baseline.provinces.regions[p.id].happiness);
 }
});
test('จังหวัดไม่ได้พัฒนาค่อยๆ เสียความสุข แจ้งข่าวปัญหาโดยไม่ท่วมข่าว และรับผลนโยบาย/เหตุการณ์เดิม',()=>{
 const {s,c,stats,list}=setup();ensureProvinces(s,c);const p=list[0],before=stats.happiness;
 syncProvinceHappiness(s,c,true);near(stats.happiness,before-.15);
 stats.happiness+=5;syncProvinceHappiness(s,c);near(s.provinces.regions[p.id].happiness,before-.15+5);
 for(const region of Object.values(s.provinces.regions))region.happiness=20;stats.happiness=20;
 syncProvinceHappiness(s,c,true);assert.equal(s.news.history.length,3);assert(s.news.history.every(n=>n.text.includes('ความสุขต่ำ')));
 const alerted=list.filter(p=>s.provinces.regions[p.id].lastAlertMonth!==null);assert.equal(alerted.length,3);
 syncProvinceHappiness(s,c,true);assert(alerted.every(p=>s.provinces.regions[p.id].lastAlertMonth===2000*12+1));
});
test('เซฟ/โหลดคืนความคืบหน้า คิว และจังหวัดเดิม เซฟเก่าเติมจังหวัดโดยไม่เปลี่ยนเงินหรือนาฬิกา',()=>{
 for(const id of ['THA','USA']){
  const {s,c,list}=setup(id);s.clock={progress:.3,speed:4,userPaused:true};const before=structuredClone(s.countries[id]);ensureProvinces(s,c);assert.deepEqual(s.countries[id],before);
  assert(buildProvince(s,c,list[0].id,'factory'));addDays(s,20);const progress=constructionProgress(s,s.provinces.queue[0]);let raw;const storage={getItem:()=>raw,setItem:(_,v)=>raw=v};assert(writeSave('game',s,c,storage).ok);
  const loaded=readSave('game',c,storage);assert.equal(loaded.status,'valid');assert.deepEqual(loaded.state,s);ensureProvinces(loaded.state,c);assert.equal(constructionProgress(loaded.state,loaded.state.provinces.queue[0]),progress);assert.deepEqual(loaded.state.clock,s.clock);
  addDays(loaded.state,40);assert.equal(updateProvinceConstruction(loaded.state,c),1);assert.equal(loaded.state.provinces.regions[list[0].id].levels.factory,1);
 }
 const other=setup('CUB');assert.equal(ensureProvinces(other.s,other.c),null);assert(validGame(other.s,other.c));
});
test('ปฏิเสธเซฟจังหวัดหรือคิวเสียหาย',()=>{
 const {s,c,list}=setup();ensureProvinces(s,c);
 for(const change of [x=>x.provinces.countryId='USA',x=>x.provinces.regions[list[0].id].happiness=-1,x=>x.provinces.regions[list[0].id].levels.roads=4,x=>delete x.provinces.regions[list[0].id],x=>x.provinces.queue.push({id:0,provinceId:list[0].id,project:'roads',startDay:1,endDay:2})]){
  const corrupt=structuredClone(s);change(corrupt);assert(!validProvinces(corrupt.provinces,corrupt,c));assert(!validGame(corrupt,c));
 }
});
test('ผลผลิตโรงงานขายผ่านส่งออกเดิมตามกำลังเรือ และเงินเข้าครั้งเดียว',()=>{
 const {s,c,stats,list}=setup();ensureProvinces(s,c);const p=list.find(p=>p.factoryResourceId==='iron');
 s.provinces.regions[p.id].levels.factory=1;s.provinces.regions[p.id].levels.roads=1;stats.units.cargoShips=1;
 setExportSetting(s,'iron',{enabled:true,share:1},balance);const output=countryResourceProduction(s,c,balance),cash=stats.treasury,stock=stats.resourceStock.iron;
 const report=advanceMonth(s,c,balance,()=>.5),sale=s.market.lastExports.items.find(item=>item.resourceId==='iron');
 assert.equal(sale.units,Math.min(20,output.iron));assert.equal(s.countries.THA.resourceStock.iron,stock+output.iron-sale.units);
 near(s.countries.THA.treasury-cash,report.fiscal.net+report.fiscal.borrowed);near(report.fiscal.resourceIncome,sale.value);
 assert.equal(s.exportVisuals.length,1);assert.equal(s.exportVisuals[0].units,sale.units);
});
