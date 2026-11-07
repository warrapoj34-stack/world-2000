import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCatalog } from '../js/data/countries.js';
import { attachResources } from '../js/data/resources.js';
import { createGame, validGame } from '../js/state.js';
import { ensureEconomy, advanceQuarter, advanceMonth, simulateCountry } from '../js/economy.js';
import { RESOURCE_IDS, resourceProduction, resourceEffects, ensureResources, sellResource, reinforceArmy, topResources, mapResourceLevel } from '../js/resources.js';
import { readSave,writeSave } from '../js/save/storage.js';
const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
const [countries,relations,defs,rows,balance]=await Promise.all(['countries_2000','relations_2000','resources','country_resources_2000','balance'].map(read));
const catalog=attachResources(createCatalog(countries,relations),defs,rows);
const game=()=>{const state=createGame('AUS',catalog);ensureEconomy(state,balance);ensureResources(state);return state;};
test('13 ชนิดและระดับดาวครบทุกประเทศ รวมพรมแดนปี 2000',()=>{
  assert.equal(defs.length,13);assert.equal(rows.length,237);for(const id of ['KAZ','CAN','AUS','RUS','NAM','ZAF','USA'])assert(catalog.resourceLevels.get(id).uranium>=4);
  for(const [id,key] of [['SAU','oil'],['RUS','gas'],['RUS','forest'],['BRA','food'],['BRA','forest'],['AUS','iron'],['CAN','freshwater'],['PER','fish'],['NOR','fish']])assert.equal(catalog.resourceLevels.get(id)[key],5);
  assert(catalog.resourceLevels.has('YUG'));assert(!catalog.resourceLevels.has('SSD'));
  const bad=structuredClone(rows);bad[0].levels.oil=6;
  assert.throws(()=>attachResources(createCatalog(countries,relations),defs,bad));
});
test('ผลผลิตรายเดือนตามดาวเป็นจำนวนเต็ม 5 ดาวได้ 10 หน่วย',()=>{
  const stats=game().countries.AUS,levels=catalog.resourceLevels.get('AUS');
  const output=resourceProduction(stats,levels,balance);
  assert(output.iron>0);assert.equal(resourceProduction(stats,{...levels,iron:0},balance).iron,0);
  assert.equal(output.iron,10);assert.equal(resourceProduction({...stats,tech:0},levels,balance).iron,10);
  assert(Object.values(output).every(Number.isInteger));
});
test('น้ำจืดป้องกันภัยแล้ง อาหารเพิ่มความสุข พลังงานช่วยการเติบโตและไม่ขายอัตโนมัติ',()=>{
  const stats=game().countries.AUS,levels=catalog.resourceLevels.get('AUS');
  const wet=resourceEffects(stats,{...levels,freshwater:5},defs,balance,()=>0);
  const dry=resourceEffects(stats,{...levels,freshwater:0},defs,balance,()=>0);
  assert(wet.drought);assert.equal(wet.protection,1);assert.equal(wet.droughtGrowthLoss,0);
  assert.equal(wet.production.food,dry.production.food);assert(wet.happiness>dry.happiness);
  const normal=resourceEffects(stats,levels,defs,balance,()=>1);
  assert.equal(normal.revenue,0);assert(normal.revenue<=stats.gdp*balance.resources.maxExportGDPShare);
  const plain=simulateCountry(stats,'democracy',balance.defaultPolicy,balance,()=>.5);
  const enriched=simulateCountry(stats,'democracy',balance.defaultPolicy,balance,()=>.5,normal);
  assert.equal(enriched.stats.treasury,plain.stats.treasury);assert(enriched.stats.gdp>plain.stats.gdp);assert(enriched.stats.happiness>plain.stats.happiness);
});
test('คลังเพิ่มหลังจบเทิร์นเท่านั้น และใช้เหล็กเสริมกำลังต้องจ่ายจริง',()=>{
  const s=game();assert.equal(s.countries.AUS.resourceStock.iron,0);assert.equal(reinforceArmy(s,balance),false);
  const before=JSON.stringify(s);resourceProduction(s.countries.AUS,catalog.resourceLevels.get('AUS'),balance);assert.equal(JSON.stringify(s),before);
  advanceQuarter(s,catalog,balance,()=>.5);assert(s.countries.USA.resourceStock.oil>0);
  const stats=s.countries.AUS,iron=stats.resourceStock.iron,cash=stats.treasury,military=stats.military;
  assert(reinforceArmy(s,balance));assert.equal(stats.resourceStock.iron,iron-10);assert.equal(stats.treasury,cash-.02);assert.equal(stats.military,military+2);
  s.economy.gameOver='collapse';assert.equal(reinforceArmy(s,balance),false);
});
test('เซฟเก่าเพิ่มคลังเปล่า เซฟใหม่เก็บคลังและโหมดสี ไม่ยอมรับคลังติดลบ',()=>{
  const s=createGame('THA',catalog);let raw;const storage={getItem:()=>raw??null,setItem:(_,v)=>raw=v};
  assert(writeSave('game',s,catalog,storage).ok);const loaded=readSave('game',catalog,storage).state;
  ensureResources(loaded);ensureEconomy(loaded,balance);loaded.mapMode='oil';advanceQuarter(loaded,catalog,balance,()=>.5);
  assert(writeSave('game',loaded,catalog,storage).ok);assert.deepEqual(readSave('game',catalog,storage).state,loaded);
  loaded.countries.THA.resourceStock.iron=-1;assert(!validGame(loaded,catalog));
});
test('โหมดแร่ธาตุใช้ดาวสูงสุด และจัดสามอันดับโดยไม่แก้ข้อมูลต้นฉบับ',()=>{
  const levels=catalog.resourceLevels.get('AUS'),snapshot=JSON.stringify(levels);
  assert.equal(mapResourceLevel(levels,'minerals'),5);assert.equal(mapResourceLevel(levels,'iron'),5);
  const top=topResources(levels,defs);assert.equal(top.length,3);assert(top.every(r=>levels[r.id]===5));assert.equal(JSON.stringify(levels),snapshot);
});
test('80 เทิร์นพร้อมทรัพยากรทุกประเทศไม่มีตัวเลขเสียหรือเซฟใช้ไม่ได้',()=>{
  const s=game();for(let i=0;i<80&&!s.economy.gameOver;i++)advanceQuarter(s,catalog,balance,()=>.5);
  assert(validGame(s,catalog));assert(RESOURCE_IDS.every(id=>s.countries.AUS.resourceStock[id]>=0));
});

