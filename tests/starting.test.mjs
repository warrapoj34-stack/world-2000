import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createCatalog} from '../js/data/countries.js';import {attachPlayable} from '../js/data/playable.js';import {attachMilitary,ensureMilitary} from '../js/war/military.js';
import {attachResources} from '../js/data/resources.js';import {startingOutlook} from '../js/data/starting.js';import {createGame,validGame} from '../js/state.js';
import {ensureEconomy,advanceMonth} from '../js/economy.js';import {ensureResources} from '../js/resources.js';import {ensurePolicyCards} from '../js/policies.js';import {readSave,writeSave} from '../js/save/storage.js';
const read=async f=>JSON.parse(await readFile(new URL(`../data/${f}.json`,import.meta.url)));
const [countries,relations,ids,regions,military,rules,traits,policies,balance,defs,levels]=await Promise.all(['countries_2000','relations_2000','playable','playable_regions','military2000','military_rules','traits','policies','balance','resources','country_resources_2000'].map(read));
function catalog(){const c=attachPlayable(createCatalog(countries,relations),ids,regions);attachMilitary(c,military,rules);attachResources(c,defs,levels);c.traits=traits;c.policies=policies;return c;}
test('ครบ 40 ประเทศ รายรับเดือนแรกตรงกับการ์ด ไม่ติดลบจริง และเซฟ/โหลดได้ทุกประเทศ',()=>{
 const c=catalog();assert.equal(ids.length,40);assert(ids.includes('CUB')&&ids.includes('VEN')&&ids.includes('YUG'));
 for(const key of ['strength','weakness','special'])assert.equal(new Set(ids.map(id=>traits[id][key].nameTh)).size,40);
 for(const id of ids){
  const forecast=startingOutlook(c.byId.get(id),c,balance),s=createGame(id,c);ensureEconomy(s,balance);ensureResources(s);ensureMilitary(s,c);ensurePolicyCards(s,policies);
  assert(forecast.fiscal.net>=0,id);assert(['ง่าย','กลาง','ยาก'].includes(forecast.difficulty));const before=JSON.stringify(s);
  startingOutlook(c.byId.get(id),c,balance);assert.equal(JSON.stringify(s),before);
  const report=advanceMonth(s,c,balance,()=>.5);assert(Math.abs(report.fiscal.net-forecast.fiscal.net)<1e-9,id);assert(report.fiscal.net>=0,id);assert(validGame(s,c),id);
  let raw;const storage={getItem:()=>raw,setItem:(_,v)=>raw=v};assert(writeSave('game',s,c,storage).ok,id);assert.deepEqual(readSave('game',c,storage).state,s,id);
 }
});
test('เซฟประเทศเดิมที่ถูกนำออกยังคงเงิน ยูนิต และนโยบาย ไม่ต้องเลือกประเทศใหม่',()=>{
 const old=createCatalog(countries,relations);old.newGameCountries=countries.filter(c=>c.playable);
 for(const id of ['NLD','NZL','QAT']){
  const s=createGame(id,old);s.countries[id].treasury=123;s.countries[id].units={tanks:17,ships:2,aircraft:31,cargoShips:4};ensureEconomy(s,balance);s.economy.policy.tax=35;
  let raw;const storage={getItem:()=>raw,setItem:(_,v)=>raw=v};assert(writeSave('game',s,old,storage).ok);
  const c=catalog();assert(!ids.includes(id));assert.throws(()=>createGame(id,c));const loaded=readSave('game',c,storage);assert.equal(loaded.status,'valid');assert.deepEqual(loaded.state,s);
 }
});
