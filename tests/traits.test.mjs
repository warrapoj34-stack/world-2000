import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCatalog } from '../js/data/countries.js';
import { attachResources } from '../js/data/resources.js';
import { attachMilitary, ensureMilitary } from '../js/war/military.js';
import { createGame } from '../js/state.js';
import { ensureEconomy, advanceMonth } from '../js/economy.js';
import { ensureResources, sellResource, resourceProduction } from '../js/resources.js';
import { enqueueProduction, recipeCosts } from '../js/war/production.js';
import { traitModifiers, activateTrait, TRAIT_TYPES } from '../js/traits.js';
import { readSave, writeSave } from '../js/save/storage.js';
const read=async n=>JSON.parse(await readFile(new URL(`../data/${n}.json`,import.meta.url)));
const [countries,relations,defs,levels,military,rules,recipes,traits,balance,ids]=await Promise.all(['countries_2000','relations_2000','resources','country_resources_2000','military2000','military_rules','recipes','traits','balance','playable'].map(read));
function setup(id){const c=createCatalog(countries,relations);c.newGameCountries=ids.map(id=>c.byId.get(id));attachResources(c,defs,levels);attachMilitary(c,military,rules);c.recipes=recipes;c.traits=traits;const s=createGame(id,c);ensureMilitary(s,c);ensureResources(s);ensureEconomy(s,balance);s.date.day=1;for(const k of Object.keys(s.countries[id].resourceStock))s.countries[id].resourceStock[k]=100;return{s,c,stats:s.countries[id]};}
test('ครบ 60 ประเทศ แต่ละประเทศมีผลดีและผลเสียด้วยชนิดมาตรฐาน',()=>{
 assert.equal(Object.keys(traits).length,60);for(const id of ids){const data=traits[id];for(const key of ['strength','weakness','special'])assert(data[key].effects.every(e=>TRAIT_TYPES.includes(e.type)));
 const good=data.strength.effects[0],bad=data.weakness.effects[0];assert(good.type==='productionCost'?good.percent<0:good.percent>0);assert(bad.type==='productionCost'?bad.percent>0:bad.percent<0);assert.equal(data.special.cooldownYears,2);}
});
test('ซาอุดีอาระเบีย ขายน้ำมัน +20% จริง และภาษีลดจริง',()=>{
 const{s,c,stats}=setup('SAU');const money=stats.treasury;assert(Math.abs(sellResource(s,'oil',balance,c)-.036)<1e-10);assert(Math.abs(stats.treasury-money-.036)<1e-10);
 const expected=stats.gdp*s.economy.policy.tax/100/12*.9;advanceMonth(s,c,balance,()=>1);assert(Math.abs(s.economy.lastReport.fiscal.revenue-expected)<1e-10);
});
test('จีน ลดต้นทุนผลิตจริง ญี่ปุ่นการบินถูกลงแต่รถถังแพงขึ้น',()=>{
 const china=setup('CHN');assert(enqueueProduction(china.s,china.c,'tank'));assert.equal(china.stats.resourceStock.iron,96);assert.equal(china.stats.resourceStock.oil,98);
 const japan=setup('JPN');assert.equal(recipeCosts(japan.s,japan.c,recipes.find(r=>r.id==='tank')).resources.iron,7);assert.equal(recipeCosts(japan.s,japan.c,recipes.find(r=>r.id==='fighter')).resources.iron,7);
});
test('แคนาดาผลผลิตป่าไม้เพิ่มจริง ไทยขายอาหารดีขึ้นและมีภาษีเป็นข้อเสีย',()=>{
 const canada=setup('CAN'),stars=canada.c.resourceLevels.get('CAN');const expected=resourceProduction(canada.stats,stars,balance,traitModifiers(canada.s,canada.c)).forest;
 advanceMonth(canada.s,canada.c,balance,()=>1);assert.equal(canada.s.countries.CAN.resourceStock.forest,100+expected);assert(expected>resourceProduction(canada.stats,stars,balance).forest);
 const thai=setup('THA');assert.equal(sellResource(thai.s,'food',balance,thai.c),.012);assert.equal(traitModifiers(thai.s,thai.c).taxIncome,.92);
});
test('ความสามารถหมดอายุ คูลดาวน์สองปีปฏิทิน เซฟเก่าโหลดได้และเซฟใหม่จำวัน',()=>{
 const{s,c}=setup('SAU');let raw;const storage={getItem:()=>raw,setItem:(_,v)=>raw=v};assert(writeSave('game',s,c,storage).ok);assert.equal(readSave('game',c,storage).status,'valid');
 assert(activateTrait(s,c));assert(!activateTrait(s,c));assert(traitModifiers(s,c).salePrice.oil>1.2);assert(traitModifiers(s,c).taxIncome<.9);
 assert(writeSave('game',s,c,storage).ok);assert.deepEqual(readSave('game',c,storage).state.traitState,s.traitState);
 s.date={year:2000,month:6,day:1};assert.equal(traitModifiers(s,c).salePrice.oil,1.2);assert(!activateTrait(s,c));
 s.date={year:2002,month:1,day:1};assert(activateTrait(s,c));
});
