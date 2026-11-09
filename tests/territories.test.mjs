import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat,access} from 'node:fs/promises';
import {createCatalog} from '../js/data/countries.js';
import {attachResources} from '../js/data/resources.js';
import {createGame,validGame} from '../js/state.js';
import {ensureEconomy,advanceMonth} from '../js/economy.js';
import {ensureResources,allCountryResourceProduction} from '../js/resources.js';
import {loadTerritories,loadTerritoryMaps} from '../js/data/territories.js';
import {ensureTerritories,provinceOwner,territorySummary,territoryIncomeMultiplier,createTerritoryController,territoryMonth} from '../js/territories.js';
import {ensureProvinceEvents,eligibleProvinceEvents,drawProvinceEvent,chooseProvinceEvent} from '../js/events/province-events.js';
import {writeSave,readSave} from '../js/save/storage.js';
const read=async file=>JSON.parse(await readFile(new URL('../data/'+file+'.json',import.meta.url),'utf8'));
const [countries,relations,resources,levels,balance,index,events]=await Promise.all(['countries_2000','relations_2000','resources','country_resources_2000','balance','provinces/index','events-province'].map(read));
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function setup(id='THA'){
  const c=attachResources(createCatalog(countries,relations),resources,levels);
  c.territoryData=index;c.territoryById=new Map(Object.values(index.countries).flat().map(p=>[p.id,p]));c.provinceEvents=structuredClone(events);
  const s=createGame(id,c);ensureEconomy(s,balance);ensureResources(s);ensureTerritories(s);return {s,c};
}
function storage(){let raw=null;return{getItem:()=>raw,setItem:(_,value)=>raw=value};}
test('226 ดินแดน มีข้อมูลแค่ 6 ช่อง share รวม 100% และเส้นประเทศละไม่เกิน 300KB',async()=>{
 for(const [id,count]of Object.entries({THA:76,CHN:31,USA:50,JPN:47,FRA:22})){
  const rows=index.countries[id],map=await read('provinces/'+index.files[id].replace('.json',''));
  assert.equal(rows.length,count);assert.equal(rows.reduce((n,p)=>n+Math.round(p.share*100),0),10000);
  assert.equal(map.features.length,count);assert((await stat(new URL('../data/provinces/'+index.files[id],import.meta.url))).size<300000);
  for(const p of rows){assert.deepEqual(Object.keys(p).sort(),['id','nameTh','owner','share','resourceId','borders'].sort());assert.equal(p.owner,id);assert(p.share>0);assert(p.borders.every(code=>countries.some(c=>c.id===code)));}
  for(const f of map.features)assert.deepEqual(f.properties,{id:f.id});
 }
 const {c}=setup();assert.deepEqual(c.territoryById.get('TH-50').borders,['MMR']);assert.deepEqual(c.territoryById.get('TH-14').borders,[]);assert.deepEqual(c.territoryById.get('US-CA').borders,['MEX']);assert(index.countries.JPN.every(p=>!p.borders.length));
 for(const file of ['js/provinces.js','js/ui/province-screen.js','js/data/province-migration.js','css/provinces.css','data/provinces/config.json'])await assert.rejects(access(new URL('../'+file,import.meta.url)));
});
test('โอนเชียงใหม่: รายรับลดตาม share ประชากรย้ายจริง ไม่มีเงินหรือผลผลิตซ้ำ แล้วโอนกลับได้',()=>{
 const {s,c}=setup(),before=structuredClone(s),p=c.territoryById.get('TH-50'),share=p.share/100,api=createTerritoryController(s,c);
 assert(api.transferProvince(p.id,'MMR'));assert.equal(provinceOwner(s,p),'MMR');near(territoryIncomeMultiplier(s,c,'THA'),1-share);
 near(s.countries.THA.population+s.countries.MMR.population,before.countries.THA.population+before.countries.MMR.population);
 near(s.countries.THA.population,Math.round(before.countries.THA.population*(1-share)*1e6)/1e6);
 const transferredPop=s.countries.THA.population;assert(!api.transferProvince(p.id,'MMR'));assert.equal(s.countries.THA.population,transferredPop);
 const a=advanceMonth(s,c,balance,()=>.5),b=advanceMonth(before,c,balance,()=>.5);near(a.fiscal.revenue,b.fiscal.revenue*(1-share));
 const summary=territorySummary(s,c);assert.equal(summary.held,75);near(summary.percent,100-p.share);
 assert(api.transferProvince(p.id,'THA'));near(territoryIncomeMultiplier(s,c,'THA'),1);assert.deepEqual(s.territories.owners,{});assert(validGame(s,c));assert.throws(()=>api.transferProvince('missing','THA'));assert.throws(()=>api.transferProvince(p.id,'XYZ'));
});
test('ประเทศอื่นได้ส่วนรายรับเพิ่มจากดินแดนต่างชาติ และผลผลิตจำนวนเต็มรวมทั้งโลกเท่าเดิม',()=>{
 const {s,c}=setup('MMR'),before=structuredClone(s),p=c.territoryById.get('TH-10');
 const sourceGDP=s.countries.THA.gdp,receiverGDP=s.countries.MMR.gdp;
 createTerritoryController(s,c).transferProvince(p.id,'MMR');near(territoryIncomeMultiplier(s,c,'MMR'),1+sourceGDP*p.share/100/receiverGDP);
 const old=allCountryResourceProduction(before,c,balance),now=allCountryResourceProduction(s,c,balance);
 for(const r of resources){assert.equal(Object.values(old).reduce((n,p)=>n+p[r.id],0),Object.values(now).reduce((n,p)=>n+p[r.id],0));assert(Object.values(now).every(p=>Number.isSafeInteger(p[r.id])));}
 assert(now.THA.food<old.THA.food);assert(now.MMR.food>old.MMR.food);
 const x=advanceMonth(s,c,balance,()=>.5),y=advanceMonth(before,c,balance,()=>.5);assert(x.fiscal.revenue>y.fiscal.revenue);assert(validGame(s,c));
});
test('ความสุขและเงินกลับไปคำนวณระดับประเทศ ข้ามสิ่งก่อสร้างเก่าทุกแบบโดยไม่หักเงินหรือเดินคิว',()=>{
 const {s,c}=setup(),plain=structuredClone(s);s.provinces={schemaVersion:2,regions:'ข้อมูลเก่าที่ข้ามได้',queue:[{project:'port',endDay:0}]};
 const store=storage();assert(validGame(s,c));assert(writeSave('game',s,c,store).ok);assert(!JSON.parse(store.getItem()).state.provinces);
 const record=JSON.parse(store.getItem());record.state.provinces={queue:[1,2,3]};store.setItem('',JSON.stringify(record));const loaded=readSave('game',c,store);assert.equal(loaded.status,'valid');assert(!loaded.state.provinces);
 const a=advanceMonth(loaded.state,c,balance,()=>.5),b=advanceMonth(plain,c,balance,()=>.5);assert.deepEqual(a,b);assert.deepEqual(loaded.state.countries,plain.countries);
});
test('โหลด metadata ครั้งเดียว lazy load เฉพาะเส้นที่จำเป็น และใช้ข้อมูลอ้างอิงชุดเดียว',async()=>{
 const {s,c}=setup(),calls=[],original=globalThis.fetch;
 globalThis.fetch=async url=>{const file=String(url).split('/').at(-1);calls.push(file);return{ok:true,json:async()=>file==='index.json'?structuredClone(index):read('provinces/'+file.replace('.json',''))};};
 try{await loadTerritories(c);assert.deepEqual(calls,['index.json']);await loadTerritoryMaps(s,c);assert.deepEqual(calls,['index.json','th.json']);assert.strictEqual(c.territoryFeatures[0].properties,c.territoryById.get(c.territoryFeatures[0].id));await loadTerritoryMaps(s,c);assert.equal(calls.length,2);
 createTerritoryController(s,c).transferProvince('JP-13','THA');await loadTerritoryMaps(s,c);assert(calls.includes('jp.json'));assert.equal(c.territoryFeatures.length,77);
 const other=createGame('CUB',c);await loadTerritoryMaps(other,c);assert.equal(c.territoryFeatures.length,0);assert.equal(c.territoryMaps.size,0);
 }finally{globalThis.fetch=original;}
});
test('เหตุการณ์เหมาะกับพื้นที่: น้ำท่วมอยุธยาตามฤดู แผ่นดินไหวญี่ปุ่น และข้อพิพาทเฉพาะชายแดน',()=>{
 const {s,c}=setup();assert(!eligibleProvinceEvents(s,c).some(x=>x.event.id==='thai-central-flood'));
 s.date.month=8;const pool=eligibleProvinceEvents(s,c);assert(pool.some(x=>x.event.id==='thai-central-flood'&&x.province.id==='TH-14'));assert(!pool.some(x=>x.event.id==='japan-quake'));assert(pool.filter(x=>x.event.id==='border-claim').every(x=>x.province.borders.length));assert(!pool.some(x=>x.event.id==='border-claim'&&x.province.id==='TH-14'));
 const japan=setup('JPN');assert(eligibleProvinceEvents(japan.s,japan.c).some(x=>x.event.id==='japan-quake'));assert(!eligibleProvinceEvents(japan.s,japan.c).some(x=>x.event.id==='border-claim'));
});
test('ข้อพิพาทมี 3 ตัวเลือกจริง ใช้กำลังยังปิด โอนได้จริง และไม่เกิดซ้ำภายในเดือนแม้เซฟ/โหลด',()=>{
 const {s,c}=setup();c.provinceEvents.chance=1;c.provinceEvents.events=c.provinceEvents.events.filter(e=>e.id==='border-claim');
 const pending=drawProvinceEvent(s,c,()=>0),p=c.territoryById.get(pending.provinceId);assert(p.borders.includes(pending.claimant));assert.equal(c.provinceEvents.events[0].options.length,3);assert(c.provinceEvents.events[0].disabledChoice.includes('รอบสงคราม'));assert.equal(chooseProvinceEvent(s,c,balance,'force'),null);
 const entry=chooseProvinceEvent(s,c,balance,'cede');assert(entry);assert.equal(provinceOwner(s,p),pending.claimant);assert(s.news.history.some(n=>n.provinceId===p.id));assert.equal(drawProvinceEvent(s,c,()=>0),null);
 const store=storage();assert(writeSave('game',s,c,store).ok);const loaded=readSave('game',c,store);assert.equal(loaded.status,'valid');assert.equal(provinceOwner(loaded.state,p),pending.claimant);assert.equal(drawProvinceEvent(loaded.state,c,()=>0),null);
});
test('เจรจาหรือจ่ายเงินรักษาพื้นที่ เงินไม่พอเลือกจ่ายไม่ได้ และไม่สร้างหนี้ใหม่เงียบๆ',()=>{
 for(const option of ['negotiate','pay']){const {s,c}=setup();c.provinceEvents.chance=1;c.provinceEvents.events=c.provinceEvents.events.filter(e=>e.id==='border-claim');const pending=drawProvinceEvent(s,c,()=>0),before=s.countries.THA.treasury;s.countries.THA.treasury=0;if(option==='pay')assert.equal(chooseProvinceEvent(s,c,balance,option),null);s.countries.THA.treasury=before;assert(chooseProvinceEvent(s,c,balance,option));assert.equal(provinceOwner(s,c.territoryById.get(pending.provinceId)),'THA');if(option==='pay')assert(s.countries.THA.treasury<before);}
});
test('ความเสียหายผลผลิตเป็นชั่วคราว หมดอายุจริง และแหล่งแร่เพิ่มคลังจริง',()=>{
 const {s,c}=setup(),base=allCountryResourceProduction(s,c,balance);ensureProvinceEvents(s).effects.push({provinceId:'TH-10',production:0,untilMonth:territoryMonth(s)+2});const damaged=allCountryResourceProduction(s,c,balance);assert(damaged.THA.food<base.THA.food);s.date.month+=2;assert.deepEqual(allCountryResourceProduction(s,c,balance),base);
 const mine=setup('USA');mine.c.provinceEvents.chance=1;mine.c.provinceEvents.events=mine.c.provinceEvents.events.filter(e=>e.id==='mineral-find');
 const pending=drawProvinceEvent(mine.s,mine.c,()=>0),p=mine.c.territoryById.get(pending.provinceId),before=mine.s.countries.USA.resourceStock[p.resourceId];assert(chooseProvinceEvent(mine.s,mine.c,balance,'extract'));assert.equal(mine.s.countries.USA.resourceStock[p.resourceId],before+30);
});
test('ความไม่สงบที่ทิ้งไว้นานเสี่ยงย้ายไปเพื่อนบ้าน ไม่มีการเดินเวลาด้วยตัวจับเวลาใหม่',()=>{
 const {s,c}=setup();const events=ensureProvinceEvents(s);events.unrest['TH-50']={since:territoryMonth(s)};s.date.month=8;c.provinceEvents.chance=0;drawProvinceEvent(s,c,()=>0);assert.equal(provinceOwner(s,c.territoryById.get('TH-50')),'MMR');assert(!events.unrest['TH-50']);assert(s.news.history.some(n=>n.id.startsWith('secession:')));assert(validGame(s,c));
});
test('โอนข้ามหลายประเทศแล้วโหลดเซฟ ประชากรทั้งโลกไม่เพิ่ม และโอนคืนได้ครบ',()=>{
 const {s,c}=setup(),api=createTerritoryController(s,c),total=()=>Object.values(s.countries).reduce((n,p)=>n+Math.round(p.population*1e6),0),before=total();
 for(const [id,owner]of [['TH-50','MMR'],['US-CA','THA'],['TH-50','USA'],['US-CA','MMR']]){api.transferProvince(id,owner);assert.equal(total(),before);}
 const store=storage();assert(writeSave('game',s,c,store).ok);const loaded=readSave('game',c,store);assert.deepEqual(loaded.state.territories,s.territories);
 api.transferProvince('TH-50','THA');api.transferProvince('US-CA','USA');assert.equal(total(),before);for(const id of ['THA','USA','MMR'])near(s.countries[id].population,c.byId.get(id).population);
});
test('ปัญหาความไม่สงบหลายพื้นที่กับเหตุการณ์ใหม่รวมกันไม่เกินหนึ่งเรื่องต่อเดือน',()=>{
 const {s,c}=setup(),data=ensureProvinceEvents(s);for(const id of ['TH-50','TH-43','TH-14'])data.unrest[id]={since:territoryMonth(s)};s.date.month=8;c.provinceEvents.chance=1;c.provinceEvents.secessionChance=0;
 assert(drawProvinceEvent(s,c,()=>0));assert.equal(s.news.history.length,1);assert.equal(data.pending.eventId,'local-unrest');assert.equal(drawProvinceEvent(s,c,()=>0),null);assert.equal(s.news.history.length,1);
});