test('ขุดรายเดือน ขาย 10 หน่วยรับเงินทันที และไม่ขายเกินคลัง',()=>{
 const s=game(),stats=s.countries.AUS,cash=stats.treasury;
 assert.equal(sellResource(s,'uranium',balance),null);
 advanceMonth(s,catalog,balance,()=>1);
 assert.equal(stats.resourceStock.uranium,0);
 const current=s.countries.AUS;assert.equal(current.resourceStock.uranium,10);
 const before=current.treasury,income=sellResource(s,'uranium',balance);
 assert.equal(income,10*balance.resources.salePricesMillions.uranium/1000);
 assert.equal(current.resourceStock.uranium,0);assert.equal(current.treasury,before+income);
 assert.equal(sellResource(s,'uranium',balance),null);assert.equal(current.treasury,before+income);
 assert(RESOURCE_IDS.every(id=>Number.isInteger(current.resourceStock[id])));
});
test('เซฟคลังเดิม 12 ชนิดที่มีเศษ โหลดได้และเติมยูเรเนียมโดยเก็บจำนวนเดิม',()=>{
 const s=game();let raw;const storage={getItem:()=>raw,setItem:(_,v)=>raw=v};
 for(const stats of Object.values(s.countries)){delete stats.resourceStock.uranium;stats.resourceStock.iron=12.9;}
 assert(writeSave('game',s,catalog,storage).ok);const loaded=readSave('game',catalog,storage).state;
 ensureResources(loaded);assert.equal(loaded.countries.AUS.resourceStock.iron,12);assert.equal(loaded.countries.AUS.resourceStock.uranium,0);
 assert(writeSave('game',loaded,catalog,storage).ok);assert.equal(readSave('game',catalog,storage).status,'valid');
});
