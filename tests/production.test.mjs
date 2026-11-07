import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCatalog } from '../js/data/countries.js';
import { attachPlayable } from '../js/data/playable.js';
import { attachResources } from '../js/data/resources.js';
import { attachMilitary, ensureMilitary, militaryValue } from '../js/war/military.js';
import { createGame } from '../js/state.js';
import { ensureEconomy } from '../js/economy.js';
import { ensureResources } from '../js/resources.js';
import { enqueueProduction, updateProduction, productionProgress, productionMissing, gameDay } from '../js/war/production.js';
import { writeSave, readSave } from '../js/save/storage.js';
const read=async n=>JSON.parse(await readFile(new URL(`../data/${n}.json`,import.meta.url)));
const [countries,relations,ids,regions,defs,levels,military,rules,recipes,balance]=await Promise.all(['countries_2000','relations_2000','playable','playable_regions','resources','country_resources_2000','military2000','military_rules','recipes','balance'].map(read));
function setup(id='USA') {
 const c=attachPlayable(createCatalog(countries,relations),ids,regions);attachResources(c,defs,levels);attachMilitary(c,military,rules);c.recipes=recipes;
 const s=createGame(id,c);ensureEconomy(s,balance);ensureMilitary(s,c);ensureResources(s);s.date.day=1;
 Object.keys(s.countries[id].resourceStock).forEach(key=>s.countries[id].resourceStock[key]=100);s.countries[id].treasury=10;
 return {s,c,stats:s.countries[id]};
}
test('สูตรหักของจริงครั้งเดียวและเข้าคิวเรียง ส่งมอบเมื่อครบวันเท่านั้น',()=>{
 const {s,c,stats}=setup();const before=militaryValue(stats.units,rules.weights),tanks=stats.units.tanks;
 assert(enqueueProduction(s,c,'tank'));assert.equal(stats.resourceStock.iron,95);assert.equal(stats.resourceStock.oil,98);
 assert(enqueueProduction(s,c,'warship'));assert.equal(stats.resourceStock.iron,75);assert.equal(stats.resourceStock.oil,93);
 assert.equal(s.production.queue[1].startDay,s.production.queue[0].endDay);
 s.date.day=6;assert.equal(productionProgress(s,s.production.queue[0]),50);assert.equal(updateProduction(s),0);
 s.date.day=11;assert.equal(updateProduction(s),1);assert.equal(stats.units.tanks,tanks+1);assert.equal(militaryValue(stats.units,rules.weights),before+1);
 assert.equal(updateProduction(s),0);assert.equal(stats.units.tanks,tanks+1);
});
test('ของไม่พอและไม่ผ่านเงื่อนไขนิวเคลียร์ไม่หักเงิน เงื่อนไขอยู่ใน JSON',()=>{
 const {s,c,stats}=setup('THA');const old=JSON.stringify(stats);
 assert(!enqueueProduction(s,c,'warhead'));assert.equal(JSON.stringify(stats),old);
 assert(productionMissing(s,c,recipes.find(r=>r.id==='warhead')).length);
 const usa=setup();assert(enqueueProduction(usa.s,usa.c,'warhead'));assert.equal(usa.stats.treasury,9.5);assert.equal(usa.stats.resourceStock.uranium,80);
 stats.resourceStock.iron=0;assert(!enqueueProduction(s,c,'tank'));assert.equal(stats.resourceStock.oil,100);
});
test('คิวและความคืบหน้ารอดจากเซฟ/โหลด และวันที่ไม่เดินคิวไม่เดิน',()=>{
 const {s,c}=setup();let raw;const storage={getItem:()=>raw,setItem:(_,v)=>raw=v};
 assert(writeSave('game',s,c,storage).ok);assert.equal(readSave('game',c,storage).status,'valid');
 enqueueProduction(s,c,'fighter');s.date.day=11;assert.equal(productionProgress(s,s.production.queue[0]),50);
 assert(writeSave('game',s,c,storage).ok);const loaded=readSave('game',c,storage).state;
 assert.deepEqual(loaded.production,s.production);updateProduction(loaded);assert.equal(productionProgress(loaded,loaded.production.queue[0]),50);
 loaded.date.day=21;assert.equal(updateProduction(loaded),1);assert.equal(loaded.countries.USA.units.aircraft,s.countries.USA.units.aircraft+1);
 assert.equal(gameDay({...s,date:{year:2000,month:3,day:1}})-gameDay({...s,date:{year:2000,month:2,day:28}}),2);
});
