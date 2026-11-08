import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCatalog } from '../js/data/countries.js';
import { attachPlayable } from '../js/data/playable.js';
import { createGame, validGame } from '../js/state.js';
import { readSave, writeSave } from '../js/save/storage.js';
import { attachMilitary, ensureMilitary, militaryScore, militaryRank, validUnits } from '../js/war/military.js';
import { advanceMonth } from '../js/economy.js';
const read = async name => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url)));
const [countries, relations, ids, regions, military, rules, balance] = await Promise.all(['countries_2000','relations_2000','playable','playable_regions','military2000','military_rules','balance'].map(read));
function setup() { const c=attachPlayable(createCatalog(countries,relations),ids,regions); attachMilitary(c,military,rules); return c; }
test('40 ประเทศมีสามจำนวนเต็มและประเทศไม่มีทะเลมีเรือศูนย์ รวม AI นอกรายการ', () => {
  const c=setup(),s=createGame('USA',c);ensureMilitary(s,c);
  assert(ids.every(id=>validUnits(military[id])));
  assert.deepEqual(s.countries.USA.units,{tanks:7500,ships:110,aircraft:3500});
  for (const country of c.countries) {
    assert(validUnits(s.countries[country.id].units));
    if(rules.landlocked.includes(country.id))assert.equal(s.countries[country.id].units.ships,0);
  }
  assert(s.countries.QAT.units.aircraft>0);
  assert.equal(militaryRank(s,c,'tanks','RUS'),1);
  assert.equal(militaryScore(s,c,'USA'),100);
});
test('เซฟเก่าเติมยูนิตได้ เซฟใหม่เก็บค่าที่แก้เองและเศรษฐกิจไม่เปลี่ยนจำนวน', () => {
  const c=setup(),s=createGame('USA',c);let raw; const storage={getItem:()=>raw,setItem:(_,value)=>raw=value};
  assert(writeSave('game',s,c,storage).ok);
  const old=readSave('game',c,storage).state;ensureMilitary(old,c);
  old.countries.USA.units.tanks=1234;ensureMilitary(old,c);
  assert.equal(old.countries.USA.units.tanks,1234);
  const before=structuredClone(old.countries.USA.units);advanceMonth(old,c,balance,()=>.5);
  assert.deepEqual(old.countries.USA.units,before);assert(validGame(old,c));
  assert(writeSave('game',old,c,storage).ok);assert.deepEqual(readSave('game',c,storage).state.countries.USA.units,before);
  old.countries.USA.units.ships=-1;assert(!validGame(old,c));
});
