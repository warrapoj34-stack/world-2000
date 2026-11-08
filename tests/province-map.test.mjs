import test from 'node:test';import assert from 'node:assert/strict';import {readFile,stat,access}from'node:fs/promises';
import {geoContains}from'../lib/d3-7.9.0.js';import {createCatalog}from'../js/data/countries.js';import{createGame,validGame}from'../js/state.js';
import{loadProvinces,loadProvinceCountry,ensureProvinces,provinceMultiplier,provinceOutput,updateProvinceConstruction}from'../js/provinces.js';import{readSave,writeSave}from'../js/save/storage.js';
const read=async f=>JSON.parse(await readFile(new URL('../data/'+f,import.meta.url),'utf8'));
const [config,countries,relations]=await Promise.all(['provinces/config.json','countries_2000.json','relations_2000.json'].map(read));
const maps=Object.fromEntries(await Promise.all(Object.entries(config.files).map(async([id,file])=>[id,await read('provinces/'+file)])));
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function catalog(id){const c=createCatalog(countries,relations);c.provinceData={...config,countries:{[id]:maps[id].features.map(f=>f.properties)}};c.provinceFeatures=maps[id];c.provinceMigration=maps[id].migration;return c;}
test('ขอบเขตจริง 226 เขต ไฟล์ละไม่เกิน 300 KB ประชากรจำนวนเต็มรวมตรงประเทศ และพิกัดโฟกัสอยู่ในเขต',async()=>{
 for(const [id,count]of Object.entries({THA:76,CHN:31,USA:50,JPN:47,FRA:22})){
  const data=maps[id];assert.equal(data.features.length,count);assert((await stat(new URL('../data/provinces/'+config.files[id],import.meta.url))).size<=300000);
  const total=Math.round(countries.find(c=>c.id===id).population*1e6);assert.equal(data.populationTotal,total);assert.equal(data.features.reduce((s,f)=>s+f.properties.population,0),total);
  for(const f of data.features){const p=f.properties;assert(Number.isSafeInteger(p.population)&&Number.isSafeInteger(p.censusPopulation));assert(p.nameTh&&p.capital&&Number.isInteger(p.development));assert.equal(typeof p.hasPort,'boolean');assert(geoContains(f,p.point),p.id);}
 }
 assert(!maps.THA.features.some(f=>f.id==='TH-38'));assert(!maps.USA.features.some(f=>f.id==='US-DC'));assert(maps.THA.migration['TH-43']);assert(maps.FRA.migration['FR-75'].target==='FR-R11');
 await assert.rejects(access(new URL('../data/provinces_2000.json',import.meta.url)));
});
test('lazy load เฉพาะประเทศที่เลือก ใช้ข้อมูลเดียวกับแผนที่ และปล่อยข้อมูลประเทศก่อนหน้า',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async url=>{const path=String(url);calls.push(path);return {ok:true,json:async()=>path.endsWith('config.json')?structuredClone(config):structuredClone(Object.values(maps).find(d=>path.endsWith(config.files[d.countryId])))};};
 try{
  const c=createCatalog(countries,relations);c.resourceDefinitions=['oil','gas','food','forest','fish','iron','gold','coal','rare_earths','copper','freshwater'].map(id=>({id}));
  await loadProvinces(c);assert.equal(calls.length,1);assert.equal(Object.keys(c.provinceData.countries).length,0);
  await loadProvinceCountry(c,'THA');assert.equal(calls.length,2);assert.strictEqual(c.provinceData.countries.THA[0],c.provinceFeatures.features[0].properties);
  await loadProvinceCountry(c,'THA');assert.equal(calls.length,2);await loadProvinceCountry(c,'USA');assert.deepEqual(Object.keys(c.provinceData.countries),['USA']);
  const current=c.provinceFeatures;globalThis.fetch=async()=>({ok:false});await assert.rejects(loadProvinceCountry(c,'FRA'));assert.strictEqual(c.provinceFeatures,current);
  await loadProvinceCountry(c,'CUB');assert.equal(c.provinceFeatures,null);assert.deepEqual(c.provinceData.countries,{});
 }finally{globalThis.fetch=original;}
});
test('ย้าย P3-B เดิมทั้ง 5 ประเทศโดยเก็บเงิน คลัง นาฬิกา ผลรายได้ ผลผลิต และคิวที่จ่ายไปแล้ว',()=>{
 for(const id of Object.keys(maps)){
  const c=catalog(id),s=createGame(id,c),data=maps[id],b=config.balance,sourceIds=Object.keys(data.migration);
  s.clock={speed:2,userPaused:true,progress:.42};s.countries[id].units={tanks:10,ships:2,aircraft:3,cargoShips:4};s.provinces={countryId:id,nextId:10,queue:[],regions:{}};
  const keys=id==='FRA'?['FR-75','FR-92']:id==='USA'?['US-MD','US-DC']:sourceIds.slice(0,2);
  let expected=1,services=0;const output={};
  for(const [i,key]of sourceIds.entries()){
   const link=data.migration[key],levels={roads:i%4,services:(i+1)%4,factory:(i+2)%4,port:0};
   if(keys.includes(key))levels.factory=Math.min(2,levels.factory);
   s.provinces.regions[key]={happiness:50+i%30,levels,lastAlertMonth:null};
   expected+=link.incomeShare*(levels.roads*b.roadIncomeBonus+levels.factory*b.factoryIncomeBonus);services+=link.populationShare*levels.services*b.servicesHappiness;
   output[link.resourceId]=(output[link.resourceId]??0)+levels.factory*b.factoryUnits;
  }
  const base=Math.floor(Date.UTC(2000,0,1)/86400000);
  for(const [i,key]of keys.entries())s.provinces.queue.push({id:i+1,provinceId:key,project:'factory',startDay:base,endDay:base+30+i});
  const cash=structuredClone(s.countries[id]),clock=structuredClone(s.clock),dates=structuredClone(s.date);
  assert(validGame(s,c));ensureProvinces(s,c);assert.equal(s.provinces.schemaVersion,2);assert.equal(Object.keys(s.provinces.regions).length,config.counts[id]);
  assert.deepEqual(s.countries[id],cash);assert.deepEqual(s.clock,clock);assert.deepEqual(s.date,dates);near(provinceMultiplier(s,c),expected);
  const produced=provinceOutput(s,c);for(const resource of Object.keys(produced))near(produced[resource],output[resource]??0);
  near(data.features.reduce((n,f)=>{const r=s.provinces.regions[f.id];return n+f.properties.populationShare*(r.levels.services*b.servicesHappiness+r.legacy.happiness);},0),services);
  assert.equal(s.provinces.queue.length,2);assert(validGame(s,c));const snapshot=structuredClone(s);ensureProvinces(s,c);assert.deepEqual(s,snapshot);
  let raw;const storage={getItem:()=>raw,setItem:(_,v)=>raw=v};assert(writeSave('game',s,c,storage).ok);assert.deepEqual(readSave('game',c,storage).state,s);
  s.date={year:2000,month:3,day:1};assert.equal(updateProvinceConstruction(s,c),2);assert.equal(updateProvinceConstruction(s,c),0);assert.deepEqual(s.countries[id],cash);
  const final=provinceOutput(s,c);for(const key of keys){const link=data.migration[key];output[link.resourceId]=(output[link.resourceId]??0)+b.factoryUnits;expected+=link.incomeShare*b.factoryIncomeBonus;}
  for(const resource of Object.keys(final))near(final[resource],output[resource]??0);near(provinceMultiplier(s,c),expected);assert(validGame(s,c));
 }
});
test('ประเทศนอกชุดทดลองไม่เกิดสถานะจังหวัด และไฟล์แผนที่ไม่ถูกใส่ใน precache',async()=>{
 const s=createGame('CUB',createCatalog(countries,relations)),c=createCatalog(countries,relations);c.provinceData={...config,countries:{}};
 assert.equal(ensureProvinces(s,c),null);assert(!s.provinces);assert(validGame(s,c));
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8'),shell=sw.match(/const APP_SHELL = \[([\s\S]*?)\];/)[1];
 for(const file of Object.values(config.files))assert(!shell.includes(`./data/provinces/${file}`));
});
